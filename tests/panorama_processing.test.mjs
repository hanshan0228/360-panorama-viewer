import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, globals = {}, modules = {}) {
  const filename = new URL('../src/utils/' + file, import.meta.url);
  const source = fs.readFileSync(filename, 'utf8').replaceAll('import.meta.url', JSON.stringify(filename.href));
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, Blob, URL, AbortSignal, AbortController, Error, Uint8ClampedArray,
    require: name => modules[name] ?? (name === './abortSignal' ? load('abortSignal.ts', globals) : undefined), ...globals });
  return exports;
}

function processorFixture({ reply = 'success', fallback = false, encoding = 'success', legacySignals = false } = {}) {
  const state = { terminated: 0, revoked: 0, reads: 0, posted: [] };
  const deadline = new AbortController();
  const canvas = { toBlob: callback => queueMicrotask(() => callback(encoding === 'empty' ? null : new Blob(['processed']))) };
  const globals = {
    AbortSignal: { any: legacySignals ? undefined : AbortSignal.any, timeout: () => deadline.signal },
    fetch: async () => new Response(new Blob(['source'])),
    document: { createElement: () => assert.fail('Worker path must not process canvas on the main thread') },
    OffscreenCanvas: fallback ? undefined : class {}, createImageBitmap() {},
    Worker: class {
      constructor(url, options) {
        assert.match(String(url), /panoramaProcessor\.worker\.ts$/);
        assert.equal(options.type, 'module');
      }
      postMessage(message) {
        state.posted.push(message);
        if (reply === 'throw') throw new Error('post failed');
        if (reply === 'hang') return;
        queueMicrotask(() => {
          if (reply === 'runtime') this.onerror();
          else if (reply === 'messageerror') this.onmessageerror();
          else this.onmessage({ data: reply === 'error' ? { error: 'decode failed' }
            : { blob: new Blob(reply === 'empty' ? [] : ['processed']) } });
        });
      }
      terminate() { state.terminated++; }
    },
    URL: class extends URL {
      static createObjectURL() { return 'blob:source'; }
      static revokeObjectURL(url) { assert.equal(url, 'blob:source'); state.revoked++; }
    },
    Image: class {
      set src(value) { queueMicrotask(() => reply === 'error' ? this.onerror?.() : this.onload?.()); }
    },
    FileReader: class {
      result = 'data:image/png;base64,cHJvY2Vzc2Vk';
      readAsDataURL(blob) {
        state.reads++;
        assert.equal(blob.size, 9);
        queueMicrotask(() => {
          if (encoding === 'read-error') this.onerror();
          else if (encoding !== 'hang') this.onload();
        });
      }
      abort() { this.onabort?.(); }
    },
  };
  const modules = {
    './imageEnhancer': { enhanceAndUpscalePanorama: (image, options) => { state.options = options; return canvas; } },
    './seamHealer': { healPanoramaSeam: source => { state.healed = true; return source; } },
  };
  const { processPanoramaImage } = load('panoramaProcessor.ts', globals, modules);
  return { state, deadline, process: (signal, heal = true) => processPanoramaImage('data:image/png;base64,AA==', { resolution: '2K' }, heal, signal) };
}

for (const source of [
  { width: 2752, height: 1536, output: [2752, 1376], crop: [0, 80, 2752, 1376] },
  { width: 2048, height: 1024, output: [2048, 1024], crop: [0, 0, 2048, 1024] },
  { width: 1024, height: 1024, output: [1024, 512], crop: [0, 256, 1024, 512] },
  { width: 4096, height: 1024, output: [2048, 1024], crop: [1024, 0, 2048, 1024] },
  { width: 1536, height: 2752, output: [1536, 768], crop: [0, 992, 1536, 768] },
  { width: 2753, height: 1537, output: [2752, 1376], crop: [0, 80, 2752, 1376] },
  { width: 2, height: 1, output: [2, 1], crop: [0, 0, 2, 1] },
]) {
  test(`native ${source.width}x${source.height} center crop preserves pixel density and does not sharpen`, () => {
    let draw;
    const canvas = { getContext: () => ({ drawImage: (...args) => { draw = args; },
      getImageData: () => assert.fail('Default native preparation must not sharpen or alter contrast'),
    }) };
    const { enhanceAndUpscalePanorama } = load('imageEnhancer.ts');
    for (const resolution of ['1K', '2K', '4K']) {
      for (const image of [{ width: source.width, height: source.height }, { naturalWidth: source.width, naturalHeight: source.height }]) {
        const result = enhanceAndUpscalePanorama(image, { resolution, preserveNative: true, sharpness: 0, contrastBoost: 1 }, () => canvas);
        assert.equal(result, canvas);
        assert.deepEqual([canvas.width, canvas.height], source.output);
        assert.deepEqual(draw.slice(1), [...source.crop, 0, 0, ...source.output]);
        assert.equal(source.crop[2], canvas.width);
        assert.equal(source.crop[3], canvas.height);
      }
    }
  });
}

