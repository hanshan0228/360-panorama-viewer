import { useEffect, useRef, useState } from 'react';

type Work = { id: string; prompt: string; model: string; width: number; height: number; mime: string; created_at: number };
const button = 'rounded-xl border border-cyan-400/30 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-40';

export function MyWorks({ isOpen, accountId, onClose, onOpen }: { isOpen: boolean; accountId: string; onClose: () => void; onOpen: (original: string, share: boolean, signal: AbortSignal) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [works, setWorks] = useState<Work[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const token = localStorage.getItem('panorama_server_user_token');
  const api = async (path: string, init: RequestInit = {}, signal?: AbortSignal) => {
    if (localStorage.getItem('panorama_server_user_token') !== token) throw new Error('Account changed. Reopen My works.');
    const response = await fetch(`/api/works${path}`, { ...init, headers: { Authorization: `Bearer ${token || ''}` }, signal: AbortSignal.any([AbortSignal.timeout(90000), ...(signal ? [signal] : [])]) });
    const data = await response.json().catch(() => ({}));
    signal?.throwIfAborted();
    if (localStorage.getItem('panorama_server_user_token') !== token) throw new Error('Account changed.');
    if (!response.ok) throw new Error(data.error || 'Could not load your works.');
    return data;
  };
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const abort = new AbortController(); controller.current = abort;
    const node = dialog.current; node?.showModal();
    setWorks([]); setError(''); setBusy(true);
    void api('', {}, abort.signal).then(data => setWorks(data.works)).catch(err => { if (!abort.signal.aborted) setError(err.message); }).finally(() => { if (!abort.signal.aborted) setBusy(false); });
    return () => { abort.abort(); node?.close(); previous?.focus(); };
    // The dialog captures a single account session; cleanup cancels its pending requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, accountId, token]);
  const act = async (work: Work, action: 'open' | 'share' | 'download' | 'delete') => {
    const signal = controller.current?.signal;
    if (!signal || signal.aborted) return;
    if (action === 'delete' && !window.confirm('Permanently delete this cloud original? Download it first if you want to keep it.')) return;
    setBusy(true); setError('');
    try {
      if (action === 'delete') {
        await api(`/${work.id}`, { method: 'POST' }, signal);
        setWorks(items => items.filter(item => item.id !== work.id));
      } else {
        const { imageUrl } = await api(`/${work.id}/original`, {}, signal);
        if (action === 'download') {
          const blob = await (await fetch(imageUrl)).blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `panorama-${work.id}.${work.mime === 'image/jpeg' ? 'jpg' : (work.mime.split('/')[1] || 'png')}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else {
          await onOpen(imageUrl, action === 'share', signal);
          signal.throwIfAborted(); onClose();
        }
      }
    } catch (err) { if (!signal.aborted) setError(err instanceof Error ? err.message : 'Request failed. Please retry.'); }
    finally { if (!signal.aborted) setBusy(false); }
  };
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="works-title" className="m-auto max-h-[85dvh] w-[min(94vw,900px)] overflow-auto rounded-2xl border border-cyan-400/30 bg-slate-950 p-5 text-white backdrop:bg-black/70">
    <div className="flex items-center justify-between gap-4"><h2 id="works-title" className="text-xl font-bold">My works</h2><button className={button} onClick={onClose}>Close</button></div>
    <p className="my-3 text-sm text-slate-300">Private originals saved to your account · Up to 50 works, 48 MB per original. Cloud capacity: free accounts 128 MiB, paid accounts 512 MiB (stored size). Save also depends on available site capacity. New generations save automatically. Earlier unsaved images cannot be recovered.</p>
    {error && <p role="alert" className="my-3 text-amber-200">{error}</p>}
    {busy && <p role="status">Loading…</p>}
    {!busy && !error && works.length === 0 && <p className="py-8 text-slate-300">No saved works yet. Sign in and generate your first panorama.</p>}
    <ul className="space-y-3">{works.map(work => <li key={work.id} className="rounded-xl border border-slate-700 p-4">
      <p className="whitespace-pre-wrap break-words">{work.prompt || 'Untitled panorama'}</p>
      <p className="my-2 text-xs text-slate-400">{new Date(work.created_at).toLocaleString()} · {work.width} × {work.height} · {work.model}</p>
      <div className="flex flex-wrap gap-2">{(['open', 'download', 'share', 'delete'] as const).map(action => <button key={action} disabled={busy} className={button} onClick={() => void act(work, action)}>{({ open: 'Open panorama', download: 'Download original', share: 'Share', delete: 'Delete' })[action]}</button>)}</div>
    </li>)}</ul>
  </dialog>;
}
