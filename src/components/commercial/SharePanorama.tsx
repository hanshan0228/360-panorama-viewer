import { preparePanoramaShare } from '../../utils/imageOptimizer';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { SphereViewer } from '../SphereViewer';

type Share = { id: string; title: string; width: number; height: number; allowDownload: boolean; createdAt: number; revoked?: boolean };
const linkFor = (id: string) => `${window.location.origin}/s/${id}`;
const button = 'rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-40 disabled:cursor-wait';

async function shareApi(token: string | null, path = '', init: RequestInit = {}, signal?: AbortSignal) {
  if (localStorage.getItem('panorama_server_user_token') !== token) throw new Error('Account changed. Reopen sharing.');
  const response = await fetch(`/api/shares${path}`, { ...init,
    signal: AbortSignal.any([AbortSignal.timeout(90000), ...(signal ? [signal] : [])]),
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Sharing request failed');
  return data;
}

export function SharePanoramaModal({ isOpen, onClose, imageUrl, accountId }: { isOpen: boolean; onClose: () => void; imageUrl: string; accountId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const [title, setTitle] = useState('My panorama');
  const [allowDownload, setAllowDownload] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const token = localStorage.getItem('panorama_server_user_token');

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const abort = new AbortController();
    controller.current = abort;
    // oxlint-disable-next-line react/set-state-in-effect
    setShares([]); setError(''); setNotice(''); setBusy(true);
    dialog.current?.showModal();
    void shareApi(token, '', {}, abort.signal).then(data => {
      if (!abort.signal.aborted) setShares(data.shares);
    }).catch(err => { if (!abort.signal.aborted) setError(err.message); })
      .finally(() => { if (!abort.signal.aborted) setBusy(false); });
    const node = dialog.current;
    return () => { abort.abort(); node?.close(); previousFocus?.focus(); };
    // The captured account session owns all requests made while this dialog is open.
  }, [isOpen, accountId, token]);

  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    const signal = controller.current?.signal;
    if (!signal || signal.aborted || localStorage.getItem('panorama_server_user_token') !== token) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(signal); }
    catch (err) { if (!signal.aborted && localStorage.getItem('panorama_server_user_token') === token) setError(err instanceof Error ? err.message : 'Sharing failed'); }
    finally { if (!signal.aborted && localStorage.getItem('panorama_server_user_token') === token) setBusy(false); }
  };

  const upload = () => run(async signal => {
    if (!title.trim() || title.trim().length > 100) throw new Error('Enter a title up to 100 characters.');
    const response = await fetch(imageUrl, { signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]) });
    if (!response.ok) throw new Error('The panorama could not be loaded.');
    const prepared = await preparePanoramaShare(await response.blob(), signal);
    const { blob } = prepared;
    signal.throwIfAborted();
    const query = new URLSearchParams({ title: title.trim(), allowDownload: allowDownload ? '1' : '0' });
    const data = await shareApi(token, `?${query}`, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob }, signal);
    if (signal.aborted || localStorage.getItem('panorama_server_user_token') !== token) return;
    setShares(prev => [data.share, ...prev]); setNotice(`Link created. Sharing copy: ${prepared.width} × ${prepared.height}, ${(blob.size / 1024 / 1024).toFixed(1)} MB${prepared.compressed ? ' (JPEG compressed)' : ''}. Your original image is unchanged.`);
  });

  const update = (share: Share, revoke = false) => run(async signal => {
    await shareApi(token, `/${share.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(revoke ? { action: 'revoke' } : { allowDownload: !share.allowDownload }) }, signal);
    if (!signal.aborted && localStorage.getItem('panorama_server_user_token') === token) setShares(prev => prev.map(row => row.id === share.id ? { ...row, revoked: revoke, allowDownload: revoke ? row.allowDownload : !row.allowDownload } : row));
  });

  if (!isOpen) return null;
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="share-title" className="m-auto w-[min(94vw,640px)] max-h-[88vh] overflow-auto rounded-3xl border border-cyan-400/25 bg-[#081626] p-6 text-slate-100 shadow-2xl backdrop:bg-black/75">
    <div className="flex items-center justify-between gap-4"><h2 id="share-title" className="text-xl font-semibold">Share your panorama</h2><button type="button" onClick={onClose} aria-label="Close sharing" className={button}>Close</button></div>
    <p className="mt-3 text-sm text-slate-300">Anyone with the link can explore this panorama without signing in. Share only images you have permission to publish.</p>
    <p className="mt-2 text-xs text-slate-400">Large images are automatically compressed for sharing · 10 active links · 5 new links per day · 100 MiB per account, subject to site capacity. New links may take about a minute to load in other regions.</p>
    <label className="mt-5 block text-sm">Panorama title<input value={title} maxLength={100} onChange={event => setTitle(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 p-3" /></label>
    <label className="my-4 flex items-center gap-3 text-sm"><input type="checkbox" checked={allowDownload} onChange={event => setAllowDownload(event.target.checked)} />Show the sharing-copy download button</label>
    <p className="mb-4 text-xs text-slate-400">Only the sharing copy is compressed; your original stays unchanged. Viewers download the sharing copy. Hiding downloads does not prevent viewers from saving the displayed image. Revocation stops future access; it cannot remove saved copies.</p>
    <button type="button" disabled={busy || !imageUrl} onClick={upload} className={button}>{busy ? 'Working…' : 'Create share link'}</button>
    {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
    {notice && <p role="status" className="mt-4 text-sm text-teal-300">{notice}</p>}
    <h3 className="mt-6 font-semibold">Your shared panoramas</h3>
    {!busy && !shares.length && <p className="mt-3 text-sm text-slate-400">No shared panoramas yet.</p>}
    <ul className="mt-3 space-y-3">{shares.map(share => <li key={share.id} className="rounded-2xl border border-slate-700 p-4">
      <p className="break-words font-medium">{share.title} {share.revoked && <span className="text-rose-300">· Revoked</span>}</p><p className="mt-1 text-xs text-slate-400">{share.width} × {share.height}</p>
      {!share.revoked && <><input aria-label={`Share link for ${share.title}`} readOnly value={linkFor(share.id)} onFocus={event => event.target.select()} className="my-3 w-full rounded-lg bg-slate-950 p-2 text-xs" /><div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={() => { if (!navigator.clipboard?.writeText) { setError('Select and copy the link above.'); return; } void navigator.clipboard.writeText(linkFor(share.id)).then(() => setNotice('Link copied.')).catch(() => setError('Copy failed. Select and copy the link above.')); }}>Copy link</button>
        <a className={button} href={linkFor(share.id)} target="_blank" rel="noopener noreferrer">Open</a>
        <button type="button" disabled={busy} className={button} onClick={() => update(share)}>{share.allowDownload ? 'Hide download' : 'Allow download'}</button>
        <button type="button" disabled={busy} className={button} onClick={() => update(share, true)}>Revoke link</button>
      </div></>}
    </li>)}</ul>
  </dialog>;
}

class SharedViewerBoundary extends Component<{ imageUrl: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="p-5"><p role="status" className="mb-4">Interactive viewing is unavailable in this browser. The full panorama is shown below.</p><img src={this.props.imageUrl} alt="Full panorama in flat 2:1 projection" className="w-full" /></div> : this.props.children;
  }
}

export function SharedPanorama({ id }: { id: string }) {
  const [share, setShare] = useState<Share | null>(null);
  const [error, setError] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); let localUrl = '';
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(45000)]);
    // oxlint-disable-next-line react/set-state-in-effect
    setError(''); setShare(null); setImageUrl('');
    const load = async () => {
      const metaResponse = await fetch(`/api/shares/${id}`, { signal });
      const data = await metaResponse.json().catch(() => ({}));
      if (!metaResponse.ok) throw new Error(data.error || 'This panorama is unavailable.');
      const imageResponse = await fetch(`/api/shares/${id}/image`, { signal });
      if (!imageResponse.ok) throw new Error((await imageResponse.json().catch(() => ({}))).error || 'The panorama image is unavailable.');
      localUrl = URL.createObjectURL(await imageResponse.blob());
      if (abort.signal.aborted) { URL.revokeObjectURL(localUrl); return; }
      setShare(data.share); setImageUrl(localUrl); document.title = `${data.share.title} — PanoramaAI`;
    };
    void load().catch(err => { if (!abort.signal.aborted) setError(err.message); });
    return () => { abort.abort(); if (localUrl) URL.revokeObjectURL(localUrl); };
  }, [id, attempt]);
  return <main className="flex min-h-screen flex-col bg-[#040c1a] text-slate-100">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700 px-5 py-4"><div><a href="/" className="text-xs font-semibold tracking-widest text-teal-300">PANORAMAAI STUDIO</a><h1 className="mt-1 text-xl font-semibold">{share?.title || 'Shared panorama'}</h1></div><div className="flex flex-wrap gap-2">{share?.allowDownload && <a href={`/api/shares/${id}/download`} className={button}>Download shared panorama</a>}<a href="/" className={button}>Create my own panorama</a></div></header>
    {error ? <div className="m-auto max-w-lg p-8 text-center"><p role="alert">{error}</p><button type="button" className={`${button} mt-4`} onClick={() => setAttempt(value => value + 1)}>Try again</button></div> : imageUrl ? <><p className="px-5 py-3 text-sm text-slate-300">Drag to look around · Scroll or pinch to zoom · Use the viewer controls for fullscreen</p><SharedViewerBoundary key={imageUrl} imageUrl={imageUrl}><SphereViewer textureUrl={imageUrl} initialAutoRotate={false} className="min-h-[65vh] flex-1" /></SharedViewerBoundary><p className="px-5 py-3 text-xs text-slate-400">{share?.width} × {share?.height} · Full 2:1 panorama</p></> : <p role="status" className="m-auto p-8">Loading the full panorama…</p>}
  </main>;
}
