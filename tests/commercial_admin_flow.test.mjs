import test from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage & sessionStorage in Node environment
const createStorageMock = () => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();

global.localStorage = localStorageMock;
global.sessionStorage = sessionStorageMock;

// Dynamically import adminStorage
const adminStorage = await import('../src/utils/adminStorage.ts');

test.beforeEach(() => {
  localStorageMock.clear();
  sessionStorageMock.clear();
});

test('adminStorage: default users and endpoints load correctly', () => {
  const users = adminStorage.getStoredManagedUsers();
  assert.equal(users.length, 5);
  assert.equal(users[0].name, 'Alex Vance');
  assert.equal(users[0].plan, 'pro');

  const endpoints = adminStorage.getStoredModelEndpoints();
  assert.equal(endpoints.length, 4);
  assert.equal(endpoints[0].isDefault, true);
});

test('adminStorage: getCurrentUser defaults to first user when none selected', () => {
  const user = adminStorage.getCurrentUser();
  assert.equal(user.id, 'usr_8801');
  assert.equal(user.name, 'Alex Vance');
});

test('adminStorage: setCurrentUserId switches the active user session', () => {
  adminStorage.setCurrentUserId('usr_8802');
  const user = adminStorage.getCurrentUser();
  assert.equal(user.id, 'usr_8802');
  assert.equal(user.name, 'Chen Lin');
  assert.equal(user.plan, 'enterprise');
});

test('adminStorage: deductCurrentUserCredits correctly deducts and prevents overdraft or suspended abuse', () => {
  // 1. Normal deduction for active user
  adminStorage.setCurrentUserId('usr_8804');
  let user = adminStorage.getCurrentUser();
  assert.equal(user.creditsBalance, 5);

  // Deduct 2 credits for 2K panorama
  const res1 = adminStorage.deductCurrentUserCredits(2);
  assert.equal(res1.success, true);
  assert.equal(res1.remaining, 3);

  user = adminStorage.getCurrentUser();
  assert.equal(user.creditsBalance, 3);
  assert.equal(user.apiCallsCount, 19);

  // 2. Try to deduct 4 credits (overdraft attempt)
  const res2 = adminStorage.deductCurrentUserCredits(4);
  assert.equal(res2.success, false);
  assert.equal(res2.remaining, 3);

  // Verify credits balance was untouched on failure
  user = adminStorage.getCurrentUser();
  assert.equal(user.creditsBalance, 3);

  // 3. Reject negative or invalid debit amounts
  const resNeg = adminStorage.deductCurrentUserCredits(-10);
  assert.equal(resNeg.success, false);
  assert.equal(adminStorage.getCurrentUser().creditsBalance, 3);

  // 4. Reject suspended accounts from deducting credits or generating
  adminStorage.setCurrentUserId('usr_8805'); // Abusive Bot (suspended)
  const suspendedUser = adminStorage.getCurrentUser();
  assert.equal(suspendedUser.status, 'suspended');
  const resSuspended = adminStorage.deductCurrentUserCredits(1);
  assert.equal(resSuspended.success, false);
});

test('adminStorage: processCheckoutSubscription upgrades user, generates subscription and invoice', () => {
  // Current user is Mike Ross (free user)
  adminStorage.setCurrentUserId('usr_8804');
  let user = adminStorage.getCurrentUser();
  assert.equal(user.plan, 'free');
  const initialBalance = user.creditsBalance;

  // Process checkout for Pro annual
  const { user: upgradedUser, subscription, invoice } = adminStorage.processCheckoutSubscription({
    plan: 'pro',
    billingCycle: 'yearly',
    amount: 118.8,
    paymentMethod: 'Credit Card (4242)',
  });

  // 1. Verify user was upgraded
  assert.equal(upgradedUser.plan, 'pro');
  assert.equal(upgradedUser.creditsBalance, initialBalance + 1000);

  // 2. Verify subscription was logged
  assert.equal(subscription.userId, 'usr_8804');
  assert.equal(subscription.plan, 'pro');
  assert.equal(subscription.billingCycle, 'yearly');
  assert.equal(subscription.amount, 118.8);
  assert.equal(subscription.status, 'active');

  // 3. Verify invoice was issued
  assert.equal(invoice.userId, 'usr_8804');
  assert.equal(invoice.amount, 118.8);
  assert.equal(invoice.status, 'paid');
  assert.equal(invoice.subscriptionId, subscription.id);

  // 4. Verify persistent lists in storage
  const subs = adminStorage.getStoredSubscriptions();
  const invs = adminStorage.getStoredInvoices();
  assert.ok(subs.some((s) => s.id === subscription.id));
  assert.ok(invs.some((i) => i.id === invoice.id));
});