test('native preparation rejects invalid source dimensions before allocating a canvas', () => {
  const { enhanceAndUpscalePanorama } = load('imageEnhancer.ts');
  for (const image of [{ width: 0, height: 1 }, { width: 1, height: 1 }, { width: 2, height: 0 }, { width: Infinity, height: 2 }, { width: 4, height: NaN }]) {
    assert.throws(() => enhanceAndUpscalePanorama(image, { preserveNative: true }, () => assert.fail('Invalid source')), /Invalid image dimensions/);
  }
});

test('modern processing delegates pixels and encoding to a module Worker, then releases it', async () => {
  const fixture = processorFixture();
  assert.match(await fixture.process(), /^data:image\/png;base64,/);
  assert.equal(fixture.state.posted.length, 1);
  assert.equal(fixture.state.posted[0].options.resolution, '2K');
  assert.equal(fixture.state.posted[0].healSeam, true);
  assert.ok(fixture.state.posted[0].image instanceof Blob);
  assert.equal(fixture.state.terminated, 1);
  assert.equal(fixture.state.reads, 1);
});

test('processing without AbortSignal.any still supports success and cancellation', async () => {
  const working = processorFixture({ legacySignals: true });
  assert.match(await working.process(), /^data:image\/png;base64,/);
  const cancelled = processorFixture({ legacySignals: true, reply: 'hang' });
  const pending = cancelled.process();
  while (!cancelled.state.posted.length) await new Promise(resolve => setImmediate(resolve));
  const rejected = assert.rejects(pending, /deadline/);
  cancelled.deadline.abort(new Error('deadline'));
  await rejected;
  assert.equal(cancelled.state.terminated, 1);
});

for (const reply of ['error', 'empty', 'runtime', 'messageerror', 'throw']) {
  test(`worker ${reply} rejects and releases its resources`, async () => {
    const fixture = processorFixture({ reply });
    await assert.rejects(fixture.process());
    assert.equal(fixture.state.terminated, 1);
    assert.equal(fixture.state.reads, 0);
  });
}

for (const reason of ['session changed', 'deadline']) {
  test(`processing cancels a stalled Worker on ${reason}`, async () => {
    const fixture = processorFixture({ reply: 'hang' });
    const controller = new AbortController();
    const pending = fixture.process(controller.signal);
    while (!fixture.state.posted.length) await new Promise(resolve => setImmediate(resolve));
    const rejected = assert.rejects(pending, new RegExp(reason));
    (reason === 'deadline' ? fixture.deadline : controller).abort(new Error(reason));
    await rejected;
    assert.equal(fixture.state.terminated, 1);
  });
}

test('pre-cancelled processing never sends image data to a Worker', async () => {
  const fixture = processorFixture();
  await assert.rejects(fixture.process(AbortSignal.abort(new Error('already cancelled'))), /already cancelled/);
  assert.equal(fixture.state.posted.length, 0);
});

for (const heal of [true, false]) {
  test(`legacy processing keeps resize and seam=${heal}, with asynchronous PNG encoding and URL cleanup`, async () => {
    const fixture = processorFixture({ fallback: true });
    await fixture.process(undefined, heal);
    assert.equal(fixture.state.healed === true, heal);
    assert.equal(fixture.state.options.resolution, '2K');
    assert.equal(fixture.state.revoked, 1);
    assert.equal(fixture.state.posted.length, 0);
  });
}

for (const failure of ['decode', 'empty', 'read-error']) {
  test(`legacy ${failure} failure settles and releases the image URL`, async () => {
    const fixture = processorFixture({ fallback: true, reply: failure === 'decode' ? 'error' : 'success', encoding: failure });
    await assert.rejects(fixture.process());
    assert.equal(fixture.state.revoked, 1);
  });
}

