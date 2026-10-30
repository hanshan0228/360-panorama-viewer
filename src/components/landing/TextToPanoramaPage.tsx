import { useLanguage, useTranslation, withLanguageHref } from '../../utils/i18n';
import { advancedTranslations } from '../../utils/advancedTranslations';
import { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Lightbulb,
  Lock,
  Sparkles,
  Type,
  Wand2,
} from 'lucide-react';
import type { ActiveTab, StylePresetId } from '../../types/panorama';

interface TextToPanoramaPageProps {
  onUsePrompt: (prompt: string, style: StylePresetId) => void;
  onNavigateTab: (tab: ActiveTab, pushPath?: string) => void;
  onLaunchStudio: () => void;
}

const STYLE_CHIPS: Array<{ id: StylePresetId; label: string }> = [
  { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'nature', label: 'Nature' },
  { id: 'interior', label: 'Interior' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'space', label: 'Space' },
  { id: 'anime', label: 'Anime' },
];

const PROMPTS: Array<{ style: StylePresetId; styleLabel: string; prompt: string; why: string }> = [
  {
    style: 'cyberpunk',
    styleLabel: 'Cyberpunk',
    prompt: 'Rain-soaked cyberpunk alley at night, neon kanji signs in pink and cyan, wet asphalt reflections, steam vents, distant holograms, 8K equirectangular 360 panorama, seamless left-right wrap',
    why: 'Neon signs on both sides of the horizon keep the seam invisible and give the viewer a reason to turn all the way around.',
  },
  {
    style: 'nature',
    styleLabel: 'Nature',
    prompt: 'Alpine meadow at golden hour, snow-capped peaks on the horizon, wildflowers in the foreground, soft sun flare on the left, birds in the sky, 360 equirectangular panorama, natural HDR lighting',
    why: 'Naming a light direction ("sun flare on the left") gives the AI somewhere to place the brightest area of the sphere.',
  },
  {
    style: 'interior',
    styleLabel: 'Interior',
    prompt: 'Minimalist Nordic living room, floor-to-ceiling windows with ocean view, oak floor, linen sofa, morning light, plants, 360 degree panorama interior view, 2:1 equirectangular',
    why: 'Interiors sell real-estate and interior-design work, and a stated window wall anchors the horizon line accurately.',
  },
  {
    style: 'fantasy',
    styleLabel: 'Fantasy',
    prompt: 'Ancient elven forest temple at twilight, glowing runes carved into stone pillars, fireflies, mist drifting between roots, purple and teal ambient light, 360 equirectangular panorama',
    why: 'Fantasy environments are the most requested skybox category for game jams and worldbuilding projects.',
  },
  {
    style: 'space',
    styleLabel: 'Space',
    prompt: 'Deep space nebula in magenta and deep blue, dense star field, distant ringed gas giant low on the horizon, subtle cosmic dust, seamless 360 equirectangular star map',
    why: 'A star field has no ground line and can simplify composition, but repeating stars and wrap seams still need inspection.',
  },
  {
    style: 'anime',
    styleLabel: 'Anime',
    prompt: 'Anime style rooftop at sunset, dramatic cumulus clouds, city skyline below, cherry blossom petals in the air, cel-shaded lighting, 360 equirectangular panorama background',
    why: 'Cel-shaded backgrounds are used as VRM and VTuber rooms, and they reuse the same wrap-friendly composition as nature shots.',
  },
  {
    style: 'interior',
    styleLabel: 'Studio',
    prompt: 'Neutral grey photo studio cyclorama, even softbox lighting from three directions, subtle floor gradient, product photography environment, seamless 360 panorama',
    why: 'A neutral studio HDRI is the most reused lighting map for product renders and 3D lookdev.',
  },
  {
    style: 'nature',
    styleLabel: 'Weather',
    prompt: 'Dramatic thunderstorm over an open plain, towering cumulonimbus, lightning flash on the right, rain curtain in the distance, moody grey-green light, 360 equirectangular panorama',
    why: 'Weather skins are a fast way to reuse one environment mesh with four different moods.',
  },
];

