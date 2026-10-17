import { Wand2, ImagePlus, Cpu, Download, ArrowRight } from 'lucide-react';

export function HowItWorksSteps() {
  const steps = [
    {
      number: '01',
      title: 'Pick a Preset or Describe Your Scene',
      description:
        'Choose from curated presets (Cyberpunk, Alpine Sunset, Deep Space, Luxury Penthouse) or describe any fantasy or realistic scene in plain English.',
      icon: <Wand2 className="w-5 h-5 text-cyan-400" />,
    },
    {
      number: '02',
      title: 'Optionally Drop 1–3 Reference Photos',
      description:
        'Attach reference images to guide lighting, color palette, or architectural styles. The AI integrates these cues while completing full 360° coverage.',
      icon: <ImagePlus className="w-5 h-5 text-teal-400" />,
    },
    {
      number: '03',
      title: 'Generate & Inspect Your Panorama',
      description:
        'Generate with your chosen resolution tier, then inspect the horizon, poles, and wrap-around seam. Optional blending can soften edges but may introduce ghosting.',
      icon: <Cpu className="w-5 h-5 text-amber-400" />,
    },
    {
      number: '04',
      title: 'Preview in 360° & Export Multi-Formats',
      description:
        'Pan, zoom, and test cardboard VR directly in the WebGL sphere viewer. Download 2:1 PNG, Radiance .hdr, or 6-sided cubemap ZIP packages.',
      icon: <Download className="w-5 h-5 text-emerald-400" />,
    },
  ];

  return (
    <section className="py-12 border-t border-cyan-500/15 relative z-10">
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mb-3">
          <span>Workflow Automation</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          How AI 360° Panorama Generation Works
        </h2>
        <p className="text-sm text-cyan-200/70 mt-2">
          Four effortless steps from natural text or reference imagery to a fully spherical, VR-ready environment.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
        {steps.map((s, idx) => (
          <div
            key={idx}
            className="glass-card p-6 rounded-2xl border border-cyan-500/20 hover:border-cyan-400/50 transition-all duration-300 relative group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-2xl font-black bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                  {s.number}
                </span>
                <div className="p-2.5 bg-cyan-500/15 border border-cyan-500/30 rounded-xl">
                  {s.icon}
                </div>
              </div>

              <h3 className="text-sm font-bold text-white mb-2 tracking-tight group-hover:text-cyan-300 transition-colors">
                {s.title}
              </h3>
              <p className="text-xs text-cyan-200/70 leading-relaxed">
                {s.description}
              </p>
            </div>

            <div className="pt-4 mt-4 border-t border-cyan-500/10 flex items-center gap-1 text-[11px] font-semibold text-cyan-400">
              <span>Step {s.number}</span>
              <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
