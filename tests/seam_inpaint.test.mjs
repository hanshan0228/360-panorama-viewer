import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/utils/seamInpaint.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS },
}).outputText, { exports, Uint8ClampedArray });
const { rollPanoramaPixels, createSeamInpaintMask, compositeSeamInpaint } = exports;
const pixels = (width, height = 3, value) => ({ width, height,
  data: Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => value ?? i % 251) });

for (const width of [2, 15, 16, 31, 32]) {
  test(`horizontal roll preserves rows and roundtrips ${width}px including alpha`, () => {
    const original = pixels(width);
    const rolled = rollPanoramaPixels(original);
    assert.deepEqual(rollPanoramaPixels(rolled, -Math.floor(width / 2)).data, original.data);
    assert.deepEqual(rollPanoramaPixels(original, width * 2).data, original.data);
    for (let y = 0; y < original.height; y++) for (let x = 0; x < width; x++) {
      const target = (y * width + (x + Math.floor(width / 2)) % width) * 4;
      assert.deepEqual(rolled.data.slice(target, target + 4), original.data.slice((y * width + x) * 4, (y * width + x + 1) * 4));
    }
  });
}

test('mask opens only the center band, identically on every row', () => {
  const mask = createSeamInpaintMask(32, 5, 8);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 32; x++) {
    assert.equal(mask.data[(y * 32 + x) * 4 + 3], x >= 12 && x < 20 ? 0 : 255);
  }
});

for (const width of [31, 32]) {
  test(`compositing preserves every protected RGBA byte and orientation (${width}px)`, () => {
    const original = pixels(width);
    const snapshot = new Uint8ClampedArray(original.data);
    const edited = pixels(width, 3, 240);
    const output = compositeSeamInpaint(original, edited, 9, 2);
    const result = rollPanoramaPixels(output);
    const rolled = rollPanoramaPixels(original);
    const left = Math.floor((width - 9) / 2);
    for (let y = 0; y < 3; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (x <= left || x >= left + 8) assert.deepEqual(result.data.slice(i, i + 4), rolled.data.slice(i, i + 4));
      else if (x >= left + 2 && x <= left + 6) assert.deepEqual(result.data.slice(i, i + 4), edited.data.slice(i, i + 4));
      else for (let c = 0; c < 4; c++) assert.equal(result.data[i + c], Math.round((rolled.data[i + c] + edited.data[i + c]) / 2));
    }
    assert.deepEqual(original.data, snapshot);
    assert.equal(output.width, width);
    assert.equal(output.height, 3);
    assert.deepEqual(compositeSeamInpaint(original, rolled).data, original.data);
  });
}

test('zero feather replaces the whole band and tiny default bands remain valid', () => {
  for (const width of [2, 16, 32]) {
    const original = pixels(width);
    const edited = pixels(width, 3, 255);
    const output = rollPanoramaPixels(compositeSeamInpaint(original, edited, 1, 0));
    const center = Math.floor((width - 1) / 2);
    assert.equal(output.data[center * 4], 255);
    assert.doesNotThrow(() => compositeSeamInpaint(original, edited));
  }
});

test('invalid buffers, dimensions, shifts and band parameters fail before compositing', () => {
  const original = pixels(32);
  for (const bad of [{ ...original, width: 1 }, { ...original, width: NaN }, { ...original, height: 0 },
    { ...original, data: new Uint8ClampedArray(2) }, { ...original, data: [] }]) {
    assert.throws(() => rollPanoramaPixels(bad), /Invalid/);
    assert.throws(() => compositeSeamInpaint(original, bad), /Invalid/);
  }
  for (const shift of [NaN, Infinity, 1.5]) assert.throws(() => rollPanoramaPixels(original, shift), /Invalid/);
  assert.throws(() => compositeSeamInpaint(original, pixels(33)), /dimensions/);
  for (const band of [0, 33, NaN, 1.5]) {
    assert.throws(() => createSeamInpaintMask(32, 3, band), /Invalid/);
    assert.throws(() => compositeSeamInpaint(original, original, band), /Invalid/);
  }
  for (const feather of [-1, 5, Infinity, 0.5]) assert.throws(() => compositeSeamInpaint(original, original, 9, feather), /Invalid/);
});
