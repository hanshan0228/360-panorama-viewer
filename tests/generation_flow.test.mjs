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
import { onRequest } from '../functions/api/[[route]].ts';
import { createCommercialServer, hashPassword, readStore, writeStore } from '../server/commercial-server.mjs';
import * as commercialApi from '../src/utils/commercialApi.ts';
import * as adminStorage from '../src/utils/adminStorage.ts';

const adminPassword = 'isolated-generation-password';
const imageResponse = () => Response.json({ data: [{ b64_json: 'AA==' }] });

function sqliteD1(database) {
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

async function withBackend(testContext, backend, fetchUpstream = imageResponse) {
  let call;
  let setUser;
  if (backend === 'D1') {
    const database = new DatabaseSync(':memory:');
    const db = sqliteD1(database);
    testContext.after(() => database.close());
    testContext.mock.method(globalThis, 'fetch', fetchUpstream);
    call = async (route, body, token) => {
      const request = new Request(`https://review.example/api/${route}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const response = await onRequest({ request, env: { DB: db, ADMIN_PASSWORD: adminPassword } });
      return { status: response.status, data: await response.json() };
    };
    setUser = (userId, credits, status = 'active') => {
      database.prepare('UPDATE users SET credits_balance = ?, status = ? WHERE id = ?')
        .run(credits, status, userId);
    };
  } else {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-generation-'));
    const file = path.join(directory, 'store.json');
    writeStore({ schemaVersion: 2, adminPasswordHash: hashPassword(adminPassword),
      users: [], subscriptions: [], invoices: [] }, file);
    const server = createCommercialServer({ storeFile: file, env: {}, fetch: fetchUpstream });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    testContext.after(async () => {
      await new Promise(resolve => server.close(resolve));
      fs.rmSync(directory, { recursive: true, force: true });
    });
    const base = `http://127.0.0.1:${server.address().port}/api/`;
    call = async (route, body, token) => {
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
  const endpoints = [
    { id: 'image', baseUrl: 'https://model.example/v1', model: 'image-model',
      apiKey: 'synthetic-test-key', isEnabled: true, isDefault: true },
    { id: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-image-model',
      apiKey: 'synthetic-google-key', isEnabled: true },
    { id: 'imagen', baseUrl: 'https://generativelanguage.googleapis.com', model: 'imagen-model',
      apiKey: 'synthetic-google-key', isEnabled: true },
  ];
  assert.equal((await call('admin/models', { endpoints }, adminToken)).status, 200);
  const guest = await call('user/guest', {});
  assert.equal(guest.status, 200);
  const userId = guest.data.user.id;
  const token = guest.data.token;
  return {
    call,
    token,
    setUser: (credits, status) => setUser(userId, credits, status),
    billing: config => call('admin/billing', { config }, adminToken),
    adjustCredits: delta => call('admin/users/credits', { userId, delta }, adminToken),
    profile: async () => (await call('user/me', undefined, token)).data.user,
    generate: body => call('generate', { prompt: 'Synthetic test', endpointId: 'image', ...body }, token),
  };
}

for (const backend of ['Node', 'D1']) {
  test(`${backend}: rejects Imagen reference input without charging, while text generation works`, async testContext => {
    let calls = 0;
    const fixture = await withBackend(testContext, backend, url => {
      calls++;
      assert.ok(String(url).includes(':predict'));
      return Response.json({ predictions: [{ bytesBase64Encoded: 'AA==' }] });
    });
    const rejected = await fixture.generate({ endpointId: 'imagen', resolution: '1K', referenceImages: ['data:image/png;base64,AA=='] });
    assert.equal(rejected.status, 400);
    assert.ok(rejected.data.error.includes('不支持参考图片'));
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

test('D1: request deadline covers response body parsing and releases credits', async testContext => {
  let startParsing;
  const parsingStarted = new Promise(resolve => { startParsing = resolve; });
  const fixture = await withBackend(testContext, 'D1', (url, options) => {
    const response = Response.json({ data: [] });
    response.json = () => new Promise((resolve, reject) => {
      startParsing();
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    return response;
  });
  testContext.mock.timers.enable({ apis: ['setTimeout'] });
  const request = fixture.generate({ resolution: '4K' });
  await parsingStarted;
  assert.equal((await fixture.profile()).creditsBalance, 0);
  testContext.mock.timers.tick(90000);
  assert.equal((await request).status, 504);
  assert.equal((await fixture.profile()).creditsBalance, 4);
});

function loadTsModule(relativePath, overrides = {}) {
  const source = fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const nativeRequire = createRequire(import.meta.url);
  const module = { exports: {} };
  new Function('require', 'exports', 'module', output)(specifier => (
    Object.hasOwn(overrides, specifier) ? overrides[specifier] : nativeRequire(specifier)
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
    assert.ok(markup.includes('登录 PanoramaAI 账户'));
    assert.ok(markup.includes('点击注册新账户'));
    assert.ok(!markup.includes('退出登录当前账户'));
  }
  const account = render('usr_registered');
  assert.ok(!account.includes('<form'));
  assert.ok(account.includes('我的账户信息'));
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
  const output = ts.transpileModule('const handler = ' + text + ';', {
    compilerOptions: { target: ts.ScriptTarget.ES2023 },
  }).outputText;
  return new Function('context', `const {${Object.keys(context).join(',')}} = context; ${output}; return handler;`)(context);
}

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}

const accountFixture = (id = 'usr_account') => ({ id, name: 'Test Account', email: 'test@example.com', plan: 'free',
  creditsBalance: 4, creditsTotal: 4, apiCallsCount: 0, status: 'active' });
const flushPromises = () => new Promise(resolve => setImmediate(resolve));

function appHarness(testContext, overrides = {}) {
  setGlobal(testContext, 'localStorage', memoryStorage());
  setGlobal(testContext, 'window', { addEventListener: () => {}, removeEventListener: () => {} });
  const state = {};
  const context = {
    ...adminStorage,
    setCurrentUser: user => { state.user = user; },
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
  test(`profile ${status} clears invalid identity and initializes a controlled guest session`, async testContext => {
    const harness = appHarness(testContext);
    harness.context.updateCurrentUser(accountFixture());
    localStorage.setItem('panorama_server_user_token', 'invalid-token');
    testContext.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Invalid account' }, { status }));
    const cleanup = harness.effect();
    await flushPromises();
    assert.equal(localStorage.getItem('panorama_server_user_token'), 'guest-token');
    assert.equal(harness.state.user.id, 'usr_guest_test');
    assert.equal(adminStorage.getCurrentUser().id, 'usr_guest_test');
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

test('server guest debit updates the active App identity rather than an old guest snapshot', async testContext => {
  const harness = appHarness(testContext);
  const cleanup = harness.effect();
  await flushPromises();
  const source = fs.readFileSync(new URL('../src/components/GeneratorTab.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('// Synchronize credits upon generation success');
  const end = source.indexOf('setGenerationProgress(100);', start);
  assert.ok(start >= 0 && end > start);
  callbackWithContext(`()=>{${source.slice(start, end)}}`, {
    ...adminStorage, user: harness.state.user, serverRemaining: 2, serverCost: 2, creditsCost: 2,
    onUserChange: harness.context.updateCurrentUser, hadFailover: false, usedEndpointName: 'Test',
    setFeedbackNotice: () => {}, setIsCheckoutOpen: () => {}, setTimeout: () => {},
  })();
  assert.equal(harness.state.user.id, 'usr_guest_test');
  assert.equal(harness.state.user.creditsBalance, 2);
  assert.equal(adminStorage.getCurrentUser().creditsBalance, 2);
  assert.ok(!source.includes('const [currentUser, setCurrentUser]'));
  cleanup();
});

test('guest initializer returns credentials without mutating the callers active session', async testContext => {
  setGlobal(testContext, 'localStorage', memoryStorage());
  localStorage.setItem('panorama_server_user_token', 'active-token');
  testContext.mock.method(globalThis, 'fetch', async () => Response.json({ success: true, user: accountFixture('usr_guest_test'), token: 'guest-token' }));
  const result = await commercialApi.initServerGuestUser();
  assert.equal(result.token, 'guest-token');
  assert.equal(localStorage.getItem('panorama_server_user_token'), 'active-token');
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
    setApiError: message => { error = message; },
  });
  localStorage.setItem('panorama_server_user_token', 'valid-token');
  assert.equal(check(), true);
  assert.equal(error, undefined);
  localStorage.removeItem('panorama_server_user_token');
  assert.equal(check(), undefined);
  assert.ok(error.includes('积分不足'));
});

test('generation finishing after an account switch does not overwrite the new account', () => {
  const source = fs.readFileSync(new URL('../src/components/GeneratorTab.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('if (getCurrentUser().id !== user.id)');
  const end = source.indexOf('setGenerationProgress(100);', start);
  assert.ok(start >= 0 && end > start);
  let updates = 0;
  let generating = true;
  callbackWithContext(`()=>{${source.slice(start, end)}}`, {
    user: accountFixture('usr_old'), getCurrentUser: () => accountFixture('usr_new'),
    onUserChange: () => { updates++; }, setIsGenerating: value => { generating = value; },
  })();
  assert.equal(updates, 0);
  assert.equal(generating, false);
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
