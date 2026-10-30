import { useLanguage, useTranslation } from '../../utils/i18n';
import { commerceMessages } from '../../utils/commerceTranslations';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Eye,
  Globe2,
  Images,
  Sparkles,
  Upload,
} from 'lucide-react';
import { ShowcaseGallery } from '../commercial/ShowcaseGallery';
import type { StylePresetId } from '../../types/panorama';

interface ShowcasePageProps {
  onOpenInStudio: (url: string, prompt: string, style: StylePresetId) => void;
  onOpenStudio: () => void;
  onOpenViewer: () => void;
}

interface PublicShare {
  id: string;
  title: string;
  width: number;
  height: number;
  createdAt: number;
}

export function ShowcasePage({ onOpenInStudio, onOpenStudio, onOpenViewer }: ShowcasePageProps) {
  const t = useTranslation(commerceMessages);
  const [lang] = useLanguage();
  const localHref = (path: string) => lang === 'en' ? path : `${path}?lang=${lang}`;
  const [shares, setShares] = useState<PublicShare[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/shares?public=1')
      .then(response => (response.ok ? response.json() : Promise.reject(new Error('Showcase unavailable'))))
      .then(data => {
        if (!cancelled) setShares(Array.isArray(data?.shares) ? data.shares : []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  const faqs = [
    {
      q: 'What is a 360 panorama showcase?',
      a: 'A showcase is a public gallery of real equirectangular panoramas. It collects interactive 360° photos, AI-generated VR skyboxes, and HDRI-style environment captures in one place so you can study lighting, framing, and seam quality before creating your own.',
    },
    {
      q: 'How do I publish my panorama to this showcase?',
      a: 'Open the Studio, create or upload a 2:1 equirectangular panorama, click Share panorama, and tick "List publicly in the 360 Panorama Showcase". Sharing stays private and unindexed unless you tick that box, and you can unlist or revoke the link at any time from the same dialog.',
    },
    {
      q: 'Are the panoramas on this page free to view?',
      a: 'Yes. Every listed panorama opens in the free 360° panorama viewer with drag-to-look, touch support, Little Planet projection, and cardboard VR. No account, plugin, or app install is required to view them.',
    },
    {
      q: 'Which format should a panorama use to appear here?',
      a: 'Equirectangular projection at a 2:1 aspect ratio (for example 4096×2048 or 8192×4096) in PNG or JPEG. That is the format every 360° viewer, VR headset, and game engine expects, and it wraps seamlessly at the 0°/360° horizon.',
    },
  ];

  return (
    <div className="space-y-16 pb-16">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs text-cyan-400/70 pt-2">
        <a href={localHref("/")} className="hover:text-cyan-300 transition-colors">{t("Home")}</a>
        <span>/</span>
        <span className="text-white font-medium">{t("360° Panorama Showcase")}</span>
      </nav>

      {/* Hero */}
      <section className="relative rounded-3xl overflow-hidden border border-cyan-500/25 bg-gradient-to-b from-[#061833]/85 via-[#030e20]/90 to-[#020914] p-6 sm:p-12 shadow-[0_0_60px_rgba(0,242,254,0.08)]">
        <div className="max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-400/15 border border-cyan-400/40 text-cyan-300 text-xs font-semibold tracking-wide">
            <Images className="w-3.5 h-3.5 text-teal-300" />
            <span>{t("COMMUNITY 360° PANORAMAS • EXAMPLE GALLERY")}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
            {t("360 Panorama Showcase:")}{' '}
            <span className="bg-gradient-to-r from-teal-300 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
              {t("Real 360° Photos and VR Skies")}
            </span>
          </h1>

          <p className="text-base sm:text-lg text-cyan-100/80 leading-relaxed max-w-3xl">
            {t("Browse equirectangular 360° panoramas shared by photographers, 3D artists, and game developers. Every panorama opens in the free browser viewer — drag to look around, switch to a Little Planet projection, or jump into cardboard VR. No installation is needed to view a shared panorama.")}
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              type="button"
              onClick={onOpenViewer}
              className="px-6 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-teal-400 to-cyan-500 text-slate-950 shadow-lg shadow-teal-400/30 hover:shadow-teal-400/60 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              <span>{t("Open the Free 360° Viewer")}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onOpenStudio}
              className="px-5 py-3.5 rounded-xl font-semibold text-sm bg-cyan-950/60 border border-cyan-500/40 text-cyan-200 hover:text-white hover:bg-cyan-900/60 transition-all cursor-pointer flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>{t("Create a 360 Panorama")}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Community panoramas */}
      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {t("Community panoramas, published by their authors")}
          </h2>
          <p className="text-sm text-cyan-200/70 max-w-3xl">
            {t("These panoramas were shared publicly by their creators. Private shares never appear here — listing is opt-in per link, and owners can unlist a panorama at any time.")}
          </p>
        </div>

        {/* ponytail: full-resolution images share the image-transfer safety limit, so cap the grid and let the browser lazy-load it. Move to a thumbnail endpoint if the showcase grows. */}
        {shares.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {shares.slice(0, 24).map(share => (
              <a
                key={share.id}
                href={localHref(`/s/${share.id}`)}
                className="group rounded-2xl overflow-hidden border border-cyan-500/20 bg-[#030c1d]/80 hover:border-cyan-400/60 transition-colors"
              >
                <div className="aspect-[2/1] overflow-hidden bg-[#020914]">
                  <img
                    src={`/api/shares/${share.id}/image`}
                    alt={t("{title} — 360° equirectangular panorama ({width}×{height})").replace("{title}", () => String(share.title)).replace("{width}", () => String(share.width)).replace("{height}", () => String(share.height))}
                    width={share.width}
                    height={share.height}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="p-4 space-y-1">
                  <h3 className="text-sm font-bold text-white truncate group-hover:text-cyan-300 transition-colors">
                    {share.title}
                  </h3>
                  <p className="text-xs text-cyan-300/60 font-mono">
                    {share.width}×{share.height} {t("• 360° panorama")}
                  </p>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-cyan-500/20 bg-[#030c1d]/70 p-6 text-sm text-cyan-200/70">
            {loaded
              ? t("No public panoramas yet. Open the Studio, share a panorama, and tick \"List publicly in the 360 Panorama Showcase\" to be the first one here.")
              : t("Loading community panoramas…")}
          </div>
        )}
      </section>

      {/* How to get listed */}
      <section className="rounded-3xl border border-cyan-500/20 bg-[#030c1d]/70 p-6 sm:p-10 space-y-6">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          {t("How to publish your own 360° panorama here")}
        </h2>
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <li className="space-y-2">
            <div className="flex items-center gap-2 text-cyan-300 font-bold">
              <Sparkles className="w-4 h-4 text-teal-400" />
              <span>{t("1. Create or upload a 2:1 panorama")}</span>
            </div>
            <p className="text-cyan-100/75">
              {t("Generate an equirectangular scene with AI text prompts, convert a flat photo with")}{' '}
              <a className="text-cyan-300 underline hover:text-cyan-200" href={localHref("/photo-to-360-converter/")}>{t("Photo to 360")}</a>{t(", or drop in an Insta360 / Ricoh Theta export.")}
            </p>
          </li>
          <li className="space-y-2">
            <div className="flex items-center gap-2 text-cyan-300 font-bold">
              <Upload className="w-4 h-4 text-teal-400" />
              <span>{t("2. Share the link")}</span>
            </div>
            <p className="text-cyan-100/75">
              {t("Sign in, open")} <span className="font-mono">{t("Share panorama")}</span>{t(", and pick a title. The link stays private and unindexed unless you opt in below.")}
            </p>
          </li>
          <li className="space-y-2">
            <div className="flex items-center gap-2 text-cyan-300 font-bold">
              <Globe2 className="w-4 h-4 text-teal-400" />
              <span>{t("3. Tick the public listing box")}</span>
            </div>
            <p className="text-cyan-100/75">
              {t("Enable \"List publicly in the 360 Panorama Showcase\" and the panorama appears on this page for anyone to open in the viewer. Turn it off whenever you want it delisted.")}
            </p>
          </li>
        </ol>
        <div className="flex flex-wrap items-center gap-6 pt-4 text-xs text-cyan-300/70 border-t border-cyan-500/15">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
            <span>{t("Private by default")}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
            <span>{t("Revocable at any time")}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
            <span>{t("10 active links per account")}</span>
          </span>
        </div>
      </section>

      {/* Prompt library reuses the studio gallery */}
      <ShowcaseGallery
        onSelectPanorama={(url, prompt, style) => {
          onOpenInStudio(url, prompt, style);
        }}
      />

      {/* SEO copy */}
      <section className="space-y-4 text-sm text-cyan-100/80 leading-relaxed max-w-4xl">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          {t("What to look for in a 360° panorama example")}
        </h2>
        <p>
          {t("Equirectangular panoramas stretch a sphere onto a 2:1 rectangle, so the top and bottom rows smear toward the poles and the left and right edges must join perfectly. When you study an example, check three things: whether the horizon line sits straight across the middle, whether the 0°/360° seam is invisible, and whether the sky and ground stay plausible when you tilt all the way up or down.")}
        </p>
        <p>
          {t("For VR and game production the same files feed a second pipeline. Slice them into six faces with the")}{' '}
          <a className="text-cyan-300 underline hover:text-cyan-200" href={localHref("/cubemap-generator/")}>{t("cubemap generator")}</a>{t(", export environment lighting with an")}{' '}
          <a className="text-cyan-300 underline hover:text-cyan-200" href={localHref("/ai-hdri-generator/")}>{t("AI HDRI generator")}</a>{t(", or turn a still panorama into a looping clip with")}{' '}
          <a className="text-cyan-300 underline hover:text-cyan-200" href={localHref("/360-photo-to-video/")}>{t("360 photo to video")}</a>{t(". Viewing and local conversion run in your browser. AI generation sends references to the service; publishing a share uploads a sharing copy.")}
        </p>
        <p>
          {t("Looking for somewhere to view a panorama you already own? Open it in the")}{' '}
          <a className="text-cyan-300 underline hover:text-cyan-200" href={localHref("/360-panorama-viewer/")}>{t("free 360° panorama viewer")}</a>{' '}
          {t("and paste it straight from your clipboard — no upload, no watermark, no signup.")}
        </p>
      </section>

      {/* FAQ */}
      <section className="space-y-4">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          {t("360° Panorama Showcase — FAQ")}
        </h2>
        <div className="space-y-3">
          {faqs.map((faq, index) => (
            <div key={faq.q} className="rounded-2xl border border-cyan-500/20 bg-[#030c1d]/70 overflow-hidden">
              <button
                type="button"
                onClick={() => setActiveFaq(activeFaq === index ? null : index)}
                aria-expanded={activeFaq === index}
                className="w-full flex items-center justify-between gap-4 p-4 text-left text-sm font-bold text-white cursor-pointer hover:text-cyan-200 transition-colors"
              >
                <span>{t(faq.q)}</span>
                <ChevronDown className={`w-4 h-4 shrink-0 text-cyan-400 transition-transform ${activeFaq === index ? 'rotate-180' : ''}`} />
              </button>
              {activeFaq === index && (
                <p className="px-4 pb-4 text-sm text-cyan-100/75 leading-relaxed">{t(faq.a)}</p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
