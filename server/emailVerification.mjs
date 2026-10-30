import { consumeLimit, consumeJsonLimit, claimJsonTrial, readJsonLimited } from './risk.mjs';

const MINUTE = 60000;
const DAY = 86400000;
export const emailVerificationSchema = `CREATE TABLE IF NOT EXISTS email_verifications (
 user_id TEXT PRIMARY KEY, email TEXT NOT NULL, source TEXT NOT NULL DEFAULT '',
 eligible INTEGER NOT NULL DEFAULT 0, verified_at INTEGER NOT NULL DEFAULT 0,
 credits_granted INTEGER NOT NULL DEFAULT 0, grant_id TEXT,
 token_hash TEXT UNIQUE, expires_at INTEGER NOT NULL DEFAULT 0, last_sent_at INTEGER NOT NULL DEFAULT 0
)`;

export function verificationConfig(env) {
  return {
    registrationAvailable: Boolean(env.RESEND_API_KEY && env.VERIFICATION_FROM_EMAIL && env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY),
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || '',
  };
}

function failure(message, status = 400) { return Object.assign(new Error(message), { status }); }
export function requireVerificationServices(env) {
  if (!verificationConfig(env).registrationAvailable) throw failure('Account verification is temporarily unavailable. Please try again later.', 503);
}

function appOrigin(env) {
  const url = new URL(env.APP_ORIGIN || 'https://360panoramaviewer.com');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw failure('Account verification is temporarily unavailable. Please try again later.', 503);
  }
  return url.origin;
}

export async function checkVerificationChallenge(env, token, action, fetcher = fetch) {
  requireVerificationServices(env);
  if (typeof token !== 'string' || !token || token.length > 2048) throw failure('Complete the security check and try again.');
  let result;
  try {
    const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
    });
    if (response.ok) result = await response.json();
  } catch { throw failure('The security check is unavailable. Please try again.', 503); }
  if (!result?.success || result.action !== action || result.hostname !== new URL(appOrigin(env)).hostname) {
    throw failure('Complete the security check and try again.');
  }
}

export async function verificationTokenHash(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

export async function sendVerificationEmail({ ledger, user, source, env, fetcher = fetch }) {
  requireVerificationServices(env);
  if (user.id.startsWith('usr_guest') || user.status !== 'active') throw failure('Sign in to an active registered account first.', 403);
  if ((await ledger.state(user.id))?.verified_at) return { alreadyVerified: true };
  for (const [key, limit, duration] of [
    ['verification-mail-user:' + user.id, 5, DAY], ['verification-mail-source:' + source, 10, 3600000],
    ['verification-mail-global', 300, DAY],
  ]) {
    if (!await ledger.limit(key, limit, duration)) throw failure('Too many verification emails. Please try again later.', 429);
  }
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('');
  const hash = await verificationTokenHash(token);
  const now = Date.now();
  if (!await ledger.reserve(user, hash, now + 30 * MINUTE, now)) throw failure('Wait at least 60 seconds before requesting another verification email.', 429);
  // Keep the token in the fragment so it is not sent in HTTP URLs or Referer headers.
  const link = appOrigin(env) + '/#verify-email=' + token;
  try {
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'email-verification/' + hash },
      body: JSON.stringify({ from: env.VERIFICATION_FROM_EMAIL, to: [user.email], subject: 'Verify your email — 360 Panorama Viewer',
        text: `Verify your email address to use your account:\n\n${link}\n\nThis link expires in 30 minutes and can be used once. If you did not request this email, you can ignore it.` }),
    });
    if (!response.ok) throw new Error('Mail rejected');
    const result = await response.json();
    if (typeof result.id !== 'string' || !result.id) throw new Error('Mail not accepted');
  } catch { throw failure('The verification email could not be sent. Please wait a minute and try again.', 503); }
  return { verificationSent: true };
}

