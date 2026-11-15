import { reviewPanorama, DEFAULT_PANORAMA_REVIEW_MODEL } from './panoramaQuality.mjs';

const CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_IMAGE_DATA_URL = 64 * 1024 * 1024;
const MAX_REMOTE_IMAGE_URL = 8192;
const MAX_REVIEW_ATTEMPTS = 3;
const REVIEW_LEASE_MS = 2 * 60 * 1000;
const STALE_GENERATION_MS = 15 * 60 * 1000;
const RETRY_DELAYS_MS = [2 * 60 * 1000, 10 * 60 * 1000];

export const qualityReviewSchema = [
  `CREATE TABLE IF NOT EXISTS panorama_quality_reviews (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    endpoint_id TEXT NOT NULL,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'generating',
    cost INTEGER NOT NULL,
    issues TEXT NOT NULL DEFAULT '[]',
    explanation TEXT NOT NULL DEFAULT '',
    review_model TEXT NOT NULL DEFAULT '',
    review_attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL,
    lease_until INTEGER,
    payload_ready INTEGER NOT NULL DEFAULT 0,
    candidate_mime TEXT NOT NULL DEFAULT '',
    candidate_parts INTEGER NOT NULL DEFAULT 0,
    reference_parts TEXT NOT NULL DEFAULT '[]',
    refunded INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS panorama_quality_reviews_due
    ON panorama_quality_reviews(status, next_attempt_at)`,
  `CREATE INDEX IF NOT EXISTS panorama_quality_reviews_owner
    ON panorama_quality_reviews(owner_id, created_at)`,
];

export async function initQualityReviewSchema(db) {
  await db.batch(qualityReviewSchema.map(sql => db.prepare(sql)));
}

export function qualityReviewReservationStatement(db, { id, ownerId, endpointId, prompt, cost, now }) {
  // `changes()` refers to the immediately preceding credit debit in the same D1 transaction.
  return db.prepare(`INSERT INTO panorama_quality_reviews
    (id,owner_id,endpoint_id,prompt,status,cost,next_attempt_at,created_at,updated_at)
    SELECT ?,?,?,?, 'generating', ?,?,?,?
    WHERE changes() = 1`)
    .bind(id, ownerId, endpointId, String(prompt).slice(0, 10000), cost, now, now, now);
}

function imageData(value) {
  if (typeof value !== 'string' || value.length > MAX_IMAGE_DATA_URL) return null;
  const match = value.match(/^data:(image\/(?:png|jpeg|webp|gif|heic|heif));base64,([A-Za-z0-9+/]+={0,2})$/);
  return match?.[2] && match[2].length % 4 === 0 ? { mime: match[1], data: match[2] } : null;
}

function candidateImage(value) {
  const inline = imageData(value);
  if (inline) return inline;
  if (typeof value !== 'string' || value.length > MAX_REMOTE_IMAGE_URL) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? { mime: 'remote', data: value }
      : null;
  } catch {
    return null;
  }
}

async function writeParts(storage, prefix, encoded) {
  const parts = Math.ceil(encoded.length / CHUNK_SIZE);
  const keys = [];
  try {
    for (let index = 0; index < parts; index++) {
      const key = `${prefix}:${index}`;
      keys.push(key);
      await storage.put(key, encoded.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE));
    }
    return parts;
  } catch (error) {
    await Promise.allSettled(keys.map(key => storage.delete(key)));
    throw error;
  }
}

export async function saveQualityReviewPayload(storage, { id, imageUrl, referenceImages = [] }) {
  if (!storage || typeof id !== 'string' || !Array.isArray(referenceImages) || referenceImages.length > 3) {
    throw new Error('Invalid quality review payload');
  }
  const candidate = candidateImage(imageUrl);
  if (!candidate) throw new Error('Invalid quality review image');
  const written = [];
  try {
    const candidateParts = await writeParts(storage, `quality-review:${id}:candidate`, candidate.data);
    written.push(...Array.from({ length: candidateParts }, (_, index) => `quality-review:${id}:candidate:${index}`));
    const references = [];
    for (const [index, reference] of referenceImages.entries()) {
      const image = imageData(reference);
      if (!image) throw new Error('Invalid quality review reference');
      const parts = await writeParts(storage, `quality-review:${id}:reference:${index}`, image.data);
      written.push(...Array.from({ length: parts }, (_, part) => `quality-review:${id}:reference:${index}:${part}`));
      references.push({ mime: image.mime, parts });
    }
    return { candidateMime: candidate.mime, candidateParts, referenceParts: references, keys: written };
  } catch (error) {
    await Promise.allSettled(written.map(key => storage.delete(key)));
    throw error;
  }
}

export async function deleteQualityReviewPayload(storage, keys) {
  if (!storage || !Array.isArray(keys)) return;
  await Promise.allSettled(keys.map(key => storage.delete(key)));
}

