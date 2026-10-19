import { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Compass,
  Gamepad2,
  Globe2,
  GraduationCap,
  Lock,
  Ruler,
  Sparkles,
} from 'lucide-react';
import { GlobeTab } from '../GlobeTab';
import type { ActiveTab } from '../../types/panorama';

interface PhotoToGlobePageProps {
  currentPanoramaUrl: string;
  onNavigateTab: (tab: ActiveTab, pushPath?: string) => void;
  onLaunchStudio: () => void;
}

export function PhotoToGlobePage({ currentPanoramaUrl, onNavigateTab, onLaunchStudio }: PhotoToGlobePageProps) {
  const [activeFaq, setActiveFaq] = useState<number | null>(0);

  const steps = [
    {
      title: 'Load a map, image, or 360° photo',
      text: 'Click "Upload Custom Map Texture" and pick any 2:1 image: a geographic world map, a fictional continent chart, a flat equirectangular photograph, or an exported 360° panorama.',
    },
    {
      title: 'It wraps around the sphere instantly',
      text: 'The WebGL engine maps your image to UV coordinates on a Three.js sphere, so longitudes run around the equator and the flat left and right edges meet at the 180° antimeridian.',
    },
    {
      title: 'Control the planet',
      text: 'Drag to orbit, scroll to zoom, change the rotation speed, and switch to wireframe mode to check how your projection stretches near the poles.',
    },
    {
      title: 'Capture or share the result',
      text: 'Grab a perspective snapshot for a thumbnail, presentation slide, or YouTube intro, or send the same image to the 360° viewer when you want to look around from inside the scene.',
    },
  ];

  const useCases = [
    {
      icon: BookOpen,
      title: 'Fantasy Worldbuilding',
      text: 'Check whether the continents of a hand-drawn campaign map actually survive being wrapped onto a planet before you hand it to players.',
    },
    {
      icon: GraduationCap,
      title: 'Geography Teaching',
      text: 'Show how a Mercator classroom wall map distorts Greenland and Antarctica once it becomes an actual sphere.',
    },
    {
      icon: Gamepad2,
      title: 'Game & Skybox Prototyping',
      text: 'Preview a planet texture or procedural world map on a lit sphere before importing it into Unity, Unreal Engine, or Three.js.',
    },
    {
      icon: Sparkles,
      title: 'Photos as Tiny Planets',
      text: 'Wrap any equirectangular 360° photo around the globe for a stereographic "tiny planet" look without installing a stereographic projection app.',
    },
  ];

  const comparison = [
    { feature: 'Works fully in a browser with no install', us: 'Yes — WebGL 2.0', a: 'Yes', b: 'Yes', c: 'Yes' },
    { feature: 'Your image never leaves the device', us: 'Yes — 100% client-side', a: 'Uploads to their server', b: 'Uploads / hosted globes', c: 'No upload, but no custom texture' },
    { feature: 'Wrap any custom image, including fantasy maps', us: 'Yes', a: 'Yes', b: 'Limited', c: 'No — real Earth imagery only' },
    { feature: 'Atmosphere glow, wireframe and spin controls', us: 'Yes', a: 'Limited', b: 'Limited', c: 'No' },
    { feature: 'Price', us: 'Free, no account', a: 'Free tier with watermark/ads', b: 'Free with account', c: 'Free, but not a map-to-sphere tool' },
  ];

  const formats = [
    { topic: 'Ideal aspect ratio', detail: '2:1 (for example 4096×2048). A 1:1 square image wraps once around the equator and shows a pinch at both poles.' },
    { topic: 'Longitude / latitude origin', detail: 'The centre column of the image becomes longitude 0°, the left and right edges meet at 180°. Longitude grows to the right when viewed from outside the globe.' },
    { topic: 'File types', detail: 'Any browser-decodable image works: PNG, JPEG, WEBP, and GIF. For crisp continents use PNG or a high-quality JPEG around 4096 px wide.' },
    { topic: 'Flat, non-equirectangular maps', detail: 'Mercator and Robinson maps still wrap, but the distortion is obvious near the poles. Pre-project to equirectangular for a believable planet.' },
  ];

  const faqs = [
    {
      q: 'Is this a free alternative to MapToGlobe?',
      a: 'Yes. This page implements the same idea — projecting a flat image onto a rotating 3D planet — with WebGL in your browser. It handles real geographic maps, fictional fantasy cartography, and photographic equirectangular panoramas, and it never uploads your file.',
    },
    {
      q: 'What is the difference between "map to globe" and "photo to globe"?',
      a: 'The math is identical; only the source image changes. A map to globe conversion wraps a cartographic world map so continents land on a sphere. A photo to globe conversion wraps an equirectangular 360° photo (or a flat picture) so the panorama becomes a small planet you can spin.',
    },
    {
      q: 'Does the globe maker upload my maps to a server?',
      a: 'No. The projection runs entirely client-side in WebGL, so cartographic files, unreleased game maps, and personal photos stay on your machine. There is nothing to sign up for and no queue to wait in.',
    },
    {
      q: 'Can I use fantasy maps for worldbuilding and D&D?',
      a: 'Yes, and that is one of the most common uses. Writers, tabletop game masters, and concept artists load world maps to see how the coastlines behave at the poles and to sanity-check the scale of continents.',
    },
    {
      q: 'Which projection should I export from QGIS, Photoshop or GIMP?',
      a: 'Equirectangular (also called plate carrée, EPSG:4326, or "simple cylindrical"). Export at a 2:1 ratio such as 4096×2048, keep the whole world inside the frame, and place 0° longitude in the centre column for the cleanest wrap.',
    },
    {
      q: 'Can I rotate the globe automatically for a video or presentation?',
      a: 'Yes. Turn on auto-rotation and set the speed, then record the viewport. If you need a rendered file instead of a screen capture, the 360° photo to video tool exports rotating MP4/WebM clips.',
    },
    {
      q: 'Does it work on phones and tablets?',
      a: 'Yes. The globe uses touch drag to orbit and pinch to zoom, and the whole projection runs in the mobile browser without an app install or an account.',
    },
    {
      q: 'Is the tool useful for science or geography teaching?',
      a: 'It is a fast way to demonstrate map projection distortion: load the same syllabus map in Mercator and in equirectangular form and compare how the polar regions compress or explode on the sphere.',
    },
  ];

  const related = [
    { label: '360° Panorama Viewer', note: 'Look around from inside a photo', href: '/360-panorama-viewer/', tab: 'viewer' as ActiveTab },
    { label: 'Cubemap Generator', note: 'Slice panoramas into 6 engine faces', href: '/cubemap-generator/', tab: 'landing-cubemap' as ActiveTab },
    { label: 'Cubemap to Equirectangular', note: 'Rebuild a 2:1 panorama from 6 faces', href: '/cubemap-to-equirectangular/', tab: 'landing-cube2eq' as ActiveTab },
    { label: 'AI HDRI Generator', note: 'Environment lighting for Blender & Unreal', href: '/ai-hdri-generator/', tab: 'landing-hdri' as ActiveTab },
    { label: 'Photo to 360° Converter', note: 'Turn a flat photo into a 360° scene', href: '/photo-to-360-converter/', tab: 'landing-photo360' as ActiveTab },
    { label: '360° Photo to Video', note: 'Export rotating clips for social media', href: '/360-photo-to-video/', tab: 'landing-video' as ActiveTab },
  ];

  return (
    <div className="space-y-16 pb-16">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs text-cyan-400/70 pt-2">
        <a href="/" className="hover:text-cyan-300 transition-colors">Home</a>
        <span>/</span>
        <span className="text-cyan-300">Tools</span>
        <span>/</span>
        <span className="text-white font-medium">Map to Globe</span>
      </nav>

      {/* Interactive 3D globe tool */}
      <GlobeTab currentPanoramaUrl={currentPanoramaUrl} onNavigateTab={onNavigateTab} />

      {/* Definition */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            What It Does
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            What Is a Map to Globe Converter?
          </h2>
        </div>

        <div className="max-w-3xl mx-auto space-y-4 text-sm text-cyan-100/80 leading-relaxed">
          <p>
            A map to globe converter takes a flat, rectangular image and wraps it around a sphere so you can
            rotate the result like a planet. It is sometimes called a globe maker, an image to globe tool, or a
            sphere projection tool — the operation is always the same: read every pixel of your image, convert
            its X and Y coordinates into longitude and latitude, and sample the pixel that lies in that
            direction.
          </p>
          <p>
            Because the maths is pure geometry, the result is instant and lossless: no server render, no
            queue, no watermark. What matters for quality is the source image. An{' '}
            <strong className="text-white">equirectangular</strong> world map (2:1, latitude running linearly
            from the south pole to the north pole) wraps without artefacts, while a Mercator wall map will
            squeeze the poles the moment it becomes spherical.
          </p>
          <p>
            The same projection works on more than cartography. Any 360° photograph is already equirectangular,
            so loading one here produces the classic "tiny planet" view — geography on the outside, instead of
            the inside-out view you get from the{' '}
            <a
              href="/360-panorama-viewer/"
              onClick={(e) => { e.preventDefault(); onNavigateTab('viewer', '/360-panorama-viewer/'); }}
              className="text-cyan-300 underline decoration-cyan-500/50 hover:text-cyan-200"
            >
            panorama viewer
            </a>
            .
          </p>
        </div>
      </section>

      {/* How to */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Step by Step
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            How to Wrap an Image onto a 3D Globe
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

      {/* Use cases */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Why People Use It
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            Worldbuilding, Teaching, and Game Prototyping
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {useCases.map(useCase => (
            <div key={useCase.title} className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-3 hover:border-cyan-400/40 transition-colors">
              <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400 w-fit">
                <useCase.icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-base">{useCase.title}</h3>
              <p className="text-xs text-cyan-200/70 leading-relaxed">{useCase.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section className="space-y-6">
        <div className="text-center max-w-3xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Honest Comparison
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            This Globe Maker vs MapToGlobe, WebGL Earth &amp; Google Earth Web
          </h2>
          <p className="text-xs text-cyan-200/70">
            Google Earth Web renders real satellite imagery but cannot wrap your own texture. WebGL Earth
            renders hosted globes. MapToGlobe wraps arbitrary images, as does this tool — the practical
            difference is that here nothing is uploaded, and the same session can slice the result into
            cubemaps or export it as video.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-cyan-500/25 bg-[#030e20]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#051733] text-cyan-200 border-b border-cyan-500/30 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-4 px-5">Capability</th>
                <th className="py-4 px-5 text-teal-300">360 Panorama Viewer</th>
                <th className="py-4 px-5 text-slate-300">MapToGlobe</th>
                <th className="py-4 px-5 text-slate-300">WebGL Earth</th>
                <th className="py-4 px-5 text-slate-300">Google Earth Web</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 text-cyan-100/90">
              {comparison.map(row => (
                <tr key={row.feature}>
                  <td className="py-3.5 px-5 font-semibold text-white">{row.feature}</td>
                  <td className="py-3.5 px-5 text-teal-300 font-semibold">{row.us}</td>
                  <td className="py-3.5 px-5">{row.a}</td>
                  <td className="py-3.5 px-5">{row.b}</td>
                  <td className="py-3.5 px-5">{row.c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Image requirements */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Image Preparation
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            Which Image Format Wraps Best on a Sphere?
          </h2>
        </div>

        <div className="max-w-4xl mx-auto space-y-3">
          {formats.map(item => (
            <div key={item.topic} className="flex flex-col sm:flex-row gap-2 sm:gap-6 rounded-xl border border-cyan-500/20 bg-[#030e20] p-4">
              <div className="sm:w-64 shrink-0 flex items-center gap-2 text-sm font-bold text-white">
                <Ruler className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>{item.topic}</span>
              </div>
              <p className="text-xs text-cyan-100/80 leading-relaxed">{item.detail}</p>
            </div>
          ))}
        </div>

        <div className="max-w-4xl mx-auto rounded-2xl border border-teal-500/25 bg-teal-500/5 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Lock className="w-6 h-6 text-teal-400 shrink-0" />
          <p className="text-xs text-teal-100/90 leading-relaxed">
            <strong className="text-white">Nothing is uploaded.</strong> The projection, the preview, and the
            snapshot all run inside your browser tab. Close the page and no copy of your map exists anywhere
            else.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            Frequently Asked Questions
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            Map to Globe Questions &amp; Answers
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
            More Free 360° Tools to Use with the Globe Maker
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
        <Compass className="w-8 h-8 text-cyan-300 mx-auto" />
        <h2 className="text-2xl sm:text-4xl font-black text-white">
          Need a 360° Sky or Planet Image First?
        </h2>
        <p className="text-sm sm:text-base text-cyan-100/80 max-w-xl mx-auto">
          Generate an equirectangular environment in the AI Studio, then drop it straight onto this globe — or
          open it in the viewer to look around from the inside.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            onClick={onLaunchStudio}
            className="px-8 py-4 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-400 to-teal-400 text-slate-950 shadow-xl shadow-cyan-400/40 hover:scale-105 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 fill-slate-950" />
            <span>Open AI Panorama Studio</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('viewer', '/360-panorama-viewer/')}
            className="px-6 py-4 rounded-xl font-semibold text-sm bg-cyan-950/60 border border-cyan-500/40 text-cyan-200 hover:text-white hover:bg-cyan-900/60 transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <Globe2 className="w-4 h-4 text-cyan-400" />
            <span>Open the 360° Viewer</span>
          </button>
        </div>
      </section>
    </div>
  );
}
