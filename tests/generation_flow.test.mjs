import { emailTestEnv, challengeToken, emailServicesFixture } from './email_services_fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { onRequest, __resetEdgeRateLimits } from '../functions/api/[[route]].ts';
import { createCommercialServer, hashPassword, readStore, writeStore } from '../server/commercial-server.mjs';
import * as commercialApi from '../src/utils/commercialApi.ts';
import * as adminStorage from '../src/utils/adminStorage.ts';
import { inspectImageResolution } from '../src/utils/imageModelRequest.mjs';
import { combineAbortSignals } from '../src/utils/abortSignal.ts';
import { GENERATION_WORKFLOW_TIMEOUT_MS, GENERATION_LEASE_MS } from '../server/risk.mjs';

const adminPassword = 'isolated-generation-password';
const imageResponse = () => Response.json({ data: [{ b64_json: 'AA==' }] });

function generationClock(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  t.mock.method(AbortSignal, 'timeout', milliseconds => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('Synthetic timeout', 'TimeoutError')), milliseconds);
    return controller.signal;
  });
  return t.mock.method(console, 'info', () => {});
}

function pngMetadata(width, height) {
  const bytes = Buffer.alloc(36);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes.toString('base64');
}

test('default endpoint labels and providers match their actual GPT/Gemini model identifiers', () => {
  const gpt = adminStorage.DEFAULT_MODEL_ENDPOINTS.find(endpoint => endpoint.id === 'gemini-imagen3');
  const gemini = adminStorage.DEFAULT_MODEL_ENDPOINTS.find(endpoint => endpoint.id === 'gemini-flash-img');
  assert.equal(gpt.provider, 'openai');
  assert.equal(gpt.model, 'gpt-image-2.5');
  assert.ok(gpt.name.includes('GPT'));
  assert.equal(gemini.provider, 'gemini');
  assert.equal(gemini.model, 'gemini-3.1-flash-image');
  assert.ok(gemini.name.includes('3.1'));
  assert.equal(gemini.maxResolution, '4K');
});

