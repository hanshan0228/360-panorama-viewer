import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { onRequest, __resetEdgeRateLimits } from '../functions/api/[[route]].ts';

function sqliteD1(database) {
  __resetEdgeRateLimits();
  return {
    prepare(sql) {
      let params = [];
      const statement = {
        sql,
        bind(...values) { params = values; return statement; },
        execute() { const result = database.prepare(sql).run(...params); return { success: true, meta: { changes: Number(result.changes) } }; },
        async run() { return statement.execute(); },
        async first() { return database.prepare(sql).get(...params) || null; },
        async all() { return { results: database.prepare(sql).all(...params) }; },
      };
      return statement;
    },
    async batch(statements) {
      database.exec('BEGIN');
      try { const results = statements.map(statement => statement.execute()); database.exec('COMMIT'); return results; }
      catch (error) { database.exec('ROLLBACK'); throw error; }
    },
  };
}

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function fixture(testContext) {
  const database = new DatabaseSync(':memory:');
  const db = sqliteD1(database);
  const env = { DB: db, GENERATION_ENABLED: 'true', FREE_TRIAL_ENABLED: 'true' };
  let modelFails = false;
  testContext.after(() => database.close());
  testContext.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://models.example', 'Tests may only use the mocked model endpoint');
    if (modelFails) return new Response('boom', { status: 500 });
    return Response.json({ data: [{ b64_json: PNG }] });
  });
  const call = async (ip, body) => {
    const response = await onRequest({
      request: new Request('https://review.example/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
        body: JSON.stringify(body),
      }),
      env,
    });
    return { status: response.status, data: await response.json() };
  };
  const counters = () => database.prepare('SELECT key, used FROM risk_counters ORDER BY key').all();
  return {
    database, call, counters,
    failModel() { modelFails = true; },
    async warm() {
      const response = await call('203.0.113.1', { prompt: 'warm up' });
      assert.equal(response.status, 503);
      assert.match(response.data.error, /No image model/);
      assert.equal(counters().length, 0, 'a missing model must not consume any preview allowance');
      database.prepare("INSERT INTO admin_config (key, value) VALUES ('models_config', ?)").run(JSON.stringify([
        { id: 'ep1', name: 'Mock', baseUrl: 'https://models.example/v1', apiKey: 'k', model: 'gpt-image-2', isEnabled: true, isDefault: true },
      ]));
    },
  };
}

test('anonymous preview: one 1K image per network, no credits or accounts touched', async testContext => {
  const api = fixture(testContext);
  await api.warm();
  const first = await api.call('203.0.113.7', { prompt: 'a quiet beach at sunset' });
  assert.equal(first.status, 200);
  assert.equal(first.data.success, true);
  assert.equal(first.data.preview, true);
  assert.equal(first.data.resolution, '1K');
  assert.match(first.data.imageUrl, /^data:image\/png;base64,/);
  assert.equal(api.database.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0);

  const repeat = await api.call('203.0.113.7', { prompt: 'a quiet beach at sunset' });
  assert.equal(repeat.status, 429);
  assert.equal(repeat.data.code, 'PREVIEW_USED');

  const otherNetwork = await api.call('198.51.100.9', { prompt: 'a snowy mountain ridge' });
  assert.equal(otherNetwork.status, 200);
  assert.equal(otherNetwork.data.success, true);
});

test('anonymous preview: rejects bad input before spending the allowance', async testContext => {
  const api = fixture(testContext);
  await api.warm();
  assert.equal((await api.call('203.0.113.7', { prompt: '' })).status, 400);
  assert.equal((await api.call('203.0.113.7', { prompt: 'x', referenceImages: ['https://example.com/a.png'] })).status, 400);
  assert.equal(api.counters().filter(row => row.key.startsWith('preview-')).length, 0);

  const ok = await api.call('203.0.113.7', { prompt: 'a quiet beach at sunset' });
  assert.equal(ok.status, 200);
});

test('anonymous preview: upstream failure keeps the allowance closed', async testContext => {
  const api = fixture(testContext);
  await api.warm();
  api.failModel();
  const failed = await api.call('203.0.113.7', { prompt: 'a quiet beach at sunset' });
  assert.equal(failed.status, 502);
  const retry = await api.call('203.0.113.7', { prompt: 'a quiet beach at sunset' });
  assert.equal(retry.status, 429);
  assert.equal(retry.data.code, 'PREVIEW_USED');
});
