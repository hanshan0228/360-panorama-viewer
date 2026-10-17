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
  const [isFullscreen, setIsFullscreen] = useState(false);

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
        textureUrl={textureUrl}
        initialAutoRotate={autoRotate}
        className="w-full h-full"
      />

      {/* Top Floating Control Pill */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleFullscreen}
          className="p-2 bg-black/60 hover:bg-black/85 text-white/90 hover:text-white rounded-xl backdrop-blur-md border border-white/20 shadow-lg transition-all cursor-pointer"
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Discreet Branding & Viral Backlink Badge (Bottom Right) */}
      <div className="absolute bottom-3 right-3 z-30">
        <a
          href="https://panoramagenerator.ai/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-1.5 bg-[#040e22]/85 hover:bg-[#040e22] text-white rounded-xl backdrop-blur-xl border border-cyan-400/30 shadow-[0_4px_20px_rgba(0,242,254,0.25)] text-xs font-semibold group transition-all"
        >
          <div className="p-1 bg-gradient-to-tr from-cyan-400 to-blue-500 rounded-lg text-slate-950 font-bold group-hover:scale-105 transition-transform">
            <Compass className="w-3 h-3" />
          </div>
          <span className="bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent text-[11px] font-bold">
            PanoramaAI Studio
          </span>
          <ExternalLink className="w-3 h-3 text-cyan-400 opacity-60 group-hover:opacity-100 transition-opacity" />
        </a>
      </div>
    </div>
  );
}