function sqliteD1(database) {
  // The worker module keeps per-isolate rate-limit counters; each fixture starts from a clean slate.
  __resetEdgeRateLimits();
  return {
    prepare(sql) {
      let parameters = [];
      const statement = {
        bind(...values) { parameters = values; return statement; },
        async run() {
          const result = database.prepare(sql).run(...parameters);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
        async first() { return database.prepare(sql).get(...parameters) ?? null; },
        async all() { return { results: database.prepare(sql).all(...parameters) }; },
      };
      return statement;
    },
    async batch(statements) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  };
}

async function withBackend(testContext, backend, fetchUpstream = imageResponse, reviewUpstream) {
  const emailServices = emailServicesFixture(fetchUpstream, reviewUpstream);
  let call;
  let setUser;
  let leases;
  if (backend === 'D1') {
    const database = new DatabaseSync(':memory:');
    const db = sqliteD1(database);
    leases = () => database.prepare('SELECT * FROM generation_leases').all();
    const kv = new Map();
    const PANORAMA_SHARES = {
      async put(key, value) { kv.set(key, value); },
      async get(key) { return kv.get(key) || null; },
      async delete(key) { kv.delete(key); },
    };
    testContext.after(() => database.close());
    testContext.mock.method(globalThis, 'fetch', emailServices.fetch);
    call = async (route, body, token) => {
      if (route === 'user/auth' && body) body = { birthDate: '1990-01-01', turnstileToken: challengeToken(), ...body };
      const request = new Request(`https://review.example/api/${route}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const response = await onRequest({ request, env: { ...emailTestEnv, DB: db, PANORAMA_SHARES, ADMIN_PASSWORD: adminPassword } });
      return { status: response.status, data: await response.json() };
    };
    setUser = (userId, credits, status = 'active') => {
      database.prepare('UPDATE users SET credits_balance = ?, status = ? WHERE id = ?')
        .run(credits, status, userId);
    };
  } else {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-generation-'));
    const file = path.join(directory, 'store.json');
    leases = () => readStore(file).riskLeases || [];
    writeStore({ schemaVersion: 2, adminPasswordHash: hashPassword(adminPassword),
      users: [], subscriptions: [], invoices: [] }, file);
    const server = createCommercialServer({ storeFile: file, env: { ...emailTestEnv }, fetch: emailServices.fetch });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    testContext.after(async () => {
      await new Promise(resolve => server.close(resolve));
      fs.rmSync(directory, { recursive: true, force: true });
    });
    const base = `http://127.0.0.1:${server.address().port}/api/`;
    call = async (route, body, token) => {
      if (route === 'user/auth' && body) body = { birthDate: '1990-01-01', turnstileToken: challengeToken(), ...body };
      const response = await fetch(base + route, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, data: await response.json() };
    };
    setUser = (userId, credits, status = 'active') => {
      const store = readStore(file);
      Object.assign(store.users.find(user => user.id === userId), { creditsBalance: credits, status });
      writeStore(store, file);
    };
  }
  const admin = await call('admin/login', { username: 'admin', password: adminPassword });
  assert.equal(admin.status, 200);
  const adminToken = admin.data.token;
  assert.equal((await call('admin/billing', { config: { freeMonthlyCredits: 4 } }, adminToken)).status, 200);
  const endpoints = [
    { id: 'image', baseUrl: 'https://model.example/v1', model: 'image-model',
      apiKey: 'synthetic-test-key', isEnabled: true, isDefault: true },
    { id: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-image-model',
      apiKey: 'synthetic-google-key', isEnabled: true },
    { id: 'imagen', baseUrl: 'https://generativelanguage.googleapis.com', model: 'imagen-model',
      apiKey: 'synthetic-google-key', isEnabled: true },
    { id: 'gpt-modern', baseUrl: 'https://model.example/v1', model: 'gpt-image-2.5', provider: 'gemini',
      apiKey: 'synthetic-test-key', isEnabled: true },
    { id: 'gemini-proxy', baseUrl: 'https://model.example/v1/chat/completions', model: 'gemini-3.1-flash-image',
      apiKey: 'synthetic-test-key', isEnabled: true },
    { id: 'gemini-native', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-3.1-flash-image',
      apiKey: 'synthetic-google-key', isEnabled: true },
  ];
  assert.equal((await call('admin/models', { endpoints }, adminToken)).status, 200);
  const guest = await call('user/auth', { mode: 'register', email: 'generation@example.test', password: 'synthetic-generation-password' });
  assert.equal(guest.status, 200);
  assert.equal((await call('user/verify-email', { token: emailServices.latestToken('generation@example.test') })).status, 200);
  const userId = guest.data.user.id;
  const token = guest.data.token;
  return {
    call,
    token,
    leases,
    setUser: (credits, status) => setUser(userId, credits, status),
    billing: config => call('admin/billing', { config }, adminToken),
    adjustCredits: delta => call('admin/users/credits', { userId, delta }, adminToken),
    profile: async () => (await call('user/me', undefined, token)).data.user,
    generate: body => call('generate', { prompt: 'Synthetic test', endpointId: 'image', ...body }, token),
  };
}

for (const backend of ['Node', 'D1']) {
  test(`${backend}: undersized 4K output is retained, refunded once and never silently retried`, async testContext => {
    let calls = 0;
    let fixture;
    fixture = await withBackend(testContext, backend, async (url, options) => {
      calls++;
      assert.equal(JSON.parse(options.body).size, '3840x1920');
      assert.equal((await fixture.profile()).creditsBalance, 0);
      assert.equal((await fixture.adjustCredits(7)).status, 200);
      return Response.json({ data: [{ b64_json: pngMetadata(1774, 887) }] });
    });
    const result = await fixture.generate({ endpointId: 'gpt-modern', resolution: '4K' });
    assert.equal(result.status, 200);
    assert.equal(result.data.success, true);
    assert.ok(result.data.imageUrl.includes(pngMetadata(1774, 887)));
    assert.equal(result.data.imageResolution.status, 'below-request');
    assert.equal(result.data.creditsDeducted, 0);
    assert.equal(result.data.creditsRefunded, 4);
    assert.equal(result.data.remainingCredits, 11);
    assert.equal((await fixture.profile()).creditsBalance, 11);
    assert.equal(calls, 1);
  });

  test(`${backend}: real 4K output is charged normally and remote dimensions are never fabricated`, async testContext => {
    let remote = false;
    const fixture = await withBackend(testContext, backend, () => Response.json({ data: [remote
      ? { url: 'https://example.test/result.png' } : { b64_json: pngMetadata(3840, 1920) }] }));
    const result = await fixture.generate({ endpointId: 'gpt-modern', resolution: '4K' });
    assert.equal(result.data.imageResolution.status, 'met');
    assert.equal(result.data.creditsDeducted, 4);
    assert.equal(result.data.creditsRefunded, 0);
    assert.ok(result.data.generationTiming.upstreamWaitMs >= 0);
    assert.ok(result.data.generationTiming.upstreamBodyMs >= 0);
    assert.equal((await fixture.profile()).creditsBalance, 0);
    fixture.setUser(4);
    remote = true;
    const unknown = await fixture.generate({ endpointId: 'gpt-modern', resolution: '4K' });
    assert.equal(unknown.data.imageResolution.status, 'unverified');
    assert.equal(unknown.data.imageResolution.width, null);
  });

  for (const resolution of ['1K', '2K', '4K']) {
    test(`${backend}: GPT requests native ${resolution} size with automatic quality and one credit reservation`, async testContext => {
      let calls = 0;
      const fixture = await withBackend(testContext, backend, (url, options) => {
        calls++;
        const payload = JSON.parse(options.body);
        assert.equal(url, 'https://model.example/v1/images/generations');
        assert.equal(payload.size, { '1K': '1152x576', '2K': '2048x1024', '4K': '3840x1920' }[resolution]);
        assert.equal(payload.quality, 'auto');
        assert.equal(payload.n, 1);
        return imageResponse();
      });
      const result = await fixture.generate({ endpointId: 'gpt-modern', resolution });
      assert.equal(result.status, 200);
      assert.equal(calls, 1);
      assert.equal((await fixture.profile()).creditsBalance, 4 - { '1K': 1, '2K': 2, '4K': 4 }[resolution]);
    });

    test(`${backend}: Gemini proxy forwards native ${resolution}, image modality and reference images`, async testContext => {
      const fixture = await withBackend(testContext, backend, (url, options) => {
        const payload = JSON.parse(options.body);
        assert.equal(url, 'https://model.example/v1/chat/completions');
        assert.deepEqual(payload.image_config, { aspect_ratio: '16:9', image_size: resolution });
        assert.deepEqual(payload.modalities, ['image']);
        assert.equal(payload.messages[0].content[1].image_url.url, 'data:image/png;base64,AA==');
        return Response.json({ choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,AA==' } }] } }] });
      });
      const result = await fixture.generate({ endpointId: 'gemini-proxy', resolution, referenceImages: ['data:image/png;base64,AA=='] });
      assert.equal(result.status, 200);
      assert.equal(result.data.imageUrl, 'data:image/png;base64,AA==');
    });
  }

  test(`${backend}: GPT uploads reference bytes through image edits and charges once for a successful result`, async testContext => {
    let calls = 0;
    const fixture = await withBackend(testContext, backend, async (url, options) => {
      calls++;
      assert.equal(new URL(url).pathname, '/v1/images/edits');
      const request = new Request(url, options);
      assert.match(request.headers.get('content-type'), /^multipart\/form-data; boundary=/);
      const form = await request.formData();
      assert.equal(form.get('model'), 'gpt-image-2.5');
      assert.equal(form.get('size'), '1152x576');
      const files = form.getAll('image[]');
      assert.equal(files.length, 2);
      assert.deepEqual(Buffer.from(await files[0].arrayBuffer()), Buffer.from([0]));
      assert.deepEqual(Buffer.from(await files[1].arrayBuffer()), Buffer.from([1, 2]));
      return Response.json({ data: [{ b64_json: pngMetadata(1152, 576) }] });
    });
    const generated = await fixture.generate({ endpointId: 'gpt-modern', resolution: '1K', referenceImages: [
      'data:image/png;base64,AA==', 'data:image/jpeg;base64,AQI=',
    ] });
    assert.equal(generated.status, 200);
    assert.equal(generated.data.creditsDeducted, 1);
    assert.equal(generated.data.remainingCredits, 3);
    assert.equal(calls, 1);
    assert.equal((await fixture.profile()).creditsBalance, 3);
  });

  test(`${backend}: invalid GPT reference files fail before model calls or credit reservation`, async testContext => {
    let calls = 0;
    const fixture = await withBackend(testContext, backend, () => { calls++; return imageResponse(); });
    for (const image of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,%%%%']) {
      const rejected = await fixture.generate({ endpointId: 'gpt-modern', resolution: '1K', referenceImages: [image] });
      assert.equal(rejected.status, 400);
    }
    assert.equal(calls, 0);
    assert.equal((await fixture.profile()).creditsBalance, 4);
  });

  test(`${backend}: native Gemini forwards imageConfig to generateContent without duplicating the version path`, async testContext => {
    const fixture = await withBackend(testContext, backend, (url, options) => {
      assert.equal(new URL(url).pathname, '/v1beta/models/gemini-3.1-flash-image:generateContent');
      const payload = JSON.parse(options.body);
      assert.deepEqual(payload.generationConfig, { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9', imageSize: '2K' }, thinkingConfig: { thinkingLevel: 'minimal', includeThoughts: false } });
      return Response.json({ candidates: [{ content: { parts: [{ inlineData: { data: 'AA==', mimeType: 'image/png' } }] } }] });
    });
    assert.equal((await fixture.generate({ endpointId: 'gemini-native', resolution: '2K' })).status, 200);
  });

  test(`${backend}: malformed reference inputs fail without model calls or credit reservation`, async testContext => {
    let calls = 0;
    const fixture = await withBackend(testContext, backend, () => { calls++; return imageResponse(); });
    for (const referenceImages of [null, 'image', [4]]) {
      assert.equal((await fixture.generate({ referenceImages, resolution: '2K' })).status, 400);
    }
    assert.equal(calls, 0);
    assert.equal((await fixture.profile()).creditsBalance, 4);
  });

  test(`${backend}: rejects Imagen reference input without charging, while text generation works`, async testContext => {
    let calls = 0;
    const fixture = await withBackend(testContext, backend, url => {
      calls++;
      assert.ok(String(url).includes(':predict'));
      return Response.json({ predictions: [{ bytesBase64Encoded: 'AA==' }] });
    });
    const rejected = await fixture.generate({ endpointId: 'imagen', resolution: '1K', referenceImages: ['data:image/png;base64,AA=='] });
    assert.equal(rejected.status, 400);
    assert.ok(rejected.data.error.includes('does not support reference images'));
    assert.equal(calls, 0);
    assert.equal((await fixture.profile()).creditsBalance, 4);
    const generated = await fixture.generate({ endpointId: 'imagen', resolution: '1K' });
    assert.equal(generated.status, 200);
    assert.equal(generated.data.remainingCredits, 3);
  });

  test(`${backend}: derives cost from server billing, not client creditsCost`, async testContext => {
    let calls = 0;
    const fixture = await withBackend(testContext, backend, () => { calls++; return imageResponse(); });
    await fixture.billing({ creditCostPer2K: 3 });
    const result = await fixture.generate({ resolution: '2K', creditsCost: 0.1 });
    assert.equal(result.status, 200);
    assert.equal(result.data.creditsDeducted, 3);
    assert.equal(result.data.remainingCredits, 1);
    assert.equal((await fixture.profile()).apiCallsCount, 1);
    fixture.setUser(0);
    assert.equal((await fixture.generate({ resolution: '2K', creditsCost: 0.1 })).status, 400);
    assert.equal(calls, 1);
  });

  test(`${backend}: validates resolutions and invalid server rates without calling model`, async testContext => {
    let calls = 0;
    const fixture = await withBackend(testContext, backend, () => { calls++; return imageResponse(); });
    for (const resolution of ['8K', '', 2, {}, '__proto__']) {
      assert.equal((await fixture.generate({ resolution })).status, 400);
    }
    for (const creditCostPer4K of [0, -1, 0.1, '4', Number.MAX_SAFE_INTEGER + 1]) {
      await fixture.billing({ creditCostPer4K });
      assert.equal((await fixture.generate({ resolution: '4K' })).status, 503);
    }
    assert.equal(calls, 0);
    assert.equal((await fixture.profile()).creditsBalance, 4);
  });

  test(`${backend}: reserves credits before upstream and rejects concurrent overdraft`, async testContext => {
    let arrive;
    let release;
    const arrived = new Promise(resolve => { arrive = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    let calls = 0;
    const fixture = await withBackend(testContext, backend, async () => {
      calls++;
      arrive();
      await gate;
      return imageResponse();
    });
    const first = fixture.generate({ resolution: '4K' });
    try {
      await arrived;
      assert.equal((await fixture.profile()).creditsBalance, 0);
      assert.equal((await fixture.generate({ resolution: '4K' })).status, 400);
      assert.equal(calls, 1);
    } finally {
      release();
    }
    const result = await first;
    assert.equal(result.status, 200);
    assert.equal(result.data.remainingCredits, 0);
    assert.equal((await fixture.profile()).apiCallsCount, 1);
  });

  test(`${backend}: successful overlapping requests cannot overwrite each other's debit`, async testContext => {
    let arrive;
    let release;
    const arrived = new Promise(resolve => { arrive = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    let calls = 0;
    const fixture = await withBackend(testContext, backend, async () => {
      calls++;
      if (calls === 2) arrive();
      await gate;
      return imageResponse();
    });
    const requests = [fixture.generate({ resolution: '2K' }), fixture.generate({ resolution: '2K' })];
    try {
      await arrived;
      assert.equal((await fixture.profile()).creditsBalance, 0);
    } finally {
      release();
    }
    const results = await Promise.all(requests);
    assert.deepEqual(results.map(result => result.status), [200, 200]);
    const user = await fixture.profile();
    assert.equal(user.creditsBalance, 0);
    assert.equal(user.apiCallsCount, 2);
  });

  for (const failure of ['http', 'missing-image', 'invalid-json', 'network', 'timeout']) {
    test(`${backend}: releases reservation on ${failure} failure`, async testContext => {
      const fixture = await withBackend(testContext, backend, () => {
        if (failure === 'http') return Response.json({ error: 'Unavailable' }, { status: 503 });
        if (failure === 'missing-image') return Response.json({ data: [] });
        if (failure === 'invalid-json') return new Response('{broken');
        if (failure === 'timeout') throw new DOMException('Aborted', 'AbortError');
        throw new Error('Mock network error');
      });
      const result = await fixture.generate({ resolution: '4K' });
      assert.equal(result.status, ['http', 'missing-image'].includes(failure) ? 502 : 504);
      const user = await fixture.profile();
      assert.equal(user.creditsBalance, 4);
      assert.equal(user.apiCallsCount || 0, 0);
    });
  }

  test(`${backend}: refund preserves admin adjustments made while generating`, async testContext => {
    let arrive;
    let release;
    const arrived = new Promise(resolve => { arrive = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const fixture = await withBackend(testContext, backend, async () => {
      arrive();
      await gate;
      throw new Error('Mock model failure');
    });
    const request = fixture.generate({ resolution: '4K' });
    try {
      await arrived;
      assert.equal((await fixture.adjustCredits(7)).status, 200);
    } finally {
      release();
    }
    assert.equal((await request).status, 504);
    assert.equal((await fixture.profile()).creditsBalance, 11);
  });

  test(`${backend}: finds Google inline image after text and prefers it to text URLs`, async testContext => {
    const fixture = await withBackend(testContext, backend, () => Response.json({
      candidates: [{ content: { parts: [
        { text: 'Reference: https://example.com/reference.png' },
        { text: 'Here is your generated image.' },
        { inlineData: { mimeType: 'image/jpeg', data: 'AA==' } },
      ] } }],
    }));
    const result = await fixture.generate({ endpointId: 'gemini', resolution: '1K' });
    assert.equal(result.status, 200);
    assert.equal(result.data.imageUrl, 'data:image/jpeg;base64,AA==');
    assert.equal(result.data.remainingCredits, 3);
  });
}

for (const backend of ['Node', 'D1']) {
test(`${backend}: pure generation deadline covers response body parsing and releases credits`, async testContext => {
  let startParsing;
  const parsingStarted = new Promise(resolve => { startParsing = resolve; });
  const fixture = await withBackend(testContext, backend, (url, options) => {
    const response = Response.json({ data: [] });
    response.json = () => new Promise((resolve, reject) => {
      startParsing();
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    return response;
  });
  generationClock(testContext);
  const request = fixture.generate({ resolution: '4K' });
  await parsingStarted;
  assert.equal((await fixture.profile()).creditsBalance, 0);
  testContext.mock.timers.tick(90000);
  assert.equal((await fixture.profile()).creditsBalance, 0, 'the former 90-second deadline must not abort a slow 4K response');
  testContext.mock.timers.tick(60000);
  assert.equal((await request).status, 504);
  assert.equal((await fixture.profile()).creditsBalance, 4);
  assert.deepEqual(fixture.leases(), []);
});
}

function loadTsModule(relativePath, overrides = {}) {
  const source = fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const nativeRequire = createRequire(new URL(relativePath, import.meta.url));
  const module = { exports: {} };
  new Function('require', 'exports', 'module', output)(specifier => (
    Object.hasOwn(overrides, specifier) ? overrides[specifier]
      : specifier.endsWith('/i18n') ? { useTranslation: () => text => text, useLanguage: () => ['en', () => {}], withLanguageHref: href => href }
      : /\/(?:shell|generator|tool|viewer|landing|shared|commerce|specialist|advanced)Translations$/.test(specifier) ? loadTsModule(new URL(specifier + '.ts', new URL(relativePath, import.meta.url)))
      : specifier.endsWith('/abortSignal') ? { combineAbortSignals }
      : specifier.endsWith('/workThumbnail') ? loadTsModule(new URL(specifier + '.ts', new URL(relativePath, import.meta.url)))
      : specifier.endsWith('/RenewalTerms') ? loadTsModule(new URL(specifier + '.tsx', new URL(relativePath, import.meta.url)))
      : specifier === './VerificationChallenge' ? { VerificationChallenge: 'verification-challenge' } : nativeRequire(specifier)
  ), module.exports, module);
  return module.exports;
}

function setGlobal(testContext, name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  testContext.after(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  });
}

test('guest tokens keep login/register visible, while real accounts retain profile view', testContext => {
  setGlobal(testContext, 'localStorage', { getItem: () => 'synthetic-token' });
  const { UserAuthModal } = loadTsModule('../src/components/commercial/UserAuthModal.tsx', {
    '../../utils/commercialApi': commercialApi,
  });
  const render = id => renderToStaticMarkup(React.createElement(UserAuthModal, {
    isOpen: true, currentUser: { id, name: 'Test User', email: 'test@example.com', plan: 'free', creditsBalance: 4 },
    onClose: () => {}, onAuthSuccess: () => {},
  }));
  for (const userId of ['usr_guest', 'usr_guest_1234567890']) {
    const markup = render(userId);
    assert.ok(markup.includes('<form'));
    assert.ok(markup.includes('Sign in to 360 Panorama Viewer'));
    assert.ok(markup.includes('Create account'));
    assert.ok(!markup.includes('Sign out'));
  }
  const account = render('usr_registered');
  assert.ok(!account.includes('<form'));
  assert.ok(account.includes('Your account'));
});

test('generation client sends resolution and auth without a client-determined credit price', async testContext => {
  setGlobal(testContext, 'localStorage', { getItem: () => 'synthetic-token' });
  setGlobal(testContext, 'window', { location: { hostname: 'review.example' } });
  let sentRequest;
  testContext.mock.method(globalThis, 'fetch', async (url, options) => {
    sentRequest = { url, options, body: JSON.parse(options.body) };
    return Response.json({ success: true, imageUrl: 'data:image/png;base64,AA==', remainingCredits: 2, creditsDeducted: 2 });
  });
  const { generateWithGemini } = loadTsModule('../src/utils/geminiClient.ts', {
    './adminStorage': adminStorage, './seamHealer': { healPanoramaSeam: () => {} },
  });
  const result = await generateWithGemini('Synthetic test', {
    endpointId: 'image', apiKey: '', baseUrl: 'https://model.example/v1', model: 'image-model', resolution: '2K',
  });
  assert.equal(sentRequest.body.resolution, '2K');
  assert.equal(Object.hasOwn(sentRequest.body, 'creditsCost'), false);
  assert.equal(sentRequest.options.headers.Authorization, 'Bearer synthetic-token');
  assert.equal(result.remainingCredits, 2);
  assert.equal(result.creditsDeducted, 2);
});

function sourceCallback(relativePath, name) {
  const filename = new URL(relativePath, import.meta.url);
  const source = ts.createSourceFile(filename.pathname, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = node => {
    if (!callback && name && ts.isVariableDeclaration(node) && node.name.getText(source) === name) callback = node.initializer;
    if (!callback && !name && ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect') callback = node.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(callback, name || 'initial effect');
  return callback.getText(source);
}

function callbackWithContext(text, context) {
  context = { t: text => text, lang: 'en', ...context };
  const output = ts.transpileModule('const handler = ' + text + ';', {
    compilerOptions: { target: ts.ScriptTarget.ES2023 },
  }).outputText;
  return new Function('context', `const {${Object.keys(context).join(',')}} = context; ${output}; return handler;`)(context);
}

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}

test('viewport snapshots bake tone filters and support canvases without native filters', () => {
  for (const supportsFilter of [true, false]) {
    const source = { width: 1, height: 1 };
    const pixels = new Uint8ClampedArray([200, 100, 50, 255]);
    let downloaded = false;
    const context = {
      ...(supportsFilter ? { filter: 'none' } : {}),
      drawImage(value) { assert.equal(value, source); },
      getImageData() { return { data: pixels }; },
      putImageData(frame) { assert.equal(frame.data, pixels); },
    };
    const canvas = { getContext: () => context, toDataURL: () => 'data:image/png;base64,test' };
    const anchor = { click() { downloaded = true; } };
    const snapshot = callbackWithContext(sourceCallback('../src/components/SphereViewer.tsx', 'handleTakeSnapshot'), {
      rendererRef: { current: { domElement: source } }, contrast: 100, saturation: 0,
      document: { createElement: name => name === 'canvas' ? canvas : anchor },
    });
    snapshot();
    assert.equal(downloaded, true);
    assert.equal(anchor.href, 'data:image/png;base64,test');
    assert.equal(canvas.width, source.width);
    assert.equal(canvas.height, source.height);
    if (supportsFilter) assert.equal(context.filter, 'contrast(100%) saturate(0%)');
    else assert.deepEqual([...pixels], [118, 118, 118, 255]);
  }
});

const accountFixture = (id = 'usr_account') => ({ id, name: 'Test Account', email: 'test@example.com', plan: 'free',
  creditsBalance: 4, creditsTotal: 4, apiCallsCount: 0, status: 'active', emailVerified: true });
const flushPromises = () => new Promise(resolve => setImmediate(resolve));

for (const backend of ['Node', 'D1']) {
  test(`${backend}: explicit sign-in never registers an unknown email, and registration rejects existing accounts`, async testContext => {
    const fixture = await withBackend(testContext, backend);
    const credentials = { email: 'flow@example.test', password: 'Synthetic-test-password', name: 'Flow Tester' };
    const unknown = await fixture.call('user/auth', { ...credentials, mode: 'login' });
    assert.equal(unknown.status, 401);
    assert.ok(!/\p{Script=Han}/u.test(unknown.data.error));
    const registered = await fixture.call('user/auth', { ...credentials, mode: 'register' });
    assert.equal(registered.status, 200);
    assert.equal((await fixture.call('user/auth', { ...credentials, mode: 'register' })).status, 409);
    const loggedIn = await fixture.call('user/auth', { ...credentials, mode: 'login' });
    assert.equal(loggedIn.status, 200);
    assert.equal(loggedIn.data.user.id, registered.data.user.id);
    for (const password of [7, {}, 'x'.repeat(1025)]) {
      assert.equal((await fixture.call('user/auth', { email: 'invalid@example.test', password, mode: 'register' })).status, 400);
    }
  });
}

test('auth client sends explicit intent and cannot replace a session after its dialog is cancelled', async testContext => {
  const storage = memoryStorage();
  storage.setItem('panorama_server_user_token', 'original-session');
  setGlobal(testContext, 'localStorage', storage);
  const controller = new AbortController();
  testContext.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(JSON.parse(options.body).mode, 'login');
    controller.abort();
    return Response.json({ success: true, token: 'late-session', user: accountFixture() });
  });
  const result = await commercialApi.authServerUser('test@example.test', undefined, 'synthetic', { mode: 'login', signal: controller.signal });
  assert.equal(result.success, false);
  assert.equal(storage.getItem('panorama_server_user_token'), 'original-session');
});

test('guest plan selection requests sign-in, then continues with exactly the selected plan and interval', () => {
  const state = {};
  const context = {
    currentUser: accountFixture('usr_guest_preview'), localStorage: { getItem: () => 'guest-token' },
    setPendingCheckout: value => { state.pending = value; },
    setCheckoutSelection: value => { state.selection = value; },
    setIsCheckoutModalOpen: value => { state.checkout = value; },
    setIsAuthModalOpen: value => { state.auth = value; },
    setVerificationToken: value => { state.verificationToken = value; },
    setAuthMode: value => { state.authMode = value; },
    setAuthModalNotice: value => { state.notice = value; },
    updateCurrentUser: value => { state.user = value; },
  };
  callbackWithContext(sourceCallback('../src/App.tsx', 'handleChoosePlan'), context)('enterprise', 'yearly');
  assert.deepEqual(state.pending, { plan: 'enterprise', cycle: 'yearly' });
  assert.equal(state.auth, true);
  assert.equal(state.authMode, 'login');
  assert.equal(state.checkout, false);
  context.pendingCheckout = state.pending;
  callbackWithContext(sourceCallback('../src/App.tsx', 'handleAuthSuccess'), context)(accountFixture());
  assert.deepEqual(state.selection, { plan: 'enterprise', cycle: 'yearly' });
  assert.equal(state.checkout, true);
  assert.equal(state.pending, null);
  callbackWithContext(sourceCallback('../src/App.tsx', 'handleCloseAuth'), context)();
  assert.equal(state.auth, false);
  assert.equal(state.verificationToken, '');
  assert.equal(state.pending, null);
});

test('navigation from pricing to Studio clears the pricing hash instead of reopening pricing on refresh', () => {
  const paths = [];
  const navigate = callbackWithContext(sourceCallback('../src/App.tsx', 'navigateTo'), {
    setActiveTab() {}, setIsToolsDropdownOpen() {}, setGeneratorVisited() {}, setIsWorksOpen() {},
    window: { location: { origin: 'https://360panoramaviewer.com', pathname: '/', search: '', hash: '#pricing' }, scrollY: 0, history: { pushState: (state, title, path) => paths.push(path) } },
  });
  navigate('generator');
  assert.deepEqual(paths, ['/']);
});

test('public source copy keeps translations in dedicated dictionaries', () => {
  const directory = new URL('../src/', import.meta.url);
  const files = [];
  const walk = root => {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), root);
      if (entry.isDirectory()) walk(file);
      else if (/\.(tsx?|mjs)$/.test(entry.name) && entry.name !== 'AdminTab.tsx') files.push(file);
    }
  };
  walk(directory);
  for (const file of files) {
    if (/\/src\/utils\/(?:shell|generator|tool|viewer|landing|shared|commerce|specialist|advanced)Translations\.ts$/.test(file.pathname)) continue;
    const source = ts.createSourceFile(file.pathname, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.pathname.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = node => {
      if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) {
        const declaration = node.parent?.parent?.parent?.parent;
        const isLanguageName = /\/src\/(?:App\.tsx|utils\/i18n\.ts)$/.test(file.pathname) && ts.isStringLiteral(node)
          && ts.isPropertyAssignment(node.parent) && node.parent.name.getText(source) === 'name'
          && declaration && ts.isVariableDeclaration(declaration) && ['GUIDE_LANGUAGES', 'LANGUAGES'].includes(declaration.name.getText(source))
          && ['简体中文', '日本語'].includes(node.text);
        assert.ok(isLanguageName || !/\p{Script=Han}/u.test(node.text), `${file.pathname}: ${node.text}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
});

function appHarness(testContext, overrides = {}) {
  setGlobal(testContext, 'localStorage', memoryStorage());
  setGlobal(testContext, 'window', new EventTarget());
  const state = {};
  const context = {
    ...adminStorage,
    setCurrentUser: user => { state.user = user; },
    setIsWorksOpen() {},
    panoramaOwner: { current: null }, samplePanoramaUrl: 'public-sample',
    setCurrentPanoramaUrl: value => { state.panorama = value; },
    setViewerSession: updater => { state.viewerSession = updater(state.viewerSession ?? 0); },
    setBillingConfig: config => { state.billing = config; },
    fetchServerUser: commercialApi.fetchServerUser,
    initServerGuestUser: async () => ({ success: true, user: accountFixture('usr_guest_test'), token: 'guest-token' }),
    fetchPublicModelsConfig: async () => null,
    fetchPublicBillingConfig: async () => null,
    ...overrides,
  };
  context.updateCurrentUser = callbackWithContext(sourceCallback('../src/App.tsx', 'updateCurrentUser'), context);
  const effect = () => callbackWithContext(sourceCallback('../src/App.tsx'), context)();
  return { state, context, effect };
}

for (const failure of ['network', 403, 500, 503]) {
  test(`profile ${failure} failure preserves a valid login and cached account`, async testContext => {
    let guestCalls = 0;
    const harness = appHarness(testContext, { initServerGuestUser: async () => { guestCalls++; return { success: false }; } });
    harness.context.updateCurrentUser(accountFixture());
    localStorage.setItem('panorama_server_user_token', 'valid-token');
    testContext.mock.method(globalThis, 'fetch', async () => {
      if (failure === 'network') throw new Error('Mock network failure');
      return Response.json({ error: 'Temporarily unavailable' }, { status: failure });
    });
    const cleanup = harness.effect();
    await flushPromises();
    assert.equal(localStorage.getItem('panorama_server_user_token'), 'valid-token');
    assert.equal(harness.state.user.id, 'usr_account');
    assert.equal(guestCalls, 0);
    cleanup();
  });
}

for (const status of [401, 404]) {
  test(`profile ${status} clears invalid identity without creating a guest session`, async testContext => {
    const harness = appHarness(testContext);
    harness.context.updateCurrentUser(accountFixture());
    localStorage.setItem('panorama_server_user_token', 'invalid-token');
    testContext.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Invalid account' }, { status }));
    const cleanup = harness.effect();
    await flushPromises();
    assert.equal(localStorage.getItem('panorama_server_user_token'), null);
    assert.equal(harness.state.user.id, 'usr_guest');
    assert.equal(harness.state.user.creditsBalance, 0);
    assert.equal(adminStorage.getCurrentUser().id, 'usr_guest');
    cleanup();
  });
}

test('stale profile replies cannot overwrite a newly logged-in account', async testContext => {
  let finish;
  const reply = new Promise(resolve => { finish = resolve; });
  const harness = appHarness(testContext, { fetchServerUser: () => reply });
  harness.context.updateCurrentUser(accountFixture('usr_old'));
  localStorage.setItem('panorama_server_user_token', 'old-token');
  const cleanup = harness.effect();
  localStorage.setItem('panorama_server_user_token', 'new-token');
  harness.context.updateCurrentUser(accountFixture('usr_new'));
  finish({ success: true, user: accountFixture('usr_old') });
  await flushPromises();
  assert.equal(harness.state.user.id, 'usr_new');
  assert.equal(adminStorage.getCurrentUser().id, 'usr_new');
  assert.equal(localStorage.getItem('panorama_server_user_token'), 'new-token');
  cleanup();
});

test('guest initialization cannot overwrite a login or a cancelled page effect', async testContext => {
  for (const cancelled of [false, true]) {
    let finish;
    const reply = new Promise(resolve => { finish = resolve; });
    const harness = appHarness(testContext, { initServerGuestUser: () => reply });
    const cleanup = harness.effect();
    if (cancelled) cleanup();
    else {
      localStorage.setItem('panorama_server_user_token', 'new-token');
      harness.context.updateCurrentUser(accountFixture('usr_new'));
    }
    finish({ success: true, user: accountFixture('usr_guest_late'), token: 'late-guest-token' });
    await flushPromises();
    assert.notEqual(localStorage.getItem('panorama_server_user_token'), 'late-guest-token');
    if (!cancelled) {
      assert.equal(harness.state.user.id, 'usr_new');
      cleanup();
    }
  }
});

test('public billing initializes workspace prices and fills missing server defaults', async testContext => {
  const harness = appHarness(testContext, { fetchPublicBillingConfig: async () => ({ creditCostPer4K: 1 }) });
  const cleanup = harness.effect();
  await flushPromises();
  assert.equal(harness.state.billing.creditCostPer4K, 1);
  assert.equal(harness.state.billing.creditCostPer2K, 2);
  assert.equal(adminStorage.getStoredBillingConfig().creditCostPer4K, 1);
  cleanup();
});

test('verified account debit updates the active App identity rather than an old cached snapshot', async testContext => {
  const browser = new EventTarget();
  const harness = appHarness(testContext, {
    fetchServerUser: async () => ({ success: true, user: { ...accountFixture('usr_verified_test'), creditsBalance: 2 } }),
  });
  setGlobal(testContext, 'window', browser);
  harness.context.updateCurrentUser(accountFixture('usr_verified_test'));
  localStorage.setItem('panorama_server_user_token', 'verified-token');
  const cleanup = harness.effect();
  await flushPromises();
  browser.dispatchEvent(new Event('panorama-user-refresh'));
  await flushPromises();
  assert.equal(harness.state.user.id, 'usr_verified_test');
  assert.equal(harness.state.user.creditsBalance, 2);
  assert.equal(harness.state.user.emailVerified, true);
  assert.equal(adminStorage.getCurrentUser().creditsBalance, 2);
  cleanup();
});

test('tab navigation resynchronizes stored user, billing and models while cancelling prior profile replies', async testContext => {
  const replies = [];
  let models = null;
  const harness = appHarness(testContext, {
    fetchServerUser: () => new Promise(resolve => replies.push(resolve)),
    fetchPublicModelsConfig: async () => models,
  });
  harness.context.updateCurrentUser(accountFixture());
  localStorage.setItem('panorama_server_user_token', 'account-token');
  const filename = new URL('../src/App.tsx', import.meta.url);
  const source = ts.createSourceFile(filename.pathname, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const app = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'App');
  const effect = app.body.statements.find(node => ts.isExpressionStatement(node)
    && ts.isCallExpression(node.expression) && node.expression.expression.getText(source) === 'useEffect');
  let dependencies;
  let cleanup;
  const navigate = callbackWithContext(`(activeTab)=>{${effect.getText(source)}}`, {
    ...harness.context,
    useEffect: (callback, next) => {
      if (dependencies && next.every((value, index) => value === dependencies[index])) return;
      cleanup?.();
      dependencies = next;
      cleanup = callback();
    },
  });
  testContext.after(() => cleanup?.());
  navigate('admin');
  await flushPromises();
  const paid = { ...accountFixture(), plan: 'pro', creditsBalance: 1004 };
  adminStorage.saveStoredManagedUsers([paid]);
  adminStorage.saveStoredBillingConfig({ ...adminStorage.DEFAULT_BILLING_CONFIG, creditCostPer4K: 3 });
  models = { endpoints: [{ id: 'new-model', isEnabled: true }] };
  navigate('generator');
  await flushPromises();
  replies[0]({ success: true, user: accountFixture() });
  await flushPromises();
  assert.equal(harness.state.user.plan, 'pro');
  assert.equal(harness.state.billing.creditCostPer4K, 3);
  assert.equal(adminStorage.getStoredModelEndpoints()[0].id, 'new-model');
  assert.equal(replies.length, 2);
});

test('generation uses its captured session even if another account logs in', async testContext => {
  setGlobal(testContext, 'localStorage', { getItem: () => 'other-account-token' });
  setGlobal(testContext, 'window', { location: { hostname: 'review.example' } });
  let sentToken;
  testContext.mock.method(globalThis, 'fetch', async (url, options) => {
    sentToken = options.headers.Authorization;
    return Response.json({ success: true, imageUrl: 'data:image/png;base64,AA==', remainingCredits: 2 });
  });
  const { generateWithGemini } = loadTsModule('../src/utils/geminiClient.ts', {
    './adminStorage': adminStorage, './seamHealer': { healPanoramaSeam: () => {} },
  });
  await generateWithGemini('Test', { apiKey: '', baseUrl: 'https://model.example', model: 'image-model', sessionToken: 'original-token' });
  assert.equal(sentToken, 'Bearer original-token');
});

test('cloud generation defers balance checks to server rather than rejecting on a cached price', async testContext => {
  setGlobal(testContext, 'localStorage', memoryStorage());
  const source = fs.readFileSync(new URL('../src/components/GeneratorTab.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('// 1. Account status check');
  const end = source.indexOf('// 3. Check execution pipeline availability', start);
  assert.ok(start >= 0 && end > start);
  let error;
  const check = callbackWithContext(`()=>{${source.slice(start, end)}return true;}`, {
    currentUser: { ...accountFixture(), creditsBalance: 2 }, creditsCost: 4, resolution: '4K',
    generationRef: { current: { mounted: true, request: 0 } }, getCurrentUser: () => accountFixture(),
    setApiError: message => { error = message; }, window: { dispatchEvent() {} },
  });
  localStorage.setItem('panorama_server_user_token', 'valid-token');
  assert.equal(check(), true);
  assert.equal(error, undefined);
  localStorage.removeItem('panorama_server_user_token');
  assert.equal(check(), undefined);
  assert.ok(error.includes('Register and verify'));
});

test('generation finishing after an account switch does not overwrite the new account', async () => {
  let finish;
  let activeUser = accountFixture();
  const fixture = generatorRegressionContext({
    getCurrentUser: () => activeUser,
    generateWithGemini: () => new Promise(resolve => { finish = resolve; }),
  });
  const pending = fixture.generate();
  activeUser = accountFixture('usr_new');
  const before = [...fixture.state];
  finish({ imageUrl: 'raw', remainingCredits: 2 });
  await pending;
  assert.deepEqual(fixture.state, before);
});

function adminHarness(testContext, successful = true, serverMode = true) {
  setGlobal(testContext, 'localStorage', memoryStorage());
  setGlobal(testContext, 'confirm', () => true);
  const endpoints = [{ id: 'primary', name: 'Primary', isDefault: true, isEnabled: true },
    { id: 'secondary', name: 'Secondary', isDefault: false, isEnabled: true }];
  const routingConfig = { mode: 'single', primaryEndpointId: 'primary', secondaryEndpointId: 'secondary',
    tertiaryEndpointId: '', roundRobinIndex: 0 };
  adminStorage.saveStoredModelEndpoints(endpoints);
  adminStorage.saveStoredRoutingConfig(routingConfig);
  const state = { notices: [], requests: [], endpoints, routingConfig, editing: true };
  const context = {
    ...adminStorage, endpoints, routingConfig, isServerMode: serverMode, modelSaveInProgress: { current: false },
    editingEndpoint: { ...endpoints[0], name: 'Renamed' }, isAddingEndpoint: false,
    setEndpoints: next => { state.endpoints = next; }, setRoutingConfig: next => { state.routingConfig = next; },
    setEditingEndpoint: value => { state.editing = value; }, setIsAddingEndpoint: () => {},
    showToast: notice => state.notices.push(notice),
    adminSaveModelsConfigServer: async payload => { state.requests.push(payload); return successful; },
  };
  context.saveModelConfiguration = callbackWithContext(sourceCallback('../src/components/AdminTab.tsx', 'saveModelConfiguration'), context);
  return { state, context, action: name => callbackWithContext(sourceCallback('../src/components/AdminTab.tsx', name), context) };
}

const modelActions = [
  ['handleToggleEndpointEnabled', 'primary'], ['handleSetAsPrimaryEndpoint', 'secondary'],
  ['handleSetAsSecondaryEndpoint', 'secondary'], ['handleDeleteEndpoint', 'primary'],
  ['handleSaveRoutingStrategy', { preventDefault: () => {} }], ['handleSaveEndpointForm', { preventDefault: () => {} }],
];
for (const [name, argument] of modelActions) {
  test(`${name}: saves cloud configuration before changing local state`, async testContext => {
    const harness = adminHarness(testContext);
    await harness.action(name)(argument);
    assert.equal(harness.state.requests.length, 1);
    assert.deepEqual(adminStorage.getStoredModelEndpoints(), harness.state.requests[0].endpoints);
    assert.deepEqual(adminStorage.getStoredRoutingConfig(), harness.state.requests[0].routingConfig);
    assert.ok(!harness.state.notices.some(notice => notice.includes('失败')));
  });
  test(`${name}: failed cloud save leaves local configuration untouched`, async testContext => {
    const harness = adminHarness(testContext, false);
    const before = JSON.stringify([adminStorage.getStoredModelEndpoints(), adminStorage.getStoredRoutingConfig()]);
    await harness.action(name)(argument);
    assert.equal(JSON.stringify([adminStorage.getStoredModelEndpoints(), adminStorage.getStoredRoutingConfig()]), before);
    assert.equal(harness.state.notices.length, 1);
    assert.ok(harness.state.notices[0].includes('失败'));
    assert.equal(harness.state.editing, true);
  });
}

test('offline admin mode keeps local editing without making a server request', async testContext => {
  const harness = adminHarness(testContext, false, false);
  await harness.action('handleToggleEndpointEnabled')('primary');
  assert.equal(harness.state.requests.length, 0);
  assert.equal(adminStorage.getStoredModelEndpoints()[0].isEnabled, false);
});

test('overlapping admin saves are rejected rather than overwriting newer state', async testContext => {
  const harness = adminHarness(testContext);
  let release;
  const saved = new Promise(resolve => { release = resolve; });
  harness.context.adminSaveModelsConfigServer = async payload => { harness.state.requests.push(payload); return saved; };
  const save = callbackWithContext(sourceCallback('../src/components/AdminTab.tsx', 'saveModelConfiguration'), harness.context);
  const first = save([{ id: 'first' }]);
  assert.equal(await save([{ id: 'second' }]), false);
  assert.equal(harness.state.requests.length, 1);
  release(true);
  assert.equal(await first, true);
  assert.equal(adminStorage.getStoredModelEndpoints()[0].id, 'first');
  assert.equal(harness.context.modelSaveInProgress.current, false);
});

function componentHarness(relativePath, exportName, overrides = {}) {
  if (relativePath.endsWith('/SharePanorama.tsx')) overrides = { './EmbedModal': { EmbedModal: () => null }, ...overrides };
  if (exportName === 'UserAuthModal') overrides = { ...overrides, '../../utils/commercialApi': {
    ...commercialApi, fetchAuthConfiguration: async () => ({ registrationAvailable: true, turnstileSiteKey: 'synthetic-site' }),
    ...overrides['../../utils/commercialApi'],
  } };
  const hooks = [];
  let cursor = 0;
  let pendingEffects = [];
  const hookReact = {
    ...React,
    useState(initial) {
      const index = cursor++;
      hooks[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[index].value, value => {
        hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      hooks[index] ??= { value: { current: initial } };
      return hooks[index].value;
    },
    useMemo(callback) { return callback(); },
    useCallback(callback) { return callback; },
    useEffect(callback, dependencies) {
      const index = cursor++;
      const previous = hooks[index];
      if (!previous || dependencies.some((value, position) => !Object.is(value, previous.dependencies[position]))) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          hooks[index] = { dependencies, cleanup: callback() };
        });
      }
    },
  };
  const Component = loadTsModule(relativePath, { react: hookReact, 'canvas-confetti': () => {}, ...overrides })[exportName];
  return {
    render(props, attachRefs = () => {}) {
      cursor = 0;
      pendingEffects = [];
      const tree = Component(props);
      attachRefs(tree);
      pendingEffects.forEach(effect => effect());
      return tree;
    },
    unmount() { hooks.forEach(hook => hook.cleanup?.()); },
  };
}

function elementsIn(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elementsIn);
  if (!React.isValidElement(tree)) return [];
  return [tree, ...elementsIn(tree.props.children)];
}

function elementText(tree) {
  if (Array.isArray(tree)) return tree.map(elementText).join('');
  if (React.isValidElement(tree)) return elementText(tree.props.children);
  return typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
}

function buttonIn(tree, name) {
  const button = elementsIn(tree).find(element => element.type === 'button' && elementText(element).includes(name));
  assert.ok(button, `Missing button: ${name}`);
  return button;
}

function studioHarness(testContext) {
  let harness;
  testContext.after(() => harness?.unmount());
  setGlobal(testContext, 'window', new EventTarget());
  const focused = [];
  const scrolled = [];
  setGlobal(testContext, 'document', { getElementById: id => ({
    focus: () => focused.push(id), scrollIntoView: () => scrolled.push(id),
  }) });
  const overrides = Object.fromEntries([
    'ShowcaseGallery', 'FeatureMatrix', 'HowItWorksSteps', 'IntegrationBadges',
    'CommercialFaq', 'PhotoToVideoModal', 'EmbedModal',
  ].map(name => [`./commercial/${name}`, { [name]: () => null }]));
  harness = componentHarness('../src/components/GeneratorTab.tsx', 'GeneratorTab', {
    ...overrides, './commercial/MyWorks': { MyWorks: () => null }, './commercial/SharePanorama': { SharePanoramaModal: () => null }, './SphereViewer': { SphereViewer: 'sphere-preview' },
    './HeroPanorama': { HeroPanorama: 'hero-panorama' },
    '../assets/coastal-cover.png': '/coastal-cover.png',
    '../utils/hdrExporter': {}, '../utils/geminiClient': {}, '../utils/xmpInjector': {},
    '../utils/seamHealer': {}, '../utils/panoramaProcessor': {}, '../utils/adminStorage': {},
  });
  const props = {
    isActive: true, isWorksOpen: false, onWorksOpenChange() {}, getPanoramaOwner: () => null,
    currentUser: accountFixture('usr_guest_studio'),
    billingConfig: { creditCostPer1K: 1, creditCostPer2K: 2, creditCostPer4K: 4 },
    currentPanoramaUrl: 'initial-demo', onUserChange() {}, onPanoramaChange() {}, onNavigateTab() {},
  };
  return { ...harness, props, focused, scrolled };
}

test('generator paste ignores open dialogs and editable fields but accepts viewer image paste', t => {
  const fixture = studioHarness(t);
  let dialogOpen = false;
  setGlobal(t, 'document', { querySelector: () => dialogOpen ? {} : null });
  setGlobal(t, 'Element', class { constructor(editable = false) { this.editable = editable; } closest() { return this.editable ? this : null; } });
  setGlobal(t, 'FileReader', class { readAsDataURL() { this.onload({ target: { result: 'data:image/png;base64,new' } }); } });
  const changes = [];
  fixture.props.onPanoramaChange = url => changes.push(url);
  let tree = fixture.render(fixture.props);
  const paste = target => {
    const event = new Event('paste');
    Object.defineProperty(event, 'target', { value: target });
    Object.defineProperty(event, 'clipboardData', { value: { items: [{ type: 'image/png', getAsFile: () => ({ type: 'image/png' }) }] } });
    window.dispatchEvent(event);
  };
  paste(new Element(true));
  dialogOpen = true; paste(new Element()); dialogOpen = false;
  buttonIn(tree, 'Export Video').props.onClick();
  tree = fixture.render(fixture.props); paste(new Element());
  const video = elementsIn(tree).find(element => typeof element.type === 'function' && element.props.isOpen && element.props.onClose);
  video.props.onClose();
  fixture.render(fixture.props);
  assert.deepEqual(changes, []);
  paste(new Element());
  assert.deepEqual(changes, ['data:image/png;base64,new']);
});

test('image mode starts without the text demo scene and keeps user descriptions when switching', testContext => {
  const fixture = studioHarness(testContext);
  const input = tree => elementsIn(tree).find(element => element.type === 'textarea' && element.props.id === 'prompt-input');
  let tree = fixture.render(fixture.props);
  assert.match(input(tree).props.value, /cyberpunk/);
  buttonIn(tree, 'Image to Pano').props.onClick();
  fixture.render(fixture.props);
  tree = fixture.render(fixture.props);
  assert.equal(input(tree).props.value, '');
  assert.equal(elementsIn(tree).find(element => element.type === 'select' && element.props.id === 'environment-style').props.value, 'custom');
  input(tree).props.onChange({ target: { value: 'Keep the original room and add warm lighting' } });
  tree = fixture.render(fixture.props);
  buttonIn(tree, 'Text Prompt').props.onClick();
  tree = fixture.render(fixture.props);
  buttonIn(tree, 'Image to Pano').props.onClick();
  tree = fixture.render(fixture.props);
  assert.equal(input(tree).props.value, 'Keep the original room and add warm lighting');
});

test('image mode launched externally starts with an empty prompt and a custom style', testContext => {
  const fixture = studioHarness(testContext);
  const tree = fixture.render({ ...fixture.props, externalInputMode: 'image' });
  assert.equal(elementsIn(tree).find(element => element.type === 'textarea').props.value, '');
  assert.equal(elementsIn(tree).find(element => element.type === 'select' && element.props.id === 'environment-style').props.value, 'custom');
});

test('switching to image mode preserves a manually selected environment style', testContext => {
  const fixture = studioHarness(testContext);
  let tree = fixture.render(fixture.props);
  const style = tree => elementsIn(tree).find(element => element.type === 'select' && element.props.id === 'environment-style');
  style(tree).props.onChange({ target: { value: 'interior' } });
  tree = fixture.render(fixture.props);
  buttonIn(tree, 'Image to Pano').props.onClick();
  fixture.render(fixture.props);
  tree = fixture.render(fixture.props);
  assert.equal(style(tree).props.value, 'interior');
  assert.equal(elementsIn(tree).find(element => element.type === 'textarea').props.value, '');
});

test('homepage keeps the interactive coastal panorama over its static cover', testContext => {
  const fixture = studioHarness(testContext);
  const tree = fixture.render({ ...fixture.props, isViewerHomepage: true });
  const heroPanorama = elementsIn(tree).find(element => element.type === 'hero-panorama');
  assert.ok(heroPanorama, 'homepage panorama layer missing');
  assert.equal(heroPanorama.props.textureUrl, '/coastal-cover.png');
  assert.equal(elementsIn(tree).some(element => element.type === 'sphere-preview'), false);
});

test('studio hero renders the interactive panorama over a static cover fallback and defers the full viewer until requested', testContext => {
  const fixture = studioHarness(testContext);
  let tree = fixture.render(fixture.props);
  const cover = elementsIn(tree).find(element => element.type === 'img');
  assert.equal(cover.props.alt, '');
  assert.equal(cover.props.fetchPriority, 'high');
  const heroPanorama = elementsIn(tree).find(element => element.type === 'hero-panorama');
  assert.ok(heroPanorama, 'hero panorama layer missing');
  assert.equal(heroPanorama.props.textureUrl, '/coastal-cover.png');
  assert.equal(elementsIn(tree).some(element => element.type === 'sphere-preview'), false);
  assert.equal(elementsIn(tree).filter(element => element.type === 'details').every(element => !element.props.open), true);
  assert.ok(!elementText(tree).includes('38,000'));
  assert.ok(!elementText(tree).includes('4.9 / 5'));
  buttonIn(tree, 'Start creating').props.onClick();
  assert.deepEqual(fixture.focused, ['prompt-input']);
  assert.deepEqual(fixture.scrolled, ['prompt-input']);
  buttonIn(tree, 'Try the 360° demo').props.onClick();
  tree = fixture.render(fixture.props);
  const viewer = elementsIn(tree).find(element => element.type === 'sphere-preview');
  assert.equal(viewer.props.textureUrl, 'initial-demo');
  assert.equal(viewer.props.initialAutoRotate, false);
  assert.equal(fixture.focused.at(-1), 'studio-preview');
});

test('studio opens generated results without requiring a demo click and retains style and credit controls', testContext => {
  const fixture = studioHarness(testContext);
  let tree = fixture.render(fixture.props);
  const styleSelect = elementsIn(tree).find(element => element.type === 'select');
  assert.equal(elementsIn(styleSelect).filter(element => element.type === 'option').length, 7);
  styleSelect.props.onChange({ target: { value: 'anime' } });
  buttonIn(tree, '1K').props.onClick();
  tree = fixture.render(fixture.props);
  assert.equal(elementsIn(tree).find(element => element.type === 'select').props.value, 'anime');
  assert.ok(buttonIn(tree, 'Generate (1 Credits)'));
  buttonIn(tree, 'Alpine Mountain Lake').props.onClick();
  tree = fixture.render(fixture.props);
  assert.equal(elementsIn(tree).find(element => element.type === 'select').props.value, 'nature');
  assert.ok(elementsIn(tree).find(element => element.type === 'textarea').props.value.includes('alpine'));
  tree = fixture.render({ ...fixture.props, currentPanoramaUrl: 'generated-result' });
  assert.equal(elementsIn(tree).find(element => element.type === 'sphere-preview').props.textureUrl, 'generated-result');
});

test('prompt library labels procedural demos honestly and preserves category filtering and demo loading', testContext => {
  setGlobal(testContext, 'window', { scrollTo() {} });
  const generated = [];
  const selected = [];
  const harness = componentHarness('../src/components/commercial/ShowcaseGallery.tsx', 'ShowcaseGallery', {
    '../../utils/proceduralPanoramas': { generateProceduralPanorama: (...args) => {
      generated.push(args);
      return { toDataURL: () => 'procedural-demo' };
    } },
  });
  testContext.after(() => harness.unmount());
  const props = { onSelectPanorama: (...args) => selected.push(args) };
  let tree = harness.render(props);
  assert.ok(elementText(tree).includes('These are not AI-generated results'));
  assert.equal(elementsIn(tree).filter(element => element.type === 'h3').length, 6);
  assert.ok(!elementText(tree).includes('14.2k'));
  buttonIn(tree, 'Nature & Landscape').props.onClick();
  tree = harness.render(props);
  assert.equal(elementsIn(tree).filter(element => element.type === 'h3').length, 1);
  buttonIn(tree, 'Open demo').props.onClick();
  assert.equal(generated[0][0], 'nature');
  assert.equal(selected[0][0], 'procedural-demo');
  assert.equal(selected[0][2], 'nature');
});

test('pricing uses server totals and credit allowances, preserves the chosen interval and reflects live account props', async () => {
  const config = { enabled: true, mode: 'sandbox', plans: {
    pro: { monthly: { amountCents: 2345, credits: 2500 }, yearly: { amountCents: 20340, credits: 30000 } },
    enterprise: { monthly: { amountCents: 5500, credits: 6000 }, yearly: { amountCents: 52800, credits: 72000 } },
  } };
  const selections = [];
  const harness = componentHarness('../src/components/PricingTab.tsx', 'PricingTab', {
    '../utils/commercialApi': { paypalRequest: async route => { assert.equal(route, 'config'); return config; } },
  });
  const props = { currentUser: accountFixture('usr_guest_test'), billingConfig: { ...adminStorage.DEFAULT_BILLING_CONFIG, freeMonthlyCredits: 7 }, onChoosePlan: (...args) => selections.push(args), onOpenStudio() {} };
  harness.render(props);
  await flushPromises();
  let tree = harness.render(props);
  assert.ok(elementText(tree).includes('$23.45'));
  assert.ok(elementText(tree).includes('2,500 credits per monthly payment'));
  assert.ok(elementText(tree).includes('7 starter credits'));
  assert.ok(!elementText(tree).includes('Signed in as'));
  assert.ok(!elementText(tree).includes('Save 50%'));
  buttonIn(tree, 'Sign in to choose Pro').props.onClick();
  assert.deepEqual(selections.pop(), ['pro', 'monthly']);
  buttonIn(tree, 'Annual billing').props.onClick();
  tree = harness.render(props);
  assert.ok(elementText(tree).includes('$203.40 charged once each year'));
  assert.ok(elementText(tree).includes('30,000 credits per annual payment'));
  assert.ok(elementText(tree).includes('Save 28%'));
  buttonIn(tree, 'Sign in to choose Pro').props.onClick();
  assert.deepEqual(selections.pop(), ['pro', 'yearly']);
  tree = harness.render({ ...props, currentUser: { ...accountFixture(), plan: 'pro', creditsBalance: 2504 } });
  assert.ok(elementText(tree).includes('2,504 credits available'));
  assert.ok(elementText(tree).includes('Current access'));
  assert.ok(!elementText(tree).includes('Sign in to choose'));
  harness.unmount();
});

test('pricing disables paid CTAs on a config failure and never displays invented prices', async () => {
  const harness = componentHarness('../src/components/PricingTab.tsx', 'PricingTab', {
    '../utils/commercialApi': { paypalRequest: async () => { throw new Error('Pricing unavailable'); } },
  });
  const props = { currentUser: accountFixture(), billingConfig: adminStorage.DEFAULT_BILLING_CONFIG, onChoosePlan: () => assert.fail('Unavailable pricing must not start checkout'), onOpenStudio() {} };
  harness.render(props);
  await flushPromises();
  const tree = harness.render(props);
  assert.ok(elementText(tree).includes('Pricing unavailable'));
  assert.equal(buttonIn(tree, 'Choose Pro').props.disabled, true);
  assert.ok(!elementText(tree).includes('$19'));
  assert.equal(buttonIn(tree, 'Open free tools').props.disabled, undefined);
  harness.unmount();
});

test('auth dialog stays English, uses configured trial credits and ignores a late response after close', async testContext => {
  setGlobal(testContext, 'localStorage', memoryStorage());
  setGlobal(testContext, 'document', { activeElement: { focus() {} } });
  let finish;
  let successes = 0;
  let closed = 0;
  const harness = componentHarness('../src/components/commercial/UserAuthModal.tsx', 'UserAuthModal', {
    '../../utils/commercialApi': { authServerUser: async (email, name, password, options) => {
      assert.equal(options.mode, 'login');
      return new Promise(resolve => { finish = resolve; });
    } },
  });
  const props = { isOpen: true, currentUser: accountFixture('usr_guest_test'), trialCredits: 9, onClose: () => closed++, onAuthSuccess: () => successes++ };
  const render = () => harness.render(props, tree => { tree.props.ref.current = { showModal() {}, close() {} }; });
  let tree = render();
  assert.equal(tree.type, 'dialog');
  assert.ok(!elementText(tree).includes('9 starter credits'), 'Sign-in must not imply it grants new trial credits');
  buttonIn(tree, 'Create account').props.onClick();
  tree = render();
  assert.ok(elementText(tree).includes('Date of birth'));
  assert.ok(!elementsIn(tree).some(element => element.props.id === 'auth-email'));
  buttonIn(tree, 'Sign in').props.onClick();
  tree = render();
  assert.ok(!/\p{Script=Han}/u.test(elementText(tree)));
  elementsIn(tree).find(element => element.props.id === 'auth-email').props.onChange({ target: { value: 'flow@example.test' } });
  elementsIn(tree).find(element => element.props.id === 'auth-password').props.onChange({ target: { value: 'synthetic-password' } });
  tree = render();
  const pending = elementsIn(tree).find(element => element.type === 'form').props.onSubmit({ preventDefault() {} });
  elementsIn(render()).find(element => element.props['aria-label'] === 'Close account dialog').props.onClick();
  finish({ success: true, user: accountFixture() });
  await pending;
  assert.equal(successes, 0);
  assert.equal(closed, 1);
  harness.unmount();
});

function authDialogHarness(testContext, props = {}, api = {}) {
  setGlobal(testContext, 'requestAnimationFrame', callback => callback());
  setGlobal(testContext, 'localStorage', memoryStorage());
  setGlobal(testContext, 'document', { activeElement: { focus() {} } });
  setGlobal(testContext, 'window', new EventTarget());
  const harness = componentHarness('../src/components/commercial/UserAuthModal.tsx', 'UserAuthModal', {
    '../../utils/commercialApi': { ...commercialApi, fetchAuthConfiguration: async () => ({ registrationAvailable: true, turnstileSiteKey: 'synthetic-site' }), ...api },
  });
  const defaults = { isOpen: true, initialMode: 'register', currentUser: accountFixture('usr_guest_preview'), onClose() {}, onAuthSuccess() {}, ...props };
  return {
    render: overrides => harness.render({ ...defaults, ...overrides }, tree => { if (tree) tree.props.ref.current = { showModal() {}, close() {} }; }),
    unmount: () => harness.unmount(),
  };
}

function completeAgeScreen(fixture) {
  let tree = fixture.render();
  elementsIn(tree).find(element => element.props.id === 'auth-birth-date').props.onChange({ target: { value: '1990-01-01' } });
  tree = fixture.render();
  elementsIn(tree).find(element => element.type === 'form').props.onSubmit({ preventDefault() {} });
  return fixture.render();
}

test('registration allows blank optional name, trims email and reports successful registration intent', async testContext => {
  let result;
  let closes = 0;
  const fixture = authDialogHarness(testContext, { onAuthSuccess: (...args) => { result = args; }, onClose: () => closes++ }, {
    authServerUser: async (email, name, password, options) => {
      assert.equal(email, 'new@example.test');
      assert.equal(name, undefined);
      assert.equal(password, 'test-password');
      assert.equal(options.mode, 'register');
      return { success: true, user: accountFixture() };
    },
  });
  let tree = fixture.render();
  await flushPromises();
  tree = completeAgeScreen(fixture);
  elementsIn(tree).find(element => element.type === 'verification-challenge').props.onToken('synthetic-proof');
  tree = fixture.render();
  const field = id => elementsIn(tree).find(element => element.props.id === id);
  assert.equal(field('auth-name').props.required, undefined);
  field('auth-email').props.onChange({ target: { value: ' new@example.test ' } });
  field('auth-password').props.onChange({ target: { value: 'test-password' } });
  tree = fixture.render();
  await elementsIn(tree).find(element => element.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(result[1], 'register');
  assert.equal(result[0].id, accountFixture().id);
  assert.equal(closes, 0);
  assert.equal(elementsIn(fixture.render()).find(element => element.props.id === 'auth-birth-date').props.value, '');
  fixture.unmount();
});

test('show-password control preserves value and mode switching conceals and clears passwords', testContext => {
  const fixture = authDialogHarness(testContext);
  let tree = completeAgeScreen(fixture);
  elementsIn(tree).find(element => element.props.id === 'auth-password').props.onChange({ target: { value: 'not-a-real-password' } });
  buttonIn(tree, 'Show').props.onClick();
  tree = fixture.render();
  let password = elementsIn(tree).find(element => element.props.id === 'auth-password');
  assert.equal(password.props.type, 'text');
  assert.equal(password.props.value, 'not-a-real-password');
  assert.equal(buttonIn(tree, 'Hide').props.type, 'button');
  buttonIn(tree, 'Sign in').props.onClick();
  tree = fixture.render();
  password = elementsIn(tree).find(element => element.props.id === 'auth-password');
  assert.equal(password.props.type, 'password');
  assert.equal(password.props.value, '');
  assert.equal(password.props.autoComplete, 'current-password');
  assert.ok(!elementText(tree).includes('starter credits'));
  assert.ok(elementText(tree).includes('password reset is not available yet'));
  assert.equal(elementsIn(tree).some(element => element.type === 'a' && /forgot|reset/.test(element.props.href || '')), false);
  fixture.unmount();
});

for (const result of ['success', 'error']) {
  test(`auth selected plan summary ${result} preserves the annual intent without starting checkout`, async testContext => {
    const fixture = authDialogHarness(testContext, { continueToCheckout: true, checkoutIntent: { plan: 'enterprise', cycle: 'yearly' } }, {
      paypalRequest: async (route, body) => {
        assert.equal(route, 'config');
        assert.equal(body, undefined);
        if (result === 'error') throw new Error('Temporary config outage');
        return { enabled: true, plans: { enterprise: { yearly: { amountCents: 34800, credits: 60000 } } } };
      },
    });
    fixture.render();
    await flushPromises();
    const tree = completeAgeScreen(fixture);
    const text = elementText(tree);
    assert.ok(text.includes('Studio · Annual billing'));
    assert.ok(text.includes('No payment is taken'));
    assert.ok(text.includes('Create account & continue'));
    if (result === 'success') assert.ok(text.includes('$348.00 USD charged each year · 60,000 credits'));
    else { assert.ok(text.includes('Price will be confirmed in checkout')); assert.ok(!text.includes('$348')); }
    fixture.unmount();
  });
}

test('account creation feedback uses actual balance and guest logout does not show a registration success', () => {
  const notices = [];
  const context = { pendingCheckout: null, updateCurrentUser() {}, setAuthNotice: value => notices.push(value) };
  const action = callbackWithContext(sourceCallback('../src/App.tsx', 'handleAuthSuccess'), context);
  action({ ...accountFixture(), creditsBalance: 7 }, 'register');
  assert.deepEqual(notices, ['register']);
  const source = ts.createSourceFile('App.tsx', fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let notice;
  const visit = node => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      && node.left.getText(source) === 'authNotice' && ts.isJsxElement(node.right)) notice = node.right;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(notice, 'exercise the actual notice rendered by App');
  const code = ts.transpileModule(`const notice = ${notice.getText(source)};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 },
  }).outputText;
  const renderNotice = new Function('authNotice', 'currentUser', 't', 'require', 'exports', code + '\nreturn notice;');
  const tree = renderNotice('register', { ...accountFixture(), creditsBalance: 7 }, text => text,
    createRequire(import.meta.url), {});
  assert.ok(elementText(tree).includes('Account created. Verify your email to receive starter credits.'));
  action(accountFixture('usr_guest_preview'));
  assert.equal(notices.length, 1);
});

for (const backend of ['Node', 'D1']) {
  test(`${backend}: registration without a display name remains supported and guest balance is not silently merged`, async testContext => {
    const fixture = await withBackend(testContext, backend);
    const guest = { data: { token: fixture.token, user: { id: (await fixture.profile()).id } } };
    const response = await fixture.call('user/auth', { email: 'optional-name@example.test', password: 'test-password', mode: 'register' }, guest.data.token);
    assert.equal(response.status, 200);
    assert.equal(response.data.user.name, 'optional-name');
    assert.notEqual(response.data.user.id, guest.data.user.id);
    assert.equal(response.data.user.creditsBalance, 0);
  });
}

test('cubemap tool returns uploads and generated presets to shared studio state', testContext => {
  const CubemapTab = () => null;
  const harness = componentHarness('../src/components/landing/CubemapGeneratorPage.tsx', 'CubemapGeneratorPage', {
    '../CubemapTab': { CubemapTab },
    '../../utils/proceduralPanoramas': {
      generateProceduralPanorama: (style, prompt, width, height) => {
        assert.equal(style, 'space');
        assert.equal(width, 2048);
        assert.equal(height, 1024);
        return { toDataURL: () => 'data:image/jpeg;base64,SAMPLE' };
      },
    },
  });
  let uploaded;
  setGlobal(testContext, 'FileReader', class {
    readAsDataURL() { this.onload({ target: { result: 'data:image/png;base64,UPLOAD' } }); }
  });
  const props = { currentPanoramaUrl: 'data:image/png;base64,SUNSET', onPanoramaChange: url => { uploaded = url; }, onLaunchStudio() {} };
  const tree = harness.render(props);
  assert.equal(elementsIn(tree).find(element => element.type === CubemapTab).props.currentPanoramaUrl, props.currentPanoramaUrl);
  elementsIn(tree).find(element => element.type === 'input' && element.props.type === 'file')
    .props.onChange({ target: { files: [{}] } });
  assert.equal(uploaded, 'data:image/png;base64,UPLOAD');
  buttonIn(tree, 'Cosmic Nebula').props.onClick();
  assert.equal(uploaded, 'data:image/jpeg;base64,SAMPLE');
});

test('showcase video renders the shared panorama at the square default', async testContext => {
  let request;
  testContext.mock.method(URL, 'createObjectURL', () => 'blob:showcase');
  testContext.mock.method(URL, 'revokeObjectURL', () => {});
  const harness = componentHarness('../src/components/landing/PhotoToVideoPage.tsx', 'PhotoToVideoPage', {
    '../../utils/videoRecorder': { renderPanoramaToVideoBlob: async (source, options) => {
      request = { source, options };
      return new Blob(['video'], { type: 'video/webm' });
    } },
  });
  testContext.after(() => harness.unmount());
  const tree = harness.render({ showcaseMode: true, currentPanoramaUrl: 'shared-showroom', onLaunchStudio() {}, onPanoramaChange() {} });
  await buttonIn(tree, 'Start 360° Video Render').props.onClick();
  assert.equal(request.source, 'shared-showroom');
  assert.equal(request.options.width, 1080);
  assert.equal(request.options.height, 1080);
  assert.match(elementText(tree), /does not reconstruct product angles/);
});

for (const [exportName, relativePath, renderButton] of [
  ['PhotoToVideoModal', '../src/components/commercial/PhotoToVideoModal.tsx', 'Render 360° Video'],
  ['PhotoToVideoPage', '../src/components/landing/PhotoToVideoPage.tsx', 'Start 360° Video Render'],
]) {
  test(`${exportName}: output matches source/options, including changes during rendering`, async testContext => {
    const pending = [];
    const revoked = [];
    const downloads = [];
    let created = 0;
    testContext.mock.method(URL, 'createObjectURL', () => `blob:test-${++created}`);
    testContext.mock.method(URL, 'revokeObjectURL', url => revoked.push(url));
    setGlobal(testContext, 'document', {
      createElement: () => ({ click() { downloads.push({ href: this.href, name: this.download }); } }),
      body: { appendChild() {}, removeChild() {} },
    });
    const harness = componentHarness(relativePath, exportName, {
      '../../utils/videoRecorder': { renderPanoramaToVideoBlob: (source, options) => new Promise(resolve => pending.push({ source, options, resolve })) },
    });
    testContext.after(() => harness.unmount());
    let props = { isOpen: true, currentPanoramaUrl: 'sunset', onClose() {}, onLaunchStudio() {}, onPanoramaChange() {} };
    let tree = harness.render(props);
    const first = buttonIn(tree, renderButton).props.onClick();
    assert.equal(pending[0].source, 'sunset');
    assert.equal(pending[0].options.width, 1920);
    tree = harness.render(props);
    buttonIn(tree, '9:16').props.onClick();
    tree = harness.render(props);
    pending[0].resolve(new Blob(['synthetic-video'], { type: 'video/mp4' }));
    await first;
    tree = harness.render(props);
    assert.equal(elementText(tree).includes('Render Complete'), false);
    assert.equal(elementsIn(tree).some(element => element.type === 'button' && elementText(element).includes('Download Video')), false);
    const second = buttonIn(tree, renderButton).props.onClick();
    tree = harness.render(props);
    assert.deepEqual(revoked, ['blob:test-1']);
    assert.equal(pending[1].options.width, 1080);
    assert.equal(pending[1].options.height, 1920);
    pending[1].resolve(new Blob(['synthetic-video'], { type: 'video/mp4' }));
    await second;
    tree = harness.render(props);
    buttonIn(tree, 'Download Video').props.onClick();
    assert.equal(downloads[0].href, 'blob:test-2');
    assert.ok(downloads[0].name.endsWith('9x16.mp4'));
    buttonIn(tree, '6s').props.onClick();
    tree = harness.render(props);
    assert.equal(elementText(tree).includes('Download Video'), false);
    buttonIn(tree, '8s').props.onClick();
    tree = harness.render(props);
    const tilt = elementsIn(tree).find(element => element.type === 'input' && element.props.type === 'checkbox');
    tilt.props.onChange({ target: { checked: false } });
    tree = harness.render(props);
    assert.equal(elementText(tree).includes('Download Video'), false);
    tilt.props.onChange({ target: { checked: true } });
    tree = harness.render(props);
    props = { ...props, currentPanoramaUrl: 'new-panorama' };
    tree = harness.render(props);
    assert.equal(elementText(tree).includes('Download Video'), false);
    const third = buttonIn(tree, renderButton).props.onClick();
    harness.render(props);
    if (exportName === 'PhotoToVideoModal') harness.render({ ...props, isOpen: false });
    else harness.unmount();
    pending[2].resolve(new Blob(['synthetic-video'], { type: 'video/mp4' }));
    await third;
    assert.equal(created, 2, 'Closing/unmounting during render must not create an orphan blob URL');
  });
}

test('embed preview and iframe share params; native dialog closes and restores focus', testContext => {
  let restored = 0;
  let opened = 0;
  let closed = 0;
  let cancelled = 0;
  setGlobal(testContext, 'window', { location: { origin: 'https://studio.example' } });
  setGlobal(testContext, 'document', { activeElement: { focus() { restored++; } } });
  const harness = componentHarness('../src/components/commercial/EmbedModal.tsx', 'EmbedModal');
  const props = { isOpen: true, currentPanoramaUrl: 'https://images.example/sunset.png?size=2k', onClose() { cancelled++; } };
  const dialog = { showModal() { opened++; }, close() { closed++; } };
  let tree = harness.render(props, tree => { tree.props.ref.current = dialog; });
  assert.equal(tree.type, 'dialog');
  assert.equal(opened, 1);
  const preview = elementsIn(tree).find(element => element.type === 'a' && elementText(element).includes('Test Preview'));
  const code = elementsIn(tree).find(element => element.type === 'code').props.children;
  assert.ok(code.includes(`src="${preview.props.href}"`));
  const params = new URL(preview.props.href).searchParams;
  assert.equal(params.get('autorotate'), '1');
  assert.equal(params.get('pano'), props.currentPanoramaUrl);
  buttonIn(tree, 'Enabled').props.onClick();
  tree = harness.render({ ...props, onClose() { cancelled++; } });
  assert.equal(opened, 1, 'Rerenders must not close/reopen the native dialog');
  const updatedPreview = elementsIn(tree).find(element => element.type === 'a' && elementText(element).includes('Test Preview'));
  assert.equal(new URL(updatedPreview.props.href).searchParams.has('autorotate'), false);
  let prevented = false;
  tree.props.onCancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(cancelled, 1);
  harness.render({ ...props, isOpen: false });
  assert.equal(closed, 1);
  assert.equal(restored, 1);
});

test('local and invalid panorama URLs cannot preview or copy an example embed', async t => {
  setGlobal(t, 'window', { location: { origin: 'https://studio.example' } });
  setGlobal(t, 'document', { activeElement: { focus() {} } });
  let copies = 0;
  setGlobal(t, 'navigator', { clipboard: { writeText: async () => { copies++; } } });
  const harness = componentHarness('../src/components/commercial/EmbedModal.tsx', 'EmbedModal');
  const attach = tree => { tree.props.ref.current = { showModal() {}, close() {} }; };
  for (const url of ['blob:https://studio.example/123', 'data:image/png;base64,AA==', '', 'https://']) {
    const tree = harness.render({ isOpen: true, currentPanoramaUrl: url, onClose() {} }, attach);
    assert.match(elementText(tree), /sharing dialog, create a share link/);
    assert.match(elementText(tree), /does not automatically connect/);
    assert.equal(elementsIn(tree).some(e => e.type === 'a' && elementText(e).includes('Test Preview')), false);
    assert.equal(elementsIn(tree).some(e => e.type === 'code'), false);
    const copy = buttonIn(tree, 'Copy Embed Code');
    assert.equal(copy.props.disabled, true);
    await copy.props.onClick();
  }
  assert.equal(copies, 0);
  harness.unmount();
});

test('created shares open embed options with the public image endpoint', async t => {
  const id = 'a'.repeat(32);
  setGlobal(t, 'window', { location: { origin: 'https://studio.example', pathname: '/' } });
  setGlobal(t, 'document', { activeElement: { focus() {} } });
  setGlobal(t, 'localStorage', { getItem: () => 'account-token' });
  setGlobal(t, 'navigator', { clipboard: { writeText: async () => {} } });
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    if (url === 'blob:local') return new Response(new Blob(['image'], { type: 'image/png' }));
    if (init.method === 'POST') return Response.json({ share: { id, title: 'My panorama', width: 2, height: 1, allowDownload: true, createdAt: Date.now() } });
    return Response.json({ shares: [] });
  });
  const EmbedModal = () => null;
  const harness = componentHarness('../src/components/commercial/SharePanorama.tsx', 'SharePanoramaModal', {
    '../SphereViewer': { SphereViewer() {} }, './EmbedModal': { EmbedModal },
    '../../utils/imageOptimizer': { preparePanoramaShare: async blob => ({ blob, width: 2, height: 1, compressed: false }) },
  });
  const attach = tree => { tree.props.ref.current = { showModal() {}, close() {} }; };
  const props = { isOpen: true, accountId: 'account', imageUrl: 'blob:local', onClose() {} };
  harness.render(props, attach);
  await flushPromises();
  let tree = harness.render(props, attach);
  await buttonIn(tree, 'Create share link').props.onClick();
  tree = harness.render(props, attach);
  buttonIn(tree, 'Embed code').props.onClick();
  tree = harness.render(props, attach);
  const modal = elementsIn(tree).find(e => e.type === EmbedModal);
  assert.equal(modal.props.isOpen, true);
  assert.equal(modal.props.currentPanoramaUrl, `https://studio.example/api/shares/${id}/image`);
  harness.unmount();
});

test('embed code preserves selected aspect ratios and full-width height', t => {
  setGlobal(t, 'window', { location: { origin: 'https://studio.example' } });
  setGlobal(t, 'document', { activeElement: { focus() {} } });
  const harness = componentHarness('../src/components/commercial/EmbedModal.tsx', 'EmbedModal');
  const props = { isOpen: true, currentPanoramaUrl: 'https://images.example/pano.jpg', onClose() {} };
  const attach = tree => { tree.props.ref.current = { showModal() {}, close() {} }; };
  const code = tree => elementsIn(tree).find(e => e.type === 'code').props.children;
  let tree = harness.render(props, attach);
  assert.match(code(tree), /width:100%;height:auto;aspect-ratio:16\/9/);
  buttonIn(tree, '4:3').props.onClick();
  tree = harness.render(props, attach);
  assert.match(code(tree), /width:100%;height:auto;aspect-ratio:4\/3/);
  buttonIn(tree, '100%').props.onClick();
  tree = harness.render(props, attach);
  assert.match(code(tree), /width:100%;height:450px/);
  harness.unmount();
});

test('embed viewer passes autoplay to SphereViewer without changing the texture', () => {
  const SphereViewer = () => null;
  const harness = componentHarness('../src/components/commercial/EmbedViewer.tsx', 'EmbedViewer', {
    '../SphereViewer': { SphereViewer },
  });
  const tree = harness.render({ textureUrl: 'sunset', autoRotate: true });
  const viewer = elementsIn(tree).find(element => element.type === SphereViewer);
  assert.equal(viewer.props.textureUrl, 'sunset');
  assert.equal(viewer.props.initialAutoRotate, true);
});

test('embed copy reports failures and only confirms the current code after clipboard success', async t => {
  setGlobal(t, 'window', { location: { origin: 'https://studio.example' } });
  setGlobal(t, 'document', { activeElement: { focus() {} } });
  let write = async () => { throw new Error('denied'); };
  setGlobal(t, 'navigator', { clipboard: { writeText: text => write(text) } });
  const harness = componentHarness('../src/components/commercial/EmbedModal.tsx', 'EmbedModal');
  const props = { isOpen: true, currentPanoramaUrl: 'https://images.example/a.png', onClose() {} };
  const attach = tree => { if (tree) tree.props.ref.current = { showModal() {}, close() {} }; };
  let tree = harness.render(props, attach);
  await buttonIn(tree, 'Copy Embed Code').props.onClick();
  tree = harness.render(props, attach);
  assert.match(elementText(tree), /Copy failed/);
  assert.doesNotMatch(elementText(tree), /Copied to Clipboard/);
  let copied = '';
  write = async text => { copied = text; };
  await buttonIn(tree, 'Copy Embed Code').props.onClick();
  tree = harness.render(props, attach);
  assert.match(elementText(tree), /Copied to Clipboard/);
  assert.match(copied, /images.example/);
  buttonIn(tree, '4:3').props.onClick();
  harness.render(props, attach);
  tree = harness.render(props, attach);
  assert.doesNotMatch(elementText(tree), /Copied to Clipboard/);
  setGlobal(t, 'navigator', {});
  await buttonIn(tree, 'Copy Embed Code').props.onClick();
  tree = harness.render(props, attach);
  assert.match(elementText(tree), /Copy failed/);
  harness.unmount();
});

test('viewer opens sharing for the current local image and account', t => {
  setGlobal(t, 'window', new EventTarget());
  setGlobal(t, 'Image', class {});
  const SharePanoramaModal = () => null;
  const harness = componentHarness('../src/components/ViewerTab.tsx', 'ViewerTab', {
    './commercial/SharePanorama': { SharePanoramaModal },
    './commercial/EmbedModal': { EmbedModal: () => null },
    './SphereViewer': { SphereViewer: () => null },
    '../utils/adminStorage': { getCurrentUser: () => ({ id: 'usr_fixture' }) },
    '../utils/proceduralPanoramas': { PRESET_PANORAMAS: [] },
    '../utils/imageOptimizer': {}, '../utils/seamHealer': {},
    '../utils/imageEnhancer': {}, '../utils/poleRepair': {},
  });
  const props = { currentPanoramaUrl: 'data:image/png;base64,AA==', onPanoramaChange() {}, onNavigateTab() {} };
  let tree = harness.render(props);
  buttonIn(tree, 'Share your panorama').props.onClick();
  tree = harness.render(props);
  const modal = elementsIn(tree).find(element => element.type === SharePanoramaModal);
  assert.equal(modal.props.isOpen, true);
  assert.equal(modal.props.imageUrl, props.currentPanoramaUrl);
  assert.equal(modal.props.accountId, 'usr_fixture');
  assert.match(elementText(tree), /publishing a share uploads a sharing copy/);
  harness.unmount();
});

test('viewer paste ignores open dialogs and editable fields while preserving normal image paste', t => {
  const win = new EventTarget();
  setGlobal(t, 'window', win);
  let dialogOpen = false;
  setGlobal(t, 'document', { querySelector: () => dialogOpen ? {} : null });
  setGlobal(t, 'Image', class {});
  setGlobal(t, 'Element', class { constructor(editable = false) { this.editable = editable; } closest() { return this.editable ? this : null; } });
  setGlobal(t, 'FileReader', class { readAsDataURL() { this.onload({ target: { result: 'data:image/png;base64,new' } }); } });
  const harness = componentHarness('../src/components/ViewerTab.tsx', 'ViewerTab', {
    './commercial/SharePanorama': { SharePanoramaModal: () => null }, './commercial/EmbedModal': { EmbedModal: () => null },
    './SphereViewer': { SphereViewer: () => null }, '../utils/adminStorage': { getCurrentUser: () => ({ id: 'user' }) },
    '../utils/proceduralPanoramas': { PRESET_PANORAMAS: [] }, '../utils/imageOptimizer': {}, '../utils/seamHealer': {},
    '../utils/imageEnhancer': {}, '../utils/poleRepair': {},
  });
  const changes = [];
  const props = { currentPanoramaUrl: 'data:image/png;base64,old', onPanoramaChange: url => changes.push(url), onNavigateTab() {} };
  let tree = harness.render(props);
  const paste = target => {
    const event = new Event('paste');
    Object.defineProperty(event, 'target', { value: target });
    Object.defineProperty(event, 'clipboardData', { value: { items: [{ type: 'image/png', getAsFile: () => ({}) }] } });
    win.dispatchEvent(event);
  };
  paste(new Element(true));
  dialogOpen = true; paste(new Element()); dialogOpen = false;
  buttonIn(tree, 'Embed').props.onClick();
  tree = harness.render(props); paste(new Element());
  const embed = elementsIn(tree).find(e => typeof e.type === 'function' && e.props.currentPanoramaUrl === props.currentPanoramaUrl && e.props.isOpen);
  embed.props.onClose();
  tree = harness.render(props);
  buttonIn(tree, 'Share your panorama').props.onClick();
  tree = harness.render(props); paste(new Element());
  const share = elementsIn(tree).find(e => typeof e.type === 'function' && e.props.accountId === 'user');
  share.props.onClose();
  tree = harness.render(props);
  buttonIn(tree, 'Add Hotspot').props.onClick();
  tree = harness.render(props); paste(new Element());
  assert.deepEqual(changes, []);
  buttonIn(tree, 'Cancel').props.onClick();
  harness.render(props); paste(new Element());
  assert.deepEqual(changes, ['data:image/png;base64,new']);
  harness.unmount();
});

test('viewer keyboard shortcuts only engage while the viewer is the interaction context', () => {
  const keysPressedRef = { current: {} };
  let rotating = false;
  const viewerTarget = { closest: () => null };
  const outsideTarget = { closest: () => null };
  const context = {
    keysPressedRef,
    setIsAutoRotating: update => { rotating = update(rotating); },
    isInteractiveTarget: callbackWithContext(sourceCallback('../src/components/SphereViewer.tsx', 'isInteractiveTarget'), {}),
    containerRef: { current: { contains: node => node === viewerTarget } },
    isPointerOverRef: { current: false },
  };
  const keyDown = callbackWithContext(sourceCallback('../src/components/SphereViewer.tsx', 'handleKeyDown'), context);
  const keyUp = callbackWithContext(sourceCallback('../src/components/SphereViewer.tsx', 'handleKeyUp'), context);
  let prevented = 0;
  const event = { code: 'Space', target: viewerTarget, preventDefault() { prevented++; } };
  keyDown({ ...event, target: { closest: () => ({ tagName: 'BUTTON' }) } });
  assert.equal(rotating, false);
  assert.equal(prevented, 0);
  keyDown({ ...event, target: outsideTarget });
  assert.equal(rotating, false, 'Keys pressed outside the viewer must fall through to the page');
  assert.equal(prevented, 0);
  context.isPointerOverRef.current = true;
  keyDown({ ...event, target: outsideTarget });
  assert.equal(rotating, true, 'Hovering the viewer keeps keyboard control');
  assert.equal(prevented, 1);
  context.isPointerOverRef.current = false;
  keyDown(event);
  assert.equal(rotating, false, 'Events inside the viewer stay handled');
  assert.equal(prevented, 2);
  keyDown({ ...event, repeat: true });
  assert.equal(rotating, false);
  keyDown({ ...event, code: 'ArrowLeft' });
  assert.equal(keysPressedRef.current.ArrowLeft, true);
  keyUp({ ...event, code: 'ArrowLeft', target: { isContentEditable: true } });
  assert.equal(keysPressedRef.current.ArrowLeft, false);
  keyDown({ ...event, ctrlKey: true });
  assert.equal(prevented, 4, 'Modifier chords are never swallowed');
  callbackWithContext(sourceCallback('../src/components/SphereViewer.tsx', 'handleBlur'), context)();
  assert.deepEqual(keysPressedRef.current, {});
});

test('D1: guest trial minting remains disabled across edge isolates', async testContext => {
  const database = new DatabaseSync(':memory:');
  const db = sqliteD1(database);
  testContext.after(() => database.close());
  const mint = () => onRequest({
    request: new Request('https://review.example/api/user/guest', { method: 'POST' }),
    env: { DB: db },
  });
  assert.equal((await mint()).status, 403);
  __resetEdgeRateLimits(); // A new edge isolate cannot renew the D1 allowance.
  assert.equal((await mint()).status, 403);
});

test('D1: repeated failed sign-ins trip the user auth limiter', async testContext => {
  const database = new DatabaseSync(':memory:');
  const db = sqliteD1(database);
  testContext.after(() => database.close());
  const attemptSignIn = () => onRequest({
    request: new Request('https://review.example/api/user/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.test', password: 'synthetic-password', mode: 'login' }),
    }),
    env: { DB: db },
  });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal((await attemptSignIn()).status, 401);
  }
  assert.equal((await attemptSignIn()).status, 429);
});

test('PayPal checkout reads server prices, has no local card form, and redirects only to PayPal', async testContext => {
  const calls = [];
  const destinations = [];
  const config = { enabled: true, mode: 'sandbox', plans: {
    pro: { monthly: { amountCents: 1900, credits: 1000 }, yearly: { amountCents: 11880, credits: 12000 } },
    enterprise: { monthly: { amountCents: 4900, credits: 5000 }, yearly: { amountCents: 34800, credits: 60000 } },
  } };
  setGlobal(testContext, 'localStorage', memoryStorage());
  setGlobal(testContext, 'window', { location: { search: '?paypal=return', assign: url => destinations.push(url) }, addEventListener() {}, removeEventListener() {} });
  localStorage.setItem('panorama_server_user_token', 'account-token');
  setGlobal(testContext, 'document', { activeElement: { focus() {} } });
  const harness = componentHarness('../src/components/commercial/CheckoutModal.tsx', 'CheckoutModal', {
    '../../utils/commercialApi': { paypalRequest: async (route, body) => {
      calls.push({ route, body });
      if (route === 'config') return config;
      if (route === 'subscription') return { subscription: null };
      if (route === 'create-subscription') return { approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=SYNTHETIC' };
      throw new Error('Unexpected route');
    } },
  });
  const props = { isOpen: true, initialPlan: 'pro', initialCycle: 'yearly', currentUser: accountFixture(), onClose() {} };
  let tree = harness.render(props, tree => { tree.props.ref.current = { showModal() {}, close() {} }; });
  assert.equal(buttonIn(tree, 'Subscribe with PayPal').props.disabled, true);
  await flushPromises();
  tree = harness.render(props);
  assert.ok(elementText(tree).includes('$118.80 USD / year'));
  assert.ok(elementText(tree).includes('12,000 credits'));
  const terms = elementsIn(tree).find(element => element.props.id === 'checkout-renewal-terms');
  const disclosure = renderToStaticMarkup(terms);
  assert.ok(disclosure.includes('$118.80 USD each year. Automatically renews until cancelled.'));
  assert.ok(disclosure.includes('Cancel before your next billing date'));
  assert.equal(buttonIn(tree, 'Subscribe with PayPal').props['aria-describedby'], 'checkout-renewal-terms');
  assert.ok(elementText(tree).includes('Approval is not a payment receipt'));
  assert.equal(elementsIn(tree).filter(element => element.type === 'input').every(input => input.props.type === 'radio'), true);
  await buttonIn(tree, 'Subscribe with PayPal').props.onClick();
  assert.deepEqual(calls.at(-1), { route: 'create-subscription', body: { plan: 'pro', billingCycle: 'yearly' } });
  assert.equal(destinations.length, 1);
  harness.unmount();
});

test('PayPal checkout rejects a hostile approval URL and never fabricates payment completion', async () => {
  let error;
  let redirected = false;
  const handler = callbackWithContext(sourceCallback('../src/components/commercial/CheckoutModal.tsx', 'handleSubscribe'), {
    isProcessing: false, selectedPlan: 'pro', billingCycle: 'monthly', setIsProcessing() {}, setError: value => { error = value; },
    needsSignIn: false,
    sessionRef: { current: { active: true, token: 'owner' } }, isCurrentSession: () => true,
    paypalRequest: async () => ({ approvalUrl: 'https://payments.attacker.example/checkout' }),
    window: { location: { assign() { redirected = true; } } },
  });
  await handler();
  assert.equal(redirected, false);
  assert.equal(error, 'Invalid PayPal approval URL');
});

test('PayPal requests reject changed accounts before fetching and retain the captured bearer token', async testContext => {
  const storage = memoryStorage();
  storage.setItem('panorama_server_user_token', 'account-A');
  setGlobal(testContext, 'localStorage', storage);
  const requests = [];
  testContext.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(options);
    return Response.json({ success: true });
  });
  await commercialApi.paypalRequest('subscription', undefined, 'account-A');
  assert.equal(requests[0].headers.Authorization, 'Bearer account-A');
  storage.setItem('panorama_server_user_token', 'account-B');
  await assert.rejects(commercialApi.paypalRequest('cancel-subscription', { subscriptionId: 'local-A' }, 'account-A'), /Account changed/);
  await assert.rejects(commercialApi.paypalRequest('create-subscription', {}, null), /Account changed/);
  assert.equal(requests.length, 1);
});

function checkoutHarness(testContext, request, overrides = {}) {
  const storage = memoryStorage();
  storage.setItem('panorama_server_user_token', 'account-A');
  setGlobal(testContext, 'localStorage', storage);
  setGlobal(testContext, 'document', { activeElement: { focus() {} } });
  const destinations = [];
  const browser = Object.assign(new EventTarget(), { location: { search: '', assign: url => destinations.push(url) }, confirm: () => true });
  setGlobal(testContext, 'window', browser);
  const calls = [];
  const config = { enabled: true, mode: 'sandbox', plans: {
    pro: { monthly: { amountCents: 1900, credits: 1000 }, yearly: { amountCents: 11880, credits: 12000 } },
    enterprise: { monthly: { amountCents: 4900, credits: 5000 }, yearly: { amountCents: 34800, credits: 60000 } },
  } };
  const harness = componentHarness('../src/components/commercial/CheckoutModal.tsx', 'CheckoutModal', {
    '../../utils/commercialApi': { paypalRequest: async (route, body, token) => {
      calls.push({ route, body, token });
      return route === 'config' ? config : request(route, body, token);
    } },
  });
  const props = { isOpen: true, currentUser: accountFixture(), onClose() {}, ...overrides };
  const render = () => harness.render(props, tree => { tree.props.ref.current = { showModal() {}, close() {} }; });
  render();
  testContext.after(() => harness.unmount());
  return { storage, browser, calls, destinations, props, render, harness };
}

test('checkout cannot continue a pending approval without its stored amount', async testContext => {
  const fixture = checkoutHarness(testContext, async () => ({ subscription: {
    id: 'local-missing-amount', plan: 'pro', billingCycle: 'monthly', status: 'APPROVAL_PENDING',
  } }));
  await flushPromises();
  const tree = fixture.render();
  assert.equal(buttonIn(tree, 'Continue PayPal approval').props.disabled, true);
  assert.ok(elementText(tree).includes('Pricing is unavailable. Please try again.'));
});

test('guest checkout presents sign-in without fetching or creating a subscription', async testContext => {
  let signIns = 0;
  const fixture = checkoutHarness(testContext, () => assert.fail('Guests must not call subscription endpoints'), {
    currentUser: accountFixture('usr_guest_preview'), onSignIn: () => signIns++,
  });
  await flushPromises();
  const tree = fixture.render();
  assert.ok(elementText(tree).includes('Sign in or create a permanent account'));
  await buttonIn(tree, 'Sign in to continue').props.onClick();
  assert.equal(signIns, 1);
  assert.deepEqual(fixture.calls.map(call => call.route), ['config']);
});

for (const [status, explanation] of [['ACTIVE', 'You do not need to subscribe again'], ['APPROVED', 'Waiting for payment confirmation'], ['SUSPENDED', 'PayPal has paused this subscription']]) {
  test(`checkout ${status} shows its actual next action instead of a duplicate-subscribe button`, async testContext => {
    const fixture = checkoutHarness(testContext, async () => ({ subscription: { id: 'subscription-A', plan: 'pro', billingCycle: 'monthly', status } }));
    await flushPromises();
    const tree = fixture.render();
    assert.ok(elementText(tree).includes(explanation));
    assert.equal(elementsIn(tree).some(element => element.type === 'button' && /Subscribe with PayPal|Continue PayPal approval/.test(elementText(element))), false);
    assert.ok(buttonIn(tree, 'Refresh status'));
    assert.equal(fixture.calls.length, 2);
  });
}

test('checkout resumes the saved monthly plan instead of the yearly default', async testContext => {
  const fixture = checkoutHarness(testContext, async route => route === 'subscription'
    ? { subscription: { id: 'local-A', plan: 'enterprise', billingCycle: 'monthly', amountCents: 3200, status: 'APPROVAL_PENDING' } }
    : { approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=TEST' });
  assert.equal(buttonIn(fixture.render(), 'Subscribe with PayPal').props.disabled, true);
  await flushPromises();
  const tree = fixture.render();
  assert.equal(elementsIn(tree).some(element => element.type === 'fieldset'), false);
  assert.ok(elementText(tree).includes('ENTERPRISE · monthly · APPROVAL_PENDING'));
  const disclosure = renderToStaticMarkup(elementsIn(tree).find(element => element.props.id === 'checkout-renewal-terms'));
  assert.ok(disclosure.includes('$32.00 USD each month'), 'saved approval terms must use the stored charge, not the $49 catalog offer');
  assert.equal(buttonIn(tree, 'Continue PayPal approval').props.disabled, false);
  await buttonIn(tree, 'Continue PayPal approval').props.onClick();
  assert.deepEqual(fixture.calls.at(-1), { route: 'create-subscription', body: { plan: 'enterprise', billingCycle: 'monthly' }, token: 'account-A' });
  assert.equal(fixture.destinations.length, 1);
});

test('checkout discards a subscription response from the previous account', async testContext => {
  let finish;
  const fixture = checkoutHarness(testContext, () => new Promise(resolve => { finish = resolve; }));
  await flushPromises();
  fixture.storage.setItem('panorama_server_user_token', 'account-B');
  finish({ subscription: { id: 'local-A', plan: 'enterprise', billingCycle: 'yearly', status: 'ACTIVE' } });
  await flushPromises();
  const tree = fixture.render();
  assert.equal(elementText(tree).includes('ENTERPRISE · yearly · ACTIVE'), false);
  assert.ok(elementText(tree).includes('Account changed'));
  assert.equal(buttonIn(tree, 'Subscribe with PayPal').props.disabled, true);
  assert.equal(fixture.calls.length, 2);
});

test('checkout binds cancellation to the displayed subscription and blocks a stale account action', async testContext => {
  const fixture = checkoutHarness(testContext, async () => ({ subscription: { id: 'local-A', plan: 'pro', billingCycle: 'monthly', status: 'ACTIVE' } }));
  await flushPromises();
  await buttonIn(fixture.render(), 'Cancel automatic renewal').props.onClick();
  assert.deepEqual(fixture.calls.find(call => call.route === 'cancel-subscription'), {
    route: 'cancel-subscription', body: { subscriptionId: 'local-A' }, token: 'account-A',
  });
  const staleButton = buttonIn(fixture.render(), 'Cancel automatic renewal');
  const count = fixture.calls.length;
  fixture.storage.setItem('panorama_server_user_token', 'account-B');
  await staleButton.props.onClick();
  assert.equal(fixture.calls.length, count);
  fixture.browser.dispatchEvent(new Event('focus'));
  assert.equal(elementText(fixture.render()).includes('PRO · monthly · ACTIVE'), false);
  assert.equal(buttonIn(fixture.render(), 'Subscribe with PayPal').props.disabled, true);
});

test('checkout never redirects a late approval response after an account switch or dialog close', async testContext => {
  let finish;
  const fixture = checkoutHarness(testContext, route => route === 'subscription' ? { subscription: null } : new Promise(resolve => { finish = resolve; }));
  await flushPromises();
  const action = buttonIn(fixture.render(), 'Subscribe with PayPal').props.onClick();
  fixture.storage.setItem('panorama_server_user_token', 'account-B');
  fixture.harness.render({ ...fixture.props, isOpen: false });
  finish({ approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=OLD' });
  await action;
  assert.deepEqual(fixture.destinations, []);
});

for (const operation of ['upscale', 'heal', 'export', 'context', 'context2K', 'context4K', 'success']) {
  test(`generator ${operation}: postprocessing settles and requests authoritative profile refresh`, async testContext => {
    const raw = 'data:image/png;base64,RAW';
    const user = { id: 'owner', plan: 'pro', status: 'active', creditsBalance: 10 };
    const state = {};
    const canvas = { getContext: () => operation.startsWith('context') ? null : { drawImage() {} }, toDataURL: () => {
      if (operation === 'export') throw new Error('Tainted canvas');
      return 'data:image/png;base64,ENHANCED';
    } };
    setGlobal(testContext, 'document', { createElement: () => canvas });
    const context = {
    generationRef: { current: { mounted: true, request: 0 } }, originalOwner: { current: null },
      window: { dispatchEvent: event => { state.refresh = event.type; } },
      currentUser: user, localStorage: { getItem: () => 'owner-token' }, creditsCost: 2,
      resolution: operation === 'context' ? '1K' : operation === 'context4K' ? '4K' : '2K', seamCorrection: true,
      prompt: 'Synthetic', selectedStyle: 'test', referenceImages: [], STYLE_PRESETS: [],
      getModelExecutionPipeline: () => ({ mode: 'single', endpoints: [{ id: 'test', name: 'Test' }] }),
      buildPanoramaPrompt: prompt => prompt,
      inspectImageResolution,
      generateWithGemini: async () => ({ imageUrl: raw, remainingCredits: 8, creditsDeducted: 2 }),
      processPanoramaImage: async (url, options, healSeam, signal) => {
        assert.equal(url, raw);
        assert.equal(options.resolution, context.resolution);
        assert.equal(healSeam, true);
        assert.equal(signal.aborted, false);
        const enhanced = context.enhanceAndUpscalePanorama({ width: 16, height: 8 }, options);
        return context.healPanoramaSeam(enhanced).toDataURL('image/png');
      },
      Image: class { set src(value) { queueMicrotask(() => this.onload()); } },
      document: { createElement: () => canvas },
      enhanceAndUpscalePanorama: operation.startsWith('context')
        ? loadTsModule('../src/utils/imageEnhancer.ts').enhanceAndUpscalePanorama
        : () => { if (operation === 'upscale') throw new Error('Out of memory'); return canvas; },
      healPanoramaSeam: () => { if (operation === 'heal') throw new Error('Canvas unavailable'); return canvas; },
      getCurrentUser: () => user,
      deductCurrentUserCredits: () => assert.fail('Must not double-charge a server result'),
      onPanoramaChange: value => { state.panorama = value; }, onUserChange: value => { state.user = value; },
      setIsGenerating: value => { state.generating = value; }, setApiError: value => { state.error = value; },
      setGenerationStage: value => { state.stage = value; }, setGenerationElapsed() {},
      setGenerationTiming: value => { state.timing = value; }, setOriginalRawUrl() {}, setWorkPrompt() {}, setSaveStatus() {}, setResultQuality() {}, setEnhanced4kUrl() {},
      setFeedbackNotice() {}, setIsCheckoutOpen() {}, setTimeout: () => 0, confetti() {},
    };
    const generate = callbackWithContext(sourceCallback('../src/components/GeneratorTab.tsx', 'handleGenerate'), context);
    await generate();
    assert.equal(state.panorama, operation === 'success' ? 'data:image/png;base64,ENHANCED' : raw);
    assert.equal(state.user, undefined, 'Never write a captured profile or debit twice');
    assert.equal(state.refresh, 'panorama-user-refresh');
    assert.equal(state.generating, false);
    assert.equal(state.stage, 'Updating panorama preview');
    assert.ok(state.timing.includes('Model/network'));
    assert.equal(state.timing.includes('original image preserved'), operation !== 'success');
    assert.equal(state.error, null);
  });
}

test('logout returns to zero-credit anonymous browsing without minting a guest token', async testContext => {
  let guestCalls = 0;
  const harness = appHarness(testContext, {
    initServerGuestUser: () => { guestCalls++; },
    fetchServerUser: async () => ({ success: false }),
  });
  const browser = new EventTarget(); setGlobal(testContext, 'window', browser);
  localStorage.setItem('panorama_server_user_token', 'account-token');
  harness.context.updateCurrentUser(accountFixture());
  const cleanup = harness.effect(); testContext.after(cleanup);
  const logout = callbackWithContext(sourceCallback('../src/components/commercial/UserAuthModal.tsx', 'handleLogout'), {
    onAuthSuccess: harness.context.updateCurrentUser, onClose() {},
  });
  logout(); await flushPromises();
  assert.equal(guestCalls, 0);
  assert.equal(localStorage.getItem('panorama_server_user_token'), null);
  assert.equal(harness.state.user.id, 'usr_guest');
  assert.equal(harness.state.user.creditsBalance, 0);
});

for (const nextToken of [null, 'other-account-token']) {
  test(`session change to ${nextToken ?? 'guest'} clears only a private global preview`, async t => {
    const browser = new EventTarget();
    const harness = appHarness(t, { fetchServerUser: async () => ({ success: false }) });
    setGlobal(t, 'window', browser);
    localStorage.setItem('panorama_server_user_token', 'account-token');
    harness.context.panoramaOwner.current = 'account-token';
    const cleanup = harness.effect(); t.after(cleanup);
    if (nextToken) localStorage.setItem('panorama_server_user_token', nextToken);
    else localStorage.removeItem('panorama_server_user_token');
    browser.dispatchEvent(new Event('panorama-session-changed'));
    assert.equal(harness.state.panorama, 'public-sample');
    assert.equal(harness.context.panoramaOwner.current, null);
    assert.equal(harness.state.viewerSession, 1);
    harness.state.panorama = 'local-upload';
    browser.dispatchEvent(new Event('panorama-session-changed'));
    assert.equal(harness.state.panorama, 'local-upload');
    assert.equal(harness.state.viewerSession, 1);
  });
}

test('generator forgets private originals on session change but keeps guest local uploads', async t => {
  const fixture = studioHarness(t);
  setGlobal(t, 'localStorage', memoryStorage());
  localStorage.setItem('panorama_server_user_token', 'account-token');
  const changes = [];
  fixture.props.onPanoramaChange = (url, owner) => changes.push([url, owner]);
  let tree = fixture.render(fixture.props);
  const works = elementsIn(tree).find(element => typeof element.type === 'function' && element.props.accountId && element.props.onOpen);
  await works.props.onOpen('private-original', false, new AbortController().signal, 'private prompt');
  tree = fixture.render(fixture.props);
  assert.ok(elementsIn(tree).some(element => element.type === 'button' && elementText(element).includes('Download model original')));
  localStorage.removeItem('panorama_server_user_token');
  window.dispatchEvent(new Event('panorama-session-changed'));
  tree = fixture.render(fixture.props);
  assert.ok(!elementsIn(tree).some(element => element.type === 'button' && elementText(element).includes('Download model original')));
  assert.deepEqual(changes[0], ['private-original', 'account-token']);
  setGlobal(t, 'FileReader', class { readAsDataURL() { this.onload({ target: { result: 'local-image' } }); } });
  setGlobal(t, 'document', { querySelector: () => null });
  setGlobal(t, 'Element', class { closest() { return null; } });
  const paste = new Event('paste');
  Object.defineProperty(paste, 'clipboardData', { value: { items: [{ type: 'image/png', getAsFile: () => ({ type: 'image/png' }) }] } });
  window.dispatchEvent(paste);
  tree = fixture.render(fixture.props);
  window.dispatchEvent(new Event('panorama-session-changed'));
  tree = fixture.render(fixture.props);
  assert.ok(elementsIn(tree).some(element => element.type === 'button' && elementText(element).includes('Download model original')));
  assert.deepEqual(changes.at(-1), ['local-image', null]);
});

test('late seam processing cannot restore a private preview after the account changes', () => {
  let pendingImage;
  const changes = [];
  const context = {
    currentPanoramaUrl: 'private-original', originalRawUrl: 'private-original',
    getPanoramaOwner: () => 'old-token', generationRef: { current: { mounted: true, request: 1 } },
    localStorage: { getItem: () => 'new-token' },
    Image: class { constructor() { pendingImage = this; } },
    onPanoramaChange: value => changes.push(value),
  };
  callbackWithContext(sourceCallback('../src/components/GeneratorTab.tsx', 'handleManualHealSeam'), context)();
  pendingImage.onload();
  assert.deepEqual(changes, []);
});

test('payment and generation profile refreshes apply only the newest request in the current session', async testContext => {
  const replies = [];
  const harness = appHarness(testContext, { fetchServerUser: () => new Promise(resolve => replies.push(resolve)) });
  const browser = new EventTarget();
  setGlobal(testContext, 'window', browser);
  harness.context.updateCurrentUser(accountFixture());
  localStorage.setItem('panorama_server_user_token', 'account-token');
  const cleanup = harness.effect();
  testContext.after(cleanup);
  browser.dispatchEvent(new Event('panorama-user-refresh'));
  browser.dispatchEvent(new Event('panorama-payment-updated'));
  const paid = { ...accountFixture(), plan: 'pro', creditsBalance: 1002, creditsTotal: 1004 };
  replies[2]({ success: true, user: paid });
  await flushPromises();
  replies[1]({ success: true, user: { ...accountFixture(), creditsBalance: 2 } });
  replies[0]({ success: true, user: accountFixture() });
  await flushPromises();
  assert.equal(harness.state.user.plan, 'pro');
  assert.equal(adminStorage.getCurrentUser().creditsBalance, 1002);
  assert.equal(adminStorage.getCurrentUser().creditsTotal, 1004);
  browser.dispatchEvent(new Event('panorama-user-refresh'));
  localStorage.setItem('panorama_server_user_token', 'different-token');
  replies[3]({ success: true, user: accountFixture() });
  await flushPromises();
  assert.equal(harness.state.user.plan, 'pro');
});

function generatorRegressionContext(overrides = {}) {
  const user = accountFixture();
  const state = [];
  const context = {
    currentUser: user, getCurrentUser: () => user,
    localStorage: { getItem: () => 'account-token' },
    generationRef: { current: { mounted: true, request: 0, thumbnails: new Set() } }, originalOwner: { current: null },
    saveWorkThumbnail: async () => '',
    creditsCost: 2, resolution: '2K', seamCorrection: false,
    prompt: 'Synthetic', selectedStyle: 'test', referenceImages: [], STYLE_PRESETS: [],
    getModelExecutionPipeline: () => ({ mode: 'single', endpoints: [{ id: 'test', name: 'Test', model: 'test-model' }] }),
    buildPanoramaPrompt: loadTsModule('../src/utils/geminiClient.ts', { './adminStorage': adminStorage }).buildPanoramaPrompt,
    inspectImageResolution,
    Image: class { naturalWidth = 1792; naturalHeight = 1024; set src(value) { queueMicrotask(() => this.onload()); } },
    enhanceAndUpscalePanorama: () => ({ toDataURL: () => 'enhanced' }),
    processPanoramaImage: async () => 'enhanced',
    onPanoramaChange: value => state.push(['panorama', value]),
    onUserChange: () => assert.fail('Server generations must refresh instead of spreading old users'),
    window: { dispatchEvent() {} },
    setTimeout() {}, confetti() {},
    ...Object.fromEntries(['setIsGenerating', 'setApiError', 'setGenerationStage', 'setGenerationElapsed', 'setGenerationTiming', 'setOriginalRawUrl', 'setWorkPrompt', 'setSaveStatus', 'setResultQuality', 'setEnhanced4kUrl', 'setFeedbackNotice', 'setIsCheckoutOpen']
      .map(name => [name, value => state.push([name, value])])),
    ...overrides,
  };
  return { context, state, generate: callbackWithContext(sourceCallback('../src/components/GeneratorTab.tsx', 'handleGenerate'), context) };
}

test('each saved generation attempt starts a non-blocking thumbnail with its own original and id', async () => {
  const thumbnails = [];
  let calls = 0;
  const fixture = generatorRegressionContext({
    getModelExecutionPipeline: () => ({ mode: 'failover', endpoints: [{ name: 'first' }, { name: 'second' }] }),
    generateWithGemini: async () => ++calls === 1
      ? { imageUrl: 'first-raw', library: { saved: true, id: 'first-id' }, imageResolution: { status: 'below-request', panoramaWidth: 100 }, creditsDeducted: 0, creditsRefunded: 2 }
      : { imageUrl: 'second-raw', library: { saved: true, id: 'second-id' }, imageResolution: { status: 'met', panoramaWidth: 200 }, creditsDeducted: 2, remainingCredits: 7 },
    saveWorkThumbnail: (id, url, token, signal) => {
      thumbnails.push({ id, url, token, signal });
      return id === 'first-id' ? Promise.reject(new Error('thumbnail failed')) : new Promise(() => {});
    },
  });
  await fixture.generate();
  assert.deepEqual(thumbnails.map(({ id, url, token }) => [id, url, token]), [
    ['first-id', 'first-raw', 'account-token'], ['second-id', 'second-raw', 'account-token'],
  ]);
  assert.ok(fixture.state.some(([key, value]) => key === 'panorama' && value === 'enhanced'));
  assert.equal(fixture.state.find(([key]) => key === 'setSaveStatus')?.[1].status, 'saved');
  assert.ok(!fixture.state.some(([key, value]) => key === 'setApiError' && value));
  await flushPromises();
  assert.equal(fixture.context.generationRef.current.thumbnails.size, 1);
});

test('thumbnail generation skips unsaved and unidentified works and stale responses', async () => {
  let calls = 0;
  for (const library of [{ saved: false, id: 'id' }, { saved: true }, undefined]) {
    const fixture = generatorRegressionContext({
      generateWithGemini: async () => ({ imageUrl: 'raw', library }),
      saveWorkThumbnail: async () => { calls++; },
    });
    await fixture.generate();
  }
  let finish;
  const fixture = generatorRegressionContext({
    generateWithGemini: () => new Promise(resolve => { finish = resolve; }),
    saveWorkThumbnail: async () => { calls++; },
  });
  const pending = fixture.generate();
  fixture.context.generationRef.current.request++;
  finish({ imageUrl: 'raw', library: { saved: true, id: 'id' } });
  await pending;
  assert.equal(calls, 0);
});

test('session changes, storage changes and unmount cancel pending thumbnails', () => {
  const source = fs.readFileSync(new URL('../src/components/GeneratorTab.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  useEffect(() => {\n    const generation = generationRef.current;');
  const end = source.indexOf('  }, [currentUser.id]);', start);
  assert.ok(start >= 0 && end > start);
  const effect = source.slice(start + '  useEffect('.length, end) + '  }';
  for (const action of ['session', 'storage', 'unmount']) {
    const window = new EventTarget();
    const first = new AbortController();
    const second = new AbortController();
    const generationRef = { current: { mounted: false, request: 0, processing: null, thumbnails: new Set([first, second]) } };
    const cleanup = callbackWithContext(effect, { generationRef, window, originalOwner: { current: null }, setIsGenerating() {}, setIsShareOpen() {} })();
    if (action === 'session') window.dispatchEvent(new Event('panorama-session-changed'));
    else if (action === 'storage') { const event = new Event('storage'); event.key = 'panorama_server_user_token'; window.dispatchEvent(event); }
    else cleanup();
    assert.equal(first.signal.aborted, true);
    assert.equal(second.signal.aborted, true);
    assert.equal(generationRef.current.thumbnails.size, 0);
    if (action !== 'unmount') cleanup();
  }
});

for (const [library, expected] of [[{ saved: true }, 'saved'], [{ saved: false, error: 'full' }, 'unsaved'], [undefined, 'unknown']]) {
  test(`generation reports ${expected} library status for the displayed result`, async () => {
    const fixture = generatorRegressionContext({
      generateWithGemini: async () => ({ imageUrl: 'raw', library, remainingCredits: 7, creditsDeducted: 2 }),
      inspectImageResolution: () => ({ status: 'met', width: 2048, height: 1024 }),
    });
    await fixture.generate();
    assert.deepEqual(fixture.state.find(([key]) => key === 'setSaveStatus')?.[1], { url: 'enhanced', status: expected });
  });
}

test('generator preserves attached photos across failover and asks to extend their actual scene', async () => {
  const refs = [{ name: 'room.png', preview: 'data:image/png;base64,AA==' }];
  const calls = [];
  const builderCalls = [];
  const { buildPanoramaPrompt } = loadTsModule('../src/utils/geminiClient.ts', { './adminStorage': adminStorage });
  const fixture = generatorRegressionContext({
    prompt: 'Keep the original room', referenceImages: refs,
    STYLE_PRESETS: [{ id: 'test', promptSuffix: 'watercolor illustration' }],
    buildPanoramaPrompt: (...args) => {
      builderCalls.push(args);
      return buildPanoramaPrompt(...args);
    },
    getModelExecutionPipeline: () => ({ mode: 'failover', endpoints: [
      { id: 'gemini', name: 'Gemini', model: 'gemini-3.1-flash-image' },
      { id: 'gpt', name: 'GPT', model: 'gpt-image-2.5' },
    ] }),
    generateWithGemini: async (prompt, config, photos) => {
      calls.push({ prompt, config, photos });
      if (config.endpointId === 'gemini') throw new Error('Model unavailable');
      return { imageUrl: `data:image/png;base64,${pngMetadata(2048, 1024)}`, remainingCredits: 2, creditsDeducted: 2 };
    },
  });
  await fixture.generate();
  assert.equal(calls.length, 2);
  assert.deepEqual(builderCalls, [['Keep the original room', 'watercolor illustration', true]]);
  for (const call of calls) {
    assert.deepEqual(call.photos, refs.map(ref => ref.preview));
    assert.equal(call.prompt, buildPanoramaPrompt('Keep the original room', 'watercolor illustration', true));
    assert.match(call.prompt, /source scene/);
    assert.match(call.prompt, /Preserve recognizable subjects/);
    assert.match(call.prompt, /Keep the original room/);
  }
  assert.ok(fixture.state.some(([key, value]) => key === 'panorama' && value === 'enhanced'));
});

test('a stale credit balance cannot start any model request without a registered session', async () => {
  let prompted = 0;
  const fixture = generatorRegressionContext({ localStorage: { getItem: () => null },
    window: { dispatchEvent: () => prompted++ }, generateWithGemini: () => assert.fail('Anonymous generation must not reach a model'),
  });
  await fixture.generate();
  assert.equal(prompted, 1);
  assert.ok(fixture.state.some(([name, text]) => name === 'setApiError' && text.includes('Register and verify')));
});

for (const source of ['updated-server', 'legacy-server']) {
  test(`undersized ${source} result retries the next model only when refund-confirmed and reports only confirmed refunds`, async () => {
    let calls = 0;
    const imageUrl = `data:image/png;base64,${pngMetadata(1774, 887)}`;
    const retryAllowed = source !== 'legacy-server';
    const fixture = generatorRegressionContext({
      resolution: '4K', creditsCost: 4,
      localStorage: { getItem: () => source === 'direct' ? null : 'account-token' },
      getModelExecutionPipeline: () => ({ mode: 'failover', endpoints: [{ id: 'gpt', name: 'GPT' }, { id: 'gemini', name: 'Gemini' }] }),
      generateWithGemini: async () => {
        calls++;
        return { imageUrl, ...(source === 'direct' ? {} : {
          remainingCredits: source === 'updated-server' ? 4 : 0,
          creditsDeducted: source === 'updated-server' ? 0 : 4,
          creditsRefunded: source === 'updated-server' ? 4 : 0,
        }) };
      },
      processPanoramaImage: async (url, options) => {
        assert.equal(url, imageUrl);
        assert.equal(options.preserveNative, true);
        return 'retained-panorama';
      },
      deductCurrentUserCredits: () => assert.fail('Undersized direct images must not consume local credits'),
      onUserChange() {},
      confetti: () => assert.fail('Undersized output must not celebrate a successful requested resolution'),
    });
    await fixture.generate();
    assert.equal(calls, retryAllowed ? 2 : 1);
    assert.equal(
      fixture.state.some(([key, value]) => key === 'setGenerationStage' && value?.includes('trying the next model')),
      retryAllowed
    );
    assert.ok(fixture.state.some(([key, value]) => key === 'panorama' && value === 'retained-panorama'));
    assert.ok(fixture.state.some(([key, value]) => key === 'setOriginalRawUrl' && value === imageUrl));
    assert.ok(fixture.state.some(([key, value]) => key === 'setGenerationTiming' && value?.includes('1774×887') && value?.includes('4K')));
    const warning = fixture.state.filter(([key, value]) => key === 'setApiError' && value).at(-1)?.[1];
    assert.ok(warning?.includes('without upscaling'));
    assert.ok(warning?.includes(source === 'updated-server' ? '8 credits were returned'
      : source === 'legacy-server' ? 'no automatic refund was confirmed' : 'No local credits were deducted'));
  });
}

test('undersized first model falls through to a resolution-capable fallback and charges only the successful attempt', async () => {
  let calls = 0;
  let confettiCalls = 0;
  const undersizedUrl = `data:image/png;base64,${pngMetadata(1774, 887)}`;
  const metUrl = `data:image/png;base64,${pngMetadata(3840, 1920)}`;
  const fixture = generatorRegressionContext({
    resolution: '4K', creditsCost: 4,
    getModelExecutionPipeline: () => ({ mode: 'failover', endpoints: [{ id: 'gpt', name: 'GPT' }, { id: 'gemini', name: 'Gemini' }] }),
    generateWithGemini: async () => {
      calls++;
      return calls === 1
        ? { imageUrl: undersizedUrl, remainingCredits: 100, creditsDeducted: 0, creditsRefunded: 4 }
        : { imageUrl: metUrl, remainingCredits: 96, creditsDeducted: 4, creditsRefunded: 0 };
    },
    processPanoramaImage: async (url, options) => {
      assert.equal(url, metUrl);
      assert.equal(options.preserveNative, true);
      return 'kept-4k';
    },
    confetti: () => { confettiCalls++; },
  });
  await fixture.generate();
  assert.equal(calls, 2);
  assert.ok(fixture.state.some(([key, value]) => key === 'panorama' && value === 'kept-4k'));
  assert.ok(fixture.state.some(([key, value]) => key === 'setGenerationTiming' && value?.includes('3840×1920')));
  assert.ok(fixture.state.some(([key, value]) => key === 'setFeedbackNotice' && value?.includes('fallback model Gemini') && value?.includes('Used 4 credits')));
  assert.ok(!fixture.state.some(([key, value]) => key === 'setApiError' && value));
  assert.equal(confettiCalls, 1);
});

test('single model mode keeps an undersized result without trying other endpoints', async () => {
  let calls = 0;
  const imageUrl = `data:image/png;base64,${pngMetadata(1774, 887)}`;
  const fixture = generatorRegressionContext({
    resolution: '4K', creditsCost: 4,
    getModelExecutionPipeline: () => ({ mode: 'single', endpoints: [{ id: 'gpt', name: 'GPT' }, { id: 'gemini', name: 'Gemini' }] }),
    generateWithGemini: async () => {
      calls++;
      return { imageUrl, remainingCredits: 4, creditsDeducted: 0, creditsRefunded: 4 };
    },
    processPanoramaImage: async () => 'retained-panorama',
    onUserChange() {},
  });
  await fixture.generate();
  assert.equal(calls, 1);
  assert.ok(!fixture.state.some(([key, value]) => key === 'setGenerationStage' && value?.includes('trying the next model')));
  assert.ok(fixture.state.some(([key, value]) => key === 'setApiError' && value?.includes('without upscaling')));
});

test('unverified charged fallback keeps the verified undersized result and reports the net charge honestly', async () => {
  let calls = 0;
  const undersizedUrl = `data:image/png;base64,${pngMetadata(1774, 887)}`;
  const remoteUrl = 'https://example.test/result.png';
  const fixture = generatorRegressionContext({
    resolution: '4K', creditsCost: 4,
    getModelExecutionPipeline: () => ({ mode: 'failover', endpoints: [{ id: 'gpt', name: 'GPT' }, { id: 'gemini', name: 'Gemini' }] }),
    generateWithGemini: async () => {
      calls++;
      return calls === 1
        ? { imageUrl: undersizedUrl, remainingCredits: 100, creditsDeducted: 0, creditsRefunded: 4 }
        : { imageUrl: remoteUrl, remainingCredits: 96, creditsDeducted: 4, creditsRefunded: 0 };
    },
    processPanoramaImage: async (url, options) => {
      assert.equal(url, undersizedUrl, 'Verified undersized pixels are retained over unverifiable fallback URLs');
      assert.equal(options.preserveNative, true);
      return 'retained-panorama';
    },
    onUserChange() {},
  });
  await fixture.generate();
  assert.equal(calls, 2);
  assert.ok(fixture.state.some(([key, value]) => key === 'panorama' && value === 'retained-panorama'));
  const warning = fixture.state.filter(([key, value]) => key === 'setApiError' && value).at(-1)?.[1];
  assert.ok(warning?.includes('without upscaling'));
  assert.ok(warning?.includes('4 credits were returned, but fallback attempts still report 4 credits charged without a confirmed refund'));
});

test('generation reports actual model attempts, elapsed seconds and separate processing timing', async () => {
  let now = 0;
  let tick;
  let finish;
  let cleared = 0;
  const fixture = generatorRegressionContext({
    performance: { now: () => now },
    setInterval: callback => { tick = callback; return 99; },
    clearInterval: timer => { assert.equal(timer, 99); cleared++; },
    getModelExecutionPipeline: () => ({ mode: 'failover', endpoints: [{ id: 'gpt', name: 'GPT' }, { id: 'gemini', name: 'Gemini' }] }),
    generateWithGemini: () => new Promise((resolve, reject) => { finish = { resolve, reject }; }),
    processPanoramaImage: async () => { now += 100; return 'enhanced'; },
  });
  const pending = fixture.generate();
  assert.ok(fixture.state.some(([key, value]) => key === 'setGenerationStage' && value.includes('GPT') && value.includes('1/2')));
  now = 65000;
  tick();
  assert.ok(fixture.state.some(([key, value]) => key === 'setGenerationElapsed' && value === 65));
  finish.reject(new Error('Model failed'));
  await flushPromises();
  assert.ok(fixture.state.some(([key, value]) => key === 'setGenerationStage' && value.includes('Gemini') && value.includes('2/2')));
  now = 70000;
  finish.resolve({ imageUrl: 'raw', remainingCredits: 2, creditsDeducted: 2 });
  await pending;
  assert.ok(fixture.state.some(([key, value]) => key === 'setGenerationTiming' && typeof value === 'string' && value.includes('70.0 s') && value.includes('0.1 s')));
  assert.equal(cleared, 1);
});

for (const stage of ['response', 'decode', 'error', 'unmount', 'superseded']) {
  test(`generation discards all stale ${stage} result writes`, async () => {
    let finish;
    let finishProcessing;
    let token = 'account-token';
    const fixture = generatorRegressionContext({
      localStorage: { getItem: () => token },
      generateWithGemini: () => new Promise((resolve, reject) => { finish = stage === 'error' ? reject : resolve; }),
      processPanoramaImage: () => new Promise(resolve => { finishProcessing = resolve; }),
    });
    const pending = fixture.generate();
    if (stage === 'decode') {
      finish({ imageUrl: 'raw', remainingCredits: 2 });
      await flushPromises();
    }
    if (stage === 'unmount') fixture.context.generationRef.current.mounted = false;
    else if (stage === 'superseded') fixture.context.generationRef.current.request++;
    else token = 'new-account-token';
    const before = [...fixture.state];
    if (stage === 'decode') finishProcessing('enhanced');
    else finish(stage === 'error' ? new Error('Late error') : { imageUrl: 'raw', remainingCredits: 2 });
    await pending;
    assert.deepEqual(fixture.state, before);
  });
}

for (const remainingCredits of [0, undefined]) {
  test(`profile refresh failure preserves paid output and latest profile with balance ${remainingCredits}`, async testContext => {
    const harness = appHarness(testContext, { fetchServerUser: async () => ({ success: false, error: 'Offline' }) });
    const browser = new EventTarget();
    setGlobal(testContext, 'window', browser);
    localStorage.setItem('panorama_server_user_token', 'account-token');
    const paid = { ...accountFixture(), plan: 'pro', creditsBalance: 1002, creditsTotal: 1004 };
    harness.context.updateCurrentUser(paid);
    const cleanup = harness.effect();
    testContext.after(cleanup);
    const fixture = generatorRegressionContext({
      currentUser: paid, getCurrentUser: adminStorage.getCurrentUser, window: browser,
      generateWithGemini: async () => ({ imageUrl: 'raw', remainingCredits }),
    });
    await fixture.generate();
    await flushPromises();
    assert.ok(fixture.state.some(([key, value]) => key === 'panorama' && value === 'enhanced'));
    assert.equal(adminStorage.getCurrentUser().creditsBalance, 1002);
    assert.equal(adminStorage.getCurrentUser().creditsTotal, 1004);
    assert.equal(harness.state.user.plan, 'pro');
  });
}

test('exhausting trial credits never schedules an automatic checkout popup', async () => {
  const timers = [];
  let token = 'account-token';
  const fixture = generatorRegressionContext({
    localStorage: { getItem: () => token },
    generateWithGemini: async () => ({ imageUrl: 'raw', remainingCredits: 0 }),
    setTimeout: callback => timers.push(callback),
  });
  await fixture.generate();
  assert.equal(timers.length, 0);
  token = 'different-token';
  const before = [...fixture.state];
  timers.forEach(callback => callback());
  assert.deepEqual(fixture.state, before);
});

test('default preparation preserves native pixels, disables sharpening and does not label output as enhanced 4K', async () => {
  const fixture = generatorRegressionContext({
    generateWithGemini: async () => ({ imageUrl: 'raw', remainingCredits: 2 }),
    processPanoramaImage: async (url, options, healSeam) => {
      assert.equal(url, 'raw');
      assert.deepEqual(options, { resolution: '2K', preserveNative: true, sharpness: 0, contrastBoost: 1 });
      assert.equal(healSeam, false);
      return 'native-crop';
    },
  });
  await fixture.generate();
  assert.ok(fixture.state.some(([key, value]) => key === 'setOriginalRawUrl' && value === 'raw'));
  assert.ok(fixture.state.some(([key, value]) => key === 'setEnhanced4kUrl' && value === null));
  const source = fs.readFileSync(new URL('../src/components/GeneratorTab.tsx', import.meta.url), 'utf8');
  assert.match(source, /\[seamCorrection, setSeamCorrection\] = useState<boolean \| 'auto'>\('auto'\)/);
  assert.equal(source.includes('4K Super-Resolution'), false);
  assert.ok(source.includes('Download model original'));
});

for (const outcome of ['success', 'error', 'aborted', 'superseded', 'unmounted']) {
  test(`light sharpening ${outcome} uses existing dimensions, skips seam blending and settles safely`, async () => {
    let finish;
    let fail;
    const state = [];
    const generationRef = { current: { mounted: true, request: 0, processing: null } };
    const handler = callbackWithContext(sourceCallback('../src/components/GeneratorTab.tsx', 'handleEnhanceClarity'), {
      generationRef, currentPanoramaUrl: 'native-crop', originalRawUrl: 'model-original', getPanoramaOwner: () => null,
      processPanoramaImage: (url, options, seam, signal) => {
        assert.equal(url, 'native-crop');
        assert.deepEqual(options, { scaleFactor: 1, sharpness: 0.2, contrastBoost: 1 });
        assert.equal(seam, false);
        assert.equal(signal.aborted, false);
        return new Promise((resolve, reject) => { finish = resolve; fail = reject; });
      },
      setOriginalRawUrl: () => assert.fail('Do not overwrite the model original'),
      ...Object.fromEntries(['setIsUpscalingClarity', 'setEnhanced4kUrl', 'onPanoramaChange', 'setFeedbackNotice'].map(name => [name, value => state.push([name, value])])),
    });
    const pending = handler();
    const processing = generationRef.current.processing;
    if (outcome === 'aborted') processing.abort();
    if (outcome === 'superseded') generationRef.current.request++;
    if (outcome === 'unmounted') generationRef.current.mounted = false;
    if (outcome === 'error') fail(new Error('Decode failed'));
    else finish('sharpened');
    await pending;
    assert.equal(generationRef.current.processing, null);
    assert.equal(state.some(([key]) => key === 'onPanoramaChange'), outcome === 'success');
    assert.equal(state.some(([key, value]) => key === 'setIsUpscalingClarity' && value === false), outcome !== 'unmounted');
    if (outcome === 'error') assert.ok(state.some(([key, value]) => key === 'setFeedbackNotice' && value === 'Decode failed'));
  });
}

test('original download preserves JPEG bytes and extension without image re-encoding', async () => {
  const blob = new Blob(['original-jpeg-bytes'], { type: 'image/jpeg' });
  const anchor = { click() { this.clicked = true; } };
  let revoke;
  const handler = callbackWithContext(sourceCallback('../src/components/GeneratorTab.tsx', 'handleDownloadOriginal'), {
    originalRawUrl: 'model-original',
    fetch: async url => { assert.equal(url, 'model-original'); return { ok: true, blob: async () => blob }; },
    document: { createElement: tag => { assert.equal(tag, 'a'); return anchor; } },
    URL: { createObjectURL: value => { assert.equal(value, blob); return 'blob:original'; }, revokeObjectURL: value => { assert.equal(value, 'blob:original'); } },
    setTimeout: callback => { revoke = callback; },
    setFeedbackNotice: () => assert.fail('Valid original must download'),
  });
  await handler();
  assert.equal(anchor.href, 'blob:original');
  assert.match(anchor.download, /^model-original-\d+\.jpg$/);
  assert.equal(anchor.clicked, true);
  assert.equal(await blob.text(), 'original-jpeg-bytes');
  revoke();
});

for (const resolution of ['1K', '2K', '4K']) {
  test(`public proxy ${resolution} preserves returned native detail without stretching or fake upscaling`, async testContext => {
    setGlobal(testContext, 'window', { location: { hostname: 'review.example' } });
    let draw;
    const canvas = {
      getContext: () => ({ drawImage: (...args) => { draw = args; },
        getImageData: () => ({ data: new Uint8ClampedArray(canvas.width * canvas.height * 4) }), putImageData() {} }),
      toDataURL: () => `image:${canvas.width}x${canvas.height}`,
    };
    setGlobal(testContext, 'document', { createElement: () => canvas });
    testContext.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(url, '/api/generate');
      assert.equal(JSON.parse(options.body).resolution, resolution);
      return Response.json({ success: true, imageUrl: 'raw1792x1024', remainingCredits: 2 });
    });
    const { generateWithGemini } = loadTsModule('../src/utils/geminiClient.ts', { './adminStorage': {} });
    const { enhanceAndUpscalePanorama } = loadTsModule('../src/utils/imageEnhancer.ts');
    const fixture = generatorRegressionContext({ resolution, generateWithGemini,
      processPanoramaImage: async (url, options) => {
        assert.equal(url, 'raw1792x1024');
        return enhanceAndUpscalePanorama({ naturalWidth: 1792, naturalHeight: 1024 }, options).toDataURL();
      },
    });
    await fixture.generate();
    assert.deepEqual(draw.slice(1), [0, 64, 1792, 896, 0, 0, 1792, 896]);
    assert.ok(fixture.state.some(([key, value]) => key === 'panorama' && value === 'image:1792x896'));
    assert.ok(fixture.state.some(([key, value]) => key === 'setEnhanced4kUrl' && value === null));
  });
}

for (const resolution of ['1K', '2K', '4K']) {
  for (const protocol of ['GPT', 'Gemini proxy', 'Gemini native']) {
    test(`local ${protocol} passes the same ${resolution} parameters as the cloud backend`, async testContext => {
      setGlobal(testContext, 'window', { location: { hostname: 'localhost' } });
      const model = protocol === 'GPT' ? 'gpt-image-2.5' : 'gemini-3.1-flash-image';
      let calls = 0;
      testContext.mock.method(globalThis, 'fetch', async (url, options) => {
        calls++;
        const payload = JSON.parse(options.body);
        if (protocol === 'GPT') {
          assert.equal(payload.size, { '1K': '1152x576', '2K': '2048x1024', '4K': '3840x1920' }[resolution]);
          assert.equal(payload.quality, 'auto');
          return imageResponse();
        }
        if (protocol === 'Gemini proxy') {
          assert.deepEqual(payload.image_config, { aspect_ratio: '16:9', image_size: resolution });
          assert.deepEqual(payload.modalities, ['image']);
          return Response.json({ choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,AA==' } }] } }] });
        }
        assert.equal(new URL(url).pathname, '/v1beta/models/gemini-3.1-flash-image:generateContent');
        assert.equal(payload.generationConfig.imageConfig.imageSize, resolution);
        return Response.json({ candidates: [{ content: { parts: [{ text: 'Image' }, { inlineData: { data: 'AA==', mimeType: 'image/jpeg' } }] } }] });
      });
      const { generateWithGemini } = loadTsModule('../src/utils/geminiClient.ts', { './adminStorage': {} });
      const result = await generateWithGemini('Test', {
        baseUrl: protocol === 'Gemini native' ? 'https://generativelanguage.googleapis.com/v1beta' : 'http://localhost:8317',
        apiKey: 'synthetic-key', model, resolution,
      });
      assert.equal(calls, 1);
      assert.equal(result.imageUrl, `data:image/${protocol === 'Gemini native' ? 'jpeg' : 'png'};base64,AA==`);
    });
  }
}

test('local direct GPT sends reference files as multipart edits and displays the returned image', async testContext => {
  setGlobal(testContext, 'window', { location: { hostname: 'localhost' } });
  let calls = 0;
  testContext.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    assert.equal(url, 'http://localhost:8317/v1/images/edits');
    const form = await new Request(url, options).formData();
    assert.deepEqual(Buffer.from(await form.getAll('image[]')[0].arrayBuffer()), Buffer.from([0]));
    return imageResponse();
  });
  const { generateWithGemini } = loadTsModule('../src/utils/geminiClient.ts', { './adminStorage': {} });
  const result = await generateWithGemini('Expand this room', {
    baseUrl: 'http://localhost:8317', apiKey: 'synthetic-key', model: 'gpt-image-2.5', resolution: '1K',
  }, ['data:image/png;base64,AA==']);
  assert.equal(result.imageUrl, 'data:image/png;base64,AA==');
  assert.equal(calls, 1);
});

test('local GPT rejects a size error without silently downgrading or generating a second image', async testContext => {
  setGlobal(testContext, 'window', { location: { hostname: 'localhost' } });
  let calls = 0;
  testContext.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return Response.json({ error: { message: 'Unsupported image size' } }, { status: 400 });
  });
  const { generateWithGemini } = loadTsModule('../src/utils/geminiClient.ts', { './adminStorage': {} });
  await assert.rejects(generateWithGemini('Test', { baseUrl: 'http://localhost:8317', apiKey: 'synthetic-key', model: 'gpt-image-2.5', resolution: '4K' }), /Unsupported image size/);
  assert.equal(calls, 1);
});

test('local multimodal 400 rejects without retrying as text-only', async testContext => {
  setGlobal(testContext, 'window', { location: { hostname: 'localhost' } });
  let calls = 0;
  testContext.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    assert.equal(JSON.parse(options.body).messages[0].content[1].image_url.url, 'reference');
    return Response.json({ error: { message: 'Reference input rejected' } }, { status: 400 });
  });
  const { generateWithGemini } = loadTsModule('../src/utils/geminiClient.ts', { './adminStorage': {} });
  await assert.rejects(generateWithGemini('Test', { baseUrl: 'http://localhost:8317', apiKey: 'local-test-key', model: 'gemini-test' }, ['reference']), /HTTP 400/);
  assert.equal(calls, 1);
});

for (const flow of ['restore', 'login']) {
  test(`admin ${flow}: loads server invoices and clears empty server ledgers instead of demo rows`, async testContext => {
    const storage = memoryStorage();
    storage.setItem('panorama_admin_server_token', 'admin-token');
    setGlobal(testContext, 'sessionStorage', storage);
    for (const ledger of [{ users: [], subscriptions: [], invoices: [] }, { users: [], subscriptions: [], invoices: [{ id: 'real-invoice', amount: 19 }] }]) {
      const state = { users: ['demo'], subscriptions: ['demo'], invoices: ['demo'] };
      const context = {
        ...adminStorage,
        probeBackendHealth: async () => ({ isOnline: true }), fetchPublicBillingConfig: async () => null,
        setBillingConfig() {}, setBackendStatus() {}, setIsServerMode() {}, setLoginErrorMsg() {},
        loginUsernameInput: 'admin', loginPasswordInput: 'test', setAdminSession() {}, setIsAuthenticated() {}, setLoginPasswordInput() {},
        setUsers: value => { state.users = value; }, setSubscriptions: value => { state.subscriptions = value; },
        setInvoices: value => { state.invoices = value; },
        fetch: async route => Response.json(route === '/api/admin/login' ? { success: true, token: 'admin-token' } : ledger),
      };
      const handler = callbackWithContext(sourceCallback('../src/components/AdminTab.tsx', flow === 'login' ? 'handleAdminLogin' : undefined), context);
      await handler({ preventDefault() {} });
      await flushPromises();
      assert.deepEqual(state, ledger);
    }
  });
}

test('panorama prompt respects the chosen style without injecting photorealism or 8K claims', () => {
  const { buildPanoramaPrompt } = loadTsModule('../src/utils/geminiClient.ts', { './adminStorage': adminStorage });
  const prompt = buildPanoramaPrompt('Alpine lake', 'watercolor illustration');
  assert.match(prompt, /watercolor illustration/);
  assert.match(prompt, /matching left and right edges/);
  assert.doesNotMatch(prompt, /photorealistic|8k|ultra sharp/i);
});

test('panorama prompt keeps text-only output exactly unchanged with an omitted or false reference flag', () => {
  const { buildPanoramaPrompt } = loadTsModule('../src/utils/geminiClient.ts', { './adminStorage': adminStorage });
  const constraints = ', full 360 degree equirectangular projection panorama, 360 spherical VR skybox, 2:1 ratio texture map, seamless horizontal wrap, continuous 360 panoramic loop, matching left and right edges, level horizontal horizon at 50% vertical center, flat camera zero pitch, full frame edge to edge, no borders, no circular lens, no black frame, no vignettes';
  for (const [description, style, expected] of [
    ['  Alpine lake  ', '', 'Alpine lake'],
    ['Alpine lake', 'watercolor illustration', 'Alpine lake, watercolor illustration'],
    ['', '', ''],
    ['  ', 'ink drawing', ', ink drawing'],
  ]) {
    assert.equal(buildPanoramaPrompt(description, style), expected + constraints);
    assert.equal(buildPanoramaPrompt(description, style, false), expected + constraints);
  }
});

test('reference panorama prompt accepts an empty description and defines one generic spherical scene', () => {
  const { buildPanoramaPrompt } = loadTsModule('../src/utils/geminiClient.ts', { './adminStorage': adminStorage });
  const prompt = buildPanoramaPrompt('', '', true);
  assert.equal(buildPanoramaPrompt('  \n ', '', true), prompt);
  assert.notEqual(prompt, buildPanoramaPrompt('', '', false), 'reference mode must provide scene reconstruction instructions without requiring a typed description');
  assert.doesNotMatch(prompt, /Apply these requested changes:|Visual style:|\b(golf|cart|car|clubhouse|vehicle)\b/i);
  assert.equal(prompt, prompt.trim());
});

test('reference panorama prompt retains user changes, requested copies and the chosen style', () => {
  const { buildPanoramaPrompt } = loadTsModule('../src/utils/geminiClient.ts', { './adminStorage': adminStorage });
  const changes = 'Add a second copy of the sculpture and change the walls to blue';
  const style = 'watercolor illustration';
  assert.ok(buildPanoramaPrompt(`  ${changes}  `, style, true)
    .endsWith(` Apply these requested changes: ${changes} Visual style: ${style}`));
  const styleOnly = buildPanoramaPrompt('', style, true);
  assert.ok(styleOnly.endsWith(` Visual style: ${style}`));
  assert.doesNotMatch(styleOnly, /Apply these requested changes:/);
});

test('generator prompt without reference photos uses the text-only builder with its selected style', async () => {
  const { buildPanoramaPrompt } = loadTsModule('../src/utils/geminiClient.ts', { './adminStorage': adminStorage });
  const builderCalls = [];
  const fixture = generatorRegressionContext({
    prompt: 'Alpine lake', STYLE_PRESETS: [{ id: 'test', promptSuffix: 'ink drawing' }],
    buildPanoramaPrompt: (...args) => {
      builderCalls.push(args);
      return buildPanoramaPrompt(...args);
    },
    generateWithGemini: async (prompt, config, photos) => {
      assert.equal(prompt, buildPanoramaPrompt('Alpine lake', 'ink drawing'));
      assert.deepEqual(photos, []);
      return { imageUrl: `data:image/png;base64,${pngMetadata(2048, 1024)}`, remainingCredits: 2, creditsDeducted: 2 };
    },
  });
  await fixture.generate();
  assert.deepEqual(builderCalls, [['Alpine lake', 'ink drawing', false]]);
  assert.ok(fixture.state.some(([key, value]) => key === 'panorama' && value === 'enhanced'));
});

test('an undersized result keeps the fallback failure visible with both attempts in timing', async () => {
  let calls = 0;
  const imageUrl = `data:image/png;base64,${pngMetadata(1774, 887)}`;
  const fixture = generatorRegressionContext({
    resolution: '4K', creditsCost: 4,
    getModelExecutionPipeline: () => ({ mode: 'failover', endpoints: [
      { id: 'gpt', name: 'GPT', model: 'gpt-image-2.5' },
      { id: 'gemini', name: 'Gemini', model: 'gemini-3.1-flash-image' },
    ] }),
    generateWithGemini: async () => {
      if (++calls === 2) throw new Error('Provider timeout');
      return { imageUrl, creditsDeducted: 0, creditsRefunded: 4, remainingCredits: 4 };
    },
  });
  await fixture.generate();
  assert.equal(calls, 2);
  const notice = fixture.state.filter(([key, value]) => key === 'setApiError' && value).at(-1)[1];
  assert.match(notice, /4 credits were returned/);
  assert.match(notice, /gemini-3.1-flash-image: Provider timeout/);
  const timing = fixture.state.filter(([key, value]) => key === 'setGenerationTiming' && value).at(-1)[1];
  assert.match(timing, /gpt-image-2.5: 1774×887/);
  assert.match(timing, /gemini-3.1-flash-image: failed/);
});

test('share manager discards another account’s late list and aborts requests when closed', async t => {
  let token = 'account-A';
  setGlobal(t, 'window', { location: { origin: 'https://studio.example' } });
  setGlobal(t, 'localStorage', { getItem: () => token });
  setGlobal(t, 'document', { activeElement: { focus() {} } });
  const pending = [];
  t.mock.method(globalThis, 'fetch', (url, init) => new Promise(resolve => pending.push({ resolve, init, url })));
  const harness = componentHarness('../src/components/commercial/SharePanorama.tsx', 'SharePanoramaModal', { '../SphereViewer': { SphereViewer() {} }, '../../utils/imageOptimizer': {} });
  const attach = tree => { const node = elementsIn(tree).find(e => e.type === 'dialog'); if (node) node.props.ref.current = { showModal() {}, close() {} }; };
  const props = { isOpen: true, accountId: 'A', imageUrl: 'data:image/png;base64,AA==', onClose() {} };
  harness.render(props, attach);
  token = 'account-B'; harness.render({ ...props, accountId: 'B' }, attach);
  assert.equal(pending[0].init.signal.aborted, true);
  assert.equal(pending[1].init.headers.Authorization, 'Bearer account-B');
  pending[1].resolve(Response.json({ shares: [{ id: 'b'.repeat(32), title: 'B panorama', width: 2, height: 1, allowDownload: true }] }));
  pending[0].resolve(Response.json({ shares: [{ id: 'a'.repeat(32), title: 'A private title', width: 2, height: 1, allowDownload: true }] }));
  await flushPromises();
  const text = elementText(harness.render({ ...props, accountId: 'B' }, attach));
  assert.ok(text.includes('B panorama'));
  assert.ok(!text.includes('A private title'));
  harness.unmount();
  assert.equal(pending[1].init.signal.aborted, true);
});

test('share modal initializes title with current prompt and distinguishes new share from old list', async t => {
  let token = 'account-token';
  setGlobal(t, 'window', { location: { origin: 'https://studio.example', pathname: '/panorama-generator/' } });
  setGlobal(t, 'localStorage', { getItem: () => token });
  setGlobal(t, 'document', { activeElement: { focus() {} } });
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.includes('/api/shares')) {
      return Response.json({ shares: [{ id: '1'.repeat(32), title: 'Old Sunset Pano', width: 2048, height: 1024, allowDownload: true, createdAt: Date.now() - 3600000 }] });
    }
    return Response.error();
  });
  const harness = componentHarness('../src/components/commercial/SharePanorama.tsx', 'SharePanoramaModal', { '../SphereViewer': { SphereViewer() {} }, '../../utils/imageOptimizer': {} });
  const attach = tree => { const node = elementsIn(tree).find(e => e.type === 'dialog'); if (node) node.props.ref.current = { showModal() {}, close() {} }; };
  const props = { isOpen: true, accountId: 'acc-1', imageUrl: 'data:image/png;base64,AA==', prompt: 'Cyberpunk Neon Alley at Dusk', onClose() {} };
  harness.render(props, attach);
  await flushPromises();
  const rendered = harness.render(props, attach);
  const text = elementText(rendered);
  assert.ok(text.includes('Old Sunset Pano'));
  const titleInput = elementsIn(rendered).find(e => e.type === 'input' && e.props.placeholder === 'My panorama');
  assert.ok(titleInput);
  assert.equal(titleInput.props.value, 'Cyberpunk Neon Alley at Dusk');
  harness.unmount();
});

test('public shared panorama loads without login and releases its image on unmount', async t => {
  const calls = [], revoked = [];
  setGlobal(t, 'document', { title: '' });
  const id = 'a'.repeat(32);
  t.mock.method(URL, 'createObjectURL', () => 'blob:shared-test');
  t.mock.method(URL, 'revokeObjectURL', url => revoked.push(url));
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return url.endsWith('/image') ? new Response(new Blob(['png'], { type: 'image/png' }))
      : Response.json({ share: { id, title: 'Shared lake', width: 4000, height: 2000, allowDownload: true } });
  });
  const harness = componentHarness('../src/components/commercial/SharePanorama.tsx', 'SharedPanorama', { '../SphereViewer': { SphereViewer() {} }, '../../utils/imageOptimizer': {} });
  harness.render({ id });
  for (let i = 0; i < 5; i++) await flushPromises();
  const tree = harness.render({ id });
  assert.ok(elementText(tree).includes('Shared lake'), elementText(tree));
  assert.ok(elementText(tree).includes('Download shared panorama'));
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => !call.init.headers?.Authorization));
  assert.equal(calls.some(call => call.url.includes('guest')), false);
  harness.unmount(); assert.deepEqual(revoked, ['blob:shared-test']);
});