export async function enqueueQualityReview(db, {
  id, candidateMime, candidateParts, referenceParts, now = Date.now(),
}) {
  const result = await db.prepare(`UPDATE panorama_quality_reviews SET
    status = 'queued', payload_ready = 1, candidate_mime = ?, candidate_parts = ?,
    reference_parts = ?, next_attempt_at = ?, updated_at = ?
    WHERE id = ? AND status = 'generating'`)
    .bind(candidateMime, candidateParts, JSON.stringify(referenceParts), now, now, id).run();
  return result.meta.changes > 0;
}

async function settle(db, id, {
  status, issues = [], explanation = '', reviewModel = '', now = Date.now(),
}) {
  if (!['passed', 'failed', 'unavailable'].includes(status)) throw new Error('Invalid terminal review status');
  const writes = [];
  if (status !== 'passed') {
    writes.push(db.prepare(`UPDATE users SET credits_balance = credits_balance +
      (SELECT cost FROM panorama_quality_reviews WHERE id = ? AND refunded = 0
        AND status IN ('generating','queued','reviewing'))
      WHERE id = (SELECT owner_id FROM panorama_quality_reviews WHERE id = ? AND refunded = 0
        AND status IN ('generating','queued','reviewing'))`).bind(id, id));
  }
  writes.push(db.prepare(`UPDATE panorama_quality_reviews SET
    status = ?, issues = ?, explanation = ?, review_model = ?, completed_at = ?, updated_at = ?,
    lease_until = NULL, refunded = CASE WHEN ? = 'passed' THEN refunded ELSE 1 END
    WHERE id = ? AND status IN ('generating','queued','reviewing')`)
    .bind(status, JSON.stringify([...new Set(issues)].slice(0, 8)), String(explanation).slice(0, 1000),
      String(reviewModel).slice(0, 128), now, now, status, id));
  await db.batch(writes);
  return db.prepare('SELECT * FROM panorama_quality_reviews WHERE id = ?').bind(id).first();
}

export async function settleQualityReview(db, id, outcome) {
  return settle(db, id, outcome);
}

async function removePayload(storage, id, row) {
  let references = [];
  try { references = JSON.parse(row.reference_parts || '[]'); } catch {}
  const keys = [
    ...Array.from({ length: Number(row.candidate_parts) || 0 }, (_, index) => `quality-review:${id}:candidate:${index}`),
    ...(Array.isArray(references) ? references.flatMap((reference, index) =>
      Array.from({ length: Number(reference?.parts) || 0 }, (_, part) => `quality-review:${id}:reference:${index}:${part}`)) : []),
  ];
  await deleteQualityReviewPayload(storage, keys);
}

async function loadEncoded(storage, prefix, parts) {
  let data = '';
  for (let index = 0; index < parts; index++) {
    const part = await storage.get(`${prefix}:${index}`, 'text');
    if (typeof part !== 'string') throw new Error('Quality review payload is incomplete');
    data += part;
  }
  return data;
}

async function loadDataUrl(storage, prefix, mime, parts) {
  const data = await loadEncoded(storage, prefix, parts);
  return `data:${mime};base64,${data}`;
}

async function loadPayload(storage, row) {
  let references = [];
  try { references = JSON.parse(row.reference_parts || '[]'); } catch { throw new Error('Invalid review references'); }
  if (!Array.isArray(references)) throw new Error('Invalid review references');
  const candidate = row.candidate_mime === 'remote'
    ? await loadEncoded(storage, `quality-review:${row.id}:candidate`, Number(row.candidate_parts))
    : await loadDataUrl(storage, `quality-review:${row.id}:candidate`, row.candidate_mime, Number(row.candidate_parts));
  if (candidateImage(candidate)?.mime !== (row.candidate_mime === 'remote' ? 'remote' : row.candidate_mime)) {
    throw new Error('Invalid review image');
  }
  return {
    imageUrl: candidate,
    referenceImages: await Promise.all(references.map((reference, index) =>
      loadDataUrl(storage, `quality-review:${row.id}:reference:${index}`, reference.mime, Number(reference.parts)))),
  };
}

async function claimReview(db, id, now) {
  const result = await db.prepare(`UPDATE panorama_quality_reviews SET
    status = 'reviewing', review_attempts = review_attempts + 1, lease_until = ?, updated_at = ?
    WHERE id = ? AND status = 'queued' AND next_attempt_at <= ?`)
    .bind(now + REVIEW_LEASE_MS, now, id, now).run();
  return result.meta.changes ? db.prepare('SELECT * FROM panorama_quality_reviews WHERE id = ?').bind(id).first() : null;
}

