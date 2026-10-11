/**
 * Commercial Backend API Client
 *
 * Provides bridge to server-side commercial microservice:
 * - Probes server health status
 * - Creates official Stripe Checkout Sessions
 * - Reports offline/unready state without implying a successful payment
 */

export interface BackendHealthStatus {
  isOnline: boolean;
  stripeConfigured: boolean;
  paypalConfigured: boolean;
  paypalMode?: string;
}

let cachedHealth: BackendHealthStatus | null = null;
let lastProbeTime = 0;

/**
 * Checks if the Node.js commercial backend service is running on /api
 */
export async function probeBackendHealth(): Promise<BackendHealthStatus> {
  const now = Date.now();
  // Cache probe result for 10 seconds to avoid excessive network traffic
  if (cachedHealth && now - lastProbeTime < 10000) {
    return cachedHealth;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch('/api/health', {
      method: 'GET',
      signal: controller.signal,
    });

    if (res.ok) {
      const data = await res.json();
      cachedHealth = {
        isOnline: true,
        stripeConfigured: Boolean(data.gateways?.stripeConfigured),
        paypalConfigured: Boolean(data.gateways?.paypalConfigured),
        paypalMode: data.gateways?.paypalMode,
      };
      lastProbeTime = now;
      return cachedHealth;
    }
  } catch {
    // Connectivity probe only: callers must not grant payment rights on failure.
  } finally {
    clearTimeout(timer);
  }

  cachedHealth = {
    isOnline: false,
    stripeConfigured: false,
    paypalConfigured: false,
  };
  lastProbeTime = now;
  return cachedHealth;
}

/**
 * Requests official Stripe Checkout session from backend
 */
export async function createServerStripeCheckout(params: {
  plan: 'pro' | 'enterprise';
  billingCycle: 'monthly' | 'yearly';
  userId?: string;
  userEmail?: string;
}): Promise<{ success: boolean; checkoutUrl?: string; error?: string }> {
  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('panorama_server_user_token') : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch('/api/stripe/create-checkout-session', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (res.ok && data.checkoutUrl) {
      return { success: true, checkoutUrl: data.checkoutUrl };
    }
    return { success: false, error: data.error || 'Failed to create Stripe checkout session' };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error reaching payment server',
    };
  }
}

/**
 * Registers or authenticates a user on the commercial backend
 */
export async function authServerUser(
  email: string,
  name?: string
): Promise<{ success: boolean; user?: any; token?: string; error?: string }> {
  try {
    const res = await fetch('/api/user/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, name }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      if (data.token && typeof localStorage !== 'undefined') {
        localStorage.setItem('panorama_server_user_token', data.token);
      }
      return data;
    }
    return { success: false, error: data.error || 'Authentication failed' };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error reaching auth service',
    };
  }
}

/**
 * Fetches current verified user profile from commercial backend
 */
export async function fetchServerUser(token?: string): Promise<{
  success: boolean;
  user?: any;
  error?: string;
}> {
  try {
    const authToken =
      token ||
      (typeof localStorage !== 'undefined'
        ? localStorage.getItem('panorama_server_user_token')
        : null);
    if (!authToken) return { success: false, error: 'No active session token' };

    const res = await fetch('/api/user/me', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    }
    return { success: false, error: 'Session expired or invalid' };
  } catch {
    return { success: false, error: 'Network error checking user profile' };
  }
}
