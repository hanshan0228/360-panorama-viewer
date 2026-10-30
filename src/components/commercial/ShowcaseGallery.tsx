import { useTranslation } from '../../utils/i18n';
import { commerceMessages } from '../../utils/commerceTranslations';
import { useState } from 'react';
import { Eye, Compass, Check, Copy } from 'lucide-react';
import type { StylePresetId } from '../../types/panorama';
import { generateProceduralPanorama } from '../../utils/proceduralPanoramas';

interface ShowcaseItemData {
  id: string;
  title: string;
  category: string;
  prompt: string;
  style: StylePresetId;
  colorGrad: string;
}

const SHOWCASE_ITEMS: ShowcaseItemData[] = [
  {
    id: 'cyber-neo-tokyo',
    title: 'Cyberpunk Neo-Tokyo 2087',
    category: 'Sci-Fi & Urban',
    prompt: 'futuristic cyberpunk city at night, neon holograms, rain reflections, volumetric fog, flying vehicles, 8k equirectangular 360 panorama',
    style: 'cyberpunk',
    colorGrad: 'from-pink-500 via-purple-600 to-cyan-500',
  },
  {
    id: 'alpine-dawn-lake',
    title: 'Alpine Mountain Lake at Sunrise',
    category: 'Nature & Landscape',
    prompt: 'majestic snow-capped alpine mountains at sunrise, crystal clear turquoise lake reflection, morning mist, golden sunbeams, 8k equirectangular 360',
    style: 'nature',
    colorGrad: 'from-amber-400 via-orange-500 to-rose-600',
  },
  {
    id: 'deep-space-nebula',
    title: 'Orbital Nebula & Ringed Exoplanet',
    category: 'Sci-Fi & Space',
    prompt: 'deep space nebula, purple and teal cosmic dust, glowing galaxies, ringed planet, stellar skybox, volumetric stars, 8k 360 equirectangular',
    style: 'space',
    colorGrad: 'from-cyan-400 via-blue-600 to-indigo-900',
  },
  {
    id: 'luxury-glass-penthouse',
    title: 'Manhattan Skyline Luxury Penthouse',
    category: 'Architecture & Interior',
    prompt: 'luxury modern penthouse interior, floor-to-ceiling glass windows, evening city view, warm architectural lighting, oak wood flooring, 8k 360',
    style: 'interior',
    colorGrad: 'from-teal-400 via-emerald-600 to-slate-900',
  },
  {
    id: 'floating-temple-ruins',
    title: 'Ancient Celestial Temple Sanctuary',
    category: 'Fantasy & Magic',
    prompt: 'ancient fantasy temple ruins, floating celestial stones, glowing magical runes, aurora sky, ethereal mist, 8k equirectangular 360 panorama',
    style: 'fantasy',
    colorGrad: 'from-emerald-400 via-teal-500 to-blue-700',
  },
  {
    id: 'anime-coastal-highway',
    title: 'Anime Coastal Summer Breeze',
    category: 'Anime & Stylized',
    prompt: 'Japanese anime hand-drawn watercolor aesthetic, gentle coastal breeze, lush green summer grass, fluffy white clouds, warm natural sunlight, nostalgic peaceful anime scenery',
    style: 'anime',
    colorGrad: 'from-sky-400 via-teal-300 to-indigo-500',
  },
];

interface ShowcaseGalleryProps {
  onSelectPanorama: (url: string, prompt: string, style: StylePresetId) => void;
}

export function ShowcaseGallery({ onSelectPanorama }: ShowcaseGalleryProps) {
  const t = useTranslation(commerceMessages);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const categories = ['All', 'Sci-Fi & Urban', 'Nature & Landscape', 'Architecture & Interior', 'Fantasy & Magic', 'Anime & Stylized'];

  const filteredItems = selectedCategory === 'All'
    ? SHOWCASE_ITEMS
    : SHOWCASE_ITEMS.filter((item) => item.category === selectedCategory);

  const handleCopyPrompt = (id: string, prompt: string) => {
    navigator.clipboard.writeText(prompt);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };


  const handleLoadItem = (item: ShowcaseItemData) => {
    const canvas = generateProceduralPanorama(item.style, item.prompt, 2048, 1024);
    onSelectPanorama(canvas.toDataURL('image/png'), item.prompt, item.style);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section className="py-12 border-t border-cyan-500/15 relative z-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mb-3">
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            <span>{t("The prompt library")}</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {t("A starting point for your next world.")}
          </h2>
          <p className="text-sm text-cyan-200/70 mt-1 max-w-2xl">
            {t("Explore prompt ideas and procedural 360° demos. These are not AI-generated results; copy a prompt to create your own version.")}
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 bg-[#030c1d]/90 p-1.5 rounded-2xl border border-cyan-500/20 backdrop-blur-xl">
          {categories.map((cat) => (
            <button
              key={t(cat)}
              type="button"
              aria-pressed={selectedCategory === cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-md shadow-cyan-500/30'
                  : 'text-cyan-200/70 hover:text-white hover:bg-cyan-500/10'
              }`}
            >
              {t(cat)}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Showcase Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className="glass-card rounded-2xl overflow-hidden border border-cyan-500/25 hover:border-cyan-400/60 transition-all duration-300 group flex flex-col justify-between"
          >
            {/* Visual Header Banner */}
            <div className={`h-36 w-full bg-gradient-to-tr ${item.colorGrad} p-4 relative overflow-hidden flex flex-col justify-between`}>
              <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px] opacity-25" />
              
              <div className="flex items-center justify-between relative z-10">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/50 text-white backdrop-blur-md border border-white/20">
                  {t("Prompt idea")}
                </span>
                <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-black/40 text-cyan-200 backdrop-blur-md">
                  {t("2:1 Equirectangular")}
                </span>
              </div>

              <div className="relative z-10">
                <div className="text-[10px] font-semibold text-white/80 uppercase tracking-wider">{t(item.category)}</div>
                <h3 className="text-base font-bold text-white drop-shadow-md truncate">{t(item.title)}</h3>
              </div>
            </div>

            {/* Content Body */}
            <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
              <div>
                <p className="text-xs text-cyan-100/80 line-clamp-2 leading-relaxed bg-[#020a17]/60 p-2.5 rounded-xl border border-cyan-500/15 font-mono text-[11px]">
                  &ldquo;{item.prompt}&rdquo;
                </p>

              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-cyan-500/15">
                <button
                  type="button"
                  onClick={() => handleLoadItem(item)}
                  className="px-3 py-2 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/25 cursor-pointer transition-transform hover:scale-[1.02]"
                >
                  <Eye className="w-3.5 h-3.5 fill-current" />
                  <span>{t("Open demo")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCopyPrompt(item.id, item.prompt)}
                  className="px-3 py-2 bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/30 text-cyan-200 hover:text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  {copiedId === item.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-300">{t("Copied!")}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-cyan-300" />
                      <span>{t("Copy Prompt")}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