test('adminStorage: getActiveModelEndpoint returns default enabled endpoint', () => {
  const active = adminStorage.getActiveModelEndpoint();
  assert.equal(active.id, 'gemini-imagen3');
  assert.equal(active.isDefault, true);
  assert.equal(active.isEnabled, true);

  // Change default to Flash image
  const endpoints = adminStorage.getStoredModelEndpoints();
  const next = endpoints.map((ep) => ({
    ...ep,
    isDefault: ep.id === 'gemini-flash-img',
  }));
  adminStorage.saveStoredModelEndpoints(next);

  const updatedActive = adminStorage.getActiveModelEndpoint();
  assert.equal(updatedActive.id, 'gemini-flash-img');
});

test('adminStorage: getStoredPaymentConfig leaves keys blank by default and saves properly', () => {
  const config = adminStorage.getStoredPaymentConfig();
  assert.equal(config.paypalClientId, '');
  assert.equal(config.paypalClientSecret, '');
  assert.equal(config.stripePublishableKey, '');
  assert.equal(config.stripeSecretKey, '');
  assert.equal(config.paypalMode, 'sandbox');

  // Save customized keys (and attempt to save sensitive secrets)
  adminStorage.saveStoredPaymentConfig({
    ...config,
    paypalClientId: 'test_paypal_client_id_888',
    paypalProMonthlyPlanId: 'P-123456789',
    stripePublishableKey: 'pk_test_stripe_abc',
    stripeSecretKey: 'sk_live_malicious_leak_attempt',
    stripeWebhookSecret: 'whsec_leak_attempt',
    paypalClientSecret: 'secret_leak_attempt',
  });

  const updated = adminStorage.getStoredPaymentConfig();
  assert.equal(updated.paypalClientId, 'test_paypal_client_id_888');
  assert.equal(updated.paypalProMonthlyPlanId, 'P-123456789');
  assert.equal(updated.stripePublishableKey, 'pk_test_stripe_abc');
  // 核心安全约束：私钥必须被强制清洗为空，严禁落盘
  assert.equal(updated.stripeSecretKey, '');
  assert.equal(updated.stripeWebhookSecret, '');
  assert.equal(updated.paypalClientSecret, '');

  const rawStorage = JSON.parse(localStorageMock.getItem('panorama_admin_payments_config'));
  assert.equal(rawStorage.stripeSecretKey, '');
  assert.equal(rawStorage.stripeWebhookSecret, '');
  assert.equal(rawStorage.paypalClientSecret, '');

  // 验证对遗留未脱敏数据的自动回写清理
  localStorageMock.setItem(
    'panorama_admin_payments_config',
    JSON.stringify({
      ...updated,
      stripeSecretKey: 'legacy_uncleaned_secret_in_storage',
    })
  );
  const readBack = adminStorage.getStoredPaymentConfig();
  assert.equal(readBack.stripeSecretKey, '');
  const storageAfterRead = JSON.parse(localStorageMock.getItem('panorama_admin_payments_config'));
  assert.equal(storageAfterRead.stripeSecretKey, '');
});

test('adminStorage: password verification, reset, and session authentication guard', () => {
  // 1. Initial default password check
  assert.equal(adminStorage.getStoredAdminPassword(), 'admin888');
  assert.equal(adminStorage.verifyAdminPassword('admin888'), true);
  assert.equal(adminStorage.verifyAdminPassword('wrong_password'), false);

  // 2. Session state is invalid by default
  assert.equal(adminStorage.isAdminSessionValid(), false);

  // 3. Authenticate session
  adminStorage.setAdminSession(true);
  assert.equal(adminStorage.isAdminSessionValid(), true);

  // 4. Invalidate session (Lock Console)
  adminStorage.setAdminSession(false);
  assert.equal(adminStorage.isAdminSessionValid(), false);

  // 5. Change password
  adminStorage.setStoredAdminPassword('mySecurePass999!');
  assert.equal(adminStorage.getStoredAdminPassword(), 'mySecurePass999!');
  assert.equal(adminStorage.verifyAdminPassword('mySecurePass999!'), true);
  assert.equal(adminStorage.verifyAdminPassword('admin888'), false);

  // 6. Dual credentials verification (Username + Password)
  assert.equal(adminStorage.getStoredAdminUsername(), 'admin');
  assert.equal(adminStorage.verifyAdminCredentials('admin', 'mySecurePass999!'), true);
  assert.equal(adminStorage.verifyAdminCredentials('wrong-user', 'mySecurePass999!'), false);
  assert.equal(adminStorage.verifyAdminCredentials('admin', 'wrong-pass'), false);
  adminStorage.setStoredAdminUsername('master_admin');
  assert.equal(adminStorage.getStoredAdminUsername(), 'master_admin');
  assert.equal(adminStorage.verifyAdminCredentials('master_admin', 'mySecurePass999!'), true);
  assert.equal(adminStorage.verifyAdminCredentials('admin', 'mySecurePass999!'), false);
});