test('private works discards late account data and closes pending requests', async t => {
  let token = 'A';
  setGlobal(t, 'localStorage', { getItem: () => token });
  setGlobal(t, 'document', { activeElement: { focus() {} } });
  const pending = [];
  t.mock.method(globalThis, 'fetch', (url, init) => new Promise(resolve => pending.push({ url, init, resolve })));
  const harness = componentHarness('../src/components/commercial/MyWorks.tsx', 'MyWorks');
  const attach = tree => { const dialog = elementsIn(tree).find(e => e.type === 'dialog'); if (dialog) dialog.props.ref.current = { showModal() {}, close() {} }; };
  const props = { isOpen: true, accountId: 'A', onClose() {}, async onOpen() {} };
  harness.render(props, attach);
  token = 'B'; harness.render({ ...props, accountId: 'B' }, attach);
  assert.equal(pending[0].init.signal.aborted, true);
  pending[0].resolve(Response.json({ works: [{ id: 'a', prompt: 'Private A' }] }));
  pending[1].resolve(Response.json({ works: [{ id: 'b', prompt: 'Private B', width: 4000, height: 2000, model: 'test', created_at: Date.now() }] }));
  await flushPromises();
  const text = elementText(harness.render({ ...props, accountId: 'B' }, attach));
  assert.ok(text.includes('Private B')); assert.ok(!text.includes('Private A'));
  assert.ok(text.includes('Download original')); assert.ok(text.includes('Open panorama'));
  harness.unmount(); assert.equal(pending[1].init.signal.aborted, true);
});

