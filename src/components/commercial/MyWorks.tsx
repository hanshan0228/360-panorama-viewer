import { useLanguage, useTranslation } from '../../utils/i18n';
import { commerceMessages } from '../../utils/commerceTranslations';
import { useEffect, useRef, useState } from 'react';
import { Image, LockKeyhole } from 'lucide-react';
import { combineAbortSignals } from '../../utils/abortSignal';
import { saveWorkThumbnail } from '../../utils/workThumbnail';

type Work = { id: string; prompt: string; model: string; width: number; height: number; mime: string; created_at: number; thumbnail: string | null };
const button = 'min-h-10 rounded-xl border border-cyan-400/30 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-400/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:opacity-40';

export function MyWorks({ isOpen, accountId, onClose, onOpen }: { isOpen: boolean; accountId: string; onClose: () => void; onOpen: (original: string, share: boolean, signal: AbortSignal, prompt: string) => Promise<void> }) {
  const t = useTranslation(commerceMessages);
  const [lang] = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const thumbnailController = useRef<AbortController | null>(null);
  const invalidThumbnails = useRef(new Set<string>());
  const [works, setWorks] = useState<Work[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<{ id: string; imageUrl: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const token = localStorage.getItem('panorama_server_user_token');
  const api = async (path: string, init: RequestInit = {}, signal?: AbortSignal) => {
    if (localStorage.getItem('panorama_server_user_token') !== token) throw new Error('Account changed. Reopen My works.');
    const response = await fetch(`/api/works${path}`, { ...init, headers: { Authorization: `Bearer ${token || ''}` }, signal: combineAbortSignals([AbortSignal.timeout(90000), ...(signal ? [signal] : [])]) });
    const data = await response.json().catch(() => ({}));
    signal?.throwIfAborted();
    if (localStorage.getItem('panorama_server_user_token') !== token) throw new Error('Account changed.');
    if (!response.ok) throw new Error(data.error || 'Could not load your works.');
    return data;
  };
  useEffect(() => {
    const abort = new AbortController();
    thumbnailController.current = abort;
    const onStorage = (event: StorageEvent) => {
      if ((event.key === 'panorama_server_user_token' || event.key === null) && localStorage.getItem('panorama_server_user_token') !== token) abort.abort();
    };
    window.addEventListener('storage', onStorage);
    return () => { abort.abort(); window.removeEventListener('storage', onStorage); };
  }, [accountId, token]);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = dialog.current; node?.showModal();
    setQuery('');
    return () => { node?.close(); previous?.focus(); };
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const abort = new AbortController(); controller.current = abort;
    invalidThumbnails.current.clear();
    setWorks([]); setPreview(null); setLoaded(false); setError(''); setBusy(true);
    void api('', {}, abort.signal).then(data => { setWorks(data.works); setLoaded(true); }).catch(err => { if (!abort.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load your works.'); }).finally(() => { if (!abort.signal.aborted) setBusy(false); });
    return () => { abort.abort(); setPreview(null); };
    // Each request captures one account session; cleanup cancels pending operations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, accountId, token, attempt]);
  const act = async (work: Work, action: 'open' | 'share' | 'download' | 'delete' | 'preview') => {
    const signal = controller.current?.signal;
    if (!signal || signal.aborted) return;
    if (action === 'delete' && !window.confirm(t('Permanently delete this cloud original? Download it first if you want to keep it.'))) return;
    setBusy(true); setError('');
    try {
      if (action === 'delete') {
        await api(`/${work.id}`, { method: 'POST' }, signal);
        setWorks(items => items.filter(item => item.id !== work.id));
        setPreview(current => current?.id === work.id ? null : current);
      } else {
        const { imageUrl } = await api(`/${work.id}/original`, {}, signal);
        const thumbnailSignal = thumbnailController.current?.signal;
        if (!work.thumbnail && !invalidThumbnails.current.has(work.id) && token && thumbnailSignal && !thumbnailSignal.aborted) {
          void saveWorkThumbnail(work.id, imageUrl, token, thumbnailSignal).then(thumbnail => {
            if (!thumbnailSignal.aborted && dialog.current?.open && localStorage.getItem('panorama_server_user_token') === token) {
              setWorks(items => items.map(item => item.id === work.id ? { ...item, thumbnail } : item));
            }
          }).catch(() => {}); // Thumbnail saving is optional and never delays the original action.
        }
        if (action === 'preview') {
          setPreview({ id: work.id, imageUrl });
        } else if (action === 'download') {
          const blob = await (await fetch(imageUrl, { signal })).blob(); signal.throwIfAborted(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `panorama-${work.id}.${work.mime === 'image/jpeg' ? 'jpg' : (work.mime.split('/')[1] || 'png')}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else {
          await onOpen(imageUrl, action === 'share', signal, work.prompt);
          signal.throwIfAborted(); onClose();
        }
      }
    } catch (err) { if (!signal.aborted) setError(action === 'preview' ? `${t('Preview failed.')} ${t(err instanceof Error ? err.message : 'Request failed. Please retry.')}` : err instanceof Error ? err.message : 'Request failed. Please retry.'); }
    finally { if (!signal.aborted) setBusy(false); }
  };
  const visibleWorks = works.filter(work => `${work.prompt} ${work.model}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="works-title" className="m-auto max-h-[90dvh] w-[min(94vw,960px)] overflow-auto rounded-2xl border border-cyan-400/30 bg-slate-950 p-4 text-white shadow-2xl backdrop:bg-black/70 sm:p-6">
    <div className="flex items-start justify-between gap-4"><div><p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-cyan-300"><LockKeyhole size={14} aria-hidden="true" />{t('Private library')}</p><h2 id="works-title" className="mt-1 text-2xl font-bold">{t('My Creations')}</h2></div><button type="button" className={button} onClick={onClose}>{t('Close')}</button></div>
    <p className="mt-3 text-sm leading-relaxed text-slate-300">{t('Only panoramas successfully saved to this account appear here. Earlier unsaved images cannot be recovered.')}</p>
    <details className="mt-2 text-sm text-slate-400"><summary className="cursor-pointer text-cyan-200">{t('Storage details')}</summary><p className="mt-2">{t('Private originals saved to your account · Up to 50 works, 48 MB per original. Cloud capacity: free accounts 128 MiB, paid accounts 512 MiB (stored size). Save also depends on available site capacity. New generations save automatically. Earlier unsaved images cannot be recovered.')}</p></details>
    {loaded && works.length > 0 && <div className="mt-5 flex flex-wrap items-end justify-between gap-3"><label className="w-full text-sm text-slate-300 sm:w-72">{t('Search creations')}<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Search prompts or models')} className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-white placeholder:text-slate-400 focus:outline-2 focus:outline-cyan-300" /></label><p className="text-sm text-slate-400">{visibleWorks.length} / {works.length}</p></div>}
    {error && <div role="alert" className="mt-4 rounded-xl border border-amber-400/30 bg-amber-950/30 p-3 text-sm text-amber-100"><p>{t(error)}</p>{!loaded && <button type="button" className={`${button} mt-3`} onClick={() => setAttempt(value => value + 1)}>{t('Try again')}</button>}</div>}
    {busy && <p role="status" className="mt-4 text-sm text-cyan-100">{t(loaded ? 'Working…' : 'Loading…')}</p>}
    {loaded && works.length === 0 && <div className="mt-5 rounded-2xl border border-dashed border-slate-600 p-8 text-center"><Image size={32} className="mx-auto text-cyan-300" aria-hidden="true" /><h3 className="mt-3 font-semibold">{t('No saved creations yet')}</h3><p className="mt-2 text-sm text-slate-300">{t('Generate while signed in, and check the save status before leaving the result.')}</p></div>}
    {loaded && works.length > 0 && visibleWorks.length === 0 && <p className="py-8 text-center text-sm text-slate-300">{t('No creations match your search.')}</p>}
    <ul className="mt-5 grid gap-4 sm:grid-cols-2">{visibleWorks.map(work => <li key={work.id} className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/70">
      <div className="flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br from-cyan-950 via-slate-800 to-indigo-950">{preview?.id === work.id ? <img src={preview.imageUrl} alt={t('Panorama preview')} className="h-full w-full object-contain" onError={() => { setPreview(null); setError('Could not display this preview. Please try again.'); }} /> : work.thumbnail ? <img src={work.thumbnail} alt={t('Panorama preview')} className="h-full w-full object-contain" onError={() => { invalidThumbnails.current.add(work.id); setWorks(items => items.map(item => item.id === work.id ? { ...item, thumbnail: null } : item)); }} /> : <Image size={32} className="text-cyan-300/70" aria-hidden="true" />}</div>
      <div className="p-4"><p className="whitespace-pre-wrap break-words font-medium">{work.prompt || t('Untitled panorama')}</p>
        <dl className="my-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-300"><dt className="text-slate-400">{t('Created')}</dt><dd>{new Date(work.created_at).toLocaleString(lang)}</dd><dt className="text-slate-400">{t('Dimensions')}</dt><dd>{work.width} × {work.height} px</dd><dt className="text-slate-400">{t('Model')}</dt><dd className="break-words">{work.model}</dd></dl>
        <p className="mb-2 text-xs text-slate-400">{t('Loading a preview uses one daily original read.')}</p>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className={button} onClick={() => preview?.id === work.id ? setPreview(null) : void act(work, 'preview')}>{t(preview?.id === work.id ? 'Hide preview' : 'Load preview')}</button>{(['open', 'download', 'share', 'delete'] as const).map(action => <button type="button" key={action} disabled={busy} className={button} onClick={() => void act(work, action)}>{t(({ open: 'Open panorama', download: 'Download original', share: 'Share', delete: 'Delete' })[action])}</button>)}</div>
      </div></li>)}</ul>
  </dialog>;
}
