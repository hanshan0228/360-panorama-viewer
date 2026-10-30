import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { onRequest, __resetEdgeRateLimits } from '../functions/api/[[route]].ts';
import { createCommercialServer, readStore, writeStore } from '../server/commercial-server.mjs';
import { createD1VerificationLedger, createJsonVerificationLedger, verificationTokenHash } from '../server/emailVerification.mjs';
import { emailTestEnv, challengeToken, emailServicesFixture } from './email_services_fixture.mjs';

async function fixture(t, backend, overrides = {}) {
  const services = emailServicesFixture();
  const env = { ...emailTestEnv, ...overrides };
  let call, read, save, ledger, sqlite;
  if (backend === 'D1') {
    __resetEdgeRateLimits();
    sqlite = new DatabaseSync(':memory:');
    t.after(() => sqlite.close());
    t.mock.method(globalThis, 'fetch', (url, options) => services.fetch(url, options));
    let queue = Promise.resolve();
    const db = {
      prepare(sql) {
        let values = [];
        return {
          bind(...args) { values = args; return this; },
          async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; },
          async first() { return sqlite.prepare(sql).get(...values) || null; },
          async all() { return { results: sqlite.prepare(sql).all(...values) }; },
        };
      },
      batch(statements) {
        const execute = async () => {
          sqlite.exec('BEGIN');
          try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; }
          catch (error) { sqlite.exec('ROLLBACK'); throw error; }
        };
        const pending = queue.then(execute);
        queue = pending.catch(() => {});
        return pending;
      },
    };
    ledger = createD1VerificationLedger(db);
    call = async (route, body, token) => {
      const response = await onRequest({ env: { ...env, DB: db }, request: new Request('https://review.example/api/' + route, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.20', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }) });
      return { status: response.status, data: await response.json() };
    };
  } else {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-email-test-'));
    const file = path.join(directory, 'store.json');
    writeStore({ users: [], subscriptions: [], invoices: [] }, file);
    read = () => readStore(file); save = store => writeStore(store, file);
    ledger = createJsonVerificationLedger(read, save);
    const server = createCommercialServer({ storeFile: file, env, fetch: (url, options) => services.fetch(url, options) });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); });
    call = async (route, body, token) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/` + route, {
        method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, data: await response.json() };
    };
  }
  await call('billing');
  const register = email => call('user/auth', { mode: 'register', birthDate: '1990-01-01', email, password: 'synthetic-email-password', turnstileToken: challengeToken() });
  const verify = email => call('user/verify-email', { token: services.latestToken(email) });
  return { services, env, call, register, verify, ledger, sqlite, read, save };
}

for (const backend of ['D1', 'Node']) {
  test(`${backend}: missing, malformed and underage birth dates cannot create accounts or send email`, async t => {
    const api = await fixture(t, backend);
    for (const mode of ['register', undefined]) {
      for (const [birthDate, expected] of [[undefined, 400], ['2008-02-30', 400], ['2999-01-01', 400], ['2020-01-01', 403], [null, 400]]) {
        const response = await api.call('user/auth', { mode, birthDate, email: 'age-screen@example.com', password: 'synthetic-password', turnstileToken: challengeToken() });
        assert.equal(response.status, expected);
      }
    }
    assert.equal(api.services.mails.length, 0);
    assert.equal(api.sqlite ? api.sqlite.prepare('SELECT COUNT(*) AS total FROM users').get().total : api.read().users.length, 0);
  });

  test(`${backend}: accepted birth dates are not stored and returning users can sign in without one`, async t => {
    const api = await fixture(t, backend);
    const registration = await api.register('adult@example.com');
    assert.equal(registration.status, 200);
    const stored = api.sqlite ? api.sqlite.prepare('SELECT * FROM users').all() : api.read();
    assert.ok(!JSON.stringify(stored).includes('1990-01-01'));
    assert.ok(!JSON.stringify(registration.data).includes('1990-01-01'));
    const login = await api.call('user/auth', { mode: 'login', email: 'adult@example.com', password: 'synthetic-email-password' });
    assert.equal(login.status, 200);
    assert.equal(login.data.user.id, registration.data.user.id);
  });

  test(`${backend}: zero credits before verification, eight once, replay and concurrent confirmation cannot duplicate them`, async t => {
    const api = await fixture(t, backend);
    const account = await api.register('owner@example.com');
    assert.equal(account.status, 200);
    assert.equal(account.data.verificationSent, true);
    assert.equal(account.data.user.creditsBalance, 0);
    assert.equal(account.data.user.emailVerified, false);
    assert.equal((await api.call('generate', { prompt: 'test' }, account.data.token)).data.code, 'EMAIL_VERIFICATION_REQUIRED');
    const secret = api.services.latestToken('owner@example.com');
    const state = await api.ledger.state(account.data.user.id);
    assert.equal(state.token_hash, await verificationTokenHash(secret));
    assert.ok(!JSON.stringify(state).includes(secret));
    const confirmations = await Promise.all([api.verify('owner@example.com'), api.verify('owner@example.com')]);
    assert.ok(confirmations.every(response => response.status === 200));
    assert.equal(confirmations.reduce((sum, response) => sum + response.data.creditsGranted, 0), 8);
    const profile = (await api.call('user/me', undefined, account.data.token)).data.user;
    assert.equal(profile.emailVerified, true);
    assert.equal(profile.creditsBalance, 8);
    assert.equal(profile.creditsTotal, 8);
    assert.equal((await api.verify('owner@example.com')).data.creditsGranted, 0);
    assert.ok(!JSON.stringify(profile).includes(state.token_hash));
  });

  test(`${backend}: a second verified email on the same network receives no second trial`, async t => {
    const api = await fixture(t, backend);
    for (const [email, expected] of [['one@example.com', 8], ['two@example.com', 0]]) {
      assert.equal((await api.register(email)).status, 200);
      assert.equal((await api.verify(email)).data.creditsGranted, expected);
    }
  });

  test(`${backend}: two accounts confirming concurrently still share one network grant`, async t => {
    const api = await fixture(t, backend);
    await api.register('parallel-one@example.com'); await api.register('parallel-two@example.com');
    const results = await Promise.all([api.verify('parallel-one@example.com'), api.verify('parallel-two@example.com')]);
    assert.ok(results.every(result => result.status === 200));
    assert.equal(results.reduce((sum, result) => sum + result.data.creditsGranted, 0), 8);
  });

  test(`${backend}: resending is authenticated and throttled, expires old links and never gives a second gift`, async t => {
    let now = Date.now(); t.mock.method(Date, 'now', () => now);
    const api = await fixture(t, backend);
    const account = await api.register('resend@example.com');
    const first = api.services.latestToken('resend@example.com');
    assert.equal((await api.call('user/send-verification', { turnstileToken: challengeToken('verify-email') })).status, 401);
    assert.equal((await api.call('user/send-verification', { turnstileToken: challengeToken('verify-email') }, account.data.token)).status, 429);
    now += 61000;
    assert.equal((await api.call('user/send-verification', { turnstileToken: challengeToken('verify-email') }, account.data.token)).status, 200);
    assert.equal((await api.call('user/verify-email', { token: first })).status, 400);
    assert.equal((await api.verify('resend@example.com')).data.creditsGranted, 8);
    assert.equal(api.services.mails.length, 2);
  });

  test(`${backend}: expired or malformed tokens cannot verify or receive credits`, async t => {
    let now = Date.now(); t.mock.method(Date, 'now', () => now);
    const api = await fixture(t, backend);
    const account = await api.register('expiry@example.com');
    for (const token of ['', 'not-a-token', 'a'.repeat(64), 123, null]) {
      assert.equal((await api.call('user/verify-email', { token })).status, 400);
    }
    now += 31 * 60000;
    assert.equal((await api.verify('expiry@example.com')).status, 400);
    assert.equal((await api.call('user/me', undefined, account.data.token)).data.user.creditsBalance, 0);
  });

  test(`${backend}: missing mail configuration and invalid security challenges fail closed; guests cannot mint credits`, async t => {
    const api = await fixture(t, backend, { RESEND_API_KEY: '' });
    assert.equal((await api.call('user/auth-config')).data.registrationAvailable, false);
    assert.equal((await api.register('no-mail@example.com')).status, 503);
    assert.equal((await api.call('user/guest', {})).status, 403);
    assert.equal((await api.call('user/auth', { mode: 'login', email: 'no-mail@example.com', password: 'synthetic-email-password' })).status, 401);
    assert.equal(api.services.mails.length, 0);
  });

  test(`${backend}: security challenge is single-use and bound to the action and hostname`, async t => {
    const api = await fixture(t, backend);
    const register = (email, token) => api.call('user/auth', { mode: 'register', birthDate: '1990-01-01', email, password: 'synthetic-email-password', turnstileToken: token });
    assert.equal((await register('missing@example.com')).status, 400);
    assert.equal((await register('wrong-action@example.com', challengeToken('verify-email'))).status, 400);
    const proof = challengeToken();
    assert.equal((await register('valid@example.com', proof)).status, 200);
    assert.equal((await register('replayed@example.com', proof)).status, 400);
    api.env.APP_ORIGIN = 'https://different.example';
    assert.equal((await register('wrong-host@example.com', challengeToken())).status, 400);
  });

  test(`${backend}: legacy accounts verify without re-granting or losing their previous credits`, async t => {
    const api = await fixture(t, backend);
    const account = await api.register('legacy@example.com');
    if (api.sqlite) {
      api.sqlite.prepare('DELETE FROM email_verifications WHERE user_id = ?').run(account.data.user.id);
      api.sqlite.prepare('UPDATE users SET credits_balance = 27, credits_total = 40 WHERE id = ?').run(account.data.user.id);
    } else {
      const store = api.read(); delete store.emailVerifications[account.data.user.id];
      Object.assign(store.users[0], { creditsBalance: 27, creditsTotal: 40 }); api.save(store);
    }
    assert.equal((await api.call('user/send-verification', { turnstileToken: challengeToken('verify-email') }, account.data.token)).status, 200);
    assert.equal((await api.verify('legacy@example.com')).data.creditsGranted, 0);
    const user = (await api.call('user/me', undefined, account.data.token)).data.user;
    assert.equal(user.creditsBalance, 27); assert.equal(user.creditsTotal, 40); assert.equal(user.emailVerified, true);
  });

  test(`${backend}: the site trial budget cannot be bypassed by verification`, async t => {
    const api = await fixture(t, backend);
    const account = await api.register('budget@example.com');
    if (api.sqlite) api.sqlite.prepare('INSERT INTO risk_counters VALUES (?,?,?)').run('trial-global', 96, Date.now() + 60000);
    else { const store = api.read(); store.riskCounters['trial-global'] = { used: 96, expires_at: Date.now() + 60000 }; api.save(store); }
    assert.equal((await api.verify('budget@example.com')).data.creditsGranted, 0);
    const user = (await api.call('user/me', undefined, account.data.token)).data.user;
    assert.equal(user.emailVerified, true); assert.equal(user.creditsBalance, 0);
  });

  test(`${backend}: mail rejection leaves a recoverable zero-credit account without exposing secrets`, async t => {
    const api = await fixture(t, backend);
    const original = api.services.fetch;
    const rejectMail = (url, options) => url === 'https://api.resend.com/emails'
      ? Response.json({ message: 'synthetic-private-provider-detail' }, { status: 403 }) : original(url, options);
    t.mock.method(api.services, 'fetch', rejectMail);
    const account = await api.register('mail-failure@example.com');
    assert.equal(account.status, 200); assert.equal(account.data.verificationSent, false);
    assert.equal(account.data.user.creditsBalance, 0); assert.ok(account.data.token);
    assert.ok(!JSON.stringify(account).includes('synthetic-private-provider-detail'));
    assert.equal((await api.call('user/me', undefined, account.data.token)).data.user.emailVerified, false);
  });

  test(`${backend}: suspended accounts cannot confirm a pending link or receive credits`, async t => {
    const api = await fixture(t, backend);
    const account = await api.register('suspended@example.com');
    if (api.sqlite) api.sqlite.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(account.data.user.id);
    else { const store = api.read(); store.users[0].status = 'suspended'; api.save(store); }
    assert.equal((await api.verify('suspended@example.com')).status, 400);
    assert.ok(!(await api.ledger.state(account.data.user.id)).verified_at);
  });

  test(`${backend}: a failed ledger write cannot consume the link or lose a starter grant`, async t => {
    const api = await fixture(t, backend);
    const account = await api.register('rollback@example.com');
    if (api.sqlite) {
      api.sqlite.exec("CREATE TRIGGER reject_credit_update BEFORE UPDATE OF credits_balance ON users BEGIN SELECT RAISE(ABORT,'synthetic write failure'); END");
      assert.equal((await api.verify('rollback@example.com')).status, 503);
      api.sqlite.exec('DROP TRIGGER reject_credit_update');
    } else {
      const broken = createJsonVerificationLedger(api.read, () => { throw new Error('synthetic write failure'); });
      await assert.rejects(broken.verify(await verificationTokenHash(api.services.latestToken('rollback@example.com')), 4, true));
    }
    assert.ok(!(await api.ledger.state(account.data.user.id)).verified_at);
    assert.equal((await api.call('user/me', undefined, account.data.token)).data.user.creditsBalance, 0);
    assert.equal((await api.verify('rollback@example.com')).data.creditsGranted, 8);
  });

  test(`${backend}: paused starter grants still allow email verification without giving credits`, async t => {
    const api = await fixture(t, backend, { FREE_TRIAL_ENABLED: 'false' });
    const account = await api.register('paused@example.com');
    assert.equal((await api.verify('paused@example.com')).data.creditsGranted, 0);
    const user = (await api.call('user/me', undefined, account.data.token)).data.user;
    assert.equal(user.emailVerified, true); assert.equal(user.creditsBalance, 0);
  });

  test(`${backend}: an existing paid account can sign in and keep its credits during mail downtime`, async t => {
    const api = await fixture(t, backend);
    const account = await api.register('paid@example.com');
    if (api.sqlite) api.sqlite.prepare("UPDATE users SET plan = 'pro', credits_balance = 27, credits_total = 40 WHERE id = ?").run(account.data.user.id);
    else { const store = api.read(); Object.assign(store.users[0], { plan: 'pro', creditsBalance: 27, creditsTotal: 40 }); api.save(store); }
    api.env.RESEND_API_KEY = '';
    const login = await api.call('user/auth', { mode: 'login', email: 'paid@example.com', password: 'synthetic-email-password' });
    assert.equal(login.status, 200); assert.equal(login.data.user.creditsBalance, 27); assert.equal(login.data.user.creditsTotal, 40);
    const generation = await api.call('generate', { prompt: 'No configured upstream' }, login.data.token);
    assert.notEqual(generation.data.code, 'EMAIL_VERIFICATION_REQUIRED');
    assert.notEqual(generation.status, 401); assert.notEqual(generation.status, 403);
  });
}

test('D1: an existing guest bearer token with credits cannot generate', async t => {
  const api = await fixture(t, 'D1');
  api.sqlite.prepare("INSERT INTO users (id,email,name,plan,credits_balance,credits_total,status,created_at) VALUES ('usr_guest_old','guest@example.test','Old guest','free',4,4,'active','2026-01-01')").run();
  api.sqlite.prepare('INSERT INTO user_sessions VALUES (?,?,?)').run('old-guest-token', 'usr_guest_old', Date.now() + 60000);
  assert.equal((await api.call('generate', { prompt: 'test' }, 'old-guest-token')).data.code, 'REGISTRATION_REQUIRED');
  assert.equal((await api.call('user/me', undefined, 'old-guest-token')).status, 401);
});
