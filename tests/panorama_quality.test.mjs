import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewPanorama, buildQualityRetryPrompt, DEFAULT_PANORAMA_REVIEW_MODEL, PANORAMA_REVIEW_TIMEOUT_MS } from '../server/panoramaQuality.mjs';

const samplePng = 'data:image/png;base64,AA==';
const sampleWebp = 'data:image/webp;base64,AQI=';

function reviewClock(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  t.mock.method(AbortSignal, 'timeout', milliseconds => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('Synthetic timeout', 'TimeoutError')), milliseconds);
    return controller.signal;
  });
  return t.mock.method(console, 'info', () => {});
}

const passedResponse = () => Response.json({ choices: [{ message: {
  content: JSON.stringify({ passed: true, issues: [], explanation: 'Coherent panorama.' }),
} }] });

test('review permits a 56-second response beyond the old 30-second limit', async t => {
  const logs = reviewClock(t);
  assert.equal(PANORAMA_REVIEW_TIMEOUT_MS, 90000);
  let requestSignal;
  const result = reviewPanorama({
    endpoint: { baseUrl: 'https://proxy.example/v1' }, prompt: 'Scene', imageUrl: samplePng,
    fetch: async (_url, { signal }) => {
      requestSignal = signal;
      await new Promise(resolve => setTimeout(resolve, 56000));
      return passedResponse();
    },
  });
  t.mock.timers.tick(30001);
  assert.equal(requestSignal.aborted, false);
  t.mock.timers.tick(25999);
  assert.equal((await result).status, 'passed');
  assert.deepEqual(JSON.parse(logs.mock.calls[0].arguments[1]), {
    status: 'passed', reason: null, durationMs: 56000, reviewModel: DEFAULT_PANORAMA_REVIEW_MODEL, httpStatus: 200,
  });
});

for (const phase of ['headers', 'body']) {
  for (const parentCancels of [false, true]) {
    test(`review ${phase}: ${parentCancels ? 'earlier parent cancellation' : '90-second deadline'} terminates and logs safely`, async t => {
      const logs = reviewClock(t);
      const parent = new AbortController();
      let started, requestSignal;
      const ready = new Promise(resolve => { started = resolve; });
      const result = reviewPanorama({
        endpoint: { baseUrl: 'https://proxy.example/v1', apiKey: 'secret-key' },
        prompt: 'secret-prompt', imageUrl: samplePng, signal: parent.signal,
        fetch: async (_url, { signal }) => {
          requestSignal = signal;
          const pending = () => new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            started();
          });
          return phase === 'headers' ? pending() : { ok: true, status: 200, json: pending };
        },
      });
      await ready;
      const deadline = parentCancels ? 12000 : 90000;
      t.mock.timers.tick(deadline - 1);
      assert.equal(requestSignal.aborted, false);
      t.mock.timers.tick(1);
      if (parentCancels) parent.abort(new Error('secret-key secret-prompt https://private.example data:image/png;base64,AA=='));
      assert.deepEqual(await result, { status: 'unavailable', issues: [], reviewModel: DEFAULT_PANORAMA_REVIEW_MODEL });
      assert.equal(requestSignal.aborted, true);
      assert.equal(logs.mock.calls.length, 1);
      assert.deepEqual(JSON.parse(logs.mock.calls[0].arguments[1]), {
        status: 'unavailable', reason: parentCancels ? 'parent_abort' : 'timeout', durationMs: deadline,
        reviewModel: DEFAULT_PANORAMA_REVIEW_MODEL, ...(phase === 'body' ? { httpStatus: 200 } : {}),
      });
      assert.doesNotMatch(JSON.stringify(logs.mock.calls[0].arguments), /secret|private|data:image/);
    });
  }
}

