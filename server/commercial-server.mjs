import { consumeJsonLimit, claimJsonTrial, positiveLimit } from './risk.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { handlePayPalRequest, createJsonPayPalLedger, paypalConfigured, formatAdminBilling } from './paypal.mjs';
import { buildImageModelRequest, inspectImageResolution, IMAGE_GENERATION_TIMEOUT_MS } from '../src/utils/imageModelRequest.mjs';

const STORE_FILE = fileURLToPath(new URL('./data/store.json', import.meta.url));

function freeCredits(config) {
  const value = config?.freeMonthlyCredits;
  return Number.isSafeInteger(value) && value >= 0 ? value : 4;
}

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

// Credential material (password_hash) must never leave the server in API payloads.
export function stripUserSecrets(user) {
  if (!user || typeof user !== 'object') return user;
  const safe = { ...user };
  delete safe.password_hash;
  return safe;
}

// Sliding-window counters for abuse-prone endpoints. Single-process best effort.
function rateLimitExceeded(buckets, key, limit, windowMs) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((time) => now - time < windowMs);
  buckets.set(key, hits);
  if (buckets.size > 10000) buckets.clear();
  return hits.length >= limit;
}

function recordRateHit(buckets, key) {
  const hits = buckets.get(key) || [];
  hits.push(Date.now());
  buckets.set(key, hits);
}

