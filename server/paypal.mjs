export function paypalConfigured(env) {
  return ['sandbox', 'live'].includes(env.PAYPAL_MODE) && Boolean(env.PAYPAL_CLIENT_ID &&
    env.PAYPAL_CLIENT_SECRET && env.PAYPAL_WEBHOOK_ID && env.PAYPAL_PRO_MONTHLY_PLAN_ID &&
    env.PAYPAL_PRO_YEARLY_PLAN_ID && env.PAYPAL_ENTERPRISE_MONTHLY_PLAN_ID && env.PAYPAL_ENTERPRISE_YEARLY_PLAN_ID);
}

export function formatAdminBilling({ subscriptions = [], paypalSubscriptions = [], invoices = [], users = [] }) {
  const usersById = new Map(users.map(user => [user.id, user]));
  const paypalById = new Map(paypalSubscriptions.map(row => [row.paypal_id ?? row.paypalId, row]));
  const statuses = { ACTIVE: 'active', SUSPENDED: 'past_due', CANCELLED: 'canceled', EXPIRED: 'canceled',
    APPROVED: 'trialing', APPROVAL_PENDING: 'trialing', pending: 'trialing' };
  return {
    subscriptions: [...subscriptions, ...paypalSubscriptions].map(row => {
      const userId = row.user_id ?? row.userId;
      const user = usersById.get(userId);
      const isPayPal = row.plan_id !== undefined || row.planId !== undefined;
      return {
        id: row.id, userId, userEmail: row.userEmail ?? row.user_email ?? user?.email ?? '',
        userName: row.userName ?? row.user_name ?? user?.name ?? '', plan: row.plan,
        billingCycle: row.billingCycle ?? row.billing_cycle,
        amount: row.amount ?? ((row.amount_cents ?? row.amountCents) / 100),
        currency: row.currency || 'USD', status: statuses[row.status] || row.status,
        currentPeriodStart: row.currentPeriodStart ?? row.created_at ?? row.createdAt ?? '',
        currentPeriodEnd: row.currentPeriodEnd ?? row.paid_through ?? row.paidThrough ?? '',
        cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? ['CANCELLED', 'EXPIRED'].includes(row.status),
        paymentMethod: row.paymentMethod || (isPayPal ? 'PayPal' : 'Stripe'),
      };
    }),
    invoices: invoices.map(row => {
      const userId = row.user_id ?? row.userId;
      const user = usersById.get(userId);
      const paymentId = row.checkout_session_id ?? row.checkoutSessionId ?? row.subscriptionId;
      const subscription = paypalById.get(paymentId);
      return {
        id: row.id, userId, userEmail: row.userEmail ?? row.user_email ?? user?.email ?? '',
        subscriptionId: subscription?.id ?? row.subscriptionId ?? paymentId ?? '',
        amount: row.amount, currency: row.currency, status: row.status,
        date: row.date ?? row.created_at ?? row.createdAt ?? '',
        planName: row.planName ?? (subscription ? `${subscription.plan.toUpperCase()} (${subscription.billing_cycle ?? subscription.billingCycle})` : 'Subscription payment'),
      };
    }),
  };
}

export function paypalCatalog(env, billing = {}) {
  const monthlyPrice = billing.proMonthlyPriceUsd ?? 19;
  const monthlyCredits = billing.proMonthlyCredits ?? 1000;
  if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0 || !Number.isSafeInteger(monthlyCredits) || monthlyCredits <= 0) {
    throw new Error('Invalid server billing configuration');
  }
  return {
    pro: {
      monthly: { planId: env.PAYPAL_PRO_MONTHLY_PLAN_ID, amountCents: Math.round(monthlyPrice * 100), credits: monthlyCredits },
      yearly: { planId: env.PAYPAL_PRO_YEARLY_PLAN_ID, amountCents: 11880, credits: monthlyCredits * 12 },
    },
    enterprise: {
      monthly: { planId: env.PAYPAL_ENTERPRISE_MONTHLY_PLAN_ID, amountCents: 4900, credits: 5000 },
      yearly: { planId: env.PAYPAL_ENTERPRISE_YEARLY_PLAN_ID, amountCents: 34800, credits: 60000 },
    },
  };
}

