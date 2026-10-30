import { useLanguage, useTranslation, withLanguageHref } from '../../utils/i18n';
import { generatorMessages } from '../../utils/generatorTranslations';
import { commerceMessages } from '../../utils/commerceTranslations';
import { useState, useMemo, useEffect, useRef } from 'react';
import {
  X,
  Code2,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  RotateCw,
  Sparkles,
  Info,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface EmbedModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPanoramaUrl: string;
}

export function EmbedModal({ isOpen, onClose, currentPanoramaUrl }: EmbedModalProps) {
  const t = useTranslation(generatorMessages);
  const shareText = useTranslation(commerceMessages);
  const [lang] = useLanguage();
  const attributionLabel = t('Interactive 360° Scene powered by');
  const iframeTitle = t('Interactive 360° panorama');
  const attributionHref = `https://360panoramaviewer.com${withLanguageHref('/', lang)}`;
  const [autoRotate, setAutoRotate] = useState(true);
  const [includeAttribution, setIncludeAttribution] = useState(true);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '4:3' | '100%'>('16:9');
  const [isCopied, setIsCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const copyAttempt = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      previousFocus?.focus();
    };
  }, [isOpen]);

  let isRemoteUrl = false;
  try {
    const url = new URL(currentPanoramaUrl);
    isRemoteUrl = (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname);
  } catch { /* Local or invalid URLs cannot be shared in an iframe. */ }

  const iframeSrc = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://360panoramaviewer.com';
    const params = new URLSearchParams();
    params.set('embed', 'true');
    params.set('lang', lang);
    if (autoRotate) params.set('autorotate', '1');
    if (isRemoteUrl) {
      params.set('pano', currentPanoramaUrl);
    }

    return `${origin}/?${params.toString()}#embed`;
  }, [autoRotate, isRemoteUrl, currentPanoramaUrl, lang]);

  const embedCode = useMemo(() => {
    const frameStyle = aspectRatio === '100%'
      ? 'border:none;display:block;width:100%;height:450px;'
      : `border:none;display:block;width:100%;height:auto;aspect-ratio:${aspectRatio.replace(':', '/')};`;

    const attributionHtml = includeAttribution
      ? `\n<p style="font-size:12px;color:#718096;text-align:center;margin-top:6px;font-family:sans-serif;">` +
        `${attributionLabel} ` +
        `<a href="${attributionHref}" target="_blank" rel="noopener noreferrer" style="color:#00F2FE;text-decoration:none;font-weight:600;">` +
        `360 Panorama Viewer</a></p>`
      : '';

    return (
      `<div style="position:relative;width:100%;max-width:100%;overflow:hidden;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,0.5);">\n` +
      `  <iframe\n` +
      `    title="${iframeTitle}"\n` +
      `    src="${iframeSrc}"\n` +
      `    width="100%"\n` +
      `    frameborder="0"\n` +
      `    allow="accelerometer; gyroscope; vr; fullscreen"\n` +
      `    allowfullscreen="true"\n` +
      `    loading="lazy"\n` +
      `    style="${frameStyle}"\n` +
      `  ></iframe>\n` +
      `</div>${attributionHtml}`
    );
  }, [iframeSrc, includeAttribution, aspectRatio, attributionLabel, attributionHref, iframeTitle]);

  useEffect(() => {
    copyAttempt.current++;
    // oxlint-disable-next-line react/set-state-in-effect
    setIsCopied(false); setCopyError(false);
  }, [embedCode, isOpen]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    if (!isRemoteUrl) return;
    const attempt = ++copyAttempt.current;
    setIsCopied(false); setCopyError(false);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(embedCode);
      if (attempt !== copyAttempt.current) return;
      setIsCopied(true);
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
    } catch {
      if (attempt === copyAttempt.current) setCopyError(true);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      aria-modal="true"
      aria-labelledby="embed-modal-title"
      className="app-dialog max-w-2xl border-0 p-0 rounded-3xl text-sky-100 bg-transparent backdrop:bg-black/85 backdrop:backdrop-blur-md"
    >
      <div className="glass-panel border border-cyan-400/40 rounded-3xl w-full p-5 sm:p-7 shadow-[0_25px_70px_rgba(0,0,0,0.9)] space-y-4 sm:space-y-6 relative overflow-hidden">
        {/* Glow ambient background */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-start justify-between gap-2 border-b border-cyan-500/20 pb-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="hidden sm:block p-2.5 bg-cyan-500/20 text-cyan-300 rounded-2xl border border-cyan-500/30">
              <Code2 className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 id="embed-modal-title" className="font-black text-lg text-white">{t("Embed 360° Panorama Viewer")}</h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-cyan-400/20 text-cyan-300 rounded-md border border-cyan-400/40">
                  IFRAME
                </span>
              </div>
              <p className="text-xs text-cyan-300/70 mt-0.5">
                {t("Drop this responsive 3D sphere viewer onto any blog, portfolio, or CMS in seconds.")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close modal")}
            className="p-2 text-cyan-400 hover:text-white hover:bg-cyan-500/20 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isRemoteUrl && (
          <div className="p-3 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex items-start gap-2.5 text-xs text-cyan-200">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              <strong>{t("Embedding note:")}</strong>{t("This image is local or has no valid remote URL. Open the sharing dialog, create a share link, then choose Embed code there. Publishing does not automatically connect this viewer to the shared image.")}
            </p>
          </div>
        )}

        {/* Configuration Options */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-[#030d20] border border-cyan-500/20 rounded-2xl p-3.5 space-y-2">
            <span className="text-[11px] font-bold text-cyan-200 block">{t("Aspect Ratio")}</span>
            <div className="flex gap-1.5">
              {(['16:9', '4:3', '100%'] as const).map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setAspectRatio(ratio)}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    aspectRatio === ratio
                      ? 'bg-cyan-500/30 border border-cyan-400 text-white shadow-sm'
                      : 'bg-[#020712] border border-cyan-500/10 text-cyan-300/60 hover:text-white'
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#030d20] border border-cyan-500/20 rounded-2xl p-3.5 flex flex-col justify-between">
            <span className="text-[11px] font-bold text-cyan-200">{t("Auto-Rotation")}</span>
            <button
              type="button"
              onClick={() => setAutoRotate((prev) => !prev)}
              className={`w-full py-1.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                autoRotate
                  ? 'bg-teal-500/20 border-teal-400/50 text-teal-300'
                  : 'bg-[#020712] border-cyan-500/15 text-cyan-400/60 hover:text-white'
              }`}
            >
              <span>{autoRotate ? t("Enabled") : t("Disabled")}</span>
              <RotateCw className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }} />
            </button>
          </div>

          <div className="bg-[#030d20] border border-cyan-500/20 rounded-2xl p-3.5 flex flex-col justify-between">
            <span className="text-[11px] font-bold text-cyan-200">{t("Referral Badge")}</span>
            <button
              type="button"
              onClick={() => setIncludeAttribution((prev) => !prev)}
              className={`w-full py-1.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                includeAttribution
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                  : 'bg-[#020712] border-cyan-500/15 text-cyan-400/60 hover:text-white'
              }`}
            >
              <span>{includeAttribution ? t("Included") : t("Hidden")}</span>
              <ShieldCheck className="w-3.5 h-3.5 text-teal-300" />
            </button>
          </div>
        </div>

        {/* Code Snippet Box */}
        {isRemoteUrl && <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-cyan-300/80">
            <span className="font-mono">{t("HTML Embed Snippet")}</span>
            <span className="text-[11px] text-cyan-400/60">{t("Works on WordPress, Notion, Shopify, Webflow")}</span>
          </div>

          <div className="relative">
            <pre className="p-4 bg-[#020714] border border-cyan-500/30 rounded-2xl text-[11px] font-mono text-cyan-200 overflow-x-auto leading-relaxed max-h-36 selection:bg-cyan-500/40">
              <code>{embedCode}</code>
            </pre>
          </div>
          {copyError && <p role="alert" className="text-xs text-rose-300">{shareText('Copy failed. Select and copy the link above.').split(/[.,\u3002\uFF0C]/)[0]}. {t('HTML Embed Snippet')}</p>}
        </div>}

        {/* Copy Action & Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-1.5 text-xs text-cyan-300/70">
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            <span>{t("Zero dependencies • Accelerated WebGL 2.0 • Mobile Gyro Ready")}</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {isRemoteUrl && <a
              href={iframeSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-3 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/30 text-cyan-200 hover:text-white rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>{t("Test Preview")}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>}

            <button
              type="button"
              disabled={!isRemoteUrl}
              onClick={handleCopy}
              className="shimmer-btn flex-1 sm:flex-none px-6 py-3 bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-black text-xs rounded-2xl shadow-xl shadow-cyan-400/30 flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isCopied ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{t("Copied to Clipboard!")}</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>{t("Copy Embed Code")}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
