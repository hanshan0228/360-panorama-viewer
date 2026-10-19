import { SHARE_STORAGE_LIMIT, ensureByteAccounting } from './storageBudget.mjs';
import { initRisk, consumeLimit, sourceKey } from './risk.mjs';
const MAX_BYTES = 20 * 1024 * 1024;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' };
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json', ...extra } });
export const shareSchema = `CREATE TABLE IF NOT EXISTS panorama_shares (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, width INTEGER NOT NULL,
  height INTEGER NOT NULL, size INTEGER NOT NULL, allow_download INTEGER NOT NULL,
  listed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, revoked_at INTEGER, ready INTEGER NOT NULL DEFAULT 0,
  stored_bytes INTEGER NOT NULL DEFAULT 20971520
)`;

// Idempotent migration: share tables created before the public showcase flag keep working.
export async function ensureShareColumns(db) {
  const columns = await db.prepare('PRAGMA table_info(panorama_shares)').all();
  if (columns.results.some(column => column.name === 'listed')) return;
  try { await db.prepare('ALTER TABLE panorama_shares ADD COLUMN listed INTEGER NOT NULL DEFAULT 0').run(); }
  catch (error) {
    const current = await db.prepare('PRAGMA table_info(panorama_shares)').all();
    if (!current.results.some(column => column.name === 'listed')) throw error;
  }
}

async function readLimited(request, maximum) {
  if (Number(request.headers.get('Content-Length')) > maximum) throw new RangeError('Upload is too large');
  const reader = request.body?.getReader();
  if (!reader) throw new TypeError('Request body is required');
  const parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) { await reader.cancel(); throw new RangeError('Upload is too large'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

export function inspectSharedPng(bytes) {
  if (bytes.length < 45) throw new TypeError('Upload a valid PNG panorama');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a || view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) throw new TypeError('Upload a valid PNG panorama');
  const width = view.getUint32(16), height = view.getUint32(20);
  if (width < 2 || height < 1 || width !== height * 2 || width > 16384 || width * height > 64 * 1024 * 1024) throw new TypeError('Share a 2:1 panorama up to 64 megapixels');
  // Check chunk bounds and require image data and an end marker; SVG/HTML are never served as images.
  let offset = 8, hasData = false, ended = false;
  while (offset + 12 <= bytes.length) {
    const size = view.getUint32(offset), type = view.getUint32(offset + 4);
    if (size > bytes.length - offset - 12) throw new TypeError('Truncated PNG');
    if (type === 0x49444154) hasData = true;
    offset += size + 12;
    if (type === 0x49454e44) { ended = size === 0 && offset === bytes.length; break; }
  }
  if (!hasData || !ended) throw new TypeError('Incomplete PNG');
  return { width, height };
}

export function inspectSharedImage(bytes, contentType) {
  if (contentType === 'image/png') return inspectSharedPng(bytes);
  if (contentType !== 'image/jpeg' || bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new TypeError('Upload a complete PNG or JPEG panorama');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2, width = 0, height = 0;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 0xff) throw new TypeError('Invalid JPEG marker');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) throw new TypeError('Truncated JPEG');
    const size = view.getUint16(offset);
    if (size < 2 || size > bytes.length - offset) throw new TypeError('Truncated JPEG');
    if (marker === 0xda) {
      if (!width || !height || size < 6 || offset + size >= bytes.length - 2) throw new TypeError('Invalid JPEG scan');
      if (width !== height * 2 || width > 16384 || width * height > 64 * 1024 * 1024) throw new TypeError('Share a 2:1 panorama up to 64 megapixels');
      return { width, height };
    }
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (size < 8) throw new TypeError('Invalid JPEG dimensions');
      height = view.getUint16(offset + 3); width = view.getUint16(offset + 5);
    }
    offset += size;
  }
  throw new TypeError('Incomplete JPEG');
}