const RECIPE = [
  { part: 'Subject & setting', example: '"rain-soaked cyberpunk alley", "alpine meadow", "Nordic living room"' },
  { part: 'Lighting & time of day', example: '"golden hour", "neon at night", "even softbox lighting"' },
  { part: 'Materials & detail', example: '"wet asphalt reflections", "oak floor", "carved stone"' },
  { part: 'Projection keywords', example: '"equirectangular", "360 panorama", "seamless left-right wrap"' },
];

export function TextToPanoramaPage({ onUsePrompt, onNavigateTab, onLaunchStudio }: TextToPanoramaPageProps) {
  const t = useTranslation(advancedTranslations);
  const [lang] = useLanguage();
  const [prompt, setPrompt] = useState('Sunrise over a misty mountain lake, pine forest on the shoreline, warm rim light on the peaks, 360 equirectangular panorama, seamless wrap');
  const [style, setStyle] = useState<StylePresetId>('nature');
  const [activeFaq, setActiveFaq] = useState<number | null>(0);

  const steps = [
    { title: 'Describe the place', text: 'Write one or two sentences: subject, time of day, lighting, materials. Naming a light direction and a horizon feature helps the model place the brightest area of the sphere.' },
    { title: 'Say it is a panorama', text: 'Include "360 equirectangular panorama" or "seamless left-right wrap". That phrasing is what pushes the model towards a 2:1 projection instead of a flat photo.' },
    { title: 'Render in the Studio', text: 'The generator returns a 2:1 image, repairs the 0°/360° seam with harmonic blending, and shows it in the WebGL viewer so you can check the poles and horizon.' },
    { title: 'Refine and export', text: 'Adjust the prompt, slice the result into cubemap faces, export a Radiance .HDR environment, or turn it into a rotating video clip.' },
  ];

  const comparison = [
    { feature: 'Time to a finished 360° image', us: 'Seconds', a: '1–3 hours on location', b: '20–60 minutes of stitching', c: 'Days of 3D work' },
    { feature: 'Equipment needed', us: 'A browser', a: '360 camera + tripod', b: 'DSLR + pano head + stitching app', c: 'Modeling software + render farm' },
    { feature: 'Impossible or impractical scenes', us: 'Fantasy, sci-fi, deep space', a: 'Cannot be captured', b: 'Cannot be captured', c: 'Possible but slow' },
    { feature: 'Photographic realism', us: 'High — prompt dependent', a: 'Highest (real light)', b: 'High', c: 'Synthetic but controllable' },
    { feature: 'Cost', us: 'Free credits, no install', a: 'Camera purchase', b: 'Software licences', c: 'Workstation + licences' },
  ];

  const faqs = [
    {
      q: 'What is a text to panorama AI generator?',
      a: 'It turns a written description into a 2:1 equirectangular image — the projection a 360° viewer needs. Instead of photographing a location with a 360 camera, you describe it, the model paints every direction around the viewpoint, and the result can be opened in a WebGL viewer, used as a game skybox, or exported as environment lighting.',
    },
    {
      q: 'Why do the keywords "equirectangular" and "360" matter in a prompt?',
      a: 'Without them, most image models return a normal framed photo, and a flat photo cannot wrap onto a sphere without a visible distortion ring. Asking for a "360 equirectangular panorama" is the cheapest way to bias the model towards the correct projection.',
    },
    {
      q: 'Can I use generated text-to-panorama images commercially?',
      a: 'Paid plans include commercial usage rights for the panoramas you generate. The free tier is meant for evaluation and personal projects, so check the pricing page before shipping a generated environment in a commercial title or client deliverable.',
    },
    {
      q: 'How do I fix a visible seam where the left and right edges meet?',
      a: 'Compose the shot so both edges contain similar content: a wall of buildings, a ring of mountains, a continuous star field. If a seam still shows, the studio applies harmonic Poisson boundary healing at the 0°/360° junction, and you can regenerate with the same prompt for a different roll of the dice.',
    },
    {
      q: 'Should I write a short or long prompt?',
      a: 'Aim for one or two sentences covering subject, lighting, and projection. Longer prompts start fighting each other: the model drops details, and you lose the lighting cues that make the environment look lit rather than painted.',
    },
    {
      q: 'Can the result be used as an HDRI for Blender, Unreal or Unity?',
      a: 'The studio can export Radiance .HDR for environment workflows. Converting an ordinary image does not recover the original scene dynamic range; check the result in your target engine.',
    },
    {
      q: 'Is a generated panorama good enough for a game skybox?',
      a: 'For skyboxes and VR backdrops, yes — that is exactly what an equirectangular map is. For hero geometry, keep the generated panorama as the environment and expect to model anything the player can walk up to.',
    },
    {
      q: 'Does generating a panorama upload my photos or prompt text?',
      a: 'Prompts are sent to the image model so it can render the scene, which is what any hosted generator does. When you supply a reference photo, it is used for that request only; previews, slicing, metadata injection, and HDR export all happen locally in your browser.',
    },
  ];

  const related = [
    { label: '360° Panorama Viewer', note: 'Check the render from every angle', href: '/360-panorama-viewer/', tab: 'viewer' as ActiveTab },
    { label: 'AI Skybox Generator', note: 'Game-ready 6-sided skyboxes', href: '/skybox-generator/', tab: 'landing-skybox' as ActiveTab },
    { label: 'AI HDRI Generator', note: '32-bit environment lighting maps', href: '/ai-hdri-generator/', tab: 'landing-hdri' as ActiveTab },
    { label: 'Photo to 360° Converter', note: 'Turn an existing photo into 360°', href: '/photo-to-360-converter/', tab: 'landing-photo360' as ActiveTab },
    { label: 'Cubemap Generator', note: 'Slice into 6 engine faces', href: '/cubemap-generator/', tab: 'landing-cubemap' as ActiveTab },
    { label: '360° Photo to Video', note: 'Export rotating social clips', href: '/360-photo-to-video/', tab: 'landing-video' as ActiveTab },
  ];

  return (
    <div className="space-y-16 pb-16">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs text-cyan-400/70 pt-2">
        <a href={withLanguageHref("/", lang)} className="hover:text-cyan-300 transition-colors">{t("Home")}</a>
        <span>/</span>
        <span className="text-cyan-300">{t("Tools")}</span>
        <span>/</span>
        <span className="text-white font-medium">{t("Text to Panorama AI")}</span>
      </nav>

      {/* Hero + prompt box */}
      <section className="relative rounded-3xl overflow-hidden border border-cyan-500/25 bg-gradient-to-b from-[#061833]/85 via-[#030e20]/90 to-[#020914] p-6 sm:p-12 shadow-[0_0_60px_rgba(0,242,254,0.08)]">
        <div className="max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-400/15 border border-cyan-400/40 text-cyan-300 text-xs font-semibold tracking-wide">
            <Type className="w-3.5 h-3.5 text-cyan-400" />
            <span>{t("TEXT → 360° EQUIRECTANGULAR • SEAM HEALING • NO INSTALL")}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
            {t("Text to Panorama AI:")}{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-400 bg-clip-text text-transparent">
              {t("Write a Prompt, Get a 360° Scene")}
            </span>
          </h1>

          <p className="text-base sm:text-lg text-cyan-100/80 leading-relaxed max-w-3xl">
            {t("Describe a place to generate a 2:1 panorama. Inspect the result in the browser and export images or cube faces for your 3D workflow. No camera or stitching software is required.")}
          </p>

          <div className="rounded-2xl border border-cyan-500/25 bg-[#030e20]/80 p-4 space-y-3">
            <label htmlFor="t2p-prompt" className="text-xs font-bold text-cyan-200/90 flex items-center gap-2">
              <Wand2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t("Describe your 360° scene")}</span>
            </label>
            <textarea
              id="t2p-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="w-full rounded-xl bg-[#02070f] border border-cyan-500/25 focus:border-cyan-400/60 outline-none p-3 text-sm text-white placeholder:text-cyan-500/40 resize-y"
              placeholder="A lantern-lit Kyoto street after rain, cherry blossoms, warm shop glow, 360 equirectangular panorama"
            />
            <div className="flex flex-wrap items-center gap-2">
              {STYLE_CHIPS.map(chip => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setStyle(chip.id)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                    style === chip.id
                      ? 'bg-cyan-400/20 border-cyan-400/60 text-white'
                      : 'bg-cyan-950/40 border-cyan-500/25 text-cyan-200/80 hover:text-white'
                  }`}
                >
                  {t(chip.label)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => onUsePrompt(prompt.trim(), style)}
                className="px-6 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 shadow-lg shadow-cyan-400/30 hover:shadow-cyan-400/60 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4 fill-slate-950" />
                <span>{t("Generate 360° Panorama")}</span>
              </button>
              <button
                type="button"
                onClick={onLaunchStudio}
                className="px-5 py-3.5 rounded-xl font-semibold text-sm bg-cyan-950/60 border border-cyan-500/40 text-cyan-200 hover:text-white hover:bg-cyan-900/60 transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <ArrowRight className="w-4 h-4 text-cyan-400" />
                <span>{t("Open the full Studio")}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-4 text-xs text-cyan-300/70 border-t border-cyan-500/15">
            <span className="flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-teal-400" />
              <span>{t("2:1 equirectangular output at up to 4K")}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-teal-400" />
              <span>{t("Previews and exports stay in your browser")}</span>
            </span>
          </div>
        </div>
      </section>

      {/* Prompt library */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            {t("Copy-Ready Prompt Library")}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {t("8 Prompt Blueprints That Produce Real 360° Images")}
          </h2>
          <p className="text-xs text-cyan-200/70">
            {t("Each prompt already contains the projection keywords and a light direction. Click one to load it into the studio, then edit the subject to your own scene.")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PROMPTS.map(item => (
            <div key={item.prompt} className="rounded-2xl border border-cyan-500/25 bg-[#05142b]/70 p-5 space-y-3 flex flex-col">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-400/15 border border-cyan-400/30 text-cyan-300">
                  {t(item.styleLabel)}
                </span>
              </div>
              <p className="text-xs text-cyan-100/85 leading-relaxed font-mono">{item.prompt}</p>
              <p className="text-[11px] text-cyan-300/70 leading-relaxed">
                <strong className="text-cyan-200">{t("Why it works:")} </strong>{t(item.why)}
              </p>
              <button
                type="button"
                onClick={() => onUsePrompt(item.prompt, item.style)}
                className="mt-auto self-start px-4 py-2 rounded-lg text-[11px] font-bold bg-cyan-400/15 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-400/25 hover:text-white transition-colors cursor-pointer inline-flex items-center gap-2"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t("Use this prompt")}</span>
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Prompt recipe */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            {t("Prompt Formula")}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {t("How to Write a 360° Panorama Prompt")}
          </h2>
        </div>

        <div className="max-w-4xl mx-auto space-y-3">
          {RECIPE.map((row, idx) => (
            <div key={t(row.part)} className="flex flex-col sm:flex-row gap-2 sm:gap-6 rounded-xl border border-cyan-500/20 bg-[#030e20] p-4">
              <div className="sm:w-56 shrink-0 flex items-center gap-2 text-sm font-bold text-white">
                <span className="w-6 h-6 shrink-0 rounded-full bg-cyan-400/15 border border-cyan-400/40 text-cyan-300 text-[11px] font-black flex items-center justify-center">
                  {idx + 1}
                </span>
                <span>{t(row.part)}</span>
              </div>
              <p className="text-xs text-cyan-100/80 leading-relaxed font-mono">{row.example}</p>
            </div>
          ))}
        </div>

        <div className="max-w-4xl mx-auto rounded-2xl border border-teal-500/25 bg-teal-500/5 p-5 flex flex-col sm:flex-row items-start gap-4">
          <Lightbulb className="w-6 h-6 text-teal-400 shrink-0" />
          <p className="text-xs text-teal-100/90 leading-relaxed">
            <strong className="text-white">{t("Avoid framing words.")}</strong> {t("\"Close-up\", \"portrait\", and \"wide shot from the side\" pull the model towards a flat photograph. Describe what surrounds the viewer instead: \"mountains on all sides\", \"city skyline in every direction\", \"fireflies around the clearing\".")}
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            {t("Step by Step")}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {t("From Sentence to Seamless Sphere")}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
          {steps.map((step, idx) => (
            <div key={t(step.title)} className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-2">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 shrink-0 rounded-full bg-cyan-400/15 border border-cyan-400/40 text-cyan-300 text-xs font-black flex items-center justify-center">
                  {idx + 1}
                </span>
                <h3 className="font-bold text-white text-sm">{t(step.title)}</h3>
              </div>
              <p className="text-xs text-cyan-200/70 leading-relaxed">{t(step.text)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section className="space-y-6">
        <div className="text-center max-w-3xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            {t("Honest Comparison")}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {t("AI Text to Panorama vs 360 Camera vs Photo Stitching")}
          </h2>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-cyan-500/25 bg-[#030e20]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#051733] text-cyan-200 border-b border-cyan-500/30 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-4 px-5">{t("Capability")}</th>
                <th className="py-4 px-5 text-teal-300">{t("Text to Panorama AI")}</th>
                <th className="py-4 px-5 text-slate-300">{t("360° Camera")}</th>
                <th className="py-4 px-5 text-slate-300">{t("DSLR Photo Stitching")}</th>
                <th className="py-4 px-5 text-slate-300">{t("Full 3D Render")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 text-cyan-100/90">
              {comparison.map(row => (
                <tr key={t(row.feature)}>
                  <td className="py-3.5 px-5 font-semibold text-white">{t(row.feature)}</td>
                  <td className="py-3.5 px-5 text-teal-300 font-semibold">{t(row.us)}</td>
                  <td className="py-3.5 px-5">{t(row.a)}</td>
                  <td className="py-3.5 px-5">{t(row.b)}</td>
                  <td className="py-3.5 px-5">{t(row.c)}</td>
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
            {t("Frequently Asked Questions")}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {t("Text to 360° Panorama Questions & Answers")}
          </h2>
        </div>

        <div className="max-w-3xl mx-auto space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = activeFaq === idx;
            return (
              <div key={t(faq.q)} className="rounded-xl border border-cyan-500/25 bg-[#030e20] overflow-hidden transition-colors">
                <button
                  type="button"
                  onClick={() => setActiveFaq(isOpen ? null : idx)}
                  className="w-full py-4 px-5 text-left flex items-center justify-between gap-4 font-semibold text-sm text-white hover:text-cyan-300 cursor-pointer transition-colors"
                >
                  <span>{t(faq.q)}</span>
                  <ChevronDown className={`w-4 h-4 text-cyan-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
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

      {/* Related tools */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
            {t("Pair It With")}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            {t("More Free 360° Tools to Use with Your Prompt")}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {related.map(tool => (
            <a
              key={tool.href}
              href={withLanguageHref(tool.href, lang)}
              onClick={(e) => { e.preventDefault(); onNavigateTab(tool.tab, tool.href); }}
              className="group rounded-2xl border border-cyan-500/25 bg-[#05142b]/70 p-5 hover:border-cyan-400/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
                <CheckCircle2 className="w-4 h-4 text-teal-400" />
                <span>{t(tool.label)}</span>
              </div>
              <p className="text-xs text-cyan-200/70 pt-1.5">{t(tool.note)}</p>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
