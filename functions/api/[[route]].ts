import { reviewPanorama, buildQualityRetryPrompt, DEFAULT_PANORAMA_REVIEW_MODEL } from '../../server/panoramaQuality.mjs';
import { WORK_STORAGE_LIMIT, SHARE_STORAGE_LIMIT, ensureByteAccounting } from '../../server/storageBudget.mjs';
import { riskSchema, consumeLimit, sourceKey, acquireGeneration, readJsonLimited, GENERATION_WORKFLOW_TIMEOUT_MS } from '../../server/risk.mjs';
import { registrationAgeError, AGE_SCREEN_DENIED } from '../../src/utils/registrationAge.mjs';
import { emailVerificationSchema, verificationConfig, checkVerificationChallenge, createD1VerificationLedger, handleEmailVerification, sendVerificationEmail } from '../../server/emailVerification.mjs';
import { handleWorksRequest, saveGeneratedWork, workSchema } from '../../server/works.mjs';
import { handleShareRequest, shareSchema } from '../../server/shares.mjs';
// Cloudflare Pages Functions - Edge Commercial Backend with D1 Persistence
import { handlePayPalRequest, createD1PayPalLedger, paypalConfigured, paypalSchema, formatAdminBilling } from '../../server/paypal.mjs';
import { buildImageModelRequest, inspectImageResolution, IMAGE_GENERATION_TIMEOUT_MS } from '../../src/utils/imageModelRequest.mjs';

interface Env {
  DB?: D1Database;
  GENERATION_ENABLED?: string;
  PANORAMA_REVIEW_MODEL?: string;
  PANORAMA_REVIEW_BASE_URL?: string;
  PANORAMA_REVIEW_API_KEY?: string;
  FREE_TRIAL_ENABLED?: string;
  APP_ORIGIN?: string;
  RESEND_API_KEY?: string;
  VERIFICATION_FROM_EMAIL?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  MAX_DAILY_GENERATION_CREDITS?: string;
  MAX_DAILY_FREE_CREDITS?: string;
  MAX_CONCURRENT_GENERATIONS?: string;
  PANORAMA_SHARES?: KVNamespace;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  PAYMENT_MODE?: string;
  PAYPAL_MODE?: string;
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  PAYPAL_WEBHOOK_ID?: string;
  PAYPAL_PRO_MONTHLY_PLAN_ID?: string;
  PAYPAL_PRO_YEARLY_PLAN_ID?: string;
  PAYPAL_ENTERPRISE_MONTHLY_PLAN_ID?: string;
  PAYPAL_ENTERPRISE_YEARLY_PLAN_ID?: string;
  PAYPAL_RETURN_ORIGIN?: string;
}

async function freeCredits(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT value FROM admin_config WHERE key = ?').bind('billing_config').first<{ value: string }>();
  let value: unknown;
  try {
    value = row ? JSON.parse(row.value)?.freeMonthlyCredits : undefined;
  } catch {
    return 8;
  }
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 8;
}

function jsonResponse(data: unknown, status = 200, cacheControl = 'no-store'): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// Password hashing with Web Crypto PBKDF2 (per-user salt, 100k iterations).
// Legacy single-round `sha256:` hashes stay verifiable and are upgraded on successful login.
const PBKDF2_ITERATIONS = 100000;
const CONFIG_CACHE_TTL = 60000;
const edgeConfigCache = new WeakMap<D1Database, {
  billing?: { raw: string; expiresAt: number };
  models?: { raw: string; expiresAt: number };
}>();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2Hex(password: string, salt: string, iterations: number): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

async function hashPasswordWithSalt(password: string, salt = crypto.randomUUID().replace(/-/g, '')): Promise<string> {
  const hex = await pbkdf2Hex(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2:${PBKDF2_ITERATIONS}:${salt}:${hex}`;
}

async function verifyHashedPassword(password: string, storedHash: string): Promise<boolean> {
  if (typeof password !== 'string' || password.length > 1024 || typeof storedHash !== 'string') return false;
  if (storedHash.startsWith('pbkdf2:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 4) return false;
    const iterations = Number(parts[1]);
    if (!Number.isSafeInteger(iterations) || iterations < 10000 || !parts[2] || !/^[0-9a-f]{64}$/i.test(parts[3])) return false;
    const computed = await pbkdf2Hex(password, parts[2], iterations);
    return timingSafeEqualBytes(fromHex(computed), fromHex(parts[3]));
  }
  if (storedHash.startsWith('sha256:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3 || !/^[0-9a-f]{64}$/i.test(parts[2])) return false;
    const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${parts[1]}:${password}`));
    return timingSafeEqualBytes(new Uint8Array(hashBuf), fromHex(parts[2]));
  }
  return false;
}

function isLegacyPasswordHash(storedHash: unknown): boolean {
  return typeof storedHash === 'string' && storedHash.startsWith('sha256:');
}

// Per-isolate sliding-window counters for abuse-prone endpoints (best effort on the edge).
const edgeRateBuckets = new Map<string, number[]>();

// Test hook: the worker module is imported once per process, so tests must be able to
// clear counters between fixtures to avoid cross-test interference.
export function __resetEdgeRateLimits(): void {
  edgeRateBuckets.clear();
}

function rateLimitExceeded(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (edgeRateBuckets.get(key) || []).filter((time) => now - time < windowMs);
  edgeRateBuckets.set(key, hits);
  if (edgeRateBuckets.size > 10000) edgeRateBuckets.clear();
  return hits.length >= limit;
}

function recordRateHit(key: string): void {
  const hits = edgeRateBuckets.get(key) || [];
  hits.push(Date.now());
  edgeRateBuckets.set(key, hits);
}

function clearRateBucket(key: string): void {
  edgeRateBuckets.delete(key);
}

function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

const dbInitializations = new WeakMap<D1Database, Promise<void>>();
const dbMaintenance = new WeakMap<D1Database, { nextAt: number; pending: Promise<void> }>();

function ensureDbInitialized(db: D1Database): Promise<void> {
  let pending = dbInitializations.get(db);
  if (!pending) {
    pending = initializeDb(db).catch(error => {
      dbInitializations.delete(db);
      throw error;
    });
    dbInitializations.set(db, pending);
  }
  return pending;
}