for (const backend of ['Node', 'D1']) {
  test(`${backend}: slow generation plus 56-second review succeeds within the shared workflow and lease`, async t => {
    let generationStarted, reviewStarted, reviewSignal;
    const generating = new Promise(resolve => { generationStarted = resolve; });
    const reviewing = new Promise(resolve => { reviewStarted = resolve; });
    const fixture = await withBackend(t, backend, async () => {
      generationStarted();
      await new Promise(resolve => setTimeout(resolve, 140000));
      return imageResponse();
    }, async (_url, { signal }) => {
      reviewSignal = signal;
      reviewStarted();
      await new Promise(resolve => setTimeout(resolve, 56000));
      return Response.json({ choices: [{ message: { content: '{"passed":true,"issues":[],"explanation":"Coherent."}' } }] });
    });
    const logs = generationClock(t);
    const started = Date.now();
    const request = fixture.generate({ resolution: '2K' });
    await generating;
    assert.equal(fixture.leases()[0].expires_at, started + GENERATION_LEASE_MS);
    t.mock.timers.tick(140000);
    await reviewing;
    t.mock.timers.tick(30001);
    assert.equal(reviewSignal.aborted, false, 'review must survive both the old 30s review and 150s workflow limits');
    t.mock.timers.tick(25999);
    const result = await request;
    assert.equal(result.status, 200);
    assert.equal(result.data.quality.status, 'passed');
    assert.equal(result.data.quality.attempts, 1);
    assert.equal(result.data.creditsDeducted, 2);
    assert.equal(result.data.creditsRefunded, 0);
    assert.equal((await fixture.profile()).creditsBalance, 2);
    assert.deepEqual(fixture.leases(), []);
    const reviewLogs = logs.mock.calls.filter(call => call.arguments[0] === '[panorama-review]');
    assert.equal(reviewLogs.length, 1);
    assert.equal(JSON.parse(reviewLogs[0].arguments[1]).durationMs, 56000);
  });

  for (const phase of ['headers', 'body']) {
    test(`${backend}: review ${phase} timeout refunds once, preserves adjustments and releases the lease`, async t => {
      let reviewStarted, reviewSignal, imageCalls = 0;
      const reviewing = new Promise(resolve => { reviewStarted = resolve; });
      const fixture = await withBackend(t, backend, () => { imageCalls++; return imageResponse(); }, (_url, { signal }) => {
        reviewSignal = signal;
        const pending = () => new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('PRIVATE_PROVIDER_EXCEPTION')), { once: true });
          reviewStarted();
        });
        return phase === 'headers' ? pending() : { ok: true, status: 200, json: pending };
      });
      const logs = generationClock(t);
      const started = Date.now();
      const request = fixture.generate({ resolution: '4K' });
      await reviewing;
      assert.equal(fixture.leases()[0].expires_at, started + 270000);
      assert.equal((await fixture.profile()).creditsBalance, 0);
      assert.equal((await fixture.adjustCredits(5)).status, 200);
      t.mock.timers.tick(89999);
      assert.equal(reviewSignal.aborted, false);
      t.mock.timers.tick(1);
      const result = await request;
      assert.equal(result.status, 503);
      assert.equal(result.data.code, 'GENERATION_REVIEW_UNAVAILABLE');
      assert.equal(result.data.quality.attempts, 1);
      assert.equal(result.data.creditsDeducted, 0);
      assert.equal(result.data.creditsRefunded, 4);
      assert.equal(result.data.remainingCredits, 9);
      assert.equal((await fixture.profile()).creditsBalance, 9);
      assert.equal((await fixture.profile()).apiCallsCount, 1);
      assert.equal(imageCalls, 1);
      assert.deepEqual(fixture.leases(), []);
      const reviewLogs = logs.mock.calls.filter(call => call.arguments[0] === '[panorama-review]');
      assert.equal(reviewLogs.length, 1);
      assert.equal(JSON.parse(reviewLogs[0].arguments[1]).reason, 'timeout');
      assert.doesNotMatch(JSON.stringify([result, reviewLogs.map(call => call.arguments)]), /PRIVATE_PROVIDER_EXCEPTION/);
      if (backend === 'D1') assert.deepEqual((await fixture.call('works', undefined, fixture.token)).data.works, []);
    });
  }

  test(`${backend}: retry review obeys the earlier 240-second parent deadline and refunds once`, async t => {
    let generationStarted, firstReviewStarted, secondReviewStarted, secondSignal, reviews = 0, imageCalls = 0;
    const generating = new Promise(resolve => { generationStarted = resolve; });
    const firstReview = new Promise(resolve => { firstReviewStarted = resolve; });
    const secondReview = new Promise(resolve => { secondReviewStarted = resolve; });
    const fixture = await withBackend(t, backend, async () => {
      if (++imageCalls === 1) {
        generationStarted();
        await new Promise(resolve => setTimeout(resolve, 140000));
      }
      return imageResponse();
    }, async (_url, { signal }) => {
      if (++reviews === 1) {
        firstReviewStarted();
        await new Promise(resolve => setTimeout(resolve, 80000));
        return Response.json({ choices: [{ message: { content: '{"passed":false,"issues":["collage"],"explanation":"Band."}' } }] });
      }
      secondSignal = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        secondReviewStarted();
      });
    });
    const logs = generationClock(t);
    const started = Date.now();
    const request = fixture.generate({ resolution: '2K' });
    await generating;
    t.mock.timers.tick(140000);
    await firstReview;
    t.mock.timers.tick(80000);
    await secondReview;
    t.mock.timers.tick(19999);
    assert.equal(secondSignal.aborted, false);
    assert.equal(fixture.leases()[0].expires_at, started + 270000);
    t.mock.timers.tick(1);
    assert.equal(Date.now() - started, GENERATION_WORKFLOW_TIMEOUT_MS);
    const result = await request;
    assert.equal(result.status, 503);
    assert.equal(result.data.code, 'GENERATION_REVIEW_UNAVAILABLE');
    assert.equal(result.data.quality.attempts, 2);
    assert.equal(result.data.creditsDeducted, 0);
    assert.equal(result.data.creditsRefunded, 2);
    assert.equal((await fixture.profile()).creditsBalance, 4);
    assert.equal((await fixture.profile()).apiCallsCount, 2);
    assert.equal(imageCalls, 2);
    assert.deepEqual(fixture.leases(), []);
    const reviewLogs = logs.mock.calls.filter(call => call.arguments[0] === '[panorama-review]').map(call => JSON.parse(call.arguments[1]));
    assert.deepEqual(reviewLogs.map(entry => [entry.status, entry.reason, entry.durationMs]), [
      ['failed', null, 80000], ['unavailable', 'parent_abort', 20000],
    ]);
  });

  test(`${backend}: quality failure on attempt 1 retries once with static correction and reference images, then passes with a single debit`, async testContext => {
    const imagePayloads = [];
    let reviews = 0;
    const fixture = await withBackend(
      testContext,
      backend,
      (_url, options) => {
        imagePayloads.push(JSON.parse(options.body));
        return Response.json({ choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,AA==' } }] } }] });
      },
      () => {
        reviews++;
        const verdict = reviews === 1
          ? { passed: false, issues: ['collage', 'duplicate_subject'], explanation: 'UNTRUSTED_EXPLANATION_TEXT' }
          : { passed: true, issues: [], explanation: 'Clean retry.' };
        return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(verdict) } }] });
      }
    );
    const result = await fixture.generate({
      endpointId: 'gemini-proxy',
      resolution: '2K',
      prompt: 'Extend the golf cart scene',
      referenceImages: ['data:image/png;base64,AA=='],
    });
    assert.equal(result.status, 200);
    assert.equal(imagePayloads.length, 2);
    assert.equal(reviews, 2);
    assert.equal(imagePayloads[0].messages[0].content[1].image_url.url, 'data:image/png;base64,AA==');
    assert.equal(imagePayloads[1].messages[0].content[1].image_url.url, 'data:image/png;base64,AA==');
    assert.match(imagePayloads[1].messages[0].content[0].text, /Panorama quality corrections:/);
    assert.match(imagePayloads[1].messages[0].content[0].text, /remove stacked bands, panels, collages and multiple horizons/);
    assert.doesNotMatch(imagePayloads[1].messages[0].content[0].text, /UNTRUSTED_EXPLANATION_TEXT/);
    assert.deepEqual(result.data.quality, {
      status: 'passed',
      issues: [],
      explanation: 'Clean retry.',
      reviewModel: 'gemini-3-flash',
      attempts: 2,
    });
    assert.equal(result.data.creditsDeducted, 2);
    assert.equal(result.data.creditsRefunded, 0);
    assert.equal(result.data.remainingCredits, 2);
    const profile = await fixture.profile();
    assert.equal(profile.creditsBalance, 2);
    assert.equal(profile.apiCallsCount, 2);
  });

  test(`${backend}: two quality failures reject with 422, refund once preserving admin adjustments, and do not save work`, async testContext => {
    let imageCalls = 0;
    let fixture;
    fixture = await withBackend(
      testContext,
      backend,
      async () => {
        if (++imageCalls === 1) assert.equal((await fixture.adjustCredits(5)).status, 200);
        return imageResponse();
      },
      () => Response.json({
        choices: [{
          finish_reason: 'stop',
          message: { content: JSON.stringify({ passed: false, issues: ['collage'], explanation: 'Stacked band remains.' }) },
        }],
      })
    );
    const result = await fixture.generate({ resolution: '2K' });
    assert.equal(result.status, 422);
    assert.equal(result.data.code, 'GENERATION_QUALITY_REJECTED');
    assert.equal(result.data.quality.status, 'failed');
    assert.equal(result.data.quality.attempts, 2);
    assert.equal(result.data.creditsDeducted, 0);
    assert.equal(result.data.creditsRefunded, 2);
    assert.equal(result.data.remainingCredits, 9);
    assert.equal(imageCalls, 2);
    const profile = await fixture.profile();
    assert.equal(profile.creditsBalance, 9);
    assert.equal(profile.apiCallsCount, 2);
    if (backend === 'D1') {
      const works = await fixture.call('works', undefined, fixture.token);
      assert.deepEqual(works.data.works, []);
    }
  });

  test(`${backend}: unavailable quality review stops after attempt 1 with 503 and refunds without retrying`, async testContext => {
    let imageCalls = 0;
    const fixture = await withBackend(
      testContext,
      backend,
      () => {
        imageCalls++;
        return imageResponse();
      },
      () => Response.json({ error: 'Reviewer down' }, { status: 500 })
    );
    const result = await fixture.generate({ resolution: '2K' });
    assert.equal(result.status, 503);
    assert.equal(result.data.code, 'GENERATION_REVIEW_UNAVAILABLE');
    assert.equal(result.data.quality.status, 'unavailable');
    assert.equal(result.data.quality.attempts, 1);
    assert.equal(result.data.creditsDeducted, 0);
    assert.equal(result.data.creditsRefunded, 2);
    assert.equal(result.data.remainingCredits, 4);
    assert.equal(imageCalls, 1);
    assert.equal((await fixture.profile()).creditsBalance, 4);
  });
}

