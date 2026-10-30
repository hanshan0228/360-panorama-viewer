import { useLanguage, useTranslation, withLanguageHref } from '../../utils/i18n';
import { sharedMessages } from '../../utils/sharedTranslations';
import unavailableMessages from './embedUnavailableMessages.json';
import { useState } from 'react';
import { SphereViewer } from '../SphereViewer';
import {
  Compass,
  Maximize2,
  Minimize2,
  ExternalLink,
} from 'lucide-react';

interface EmbedViewerProps {
  textureUrl: string;
  autoRotate?: boolean;
}

export function EmbedViewer({ textureUrl, autoRotate = false }: EmbedViewerProps) {
  const t = useTranslation(sharedMessages);
  const [lang] = useLanguage();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loadState, setLoadState] = useState({ url: textureUrl, failed: false, attempt: 0 });
  if (loadState.url !== textureUrl) {
    setLoadState({ url: textureUrl, failed: false, attempt: 0 });
  }
  const failed = loadState.url === textureUrl && loadState.failed;
  const [heading, detail, retry] = unavailableMessages[lang];

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <div className="w-screen h-screen relative bg-black overflow-hidden font-sans select-none">
      {/* 360 Sphere WebGL Viewport */}
      <SphereViewer
        key={`${textureUrl}:${loadState.attempt}`}
        textureUrl={textureUrl}
        initialAutoRotate={autoRotate}
        className="w-full h-full"
        onTextureError={(url) => setLoadState(state => state.url === url ? { ...state, failed: true } : state)}
      />

      {failed && (
        <div role="alert" className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/95 p-6 text-center text-white">
          <div className="max-w-md space-y-4">
            <h1 className="text-xl font-bold">{heading}</h1>
            <p className="text-sm text-slate-300">{detail}</p>
            <button type="button" className="rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-slate-950 cursor-pointer" onClick={() => setLoadState(state => ({ ...state, failed: false, attempt: state.attempt + 1 }))}>{retry}</button>
          </div>
        </div>
      )}

      {/* Top Floating Control Pill */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleFullscreen}
          className="p-2 bg-black/60 hover:bg-black/85 text-white/90 hover:text-white rounded-xl backdrop-blur-md border border-white/20 shadow-lg transition-all cursor-pointer"
          title={t(isFullscreen ? 'Exit Fullscreen' : 'Fullscreen')}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Discreet Branding & Viral Backlink Badge (Bottom Right) */}
      <div className="absolute bottom-3 right-3 z-30">
        <a
          href={`https://360panoramaviewer.com${withLanguageHref('/', lang)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-1.5 bg-[#040e22]/85 hover:bg-[#040e22] text-white rounded-xl backdrop-blur-xl border border-cyan-400/30 shadow-[0_4px_20px_rgba(0,242,254,0.25)] text-xs font-semibold group transition-all"
        >
          <div className="p-1 bg-gradient-to-tr from-cyan-400 to-blue-500 rounded-lg text-slate-950 font-bold group-hover:scale-105 transition-transform">
            <Compass className="w-3 h-3" />
          </div>
          <span className="bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent text-[11px] font-bold">
            360 Panorama Viewer
          </span>
          <ExternalLink className="w-3 h-3 text-cyan-400 opacity-60 group-hover:opacity-100 transition-opacity" />
        </a>
      </div>
    </div>
  );
}
