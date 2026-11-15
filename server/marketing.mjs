
const DAY = 86400000;
export const marketingSchema = `CREATE TABLE IF NOT EXISTS marketing_consent (
  user_id TEXT PRIMARY KEY, email TEXT NOT NULL, opted_in INTEGER NOT NULL DEFAULT 0,
  consented_at INTEGER NOT NULL, activity_at INTEGER NOT NULL, unsubscribe_id TEXT NOT NULL UNIQUE,
  unsubscribed_at INTEGER, reminder_claimed_at INTEGER
)`;

export const marketingSendsSchema = `CREATE TABLE IF NOT EXISTS marketing_sends (
  user_id TEXT NOT NULL, kind TEXT NOT NULL, sent_at INTEGER NOT NULL, PRIMARY KEY (user_id, kind)
)`;

export function consentStatement(db, { userId, email, optedIn, now }) {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  return db.prepare(`INSERT INTO marketing_consent (user_id,email,opted_in,consented_at,activity_at,unsubscribe_id)
    VALUES (?,?,?,?,?,?)`).bind(userId, email, optedIn ? 1 : 0, now, now, id);
}

async function signature(id, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(id));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

export async function unsubscribeToken(id, secret) { return `${id}.${await signature(id, secret)}`; }

export async function handleUnsubscribe({ request, db, env }) {
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; form-action 'self'; base-uri 'none'", 'X-Content-Type-Options': 'nosniff' };
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  const [id, mac] = token.split('.');
  if (!env.MARKETING_UNSUBSCRIBE_SECRET || !/^[a-f0-9]{64}$/.test(id || '') || !/^[a-f0-9]{64}$/.test(mac || '') || token !== `${id}.${mac}`) return new Response('Invalid unsubscribe link.', { status: 400, headers });
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.MARKETING_UNSUBSCRIBE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signatureBytes = Uint8Array.from(mac.match(/../g), byte => parseInt(byte, 16));
  if (!await crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(id))) return new Response('Invalid unsubscribe link.', { status: 400, headers });
  if (request.method === 'GET') {
    return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><title>Unsubscribe</title><h1>Unsubscribe from marketing emails</h1><form method="post"><button type="submit">Unsubscribe</button></form></html>', { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  }
  if (request.method !== 'POST') return new Response('Method not allowed.', { status: 405, headers });
  await db.prepare('UPDATE marketing_consent SET opted_in = 0, unsubscribed_at = COALESCE(unsubscribed_at, ?) WHERE unsubscribe_id = ?').bind(Date.now(), id).run();
  return new Response('You have been unsubscribed from marketing emails.', { headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } });
}

export function cheapestGeneration(raw) {
  let config;
  try { config = raw ? JSON.parse(raw) : {}; } catch { return null; }
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
  const costs = ['1K', '2K', '4K'].map((resolution, i) => config[`creditCostPer${resolution}`] ?? [1, 2, 4][i]);
  const valid = costs.filter(cost => Number.isSafeInteger(cost) && cost > 0);
  return valid.length ? Math.min(...valid) : null;
}

