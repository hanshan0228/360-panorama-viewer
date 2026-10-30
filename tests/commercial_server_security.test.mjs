import { emailTestEnv, challengeToken, emailServicesFixture } from './email_services_fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCommercialServer, initializeStore, readStore, writeStore, hashPassword,
  verifyPassword, verifyStripeSignature } from '../server/commercial-server.mjs';

const secret = 'whsec_mock_only';
const password = 'isolated-test-password';
function fixture() {
  return { schemaVersion: 2, adminPasswordHash: hashPassword(password),
    users: [{ id: 'u1', status: 'active', creditsBalance: 10, creditsTotal: 10 }],
    subscriptions: [], invoices: [], processedEventIds: [],
    orders: [{ checkoutSessionId: 'cs_mock', userId: 'u1', status: 'pending',
      plan: 'pro', billingCycle: 'monthly', currency: 'usd', amountCents: 1900, credits: 1000 }] };
}
function event() {
  return { id: 'evt_mock', livemode: false, type: 'checkout.session.completed',
    data: { object: { id: 'cs_mock', livemode: false, payment_status: 'paid', currency: 'usd', amount_total: 1900 } } };
}
function sign(raw, timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},v1=${crypto.createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex')}`;
}
async function withServer(t, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-security-'));
  const file = path.join(dir, 'store.json');
  writeStore(fixture(), file);
  const emailServices = emailServicesFixture(opts.fetch);
  const server = createCommercialServer({ ...opts, storeFile: file, env: { ...emailTestEnv, STRIPE_WEBHOOK_SECRET: secret, PAYMENT_MODE: 'sandbox', ...opts.env }, fetch: emailServices.fetch });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, data, headers = {}) => fetch(base + url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(url === '/api/user/auth' ? { birthDate: '1990-01-01', turnstileToken: challengeToken(), ...data } : data) });
  const webhook = (data) => post('/api/stripe/webhook', data, { 'Stripe-Signature': sign(JSON.stringify(data)) });
  return { file, base, post, webhook, dir, emailServices };
}

test('password validation and legacy PBKDF2 compatibility', () => {
  const hashed = hashPassword(password);
  assert.equal(verifyPassword(password, hashed), true);
  assert.equal(verifyPassword(undefined, hashed), false);
  assert.equal(verifyPassword('wrong', hashed), false);
  const salt = 'a'.repeat(32);
  const old = `${salt}:${crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex')}`;
  assert.equal(verifyPassword(password, old), true);
});
test('current bad signature, expired signature and altered body are rejected', () => {
  const raw = JSON.stringify(event());
  assert.equal(verifyStripeSignature(raw, sign(raw), secret).valid, true);
  assert.equal(verifyStripeSignature(raw, `t=${Math.floor(Date.now()/1000)},v1=${'0'.repeat(64)}`, secret).valid, false);
  assert.equal(verifyStripeSignature(raw, sign(raw, Math.floor(Date.now()/1000)-600), secret).valid, false);
  assert.equal(verifyStripeSignature(raw + ' ', sign(raw), secret).valid, false);
});
test('real HTTP login, protected store, secret whitelist and logout', async (t) => {
  const { base, post } = await withServer(t);
  assert.equal((await fetch(base + '/api/admin/store')).status, 401);

  // 1. Wrong username or password fails
  assert.equal((await post('/api/admin/login', { username: 'wrong-admin', password })).status, 401);
  assert.equal((await post('/api/admin/login', { username: 'admin', password: 'wrong-password' })).status, 401);

  // 2. Correct credentials succeed
  const login = await post('/api/admin/login', { username: 'admin', password });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };
  const data = await (await fetch(base + '/api/admin/store', { headers })).json();
  assert.deepEqual(Object.keys(data).sort(), ['invoices', 'subscriptions', 'users']);
  assert.equal((await post('/api/admin/logout', {}, headers)).status, 200);
  assert.equal((await fetch(base + '/api/admin/store', { headers })).status, 401);
});
for (const [name, change] of [
  ['unpaid', (e) => { e.data.object.payment_status = 'unpaid'; }],
  ['missing status', (e) => { delete e.data.object.payment_status; }],
  ['wrong amount', (e) => { e.data.object.amount_total = 1; }],
  ['wrong currency', (e) => { e.data.object.currency = 'eur'; }],
  ['live mismatch', (e) => { e.livemode = true; }],
  ['unknown order', (e) => { e.data.object.id = 'cs_unknown'; }],
]) {
  test(`signed ${name} event grants nothing`, async (t) => {
    const { file, webhook } = await withServer(t);
    const e = event(); change(e);
    assert.equal((await webhook(e)).status, 400);
    assert.equal(readStore(file).users[0].creditsBalance, 10);
    assert.equal(readStore(file).invoices.length, 0);
  });
}
test('valid payment, repeated event and different event for same session credit once', async (t) => {
  const { file, webhook } = await withServer(t);
  assert.equal((await webhook(event())).status, 200);
  assert.equal((await webhook(event())).status, 200);
  assert.equal((await webhook({ ...event(), id: 'evt_duplicate_session' })).status, 200);
  assert.equal(readStore(file).users[0].creditsBalance, 1010);
  assert.equal(readStore(file).invoices.length, 1);
});
test('persistence failure returns 500 with no acknowledged fulfillment', async (t) => {
  const { file, webhook } = await withServer(t, { writeStore: () => { throw new Error('mock disk failure'); } });
  assert.equal((await webhook(event())).status, 500);
  assert.equal(readStore(file).users[0].creditsBalance, 10);
});
test('corrupt ledger is not overwritten', async (t) => {
  const { file, webhook } = await withServer(t);
  fs.writeFileSync(file, '{broken', 'utf8');
  assert.equal((await webhook(event())).status, 500);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});
