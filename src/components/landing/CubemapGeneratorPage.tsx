import { useState } from 'react';
import {
  Box,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Code2,
  Lock,
  Cpu,
  Archive,
  Upload,
  Check,
} from 'lucide-react';
import { CubemapTab } from '../CubemapTab';
import { generateProceduralPanorama } from '../../utils/proceduralPanoramas';
import type { StylePresetId } from '../../types/panorama';

interface CubemapGeneratorPageProps {
  onLaunchStudio: () => void;
  currentPanoramaUrl: string;
  onPanoramaChange: (url: string) => void;
}

export function CubemapGeneratorPage({ onLaunchStudio, currentPanoramaUrl: activePanoUrl, onPanoramaChange: setActivePanoUrl }: CubemapGeneratorPageProps) {
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const isHdriMode = typeof window !== 'undefined' && window.location.pathname.includes('hdri-to-cubemap');

  const samplePresets: Array<{ id: string; label: string; style: StylePresetId; desc: string }> = [
    { id: 'space', label: 'Cosmic Nebula', style: 'space', desc: 'Deep space cosmic skybox' },
    { id: 'cyberpunk', label: 'Cyberpunk Metropolis', style: 'cyberpunk', desc: 'Neon city night skybox' },
    { id: 'nature', label: 'Tropical Sunset', style: 'nature', desc: 'Golden hour ocean horizon' },
    { id: 'fantasy', label: 'Celestial Temple', style: 'fantasy', desc: 'Fantasy ruins & aurora' },
    { id: 'interior', label: 'Modern Penthouse', style: 'interior', desc: 'Architectural studio lighting' },
  ];

  const handleSelectSample = (preset: typeof samplePresets[number]) => {
    try {
      const canvas = generateProceduralPanorama(preset.style, '', 2048, 1024);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      setActivePreset(preset.id);
      setActivePanoUrl(dataUrl);
    } catch (err) {
      console.error('Failed to generate sample cubemap:', err);
    }
  };

  const handleCustomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setActivePanoUrl(event.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const faqs = isHdriMode ? [
    {
      q: 'How does HDRI to Cubemap conversion work?',
      a: 'HDRI to cubemap conversion maps a 2:1 equirectangular high-dynamic-range environment onto the 6 internal faces of a cube (+X Right, -X Left, +Y Top, -Y Bottom, +Z Front, -Z Back). Each face is rendered with an exact 90-degree field of view using tangent ray-casting, eliminating all spherical pinching at the poles.',
    },
    {
      q: 'Which 3D engines and DCC apps support these cubemap faces?',
      a: 'The output faces are compatible with Unity (6-sided Skybox shader), Unreal Engine (IBL environment probes), Blender (World background and reflection probes), Godot, Three.js, and Babylon.js.',
    },
    {
      q: 'Can I download the 6 cubemap faces as a single ZIP archive?',
      a: 'Yes. Simply click "Download All (ZIP)" to package posx, negx, posy, negy, posz, and negz into one clean ZIP archive ready for immediate engine import.',
    },
    {
      q: 'Is this HDRI to cubemap converter free and private?',
      a: 'Yes, 100% free with unlimited conversions. The slicing math runs entirely inside your browser WebGL memory—no environment textures are uploaded to external servers.',
    },
  ] : [
    {
      q: 'What is a Cubemap Generator and why do game engines require it?',
      a: 'A Cubemap Generator converts a 2:1 equirectangular spherical panorama into 6 rectilinear 90° field-of-view cube faces (+X Right, -X Left, +Y Top, -Y Bottom, +Z Front, -Z Back). Most game engines (Unity, Unreal Engine, Godot, Three.js) rely on cubemaps for skybox rendering and specular reflection probes because GPU texture lookups across cube faces are significantly faster than spherical trigonometry.',
    },
    {
      q: 'Are files uploaded to a remote server during cubemap slicing?',
      a: 'No. 360 Panorama Viewer operates 100% client-side using WebGL and HTML5 Canvas ray-sphere projection algorithms. Your images never leave your computer, guaranteeing maximum privacy and instant conversion speed.',
    },
    {
      q: 'What face resolutions are supported for ZIP download?',
      a: 'You can choose between 256x256, 512x512, 1024x1024, or 2048x2048 pixels per cube face. Clicking "Download All (ZIP)" packages all 6 faces into a single compressed archive with standard engine naming conventions.',
    },
    {
      q: 'How are the cube faces named in the downloaded ZIP?',
      a: 'The archive contains posx.png (Right), negx.png (Left), posy.png (Top / Up), negy.png (Bottom / Down), posz.png (Front), and negz.png (Back). This naming convention matches Unity Skybox / 6 Sided shaders and Three.js CubeTexture loaders directly.',
    },
    {
      q: 'Can I download free cubemaps directly without uploading?',
      a: 'Yes! Click any of the free presets (Cosmic Nebula, Cyberpunk Metropolis, Tropical Sunset, etc.) above the slicer to instantly preview the 6 sliced faces and click "Download All (ZIP)" to get a free cubemap pack immediately.',
    },
    {
      q: 'Is this cubemap generator completely free?',
      a: 'Yes! The Cubemap Slicer is an unlimited free utility. You can upload any 2:1 equirectangular image, inspect the 6 slices, and download the complete ZIP archive without paying any credits or logging in.',
    },
  ];

  return (
    <div className="space-y-16 pb-16">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs text-cyan-400/70 pt-2">
        <a href="/" className="hover:text-cyan-300 transition-colors">Home</a>
        <span>/</span>
        <span className="text-cyan-300">Tools</span>
        <span>/</span>
        <span className="text-white font-medium">{isHdriMode ? 'HDRI to Cubemap' : 'Cubemap Generator'}</span>
      </nav>

      {/* Hero Section */}
      <section className="relative rounded-3xl overflow-hidden border border-cyan-500/25 bg-gradient-to-b from-[#061833]/85 via-[#030e20]/90 to-[#020914] p-6 sm:p-12 shadow-[0_0_60px_rgba(0,242,254,0.08)]">
        <div className="max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-400/15 border border-cyan-400/40 text-cyan-300 text-xs font-semibold tracking-wide">
            <Box className="w-3.5 h-3.5 text-cyan-400" />
            <span>{isHdriMode ? 'HDRI CONVERTER • RADIANCE HDR & EXR TO CUBEMAP • 6 CUBE FACES' : '100% CLIENT-SIDE • 6-FACE CUBIC SLICER • UNITY & UNREAL'}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
            {isHdriMode ? 'HDRI to Cubemap: ' : 'Cubemap Generator: '}
            <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-400 bg-clip-text text-transparent">
              {isHdriMode ? 'Convert 360° HDR Environments to 6 Cube Faces' : 'Slice 360° Panoramas to 6 Cube Faces'}
            </span>
          </h1>

          <p className="text-base sm:text-lg text-cyan-100/80 leading-relaxed max-w-3xl">
            {isHdriMode
              ? 'Convert 2:1 equirectangular HDRI environment lighting maps and spherical captures into 6 rectilinear cube faces (+X Right, -X Left, +Y Top, -Y Bottom, +Z Front, -Z Back). Export standard engine-ready textures for Unity, Unreal Engine, and Three.js.'
              : 'Convert 2:1 equirectangular spherical panoramas into 6 rectilinear cube faces (+X Right, -X Left, +Y Top, -Y Bottom, +Z Front, -Z Back) with client-side WebGL math. Includes free ready-to-download sample cubemaps and one-click batch ZIP export.'}
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <label className="px-6 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 shadow-lg shadow-cyan-400/30 hover:shadow-cyan-400/60 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-2">
              <Upload className="w-4 h-4 text-slate-950" />
              <span>Upload Custom 360 Photo</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleCustomUpload}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={onLaunchStudio}
              className="px-5 py-3.5 rounded-xl font-semibold text-sm bg-cyan-950/60 border border-cyan-500/40 text-cyan-200 hover:text-white hover:bg-cyan-900/60 transition-all cursor-pointer flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>Generate New AI 360 in Studio</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-4 text-xs text-cyan-300/70 border-t border-cyan-500/15">
            <span className="flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-teal-400" />
              <span>100% Private Client-Side Processing</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Archive className="w-4 h-4 text-teal-400" />
              <span>Instant 6-Face ZIP Archive Download</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              <span>Zero Ray Optical Distortion</span>
            </span>
          </div>
        </div>
      </section>

      {/* Embedded Live Tool Section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
              Live Slicer Engine
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              Instant 6-Face Cubemap Preview &amp; Export
            </h2>
          </div>
          <div className="text-xs text-cyan-300/80">
            Powered by Browser WebGL
          </div>
        </div>

        {/* Free Sample Cubemaps & Skybox Packs Selector */}
        <div className="p-4 rounded-2xl bg-[#03132b]/80 border border-cyan-500/30 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-cyan-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>Free Sample Cubemaps &amp; Skyboxes (Click to Slice &amp; Download Free ZIP)</span>
            </span>
            <span className="text-cyan-400/60 font-mono text-[11px]">Instant 6-Face Preview</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
            {samplePresets.map((preset) => {
              const isSelected = activePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectSample(preset)}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                    isSelected
                      ? 'border-cyan-400 bg-cyan-500/25 shadow-md shadow-cyan-500/30 text-white'
                      : 'border-cyan-500/20 bg-[#020b18] text-cyan-200/80 hover:bg-cyan-500/10 hover:border-cyan-400/50'
                  }`}
                >
                  <div className="font-semibold text-xs flex items-center justify-between">
                    <span>{preset.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />}
                  </div>
                  <div className="text-[10px] text-cyan-300/60 leading-tight">{preset.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-500/30 bg-[#020b18] p-4 sm:p-6 shadow-2xl">
          <CubemapTab currentPanoramaUrl={activePanoUrl} />
        </div>
      </section>

      {/* Technical Highlights Grid */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Mathematical Precision
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            Why Use Our Free Cubemap Slicer
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-3 hover:border-cyan-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400 w-fit">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Zero Optical Distortion</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              Uses exact inverse tangent ray casting to map spherical equirectangular coordinates (u, v) into planar cartesian cube normals.
            </p>
          </div>

          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-3 hover:border-cyan-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-teal-500/15 text-teal-400 w-fit">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Complete Privacy</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              No files are uploaded to any server. All processing runs in memory on your browser using HTML5 Canvas &amp; WebGL.
            </p>
          </div>

          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-3 hover:border-cyan-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-400 w-fit">
              <Archive className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Batch ZIP Packaging</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              Download all 6 faces bundled in a single ZIP file with standardized engine filenames (+X, -X, +Y, -Y, +Z, -Z).
            </p>
          </div>

          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-3 hover:border-cyan-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 w-fit">
              <Code2 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Universal Engine Support</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              Plug-and-play compatibility with Unity, Unreal Engine 5, Three.js, Babylon.js, Godot, and PlayCanvas.
            </p>
          </div>
        </div>
      </section>

      {/* Engine Compatibility Matrix */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Engine Mapping
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            Cubemap Face Orientation Reference
          </h2>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-cyan-500/25 bg-[#030e20]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#051733] text-cyan-200 border-b border-cyan-500/30 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-4 px-5">Face Label</th>
                <th className="py-4 px-5 text-cyan-400">Output Filename</th>
                <th className="py-4 px-5 text-slate-300">Unity Skybox Slot</th>
                <th className="py-4 px-5 text-slate-300">Three.js Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 text-cyan-100/90">
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">Right Face</td>
                <td className="py-3.5 px-5 text-teal-400 font-mono font-bold">posx.png</td>
                <td className="py-3.5 px-5">Right (+X)</td>
                <td className="py-3.5 px-5">Index 0 (px)</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">Left Face</td>
                <td className="py-3.5 px-5 text-teal-400 font-mono font-bold">negx.png</td>
                <td className="py-3.5 px-5">Left (-X)</td>
                <td className="py-3.5 px-5">Index 1 (nx)</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">Top / Up Face</td>
                <td className="py-3.5 px-5 text-teal-400 font-mono font-bold">posy.png</td>
                <td className="py-3.5 px-5">Up (+Y)</td>
                <td className="py-3.5 px-5">Index 2 (py)</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">Bottom / Down Face</td>
                <td className="py-3.5 px-5 text-teal-400 font-mono font-bold">negy.png</td>
                <td className="py-3.5 px-5">Down (-Y)</td>
                <td className="py-3.5 px-5">Index 3 (ny)</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">Front Face</td>
                <td className="py-3.5 px-5 text-teal-400 font-mono font-bold">posz.png</td>
                <td className="py-3.5 px-5">Front (+Z)</td>
                <td className="py-3.5 px-5">Index 4 (pz)</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">Back Face</td>
                <td className="py-3.5 px-5 text-teal-400 font-mono font-bold">negz.png</td>
                <td className="py-3.5 px-5">Back (-Z)</td>
                <td className="py-3.5 px-5">Index 5 (nz)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Frequently Asked Questions
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            Cubemap Slicer Questions &amp; Answers
          </h2>
        </div>

        <div className="max-w-3xl mx-auto space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = activeFaq === idx;
            return (
              <div
                key={idx}
                className="rounded-xl border border-cyan-500/25 bg-[#030e20] overflow-hidden transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setActiveFaq(isOpen ? null : idx)}
                  className="w-full py-4 px-5 text-left flex items-center justify-between gap-4 font-semibold text-sm text-white hover:text-cyan-300 cursor-pointer transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-cyan-400 shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
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

      {/* Final Action Callout */}
      <section className="rounded-3xl border border-cyan-400/40 bg-gradient-to-r from-[#031d42] via-[#042858] to-[#011430] p-8 sm:p-12 text-center space-y-6 shadow-2xl">
        <h2 className="text-2xl sm:text-4xl font-black text-white">
          Need to Generate a New 360 Panorama First?
        </h2>
        <p className="text-sm sm:text-base text-cyan-100/80 max-w-xl mx-auto">
          Create photorealistic or stylized 360 equirectangular panoramas in our AI Studio, then slice into cubemaps with one click.
        </p>
        <div>
          <button
            type="button"
            onClick={onLaunchStudio}
            className="px-8 py-4 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-400 to-teal-400 text-slate-950 shadow-xl shadow-cyan-400/40 hover:scale-105 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 fill-slate-950" />
            <span>Open AI Panorama Studio</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
