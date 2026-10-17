import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { onRequest, __resetEdgeRateLimits } from '../functions/api/[[route]].ts';
import { createCommercialServer, hashPassword, readStore, writeStore } from '../server/commercial-server.mjs';
import { paypalCatalog, validatePayPalPlan, formatAdminBilling, createD1PayPalLedger, createJsonPayPalLedger } from '../server/paypal.mjs';

const env = {
  ADMIN_PASSWORD: 'isolated-paypal-test-password', PAYPAL_MODE: 'sandbox',
  PAYPAL_CLIENT_ID: 'synthetic-client', PAYPAL_CLIENT_SECRET: 'synthetic-secret', PAYPAL_WEBHOOK_ID: 'synthetic-webhook',
  PAYPAL_PRO_MONTHLY_PLAN_ID: 'P-PROMONTH', PAYPAL_PRO_YEARLY_PLAN_ID: 'P-PROYEAR',
  PAYPAL_ENTERPRISE_MONTHLY_PLAN_ID: 'P-STUDIOMONTH', PAYPAL_ENTERPRISE_YEARLY_PLAN_ID: 'P-STUDIOYEAR',
};
const signature = Object.fromEntries(['paypal-transmission-id', 'paypal-transmission-time', 'paypal-transmission-sig',
  'paypal-cert-url', 'paypal-auth-algo'].map(name => [name, 'synthetic-signature']));

function planDetails(offer, cycle) {
  return { status: 'ACTIVE', quantity_supported: false,
    billing_cycles: [{ tenure_type: 'REGULAR', total_cycles: 0, frequency: { interval_count: 1, interval_unit: cycle === 'yearly' ? 'YEAR' : 'MONTH' },
      pricing_scheme: { fixed_price: { value: (offer.amountCents / 100).toFixed(2), currency_code: 'USD' } } }],
    payment_preferences: { setup_fee: { value: '0.00' } } };
}

function sqliteD1(database) {
  // The worker module keeps per-isolate rate-limit counters; each fixture starts from a clean slate.
  __resetEdgeRateLimits();
  return {
    prepare(sql) {
      let params = [];
      const statement = {
        sql,
        bind(...values) { params = values; return statement; },
        execute() { const result = database.prepare(sql).run(...params); return { success: true, meta: { changes: Number(result.changes) } }; },
        async run() { return statement.execute(); },
        async first() { return database.prepare(sql).get(...params) || null; },
        async all() { return { results: database.prepare(sql).all(...params) }; },
      };
      return statement;
    },
    async batch(statements) {
      database.exec('BEGIN');
      try { const result = statements.map(statement => statement.execute()); database.exec('COMMIT'); return result; }
      catch (error) { database.exec('ROLLBACK'); throw error; }
    },
  };
}