test('deadline also cancels a stalled asynchronous data URL export', async () => {
  const fixture = processorFixture({ encoding: 'hang' });
  const pending = fixture.process();
  while (!fixture.state.reads) await new Promise(resolve => setImmediate(resolve));
  const rejected = assert.rejects(pending, /encoding deadline/);
  fixture.deadline.abort(new Error('encoding deadline'));
  await rejected;
  assert.equal(fixture.state.terminated, 1);
});

for (const failure of ['none', 'decode', 'encode']) {
  test(`Worker executes shared algorithms and closes the decoded bitmap (${failure})`, async () => {
    const messages = [];
    let closed = 0;
    let healed = 0;
    const scope = { postMessage: message => messages.push(message) };
    const image = { close() { closed++; } };
    const canvas = { convertToBlob: async () => {
      if (failure === 'encode') throw new Error('encoding failed');
      return new Blob(['png']);
    } };
    load('panoramaProcessor.worker.ts', {
      self: scope, createImageBitmap: async () => {
        if (failure === 'decode') throw new Error('decoding failed');
        return image;
      }, OffscreenCanvas: class {},
    }, {
      './imageEnhancer': { enhanceAndUpscalePanorama: (source, options, factory) => {
        assert.equal(source, image);
        assert.equal(options.resolution, '4K');
        assert.ok(factory());
        return canvas;
      } },
      './seamHealer': { healPanoramaSeam: (source, width, factory) => {
        healed++;
        assert.equal(source, canvas);
        assert.equal(width, 160);
        assert.ok(factory());
        return canvas;
      } },
    });
    await scope.onmessage({ data: { image: new Blob(['input']), options: { resolution: '4K' }, healSeam: true } });
    assert.equal(closed, failure === 'decode' ? 0 : 1);
    assert.equal(healed, failure === 'decode' ? 0 : 1);
    assert.equal(messages.length, 1);
    if (failure === 'none') assert.equal(messages[0].blob.size, 3);
    else assert.match(messages[0].error, /failed/);
  });
}

test('shared canvas factories preserve enhanced pixels, dimensions and exact seam matching', () => {
  const createCanvas = () => {
    const canvas = { width: 0, height: 0, pixels: null };
    const context = {
      drawImage(source) {
        canvas.pixels = source.pixels ? new Uint8ClampedArray(source.pixels)
          : Uint8ClampedArray.from({ length: canvas.width * canvas.height * 4 }, (_, index) => index % 4 === 3 ? 255 : (index * 13) % 256);
      },
      getImageData: () => ({ data: new Uint8ClampedArray(canvas.pixels) }),
      putImageData(image) { canvas.pixels = image.data; },
    };
    canvas.getContext = () => context;
    return canvas;
  };
  const globals = { document: { createElement: createCanvas } };
  const { enhanceAndUpscalePanorama } = load('imageEnhancer.ts', globals);
  const { healPanoramaSeam } = load('seamHealer.ts', globals);
  const options = { scaleFactor: 1, sharpness: 0.8, contrastBoost: 1.1 };
  const legacy = healPanoramaSeam(enhanceAndUpscalePanorama({ naturalWidth: 256, naturalHeight: 16 }, options));
  const worker = healPanoramaSeam(enhanceAndUpscalePanorama({ width: 256, height: 16 }, options, createCanvas), 160, createCanvas);
  assert.equal(worker.width, 256);
  assert.equal(worker.height, 16);
  assert.deepEqual(worker.pixels, legacy.pixels);
  for (let row = 0; row < worker.height; row++) {
    const start = row * worker.width * 4;
    const end = start + (worker.width - 1) * 4;
    assert.deepEqual(worker.pixels.slice(start, start + 3), worker.pixels.slice(end, end + 3));
  }
});

