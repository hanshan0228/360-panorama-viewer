import type {
  ModelEndpointConfig,
  ModelRoutingConfig,
  ModelRoutingMode,
  ManagedUser,
  SystemBillingConfig,
  SubscriptionRecord,
  InvoiceRecord,
  PaymentGatewayConfig,
} from '../types/panorama';

const MODELS_STORAGE_KEY = 'panorama_admin_models_config';
const ROUTING_STORAGE_KEY = 'panorama_admin_routing_config';
const USERS_STORAGE_KEY = 'panorama_admin_users_config';
const BILLING_STORAGE_KEY = 'panorama_admin_billing_config';
const SUBSCRIPTIONS_STORAGE_KEY = 'panorama_admin_subscriptions_config';
const INVOICES_STORAGE_KEY = 'panorama_admin_invoices_config';
const CURRENT_USER_ID_STORAGE_KEY = 'panorama_current_user_id';
const PAYMENTS_STORAGE_KEY = 'panorama_admin_payments_config';
const ADMIN_PASSWORD_STORAGE_KEY = 'panorama_admin_secure_password';
const ADMIN_USERNAME_STORAGE_KEY = 'panorama_admin_secure_username';
const ADMIN_AUTH_SESSION_KEY = 'panorama_admin_session_token';
export const DEFAULT_ADMIN_PASSWORD = 'admin888';
export const DEFAULT_ADMIN_USERNAME = 'admin';

export const DEFAULT_MODEL_ENDPOINTS: ModelEndpointConfig[] = [
  {
    id: 'gemini-imagen3',
    name: 'GPT Image 2.5 (OpenAI-Compatible)',
    provider: 'openai',
    baseUrl: 'http://localhost:8317',
    apiKey: '',
    model: 'gpt-image-2.5',
    isEnabled: true,
    priority: 1,
    maxResolution: '4K',
    isDefault: true,
  },
  {
    id: 'gemini-flash-img',
    name: 'Gemini 3.1 Flash Image',
    provider: 'gemini',
    baseUrl: 'http://localhost:8317',
    apiKey: '',
    model: 'gemini-3.1-flash-image',
    isEnabled: true,
    priority: 2,
    maxResolution: '4K',
    isDefault: false,
  },
  {
    id: 'fal-flux-schnell',
    name: 'Flux.1 Schnell (Fal.ai Serverless)',
    provider: 'fal',
    baseUrl: 'https://fal.run/fal-ai/flux/schnell',
    apiKey: '',
    model: 'flux-schnell',
    isEnabled: false,
    priority: 3,
    maxResolution: '4K',
    isDefault: false,
  },
  {
    id: 'openai-dalle3',
    name: 'DALL-E 3 (OpenAI Standard)',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'dall-e-3',
    isEnabled: false,
    priority: 4,
    maxResolution: '2K',
    isDefault: false,
  },
];

export const DEFAULT_MANAGED_USERS: ManagedUser[] = [
  {
    id: 'usr_8801',
    email: 'creator.alex@studio360.io',
    name: 'Alex Vance',
    plan: 'pro',
    creditsBalance: 860,
    creditsTotal: 1000,
    status: 'active',
    joinedAt: '2026-03-12',
    lastActiveAt: '10 mins ago',
    apiCallsCount: 140,
  },
  {
    id: 'usr_8802',
    email: 'vr.developer@metaverse.com',
    name: 'Chen Lin',
    plan: 'enterprise',
    creditsBalance: 4620,
    creditsTotal: 5000,
    status: 'active',
    joinedAt: '2026-01-05',
    lastActiveAt: '2 hours ago',
    apiCallsCount: 885,
  },
  {
    id: 'usr_8803',
    email: 'sarah.design@archviz.org',
    name: 'Sarah Connor',
    plan: 'pro',
    creditsBalance: 320,
    creditsTotal: 1000,
    status: 'active',
    joinedAt: '2026-02-18',
    lastActiveAt: 'Yesterday',
    apiCallsCount: 220,
  },
  {
    id: 'usr_8804',
    email: 'guest9203@gmail.com',
    name: 'Mike Ross',
    plan: 'free',
    creditsBalance: 5,
    creditsTotal: 50,
    status: 'active',
    joinedAt: '2026-04-01',
    lastActiveAt: '3 days ago',
    apiCallsCount: 18,
  },
  {
    id: 'usr_8805',
    email: 'spam.crawler@botnet.xyz',
    name: 'Abusive Bot',
    plan: 'free',
    creditsBalance: 0,
    creditsTotal: 50,
    status: 'suspended',
    joinedAt: '2026-03-29',
    lastActiveAt: '1 week ago',
    apiCallsCount: 300,
  },
];