async function fixture(testContext, backend) {
  const remoteSubscriptions = new Map();
  const catalog = paypalCatalog(env);
  const calls = [];
  let signatureValid = true;
  let failCreation = false;
  let minimalCreationResponse = false;
  let suspendBeforeGrant = false;
  let tamperPlan = () => {};
  const fakePayPal = async (input, options = {}) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://api-m.sandbox.paypal.com', 'Tests may only use mocked sandbox APIs');
    const body = options.body && !String(options.body).startsWith('grant_type') ? JSON.parse(options.body) : null;
    calls.push({ pathname: url.pathname, body, headers: options.headers });
    if (url.pathname === '/v1/oauth2/token') return Response.json({ access_token: 'synthetic-access-token' });
    if (url.pathname === '/v1/notifications/verify-webhook-signature') {
      assert.equal(body.webhook_id, env.PAYPAL_WEBHOOK_ID);
      return Response.json({ verification_status: signatureValid ? 'SUCCESS' : 'FAILURE' });
    }
    if (url.pathname.startsWith('/v1/billing/plans/')) {
      for (const cycles of Object.values(catalog)) for (const [cycle, offer] of Object.entries(cycles)) {
        if (url.pathname.endsWith(offer.planId)) {
          const plan = planDetails(offer, cycle); tamperPlan(plan); return Response.json(plan);
        }
      }
    }
    if (url.pathname === '/v1/billing/subscriptions' && options.method === 'POST') {
      if (failCreation) { failCreation = false; throw new Error('Mock connection failure during subscription creation'); }
      const previous = [...remoteSubscriptions.values()].find(subscription => subscription.custom_id === body.custom_id);
      const subscription = previous || { id: `I-SUB${remoteSubscriptions.size + 1}`, plan_id: body.plan_id,
        custom_id: body.custom_id, status: 'APPROVAL_PENDING', status_update_time: '2026-10-13T00:00:00Z',
        links: [{ rel: 'approve', href: `https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=TEST${remoteSubscriptions.size + 1}` }] };
      remoteSubscriptions.set(subscription.id, subscription);
      assert.equal(options.headers['PayPal-Request-Id'], subscription.custom_id);
      return Response.json(minimalCreationResponse ? { id: subscription.id, status: subscription.status, links: subscription.links } : subscription);
    }
    const id = url.pathname.split('/')[4];
    const subscription = remoteSubscriptions.get(id);
    if (subscription && url.pathname.endsWith('/cancel')) {
      subscription.status = 'CANCELLED'; subscription.status_update_time = '2026-10-13T03:00:00Z';
      return new Response(null, { status: 204 });
    }
    if (subscription) return Response.json(subscription);
    throw new Error(`Unexpected mocked API: ${url.pathname}`);
  };
  let call;
  let invoices;
  let suspend;
  let ledger;
  if (backend === 'D1') {
    const database = new DatabaseSync(':memory:');
    const db = sqliteD1(database);
    const batch = db.batch;
    db.batch = async statements => {
      if (suspendBeforeGrant && statements.some(statement => statement.sql.includes('SET credits_balance = credits_balance +'))) {
        suspendBeforeGrant = false;
        database.prepare("UPDATE users SET status = 'suspended'").run();
      }
      return batch(statements);
    };
    ledger = createD1PayPalLedger(db);
    testContext.after(() => database.close());
    testContext.mock.method(globalThis, 'fetch', fakePayPal);
    call = async (route, body, token, headers = {}) => {
      const request = new Request(`https://review.example/api/${route}`, { method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const response = await onRequest({ request, env: { ...env, DB: db } });
      return { status: response.status, data: await response.json() };
    };
    invoices = () => database.prepare('SELECT * FROM invoices').all();
    suspend = (id, status = 'suspended') => database.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
  } else {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'panorama-paypal-'));
    const file = path.join(directory, 'store.json');
    ledger = createJsonPayPalLedger(() => readStore(file), store => writeStore(store, file));
    writeStore({ schemaVersion: 2, adminPasswordHash: hashPassword(env.ADMIN_PASSWORD), users: [], subscriptions: [], invoices: [] }, file);
    const server = createCommercialServer({ env, fetch: fakePayPal, storeFile: file });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    testContext.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); });
    call = async (route, body, token, headers = {}) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/${route}`, {
        method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, data: await response.json() };
    };
    invoices = () => readStore(file).invoices;
    suspend = (id, status = 'suspended') => { const store = readStore(file); store.users.find(user => user.id === id).status = status; writeStore(store, file); };
  }
  const account = await call('user/auth', { email: 'owner@example.com', name: 'Owner', password: 'synthetic-user-password' });
  assert.equal(account.status, 200);
  const token = account.data.token;
  const create = (plan = 'pro', billingCycle = 'monthly', extra = {}) => call('paypal/create-subscription', { plan, billingCycle, ...extra }, token);
  const profile = async () => (await call('user/me', undefined, token)).data.user;
  const balance = async () => { const user = await profile(); return user.creditsBalance ?? user.credits_balance; };
  const subscription = async () => (await call('paypal/subscription', undefined, token)).data.subscription;
  const sale = (id, overrides = {}, eventId = `WH-${id}`) => call('paypal/webhook', {
    id: eventId, event_type: 'PAYMENT.SALE.COMPLETED', resource: {
      id, state: 'completed', billing_agreement_id: 'I-SUB1', amount: { total: '19.00', currency: 'USD' },
      create_time: '2026-10-13T00:30:00Z', ...overrides,
    },
  }, undefined, signature);
  return { call, create, token, userId: account.data.user.id, profile, balance, subscription, sale, remoteSubscriptions, invoices, suspend, ledger,
    failNextCreation() { failCreation = true; }, suspendOnNextGrant() { suspendBeforeGrant = true; },
    useMinimalCreationResponse() { minimalCreationResponse = true; },
    calls, failSignature() { signatureValid = false; }, tamperPlan(callback) { tamperPlan = callback; } };
}

for (const backend of ['Node', 'D1']) {
  test(`${backend} PayPal: session ownership, no anonymous/guest purchase, no secrets in public config`, async testContext => {
    const api = await fixture(testContext, backend);
    assert.equal((await api.call('paypal/create-subscription', { plan: 'pro', billingCycle: 'monthly' })).status, 401);
    const guest = await api.call('user/guest', {});
    assert.equal((await api.call('paypal/create-subscription', { plan: 'pro', billingCycle: 'monthly' }, guest.data.token)).status, 403);
    const config = await api.call('paypal/config');
    assert.equal(config.data.enabled, true);
    assert.equal(JSON.stringify(config).includes(env.PAYPAL_CLIENT_SECRET), false);
    assert.equal(config.data.plans.pro.yearly.credits, 12000);
    const created = await api.create('pro', 'monthly', { userId: guest.data.user.id, amountCents: 1, credits: 999999 });
    assert.equal(created.status, 200);
    assert.equal((await api.subscription()).userId, api.userId);
    assert.equal(await api.balance(), 4);
    assert.equal((await api.create()).data.subscriptionId, created.data.subscriptionId);
    assert.equal(api.remoteSubscriptions.size, 1);
  });

  test(`${backend} PayPal: approval never grants credits; verified first payment and renewals are transaction-idempotent`, async testContext => {
    const api = await fixture(testContext, backend);
    assert.equal((await api.create()).status, 200);
    const remote = api.remoteSubscriptions.get('I-SUB1');
    remote.status = 'ACTIVE'; remote.status_update_time = '2026-10-13T00:15:00Z';
    assert.equal((await api.call('paypal/webhook', { event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: remote.id } }, undefined, signature)).status, 200);
    assert.equal(await api.balance(), 4);
    assert.equal((await api.sale('PAYMENT1')).status, 200);
    assert.equal(await api.balance(), 1004);
    assert.equal((await api.sale('PAYMENT1', {}, 'WH-REDELIVERY')).status, 200);
    assert.equal(await api.balance(), 1004);
    const results = await Promise.all([api.sale('PAYMENT2'), api.sale('PAYMENT2', {}, 'WH-PARALLEL')]);
    assert.ok(results.every(result => result.status === 200));
    assert.equal(await api.balance(), 2004);
    assert.equal(api.invoices().length, 2);
    assert.equal((await api.subscription()).paidThrough, '2026-11-13T00:30:00.000Z');
    assert.equal((await api.create()).status, 409);
  });

  test(`${backend} PayPal: rejects bad signature, mismatched money, foreign subscription and inactive users`, async testContext => {
    const api = await fixture(testContext, backend);
    await api.create();
    assert.equal((await api.sale('BADPRICE', { amount: { total: '0.01', currency: 'USD' } })).status, 400);
    assert.equal((await api.sale('BADCURRENCY', { amount: { total: '19.00', currency: 'EUR' } })).status, 400);
    assert.equal((await api.sale('BADSTATE', { state: 'pending' })).status, 400);
    const remote = api.remoteSubscriptions.get('I-SUB1');
    remote.plan_id = 'P-FOREIGN';
    assert.equal((await api.sale('FOREIGN')).status, 400);
    remote.plan_id = env.PAYPAL_PRO_MONTHLY_PLAN_ID;
    api.suspend(api.userId);
    assert.equal((await api.sale('SUSPENDED')).status, 502);
    assert.equal(api.invoices().length, 0);
    api.failSignature();
    assert.equal((await api.sale('FORGED')).status, 400);
    assert.equal(await api.balance(), 4);
  });

  test(`${backend} PayPal: annual credits, cancellation ownership, and delayed payments preserve cancelled status`, async testContext => {
    const api = await fixture(testContext, backend);
    await api.create('pro', 'yearly');
    const remote = api.remoteSubscriptions.get('I-SUB1');
    remote.status = 'ACTIVE'; remote.status_update_time = '2026-10-13T00:15:00Z';
    const other = await api.call('user/auth', { email: 'other@example.com', name: 'Other', password: 'other-test-password' });
    assert.equal((await api.call('paypal/cancel-subscription', {}, other.data.token)).status, 404);
    assert.equal((await api.sale('YEARPAY', { amount: { total: '118.80', currency: 'USD' }, create_time: '2024-02-29T00:00:00Z' })).status, 200);
    assert.equal(await api.balance(), 12004);
    assert.equal((await api.subscription()).paidThrough, '2025-02-28T00:00:00.000Z');
    assert.equal((await api.profile()).plan, 'free', 'Expired prepaid access must not keep a paid plan forever');
    assert.equal((await api.call('paypal/cancel-subscription', {}, api.token)).status, 409);
    assert.equal((await api.call('paypal/cancel-subscription', { subscriptionId: 'stale-or-foreign-id' }, api.token)).status, 409);
    assert.equal(api.calls.some(call => call.pathname.endsWith('/cancel')), false);
    assert.equal((await api.call('paypal/cancel-subscription', { subscriptionId: (await api.subscription()).id }, api.token)).status, 200);
    assert.equal((await api.subscription()).status, 'CANCELLED');
    assert.equal(await api.balance(), 12004);
    assert.equal((await api.sale('YEARPAY', { amount: { total: '118.80', currency: 'USD' } })).status, 200);
    assert.equal(await api.balance(), 12004);
    assert.equal((await api.subscription()).status, 'CANCELLED');
    assert.equal((await api.subscription()).paidThrough, '2025-02-28T00:00:00.000Z');
  });

  test(`${backend} PayPal: server rejects different PayPal plan pricing before creating any subscription`, async testContext => {
    const api = await fixture(testContext, backend);
    api.tamperPlan(plan => { plan.billing_cycles[0].pricing_scheme.fixed_price.value = '20.00'; });
    assert.equal((await api.create()).status, 502);
    assert.equal(api.remoteSubscriptions.size, 0);
    assert.equal(await api.balance(), 4);
  });

  test(`${backend} admin ledger exposes real PayPal subscriptions and invoices in dashboard format`, async testContext => {
    const api = await fixture(testContext, backend);
    const admin = await api.call('admin/login', { username: 'admin', password: env.ADMIN_PASSWORD });
    assert.equal(admin.status, 200);
    const ledger = async () => (await api.call('admin/store', undefined, admin.data.token)).data;
    assert.deepEqual((await ledger()).invoices, []);
    await api.create();
    let store = await ledger();
    assert.equal(store.subscriptions.length, 1);
    assert.equal(store.subscriptions[0].status, 'trialing');
    assert.equal(store.subscriptions[0].amount, 19);
    api.remoteSubscriptions.get('I-SUB1').status = 'ACTIVE';
    assert.equal((await api.sale('ADMINPAYMENT')).status, 200);
    store = await ledger();
    const subscription = store.subscriptions[0];
    assert.equal(subscription.status, 'active');
    assert.equal(subscription.billingCycle, 'monthly');
    assert.equal(subscription.userEmail, 'owner@example.com');
    assert.equal(subscription.paymentMethod, 'PayPal');
    assert.ok(subscription.currentPeriodEnd);
    assert.equal(store.invoices.length, 1);
    assert.equal(store.invoices[0].subscriptionId, subscription.id);
    assert.equal(store.invoices[0].userEmail, 'owner@example.com');
    assert.equal(store.invoices[0].amount, 19);
    assert.equal(store.invoices[0].status, 'paid');
    assert.ok(store.invoices[0].date);
    assert.equal(store.invoices[0].planName, 'PRO (monthly)');
  });

  test(`${backend} PayPal: failed unpublished checkout releases its reservation so another plan can be selected`, async testContext => {
    const api = await fixture(testContext, backend);
    api.failNextCreation();
    assert.equal((await api.create()).status, 502);
    assert.equal(await api.ledger.current(api.userId), null);
    assert.equal((await api.create('enterprise', 'yearly')).status, 200);
    const subscription = await api.ledger.current(api.userId);
    assert.equal(subscription.plan, 'enterprise');
    assert.equal(subscription.billingCycle, 'yearly');
    assert.equal(await api.balance(), 4);
  });

  test(`${backend} PayPal: minimal creation responses still publish a recoverable approval`, async testContext => {
    const api = await fixture(testContext, backend);
    api.useMinimalCreationResponse();
    assert.equal((await api.create()).status, 200);
    const subscription = await api.subscription();
    assert.equal(subscription.paypalId, 'I-SUB1');
    assert.equal(subscription.userId, api.userId);
    assert.equal(subscription.plan, 'pro');
    assert.equal(await api.balance(), 4);
  });

  test(`${backend} PayPal: old unpublished reservations can be discarded, but published approvals cannot be deleted locally`, async testContext => {
    const api = await fixture(testContext, backend);
    const pending = { id: 'unpublished', userId: api.userId, paypalId: null, ...paypalCatalog(env).pro.monthly,
      plan: 'pro', billingCycle: 'monthly', status: 'pending', approvalUrl: '', paidThrough: '', createdAt: new Date().toISOString(), statusTime: '' };
    await api.ledger.insert(pending);
    assert.equal((await api.call('paypal/cancel-subscription', { subscriptionId: pending.id }, api.token)).status, 200);
    assert.equal(await api.ledger.current(api.userId), null);
    await assert.rejects(api.ledger.attach(pending.id, 'I-STALE', 'https://www.paypal.com/checkoutnow'));
    assert.equal((await api.create()).status, 200);
    const published = await api.ledger.current(api.userId);
    await api.ledger.discardPending(published.id, api.userId);
    assert.equal((await api.ledger.current(api.userId)).paypalId, published.paypalId);
  });
}

test('D1 PayPal: a suspension racing fulfillment returns failure without advancing access, and replay credits once', async testContext => {
  const api = await fixture(testContext, 'D1');
  await api.create();
  const subscription = await api.ledger.current(api.userId);
  api.remoteSubscriptions.get('I-SUB1').status = 'ACTIVE';
  api.suspendOnNextGrant();
  assert.equal((await api.sale('RACEDSUSPENSION')).status, 502);
  assert.equal(api.invoices().length, 0);
  assert.equal((await api.ledger.find(subscription.id)).paidThrough, '');
  assert.equal(await api.balance(), 4);
  api.suspend(api.userId, 'active');
  assert.equal((await api.sale('RACEDSUSPENSION')).status, 200);
  assert.equal((await api.sale('RACEDSUSPENSION')).status, 200);
  assert.equal(api.invoices().length, 1);
  assert.equal(await api.balance(), 1004);
});

test('admin billing preserves legacy records and normalizes annual cents and suspended subscriptions', () => {
  const legacy = { id: 'legacy', userId: 'owner', amount: 49, billingCycle: 'monthly', status: 'active', paymentMethod: 'Stripe' };
  for (const row of [
    { id: 'new', userId: 'owner', paypalId: 'I-1', planId: 'P-1', plan: 'pro', amountCents: 11880, billingCycle: 'yearly', status: 'SUSPENDED' },
    { id: 'new', user_id: 'owner', paypal_id: 'I-1', plan_id: 'P-1', plan: 'pro', amount_cents: 11880, billing_cycle: 'yearly', status: 'SUSPENDED' },
  ]) {
    const result = formatAdminBilling({ subscriptions: [legacy], paypalSubscriptions: [row], users: [{ id: 'owner', email: 'owner@example.com' }] });
    assert.equal(result.subscriptions[0].amount, 49);
    assert.equal(result.subscriptions[0].paymentMethod, 'Stripe');
    assert.equal(result.subscriptions[1].amount, 118.8);
    assert.equal(result.subscriptions[1].billingCycle, 'yearly');
    assert.equal(result.subscriptions[1].status, 'past_due');
  }
});

test('D1 admin authentication fails closed without configured credentials but retains stored custom passwords', async testContext => {
  const database = new DatabaseSync(':memory:');
  testContext.after(() => database.close());
  const DB = sqliteD1(database);
  const login = (password, overrides = {}) => onRequest({ env: { DB, ...overrides }, request: new Request('https://review.example/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password }),
  }) });
  assert.equal((await login('admin888')).status, 503);
  assert.equal((await login('', { ADMIN_PASSWORD: '   ' })).status, 503);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM admin_sessions').get().count, 0);
  database.prepare('INSERT INTO admin_config (key, value) VALUES (?, ?)').run('admin_password', 'stored-custom-password');
  assert.equal((await login('admin888')).status, 401);
  assert.equal((await login('stored-custom-password')).status, 200);
});

test('PayPal plan verification rejects free trials, setup fees, taxes, seat pricing and wrong cycles', () => {
  const offer = paypalCatalog(env).pro.monthly;
  for (const mutate of [
    plan => plan.billing_cycles.push({ tenure_type: 'TRIAL' }),
    plan => { plan.payment_preferences.setup_fee.value = '1.00'; },
    plan => { plan.taxes = { percentage: '10' }; },
    plan => { plan.quantity_supported = true; },
    plan => { plan.billing_cycles[0].frequency.interval_unit = 'YEAR'; },
  ]) {
    const plan = planDetails(offer, 'monthly'); mutate(plan);
    assert.throws(() => validatePayPalPlan(plan, offer, 'monthly'));
  }
});
