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
  name?: string,
  password?: string
): Promise<{ success: boolean; user?: any; token?: string; error?: string }> {
  try {
    const res = await fetch('/api/user/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, name, password }),
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

/**
 * Publicly fetches active billing configuration from server if available
 */
export async function fetchPublicBillingConfig(): Promise<any | null> {
  try {
    const res = await fetch('/api/billing');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.config) return data.config;
    }
  } catch {
    // fallback
  }
  return null;
}

function getAdminHeaders(): Record<string, string> {
  const token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('panorama_admin_server_token') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function adminAdjustUserCreditsServer(userId: string, delta: number): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/users/credits', {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ userId, delta }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function adminUpdateUserStatusServer(userId: string, status: 'active' | 'suspended'): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/users/status', {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ userId, status }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function adminCreateUserServer(userData: { name: string; email: string; plan?: string; credits?: number }): Promise<any | null> {
  try {
    const res = await fetch('/api/admin/users/create', {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify(userData),
    });
    if (res.ok) {
      const data = await res.json();
      return data.user || null;
    }
  } catch {
    // fallback
  }
  return null;
}

export async function adminSaveBillingConfigServer(config: any): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/billing', {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ config }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function adminUpdateCredentialsServer(currentPassword: string, newUsername?: string, newPassword?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/admin/credentials', {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ currentPassword, newUsername, newPassword }),
    });
    const data = await res.json();
    return { success: res.ok && data.success, error: data.error };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}
