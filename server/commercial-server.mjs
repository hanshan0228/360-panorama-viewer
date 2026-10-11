import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const STORE_FILE = fileURLToPath(new URL('./data/store.json', import.meta.url));

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 1024 || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  const modern = parts.length === 3 && parts[0] === 'scrypt';
  const salt = modern ? parts[1] : parts[0];
  const expected = modern ? parts[2] : parts[1];
  if (!/^[a-f0-9]{32}$/i.test(salt || '') || !/^[a-f0-9]{128}$/i.test(expected || '')) return false;
  const actual = modern ? crypto.scryptSync(password, salt, 64)
    : crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512');
  return crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

// No filesystem side effects at import time. Corrupt/unavailable data fails closed.
export function readStore(file = STORE_FILE) {
  let store;
  try {
    store = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (cause) {
    throw new Error('Ledger is unavailable or corrupt', { cause });
  }
  for (const key of ['users', 'subscriptions', 'invoices']) {
    if (!Array.isArray(store[key])) throw new Error(`Invalid store: ${key}`);
  }
  return store;
}

export function writeStore(data, file = STORE_FILE) {
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    const fd = fs.openSync(temp, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(data, null, 2), 'utf8');
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

export function initializeStore(file = STORE_FILE, password = process.env.ADMIN_PASSWORD) {
  const validPassword = typeof password === 'string' && password.length >= 8;
  if (!fs.existsSync(file)) {
    if (!validPassword) throw new Error('Set ADMIN_PASSWORD (at least 8 characters)');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeStore({ schemaVersion: 2, adminPasswordHash: hashPassword(password), users: [],
      subscriptions: [], invoices: [], orders: [], processedEventIds: [] }, file);
    return;
  }
  const store = readStore(file);
  if (store.schemaVersion !== 2) {
    const legacy = !store.adminPasswordHash?.includes(':');
    if (legacy && !validPassword) throw new Error('Legacy password migration requires ADMIN_PASSWORD');
    fs.copyFileSync(file, `${file}.backup-${crypto.randomUUID()}`, fs.constants.COPYFILE_EXCL);
    if (legacy) store.adminPasswordHash = hashPassword(password);
    delete store.paymentConfig;
    store.schemaVersion = 2;
    store.orders = store.orders || [];
    store.processedEventIds = store.processedEventIds || [];
    writeStore(store, file);
  }
}

export function verifyStripeSignature(rawBody, header, secret) {
  if (typeof header !== 'string' || !secret) return { valid: false };
  const fields = header.split(',').map((v) => v.trim().split('='));
  const timestamp = fields.find(([k]) => k === 't')?.[1];
  if (!/^\d+$/.test(timestamp || '') || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return { valid: false };
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest();
  const valid = fields.some(([k, v]) => k === 'v1' && /^[a-f0-9]{64}$/i.test(v || '')
    && crypto.timingSafeEqual(Buffer.from(v, 'hex'), expected));
  return { valid };
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let oversized = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        oversized = true;
        chunks.length = 0;
      } else if (!oversized) chunks.push(chunk);
    });
    req.on('end', () => oversized ? reject(new Error('Payload too large')) : resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

// Single-process atomic JSON persistence, not a multi-instance transaction database.
export function createCommercialServer(options = {}) {
  const file = options.storeFile || STORE_FILE;
  const env = options.env || process.env;
  const persist = options.writeStore || writeStore;
  const sessions = new Map();
  const userSessions = new Map();
  const failures = new Map();
  return http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const authenticated = (sessions.get(token) || 0) > Date.now();
      if (pathname === '/api/health' && req.method === 'GET') {
        return sendJson(res, 200, { status: 'online', paymentsReady: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
          gateways: { stripeConfigured: Boolean(env.STRIPE_SECRET_KEY), stripeWebhookConfigured: Boolean(env.STRIPE_WEBHOOK_SECRET), paypalConfigured: false } });
      }

      // User Authentication and Identity Management
      if (pathname === '/api/user/auth' && req.method === 'POST') {
        const body = JSON.parse((await readRawBody(req)).toString());
        const { email, name } = body || {};
        if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return sendJson(res, 400, { success: false, error: 'Valid email address is required' });
        }
        const store = readStore(file);
        store.users = store.users || [];
        let user = store.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (!user) {
          user = {
            id: 'usr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12),
            email: email.toLowerCase(),
            name: typeof name === 'string' && name.trim() ? name.trim() : email.split('@')[0],
            plan: 'free',
            creditsBalance: 4,
            creditsTotal: 4,
            apiCallsCount: 0,
            status: 'active',
            createdAt: new Date().toISOString(),
          };
          store.users.push(user);
          persist(store, file);
        }
        const userToken = crypto.randomBytes(32).toString('hex');
        userSessions.set(userToken, { userId: user.id, expires: Date.now() + 7 * 86400000 });
        return sendJson(res, 200, { success: true, user, token: userToken });
      }

      if (pathname === '/api/user/me' && req.method === 'GET') {
        const session = userSessions.get(token);
        if (!session || session.expires < Date.now()) {
          return sendJson(res, 401, { success: false, error: 'Unauthorized or session expired' });
        }
        const store = readStore(file);
        const user = store.users?.find((u) => u.id === session.userId);
        if (!user) return sendJson(res, 404, { success: false, error: 'User not found' });
        return sendJson(res, 200, { success: true, user });
      }

      if (pathname === '/api/admin/login' && req.method === 'POST') {
        const ip = req.socket.remoteAddress;
        const prior = failures.get(ip);
        const attempt = prior && prior.until > Date.now() ? prior : { count: 0, until: Date.now() + 60000 };
        if (attempt.count >= 5) return sendJson(res, 429, { error: 'Too many login attempts' });
        const body = JSON.parse((await readRawBody(req)).toString());
        const { username, password } = body || {};
        const expectedUser = (env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
        const inputUser = (username || '').trim().toLowerCase();
        if (inputUser !== expectedUser || !verifyPassword(password, readStore(file).adminPasswordHash)) {
          failures.set(ip, { ...attempt, count: attempt.count + 1 });
          return sendJson(res, 401, { error: '管理员账号或密码错误，请核对凭证。' });
        }
        failures.delete(ip);
        const session = crypto.randomBytes(32).toString('hex');
        sessions.set(session, Date.now() + 3600000);
        return sendJson(res, 200, { success: true, token: session });
      }
      if (pathname.startsWith('/api/admin/')) {
        if (!authenticated) return sendJson(res, 401, { error: 'Unauthorized' });
        if (pathname === '/api/admin/logout' && req.method === 'POST') {
          sessions.delete(token);
          return sendJson(res, 200, { success: true });
        }
        if (pathname === '/api/admin/store' && req.method === 'GET') {
          const store = readStore(file);
          return sendJson(res, 200, { users: store.users, subscriptions: store.subscriptions, invoices: store.invoices });
        }
      }

      // Official Stripe Checkout Session Creation
      if (pathname === '/api/stripe/create-checkout-session' && req.method === 'POST') {
        if (!env.STRIPE_SECRET_KEY) {
          return sendJson(res, 503, {
            success: false,
            error: '服务端未配置 STRIPE_SECRET_KEY 私钥，暂不开放真实收款。',
          });
        }
        const body = JSON.parse((await readRawBody(req)).toString());
        const { plan, billingCycle, userId, userEmail, successUrl, cancelUrl } = body || {};
        if (!['pro', 'enterprise'].includes(plan) || !['monthly', 'yearly'].includes(billingCycle)) {
          return sendJson(res, 400, { success: false, error: 'Invalid plan or billing cycle' });
        }
        const store = readStore(file);
        store.users = store.users || [];
        const user = store.users.find(
          (u) =>
            (userId && u.id === userId) ||
            (userEmail && u.email?.toLowerCase() === userEmail.toLowerCase())
        );
        if (!user || user.status !== 'active') {
          return sendJson(res, 400, {
            success: false,
            error: '必须先绑定有效活跃用户身份才可创建付款会话',
          });
        }

        const PRICING_CENTS = {
          pro: { monthly: 1900, yearly: 11880, credits: 1000 },
          enterprise: { monthly: 4900, yearly: 34800, credits: 5000 },
        };
        const orderAmount = PRICING_CENTS[plan][billingCycle];
        const orderCredits = PRICING_CENTS[plan].credits;

        const params = new URLSearchParams();
        params.append('payment_method_types[0]', 'card');
        params.append('mode', 'payment');
        params.append('line_items[0][price_data][currency]', 'usd');
        params.append('line_items[0][price_data][unit_amount]', String(orderAmount));
        params.append('line_items[0][price_data][product_data][name]', `PanoramaAI Studio ${plan.toUpperCase()} (${billingCycle})`);
        params.append('line_items[0][quantity]', '1');
        params.append('client_reference_id', user.id);
        params.append('customer_email', user.email);
        params.append('success_url', successUrl || 'http://localhost:5173/?checkout_status=success');
        params.append('cancel_url', cancelUrl || 'http://localhost:5173/?checkout_status=cancelled');

        const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });
        if (!stripeRes.ok) {
          const errData = await stripeRes.json().catch(() => ({}));
          return sendJson(res, 400, {
            success: false,
            error: errData.error?.message || 'Stripe API 响应异常，无法创建结账会话',
          });
        }
        const sessionData = await stripeRes.json();
        const order = {
          checkoutSessionId: sessionData.id,
          userId: user.id,
          status: 'pending',
          plan,
          billingCycle,
          currency: 'usd',
          amountCents: orderAmount,
          credits: orderCredits,
          createdAt: new Date().toISOString(),
        };
        store.orders = store.orders || [];
        store.orders.push(order);
        persist(store, file);
        return sendJson(res, 200, { success: true, checkoutUrl: sessionData.url, sessionId: sessionData.id });
      }
      if (pathname === '/api/stripe/webhook' && req.method === 'POST') {
        if (!env.STRIPE_WEBHOOK_SECRET) return sendJson(res, 503, { error: 'Webhook unconfigured' });
        const raw = await readRawBody(req);
        if (!verifyStripeSignature(raw, req.headers['stripe-signature'], env.STRIPE_WEBHOOK_SECRET).valid) {
          return sendJson(res, 400, { error: 'Invalid signature' });
        }
        const event = JSON.parse(raw.toString());
        if (typeof event.id !== 'string' || !event.id.startsWith('evt_')) return sendJson(res, 400, { error: 'Invalid event' });
        if (event.type !== 'checkout.session.completed') return sendJson(res, 200, { received: true, ignored: true });
        const store = readStore(file);
        const session = event.data?.object;
        const live = env.PAYMENT_MODE === 'live';
        const order = store.orders?.find((o) => o.checkoutSessionId === session?.id);
        const user = store.users.find((u) => u.id === order?.userId);
        if (!order || !user || session.payment_status !== 'paid' || event.livemode !== live
          || session.livemode !== live || session.currency !== 'usd' || order.currency !== 'usd'
          || !Number.isSafeInteger(order.amountCents) || order.amountCents <= 0
          || session.amount_total !== order.amountCents || !['pro', 'enterprise'].includes(order.plan)
          || !['monthly', 'yearly'].includes(order.billingCycle) || user.status !== 'active'
          || !Number.isSafeInteger(order.credits) || order.credits <= 0
          || !Number.isFinite(user.creditsBalance) || !Number.isFinite(user.creditsTotal)) {
          return sendJson(res, 400, { error: 'Payment does not match a verified local order' });
        }
        if (store.processedEventIds?.includes(event.id) || order.status === 'fulfilled') {
          return sendJson(res, 200, { received: true, idempotent: true });
        }
        if (order.status !== 'pending') return sendJson(res, 400, { error: 'Order is not pending' });
        const next = { ...store,
          users: store.users.map((u) => u.id === user.id ? { ...u, plan: order.plan,
            creditsBalance: u.creditsBalance + order.credits, creditsTotal: u.creditsTotal + order.credits } : u),
          orders: store.orders.map((o) => o === order ? { ...o, status: 'fulfilled' } : o),
          invoices: [{ id: crypto.randomUUID(), userId: user.id, amount: order.amountCents / 100,
            currency: 'USD', status: 'paid', checkoutSessionId: session.id }, ...store.invoices],
          processedEventIds: [...(store.processedEventIds || []), event.id] };
        persist(next, file);
        return sendJson(res, 200, { received: true });
      }
      return sendJson(res, 404, { error: 'Route not found' });
    } catch (err) {
      console.error('[Commercial API]', err);
      return sendJson(res, err instanceof SyntaxError ? 400 : 500, { error: 'Request could not be processed; no success acknowledged' });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  initializeStore();
  createCommercialServer().listen(Number(process.env.PORT || 3001), '127.0.0.1', () => {
    console.info('Commercial backend listening on loopback; payment collection is disabled.');
  });
}
