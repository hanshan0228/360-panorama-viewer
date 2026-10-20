/** Combine cancellation signals on browsers that predate AbortSignal.any. */
export function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals);
  const controller = new AbortController();
  const abort = (signal: AbortSignal) => {
    controller.abort(signal.reason);
    for (const source of signals) source.removeEventListener('abort', onAbort);
  };
  const onAbort = (event: Event) => abort(event.target as AbortSignal);
  const aborted = signals.find(signal => signal.aborted);
  if (aborted) abort(aborted);
  else for (const signal of signals) signal.addEventListener('abort', onAbort, { once: true });
  return controller.signal;
}
