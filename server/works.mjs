import { WORK_STORAGE_LIMIT, ensureByteAccounting } from './storageBudget.mjs';
import { initRisk, consumeLimit } from './risk.mjs';
import { inspectImageResolution } from '../src/utils/imageModelRequest.mjs';

const PART_SIZE = 4 * 1024 * 1024;
const MAX_DATA_URL = 64 * 1024 * 1024;
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
export const workSchema = `CREATE TABLE IF NOT EXISTS panorama_works (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, prompt TEXT NOT NULL, model TEXT NOT NULL,
 resolution TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, mime TEXT NOT NULL,
 parts INTEGER NOT NULL, created_at INTEGER NOT NULL, ready INTEGER NOT NULL DEFAULT 0,
 deleted_at INTEGER, stored_bytes INTEGER NOT NULL DEFAULT 67108864
)`;
async function init(db) {
  await db.prepare(workSchema).run();
  await ensureByteAccounting(db, 'panorama_works', 67108864);
  await db.prepare('CREATE INDEX IF NOT EXISTS panorama_works_owner ON panorama_works(owner_id, created_at)').run();
}
const primary = db => db.withSession ? db.withSession('first-primary') : db;

/** Save the exact model original privately. Storage failure must never discard a generated image. */
export async function saveGeneratedWork({ db, storage, user, imageUrl, prompt, model, resolution }) {
  if (!user?.id || user.id.startsWith('usr_guest')) return { saved: false, error: 'Guest results are not saved. Download this image; sign in to save future generations privately.' };
  if (!db || !storage) return { saved: false, error: 'Cloud history is unavailable. Download this image before leaving the page.' };
  if (typeof imageUrl !== 'string' || imageUrl.length > MAX_DATA_URL) return { saved: false, error: 'This original exceeds the 48 MB cloud limit. Download it before leaving the page.' };
  const match = imageUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  const dimensions = inspectImageResolution(imageUrl, resolution);
  if (!match || !dimensions.width || !dimensions.height || dimensions.width * dimensions.height > 64 * 1024 * 1024) return { saved: false, error: 'This model original cannot be archived automatically. Download it before leaving the page.' };
  db = primary(db);
  const id = crypto.randomUUID().replaceAll('-', '');
  const data = match[2], parts = Math.ceil(data.length / PART_SIZE), createdAt = Date.now();
  const keys = Array.from({ length: parts }, (_, i) => `work:${id}:${i}`);
  let reserved = false;
  try {
    await init(db);
    const personalLimit = user.plan && user.plan !== 'free' ? 512 * 1024 * 1024 : 128 * 1024 * 1024;
    const result = await db.prepare(`INSERT INTO panorama_works (id,owner_id,prompt,model,resolution,width,height,mime,parts,created_at,stored_bytes)
      SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE
      (SELECT COALESCE(SUM(stored_bytes),0) FROM panorama_works) + ? <= ? AND
      (SELECT COALESCE(SUM(stored_bytes),0) FROM panorama_works WHERE owner_id = ?) + ? <= ? AND
      (SELECT COUNT(*) FROM panorama_works WHERE owner_id = ? AND deleted_at IS NULL) < 50 AND
      EXISTS (SELECT 1 FROM users WHERE id = ? AND status = 'active')`)
      .bind(id, user.id, String(prompt || '').slice(0, 5000), String(model || '').slice(0, 200), resolution,
        dimensions.width, dimensions.height, match[1], parts, createdAt, data.length, data.length, WORK_STORAGE_LIMIT, user.id, data.length, personalLimit, user.id, user.id).run();
    if (!result.meta.changes) return { saved: false, error: 'Cloud storage limit reached (personal capacity, 50 works, or site capacity). Download this image; free space in My works before saving more.' };
    reserved = true;
    // ponytail: 4 MB base64 chunks preserve originals above KV's per-value limit without binary copies;
    // this first version caps originals at about 48 MB. Move to R2 for larger originals or a larger library.
    for (let i = 0; i < parts; i++) await storage.put(keys[i], data.slice(i * PART_SIZE, (i + 1) * PART_SIZE));
    await db.prepare('UPDATE panorama_works SET ready = 1 WHERE id = ?').bind(id).run();
    return { saved: true, id };
  } catch {
    if (reserved) {
      // Keep byte reservations if physical cleanup fails; invisible data still consumes storage.
      await db.prepare('UPDATE panorama_works SET deleted_at = ? WHERE id = ?').bind(Date.now(), id).run().catch(() => {});
      const cleaned = await Promise.allSettled(keys.map(key => storage.delete(key)));
      if (cleaned.every(result => result.status === 'fulfilled')) await db.prepare('DELETE FROM panorama_works WHERE id = ?').bind(id).run().catch(() => {});
    }
    console.error('[private-library] save failed');
    return { saved: false, error: 'Cloud history could not save this image. Download it before leaving the page.' };
  }
}

