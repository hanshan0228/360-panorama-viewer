import { emailTestEnv, challengeToken, emailServicesFixture } from './email_services_fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { onRequest, __resetEdgeRateLimits } from '../functions/api/[[route]].ts';
import { createCommercialServer, hashPassword, writeStore } from '../server/commercial-server.mjs';
import { markAdminServerMode, getStoredAdminPassword, setStoredAdminPassword } from '../src/utils/adminStorage.ts';
import { adminUpdateCredentialsServer } from '../src/utils/commercialApi.ts';

const password = 'isolated-admin-password';

async function backendFixture(context, backend, upstream = () => Response.json({ error: 'unsupported references' }, { status: 400 })) {
  const emailServices = emailServicesFixture(upstream);
  if (backend === 'D1') {
    // The worker module keeps per-isolate rate-limit counters; each fixture starts from a clean slate.
    __resetEdgeRateLimits();
    const database = new DatabaseSync(':memory:');
    context.after(() => database.close());
    context.mock.method(globalThis, 'fetch', emailServices.fetch);
    const db = {
      prepare(sql) {
        let values = [];
        const statement = {
          bind(...parameters) { values = parameters; return statement; },
          async run() { return { meta: { changes: Number(database.prepare(sql).run(...values).changes) } }; },
          async first() { return database.prepare(sql).get(...values) ?? null; },
          async all() { return { results: database.prepare(sql).all(...values) }; },
        };
        return statement;
      },
      async batch(statements) {
        database.exec('BEGIN');
        try {
          const results = [];
          for (const statement of statements) results.push(await statement.run());
          database.exec('COMMIT');
          return results;
        } catch (error) {
          database.exec('ROLLBACK');
          throw error;
        }
      },
    };
    const call = async (route, body, token) => onRequest({ env: { ...emailTestEnv, DB: db, ADMIN_PASSWORD: password }, request: new Request(`https://test.invalid/api/${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(route === 'user/auth' ? { birthDate: '1990-01-01', turnstileToken: challengeToken(), ...body } : body) }),
    }) });
    return Object.assign(call, { emailServices });
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-admin-security-'));
  const file = path.join(directory, 'store.json');
  writeStore({ schemaVersion: 2, adminPasswordHash: hashPassword(password), users: [], subscriptions: [], invoices: [] }, file);
  const server = createCommercialServer({ storeFile: file, env: { ...emailTestEnv }, fetch: emailServices.fetch });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const call = (route, body, token) => fetch(`http://127.0.0.1:${server.address().port}/api/${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(route === 'user/auth' ? { birthDate: '1990-01-01', turnstileToken: challengeToken(), ...body } : body) }),
  });
  return Object.assign(call, { emailServices });
}

for (const backend of ['Node', 'D1']) {
  test(`${backend}: canonical password validation and rotation revoke both sessions`, async context => {
    const call = await backendFixture(context, backend);
    const login = async (username = 'admin', secret = password) => (await (await call('admin/login', { username, password: secret })).json()).token;
    const tokens = [await login(), await login()];
    for (const newPassword of ['      ', '  abc  ', 123456, 'a'.repeat(1025)]) {
      assert.equal((await call('admin/credentials', { currentPassword: password, newPassword }, tokens[0])).status, 400);
      assert.equal((await call('admin/store', undefined, tokens[0])).status, 200);
    }
    assert.equal((await call('admin/credentials', { currentPassword: password, newUsername: 'owner', newPassword: '  replacement-password  ' }, tokens[0])).status, 200);
    for (const token of tokens) {
      assert.equal((await call('admin/store', undefined, token)).status, 401);
      assert.equal((await call('admin/billing', { config: { freeMonthlyCredits: 500 } }, token)).status, 401);
    }
    assert.equal((await call('admin/login', { username: 'admin', password })).status, 401);
    assert.ok(await login('owner', 'replacement-password'));
  });

  test(`${backend}: trial configuration only grants credits after email verification`, async context => {
    for (const value of [undefined, 0, 9, Number.MAX_SAFE_INTEGER]) {
      const call = await backendFixture(context, backend);
      const admin = await (await call('admin/login', { username: 'admin', password })).json();
      assert.equal((await call('user/guest', {})).status, 403);
      const config = value === undefined ? {} : { freeMonthlyCredits: value };
      assert.equal((await call('admin/billing', { config }, admin.token)).status, 200);
      const email = `${crypto.randomUUID()}@example.com`;
      const account = await (await call('user/auth', { email, password })).json();
      assert.equal(account.user.creditsBalance, 0);
      const verified = await call('user/verify-email', { token: call.emailServices.latestToken(email) });
      assert.equal(verified.status, 200);
      const { user } = await (await call('user/me', undefined, account.token)).json();
      const expected = value === Number.MAX_SAFE_INTEGER ? 0 : value ?? 8;
      assert.equal(user.creditsBalance, expected);
      assert.equal(user.creditsTotal, expected);
      for (const invalid of [-1, 1.5, '9', null, Number.MAX_SAFE_INTEGER + 1]) {
        assert.equal((await call('admin/billing', { config: { freeMonthlyCredits: invalid } }, admin.token)).status, 400);
      }
    }
  });

  test(`${backend}: upstream reference rejection never retries or charges`, async context => {
    const requests = [];
    const call = await backendFixture(context, backend, (_url, options) => {
      requests.push(JSON.parse(options.body));
      return requests.length === 1 ? Response.json({ error: 'unsupported references' }, { status: 400 })
        : Response.json({ choices: [{ message: { content: 'data:image/png;base64,AA==' } }] });
    });
    const admin = await (await call('admin/login', { username: 'admin', password })).json();
    assert.equal((await call('admin/models', { endpoints: [{ id: 'ref', name: 'Reference model', baseUrl: 'https://mock.invalid/v1', model: 'gemini-test', isEnabled: true, isDefault: true }] }, admin.token)).status, 200);
    const guest = await (await call('user/auth', { email: 'reference@example.test', password })).json();
    assert.equal((await call('user/verify-email', { token: call.emailServices.latestToken('reference@example.test') })).status, 200);
    const response = await call('generate', { prompt: 'a panorama', endpointId: 'ref', referenceImages: ['data:image/png;base64,AA=='] }, guest.token);
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /400/);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].messages[0].content[1].image_url.url, 'data:image/png;base64,AA==');
    const profile = await (await call('user/me', undefined, guest.token)).json();
    assert.equal(profile.user.creditsBalance, 8);
    assert.equal(profile.user.apiCallsCount, 0);
  });
}