function maintainDb(db: D1Database): Promise<void> {
  const now = Date.now();
  const previous = dbMaintenance.get(db);
  if (previous && previous.nextAt > now) return previous.pending;
  const pending = db.batch([
    db.prepare('DELETE FROM risk_counters WHERE key IN (SELECT key FROM risk_counters WHERE expires_at <= ? LIMIT 100)').bind(now),
    db.prepare('DELETE FROM user_sessions WHERE token IN (SELECT token FROM user_sessions WHERE expires_at <= ? LIMIT 100)').bind(now),
  ]).then(() => {}).catch(error => {
    dbMaintenance.delete(db);
    throw error;
  });
  // ponytail: bounded cleanup runs once a minute per binding/isolate; use scheduled maintenance at higher traffic.
  dbMaintenance.set(db, { nextAt: now + 60000, pending });
  return pending;
}

async function initializeDb(db: D1Database): Promise<void> {
  await db.batch([
    ...paypalSchema.map((sql: string) => db.prepare(sql)),
    ...riskSchema.map((sql: string) => db.prepare(sql)),
    db.prepare(emailVerificationSchema),
    db.prepare(workSchema),
    db.prepare(shareSchema),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        plan TEXT NOT NULL DEFAULT 'free',
        credits_balance INTEGER NOT NULL DEFAULT 0,
        credits_total INTEGER NOT NULL DEFAULT 0,
        api_calls_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        password_hash TEXT,
        created_at TEXT NOT NULL
      );
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS admin_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `),
    db.prepare("UPDATE admin_config SET value = replace(value, '\"proMonthlyCredits\":1000', '\"proMonthlyCredits\":120') WHERE key = 'billing_config'"),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS admin_sessions (
        token TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL
      );
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS orders (
        checkout_session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        plan TEXT NOT NULL,
        billing_cycle TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'usd',
        amount_cents INTEGER NOT NULL,
        credits INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        status TEXT NOT NULL DEFAULT 'paid',
        checkout_session_id TEXT,
        created_at TEXT NOT NULL
      );
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        plan TEXT NOT NULL,
        billing_cycle TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL
      );
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS processed_events (
        event_id TEXT PRIMARY KEY,
        processed_at TEXT NOT NULL
      );
    `),
    db.prepare('CREATE INDEX IF NOT EXISTS user_sessions_expiry ON user_sessions(expires_at)'),
  ]);

  const columns = await db.prepare('PRAGMA table_info(users)').all<{ name: string }>();
  if (!columns.results.some(column => column.name === 'password_hash')) {
    try {
      await db.prepare('ALTER TABLE users ADD COLUMN password_hash TEXT').run();
    } catch (error) {
      // Another isolate may have completed the same migration after our check.
      const current = await db.prepare('PRAGMA table_info(users)').all<{ name: string }>();
      if (!current.results.some(column => column.name === 'password_hash')) throw error;
    }
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    // 1. Health Probe
    if (pathname === '/api/health' && request.method === 'GET') {
      return jsonResponse({
        status: 'online',
        server: 'cloudflare-pages-edge',
        databaseReady: Boolean(env.DB),
        paymentsReady: Boolean(env.DB) && paypalConfigured(env),
        gateways: {
          stripeConfigured: Boolean(env.STRIPE_SECRET_KEY),
          stripeWebhookConfigured: Boolean(env.STRIPE_WEBHOOK_SECRET),
          paypalConfigured: paypalConfigured(env),
          paypalMode: env.PAYPAL_MODE || 'sandbox',
        },
      });
    }

    if (env.DB) {
      await ensureDbInitialized(env.DB);
      await maintainDb(env.DB);
    }

    if (pathname === '/api/works' || pathname.startsWith('/api/works/')) {
      return handleWorksRequest({ request, db: env.DB, storage: env.PANORAMA_SHARES });
    }

    if (pathname === '/api/shares' || pathname.startsWith('/api/shares/')) {
      return handleShareRequest({ request, db: env.DB, storage: env.PANORAMA_SHARES });
    }

    if (pathname.startsWith('/api/paypal/')) {
      if (!env.DB) return jsonResponse({ error: 'Database unavailable' }, 503);
      const db = env.DB;
      return handlePayPalRequest({ request, env, ledger: createD1PayPalLedger(db),
        authenticate: async () => {
          const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
          const session = await db.prepare('SELECT user_id FROM user_sessions WHERE token = ? AND expires_at > ?')
            .bind(token, Date.now()).first<{ user_id: string }>();
          return session ? db.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first() : null;
        },
      });
    }

    // Public Pricing / Billing Rules Query
    if (pathname === '/api/billing' && request.method === 'GET') {
      const cache = env.DB ? edgeConfigCache.get(env.DB) : undefined;
      const now = Date.now();
      let billingRaw = cache?.billing && cache.billing.expiresAt > now ? cache.billing.raw : null;

      if (!billingRaw && env.DB) {
        try {
          const row = await Promise.race([
            env.DB.prepare('SELECT value FROM admin_config WHERE key = ?').bind('billing_config').first<{ value: string }>(),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 2500)),
          ]);
          if (row?.value) {
            billingRaw = row.value;
            const existing = edgeConfigCache.get(env.DB) || {};
            existing.billing = { raw: billingRaw, expiresAt: now + CONFIG_CACHE_TTL };
            edgeConfigCache.set(env.DB, existing);
          }
        } catch {
          // fallback
        }
      }

      if (billingRaw) {
        try {
          const config = JSON.parse(billingRaw);
          if (config.proMonthlyCredits === 1000) config.proMonthlyCredits = 120;
          return jsonResponse(
            { success: true, config },
            200,
            'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
          );
        } catch {
          // fallback
        }
      }
      return jsonResponse({
        success: true,
        config: {
          freeMonthlyCredits: 8,
          proMonthlyPriceUsd: 9.9,
          proMonthlyCredits: 120,
          enterpriseCustomPricing: true,
          creditCostPer1K: 1,
          creditCostPer2K: 2,
          creditCostPer4K: 4,
        },
      }, 200, 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    }

    // Public Models Query (sanitized - NEVER leak admin API keys)
    if (pathname === '/api/models' && request.method === 'GET') {
      const cache = env.DB ? edgeConfigCache.get(env.DB) : undefined;
      const now = Date.now();
      let modelsRaw = cache?.models && cache.models.expiresAt > now ? cache.models.raw : null;

      if (!modelsRaw && env.DB) {
        try {
          const row = await Promise.race([
            env.DB.prepare('SELECT value FROM admin_config WHERE key = ?').bind('models_config').first<{ value: string }>(),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 2500)),
          ]);
          if (row?.value) {
            modelsRaw = row.value;
            const existing = edgeConfigCache.get(env.DB) || {};
            existing.models = { raw: modelsRaw, expiresAt: now + CONFIG_CACHE_TTL };
            edgeConfigCache.set(env.DB, existing);
          }
        } catch {}
      }

      if (modelsRaw) {
        try {
          const parsed = JSON.parse(modelsRaw);
          const rawEndpoints = Array.isArray(parsed) ? parsed : parsed.endpoints || [];
          // Strictly sanitize endpoints: blank all apiKeys from public response
          const sanitized = rawEndpoints.map((ep: any) => ({
            ...ep,
            apiKey: '',
            hasServerKey: Boolean(ep.apiKey && String(ep.apiKey).trim()),
          }));
          const routingConfig = Array.isArray(parsed) ? null : parsed.routingConfig || null;
          return jsonResponse(
            { success: true, endpoints: sanitized, routingConfig },
            200,
            'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
          );
        } catch {}
      }
      return jsonResponse({ success: true, endpoints: null, routingConfig: null }, 200, 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    }

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (pathname === '/api/user/auth-config' && request.method === 'GET') {
      return jsonResponse(verificationConfig(env));
    }
    if (pathname === '/api/user/guest' && request.method === 'POST') {
      return jsonResponse({ success: false, code: 'REGISTRATION_REQUIRED', error: 'Register and verify your email to receive starter credits.' }, 403);
    }
    if (pathname === '/api/user/verify-email' || pathname === '/api/user/send-verification') {
      if (!env.DB) return jsonResponse({ error: 'Database unavailable' }, 503);
      const db = env.DB;
      return handleEmailVerification({ request, env, ledger: createD1VerificationLedger(db), source: await sourceKey(request),
        freeCredits: () => freeCredits(db),
        authenticate: async () => {
          const session = await db.prepare('SELECT user_id FROM user_sessions WHERE token = ? AND expires_at > ?')
            .bind(token, Date.now()).first<{ user_id: string }>();
          return session ? db.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first() : null;
        },
      });
    }

    // 2. User Authentication (Register / Login with Password Protection)
    if (pathname === '/api/user/auth' && request.method === 'POST') {
      const body = (await readJsonLimited(request, 16384)) as {
        email?: string;
        name?: string;
        password?: string;
        mode?: 'login' | 'register';
        turnstileToken?: string;
        birthDate?: string;
      };
      const { email, name, password, mode } = body;
      if (password !== undefined && typeof password !== 'string') return jsonResponse({ success: false, error: 'Password must be a string' }, 400);
      if (mode !== undefined && mode !== 'login' && mode !== 'register') return jsonResponse({ success: false, error: 'Invalid authentication mode' }, 400);
      if (mode === 'register') {
        const error = registrationAgeError(body.birthDate);
        if (error) return jsonResponse({ success: false, error }, error === AGE_SCREEN_DENIED ? 403 : 400);
      }
      if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse({ success: false, error: 'Valid email address is required' }, 400);
      }

      if (!env.DB) {
        return jsonResponse({ success: false, error: 'Database service unavailable' }, 503);
      }

      const authSource = await sourceKey(request);
      if (!await consumeLimit(env.DB, 'auth-global', 2000, 86400000) || !await consumeLimit(env.DB, 'auth-source:'+authSource, 30, 600000)) return jsonResponse({ error: 'Sign-in safety limit reached. Please retry later.' }, 429);
      const authIp = clientIp(request);
      const authFailKey = `authfail:${authIp}`;
      if (rateLimitExceeded(authFailKey, 10, 600000)) {
        return jsonResponse({ success: false, error: 'Too many failed sign-in attempts. Try again later.' }, 429);
      }

      let user = await env.DB.prepare('SELECT * FROM users WHERE email = ?')
        .bind(email.toLowerCase())
        .first<{
          id: string;
          email: string;
          name: string;
          plan: string;
          credits_balance: number;
          credits_total: number;
          api_calls_count: number;
          status: string;
          password_hash?: string;
        }>();

      if (!user && mode === 'login') {
        recordRateHit(authFailKey);
        return jsonResponse({ success: false, error: 'Email or password is incorrect.' }, 401);
      }
      if (user && mode === 'register') return jsonResponse({ success: false, error: 'An account already exists for this email. Sign in instead.' }, 409);
      let verificationSent: boolean | undefined;
      if (user?.id.startsWith('usr_guest')) return jsonResponse({ error: 'Register a new account with your own email address.' }, 403);
      if (user) {
        // Existing user: strictly verify password if set; prevent unauthorized account claim if unset
        if (user.password_hash) {
          if (!password) {
            recordRateHit(authFailKey);
            return jsonResponse({ success: false, error: 'Enter your account password.' }, 401);
          }
          const valid = await verifyHashedPassword(password, user.password_hash);
          if (!valid) {
            recordRateHit(authFailKey);
            return jsonResponse({ success: false, error: 'Email or password is incorrect.' }, 401);
          }
          if (isLegacyPasswordHash(user.password_hash)) {
            // Opportunistic upgrade of pre-PBKDF2 hashes after a verified login.
            const upgraded = await hashPasswordWithSalt(password);
            await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(upgraded, user.id).run();
          }
        } else {
          // Pre-created managed accounts without password cannot be claimed without explicit admin initialization
          recordRateHit(authFailKey);
          return jsonResponse({
            success: false,
            error: 'This managed account has no password yet. Contact your administrator.',
          }, 403);
        }
      } else {
        // Registration starts at zero; only email verification can grant starter credits.
        const ageError = registrationAgeError(body.birthDate);
        if (ageError) return jsonResponse({ success: false, error: ageError }, ageError === AGE_SCREEN_DENIED ? 403 : 400);
        if (rateLimitExceeded(`register:${authIp}`, 5, 3600000)) {
          return jsonResponse({ success: false, error: 'Too many new accounts from this address. Try again later.' }, 429);
        }
        if (typeof password !== 'string' || password.length < 6 || password.length > 1024) {
          return jsonResponse({ success: false, error: 'New accounts require a password between 6 and 1024 characters.' }, 400);
        }
        try { await checkVerificationChallenge(env, body.turnstileToken, 'register'); }
        catch (error: any) { return jsonResponse({ success: false, error: error.message }, error.status || 503); }
        const userId = 'usr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
        const displayName = typeof name === 'string' && name.trim() ? name.trim() : email.split('@')[0];
        const now = new Date().toISOString();
        const pwdHash = await hashPasswordWithSalt(password);
        const source = await sourceKey(request);
        if (!await consumeLimit(env.DB, 'register-create-global', 100, 86400000)
          || !await consumeLimit(env.DB, 'register-create:'+source, 5, 86400000)) {
          return jsonResponse({ success: false, error: 'Account creation safety limit reached. Try again later.' }, 429);
        }
        const credits = 0;

        await env.DB.batch([
          env.DB.prepare(`INSERT INTO users (id, email, name, plan, credits_balance, credits_total, api_calls_count, status, password_hash, created_at)
            VALUES (?, ?, ?, 'free', ?, ?, 0, 'active', ?, ?)`)
            .bind(userId, email.toLowerCase(), displayName, credits, credits, pwdHash, now),
          env.DB.prepare('INSERT INTO email_verifications (user_id,email,source,eligible) VALUES (?,?,?,1)')
            .bind(userId, email.toLowerCase(), source),
        ]);
        recordRateHit(`register:${authIp}`);

        user = {
          id: userId,
          email: email.toLowerCase(),
          name: displayName,
          plan: 'free',
          credits_balance: credits,
          credits_total: credits,
          api_calls_count: 0,
          status: 'active',
        };
        try {
          await sendVerificationEmail({ ledger: createD1VerificationLedger(env.DB), user, source, env });
          verificationSent = true;
        } catch { verificationSent = false; }
      }

      clearRateBucket(authFailKey);
      const sessionToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      const expiresAt = Date.now() + 7 * 86400000;
      await env.DB.prepare('INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
        .bind(sessionToken, user.id, expiresAt)
        .run();

      return jsonResponse({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan,
          creditsBalance: user.credits_balance,
          creditsTotal: user.credits_total,
          apiCallsCount: user.api_calls_count,
          status: user.status,
          emailVerified: Boolean((await createD1VerificationLedger(env.DB).state(user.id))?.verified_at),
        },
        token: sessionToken,
        ...(verificationSent === undefined ? {} : { verificationSent }),
      });
    }

    // 3. User Me Profile
    if (pathname === '/api/user/me' && request.method === 'GET') {
      if (!env.DB) return jsonResponse({ success: false, error: 'Database unavailable' }, 503);
      if (!token) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const session = await env.DB.prepare('SELECT user_id FROM user_sessions WHERE token = ? AND expires_at > ?')
        .bind(token, Date.now())
        .first<{ user_id: string }>();

      if (!session) return jsonResponse({ success: false, error: 'Invalid or expired session' }, 401);

      await createD1PayPalLedger(env.DB).syncAccess(session.user_id);

      const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
        .bind(session.user_id)
        .first<{
          id: string;
          email: string;
          name: string;
          plan: string;
          credits_balance: number;
          credits_total: number;
          api_calls_count: number;
          status: string;
        }>();

      if (!user) return jsonResponse({ success: false, error: 'User not found' }, 404);
      if (user.id.startsWith('usr_guest')) return jsonResponse({ error: 'Register and verify your email to continue.' }, 401);

      return jsonResponse({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan,
          creditsBalance: user.credits_balance,
          creditsTotal: user.credits_total,
          apiCallsCount: user.api_calls_count,
          status: user.status,
          emailVerified: Boolean((await createD1VerificationLedger(env.DB).state(user.id))?.verified_at),
        },
      });
    }

    // 4. Server-Authoritative User Credit Deduction
    if (pathname === '/api/user/deduct-credits' && request.method === 'POST') {
      if (!env.DB) return jsonResponse({ success: false, error: 'Database unavailable' }, 503);
      if (!token) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const session = await env.DB.prepare('SELECT user_id FROM user_sessions WHERE token = ? AND expires_at > ?')
        .bind(token, Date.now())
        .first<{ user_id: string }>();

      if (!session) return jsonResponse({ success: false, error: 'Invalid or expired session' }, 401);

      const body = (await request.json().catch(() => ({}))) as { credits?: number };
      const credits = typeof body.credits === 'number' ? Math.floor(body.credits) : 0;
      if (credits <= 0) {
        return jsonResponse({ success: false, error: 'Invalid credits amount' }, 400);
      }

      const res = await env.DB.prepare(`
        UPDATE users
        SET credits_balance = credits_balance - ?, api_calls_count = api_calls_count + 1
        WHERE id = ? AND status = 'active' AND credits_balance >= ?
      `).bind(credits, session.user_id, credits).run();

      if (!res.meta.changes || res.meta.changes === 0) {
        return jsonResponse({ success: false, error: 'Insufficient credits or account unavailable. Generation cannot continue.' }, 400);
      }

      const updated = await env.DB.prepare('SELECT credits_balance FROM users WHERE id = ?')
        .bind(session.user_id)
        .first<{ credits_balance: number }>();

      return jsonResponse({
        success: true,
        remaining: updated?.credits_balance ?? 0,
      });
    }

    // 5. Admin Login with dual username and password credentials
    if (pathname === '/api/admin/login' && request.method === 'POST') {
      if (env.DB && !await consumeLimit(env.DB, 'admin-auth:'+await sourceKey(request), 10, 60000)) return jsonResponse({ error: 'Too many login attempts' }, 429);
      const adminIp = clientIp(request);
      const adminFailKey = `adminlogin:${adminIp}`;
      if (rateLimitExceeded(adminFailKey, 5, 60000)) {
        return jsonResponse({ error: 'Too many login attempts' }, 429);
      }

      const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
      let expectedUser = (env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
      let expectedPass = (env.ADMIN_PASSWORD || '').trim();
      let storedPlainPass = false;

      // Check if custom credentials are saved in D1 admin_config
      if (env.DB) {
        const storedUser = await env.DB.prepare('SELECT value FROM admin_config WHERE key = ?')
          .bind('admin_username')
          .first<{ value: string }>();
        const storedPass = await env.DB.prepare('SELECT value FROM admin_config WHERE key = ?')
          .bind('admin_password')
          .first<{ value: string }>();

        if (storedUser?.value) expectedUser = storedUser.value.trim().toLowerCase();
        if (storedPass?.value) {
          expectedPass = storedPass.value.trim();
          // Values written before the hashing upgrade are still plaintext in the database.
          storedPlainPass = !expectedPass.startsWith('pbkdf2:') && !expectedPass.startsWith('sha256:');
        }
      }

      if (!expectedPass) return jsonResponse({ error: 'Administrator credentials are not configured' }, 503);

      const inputUser = (body.username || '').trim().toLowerCase();
      const inputPass = (body.password || '').trim();

      let passOk = false;
      if (expectedPass.startsWith('pbkdf2:') || expectedPass.startsWith('sha256:')) {
        passOk = await verifyHashedPassword(inputPass, expectedPass);
      } else {
        passOk = inputPass === expectedPass;
        // Upgrade a plaintext database value to a PBKDF2 hash after a verified login.
        if (passOk && storedPlainPass && env.DB) {
          const upgraded = await hashPasswordWithSalt(inputPass);
          await env.DB.prepare(`INSERT INTO admin_config (key, value) VALUES ('admin_password', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(upgraded).run();
        }
      }

      if (inputUser !== expectedUser || !passOk) {
        recordRateHit(adminFailKey);
        return jsonResponse({ error: '管理员账号或密码错误，请核对凭证。' }, 401);
      }
      clearRateBucket(adminFailKey);

      const adminToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      const expiresAt = Date.now() + 3600000;
      if (env.DB) {
        await env.DB.prepare('INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)')
          .bind(adminToken, expiresAt)
          .run();
      }

      return jsonResponse({ success: true, token: adminToken });
    }

    // 6. Admin Protected Endpoints
    if (pathname.startsWith('/api/admin/')) {
      if (!env.DB) return jsonResponse({ error: 'Database unavailable' }, 503);

      const session = await env.DB.prepare('SELECT token FROM admin_sessions WHERE token = ? AND expires_at > ?')
        .bind(token, Date.now())
        .first();

      if (!session) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }

      if (pathname === '/api/admin/risk' && request.method === 'GET') {
        await env.DB.prepare(workSchema).run(); await ensureByteAccounting(env.DB, 'panorama_works', 67108864);
        await env.DB.prepare(shareSchema).run(); await ensureByteAccounting(env.DB, 'panorama_shares', 20971520);
        const works = await env.DB.prepare('SELECT COALESCE(SUM(stored_bytes),0) AS bytes FROM panorama_works').first();
        const shares = await env.DB.prepare('SELECT COALESCE(SUM(stored_bytes),0) AS bytes FROM panorama_shares').first();
        const counters = await env.DB.prepare("SELECT key,used,expires_at FROM risk_counters WHERE key IN ('trial-global','generation-all','generation-free','generation-attempts','generation-free-attempts','share-read-global','original-read-global') AND expires_at > ?").bind(Date.now()).all();
        const leases = await env.DB.prepare('SELECT COUNT(*) AS count FROM generation_leases WHERE expires_at > ?').bind(Date.now()).first();
        return jsonResponse({ works: { ...works, limit: WORK_STORAGE_LIMIT }, shares: { ...shares, limit: SHARE_STORAGE_LIMIT }, counters: counters.results, leases,
          limits: { totalDailyCredits: env.MAX_DAILY_GENERATION_CREDITS ?? '1000', freeDailyCredits: env.MAX_DAILY_FREE_CREDITS ?? '100', concurrent: env.MAX_CONCURRENT_GENERATIONS ?? '4', enabled: env.GENERATION_ENABLED !== 'false', trialEnabled: env.FREE_TRIAL_ENABLED !== 'false' } });
      }

      if (pathname === '/api/admin/logout' && request.method === 'POST') {
        await env.DB.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(token).run();
        return jsonResponse({ success: true });
      }

      // Fetch Store (Users, Subscriptions, Invoices)
      if (pathname === '/api/admin/store' && request.method === 'GET') {
        const usersResult = await env.DB.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 100').all();
        const subsResult = await env.DB.prepare('SELECT * FROM subscriptions ORDER BY created_at DESC LIMIT 100').all();
        const paypalResult = await env.DB.prepare('SELECT p.*, u.email AS user_email, u.name AS user_name FROM paypal_subscriptions p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC').all();
        const invsResult = await env.DB.prepare('SELECT i.*, u.email AS user_email FROM invoices i LEFT JOIN users u ON u.id = i.user_id ORDER BY i.created_at DESC LIMIT 100').all();

        const formattedUsers = (usersResult.results || []).map((u: any) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          plan: u.plan,
          creditsBalance: u.credits_balance,
          creditsTotal: u.credits_total,
          apiCallsCount: u.api_calls_count,
          status: u.status,
          createdAt: u.created_at,
        }));

        return jsonResponse({
          users: formattedUsers,
          ...formatAdminBilling({ users: usersResult.results || [], subscriptions: subsResult.results || [],
            paypalSubscriptions: paypalResult.results || [], invoices: invsResult.results || [] }),
        });
      }

      // D1 Write: Adjust User Credits
      if (pathname === '/api/admin/users/credits' && request.method === 'POST') {
        const { userId, delta } = (await request.json().catch(() => ({}))) as { userId?: string; delta?: number };
        if (!userId || typeof delta !== 'number' || isNaN(delta)) {
          return jsonResponse({ success: false, error: 'Invalid user or delta amount' }, 400);
        }
        await env.DB.prepare(`
          UPDATE users SET credits_balance = MAX(0, credits_balance + ?),
            credits_total = CASE WHEN ? > 0 THEN credits_total + ? ELSE credits_total END
          WHERE id = ?
        `).bind(delta, delta, delta, userId).run();

        const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<any>();
        if (!updated) return jsonResponse({ success: false, error: 'User not found' }, 404);
        return jsonResponse({
          success: true,
          user: {
            id: updated.id,
            email: updated.email,
            name: updated.name,
            plan: updated.plan,
            creditsBalance: updated.credits_balance,
            creditsTotal: updated.credits_total,
            apiCallsCount: updated.api_calls_count,
            status: updated.status,
            createdAt: updated.created_at,
          },
        });
      }

      // D1 Write: Update User Account Status (active / suspended)
      if (pathname === '/api/admin/users/status' && request.method === 'POST') {
        const { userId, status } = (await request.json().catch(() => ({}))) as { userId?: string; status?: string };
        if (!userId || !['active', 'suspended'].includes(status || '')) {
          return jsonResponse({ success: false, error: 'Invalid userId or status' }, 400);
        }
        await env.DB.prepare('UPDATE users SET status = ? WHERE id = ?').bind(status, userId).run();
        return jsonResponse({ success: true, userId, status });
      }

      // D1 Write: Create Managed User
      if (pathname === '/api/admin/users/create' && request.method === 'POST') {
        const body = (await request.json().catch(() => ({}))) as any;
        const { name, email, plan, credits, creditsBalance, password } = body;
        if (!email || !name) {
          return jsonResponse({ success: false, error: 'Name and email are required' }, 400);
        }
        const userId = 'usr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
        const initCredits = typeof credits === 'number' ? credits : typeof creditsBalance === 'number' ? creditsBalance : 120;
        const now = new Date().toISOString();
        // Generate unique high-entropy initial password if not explicitly supplied
        const initialPwd = typeof password === 'string' && password.length >= 6
          ? password
          : 'Pano_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
        const pwdHash = await hashPasswordWithSalt(initialPwd);

        await env.DB.prepare(`
          INSERT INTO users (id, email, name, plan, credits_balance, credits_total, api_calls_count, status, password_hash, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 0, 'active', ?, ?)
        `).bind(userId, email.toLowerCase(), name.trim(), plan || 'pro', initCredits, initCredits, pwdHash, now).run();

        return jsonResponse({
          success: true,
          user: {
            id: userId,
            email: email.toLowerCase(),
            name: name.trim(),
            plan: plan || 'pro',
            creditsBalance: initCredits,
            creditsTotal: initCredits,
            status: 'active',
            createdAt: now,
          },
          initialPassword: initialPwd,
        });
      }

      // D1 Write: Persist Billing Configuration
      if (pathname === '/api/admin/billing' && request.method === 'POST') {
        if (env.DB) edgeConfigCache.delete(env.DB);
        const body = (await request.json().catch(() => ({}))) as { config?: any };
        if (!body.config) {
          return jsonResponse({ success: false, error: 'Billing config required' }, 400);
        }
        if ('freeMonthlyCredits' in Object(body.config) && (!Number.isSafeInteger(body.config.freeMonthlyCredits) || body.config.freeMonthlyCredits < 0)) {
          return jsonResponse({ success: false, error: 'Free credits must be a non-negative safe integer' }, 400);
        }
        await env.DB.prepare(`
          INSERT INTO admin_config (key, value) VALUES ('billing_config', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).bind(JSON.stringify(body.config)).run();
        return jsonResponse({ success: true, config: body.config });
      }

      // D1 Write: Persist Model Endpoints & Routing Strategy (with secure apiKey preservation)
      if (pathname === '/api/admin/models' && request.method === 'POST') {
        if (env.DB) edgeConfigCache.delete(env.DB);
        const body = (await request.json().catch(() => ({}))) as any;
        const toSave = Array.isArray(body.endpoints)
          ? { endpoints: body.endpoints, routingConfig: body.routingConfig || null }
          : body;
        if (!Array.isArray(toSave.endpoints)) {
          return jsonResponse({ success: false, error: 'Endpoints array required' }, 400);
        }

        // 读取已有配置，安全合并历史密钥，防止前端脱敏的空字符串冲掉云端已存密钥
        let existingEndpoints: any[] = [];
        const existingRow = await env.DB.prepare('SELECT value FROM admin_config WHERE key = ?')
          .bind('models_config')
          .first<{ value: string }>();
        if (existingRow?.value) {
          try {
            const parsed = JSON.parse(existingRow.value);
            existingEndpoints = Array.isArray(parsed) ? parsed : parsed.endpoints || [];
          } catch {}
        }

        const mergedEndpoints = toSave.endpoints.map((newEp: any) => {
          const oldEp = existingEndpoints.find((o: any) => o.id === newEp.id);
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

        await env.DB.prepare(`
          INSERT INTO admin_config (key, value) VALUES ('models_config', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).bind(JSON.stringify(toSave)).run();
        return jsonResponse({ success: true, count: toSave.endpoints.length });
      }

      // D1 Write: Persist Admin Credentials (Username and Password)
      if (pathname === '/api/admin/credentials' && request.method === 'POST') {
        const { currentPassword, newUsername, newPassword } = (await request.json().catch(() => ({}))) as any;
        let expectedPass = (env.ADMIN_PASSWORD || '').trim();
        const storedPass = await env.DB.prepare('SELECT value FROM admin_config WHERE key = ?')
          .bind('admin_password')
          .first<{ value: string }>();
        if (storedPass?.value) expectedPass = storedPass.value.trim();

        if (!expectedPass) return jsonResponse({ success: false, error: 'Administrator credentials are not configured' }, 503);
        const currentOk = typeof currentPassword === 'string' && (
          expectedPass.startsWith('pbkdf2:') || expectedPass.startsWith('sha256:')
            ? await verifyHashedPassword(currentPassword.trim(), expectedPass)
            : currentPassword.trim() === expectedPass
        );
        if (!currentOk) {
          return jsonResponse({ success: false, error: '当前旧密码输入错误' }, 401);
        }
        if (typeof newPassword !== 'string' || newPassword.trim().length < 6 || newPassword.trim().length > 1024) {
          return jsonResponse({ success: false, error: '新密码不能少于 6 个字符' }, 400);
        }

        const writes = [
          env.DB.prepare(`
            INSERT INTO admin_config (key, value) VALUES ('admin_password', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
          `).bind(await hashPasswordWithSalt(newPassword.trim())),
        ];
        if (newUsername && typeof newUsername === 'string') {
          writes.push(
            env.DB.prepare(`
              INSERT INTO admin_config (key, value) VALUES ('admin_username', ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `).bind(newUsername.trim())
          );
        }
        writes.push(env.DB.prepare('DELETE FROM admin_sessions'));
        await env.DB.batch(writes);
        return jsonResponse({ success: true });
      }
    }

    // 7. Stripe Checkout Session Creation
    // Closed on the edge deployment: Stripe order fulfillment needs the signed webhook,
    // which is implemented on the Node server only. Do not re-enable this until a verified
    // /api/stripe/webhook exists here, or paid checkouts could never be fulfilled.
    if (pathname === '/api/stripe/create-checkout-session' && request.method === 'POST') {
      return jsonResponse({
        success: false,
        error: 'Stripe checkout is not available on this deployment. Use PayPal.',
      }, 503);
    }

    // 8. Server-authoritative Generation Proxy (Protects admin API keys, bypasses CORS, serves all visitors)
    if (pathname === '/api/generate' && request.method === 'POST') {
      if (Number(request.headers.get('Content-Length')) > 24 * 1024 * 1024) return jsonResponse({ error: 'Generation input is too large.' }, 413);
      const body = (await readJsonLimited(request, 24 * 1024 * 1024)) as {
        prompt?: string;
        endpointId?: string;
        modelId?: string;
        referenceImages?: string[];
        resolution?: string;
      };
      const { prompt, endpointId, modelId, referenceImages } = body;
      if (!prompt || typeof prompt !== 'string' || prompt.length > 10000) {
        return jsonResponse({ success: false, error: 'Prompt is required' }, 400);
      }

      if (!token) {
        return jsonResponse({
          success: false,
          error: 'Sign in to a registered account before generating a panorama.',
        }, 401);
      }

      if (!env.DB) {
        return jsonResponse({ success: false, error: 'Database service unavailable' }, 503);
      }

      const session = await env.DB.prepare('SELECT user_id FROM user_sessions WHERE token = ? AND expires_at > ?')
        .bind(token, Date.now())
        .first<{ user_id: string }>();

      if (!session) {
        return jsonResponse({ success: false, error: 'Your session has expired. Please sign in again.' }, 401);
      }

      const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
        .bind(session.user_id)
        .first<{
          id: string;
          status: string;
          credits_balance: number;
          plan: string;
        }>();

      if (!user) {
        return jsonResponse({ success: false, error: 'Account not found.' }, 404);
      }

      if (user.status !== 'active') {
        return jsonResponse({ success: false, error: 'This account is suspended and cannot generate images.' }, 403);
      }

      if (user.id.startsWith('usr_guest')) return jsonResponse({ success: false, code: 'REGISTRATION_REQUIRED', error: 'Register and verify your email before generating images.' }, 403);
      if (!['pro', 'enterprise'].includes(user.plan) && !(await createD1VerificationLedger(env.DB).state(user.id))?.verified_at) {
        return jsonResponse({ success: false, code: 'EMAIL_VERIFICATION_REQUIRED', error: 'Verify your email before generating images.' }, 403);
      }

      const resolution = body.resolution ?? '4K';
      const defaultCosts: Record<string, number> = { '1K': 1, '2K': 2, '4K': 4 };
      if (typeof resolution !== 'string' || !Object.hasOwn(defaultCosts, resolution)) {
        return jsonResponse({ success: false, error: 'Invalid resolution' }, 400);
      }
      const billingRow = await env.DB.prepare('SELECT value FROM admin_config WHERE key = ?')
        .bind('billing_config')
        .first<{ value: string }>();
      const billingConfig = billingRow?.value ? JSON.parse(billingRow.value) : {};
      const cost = billingConfig?.[`creditCostPer${resolution}`] ?? defaultCosts[resolution];
      if (!Number.isSafeInteger(cost) || cost <= 0) {
        return jsonResponse({ success: false, error: 'Generation credit rates are unavailable. Contact support.' }, 503);
      }
      if (user.credits_balance < cost) {
        return jsonResponse({
          success: false,
          error: `Insufficient credits. This generation costs ${cost} credits; ${user.credits_balance} are available. View plans to add credits.`,
        }, 400);
      }

      let endpoints: any[] = [];
      const row = await env.DB.prepare('SELECT value FROM admin_config WHERE key = ?')
        .bind('models_config')
        .first<{ value: string }>();
      if (row?.value) {
        try {
          const parsed = JSON.parse(row.value);
          endpoints = Array.isArray(parsed) ? parsed : parsed.endpoints || [];
        } catch {}
      }

      let targetEp: any = null;
      if (endpointId) {
        targetEp = endpoints.find((ep) => ep.id === endpointId);
        if (!targetEp) {
          return jsonResponse({ success: false, error: `Model endpoint [${endpointId}] was not found.` }, 400);
        }
        if (!targetEp.isEnabled) {
          return jsonResponse({ success: false, error: `Model endpoint [${targetEp.name || endpointId}] is disabled.` }, 400);
        }
      } else if (modelId) {
        targetEp = endpoints.find((ep) => (ep.id === modelId || ep.model === modelId) && ep.isEnabled);
      }

      if (!targetEp) {
        targetEp = endpoints.find((ep) => ep.isEnabled && ep.isDefault) || endpoints.find((ep) => ep.isEnabled);
      }

      if (!targetEp) {
        return jsonResponse({
          success: false,
          error: 'No image model is configured on this server. Please contact support.',
        }, 503);
      }

      const model = targetEp.model || 'gemini-3.1-flash-image';
      let upstreamRequest;
      try {
        upstreamRequest = buildImageModelRequest({ ...targetEp, model }, { prompt, referenceImages, resolution });
      } catch (error) {
        return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Invalid model configuration' }, 400);
      }

      const safety = await acquireGeneration(env.DB, user, await sourceKey(request), cost, env);
      if (!safety.id) return jsonResponse({ success: false, error: safety.error }, 429);
      const reservation = await env.DB.prepare(`
        UPDATE users SET credits_balance = credits_balance - ?
        WHERE id = ? AND status = 'active' AND credits_balance >= ?
      `).bind(cost, user.id, cost).run();
      if (!reservation.meta.changes) {
        await safety.release();
        return jsonResponse({ success: false, error: 'Insufficient credits or account unavailable. Generation cannot continue.' }, 400);
      }
      let completed = false;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), GENERATION_WORKFLOW_TIMEOUT_MS);

      try {
        const generationTiming = { upstreamWaitMs: 0, upstreamBodyMs: 0 };
        for (let attempts = 1; attempts <= 2; attempts++) {
          ctrl.signal.throwIfAborted();
          const { url: targetUrl, headers, payload, mode } = upstreamRequest;
          const isGoogleOfficial = mode.startsWith('google-');
          const isImagen = mode === 'google-imagen';
          const isChatMode = mode === 'chat';
          const upstreamStarted = Date.now();
          const generationSignal = AbortSignal.any([ctrl.signal, AbortSignal.timeout(IMAGE_GENERATION_TIMEOUT_MS)]);
          const upstreamRes = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: payload instanceof FormData ? payload : JSON.stringify(payload),
            signal: generationSignal,
          });

          if (!upstreamRes.ok) {
            const errText = await upstreamRes.text();
            return jsonResponse({
              success: false,
              error: `Model endpoint returned HTTP ${upstreamRes.status}: ${errText.slice(0, 240)}`,
            }, 502);
          }

          const upstreamWaitMs = Date.now() - upstreamStarted;
          const data = (await upstreamRes.json()) as any;
          generationSignal.throwIfAborted();
          generationTiming.upstreamWaitMs += upstreamWaitMs;
          generationTiming.upstreamBodyMs += Date.now() - upstreamStarted - upstreamWaitMs;
          let imageUrl: string | null = null;

          if (isGoogleOfficial && isImagen) {
            if (data.predictions && data.predictions[0]?.bytesBase64Encoded) {
              imageUrl = `data:image/png;base64,${data.predictions[0].bytesBase64Encoded}`;
            }
          } else if (isGoogleOfficial) {
            const parts = data.candidates?.[0]?.content?.parts || [];
            const part = parts.find((item: any) => item?.inlineData?.data);
            if (part?.inlineData?.data) {
              imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
            } else {
              const text = parts.filter((item: any) => typeof item?.text === 'string')
                .map((item: any) => item.text).join('\n');
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
            return jsonResponse({ success: false, error: 'The model responded without a valid image.' }, 502);
          }

          const quality = { ...await reviewPanorama({
            endpoint: {
              ...targetEp,
              baseUrl: env.PANORAMA_REVIEW_BASE_URL || targetEp.baseUrl,
              apiKey: env.PANORAMA_REVIEW_API_KEY || targetEp.apiKey,
            },
            model: env.PANORAMA_REVIEW_MODEL || DEFAULT_PANORAMA_REVIEW_MODEL,
            prompt,
            referenceImages: referenceImages ?? [],
            imageUrl,
            fetch: fetch,
            signal: ctrl.signal,
          }), attempts };
          if (quality.status === 'failed' && attempts === 1) {
            upstreamRequest = buildImageModelRequest({ ...targetEp, model }, {
              prompt: buildQualityRetryPrompt(prompt, quality.issues), referenceImages, resolution,
            });
            continue;
          }

          const imageResolution = inspectImageResolution(imageUrl, resolution);
            console.info('[generation-quality]', JSON.stringify({ endpointId: targetEp.id, model, resolution, imageResolution }));
          const creditsRefunded = quality.status !== 'passed' || imageResolution.status === 'below-request' ? cost : 0;
          if (creditsRefunded) {
            await env.DB.prepare('UPDATE users SET credits_balance = credits_balance + ? WHERE id = ?')
              .bind(creditsRefunded, user.id).run();
            completed = true;
          }

          await env.DB.prepare(`
            UPDATE users SET api_calls_count = api_calls_count + ? WHERE id = ?
          `).bind(attempts, user.id).run();

          const updated = await env.DB.prepare('SELECT credits_balance FROM users WHERE id = ?')
            .bind(user.id)
            .first<{ credits_balance: number }>();

          completed = true;
          if (quality.status !== 'passed') {
            const unavailable = quality.status === 'unavailable';
            return jsonResponse({
              success: false,
              code: unavailable ? 'GENERATION_REVIEW_UNAVAILABLE' : 'GENERATION_QUALITY_REJECTED',
              error: unavailable ? 'Panorama quality review is unavailable. Your credits were returned. Please try again later.'
                : 'The generated panorama did not pass quality review after two attempts. Your credits were returned. Please revise your prompt or reference images.',
              quality, creditsDeducted: 0, creditsRefunded: cost,
              remainingCredits: updated?.credits_balance ?? user.credits_balance,
            }, unavailable ? 503 : 422);
          }

          const library = await saveGeneratedWork({ db: env.DB, storage: env.PANORAMA_SHARES, user, imageUrl, prompt, model, resolution }).catch(() => ({ saved: false, error: 'Cloud history could not save this image. Download it before leaving the page.' }));
          return jsonResponse({
            success: true,
            library,
            imageUrl,
            modelUsed: model,
            generationTiming,
            remainingCredits: updated?.credits_balance ?? Math.max(0, user.credits_balance - cost),
            creditsDeducted: cost - creditsRefunded,
            creditsRefunded,
            imageResolution,
            quality,
          });
        }
      } catch (err: unknown) {
        console.error('[Cloudflare Edge Commercial API] Image model request failed:', err);
        return jsonResponse({
          success: false,
          error: 'Image model request failed. Please try again.',
        }, 504);
      } finally {
        clearTimeout(timer);
        await safety.release().catch(() => console.error('[generation-safety] lease cleanup deferred to expiry'));
        if (!completed) {
          await env.DB.prepare('UPDATE users SET credits_balance = credits_balance + ? WHERE id = ?')
            .bind(cost, user.id).run();
        }
      }
    }
    return jsonResponse({ error: 'Route not found' }, 404);
  } catch (err: unknown) {
    if (err instanceof RangeError) return jsonResponse({ error: 'Request body is too large.' }, 413);
    if (err instanceof SyntaxError) return jsonResponse({ error: 'Invalid JSON request.' }, 400);
    console.error('[Cloudflare Edge Commercial API]', err);
    return jsonResponse({
      error: 'Internal edge server error',
    }, 500);
  }
};