export async function handleShareRequest({ request, db, storage }) {
  if (!db || !storage) return json({ error: 'Panorama sharing is not available on this server yet.' }, 503);
  // Always read access/revocation from the primary database; KV holds immutable image bytes only.
  db = db.withSession ? db.withSession('first-primary') : db;
  await db.prepare(shareSchema).run();
  await ensureByteAccounting(db, 'panorama_shares', MAX_BYTES);
  await ensureShareColumns(db);
  await db.prepare('CREATE INDEX IF NOT EXISTS panorama_shares_owner ON panorama_shares(owner_id, created_at)').run();
  const url = new URL(request.url);
  const match = url.pathname.replace(/\/+$/, '').match(/^\/api\/shares(?:\/([a-f0-9]{32})(?:\/(image|download))?)?$/);
  if (!match) return json({ error: 'Share not found' }, 404);
  const [, id, media] = match;
  const method = request.method;
  if (id && method === 'GET') {
    const row = await db.prepare('SELECT id, title, width, height, allow_download, listed, created_at FROM panorama_shares WHERE id = ? AND revoked_at IS NULL AND ready = 1').bind(id).first();
    if (!row) return json({ error: 'This panorama link is unavailable or has been revoked.' }, 404);
    if (!media) return json({ share: { id: row.id, title: row.title, width: row.width, height: row.height, allowDownload: !!row.allow_download, listed: !!row.listed, createdAt: row.created_at } });
    if (media === 'download' && !row.allow_download) return json({ error: 'The author has disabled the download button.' }, 403);
    await initRisk(db);
    if (!await consumeLimit(db, 'share-read:'+await sourceKey(request), 120, 3600000) || !await consumeLimit(db, 'share-read-global', 3000, 86400000)) return json({ error: 'Image transfer safety limit reached. Please try later.' }, 429);
    const image = await storage.getWithMetadata(`panorama:${id}`, 'stream');
    if (!image.value) return json({ error: 'This image is still becoming available. Please try again shortly.' }, 503, { 'Retry-After': '5' });
    const mime = image.metadata?.contentType === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    return new Response(image.value, { headers: { ...headers, 'Content-Type': mime,
      'Content-Disposition': `${media === 'download' ? 'attachment' : 'inline'}; filename="panorama-${id}.${mime === 'image/jpeg' ? 'jpg' : 'png'}"` } });
  }
  // Anonymous showcase feed: only shares whose owner opted into public listing.
  if (!id && method === 'GET' && url.searchParams.get('public') === '1') {
    await initRisk(db);
    if (!await consumeLimit(db, 'share-listing:' + await sourceKey(request), 60, 3600000)) return json({ error: 'Too many showcase requests. Please try again later.' }, 429);
    const rows = await db.prepare('SELECT id, title, width, height, created_at FROM panorama_shares WHERE listed = 1 AND ready = 1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 200').all();
    return json({ shares: rows.results.map(row => ({ id: row.id, title: row.title, width: row.width, height: row.height, createdAt: row.created_at })) });
  }
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const user = token ? await db.prepare(`SELECT u.id, u.status FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?`).bind(token, Date.now()).first() : null;
  if (!user) return json({ error: 'Sign in to manage shared panoramas.' }, 401);
  if (user.status !== 'active' || user.id.startsWith('usr_guest')) return json({ error: 'Sign in with a permanent, active account to share panoramas.' }, 403);
  if (!id && method === 'GET') {
    const rows = await db.prepare('SELECT id, title, width, height, allow_download, listed, created_at, revoked_at FROM panorama_shares WHERE owner_id = ? ORDER BY created_at DESC LIMIT 50').bind(user.id).all();
    return json({ shares: rows.results.map(row => ({ id: row.id, title: row.title, width: row.width, height: row.height, allowDownload: !!row.allow_download, listed: !!row.listed, createdAt: row.created_at, revoked: row.revoked_at !== null })) });
  }
  try {
    if (!id && method === 'POST') {
      const contentType = request.headers.get('Content-Type')?.split(';')[0];
      if (!['image/png', 'image/jpeg'].includes(contentType)) return json({ error: 'Upload a PNG or JPEG panorama.' }, 415);
      const title = (url.searchParams.get('title') || 'Untitled panorama').trim();
      if (!title || title.length > 100) return json({ error: 'Use a title between 1 and 100 characters.' }, 400);
      const bytes = await readLimited(request, MAX_BYTES);
      const { width, height } = inspectSharedImage(bytes, contentType);
      const shareId = crypto.randomUUID().replaceAll('-', '');
      const createdAt = Date.now(), allowDownload = url.searchParams.get('allowDownload') !== '0';
      const listed = url.searchParams.get('listed') === '1';
      const reserved = await db.prepare(`INSERT INTO panorama_shares (id, owner_id, title, width, height, size, allow_download, listed, created_at, stored_bytes)
        SELECT ?,?,?,?,?,?,?,?,?,? WHERE
        (SELECT COALESCE(SUM(stored_bytes),0) FROM panorama_shares) + ? <= ? AND
        (SELECT COALESCE(SUM(stored_bytes),0) FROM panorama_shares WHERE owner_id = ?) + ? <= 104857600 AND
        (SELECT COUNT(*) FROM panorama_shares WHERE owner_id = ? AND revoked_at IS NULL) < 10 AND
        (SELECT COUNT(*) FROM panorama_shares WHERE owner_id = ? AND created_at > ?) < 5`)
        .bind(shareId, user.id, title, width, height, bytes.length, allowDownload ? 1 : 0, listed ? 1 : 0, createdAt, bytes.length, bytes.length, SHARE_STORAGE_LIMIT, user.id, bytes.length, user.id, user.id, createdAt - 86400000).run();
      if (!reserved.meta.changes) return json({ error: 'Sharing limit reached: personal or site storage capacity, 10 active links, or 5 new links per day.' }, 429);
      try {
        await storage.put(`panorama:${shareId}`, bytes, { metadata: { contentType } });
        await db.prepare('UPDATE panorama_shares SET ready = 1 WHERE id = ?').bind(shareId).run();
      } catch (error) {
        await db.prepare('UPDATE panorama_shares SET revoked_at = ? WHERE id = ?').bind(Date.now(), shareId).run();
        try { await storage.delete(`panorama:${shareId}`); await db.prepare('DELETE FROM panorama_shares WHERE id = ?').bind(shareId).run(); } catch { /* Retain capacity for unconfirmed physical cleanup. */ }
        throw error;
      }
      return json({ share: { id: shareId, title, width, height, allowDownload, listed, createdAt } }, 201);
    }
    if (id && !media && method === 'POST') {
      const row = await db.prepare('SELECT owner_id FROM panorama_shares WHERE id = ? AND revoked_at IS NULL AND ready = 1').bind(id).first();
      if (!row || row.owner_id !== user.id) return json({ error: 'Share not found' }, 404);
      const body = JSON.parse(new TextDecoder().decode(await readLimited(request, 1024)));
      if (body.action === 'revoke') {
        await db.prepare('UPDATE panorama_shares SET revoked_at = ? WHERE id = ? AND owner_id = ?').bind(Date.now(), id, user.id).run();
        // Revocation is enforced by D1 even while KV deletion propagates to other locations.
        try { await storage.delete(`panorama:${id}`); await db.prepare('UPDATE panorama_shares SET stored_bytes = 0 WHERE id = ?').bind(id).run(); } catch { /* Retain capacity for unconfirmed physical cleanup. */ }
        return json({ success: true });
      }
      const updates = [];
      if (typeof body.allowDownload === 'boolean') updates.push(['allow_download', body.allowDownload ? 1 : 0]);
      if (typeof body.listed === 'boolean') updates.push(['listed', body.listed ? 1 : 0]);
      if (!updates.length) return json({ error: 'Specify download permission, showcase listing, or revoke the link.' }, 400);
      for (const [column, value] of updates) await db.prepare(`UPDATE panorama_shares SET ${column} = ? WHERE id = ? AND owner_id = ?`).bind(value, id, user.id).run();
      return json({ success: true });
    }
    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    if (error instanceof RangeError) return json({ error: 'Share images up to 20 MB.' }, 413);
    if (error instanceof TypeError || error instanceof SyntaxError) return json({ error: 'Invalid share request. Use a complete 2:1 PNG or JPEG image.' }, 400);
    console.error('[panorama-share] storage operation failed');
    return json({ error: 'The panorama could not be saved. Please try again.' }, 503);
  }
}
