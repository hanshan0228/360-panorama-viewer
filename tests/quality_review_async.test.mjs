import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  enqueueQualityReview,
  getQualityReview,
  initQualityReviewSchema,
  processQualityReviewBatch,
  qualityReviewReservationStatement,
  saveQualityReviewPayload,
  settleQualityReview,
} from '../server/qualityReview.mjs';

const candidate = 'data:image/png;base64,AA==';
const reference = 'data:image/jpeg;base64,AQI=';
const remoteCandidate = 'https://images.example.test/panorama.png';

function sqliteD1(database) {
  return {
    prepare(sql) {
      let parameters = [];
      const statement = {
        bind(...values) { parameters = values; return statement; },
        async run() {
          const result = database.prepare(sql).run(...parameters);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
        async first() { return database.prepare(sql).get(...parameters) ?? null; },
        async all() { return { results: database.prepare(sql).all(...parameters) }; },
      };
      return statement;
    },
    async batch(statements) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  };
}

function kvFixture() {
  const values = new Map();
  return {
    values,
    async put(key, value) { values.set(key, String(value)); },
    async get(key) { return values.get(key) ?? null; },
    async delete(key) { values.delete(key); },
  };
}

async function fixture({ credits = 4 } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      credits_balance INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TABLE user_sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE admin_config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO users (id,email,credits_balance,status) VALUES ('owner','owner@example.test',${credits},'active');
    INSERT INTO users (id,email,credits_balance,status) VALUES ('other','other@example.test',0,'active');
    INSERT INTO user_sessions (token,user_id,expires_at) VALUES ('owner-token','owner',9999999999999);
    INSERT INTO user_sessions (token,user_id,expires_at) VALUES ('other-token','other',9999999999999);
  `);
  const db = sqliteD1(sqlite);
  await initQualityReviewSchema(db);
  const endpoints = [{
    id: 'image-endpoint',
    baseUrl: 'https://review.example/v1',
    apiKey: 'synthetic-review-key',
    isEnabled: true,
  }];
  sqlite.prepare("INSERT INTO admin_config (key,value) VALUES ('models_config',?)")
    .run(JSON.stringify({ endpoints }));
  return {
    sqlite,
    db,
    storage: kvFixture(),
    env: {},
    close: () => sqlite.close(),
  };
}

async function reserveAndQueue(state, id, now = 0, candidateImage = candidate) {
  const writes = await state.db.batch([
    state.db.prepare(`UPDATE users SET credits_balance = credits_balance - 4
      WHERE id = 'owner' AND status = 'active' AND credits_balance >= 4`),
    qualityReviewReservationStatement(state.db, {
      id,
      ownerId: 'owner',
      endpointId: 'image-endpoint',
      prompt: 'Synthetic panorama',
      cost: 4,
      now,
    }),
  ]);
  assert.equal(writes[0].meta.changes, 1);
  assert.equal(writes[1].meta.changes, 1);
  const payload = await saveQualityReviewPayload(state.storage, {
    id,
    imageUrl: candidateImage,
    referenceImages: [reference],
  });
  assert.equal(await enqueueQualityReview(state.db, { id, ...payload, now }), true);
  return payload;
}

test('async review is queued durably, processes immediately and returns an owner-only status', async t => {
  const state = await fixture();
  t.after(state.close);
  const id = 'a'.repeat(32);
  const payload = await reserveAndQueue(state, id, 1000);
  assert.equal(state.sqlite.prepare("SELECT credits_balance FROM users WHERE id='owner'").get().credits_balance, 0);

  const request = new Request(`https://review.example/api/quality-reviews/${id}`, {
    headers: { Authorization: 'Bearer owner-token' },
  });
  const pending = await getQualityReview({ db: state.db, request, now: 1000 });
  assert.equal(pending.status, 200);
  assert.equal(pending.qualityReview.status, 'pending');
  assert.equal(pending.qualityReview.creditsRefunded, 0);

  const results = await processQualityReviewBatch({
    db: state.db,
    storage: state.storage,
    env: state.env,
    now: 1000,
    review: async input => {
      assert.equal(input.imageUrl, candidate);
      assert.deepEqual(input.referenceImages, [reference]);
      assert.equal(input.prompt, 'Synthetic panorama');
      return { status: 'passed', issues: [], explanation: 'Coherent.', reviewModel: 'synthetic-reviewer' };
    },
  });
  assert.deepEqual(results, [{ id, status: 'passed' }]);
  assert.equal(state.sqlite.prepare("SELECT credits_balance FROM users WHERE id='owner'").get().credits_balance, 0);
  assert.equal(state.sqlite.prepare('SELECT status,refunded FROM panorama_quality_reviews WHERE id=?').get(id).status, 'passed');
  assert.equal(payload.keys.some(key => state.storage.values.has(key)), false);

  const otherRequest = new Request(`https://review.example/api/quality-reviews/${id}`, {
    headers: { Authorization: 'Bearer other-token' },
  });
  assert.deepEqual(await getQualityReview({ db: state.db, request: otherRequest, now: 1000 }), {
    error: 'Quality review not found.',
    status: 404,
  });
  assert.equal((await getQualityReview({
    db: state.db,
    request: new Request(`https://review.example/api/quality-reviews/${id}`),
    now: 1000,
  })).status, 401);
});

