type EventParams = Record<string, unknown>;

function gtag() {
  if (typeof window === 'undefined') return undefined;
  const fn = (window as any).gtag;
  return typeof fn === 'function' ? fn : undefined;
}

export function track(event: string, params?: EventParams) {
  const fn = gtag();
  if (!fn) return;
  try {
    fn('event', event, params);
  } catch {
    // Analytics must never break checkout or generation.
  }
}

/**
 * Fires `purchase` at most once per key. Used after the server confirms money
 * changed hands, so a page refresh or a second PayPal return cannot double-count.
 */
export function trackPurchaseOnce(key: string, params: EventParams) {
  if (!gtag() || !key) return;
  const storageKey = `panorama_ga_purchase:${key}`;
  try {
    if (localStorage.getItem(storageKey)) return;
    localStorage.setItem(storageKey, '1');
  } catch {
    return;
  }
  track('purchase', params);
}