function storage() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
}

function browserStorage(context) {
  for (const name of ['localStorage', 'sessionStorage']) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value: storage() });
    context.after(() => previous ? Object.defineProperty(globalThis, name, previous) : delete globalThis[name]);
  }
}

function loadHandler(name, nextName, bindings) {
  const source = fs.readFileSync(new URL('../src/components/AdminTab.tsx', import.meta.url), 'utf8');
  const start = source.indexOf(`  const ${name} = `);
  const end = source.indexOf(nextName === 'handleAdminLogout' ? '  function handleAdminLogout()' : `  const ${nextName} = `, start);
  assert.ok(start >= 0 && end > start);
  const output = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return Function(...Object.keys(bindings), `${output}; return ${name};`)(...Object.values(bindings));
}

test('server migration removes cached secrets while offline demo password remains usable', context => {
  browserStorage(context);
  setStoredAdminPassword('demo-password');
  assert.equal(getStoredAdminPassword(), 'demo-password');
  markAdminServerMode();
  assert.equal(localStorage.getItem('panorama_admin_secure_password'), null);
  assert.equal(sessionStorage.getItem('panorama_admin_server_mode'), 'true');
});

test('password form validates canonical input, never caches server passwords, and logs out after rotation or 401', async context => {
  browserStorage(context);
  for (const scenario of ['blank', 'short', 'success', 'unauthorized', 'failure', 'offline']) {
    let writes = 0;
    let logouts = 0;
    let requests = 0;
    let errors = 0;
    const candidate = scenario === 'blank' ? '      ' : scenario === 'short' ? '  abc  ' : '  replacement-password  ';
    const bindings = {
      isServerMode: scenario !== 'offline', currentPwdInput: password, newPwdInput: candidate, confirmNewPwdInput: candidate,
      adminUsernameEdit: 'owner', markAdminServerMode, verifyAdminPassword: () => true,
      adminUpdateCredentialsServer: async (_old, _username, canonical) => {
        requests++;
        assert.equal(canonical, 'replacement-password');
        return { success: scenario === 'success', requiresLogin: scenario === 'unauthorized', error: 'failed' };
      },
      handleAdminLogout: () => { logouts++; }, setStoredAdminPassword: () => { writes++; },
      setPwdErrorMsg: error => { if (error) errors++; },
      setStoredAdminUsername() {}, setLoginUsernameInput() {}, setCurrentPwdInput() {}, setNewPwdInput() {}, setConfirmNewPwdInput() {}, showToast() {},
    };
    await loadHandler('handleChangePassword', 'handleResetDefaultPassword', bindings)({ preventDefault() {} });
    assert.equal(writes, scenario === 'offline' ? 1 : 0);
    assert.equal(logouts, ['success', 'unauthorized'].includes(scenario) ? 1 : 0);
    assert.equal(requests, ['success', 'unauthorized', 'failure'].includes(scenario) ? 1 : 0);
    assert.equal(errors, ['blank', 'short', 'unauthorized', 'failure'].includes(scenario) ? 1 : 0);
  }
});

test('server login errors and offline server sessions cannot fall back to demo authentication', async context => {
  browserStorage(context);
  for (const online of [true, false]) {
    markAdminServerMode();
    let demoAttempts = 0;
    context.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
    const handler = loadHandler('handleAdminLogin', 'handleAdminLogout', {
      probeBackendHealth: async () => ({ isOnline: online }), markAdminServerMode,
      loginUsernameInput: 'admin', loginPasswordInput: 'admin888', setLoginErrorMsg() {},
      verifyAdminCredentials: () => { demoAttempts++; return true; },
    });
    await handler({ preventDefault() {} });
    assert.equal(demoAttempts, 0);
  }
});

test('credential API treats HTTP failures as failures even when body claims success', async context => {
  browserStorage(context);
  context.mock.method(globalThis, 'fetch', async () => Response.json({ success: true }, { status: 401 }));
  assert.deepEqual(await adminUpdateCredentialsServer(password, 'owner', 'replacement-password'), { success: false, error: undefined, requiresLogin: true });
});

test('public admin never falls back to local demo credentials when the backend is unreachable',async context=>{
 browserStorage(context);
 let demoAttempts=0;const errors=[];
 const handler=loadHandler('handleAdminLogin','handleAdminLogout',{
   window:{location:{hostname:'panorama-generator.pages.dev'}},
   probeBackendHealth:async()=>({isOnline:false}),
   setLoginErrorMsg:message=>errors.push(message),
   verifyAdminCredentials:()=>{demoAttempts++;return true;},
 });
 await handler({preventDefault(){}});assert.equal(demoAttempts,0);assert.ok(errors.some(Boolean));
});
