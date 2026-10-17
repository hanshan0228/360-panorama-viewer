import { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface FaqItem {
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    question: 'How do I generate a 360° panorama?',
    answer:
      'Describe your scene (or attach up to 3 reference photos), choose a style and resolution tier, and click Generate. Inspect the result in the 360° viewer, including the horizon, poles, and wrap-around seam. Seam blending is optional and off by default; it can introduce ghosting and cannot reconstruct inconsistent geometry.',
  },
  {
    question: 'How long does each panorama take to generate?',
    answer:
      'In Instant Procedural mode, generation is completed in under 500 milliseconds. When utilizing connected AI image models (such as Gemini 2.5/3.1 or local 8317 proxy endpoints), high-resolution generation typically takes between 8 and 25 seconds, with real-time step progress displayed.',
  },
  {
    question: 'What format is the output file?',
    answer:
      'Standard output is a 2:1 equirectangular PNG image (1024×512, 2048×1024, or 3840×1920). You can also download Radiance .hdr files for 3D IBL pipelines, or export 6-sided cubemap ZIP archives (Right, Left, Top, Bottom, Front, Back) ready for Unity Skybox.',
  },
  {
    question: 'Does the 360° viewer work on mobile devices and VR headsets?',
    answer:
      'Yes. The embedded Three.js WebGL viewer is fully responsive on iOS Safari, Android Chrome, and Meta Quest Oculus Browser. On smartphones, you can pan with your finger or toggle the Cardboard Split-Screen VR mode for dual-eye immersive viewing.',
  },
  {
    question: 'Can I use the generated panoramas for commercial projects?',
    answer:
      'Yes. Outputs generated with paid credits (Pro or Enterprise plans) include full commercial usage rights for video games, architectural visualization, advertising, VR experiences, and client commissions. Free explorer outputs are licensed for personal evaluation.',
  },
  {
    question: 'How does the credit-based pricing system work?',
    answer:
      'New accounts receive starter credits. Each successful generation uses credits based on its resolution. Open Plans & credits for current prices, allowances, and the total charge for monthly or annual billing.',
  },
  {
    question: "What's the difference between text-to-panorama and image-to-panorama?",
    answer:
      'Text-to-panorama generates an entire spherical scene purely from your text prompt. Image-to-panorama allows you to attach 1 to 3 reference photos to guide the color palette, lighting atmosphere, and architectural materials, while the model fills out the remaining 360-degree environment.',
  },
  {
    question: 'Can I use these AI panoramas in Blender, Unreal Engine, or Unity?',
    answer:
      'Yes. The 2:1 PNG drops directly into Blender as an Environment Texture (World Shader), into Unreal Engine 5 as an HDRIBackdrop or Skylight, and into Unity as a Skybox Panoramic material. The .hdr export wraps the luminance data into a standard Radiance container for seamless IBL lighting.',
  },
];

export function CommercialFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleIndex = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section className="py-12 border-t border-cyan-500/15 relative z-10">
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mb-3">
          <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
          <span>Frequently Asked Questions</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          360° Panorama AI — Common Questions
        </h2>
        <p className="text-sm text-cyan-200/70 mt-2">
          Everything you need to know about resolutions, commercial licensing, 3D pipelines, and credit billing.
        </p>
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