test('adminStorage: model routing strategies (Single, Failover auto-switch, Round-Robin)', () => {
  // Ensure endpoints: imagen3, flash-img, fal-flux, openai-dalle3
  const endpoints = adminStorage.getStoredModelEndpoints();
  const next = endpoints.map((ep) => ({
    ...ep,
    isEnabled: true,
  }));
  adminStorage.saveStoredModelEndpoints(next);

  // 1. Single Model Mode: strictly honors primary model
  adminStorage.saveStoredRoutingConfig({
    mode: 'single',
    primaryEndpointId: 'gemini-imagen3',
    secondaryEndpointId: 'gemini-flash-img',
    roundRobinIndex: 0,
  });

  const singlePlan = adminStorage.getModelExecutionPipeline();
  assert.equal(singlePlan.mode, 'single');
  assert.equal(singlePlan.endpoints.length, 1);
  assert.equal(singlePlan.endpoints[0].id, 'gemini-imagen3');

  // Single Model Mode: when primary model is disabled, pipeline MUST be empty (no silent fallback!)
  const endpointsWithPrimaryDisabled = endpoints.map((ep) => ({
    ...ep,
    isEnabled: ep.id !== 'gemini-imagen3',
  }));
  adminStorage.saveStoredModelEndpoints(endpointsWithPrimaryDisabled);
  const singleDisabledPlan = adminStorage.getModelExecutionPipeline();
  assert.equal(singleDisabledPlan.endpoints.length, 0);

  // Restore all enabled
  adminStorage.saveStoredModelEndpoints(next);

  // 2. Failover Mode: strictly primary -> secondary -> tertiary (NEVER silently appends unselected endpoints)
  adminStorage.saveStoredRoutingConfig({
    mode: 'failover',
    primaryEndpointId: 'gemini-imagen3',
    secondaryEndpointId: 'gemini-flash-img',
    tertiaryEndpointId: 'fal-flux-schnell',
    roundRobinIndex: 0,
  });

  const failoverPlan = adminStorage.getModelExecutionPipeline();
  assert.equal(failoverPlan.mode, 'failover');
  assert.equal(failoverPlan.endpoints.length, 3);
  assert.equal(failoverPlan.endpoints[0].id, 'gemini-imagen3');
  assert.equal(failoverPlan.endpoints[1].id, 'gemini-flash-img');
  assert.equal(failoverPlan.endpoints[2].id, 'fal-flux-schnell');

  // Failover with no tertiary: MUST only contain 2 endpoints, never append openai-dalle3
  adminStorage.saveStoredRoutingConfig({
    mode: 'failover',
    primaryEndpointId: 'gemini-imagen3',
    secondaryEndpointId: 'gemini-flash-img',
    tertiaryEndpointId: '',
    roundRobinIndex: 0,
  });
  const failoverTwoEndpoints = adminStorage.getModelExecutionPipeline();
  assert.equal(failoverTwoEndpoints.endpoints.length, 2);
  assert.equal(failoverTwoEndpoints.endpoints[0].id, 'gemini-imagen3');
  assert.equal(failoverTwoEndpoints.endpoints[1].id, 'gemini-flash-img');

  // 3. All models disabled: pipeline MUST be empty, never silently return default
  adminStorage.saveStoredModelEndpoints(endpoints.map((ep) => ({ ...ep, isEnabled: false })));
  const allDisabledPlan = adminStorage.getModelExecutionPipeline();
  assert.equal(allDisabledPlan.endpoints.length, 0);
  assert.equal(adminStorage.getActiveModelEndpoint(), null);

  // Restore enabled for subsequent checks
  adminStorage.saveStoredModelEndpoints(next);

  // 4. Round-Robin Mode (Cycle rotation across requests)
  adminStorage.saveStoredRoutingConfig({
    mode: 'round-robin',
    primaryEndpointId: 'gemini-imagen3',
    secondaryEndpointId: 'gemini-flash-img',
    roundRobinIndex: 0,
  });

  const rr1 = adminStorage.getModelExecutionPipeline();
  assert.equal(rr1.mode, 'round-robin');
  assert.equal(rr1.endpoints[0].id, 'gemini-imagen3');

  const rr2 = adminStorage.getModelExecutionPipeline();
  assert.equal(rr2.endpoints[0].id, 'gemini-flash-img');
});



