import { useState, useEffect } from 'react';
import {
  Box,
  Download,
  Archive,
  RefreshCw,
  Info,
  Check,
} from 'lucide-react';
import JSZip from 'jszip';
import type { CubemapFace } from '../types/panorama';
import { sliceEquirectangularToCubemapAsync } from '../utils/cubemapSlicer';

interface CubemapTabProps {
  currentPanoramaUrl: string;
  headingLevel?: 1 | 2;
}

interface SliceResult {
  sourceUrl: string;
  faceSize: number;
  faces: CubemapFace[];
  error: string | null;
}

export function CubemapTab({ currentPanoramaUrl, headingLevel = 1 }: CubemapTabProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const [faceSize, setFaceSize] = useState<number>(512);
  const [result, setResult] = useState<SliceResult | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);
  const currentResult = result?.sourceUrl === currentPanoramaUrl && result.faceSize === faceSize ? result : null;
  const faces = currentResult?.faces ?? [];
  const isSlicing = currentResult === null;
  const slicingError = currentResult?.error;

  // Results belong to one source and resolution; stale results cannot be downloaded.
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const fail = (error: unknown) => {
      if (!active) return;
      const message = error instanceof Error ? error.message : String(error);
      console.error('Cubemap slicing failed:', error);
      setResult({ sourceUrl: currentPanoramaUrl, faceSize, faces: [], error: message });
    };
    img.onload = async () => {
      if (!active) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context is unavailable. Please try again.');
        ctx.drawImage(img, 0, 0);
        const sliced = await sliceEquirectangularToCubemapAsync(canvas, faceSize, controller.signal);
        if (!active) return;
        if (sliced.length !== 6) throw new Error('Could not create all six cubemap faces.');
        setResult({ sourceUrl: currentPanoramaUrl, faceSize, faces: sliced, error: null });
      } catch (error: unknown) {
        fail(error);
      }
    };
    img.onerror = () => fail(new Error('Unable to load this panorama. Please select a valid image.'));
    if (currentPanoramaUrl) {
      img.src = currentPanoramaUrl;
    } else {
      queueMicrotask(() => fail(new Error('Please select a panorama before slicing.')));
    }
    return () => {
      active = false;
      controller.abort();
      img.onload = null;
      img.onerror = null;
    };
  }, [currentPanoramaUrl, faceSize]);

  // Download all 6 faces as a ZIP package
  const handleDownloadAllZip = async () => {
    if (faces.length === 0) return;
    const zip = new JSZip();

    for (const face of faces) {
      // Extract base64 part
      const base64Data = face.dataUrl.split(',')[1];
      zip.file(`${face.name}.png`, base64Data, { base64: true });
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cubemap-6faces-${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2500);
  };

  const handleDownloadFace = (face: CubemapFace) => {
    const a = document.createElement('a');
    a.href = face.dataUrl;
    a.download = `cubemap-${face.name}.png`;
    a.click();
  };

  const getFaceByName = (name: string) => faces.find((f) => f.name === name);

  return (
    <div className="space-y-8">
      {/* Title Header */}
      <div className="text-center max-w-2xl mx-auto space-y-2.5">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono font-medium mb-1">
          <Box className="w-3.5 h-3.5" />
          <span>Raycasting 3D Unfolding Engine</span>
        </div>
        <Heading className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
          Equirectangular to Cubemap Skybox Slicer
        </Heading>
        <p className="text-sm text-slate-400">
          Convert a full 2:1 equirectangular panorama into six PNG cube faces (+X, -X, +Y, -Y, +Z, -Z). Use the axis labels to assign a visible skybox; PNG exports do not preserve HDR lighting values.
        </p>
      </div>

      {/* Main Controls & Batch Download Bar */}
      <div className="glass-panel border border-white/10 rounded-3xl p-6 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-4">
          <span className="text-xs font-bold text-slate-200">Face Resolution:</span>
          <div className="flex items-center gap-1 bg-[#080b18] p-1 border border-white/10 rounded-xl text-xs">
            {[256, 512, 1024].map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => setFaceSize(sz)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  faceSize === sz
                    ? 'bg-cyan-600 text-white font-semibold shadow-md shadow-cyan-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {sz} × {sz}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleDownloadAllZip}
          disabled={isSlicing || faces.length === 0}
          className="shimmer-btn px-6 py-3 bg-gradient-to-r from-cyan-400 via-teal-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-cyan-500/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
        >
          {downloadSuccess ? (
            <>
              <Check className="w-4 h-4 text-white" />
              <span>ZIP Download Ready!</span>
            </>
          ) : isSlicing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Raycasting Slices...</span>
            </>
          ) : (
            <>
              <Archive className="w-4 h-4" />
              <span>Download All 6 Faces (ZIP)</span>
            </>
          )}
        </button>
      </div>

      {slicingError && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {slicingError}
        </div>
      )}

      {/* Unfolded Cube Cross (T-Cross) Preview Layout */}
      <div className="glass-panel border border-white/10 rounded-3xl p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            Unfolded T-Cross Topology Preview
          </span>
          <span className="text-[11px] text-slate-400 font-mono">Standard 3D Cubemap Layout</span>
        </div>

        {/* Cross Grid */}
        <div className="max-w-md mx-auto py-6">
          <div className="grid grid-cols-4 gap-2.5">
            {/* Row 1: Top (+Y) centered above Front */}
            <div className="col-start-2">
              <FaceThumbnail face={getFaceByName('posy')} onDownload={handleDownloadFace} />
            </div>

            {/* Row 2: Left (-X), Front (+Z), Right (+X), Back (-Z) */}
            <div className="col-start-1 row-start-2">
              <FaceThumbnail face={getFaceByName('negx')} onDownload={handleDownloadFace} />
            </div>
            <div className="col-start-2 row-start-2">
              <FaceThumbnail face={getFaceByName('posz')} onDownload={handleDownloadFace} />
            </div>
            <div className="col-start-3 row-start-2">
              <FaceThumbnail face={getFaceByName('posx')} onDownload={handleDownloadFace} />
            </div>
            <div className="col-start-4 row-start-2">
              <FaceThumbnail face={getFaceByName('negz')} onDownload={handleDownloadFace} />
            </div>

            {/* Row 3: Bottom (-Y) centered below Front */}
            <div className="col-start-2 row-start-3">
              <FaceThumbnail face={getFaceByName('negy')} onDownload={handleDownloadFace} />
            </div>
          </div>
        </div>
      </div>

      {/* Six Faces Quick Individual Download Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {faces.map((f) => (
          <div
            key={f.name}
            className="glass-card p-3 rounded-2xl flex flex-col items-center justify-between gap-2 text-center group"
          >
            <div className="w-full aspect-square rounded-xl overflow-hidden border border-white/10 relative">
              <img src={f.dataUrl} alt={f.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">{f.label}</div>
              <div className="text-[10px] text-slate-400 font-mono">{f.name}.png</div>
            </div>
            <button
              type="button"
              onClick={() => handleDownloadFace(f)}
              className="w-full py-1.5 px-2 bg-white/[0.05] hover:bg-cyan-600 hover:text-white border border-white/10 hover:border-cyan-500 rounded-xl text-[11px] font-medium text-slate-300 flex items-center justify-center gap-1 transition-all cursor-pointer shadow-sm"
            >
              <Download className="w-3 h-3" />
              <span>Download PNG</span>
            </button>
          </div>
        ))}
      </div>

      {/* Game Engine Import Instructions */}
      <div className="border-t border-white/[0.08] pt-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Info className="w-4 h-4 text-cyan-400" />
          How to Import Cubemaps into Game Engines
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-400">
          <div className="glass-card p-4 rounded-2xl space-y-1.5">
            <div className="font-semibold text-slate-200">Unity Skybox Import Guide</div>
            <p className="text-[11px] leading-relaxed">
              1. Download and extract the 6-face ZIP into your Unity Assets folder.<br />
              2. Create a new Material and set its Shader to `Skybox/6 Sided`.<br />
              3. Assign the textures to Front (+Z), Back (-Z), Left (-X), Right (+X), Up (+Y), and Down (-Y).
            </p>
          </div>
          <div className="glass-card p-4 rounded-2xl space-y-1.5">
            <div className="font-semibold text-slate-200">Unreal Engine &amp; Godot: choose the right source</div>
            <p className="text-[11px] leading-relaxed">
              For Unreal HDRI Backdrop, import a supported original .hdr environment; the six PNGs are not a TextureCube asset.<br />
              For Godot PanoramaSkyMaterial, use the original equirectangular panorama.<br />
              <a href="/cubemap-generator/#engine-setup" className="text-cyan-300 underline">Read the cubemap engine setup guide</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FaceThumbnail({
  face,
  onDownload,
}: {
  face?: CubemapFace;
  onDownload: (face: CubemapFace) => void;
}) {
  if (!face) {
    return <div className="aspect-square bg-[#080b18] border border-white/[0.06] rounded-xl" />;
  }

  return (
    <div
      onClick={() => onDownload(face)}
      className="aspect-square bg-[#080b18] border border-white/10 hover:border-cyan-400 rounded-xl overflow-hidden relative group cursor-pointer transition-all shadow-md hover:shadow-[0_0_20px_rgba(34,211,238,0.25)]"
      title={`Click to download ${face.label}`}
    >
      <img src={face.dataUrl} alt={face.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
      <div className="absolute inset-0 bg-[#060812]/75 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-white">
        <span className="text-[10px] font-bold">{face.label}</span>
        <Download className="w-3.5 h-3.5 text-cyan-400" />
      </div>
      <div className="absolute bottom-1 right-1 text-[9px] font-mono px-1 rounded bg-[#060812]/80 text-slate-300 pointer-events-none border border-white/10">
        {face.name}
      </div>
    </div>
  );
}
