export const MODEL_FAILURE_COOLDOWN_MS = 3 * 60_000;

const keyFor = endpoint => `model-health:${String(endpoint?.id || endpoint?.model || 'model')}:${String(endpoint?.model || '')}`;

export async function modelCoolingDown(storage, endpoint, now = Date.now()) {
  if (!storage || typeof storage.get !== 'function') return null;
  try {
    const raw = await storage.get(keyFor(endpoint));
    if (!raw) return null;
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return value && Number.isFinite(value.until) && value.until > now ? value : null;
  } catch {
    return null;
  }
}

export async function markModelFailure(storage, endpoint, reason, now = Date.now()) {
  if (!storage || typeof storage.put !== 'function') return;
  try {
    await storage.put(keyFor(endpoint), JSON.stringify({
      until: now + MODEL_FAILURE_COOLDOWN_MS,
      reason: String(reason).slice(0, 80),
    }), { expirationTtl: Math.ceil(MODEL_FAILURE_COOLDOWN_MS / 1000) });
  } catch {
    // A health-cache failure must never block generation or billing.
  }
}

export async function clearModelFailure(storage, endpoint) {
  if (!storage || typeof storage.delete !== 'function') return;
  try {
    await storage.delete(keyFor(endpoint));
  } catch {
    // Best effort only.
  }
}

export function createMemoryModelHealthStore() {
  const values = new Map();
  return {
    async get(key) { return values.get(key) ?? null; },
    async put(key, value) { values.set(key, value); },
    async delete(key) { values.delete(key); },
  };
}
