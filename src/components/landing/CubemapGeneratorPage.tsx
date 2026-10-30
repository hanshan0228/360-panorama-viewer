import { useLanguage, useTranslation, withLanguageHref } from '../../utils/i18n';
import { toolMessages } from '../../utils/toolTranslations';
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
  const t = useTranslation(toolMessages);
  const [lang] = useLanguage();
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [activePreset, setActivePreset] = useState<string | null>(null);

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
        setActivePreset(null);
        setActivePanoUrl(event.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const faqs = [
    {
      q: 'What does this panorama to cubemap converter export?',
      a: 'It reprojects a full 2:1 equirectangular panorama into six square PNG images, each covering a 90° view. The ZIP contains posx, negx, posy, negy, posz and negz faces. These are display images for a visible skybox, not floating-point HDR lighting maps or a DDS cubemap file.',
    },
    {
      q: 'Are files uploaded to a remote server during cubemap slicing?',
      a: 'No. Cubemap slicing runs locally using HTML5 Canvas. Selecting a local image or a sample does not upload it to a server. AI panorama generation is a separate online feature.',
    },
    {
      q: 'What face resolutions are supported for ZIP download?',
      a: 'You can choose between 256x256, 512x512, or 1024x1024 pixels per cube face. Clicking "Download All (ZIP)" packages all 6 faces into a single compressed archive with the filenames listed in the orientation table below.',
    },
    {
      q: 'How are the cube faces named in the downloaded ZIP?',
      a: 'The archive contains posx.png (Right), negx.png (Left), posy.png (Top / Up), negy.png (Bottom / Down), posz.png (Front), and negz.png (Back). Assign files by axis using the table below, then check orientation in your target engine; filenames alone do not determine face rotation.',
    },
    {
      q: 'Can I convert an HDR or EXR file here?',
      a: 'This slicer opens browser-readable PNG, JPEG and WebP panoramas. For a Radiance .hdr file, use the HDRI viewer linked below; its PNG cube exports are tone-mapped display images. OpenEXR is not supported. Keep your original HDR file for environment lighting.',
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
        <a href={withLanguageHref("/", lang)} className="hover:text-cyan-300 transition-colors">{t("Home")}</a>
        <span>/</span>
        <span className="text-cyan-300">{t("Tools")}</span>
        <span>/</span>
        <span className="text-white font-medium">{t("Cubemap Generator")}</span>
      </nav>

      {/* Hero Section */}
      <section className="relative rounded-3xl overflow-hidden border border-cyan-500/25 bg-gradient-to-b from-[#061833]/85 via-[#030e20]/90 to-[#020914] p-6 sm:p-12 shadow-[0_0_60px_rgba(0,242,254,0.08)]">
        <div className="max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-400/15 border border-cyan-400/40 text-cyan-300 text-xs font-semibold tracking-wide">
            <Box className="w-3.5 h-3.5 text-cyan-400" />
            <span>{t("100% CLIENT-SIDE • PNG CUBE FACES • NO SIGNUP")}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">{t("Cubemap Generator:")}{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-400 bg-clip-text text-transparent">{t("Slice 360° Panoramas to 6 Cube Faces")}</span>
          </h1>

          <p className="text-base sm:text-lg text-cyan-100/80 leading-relaxed max-w-3xl">{t("Convert a full 2:1 equirectangular panorama to cubemap faces in your browser. Open a PNG, JPEG or WebP image, or try a free sample, then download six square PNG faces in a ZIP. No upload or signup required.")}</p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <label className="px-6 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 shadow-lg shadow-cyan-400/30 hover:shadow-cyan-400/60 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-2 focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-cyan-300">
              <Upload className="w-4 h-4 text-slate-950" />
              <span>{t("Upload Custom 360 Photo")}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleCustomUpload}
                className="sr-only"
              />
            </label>

            <button
              type="button"
              onClick={onLaunchStudio}
              className="px-5 py-3.5 rounded-xl font-semibold text-sm bg-cyan-950/60 border border-cyan-500/40 text-cyan-200 hover:text-white hover:bg-cyan-900/60 transition-all cursor-pointer flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>{t("Generate New AI 360 in Studio")}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-4 text-xs text-cyan-300/70 border-t border-cyan-500/15">
            <span className="flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-teal-400" />
              <span>{t("100% Private Client-Side Processing")}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Archive className="w-4 h-4 text-teal-400" />
              <span>{t("Instant 6-Face ZIP Archive Download")}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              <span>{t("256, 512 or 1024 px per Face")}</span>
            </span>
          </div>
        </div>
      </section>

      {/* Embedded Live Tool Section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">{t("Live Slicer Engine")}</div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">{t("Instant 6-Face Cubemap Preview & Export")}</h2>
          </div>
          <div className="text-xs text-cyan-300/80">{t("Local Canvas Processing")}</div>
        </div>

        {/* Free Sample Cubemaps & Skybox Packs Selector */}
        <div className="p-4 rounded-2xl bg-[#03132b]/80 border border-cyan-500/30 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-cyan-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>{t("Free Sample Cubemaps & Skyboxes (Click to Slice & Download Free ZIP)")}</span>
            </span>
            <span className="text-cyan-400/60 font-mono text-[11px]">{t("Instant 6-Face Preview")}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
            {samplePresets.map((preset) => {
              const isSelected = activePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => handleSelectSample(preset)}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                    isSelected
                      ? 'border-cyan-400 bg-cyan-500/25 shadow-md shadow-cyan-500/30 text-white'
                      : 'border-cyan-500/20 bg-[#020b18] text-cyan-200/80 hover:bg-cyan-500/10 hover:border-cyan-400/50'
                  }`}
                >
                  <div className="font-semibold text-xs flex items-center justify-between">
                    <span>{t(preset.label)}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />}
                  </div>
                  <div className="text-[10px] text-cyan-300/60 leading-tight">{t(preset.desc)}</div>
                </button>
              );
            })}
          </div>
        </div>

        <figure className="space-y-2 rounded-2xl border border-cyan-500/25 bg-[#030e20] p-4">
          <img
            src={activePanoUrl}
            alt={t("Source equirectangular panorama used for the six cube faces below")}
            className="w-full aspect-[2/1] object-contain rounded-lg bg-slate-950"
            width={2048}
            height={1024}
          />
          <figcaption className="text-sm text-cyan-100/80">{t("Before: the source panorama. After: the same image reprojected into the six labeled faces below. Choose a sample above to compare its horizon, poles and wraparound seam.")}</figcaption>
        </figure>

        <div className="rounded-2xl border border-cyan-500/30 bg-[#020b18] p-4 sm:p-6 shadow-2xl">
          <CubemapTab currentPanoramaUrl={activePanoUrl} headingLevel={2} />
        </div>
      </section>

      <section aria-labelledby="conversion-steps" className="space-y-4 text-sm text-cyan-100/80">
        <h2 id="conversion-steps" className="text-2xl font-bold text-white">{t("How to convert an equirectangular panorama to a cubemap")}</h2>
        <ol className="list-decimal pl-6 space-y-3">
          <li><strong>{t("Choose a complete sphere.")}</strong>{' '}{t("Use a 2:1 PNG, JPEG or WebP panorama, such as 2048 × 1024 or 4096 × 2048. A cropped photograph or a stretched flat image will not become a full 360° scene.")}</li>
          <li><strong>{t("Try a sample or open your image.")}</strong>{' '}{t("Compare the source above with the six-face preview. The front view comes from the center of the source panorama; the back view crosses its left/right seam.")}</li>
          <li><strong>{t("Select 256, 512 or 1024 px per face.")}</strong>{' '}{t("Start at 512 for a quick check. Larger output cannot recover detail missing from the original.")}</li>
          <li><strong>{t("Download all six faces as a ZIP.")}</strong>{' '}{t("Extract the archive before assigning the PNGs to skybox slots. Individual face downloads use a cubemap- filename prefix; ZIP entries use the names in the table below.")}</li>
        </ol>
        <p>{t("Need help checking your source? Read the")}{' '}<a className="text-cyan-300 underline" href={withLanguageHref("/blog/equirectangular-projection-explained/", lang)}>{t("equirectangular projection guide")}</a>{' '}{t(". For a Radiance .hdr source, use the")}{' '}<a className="text-cyan-300 underline" href={withLanguageHref("/hdri-to-cubemap/", lang)}>{t("HDRI to cubemap converter")}</a>.</p>
      </section>

      {/* Technical Highlights Grid */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">{t("Panorama to Cubemap")}</div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">{t("Why Use Our Free Cubemap Slicer")}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-3 hover:border-cyan-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400 w-fit">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">{t("90° Face Projection")}</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">{t("Each square face covers a 90° view. Perspective stretching near its edges is expected; the six faces reconstruct the surrounding sphere.")}</p>
          </div>

          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-3 hover:border-cyan-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-teal-500/15 text-teal-400 w-fit">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">{t("Complete Privacy")}</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">{t("Slicing your image runs locally in browser memory using HTML5 Canvas. Conversion needs no account or AI credits.")}</p>
          </div>

          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-3 hover:border-cyan-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-400 w-fit">
              <Archive className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">{t("Batch ZIP Packaging")}</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">{t("Download all 6 faces bundled in a single ZIP file with standardized engine filenames (+X, -X, +Y, -Y, +Z, -Z).")}</p>
          </div>

          <div className="bg-[#05142b]/70 border border-cyan-500/20 rounded-2xl p-5 space-y-3 hover:border-cyan-400/40 transition-colors">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 w-fit">
              <Code2 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">{t("Explicit Face Mapping")}</h3>
            <p className="text-xs text-cyan-200/70 leading-relaxed">{t("Use the axis table for Unity 6 Sided skyboxes or a cube-texture loader. Other engines may need a different layout or the original panorama.")}</p>
          </div>
        </div>
      </section>

      {/* Engine Compatibility Matrix */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">{t("Engine Mapping")}</div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">{t("Cubemap Face Orientation Reference")}</h2>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-cyan-500/25 bg-[#030e20]">
          <table className="w-full text-left text-xs">
            <caption className="text-left px-5 py-3 text-cyan-100/80">{t("ZIP filenames and axis assignments. Verify face rotation in your destination engine.")}</caption>
            <thead className="bg-[#051733] text-cyan-200 border-b border-cyan-500/30 font-semibold uppercase tracking-wider">
              <tr>
                <th scope="col" className="py-4 px-5">{t("Face Label")}</th>
                <th scope="col" className="py-4 px-5 text-cyan-400">{t("Output Filename")}</th>
                <th scope="col" className="py-4 px-5 text-slate-300">{t("Unity Skybox Slot")}</th>
                <th scope="col" className="py-4 px-5 text-slate-300">{t("Three.js Order")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/15 text-cyan-100/90">
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">{t("Right Face")}</td>
                <td className="py-3.5 px-5 text-teal-400 font-mono font-bold">posx.png</td>
                <td className="py-3.5 px-5">{t("Right (+X)")}</td>
                <td className="py-3.5 px-5">{t("Index 0 (px)")}</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">{t("Left Face")}</td>
                <td className="py-3.5 px-5 text-teal-400 font-mono font-bold">negx.png</td>
                <td className="py-3.5 px-5">{t("Left (-X)")}</td>
                <td className="py-3.5 px-5">{t("Index 1 (nx)")}</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">{t("Top / Up Face")}</td>
                <td className="py-3.5 px-5 text-teal-400 font-mono font-bold">posy.png</td>
                <td className="py-3.5 px-5">{t("Up (+Y)")}</td>
                <td className="py-3.5 px-5">{t("Index 2 (py)")}</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">{t("Bottom / Down Face")}</td>
                <td className="py-3.5 px-5 text-teal-400 font-mono font-bold">negy.png</td>
                <td className="py-3.5 px-5">{t("Down (-Y)")}</td>
                <td className="py-3.5 px-5">{t("Index 3 (ny)")}</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">{t("Front Face")}</td>
                <td className="py-3.5 px-5 text-teal-400 font-mono font-bold">posz.png</td>
                <td className="py-3.5 px-5">{t("Front (+Z)")}</td>
                <td className="py-3.5 px-5">{t("Index 4 (pz)")}</td>
              </tr>
              <tr>
                <td className="py-3.5 px-5 font-semibold text-white">{t("Back Face")}</td>
                <td className="py-3.5 px-5 text-teal-400 font-mono font-bold">negz.png</td>
                <td className="py-3.5 px-5">{t("Back (-Z)")}</td>
                <td className="py-3.5 px-5">{t("Index 5 (nz)")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="engine-setup" aria-labelledby="engine-heading" className="space-y-5 text-sm text-cyan-100/80 scroll-mt-24">
        <h2 id="engine-heading" className="text-2xl font-bold text-white">{t("Use your cubemap in Unity, Three.js or Unreal Engine")}</h2>
        <h3 className="text-lg font-semibold text-white">{t("Unity: six PNG faces with Skybox / 6 Sided")}</h3>
        <ol className="list-decimal pl-6 space-y-2">
          <li>{t("Extract the ZIP into your Assets folder. Select the six textures and set Wrap Mode to Clamp to avoid repeating the opposite edge.")}</li>
          <li>{t("Create a Material with the Skybox / 6 Sided shader. Assign each PNG using the axis table above.")}</li>
          <li>{t("Assign that material as the scene Skybox Material in the Lighting environment settings. Check the horizon and top/bottom faces in the scene.")}</li>
        </ol>
        <p>{t("This shader works with Built-in and URP, not HDRP. See")}{' '}<a className="text-cyan-300 underline" href="https://docs.unity3d.com/Manual/shader-skybox-6sided.html">{t("Unity’s 6 Sided skybox reference")}</a>{' '}{t("for pipeline compatibility.")}</p>
        <h3 className="text-lg font-semibold text-white">{t("Three.js: load faces in axis order")}</h3>
        <p>{t("Place the extracted PNGs in one public folder and pass URLs in +X, −X, +Y, −Y, +Z, −Z order to CubeTextureLoader. Three.js uses a different handedness convention for cube backgrounds, so check left/right landmarks against the source panorama. See the")}{' '}<a className="text-cyan-300 underline" href="https://threejs.org/docs/pages/CubeTextureLoader.html">{t("CubeTextureLoader reference")}</a>{' '}{t("before adjusting orientation.")}</p>
        <h3 className="text-lg font-semibold text-white">{t("Unreal Engine: retain the original HDR environment")}</h3>
        <p>{t("The ZIP contains six ordinary PNG textures, not an Unreal TextureCube asset. For an HDRI Backdrop, enable the HDRI Backdrop plugin, import a supported .hdr environment, add an HDRI Backdrop actor, and select the imported cubemap in its Cubemap property. The PNG ZIP is not a direct substitute.")}</p>
        <p>{t("Follow")}{' '}<a className="text-cyan-300 underline" href="https://dev.epicgames.com/documentation/en-us/unreal-engine/hdri-backdrop-visualization-tool-in-unreal-engine">{t("Epic’s HDRI Backdrop setup")}</a>{' '}{t(". Exported PNGs do not preserve HDR radiance for lighting.")}</p>
      </section>

      <section aria-labelledby="troubleshooting-heading" className="space-y-4 text-sm text-cyan-100/80">
        <h2 id="troubleshooting-heading" className="text-2xl font-bold text-white">{t("Fix seams, rotated faces and blurry cubemaps")}</h2>
        <dl className="space-y-4">
          <div><dt className="font-semibold text-white">{t("A seam appears behind the camera")}</dt><dd>{t("Inspect the source’s left and right edges in the")}{' '}<a className="text-cyan-300 underline" href={withLanguageHref("/360-panorama-viewer/", lang)}>{t("360 panorama viewer")}</a>{' '}{t(". Slicing cannot repair a mismatched source seam. If only the engine shows an edge line, check Clamp wrapping, filtering and mipmaps.")}</dd></div>
          <div><dt className="font-semibold text-white">{t("The sky is upside down or faces are swapped")}</dt><dd>{t("Use the filename-to-axis table rather than alphabetical file order. Compare a recognizable landmark and the horizon; engine conventions can differ in handedness and face rotation.")}</dd></div>
          <div><dt className="font-semibold text-white">{t("The output looks blurry or stretched")}</dt><dd>{t("Start with a complete, sharp 2:1 panorama. Increasing face resolution cannot restore missing detail. A normal flat photo or a cropped panorama is not a complete sphere, even if resized to 2:1.")}</dd></div>
          <div><dt className="font-semibold text-white">{t("PNG faces do not light the scene like the HDR original")}</dt><dd>{t("These are display images. Use the original scene-linear HDR file for lighting; see")}{' '}<a className="text-cyan-300 underline" href={withLanguageHref("/blog/hdri-vs-ldr-environment-lighting/", lang)}>{t("HDRI versus LDR environment lighting")}</a>{' '}{t(". To rebuild a 2:1 display panorama from faces, use the")}{' '}<a className="text-cyan-300 underline" href={withLanguageHref("/cubemap-to-equirectangular/", lang)}>{t("cubemap to equirectangular converter")}</a>.</dd></div>
        </dl>
      </section>

      <p className="text-sm text-cyan-100/80">
        <a href="/blog/panorama-to-skybox-threejs-unity/" hrefLang="en" className="text-cyan-300 underline">{t("Skybox tutorial: sample files, Three.js and Unity (English)")}</a>
      </p>

      {/* FAQ Accordion Section */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">{t("Frequently Asked Questions")}</div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">{t("Cubemap Slicer Questions & Answers")}</h2>
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
                  aria-expanded={isOpen}
                  aria-controls={`cubemap-faq-${idx}`}
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
                <div id={`cubemap-faq-${idx}`} hidden={!isOpen} className="px-5 pb-4 text-xs text-cyan-100/80 leading-relaxed border-t border-cyan-500/15 pt-3">
                  {t(faq.a)}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Final Action Callout */}
      <section className="rounded-3xl border border-cyan-400/40 bg-gradient-to-r from-[#031d42] via-[#042858] to-[#011430] p-8 sm:p-12 text-center space-y-6 shadow-2xl">
        <h2 className="text-2xl sm:text-4xl font-black text-white">{t("Need to Generate a New 360 Panorama First?")}</h2>
        <p className="text-sm sm:text-base text-cyan-100/80 max-w-xl mx-auto">{t("Create photorealistic or stylized 360 equirectangular panoramas in our AI Studio, then slice into cubemaps with one click.")}</p>
        <div>
          <button
            type="button"
            onClick={onLaunchStudio}
            className="px-8 py-4 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-400 to-teal-400 text-slate-950 shadow-xl shadow-cyan-400/40 hover:scale-105 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 fill-slate-950" />
            <span>{t("Open AI Panorama Studio")}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
