import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// The cubemap slicer and the equirectangular stitcher are exact inverses of each other,
// so a slice -> stitch round trip must land back on the source image. These tests run the
// pixel maths against a minimal canvas stub instead of a browser.

function makeCanvas() {
  const canvas = { _width: 0, _height: 0, pixels: new Uint8ClampedArray(0), _ctx: null };
  const resize = () => {
    canvas.pixels = new Uint8ClampedArray(Math.max(0, canvas._width * canvas._height * 4));
  };
  Object.defineProperty(canvas, 'width', {
    get: () => canvas._width,
    set: value => { canvas._width = value; resize(); },
  });
  Object.defineProperty(canvas, 'height', {
    get: () => canvas._height,
    set: value => { canvas._height = value; resize(); },
  });
  canvas.getContext = () => ({
    createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    getImageData: (x, y, width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let row = 0; row < height; row++) {
        const from = ((y + row) * canvas.width + x) * 4;
        data.set(canvas.pixels.subarray(from, from + width * 4), row * width * 4);
      }
      return { width, height, data };
    },
    putImageData: (image, x, y) => {
      for (let row = 0; row < image.height; row++) {
        const to = ((y + row) * canvas.width + x) * 4;
        canvas.pixels.set(image.data.subarray(row * image.width * 4, (row + 1) * image.width * 4), to);
      }
    },
  });
  canvas.toDataURL = () => 'data:image/png;base64,';
  return canvas;
}

function loadCubemapSlicer(globals = {}) {
  const filename = new URL('../src/utils/cubemapSlicer.ts', import.meta.url);
  const source = fs.readFileSync(filename, 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    document: { createElement: () => makeCanvas() },
    Uint8ClampedArray,
    Math,
    Map,
    setTimeout,
    ...globals,
  });
  return exports;
}

const EQ_WIDTH = 128;
const EQ_HEIGHT = 64;
const FACE_SIZE = 64;

test('cooperative conversion preserves pixels and yields before completing', async () => {
  let yields = 0;
  const slicer = loadCubemapSlicer({ setTimeout(callback) { yields++; queueMicrotask(callback); } });
  const source = makeCanvas(); source.width = 128; source.height = 64;
  for (let i = 0; i < source.pixels.length; i++) source.pixels[i] = i * 31 % 256;
  const syncFaces = slicer.sliceEquirectangularToCubemap(source, 64);
  const asyncFaces = await slicer.sliceEquirectangularToCubemapAsync(source, 64);
  assert.ok(yields >= 6);
  assert.equal(asyncFaces.length, 6);
  asyncFaces.forEach((face, i) => assert.deepEqual(face.canvas.pixels, syncFaces[i].canvas.pixels));
  const sync = slicer.stitchCubemapToEquirectangular(syncFaces, 256);
  const asyncCanvas = await slicer.stitchCubemapToEquirectangularAsync(asyncFaces, 256);
  assert.deepEqual(asyncCanvas.pixels, sync.pixels);
  assert.ok(yields >= 8);
});

test('a replaced conversion stops at its next row batch', async () => {
  const controller = new AbortController();
  let yields = 0;
  const slicer = loadCubemapSlicer({ setTimeout(callback) { yields++; controller.abort(new Error('source replaced')); queueMicrotask(callback); } });
  const source = makeCanvas(); source.width = 128; source.height = 64;
  await assert.rejects(slicer.sliceEquirectangularToCubemapAsync(source, 256, controller.signal), /source replaced/);
  assert.equal(yields, 1);
  await assert.rejects(slicer.stitchCubemapToEquirectangularAsync([], 1024, controller.signal), /source replaced/);
  assert.equal(yields, 1);
});

// Smooth longitude/latitude gradient: every direction has a unique colour, so a wrong
// cube face or a flipped axis shows up as a large per-pixel error.
function fillGradient(canvas) {
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const index = (y * canvas.width + x) * 4;
      canvas.pixels[index] = Math.round((x / (canvas.width - 1)) * 255);
      canvas.pixels[index + 1] = Math.round((y / (canvas.height - 1)) * 255);
      canvas.pixels[index + 2] = Math.round(((x + y) / (canvas.width + canvas.height)) * 255);
      canvas.pixels[index + 3] = 255;
    }
  }
}

function facePixels(faces) {
  return faces.map(face => {
    const image = face.canvas.getContext('2d').getImageData(0, 0, face.canvas.width, face.canvas.height);
    return { name: face.name, width: face.canvas.width, height: face.canvas.height, data: image.data };
  });
}

test('stitching the six sliced faces reproduces the source equirectangular image', () => {
  const { sliceEquirectangularToCubemap, stitchCubemapPixelsToEquirectangular } = loadCubemapSlicer();
  assert.equal(typeof sliceEquirectangularToCubemap, 'function');
  assert.equal(typeof stitchCubemapPixelsToEquirectangular, 'function');

  const source = makeCanvas();
  source.width = EQ_WIDTH;
  source.height = EQ_HEIGHT;
  fillGradient(source);

  const faces = sliceEquirectangularToCubemap(source, FACE_SIZE);
  // Faces cross a VM realm boundary, so compare values rather than array identity.
  assert.equal(faces.map(face => face.name).join(','), 'posx,negx,posy,negy,posz,negz');

  const out = stitchCubemapPixelsToEquirectangular(facePixels(faces), EQ_WIDTH, EQ_HEIGHT);
  assert.equal(out.length, EQ_WIDTH * EQ_HEIGHT * 4);

  let totalError = 0;
  let alphaFailures = 0;
  for (let pixel = 0; pixel < EQ_WIDTH * EQ_HEIGHT; pixel++) {
    for (let channel = 0; channel < 3; channel++) {
      totalError += Math.abs(out[pixel * 4 + channel] - source.pixels[pixel * 4 + channel]);
    }
    if (out[pixel * 4 + 3] !== 255) alphaFailures++;
  }

  const meanAbsoluteError = totalError / (EQ_WIDTH * EQ_HEIGHT * 3);
  assert.ok(meanAbsoluteError < 12, `round-trip mean absolute error ${meanAbsoluteError.toFixed(2)} is too high`);
  assert.equal(alphaFailures, 0, 'every stitched pixel should be opaque');
});

test('directions without a matching face stay transparent', () => {
  const { stitchCubemapPixelsToEquirectangular } = loadCubemapSlicer();
  const size = 8;
  const front = { name: 'posz', width: size, height: size, data: new Uint8ClampedArray(size * size * 4).fill(255) };

  const width = 32;
  const height = 16;
  const out = stitchCubemapPixelsToEquirectangular([front], width, height);

  const centre = (8 * width + Math.floor(width / 2)) * 4;
  assert.equal(out[centre + 3], 255, 'the camera-facing direction comes from posz');
  const behind = (8 * width + 0) * 4;
  assert.equal(out[behind + 3], 0, 'the opposite direction has no face and must stay transparent');
});
