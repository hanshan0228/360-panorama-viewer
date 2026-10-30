import { useTranslation } from '../utils/i18n';
import { toolMessages } from '../utils/toolTranslations';
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
import { SharePanoramaModal } from './commercial/SharePanorama';
import { getCurrentUser } from '../utils/adminStorage';
import { commerceMessages } from '../utils/commerceTranslations';
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
  const t = useTranslation(toolMessages);
  const shareText = useTranslation(commerceMessages);
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
  const [shareAccountId, setShareAccountId] = useState<string | null>(null);

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

  // Handle Ctrl+V clipboard paste
  useEffect(() => {
    let active = true;
    const handlePaste = (e: ClipboardEvent) => {
      if (showAddHotspotModal || isEmbedModalOpen || shareAccountId !== null || document.querySelector('dialog[open]') ||
        (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              if (active && event.target?.result) {
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
    return () => { active = false; window.removeEventListener('paste', handlePaste); };
  }, [onPanoramaChange, showAddHotspotModal, isEmbedModalOpen, shareAccountId]);

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
    img.onerror = () => {
      setEnhanceSuccessMsg('Seam healing failed: the image could not be loaded. Try again.');
      setTimeout(() => setEnhanceSuccessMsg(null), 4000);
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
        setEnhanceSuccessMsg(t('4K super-resolution reconstruction complete ({width} × {height}px)!').replace('{width}', String(enhancedCanvas.width)).replace('{height}', String(enhancedCanvas.height)));
        confetti({ particleCount: 35, spread: 55, origin: { y: 0.65 } });
        setTimeout(() => setEnhanceSuccessMsg(null), 3500);
      };
      img.onerror = () => {
        setIsUpscaling(false);
        setEnhanceSuccessMsg('Upscaling failed: the image could not be loaded. Try again.');
        setTimeout(() => setEnhanceSuccessMsg(null), 4000);
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
      img.onerror = () => {
        setIsRepairingPoles(false);
        setEnhanceSuccessMsg('Pole repair failed: the image could not be loaded. Try again.');
        setTimeout(() => setEnhanceSuccessMsg(null), 4000);
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
      description: newSpotForm.description.trim() || t('Custom spatial tour hotspot'),
    };
    setHotspots((prev) => [...prev, newSpot]);
    setNewSpotForm({ title: '', description: '', lon: 0, lat: 0 });
    setShowAddHotspotModal(false);
    setEnhanceSuccessMsg(t('Hotspot "{title}" added successfully!').replace('{title}', () => newSpot.title));
    setTimeout(() => setEnhanceSuccessMsg(null), 3000);
  };

  const displayHotspots = hotspots.map(spot =>
    spot.id === 'spot-1' || spot.id === 'spot-2'
      ? { ...spot, title: t(spot.title), description: t(spot.description) }
      : spot
  );

  return (
    <div className="studio-viewer space-y-8">
      {/* Header Banner */}
      <div className="studio-viewer-heading text-center max-w-2xl mx-auto space-y-2.5">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-medium mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>{t("FREE · LOCAL FILES · NO ACCOUNT")}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">{t("360° Panorama Viewer")}</h1>
        <p className="text-sm text-slate-400">{t("Open a 360° photo or Photo Sphere. Your file stays on your device. No account needed.")}</p>
      </div>

      {/* Non-2:1 Aspect Ratio Smart Optimization Helper Banner */}
      {!imageMetadata.is2to1 && (
        <div className="glass-panel border border-amber-500/40 rounded-3xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-amber-200 shadow-xl">
          <div className="flex items-center gap-3 text-left">
            <div className="p-2.5 bg-amber-500/20 text-amber-300 rounded-2xl shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-amber-100 text-sm">{t("Non-2:1 Aspect Ratio Detected (Current:")}{' '}{imageMetadata.aspectRatio})
              </div>
              <p className="text-amber-300/80 text-xs mt-0.5">{t("Flat photos mapped directly to a 360° sphere will cause vertical stretching distortion. Choose a recommended display mode:")}</p>
            </div>
          </div>

          <div className="studio-projection-actions flex items-center gap-2.5 shrink-0">
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
              <span>{t("180° Curved Screen")}</span>
            </button>

            <button
              type="button"
              onClick={handleAutoFitToEquirectangular}
              className="px-4 py-2 bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-slate-950 rounded-xl font-extrabold flex items-center gap-1.5 shadow-lg shadow-cyan-400/25 transition-all cursor-pointer"
            >
              <Wand2 className="w-4 h-4" />
              <span>{t("Auto-Fit to 2:1 Panorama")}</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Interactive Stage */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="glass-panel border border-cyan-500/25 rounded-3xl overflow-hidden shadow-[0_20px_60px_rgba(0,10,30,0.7)]"
      >
        {/* Top Control Strip */}
        <div className="studio-viewer-toolbar px-5 py-3.5 bg-[#030e20]/90 border-b border-cyan-500/20 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-bold text-white flex items-center gap-2 tracking-wide">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#00F2FE]" />{' '}{t("Interactive 360° Viewport")}</span>
            <div className="hidden sm:flex items-center gap-2 text-cyan-300/70 font-mono text-[11px]">
              <span className="px-2 py-0.5 bg-cyan-950/60 rounded-md border border-cyan-500/20">{imageMetadata.width} × {imageMetadata.height}px</span>
              <span>•</span>
              <span className={`px-2 py-0.5 rounded-md border ${
                imageMetadata.is2to1
                  ? 'bg-teal-500/15 border-teal-400/30 text-teal-300 font-bold'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-300 font-bold'
              }`}>{t("Ratio:")}{' '}{imageMetadata.aspectRatio}
              </span>
            </div>
          </div>

          {/* Quick upload & optimization triggers */}
          <div className="studio-viewer-actions flex flex-wrap items-center gap-2">
            <label className="studio-viewer-upload shimmer-btn px-4 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl cursor-pointer flex items-center gap-1.5 font-extrabold transition-all shadow-md shadow-cyan-400/30 active:scale-95 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-cyan-300">
              <Upload className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{t("Open Local Panorama")}</span>
              <input type="file" accept="image/*" onChange={handleFileUpload} className="sr-only" aria-label={t("Open local panorama")} />
            </label>
            {originalUploadedUrl && originalUploadedUrl !== currentPanoramaUrl && (
              <button
                type="button"
                onClick={handleRestoreOriginal}
                className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-200 rounded-xl cursor-pointer flex items-center gap-1.5 font-bold transition-colors shadow-sm"
                title={t("Revert changes and restore original uploaded image")}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t("Restore Original")}</span>
              </button>
            )}

            <details className="studio-viewer-more">
              <summary>{t("Enhance & embed")}</summary>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isUpscaling}
                  onClick={handleUpscaleEnhance}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 rounded-xl cursor-pointer flex items-center gap-1.5 font-extrabold transition-all shadow-md shadow-cyan-400/25 disabled:opacity-60 active:scale-95"
                  title={t("Upscale to 4K clarity using unsharp masking & super-resolution")}
                >
                  {isUpscaling ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" />
                      <span>{t("Enhancing to 4K...")}</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 text-slate-950 fill-current" />
                      <span>{t("4K Upscale")}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleHealSeam}
                  className="px-3 py-1.5 bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-500/25 text-cyan-200 rounded-xl cursor-pointer flex items-center gap-1.5 font-bold transition-all"
                  title={t("Blend vertical boundary seams for 360° continuous rotation")}
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                  <span>{t("Heal Seam")}</span>
                </button>

                {/* Nadir / Zenith Pole Repair & Logo Disc */}
                <details className="studio-viewer-poles relative">
                  <summary
                    className="px-3 py-1.5 bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-500/25 text-cyan-200 rounded-xl cursor-pointer flex items-center gap-1.5 font-bold transition-all disabled:opacity-60"
                  >
                    {isRepairingPoles ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>{t("Repairing Poles...")}</span>
                      </>
                    ) : (
                      <>
                        <Disc className="w-3.5 h-3.5 text-amber-400" />
                        <span>{t("Repair Poles")}</span>
                      </>
                    )}
                    <ChevronDown aria-hidden="true" className="w-3.5 h-3.5" />
                  </summary>
                  <div className="mt-1.5 glass-panel border border-cyan-500/30 rounded-2xl p-2">
                    <button
                      type="button"
                      disabled={isRepairingPoles}
                      onClick={() => handleRepairPoles(false)}
                      className="w-full text-left px-3 py-2 hover:bg-cyan-500/15 rounded-xl text-xs text-cyan-200 flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{t("Auto Heal Zenith & Nadir")}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isRepairingPoles}
                      onClick={() => handleRepairPoles(true)}
                      className="w-full text-left px-3 py-2 hover:bg-cyan-500/15 rounded-xl text-xs text-cyan-200 flex items-center gap-2 cursor-pointer border-t border-cyan-500/20 mt-1 transition-colors"
                    >
                      <Disc className="w-3.5 h-3.5 text-teal-400" />
                      <span>{t("Add 360° Nadir Disc Logo")}</span>
                    </button>
                  </div>
                </details>

                <button
                  type="button"
                  onClick={() => setIsEmbedModalOpen(true)}
                  className="px-3.5 py-1.5 bg-pink-500/15 hover:bg-pink-500/25 border border-pink-400/40 text-pink-300 rounded-xl cursor-pointer flex items-center gap-1.5 font-bold transition-all shadow-sm active:scale-95"
                  title={t("Embed this interactive 360° viewer on your own website")}
                >
                  <Code2 className="w-3.5 h-3.5 text-pink-400" />
                  <span>{t("Embed")}</span>
                </button>
              </div>
            </details>
            <button type="button" onClick={() => setShareAccountId(getCurrentUser().id)} className="px-3.5 py-1.5 bg-teal-500/15 hover:bg-teal-500/25 border border-teal-400/40 text-teal-300 rounded-xl cursor-pointer font-bold">
              {shareText('Share your panorama')}
            </button>
          </div>
        </div>

        {/* Success toast notification */}
        {enhanceSuccessMsg && (
          <div className="px-5 py-2.5 bg-teal-500/15 border-b border-teal-400/30 text-teal-300 text-xs flex items-center gap-2 animate-fadeIn font-bold">
            <Check className="w-4 h-4 text-teal-400 shrink-0" />
            <span>{t(enhanceSuccessMsg)}</span>
          </div>
        )}

        {/* 360 WebGL Canvas */}
        <div className="studio-viewer-stage h-[520px] w-full bg-[#020712] relative">
          <SphereViewer
            textureUrl={currentPanoramaUrl}
            projectionMode={activeProjection}
            className="w-full h-full"
            hotspots={displayHotspots}
            onAddHotspot={(spot) => setHotspots((prev) => [...prev, spot])}
            onRemoveHotspot={(id) => setHotspots((prev) => prev.filter((h) => h.id !== id))}
          />
        </div>

        {/* Restore Original Image Status Footer */}
        {originalUploadedUrl && originalUploadedUrl !== currentPanoramaUrl && (
          <div className="px-5 py-3 bg-[#030e20]/95 border-t border-cyan-500/20 flex flex-wrap items-center justify-between gap-3 text-xs text-cyan-200">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>{t("Currently displaying enhanced/reconstructed panorama texture.")}</span>
            </div>
            <button
              type="button"
              onClick={handleRestoreOriginal}
              className="px-3.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t("Restore Original Upload")}</span>
            </button>
          </div>
        )}
      </div>

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
            <div className="text-base font-extrabold text-white tracking-tight">{t("Drag & drop 360° panorama here, or")}{' '}<span className="text-cyan-400 underline decoration-cyan-400/50 underline-offset-4">{t("browse local files")}</span>
            </div>
            <p className="text-xs text-cyan-200/70">{t("Supports standard 2:1 equirectangular panoramas (JPG, PNG, WebP)")}</p>
            <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
          </label>

          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-[#030d1e] border border-cyan-500/25 rounded-full text-[11px] text-cyan-200 shadow-inner">
            <ClipboardPaste className="w-3.5 h-3.5 text-cyan-400" />
            <span>{t("Quick Tip: Press")}{' '}<kbd className="px-2 py-0.5 bg-cyan-950 border border-cyan-500/40 rounded text-cyan-300 font-mono font-bold shadow-sm">Ctrl + V</kbd>{' '}{t("(or Cmd + V) to paste an image directly from your clipboard")}</span>
          </div>
        </div>

        {/* Preset Sample Gallery */}
        <div className="md:col-span-5 glass-panel border border-cyan-500/25 rounded-3xl p-6 space-y-3.5 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-cyan-400" />{' '}{t("Curated 360° Panoramic Demos")}</span>
            <span className="text-[10px] text-cyan-300 font-mono font-bold px-2.5 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/30">{t("Instant Load")}</span>
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
                    {t(preset.title)}
                  </div>
                  <div className="text-[10px] text-cyan-300/60 truncate max-w-[220px]">
                    {t(preset.description)}
                  </div>
                </div>
                <span className="text-xs font-bold text-cyan-400/60 group-hover:text-cyan-300 group-hover:translate-x-0.5 transition-all">{t("Load →")}</span>
              </button>
            ))}
          </div>
        </div>
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
                <span>{t("360° Interactive Spatial Hotspots")}</span>
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 bg-cyan-400/20 text-cyan-300 rounded-full border border-cyan-400/40">
                  {hotspots.length}{' '}{t("Hotspots")}</span>
              </div>
              <p className="text-xs text-cyan-300/70 mt-0.5">{t("Freely place annotations, info cards, and navigation markers in 3D space. Use the pin button on the viewport to annotate quickly.")}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddHotspotModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-slate-950 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-cyan-400/25 active:scale-95"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{t("Add Hotspot")}</span>
            </button>
            {hotspots.length > 0 && (
              <button
                type="button"
                onClick={() => setHotspots([])}
                className="p-2 bg-cyan-950/40 hover:bg-red-500/20 border border-cyan-500/20 hover:border-red-500/40 text-cyan-300/70 hover:text-red-300 rounded-xl text-xs transition-colors cursor-pointer"
                title={t("Clear All Hotspots")}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Hotspots Grid Cards */}
        {hotspots.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-cyan-500/20 rounded-2xl text-cyan-400/60 text-xs">{t("No spatial hotspots yet. Click 'Add Hotspot' above or use the pin tool directly inside the 360° viewport.")}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {displayHotspots.map((spot) => (
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
                  <div className="text-[10px] text-cyan-400/60 font-mono">{t("Lon:")}{' '}{spot.lon.toFixed(1)}{' '}{t("° • Lat:")}{' '}{spot.lat.toFixed(1)}°
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setHotspots((prev) => prev.filter((h) => h.id !== spot.id))}
                  className="p-1.5 text-cyan-400/50 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer shrink-0"
                  title={t("Delete Hotspot")}
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
                <span>{t("Add Scene Spatial Hotspot")}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddHotspotModal(false)}
                aria-label={t("Close")}
                className="w-7 h-7 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-white flex items-center justify-center text-xs transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualAddHotspot} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-cyan-200 font-semibold mb-1">{t("Hotspot Title")}</label>
                <input
                  type="text"
                  required
                  placeholder={t("e.g. Master Bedroom, Grand Entrance, Balcony View")}
                  value={newSpotForm.title}
                  onChange={(e) => setNewSpotForm((p) => ({ ...p, title: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-[#030a17] border border-cyan-500/30 rounded-xl text-cyan-100 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-cyan-200 font-semibold mb-1">{t("Description & Audio Tour Notes")}</label>
                <textarea
                  rows={2}
                  placeholder={t("Enter scene description, architectural notes, or guide details...")}
                  value={newSpotForm.description}
                  onChange={(e) => setNewSpotForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-[#030a17] border border-cyan-500/30 rounded-xl text-cyan-100 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 transition-all resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-cyan-300/80 mb-1 font-medium">{t("Horizontal Rotation / Longitude (-180° ~ 180°)")}</label>
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
                  <label className="block text-cyan-300/80 mb-1 font-medium">{t("Vertical Pitch / Latitude (-90° ~ 90°)")}</label>
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
                >{t("Cancel")}</button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-slate-950 font-black rounded-xl shadow-lg shadow-cyan-400/25 cursor-pointer active:scale-95 transition-all"
                >{t("Save Hotspot")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lead Magnet Call-to-Action */}
      <div className="glass-panel relative overflow-hidden bg-gradient-to-r from-cyan-950/80 via-[#0a2347] to-[#041026] border border-cyan-400/40 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-5 shadow-[0_20px_50px_rgba(0,242,254,0.18)]">
        <div className="space-y-1.5 text-center sm:text-left relative z-10">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400 fill-current" />
            <h2 className="text-base font-black text-white tracking-tight">{t("Need to generate brand new 360° virtual spaces or custom skyboxes?")}</h2>
          </div>
          <p className="text-xs text-cyan-200/80">{t("Use our AI Panorama Studio to generate seamless 360° VR environments from a text prompt in seconds.")}</p>
        </div>

        <button
          type="button"
          onClick={() => onNavigateTab('generator')}
          className="shimmer-btn px-6 py-3 bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-cyan-400/35 transition-all shrink-0 cursor-pointer active:scale-95 tracking-wide"
        >{t("Try AI Generator Now")}</button>
      </div>

      {/* SEO Educational Guide */}
      <div className="border-t border-white/[0.08] pt-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Info className="w-4 h-4 text-cyan-400" />{' '}{t("Technical Specs & Engine Compatibility")}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-400">
          <div className="glass-card p-4 rounded-2xl space-y-1.5">
            <div className="font-semibold text-slate-200">{t("Equirectangular Standard (2:1)")}</div>
            <p className="text-[11px] leading-relaxed">{t("Standard 2:1 aspect ratio (360° horizontal × 180° vertical). Native support for Insta360, DJI 360 sphere panoramas, GoPro MAX, Ricoh Theta, and DSLR rigs.")}</p>
          </div>
          <div className="glass-card p-4 rounded-2xl space-y-1.5">
            <div className="font-semibold text-slate-200">{t("Where your photo goes")}</div>
            <p className="text-[11px] leading-relaxed">{shareText("Viewing and local conversion run in your browser. AI generation sends references to the service; publishing a share uploads a sharing copy.")}</p>
          </div>
          <div className="glass-card p-4 rounded-2xl space-y-1.5">
            <div className="font-semibold text-slate-200">{t("Game Engine & VR Ready")}</div>
            <p className="text-[11px] leading-relaxed">{t("Use PNG cubemap faces with Unity or cube-texture loaders. For HDR lighting and other engine workflows, check the format requirements in the linked guides.")}</p>
          </div>
        </div>
      </div>

      {/* Next-Step Workflow Hub */}
      <div className="glass-panel border border-cyan-500/20 rounded-3xl p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>{t("Next Steps: What would you like to do with this 360° panorama?")}</span>
          </h3>
          <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950 px-2 py-0.5 rounded-full border border-cyan-500/30">{t("One-Click Pipe")}</span>
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
                PNG Cubemap
              </span>
            </div>
            <div className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">{t("Slice to 6-Face Cubemap")}</div>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{t("Split into 6 individual texture faces (+X, -X, +Y, -Y, +Z, -Z) and export a ZIP package.")}</p>
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
            <div className="text-xs font-bold text-white group-hover:text-teal-300 transition-colors">{t("Wrap onto 3D Rotating Globe")}</div>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{t("Project flat maps or panoramas onto a 3D revolving planetary sphere with atmospheric glow.")}</p>
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
            <div className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">{t("Export 32-bit Radiance HDR")}</div>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{t("Open the separate HDRI workflow for environment-lighting exports. A normal photo does not preserve scene HDR radiance.")}</p>
          </a>
        </div>
      </div>

      {/* Frequently Asked Questions (FAQ Accordion for 360 Viewer SEO) */}
      <div className="glass-panel border border-cyan-500/20 rounded-3xl p-6 space-y-3.5 shadow-xl">
        <h2 className="text-sm font-bold text-white flex items-center gap-2 pb-2 border-b border-white/[0.08]">
          <HelpCircle className="w-4 h-4 text-cyan-400" />
          <span>{t("Frequently Asked Questions — 360° Panorama Viewer")}</span>
        </h2>

        <div className="space-y-2.5 text-xs">
          <details className="group glass-card rounded-2xl p-4 cursor-pointer">
            <summary className="font-semibold text-slate-200 flex items-center justify-between list-none">
              <span>{t("Are my 360° photos uploaded or stored on any server?")}</span>
              <ChevronDown className="w-4 h-4 text-cyan-400 group-open:rotate-180 transition-transform shrink-0" />
            </summary>
            <p className="mt-2 text-slate-400 leading-relaxed text-[11px]">{t("Opening and viewing a local photo happens in your browser without uploading it. If you choose to create a share link, a sharing copy is uploaded to the service.")}</p>
          </details>

          <details className="group glass-card rounded-2xl p-4 cursor-pointer">
            <summary className="font-semibold text-slate-200 flex items-center justify-between list-none">
              <span>{t("How does the Ctrl + V instant clipboard paste feature work?")}</span>
              <ChevronDown className="w-4 h-4 text-cyan-400 group-open:rotate-180 transition-transform shrink-0" />
            </summary>
            <p className="mt-2 text-slate-400 leading-relaxed text-[11px]">{t("Whenever you have an equirectangular image or screenshot in your system clipboard, simply press")}{' '}<kbd className="font-mono text-cyan-300 font-bold">Ctrl + V</kbd>{' '}{t("(or")}{' '}<kbd className="font-mono text-cyan-300 font-bold">Cmd + V</kbd>{' '}{t("on Mac) anywhere on this page to instantly view it in full 360° interactive spherical roam mode.")}</p>
          </details>

          <details className="group glass-card rounded-2xl p-4 cursor-pointer">
            <summary className="font-semibold text-slate-200 flex items-center justify-between list-none">
              <span>{t("What image formats and resolutions are supported?")}</span>
              <ChevronDown className="w-4 h-4 text-cyan-400 group-open:rotate-180 transition-transform shrink-0" />
            </summary>
            <p className="mt-2 text-slate-400 leading-relaxed text-[11px]">{t("Open standard 2:1 equirectangular PNG, JPEG and WebP panoramas. Maximum image size depends on your browser and device. Use the separate HDRI tools for .hdr workflows.")}</p>
          </details>

          <details className="group glass-card rounded-2xl p-4 cursor-pointer">
            <summary className="font-semibold text-slate-200 flex items-center justify-between list-none">
              <span>{t("What is the difference between Sphere Roam and Little Planet view?")}</span>
              <ChevronDown className="w-4 h-4 text-cyan-400 group-open:rotate-180 transition-transform shrink-0" />
            </summary>
            <p className="mt-2 text-slate-400 leading-relaxed text-[11px]">
              <strong>{t("Sphere Roam Mode:")}</strong>{' '}{t("Places your camera at the center of the 3D sphere simulating normal human vision.")}{' '}<br />
              <strong>{t("Little Planet Mode:")}</strong>{' '}{t("Projects the spherical panorama outward using stereographic conformal fisheye projection, curving the horizon into a tiny planet.")}</p>
          </details>

          <details className="group glass-card rounded-2xl p-4 cursor-pointer">
            <summary className="font-semibold text-slate-200 flex items-center justify-between list-none">
              <span>{t("Can I convert the 360° panorama into game engine cubemaps?")}</span>
              <ChevronDown className="w-4 h-4 text-cyan-400 group-open:rotate-180 transition-transform shrink-0" />
            </summary>
            <p className="mt-2 text-slate-400 leading-relaxed text-[11px]">{t("Yes. Send the panorama to the Cubemap Generator to create six PNG faces (posx, negx, posy, negy, posz, negz). These work with Unity 6 Sided skyboxes and cube-texture loaders. Other engines may require the original panorama or HDR file.")}</p>
          </details>

          <details className="group glass-card rounded-2xl p-4 cursor-pointer">
            <summary className="font-semibold text-slate-200 flex items-center justify-between list-none">
              <span>{t("Is a panorama viewer the same thing as a panoramic viewer or 360 viewer?")}</span>
              <ChevronDown className="w-4 h-4 text-cyan-400 group-open:rotate-180 transition-transform shrink-0" />
            </summary>
            <p className="mt-2 text-slate-400 leading-relaxed text-[11px]">{t("Yes. Panorama viewer, panoramic viewer, 360 viewer, and 360 photo viewer all describe the same tool: a player that renders a 2:1 equirectangular photo inside an interactive sphere you can rotate and zoom. Some desktop programs and cloud hosts (PTGui, Pano2VR, Kuula) add stitching, tour authoring, or public hosting on top; local viewing happens in your browser; creating a share link uploads a sharing copy.")}</p>
          </details>

          <details className="group glass-card rounded-2xl p-4 cursor-pointer">
            <summary className="font-semibold text-slate-200 flex items-center justify-between list-none">
              <span>{t("Which 360 cameras and phones produce photos I can view here?")}</span>
              <ChevronDown className="w-4 h-4 text-cyan-400 group-open:rotate-180 transition-transform shrink-0" />
            </summary>
            <p className="mt-2 text-slate-400 leading-relaxed text-[11px]">{t("Any device that exports a 2:1 equirectangular image works: Insta360 ONE X / X2 / X3 / X4, DJI (Air, Mavic, and Mini 360 sphere panoramas), GoPro MAX, Ricoh Theta S / V / Z1, Kandao QooCam, Trisio, iPhone and Android panorama mode, and Google Street View photo exports. Raw dual-fisheye files (.insp, DNG) and HEIC stills must be stitched or converted to JPG first — Safari can decode HEIC, Chrome and Firefox cannot.")}</p>
          </details>
        </div>
      </div>

      {/* On-Page SEO Content: definition, how-to, compatibility, comparison, internal links */}
      <div className="border-t border-white/[0.08] pt-6 space-y-8">
        <section className="space-y-3">
          <h2 className="text-lg font-black text-white tracking-tight">{t("What is a panorama viewer?")}</h2>
          <p className="text-xs text-slate-400 leading-relaxed max-w-4xl">{t("A panorama viewer wraps a flat 2:1 equirectangular photo — the format exported by Insta360, GoPro MAX, Ricoh Theta, and phone panorama mode — around the inside of a virtual sphere, so dragging the image feels like standing inside the scene instead of staring at a stretched rectangle. It is the same projection Google Street View, Facebook 360 photos, and VR headsets use. This page runs that projection locally in your browser with Three.js and WebGL: no plugin, no upload, no account.")}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black text-white tracking-tight">{t("How to view a 360° panorama online (no upload, no account)")}</h2>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] text-slate-400 list-none">
            <li className="glass-card p-4 rounded-2xl space-y-1.5">
              <div className="font-semibold text-slate-200">{t("1. Load the photo")}</div>
              <p className="leading-relaxed">{t("Drag and drop your 2:1 equirectangular image onto the viewport, click")}{' '}<strong className="text-slate-300">{t("Open Local Panorama")}</strong>{' '}{t(", or press")}{' '}<kbd className="font-mono text-cyan-300 font-bold">Ctrl + V</kbd> / <kbd className="font-mono text-cyan-300 font-bold">Cmd + V</kbd>{' '}{t("to paste from the clipboard.")}</p>
            </li>
            <li className="glass-card p-4 rounded-2xl space-y-1.5">
              <div className="font-semibold text-slate-200">{t("2. Look around")}</div>
              <p className="leading-relaxed">{t("Drag with the mouse, swipe on a phone or tablet, or use the arrow keys to pan 360° horizontally and 180° vertically. Scroll or pinch to zoom.")}</p>
            </li>
            <li className="glass-card p-4 rounded-2xl space-y-1.5">
              <div className="font-semibold text-slate-200">{t("3. Switch the projection")}</div>
              <p className="leading-relaxed">
                <strong className="text-slate-300">{t("360° Sphere")}</strong>{' '}{t("for realistic interior roaming,")}{' '}<strong className="text-slate-300">{t("Little Planet")}</strong>{' '}{t("for a stereographic fisheye tiny-planet shot, and")}{' '}<strong className="text-slate-300">{t("VR Split")}</strong>{' '}{t("for a stereoscopic cardboard headset view.")}</p>
            </li>
            <li className="glass-card p-4 rounded-2xl space-y-1.5">
              <div className="font-semibold text-slate-200">{t("4. Reuse the result")}</div>
              <p className="leading-relaxed">{t("Export a PNG viewport snapshot, add spatial hotspots to build a mini tour, copy an embed code for your own website, or clean up the file in place with 4K upscale, seam healing, and pole repair.")}</p>
            </li>
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black text-white tracking-tight">{t("Supported formats, resolutions, and 360 cameras")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-slate-400">
            <div className="glass-card p-4 rounded-2xl space-y-1.5">
              <div className="font-semibold text-slate-200">{t("Files that open directly")}</div>
              <p className="leading-relaxed">{t("2:1 equirectangular JPG, PNG and WebP. Maximum size depends on your browser and device. Non-2:1 images are detected and offered an alternative projection or aspect-ratio adjustment.")}</p>
            </div>
            <div className="glass-card p-4 rounded-2xl space-y-1.5">
              <div className="font-semibold text-slate-200">{t("Cameras and apps")}</div>
              <p className="leading-relaxed">{t("Insta360 ONE X / X2 / X3 / X4, DJI (Air, Mavic, and Mini 360 sphere panoramas), GoPro MAX, Ricoh Theta S / V / Z1, Kandao QooCam, Trisio, iPhone and Android panorama mode, and Google Street View exports — just pick the equirectangular JPG export option in the camera app.")}</p>
            </div>
            <div className="glass-card p-4 rounded-2xl space-y-1.5">
              <div className="font-semibold text-slate-200">{t("Convert before viewing")}</div>
              <p className="leading-relaxed">{t("Insta360 .insp raws, dual-fisheye DNGs, and HEIC stills need stitching or conversion to JPG first (Safari can decode HEIC, Chrome and Firefox cannot). Anything that exports a 2:1 JPG works here afterwards.")}</p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black text-white tracking-tight">{t("How this viewer compares with cloud hosts and desktop software")}</h2>
          <div className="overflow-x-auto rounded-2xl border border-cyan-500/20">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-cyan-950/40 text-cyan-200 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4"> </th>
                  <th className="py-3 px-4 text-cyan-300">{t("360 Panorama Viewer")}</th>
                  <th className="py-3 px-4 text-slate-400">{t("Cloud hosts (Kuula, Momento360)")}</th>
                  <th className="py-3 px-4 text-slate-400">Google Street View / Maps</th>
                  <th className="py-3 px-4 text-slate-400">{t("Desktop 3D software (Pano2VR, Blender)")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/10 text-slate-400">
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-200">{t("Account required")}</td>
                  <td className="py-3 px-4 text-teal-400 font-bold">{t("None")}</td>
                  <td className="py-3 px-4">{t("Yes, to upload and embed")}</td>
                  <td className="py-3 px-4">{t("Google account")}</td>
                  <td className="py-3 px-4">{t("License or install")}</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-200">{t("Where your photo goes")}</td>
                  <td className="py-3 px-4 text-teal-400 font-bold">{t("Stays on your device")}</td>
                  <td className="py-3 px-4">{t("Stored on their servers")}</td>
                  <td className="py-3 px-4">{t("Published publicly")}</td>
                  <td className="py-3 px-4">{t("Stays local")}</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-200">{t("Cost")}</td>
                  <td className="py-3 px-4 text-teal-400 font-bold">{t("Free, unlimited views")}</td>
                  <td className="py-3 px-4">{t("Free tier with limits, paid plans for pro features")}</td>
                  <td className="py-3 px-4">{t("Free, but public")}</td>
                  <td className="py-3 px-4">{t("Paid license")}</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-200">{t("Cardboard VR mode")}</td>
                  <td className="py-3 px-4 text-teal-400 font-bold">{t("Built-in stereoscopic split")}</td>
                  <td className="py-3 px-4">{t("Varies by plan")}</td>
                  <td className="py-3 px-4">{t("Separate phone or headset app")}</td>
                  <td className="py-3 px-4">{t("Manual export")}</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-200">{t("Game engine output")}</td>
                  <td className="py-3 px-4 text-teal-400 font-bold">{t("6-face cubemap ZIP + .HDR pipeline")}</td>
                  <td className="py-3 px-4">{t("Hosted embed only")}</td>
                  <td className="py-3 px-4">{t("Not offered")}</td>
                  <td className="py-3 px-4">{t("Yes, manual setup")}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black text-white tracking-tight">{t("Related 360° panorama tools")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
            <a
              href="/cubemap-generator/"
              onClick={(e) => { e.preventDefault(); onNavigateTab('landing-cubemap'); }}
              className="glass-card p-4 rounded-2xl space-y-1 hover:border-cyan-400/50 transition-all cursor-pointer"
            >
              <div className="font-bold text-white">{t("Cubemap Generator")}</div>
              <p className="text-slate-400 leading-relaxed">{t("Slice a panorama into six PNG faces for a visible skybox. Check the engine setup guide before importing.")}</p>
            </a>
            <a
              href="/photo-to-360-converter/"
              onClick={(e) => { e.preventDefault(); onNavigateTab('landing-photo360'); }}
              className="glass-card p-4 rounded-2xl space-y-1 hover:border-teal-400/50 transition-all cursor-pointer"
            >
              <div className="font-bold text-white">{t("Photo to 360 Converter")}</div>
              <p className="text-slate-400 leading-relaxed">{t("Turn a normal 2D photo into a full equirectangular panorama with AI outpaint.")}</p>
            </a>
            <a
              href="/skybox-generator/"
              onClick={(e) => { e.preventDefault(); onNavigateTab('landing-skybox'); }}
              className="glass-card p-4 rounded-2xl space-y-1 hover:border-indigo-400/50 transition-all cursor-pointer"
            >
              <div className="font-bold text-white">{t("AI Skybox Generator")}</div>
              <p className="text-slate-400 leading-relaxed">{t("Generate seamless 360° game skyboxes from a text prompt, then view them here.")}</p>
            </a>
            <a
              href="/ai-hdri-generator/"
              onClick={(e) => { e.preventDefault(); onNavigateTab('landing-hdri'); }}
              className="glass-card p-4 rounded-2xl space-y-1 hover:border-amber-400/50 transition-all cursor-pointer"
            >
              <div className="font-bold text-white">{t("AI HDRI Generator")}</div>
              <p className="text-slate-400 leading-relaxed">{t("Create 32-bit Radiance .HDR lighting maps for Blender and Unreal Engine.")}</p>
            </a>
            <a
              href="/360-metadata-injector/"
              onClick={(e) => { e.preventDefault(); onNavigateTab('landing-metadata'); }}
              className="glass-card p-4 rounded-2xl space-y-1 hover:border-blue-400/50 transition-all cursor-pointer"
            >
              <div className="font-bold text-white">{t("360° Metadata Injector")}</div>
              <p className="text-slate-400 leading-relaxed">{t("Embed PhotoSphere XMP so Facebook, Street View, and VR apps treat it as a sphere.")}</p>
            </a>
            <a
              href="/360-photo-to-video/"
              onClick={(e) => { e.preventDefault(); onNavigateTab('landing-video'); }}
              className="glass-card p-4 rounded-2xl space-y-1 hover:border-purple-400/50 transition-all cursor-pointer"
            >
              <div className="font-bold text-white">{t("360° Photo to Video")}</div>
              <p className="text-slate-400 leading-relaxed">{t("Render a rotating MP4 or WebM clip for Reels, Shorts, and product pages.")}</p>
            </a>
            <a
              href="/showcase/"
              onClick={(e) => { e.preventDefault(); onNavigateTab('showcase'); }}
              className="glass-card p-4 rounded-2xl space-y-1 hover:border-teal-400/50 transition-all cursor-pointer"
            >
              <div className="font-bold text-white">{t("360° Panorama Showcase")}</div>
              <p className="text-slate-400 leading-relaxed">{t("See real equirectangular panoramas and VR skies shared by other creators.")}</p>
            </a>
          </div>
        </section>
      </div>

      {/* Embed 360 Viewer Modal */}
      <EmbedModal
        isOpen={isEmbedModalOpen}
        onClose={() => setIsEmbedModalOpen(false)}
        currentPanoramaUrl={currentPanoramaUrl}
      />
      <SharePanoramaModal isOpen={shareAccountId !== null} onClose={() => setShareAccountId(null)} imageUrl={currentPanoramaUrl} accountId={shareAccountId ?? ''} />
    </div>
  );
}