export async function handleWorksRequest({ request, db, storage }) {
  if (!db || !storage) return json({ error: 'Private cloud history is unavailable on this server.' }, 503);
  db = primary(db);
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = token ? await db.prepare('SELECT u.id, u.status FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?').bind(token, Date.now()).first() : null;
  if (!user) return json({ error: 'Sign in to view your private works.' }, 401);
  if (user.status !== 'active' || user.id.startsWith('usr_guest')) return json({ error: 'Sign in with an active permanent account to save and view private works. Guest results are not saved.' }, 403);
  await init(db);
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  const match = path.match(/^\/api\/works(?:\/([a-f0-9]{32})(?:\/(original))?)?$/);
  if (!match) return json({ error: 'Work not found' }, 404);
  const [, id, asset] = match;
  if (!id && request.method === 'GET') {
    const rows = await db.prepare('SELECT id,prompt,model,resolution,width,height,mime,created_at FROM panorama_works WHERE owner_id = ? AND ready = 1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50').bind(user.id).all();
    return json({ works: rows.results });
  }
  const work = id ? await db.prepare('SELECT * FROM panorama_works WHERE id = ? AND owner_id = ? AND ready = 1 AND deleted_at IS NULL').bind(id, user.id).first() : null;
  if (!work) return json({ error: 'Work not found' }, 404);
  if (request.method === 'GET' && asset === 'original') {
    await initRisk(db);
    if (!await consumeLimit(db, 'original-read:'+user.id, 40, 86400000) || !await consumeLimit(db, 'original-read-global', 1000, 86400000)) return json({ error: 'Daily image transfer safety limit reached. Try again tomorrow.' }, 429);
    let first = await storage.get(`work:${id}:0`, 'text');
    if (!first) return json({ error: 'This original is still becoming available. Try again shortly.' }, 503);
    let index = -1;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({ async pull(controller) {
      try {
        if (index === -1) { controller.enqueue(encoder.encode(`{"imageUrl":"data:${work.mime};base64,`)); index = 0; return; }
        if (index === work.parts) { controller.enqueue(encoder.encode('"}')); controller.close(); return; }
        const part = index === 0 ? first : await storage.get(`work:${id}:${index}`, 'text');
        if (!part) throw new Error('Image storage is still propagating');
        controller.enqueue(encoder.encode(part)); first = null; index++;
      } catch (error) { controller.error(error); }
    } });
    return new Response(stream, { headers });
  }
  if (request.method === 'POST' && !asset) {
    if (Number(request.headers.get('Content-Length')) > 128) return json({ error: 'Invalid request' }, 400);
    // No bodies are needed: this route only deletes the owner's cloud original.
    await db.prepare('UPDATE panorama_works SET deleted_at = ? WHERE id = ? AND owner_id = ?').bind(Date.now(), id, user.id).run();
    const cleaned = await Promise.allSettled(Array.from({ length: work.parts }, (_, i) => storage.delete(`work:${id}:${i}`)));
    if (cleaned.every(result => result.status === 'fulfilled')) await db.prepare('UPDATE panorama_works SET stored_bytes = 0 WHERE id = ?').bind(id).run();
    return json({ success: true });
  }
  return json({ error: 'Method not allowed' }, 405);
}