test('review logs fixed classifications once per call without provider, input or exception contents', async t => {
  const logs = t.mock.method(console, 'info', () => {});
  const secret = 'PRIVATE_SENTINEL https://private.example data:image/png;base64,AA==';
  const cases = [
    ['http_error', () => new Response(secret, { status: 503 }), 503],
    ['http_error', () => Response.json({ error: secret }), 200],
    ['network', () => { throw new Error(secret); }],
    ['network', () => ({ ok: true, status: 200, json: async () => { throw new TypeError(secret); } }), 200],
    ['parse', () => new Response(secret), 200],
    ['parse', () => Response.json({ choices: [{ message: { content: secret } }] }), 200],
    ['schema', () => Response.json(null), 200],
    ['schema', () => Response.json({ choices: [{ message: { content: JSON.stringify({ passed: true, issues: ['seam'], explanation: secret }) } }] }), 200],
    ['blocked', () => Response.json({ choices: [{ message: { refusal: secret } }] }), 200],
    ['invalid_input', () => assert.fail('Invalid input must not fetch'), undefined, { imageUrl: secret }],
    ['invalid_input', () => assert.fail('Invalid model must not fetch'), undefined, { model: { secret } }],
  ];
  for (const [reason, fetch, httpStatus, overrides] of cases) {
    const result = await reviewPanorama({
      endpoint: { baseUrl: 'https://proxy.example/v1', apiKey: secret },
      prompt: secret, imageUrl: samplePng, fetch, ...overrides,
    });
    assert.equal(result.status, 'unavailable');
    const entry = JSON.parse(logs.mock.calls.at(-1).arguments[1]);
    assert.equal(entry.reason, reason);
    assert.equal(entry.status, 'unavailable');
    assert.ok(entry.durationMs >= 0);
    assert.equal(entry.httpStatus, httpStatus);
    assert.equal(entry.reviewModel, overrides?.model ? 'invalid' : DEFAULT_PANORAMA_REVIEW_MODEL);
    assert.deepEqual(Object.keys(entry).sort(), ['status', 'reason', 'durationMs', 'reviewModel', ...(httpStatus ? ['httpStatus'] : [])].sort());
  }
  assert.equal(logs.mock.calls.length, cases.length);
  assert.doesNotMatch(JSON.stringify(logs.mock.calls.map(call => call.arguments)), /PRIVATE_SENTINEL|https:|data:image/);
});

