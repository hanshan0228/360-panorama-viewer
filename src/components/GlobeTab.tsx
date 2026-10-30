import { useTranslation } from '../utils/i18n';
import { landingMessages } from '../utils/landingTranslations';
import { useState } from 'react';
import {
  Globe2,
  Upload,
  Info,
  RotateCcw,
  Sparkles,
  Eye,
  Box,
  HelpCircle,
  ChevronDown,
  Compass,
} from 'lucide-react';
import { GlobeViewer } from './GlobeViewer';
import type { ActiveTab } from '../types/panorama';

interface GlobeTabProps {
  currentPanoramaUrl: string;
  onNavigateTab?: (tab: ActiveTab) => void;
}

export function GlobeTab({ currentPanoramaUrl, onNavigateTab }: GlobeTabProps) {
  const t = useTranslation(landingMessages);
  const [activeGlobeTexture, setActiveGlobeTexture] = useState<string>(currentPanoramaUrl);

  const handleCustomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setActiveGlobeTexture(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-8">
      {/* Title Header */}
      <div className="text-center max-w-2xl mx-auto space-y-2.5">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-medium mb-1">
          <Globe2 className="w-3.5 h-3.5" />
          <span>{t("Atmospheric Glow Preview")}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
          {t("Map to Globe — Free 3D Image to Planetary Sphere")}
        </h1>
        <p className="text-sm text-slate-400">
          {t("Wrap any 2:1 equirectangular panorama, flat world map, or fantasy cartography onto an interactive rotating 3D globe. Free online MapToGlobe alternative with zero upload required.")}
        </p>
      </div>

      {/* Main 3D Globe Viewer Viewport */}
      <div className="glass-panel border border-white/10 rounded-3xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <div className="px-5 py-3.5 bg-[#080b18]/90 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="font-bold text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            {t("3D Planetary Orbit & Rotation Simulator")}
          </span>

          <label className="shimmer-btn px-4 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl cursor-pointer flex items-center gap-1.5 font-semibold transition-all shadow-md shadow-cyan-600/20 active:scale-95">
            <Upload className="w-3.5 h-3.5" />
            <span>{t("Upload Custom Map Texture")}</span>
            <input type="file" accept="image/*" onChange={handleCustomUpload} className="hidden" />
          </label>
        </div>

        <div className="h-[520px] w-full bg-[#05070e] relative">
          <GlobeViewer textureUrl={activeGlobeTexture} className="w-full h-full" />
        </div>
      </div>

      {/* Quick Texture Switcher Bar */}
      <div className="glass-panel border border-white/10 rounded-3xl p-6 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1">
          <div className="text-sm font-bold text-white">{t("Current Sphere Texture Source")}</div>
          <div className="text-xs text-slate-400">
            {t("Click \"Sync Current 360° Panorama\" to map the latest generated or viewed panorama directly onto the 3D globe.")}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setActiveGlobeTexture(currentPanoramaUrl)}
          className="px-4 py-2 bg-white/[0.06] hover:bg-white/10 border border-white/10 hover:border-cyan-400/40 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-sm"
        >
          <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
          <span>{t("Sync Current 360° Panorama")}</span>
        </button>
      </div>

      {/* Educational & Technical Guidance */}
      <div className="border-t border-white/[0.08] pt-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Info className="w-4 h-4 text-emerald-400" />
          {t("Cartographic Projection & Spherical UV Mapping")}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-400">
          <div className="glass-card p-4 rounded-2xl space-y-1.5">
            <div className="font-semibold text-slate-200">{t("Equirectangular UV Texture Mapping")}</div>
            <p className="text-[11px] leading-relaxed">
              {t("Standard equirectangular projection maps longitude to X (0° ~ 360°) and latitude to Y (-90° ~ +90°). Perfect for fantasy world maps, planetary exploration, and sci-fi worldbuilding.")}
            </p>
          </div>
          <div className="glass-card p-4 rounded-2xl space-y-1.5">
            <div className="font-semibold text-slate-200">{t("Planetary Atmosphere Glow")}</div>
            <p className="text-[11px] leading-relaxed">
              {t("A transparent outer sphere adds a blue glow around the planet silhouette.")}
            </p>
          </div>
        </div>
      </div>

      {/* Next-Step Workflow Hub */}
      <div className="glass-panel border border-cyan-500/20 rounded-3xl p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>{t("Workflow Connections: Explore More 360° Tools")}</span>
          </h3>
          <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950 px-2 py-0.5 rounded-full border border-cyan-500/30">
            {t("Interactive Suite")}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <button
            type="button"
            onClick={() => onNavigateTab?.('viewer')}
            className="p-4 glass-card rounded-2xl text-left hover:border-cyan-400/50 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-cyan-400 mb-2">
              <Eye className="w-4 h-4" />
              <span className="text-[10px] font-mono font-bold bg-cyan-500/15 px-1.5 py-0.5 rounded text-cyan-300">
                {t("Interior Roam")}
              </span>
            </div>
            <div className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">
              {t("360° Panorama Viewer")}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              {t("Step inside the sphere with first-person 360° camera controls, Little Planet fisheye, and VR headset mode.")}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab?.('cubemap')}
            className="p-4 glass-card rounded-2xl text-left hover:border-teal-400/50 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-teal-400 mb-2">
              <Box className="w-4 h-4" />
              <span className="text-[10px] font-mono font-bold bg-teal-500/15 px-1.5 py-0.5 rounded text-teal-300">
                {t("Unity / UE5")}
              </span>
            </div>
            <div className="text-xs font-bold text-white group-hover:text-teal-300 transition-colors">
              {t("Cubemap 6-Face Slicer")}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              {t("Slice this spherical texture into 6 cubic faces for game engines.")}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab?.('generator')}
            className="p-4 glass-card rounded-2xl text-left hover:border-amber-400/50 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-amber-400 mb-2">
              <Compass className="w-4 h-4" />
              <span className="text-[10px] font-mono font-bold bg-amber-500/15 px-1.5 py-0.5 rounded text-amber-300">
                {t("AI Studio")}
              </span>
            </div>
            <div className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
              {t("AI 360 Panorama Studio")}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              {t("Generate new photorealistic sci-fi planets, fantasy lands, and deep space nebulas from text prompts.")}
            </p>
          </button>
        </div>
      </div>

      {/* Frequently Asked Questions (MapToGlobe Alternative FAQ) */}
      <div className="glass-panel border border-cyan-500/20 rounded-3xl p-6 space-y-3.5 shadow-xl">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 pb-2 border-b border-white/[0.08]">
          <HelpCircle className="w-4 h-4 text-emerald-400" />
          <span>{t("Frequently Asked Questions — Map to Globe Maker")}</span>
        </h3>

        <div className="space-y-2.5 text-xs">
          <details className="group glass-card rounded-2xl p-4 cursor-pointer">
            <summary className="font-semibold text-slate-200 flex items-center justify-between list-none">
              <span>{t("Is this a free alternative to MapToGlobe?")}</span>
              <ChevronDown className="w-4 h-4 text-emerald-400 group-open:rotate-180 transition-transform shrink-0" />
            </summary>
            <p className="mt-2 text-slate-400 leading-relaxed text-[11px]">
              {t("Yes. 360 Panorama Viewer’s Map to Globe maker is a modern, high-performance WebGL replacement for MapToGlobe. It is 100% free, requires no login or installation, and renders instantly in your web browser.")}
            </p>
          </details>

          <details className="group glass-card rounded-2xl p-4 cursor-pointer">
            <summary className="font-semibold text-slate-200 flex items-center justify-between list-none">
              <span>{t("Can I use this for fantasy maps, tabletop RPGs, and D&D worldbuilding?")}</span>
              <ChevronDown className="w-4 h-4 text-emerald-400 group-open:rotate-180 transition-transform shrink-0" />
            </summary>
            <p className="mt-2 text-slate-400 leading-relaxed text-[11px]">
              {t("Yes! Fantasy cartographers and novelists use this tool to project flat fictional continents created in Wonderdraft or Inkarnate onto a realistic 3D globe to test polar distortion and oceanic navigation routes.")}
            </p>
          </details>

          <details className="group glass-card rounded-2xl p-4 cursor-pointer">
            <summary className="font-semibold text-slate-200 flex items-center justify-between list-none">
              <span>{t("Are my custom maps or satellite photos private?")}</span>
              <ChevronDown className="w-4 h-4 text-emerald-400 group-open:rotate-180 transition-transform shrink-0" />
            </summary>
            <p className="mt-2 text-slate-400 leading-relaxed text-[11px]">
              {t("Completely private. All texture mapping is executed directly on your local GPU via WebGL shaders. Your files never leave your device and are never sent to any remote server.")}
            </p>
          </details>

          <details className="group glass-card rounded-2xl p-4 cursor-pointer">
            <summary className="font-semibold text-slate-200 flex items-center justify-between list-none">
              <span>{t("What image aspect ratio produces the most realistic globe projection?")}</span>
              <ChevronDown className="w-4 h-4 text-emerald-400 group-open:rotate-180 transition-transform shrink-0" />
            </summary>
            <p className="mt-2 text-slate-400 leading-relaxed text-[11px]">
              {t("Use a 2:1 equirectangular image, such as 2048×1024 or 4096×2048. Matching left and right edges help reduce visible seams; the result depends on the source image and projection.")}
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}

