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

// Lightweight salt-hashed password utilities using Web Crypto API
async function hashPasswordWithSalt(password: string, salt = crypto.randomUUID().replace(/-/g, '')): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${password}`);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  const hashHex = hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `sha256:${salt}:${hashHex}`;
}

async function verifyHashedPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !storedHash.startsWith('sha256:')) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const salt = parts[1];
  const computed = await hashPasswordWithSalt(password, salt);
  return computed === storedHash;
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
        credits_balance INTEGER NOT NULL DEFAULT 4,
        credits_total INTEGER NOT NULL DEFAULT 4,
        api_calls_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        password_hash TEXT,
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
      CREATE TABLE IF NOT EXISTS admin_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
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

  // Idempotent table migration: ensure password_hash column exists on pre-existing users tables
  try {
    await db.prepare('ALTER TABLE users ADD COLUMN password_hash TEXT').run();
  } catch {
    // Column already present, safe to ignore
  }
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

    // Public Pricing / Billing Rules Query
    if (pathname === '/api/billing' && request.method === 'GET') {
      if (env.DB) {
        const row = await env.DB.prepare('SELECT value FROM admin_config WHERE key = ?')
          .bind('billing_config')
          .first<{ value: string }>();
        if (row?.value) {
          try {
            return jsonResponse({ success: true, config: JSON.parse(row.value) });
          } catch {
            // fallback
          }
        }
      }
      return jsonResponse({
        success: true,
        config: {
          freeMonthlyCredits: 4,
          proMonthlyPriceUsd: 19,
          proMonthlyCredits: 1000,
          enterpriseCustomPricing: true,
          creditCostPer1K: 1,
          creditCostPer2K: 2,
          creditCostPer4K: 4,
        },
      });
    }

    // Public Models Query
    if (pathname === '/api/models' && request.method === 'GET') {
      if (env.DB) {
        const row = await env.DB.prepare('SELECT value FROM admin_config WHERE key = ?')
          .bind('models_config')
          .first<{ value: string }>();
        if (row?.value) {
          try {
            return jsonResponse({ success: true, endpoints: JSON.parse(row.value) });
          } catch {}
        }
      }
      return jsonResponse({ success: true, endpoints: null });
    }

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');

    // 2. User Authentication (Register / Login with Password Protection)
    if (pathname === '/api/user/auth' && request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as {
        email?: string;
        name?: string;
        password?: string;
      };
      const { email, name, password } = body;
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
          password_hash?: string;
        }>();

      if (user) {
        // Existing user: strictly verify password if set; prevent unauthorized account claim if unset
        if (user.password_hash) {
          if (!password) {
            return jsonResponse({ success: false, error: '请输入账户密码' }, 401);
          }
          const valid = await verifyHashedPassword(password, user.password_hash);
          if (!valid) {
            return jsonResponse({ success: false, error: '账户密码错误，请核对凭证' }, 401);
          }
        } else {
          // Pre-created managed accounts without password cannot be claimed without explicit admin initialization
          return jsonResponse({
            success: false,
            error: '该受管账户尚未激活初始密码，请联系管理员获取凭证。',
          }, 403);
        }
      } else {
        // New user registration: require password (at least 6 chars) and grant 4 trial credits
        if (!password || password.length < 6) {
          return jsonResponse({ success: false, error: '新用户注册必须设置至少 6 位密码' }, 400);
        }
        const userId = 'usr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
        const displayName = typeof name === 'string' && name.trim() ? name.trim() : email.split('@')[0];
        const now = new Date().toISOString();
        const pwdHash = await hashPasswordWithSalt(password);

        await env.DB.prepare(`
          INSERT INTO users (id, email, name, plan, credits_balance, credits_total, api_calls_count, status, password_hash, created_at)
          VALUES (?, ?, ?, 'free', 4, 4, 0, 'active', ?, ?)
        `).bind(userId, email.toLowerCase(), displayName, pwdHash, now).run();

        user = {
          id: userId,
          email: email.toLowerCase(),
          name: displayName,
          plan: 'free',
          credits_balance: 4,
          credits_total: 4,
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

    // 4. Server-Authoritative User Credit Deduction
    if (pathname === '/api/user/deduct-credits' && request.method === 'POST') {
      if (!env.DB) return jsonResponse({ success: false, error: 'Database unavailable' }, 503);
      if (!token) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const session = await env.DB.prepare('SELECT user_id FROM user_sessions WHERE token = ? AND expires_at > ?')
        .bind(token, Date.now())
        .first<{ user_id: string }>();

      if (!session) return jsonResponse({ success: false, error: 'Invalid or expired session' }, 401);

      const body = (await request.json().catch(() => ({}))) as { credits?: number };
      const credits = typeof body.credits === 'number' ? Math.floor(body.credits) : 0;
      if (credits <= 0) {
        return jsonResponse({ success: false, error: 'Invalid credits amount' }, 400);
      }

      const res = await env.DB.prepare(`
        UPDATE users
        SET credits_balance = credits_balance - ?, api_calls_count = api_calls_count + 1
        WHERE id = ? AND status = 'active' AND credits_balance >= ?
      `).bind(credits, session.user_id, credits).run();

      if (!res.meta.changes || res.meta.changes === 0) {
        return jsonResponse({ success: false, error: '积分余额不足或账号异常，无法继续生成' }, 400);
      }

      const updated = await env.DB.prepare('SELECT credits_balance FROM users WHERE id = ?')
        .bind(session.user_id)
        .first<{ credits_balance: number }>();

      return jsonResponse({
        success: true,
        remaining: updated?.credits_balance ?? 0,
      });
    }

    // 5. Admin Login with dual username and password credentials
    if (pathname === '/api/admin/login' && request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
      let expectedUser = (env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
      let expectedPass = (env.ADMIN_PASSWORD || 'admin888').trim();

      // Check if custom credentials are saved in D1 admin_config
      if (env.DB) {
        const storedUser = await env.DB.prepare('SELECT value FROM admin_config WHERE key = ?')
          .bind('admin_username')
          .first<{ value: string }>();
        const storedPass = await env.DB.prepare('SELECT value FROM admin_config WHERE key = ?')
          .bind('admin_password')
          .first<{ value: string }>();

        if (storedUser?.value) expectedUser = storedUser.value.trim().toLowerCase();
        if (storedPass?.value) expectedPass = storedPass.value.trim();
      }

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

    // 6. Admin Protected Endpoints
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

      // Fetch Store (Users, Subscriptions, Invoices)
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

      // D1 Write: Adjust User Credits
      if (pathname === '/api/admin/users/credits' && request.method === 'POST') {
        const { userId, delta } = (await request.json().catch(() => ({}))) as { userId?: string; delta?: number };
        if (!userId || typeof delta !== 'number' || isNaN(delta)) {
          return jsonResponse({ success: false, error: 'Invalid user or delta amount' }, 400);
        }
        await env.DB.prepare(`
          UPDATE users SET credits_balance = MAX(0, credits_balance + ?),
            credits_total = CASE WHEN ? > 0 THEN credits_total + ? ELSE credits_total END
          WHERE id = ?
        `).bind(delta, delta, delta, userId).run();

        const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<any>();
        return jsonResponse({ success: true, user: updated });
      }

      // D1 Write: Update User Account Status (active / suspended)
      if (pathname === '/api/admin/users/status' && request.method === 'POST') {
        const { userId, status } = (await request.json().catch(() => ({}))) as { userId?: string; status?: string };
        if (!userId || !['active', 'suspended'].includes(status || '')) {
          return jsonResponse({ success: false, error: 'Invalid userId or status' }, 400);
        }
        await env.DB.prepare('UPDATE users SET status = ? WHERE id = ?').bind(status, userId).run();
        return jsonResponse({ success: true, userId, status });
      }

      // D1 Write: Create Managed User
      if (pathname === '/api/admin/users/create' && request.method === 'POST') {
        const body = (await request.json().catch(() => ({}))) as any;
        const { name, email, plan, credits, creditsBalance, password } = body;
        if (!email || !name) {
          return jsonResponse({ success: false, error: 'Name and email are required' }, 400);
        }
        const userId = 'usr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
        const initCredits = typeof credits === 'number' ? credits : typeof creditsBalance === 'number' ? creditsBalance : 1000;
        const now = new Date().toISOString();
        const initialPwd = typeof password === 'string' && password.length >= 6 ? password : 'User888!';
        const pwdHash = await hashPasswordWithSalt(initialPwd);

        await env.DB.prepare(`
          INSERT INTO users (id, email, name, plan, credits_balance, credits_total, api_calls_count, status, password_hash, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 0, 'active', ?, ?)
        `).bind(userId, email.toLowerCase(), name.trim(), plan || 'pro', initCredits, initCredits, pwdHash, now).run();

        return jsonResponse({
          success: true,
          user: {
            id: userId,
            email: email.toLowerCase(),
            name: name.trim(),
            plan: plan || 'pro',
            creditsBalance: initCredits,
            creditsTotal: initCredits,
            status: 'active',
            createdAt: now,
          },
          initialPassword: initialPwd,
        });
      }

      // D1 Write: Persist Billing Configuration
      if (pathname === '/api/admin/billing' && request.method === 'POST') {
        const body = (await request.json().catch(() => ({}))) as { config?: any };
        if (!body.config) {
          return jsonResponse({ success: false, error: 'Billing config required' }, 400);
        }
        await env.DB.prepare(`
          INSERT INTO admin_config (key, value) VALUES ('billing_config', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).bind(JSON.stringify(body.config)).run();
        return jsonResponse({ success: true, config: body.config });
      }

      // D1 Write: Persist Model Endpoints Configuration
      if (pathname === '/api/admin/models' && request.method === 'POST') {
        const body = (await request.json().catch(() => ({}))) as { endpoints?: any };
        if (!Array.isArray(body.endpoints)) {
          return jsonResponse({ success: false, error: 'Endpoints array required' }, 400);
        }
        await env.DB.prepare(`
          INSERT INTO admin_config (key, value) VALUES ('models_config', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).bind(JSON.stringify(body.endpoints)).run();
        return jsonResponse({ success: true, count: body.endpoints.length });
      }

      // D1 Write: Persist Admin Credentials (Username and Password)
      if (pathname === '/api/admin/credentials' && request.method === 'POST') {
        const { currentPassword, newUsername, newPassword } = (await request.json().catch(() => ({}))) as any;
        let expectedPass = (env.ADMIN_PASSWORD || 'admin888').trim();
        const storedPass = await env.DB.prepare('SELECT value FROM admin_config WHERE key = ?')
          .bind('admin_password')
          .first<{ value: string }>();
        if (storedPass?.value) expectedPass = storedPass.value.trim();

        if (currentPassword?.trim() !== expectedPass) {
          return jsonResponse({ success: false, error: '当前旧密码输入错误' }, 401);
        }
        if (typeof newPassword !== 'string' || newPassword.length < 6) {
          return jsonResponse({ success: false, error: '新密码不能少于 6 个字符' }, 400);
        }

        const writes = [
          env.DB.prepare(`
            INSERT INTO admin_config (key, value) VALUES ('admin_password', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
          `).bind(newPassword.trim()),
        ];
        if (newUsername && typeof newUsername === 'string') {
          writes.push(
            env.DB.prepare(`
              INSERT INTO admin_config (key, value) VALUES ('admin_username', ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `).bind(newUsername.trim())
          );
        }
        await env.DB.batch(writes);
        return jsonResponse({ success: true });
      }
    }

    // 7. Stripe Checkout Session Creation
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
