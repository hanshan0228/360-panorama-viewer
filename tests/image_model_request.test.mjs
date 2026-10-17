import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImageModelRequest, inspectImageResolution } from '../src/utils/imageModelRequest.mjs';

const endpoint = { baseUrl: 'https://proxy.example', apiKey: 'synthetic-key', model: 'gemini-3.1-flash-image' };
const reference = 'data:image/png;base64,AA==';

function rasterHeader(format, width, height) {
  const bytes = Buffer.alloc(36);
  if (format === 'png') {
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    bytes.writeUInt32BE(13, 8);
    bytes.write('IHDR', 12);
    bytes.writeUInt32BE(width, 16);
    bytes.writeUInt32BE(height, 20);
  } else if (format === 'jpeg') {
    bytes.set([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc2, 0, 8, 8]);
    bytes.writeUInt16BE(height, 13);
    bytes.writeUInt16BE(width, 15);
    bytes[17] = 1;
  } else {
    bytes.write('RIFF', 0);
    bytes.writeUInt32LE(28, 4);
    bytes.write('WEBP', 8);
    bytes.write(format, 12);
    if (format === 'VP8X') {
      bytes.writeUInt32LE(10, 16);
      bytes.writeUIntLE(width - 1, 24, 3);
      bytes.writeUIntLE(height - 1, 27, 3);
    } else if (format === 'VP8L') {
      bytes.writeUInt32LE(5, 16);
      bytes[20] = 0x2f;
      bytes.writeUInt32LE(((height - 1) << 14) | (width - 1), 21);
    } else {
      bytes.writeUInt32LE(16, 16);
      bytes.set([0x9d, 0x01, 0x2a], 23);
      bytes.writeUInt16LE(width, 26);
      bytes.writeUInt16LE(height, 28);
    }
  }
  return `data:image/${format.startsWith('VP8') ? 'webp' : format};base64,${bytes.toString('base64')}`;
}

for (const format of ['png', 'jpeg', 'VP8X', 'VP8L', 'VP8 ']) {
  test(`${format}: model pixel dimensions, not the requested label, determine whether 4K was delivered`, () => {
    const result = inspectImageResolution(rasterHeader(format, 1774, 887), '4K');
    assert.equal(result.width, 1774);
    assert.equal(result.height, 887);
    assert.equal(result.status, 'below-request');
    assert.equal(result.targetWidth, 3840);
    assert.equal(inspectImageResolution(rasterHeader(format, 3840, 1920), '4K').status, 'met');
  });
}

test('resolution checks use the usable 2:1 crop, accept larger originals and preserve odd-pixel crop rules', () => {
  assert.equal(inspectImageResolution(rasterHeader('png', 4096, 2048), '4K').status, 'met');
  assert.equal(inspectImageResolution(rasterHeader('png', 4096, 1024), '4K').status, 'below-request');
  const gemini = inspectImageResolution(rasterHeader('png', 2752, 1536), '2K');
  assert.equal(gemini.status, 'met');
  assert.equal(gemini.panoramaWidth, 2752);
  assert.equal(gemini.panoramaHeight, 1376);
  assert.equal(inspectImageResolution(rasterHeader('png', 3839, 1920), '4K').panoramaWidth, 3838);
  assert.equal(inspectImageResolution(rasterHeader('png', 1024, 512), '1K').status, 'met');
});

test('remote URLs and malformed or unsupported image headers remain explicitly unverified without fetching', () => {
  for (const source of [null, '', 'https://example.test/result.png', reference, 'data:image/png;base64,%%%%',
    'data:image/svg+xml;base64,PHN2Zz4=', rasterHeader('png', 0, 1920)]) {
    const result = inspectImageResolution(source, '4K');
    assert.equal(result.status, 'unverified');
    assert.equal(result.width, null);
  }
  for (const resolution of ['8K', '__proto__', 'constructor', null]) {
    assert.throws(() => inspectImageResolution(reference, resolution), /resolution/);
  }
});

test('JPEG metadata scanning is bounded and malformed marker lengths do not escape inspection', () => {
  for (const length of [0, 1, 65535]) {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, length >>> 8, length & 255, 0, 0]);
    assert.equal(inspectImageResolution(`data:image/jpeg;base64,${bytes.toString('base64')}`, '4K').status, 'unverified');
  }
  const large = Buffer.alloc(240000);
  large.set([0xff, 0xd8]);
  for (let offset = 2; offset + 60004 < large.length; offset += 60004) {
    large.set([0xff, 0xe0, 0xea, 0x62], offset);
  }
  assert.equal(inspectImageResolution(`data:image/jpeg;base64,${large.toString('base64')}`, '4K').status, 'unverified');
});

