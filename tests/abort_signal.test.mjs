import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(fs.readFileSync(new URL('../src/utils/abortSignal.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS },
}).outputText;
function fallback() {
  const exports = {};
  vm.runInNewContext(code, { exports, AbortController, AbortSignal: {} });
  return exports.combineAbortSignals;
}

test('combined cancellation preserves first reason and detaches fallback listeners', () => {
  const combine = fallback();
  const a = new AbortController(), b = new AbortController();
  let removed = 0;
  for (const { signal } of [a, b]) {
    const remove = signal.removeEventListener.bind(signal);
    signal.removeEventListener = (...args) => { removed++; remove(...args); };
  }
  const combined = combine([a.signal, b.signal]);
  assert.equal(combined.aborted, false);
  const reason = new Error('cancelled');
  b.abort(reason);
  assert.equal(combined.aborted, true);
  assert.equal(combined.reason, reason);
  assert.equal(a.signal.aborted, false);
  assert.equal(removed, 2);
  a.abort(new Error('later'));
  assert.equal(combined.reason, reason);
});

test('already-aborted signals use iterable order and install no listeners', () => {
  const combine = fallback();
  const a = new AbortController(), b = new AbortController();
  b.abort('second'); a.abort('first');
  a.signal.addEventListener = () => assert.fail('No listener should be installed');
  assert.equal(combine([a.signal, b.signal]).reason, 'first');
  assert.equal(combine([]).aborted, false);
});
