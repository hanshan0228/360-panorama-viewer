import { useState } from 'react';
import {
  ArrowRight,
  Box,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  ImagePlus,
  Layers,
  Lock,
  Sparkles,
} from 'lucide-react';
import { stitchCubemapToEquirectangular } from '../../utils/cubemapSlicer';
import type { ActiveTab, CubemapFace, CubemapFaceName } from '../../types/panorama';

interface CubemapToEquirectPageProps {
  onNavigateTab: (tab: ActiveTab, pushPath?: string) => void;
  onPanoramaChange: (url: string) => void;
  onLaunchStudio: () => void;
}

const FACE_SLOTS: Array<{ name: CubemapFaceName; label: string; note: string; aliases: string }> = [
  { name: 'posx', label: 'Right', note: '+X', aliases: 'px, right, east, _rt' },
  { name: 'negx', label: 'Left', note: '-X', aliases: 'nx, left, west, _lf' },
  { name: 'posy', label: 'Top / Up', note: '+Y', aliases: 'py, up, top, ceiling' },
  { name: 'negy', label: 'Bottom / Down', note: '-Y', aliases: 'ny, down, bottom, floor' },
  { name: 'posz', label: 'Front', note: '+Z', aliases: 'pz, front, forward' },
  { name: 'negz', label: 'Back', note: '-Z', aliases: 'nz, back, backward' },
];

const SIZES = [
  { width: 1024, label: '1024 × 512', note: 'Fast preview / web' },
  { width: 2048, label: '2048 × 1024', note: 'Default quality' },
  { width: 4096, label: '4096 × 2048', note: 'VR & engine import' },
];

