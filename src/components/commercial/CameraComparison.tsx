import { useState } from 'react';
import { Sparkles, Camera, Check, X, ArrowRight, Zap, Bot, Layers } from 'lucide-react';

interface ComparisonRow {
  feature: string;
  aiValue: string;
  aiGood: boolean;
  competitorValue: string;
  competitorGood: boolean;
}

export function CameraComparison() {
  const [activeBenchmark, setActiveBenchmark] = useState<'camera' | 'genericAi'>('camera');

  const cameraRows: ComparisonRow[] = [
    {
      feature: 'Hardware Upfront Cost',
      aiValue: '$0 (Free credits to start)',
      aiGood: true,
      competitorValue: '$500 – $1,500+ (Insta360 / Ricoh Theta)',
      competitorGood: false,
    },
    {
      feature: 'Imagined / Fictional Worlds',
      aiValue: 'Unlimited (Cyberpunk, Sci-Fi, Fantasy, Mars)',
      aiGood: true,
      competitorValue: 'Impossible (Only existing physical places)',
      competitorGood: false,
    },
    {
      feature: 'Turnaround Time',
      aiValue: '~10–30 seconds per 360° panorama',
      aiGood: true,
      competitorValue: 'Hours (Travel, tripod setup, lighting, stitching)',
      competitorGood: false,
    },
    {
      feature: 'Tripod & Nadir Patching',
      aiValue: 'Automated (Zero tripod shadow or nadir patch)',
      aiGood: true,
      competitorValue: 'Manual Photoshop nadir stamp required',
      competitorGood: false,
    },
    {
      feature: 'Weather & Lighting Restrictions',
      aiValue: 'None (Render midnight, blizzard, sunset anytime)',
      aiGood: true,
      competitorValue: 'Strictly dependent on outdoor weather & sunlight',
      competitorGood: false,
    },
    {
      feature: 'Real-World Architectural Survey',
      aiValue: 'Generative artistic interpretation',
      aiGood: false,
      competitorValue: 'True 1:1 photogrammetry survey accuracy',
      competitorGood: true,
    },
  ];

  const genericAiRows: ComparisonRow[] = [
    {
      feature: 'Equirectangular 2:1 Wrap Geometry',
      aiValue: 'Native 2:1 Spherical Cylindrical Wrap',
      aiGood: true,
      competitorValue: 'Flat 16:9 / 1:1 images with severe pinch distortion',
      competitorGood: false,
    },
    {
      feature: '360° Seam Alignment (0° to 360°)',
      aiValue: '160px Harmonic Poisson Gradient Seam Healing',
      aiGood: true,
      competitorValue: 'Visible vertical split line / cutline seam artifact',
      competitorGood: false,
    },
    {
      feature: 'Built-in 3D WebGL Sphere Viewer',
      aiValue: 'Real-time Three.js Orbit + Cardboard VR Split',
      aiGood: true,
      competitorValue: 'None (Requires separate third-party VR viewer)',
      competitorGood: false,
    },
    {
      feature: 'Game Engine Cubemap 6-Face Slicer',
      aiValue: '1-Click ZIP Export for Unity 6 & Unreal Engine 5',
      aiGood: true,
      competitorValue: 'Manual cube projection in Blender or Photoshop',
      competitorGood: false,
    },
    {
      feature: 'PhotoSphere XMP Metadata Injector',
      aiValue: 'Instant client-side injection for Meta / Google View',
      aiGood: true,
      competitorValue: 'Manual ExifTool command-line terminal hacking',
      competitorGood: false,
    },
    {
      feature: 'Style Conditioning with Reference Photos',
      aiValue: 'Up to 3 photos to guide palette, lighting & mood',
      aiGood: true,
      competitorValue: 'Complex ControlNet / IP-Adapter node wiring',
      competitorGood: false,
    },
  ];

  const currentRows = activeBenchmark === 'camera' ? cameraRows : genericAiRows;

  return (
    <section className="py-12 border-t border-cyan-500/15 relative z-10">
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mb-3">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          <span>Industry Benchmark &amp; Competitor Comparison</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          How 360 Panorama Viewer Compares
        </h2>
        <p className="text-sm text-cyan-200/70 mt-2">
          Compare 360 Panorama Viewer against physical 360° hardware rigs and generic 2D AI image generators.
        </p>

        {/* Dual Tab Switcher */}
        <div className="inline-flex items-center gap-1.5 p-1 bg-[#020b18] border border-cyan-500/30 rounded-2xl mt-5 shadow-lg">
          <button
            type="button"
            onClick={() => setActiveBenchmark('camera')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeBenchmark === 'camera'
                ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-md shadow-cyan-500/30 font-extrabold'
                : 'text-cyan-200/70 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>vs. 360° Hardware Cameras</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveBenchmark('genericAi')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeBenchmark === 'genericAi'
                ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-md shadow-cyan-500/30 font-extrabold'
                : 'text-cyan-200/70 hover:text-white'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>vs. Generic 2D AI Generators</span>
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto glass-panel border border-cyan-500/25 rounded-2xl overflow-hidden shadow-2xl">
        <div className="grid grid-cols-12 bg-[#020b1c] border-b border-cyan-500/20 text-xs font-bold text-cyan-200 p-4">
          <div className="col-span-4 sm:col-span-5 text-slate-400 uppercase tracking-wider text-[11px]">
            Comparison Dimension
          </div>
          <div className="col-span-4 sm:col-span-4 text-cyan-400 flex items-center gap-1.5 font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>360 Panorama Viewer</span>
          </div>
          <div className="col-span-4 sm:col-span-3 text-slate-400 flex items-center gap-1.5">
            {activeBenchmark === 'camera' ? (
              <>
                <Camera className="w-3.5 h-3.5" />
                <span>360° Hardware Camera</span>
              </>
            ) : (
              <>
                <Layers className="w-3.5 h-3.5" />
                <span>Midjourney / DALL-E</span>
              </>
            )}
          </div>
        </div>

        <div className="divide-y divide-cyan-500/10 text-xs">
          {currentRows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-12 p-4 items-center hover:bg-cyan-950/20 transition-colors">
              <div className="col-span-4 sm:col-span-5 font-medium text-white text-[13px]">
                {row.feature}
              </div>
              
              <div className="col-span-4 sm:col-span-4 pr-3">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium text-[11px] ${
                    row.aiGood
                      ? 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-200'
                      : 'bg-slate-800/60 text-slate-400'
                  }`}
                >
                  {row.aiGood ? <Check className="w-3 h-3 text-cyan-400" /> : null}
                  <span>{row.aiValue}</span>
                </span>
              </div>

              <div className="col-span-4 sm:col-span-3">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] ${
                    row.competitorGood
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                      : 'bg-slate-900/60 text-slate-400 border border-slate-800'
                  }`}
                >
                  {row.competitorGood ? (
                    <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                  ) : (
                    <X className="w-3 h-3 text-slate-500 shrink-0" />
                  )}
                  <span>{row.competitorValue}</span>
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Summary Bar */}
        <div className="p-4 bg-gradient-to-r from-cyan-950/50 via-[#03112a] to-blue-950/50 border-t border-cyan-500/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <p className="text-cyan-200/80">
            <strong className="text-white">Verdict:</strong>{' '}
            {activeBenchmark === 'camera'
              ? 'Physical cameras win on real-world surveyor accuracy. 360 Panorama Viewer wins completely on speed, fictional world building, zero hardware cost, and instant game-engine export.'
              : 'Generic 2D image models produce flat images that tear and warp when projected onto a sphere. 360 Panorama Viewer is purpose-built for true 2:1 equirectangular spherical VR environments.'}
          </p>
          <span className="shrink-0 font-bold text-cyan-400 flex items-center gap-1">
            <span>Production Ready</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </section>
  );
}
