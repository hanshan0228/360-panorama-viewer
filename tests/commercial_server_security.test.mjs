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
  const server = createCommercialServer({ storeFile: file, env: { STRIPE_WEBHOOK_SECRET: secret, PAYMENT_MODE: 'sandbox' }, ...opts });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, data, headers = {}) => fetch(base + url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });
  const webhook = (data) => post('/api/stripe/webhook', data, { 'Stripe-Signature': sign(JSON.stringify(data)) });
  return { file, base, post, webhook, dir };
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
  const authRes = await post('/api/user/auth', { email: 'creator@studio360.io', name: 'Alex' });
  assert.equal(authRes.status, 200);
  const { user, token } = await authRes.json();
  assert.equal(user.email, 'creator@studio360.io');
  assert.equal(user.creditsBalance, 4);
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
  const { post } = await withServer(t);

  // 1. Register a user with password
  const reg = await post('/api/user/auth', { email: 'user@example.com', name: 'User', password: 'password123' });
  assert.equal(reg.status, 200);
  const { _user, token } = await reg.json();
  const authHeaders = { Authorization: `Bearer ${token}` };

  // 2. Deduct credits server-side
  const deductRes = await post('/api/user/deduct-credits', { credits: 2 }, authHeaders);
  assert.equal(deductRes.status, 200);
  const deductData = await deductRes.json();
  assert.equal(deductData.remaining, 2);

  // 3. Reject overdraft attempt
  const overdraftRes = await post('/api/user/deduct-credits', { credits: 4 }, authHeaders);
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

test('legacy migration preserves backup and removes stored secrets', async (t) => {
  const { file, dir } = await withServer(t);
  writeStore({ ...fixture(), schemaVersion: 1, adminPasswordHash: 'admin888', paymentConfig: { stripeSecretKey: 'mock_secret' } }, file);
  assert.throws(() => initializeStore(file), /ADMIN_PASSWORD/);
  initializeStore(file, password);
  assert.equal(verifyPassword(password, readStore(file).adminPasswordHash), true);
  assert.equal(readStore(file).paymentConfig, undefined);
  assert.equal(fs.readdirSync(dir).filter((v) => v.includes('.backup-')).length, 1);
});