export function createD1VerificationLedger(db) {
  const state = id => db.prepare('SELECT * FROM email_verifications WHERE user_id = ?').bind(id).first();
  return {
    state,
    limit: (key, limit, duration) => consumeLimit(db, key, limit, duration),
    async reserve(user, hash, expires, now) {
      await db.prepare('INSERT OR IGNORE INTO email_verifications (user_id,email) VALUES (?,?)').bind(user.id, user.email).run();
      const result = await db.prepare(`UPDATE email_verifications SET token_hash = ?, expires_at = ?, last_sent_at = ?
        WHERE user_id = ? AND verified_at = 0 AND last_sent_at <= ?`).bind(hash, expires, now, user.id, now - MINUTE).run();
      return result.meta.changes > 0;
    },
    async verify(hash, credits, enabled) {
      const row = await db.prepare(`SELECT v.* FROM email_verifications v JOIN users u ON u.id = v.user_id
        WHERE v.token_hash = ? AND u.status = 'active' AND u.email = v.email`).bind(hash).first();
      const now = Date.now();
      if (!row || (!row.verified_at && row.expires_at <= now)) throw failure('This verification link is invalid or expired. Request a new email.');
      if (row.verified_at) return { userId: row.user_id, alreadyVerified: true, creditsGranted: 0 };
      const grantId = crypto.randomUUID();
      const dayEnd = now - now % DAY + DAY;
      // D1 batches are transactions: claim once, update balance and charge safety budgets together.
      await db.batch([
        db.prepare(`UPDATE email_verifications SET verified_at = ?, grant_id = ?, credits_granted = CASE
          WHEN eligible = 1 AND ? = 1 AND ? > 0
          AND COALESCE((SELECT expires_at FROM risk_counters WHERE key = 'trial-source:' || source),0) <= ?
          AND COALESCE((SELECT CASE WHEN expires_at <= ? THEN 0 ELSE used END FROM risk_counters WHERE key = 'trial-global'),0) + ? <= 100
          THEN ? ELSE 0 END
          WHERE user_id = ? AND token_hash = ? AND verified_at = 0 AND expires_at > ?
          AND EXISTS (SELECT 1 FROM users WHERE id = user_id AND email = email_verifications.email AND status = 'active')`)
          .bind(now, grantId, enabled ? 1 : 0, credits, now, now, credits, credits, row.user_id, hash, now),
        db.prepare(`UPDATE users SET credits_balance = credits_balance + (SELECT credits_granted FROM email_verifications WHERE grant_id = ?),
          credits_total = credits_total + (SELECT credits_granted FROM email_verifications WHERE grant_id = ?)
          WHERE id = (SELECT user_id FROM email_verifications WHERE grant_id = ?)`)
          .bind(grantId, grantId, grantId),
        db.prepare(`INSERT INTO risk_counters (key,used,expires_at)
          SELECT 'trial-source:' || source,1,? FROM email_verifications WHERE grant_id = ? AND credits_granted > 0
          ON CONFLICT(key) DO UPDATE SET used = 1, expires_at = excluded.expires_at`).bind(now + 7 * DAY, grantId),
        db.prepare(`INSERT INTO risk_counters (key,used,expires_at)
          SELECT 'trial-global',credits_granted,? FROM email_verifications WHERE grant_id = ? AND credits_granted > 0
          ON CONFLICT(key) DO UPDATE SET used = CASE WHEN expires_at <= ? THEN excluded.used ELSE used + excluded.used END,
          expires_at = excluded.expires_at`).bind(dayEnd, grantId, now),
      ]);
      const updated = await state(row.user_id);
      return { userId: row.user_id, alreadyVerified: updated.grant_id !== grantId, creditsGranted: updated.grant_id === grantId ? updated.credits_granted : 0 };
    },
  };
}

export function createJsonVerificationLedger(read, persist) {
  return {
    async state(id) { return read().emailVerifications?.[id] || null; },
    async limit(key, limit, duration) {
      const store = read();
      const allowed = consumeJsonLimit(store, key, limit, duration);
      persist(store);
      return allowed;
    },
    async reserve(user, hash, expires, now) {
      const store = read();
      store.emailVerifications ||= {};
      const row = store.emailVerifications[user.id] ||= { user_id: user.id, email: user.email, source: '', eligible: 0 };
      if (row.verified_at || (row.last_sent_at || 0) > now - MINUTE) return false;
      Object.assign(row, { token_hash: hash, expires_at: expires, last_sent_at: now });
      persist(store);
      return true;
    },
    async verify(hash, credits, enabled) {
      const store = read();
      const row = Object.values(store.emailVerifications || {}).find(value => value.token_hash === hash);
      const user = store.users?.find(value => value.id === row?.user_id && value.email === row?.email && value.status === 'active');
      if (!row || !user || (!row.verified_at && row.expires_at <= Date.now())) throw failure('This verification link is invalid or expired. Request a new email.');
      if (row.verified_at) return { userId: row.user_id, alreadyVerified: true, creditsGranted: 0 };
      // ponytail: The existing JSON backend is single-process; move to a transactional DB before scaling it.
      const grant = row.eligible ? claimJsonTrial(store, row.source, credits, enabled) : 0;
      Object.assign(row, { verified_at: Date.now(), credits_granted: grant });
      user.creditsBalance += grant;
      user.creditsTotal += grant;
      persist(store);
      return { userId: row.user_id, creditsGranted: grant, alreadyVerified: false };
    },
  };
}

export async function handleEmailVerification({ request, env, ledger, authenticate, source, freeCredits, fetcher = fetch }) {
  const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const pathname = new URL(request.url).pathname;
    if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
    const body = await readJsonLimited(request, 4096);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw failure('Invalid verification request.');
    if (pathname === '/api/user/verify-email') {
      if (!await ledger.limit('verification-attempt-source:' + source, 30, 10 * MINUTE)
        || !await ledger.limit('verification-attempt-global', 3000, DAY)) throw failure('Too many verification attempts. Please try again later.', 429);
      if (typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) throw failure('This verification link is invalid or expired. Request a new email.');
      const result = await ledger.verify(await verificationTokenHash(body.token), await freeCredits(), env.FREE_TRIAL_ENABLED !== 'false');
      return reply({ success: true, ...result });
    }
    const user = await authenticate();
    if (!user || user.id.startsWith('usr_guest')) throw failure('Sign in to a registered account first.', 401);
    await checkVerificationChallenge(env, body.turnstileToken, 'verify-email', fetcher);
    const result = await sendVerificationEmail({ ledger, user, source, env, fetcher });
    return reply({ success: true, ...result });
  } catch (error) {
    if (error instanceof RangeError) return reply({ error: 'Request body is too large.' }, 413);
    if (error instanceof SyntaxError) return reply({ error: 'Invalid JSON request.' }, 400);
    return reply({ success: false, error: error.status ? error.message : 'Verification is temporarily unavailable. Please try again later.' }, error.status || 503);
  }
}