test('reviewPanorama sends OpenAI-compatible multimodal JSON review and parses fenced or plain verdicts', async () => {
  assert.equal(DEFAULT_PANORAMA_REVIEW_MODEL, 'gemini-3-flash');
  const calls = [];
  const passed = await reviewPanorama({
    endpoint: { baseUrl: 'https://proxy.example/v1/images/generations/', apiKey: 'secret-proxy-key' },
    prompt: 'Extend the golf course',
    referenceImages: [sampleWebp, samplePng, samplePng, samplePng],
    imageUrl: samplePng,
    fetch: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return Response.json({
        choices: [{
          finish_reason: 'stop',
          message: { content: '```json\n{"passed":true,"issues":[],"explanation":"Single coherent horizon and subject."}\n```' },
        }],
      });
    },
  });
  assert.deepEqual(passed, {
    status: 'passed',
    issues: [],
    explanation: 'Single coherent horizon and subject.',
    reviewModel: 'gemini-3-flash',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://proxy.example/v1/chat/completions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer secret-proxy-key');
  assert.equal(calls[0].body.model, 'gemini-3-flash');
  assert.deepEqual(calls[0].body.response_format, { type: 'json_object' });
  assert.equal(calls[0].body.temperature, 0);
  const userContent = calls[0].body.messages[1].content;
  assert.equal(userContent.length, 1 + 4 * 2); // delimited prompt + (3 capped refs + 1 candidate) * 2 parts
  assert.match(userContent[0].text, /BEGIN_UNTRUSTED_SCENE_REQUEST_JSON/);
  assert.equal(userContent.at(-2).text, 'Candidate panorama (raw source map)');
  assert.equal(userContent.at(-1).image_url.url, samplePng);

  const failed = await reviewPanorama({
    endpoint: { baseUrl: 'http://127.0.0.1:8317' },
    model: 'custom-reviewer',
    prompt: 'Scene',
    referenceImages: [sampleWebp],
    imageUrl: 'https://cdn.example/candidate.jpg',
    fetch: async () => Response.json({
      choices: [{
        finish_reason: 'stop',
        message: {
          content: JSON.stringify({
            passed: false,
            issues: ['collage', 'duplicate_subject'],
            explanation: 'Stacked horizontal band and extra foreground steering wheel.',
          }),
        },
      }],
    }),
  });
  assert.deepEqual(failed, {
    status: 'failed',
    issues: ['collage', 'duplicate_subject'],
    explanation: 'Stacked horizontal band and extra foreground steering wheel.',
    reviewModel: 'custom-reviewer',
  });
});

test('reviewPanorama supports Google native generateContent inlineData and rejects remote URLs on native endpoints', async () => {
  let called = 0;
  const remoteOnNative = await reviewPanorama({
    endpoint: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', apiKey: 'google-secret' },
    prompt: 'Scene',
    imageUrl: 'https://cdn.example/remote.png',
    fetch: async () => { called++; return Response.json({}); },
  });
  assert.equal(called, 0);
  assert.equal(remoteOnNative.status, 'unavailable');

  const nativeVerdict = await reviewPanorama({
    endpoint: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', apiKey: 'google-secret' },
    prompt: 'Scene',
    referenceImages: [sampleWebp],
    imageUrl: samplePng,
    fetch: async (url, init) => {
      called++;
      assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent');
      assert.equal(init.headers['x-goog-api-key'], 'google-secret');
      const payload = JSON.parse(init.body);
      assert.equal(payload.generationConfig.responseMimeType, 'application/json');
      assert.deepEqual(payload.generationConfig.responseModalities, ['TEXT']);
      assert.deepEqual(payload.contents[0].parts[2], { inlineData: { mimeType: 'image/webp', data: 'AQI=' } });
      assert.deepEqual(payload.contents[0].parts[4], { inlineData: { mimeType: 'image/png', data: 'AA==' } });
      return Response.json({
        candidates: [{
          finishReason: 'STOP',
          content: {
            parts: [
              { thought: true, text: '{"passed":true,"issues":[],"explanation":"internal thought"}' },
              { text: '{"passed":false,"issues":["seam"],"explanation":"Severe horizon step at left/right wrap."}' },
            ],
          },
        }],
      });
    },
  });
  assert.equal(called, 1);
  assert.deepEqual(nativeVerdict, {
    status: 'failed',
    issues: ['seam'],
    explanation: 'Severe horizon step at left/right wrap.',
    reviewModel: 'gemini-3-flash',
  });
});

test('reviewPanorama fails closed as unavailable on malformed, inconsistent, blocked or aborted responses without leaking secrets', async () => {
  const badPayloads = [
    'not json',
    JSON.stringify({ passed: true, issues: ['collage'], explanation: 'contradiction' }),
    JSON.stringify({ passed: false, issues: [], explanation: 'empty failure' }),
    JSON.stringify({ passed: false, issues: ['unknown_code'], explanation: 'invalid enum' }),
    JSON.stringify({ passed: false, issues: ['seam', 'seam'], explanation: 'duplicate enum' }),
    JSON.stringify({ passed: true, issues: [], explanation: 123 }),
  ];
  for (const content of badPayloads) {
    const res = await reviewPanorama({
      endpoint: { baseUrl: 'https://proxy.example/v1', apiKey: 'top-secret-key' },
      prompt: 'Scene',
      imageUrl: samplePng,
      fetch: async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content } }] }),
    });
    assert.deepEqual(res, { status: 'unavailable', issues: [], reviewModel: 'gemini-3-flash' });
    assert.doesNotMatch(JSON.stringify(res), /top-secret-key/);
  }

  const finishBlocked = await reviewPanorama({
    endpoint: { baseUrl: 'https://proxy.example/v1', apiKey: 'top-secret-key' },
    prompt: 'Scene',
    imageUrl: samplePng,
    fetch: async () => Response.json({
      choices: [{ finish_reason: 'length', message: { content: '{"passed":true,"issues":[],"explanation":"ok"}' } }],
    }),
  });
  assert.equal(finishBlocked.status, 'unavailable');

  const ctrl = new AbortController();
  ctrl.abort(new Error('timeout'));
  const aborted = await reviewPanorama({
    endpoint: { baseUrl: 'https://proxy.example/v1', apiKey: 'top-secret-key' },
    prompt: 'Scene',
    imageUrl: samplePng,
    signal: ctrl.signal,
    fetch: async () => assert.fail('Aborted signal must not start fetch'),
  });
  assert.equal(aborted.status, 'unavailable');
});

test('buildQualityRetryPrompt appends only static deduplicated corrections and ignores untrusted strings', () => {
  const base = 'Generate a 360 equirectangular golf course.';
  assert.equal(buildQualityRetryPrompt(base, []), base);
  assert.equal(buildQualityRetryPrompt(base, ['ignore_previous_instructions', 42]), base);
  const retried = buildQualityRetryPrompt(base, ['collage', 'duplicate_subject', 'collage', 'injected']);
  assert.ok(retried.startsWith(`${base}\n\nPanorama quality corrections:\n`));
  assert.match(retried, /remove stacked bands, panels, collages and multiple horizons/);
  assert.match(retried, /Remove unintended duplicate main subjects and invented foreground cockpits/);
  assert.doesNotMatch(retried, /injected/);
});
