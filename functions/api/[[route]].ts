// Cloudflare Pages Functions - Edge Commercial Backend with D1 Persistence

interface Env {
  DB?: D1Database;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  PAYMENT_MODE?: string;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// Auto-bootstrap D1 database tables if they do not exist
async function ensureDbInitialized(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        plan TEXT NOT NULL DEFAULT 'free',
        credits_balance INTEGER NOT NULL DEFAULT 50,
        credits_total INTEGER NOT NULL DEFAULT 50,
        api_calls_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL
      );
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS admin_sessions (
        token TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL
      );
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS orders (
        checkout_session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        plan TEXT NOT NULL,
        billing_cycle TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'usd',
        amount_cents INTEGER NOT NULL,
        credits INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        status TEXT NOT NULL DEFAULT 'paid',
        checkout_session_id TEXT,
        created_at TEXT NOT NULL
      );
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        plan TEXT NOT NULL,
        billing_cycle TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL
      );
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS processed_events (
        event_id TEXT PRIMARY KEY,
        processed_at TEXT NOT NULL
      );
    `),
  ]);
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    // 1. Health Probe
    if (pathname === '/api/health' && request.method === 'GET') {
      return jsonResponse({
        status: 'online',
        server: 'cloudflare-pages-edge',
        databaseReady: Boolean(env.DB),
        paymentsReady: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
        gateways: {
          stripeConfigured: Boolean(env.STRIPE_SECRET_KEY),
          stripeWebhookConfigured: Boolean(env.STRIPE_WEBHOOK_SECRET),
          paypalConfigured: false,
        },
      });
    }

    if (env.DB) {
      await ensureDbInitialized(env.DB);
    }

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');

    // 2. User Authentication (Register / Login)
    if (pathname === '/api/user/auth' && request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { email?: string; name?: string };
      const { email, name } = body;
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse({ success: false, error: 'Valid email address is required' }, 400);
      }

      if (!env.DB) {
        return jsonResponse({ success: false, error: 'Database service unavailable' }, 503);
      }

      let user = await env.DB.prepare('SELECT * FROM users WHERE email = ?')
        .bind(email.toLowerCase())
        .first<{
          id: string;
          email: string;
          name: string;
          plan: string;
          credits_balance: number;
          credits_total: number;
          api_calls_count: number;
          status: string;
        }>();

      if (!user) {
        const userId = 'usr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
        const displayName = typeof name === 'string' && name.trim() ? name.trim() : email.split('@')[0];
        const now = new Date().toISOString();

        await env.DB.prepare(`
          INSERT INTO users (id, email, name, plan, credits_balance, credits_total, api_calls_count, status, created_at)
          VALUES (?, ?, ?, 'free', 50, 50, 0, 'active', ?)
        `).bind(userId, email.toLowerCase(), displayName, now).run();

        user = {
          id: userId,
          email: email.toLowerCase(),
          name: displayName,
          plan: 'free',
          credits_balance: 50,
          credits_total: 50,
          api_calls_count: 0,
          status: 'active',
        };
      }

      const sessionToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      const expiresAt = Date.now() + 7 * 86400000;
      await env.DB.prepare('INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
        .bind(sessionToken, user.id, expiresAt)
        .run();

      return jsonResponse({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan,
          creditsBalance: user.credits_balance,
          creditsTotal: user.credits_total,
          apiCallsCount: user.api_calls_count,
          status: user.status,
        },
        token: sessionToken,
      });
    }

    // 3. User Me Profile
    if (pathname === '/api/user/me' && request.method === 'GET') {
      if (!env.DB) return jsonResponse({ success: false, error: 'Database unavailable' }, 503);
      if (!token) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const session = await env.DB.prepare('SELECT user_id FROM user_sessions WHERE token = ? AND expires_at > ?')
        .bind(token, Date.now())
        .first<{ user_id: string }>();

      if (!session) return jsonResponse({ success: false, error: 'Invalid or expired session' }, 401);

      const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
        .bind(session.user_id)
        .first<{
          id: string;
          email: string;
          name: string;
          plan: string;
          credits_balance: number;
          credits_total: number;
          api_calls_count: number;
          status: string;
        }>();

      if (!user) return jsonResponse({ success: false, error: 'User not found' }, 404);

      return jsonResponse({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan,
          creditsBalance: user.credits_balance,
          creditsTotal: user.credits_total,
          apiCallsCount: user.api_calls_count,
          status: user.status,
        },
      });
    }

    // 4. Admin Login with dual username and password credentials
    if (pathname === '/api/admin/login' && request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
      const expectedUser = (env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
      const expectedPass = (env.ADMIN_PASSWORD || 'admin888').trim();
      const inputUser = (body.username || '').trim().toLowerCase();
      const inputPass = (body.password || '').trim();

      if (inputUser !== expectedUser || inputPass !== expectedPass) {
        return jsonResponse({ error: '管理员账号或密码错误，请核对凭证。' }, 401);
      }

      const adminToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      const expiresAt = Date.now() + 3600000;
      if (env.DB) {
        await env.DB.prepare('INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)')
          .bind(adminToken, expiresAt)
          .run();
      }

      return jsonResponse({ success: true, token: adminToken });
    }

    // 5. Admin Store & Logout
    if (pathname.startsWith('/api/admin/')) {
      if (!env.DB) return jsonResponse({ error: 'Database unavailable' }, 503);

      const session = await env.DB.prepare('SELECT token FROM admin_sessions WHERE token = ? AND expires_at > ?')
        .bind(token, Date.now())
        .first();

      if (!session) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }

      if (pathname === '/api/admin/logout' && request.method === 'POST') {
        await env.DB.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(token).run();
        return jsonResponse({ success: true });
      }

      if (pathname === '/api/admin/store' && request.method === 'GET') {
        const usersResult = await env.DB.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 100').all();
        const subsResult = await env.DB.prepare('SELECT * FROM subscriptions ORDER BY created_at DESC LIMIT 100').all();
        const invsResult = await env.DB.prepare('SELECT * FROM invoices ORDER BY created_at DESC LIMIT 100').all();

        const formattedUsers = (usersResult.results || []).map((u: any) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          plan: u.plan,
          creditsBalance: u.credits_balance,
          creditsTotal: u.credits_total,
          apiCallsCount: u.api_calls_count,
          status: u.status,
          createdAt: u.created_at,
        }));

        return jsonResponse({
          users: formattedUsers,
          subscriptions: subsResult.results || [],
          invoices: invsResult.results || [],
        });
      }
    }

    // 6. Stripe Checkout Session Creation
    if (pathname === '/api/stripe/create-checkout-session' && request.method === 'POST') {
      if (!env.STRIPE_SECRET_KEY) {
        return jsonResponse({
          success: false,
          error: '服务端未配置 STRIPE_SECRET_KEY 生产私钥，暂不开放真实收款。',
        }, 503);
      }

      const body = (await request.json().catch(() => ({}))) as any;
      const { plan, billingCycle, userId, userEmail, successUrl, cancelUrl } = body || {};
      if (!['pro', 'enterprise'].includes(plan) || !['monthly', 'yearly'].includes(billingCycle)) {
        return jsonResponse({ success: false, error: 'Invalid plan or billing cycle' }, 400);
      }

      if (!env.DB) return jsonResponse({ success: false, error: 'Database unavailable' }, 503);

      const user = await env.DB.prepare(
        'SELECT * FROM users WHERE (id = ? OR email = ?) AND status = ?'
      ).bind(userId || '', (userEmail || '').toLowerCase(), 'active').first<any>();

      if (!user) {
        return jsonResponse({
          success: false,
          error: '必须先绑定有效活跃用户身份才可创建付款会话',
        }, 400);
      }

      const PRICING_CENTS = {
        pro: { monthly: 1900, yearly: 11880, credits: 1000 },
        enterprise: { monthly: 4900, yearly: 34800, credits: 5000 },
      };
      const orderAmount = (PRICING_CENTS as any)[plan][billingCycle];
      const orderCredits = (PRICING_CENTS as any)[plan].credits;

      const params = new URLSearchParams();
      params.append('payment_method_types[0]', 'card');
      params.append('mode', 'payment');
      params.append('line_items[0][price_data][currency]', 'usd');
      params.append('line_items[0][price_data][unit_amount]', String(orderAmount));
      params.append('line_items[0][price_data][product_data][name]', `PanoramaAI Studio ${plan.toUpperCase()} (${billingCycle})`);
      params.append('line_items[0][quantity]', '1');
      params.append('client_reference_id', user.id);
      params.append('customer_email', user.email);
      params.append('success_url', successUrl || `${url.origin}/?checkout_status=success`);
      params.append('cancel_url', cancelUrl || `${url.origin}/?checkout_status=cancelled`);

      const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!stripeRes.ok) {
        const errData = (await stripeRes.json().catch(() => ({}))) as any;
        return jsonResponse({
          success: false,
          error: errData.error?.message || 'Stripe API 响应异常，无法创建结账会话',
        }, 400);
      }

      const sessionData = (await stripeRes.json()) as any;
      await env.DB.prepare(`
        INSERT INTO orders (checkout_session_id, user_id, status, plan, billing_cycle, currency, amount_cents, credits, created_at)
        VALUES (?, ?, 'pending', ?, ?, 'usd', ?, ?, ?)
      `).bind(sessionData.id, user.id, plan, billingCycle, orderAmount, orderCredits, new Date().toISOString()).run();

      return jsonResponse({
        success: true,
        checkoutUrl: sessionData.url,
        sessionId: sessionData.id,
      });
    }

    return jsonResponse({ error: 'Route not found' }, 404);
  } catch (err: unknown) {
    console.error('[Cloudflare Edge Commercial API]', err);
    return jsonResponse({
      error: 'Internal edge server error',
      details: err instanceof Error ? err.message : String(err),
    }, 500);
  }
};
