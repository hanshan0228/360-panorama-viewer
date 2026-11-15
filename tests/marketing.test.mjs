import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { marketingSchema, consentStatement, handleUnsubscribe, sendReminderBatch, cheapestGeneration, unsubscribeToken } from '../server/marketing.mjs';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,status TEXT,credits_balance INTEGER);
    CREATE TABLE email_verifications(user_id TEXT,email TEXT,verified_at INTEGER);
    CREATE TABLE admin_config(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE generation_leases(owner_id TEXT,expires_at INTEGER); ${marketingSchema};`);
  const db = { prepare(query) { let args = []; const s = { bind(...a) { args = a; return s; }, async run() { return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; }, async first() { return sql.prepare(query).get(...args) ?? null; }, async all() { return { results: sql.prepare(query).all(...args) }; } }; return s; } };
  return { sql, db };
}
const now = 2_000_000_000_000;
const env = { MARKETING_REMINDERS_ENABLED: 'true', RESEND_API_KEY: 'key', MARKETING_FROM_EMAIL: 'mail@example.test', MARKETING_SENDER_NAME: 'Example', MARKETING_POSTAL_ADDRESS: '123 Example Street', MARKETING_UNSUBSCRIBE_SECRET: 'a-strong-secret', APP_ORIGIN: 'https://example.test' };
async function add(f, id, { optedIn = true, verified = true, balance = 4, activity = now - 8 * 86400000, status = 'active' } = {}) {
  f.sql.prepare('INSERT INTO users VALUES (?,?,?,?)').run(id, `${id}@example.test`, status, balance);
  if (verified) f.sql.prepare('INSERT INTO email_verifications VALUES (?,?,?)').run(id, `${id}@example.test`, 1);
  await consentStatement(f.db, { userId: id, email: `${id}@example.test`, optedIn, now: activity }).run();
}

test('eligibility, actual balance, rate and durable one-time claim', async () => {
  const f = fixture();
  await add(f, 'eligible'); await add(f, 'unverified', { verified: false }); await add(f, 'poor', { balance: 1 });
  await add(f, 'recent', { activity: now - 1000 }); await add(f, 'off', { optedIn: false }); await add(f, 'suspended', { status: 'suspended' });
  await add(f, 'busy'); f.sql.prepare('INSERT INTO generation_leases VALUES (?,?)').run('busy', now + 10000);
  f.sql.prepare('INSERT INTO admin_config VALUES (?,?)').run('billing_config', JSON.stringify({ creditCostPer1K: 3 }));
  let messages = []; const fetcher = async (_url, options) => { messages.push(JSON.parse(options.body)); return new Response('{}', { status: 200 }); };
  assert.equal((await sendReminderBatch({ db: f.db, env: {}, now, fetcher })).sent, 0);
  assert.equal((await sendReminderBatch({ db: f.db, env, now, fetcher })).sent, 1);
  assert.match(messages[0].text, /4 credits remaining/);
  assert.ok(messages[0].text.includes('\n\n'));
  assert.ok(!messages[0].text.includes('\\n'));
  assert.match(messages[0].text, /123 Example Street/);
  assert.equal(messages[0].headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.equal((await sendReminderBatch({ db: f.db, env, now, fetcher })).sent, 0);
  assert.equal(messages.length, 1);
  assert.equal(cheapestGeneration('{bad'), null);
  f.sql.close();
});

test('unsubscribe GET is safe, POST is idempotent and suppresses mail', async () => {
  const f = fixture(); await add(f, 'person');
  const id = f.sql.prepare('SELECT unsubscribe_id FROM marketing_consent').get().unsubscribe_id;
  const token = await unsubscribeToken(id, env.MARKETING_UNSUBSCRIBE_SECRET);
  const url = `https://example.test/api/marketing/unsubscribe?token=${token}`;
  let res = await handleUnsubscribe({ request: new Request(url), db: f.db, env });
  assert.equal(res.status, 200); assert.match(await res.text(), /<form/);
  assert.equal(f.sql.prepare('SELECT opted_in FROM marketing_consent').get().opted_in, 1);
  for (let i = 0; i < 2; i++) assert.equal((await handleUnsubscribe({ request: new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' }), db: f.db, env })).status, 200);
  assert.equal((await sendReminderBatch({ db: f.db, env, now, fetcher: () => { throw Error('sent'); } })).sent, 0);
  res = await handleUnsubscribe({ request: new Request(url.replace(token, `${id}.${'0'.repeat(64)}`), { method: 'POST' }), db: f.db, env });
  assert.equal(res.status, 400); f.sql.close();
});

test('rechecks suppression immediately before sending and does not retry ambiguous failures', async () => {
  const f = fixture(); await add(f, 'person'); let count = 0;
  const fetcher = async () => { count++; throw Error('timeout'); };
  await sendReminderBatch({ db: f.db, env, now, fetcher });
  await sendReminderBatch({ db: f.db, env, now, fetcher });
  assert.equal(count, 1); f.sql.close();
});


test('rate-limit rejection releases the claim for retry', async () => {
  const f = fixture(); await add(f, 'person'); let attempts = 0;
  const fetcher = async () => new Response('', { status: ++attempts === 1 ? 429 : 200 });
  assert.equal((await sendReminderBatch({ db: f.db, env, now, fetcher })).sent, 0);
  assert.equal((await sendReminderBatch({ db: f.db, env, now: now + 1, fetcher })).sent, 1);
  assert.equal(attempts, 2); f.sql.close();
});

test('last eligibility read suppresses an unsubscribe after claim', async () => {
  const f = fixture(); await add(f, 'person'); let configReads = 0;
  const original = f.db.prepare;
  f.db.prepare = query => {
    const statement = original(query);
    if (query.startsWith('SELECT value FROM admin_config')) {
      const first = statement.first;
      statement.first = async () => { if (++configReads === 3) f.sql.exec('UPDATE marketing_consent SET opted_in = 0'); return first(); };
    }
    return statement;
  };
  let sent = 0; await sendReminderBatch({ db: f.db, env, now, fetcher: async () => { sent++; return new Response(); } });
  assert.equal(sent, 0); f.sql.close();
});

test('overlapping scheduled invocations claim only once', async () => {
  const f = fixture(); await add(f, 'person'); let count = 0;
  const fetcher = async () => { count++; return new Response('', { status: 200 }); };
  await Promise.all([sendReminderBatch({ db: f.db, env, now, fetcher }), sendReminderBatch({ db: f.db, env, now, fetcher })]);
  assert.equal(count, 1); f.sql.close();
});

test('ineligible older accounts do not starve the eligible queue', async () => {
  const f = fixture();
  f.sql.prepare('INSERT INTO admin_config VALUES (?,?)').run('billing_config', JSON.stringify({ creditCostPer1K: 5, creditCostPer2K: 6, creditCostPer4K: 7 }));
  const old = now - 10 * 86400000;
  for (let i = 0; i < 55; i++) {
    await add(f, `unverified${i}`, { verified: false, balance: 10, activity: old });
    await add(f, `poor${i}`, { balance: 4, activity: old });
    await add(f, `busy${i}`, { balance: 10, activity: old });
    f.sql.prepare('INSERT INTO generation_leases VALUES (?,?)').run(`busy${i}`, now + 10000);
  }
  await add(f, 'eligible-later', { balance: 5 });
  const messages = [];
  const result = await sendReminderBatch({ db: f.db, env, now, fetcher: async (_url, options) => { messages.push(JSON.parse(options.body)); return new Response('', { status: 200 }); } });
  assert.equal(result.sent, 1);
  assert.deepEqual(messages[0].to, ['eligible-later@example.test']);
  f.sql.close();
});

test('permanent 4xx rejections do not starve later eligible users', async () => {
  const f = fixture();
  for (let i = 0; i < 50; i++) await add(f, `rejected${i}`, { activity: now - 10 * 86400000 });
  await add(f, 'eligible-later');
  let accepted = 0;
  const fetcher = async (_url, options) => {
    const recipient = JSON.parse(options.body).to[0];
    if (recipient === 'eligible-later@example.test') { accepted++; return new Response('', { status: 200 }); }
    return new Response('', { status: 400 });
  };
  assert.equal((await sendReminderBatch({ db: f.db, env, now, fetcher })).sent, 0);
  assert.equal((await sendReminderBatch({ db: f.db, env, now: now + 1, fetcher })).sent, 1);
  assert.equal(accepted, 1);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM marketing_consent WHERE reminder_claimed_at IS NOT NULL').get().n, 51);
  f.sql.close();
});

test('authentication failures stop the batch and leave all candidates retryable', async () => {
  for (const status of [401, 403]) {
    const f = fixture();
    await add(f, 'first', { activity: now - 10 * 86400000 });
    await add(f, 'second', { activity: now - 9 * 86400000 });
    let calls = 0;
    const result = await sendReminderBatch({ db: f.db, env, now, fetcher: async () => { calls++; return new Response('', { status }); } });
    assert.equal(result.sent, 0);
    assert.equal(calls, 1);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM marketing_consent WHERE reminder_claimed_at IS NOT NULL').get().n, 0);
    calls = 0;
    const retried = await sendReminderBatch({ db: f.db, env, now: now + 1, fetcher: async () => { calls++; return new Response('', { status: 200 }); } });
    assert.equal(retried.sent, 2);
    assert.equal(calls, 2);
    f.sql.close();
  }
});
