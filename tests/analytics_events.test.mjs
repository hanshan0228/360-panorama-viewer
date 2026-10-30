import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const checkout = read('src/components/commercial/CheckoutModal.tsx');
const app = read('src/App.tsx');
const generator = read('src/components/GeneratorTab.tsx');
const compile = source => ts.transpile(source, { target: ts.ScriptTarget.ES2022 });

test('checkout records the offer only when an approval URL is ready', async () => {
  const handler = checkout.slice(checkout.indexOf('  const handleSubscribe ='), checkout.indexOf('  const handleRefresh ='));
  const run = async (overrides = {}) => {
    const events = [];
    const redirects = [];
    const requests = [];
    const session = { active: true, token: 'token' };
    const context = {
      needsSignIn: false, isProcessing: false, sessionRef: { current: session },
      isCurrentSession: () => true, setIsProcessing() {}, setError() {}, onSignIn() {},
      selectedPlan: 'enterprise', billingCycle: 'yearly', subscription: null,
      config: { plans: { enterprise: { yearly: { amountCents: 43210 } } } },
      paypalRequest: async (...args) => { requests.push(args); return { approvalUrl: 'https://www.paypal.com/approve' }; },
      window: { gtag: (...args) => events.push(args), location: { assign: url => redirects.push(url) } },
      URL, ...overrides,
    };
    await vm.runInNewContext(compile(`${handler}\nhandleSubscribe()`), context);
    return { events, redirects, requests };
  };
  const fresh = await run();
  assert.equal(fresh.requests.length, 1);
  assert.equal(fresh.events.length, 1);
  assert.equal(fresh.events[0][1], 'begin_checkout');
  assert.equal(fresh.events[0][2].value, 432.1);
  assert.equal(fresh.events[0][2].plan, 'enterprise');
  assert.equal(fresh.events[0][2].cycle, 'yearly');
  assert.equal(fresh.redirects.length, 1);
  const pending = await run({ subscription: { status: 'APPROVAL_PENDING', plan: 'pro', billingCycle: 'monthly', amountCents: 875 } });
  assert.equal(pending.events[0][2].value, 8.75);
  assert.equal(pending.events[0][2].plan, 'pro');
  const failed = await run({ paypalRequest: async () => { throw new Error('unavailable'); } });
  assert.equal(failed.events.length, 0);
  const invalid = await run({ paypalRequest: async () => ({ approvalUrl: 'https://example.com/' }) });
  assert.equal(invalid.events.length, 0);
  const guest = await run({ needsSignIn: true });
  assert.equal(guest.requests.length, 0);
  assert.equal(guest.events.length, 0);
  const analyticsFailure = await run({ window: { gtag: () => { throw new Error('blocked'); }, location: { assign: url => fresh.redirects.push(url) } } });
  assert.equal(analyticsFailure.requests.length, 1);
  assert.equal(fresh.redirects.length, 2);
  assert.equal(app.includes("'begin_checkout'"), false);
});

test('generation events distinguish met, below-request, and unverified resolution', () => {
  const start = generator.lastIndexOf("      if (typeof window !== 'undefined'", generator.indexOf("'generation_below_resolution'"));
  const end = generator.indexOf('\n\n      if (isCurrentGeneration()) setIsGenerating(false);', start);
  const code = compile(generator.slice(start, end));
  for (const [status, expected] of [['met', 'generation_success'], ['below-request', 'generation_below_resolution'], ['unverified', 'generation_resolution_unverified'], [undefined, 'generation_resolution_unverified']]) {
    const events = [];
    vm.runInNewContext(code, { window: { gtag: (...args) => events.push(args) }, resultResolution: status ? { status } : undefined, resolution: '4K', usedEndpointName: 'model' });
    assert.equal(events[0][1], expected);
    assert.equal(events[0][2].resolution_status, status ?? 'unverified');
  }
});

test('manual page view omits query and hash from both URL fields', () => {
  const start = app.lastIndexOf("    if (typeof window !== 'undefined'", app.indexOf("'page_view'"));
  const end = app.indexOf('\n  }, [activeTab, currentPath]);', start);
  const events = [];
  vm.runInNewContext(compile(app.slice(start, end)), {
    window: { gtag: (...args) => events.push(args), location: { origin: 'https://example.com', pathname: '/viewer/', search: '?secret=123', hash: '#verify-email=secret' } },
    document: { title: 'Viewer' },
  });
  assert.equal(events[0][2].page_location, 'https://example.com/viewer/');
  assert.equal(events[0][2].page_path, '/viewer/');
});