export function createPayPalApi(env, fetchImpl = fetch) {
  const base = env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  let accessToken;
  const readResponse = async response => {
    const data = await response.json();
    if (!response.ok) throw new Error(`PayPal request failed (${response.status})`);
    return data;
  };
  return async (pathname, body, requestId) => {
    if (!accessToken) {
      const response = await fetchImpl(`${base}/v1/oauth2/token`, {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials',
      });
      accessToken = (await readResponse(response)).access_token;
      if (!accessToken) throw new Error('PayPal did not return an access token');
    }
    const response = await fetchImpl(`${base}${pathname}`, {
      method: body === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json',
        ...(requestId ? { 'PayPal-Request-Id': requestId } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 204 && response.ok) return {};
    return readResponse(response);
  };
}

export function validatePayPalPlan(remote, expected, cycle) {
  const regular = remote.billing_cycles?.[0];
  const preferences = remote.payment_preferences;
  if (remote.status !== 'ACTIVE' || remote.billing_cycles?.length !== 1 || regular?.tenure_type !== 'REGULAR' ||
    regular.total_cycles !== 0 || regular.frequency?.interval_count !== 1 ||
    regular.frequency.interval_unit !== (cycle === 'yearly' ? 'YEAR' : 'MONTH') ||
    regular.pricing_scheme?.fixed_price?.currency_code !== 'USD' ||
    moneyCents(regular.pricing_scheme.fixed_price.value) !== expected.amountCents ||
    Number(preferences?.setup_fee?.value || 0) !== 0 || Number(remote.taxes?.percentage || 0) !== 0 ||
    remote.quantity_supported === true) throw new Error('PayPal plan differs from the advertised price or billing cycle');
}

function moneyCents(value) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value)) return NaN;
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : NaN;
}

function periodEnd(timestamp, cycle) {
  const start = new Date(timestamp);
  if (!Number.isFinite(start.getTime())) throw new Error('Invalid payment timestamp');
  const end = new Date(start);
  const day = start.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + (cycle === 'yearly' ? 12 : 1));
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end.toISOString();
}

const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const validId = value => typeof value === 'string' && /^I-[A-Z0-9]+$/.test(value);

