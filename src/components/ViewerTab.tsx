import { useState, useEffect } from 'react';
import {
  Upload,
  ClipboardPaste,
  Sparkles,
  Info,
  ImageIcon,
  AlertCircle,
  Tv,
  Wand2,
  Zap,
  Check,
  RefreshCw,
  RotateCcw,
  Disc,
  MapPin,
  Trash2,
  Plus,
  X,
  Code2,
  HelpCircle,
  ChevronDown,
  Box,
  Globe2,
  ExternalLink,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { SphereViewer } from './SphereViewer';
import { PRESET_PANORAMAS, generateProceduralPanorama } from '../utils/proceduralPanoramas';
import { convertFlatPhotoToEquirectangular } from '../utils/imageOptimizer';
import { healPanoramaSeam } from '../utils/seamHealer';
import { enhanceAndUpscalePanorama } from '../utils/imageEnhancer';
import { repairPanoramaPoles } from '../utils/poleRepair';
import { EmbedModal } from './commercial/EmbedModal';
import type { ActiveTab, ViewerProjectionMode, PanoramaHotspot } from '../types/panorama';

interface ViewerTabProps {
  currentPanoramaUrl: string;
  onPanoramaChange: (url: string) => void;
  onNavigateTab: (tab: ActiveTab) => void;
}

export function ViewerTab({
  currentPanoramaUrl,
  onPanoramaChange,
  onNavigateTab,
}: ViewerTabProps) {
  const [imageMetadata, setImageMetadata] = useState<{
    width: number;
    height: number;
    aspectRatio: string;
    is2to1: boolean;
  }>({
    width: 2048,
    height: 1024,
    aspectRatio: '2:1',
    is2to1: true,
  });

  const [activeProjection, setActiveProjection] = useState<ViewerProjectionMode>('sphere');
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [isRepairingPoles, setIsRepairingPoles] = useState(false);
  const [enhanceSuccessMsg, setEnhanceSuccessMsg] = useState<string | null>(null);
  const [originalUploadedUrl, setOriginalUploadedUrl] = useState<string | null>(null);
  const [isEmbedModalOpen, setIsEmbedModalOpen] = useState(false);

  // Interactive Scene Hotspots Tour state
  const [hotspots, setHotspots] = useState<PanoramaHotspot[]>([
    {
      id: 'spot-1',
      lon: 35,
      lat: 5,
      title: 'Central Observation Deck',
      description: 'Prime panoramic observation point offering an unobstructed 360° overview.',
    },
    {
      id: 'spot-2',
      lon: -110,
      lat: -8,
      title: 'Skyline Vista Point',
      description: 'Optimal natural lighting and architectural skyline viewing angle.',
    },
  ]);
  const [showAddHotspotModal, setShowAddHotspotModal] = useState(false);
  const [newSpotForm, setNewSpotForm] = useState({
    title: '',
    description: '',
    lon: 0,
    lat: 0,
  });

  // Calculate metadata whenever panorama URL changes
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      const ratio = (w / h).toFixed(2);
      const isStandard = Math.abs(w / h - 2) < 0.1;

      setImageMetadata({
        width: w,
        height: h,
        aspectRatio: `${ratio}:1`,
        is2to1: isStandard,
      });

      // If user uploaded a non-2:1 photo, automatically suggest or switch to curved mode
      if (!isStandard) {
        setActiveProjection('curved');
      } else {
        setActiveProjection('sphere');
      }
    };
    img.src = currentPanoramaUrl;
  }, [currentPanoramaUrl]);

  // Handle Ctrl+V clipboard paste (benchmarked from 360photocam.com)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              if (event.target?.result) {
                const url = event.target.result as string;
                setOriginalUploadedUrl(url);
                onPanoramaChange(url);
              }
            };
            reader.readAsDataURL(file);
          }
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onPanoramaChange]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const url = event.target.result as string;
          setOriginalUploadedUrl(url);
          onPanoramaChange(url);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const url = event.target.result as string;
          setOriginalUploadedUrl(url);
          onPanoramaChange(url);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Convert non-2:1 flat photo into a clean 2:1 equirectangular image
  const handleAutoFitToEquirectangular = () => {
    // Save original image if not yet saved
    if (!originalUploadedUrl) {
      setOriginalUploadedUrl(currentPanoramaUrl);
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = convertFlatPhotoToEquirectangular(img, 2048);
      const dataUrl = canvas.toDataURL('image/png');
      onPanoramaChange(dataUrl);
      setActiveProjection('sphere');
      setEnhanceSuccessMsg('Smart converted to standard 2:1 equirectangular panorama. Click "Restore Original" anytime.');
      setTimeout(() => setEnhanceSuccessMsg(null), 4000);
    };
    img.src = currentPanoramaUrl;
  };

  // Restore original unmodified image
  const handleRestoreOriginal = () => {
    if (originalUploadedUrl) {
      onPanoramaChange(originalUploadedUrl);
      setEnhanceSuccessMsg('Successfully restored to original uploaded image.');
      setTimeout(() => setEnhanceSuccessMsg(null), 3500);
    }
  };

  // Seam healing on demand for uploaded images
  const handleHealSeam = () => {
    if (!originalUploadedUrl) {
      setOriginalUploadedUrl(currentPanoramaUrl);
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const healed = healPanoramaSeam(canvas, 140);
        onPanoramaChange(healed.toDataURL('image/png'));
        setEnhanceSuccessMsg('360° seam healed: Left and right boundary pixels blended seamlessly!');
        setTimeout(() => setEnhanceSuccessMsg(null), 3500);
      }
    };
    img.src = currentPanoramaUrl;
  };

  // 4K Clarity Upscaling and Sharpening on demand
  const handleUpscaleEnhance = () => {
    if (!originalUploadedUrl) {
      setOriginalUploadedUrl(currentPanoramaUrl);
    }
    setIsUpscaling(true);
    setTimeout(() => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const enhancedCanvas = enhanceAndUpscalePanorama(img, {
          scaleFactor: 2,
          sharpness: 0.75,
          contrastBoost: 1.1,
        });
        const dataUrl = enhancedCanvas.toDataURL('image/png');
        onPanoramaChange(dataUrl);
        setIsUpscaling(false);
        setEnhanceSuccessMsg(`4K super-resolution reconstruction complete (${enhancedCanvas.width} × ${enhancedCanvas.height}px)!`);
        confetti({ particleCount: 35, spread: 55, origin: { y: 0.65 } });
        setTimeout(() => setEnhanceSuccessMsg(null), 3500);
      };
      img.src = currentPanoramaUrl;
    }, 120);
  };

  // Ground Tripod & Sky Zenith Pole Repair
  const handleRepairPoles = (addLogoDisc: boolean = false) => {
    if (!originalUploadedUrl) {
      setOriginalUploadedUrl(currentPanoramaUrl);
    }
    setIsRepairingPoles(true);
    setTimeout(() => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const repaired = repairPanoramaPoles(canvas, {
            repairNadir: true,
            repairZenith: true,
            nadirRadiusRatio: 0.12,
            zenithRadiusRatio: 0.08,
            addLogoDisc,
            discLabel: '360° VR PANORAMA',
          });
          onPanoramaChange(repaired.toDataURL('image/png'));
          setEnhanceSuccessMsg(
            addLogoDisc
              ? 'Nadir tripod blindspot repaired and covered with 360° disc label!'
              : 'Successfully healed nadir tripod blindspot and zenith glare!'
          );
          confetti({ particleCount: 35, spread: 55, origin: { y: 0.65 } });
          setTimeout(() => setEnhanceSuccessMsg(null), 3500);
        }
        setIsRepairingPoles(false);
      };
      img.src = currentPanoramaUrl;
    }, 120);
  };

  const handleManualAddHotspot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSpotForm.title.trim()) return;
    const newSpot: PanoramaHotspot = {
      id: `spot-${Date.now()}`,
      lon: Number(newSpotForm.lon) || 0,
      lat: Number(newSpotForm.lat) || 0,
      title: newSpotForm.title.trim(),
      description: newSpotForm.description.trim() || 'Custom spatial tour hotspot',
    };
    setHotspots((prev) => [...prev, newSpot]);
    setNewSpotForm({ title: '', description: '', lon: 0, lat: 0 });
    setShowAddHotspotModal(false);
    setEnhanceSuccessMsg(`Hotspot "${newSpot.title}" added successfully!`);
    setTimeout(() => setEnhanceSuccessMsg(null), 3000);
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="text-center max-w-2xl mx-auto space-y-2.5">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-medium mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>ZERO-LATENCY WEBGL ENGINE</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
          Interactive 360° Panorama Viewer
        </h1>
        <p className="text-sm text-slate-400">
          Instant client-side WebGL panoramic viewer featuring smooth damped inertia, 16x anisotropic filtering, and ACES cinematic tone mapping.
        </p>
      </div>

      {/* Non-2:1 Aspect Ratio Smart Optimization Helper Banner */}
      {!imageMetadata.is2to1 && (
        <div className="glass-panel border border-amber-500/40 rounded-3xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-amber-200 shadow-xl">
          <div className="flex items-center gap-3 text-left">
            <div className="p-2.5 bg-amber-500/20 text-amber-300 rounded-2xl shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-amber-100 text-sm">
                Non-2:1 Aspect Ratio Detected (Current: {imageMetadata.aspectRatio})
              </div>
              <p className="text-amber-300/80 text-xs mt-0.5">
                Flat photos mapped directly to a 360° sphere will cause vertical stretching distortion. Choose a recommended display mode:
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveProjection('curved')}
              className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeProjection === 'curved'
                  ? 'bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/30 font-extrabold'
                  : 'bg-cyan-950/40 border border-amber-500/30 text-amber-200 hover:bg-cyan-900/40'
              }`}
            >
              <Tv className="w-4 h-4 text-cyan-300" />
              <span>180° Curved Screen</span>
            </button>

            <button
              type="button"
              onClick={handleAutoFitToEquirectangular}
              className="px-4 py-2 bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-slate-950 rounded-xl font-extrabold flex items-center gap-1.5 shadow-lg shadow-cyan-400/25 transition-all cursor-pointer"
            >
              <Wand2 className="w-4 h-4" />
              <span>Auto-Fit to 2:1 Panorama</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Interactive Stage */}
      <div className="glass-panel border border-cyan-500/25 rounded-3xl overflow-hidden shadow-[0_20px_60px_rgba(0,10,30,0.7)]">
        {/* Top Control Strip */}
        <div className="px-5 py-3.5 bg-[#030e20]/90 border-b border-cyan-500/20 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-bold text-white flex items-center gap-2 tracking-wide">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#00F2FE]" />
              Interactive 360° Viewport
            </span>
            <div className="hidden sm:flex items-center gap-2 text-cyan-300/70 font-mono text-[11px]">
              <span className="px-2 py-0.5 bg-cyan-950/60 rounded-md border border-cyan-500/20">{imageMetadata.width} × {imageMetadata.height}px</span>
              <span>•</span>
              <span className={`px-2 py-0.5 rounded-md border ${
                imageMetadata.is2to1
                  ? 'bg-teal-500/15 border-teal-400/30 text-teal-300 font-bold'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-300 font-bold'
              }`}>
                Ratio: {imageMetadata.aspectRatio}
              </span>
            </div>
          </div>

          {/* Quick upload & optimization triggers */}
          <div className="flex items-center gap-2">
            {originalUploadedUrl && originalUploadedUrl !== currentPanoramaUrl && (
              <button
                type="button"
                onClick={handleRestoreOriginal}
                className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-200 rounded-xl cursor-pointer flex items-center gap-1.5 font-bold transition-colors shadow-sm"
                title="Revert changes and restore original uploaded image"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore Original</span>
              </button>
            )}

            <button
              type="button"
              disabled={isUpscaling}
              onClick={handleUpscaleEnhance}
              className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 rounded-xl cursor-pointer flex items-center gap-1.5 font-extrabold transition-all shadow-md shadow-cyan-400/25 disabled:opacity-60 active:scale-95"
              title="Upscale to 4K clarity using unsharp masking & super-resolution"
            >
              {isUpscaling ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" />
                  <span>Enhancing to 4K...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 text-slate-950 fill-current" />
                  <span>4K Upscale</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleHealSeam}
              className="px-3 py-1.5 bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-500/25 text-cyan-200 rounded-xl cursor-pointer flex items-center gap-1.5 font-bold transition-all"
              title="Blend vertical boundary seams for 360° continuous rotation"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
              <span>Heal Seam</span>
            </button>

            {/* Nadir / Zenith Pole Repair & Logo Disc */}
            <div className="relative group/pole">
              <button
                type="button"
                disabled={isRepairingPoles}
                onClick={() => handleRepairPoles(false)}
                className="px-3 py-1.5 bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-500/25 text-cyan-200 rounded-xl cursor-pointer flex items-center gap-1.5 font-bold transition-all disabled:opacity-60"
                title="Intelligently heal nadir tripod blindspot (-90°) and zenith glare (+90°)"
              >
                {isRepairingPoles ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Repairing Poles...</span>
                  </>
                ) : (
                  <>
                    <Disc className="w-3.5 h-3.5 text-amber-400" />
                    <span>Repair Poles</span>
                  </>
                )}
              </button>
              <div className="hidden group-hover/pole:block absolute top-full right-0 mt-1.5 z-30 glass-panel border border-cyan-500/30 rounded-2xl p-2 shadow-2xl min-w-[220px]">
                <button
                  type="button"
                  onClick={() => handleRepairPoles(false)}
                  className="w-full text-left px-3 py-2 hover:bg-cyan-500/15 rounded-xl text-xs text-cyan-200 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Auto Heal Zenith & Nadir</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRepairPoles(true)}
                  className="w-full text-left px-3 py-2 hover:bg-cyan-500/15 rounded-xl text-xs text-cyan-200 flex items-center gap-2 cursor-pointer border-t border-cyan-500/20 mt-1 transition-colors"
                >
                  <Disc className="w-3.5 h-3.5 text-teal-400" />
                  <span>Add 360° Nadir Disc Logo</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsEmbedModalOpen(true)}
              className="px-3.5 py-1.5 bg-pink-500/15 hover:bg-pink-500/25 border border-pink-400/40 text-pink-300 rounded-xl cursor-pointer flex items-center gap-1.5 font-bold transition-all shadow-sm active:scale-95"
              title="Embed this interactive 360° viewer on your own website"
            >
              <Code2 className="w-3.5 h-3.5 text-pink-400" />
              <span>Embed</span>
            </button>

            <label className="shimmer-btn px-4 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl cursor-pointer flex items-center gap-1.5 font-extrabold transition-all shadow-md shadow-cyan-400/30 active:scale-95">
              <Upload className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Open Local Panorama</span>
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>

        {/* Success toast notification */}
        {enhanceSuccessMsg && (
          <div className="px-5 py-2.5 bg-teal-500/15 border-b border-teal-400/30 text-teal-300 text-xs flex items-center gap-2 animate-fadeIn font-bold">
            <Check className="w-4 h-4 text-teal-400 shrink-0" />
            <span>{enhanceSuccessMsg}</span>
          </div>
        )}

        {/* 360 WebGL Canvas */}
        <div className="h-[520px] w-full bg-[#020712] relative">
          <SphereViewer
            textureUrl={currentPanoramaUrl}
            projectionMode={activeProjection}
            className="w-full h-full"
            hotspots={hotspots}
            onAddHotspot={(spot) => setHotspots((prev) => [...prev, spot])}
            onRemoveHotspot={(id) => setHotspots((prev) => prev.filter((h) => h.id !== id))}
          />
        </div>

        {/* Restore Original Image Status Footer */}
        {originalUploadedUrl && originalUploadedUrl !== currentPanoramaUrl && (
          <div className="px-5 py-3 bg-[#030e20]/95 border-t border-cyan-500/20 flex flex-wrap items-center justify-between gap-3 text-xs text-cyan-200">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>Currently displaying enhanced/reconstructed panorama texture.</span>
            </div>
            <button
              type="button"
              onClick={handleRestoreOriginal}
              className="px-3.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore Original Upload</span>
            </button>
          </div>
        )}
      </div>

      {/* Interactive Hotspots Tour Management Panel */}
      <div className="glass-panel border border-cyan-500/25 rounded-3xl p-6 space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-500/15 text-cyan-400 rounded-2xl border border-cyan-500/30">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-black text-white flex items-center gap-2">
                <span>360° Interactive Spatial Hotspots</span>
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 bg-cyan-400/20 text-cyan-300 rounded-full border border-cyan-400/40">
                  {hotspots.length} Hotspots
                </span>
              </div>
              <p className="text-xs text-cyan-300/70 mt-0.5">
                Freely place annotations, info cards, and navigation markers in 3D space. Use the pin button on the viewport to annotate quickly.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddHotspotModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-slate-950 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-cyan-400/25 active:scale-95"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Add Hotspot</span>
            </button>
            {hotspots.length > 0 && (
              <button
                type="button"
                onClick={() => setHotspots([])}
                className="p-2 bg-cyan-950/40 hover:bg-red-500/20 border border-cyan-500/20 hover:border-red-500/40 text-cyan-300/70 hover:text-red-300 rounded-xl text-xs transition-colors cursor-pointer"
                title="Clear All Hotspots"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Hotspots Grid Cards */}
        {hotspots.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-cyan-500/20 rounded-2xl text-cyan-400/60 text-xs">
            No spatial hotspots yet. Click 'Add Hotspot' above or use the pin tool directly inside the 360° viewport.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {hotspots.map((spot) => (
              <div
                key={spot.id}
                className="glass-card p-3.5 rounded-2xl flex items-start justify-between gap-2.5 text-xs group"
              >
                <div className="space-y-1 overflow-hidden">
                  <div className="font-bold text-cyan-100 flex items-center gap-1.5 truncate">
                    <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="truncate">{spot.title}</span>
                  </div>
                  <p className="text-[11px] text-cyan-300/70 line-clamp-2">{spot.description}</p>
                  <div className="text-[10px] text-cyan-400/60 font-mono">
                    Lon: {spot.lon.toFixed(1)}° • Lat: {spot.lat.toFixed(1)}°
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setHotspots((prev) => prev.filter((h) => h.id !== spot.id))}
                  className="p-1.5 text-cyan-400/50 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer shrink-0"
                  title="Delete Hotspot"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Hotspot Modal */}
      {showAddHotspotModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="glass-panel border border-cyan-400/30 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
              <div className="font-bold text-white text-sm flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400" />
                <span>Add Scene Spatial Hotspot</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddHotspotModal(false)}
                className="w-7 h-7 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-white flex items-center justify-center text-xs transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualAddHotspot} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-cyan-200 font-semibold mb-1">Hotspot Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Master Bedroom, Grand Entrance, Balcony View"
                  value={newSpotForm.title}
                  onChange={(e) => setNewSpotForm((p) => ({ ...p, title: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-[#030a17] border border-cyan-500/30 rounded-xl text-cyan-100 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-cyan-200 font-semibold mb-1">Description & Audio Tour Notes</label>
                <textarea
                  rows={2}
                  placeholder="Enter scene description, architectural notes, or guide details..."
                  value={newSpotForm.description}
                  onChange={(e) => setNewSpotForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-[#030a17] border border-cyan-500/30 rounded-xl text-cyan-100 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 transition-all resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-cyan-300/80 mb-1 font-medium">Horizontal Rotation / Longitude (-180° ~ 180°)</label>
                  <input
                    type="number"
                    min={-180}
                    max={180}
                    step={1}
                    value={newSpotForm.lon}
                    onChange={(e) => setNewSpotForm((p) => ({ ...p, lon: Number(e.target.value) }))}
                    className="w-full px-3.5 py-2 bg-[#030a17] border border-cyan-500/30 rounded-xl text-cyan-100 focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-cyan-300/80 mb-1 font-medium">Vertical Pitch / Latitude (-90° ~ 90°)</label>
                  <input
                    type="number"
                    min={-90}
                    max={90}
                    step={1}
                    value={newSpotForm.lat}
                    onChange={(e) => setNewSpotForm((p) => ({ ...p, lat: Number(e.target.value) }))}
                    className="w-full px-3.5 py-2 bg-[#030a17] border border-cyan-500/30 rounded-xl text-cyan-100 focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-cyan-500/20">
                <button
                  type="button"
                  onClick={() => setShowAddHotspotModal(false)}
                  className="px-4 py-2 bg-white/[0.05] hover:bg-white/10 text-slate-300 rounded-xl cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-slate-950 font-black rounded-xl shadow-lg shadow-cyan-400/25 cursor-pointer active:scale-95 transition-all"
                >
                  Save Hotspot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Zone & Quick Sample Picker Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Dropzone with Ctrl+V hint */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="md:col-span-7 glass-panel border-2 border-dashed border-cyan-400/30 hover:border-cyan-400 rounded-3xl p-8 text-center transition-all flex flex-col items-center justify-center space-y-3.5 cursor-pointer group shadow-xl hover:shadow-[0_0_40px_rgba(0,242,254,0.25)]"
        >
          <label className="cursor-pointer flex flex-col items-center space-y-2.5">
            <div className="p-4 rounded-2xl bg-cyan-500/15 border border-cyan-400/30 text-cyan-400 group-hover:scale-110 group-hover:bg-cyan-500/25 transition-all duration-300 shadow-[0_0_20px_rgba(0,242,254,0.2)]">
              <Upload className="w-7 h-7 stroke-[2.2]" />
            </div>
            <div className="text-base font-extrabold text-white tracking-tight">
              Drag & drop 360° panorama here, or <span className="text-cyan-400 underline decoration-cyan-400/50 underline-offset-4">browse local files</span>
            </div>
            <p className="text-xs text-cyan-200/70">Supports standard 2:1 equirectangular panoramas (JPG, PNG, WebP, HDR)</p>
            <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
          </label>

          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-[#030d1e] border border-cyan-500/25 rounded-full text-[11px] text-cyan-200 shadow-inner">
            <ClipboardPaste className="w-3.5 h-3.5 text-cyan-400" />
            <span>Quick Tip: Press <kbd className="px-2 py-0.5 bg-cyan-950 border border-cyan-500/40 rounded text-cyan-300 font-mono font-bold shadow-sm">Ctrl + V</kbd> (or Cmd + V) to paste an image directly from your clipboard</span>
          </div>
        </div>

        {/* Preset Sample Gallery */}
        <div className="md:col-span-5 glass-panel border border-cyan-500/25 rounded-3xl p-6 space-y-3.5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-cyan-400" />
              Curated 360° Panoramic Demos
            </span>
            <span className="text-[10px] text-cyan-300 font-mono font-bold px-2.5 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/30">
              Instant Load
            </span>
          </div>

          <div className="space-y-2">
            {PRESET_PANORAMAS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  const canvas = generateProceduralPanorama(preset.id, preset.prompt, 2048, 1024);
                  onPanoramaChange(canvas.toDataURL('image/png'));
                }}
                className="w-full px-3.5 py-2.5 glass-card rounded-2xl text-left transition-all flex items-center justify-between group cursor-pointer"
              >
                <div>
                  <div className="text-xs font-bold text-cyan-100 group-hover:text-cyan-300 transition-colors">
                    {preset.title}
                  </div>
                  <div className="text-[10px] text-cyan-300/60 truncate max-w-[220px]">
                    {preset.description}
                  </div>
                </div>
                <span className="text-xs font-bold text-cyan-400/60 group-hover:text-cyan-300 group-hover:translate-x-0.5 transition-all">
                  Load →
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lead Magnet Call-to-Action */}
      <div className="glass-panel relative overflow-hidden bg-gradient-to-r from-cyan-950/80 via-[#0a2347] to-[#041026] border border-cyan-400/40 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-5 shadow-[0_20px_50px_rgba(0,242,254,0.18)]">
        <div className="space-y-1.5 text-center sm:text-left relative z-10">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400 fill-current" />
            <h2 className="text-base font-black text-white tracking-tight">Need to generate brand new 360° virtual spaces or custom skyboxes?</h2>
          </div>
          <p className="text-xs text-cyan-200/80">
            Use our AI Panorama Studio to generate seamless 360° VR environments from a text prompt in seconds.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigateTab('generator')}
          className="shimmer-btn px-6 py-3 bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-cyan-400/35 transition-all shrink-0 cursor-pointer active:scale-95 tracking-wide"
        >
          Try AI Generator Now
        </button>
      </div>

      {/* SEO Educational Guide */}
      <div className="border-t border-white/[0.08] pt-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Info className="w-4 h-4 text-cyan-400" />
          Technical Specs & Engine Compatibility
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-400">
          <div className="glass-card p-4 rounded-2xl space-y-1.5">
            <div className="font-semibold text-slate-200">Equirectangular Standard (2:1)</div>
            <p className="text-[11px] leading-relaxed">
              Standard 2:1 aspect ratio (360° horizontal × 180° vertical). Native support for Insta360, GoPro MAX, Ricoh Theta, and DSLR rigs.
            </p>
          </div>
          <div className="glass-card p-4 rounded-2xl space-y-1.5">
            <div className="font-semibold text-slate-200">100% Client-Side Privacy</div>
            <p className="text-[11px] leading-relaxed">
              All panoramic images are processed directly in your local browser using WebGL GPU acceleration. Zero cloud uploads, zero privacy leaks.
            </p>
          </div>
          <div className="glass-card p-4 rounded-2xl space-y-1.5">
            <div className="font-semibold text-slate-200">Game Engine & VR Ready</div>
            <p className="text-[11px] leading-relaxed">
              Seamlessly compatible with Unity, Unreal Engine 5, Blender HDRI environments, WebXR, Three.js, and Meta Quest VR headsets.
            </p>
          </div>
        </div>
      </div>

      {/* Next-Step Workflow Hub */}
      <div className="glass-panel border border-cyan-500/20 rounded-3xl p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>Next Steps: What would you like to do with this 360° panorama?</span>
          </h3>
          <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950 px-2 py-0.5 rounded-full border border-cyan-500/30">
            One-Click Pipe
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <button
            type="button"
            onClick={() => onNavigateTab('cubemap')}
            className="p-4 glass-card rounded-2xl text-left hover:border-cyan-400/50 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-cyan-400 mb-2">
              <Box className="w-4 h-4" />
              <span className="text-[10px] font-mono font-bold bg-cyan-500/15 px-1.5 py-0.5 rounded text-cyan-300">
                Unity / UE5
              </span>
            </div>
            <div className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">
              Slice to 6-Face Cubemap
            </div>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Split into 6 individual texture faces (+X, -X, +Y, -Y, +Z, -Z) and export a ZIP package.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('globe')}
            className="p-4 glass-card rounded-2xl text-left hover:border-teal-400/50 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-teal-400 mb-2">
              <Globe2 className="w-4 h-4" />
              <span className="text-[10px] font-mono font-bold bg-teal-500/15 px-1.5 py-0.5 rounded text-teal-300">
                MapToGlobe
              </span>
            </div>
            <div className="text-xs font-bold text-white group-hover:text-teal-300 transition-colors">
              Wrap onto 3D Rotating Globe
            </div>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Project flat maps or panoramas onto a 3D revolving planetary sphere with atmospheric glow.
            </p>
          </button>

          <a
            href="/ai-hdri-generator/"
            onClick={(e) => {
              e.preventDefault();
              onNavigateTab('landing-hdri');
            }}
            className="p-4 glass-card rounded-2xl text-left hover:border-amber-400/50 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-amber-400 mb-2">
              <ExternalLink className="w-4 h-4" />
              <span className="text-[10px] font-mono font-bold bg-amber-500/15 px-1.5 py-0.5 rounded text-amber-300">
                Blender .HDR
              </span>
            </div>
            <div className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
              Export 32-bit Radiance HDR
            </div>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Generate true high dynamic range lighting maps to light your 3D scenes with physical bounce.
            </p>
          </a>
        </div>
      </div>

      {/* Frequently Asked Questions (FAQ Accordion for 360 Viewer SEO) */}
      <div className="glass-panel border border-cyan-500/20 rounded-3xl p-6 space-y-3.5 shadow-xl">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 pb-2 border-b border-white/[0.08]">
          <HelpCircle className="w-4 h-4 text-cyan-400" />
          <span>Frequently Asked Questions — 360° Panorama Viewer</span>
        </h3>

        <div className="space-y-2.5 text-xs">
          <details className="group glass-card rounded-2xl p-4 cursor-pointer">
            <summary className="font-semibold text-slate-200 flex items-center justify-between list-none">
              <span>Are my 360° photos uploaded or stored on any server?</span>
              <ChevronDown className="w-4 h-4 text-cyan-400 group-open:rotate-180 transition-transform shrink-0" />
            </summary>
            <p className="mt-2 text-slate-400 leading-relaxed text-[11px]">
              No. PanoramaAI Studio’s 360° Panorama Viewer operates 100% locally in your browser using Three.js and WebGL. Your photos are decoded directly on your local GPU and are never transmitted to any external server or cloud storage.
            </p>
          </details>

          <details className="group glass-card rounded-2xl p-4 cursor-pointer">
            <summary className="font-semibold text-slate-200 flex items-center justify-between list-none">
              <span>How does the Ctrl + V instant clipboard paste feature work?</span>
              <ChevronDown className="w-4 h-4 text-cyan-400 group-open:rotate-180 transition-transform shrink-0" />
            </summary>
            <p className="mt-2 text-slate-400 leading-relaxed text-[11px]">
              Whenever you have an equirectangular image or screenshot in your system clipboard, simply press <kbd className="font-mono text-cyan-300 font-bold">Ctrl + V</kbd> (or <kbd className="font-mono text-cyan-300 font-bold">Cmd + V</kbd> on Mac) anywhere on this page to instantly view it in full 360° interactive spherical roam mode.
            </p>
          </details>

          <details className="group glass-card rounded-2xl p-4 cursor-pointer">
            <summary className="font-semibold text-slate-200 flex items-center justify-between list-none">
              <span>What image formats and resolutions are supported?</span>
              <ChevronDown className="w-4 h-4 text-cyan-400 group-open:rotate-180 transition-transform shrink-0" />
            </summary>
            <p className="mt-2 text-slate-400 leading-relaxed text-[11px]">
              We support standard 2:1 equirectangular panoramas in PNG, JPEG, WebP, and Radiance RGBE .HDR containers up to 16K resolution (limited only by your local GPU memory).
            </p>
          </details>

          <details className="group glass-card rounded-2xl p-4 cursor-pointer">
            <summary className="font-semibold text-slate-200 flex items-center justify-between list-none">
              <span>What is the difference between Sphere Roam and Little Planet view?</span>
              <ChevronDown className="w-4 h-4 text-cyan-400 group-open:rotate-180 transition-transform shrink-0" />
            </summary>
            <p className="mt-2 text-slate-400 leading-relaxed text-[11px]">
              <strong>Sphere Roam Mode:</strong> Places your camera at the center of the 3D sphere simulating normal human vision.
              <br />
              <strong>Little Planet Mode:</strong> Projects the spherical panorama outward using stereographic conformal fisheye projection, curving the horizon into a tiny planet.
            </p>
          </details>

          <details className="group glass-card rounded-2xl p-4 cursor-pointer">
            <summary className="font-semibold text-slate-200 flex items-center justify-between list-none">
              <span>Can I convert the 360° panorama into game engine cubemaps?</span>
              <ChevronDown className="w-4 h-4 text-cyan-400 group-open:rotate-180 transition-transform shrink-0" />
            </summary>
            <p className="mt-2 text-slate-400 leading-relaxed text-[11px]">
              Yes. Once viewed, you can send the panorama directly into our built-in Cubemap Generator to slice it into standard 6 faces (posx, negx, posy, negy, posz, negz) for Unity, Unreal Engine 5, or Godot.
            </p>
          </details>
        </div>
      </div>

      {/* Embed 360 Viewer Modal */}
      <EmbedModal
        isOpen={isEmbedModalOpen}
        onClose={() => setIsEmbedModalOpen(false)}
        currentPanoramaUrl={currentPanoramaUrl}
      />
    </div>
  );
}
