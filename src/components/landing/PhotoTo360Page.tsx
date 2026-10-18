import { useState, useMemo } from 'react';
import {
  Sparkles,
  Camera,
  ArrowRight,
  CheckCircle2,
  ImagePlus,
  ChevronDown,
  Eye,
  Building2,
} from 'lucide-react';
import { SphereViewer } from '../SphereViewer';
import { generateProceduralPanorama } from '../../utils/proceduralPanoramas';

interface PhotoTo360PageProps {
  onLaunchImageToPano: () => void;
  onOpenViewer: () => void;
}

export function PhotoTo360Page({ onLaunchImageToPano, onOpenViewer }: PhotoTo360PageProps) {
  const [activeFaq, setActiveFaq] = useState<number | null>(0);

  // Generate an interior architecture architectural sample
  const sampleInteriorUrl = useMemo(() => {
    const canvas = generateProceduralPanorama(
      'interior',
      'luxury modern penthouse interior, floor-to-ceiling glass windows, evening city view, warm architectural lighting, 8k equirectangular 360',
      2048,
      1024
    );
    return canvas.toDataURL('image/png');
  }, []);

  const faqs = [
    {
      q: 'How does Photo to 360 AI conversion work?',
      a: '360 Panorama Viewer utilizes an advanced spatial outpainting and multi-reference diffusion pipeline. When you provide reference photos (such as room photos, landscape shots, or concept art), the AI analyzes perspective lines, lighting vectors, and material textures, extrapolating them into a complete 360° horizontal by 180° vertical equirectangular sphere.',
    },
    {
      q: 'Can I upload multiple photos to steer the environment?',
      a: 'Yes. You can upload up to 3 reference images simultaneously. For example, upload a living room photo, a balcony view, and a texture sample to synthesize a coherent, luxury penthouse panorama that honors all three aesthetic references.',
    },
    {
      q: 'Is this suitable for real estate virtual staging and architectural visualization?',
      a: 'Yes! Real estate photographers and architects frequently use 360 Panorama Viewer to convert 2D architectural renderings or wide-angle room photos into full 360° virtual tours for clients, compatible with Matterport-style WebGL viewers and VR headsets.',
    },
    {
      q: 'Does the converted 360 photo have visible stitching lines?',
      a: 'No. Traditional multi-shot panorama stitching with software like PTGui often produces double-exposures, ghosting, or visible seam cuts. 360 Panorama Viewer applies automated harmonic Poisson seam healing at the 0°/360° juncture, ensuring an imperceptible, continuous 360-degree loop.',
    },
    {
      q: 'What resolution is the converted 360 panorama?',
      a: 'You can generate in 1K (1024x512), 2K (2048x1024), or 4K Ultra-Clarity (3840x1920). Our client-side unsharp masking and AI super-resolution engine ensures sharp architectural lines, window reflections, and flooring grain.',
    },
    {
      q: 'Can I upload the resulting 360 photo to Facebook or Google Street View?',
      a: 'Yes. We include a built-in 360° Metadata Injector tool that embeds official Adobe XMP PhotoSphere tags into the image file, so Facebook, Google Street View, and VR platforms instantly recognize it as an interactive 360° sphere.',
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
        <span className="text-white font-medium">Photo to 360 Converter</span>
      </nav>

      {/* Hero Section */}
      <section className="relative rounded-3xl overflow-hidden border border-cyan-500/25 bg-gradient-to-b from-[#061833]/85 via-[#030e20]/90 to-[#020914] p-6 sm:p-12 shadow-[0_0_60px_rgba(0,242,254,0.08)]">
        <div className="max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-400/15 border border-cyan-400/40 text-cyan-300 text-xs font-semibold tracking-wide">
            <Camera className="w-3.5 h-3.5 text-teal-300" />
            <span>2D TO 360° SPATIAL AI &bull; MULTI-REFERENCE STYLE EXPANSION</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
            Photo to 360 Converter:{' '}
            <span className="bg-gradient-to-r from-teal-300 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Turn 2D Photos into 360° Panoramas
            </span>
          </h1>

          <p className="text-base sm:text-lg text-cyan-100/80 leading-relaxed max-w-3xl">
            Transform standard 2D photos, architectural concept renders, or scenery snapshots into immersive 360° equirectangular panoramas.
            Intelligent spatial outpainting preserves lighting, materials, and colors across the entire 360° sphere.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              type="button"
              onClick={onLaunchImageToPano}
              className="px-6 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-teal-400 to-cyan-500 text-slate-950 shadow-lg shadow-teal-400/30 hover:shadow-teal-400/60 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-2"
            >
              <ImagePlus className="w-4 h-4 fill-slate-950" />
              <span>Convert Your Photo to 360 Now</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onOpenViewer}
              className="px-5 py-3.5 rounded-xl font-semibold text-sm bg-cyan-950/60 border border-cyan-500/40 text-cyan-200 hover:text-white hover:bg-cyan-900/60 transition-all cursor-pointer flex items-center gap-2"
            >
              <Eye className="w-4 h-4 text-cyan-400" />
              <span>Open 360° VR Viewer</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-4 text-xs text-cyan-300/70 border-t border-cyan-500/15">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              <span>Upload Up to 3 Reference Photos</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              <span>Real Estate &bull; Architecture &bull; Travel</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              <span>Automatic XMP Metadata Injection</span>
            </span>
          </div>
        </div>
      </section>

      {/* Interactive 3D Architecture Viewport */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-teal-400">
              Interactive 3D Viewport
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              Converted 360° Interior Panorama Demonstration
            </h2>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden border border-cyan-500/30 bg-[#020b18] shadow-2xl relative">
          <div className="h-[440px] sm:h-[520px] w-full">
            <SphereViewer
              textureUrl={sampleInteriorUrl}
              className="h-full w-full"
              showControlsBar={true}
            />
          </div>
          <div className="absolute top-4 left-4 pointer-events-none bg-slate-950/80 backdrop-blur-md border border-cyan-400/30 rounded-lg px-3 py-1.5 text-xs text-cyan-200 flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-teal-400" />
            <span>Sample: Converted Penthouse Architectural 360° (Drag to explore)</span>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Real-World Applications
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            Transform Any 2D Image into Immersive Spaces
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-6 space-y-3 hover:border-teal-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-teal-500/15 text-teal-400 w-fit">
              <Building2 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Real Estate Virtual Staging</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              Convert ordinary listing photos or architectural blueprints into complete 360-degree walkthrough spheres that buyers can pan and inspect on smartphones or VR goggles.
            </p>
          </div>

          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-6 space-y-3 hover:border-teal-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400 w-fit">
              <Camera className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Travel &amp; Scenery Remastering</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              Turn single-angle vacation landscapes and mountain summits into complete 360° horizons. Preserves sunset hues and terrain topology across the surrounding panorama.
            </p>
          </div>

          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-6 space-y-3 hover:border-teal-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-400 w-fit">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Concept Art to 3D Background</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              Feed 2D concept art directly into the AI to generate a matching 360° VR skybox for Blender, Unreal Engine, or Unity pre-visualization.
            </p>
          </div>
        </div>
      </section>

      {/* 4-Step How-To */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Step-by-Step Guide
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            How to Convert a 2D Photo into a 360 Panorama
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              step: '01',
              title: 'Upload Photo(s)',
              desc: 'Select 1 to 3 reference images from your device. Supports standard JPG, PNG, and WebP files.',
            },
            {
              step: '02',
              title: 'Set Prompt & Style',
              desc: 'Optionally add guidance instructions (e.g. "expand into a sunny Scandinavian living room with wooden beams").',
            },
            {
              step: '03',
              title: 'AI Spatial Expansion',
              desc: 'The model outpaints the 2D field of view into a 360° x 180° sphere and applies Poisson seam healing.',
            },
            {
              step: '04',
              title: 'Preview & Download',
              desc: 'Rotate your 360 panorama in the 3D viewer, inject PhotoSphere metadata, and download in high resolution.',
            },
          ].map((item, idx) => (
            <div
              key={idx}
              className="bg-[#031124] border border-cyan-500/25 rounded-2xl p-6 relative overflow-hidden group hover:border-teal-400/50 transition-all"
            >
              <div className="text-3xl font-black font-mono text-teal-500/20 group-hover:text-teal-400/30 transition-colors mb-2">
                {item.step}
              </div>
              <h3 className="text-base font-bold text-white mb-2">{item.title}</h3>
              <p className="text-xs text-cyan-200/70 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison Table vs PTGui vs 360 Cameras */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Technical Comparison
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            AI Photo-to-360 vs Traditional Approaches
          </h2>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-cyan-500/25 bg-[#030e20]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#051733] text-cyan-200 border-b border-cyan-500/30 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-4 px-5">Method</th>
                <th className="py-4 px-5 text-teal-400">Our Photo-to-360 AI</th>
                <th className="py-4 px-5 text-slate-400">PTGui Photo Stitching</th>
                <th className="py-4 px-5 text-slate-400">360 Hardware Cameras</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 text-cyan-100/90">
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">Input Required</td>
                <td className="py-3.5 px-5 text-teal-400 font-bold">Single 2D Photo</td>
                <td className="py-3.5 px-5 text-slate-400">8 - 24 overlapping photos</td>
                <td className="py-3.5 px-5 text-slate-400">Dual fisheye sensors</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">Hardware Cost</td>
                <td className="py-3.5 px-5 text-teal-400 font-bold">$0 (Any existing photo)</td>
                <td className="py-3.5 px-5 text-slate-400">Panoramic tripod head ($300+)</td>
                <td className="py-3.5 px-5 text-slate-400">$450 - $1,200 (Insta360/Theta)</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">Historical / Rendered Art</td>
                <td className="py-3.5 px-5 text-teal-400 font-bold">Fully Supported</td>
                <td className="py-3.5 px-5 text-slate-400">Impossible (needs real photos)</td>
                <td className="py-3.5 px-5 text-slate-400">Impossible</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">Ghosting &amp; Parallax Stitch Bugs</td>
                <td className="py-3.5 px-5 text-teal-400 font-bold">Zero (AI generates continuity)</td>
                <td className="py-3.5 px-5 text-slate-400">Frequent alignment errors</td>
                <td className="py-3.5 px-5 text-slate-400">Visible seam halo close up</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">Delivery Speed</td>
                <td className="py-3.5 px-5 text-teal-400 font-bold">Instant (30s)</td>
                <td className="py-3.5 px-5 text-slate-400">30 - 60 mins manual control points</td>
                <td className="py-3.5 px-5 text-slate-400">Fast (post-export required)</td>
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
            Photo to 360 Conversion FAQs
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
      <section className="rounded-3xl border border-teal-400/40 bg-gradient-to-r from-[#032338] via-[#042848] to-[#011425] p-8 sm:p-12 text-center space-y-6 shadow-2xl">
        <h2 className="text-2xl sm:text-4xl font-black text-white">
          Ready to Turn Your Photo into an Immersive 360°?
        </h2>
        <p className="text-sm sm:text-base text-cyan-100/80 max-w-xl mx-auto">
          Upload any 2D snapshot or architectural render. Get an interactive 360° equirectangular sphere in under 30 seconds.
        </p>
        <div>
          <button
            type="button"
            onClick={onLaunchImageToPano}
            className="px-8 py-4 rounded-xl font-bold text-sm bg-gradient-to-r from-teal-400 to-cyan-400 text-slate-950 shadow-xl shadow-teal-400/40 hover:scale-105 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <ImagePlus className="w-4 h-4 fill-slate-950" />
            <span>Launch Photo to 360 Converter</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
