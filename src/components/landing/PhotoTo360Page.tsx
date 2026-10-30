import { useLanguage, useTranslation, withLanguageHref } from '../../utils/i18n';
import { landingMessages } from '../../utils/landingTranslations';
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
  const t = useTranslation(landingMessages);
  const [lang] = useLanguage();
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
      a: 'Reference photos are sent to the AI generation service to guide a new 2:1 panorama. They can guide style, lighting, materials, and colors; generated details may differ from the original scene.',
    },
    {
      q: 'Can I upload multiple photos to steer the environment?',
      a: 'Yes. You can upload up to 3 reference images simultaneously. For example, upload a living room photo, a balcony view, and a texture sample to synthesize a coherent, luxury penthouse panorama that honors all three aesthetic references.',
    },
    {
      q: 'Is this suitable for real estate virtual staging and architectural visualization?',
      a: 'You can use generated panoramas for design concepts and visualization. AI may invent room layouts or details, so the result is not a measured property tour or an accurate record of a real space.',
    },
    {
      q: 'Does the converted 360 photo have visible stitching lines?',
      a: 'Generated edges can differ. Optional seam blending can soften a visible boundary, but it may cause ghosting and cannot reconstruct mismatched objects. The model original remains available.',
    },
    {
      q: 'What resolution is the converted 360 panorama?',
      a: 'Request 1K, 2K, or 4K output. The provider may return fewer pixels; check the actual dimensions after generation. Non-2:1 results are center-cropped without upscaling. Optional light sharpening uses the existing resolution, not AI super-resolution.',
    },
    {
      q: 'Can I upload the resulting 360 photo to Facebook or Google Street View?',
      a: 'The VR JPG export and metadata tool add PhotoSphere XMP tags. Recognition and upload support depend on the destination platform; metadata does not guarantee acceptance.',
    },
  ];

  return (
    <div className="space-y-16 pb-16">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs text-cyan-400/70 pt-2">
        <a href={withLanguageHref("/", lang)} className="hover:text-cyan-300 transition-colors">{t("Home")}</a>
        <span>/</span>
        <span className="text-cyan-300">{t("Tools")}</span>
        <span>/</span>
        <span className="text-white font-medium">{t("Photo to 360 Converter")}</span>
      </nav>

      {/* Hero Section */}
      <section className="relative rounded-3xl overflow-hidden border border-cyan-500/25 bg-gradient-to-b from-[#061833]/85 via-[#030e20]/90 to-[#020914] p-6 sm:p-12 shadow-[0_0_60px_rgba(0,242,254,0.08)]">
        <div className="max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-400/15 border border-cyan-400/40 text-cyan-300 text-xs font-semibold tracking-wide">
            <Camera className="w-3.5 h-3.5 text-teal-300" />
            <span>{t("2D TO 360° SPATIAL AI • MULTI-REFERENCE STYLE EXPANSION")}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
            {t("Photo to 360 Converter:")}{' '}
            <span className="bg-gradient-to-r from-teal-300 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
              {t("Turn 2D Photos into 360° Panoramas")}
            </span>
          </h1>

          <p className="text-base sm:text-lg text-cyan-100/80 leading-relaxed max-w-3xl">
            {t("Use 2D photos, architectural concept renders, or scenery snapshots to guide a new 360° panorama. AI generation uses credits and sends reference photos to the service; generated details may differ from the real scene.")}
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              type="button"
              onClick={onLaunchImageToPano}
              className="px-6 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-teal-400 to-cyan-500 text-slate-950 shadow-lg shadow-teal-400/30 hover:shadow-teal-400/60 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-2"
            >
              <ImagePlus className="w-4 h-4 fill-slate-950" />
              <span>{t("Convert Your Photo to 360 Now")}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onOpenViewer}
              className="px-5 py-3.5 rounded-xl font-semibold text-sm bg-cyan-950/60 border border-cyan-500/40 text-cyan-200 hover:text-white hover:bg-cyan-900/60 transition-all cursor-pointer flex items-center gap-2"
            >
              <Eye className="w-4 h-4 text-cyan-400" />
              <span>{t("Open 360° VR Viewer")}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-4 text-xs text-cyan-300/70 border-t border-cyan-500/15">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              <span>{t("Upload Up to 3 Reference Photos")}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              <span>{t("Real Estate • Architecture • Travel")}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              <span>{t("PhotoSphere XMP in VR JPG Export")}</span>
            </span>
          </div>
        </div>
      </section>

      {/* Interactive 3D Architecture Viewport */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-teal-400">
              {t("Interactive 3D Viewport")}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              {t("360° Interior Panorama Preview")}
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
            <span>{t("Procedural interior sample (drag to explore)")}</span>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            {t("Real-World Applications")}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {t("Transform Any 2D Image into Immersive Spaces")}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-6 space-y-3 hover:border-teal-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-teal-500/15 text-teal-400 w-fit">
              <Building2 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">{t("Real Estate Virtual Staging")}</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              {t("Use listing photos or architectural renders as references for a 360° design concept. Generated layouts and details may differ from the property.")}
            </p>
          </div>

          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-6 space-y-3 hover:border-teal-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400 w-fit">
              <Camera className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">{t("Travel & Scenery Remastering")}</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              {t("Use a travel photo to guide a new 360° environment. Colors and atmosphere can inspire the result; generated terrain may differ from the original location.")}
            </p>
          </div>

          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-6 space-y-3 hover:border-teal-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-400 w-fit">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">{t("Concept Art to 3D Background")}</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              {t("Feed 2D concept art directly into the AI to generate a matching 360° VR skybox for Blender, Unreal Engine, or Unity pre-visualization.")}
            </p>
          </div>
        </div>
      </section>

      {/* 4-Step How-To */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            {t("Step-by-Step Guide")}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {t("How to Convert a 2D Photo into a 360 Panorama")}
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
              desc: 'AI generates a new 2:1 panorama guided by your references. Optional seam blending may reduce visible edge differences.',
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
              <h3 className="text-base font-bold text-white mb-2">{t(item.title)}</h3>
              <p className="text-xs text-cyan-200/70 leading-relaxed">{t(item.desc)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison Table vs PTGui vs 360 Cameras */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            {t("Technical Comparison")}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {t("AI Photo-to-360 vs Traditional Approaches")}
          </h2>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-cyan-500/25 bg-[#030e20]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#051733] text-cyan-200 border-b border-cyan-500/30 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-4 px-5">{t("Method")}</th>
                <th className="py-4 px-5 text-teal-400">{t("Our Photo-to-360 AI")}</th>
                <th className="py-4 px-5 text-slate-400">{t("PTGui Photo Stitching")}</th>
                <th className="py-4 px-5 text-slate-400">{t("360 Hardware Cameras")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 text-cyan-100/90">
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">{t("Input Required")}</td>
                <td className="py-3.5 px-5 text-teal-400 font-bold">{t("Single 2D Photo")}</td>
                <td className="py-3.5 px-5 text-slate-400">{t("8 - 24 overlapping photos")}</td>
                <td className="py-3.5 px-5 text-slate-400">{t("Dual fisheye sensors")}</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">{t("Hardware Cost")}</td>
                <td className="py-3.5 px-5 text-teal-400 font-bold">{t("$0 (Any existing photo)")}</td>
                <td className="py-3.5 px-5 text-slate-400">{t("Panoramic tripod head ($300+)")}</td>
                <td className="py-3.5 px-5 text-slate-400">{t("$450 - $1,200 (Insta360/Theta)")}</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">{t("Historical / Rendered Art")}</td>
                <td className="py-3.5 px-5 text-teal-400 font-bold">{t("Reference-guided generation")}</td>
                <td className="py-3.5 px-5 text-slate-400">{t("Impossible (needs real photos)")}</td>
                <td className="py-3.5 px-5 text-slate-400">{t("Impossible")}</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">{t("Ghosting & Parallax Stitch Bugs")}</td>
                <td className="py-3.5 px-5 text-teal-400 font-bold">{t("Seams or ghosting may occur")}</td>
                <td className="py-3.5 px-5 text-slate-400">{t("Frequent alignment errors")}</td>
                <td className="py-3.5 px-5 text-slate-400">{t("Visible seam halo close up")}</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">{t("Delivery Speed")}</td>
                <td className="py-3.5 px-5 text-teal-400 font-bold">{t("Varies by model and network")}</td>
                <td className="py-3.5 px-5 text-slate-400">{t("30 - 60 mins manual control points")}</td>
                <td className="py-3.5 px-5 text-slate-400">{t("Fast (post-export required)")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">{t("Frequently Asked Questions")}</div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {t("Photo to 360 Conversion FAQs")}
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
                  <span>{t(faq.q)}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-cyan-400 shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 text-xs text-cyan-100/80 leading-relaxed border-t border-cyan-500/15 pt-3">
                    {t(faq.a)}
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
          {t("Ready to Turn Your Photo into an Immersive 360°?")}
        </h2>
        <p className="text-sm sm:text-base text-cyan-100/80 max-w-xl mx-auto">
          {t("Add reference photos and describe the environment you want. Generation time and output quality depend on the model and network; preview the result before downloading.")}
        </p>
        <div>
          <button
            type="button"
            onClick={onLaunchImageToPano}
            className="px-8 py-4 rounded-xl font-bold text-sm bg-gradient-to-r from-teal-400 to-cyan-400 text-slate-950 shadow-xl shadow-teal-400/40 hover:scale-105 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <ImagePlus className="w-4 h-4 fill-slate-950" />
            <span>{t("Launch Photo to 360 Converter")}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