for (const resolution of ['1K', '2K', '4K']) {
  test(`Gemini proxy requests explicit native ${resolution} and a supported landscape ratio`, () => {
    const request = buildImageModelRequest(endpoint, { prompt: 'Panorama', resolution, referenceImages: [reference] });
    assert.equal(request.url, 'https://proxy.example/v1/chat/completions');
    assert.equal(request.headers.Authorization, 'Bearer synthetic-key');
    assert.equal(request.mode, 'chat');
    assert.deepEqual(request.payload.modalities, ['image']);
    assert.deepEqual(request.payload.image_config, { aspect_ratio: '16:9', image_size: resolution });
    assert.equal(request.payload.messages[0].content[1].image_url.url, reference);
    assert.equal(Object.hasOwn(request.payload, 'size'), false);
  });

  test(`Google native Gemini requests generateContent, reference input and native ${resolution}`, () => {
    const request = buildImageModelRequest({ ...endpoint, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/' }, {
      prompt: 'Panorama', resolution, referenceImages: [reference],
    });
    const url = new URL(request.url);
    assert.equal(url.pathname, '/v1beta/models/gemini-3.1-flash-image:generateContent');
    assert.equal(url.search, '');
    assert.equal(request.headers['x-goog-api-key'], endpoint.apiKey);
    assert.equal(request.mode, 'google-gemini');
    assert.deepEqual(request.payload.generationConfig, { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9', imageSize: resolution } });
    assert.equal(request.payload.contents[0].parts[1].inlineData.data, 'AA==');
  });

  test(`GPT Image 2/2.5 ${resolution} uses valid 2:1 dimensions and preserves automatic quality`, () => {
    for (const model of ['gpt-image-2', 'gpt-image-2.5', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst']) {
      const request = buildImageModelRequest({ ...endpoint, model, provider: 'gemini' }, { prompt: 'Panorama', resolution });
      const [width, height] = request.payload.size.split('x').map(Number);
      assert.equal(request.mode, 'images');
      assert.equal(width / height, 2);
      assert.equal(width % 16, 0);
      assert.equal(height % 16, 0);
      assert.ok(width <= 3840 && width * height >= 655360 && width * height <= 8294400);
      assert.equal(request.payload.size, { '1K': '1152x576', '2K': '2048x1024', '4K': '3840x1920' }[resolution]);
      assert.equal(request.payload.quality, 'auto');
      assert.equal(request.payload.n, 1);
      assert.equal(request.payload.model, model);
      assert.equal(request.payload.output_format, 'png');
      assert.equal(Object.hasOwn(request.payload, 'response_format'), false);
      assert.equal(Object.hasOwn(request.payload, 'image_config'), false);
    }
  });
}

test('versioned bases and full route addresses are normalized without duplicated v1/routes', () => {
  for (const path of ['', '/', '/v1', '/v1/', '/v1/chat/completions', '/v1/images/generations']) {
    for (const model of ['gpt-image-2.5', 'gemini-3.1-flash-image']) {
      const request = buildImageModelRequest({ ...endpoint, baseUrl: `https://proxy.example${path}`, model }, { prompt: 'Test' });
      assert.equal(request.url, `https://proxy.example/v1/${model.startsWith('gpt') ? 'images/generations' : 'chat/completions'}`);
    }
  }
  const request = buildImageModelRequest({ ...endpoint, baseUrl: 'https://proxy.example/team/v1' }, { prompt: 'Test' });
  assert.equal(request.url, 'https://proxy.example/team/v1/chat/completions');
});

test('older Gemini and GPT models do not receive unsupported modern resolution settings', () => {
  const gemini = buildImageModelRequest({ ...endpoint, model: 'gemini-2.5-flash-image' }, { prompt: 'Test', resolution: '4K' });
  assert.deepEqual(gemini.payload.image_config, { aspect_ratio: '16:9' });
  for (const [model, size] of [['gpt-image-1.5', '1536x1024'], ['dall-e-3', '1792x1024'], ['dall-e-2', '1024x1024']]) {
    const request = buildImageModelRequest({ ...endpoint, model }, { prompt: 'Test', resolution: '4K' });
    assert.equal(request.payload.size, size);
  }
});

test('generic compatible endpoints keep their existing payload rather than receiving Gemini/GPT-only fields', () => {
  const request = buildImageModelRequest({ ...endpoint, model: 'custom-image' }, { prompt: 'Test' });
  assert.deepEqual(request.payload, { model: 'custom-image', prompt: 'Test', n: 1, size: '1792x1024', response_format: 'b64_json' });
});

test('invalid settings and unsupported references fail before any request is sent', () => {
  for (const resolution of ['8K', '', '__proto__', 2, null]) {
    assert.throws(() => buildImageModelRequest(endpoint, { prompt: 'Test', resolution }), /resolution/);
  }
  for (const referenceImages of [null, {}, 'image', [5]]) {
    assert.throws(() => buildImageModelRequest(endpoint, { prompt: 'Test', referenceImages }), /reference/);
  }
  assert.throws(() => buildImageModelRequest({ ...endpoint, model: 'gpt-image-2.5' }, { prompt: 'Test', referenceImages: [reference] }), /does not support reference images/);
  assert.throws(() => buildImageModelRequest({ ...endpoint, model: '', }, { prompt: 'Test' }), /Model is required/);
  for (const baseUrl of ['file:///tmp/model', 'https://user:password@proxy.example', 'https://proxy.example?key=secret', 'https://proxy.example/#fragment']) {
    assert.throws(() => buildImageModelRequest({ ...endpoint, baseUrl }, { prompt: 'Test' }), /HTTP\/HTTPS/);
  }
});

test('Google routing matches the real hostname, never a misleading substring', () => {
  const request = buildImageModelRequest({ ...endpoint, baseUrl: 'https://googleapis.com.attacker.example' }, { prompt: 'Test' });
  assert.equal(request.mode, 'chat');
  assert.equal(new URL(request.url).search, '');
  assert.throws(() => buildImageModelRequest({ ...endpoint, baseUrl: 'https://generativelanguage.googleapis.com', apiKey: '' }, { prompt: 'Test' }), /API Key/);
  assert.throws(() => buildImageModelRequest({ ...endpoint, baseUrl: 'https://generativelanguage.googleapis.com' }, { prompt: 'Test', referenceImages: ['https://image.example/ref.png'] }), /base64/);
});