export async function handlePayPalRequest({ request, env, ledger, authenticate, fetchImpl = fetch }) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  try {
    if (pathname === '/api/paypal/config' && request.method === 'GET') {
      return reply({ success: true, enabled: paypalConfigured(env), mode: env.PAYPAL_MODE || 'sandbox',
        plans: paypalCatalog(env, await ledger.billing()) });
    }
    if (!paypalConfigured(env)) return reply({ error: 'PayPal subscriptions are not configured on this server' }, 503);
    const api = createPayPalApi(env, fetchImpl);
    if (pathname === '/api/paypal/webhook' && request.method === 'POST') {
      const raw = await request.text();
      if (raw.length > 1024 * 1024) return reply({ error: 'Payload too large' }, 413);
      const event = JSON.parse(raw);
      const headerNames = ['paypal-transmission-id', 'paypal-transmission-time', 'paypal-transmission-sig', 'paypal-cert-url', 'paypal-auth-algo'];
      if (headerNames.some(name => !request.headers.get(name))) return reply({ error: 'Missing PayPal signature' }, 400);
      const verified = await api('/v1/notifications/verify-webhook-signature', {
        transmission_id: request.headers.get(headerNames[0]), transmission_time: request.headers.get(headerNames[1]),
        transmission_sig: request.headers.get(headerNames[2]), cert_url: request.headers.get(headerNames[3]),
        auth_algo: request.headers.get(headerNames[4]), webhook_id: env.PAYPAL_WEBHOOK_ID, webhook_event: event,
      });
      if (verified.verification_status !== 'SUCCESS') return reply({ error: 'Invalid PayPal signature' }, 400);
      const payment = event.event_type === 'PAYMENT.SALE.COMPLETED';
      const lifecycle = ['BILLING.SUBSCRIPTION.ACTIVATED', 'BILLING.SUBSCRIPTION.CANCELLED',
        'BILLING.SUBSCRIPTION.SUSPENDED', 'BILLING.SUBSCRIPTION.EXPIRED', 'BILLING.SUBSCRIPTION.PAYMENT.FAILED'].includes(event.event_type);
      if (!payment && !lifecycle) return reply({ received: true, ignored: true });
      const subscriptionId = payment ? event.resource?.billing_agreement_id : event.resource?.id;
      if (!validId(subscriptionId)) return reply({ error: 'Invalid subscription event' }, 400);
      const remote = await api(`/v1/billing/subscriptions/${subscriptionId}`);
      const local = await ledger.find(remote.custom_id);
      if (!local) return reply({ received: true, ignored: true });
      if (remote.id !== subscriptionId || remote.plan_id !== local.planId ||
        (local.paypalId && local.paypalId !== subscriptionId) || remote.plan_overridden === true ||
        (remote.quantity && remote.quantity !== '1')) return reply({ error: 'Subscription does not match the local purchase' }, 400);
      if (payment) {
        const sale = event.resource;
        if (sale.state !== 'completed' || typeof sale.id !== 'string' || !/^[A-Z0-9]+$/.test(sale.id) ||
          sale.amount?.currency !== 'USD' || moneyCents(sale.amount?.total) !== local.amountCents) {
          return reply({ error: 'Payment amount or currency does not match' }, 400);
        }
        await ledger.grant(local, sale.id, periodEnd(sale.create_time, local.billingCycle), remote);
      } else {
        await ledger.updateRemote(local.id, remote);
      }
      return reply({ received: true });
    }
    const user = await authenticate();
    if (!user) return reply({ error: 'Please log in before subscribing' }, 401);
    if (user.status !== 'active' || !user.password_hash || user.id.startsWith('usr_guest_')) {
      return reply({ error: 'Please register or log in with a permanent account before subscribing' }, 403);
    }
    if (pathname === '/api/paypal/subscription' && request.method === 'GET') {
      const subscription = await ledger.current(user.id);
      if (!subscription) return reply({ success: true, subscription: null });
      const remote = subscription.paypalId ? await api(`/v1/billing/subscriptions/${subscription.paypalId}`) : null;
      if (remote) {
        if (remote.custom_id !== subscription.id || remote.plan_id !== subscription.planId) throw new Error('Subscription ownership mismatch');
        await ledger.updateRemote(subscription.id, remote);
      }
      return reply({ success: true, subscription: await ledger.find(subscription.id) });
    }
    if (pathname === '/api/paypal/cancel-subscription' && request.method === 'POST') {
      const subscription = await ledger.current(user.id);
      if (!subscription) return reply({ error: 'No subscription to cancel' }, 404);
      const body = await request.json();
      if (body.subscriptionId !== subscription.id) return reply({ error: 'Subscription changed. Refresh before cancelling.' }, 409);
      if (!subscription.paypalId && subscription.status === 'pending' && !subscription.approvalUrl) {
        await ledger.discardPending(subscription.id, user.id);
        return reply({ success: true });
      }
      if (!subscription.paypalId) return reply({ error: 'Subscription cannot be cancelled yet; refresh and retry.' }, 409);
      const remote = await api(`/v1/billing/subscriptions/${subscription.paypalId}`);
      if (remote.custom_id !== subscription.id || remote.plan_id !== subscription.planId) throw new Error('Subscription ownership mismatch');
      if (['ACTIVE', 'SUSPENDED', 'APPROVED'].includes(remote.status)) {
        await api(`/v1/billing/subscriptions/${subscription.paypalId}/cancel`, { reason: 'Cancelled by account holder' });
      } else if (!['CANCELLED', 'EXPIRED'].includes(remote.status)) {
        return reply({ error: 'Complete or cancel the pending approval in PayPal first' }, 409);
      }
      await ledger.updateRemote(subscription.id, await api(`/v1/billing/subscriptions/${subscription.paypalId}`));
      return reply({ success: true });
    }
    if (pathname !== '/api/paypal/create-subscription' || request.method !== 'POST') return reply({ error: 'Route not found' }, 404);
    const body = await request.json();
    if (!['pro', 'enterprise'].includes(body.plan) || !['monthly', 'yearly'].includes(body.billingCycle)) {
      return reply({ error: 'Invalid plan or billing cycle' }, 400);
    }
    const offer = paypalCatalog(env, await ledger.billing())[body.plan][body.billingCycle];
    if (!/^P-[A-Z0-9]+$/.test(offer.planId || '') || !Number.isSafeInteger(offer.credits) || offer.credits <= 0) {
      return reply({ error: 'Invalid PayPal plan configuration' }, 503);
    }
    validatePayPalPlan(await api(`/v1/billing/plans/${offer.planId}`), offer, body.billingCycle);
    let local = await ledger.current(user.id);
    if (local && !['CANCELLED', 'EXPIRED'].includes(local.status)) {
      if (local.plan !== body.plan || local.billingCycle !== body.billingCycle || ['ACTIVE', 'SUSPENDED', 'APPROVED'].includes(local.status)) {
        return reply({ error: 'An existing subscription needs to be managed before starting another' }, 409);
      }
      if (local.approvalUrl) return reply({ success: true, subscriptionId: local.paypalId, approvalUrl: local.approvalUrl });
    } else {
      local = { id: crypto.randomUUID(), userId: user.id, paypalId: null, plan: body.plan, billingCycle: body.billingCycle,
        ...offer, status: 'pending', approvalUrl: '', paidThrough: '', createdAt: new Date().toISOString(), statusTime: '' };
      await ledger.insert(local);
    }
    const origin = env.PAYPAL_RETURN_ORIGIN || url.origin;
    try {
      const remote = await api('/v1/billing/subscriptions', { plan_id: local.planId, custom_id: local.id,
        application_context: { brand_name: 'PanoramaAI Studio', shipping_preference: 'NO_SHIPPING', user_action: 'SUBSCRIBE_NOW',
          return_url: `${origin}/?paypal=return`, cancel_url: `${origin}/?paypal=cancelled` } }, local.id);
      const approvalUrl = remote.links?.find(link => link.rel === 'approve')?.href;
      const approvedUrl = approvalUrl ? new URL(approvalUrl) : null;
      if (!validId(remote.id) || approvedUrl?.protocol !== 'https:' ||
        !['www.paypal.com', 'www.sandbox.paypal.com'].includes(approvedUrl?.hostname)) throw new Error('PayPal did not return a valid approval URL');
      await ledger.attach(local.id, remote.id, approvalUrl);
      return reply({ success: true, subscriptionId: remote.id, approvalUrl });
    } catch (error) {
      await ledger.discardPending(local.id, user.id);
      throw error;
    }
  } catch (error) {
    if (error instanceof SyntaxError) return reply({ error: 'Invalid JSON' }, 400);
    return reply({ error: error.message?.startsWith('PayPal plan differs') ? error.message : 'PayPal could not be verified. No payment success was acknowledged; please retry.' }, 502);
  }
}

