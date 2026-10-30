import { useTranslation } from '../../utils/i18n';
import { sharedMessages } from '../../utils/sharedTranslations';
import { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface FaqItem {
  question: string;
  answer: string;
}

export function CommercialFaq() {
  const t = useTranslation(sharedMessages);
  const FAQS: FaqItem[] = [
    {
      question: t("How do I generate a 360° panorama?"),
      answer:
        t("Describe your scene (or attach up to 3 reference photos), choose a style and resolution tier, and click Generate. Inspect the result in the 360° viewer, including the horizon, poles, and wrap-around seam. Seam blending automatically treats detected hard boundaries; it can introduce ghosting and cannot reconstruct inconsistent geometry."),
    },
    {
      question: t("How long does each panorama take to generate?"),
      answer:
        t("Generation time depends on the model, requested resolution, service load, and network. Follow the progress shown in the studio; completion time is not guaranteed."),
    },
    {
      question: t("What format is the output file?"),
      answer:
        t("Download a 2:1 PNG and inspect the actual returned dimensions. You can also export a Radiance .hdr container or a ZIP of six PNG cube faces. Converting an ordinary image to .hdr does not recover captured lighting range."),
    },
    {
      question: t("Does the 360° viewer work on mobile devices and VR headsets?"),
      answer:
        t("The WebGL viewer supports touch panning and Cardboard split-screen. Availability depends on your browser and device; native headset WebXR sessions are not provided."),
    },
    {
      question: t("Can I use the generated panoramas for commercial projects?"),
      answer:
        t("Paid plans include commercial usage according to the site terms and connected model provider’s terms. Check rights for your reference images and intended use; starter credits are for evaluation."),
    },
    {
      question: t("How does the credit-based pricing system work?"),
      answer:
        t("New accounts receive starter credits once after verifying their email, subject to network and daily limits. Each successful generation uses credits based on its resolution. Open Plans & credits for current prices, allowances, and the total charge for monthly or annual billing."),
    },
    {
      question: t("What's the difference between text-to-panorama and image-to-panorama?"),
      answer:
        t("Text-to-panorama generates an entire spherical scene purely from your text prompt. Image-to-panorama allows you to attach 1 to 3 reference photos to guide the color palette, lighting atmosphere, and architectural materials, while the model fills out the remaining 360-degree environment."),
    },
    {
      question: t("Can I use these AI panoramas in Blender, Unreal Engine, or Unity?"),
      answer:
        t("Use 2:1 images in Blender Environment Texture or Unity Skybox/Panoramic workflows. Check Unreal texture import requirements separately. Radiance export stores image colors in an HDR container; it does not reconstruct scene lighting."),
    },
  ];

  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleIndex = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section className="py-12 border-t border-cyan-500/15 relative z-10">
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mb-3">
          <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
          <span>{t("Frequently Asked Questions")}</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          {t("360° Panorama AI — Common Questions")}</h2>
        <p className="text-sm text-cyan-200/70 mt-2">
          {t("Everything you need to know about resolutions, commercial licensing, 3D pipelines, and credit billing.")}</p>
      </div>

      <div className="max-w-3xl mx-auto space-y-3">
        {FAQS.map((faq, idx) => {
          const isOpen = openIndex === idx;
          return (
            <div
              key={idx}
              className={`glass-card rounded-2xl border transition-all ${
                isOpen ? 'border-cyan-400/50 bg-[#031024]/90' : 'border-cyan-500/20 hover:border-cyan-500/40'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleIndex(idx)}
                className="w-full p-4.5 text-left flex items-center justify-between gap-4 cursor-pointer"
              >
                <span className="text-sm font-bold text-white tracking-tight">{faq.question}</span>
                <span className="p-1 rounded-lg bg-cyan-950/60 text-cyan-400 border border-cyan-500/30 shrink-0">
                  {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
              </button>

              {isOpen && (
                <div className="px-4.5 pb-4.5 pt-1 text-xs text-cyan-200/80 leading-relaxed border-t border-cyan-500/10 animate-fade-in">
                  {faq.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