test('remote image URLs remain reviewable without downloading them in the Pages request', async t => {
  const state = await fixture();
  t.after(state.close);
  const id = 'f'.repeat(32);
  await reserveAndQueue(state, id, 1000, remoteCandidate);
  const results = await processQualityReviewBatch({
    db: state.db,
    storage: state.storage,
    env: state.env,
    now: 1000,
    review: async input => {
      assert.equal(input.imageUrl, remoteCandidate);
      return { status: 'passed', issues: [], explanation: 'Coherent.', reviewModel: 'synthetic-reviewer' };
    },
  });
  assert.deepEqual(results, [{ id, status: 'passed' }]);
  assert.equal(state.sqlite.prepare("SELECT status FROM panorama_quality_reviews WHERE id=?").get(id).status, 'passed');
});

test('failed review refunds exactly once even when settlement is repeated', async t => {
  const state = await fixture();
  t.after(state.close);
  const id = 'b'.repeat(32);
  await reserveAndQueue(state, id);
  await processQualityReviewBatch({
    db: state.db,
    storage: state.storage,
    now: 1000,
    review: async () => ({
      status: 'failed',
      issues: ['collage'],
      explanation: 'Stacked horizon.',
      reviewModel: 'synthetic-reviewer',
    }),
  });
  assert.equal(state.sqlite.prepare("SELECT credits_balance FROM users WHERE id='owner'").get().credits_balance, 4);
  await settleQualityReview(state.db, id, {
    status: 'failed',
    issues: ['collage'],
    explanation: 'Duplicate delivery.',
  });
  assert.equal(state.sqlite.prepare("SELECT credits_balance FROM users WHERE id='owner'").get().credits_balance, 4);
  assert.equal(state.sqlite.prepare('SELECT refunded FROM panorama_quality_reviews WHERE id=?').get(id).refunded, 1);
});

test('three unavailable review attempts retry with backoff and refund once', async t => {
  const state = await fixture();
  t.after(state.close);
  const id = 'c'.repeat(32);
  await reserveAndQueue(state, id);
  let calls = 0;
  const process = now => processQualityReviewBatch({
    db: state.db,
    storage: state.storage,
    now,
    review: async () => {
      calls++;
      return { status: 'unavailable', issues: [], reviewModel: 'unavailable' };
    },
  });
  assert.deepEqual(await process(1000), [{ id, status: 'queued' }]);
  assert.equal(state.sqlite.prepare("SELECT credits_balance FROM users WHERE id='owner'").get().credits_balance, 0);
  assert.deepEqual(await process(120999), []);
  assert.deepEqual(await process(121000), [{ id, status: 'queued' }]);
  assert.deepEqual(await process(721000), [{ id, status: 'unavailable' }]);
  assert.equal(calls, 3);
  assert.equal(state.sqlite.prepare("SELECT credits_balance FROM users WHERE id='owner'").get().credits_balance, 4);
  assert.deepEqual(await process(2000000), []);
  assert.equal(state.sqlite.prepare("SELECT credits_balance FROM users WHERE id='owner'").get().credits_balance, 4);
});

test('stale generating and expired reviewing jobs recover without leaving a charge', async t => {
  const state = await fixture({ credits: 8 });
  t.after(state.close);
  const staleId = 'd'.repeat(32);
  const staleWrites = await state.db.batch([
    state.db.prepare("UPDATE users SET credits_balance = credits_balance - 4 WHERE id='owner'"),
    qualityReviewReservationStatement(state.db, {
      id: staleId,
      ownerId: 'owner',
      endpointId: 'image-endpoint',
      prompt: 'Stale generation',
      cost: 4,
      now: 0,
    }),
  ]);
  assert.equal(staleWrites[1].meta.changes, 1);

  const reviewingId = 'e'.repeat(32);
  await reserveAndQueue(state, reviewingId, 900000);
  state.sqlite.prepare(`UPDATE panorama_quality_reviews
    SET status='reviewing',review_attempts=1,lease_until=901000 WHERE id=?`).run(reviewingId);

  const results = await processQualityReviewBatch({
    db: state.db,
    storage: state.storage,
    now: 1_800_000,
    review: async () => ({ status: 'passed', issues: [], reviewModel: 'synthetic-reviewer' }),
  });
  assert.deepEqual(results, [{ id: reviewingId, status: 'passed' }]);
  assert.equal(state.sqlite.prepare('SELECT status,refunded FROM panorama_quality_reviews WHERE id=?').get(staleId).status, 'unavailable');
  assert.equal(state.sqlite.prepare('SELECT status FROM panorama_quality_reviews WHERE id=?').get(reviewingId).status, 'passed');
  assert.equal(state.sqlite.prepare("SELECT credits_balance FROM users WHERE id='owner'").get().credits_balance, 4);
});