test('unfinished checkout is closed even with credentials', async (t) => {
  const { post } = await withServer(t);
  assert.equal((await post('/api/stripe/create-checkout-session', { plan: 'pro' })).status, 503);
});
test('user auth registers new users, issues session tokens, and returns user profile', async (t) => {
  const { base, post } = await withServer(t);

  // 1. Invalid email is rejected
  assert.equal((await post('/api/user/auth', { email: 'bad-email' })).status, 400);

  // 2. Register valid user
  const authRes = await post('/api/user/auth', { email: 'creator@studio360.io', name: 'Alex', password });
  assert.equal(authRes.status, 200);
  const { user, token } = await authRes.json();
  assert.equal(user.email, 'creator@studio360.io');
  assert.equal(user.creditsBalance, 0);
  assert.equal(user.emailVerified, false);
  assert.ok(token);

  // 3. Fetch profile with token via /api/user/me
  const meRes = await fetch(base + '/api/user/me', {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(meRes.status, 200);
  const meData = await meRes.json();
  assert.equal(meData.user.id, user.id);
  assert.equal(meData.user.email, 'creator@studio360.io');

  // 4. Unauthorized fetch without token returns 401
  assert.equal((await fetch(base + '/api/user/me')).status, 401);
});

test('registration rejects missing, short, non-string and oversized passwords without creating an account', async t => {
  const { post, file } = await withServer(t);
  for (const invalid of [undefined, '', '12345', 123456, 'x'.repeat(1025)]) {
    assert.equal((await post('/api/user/auth', { email: 'valid@example.com', password: invalid })).status, 400);
    assert.equal(readStore(file).users.length, 1);
  }
  assert.equal((await post('/api/user/auth', { email: 'valid@example.com', password: '123456' })).status, 200);
  assert.equal((await post('/api/user/auth', { email: 'valid@example.com', password: '123456' })).status, 200);
});

test('admin endpoints persist credit adjustments, status, user creation, billing, and credentials', async (t) => {
  const { file, base, post } = await withServer(t);
  const login = await post('/api/admin/login', { username: 'admin', password });
  const { token } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };

  // 1. Adjust credits
  const creditRes = await post('/api/admin/users/credits', { userId: 'u1', delta: 50 }, headers);
  assert.equal(creditRes.status, 200);
  const creditData = await creditRes.json();
  assert.equal(creditData.user.creditsBalance, 60);

  // 2. Update status
  const statusRes = await post('/api/admin/users/status', { userId: 'u1', status: 'suspended' }, headers);
  assert.equal(statusRes.status, 200);

  // 3. Create user
  const createRes = await post('/api/admin/users/create', { name: 'Bob', email: 'bob@example.com', plan: 'pro', credits: 200 }, headers);
  assert.equal(createRes.status, 200);

  // 4. Update billing config and query publicly
  const billingRes = await post('/api/admin/billing', { config: { proMonthlyPriceUsd: 25, creditCostPer4K: 5 } }, headers);
  assert.equal(billingRes.status, 200);
  const publicBilling = await (await fetch(base + '/api/billing')).json();
  assert.equal(publicBilling.config.proMonthlyPriceUsd, 25);

  // 5. Update credentials and verify login with new credentials
  const credRes = await post('/api/admin/credentials', { currentPassword: password, newUsername: 'superadmin', newPassword: 'newSuperPassword123' }, headers);
  assert.equal(credRes.status, 200);

  const oldLogin = await post('/api/admin/login', { username: 'admin', password });
  assert.equal(oldLogin.status, 401);

  const newLogin = await post('/api/admin/login', { username: 'superadmin', password: 'newSuperPassword123' });
  assert.equal(newLogin.status, 200);

  // 6. Save models with secret API key and verify public /api/models sanitizes it completely
  const newHeaders = { Authorization: `Bearer ${ (await newLogin.json()).token }` };
  const modelsRes = await post('/api/admin/models', {
    endpoints: [{ id: 'm1', name: 'Cloud Model', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-secret-never-expose' }],
    routingConfig: { primaryEndpointId: 'm1', mode: 'single' }
  }, newHeaders);
  assert.equal(modelsRes.status, 200);

  const publicModels = await (await fetch(base + '/api/models')).json();
  assert.equal(publicModels.success, true);
  assert.equal(publicModels.endpoints[0].id, 'm1');
  assert.equal(publicModels.endpoints[0].apiKey, ''); // MUST BE BLANK!
  assert.equal(publicModels.endpoints[0].hasServerKey, true);
  assert.equal(publicModels.routingConfig.mode, 'single');

  // 7. Subsequent admin save with blank apiKey preserves existing cloud secret
  const blankSaveRes = await post('/api/admin/models', {
    endpoints: [{ id: 'm1', name: 'Cloud Model Renamed', baseUrl: 'https://api.openai.com/v1', apiKey: '' }],
    routingConfig: { primaryEndpointId: 'm1', mode: 'single' }
  }, newHeaders);
  assert.equal(blankSaveRes.status, 200);

  const rawSaved = readStore(file).models_config;
  assert.equal(rawSaved.endpoints[0].apiKey, 'sk-secret-never-expose'); // KEY MUST BE PRESERVED!
  assert.equal(rawSaved.endpoints[0].name, 'Cloud Model Renamed');
});

test('server-authoritative credit deduction and prevention of unauthorized claims', async (t) => {
  const { post, emailServices } = await withServer(t);

  // 1. Register a user with password
  const reg = await post('/api/user/auth', { email: 'user@example.com', name: 'User', password: 'password123' });
  assert.equal(reg.status, 200);
  const { _user, token } = await reg.json();
  assert.equal((await post('/api/user/verify-email', { token: emailServices.latestToken('user@example.com') })).status, 200);
  const authHeaders = { Authorization: `Bearer ${token}` };

  // 2. Deduct credits server-side
  const deductRes = await post('/api/user/deduct-credits', { credits: 2 }, authHeaders);
  assert.equal(deductRes.status, 200);
  const deductData = await deductRes.json();
  assert.equal(deductData.remaining, 6);

  // 3. Reject overdraft attempt
  const overdraftRes = await post('/api/user/deduct-credits', { credits: 7 }, authHeaders);
  assert.equal(overdraftRes.status, 400);

  // 4. Admin creates a user without password
  const adminLogin = await post('/api/admin/login', { username: 'admin', password });
  const adminToken = (await adminLogin.json()).token;
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  const createdUserRes = await post('/api/admin/users/create', { name: 'VIP Client', email: 'vip@client.com', plan: 'enterprise', credits: 5000 }, adminHeaders);
  assert.equal(createdUserRes.status, 200);
  const createdBody = await createdUserRes.json();
  assert.ok(createdBody.initialPassword);

  // 5. Outsider tries to claim the unactivated account with no password or arbitrary password
  const claimAttempt = await post('/api/user/auth', { email: 'vip@client.com', password: 'attacker-random-password' });
  assert.equal(claimAttempt.status, 401);
});

test('generate proxy strictly verifies authentication, accounts, credits, endpoints, and reference images', async (t) => {
  const { file, post, emailServices } = await withServer(t);

  // Generation is exercised using a verified registered account.
  const guestRes = await post('/api/user/auth', { email: 'generation@example.test', password, mode: 'register' });
  assert.equal(guestRes.status, 200);
  const { user: guestUser, token: guestToken } = await guestRes.json();
  assert.equal(guestUser.creditsBalance, 0);
  assert.equal((await post('/api/user/verify-email', { token: emailServices.latestToken('generation@example.test') })).status, 200);
  const guestHeaders = { Authorization: `Bearer ${guestToken}` };

  // 2. Reject anonymous call without token
  const anonRes = await post('/api/generate', { prompt: 'cyberpunk street' });
  assert.equal(anonRes.status, 401);

  // 3. Configure mock model endpoint in store
  const store = readStore(file);
  store.models_config = {
    endpoints: [
      { id: 'ep_text_only', name: 'DALL-E Text Only', baseUrl: 'https://api.openai.com/v1', model: 'dall-e-3', isEnabled: true, isDefault: true },
      { id: 'ep_disabled', name: 'Disabled Endpoint', baseUrl: 'http://127.0.0.1:8317', model: 'gemini-flash', isEnabled: false }
    ],
    routingConfig: { primaryEndpointId: 'ep_text_only', mode: 'single' }
  };
  writeStore(store, file);

  // 4. Reject generation with disabled endpointId
  const disabledRes = await post('/api/generate', { prompt: 'skyline', endpointId: 'ep_disabled' }, guestHeaders);
  assert.equal(disabledRes.status, 400);

  // 5. Reject reference images on text-only /v1/images/generations endpoint
  const refRejectRes = await post('/api/generate', {
    prompt: 'skyline',
    endpointId: 'ep_text_only',
    referenceImages: ['data:image/png;base64,mockImageBase64']
  }, guestHeaders);
  assert.equal(refRejectRes.status, 400);
  assert.ok((await refRejectRes.json()).error.includes('does not support reference images'));

  // 6. Reject generation when credits are insufficient
  const depletedStore = readStore(file);
  depletedStore.users.find(user => user.id === guestUser.id).creditsBalance = 2;
  writeStore(depletedStore, file);
  const overdraftRes = await post('/api/generate', { prompt: 'skyline', resolution: '4K' }, guestHeaders);
  assert.equal(overdraftRes.status, 400);
  assert.ok((await overdraftRes.json()).error.includes('Insufficient credits'));

  // 7. Reject generation for suspended account
  const bannedStore = readStore(file);
  const targetUser = bannedStore.users.find(u => u.id === guestUser.id);
  targetUser.status = 'suspended';
  writeStore(bannedStore, file);

  const suspendedRes = await post('/api/generate', { prompt: 'skyline' }, guestHeaders);
  assert.equal(suspendedRes.status, 403);
});

test('legacy migration preserves backup and removes stored secrets', async (t) => {
  const { file, dir } = await withServer(t);
  writeStore({ ...fixture(), schemaVersion: 1, adminPasswordHash: 'admin888', paymentConfig: { stripeSecretKey: 'mock_secret' } }, file);
  assert.throws(() => initializeStore(file), /ADMIN_PASSWORD/);
  initializeStore(file, password);
  assert.equal(verifyPassword(password, readStore(file).adminPasswordHash), true);
  assert.equal(readStore(file).paymentConfig, undefined);
  assert.equal(fs.readdirSync(dir).filter((v) => v.includes('.backup-')).length, 1);
});

test('user and admin payloads never expose password hashes', async (t) => {
  const { base, post } = await withServer(t);
  const registered = await (await post('/api/user/auth', {
    email: 'hash-check@example.test', password: 'synthetic-password', mode: 'register',
  })).json();
  assert.equal('password_hash' in registered.user, false, 'registration must not echo the stored hash');

  const loggedIn = await (await post('/api/user/auth', {
    email: 'hash-check@example.test', password: 'synthetic-password', mode: 'login',
  })).json();
  assert.equal('password_hash' in loggedIn.user, false, 'login must not echo the stored hash');

  const me = await (await fetch(base + '/api/user/me', {
    headers: { Authorization: `Bearer ${loggedIn.token}` },
  })).json();
  assert.equal('password_hash' in me.user, false, 'profile must not echo the stored hash');

  const admin = await (await post('/api/admin/login', { username: 'admin', password })).json();
  const adminHeaders = { Authorization: `Bearer ${admin.token}` };
  const store = await (await fetch(base + '/api/admin/store', { headers: adminHeaders })).json();
  assert.ok(store.users.length > 0);
  for (const account of store.users) {
    assert.equal('password_hash' in account, false, 'store listing must not expose stored hashes');
  }

  const credit = await (await post('/api/admin/users/credits', { userId: me.user.id, delta: 5 }, adminHeaders)).json();
  assert.equal('password_hash' in credit.user, false, 'credit updates must not echo the stored hash');
});

test('guest trial minting is disabled on repeated requests', async (t) => {
  const { post } = await withServer(t);
  assert.equal((await post('/api/user/guest', {})).status, 403);
  assert.equal((await post('/api/user/guest', {})).status, 403);
});

test('repeated failed sign-ins trip the user auth limiter', async (t) => {
  const { post } = await withServer(t);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const answer = await post('/api/user/auth', { email: 'nobody@example.test', password: 'synthetic-password', mode: 'login' });
    assert.equal(answer.status, 401);
  }
  assert.equal((await post('/api/user/auth', { email: 'nobody@example.test', password: 'synthetic-password', mode: 'login' })).status, 429);
});

test('stripe checkout binds orders to the authenticated session and charges yearly credits', async (testContext) => {
  const realFetch = globalThis.fetch;
  const upstreamCalls = [];
  testContext.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).startsWith('https://api.stripe.com/')) {
      upstreamCalls.push(String(init?.body ?? ''));
      return Response.json({ id: 'cs_mock_new', url: 'https://checkout.stripe.example/session' });
    }
    return realFetch(url, init);
  });
  const { file, post } = await withServer(testContext, { env: { STRIPE_SECRET_KEY: 'sk_test_mock' } });

  assert.equal((await post('/api/stripe/create-checkout-session', { plan: 'pro', billingCycle: 'monthly' })).status, 401);

  const registered = await (await post('/api/user/auth', {
    email: 'checkout-buyer@example.test', password: 'synthetic-password', mode: 'register',
  })).json();
  const authorized = await post('/api/stripe/create-checkout-session', {
    plan: 'pro',
    billingCycle: 'yearly',
    userId: 'u1',
    userEmail: 'someone-else@example.test',
    successUrl: 'https://evil.example/collect',
    cancelUrl: 'https://evil.example/collect',
  }, { Authorization: `Bearer ${registered.token}` });
  assert.equal(authorized.status, 200);

  const order = readStore(file).orders.find((entry) => entry.checkoutSessionId === 'cs_mock_new');
  assert.ok(order, 'the paid session must be recorded before credits could ever be granted');
  assert.equal(order.userId, registered.user.id, 'orders must belong to the session user, not the request body');
  assert.equal(order.amountCents, 9900);
  assert.equal(order.credits, 1440, 'yearly plans grant twelve monthly allotments');

  assert.equal(upstreamCalls.length, 1);
  const decoded = decodeURIComponent(upstreamCalls[0]);
  assert.ok(!decoded.includes('evil.example'), 'return urls must be restricted to the configured origin');
  assert.ok(decoded.includes('http://localhost:5173/'));
});
