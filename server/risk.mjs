// Shared, persistent limits: never use KV or per-isolate memory to authorize spending.
export const riskSchema = [
 `CREATE TABLE IF NOT EXISTS risk_counters (key TEXT PRIMARY KEY, used INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS risk_counters_expiry ON risk_counters(expires_at)`,
 `CREATE TABLE IF NOT EXISTS generation_leases (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS generation_leases_expiry ON generation_leases(expires_at)`,
];
export async function initRisk(db) { for (const sql of riskSchema) await db.prepare(sql).run(); }
export function positiveLimit(value, fallback) {
 const number = value === undefined ? fallback : Number(value);
 if (!Number.isSafeInteger(number) || number < 0) throw new Error('Invalid safety limit');
 return number;
}
export async function consumeLimit(db, key, limit, duration, amount = 1, now = Date.now(), rolling = false) {
 if (!Number.isSafeInteger(amount) || amount < 1 || !Number.isSafeInteger(limit) || amount > limit) return false;
 const expires = rolling ? now + duration : now - now % duration + duration;
 const result = await db.prepare(`INSERT INTO risk_counters (key,used,expires_at) VALUES (?,?,?)
 ON CONFLICT(key) DO UPDATE SET used = CASE WHEN expires_at <= ? THEN ? ELSE used + ? END,
 expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
 WHERE expires_at <= ? OR used + ? <= ?`).bind(key, amount, expires, now, amount, amount, now, now, amount, limit).run();
 return result.meta.changes > 0;
}
export async function sourceKey(request) {
 let ip = request.headers.get('CF-Connecting-IP') || 'unknown';
 // IPv6 privacy addresses within one /64 share the trial allowance.
 if (ip.includes(':')) {
   const [left, right = ''] = ip.toLowerCase().split('::');
   const a = left ? left.split(':') : [], b = right ? right.split(':') : [];
   ip = [...a, ...Array(Math.max(0, 8-a.length-b.length)).fill('0'), ...b].slice(0,4).map(x => x.padStart(4,'0')).join(':') + '::/64';
 }
 const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('panorama-abuse-source-v1:' + ip));
 return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2,'0')).join('');
}
export async function claimTrial(db, source, credits, enabled = true) {
 // A failed later reservation deliberately burns the earlier allowance: fail closed during races.
 if (!enabled || !credits || !await consumeLimit(db, 'trial-source:'+source, 1, 7*86400000, 1, Date.now(), true)) return 0;
 return await consumeLimit(db, 'trial-global', 100, 86400000, credits) ? credits : 0;
}
export async function acquireGeneration(db, user, source, cost, env = {}) {
 if (env.GENERATION_ENABLED === 'false') return { error: 'Generation is temporarily paused. No credits were charged.' };
 const now = Date.now(), id = crypto.randomUUID();
 await db.prepare('DELETE FROM generation_leases WHERE expires_at <= ?').bind(now).run();
 const reserved = await db.prepare(`INSERT INTO generation_leases (id,owner_id,expires_at) SELECT ?,?,? WHERE
 (SELECT COUNT(*) FROM generation_leases WHERE expires_at > ?) < ? AND
 (SELECT COUNT(*) FROM generation_leases WHERE owner_id = ? AND expires_at > ?) < 2`)
 .bind(id,user.id,now+240000,now,positiveLimit(env.MAX_CONCURRENT_GENERATIONS,4),user.id,now).run();
 if (!reserved.meta.changes) return { error: 'Generation is busy. Please wait and retry. No credits were charged.' };
 const release = () => db.prepare('DELETE FROM generation_leases WHERE id = ?').bind(id).run();
 try {
   const limits = [ ['generation-attempts',200,1], ['generation-all',positiveLimit(env.MAX_DAILY_GENERATION_CREDITS,1000),cost] ];
   if (!user.plan || user.plan === 'free' || user.id.startsWith('usr_guest')) limits.push(
     ['generation-free-attempts',25,1], ['generation-free',positiveLimit(env.MAX_DAILY_FREE_CREDITS,100),cost], ['generation-source:'+source,20,cost], ['generation-user:'+user.id,10,1]);
   for (const [key,limit,amount] of limits) {
     if (!await consumeLimit(db,key,limit,86400000,amount)) { await release(); return { error: 'Daily generation safety limit reached. Try again tomorrow. No credits were charged.' }; }
   }
   // Attempts consume the safety budget even when a model fails or a quality refund is issued.
   return { id, release };
 } catch (error) { await release(); throw error; }
}

export async function readJsonLimited(request, maximum) {
 if (Number(request.headers.get('Content-Length')) > maximum) throw new RangeError('Request body is too large');
 const reader = request.body?.getReader(); if (!reader) return {};
 let size=0; const chunks=[];
 try {
   while (true) { const {done,value}=await reader.read(); if(done)break; size+=value.length;
     if(size>maximum) { await reader.cancel(); throw new RangeError('Request body is too large'); } chunks.push(value); }
 } finally { reader.releaseLock(); }
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder().decode(bytes));
}

// ponytail: the local JSON store supports one Node process; use D1 for multiple instances.
export function consumeJsonLimit(store, key, limit, duration, amount = 1, now = Date.now(), rolling = false) {
 if (!Number.isSafeInteger(amount) || amount < 1 || !Number.isSafeInteger(limit) || amount > limit) return false;
 store.riskCounters ||= {};
 for (const [name,row] of Object.entries(store.riskCounters)) if(row.expires_at <= now) delete store.riskCounters[name];
 const row = store.riskCounters[key];
 if (row && row.used + amount > limit) return false;
 store.riskCounters[key] = { used: (row?.used || 0) + amount, expires_at: row?.expires_at || (rolling ? now+duration : now-now%duration+duration) };
 return true;
}
export function claimJsonTrial(store, source, credits, enabled = true) {
 return enabled && credits && consumeJsonLimit(store,'trial-source:'+source,1,7*86400000,1,Date.now(),true)
 && consumeJsonLimit(store,'trial-global',100,86400000,credits) ? credits : 0;
}