// Ambiguous delivery outcomes remain claimed: the provider may already have delivered the message.
export async function sendReminderBatch({ db, env, fetcher = fetch, now = Date.now(), limit = 50 }) {
  if (env.MARKETING_REMINDERS_ENABLED !== 'true' || env.GENERATION_ENABLED === 'false' || !env.RESEND_API_KEY || !env.MARKETING_FROM_EMAIL || !env.MARKETING_SENDER_NAME?.trim() || !env.MARKETING_POSTAL_ADDRESS?.trim() || !env.MARKETING_UNSUBSCRIBE_SECRET || !env.APP_ORIGIN) return { sent: 0, enabled: false };
  let origin;
  try { const url = new URL(env.APP_ORIGIN); if (url.protocol !== 'https:') return { sent: 0, enabled: false }; origin = url.origin; } catch { return { sent: 0, enabled: false }; }
  const initialConfig = await db.prepare("SELECT value FROM admin_config WHERE key = 'billing_config'").first();
  const initialCost = cheapestGeneration(initialConfig?.value);
  if (initialCost === null) return { sent: 0, enabled: true };
  const candidates = await db.prepare(`SELECT m.user_id FROM marketing_consent m JOIN users u ON u.id = m.user_id AND u.email = m.email JOIN email_verifications v ON v.user_id = u.id AND v.email = u.email
    WHERE m.opted_in = 1 AND m.unsubscribed_at IS NULL AND m.reminder_claimed_at IS NULL AND m.activity_at <= ? AND u.status = 'active' AND u.id NOT LIKE 'usr_guest%' AND v.verified_at > 0 AND u.credits_balance >= ?
    AND NOT EXISTS (SELECT 1 FROM generation_leases g WHERE g.owner_id = u.id AND g.expires_at > ?) ORDER BY m.activity_at LIMIT ?`).bind(now - 7 * DAY, initialCost, now, limit).all();
  let sent = 0;
  for (const candidate of candidates.results) {
    const config = await db.prepare("SELECT value FROM admin_config WHERE key = 'billing_config'").first();
    const cost = cheapestGeneration(config?.value);
    if (cost === null) continue;
    // This atomic claim is also the final eligibility check, including in-flight generation suppression.
    const row = await db.prepare(`UPDATE marketing_consent SET reminder_claimed_at = ? WHERE user_id = ? AND opted_in = 1 AND unsubscribed_at IS NULL AND reminder_claimed_at IS NULL AND activity_at <= ?
      AND EXISTS (SELECT 1 FROM users u JOIN email_verifications v ON v.user_id = u.id AND v.email = u.email
        WHERE u.id = marketing_consent.user_id AND u.email = marketing_consent.email AND u.status = 'active' AND u.id NOT LIKE 'usr_guest%' AND v.verified_at > 0 AND u.credits_balance >= ?)
      AND NOT EXISTS (SELECT 1 FROM generation_leases g WHERE g.owner_id = marketing_consent.user_id AND g.expires_at > ?)
      RETURNING user_id, email, unsubscribe_id`).bind(now, candidate.user_id, now - 7 * DAY, cost, now).first();
    if (!row) continue;
    // Re-read mutable data after claiming; suppression wins even though the reminder is then forfeited.
    const currentConfig = await db.prepare("SELECT value FROM admin_config WHERE key = 'billing_config'").first();
    const currentCost = cheapestGeneration(currentConfig?.value);
    if (currentCost === null) continue;
    const link = `${origin}/api/marketing/unsubscribe?token=${await unsubscribeToken(row.unsubscribe_id, env.MARKETING_UNSUBSCRIBE_SECRET)}`;
    const current = await db.prepare(`SELECT u.email,u.credits_balance FROM users u JOIN email_verifications v ON v.user_id = u.id AND v.email = u.email JOIN marketing_consent m ON m.user_id = u.id
      WHERE u.id = ? AND u.email = m.email AND u.status = 'active' AND v.verified_at > 0 AND m.opted_in = 1 AND m.unsubscribed_at IS NULL AND m.activity_at <= ? AND u.credits_balance >= ?
      AND NOT EXISTS (SELECT 1 FROM generation_leases g WHERE g.owner_id = u.id AND g.expires_at > ?)`).bind(row.user_id, now - 7 * DAY, currentCost, Date.now()).first();
    if (!current) continue;
    try {
      const response = await fetcher('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `credits-reminder/${row.unsubscribe_id}` }, body: JSON.stringify({ from: env.MARKETING_FROM_EMAIL, to: [current.email], subject: 'Your panorama credits are waiting', text: `Advertisement from ${env.MARKETING_SENDER_NAME}\n\nYou have ${current.credits_balance} credits remaining. Create another panorama at ${origin}/\n\nUnsubscribe from marketing emails: ${link}\n\n${env.MARKETING_SENDER_NAME}\n${env.MARKETING_POSTAL_ADDRESS}`, headers: { 'List-Unsubscribe': `<${link}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }) });
      if (response.ok) sent++;
      else {
        console.error('[marketing-reminders] provider rejected request', response.status);
        // Authentication failures affect the whole batch; release the current claim for retry.
        if ([401, 403, 429].includes(response.status)) {
          await db.prepare('UPDATE marketing_consent SET reminder_claimed_at = NULL WHERE user_id = ? AND reminder_claimed_at = ?').bind(row.user_id, now).run();
        }
        if (response.status === 401 || response.status === 403) break;
      }
    } catch { console.error('[marketing-reminders] provider outcome unknown; reminder retained'); }
  }
  return { sent, enabled: true };
}

// Lifecycle emails share the reminder master switch and the same sending identity.
function marketingOrigin(env) {
  if (env.GENERATION_ENABLED === 'false' || !env.RESEND_API_KEY || !env.MARKETING_FROM_EMAIL
    || !env.MARKETING_SENDER_NAME?.trim() || !env.MARKETING_POSTAL_ADDRESS?.trim()
    || !env.MARKETING_UNSUBSCRIBE_SECRET || !env.APP_ORIGIN) return null;
  try {
    const url = new URL(env.APP_ORIGIN);
    return url.protocol === 'https:' ? url.origin : null;
  } catch { return null; }
}

async function deliverMarketingEmail({ env, fetcher, origin, email, unsubscribeId, kind, subject, body }) {
  const link = `${origin}/api/marketing/unsubscribe?token=${await unsubscribeToken(unsubscribeId, env.MARKETING_UNSUBSCRIBE_SECRET)}`;
  return fetcher('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `${kind}/${unsubscribeId}`,
    },
    body: JSON.stringify({
      from: env.MARKETING_FROM_EMAIL,
      to: [email],
      subject,
      text: `Advertisement from ${env.MARKETING_SENDER_NAME}\n\n${body}\n\nUnsubscribe from marketing emails: ${link}\n\n${env.MARKETING_SENDER_NAME}\n${env.MARKETING_POSTAL_ADDRESS}`,
      headers: { 'List-Unsubscribe': `<${link}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }),
  });
}

/** Optional onboarding email right after a verified signup. Only for opted-in accounts. */
export async function sendWelcomeEmail({ db, env, userId, fetcher = fetch, now = Date.now() }) {
  if (env.MARKETING_REMINDERS_ENABLED !== 'true') return { sent: false };
  const origin = marketingOrigin(env);
  if (!origin) return { sent: false };
  const row = await db.prepare(`SELECT u.email, u.name, u.credits_balance, m.unsubscribe_id FROM users u
    JOIN marketing_consent m ON m.user_id = u.id AND m.email = u.email
    WHERE u.id = ? AND m.opted_in = 1 AND m.unsubscribed_at IS NULL AND u.status = 'active'`).bind(userId).first();
  if (!row) return { sent: false };
  const claim = await db.prepare("INSERT OR IGNORE INTO marketing_sends (user_id, kind, sent_at) VALUES (?, 'welcome', ?)")
    .bind(userId, now).run();
  if (!claim.meta.changes) return { sent: false };
  const body = `Hi ${row.name || 'there'},\n\nYour account is verified and ${row.credits_balance} starter credits are ready.\n\nDescribe a scene, pick a style, and generate your first 360° panorama: ${origin}/\n\nEvery plan includes 1K, 2K and 4K output, PNG and HDR export, and commercial usage rights: ${origin}/pricing/`;
  try {
    const response = await deliverMarketingEmail({ env, fetcher, origin, email: row.email, unsubscribeId: row.unsubscribe_id, kind: 'welcome', subject: 'Your panorama credits are ready', body });
    if (response.ok) return { sent: true };
    console.error('[marketing-lifecycle] welcome rejected', response.status);
    if ([401, 403].includes(response.status)) await db.prepare("DELETE FROM marketing_sends WHERE user_id = ? AND kind = 'welcome'").bind(userId).run();
    return { sent: false };
  } catch {
    console.error('[marketing-lifecycle] welcome outcome unknown; claim retained');
    return { sent: false };
  }
}

/** One upgrade nudge per 30 days for opted-in accounts whose credits dropped below one generation. */
export async function sendLifecycleBatch({ db, env, fetcher = fetch, now = Date.now(), limit = 50 }) {
  if (env.MARKETING_REMINDERS_ENABLED !== 'true') return { sent: 0, enabled: false };
  const origin = marketingOrigin(env);
  if (!origin) return { sent: 0, enabled: false };
  const cost = cheapestGeneration((await db.prepare("SELECT value FROM admin_config WHERE key = 'billing_config'").first())?.value);
  if (cost === null) return { sent: 0, enabled: true };
  const candidates = await db.prepare(`SELECT u.id, u.email, u.credits_balance, m.unsubscribe_id FROM marketing_consent m
    JOIN users u ON u.id = m.user_id AND u.email = m.email
    JOIN email_verifications v ON v.user_id = u.id AND v.email = u.email
    LEFT JOIN marketing_sends s ON s.user_id = u.id AND s.kind = 'credits-empty'
    WHERE m.opted_in = 1 AND m.unsubscribed_at IS NULL AND u.status = 'active' AND u.id NOT LIKE 'usr_guest%'
      AND v.verified_at > 0 AND u.credits_balance < ? AND m.activity_at <= ?
      AND (s.sent_at IS NULL OR s.sent_at <= ?)
      AND NOT EXISTS (SELECT 1 FROM generation_leases g WHERE g.owner_id = u.id AND g.expires_at > ?)
    ORDER BY m.activity_at LIMIT ?`).bind(cost, now - 3 * DAY, now - 30 * DAY, now, limit).all();
  let sent = 0;
  for (const candidate of candidates.results) {
    const claim = await db.prepare(`INSERT INTO marketing_sends (user_id, kind, sent_at) VALUES (?, 'credits-empty', ?)
      ON CONFLICT(user_id, kind) DO UPDATE SET sent_at = excluded.sent_at WHERE marketing_sends.sent_at <= ?`)
      .bind(candidate.id, now, now - 30 * DAY).run();
    if (!claim.meta.changes) continue;
    const current = await db.prepare(`SELECT u.email, u.credits_balance, m.unsubscribe_id FROM users u
      JOIN marketing_consent m ON m.user_id = u.id AND m.email = u.email
      JOIN email_verifications v ON v.user_id = u.id AND v.email = u.email
      WHERE u.id = ? AND u.status = 'active' AND v.verified_at > 0 AND m.opted_in = 1 AND m.unsubscribed_at IS NULL AND u.credits_balance < ?`)
      .bind(candidate.id, cost).first();
    if (!current) continue;
    const body = `Hi, your account is out of generation credits.\n\nTop up from $4.99 for 25 credits — no subscription, credits never expire — or subscribe for the lowest per-credit rate: ${origin}/pricing/\n\nYour panoramas and exports stay in your account.`;
    try {
      const response = await deliverMarketingEmail({ env, fetcher, origin, email: current.email, unsubscribeId: current.unsubscribe_id, kind: 'credits-empty', subject: 'Your panorama credits ran out', body });
      if (response.ok) sent++;
      else {
        console.error('[marketing-lifecycle] provider rejected request', response.status);
        await db.prepare("DELETE FROM marketing_sends WHERE user_id = ? AND kind = 'credits-empty'").bind(candidate.id).run();
        if ([401, 403].includes(response.status)) break;
      }
    } catch { console.error('[marketing-lifecycle] provider outcome unknown; claim retained'); }
  }
  return { sent, enabled: true };
}
