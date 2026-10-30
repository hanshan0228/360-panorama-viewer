import { useLanguage, useTranslation, withLanguageHref } from '../../utils/i18n';
import { advancedTranslations } from '../../utils/advancedTranslations';
import { useState, useMemo } from 'react';
import {
  Sparkles,
  Gamepad2,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Box,
  ChevronDown,
  Eye,
  Code2,
} from 'lucide-react';
import { SphereViewer } from '../SphereViewer';
import { generateProceduralPanorama } from '../../utils/proceduralPanoramas';

interface SkyboxGeneratorPageProps {
  onLaunchStudio: (presetPrompt?: string) => void;
  onOpenCubemap: () => void;
}

export function SkyboxGeneratorPage({ onLaunchStudio, onOpenCubemap }: SkyboxGeneratorPageProps) {
  const t = useTranslation(advancedTranslations);
  const [lang] = useLanguage();
  const [activeFaq, setActiveFaq] = useState<number | null>(0);

  // Generate a cosmic sci-fi space nebula sample skybox
  const sampleSkyboxUrl = useMemo(() => {
    const canvas = generateProceduralPanorama(
      'space',
      'deep space nebula, purple and cyan luminous gas clouds, star clusters, celestial ringed planet, 8k 360 equirectangular skybox',
      2048,
      1024
    );
    return canvas.toDataURL('image/png');
  }, []);

  const faqs = [
    {
      q: 'What is an AI Skybox Generator and what formats does it produce?',
      a: 'An AI Skybox Generator generates immersive 360° spherical or cubic virtual backgrounds for games, VR simulations, and 3D scenes from text prompts. 360 Panorama Viewer outputs both standard 2:1 equirectangular spherical textures and 6 rectilinear cube faces (+X, -X, +Y, -Y, +Z, -Z) ready for immediate engine import.',
    },
    {
      q: 'Is 360 Panorama Viewer a direct alternative to Blockade Labs Skybox AI?',
      a: 'The studio combines panorama generation, WebGL preview, six-face PNG slicing, and PhotoSphere XMP tools. Inspect seams and returned dimensions, and check current credit pricing before generating.',
    },
    {
      q: 'How do I use the generated skybox in Unity?',
      a: 'In Unity, create a new Material and set its Shader to "Skybox > 6 Sided" (for cubemap slices) or "Skybox > Panoramic" (for the 2:1 equirectangular PNG). Assign your textures, then drag the Material into your Lighting Settings under Environment > Skybox Material.',
    },
    {
      q: 'Can I generate skyboxes for Unreal Engine 5?',
      a: 'Use an appropriate Radiance .HDR workflow for Unreal Engine and check the imported texture type. The six PNG faces are not an Unreal TextureCube asset.',
    },
    {
      q: 'Do the generated skyboxes come with commercial rights?',
      a: 'Paid plans include commercial usage rights. Check the pricing page and plan terms before using generated skyboxes in commercial projects.',
    },
    {
      q: 'How does seam healing work for skyboxes?',
      a: 'The studio applies harmonic boundary blending at the 0°/360° seam to reduce color differences. It cannot guarantee an invisible seam for every image.',
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
        <span className="text-white font-medium">{t("AI Skybox Generator")}</span>
      </nav>

      {/* Hero Section */}
      <section className="relative rounded-3xl overflow-hidden border border-cyan-500/25 bg-gradient-to-b from-[#081b38]/85 via-[#041026]/90 to-[#020914] p-6 sm:p-12 shadow-[0_0_60px_rgba(0,242,254,0.08)]">
        <div className="max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-400/15 border border-cyan-400/40 text-cyan-300 text-xs font-semibold tracking-wide">
            <Gamepad2 className="w-3.5 h-3.5 text-cyan-300" />
            <span>{t("GAME DEV • VR WORLDS • BLOCKADE LABS ALTERNATIVE")}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
            {t("AI Skybox Generator:")}{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-300 bg-clip-text text-transparent">
              {t("Create 360° VR Game Worlds")}
            </span>
          </h1>

          <p className="text-base sm:text-lg text-cyan-100/80 leading-relaxed max-w-3xl">
            {t("Generate 360° environments from text or concept art. Export a 2:1 image or six PNG cube faces, then check your engine’s import requirements.")}
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              type="button"
              onClick={() => onLaunchStudio('mystical celestial fantasy floating islands, aurora borealis sky, 8k 360 equirectangular skybox')}
              className="px-6 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 shadow-lg shadow-cyan-400/30 hover:shadow-cyan-400/60 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 fill-slate-950" />
              <span>{t("Generate Free Skybox Now")}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onOpenCubemap}
              className="px-5 py-3.5 rounded-xl font-semibold text-sm bg-cyan-950/60 border border-cyan-500/40 text-cyan-200 hover:text-white hover:bg-cyan-900/60 transition-all cursor-pointer flex items-center gap-2"
            >
              <Box className="w-4 h-4 text-cyan-400" />
              <span>{t("Open Cubemap Slicer")}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-4 text-xs text-cyan-300/70 border-t border-cyan-500/15">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              <span>{t("Instant 6-Sided Cubemap ZIP")}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              <span>{t("Full 360° x 180° Spherical Wrap")}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              <span>{t("Commercial Game License")}</span>
            </span>
          </div>
        </div>
      </section>

      {/* Live Interactive 3D Skybox Viewport */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
              {t("Interactive 3D Viewport")}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              {t("Inspect 360° Game Skybox in Real-Time WebGL")}
            </h2>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden border border-cyan-500/30 bg-[#020b18] shadow-2xl relative">
          <div className="h-[440px] sm:h-[520px] w-full">
            <SphereViewer
              textureUrl={sampleSkyboxUrl}
              className="h-full w-full"
              showControlsBar={true}
            />
          </div>
          <div className="absolute top-4 left-4 pointer-events-none bg-slate-950/80 backdrop-blur-md border border-cyan-400/30 rounded-lg px-3 py-1.5 text-xs text-cyan-200 flex items-center gap-2">
            <Gamepad2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>{t("Sample: Cosmic Nebula VR Skybox (Drag to pan 360°)")}</span>
          </div>
        </div>
      </section>

      {/* Feature Pillars */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            {t("Built For Game Engines")}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {t("Everything You Need For Immersive Worlds")}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-3 hover:border-cyan-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400 w-fit">
              <Box className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">{t("6-Sided Cubemap ZIP")}</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              {t("Convert a 2:1 panorama into six PNG faces for a Unity 6 Sided skybox. Other engines may require further configuration.")}
            </p>
          </div>

          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-3 hover:border-cyan-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-teal-500/15 text-teal-400 w-fit">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">{t("Seamless 360° Loop")}</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              {t("Harmonic boundary blending reduces visible color differences at the seam. Results depend on the source image.")}
            </p>
          </div>

          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-3 hover:border-cyan-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-400 w-fit">
              <Eye className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">{t("VR Cardboard Mode")}</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              {t("Inspect skyboxes in dual-eye stereoscopic split-screen on mobile browsers or VR headsets like Meta Quest.")}
            </p>
          </div>

          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-3 hover:border-cyan-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-purple-500/15 text-purple-400 w-fit">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">{t("Diverse Art Styles")}</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">
              {t("Switch between Cyberpunk, Fantasy, Cosmic Space, Anime, and Photorealistic Nature presets in one click.")}
            </p>
          </div>
        </div>
      </section>

      {/* Comparison Table vs Blockade Labs */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            {t("Competitive Comparison")}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {t("360 Panorama Viewer vs Blockade Labs Skybox AI")}
          </h2>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-cyan-500/25 bg-[#030e20]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#051733] text-cyan-200 border-b border-cyan-500/30 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-4 px-5">{t("Feature")}</th>
                <th className="py-4 px-5 text-cyan-400">360 Panorama Viewer</th>
                <th className="py-4 px-5 text-slate-400">Blockade Labs</th>
                <th className="py-4 px-5 text-slate-400">{t("Manual Matte Painting")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 text-cyan-100/90">
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">{t("Free Onboarding Credits")}</td>
                <td className="py-3.5 px-5 text-teal-400 font-bold">{t("Trial credits shown in your account")}</td>
                <td className="py-3.5 px-5 text-slate-400">{t("Limited trial / Paywall")}</td>
                <td className="py-3.5 px-5 text-slate-400">{t("N/A ($100s/artist hr)")}</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">{t("Cubemap 6-Sided Slicing")}</td>
                <td className="py-3.5 px-5 text-teal-400 font-bold">{t("Included (Client-side ZIP)")}</td>
                <td className="py-3.5 px-5 text-slate-400">{t("Requires Pro subscription")}</td>
                <td className="py-3.5 px-5 text-slate-400">{t("Manual 90-degree renders")}</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">{t("Seam Blending Engine")}</td>
                <td className="py-3.5 px-5 text-teal-400 font-bold">{t("Automated Poisson Harmonic")}</td>
                <td className="py-3.5 px-5 text-slate-400">{t("Standard wrap")}</td>
                <td className="py-3.5 px-5 text-slate-400">{t("Manual clone stamping")}</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">{t("VR Split-Screen Cardboard")}</td>
                <td className="py-3.5 px-5 text-teal-400 font-bold">{t("Built-in 1-Click Toggle")}</td>
                <td className="py-3.5 px-5 text-slate-400">{t("WebXR only")}</td>
                <td className="py-3.5 px-5 text-slate-400">{t("Requires game build")}</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">{t("PhotoSphere XMP Metadata")}</td>
                <td className="py-3.5 px-5 text-teal-400 font-bold">{t("Integrated Tool")}</td>
                <td className="py-3.5 px-5 text-slate-400">{t("Not supported")}</td>
                <td className="py-3.5 px-5 text-slate-400">{t("Third-party CLI tool")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Unity & Unreal Setup Guide */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-cyan-500/25 bg-[#031124] p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">{t("Unity Skybox Setup")}</h3>
          </div>
          <ol className="text-xs text-cyan-200/80 space-y-2 list-decimal list-inside leading-relaxed">
            <li>{t("Download the 6-sided cubemap ZIP from 360 Panorama Viewer.")}</li>
            <li>{t("In Unity, create a new Material named `Skybox_Custom`.")}</li>
            <li>{t("Set shader to `Skybox / 6 Sided`.")}</li>
            <li>{t("Assign Right (+X), Left (-X), Up (+Y), Down (-Y), Front (+Z), Back (-Z).")}</li>
            <li>{t("Assign to Window > Rendering > Lighting > Skybox Material.")}</li>
          </ol>
        </div>

        <div className="rounded-2xl border border-cyan-500/25 bg-[#031124] p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">{t("Unreal Engine 5 Skybox Setup")}</h3>
          </div>
          <ol className="text-xs text-cyan-200/80 space-y-2 list-decimal list-inside leading-relaxed">
            <li>{t("Export a Radiance .HDR environment and check Unreal Engine import requirements.")}</li>
            <li>{t("Import into the Content Browser and verify the texture type and HDR settings.")}</li>
            <li>{t("Place an `HDRIBackdrop` blueprint into your level.")}</li>
            <li>{t("Check that the imported .HDR texture has the type required by the `Cubemap` slot.")}</li>
            <li>{t("Adjust intensity and radius to match your scene scale.")}</li>
          </ol>
        </div>
      </section>

      <p className="text-sm text-cyan-100/80">
        <a href="/blog/panorama-to-skybox-threejs-unity/" hrefLang="en" className="text-cyan-300 underline">{t("Skybox tutorial: sample files, Three.js and Unity (English)")}</a>
      </p>

      {/* FAQ Accordion Section */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            {t("Frequently Asked Questions")}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {t("Common Skybox Generator Questions")}
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
      <section className="rounded-3xl border border-cyan-400/40 bg-gradient-to-r from-[#031d42] via-[#042858] to-[#011430] p-8 sm:p-12 text-center space-y-6 shadow-2xl">
        <h2 className="text-2xl sm:text-4xl font-black text-white">
          {t("Build Your First VR Skybox")}
        </h2>
        <p className="text-sm sm:text-base text-cyan-100/80 max-w-xl mx-auto">
          {t("No credit card required. Generate panoramic game backgrounds and export 6-sided cubemaps for your indie game or VR experience.")}
        </p>
        <div>
          <button
            type="button"
            onClick={() => onLaunchStudio('futuristic cybernetic space colony with planetary rings and glowing energy grid, 8k skybox')}
            className="px-8 py-4 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-400 to-teal-400 text-slate-950 shadow-xl shadow-cyan-400/40 hover:scale-105 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 fill-slate-950" />
            <span>{t("Launch Skybox Studio Free")}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