export function CubemapToEquirectPage({ onNavigateTab, onPanoramaChange, onLaunchStudio }: CubemapToEquirectPageProps) {
  const [loaded, setLoaded] = useState<Partial<Record<CubemapFaceName, { canvas: HTMLCanvasElement; thumb: string }>>>({});
  const [eqWidth, setEqWidth] = useState(2048);
  const [result, setResult] = useState<{ canvas: HTMLCanvasElement; url: string; width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeFaq, setActiveFaq] = useState<number | null>(0);

  const loadedCount = Object.keys(loaded).length;

  const handleFaceUpload = (name: CubemapFaceName, file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setError('This browser refused a 2D canvas, so the faces cannot be read.');
        URL.revokeObjectURL(url);
        return;
      }
      ctx.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      // Thumbnails are pre-scaled once: rendering a full-size face as a data URL on every
      // state change would re-encode megabytes per keystroke for 2048² faces.
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 160;
      thumbCanvas.height = 160;
      thumbCanvas.getContext('2d')?.drawImage(image, 0, 0, 160, 160);
      setLoaded(previous => ({ ...previous, [name]: { canvas, thumb: thumbCanvas.toDataURL('image/jpeg', 0.7) } }));
      setResult(null);
      setError(null);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setError(`${file.name} is not an image a browser can decode. Use PNG, JPEG or WEBP faces.`);
    };
    image.src = url;
  };

  const handleStitch = () => {
    if (loadedCount === 0) {
      setError('Add at least one cube face first — six faces give a complete 360° panorama.');
      return;
    }
    try {
      const faces: CubemapFace[] = FACE_SLOTS
        .filter(slot => loaded[slot.name])
        .map(slot => ({
          name: slot.name,
          label: slot.label,
          dataUrl: '',
          canvas: (loaded[slot.name] as { canvas: HTMLCanvasElement }).canvas,
        }));
      const canvas = stitchCubemapToEquirectangular(faces, eqWidth);
      setResult({
        canvas,
        url: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
      });
      setError(null);
    } catch (stitchError) {
      setError(stitchError instanceof Error ? stitchError.message : 'Stitching failed. Try smaller face images.');
    }
  };

  const handleReset = () => {
    setLoaded({});
    setResult(null);
    setError(null);
  };

  const steps = [
    { title: 'Collect the six faces', text: 'Export the Rt / Lf / Up / Dn / Ft / Bk (or posx…negz) faces from Unity, Unreal, Blender, or a Skybox Lab project. PNG or JPEG, ideally 1024 px or 2048 px per face.' },
    { title: 'Drop them into the slots', text: 'Each labeled slot maps one file to a cube direction. The naming hints under every slot cover the common engine conventions so none of the faces land upside down.' },
    { title: 'Stitch to 2:1', text: 'The stitcher ray-marches every equirectangular pixel back to the correct face, then writes a seamless 2:1 panorama at the width you choose.' },
    { title: 'Download or open it', text: 'Save the PNG, view it inside the free 360° panorama viewer, or send it back into the cubemap generator if you need different face sizes.' },
  ];

  const naming = [
    { engine: 'Unity (6-Sided Skybox)', order: 'Front, Back, Left, Right, Up, Down', files: '_Front / _Back / _Left / _Right / _Up / _Down' },
    { engine: 'Unreal Engine 5', order: 'px, nx, py, ny, pz, nz', files: 'cubemap_px.png … cubemap_nz.png' },
    { engine: 'Three.js CubeTextureLoader', order: 'px, nx, py, ny, pz, nz', files: 'pos/neg + x/y/z.png' },
    { engine: 'Blender & Cycles', order: 'Left, Right, Up, Down, Front, Back', files: 'render_%s_face.png' },
    { engine: 'Source 2 / Valve Skybox', order: 'Rt, Lf, Up, Dn, Ft, Bk', files: 'skybox_rt, skybox_lf, skybox_up, …' },
  ];

  const faqs = [
    {
      q: 'What does a Cubemap to Equirectangular converter do?',
      a: 'It is the exact inverse of cubemap slicing. Six square faces each cover a 90° field of view along one axis of a cube; the converter samples those faces by direction and writes the result into a single 2:1 equirectangular image where longitude runs along the X axis and latitude along the Y axis. That is the format 360° viewers, YouTube 360, Facebook 360, and VR headsets expect.',
    },
    {
      q: 'When would I need this instead of a cubemap?',
      a: 'Whenever the destination expects a spherical panorama: publishing to YouTube or Facebook 360, uploading to Google Street View, mapping the image onto a sphere in Three.js or Blender, building an AI HDRI environment for lighting, or sharing a single file instead of six.',
    },
    {
      q: 'Are the faces uploaded anywhere?',
      a: 'No. Every face is decoded and stitched in your browser with Canvas pixel maths. Nothing is sent to a server, so you can convert unreleased game art or client work without leaving your machine.',
    },
    {
      q: 'Which face order should I use?',
      a: 'This tool does not rely on file order: each slot is labeled with its cube direction, so you place Right in Right, Up in Up, and so on. If your export uses px/nx/py/ny/pz/nz filenames, px maps to Right, nx to Left, py to Up, ny to Down, pz to Front and nz to Back.',
    },
    {
      q: 'My panorama looks mirrored or upside down. What went wrong?',
      a: 'That is a convention mismatch, not broken maths. Some tools write the top face rotated 180° relative to others. Rotate the offending face in any image editor and re-stitch, or swap the Up and Down files to check which convention your exporter used.',
    },
    {
      q: 'Can I stitch a five-face export?',
      a: 'Yes. Missing faces are left transparent, so you still get a preview and can spot which direction is absent — useful when a render failed on one side of the cube.',
    },
    {
      q: 'What output size should I choose?',
      a: 'Match the faces: 2048 faces give a clean 4096×2048 panorama, while 512 or 1024 faces are best at 2048×1024. Exporting a panorama much larger than the source faces only interpolates, it does not add detail.',
    },
    {
      q: 'Can I go back from equirectangular to cube faces?',
      a: 'Yes — the cubemap generator slices a 2:1 panorama into six rectilinear faces with ZIP export, so the two tools round-trip in either direction.',
    },
  ];

  const related = [
    { label: 'Cubemap Generator', note: 'Slice a 2:1 panorama into 6 faces', href: '/cubemap-generator/', tab: 'landing-cubemap' as ActiveTab },
    { label: '360° Panorama Viewer', note: 'Check the stitched result in WebGL', href: '/360-panorama-viewer/', tab: 'viewer' as ActiveTab },
    { label: 'AI HDRI Generator', note: 'Turn the panorama into environment lighting', href: '/ai-hdri-generator/', tab: 'landing-hdri' as ActiveTab },
    { label: 'Map to Globe', note: 'Wrap the panorama onto a tiny planet', href: '/photo-to-globe/', tab: 'globe' as ActiveTab },
    { label: '360° Photo to Video', note: 'Export a rotating clip for social media', href: '/360-photo-to-video/', tab: 'landing-video' as ActiveTab },
    { label: 'PhotoSphere Metadata Injector', note: 'Add XMP tags for Facebook & Street View', href: '/360-metadata-injector/', tab: 'landing-metadata' as ActiveTab },
  ];

  return (
    <div className="space-y-16 pb-16">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs text-cyan-400/70 pt-2">
        <a href="/" className="hover:text-cyan-300 transition-colors">Home</a>
        <span>/</span>
        <span className="text-cyan-300">Tools</span>
        <span>/</span>
        <span className="text-white font-medium">Cubemap to Equirectangular</span>
      </nav>

      {/* Hero */}
      <section className="relative rounded-3xl overflow-hidden border border-cyan-500/25 bg-gradient-to-b from-[#061833]/85 via-[#030e20]/90 to-[#020914] p-6 sm:p-12 shadow-[0_0_60px_rgba(0,242,254,0.08)]">
        <div className="max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-400/15 border border-cyan-400/40 text-cyan-300 text-xs font-semibold tracking-wide">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>INVERSE PROJECTION &bull; 6 FACES TO 2:1 &bull; 100% CLIENT-SIDE</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
            Cubemap to Equirectangular:{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-400 bg-clip-text text-transparent">
              Rebuild a 360° Panorama from 6 Faces
            </span>
          </h1>

          <p className="text-base sm:text-lg text-cyan-100/80 leading-relaxed max-w-3xl">
            Drop in the six faces your engine exported (+X Right, -X Left, +Y Up, -Y Down, +Z Front, -Z Back)
            and get one seamless 2:1 equirectangular panorama for YouTube 360, Facebook, Street View, VR
            headsets, or Blender. Exact inverse ray casting, no upload, no install.
          </p>

          <div className="flex flex-wrap items-center gap-6 pt-4 text-xs text-cyan-300/70 border-t border-cyan-500/15">
            <span className="flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-teal-400" />
              <span>Faces stay on your device</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Download className="w-4 h-4 text-teal-400" />
              <span>PNG panorama export up to 4096×2048</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-teal-400" />
              <span>Open the result in the 360° viewer</span>
            </span>
          </div>
        </div>
      </section>

      {/* Tool */}
      <section className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-3xl border border-cyan-500/25 bg-[#04101f]/80 p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Box className="w-4 h-4 text-cyan-400" />
                <span>1. Add the six cube faces</span>
              </h2>
              <span className="text-[11px] font-mono text-cyan-300/80">{loadedCount} / 6 loaded</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {FACE_SLOTS.map(slot => {
                const entry = loaded[slot.name];
                return (
                  <label
                    key={slot.name}
                    className="group relative rounded-2xl border border-cyan-500/25 bg-[#030e20] overflow-hidden cursor-pointer hover:border-cyan-400/50 transition-colors"
                  >
                    <div className="aspect-square w-full bg-[#02070f] flex items-center justify-center overflow-hidden">
                      {entry ? (
                        <img
                          src={entry.thumb}
                          alt={`${slot.label} cube face preview`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImagePlus className="w-6 h-6 text-cyan-500/50" />
                      )}
                    </div>
                    <div className="px-2.5 py-2">
                      <div className="text-[11px] font-bold text-white">{slot.label} <span className="text-cyan-400 font-mono">{slot.note}</span></div>
                      <div className="text-[9px] text-cyan-300/60 font-mono truncate">{slot.aliases}</div>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFaceUpload(slot.name, e.target.files?.[0])}
                      className="hidden"
                    />
                  </label>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <span className="text-xs text-cyan-300/80">Output width</span>
              <div className="flex flex-wrap gap-2">
                {SIZES.map(size => (
                  <button
                    key={size.width}
                    type="button"
                    onClick={() => { setEqWidth(size.width); setResult(null); }}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                      eqWidth === size.width
                        ? 'bg-cyan-400/20 border-cyan-400/60 text-white'
                        : 'bg-cyan-950/40 border-cyan-500/25 text-cyan-200/80 hover:text-white'
                    }`}
                    title={size.note}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleStitch}
                className="px-5 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 shadow-lg shadow-cyan-400/30 hover:shadow-cyan-400/50 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-slate-950" />
                <span>Stitch to 2:1 Panorama</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-3 rounded-xl text-xs font-semibold bg-cyan-950/50 border border-cyan-500/30 text-cyan-200/80 hover:text-white transition-colors cursor-pointer"
              >
                Clear faces
              </button>
            </div>

            {error && (
              <p role="alert" className="text-xs text-amber-300/90 border border-amber-500/30 bg-amber-500/5 rounded-xl p-3">
                {error}
              </p>
            )}
          </div>

          <div className="rounded-3xl border border-cyan-500/25 bg-[#04101f]/80 p-5 sm:p-6 space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-400" />
              <span>2. Preview the equirectangular result</span>
            </h2>

            <div className="rounded-2xl border border-cyan-500/20 bg-[#02070f] min-h-[240px] flex items-center justify-center overflow-hidden">
              {result ? (
                <img src={result.url} alt="Stitched equirectangular 360 panorama preview" className="w-full" />
              ) : (
                <div className="text-center space-y-2 p-8">
                  <Layers className="w-8 h-8 text-cyan-500/40 mx-auto" />
                  <p className="text-xs text-cyan-300/70">
                    Your stitched 2:1 panorama appears here. Longitude runs left to right, the poles sit at the
                    top and bottom edges.
                  </p>
                </div>
              )}
            </div>

            {result && (
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={result.url}
                  download={`equirectangular-${result.width}x${result.height}.png`}
                  className="px-5 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-teal-400 to-cyan-400 text-slate-950 shadow-lg shadow-teal-400/30 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer inline-flex items-center gap-2"
                >
                  <Download className="w-4 h-4 text-slate-950" />
                  <span>Download {result.width}×{result.height} PNG</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    onPanoramaChange(result.url);
                    onNavigateTab('viewer', '/360-panorama-viewer/');
                  }}
                  className="px-4 py-3 rounded-xl text-xs font-semibold bg-cyan-950/50 border border-cyan-500/40 text-cyan-200 hover:text-white hover:bg-cyan-900/60 transition-colors cursor-pointer inline-flex items-center gap-2"
                >
                  <Eye className="w-4 h-4 text-cyan-400" />
                  <span>Open in 360° viewer</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onPanoramaChange(result.url);
                    onNavigateTab('landing-cubemap', '/cubemap-generator/');
                  }}
                  className="px-4 py-3 rounded-xl text-xs font-semibold bg-cyan-950/50 border border-cyan-500/30 text-cyan-200/80 hover:text-white transition-colors cursor-pointer inline-flex items-center gap-2"
                >
                  <Box className="w-4 h-4 text-cyan-400" />
                  <span>Slice it back to faces</span>
                </button>
              </div>
            )}

            <p className="text-[11px] text-cyan-300/60 leading-relaxed">
              Tip: if the horizon looks tilted, your exporter used a different up-axis convention. Rotate the
              Up and Down faces 90° in an image editor and stitch again.
            </p>
          </div>
        </div>
      </section>

      {/* How to */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Step by Step
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            How to Convert Cube Faces Back to a Sphere
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
          {steps.map((step, idx) => (
            <div key={step.title} className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-2">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 shrink-0 rounded-full bg-cyan-400/15 border border-cyan-400/40 text-cyan-300 text-xs font-black flex items-center justify-center">
                  {idx + 1}
                </span>
                <h3 className="font-bold text-white text-sm">{step.title}</h3>
              </div>
              <p className="text-xs text-cyan-200/70 leading-relaxed">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Naming conventions */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Face Naming Reference
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            Which Export Order Does Your Engine Use?
          </h2>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-cyan-500/25 bg-[#030e20]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#051733] text-cyan-200 border-b border-cyan-500/30 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-4 px-5">Tool / Engine</th>
                <th className="py-4 px-5">Face Order</th>
                <th className="py-4 px-5">Typical Filenames</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 text-cyan-100/90">
              {naming.map(row => (
                <tr key={row.engine}>
                  <td className="py-3.5 px-5 font-semibold text-white">{row.engine}</td>
                  <td className="py-3.5 px-5">{row.order}</td>
                  <td className="py-3.5 px-5 font-mono text-teal-300">{row.files}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Frequently Asked Questions
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            Cubemap Conversion Questions &amp; Answers
          </h2>
        </div>

        <div className="max-w-3xl mx-auto space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = activeFaq === idx;
            return (
              <div key={faq.q} className="rounded-xl border border-cyan-500/25 bg-[#030e20] overflow-hidden transition-colors">
                <button
                  type="button"
                  onClick={() => setActiveFaq(isOpen ? null : idx)}
                  className="w-full py-4 px-5 text-left flex items-center justify-between gap-4 font-semibold text-sm text-white hover:text-cyan-300 cursor-pointer transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-cyan-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 text-xs text-cyan-100/80 leading-relaxed border-t border-cyan-500/15 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Related tools */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Pair It With
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            More Free 360° Tools to Use with the Stitcher
          </h2>
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
      <section className="rounded-3xl border border-cyan-400/40 bg-gradient-to-r from-[#031d42] via-[#042858] to-[#011430] p-8 sm:p-12 text-center space-y-6 shadow-2xl">
        <h2 className="text-2xl sm:text-4xl font-black text-white">
          Prefer to Generate the Panorama Instead?
        </h2>
        <p className="text-sm sm:text-base text-cyan-100/80 max-w-xl mx-auto">
          Describe a scene and the AI Studio renders a seamless 2:1 equirectangular environment you can slice,
          stitch, or export as HDR lighting.
        </p>
        <button
          type="button"
          onClick={onLaunchStudio}
          className="px-8 py-4 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-400 to-teal-400 text-slate-950 shadow-xl shadow-cyan-400/40 hover:scale-105 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4 fill-slate-950" />
          <span>Open AI Panorama Studio</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </section>
    </div>
  );
}
