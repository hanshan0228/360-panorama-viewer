import { useState } from 'react';
import { Scissors, Check, X, Sliders, ShieldCheck } from 'lucide-react';

export function SeamShowcase() {
  const [sliderPos, setSliderPos] = useState<number>(50);

  return (
    <section className="py-12 border-t border-cyan-500/15 relative z-10">
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mb-3">
          <Scissors className="w-3.5 h-3.5 text-cyan-400" />
          <span>Proprietary 360° Alignment Tech</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Why Standard AI Fails &amp; How Our Seam Healer Fixes It
        </h2>
        <p className="text-sm text-cyan-200/70 mt-2">
          Standard diffusion models generate flat rectangular boundaries. When wrapped into a 360° sphere, the left-most column never matches the right-most column, creating a jarring vertical cutline. Drag the slider below to see our symmetric healing in action.
        </p>
      </div>

      <div className="max-w-4xl mx-auto glass-panel border border-cyan-500/30 rounded-3xl overflow-hidden p-6 sm:p-8 shadow-2xl">
        {/* Interactive Before/After Split Viewer */}
        <div className="relative h-64 sm:h-80 w-full rounded-2xl overflow-hidden select-none border border-cyan-500/30 shadow-inner bg-black">
          {/* "After" Layer: Seamless 360 Panorama Viewer Output */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#061838] via-[#113a70] to-[#061838] flex items-center justify-center">
            {/* Visual simulation of continuous horizon */}
            <div className="w-full h-full relative overflow-hidden flex flex-col justify-end">
              <div className="absolute top-1/4 inset-x-0 h-32 bg-cyan-500/20 blur-3xl" />
              <div className="h-28 bg-gradient-to-t from-cyan-950 via-teal-900/60 to-transparent flex items-center justify-center">
                <div className="w-full h-1 bg-cyan-400/50 shadow-[0_0_15px_#00F2FE]" />
              </div>
              <div className="absolute top-4 right-4 bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 backdrop-blur-md">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>After: 360 Panorama Viewer Seam Healed (0 Visible Seam)</span>
              </div>
            </div>
          </div>

          {/* "Before" Layer: Raw Cutline with Discontinuity (Clipped by slider) */}
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#051229] via-[#091f42] to-[#250d3a] overflow-hidden border-r-2 border-cyan-400 shadow-[0_0_20px_#00F2FE]"
            style={{ width: `${sliderPos}%` }}
          >
            <div className="w-full h-full relative overflow-hidden flex flex-col justify-end" style={{ width: '896px' }}>
              <div className="absolute top-1/4 inset-x-0 h-32 bg-pink-500/20 blur-3xl" />
              <div className="h-28 bg-gradient-to-t from-slate-950 via-purple-950/60 to-transparent flex items-center">
                {/* Harsh vertical misaligned cutline */}
                <div className="w-1/2 h-1 bg-purple-400/60" />
                <div className="w-1/2 h-1 bg-pink-500/60 transform translate-y-3" />
              </div>
              <div className="absolute top-4 left-4 bg-red-500/20 border border-red-400/40 text-red-300 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 backdrop-blur-md">
                <X className="w-3.5 h-3.5 text-red-400" />
                <span>Before: Raw AI Image (Severe Vertical Discontinuity)</span>
              </div>
            </div>
          </div>

          {/* Slider Draggable Thumb Handle */}
          <div
            className="absolute inset-y-0 flex items-center justify-center pointer-events-none"
            style={{ left: `calc(${sliderPos}% - 16px)` }}
          >
            <div className="w-8 h-8 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center shadow-lg shadow-cyan-400/50 font-bold text-xs pointer-events-auto cursor-ew-resize">
              <Sliders className="w-4 h-4" />
            </div>
          </div>

          {/* Hidden range input over the container for seamless drag handling */}
          <input
            type="range"
            min={5}
            max={95}
            value={sliderPos}
            onChange={(e) => setSliderPos(Number(e.target.value))}
            className="absolute inset-0 opacity-0 cursor-ew-resize w-full h-full"
            aria-label="Before and after seam healing comparison slider"
          />
        </div>

        {/* Algorithm Technical Specifications 3 Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="p-4 rounded-xl bg-[#020b18] border border-cyan-500/20 text-xs">
            <div className="font-bold text-cyan-300 mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
              <span>Symmetric 80px Cross-Fade</span>
            </div>
            <p className="text-cyan-200/70 text-[11px] leading-relaxed">
              Mirrors the outer 80 pixels on the horizontal boundary and computes non-linear cosine alpha weights, ensuring 100% continuous wrapping.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#020b18] border border-cyan-500/20 text-xs">
            <div className="font-bold text-cyan-300 mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
              <span>Zenith &amp; Nadir Clamping</span>
            </div>
            <p className="text-cyan-200/70 text-[11px] leading-relaxed">
              Equirectangular poles experience infinite horizontal stretch. Our spatial pole filter prevents the zenith (sky) and nadir (ground) from pinching.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#020b18] border border-cyan-500/20 text-xs">
            <div className="font-bold text-cyan-300 mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
              <span>Color Histogram Alignment</span>
            </div>
            <p className="text-cyan-200/70 text-[11px] leading-relaxed">
              Balances color luminance and contrast channels across boundaries so lighting and shadow continuity stay mathematically unbroken.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