export const paypalSchema = [
  `CREATE TABLE IF NOT EXISTS paypal_subscriptions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, paypal_id TEXT UNIQUE, plan_id TEXT NOT NULL,
    plan TEXT NOT NULL, billing_cycle TEXT NOT NULL, amount_cents INTEGER NOT NULL, credits INTEGER NOT NULL,
    status TEXT NOT NULL, approval_url TEXT NOT NULL DEFAULT '', paid_through TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, status_time TEXT NOT NULL DEFAULT '')`,
  `CREATE UNIQUE INDEX IF NOT EXISTS paypal_one_open_subscription ON paypal_subscriptions(user_id)
    WHERE status NOT IN ('CANCELLED', 'EXPIRED')`,
];

const selectSubscription = `SELECT id, user_id AS userId, paypal_id AS paypalId, plan_id AS planId,
  plan, billing_cycle AS billingCycle, amount_cents AS amountCents, credits, status,
  approval_url AS approvalUrl, paid_through AS paidThrough, created_at AS createdAt, status_time AS statusTime FROM paypal_subscriptions`;

export function createD1PayPalLedger(db) {
  return {
    syncAccess: userId => db.prepare(`UPDATE users SET plan = CASE
      WHEN EXISTS (SELECT 1 FROM paypal_subscriptions WHERE user_id = users.id AND paid_through > ? AND plan = 'enterprise') THEN 'enterprise'
      WHEN EXISTS (SELECT 1 FROM paypal_subscriptions WHERE user_id = users.id AND paid_through > ?) THEN 'pro' ELSE 'free' END
      WHERE id = ? AND EXISTS (SELECT 1 FROM paypal_subscriptions WHERE user_id = users.id AND paid_through != '')
      AND NOT EXISTS (SELECT 1 FROM orders WHERE user_id = users.id AND status = 'fulfilled')`)
      .bind(new Date().toISOString(), new Date().toISOString(), userId).run(),
    async billing() { const row = await db.prepare("SELECT value FROM admin_config WHERE key = 'billing_config'").first(); return row ? JSON.parse(row.value) : {}; },
    find: id => db.prepare(`${selectSubscription} WHERE id = ?`).bind(id || '').first(),
    current: userId => db.prepare(`${selectSubscription} WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`).bind(userId).first(),
    insert: row => db.prepare(`INSERT INTO paypal_subscriptions (id,user_id,plan_id,plan,billing_cycle,amount_cents,credits,status,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(row.id, row.userId, row.planId, row.plan, row.billingCycle, row.amountCents, row.credits, row.status, row.createdAt).run(),
    discardPending: (id, userId) => db.prepare("DELETE FROM paypal_subscriptions WHERE id = ? AND user_id = ? AND status = 'pending' AND paypal_id IS NULL AND approval_url = ''")
      .bind(id, userId).run(),
    attach: async (id, paypalId, approvalUrl) => {
      const result = await db.prepare('UPDATE paypal_subscriptions SET paypal_id = ?, approval_url = ? WHERE id = ?')
        .bind(paypalId, approvalUrl, id).run();
      if (!result.meta.changes) throw new Error('Checkout was discarded before publication');
    },
    updateRemote: (id, remote) => db.prepare(`UPDATE paypal_subscriptions SET paypal_id = ?, status = ?, status_time = ?
      WHERE id = ? AND status_time <= ?`).bind(remote.id, remote.status, remote.status_update_time || '', id, remote.status_update_time || '').run(),
    async grant(row, paymentId, paidThrough, remote) {
      const invoiceId = `paypal:${paymentId}`;
      if (await db.prepare('SELECT id FROM invoices WHERE id = ?').bind(invoiceId).first()) return;
      const user = await db.prepare('SELECT status FROM users WHERE id = ?').bind(row.userId).first();
      if (user?.status !== 'active') throw new Error('Account unavailable');
      await db.batch([
        db.prepare(`UPDATE users SET credits_balance = credits_balance + ?, credits_total = credits_total + ?, plan = ?
          WHERE id = ? AND status = 'active' AND NOT EXISTS (SELECT 1 FROM invoices WHERE id = ?)`)
          .bind(row.credits, row.credits, row.plan, row.userId, invoiceId),
        db.prepare(`INSERT INTO invoices (id,user_id,amount,currency,status,checkout_session_id,created_at)
          SELECT ?,id,?,'USD','paid',?,? FROM users WHERE id = ? AND status = 'active' ON CONFLICT(id) DO NOTHING`)
          .bind(invoiceId, row.amountCents / 100, remote.id, new Date().toISOString(), row.userId),
        db.prepare('UPDATE paypal_subscriptions SET paid_through = MAX(paid_through, ?), paypal_id = ? WHERE id = ? AND EXISTS (SELECT 1 FROM invoices WHERE id = ?)')
          .bind(paidThrough, remote.id, row.id, invoiceId),
        db.prepare(`UPDATE paypal_subscriptions SET status = ?, status_time = ? WHERE id = ? AND status_time <= ? AND EXISTS (SELECT 1 FROM invoices WHERE id = ?)`)
          .bind(remote.status, remote.status_update_time || '', row.id, remote.status_update_time || '', invoiceId),
      ]);
      if (!await db.prepare('SELECT id FROM invoices WHERE id = ?').bind(invoiceId).first()) throw new Error('Payment has not been fulfilled');
    },
  };
}

export function createJsonPayPalLedger(read, write) {
  const change = callback => { const store = read(); const result = callback(store); write(store); return result; };
  return {
    syncAccess: async userId => {
      const store = read();
      const subscriptions = store.paypalSubscriptions?.filter(row => row.userId === userId && row.paidThrough) || [];
      if (!subscriptions.length || store.orders?.some(row => row.userId === userId && row.status === 'fulfilled')) return;
      const current = subscriptions.filter(row => row.paidThrough > new Date().toISOString());
      const user = store.users.find(user => user.id === userId);
      const plan = current.some(row => row.plan === 'enterprise') ? 'enterprise' : current.length ? 'pro' : 'free';
      if (user && user.plan !== plan) { user.plan = plan; write(store); }
    },
    billing: async () => read().billing_config || {},
    find: async id => read().paypalSubscriptions?.find(row => row.id === id) || null,
    current: async userId => read().paypalSubscriptions?.filter(row => row.userId === userId).sort((first, second) => second.createdAt.localeCompare(first.createdAt))[0] || null,
    insert: async row => change(store => {
      store.paypalSubscriptions ||= [];
      if (store.paypalSubscriptions.some(current => current.userId === row.userId && !['CANCELLED', 'EXPIRED'].includes(current.status))) throw new Error('Existing subscription');
      store.paypalSubscriptions.push(row);
    }),
    discardPending: async (id, userId) => change(store => {
      store.paypalSubscriptions = (store.paypalSubscriptions || []).filter(row =>
        !(row.id === id && row.userId === userId && row.status === 'pending' && !row.paypalId && !row.approvalUrl));
    }),
    attach: async (id, paypalId, approvalUrl) => change(store => {
      const row = store.paypalSubscriptions.find(row => row.id === id);
      if (!row) throw new Error('Checkout was discarded before publication');
      Object.assign(row, { paypalId, approvalUrl });
    }),
    updateRemote: async (id, remote) => change(store => {
      const row = store.paypalSubscriptions.find(row => row.id === id);
      if ((row.statusTime || '') <= (remote.status_update_time || '')) Object.assign(row, { paypalId: remote.id, status: remote.status, statusTime: remote.status_update_time || '' });
    }),
    grant: async (row, paymentId, paidThrough, remote) => change(store => {
      const invoiceId = `paypal:${paymentId}`;
      if (store.invoices.some(invoice => invoice.id === invoiceId)) return;
      const user = store.users.find(user => user.id === row.userId);
      if (user?.status !== 'active' || !Number.isSafeInteger(user.creditsBalance) || !Number.isSafeInteger(user.creditsTotal)) throw new Error('Account unavailable');
      if (!store.invoices.some(invoice => invoice.id === invoiceId)) {
        user.creditsBalance += row.credits;
        user.creditsTotal += row.credits;
        user.plan = row.plan;
        store.invoices.push({ id: invoiceId, userId: row.userId, amount: row.amountCents / 100,
          currency: 'USD', status: 'paid', checkoutSessionId: remote.id, createdAt: new Date().toISOString() });
      }
      const current = store.paypalSubscriptions.find(current => current.id === row.id);
      current.paypalId = remote.id;
      current.paidThrough = current.paidThrough > paidThrough ? current.paidThrough : paidThrough;
      if ((current.statusTime || '') <= (remote.status_update_time || '')) Object.assign(current, { status: remote.status, statusTime: remote.status_update_time || '' });
    }),
  };
}
