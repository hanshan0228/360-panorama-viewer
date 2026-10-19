import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FloatType } from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { exportCanvasToHdrBlob } from '../src/utils/hdrExporter.ts';
import { toneMapLinearRgbToRgba } from '../src/utils/hdrToneMap.ts';

test('ACES curve maps linear 1.0 near 232 and keeps HDR highlights brighter', () => {
  const output = toneMapLinearRgbToRgba(new Float32Array([1, 1, 1, 1, 10, 10, 10, 1, 0, 0, 0, 1]), 1);
  assert.equal(output.length, 12);
  assert.ok(Math.abs(output[0] - 232) <= 1, `expected ~232 for 1.0, got ${output[0]}`);
  assert.ok(output[4] > output[0] && output[4] <= 255, `10.0 should sit above 1.0 and inside range, got ${output[4]}`);
  assert.equal(output[8], 0);
  assert.equal(output[3], 255);
  assert.equal(output[7], 255);
  assert.equal(output[11], 255);
});

test('values stay monotonic and exposure scales the response', () => {
  const ramp = new Float32Array(40);
  for (let i = 0; i < 10; i++) {
    ramp[i * 4] = ramp[i * 4 + 1] = ramp[i * 4 + 2] = i * 0.25;
    ramp[i * 4 + 3] = 1;
  }
  const base = toneMapLinearRgbToRgba(ramp, 1);
  for (let i = 1; i < 10; i++) {
    assert.ok(base[i * 4] >= base[(i - 1) * 4], `ramp broke monotonicity at ${i}`);
  }
  const brighter = toneMapLinearRgbToRgba(ramp, 4);
  assert.ok(brighter[8] > base[8], 'higher exposure must brighten the mid grey');
  assert.equal(toneMapLinearRgbToRgba(ramp, 0)[8], 0);
});

test('a Radiance file exported from an 8-bit panorama survives the viewer pipeline', async () => {
  const width = 16;
  const pixels = new Uint8ClampedArray(width * 4);
  for (let x = 0; x < width; x++) {
    pixels[x * 4] = x * 16;
    pixels[x * 4 + 1] = x * 16;
    pixels[x * 4 + 2] = x * 16;
    pixels[x * 4 + 3] = 255;
  }
  const canvas = { width, height: 1, getContext: () => ({ getImageData: () => ({ data: pixels }) }) };
  const decoded = new HDRLoader().setDataType(FloatType).parse(await exportCanvasToHdrBlob(canvas).arrayBuffer());
  assert.equal(decoded.width, width);

  const output = toneMapLinearRgbToRgba(decoded.data, 1);
  assert.equal(output.length, width * 4);
  for (let x = 1; x < width; x++) {
    assert.ok(output[x * 4] >= output[(x - 1) * 4], `tone-mapped frame lost its gradient at pixel ${x}`);
  }
  assert.ok(output[0] <= 2);
  assert.ok(output[(width - 1) * 4] > 200);
});
