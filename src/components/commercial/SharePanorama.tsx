import { preparePanoramaShare } from "../../utils/imageOptimizer";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { SphereViewer } from "../SphereViewer";

type Share = { id: string; title: string; width: number; height: number; allowDownload: boolean; listed?: boolean; createdAt: number; revoked?: boolean };
const getSubpath = () => {
  if (typeof window === "undefined" || !window.location || typeof window.location.pathname !== "string") return "";
  const pathname = window.location.pathname;
  const sIndex = pathname.indexOf("/s/");
  if (sIndex > 0) return pathname.slice(0, sIndex);
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length > 0 && (parts[0] === "360-panorama-viewer" || parts[0] === "panorama-generator")) return `/${parts[0]}`;
  return "";
};
const linkFor = (id: string) => `${typeof window !== "undefined" && window.location ? window.location.origin : ""}${getSubpath()}/s/${id}`;
const button = "rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-40 disabled:cursor-wait";

async function shareApi(token: string | null, path = "", init: RequestInit = {}, signal?: AbortSignal) {
  if (localStorage.getItem("panorama_server_user_token") !== token) throw new Error("Account changed. Reopen sharing.");
  const response = await fetch(`/api/shares${path}`, { ...init,
    signal: AbortSignal.any([AbortSignal.timeout(90000), ...(signal ? [signal] : [])]),
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Sharing request failed");
  return data;
}

export function SharePanoramaModal({
  isOpen,
  onClose,
  imageUrl,
  prompt,
  accountId,
}: {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  prompt?: string;
  accountId: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const [title, setTitle] = useState(() => (prompt || "").trim().slice(0, 80) || "My panorama");
  const [allowDownload, setAllowDownload] = useState(true);
  const [listed, setListed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newlyCreatedShareId, setNewlyCreatedShareId] = useState<string | null>(null);
  const [newlyCreatedUrl, setNewlyCreatedUrl] = useState<string | null>(null);
  const token = localStorage.getItem("panorama_server_user_token");

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const abort = new AbortController();
    controller.current = abort;
    // oxlint-disable-next-line react/set-state-in-effect
    setShares([]); setError(""); setNotice(""); setNewlyCreatedShareId(null); setNewlyCreatedUrl(null);
    setTitle((prompt || "").trim().slice(0, 80) || "My panorama");
    setListed(false);
    setBusy(true);
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    void shareApi(token, "", {}, abort.signal).then(data => {
      if (!abort.signal.aborted) setShares(data.shares || []);
    }).catch(err => { if (!abort.signal.aborted) setError(err.message); })
      .finally(() => { if (!abort.signal.aborted) setBusy(false); });
    const node = dialog.current;
    return () => { abort.abort(); node?.close(); previousFocus?.focus(); };
    // The captured account session owns all requests made while this dialog is open.
  }, [isOpen, accountId, token, imageUrl, prompt]);

  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    const signal = controller.current?.signal;
    if (!signal || signal.aborted || localStorage.getItem("panorama_server_user_token") !== token) return;
    setBusy(true); setError(""); setNotice("");
    try { await action(signal); }
    catch (err) { if (!signal.aborted && localStorage.getItem("panorama_server_user_token") === token) setError(err instanceof Error ? err.message : "Sharing failed"); }
    finally { if (!signal.aborted && localStorage.getItem("panorama_server_user_token") === token) setBusy(false); }
  };

  const upload = () => run(async signal => {
    if (!title.trim() || title.trim().length > 100) throw new Error("Enter a title up to 100 characters.");
    const response = await fetch(imageUrl, { signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]) });
    if (!response.ok) throw new Error("The panorama could not be loaded.");
    const prepared = await preparePanoramaShare(await response.blob(), signal);
    const { blob } = prepared;
    signal.throwIfAborted();
    const query = new URLSearchParams({ title: title.trim(), allowDownload: allowDownload ? "1" : "0", listed: listed ? "1" : "0" });
    const data = await shareApi(token, `?${query}`, { method: "POST", headers: { "Content-Type": blob.type }, body: blob }, signal);
    if (signal.aborted || localStorage.getItem("panorama_server_user_token") !== token) return;
    const newShare = data.share;
    const shareUrl = linkFor(newShare.id);
    setShares(prev => [newShare, ...prev.filter(row => row.id !== newShare.id)]);
    setNewlyCreatedShareId(newShare.id);
    setNewlyCreatedUrl(shareUrl);

    let copied = false;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        copied = true;
      } catch {
        copied = false;
      }
    }
    setNotice(copied
      ? `Share link created and copied to clipboard! (${prepared.width} × ${prepared.height}${prepared.compressed ? ", optimized JPEG" : ""})`
      : `Share link created! Copy the link above.`);
  });

  const update = (share: Share, body: Record<string, unknown>) => run(async signal => {
    await shareApi(token, `/${share.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, signal);
    if (!signal.aborted && localStorage.getItem("panorama_server_user_token") === token) setShares(prev => prev.map(row =>
      row.id === share.id ? { ...row, ...(body.action === "revoke" ? { revoked: true } : body) } : row));
  });

  if (!isOpen) return null;
  const isGuest = accountId.startsWith("usr_guest") || !token;
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="share-title" className="m-auto w-[min(94vw,660px)] max-h-[88vh] overflow-auto rounded-3xl border border-cyan-400/25 bg-[#081626] p-6 text-slate-100 shadow-2xl backdrop:bg-black/80">
    <div className="flex items-center justify-between gap-4">
      <h2 id="share-title" className="text-xl font-bold bg-gradient-to-r from-teal-200 to-cyan-300 bg-clip-text text-transparent">Share your panorama</h2>
      <button type="button" onClick={onClose} aria-label="Close sharing" className={button}>Close</button>
    </div>
    <p className="mt-2 text-sm text-slate-300">Anyone with the link can explore this 360° panorama interactively without signing in.</p>

    {/* Notice when newly created share link is available */}
    {newlyCreatedUrl && (
      <div className="mt-4 rounded-2xl border border-teal-400/50 bg-teal-950/60 p-4 shadow-lg shadow-teal-950/50">
        <div className="flex items-center gap-2 text-teal-300 font-semibold text-xs tracking-wider uppercase">
          <span className="flex h-2 w-2 rounded-full bg-teal-400 animate-pulse" />
          <span>New link for current panorama</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            readOnly
            value={newlyCreatedUrl}
            onFocus={event => event.target.select()}
            aria-label="Newly created share link"
            className="w-full rounded-xl border border-teal-500/40 bg-slate-950 p-2.5 text-xs text-teal-100 font-mono select-all"
          />
          <button
            type="button"
            className="shrink-0 rounded-xl bg-teal-400 text-slate-950 font-bold px-4 py-2.5 text-xs hover:bg-teal-300 active:scale-95 transition-all shadow-md cursor-pointer"
            onClick={() => {
              if (!navigator.clipboard?.writeText) { setError("Select and copy the link above."); return; }
              void navigator.clipboard.writeText(newlyCreatedUrl).then(() => setNotice("Link copied.")).catch(() => setError("Copy failed. Select and copy the link above."));
            }}
          >
            Copy link
          </button>
          <a className={`${button} shrink-0`} href={newlyCreatedUrl} target="_blank" rel="noopener noreferrer">Open ↗</a>
        </div>
      </div>
    )}

    {/* Current Panorama Share Card */}
    <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        {imageUrl && (
          <div className="relative shrink-0 w-32 h-16 rounded-xl overflow-hidden border border-slate-700 bg-slate-950 self-center sm:self-start">
            <img src={imageUrl} alt="Current panorama thumbnail" className="w-full h-full object-cover" />
            <span className="absolute bottom-1 right-1 text-[9px] bg-black/75 px-1.5 py-0.5 rounded font-mono text-cyan-200">2:1</span>
          </div>
        )}
        <div className="flex-1 w-full min-w-0">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Title for this share</label>
          <input
            value={title}
            maxLength={100}
            placeholder="My panorama"
            onChange={event => setTitle(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-600 bg-slate-950 p-2.5 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
          />
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
        <input type="checkbox" checked={allowDownload} onChange={event => setAllowDownload(event.target.checked)} className="rounded" />
        Allow viewers to download the sharing copy
      </label>

      <label className="mt-2 flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
        <input type="checkbox" checked={listed} onChange={event => setListed(event.target.checked)} className="mt-0.5 rounded" />
        <span>
          List publicly in the <a href="/showcase/" target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline hover:text-cyan-200">360 Panorama Showcase</a>
          <span className="block text-[11px] text-slate-400">Off by default. Public links are indexed by search engines and appear on the showcase page; you can unlist at any time.</span>
        </span>
      </label>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-3">
        <span className="text-[11px] text-slate-400">Only the sharing copy is compressed; your original image stays unchanged.</span>
        <button
          type="button"
          disabled={busy || !imageUrl || isGuest}
          onClick={upload}
          className="rounded-xl border border-teal-400/50 bg-teal-400/20 px-5 py-2 text-sm font-semibold text-teal-100 hover:bg-teal-400/30 disabled:opacity-40 disabled:cursor-wait active:scale-95 transition-all shadow-md cursor-pointer"
        >
          {busy ? "Working…" : newlyCreatedUrl ? "Update share link" : "Create share link"}
        </button>
      </div>
    </div>

    {/* Guest Warning */}
    {isGuest && (
      <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-950/40 p-3.5 text-xs text-amber-200">
        <p className="font-semibold text-amber-300">Free Account Required for Public Sharing</p>
        <p className="mt-1 text-slate-300">You are currently in guest preview mode. Sign in or register for a free account to generate permanent public share links.</p>
        <button
          type="button"
          onClick={() => {
            onClose();
            window.dispatchEvent(new CustomEvent("panorama-open-auth"));
          }}
          className="mt-2.5 rounded-xl border border-amber-400/40 bg-amber-400/20 px-3 py-1.5 font-semibold text-amber-100 hover:bg-amber-400/30 transition-all cursor-pointer"
        >
          Sign in / Register for free
        </button>
      </div>
    )}

    {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
    {notice && <p role="status" className="mt-4 text-sm text-teal-300">{notice}</p>}

    {/* Previously shared panoramas list */}
    <div className="mt-8 border-t border-slate-800 pt-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-slate-300">Your shared panoramas {shares.length > 0 && `(${shares.length})`}</h3>
        <span className="text-[11px] text-slate-400">10 active links max · 5 new links / day</span>
      </div>
      {!busy && !shares.length && <p className="mt-3 text-sm text-slate-400">No shared panoramas yet.</p>}
      <ul className="mt-3 space-y-3">{shares.map(share => {
        const isCurrent = share.id === newlyCreatedShareId;
        const createdDate = new Date(share.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
        return <li key={share.id} className={`rounded-2xl border p-4 transition-all ${isCurrent ? "border-teal-400/60 bg-teal-950/20" : "border-slate-800 bg-slate-900/30"}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="break-words font-medium text-sm text-slate-100 flex items-center gap-2">
              <span>{share.title}</span>
              {isCurrent && <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-teal-400/20 text-teal-300 border border-teal-400/40">Current</span>}
              {!share.revoked && share.listed && <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-cyan-400/20 text-cyan-300 border border-cyan-400/40">Public</span>}
              {share.revoked && <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">Revoked</span>}
            </p>
            <span className="text-[11px] text-slate-400 shrink-0">{createdDate}</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">{share.width} × {share.height}</p>
          {!share.revoked && <><input aria-label={`Share link for ${share.title}`} readOnly value={linkFor(share.id)} onFocus={event => event.target.select()} className="my-2.5 w-full rounded-lg bg-slate-950 p-2 text-xs font-mono text-slate-300 border border-slate-800" /><div className="flex flex-wrap gap-2">
            <button type="button" className={button} onClick={() => { if (!navigator.clipboard?.writeText) { setError("Select and copy the link above."); return; } void navigator.clipboard.writeText(linkFor(share.id)).then(() => setNotice("Link copied.")).catch(() => setError("Copy failed. Select and copy the link above.")); }}>Copy link</button>
            <a className={button} href={linkFor(share.id)} target="_blank" rel="noopener noreferrer">Open</a>
            <button type="button" disabled={busy} className={button} onClick={() => update(share, { allowDownload: !share.allowDownload })}>{share.allowDownload ? "Hide download" : "Allow download"}</button>
            <button type="button" disabled={busy} className={button} onClick={() => update(share, { listed: !share.listed })}>{share.listed ? "Remove from showcase" : "List in showcase"}</button>
            <button type="button" disabled={busy} className={button} onClick={() => update(share, { action: "revoke" })}>Revoke link</button>
          </div></>}
        </li>;
      })}</ul>
    </div>
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
  const [error, setError] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [attempt, setAttempt] = useState(0);
  const homeHref = `${getSubpath()}/`;
  useEffect(() => {
    const abort = new AbortController(); let localUrl = "";
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(45000)]);
    // oxlint-disable-next-line react/set-state-in-effect
    setError(""); setShare(null); setImageUrl("");
    const load = async () => {
      const metaResponse = await fetch(`/api/shares/${id}`, { signal });
      const data = await metaResponse.json().catch(() => ({}));
      if (!metaResponse.ok) throw new Error(data.error || "This panorama is unavailable.");
      const imageResponse = await fetch(`/api/shares/${id}/image`, { signal });
      if (!imageResponse.ok) throw new Error((await imageResponse.json().catch(() => ({}))).error || "The panorama image is unavailable.");
      localUrl = URL.createObjectURL(await imageResponse.blob());
      if (abort.signal.aborted) { URL.revokeObjectURL(localUrl); return; }
      setShare(data.share); setImageUrl(localUrl); document.title = `${data.share.title} — 360° Panorama | 360 Panorama Viewer`;
    };
    void load().catch(err => { if (!abort.signal.aborted) setError(err.message); });
    return () => { abort.abort(); if (localUrl) URL.revokeObjectURL(localUrl); };
  }, [id, attempt]);
  return <main className="flex min-h-screen flex-col bg-[#040c1a] text-slate-100">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700 px-5 py-4"><div><a href={homeHref} className="text-xs font-semibold tracking-widest text-teal-300">360 PANORAMA VIEWER</a><h1 className="mt-1 text-xl font-semibold">{share?.title || "Shared panorama"}</h1></div><div className="flex flex-wrap gap-2">{share?.allowDownload && <a href={`/api/shares/${id}/download`} className={button}>Download shared panorama</a>}<a href={homeHref} className={button}>Create my own panorama</a></div></header>
    {error ? <div className="m-auto max-w-lg p-8 text-center"><p role="alert">{error}</p><button type="button" className={`${button} mt-4`} onClick={() => setAttempt(value => value + 1)}>Try again</button></div> : imageUrl ? <><p className="px-5 py-3 text-sm text-slate-300">Drag to look around · Scroll or pinch to zoom · Use the viewer controls for fullscreen</p><SharedViewerBoundary key={imageUrl} imageUrl={imageUrl}><SphereViewer textureUrl={imageUrl} initialAutoRotate={false} className="min-h-[65vh] flex-1" /></SharedViewerBoundary><p className="px-5 py-3 text-xs text-slate-400">{share?.width} × {share?.height} · Full 2:1 panorama</p></> : <p role="status" className="m-auto p-8">Loading the full panorama…</p>}
  </main>;
}