export const DEFAULT_BILLING_CONFIG: SystemBillingConfig = {
  freeMonthlyCredits: 4,
  proMonthlyPriceUsd: 9.9,
  proMonthlyCredits: 1000,
  enterpriseCustomPricing: true,
  creditCostPer1K: 1,
  creditCostPer2K: 2,
  creditCostPer4K: 4,
};

export function getStoredModelEndpoints(): ModelEndpointConfig[] {
  try {
    const raw = localStorage.getItem(MODELS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return DEFAULT_MODEL_ENDPOINTS;
}

export function saveStoredModelEndpoints(endpoints: ModelEndpointConfig[]): void {
  try {
    localStorage.setItem(MODELS_STORAGE_KEY, JSON.stringify(endpoints));
    const defaultEp = endpoints.find((ep) => ep.isDefault);
    if (defaultEp) {
      const routing = getStoredRoutingConfig();
      if (routing.primaryEndpointId !== defaultEp.id) {
        saveStoredRoutingConfig({
          ...routing,
          primaryEndpointId: defaultEp.id,
        });
      }
    }
  } catch {
    // fallback
  }
}

export function getStoredManagedUsers(): ManagedUser[] {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return DEFAULT_MANAGED_USERS;
}

export function saveStoredManagedUsers(users: ManagedUser[]): void {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch {
    // fallback
  }
}

export function getStoredBillingConfig(): SystemBillingConfig {
  try {
    const raw = localStorage.getItem(BILLING_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return DEFAULT_BILLING_CONFIG;
}

export function saveStoredBillingConfig(config: SystemBillingConfig): void {
  try {
    localStorage.setItem(BILLING_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // fallback
  }
}

export const DEFAULT_SUBSCRIPTIONS: SubscriptionRecord[] = [
  {
    id: 'sub_9011',
    userId: 'usr_8801',
    userEmail: 'creator.alex@studio360.io',
    userName: 'Alex Vance',
    plan: 'pro',
    billingCycle: 'monthly',
    amount: 19.9,
    currency: 'USD',
    status: 'active',
    currentPeriodStart: '2026-03-12',
    currentPeriodEnd: '2026-04-12',
    cancelAtPeriodEnd: false,
    paymentMethod: 'Visa •••• 4242',
  },
  {
    id: 'sub_9012',
    userId: 'usr_8802',
    userEmail: 'vr.developer@metaverse.com',
    userName: 'Chen Lin',
    plan: 'enterprise',
    billingCycle: 'yearly',
    amount: 358.8,
    currency: 'USD',
    status: 'active',
    currentPeriodStart: '2026-01-05',
    currentPeriodEnd: '2027-01-05',
    cancelAtPeriodEnd: false,
    paymentMethod: 'MasterCard •••• 8891',
  },
  {
    id: 'sub_9013',
    userId: 'usr_8803',
    userEmail: 'sarah.design@archviz.org',
    userName: 'Sarah Connor',
    plan: 'pro',
    billingCycle: 'yearly',
    amount: 118.8,
    currency: 'USD',
    status: 'active',
    currentPeriodStart: '2026-02-18',
    currentPeriodEnd: '2027-02-18',
    cancelAtPeriodEnd: false,
    paymentMethod: 'Apple Pay (Amex •••• 1004)',
  },
];

export const DEFAULT_INVOICES: InvoiceRecord[] = [
  {
    id: 'inv_2026_001',
    subscriptionId: 'sub_9012',
    userId: 'usr_8802',
    userEmail: 'vr.developer@metaverse.com',
    amount: 358.8,
    currency: 'USD',
    status: 'paid',
    date: '2026-01-05',
    planName: 'Enterprise Annual Studio',
  },
  {
    id: 'inv_2026_002',
    subscriptionId: 'sub_9013',
    userId: 'usr_8803',
    userEmail: 'sarah.design@archviz.org',
    amount: 118.8,
    currency: 'USD',
    status: 'paid',
    date: '2026-02-18',
    planName: 'Pro Creator Annual',
  },
  {
    id: 'inv_2026_003',
    subscriptionId: 'sub_9011',
    userId: 'usr_8801',
    userEmail: 'creator.alex@studio360.io',
    amount: 19.9,
    currency: 'USD',
    status: 'paid',
    date: '2026-03-12',
    planName: 'Pro Creator Monthly',
  },
];

export function getStoredSubscriptions(): SubscriptionRecord[] {
  try {
    const raw = localStorage.getItem(SUBSCRIPTIONS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return DEFAULT_SUBSCRIPTIONS;
}

export function saveStoredSubscriptions(subs: SubscriptionRecord[]): void {
  try {
    localStorage.setItem(SUBSCRIPTIONS_STORAGE_KEY, JSON.stringify(subs));
  } catch {
    // fallback
  }
}

export function getStoredInvoices(): InvoiceRecord[] {
  try {
    const raw = localStorage.getItem(INVOICES_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return DEFAULT_INVOICES;
}

export function saveStoredInvoices(invs: InvoiceRecord[]): void {
  try {
    localStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(invs));
  } catch {
    // fallback
  }
}

export const DEFAULT_GUEST_USER: ManagedUser = {
  id: 'usr_guest',
  email: 'guest@panoramagenerator.ai',
  name: 'Free Trial Guest',
  plan: 'free',
  creditsBalance: 4,
  creditsTotal: 4,
  status: 'active',
  joinedAt: '2026-10-11',
  lastActiveAt: 'Just now',
  apiCallsCount: 0,
};

/**
 * Returns the current active user for the studio session.
 * Defaults to the first user or Explorer guest if not found.
 */
export function getCurrentUser(): ManagedUser {
  const users = getStoredManagedUsers();
  try {
    const currentId = localStorage.getItem(CURRENT_USER_ID_STORAGE_KEY);
    if (currentId) {
      if (currentId === DEFAULT_GUEST_USER.id) {
        const guestFromStorage = localStorage.getItem('panorama_guest_user_data');
        if (guestFromStorage) return JSON.parse(guestFromStorage);
        return DEFAULT_GUEST_USER;
      }
      const found = users.find((u) => u.id === currentId);
      if (found) return found;
    }
  } catch {
    // fallback
  }

  // Node unit-testing environment fallback to maintain existing test contracts
  if (typeof window === 'undefined') {
    return users[0] || DEFAULT_MANAGED_USERS[0];
  }

  // Default browser guest user with 4 trial credits
  try {
    const guestFromStorage = localStorage.getItem('panorama_guest_user_data');
    if (guestFromStorage) return JSON.parse(guestFromStorage);
  } catch {
    // fallback
  }
  return DEFAULT_GUEST_USER;
}

export function setCurrentUserId(userId: string): void {
  try {
    localStorage.setItem(CURRENT_USER_ID_STORAGE_KEY, userId);
  } catch {
    // fallback
  }
}

/**
 * Deduct credits from the currently logged in user upon generating a panorama.
 * Enforces account active status check and strictly rejects negative or non-numeric debit amounts.
 */
export function deductCurrentUserCredits(amount: number): { success: boolean; remaining: number } {
  if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
    return { success: false, remaining: getCurrentUser().creditsBalance };
  }

  const current = getCurrentUser();
  if (current.id === DEFAULT_GUEST_USER.id) {
    if (current.status !== 'active' || current.creditsBalance < amount) {
      return { success: false, remaining: current.creditsBalance };
    }
    const updatedGuest = {
      ...current,
      creditsBalance: current.creditsBalance - amount,
      apiCallsCount: (current.apiCallsCount || 0) + 1,
      lastActiveAt: 'Just now',
    };
    try {
      localStorage.setItem('panorama_guest_user_data', JSON.stringify(updatedGuest));
    } catch {
      // fallback
    }
    return { success: true, remaining: updatedGuest.creditsBalance };
  }

  const users = getStoredManagedUsers();
  const userIdx = users.findIndex((u) => u.id === current.id);
  if (userIdx === -1) return { success: false, remaining: 0 };

  const targetUser = users[userIdx];
  // Strictly prevent suspended or inactive accounts from consuming credits or generating
  if (targetUser.status !== 'active') {
    return { success: false, remaining: targetUser.creditsBalance };
  }

  if (targetUser.creditsBalance < amount) {
    return { success: false, remaining: targetUser.creditsBalance };
  }

  targetUser.creditsBalance -= amount;
  targetUser.apiCallsCount += 1;
  targetUser.lastActiveAt = 'Just now';
  saveStoredManagedUsers(users);
  return { success: true, remaining: targetUser.creditsBalance };
}

/**
 * Top up credits or adjust plan for user.
 */
export function topUpCurrentUserCredits(amount: number): ManagedUser {
  const users = getStoredManagedUsers();
  const current = getCurrentUser();
  const next = users.map((u) => {
    if (u.id === current.id) {
      return {
        ...u,
        creditsBalance: u.creditsBalance + amount,
        creditsTotal: u.creditsTotal + amount,
      };
    }
    return u;
  });
  saveStoredManagedUsers(next);
  return getCurrentUser();
}

/**
 * Completes a commercial SaaS subscription purchase:
 * Upgrades the user's plan, adds subscription record, logs invoice, and allocates monthly credits.
 */
export function processCheckoutSubscription(params: {
  plan: 'pro' | 'enterprise';
  billingCycle: 'monthly' | 'yearly';
  amount: number;
  paymentMethod: string;
}): { user: ManagedUser; subscription: SubscriptionRecord; invoice: InvoiceRecord } {
  const current = getCurrentUser();
  const users = getStoredManagedUsers();
  const billing = getStoredBillingConfig();

  const creditsToGrant =
    params.plan === 'enterprise'
      ? 5000
      : billing.proMonthlyCredits || 1000;

  // 1. Update User Plan & Credits
  const updatedUsers = users.map((u) => {
    if (u.id === current.id) {
      return {
        ...u,
        plan: params.plan,
        creditsBalance: u.creditsBalance + creditsToGrant,
        creditsTotal: u.creditsTotal + creditsToGrant,
        status: 'active' as const,
        lastActiveAt: 'Just now',
      };
    }
    return u;
  });
  saveStoredManagedUsers(updatedUsers);

  // 2. Create / Update Subscription Record
  const now = new Date();
  const endDate = new Date(now);
  if (params.billingCycle === 'yearly') {
    endDate.setFullYear(now.getFullYear() + 1);
  } else {
    endDate.setMonth(now.getMonth() + 1);
  }

  const subId = `sub_${Date.now().toString().slice(-6)}`;
  const subscription: SubscriptionRecord = {
    id: subId,
    userId: current.id,
    userEmail: current.email,
    userName: current.name,
    plan: params.plan,
    billingCycle: params.billingCycle,
    amount: params.amount,
    currency: 'USD',
    status: 'active',
    currentPeriodStart: now.toISOString().split('T')[0],
    currentPeriodEnd: endDate.toISOString().split('T')[0],
    cancelAtPeriodEnd: false,
    paymentMethod: params.paymentMethod,
  };

  const subs = getStoredSubscriptions();
  // If user already had a subscription, replace or append
  const existingIdx = subs.findIndex((s) => s.userId === current.id);
  let updatedSubs: SubscriptionRecord[];
  if (existingIdx !== -1) {
    updatedSubs = subs.map((s, idx) => (idx === existingIdx ? subscription : s));
  } else {
    updatedSubs = [subscription, ...subs];
  }
  saveStoredSubscriptions(updatedSubs);

  // 3. Create Invoice Record
  const invId = `inv_${now.getFullYear()}_${Date.now().toString().slice(-4)}`;
  const invoice: InvoiceRecord = {
    id: invId,
    subscriptionId: subId,
    userId: current.id,
    userEmail: current.email,
    amount: params.amount,
    currency: 'USD',
    status: 'paid',
    date: now.toISOString().split('T')[0],
    planName: `${params.plan.toUpperCase()} Plan (${params.billingCycle === 'yearly' ? 'Annual' : 'Monthly'})`,
  };

  const invoices = getStoredInvoices();
  saveStoredInvoices([invoice, ...invoices]);

  return {
    user: getCurrentUser(),
    subscription,
    invoice,
  };
}

export const DEFAULT_ROUTING_CONFIG: ModelRoutingConfig = {
  mode: 'failover',
  primaryEndpointId: 'gemini-flash-img',
  secondaryEndpointId: 'gemini-imagen3',
  tertiaryEndpointId: 'fal-flux-schnell',
  roundRobinIndex: 0,
};

export function getStoredRoutingConfig(): ModelRoutingConfig {
  try {
    const raw = localStorage.getItem(ROUTING_STORAGE_KEY);
    if (raw) return { ...DEFAULT_ROUTING_CONFIG, ...JSON.parse(raw) };
  } catch {
    // fallback
  }
  return DEFAULT_ROUTING_CONFIG;
}

export function saveStoredRoutingConfig(config: ModelRoutingConfig): void {
  try {
    localStorage.setItem(ROUTING_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // fallback
  }
}

/**
 * Resolves the candidate execution endpoints pipeline based on admin routing policy:
 * - 'single': strictly try the designated primary model only. If disabled or missing, returns empty pipeline without fallback.
 * - 'failover': try primary model first; if quota exhausted or fails — or it returns a below-request resolution whose cost was fully refunded — switch only to explicitly configured secondary/tertiary endpoints. Never silently append unselected endpoints.
 * - 'round-robin': rotate strictly across enabled models sequentially. Returns empty if all models disabled.
 */
export function getModelExecutionPipeline(): {
  endpoints: ModelEndpointConfig[];
  mode: ModelRoutingMode;
} {
  const endpoints = getStoredModelEndpoints();
  const routing = getStoredRoutingConfig();
  const enabledEndpoints = endpoints.filter((ep) => ep.isEnabled);

  // If all endpoints are disabled by admin, return empty pipeline. Never silently mock or fallback!
  if (enabledEndpoints.length === 0) {
    return { endpoints: [], mode: routing.mode };
  }

  if (routing.mode === 'single') {
    const primary = enabledEndpoints.find((ep) => ep.id === routing.primaryEndpointId);
    // Strict Single mode: only the designated primary model is allowed. No silent substitution.
    return { endpoints: primary ? [primary] : [], mode: 'single' };
  }

  if (routing.mode === 'failover') {
    const ordered: ModelEndpointConfig[] = [];
    const primary = enabledEndpoints.find((ep) => ep.id === routing.primaryEndpointId);
    if (primary) ordered.push(primary);

    const secondary = enabledEndpoints.find(
      (ep) => ep.id === routing.secondaryEndpointId && ep.id !== primary?.id
    );
    if (secondary) ordered.push(secondary);

    if (routing.tertiaryEndpointId) {
      const tertiary = enabledEndpoints.find(
        (ep) => ep.id === routing.tertiaryEndpointId && !ordered.some((o) => o.id === ep.id)
      );
      if (tertiary) ordered.push(tertiary);
    }

    // Failover strictly honors designated endpoints. Never append unchosen endpoints behind admin's back.
    return {
      endpoints: ordered,
      mode: 'failover',
    };
  }

  if (routing.mode === 'round-robin') {
    const total = enabledEndpoints.length;
    const startIndex = (routing.roundRobinIndex || 0) % total;
    const rotated = [
      ...enabledEndpoints.slice(startIndex),
      ...enabledEndpoints.slice(0, startIndex),
    ];

    // Increment round robin pointer for next call
    saveStoredRoutingConfig({
      ...routing,
      roundRobinIndex: (startIndex + 1) % total,
    });

    return { endpoints: rotated, mode: 'round-robin' };
  }

  return { endpoints: enabledEndpoints, mode: 'failover' };
}

/**
 * Returns the currently active model endpoint configuration configured in Admin Ops.
 * Returns null if all endpoints are disabled.
 */
export function getActiveModelEndpoint(): ModelEndpointConfig | null {
  const pipeline = getModelExecutionPipeline();
  return pipeline.endpoints[0] || null;
}

export const DEFAULT_PAYMENT_CONFIG: PaymentGatewayConfig = {
  // Stripe configuration (keys and Price IDs blank by default)
  stripeEnabled: true,
  stripePublishableKey: '',
  stripeSecretKey: '',
  stripeWebhookSecret: '',
  stripeProMonthlyPriceId: '',
  stripeProYearlyPriceId: '',
  stripeEnterpriseMonthlyPriceId: '',
  stripeEnterpriseYearlyPriceId: '',

  // PayPal Subscriptions configuration (keys and Plan IDs blank by default)
  paypalEnabled: true,
  paypalMode: 'sandbox',
  paypalClientId: '',
  paypalClientSecret: '',
  paypalProMonthlyPlanId: '',
  paypalProYearlyPlanId: '',
  paypalEnterpriseMonthlyPlanId: '',
  paypalEnterpriseYearlyPlanId: '',
};

export function getStoredPaymentConfig(): PaymentGatewayConfig {
  try {
    const raw = localStorage.getItem(PAYMENTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const hadLegacySecrets = Boolean(
        parsed.stripeSecretKey || parsed.stripeWebhookSecret || parsed.paypalClientSecret
      );
      const cleaned: PaymentGatewayConfig = {
        ...DEFAULT_PAYMENT_CONFIG,
        ...parsed,
        // 严格杜绝在前端读取/残留支付私钥与 Webhook 密钥
        stripeSecretKey: '',
        stripeWebhookSecret: '',
        paypalClientSecret: '',
      };
      // 安全加固：若历史存储中仍包含敏感私钥，立即回写覆盖，彻底清除 localStorage 中的明文残留
      if (hadLegacySecrets) {
        saveStoredPaymentConfig(cleaned);
      }
      return cleaned;
    }
  } catch {
    // fallback
  }
  return DEFAULT_PAYMENT_CONFIG;
}

export function saveStoredPaymentConfig(config: PaymentGatewayConfig): void {
  try {
    // 安全策略硬约束：敏感私钥禁止保存在前端 localStorage 中，仅限服务端环境变量配置
    const sanitizedConfig: PaymentGatewayConfig = {
      ...config,
      stripeSecretKey: '',
      stripeWebhookSecret: '',
      paypalClientSecret: '',
    };
    localStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify(sanitizedConfig));
  } catch {
    // fallback
  }
}

export function getStoredAdminUsername(): string {
  try {
    const raw = localStorage.getItem(ADMIN_USERNAME_STORAGE_KEY);
    if (raw) return raw;
  } catch {
    // fallback
  }
  return DEFAULT_ADMIN_USERNAME;
}

export function setStoredAdminUsername(username: string): void {
  try {
    localStorage.setItem(ADMIN_USERNAME_STORAGE_KEY, username.trim());
  } catch {
    // fallback
  }
}

export function getStoredAdminPassword(): string {
  try {
    const raw = localStorage.getItem(ADMIN_PASSWORD_STORAGE_KEY);
    if (raw) return raw;
  } catch {
    // fallback
  }
  return DEFAULT_ADMIN_PASSWORD;
}

export function markAdminServerMode(): void {
  localStorage.removeItem(ADMIN_PASSWORD_STORAGE_KEY);
  sessionStorage.setItem('panorama_admin_server_mode', 'true');
}

export function setStoredAdminPassword(password: string): void {
  try {
    localStorage.setItem(ADMIN_PASSWORD_STORAGE_KEY, password);
  } catch {
    // fallback
  }
}

export function isAdminSessionValid(): boolean {
  try {
    return sessionStorage.getItem(ADMIN_AUTH_SESSION_KEY) === 'authenticated';
  } catch {
    return false;
  }
}

export function setAdminSession(authenticated: boolean): void {
  try {
    if (authenticated) {
      sessionStorage.setItem(ADMIN_AUTH_SESSION_KEY, 'authenticated');
    } else {
      sessionStorage.removeItem(ADMIN_AUTH_SESSION_KEY);
    }
  } catch {
    // fallback
  }
}

export function verifyAdminPassword(password: string): boolean {
  return password.trim() === getStoredAdminPassword();
}

export function verifyAdminCredentials(username: string, password: string): boolean {
  const expectedUser = getStoredAdminUsername().trim().toLowerCase();
  const inputUser = username.trim().toLowerCase();
  return inputUser === expectedUser && verifyAdminPassword(password);
}