async function retryOrSettle(db, row, outcome, now) {
  if (outcome.status === 'unavailable' && row.review_attempts < MAX_REVIEW_ATTEMPTS) {
    const delay = RETRY_DELAYS_MS[Math.min(row.review_attempts - 1, RETRY_DELAYS_MS.length - 1)];
    await db.prepare(`UPDATE panorama_quality_reviews SET status = 'queued', next_attempt_at = ?,
      lease_until = NULL, issues = ?, explanation = ?, review_model = ?, updated_at = ?
      WHERE id = ? AND status = 'reviewing'`)
      .bind(now + delay, JSON.stringify(outcome.issues || []), String(outcome.explanation || '').slice(0, 1000),
        String(outcome.reviewModel || '').slice(0, 128), now, row.id).run();
    return 'queued';
  }
  const final = await settle(db, row.id, outcome);
  return final?.status || outcome.status;
}

async function reviewEndpoint(db, endpointId, env) {
  let endpoint = null;
  try {
    const config = await db.prepare('SELECT value FROM admin_config WHERE key = ?').bind('models_config').first();
    const parsed = config?.value ? JSON.parse(config.value) : null;
    const endpoints = Array.isArray(parsed) ? parsed : parsed?.endpoints || [];
    endpoint = endpoints.find(item => item.id === endpointId) || endpoints.find(item => item.isEnabled) || null;
  } catch {}
  if (!endpoint && !env.PANORAMA_REVIEW_BASE_URL) return null;
  return {
    ...(endpoint || {}),
    baseUrl: env.PANORAMA_REVIEW_BASE_URL || endpoint?.baseUrl,
    apiKey: env.PANORAMA_REVIEW_API_KEY || endpoint?.apiKey || '',
  };
}

async function reconcile(db, now) {
  const staleRows = await db.prepare(`SELECT * FROM panorama_quality_reviews
    WHERE status = 'generating' AND created_at <= ? LIMIT 20`).bind(now - STALE_GENERATION_MS).all();
  for (const row of staleRows.results || []) {
    await settle(db, row.id, {
      status: 'unavailable', explanation: 'Generation ended before the quality review could be queued.',
      reviewModel: 'skipped', now,
    });
  }
  await db.prepare(`UPDATE panorama_quality_reviews SET status = 'queued', lease_until = NULL, updated_at = ?
    WHERE status = 'reviewing' AND lease_until <= ?`).bind(now, now).run();
}

export async function processQualityReviewBatch({
  db, storage, env = {}, limit = 2, now = Date.now(), review = reviewPanorama, fetchImpl = globalThis.fetch,
}) {
  if (!db || !storage) throw new Error('Quality review storage is unavailable');
  await initQualityReviewSchema(db);
  await reconcile(db, now);
  const due = await db.prepare(`SELECT id FROM panorama_quality_reviews
    WHERE status = 'queued' AND next_attempt_at <= ? ORDER BY next_attempt_at LIMIT ?`)
    .bind(now, Math.max(1, Math.min(Number(limit) || 1, 10))).all();
  const results = [];
  for (const candidate of due.results || []) {
    const row = await claimReview(db, candidate.id, now);
    if (!row) continue;
    let outcome;
    try {
      const endpoint = await reviewEndpoint(db, row.endpoint_id, env);
      if (!endpoint) throw new Error('Review endpoint is unavailable');
      const payload = await loadPayload(storage, row);
      outcome = await review({
        endpoint,
        model: env.PANORAMA_REVIEW_MODEL || DEFAULT_PANORAMA_REVIEW_MODEL,
        prompt: row.prompt,
        ...payload,
        fetch: fetchImpl,
      });
    } catch {
      outcome = { status: 'unavailable', issues: [], explanation: 'The quality review service is unavailable.', reviewModel: 'unavailable' };
    }
    const finalStatus = await retryOrSettle(db, row, outcome, now);
    results.push({ id: row.id, status: finalStatus });
    if (['passed', 'failed', 'unavailable'].includes(finalStatus)) await removePayload(storage, row.id, row);
  }
  return results;
}

export async function getQualityReview({ db, request, now = Date.now() }) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const session = token ? await db.prepare(`SELECT user_id FROM user_sessions
    WHERE token = ? AND expires_at > ?`).bind(token, now).first() : null;
  if (!session) return { error: 'Sign in to view this quality review.', status: 401 };
  const path = new URL(request.url).pathname;
  const id = path.match(/^\/api\/quality-reviews\/([a-f0-9]{32})$/)?.[1];
  if (!id) return { error: 'Quality review not found.', status: 404 };
  const row = await db.prepare(`SELECT id,status,issues,explanation,review_model,review_attempts,refunded,cost
    FROM panorama_quality_reviews WHERE id = ? AND owner_id = ?`).bind(id, session.user_id).first();
  if (!row) return { error: 'Quality review not found.', status: 404 };
  let issues = [];
  try { issues = JSON.parse(row.issues || '[]'); } catch {}
  return {
    status: 200,
    qualityReview: {
      id: row.id,
      status: row.status === 'generating' || row.status === 'queued' || row.status === 'reviewing' ? 'pending' : row.status,
      issues: Array.isArray(issues) ? issues : [],
      explanation: row.explanation,
      reviewModel: row.review_model,
      attempts: row.review_attempts,
      creditsRefunded: row.refunded ? row.cost : 0,
    },
  };
}
