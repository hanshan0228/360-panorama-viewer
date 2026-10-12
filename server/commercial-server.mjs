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

      // Guest User Session Initialization (Auto-grants 4 trial credits)
      if (pathname === '/api/user/guest' && req.method === 'POST') {
        const guestId = 'usr_guest_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
        const guestEmail = `guest_${guestId}@guest.panoramagenerator.ai`;
        const store = readStore(file);
        store.users = store.users || [];
        const guestUser = {
          id: guestId,
          email: guestEmail,
          name: 'Free Trial Guest',
          plan: 'free',
          creditsBalance: 4,
          creditsTotal: 4,
          apiCallsCount: 0,
          status: 'active',
          createdAt: new Date().toISOString(),
        };
        store.users.push(guestUser);
        persist(store, file);

        const guestToken = crypto.randomBytes(32).toString('hex');
        userSessions.set(guestToken, { userId: guestId, expires: Date.now() + 7 * 86400000 });
        return sendJson(res, 200, { success: true, user: guestUser, token: guestToken });
      }

      // User Authentication and Identity Management with Password support
      if (pathname === '/api/user/auth' && req.method === 'POST') {
        const body = JSON.parse((await readRawBody(req)).toString());
        const { email, name, password } = body || {};
        if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return sendJson(res, 400, { success: false, error: 'Valid email address is required' });
        }
        const store = readStore(file);
        store.users = store.users || [];
        let user = store.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (user) {
          if (user.password_hash) {
            if (!password) {
              return sendJson(res, 401, { success: false, error: '请输入账户密码' });
            }
            if (!verifyPassword(password, user.password_hash)) {
              return sendJson(res, 401, { success: false, error: '账户密码错误，请核对凭证' });
            }
          } else {
            return sendJson(res, 403, { success: false, error: '该受管账户尚未激活初始密码，请联系管理员获取凭证。' });
          }
        } else {
          user = {
            id: 'usr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12),
            email: email.toLowerCase(),
            name: typeof name === 'string' && name.trim() ? name.trim() : email.split('@')[0],
            plan: 'free',
            creditsBalance: 4,
            creditsTotal: 4,
            apiCallsCount: 0,
            status: 'active',
            password_hash: password && password.length >= 6 ? hashPassword(password) : undefined,
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
        if (user.creditsBalance < amt) return sendJson(res, 400, { success: false, error: '积分余额不足' });
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
        const { prompt, endpointId, modelId, referenceImages, creditsCost } = body || {};
        if (!prompt || typeof prompt !== 'string') {
          return sendJson(res, 400, { success: false, error: 'Prompt is required' });
        }

        if (!token) {
          return sendJson(res, 401, { success: false, error: '未授权：请先登录或初始化试用会话' });
        }

        const session = userSessions.get(token);
        if (!session || session.expires < Date.now()) {
          return sendJson(res, 401, { success: false, error: '登录会话已过期，请重新登录账户' });
        }

        const store = readStore(file);
        const user = store.users?.find((u) => u.id === session.userId);
        if (!user) {
          return sendJson(res, 404, { success: false, error: '用户账户不存在' });
        }

        if (user.status !== 'active') {
          return sendJson(res, 403, { success: false, error: '该账户已被管理员封禁挂起，无法使用生图服务' });
        }

        const cost = typeof creditsCost === 'number' && creditsCost > 0 ? Math.floor(creditsCost) : 4;
        if (user.creditsBalance < cost) {
          return sendJson(res, 400, { success: false, error: `账户积分不足！本次生成需要 ${cost} 积分，当前可用余额为 ${user.creditsBalance} 积分。` });
        }

        const rawModels = store.models_config;
        const endpoints = rawModels ? (Array.isArray(rawModels) ? rawModels : rawModels.endpoints || []) : [];
        let targetEp = null;
        if (endpointId) {
          targetEp = endpoints.find((ep) => ep.id === endpointId);
          if (!targetEp) {
            return sendJson(res, 400, { success: false, error: `指定模型端点 [${endpointId}] 不存在` });
          }
          if (!targetEp.isEnabled) {
            return sendJson(res, 400, { success: false, error: `指定模型端点 [${targetEp.name || endpointId}] 当前已停用` });
          }
        } else if (modelId) {
          targetEp = endpoints.find((ep) => (ep.id === modelId || ep.model === modelId) && ep.isEnabled);
        }

        if (!targetEp) {
          targetEp = endpoints.find((ep) => ep.isEnabled && ep.isDefault) || endpoints.find((ep) => ep.isEnabled);
        }

        if (!targetEp) {
          return sendJson(res, 503, { success: false, error: '未配置可用的生图模型端点' });
        }

        const rawBase = (targetEp.baseUrl || '').replace(/\/+$/, '');
        const apiKey = (targetEp.apiKey || '').trim();
        const model = targetEp.model || 'gemini-3.1-flash-image';
        const validRefs = (referenceImages || []).filter(Boolean);

        const isGoogleOfficial = rawBase.includes('googleapis.com') || (targetEp.provider === 'gemini' && rawBase.includes('googleapis'));
        const isChatMode = model.toLowerCase().includes('gemini') || rawBase.includes('/chat');

        // Reject reference images on endpoints that do not support them
        if (validRefs.length > 0 && !isChatMode && !isGoogleOfficial) {
          return sendJson(res, 400, {
            success: false,
            error: `所选模型端点 [${targetEp.name || model}] 为纯文本生图接口 (/v1/images/generations)，不支持参考图片条件输入。请切换至支持多模态的 Gemini 模型端点，或移除参考图片后重试。`
          });
        }

        let targetUrl = '';
        let headers = { 'Content-Type': 'application/json' };
        let payload = null;

        if (isGoogleOfficial) {
          if (!apiKey) {
            return sendJson(res, 400, { success: false, error: 'Google AI Studio 官方端点需要配置有效 API Key' });
          }
          const isImagen = model.toLowerCase().includes('imagen');
          if (isImagen) {
            targetUrl = `${rawBase}/v1beta/models/${model}:predict?key=${encodeURIComponent(apiKey)}`;
            payload = {
              instances: [{ prompt }],
              parameters: {
                sampleCount: 1,
                aspectRatio: '16:9',
                outputMimeType: 'image/png',
              },
            };
          } else {
            targetUrl = `${rawBase}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
            const parts = [{ text: prompt }];
            for (const img of validRefs) {
              const m = String(img).match(/^data:([^;]+);base64,(.+)$/);
              if (m) parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
            }
            payload = { contents: [{ parts }] };
          }
        } else {
          targetUrl = isChatMode
            ? (rawBase.endsWith('/v1') ? `${rawBase}/chat/completions` : `${rawBase}/v1/chat/completions`)
            : (rawBase.endsWith('/v1') ? `${rawBase}/images/generations` : `${rawBase}/v1/images/generations`);

          if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

          const messageContent = validRefs.length > 0 && isChatMode
            ? [
                { type: 'text', text: prompt },
                ...validRefs.map((img) => ({ type: 'image_url', image_url: { url: img } })),
              ]
            : prompt;

          payload = isChatMode
            ? { model, messages: [{ role: 'user', content: messageContent }] }
            : { model, prompt, n: 1, size: '1792x1024', response_format: 'b64_json' };
        }

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 90000);

        try {
          let upstreamRes = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: ctrl.signal,
          });

          if (!upstreamRes.ok && upstreamRes.status === 400 && validRefs.length > 0 && isChatMode && !isGoogleOfficial) {
            upstreamRes = await fetch(targetUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
              signal: ctrl.signal,
            });
          }

          clearTimeout(timer);

          if (!upstreamRes.ok) {
            const errText = await upstreamRes.text();
            return sendJson(res, 502, { success: false, error: `模型端点返回 HTTP ${upstreamRes.status}: ${errText.slice(0, 240)}` });
          }

          const data = await upstreamRes.json();
          let imageUrl = null;

          if (isGoogleOfficial && model.toLowerCase().includes('imagen')) {
            if (data.predictions && data.predictions[0]?.bytesBase64Encoded) {
              imageUrl = `data:image/png;base64,${data.predictions[0].bytesBase64Encoded}`;
            }
          } else if (isGoogleOfficial) {
            const part = data.candidates?.[0]?.content?.parts?.[0];
            if (part?.inlineData?.data) {
              imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
            } else if (typeof part?.text === 'string') {
              const b64 = part.text.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
              imageUrl = b64 ? b64[0] : (part.text.match(/https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|webp)/i)?.[0] || null);
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

          if (!imageUrl) return sendJson(res, 502, { success: false, error: '未返回有效图片' });

          // Deduct credits on server
          user.creditsBalance = Math.max(0, user.creditsBalance - cost);
          user.apiCallsCount = (user.apiCallsCount || 0) + 1;
          persist(store, file);

          return sendJson(res, 200, {
            success: true,
            imageUrl,
            modelUsed: model,
            remainingCredits: user.creditsBalance,
            creditsDeducted: cost,
          });
        } catch (err) {
          clearTimeout(timer);
          return sendJson(res, 504, { success: false, error: `代理调用异常: ${err instanceof Error ? err.message : String(err)}` });
        }
      }
      // Public Billing Rules Query
      if (pathname === '/api/billing' && req.method === 'GET') {
        const store = readStore(file);
        const config = store.billing_config || {
          freeMonthlyCredits: 4,
          proMonthlyPriceUsd: 19,
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
          return sendJson(res, 200, { users: store.users, subscriptions: store.subscriptions, invoices: store.invoices });
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
          return sendJson(res, 200, { success: true, user: target });
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
          return sendJson(res, 200, { success: true, user: newUsr, initialPassword: initialPwd });
        }
        // Admin Write: Persist Billing Configuration
        if (pathname === '/api/admin/billing' && req.method === 'POST') {
          const { config } = JSON.parse((await readRawBody(req)).toString());
          if (!config) return sendJson(res, 400, { success: false, error: 'Config required' });
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
          if (typeof newPassword !== 'string' || newPassword.length < 6) {
            return sendJson(res, 400, { success: false, error: '新密码不能少于 6 个字符' });
          }
          store.adminPasswordHash = hashPassword(newPassword);
          if (newUsername && typeof newUsername === 'string') {
            store.admin_username = newUsername.trim();
          }
          persist(store, file);
          return sendJson(res, 200, { success: true });
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
