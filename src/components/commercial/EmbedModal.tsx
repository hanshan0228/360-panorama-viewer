import { useState, useMemo, useEffect } from 'react';
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
  const [autoRotate, setAutoRotate] = useState(true);
  const [includeAttribution, setIncludeAttribution] = useState(true);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '4:3' | '100%'>('16:9');
  const [isCopied, setIsCopied] = useState(false);

  // ESC key listener for accessibility
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const isRemoteUrl = Boolean(
    currentPanoramaUrl &&
    (currentPanoramaUrl.startsWith('http://') || currentPanoramaUrl.startsWith('https://'))
  );

  // Compute embed URL & HTML iframe code
  const embedCode = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://panoramagenerator.ai';
    const params = new URLSearchParams();
    params.set('embed', 'true');
    if (autoRotate) params.set('autorotate', '1');
    if (isRemoteUrl) {
      params.set('pano', currentPanoramaUrl);
    }

    const iframeSrc = `${origin}/?${params.toString()}#embed`;
    const heightStyle = aspectRatio === '16:9' ? '500px' : aspectRatio === '4:3' ? '600px' : '450px';

    const attributionHtml = includeAttribution
      ? `\n<p style="font-size:12px;color:#718096;text-align:center;margin-top:6px;font-family:sans-serif;">` +
        `Interactive 360° Scene powered by ` +
        `<a href="https://panoramagenerator.ai/" target="_blank" rel="noopener noreferrer" style="color:#00F2FE;text-decoration:none;font-weight:600;">` +
        `PanoramaAI Studio</a></p>`
      : '';

    return (
      `<div style="position:relative;width:100%;max-width:100%;overflow:hidden;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,0.5);">\n` +
      `  <iframe\n` +
      `    src="${iframeSrc}"\n` +
      `    width="100%"\n` +
      `    height="${heightStyle}"\n` +
      `    frameborder="0"\n` +
      `    allow="accelerometer; gyroscope; vr; fullscreen"\n` +
      `    allowfullscreen="true"\n` +
      `    loading="lazy"\n` +
      `    style="border:none;display:block;"\n` +
      `  ></iframe>\n` +
      `</div>${attributionHtml}`
    );
  }, [autoRotate, includeAttribution, aspectRatio, isRemoteUrl, currentPanoramaUrl]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode);
    setIsCopied(true);
    confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="embed-modal-title"
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 py-6 sm:py-8 animate-in fade-in duration-200 overflow-y-auto"
    >
      <div className="glass-panel border border-cyan-400/40 rounded-3xl max-w-2xl w-full p-5 sm:p-7 shadow-[0_25px_70px_rgba(0,0,0,0.9)] space-y-4 sm:space-y-6 relative max-h-[90vh] overflow-y-auto my-auto">
        {/* Glow ambient background */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-cyan-500/20 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-500/20 text-cyan-300 rounded-2xl border border-cyan-500/30">
              <Code2 className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="embed-modal-title" className="font-black text-lg text-white">Embed 360° Panorama Viewer</h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-cyan-400/20 text-cyan-300 rounded-md border border-cyan-400/40">
                  IFRAME
                </span>
              </div>
              <p className="text-xs text-cyan-300/70 mt-0.5">
                Drop this responsive 3D sphere viewer onto any blog, portfolio, or CMS in seconds.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 text-cyan-400 hover:text-white hover:bg-cyan-500/20 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isRemoteUrl && (
          <div className="p-3 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex items-start gap-2.5 text-xs text-cyan-200">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              <strong>场景提示：</strong>当前全景图为本地内存临时渲染。若需要在外部网站公开嵌入，建议将全景图片托管至公开 CDN，并在 URL 中使用 <code className="text-cyan-300">?pano=https://...</code> 即可跨站无缝展现。
            </p>
          </div>
        )}

        {/* Configuration Options */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-[#030d20] border border-cyan-500/20 rounded-2xl p-3.5 space-y-2">
            <span className="text-[11px] font-bold text-cyan-200 block">Aspect Ratio</span>
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
            <span className="text-[11px] font-bold text-cyan-200">Auto-Rotation</span>
            <button
              type="button"
              onClick={() => setAutoRotate((prev) => !prev)}
              className={`w-full py-1.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                autoRotate
                  ? 'bg-teal-500/20 border-teal-400/50 text-teal-300'
                  : 'bg-[#020712] border-cyan-500/15 text-cyan-400/60 hover:text-white'
              }`}
            >
              <span>{autoRotate ? 'Enabled' : 'Disabled'}</span>
              <RotateCw className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }} />
            </button>
          </div>

          <div className="bg-[#030d20] border border-cyan-500/20 rounded-2xl p-3.5 flex flex-col justify-between">
            <span className="text-[11px] font-bold text-cyan-200">Referral Badge</span>
            <button
              type="button"
              onClick={() => setIncludeAttribution((prev) => !prev)}
              className={`w-full py-1.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                includeAttribution
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                  : 'bg-[#020712] border-cyan-500/15 text-cyan-400/60 hover:text-white'
              }`}
            >
              <span>{includeAttribution ? 'Included' : 'Hidden'}</span>
              <ShieldCheck className="w-3.5 h-3.5 text-teal-300" />
            </button>
          </div>
        </div>

        {/* Code Snippet Box */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-cyan-300/80">
            <span className="font-mono">HTML Embed Snippet</span>
            <span className="text-[11px] text-cyan-400/60">Works on WordPress, Notion, Shopify, Webflow</span>
          </div>

          <div className="relative">
            <pre className="p-4 bg-[#020714] border border-cyan-500/30 rounded-2xl text-[11px] font-mono text-cyan-200 overflow-x-auto leading-relaxed max-h-36 selection:bg-cyan-500/40">
              <code>{embedCode}</code>
            </pre>
          </div>
        </div>

        {/* Copy Action & Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-1.5 text-xs text-cyan-300/70">
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            <span>Zero dependencies &bull; Accelerated WebGL 2.0 &bull; Mobile Gyro Ready</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <a
              href="/?embed=true"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-3 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/30 text-cyan-200 hover:text-white rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>Test Preview</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              type="button"
              onClick={handleCopy}
              className="shimmer-btn flex-1 sm:flex-none px-6 py-3 bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-black text-xs rounded-2xl shadow-xl shadow-cyan-400/30 flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all"
            >
              {isCopied ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Embed Code</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
