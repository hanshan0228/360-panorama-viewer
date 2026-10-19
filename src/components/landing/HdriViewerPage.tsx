import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Box,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  FileUp,
  Lock,
  SlidersHorizontal,
  Sparkles,
  Sun,
} from 'lucide-react';
import JSZip from 'jszip';
import { FloatType } from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { sliceEquirectangularToCubemap } from '../../utils/cubemapSlicer';
import { toneMapLinearRgbToRgba } from '../../utils/hdrToneMap';
import type { ActiveTab, CubemapFace } from '../../types/panorama';

interface HdriViewerPageProps {
  cubemapMode?: boolean;
  onNavigateTab: (tab: ActiveTab, pushPath?: string) => void;
  onPanoramaChange: (url: string) => void;
  onLaunchStudio: () => void;
}

const FACE_SIZES = [512, 1024, 2048];
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_PIXELS = 8192 * 4096;

function validateDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error('The image header has invalid dimensions.');
  }
  if (width > 8192 || height > 8192 || width * height > MAX_PIXELS) {
    throw new Error('Use an image up to 8192 pixels per side and 33.6 megapixels (an 8K panorama).');
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('That file is not an image a browser can decode. Use .hdr, PNG, JPEG or WEBP.'));
    image.src = url;
  });
}

function downloadUrl(url: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
}

function createDisplayCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = '100%';
  canvas.style.height = 'auto';
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser refused a 2D canvas, so the pixels cannot be drawn.');
  return { canvas, ctx };
}