for (const mismatch of [false, true]) {
  test(`automatic seam treatment ${mismatch ? 'blends a hard discontinuity' : 'preserves already continuous pixels'}`, () => {
    const width = 256, height = 16;
    const pixels = Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) =>
      i % 4 === 3 ? 255 : mismatch && Math.floor(i / 4) % width >= width / 2 ? 220 : 30);
    const source = { width, height, pixels };
    const createCanvas = () => {
      const canvas = { width: 0, height: 0, pixels: null };
      canvas.getContext = () => ({
        drawImage(image) { canvas.pixels = new Uint8ClampedArray(image.pixels); },
        getImageData: () => ({ data: new Uint8ClampedArray(canvas.pixels) }),
        putImageData(image) { canvas.pixels = image.data; },
      });
      return canvas;
    };
    const { healPanoramaSeam, inspectPanoramaSeam } = load('seamHealer.ts');
    assert.equal(inspectPanoramaSeam(pixels, width, height).needsBlending, mismatch);
    const result = healPanoramaSeam(source, 160, createCanvas, true);
    if (!mismatch) assert.equal(result, source);
    else {
      assert.notEqual(result, source);
      assert.equal(inspectPanoramaSeam(result.pixels, width, height).difference, 0);
      assert.deepEqual(source.pixels, pixels, 'model original must remain untouched');
    }
  });
}

test('automatic seam detection rejects malformed pixel buffers', () => {
  const { inspectPanoramaSeam } = load('seamHealer.ts');
  assert.throws(() => inspectPanoramaSeam(new Uint8ClampedArray(4), 256, 16), /Invalid panorama/);
});

function shareEncoderFixture(sizes) {
  const state = { closed: 0, encoded: [], drawn: [] };
  const image = { width: 5504, height: 2752, close() { state.closed++; } };
  const canvas = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage(...args) { state.drawn.push(args.slice(1)); } }),
    toBlob(callback, type, quality) { state.encoded.push({ type, quality, width: canvas.width, height: canvas.height }); callback({ type, size: sizes.shift() }); } };
  const { preparePanoramaShare } = load('imageOptimizer.ts', { createImageBitmap: async () => image, document: { createElement: () => canvas } });
  return { state, image, canvas, prepare: (source = { type: 'image/png', size: 25 * 1024 * 1024 }, signal) => preparePanoramaShare(source, signal) };
}

test('share compression keeps small PNG originals without re-encoding', async () => {
  const f = shareEncoderFixture([]), source = { type: 'image/png', size: 1024 };
  const result = await f.prepare(source);
  assert.equal(result.blob, source); assert.equal(result.compressed, false);
  assert.equal(f.state.encoded.length, 0); assert.equal(f.state.closed, 1);
});

test('share compression keeps small JPEG originals without re-encoding', async () => {
  const f = shareEncoderFixture([]), source = { type: 'image/jpeg', size: 2 * 1024 * 1024 };
  const result = await f.prepare(source);
  assert.equal(result.blob, source); assert.equal(result.compressed, false);
  assert.equal(f.state.encoded.length, 0); assert.equal(f.state.closed, 1);
});

test('oversized PNG is JPEG-compressed at its original 4K-plus dimensions', async () => {
  const f = shareEncoderFixture([10 * 1024 * 1024, 4 * 1024 * 1024]);
  const result = await f.prepare();
  assert.equal(result.width, 5504); assert.equal(result.height, 2752);
  assert.equal(result.blob.type, 'image/jpeg'); assert.equal(result.compressed, true);
  assert.deepEqual(f.state.encoded.map(x => x.quality), [0.92, 0.84]);
  assert.ok(f.state.encoded.every(x => x.width === 5504)); assert.equal(f.state.closed, 1);
});

test('share encoding resizes only if all native quality attempts exceed the hard limit', async () => {
  const f = shareEncoderFixture([24,23,21,4].map(x => x * 1024 * 1024));
  const result = await f.prepare();
  assert.equal(result.width, 4128); assert.equal(result.height, 2064);
  assert.equal(f.state.encoded.length, 4); assert.equal(f.state.closed, 1);
  assert.ok(f.state.encoded.every(x => x.width === x.height * 2));
});

test('native-dimension sharing copy above target but below the hard limit is retained', async () => {
  const f = shareEncoderFixture([19,18,17].map(x => x * 1024 * 1024));
  assert.equal((await f.prepare()).width, 5504);
  assert.equal(f.state.encoded.length, 3);
});

test('share encoding failure and cancellation release the decoded original', async () => {
  const f = shareEncoderFixture([]); f.canvas.toBlob = callback => callback(null);
  await assert.rejects(f.prepare(), /encoding failed/); assert.equal(f.state.closed, 1);
  const cancelled = shareEncoderFixture([1024]); const abort = new AbortController(); abort.abort();
  await assert.rejects(cancelled.prepare(undefined, abort.signal));
  assert.equal(cancelled.state.encoded.length, 0);
});