// Single-process atomic JSON persistence, not a multi-instance transaction database.
export function createCommercialServer(options = {}) {
  const file = options.storeFile || STORE_FILE;
  const env = options.env || process.env;
  const persist = options.writeStore || writeStore;
  const fetchUpstream = options.fetch || fetch;
  const sessions = new Map();
  const userSessions = new Map();
  const failures = new Map();
  const rateBuckets = new Map();
  return http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const authenticated = (sessions.get(token) || 0) > Date.now();
      if (pathname === '/api/health' && req.method === 'GET') {
        return sendJson(res, 200, { status: 'online', paymentsReady: paypalConfigured(env) || Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
          gateways: { stripeConfigured: Boolean(env.STRIPE_SECRET_KEY), stripeWebhookConfigured: Boolean(env.STRIPE_WEBHOOK_SECRET),
            paypalConfigured: paypalConfigured(env), paypalMode: env.PAYPAL_MODE || 'sandbox' } });
      }

      if (pathname.startsWith('/api/paypal/')) {
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers)) if (value) headers.set(name, String(value));
        const request = new Request(new URL(req.url, env.PAYPAL_RETURN_ORIGIN || 'http://localhost:5173'), {
          method: req.method, headers,
          ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: (await readRawBody(req)).toString() }),
        });
        const response = await handlePayPalRequest({ request, env, fetchImpl: fetchUpstream,
          ledger: createJsonPayPalLedger(() => readStore(file), store => persist(store, file)),
          authenticate: async () => {
            const session = userSessions.get(token);
            if (!session || session.expires <= Date.now()) return null;
            return readStore(file).users.find(user => user.id === session.userId) || null;
          },
        });
        return sendJson(res, response.status, await response.json());
      }

      // Guest User Session Initialization (Auto-grants 4 trial credits)
      if (pathname === '/api/user/guest' && req.method === 'POST') {
        if (env.FREE_TRIAL_ENABLED === 'false') return sendJson(res, 429, { error: 'Guest trials are temporarily paused. Sign in to continue.' });
        const guestIp = req.socket.remoteAddress || 'unknown';
        if (rateLimitExceeded(rateBuckets, `guest:hour:${guestIp}`, 5, 3600000)
          || rateLimitExceeded(rateBuckets, `guest:day:${guestIp}`, 20, 86400000)) {
          return sendJson(res, 429, { success: false, error: 'Too many trial accounts from this address. Sign in or try again later.' });
        }
        recordRateHit(rateBuckets, `guest:hour:${guestIp}`);
        recordRateHit(rateBuckets, `guest:day:${guestIp}`);
        const guestId = 'usr_guest_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
        const guestEmail = `guest_${guestId}@guest.panoramagenerator.ai`;
        const store = readStore(file);
        store.users = store.users || [];
        const source = crypto.createHash('sha256').update(guestIp).digest('hex');
        if (!consumeJsonLimit(store,'guest-create-global',200,86400000) || !consumeJsonLimit(store,'guest-create:'+source,1,7*86400000,1,Date.now(),true)) {
          persist(store,file); return sendJson(res,429,{error:'This network has already initialized a trial. Sign in to continue.'});
        }
        const credits = claimJsonTrial(store, source, freeCredits(store.billing_config));
        const guestUser = {
          id: guestId,
          email: guestEmail,
          name: 'Free Trial Guest',
          plan: 'free',
          creditsBalance: credits,
          creditsTotal: credits,
          apiCallsCount: 0,
          status: 'active',
          createdAt: new Date().toISOString(),
        };
        store.users.push(guestUser);
        persist(store, file);

        const guestToken = crypto.randomBytes(32).toString('hex');
        userSessions.set(guestToken, { userId: guestId, expires: Date.now() + 7 * 86400000 });
        return sendJson(res, 200, { success: true, user: stripUserSecrets(guestUser), token: guestToken });
      }

      // User Authentication and Identity Management with Password support
      if (pathname === '/api/user/auth' && req.method === 'POST') {
        const authIp = req.socket.remoteAddress || 'unknown';
        const authFailKey = `authfail:${authIp}`;
        if (rateLimitExceeded(rateBuckets, authFailKey, 10, 600000)) {
          return sendJson(res, 429, { success: false, error: 'Too many failed sign-in attempts. Try again later.' });
        }
        const body = JSON.parse((await readRawBody(req)).toString());
        const { email, name, password, mode } = body || {};
        if (password !== undefined && typeof password !== 'string') return sendJson(res, 400, { success: false, error: 'Password must be a string' });
        if (mode !== undefined && mode !== 'login' && mode !== 'register') return sendJson(res, 400, { success: false, error: 'Invalid authentication mode' });
        if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return sendJson(res, 400, { success: false, error: 'Valid email address is required' });
        }
        const store = readStore(file);
        store.users = store.users || [];
        const authSource = crypto.createHash('sha256').update(authIp).digest('hex');
        const authAllowed = consumeJsonLimit(store,'auth-global',2000,86400000) && consumeJsonLimit(store,'auth-source:'+authSource,30,600000);
        persist(store,file);
        if (!authAllowed) return sendJson(res,429,{error:'Sign-in safety limit reached. Retry later.'});
        let user = store.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (!user && mode === 'login') {
          recordRateHit(rateBuckets, authFailKey);
          return sendJson(res, 401, { success: false, error: 'Email or password is incorrect.' });
        }
        if (user && mode === 'register') return sendJson(res, 409, { success: false, error: 'An account already exists for this email. Sign in instead.' });
        if (user) {
          if (user.password_hash) {
            if (!password) {
              recordRateHit(rateBuckets, authFailKey);
              return sendJson(res, 401, { success: false, error: 'Enter your account password.' });
            }
            if (!verifyPassword(password, user.password_hash)) {
              recordRateHit(rateBuckets, authFailKey);
              return sendJson(res, 401, { success: false, error: 'Email or password is incorrect.' });
            }
          } else {
            recordRateHit(rateBuckets, authFailKey);
            return sendJson(res, 403, { success: false, error: 'This managed account has no password yet. Contact your administrator.' });
          }
        } else {
          if (rateLimitExceeded(rateBuckets, `register:${authIp}`, 5, 3600000)) {
            return sendJson(res, 429, { success: false, error: 'Too many new accounts from this address. Try again later.' });
          }
          if (typeof password !== 'string' || password.length < 6 || password.length > 1024) {
            return sendJson(res, 400, { success: false, error: 'New accounts require a password between 6 and 1024 characters.' });
          }
          const source = crypto.createHash('sha256').update(authIp).digest('hex');
          if (!consumeJsonLimit(store,'register-create-global',100,86400000) || !consumeJsonLimit(store,'register-create:'+source,5,86400000)) {
            persist(store,file); return sendJson(res,429,{error:'Account creation safety limit reached. Try later.'});
          }
          const credits = claimJsonTrial(store, source, freeCredits(store.billing_config), env.FREE_TRIAL_ENABLED !== 'false');
          user = {
            id: 'usr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12),
            email: email.toLowerCase(),
            name: typeof name === 'string' && name.trim() ? name.trim() : email.split('@')[0],
            plan: 'free',
            creditsBalance: credits,
            creditsTotal: credits,
            apiCallsCount: 0,
            status: 'active',
            password_hash: hashPassword(password),
            createdAt: new Date().toISOString(),
          };
          store.users.push(user);
          persist(store, file);
          recordRateHit(rateBuckets, `register:${authIp}`);
        }
        rateBuckets.delete(authFailKey);
        const userToken = crypto.randomBytes(32).toString('hex');
        userSessions.set(userToken, { userId: user.id, expires: Date.now() + 7 * 86400000 });
        return sendJson(res, 200, { success: true, user: stripUserSecrets(user), token: userToken });
      }

      if (pathname === '/api/user/me' && req.method === 'GET') {
        const session = userSessions.get(token);
        if (!session || session.expires < Date.now()) {
          return sendJson(res, 401, { success: false, error: 'Unauthorized or session expired' });
        }
        await createJsonPayPalLedger(() => readStore(file), store => persist(store, file)).syncAccess(session.userId);
        const store = readStore(file);
        const user = store.users?.find((u) => u.id === session.userId);
        if (!user) return sendJson(res, 404, { success: false, error: 'User not found' });
        return sendJson(res, 200, { success: true, user: stripUserSecrets(user) });
      }

      if (pathname === '/api/user/deduct-credits' && req.method === 'POST') {
        const session = userSessions.get(token);
        if (!session || session.expires < Date.now()) {
          return sendJson(res, 401, { success: false, error: 'Unauthorized or session expired' });
        }
        const { credits } = JSON.parse((await readRawBody(req)).toString());
        const amt = typeof credits === 'number' ? Math.floor(credits) : 0;
        if (amt <= 0) return sendJson(res, 400, { success: false, error: 'Invalid credits' });
        const store = readStore(file);
        const user = store.users?.find((u) => u.id === session.userId);
        if (!user || user.status !== 'active') return sendJson(res, 400, { success: false, error: 'Account inactive' });
        if (user.creditsBalance < amt) return sendJson(res, 400, { success: false, error: 'Insufficient credits.' });
        user.creditsBalance -= amt;
        user.apiCallsCount = (user.apiCallsCount || 0) + 1;
        persist(store, file);
        return sendJson(res, 200, { success: true, remaining: user.creditsBalance });
      }

      if (pathname === '/api/models' && req.method === 'GET') {
        const store = readStore(file);
        const raw = store.models_config;
        if (!raw) return sendJson(res, 200, { success: true, endpoints: null, routingConfig: null });
        const rawEndpoints = Array.isArray(raw) ? raw : raw.endpoints || [];
        const sanitized = rawEndpoints.map((ep) => ({
          ...ep,
          apiKey: '',
          hasServerKey: Boolean(ep.apiKey && String(ep.apiKey).trim()),
        }));
        const routing = Array.isArray(raw) ? null : raw.routingConfig || null;
        return sendJson(res, 200, { success: true, endpoints: sanitized, routingConfig: routing });
      }

      if (pathname === '/api/generate' && req.method === 'POST') {
        const body = JSON.parse((await readRawBody(req)).toString());
        const { prompt, endpointId, modelId, referenceImages } = body || {};
        if (!prompt || typeof prompt !== 'string' || prompt.length > 10000) {
          return sendJson(res, 400, { success: false, error: 'Prompt is required' });
        }

        if (!token) {
          return sendJson(res, 401, { success: false, error: 'Sign in or initialize a trial session before generating a panorama.' });
        }

        const session = userSessions.get(token);
        if (!session || session.expires < Date.now()) {
          return sendJson(res, 401, { success: false, error: 'Your session has expired. Please sign in again.' });
        }

        const store = readStore(file);
        const user = store.users?.find((u) => u.id === session.userId);
        if (!user) {
          return sendJson(res, 404, { success: false, error: 'Account not found.' });
        }

        if (user.status !== 'active') {
          return sendJson(res, 403, { success: false, error: 'This account is suspended and cannot generate images.' });
        }

        const resolution = body.resolution ?? '4K';
        const defaultCosts = { '1K': 1, '2K': 2, '4K': 4 };
        if (typeof resolution !== 'string' || !Object.hasOwn(defaultCosts, resolution)) {
          return sendJson(res, 400, { success: false, error: 'Invalid resolution' });
        }
        const cost = store.billing_config?.[`creditCostPer${resolution}`] ?? defaultCosts[resolution];
        if (!Number.isSafeInteger(cost) || cost <= 0) {
          return sendJson(res, 503, { success: false, error: 'Generation credit rates are unavailable. Contact support.' });
        }
        if (user.creditsBalance < cost) {
          return sendJson(res, 400, { success: false, error: `Insufficient credits. This generation costs ${cost} credits; ${user.creditsBalance} are available.` });
        }

        const rawModels = store.models_config;
        const endpoints = rawModels ? (Array.isArray(rawModels) ? rawModels : rawModels.endpoints || []) : [];
        let targetEp = null;
        if (endpointId) {
          targetEp = endpoints.find((ep) => ep.id === endpointId);
          if (!targetEp) {
            return sendJson(res, 400, { success: false, error: `Model endpoint [${endpointId}] was not found.` });
          }
          if (!targetEp.isEnabled) {
            return sendJson(res, 400, { success: false, error: `Model endpoint [${targetEp.name || endpointId}] is disabled.` });
          }
        } else if (modelId) {
          targetEp = endpoints.find((ep) => (ep.id === modelId || ep.model === modelId) && ep.isEnabled);
        }

        if (!targetEp) {
          targetEp = endpoints.find((ep) => ep.isEnabled && ep.isDefault) || endpoints.find((ep) => ep.isEnabled);
        }

        if (!targetEp) {
          return sendJson(res, 503, { success: false, error: 'No image model is configured on this server. Please contact support.' });
        }

        const model = targetEp.model || 'gemini-3.1-flash-image';
        let upstreamRequest;
        try {
          upstreamRequest = buildImageModelRequest({ ...targetEp, model }, { prompt, referenceImages, resolution });
        } catch (error) {
          return sendJson(res, 400, { success: false, error: error instanceof Error ? error.message : 'Invalid model configuration' });
        }
        const { url: targetUrl, headers, payload, mode } = upstreamRequest;
        const isGoogleOfficial = mode.startsWith('google-');
        const isImagen = mode === 'google-imagen';
        const isChatMode = mode === 'chat';

        if (env.GENERATION_ENABLED === 'false') return sendJson(res,429,{error:'Generation is temporarily paused. No credits were charged.'});
        const leaseId = crypto.randomUUID(), now = Date.now();
        store.riskLeases = (store.riskLeases || []).filter(lease => lease.expires_at > now);
        if (store.riskLeases.length >= positiveLimit(env.MAX_CONCURRENT_GENERATIONS,4) || store.riskLeases.filter(lease => lease.owner_id === user.id).length >= 2) return sendJson(res,429,{error:'Generation is busy. Retry shortly.'});
        const source = crypto.createHash('sha256').update(req.socket.remoteAddress || 'unknown').digest('hex');
        const budgets = [['generation-attempts',200,1],['generation-all',positiveLimit(env.MAX_DAILY_GENERATION_CREDITS,1000),cost]];
        if (!user.plan || user.plan === 'free' || user.id.startsWith('usr_guest')) budgets.push(['generation-free-attempts',25,1],['generation-free',positiveLimit(env.MAX_DAILY_FREE_CREDITS,100),cost], ['generation-source:'+source,20,cost], ['generation-user:'+user.id,10,1]);
        for (const [key,limit,amount] of budgets) if (!consumeJsonLimit(store,key,limit,86400000,amount)) { persist(store,file); return sendJson(res,429,{error:'Daily generation safety limit reached. No credits were charged.'}); }
        store.riskLeases.push({id:leaseId, owner_id:user.id, expires_at:now+240000});
        // ponytail: synchronous reservations cover one Node process; use D1 for multiple instances.
        user.creditsBalance -= cost;
        persist(store, file);
        let completed = false;
        let responseStatus = 200;
        let responseData;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), IMAGE_GENERATION_TIMEOUT_MS);

        try {
          const upstreamStarted = Date.now();
          const upstreamRes = await fetchUpstream(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: ctrl.signal,
          });

          if (!upstreamRes.ok) {
            const errText = await upstreamRes.text();
            responseStatus = 502;
            throw new Error(`Model endpoint returned HTTP ${upstreamRes.status}: ${errText.slice(0, 240)}`);
          }

          const upstreamWaitMs = Date.now() - upstreamStarted;
          const data = await upstreamRes.json();
          const generationTiming = { upstreamWaitMs, upstreamBodyMs: Date.now() - upstreamStarted - upstreamWaitMs };
          let imageUrl = null;

          if (isGoogleOfficial && isImagen) {
            if (data.predictions && data.predictions[0]?.bytesBase64Encoded) {
              imageUrl = `data:image/png;base64,${data.predictions[0].bytesBase64Encoded}`;
            }
          } else if (isGoogleOfficial) {
            const parts = data.candidates?.[0]?.content?.parts || [];
            const part = parts.find((item) => item?.inlineData?.data);
            if (part?.inlineData?.data) {
              imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
            } else {
              const text = parts.filter((item) => typeof item?.text === 'string')
                .map((item) => item.text).join('\n');
              const b64 = text.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
              imageUrl = b64 ? b64[0] : (text.match(/https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|webp)/i)?.[0] || null);
            }
          } else if (isChatMode) {
            const msg = data.choices?.[0]?.message;
            if (msg?.images && msg.images[0]?.image_url?.url) {
              imageUrl = msg.images[0].image_url.url;
            } else if (typeof msg?.content === 'string') {
              const b64 = msg.content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
              imageUrl = b64 ? b64[0] : (msg.content.match(/https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|webp)/i)?.[0] || null);
            }
          } else {
            const item = data.data?.[0];
            if (item?.b64_json) {
              imageUrl = item.b64_json.startsWith('data:image') ? item.b64_json : `data:image/png;base64,${item.b64_json}`;
            } else if (item?.url) {
              imageUrl = item.url;
            }
          }

          if (!imageUrl) {
            responseStatus = 502;
            throw new Error('The model responded without a valid image.');
          }

          const imageResolution = inspectImageResolution(imageUrl, resolution);
          console.info('[generation-quality]', JSON.stringify({ endpointId: targetEp.id, model, resolution, imageResolution }));
          const creditsRefunded = imageResolution.status === 'below-request' ? cost : 0;
          const latestStore = readStore(file);
          const latestUser = latestStore.users.find(entry => entry.id === user.id);
          if (!latestUser) throw new Error('User no longer exists');
          latestUser.creditsBalance += creditsRefunded;
          latestUser.apiCallsCount = (latestUser.apiCallsCount || 0) + 1;
          persist(latestStore, file);
          completed = true;

          responseData = {
            success: true,
            imageUrl,
            modelUsed: model,
            generationTiming,
            remainingCredits: latestUser.creditsBalance,
            creditsDeducted: cost - creditsRefunded,
            creditsRefunded,
            imageResolution,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (responseStatus === 200) responseStatus = 504;
          responseData = { success: false, error: responseStatus === 502 ? message : `Image model request failed: ${message}` };
        } finally {
          clearTimeout(timer);
          const safetyStore = readStore(file);
          safetyStore.riskLeases = (safetyStore.riskLeases || []).filter(lease => lease.id !== leaseId);
          persist(safetyStore,file);
          if (!completed) {
            const latestStore = readStore(file);
            const latestUser = latestStore.users.find(entry => entry.id === user.id);
            if (latestUser) {
              latestUser.creditsBalance += cost;
              persist(latestStore, file);
            }
          }
        }
        return sendJson(res, responseStatus, responseData);
      }
      // Public Billing Rules Query
      if (pathname === '/api/billing' && req.method === 'GET') {
        const store = readStore(file);
        const config = store.billing_config || {
          freeMonthlyCredits: 4,
          proMonthlyPriceUsd: 9.9,
          proMonthlyCredits: 1000,
          enterpriseCustomPricing: true,
          creditCostPer1K: 1,
          creditCostPer2K: 2,
          creditCostPer4K: 4,
        };
        return sendJson(res, 200, { success: true, config });
      }

      if (pathname === '/api/admin/login' && req.method === 'POST') {
        const ip = req.socket.remoteAddress;
        const prior = failures.get(ip);
        const attempt = prior && prior.until > Date.now() ? prior : { count: 0, until: Date.now() + 60000 };
        if (attempt.count >= 5) return sendJson(res, 429, { error: 'Too many login attempts' });
        const body = JSON.parse((await readRawBody(req)).toString());
        const { username, password } = body || {};
        const store = readStore(file);
        const expectedUser = (store.admin_username || env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
        const inputUser = (username || '').trim().toLowerCase();
        const expectedHash = store.adminPasswordHash;
        if (inputUser !== expectedUser || !verifyPassword(password, expectedHash)) {
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
          return sendJson(res, 200, {
            users: (store.users || []).map(stripUserSecrets),
            ...formatAdminBilling(store),
          });
        }
        // Admin Write: Adjust User Credits
        if (pathname === '/api/admin/users/credits' && req.method === 'POST') {
          const { userId, delta } = JSON.parse((await readRawBody(req)).toString());
          if (!userId || typeof delta !== 'number' || isNaN(delta)) {
            return sendJson(res, 400, { success: false, error: 'Invalid userId or delta' });
          }
          const store = readStore(file);
          const target = store.users?.find((u) => u.id === userId);
          if (!target) return sendJson(res, 404, { success: false, error: 'User not found' });
          target.creditsBalance = Math.max(0, target.creditsBalance + delta);
          if (delta > 0) target.creditsTotal = (target.creditsTotal || 0) + delta;
          persist(store, file);
          return sendJson(res, 200, { success: true, user: stripUserSecrets(target) });
        }
        // Admin Write: Update User Account Status
        if (pathname === '/api/admin/users/status' && req.method === 'POST') {
          const { userId, status } = JSON.parse((await readRawBody(req)).toString());
          if (!userId || !['active', 'suspended'].includes(status)) {
            return sendJson(res, 400, { success: false, error: 'Invalid userId or status' });
          }
          const store = readStore(file);
          const target = store.users?.find((u) => u.id === userId);
          if (!target) return sendJson(res, 404, { success: false, error: 'User not found' });
          target.status = status;
          persist(store, file);
          return sendJson(res, 200, { success: true, userId, status });
        }
        // Admin Write: Create Managed User
        if (pathname === '/api/admin/users/create' && req.method === 'POST') {
          const body = JSON.parse((await readRawBody(req)).toString());
          const { name, email, plan, credits, creditsBalance, password } = body;
          if (!email || !name) {
            return sendJson(res, 400, { success: false, error: 'Name and email are required' });
          }
          const store = readStore(file);
          const newId = 'usr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
          const rawCredits = typeof credits === 'number' ? credits : typeof creditsBalance === 'number' ? creditsBalance : 1000;
          const initialPwd = typeof password === 'string' && password.length >= 6
            ? password
            : 'Pano_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
          const newUsr = {
            id: newId,
            email: email.toLowerCase(),
            name: name.trim(),
            plan: plan || 'pro',
            creditsBalance: rawCredits,
            creditsTotal: rawCredits,
            status: 'active',
            password_hash: hashPassword(initialPwd),
            createdAt: new Date().toISOString(),
          };
          store.users = store.users || [];
          store.users.unshift(newUsr);
          persist(store, file);
          return sendJson(res, 200, { success: true, user: stripUserSecrets(newUsr), initialPassword: initialPwd });
        }
        // Admin Write: Persist Billing Configuration
        if (pathname === '/api/admin/billing' && req.method === 'POST') {
          const { config } = JSON.parse((await readRawBody(req)).toString());
          if (!config) return sendJson(res, 400, { success: false, error: 'Config required' });
          if ('freeMonthlyCredits' in Object(config) && (!Number.isSafeInteger(config.freeMonthlyCredits) || config.freeMonthlyCredits < 0)) {
            return sendJson(res, 400, { success: false, error: 'Free credits must be a non-negative safe integer' });
          }
          const store = readStore(file);
          store.billing_config = config;
          persist(store, file);
          return sendJson(res, 200, { success: true, config });
        }
        if (pathname === '/api/admin/models' && req.method === 'POST') {
          const body = JSON.parse((await readRawBody(req)).toString());
          const toSave = Array.isArray(body.endpoints)
            ? { endpoints: body.endpoints, routingConfig: body.routingConfig || null }
            : body;
          if (!Array.isArray(toSave.endpoints)) return sendJson(res, 400, { success: false, error: 'Endpoints array required' });
          const store = readStore(file);

          const existingRaw = store.models_config;
          const existingEndpoints = existingRaw ? (Array.isArray(existingRaw) ? existingRaw : existingRaw.endpoints || []) : [];

          const mergedEndpoints = toSave.endpoints.map((newEp) => {
            const oldEp = existingEndpoints.find((o) => o.id === newEp.id);
            const hasNewKey = typeof newEp.apiKey === 'string' && newEp.apiKey.trim().length > 0;
            return {
              ...newEp,
              apiKey: hasNewKey
                ? newEp.apiKey.trim()
                : oldEp && typeof oldEp.apiKey === 'string'
                ? oldEp.apiKey
                : '',
            };
          });
          toSave.endpoints = mergedEndpoints;

          store.models_config = toSave;
          persist(store, file);
          return sendJson(res, 200, { success: true, count: toSave.endpoints.length });
        }
        // Admin Write: Persist Admin Credentials
        if (pathname === '/api/admin/credentials' && req.method === 'POST') {
          const { currentPassword, newUsername, newPassword } = JSON.parse((await readRawBody(req)).toString());
          const store = readStore(file);
          if (!verifyPassword(currentPassword, store.adminPasswordHash)) {
            return sendJson(res, 401, { success: false, error: '当前旧密码输入错误' });
          }
          if (typeof newPassword !== 'string' || newPassword.trim().length < 6 || newPassword.trim().length > 1024) {
            return sendJson(res, 400, { success: false, error: '新密码不能少于 6 个字符' });
          }
          store.adminPasswordHash = hashPassword(newPassword.trim());
          if (newUsername && typeof newUsername === 'string') {
            store.admin_username = newUsername.trim();
          }
          persist(store, file);
          sessions.clear();
          return sendJson(res, 200, { success: true });
        }
      }

      // Official Stripe Checkout Session Creation
      if (pathname === '/api/stripe/create-checkout-session' && req.method === 'POST') {
        if (!env.STRIPE_SECRET_KEY) {
          return sendJson(res, 503, {
            success: false,
            error: 'Stripe payments are unavailable on this server.',
          });
        }
        const body = JSON.parse((await readRawBody(req)).toString());
        // The checkout owner comes from the authenticated session; ids in the body are not trusted.
        const { plan, billingCycle, successUrl, cancelUrl } = body || {};
        if (!['pro', 'enterprise'].includes(plan) || !['monthly', 'yearly'].includes(billingCycle)) {
          return sendJson(res, 400, { success: false, error: 'Invalid plan or billing cycle' });
        }
        const store = readStore(file);
        store.users = store.users || [];
        const checkoutSession = userSessions.get(token);
        const user = checkoutSession && checkoutSession.expires > Date.now()
          ? store.users.find((u) => u.id === checkoutSession.userId)
          : null;
        if (!user || user.status !== 'active') {
          return sendJson(res, 401, {
            success: false,
            error: 'Sign in with an active account before starting checkout.',
          });
        }

        const PRICING_CENTS = {
          pro: { monthly: 990, yearly: 11880, credits: 1000 },
          enterprise: { monthly: 2999, yearly: 34800, credits: 5000 },
        };
        const orderAmount = PRICING_CENTS[plan][billingCycle];
        // Yearly plans grant twelve monthly allotments, matching the PayPal catalog.
        const orderCredits = billingCycle === 'yearly'
          ? PRICING_CENTS[plan].credits * 12
          : PRICING_CENTS[plan].credits;

        const returnOrigin = env.PAYPAL_RETURN_ORIGIN || 'http://localhost:5173';
        const safeReturnUrl = (value, fallbackPath) => {
          try {
            const candidate = new URL(value);
            if (candidate.origin === returnOrigin) return candidate.toString();
          } catch {
            // fall through to the configured origin
          }
          return `${returnOrigin}${fallbackPath}`;
        };

        const params = new URLSearchParams();
        params.append('payment_method_types[0]', 'card');
        params.append('mode', 'payment');
        params.append('line_items[0][price_data][currency]', 'usd');
        params.append('line_items[0][price_data][unit_amount]', String(orderAmount));
        params.append('line_items[0][price_data][product_data][name]', `PanoramaAI Studio ${plan.toUpperCase()} (${billingCycle})`);
        params.append('line_items[0][quantity]', '1');
        params.append('client_reference_id', user.id);
        params.append('customer_email', user.email);
        params.append('success_url', safeReturnUrl(successUrl, '/?checkout_status=success'));
        params.append('cancel_url', safeReturnUrl(cancelUrl, '/?checkout_status=cancelled'));

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
            error: errData.error?.message || 'Unable to create a Stripe checkout session.',
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