export function HdriViewerPage({ cubemapMode = false, onNavigateTab, onPanoramaChange, onLaunchStudio }: HdriViewerPageProps) {
  const linearRef = useRef<Float32Array | null>(null);
  const loadIdRef = useRef(0);
  const previewHostRef = useRef<HTMLDivElement>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; width: number; height: number; hdr: boolean } | null>(null);
  const [preview, setPreview] = useState<HTMLCanvasElement | null>(null);
  const [exposure, setExposure] = useState(0);
  const [faces, setFaces] = useState<CubemapFace[]>([]);
  const [faceSize, setFaceSize] = useState(1024);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFaq, setActiveFaq] = useState<number | null>(0);

  // The canvas itself is mounted instead of a data URL: re-encoding a 4K-8K
  // panorama to a base64 string on every exposure tick would stall the UI.
  useEffect(() => {
    const host = previewHostRef.current;
    if (host) host.replaceChildren(...(preview ? [preview] : []));
  }, [preview]);

  const renderLinear = (linear: Float32Array, width: number, height: number, ev: number) => {
    const { canvas, ctx } = createDisplayCanvas(width, height);
    const frame = ctx.createImageData(width, height);
    frame.data.set(toneMapLinearRgbToRgba(linear, ev));
    ctx.putImageData(frame, 0, 0);
    return canvas;
  };

  // Re-tonemapping is O(pixels), so it runs once the slider settles rather than
  // on every pointer event. ponytail: whole-image pass on the main thread; an
  // files are capped at 8K; use a worker before raising that limit.
  useEffect(() => {
    const linear = linearRef.current;
    if (!linear || !fileInfo?.hdr) return;
    const timer = setTimeout(() => {
      try {
        setPreview(renderLinear(linear, fileInfo.width, fileInfo.height, 2 ** exposure));
        setFaces([]);
        setError(null);
      } catch (renderError) {
        setError(renderError instanceof Error ? renderError.message : 'Tone mapping failed on this file.');
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [exposure, fileInfo]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const loadId = ++loadIdRef.current;
    setBusy(true);
    setError(null);
    setFaces([]);
    setFileInfo(null);
    setPreview(null);
    linearRef.current = null;
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('Choose a file smaller than 50 MiB.');
      const isRadiance = /\.hdr$/i.test(file.name) || file.type === 'image/vnd.radiance';
      if (isRadiance) {
        const buffer = await file.arrayBuffer();
        if (loadId !== loadIdRef.current) return;
        // Validate the header before HDRLoader allocates the float pixel buffer.
        const header = new TextDecoder().decode(buffer.slice(0, 64 * 1024));
        const size = header.match(/^-Y\s+(\d+)\s+\+X\s+(\d+)\s*$/m);
        if (!size) throw new Error('Use a Radiance RGBE file with a standard -Y +X image header. OpenEXR is not supported.');
        validateDimensions(Number(size[2]), Number(size[1]));
        const decoded = new HDRLoader().setDataType(FloatType).parse(buffer);
        const linear = decoded?.data as Float32Array | undefined;
        if (!linear?.length || !decoded.width || !decoded.height) {
          throw new Error(`${file.name} carries no readable RGBE pixels.`);
        }
        linearRef.current = linear;
        setExposure(0);
        setPreview(renderLinear(linear, decoded.width, decoded.height, 1));
        setFileInfo({ name: file.name, width: decoded.width, height: decoded.height, hdr: true });
      } else {
        const objectUrl = URL.createObjectURL(file);
        try {
          const image = await loadImage(objectUrl);
          if (loadId !== loadIdRef.current) return;
          validateDimensions(image.naturalWidth, image.naturalHeight);
          const { canvas, ctx } = createDisplayCanvas(image.naturalWidth, image.naturalHeight);
          ctx.drawImage(image, 0, 0);
          setPreview(canvas);
          setFileInfo({ name: file.name, width: canvas.width, height: canvas.height, hdr: false });
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      }
    } catch (loadError) {
      if (loadId !== loadIdRef.current) return;
      setError(
        loadError instanceof Error && loadError.message
          ? loadError.message
          : `${file.name} is not a Radiance .hdr file this decoder understands.`
      );
    } finally {
      if (loadId === loadIdRef.current) setBusy(false);
    }
  };

  const handleDownloadPng = () => {
    if (!preview || !fileInfo) return;
    preview.toBlob(blob => {
      if (!blob) {
        setError('The browser refused to encode the tone-mapped frame.');
        return;
      }
      const url = URL.createObjectURL(blob);
      downloadUrl(url, `${fileInfo.name.replace(/\.[^.]+$/, '')}-tonemapped.png`);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
  };

  const handleOpenInViewer = () => {
    if (!preview) return;
    try {
      onPanoramaChange(preview.toDataURL('image/jpeg', 0.92));
      onNavigateTab('viewer', '/360-panorama-viewer/');
    } catch {
      setError('The browser could not prepare the 360 preview. Try a smaller image.');
    }
  };

  const handleSliceFaces = () => {
    if (!preview) return;
    try {
      const sliced = sliceEquirectangularToCubemap(preview, faceSize);
      if (sliced.length !== 6) throw new Error('Could not build all six cube faces from this image.');
      setFaces(sliced);
      setError(null);
    } catch (sliceError) {
      setError(sliceError instanceof Error ? sliceError.message : 'Slicing failed. Try a smaller face size.');
    }
  };

  const handleDownloadFaces = async () => {
    if (faces.length === 0) return;
    try {
      const zip = new JSZip();
      for (const face of faces) {
        zip.file(`${face.name}.png`, face.dataUrl.split(',')[1], { base64: true });
      }
      const archive = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(archive);
      downloadUrl(url, `hdri-cubemap-${faceSize}-${Date.now()}.zip`);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      setError('Could not package the cube faces. Try a smaller face size.');
    }
  };

  const steps = [
    { title: 'Drop in a .hdr file', text: 'Radiance RGBE files from Poly Haven, Blender, Unreal, Substance or this site open directly. PNG, JPEG and WEBP panoramas work too, though they carry no values above 1.0 to recover.' },
    { title: 'Inspect it with real exposure', text: 'The decoder keeps the linear floats. Adjust exposure from -10 to +6 EV to inspect bright lights and shadow detail before the ACES display curve is applied.' },
    { title: 'Export what the next tool needs', text: 'Download the tone-mapped 2:1 PNG for a viewer, a document or a thumbnail, or slice six cube faces for a skybox shader.' },
    { title: 'Send it onward', text: 'Open a 2:1 frame in the WebGL viewer, or download posx, negx, posy, negy, posz, negz PNG faces. Exports are 8-bit display images; keep the original .hdr for environment lighting.' },
  ];

  const comparison = [
    { format: 'Original Radiance .hdr', range: 'Source linear RGBE values', use: 'Image-based lighting and reflections in a 3D renderer' },
    { format: 'Tone-mapped PNG', range: '8-bit sRGB, exposure applied', use: 'Thumbnails, documentation and a 2:1 panorama preview' },
    { format: 'Six PNG cube faces', range: '8-bit sRGB, exposure applied', use: 'A visible skybox; check face order and orientation in your engine' },
  ];

  const faqs = [
    {
      q: 'What exactly is a Radiance .hdr / HDRI file?',
      a: 'It is the Radiance RGBE picture format: every pixel stores four bytes — a shared exponent plus three mantissas — which lets one file hold both a dim interior and a sun disk thousands of times brighter. 360° environment versions of those files are called HDRIs, and 3D packages use them for image-based lighting so sky, sun and bounce colour all light the scene at once.',
    },
    {
      q: 'Can a normal browser open .hdr files?',
      a: 'No. Browsers decode PNG, JPEG, WEBP and AVIF but have no Radiance RGBE decoder, so dropping an .hdr into an image tag fails silently. This viewer parses the header, unpacks the run-length encoded RGBE scanlines in JavaScript, and only then hands the pixels to a canvas.',
    },
    {
      q: 'Is .hdr the same as .exr?',
      a: 'Both are high dynamic range, but they are different containers. Radiance .hdr (RGBE) is compact, universally readable and stores roughly one shared 8-bit exponent per pixel. OpenEXR stores full 16- or 32-bit floats per channel, supports multiple render passes, and is the format VFX pipelines exchange. This viewer reads .hdr; for .exr, convert to .hdr or to a tone-mapped 2:1 image first.',
    },
    {
      q: 'Why do my highlights look flat or the picture look washed out?',
      a: 'Two reasons. First, every HDR preview has to compress a huge range onto an 8-bit screen, so the filmic curve trades some contrast for highlight roll-off: raise or lower exposure until the sun reads correctly. Second, if the file came from an 8-bit source re-wrapped as Radiance (the .HDR download from this site works that way too), it never contained values above 1.0, so there is no extra range to recover.',
    },
    {
      q: 'How do I turn an HDRI into a cubemap for Unity, Unreal Engine or Blender?',
      a: 'Load a full 2:1 equirectangular .hdr, set the preview exposure, and slice 512, 1024 or 2048 px faces. The ZIP contains posx, negx, posy, negy, posz, negz PNGs. They are tone-mapped 8-bit skybox images, not HDR lighting maps. Check axis orientation in the destination shader; keep the original .hdr for image-based lighting.',
    },
    {
      q: 'Is my HDRI uploaded to a server?',
      a: 'No. Decoding, tone mapping, slicing and ZIP packaging all happen in your browser with typed arrays and Canvas pixels. Client work, unreleased environments and camera-scanned panoramas stay on your machine.',
    },
    {
      q: 'What resolution and file size can it handle?',
      a: 'Files must be under 50 MiB, at most 8192 pixels per side and no more than 8192x4096 pixels in total. Float decoding uses much more memory than the compressed file, so start with a 1K or 2K HDRI on a phone. OpenEXR is not supported. The 360 preview and cube export require a full 2:1 equirectangular panorama.',
    },
    {
      q: 'Can I view Poly Haven or Blender demo HDRIs with it?',
      a: 'Yes. Any standard Radiance RGBE file works, including the 1K, 2K, 4K and 8K HDRIs from Poly Haven, Blender Studio, Unreal Marketplace packs and Substance panoramas. Nothing is bundled, re-uploaded or cached by the site.',
    },
  ];

  const related = [
    { label: 'AI HDRI Generator', note: 'Create HDR environment lighting from a prompt', href: '/ai-hdri-generator/', tab: 'landing-hdri' as ActiveTab },
    { label: 'Cubemap 6-Face Slicer', note: 'Slice any 2:1 panorama into engine faces', href: '/cubemap-generator/', tab: 'landing-cubemap' as ActiveTab },
    { label: 'AI Skybox Generator', note: 'Game-ready panoramic skies', href: '/skybox-generator/', tab: 'landing-skybox' as ActiveTab },
    { label: '360° Panorama Viewer', note: 'Look around the tone-mapped frame', href: '/360-panorama-viewer/', tab: 'viewer' as ActiveTab },
    { label: 'Cubemap to Equirectangular', note: 'Stitch six faces back into one sphere', href: '/cubemap-to-equirectangular/', tab: 'landing-cube2eq' as ActiveTab },
    { label: 'Photo to 360 Converter', note: 'Turn a flat photo into a panorama', href: '/photo-to-360-converter/', tab: 'landing-photo360' as ActiveTab },
  ];

  return (
    <div className="space-y-16 pb-16">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs text-cyan-400/70 pt-2">
        <a href="/" className="hover:text-cyan-300 transition-colors">Home</a>
        <span>/</span>
        <span className="text-cyan-200">{cubemapMode ? 'HDRI to Cubemap' : 'HDRI Viewer'}</span>
      </nav>

      {/* Hero */}
      <section className="text-center space-y-6 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono font-semibold">
          <Sun className="w-3.5 h-3.5" />
          <span>RADIANCE RGBE DECODER &bull; ACES TONE MAPPING &bull; 100% CLIENT-SIDE</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-white leading-tight">
          {cubemapMode ? 'HDRI to Cubemap — Convert .HDR to 6 PNG Faces' : 'HDRI Viewer — Open .HDR Files Online and Export Cube Faces'}
        </h1>
        <p className="text-sm sm:text-base text-cyan-100/80 leading-relaxed">
          Drop a Radiance .hdr environment map into the browser to see it with real exposure control, download a
          tone-mapped 2:1 PNG, or slice six cube faces for Blender, Unreal Engine and Unity. No install, no
          upload, no account.
        </p>
      </section>

      {/* Tool */}
      <section className="max-w-4xl mx-auto space-y-6">
        <div
          className="rounded-3xl border border-cyan-500/30 bg-[#030e20] p-6 sm:p-8 space-y-6"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); void handleFile(event.dataTransfer.files[0]); }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <label className="flex-1 px-6 py-4 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-400 to-teal-400 text-slate-950 shadow-lg shadow-amber-400/25 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-cyan-300">
              <FileUp className="w-4 h-4 text-slate-950" />
              <span>{busy ? 'Decoding HDR pixels...' : 'Open a .HDR / 360° image'}</span>
              <input
                type="file"
                accept=".hdr,.png,.jpg,.jpeg,.webp,image/vnd.radiance"
                aria-label="Open an HDRI or panorama file"
                className="sr-only"
                onChange={(event) => {
                  void handleFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </label>
            <div className="text-xs text-cyan-300/70 text-center sm:text-left">
              <div className="font-mono text-teal-300">.hdr &bull; .png &bull; .jpg &bull; .webp</div>
              <div>Up to 50 MiB / 8K &mdash; decoded in your tab</div>
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">{error}</div>
          )}

          {fileInfo && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
              <span className="px-2.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 max-w-[16rem] truncate">{fileInfo.name}</span>
              <span className="px-2.5 py-1 rounded-full bg-teal-500/15 border border-teal-500/30 text-teal-200">{fileInfo.width} &times; {fileInfo.height}</span>
              <span className={`px-2.5 py-1 rounded-full border ${fileInfo.hdr ? 'bg-amber-500/15 border-amber-500/30 text-amber-200' : 'bg-slate-500/15 border-slate-500/30 text-slate-300'}`}>
                {fileInfo.hdr ? 'linear HDR pixels' : 'LDR image (8-bit)'}
              </span>
            </div>
          )}

          {fileInfo && fileInfo.width !== fileInfo.height * 2 && (
            <p role="status" className="text-xs text-amber-200">This image is not 2:1. Flat preview and PNG download work; use a full equirectangular panorama for 360 viewing or cube export.</p>
          )}
          <div className="rounded-2xl overflow-hidden border border-cyan-500/25 bg-black/60 min-h-[10rem] flex items-center justify-center">
            <div ref={previewHostRef} className={preview ? 'w-full' : 'hidden'} role="img" aria-label="Tone-mapped environment preview" />
            {!preview && <span className="text-xs text-cyan-400/60 py-16">Your HDRI preview renders here</span>}
          </div>

          {fileInfo?.hdr && (
            <div className="rounded-2xl border border-cyan-500/20 bg-[#05142b]/60 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 font-semibold text-white">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-amber-300" />
                  Exposure
                </span>
                <span className="font-mono text-amber-200">{exposure > 0 ? '+' : ''}{exposure.toFixed(1)} EV</span>
              </div>
              <input
                type="range"
                aria-label="Exposure in EV"
                min={-10}
                max={6}
                step={0.1}
                value={exposure}
                onChange={(event) => setExposure(Number(event.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />
              <div className="text-[11px] text-cyan-300/60">
                Tone mapping is ACES filmic plus an sRGB encode: highlights roll off instead of clipping, so a sun
                disk stays brighter than the sky behind it.
              </div>
            </div>
          )}

          {preview && (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleDownloadPng}
                className="px-5 py-3 rounded-xl font-bold text-xs bg-gradient-to-r from-cyan-400 to-teal-400 text-slate-950 shadow-lg shadow-cyan-400/25 hover:scale-105 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download tone-mapped PNG</span>
              </button>
              <button
                type="button"
                onClick={handleOpenInViewer}
                disabled={fileInfo?.width !== (fileInfo?.height ?? 0) * 2}
                className="px-5 py-3 rounded-xl font-bold text-xs border border-cyan-400/40 text-cyan-200 hover:border-cyan-300 hover:text-white transition-all cursor-pointer inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Open in 360&deg; viewer</span>
              </button>
              <div className="flex items-center gap-2">
                <select
                  value={faceSize}
                  onChange={(event) => { setFaceSize(Number(event.target.value)); setFaces([]); }}
                  className="px-3 py-3 rounded-xl text-xs bg-[#05142b] border border-cyan-500/30 text-cyan-100 cursor-pointer"
                  aria-label="Cube face size"
                >
                  {FACE_SIZES.map(size => <option key={size} value={size}>{size} px faces</option>)}
                </select>
                <button
                  type="button"
                  onClick={handleSliceFaces}
                  disabled={fileInfo?.width !== (fileInfo?.height ?? 0) * 2}
                  className="px-5 py-3 rounded-xl font-bold text-xs border border-amber-400/40 text-amber-200 hover:border-amber-300 hover:text-white transition-all cursor-pointer inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Box className="w-3.5 h-3.5" />
                  <span>Slice to 6 cube faces</span>
                </button>
              </div>
            </div>
          )}

          {preview && <p className="text-xs text-cyan-200/70">PNG and cube-face downloads are tone-mapped 8-bit images. Keep the original .hdr for HDR lighting. <a href="/blog/hdri-vs-ldr-environment-lighting/" className="text-cyan-300 underline">HDRI vs LDR guide</a></p>}

          {faces.length === 6 && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {faces.map(face => (
                  <div key={face.name} className="space-y-1.5">
                    <img src={face.dataUrl} alt={`${face.label} cube face`} className="w-full rounded-lg border border-cyan-500/25" />
                    <div className="text-[10px] font-mono text-center text-cyan-300/80">{face.name}.png</div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void handleDownloadFaces()}
                className="w-full px-5 py-3 rounded-xl font-bold text-xs border border-teal-400/40 text-teal-200 hover:border-teal-300 hover:text-white transition-all cursor-pointer inline-flex items-center justify-center gap-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download all 6 faces (ZIP)</span>
              </button>
            </div>
          )}

          <div className="flex items-center justify-center gap-2 text-[11px] text-cyan-400/70">
            <Lock className="w-3 h-3" />
            <span>Client-side only. Your HDR environment never touches a server.</span>
          </div>
        </div>
      </section>

      {/* Pipeline */}
      <section className="space-y-6 max-w-4xl mx-auto">
        <div className="text-center space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">Under the Hood</div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">What Happens to Your HDR Pixels</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: Sun, title: '1. Decode RGBE to linear floats', text: 'The Radiance header is parsed, run-length encoded scanlines are expanded, and each pixel becomes a 32-bit float triple. Values above 1.0 survive — that range is the whole point of an HDRI.' },
            { icon: SlidersHorizontal, title: '2. Tone map with ACES', text: 'A filmic curve compresses the range onto your 8-bit screen so highlights roll off smoothly, and an sRGB encode gives the display the gamma it expects. Exposure scales the linear values before the curve.' },
            { icon: Box, title: '3. Sample directions for faces', text: 'Cube slicing casts a ray per output pixel, converts it to a direction on the sphere, and reads the matching equirectangular texel, so no face is stretched or flipped.' },
          ].map(item => (
            <div key={item.title} className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-2">
              <item.icon className="w-4 h-4 text-amber-300" />
              <h3 className="font-bold text-white text-sm">{item.title}</h3>
              <p className="text-xs text-cyan-200/70 leading-relaxed">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How to */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">Step by Step</div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">How to View an HDRI and Export It</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
          {steps.map((step, idx) => (
            <div key={step.title} className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-2">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 shrink-0 rounded-full bg-amber-400/15 border border-amber-400/40 text-amber-300 text-xs font-black flex items-center justify-center">
                  {idx + 1}
                </span>
                <h3 className="font-bold text-white text-sm">{step.title}</h3>
              </div>
              <p className="text-xs text-cyan-200/70 leading-relaxed">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">Comparison</div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">Choose the Right Environment Format</h2>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-cyan-500/25 bg-[#030e20]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#051733] text-cyan-200 border-b border-cyan-500/30 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-4 px-5">File</th>
                <th className="py-4 px-5">Dynamic Range</th>
                <th className="py-4 px-5">Best Use</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 text-cyan-100/90">
              {comparison.map(row => (
                <tr key={row.format}>
                  <td className="py-3.5 px-5 font-semibold text-white">{row.format}</td>
                  <td className="py-3.5 px-5">{row.range}</td>
                  <td className="py-3.5 px-5">{row.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">Frequently Asked Questions</div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">HDRI Viewer Questions &amp; Answers</h2>
        </div>
        <div className="max-w-3xl mx-auto space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = activeFaq === idx;
            return (
              <div key={faq.q} className="rounded-xl border border-cyan-500/25 bg-[#030e20] overflow-hidden transition-colors">
                <button
                  type="button"
                  onClick={() => setActiveFaq(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  aria-controls={`hdri-faq-${idx}`}
                  className="w-full py-4 px-5 text-left flex items-center justify-between gap-4 font-semibold text-sm text-white hover:text-cyan-300 cursor-pointer transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-cyan-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                  <div id={`hdri-faq-${idx}`} hidden={!isOpen} className="px-5 pb-4 text-xs text-cyan-100/80 leading-relaxed border-t border-cyan-500/15 pt-3">
                    {faq.a}
                  </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Related */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">Pair It With</div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">More Free 360&deg; Tools for the Same Pipeline</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {related.map(tool => (
            <a
              key={tool.href}
              href={tool.href}
              onClick={(e) => { e.preventDefault(); onNavigateTab(tool.tab, tool.href); }}
              className="group rounded-2xl border border-cyan-500/25 bg-[#05142b]/70 p-5 hover:border-cyan-400/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
                <CheckCircle2 className="w-4 h-4 text-teal-400" />
                <span>{tool.label}</span>
              </div>
              <p className="text-xs text-cyan-200/70 pt-1.5">{tool.note}</p>
            </a>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-3xl border border-amber-400/40 bg-gradient-to-r from-[#031d42] via-[#042858] to-[#011430] p-8 sm:p-12 text-center space-y-6 shadow-2xl">
        <h2 className="text-2xl sm:text-4xl font-black text-white">Need a New HDRI Instead of a Viewer?</h2>
        <p className="text-sm sm:text-base text-cyan-100/80 max-w-xl mx-auto">
          Describe the lighting you want and the AI HDRI generator builds a seamless 2:1 environment you can tone
          map, slice, or drop straight into Blender as world lighting.
        </p>
        <button
          type="button"
          onClick={onLaunchStudio}
          className="px-8 py-4 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-400 to-teal-400 text-slate-950 shadow-xl shadow-amber-400/40 hover:scale-105 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4 fill-slate-950" />
          <span>Open AI Panorama Studio</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </section>
    </div>
  );
}
