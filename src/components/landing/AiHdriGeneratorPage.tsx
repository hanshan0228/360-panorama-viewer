import { useState, useMemo } from 'react';
import {
  Sparkles,
  Zap,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Box,
  ChevronDown,
  Sun,
} from 'lucide-react';
import { SphereViewer } from '../SphereViewer';
import { generateProceduralPanorama } from '../../utils/proceduralPanoramas';

interface AiHdriGeneratorPageProps {
  onLaunchStudio: (presetPrompt?: string) => void;
  onOpenCubemap: () => void;
}

export function AiHdriGeneratorPage({ onLaunchStudio, onOpenCubemap }: AiHdriGeneratorPageProps) {
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [exposureLevel, setExposureLevel] = useState<number>(1.2);

  // Generate a high-contrast HDRI sample panorama (Sunset / Golden hour)
  const sampleHdriUrl = useMemo(() => {
    const canvas = generateProceduralPanorama(
      'nature',
      'golden hour desert canyon sunset, high dynamic range sky, bright sun disk, deep mountain shadows, 8k equirectangular hdri',
      2048,
      1024
    );
    return canvas.toDataURL('image/png');
  }, []);

  const faqs = [
    {
      q: 'What is an AI HDRI Generator and how does it work?',
      a: 'An AI HDRI Generator transforms natural language text descriptions or concept images into 360° equirectangular High Dynamic Range (HDR) environment textures. It calculates a complete 360° horizontal by 180° vertical spherical wrap, balances dynamic range across highlights and shadows, and outputs a format ready for Image-Based Lighting (IBL) in 3D software.',
    },
    {
      q: 'Can I export in Radiance .HDR or EXR format for Blender and Unreal Engine?',
      a: 'Yes. PanoramaAI Studio allows downloading the full 2:1 equirectangular map in high-resolution PNG as well as generating 32-bit floating point Radiance .HDR files and 6-sided cubemap slices formatted specifically for Blender World Shaders, Unreal Engine 5 Skylights, and Unity Skyboxes.',
    },
    {
      q: 'How does PanoramaAI solve the 360° boundary seam problem?',
      a: 'Standard 2D AI models produce a jarring vertical line where the left and right edges meet (x=0 and x=W). PanoramaAI integrates a proprietary Poisson harmonic seam blending engine that calculates gradient continuity across the boundary, guaranteeing 100% seamless 360° rotation with zero seam artifacts.',
    },
    {
      q: 'Is this suitable for realistic lighting and reflection probes in 3D scenes?',
      a: 'Absolutely. Because the AI synthesizes physically grounded light sources (sun position, horizon gradients, ambient sky bounce), you can drop the generated HDRI directly into your 3D viewport to get accurate specular highlights, realistic shadow dropoffs, and authentic metallic reflections.',
    },
    {
      q: 'Is the AI HDRI Generator free to use?',
      a: 'Yes! Every new user receives 4 complimentary trial credits upon onboarding to generate, inspect, and export HDRI maps. You can preview in real-time WebGL, slice into cubemaps, and download assets without requiring a credit card.',
    },
    {
      q: 'How do I import the generated HDRI into Blender?',
      a: 'In Blender, open the Shader Editor and switch from Object to World mode. Add an "Environment Texture" node, connect its Color output to the Background node Color input, and open your downloaded equirectangular file. Set the projection to Equirectangular to instantly light your scene.',
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
        <span className="text-white font-medium">AI HDRI Generator</span>
      </nav>

      {/* Hero Section */}
      <section className="relative rounded-3xl overflow-hidden border border-cyan-500/25 bg-gradient-to-b from-[#061833]/80 via-[#030e20]/90 to-[#020914] p-6 sm:p-12 shadow-[0_0_60px_rgba(0,242,254,0.08)]">
        <div className="max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-400/15 border border-cyan-400/40 text-cyan-300 text-xs font-semibold tracking-wide">
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <span>32-BIT RADIANCE HDRI &bull; BLENDER &amp; UNREAL READY</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
            AI HDRI Generator:{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-amber-300 bg-clip-text text-transparent">
              Create 360° HDR Environments
            </span>
          </h1>

          <p className="text-base sm:text-lg text-cyan-100/80 leading-relaxed max-w-3xl">
            Generate photorealistic 360° high dynamic range lighting maps and panoramic skyboxes in seconds.
            Equirectangular 2:1 textures with 4K clarity, harmonic seam healing, and direct 3D engine compatibility.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              type="button"
              onClick={() => onLaunchStudio('photorealistic golden hour canyon sunset, high dynamic range 8k hdri lighting, cinematic reflections')}
              className="px-6 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 shadow-lg shadow-cyan-400/30 hover:shadow-cyan-400/60 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 fill-slate-950" />
              <span>Generate Free HDRI Now</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onOpenCubemap}
              className="px-5 py-3.5 rounded-xl font-semibold text-sm bg-cyan-950/60 border border-cyan-500/40 text-cyan-200 hover:text-white hover:bg-cyan-900/60 transition-all cursor-pointer flex items-center gap-2"
            >
              <Box className="w-4 h-4 text-cyan-400" />
              <span>Cubemap 6-Face Slicer</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-4 text-xs text-cyan-300/70 border-t border-cyan-500/15">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              <span>Zero Seam Discontinuity</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              <span>Blender &bull; Unreal Engine &bull; Unity</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              <span>Free 4-Credit Trial Onboarding</span>
            </span>
          </div>
        </div>
      </section>

      {/* Live Interactive 3D HDRI Viewport Preview */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
              Interactive 3D Viewport
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              Inspect Dynamic Lighting &amp; 360° Reflections
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-cyan-300/80">Simulated EV:</span>
            <div className="flex items-center gap-1 bg-[#051326] border border-cyan-500/30 rounded-lg p-1 text-xs">
              {[0.8, 1.2, 1.6].map((ev) => (
                <button
                  key={ev}
                  type="button"
                  onClick={() => setExposureLevel(ev)}
                  className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                    exposureLevel === ev
                      ? 'bg-cyan-500/30 text-white font-bold'
                      : 'text-cyan-300/70 hover:text-white'
                  }`}
                >
                  {ev}x
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden border border-cyan-500/30 bg-[#020b18] shadow-2xl relative">
          <div className="h-[440px] sm:h-[520px] w-full">
            <SphereViewer
              textureUrl={sampleHdriUrl}
              className="h-full w-full"
              showControlsBar={true}
            />
          </div>
          <div className="absolute top-4 left-4 pointer-events-none bg-slate-950/80 backdrop-blur-md border border-cyan-400/30 rounded-lg px-3 py-1.5 text-xs text-cyan-200 flex items-center gap-2">
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <span>Sample: Golden Hour Sunset HDRI (Drag to rotate 360°)</span>
          </div>
        </div>
      </section>

      {/* Core Advantages Grid */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Engineered For 3D Pipelines
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            Why 3D Artists Choose PanoramaAI HDRI
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-3 hover:border-cyan-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400 w-fit">
              <Sun className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Physically Grounded IBL</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              Synthesizes realistic sun disk intensity and ambient horizon bounce for accurate specular highlights and soft contact shadows.
            </p>
          </div>

          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-3 hover:border-cyan-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-teal-500/15 text-teal-400 w-fit">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Zero Seam Discontinuity</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              Proprietary harmonic Poisson seam blending joins the 0° and 360° boundaries seamlessly with zero brightness steps.
            </p>
          </div>

          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-3 hover:border-cyan-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-400 w-fit">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">4K Ultra-Clarity</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              Super-resolution detailing reconstructs distant mountain ridges, cloud turbulence, and architectural geometry.
            </p>
          </div>

          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-3 hover:border-cyan-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 w-fit">
              <Box className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">One-Click Cubemap Export</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              Convert the spherical map directly into 6 rectilinear cube faces (+X, -X, +Y, -Y, +Z, -Z) ready for Unity skybox shaders.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works (Step by Step Schema) */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Simple 4-Step Workflow
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            How to Generate an AI HDRI in 30 Seconds
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              step: '01',
              title: 'Describe Environment',
              desc: 'Enter your desired lighting conditions, weather, time of day, or architectural aesthetic in plain natural English.',
            },
            {
              step: '02',
              title: 'Harmonic Synthesis',
              desc: 'The AI constructs a 2:1 spherical projection while running automated boundary gradient matching to eliminate vertical seams.',
            },
            {
              step: '03',
              title: 'Inspect 3D WebGL',
              desc: 'Interact with the 360° sphere directly in your browser. Pan, zoom, inspect light sources, and check exposure brackets.',
            },
            {
              step: '04',
              title: 'Export to 3D Suite',
              desc: 'Download the 4K equirectangular texture, generate Radiance .HDR, or export a 6-sided cubemap ZIP archive.',
            },
          ].map((item, idx) => (
            <div
              key={idx}
              className="bg-[#031124] border border-cyan-500/25 rounded-2xl p-6 relative overflow-hidden group hover:border-cyan-400/50 transition-all"
            >
              <div className="text-3xl font-black font-mono text-cyan-500/20 group-hover:text-cyan-400/30 transition-colors mb-2">
                {item.step}
              </div>
              <h3 className="text-base font-bold text-white mb-2">{item.title}</h3>
              <p className="text-xs text-cyan-200/70 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison Table vs Physical Rig vs Stock Libraries */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Benchmark Analysis
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            AI HDRI Generator vs Traditional Workflows
          </h2>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-cyan-500/25 bg-[#030e20]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#051733] text-cyan-200 border-b border-cyan-500/30 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-4 px-5">Workflow Metric</th>
                <th className="py-4 px-5 text-cyan-400">PanoramaAI HDRI</th>
                <th className="py-4 px-5 text-slate-400">Physical Mirror Ball Rig</th>
                <th className="py-4 px-5 text-slate-400">Stock 3D Libraries</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 text-cyan-100/90">
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">Turnaround Time</td>
                <td className="py-3.5 px-5 text-teal-400 font-bold">15 - 30 seconds</td>
                <td className="py-3.5 px-5 text-slate-400">2 - 5 hours shoot &amp; stitch</td>
                <td className="py-3.5 px-5 text-slate-400">1 - 2 hours searching catalogs</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">Equipment Cost</td>
                <td className="py-3.5 px-5 text-teal-400 font-bold">$0 (Web Browser)</td>
                <td className="py-3.5 px-5 text-slate-400">$1,500 - $3,500 DSLR/Bracket</td>
                <td className="py-3.5 px-5 text-slate-400">$20 - $50 per single asset</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">Art Direction Freedom</td>
                <td className="py-3.5 px-5 text-teal-400 font-bold">Infinite via Text Prompts</td>
                <td className="py-3.5 px-5 text-slate-400">Constrained to real physical spots</td>
                <td className="py-3.5 px-5 text-slate-400">Fixed static presets only</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">Seam Blending</td>
                <td className="py-3.5 px-5 text-teal-400 font-bold">Automated Poisson gradient</td>
                <td className="py-3.5 px-5 text-slate-400">Manual PTGui masking</td>
                <td className="py-3.5 px-5 text-slate-400">Pre-stitched (unalterable)</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">Engine Export</td>
                <td className="py-3.5 px-5 text-teal-400 font-bold">Equirectangular + 6-Face Cubemap</td>
                <td className="py-3.5 px-5 text-slate-400">Equirectangular only</td>
                <td className="py-3.5 px-5 text-slate-400">Format varies</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Integration Code Snippet */}
      <section className="rounded-2xl border border-cyan-500/25 bg-[#031124] p-6 sm:p-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">Quick Integration: Blender World Shader</h3>
            <p className="text-xs text-cyan-200/70">Connect the equirectangular map to light your scene with one click.</p>
          </div>
          <span className="text-[10px] font-mono px-2 py-1 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
            Blender 3.x / 4.x
          </span>
        </div>

        <pre className="p-4 rounded-xl bg-[#010813] border border-cyan-500/20 text-cyan-300 font-mono text-xs overflow-x-auto leading-relaxed">
{`# 1. Open Shader Editor -> Switch from 'Object' to 'World'
# 2. Add Environment Texture (Shift + A -> Texture -> Environment Texture)
# 3. Load your downloaded PanoramaAI .png or .hdr file
# 4. Connect Environment Texture [Color] -> Background [Color]
# 5. Connect Background [Background] -> World Output [Surface]
# Tip: Set Strength to 1.0 - 1.5 for realistic global illumination.`}
        </pre>
      </section>

      {/* FAQ Accordion Section */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Frequently Asked Questions
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            Everything You Need to Know About AI HDRI
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
          Ready to Generate Your Custom 3D HDRI?
        </h2>
        <p className="text-sm sm:text-base text-cyan-100/80 max-w-xl mx-auto">
          Start with 4 free trial credits. Generate seamless 360° environments and export ready-to-use textures for your next 3D project.
        </p>
        <div>
          <button
            type="button"
            onClick={() => onLaunchStudio('photorealistic sci-fi hangar, 8k equirectangular hdri, volumetric lighting, reflective floor')}
            className="px-8 py-4 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-400 to-teal-400 text-slate-950 shadow-xl shadow-cyan-400/40 hover:scale-105 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 fill-slate-950" />
            <span>Launch HDRI Studio Free</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