test('generateWithGemini throws PanoramaQualityError on 422 and 503 without falling back to direct endpoints', async testContext => {
  setGlobal(testContext, 'window', { location: { hostname: 'review.example' } });
  const { generateWithGemini } = loadTsModule('../src/utils/geminiClient.ts', { './adminStorage': {} });
  for (const [status, code, match] of [
    [422, 'GENERATION_QUALITY_REJECTED', /did not pass the AI quality check/],
    [503, 'GENERATION_REVIEW_UNAVAILABLE', /AI quality check could not be completed/],
  ]) {
    let calls = 0;
    testContext.mock.method(globalThis, 'fetch', async url => {
      calls++;
      assert.equal(url, '/api/generate');
      return Response.json({ success: false, code, creditsDeducted: 0, creditsRefunded: 4, remainingCredits: 4 }, { status });
    });
    await assert.rejects(
      () => generateWithGemini('Prompt', { baseUrl: 'http://127.0.0.1:8317', apiKey: '', model: 'gemini-3.1-flash-image', sessionToken: 'tok' }),
      err => err.name === 'PanoramaQualityError' && match.test(err.message)
    );
    assert.equal(calls, 1);
  }
});

test('GeneratorTab stops model failover on PanoramaQualityError, refreshes profile and preserves current preview', async () => {
  const calls = [];
  let refreshed = 0;
  const fixture = generatorRegressionContext({
    window: { dispatchEvent: event => { if (event.type === 'panorama-user-refresh') refreshed++; } },
    getModelExecutionPipeline: () => ({
      mode: 'failover',
      endpoints: [
        { id: 'gemini', name: 'Gemini', model: 'gemini-3.1-flash-image' },
        { id: 'gpt', name: 'GPT', model: 'gpt-image-2.5' },
      ],
    }),
    generateWithGemini: async (_prompt, config) => {
      calls.push(config.endpointId);
      const error = new Error('The panorama did not pass the AI quality check after one retry. Your credits were returned.');
      error.name = 'PanoramaQualityError';
      throw error;
    },
    confetti: () => assert.fail('Rejected quality must not trigger confetti'),
  });
  await fixture.generate();
  assert.deepEqual(calls, ['gemini']);
  assert.equal(refreshed, 1);
  assert.equal(fixture.state.some(([key]) => key === 'panorama'), false);
  assert.ok(fixture.state.some(([key, value]) => key === 'setApiError' && value?.includes('did not pass the AI quality check')));
});
