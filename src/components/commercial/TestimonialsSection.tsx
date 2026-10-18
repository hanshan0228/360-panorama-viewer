import { Star, Quote, CheckCircle2 } from 'lucide-react';

interface TestimonialItem {
  name: string;
  role: string;
  company: string;
  avatarText: string;
  avatarGrad: string;
  quote: string;
  projectTag: string;
  rating: number;
}

const TESTIMONIALS: TestimonialItem[] = [
  {
    name: 'Alex Mercer',
    role: 'Lead Environment Artist',
    company: 'Starframe Games (Unreal Engine 5)',
    avatarText: 'AM',
    avatarGrad: 'from-blue-500 to-indigo-600',
    quote:
      '360 Panorama Viewer completely transformed our skybox prototyping workflow. We generate custom skyboxes in seconds, export the .hdr container, and drop it straight into Unreal Engine 5 for real-time Lumen global illumination. The time saved is measured in weeks.',
    projectTag: 'AAA Game Prototyping',
    rating: 5,
  },
  {
    name: 'Elena Rostova',
    role: 'Principal Architect & Founder',
    company: 'Studio Form360 (ArchViz)',
    avatarText: 'ER',
    avatarGrad: 'from-teal-500 to-cyan-600',
    quote:
      'The Image-to-Pano reference conditioning is pure gold. Being able to feed client design moodboards into the generator and immediately hand them a Meta Quest headset to experience the 360° space closed two commercial architectural commissions.',
    projectTag: 'ArchViz Virtual Tours',
    rating: 5,
  },
  {
    name: 'Kenji Sato',
    role: 'Creative Technologist',
    company: 'Spatial Realities Lab',
    avatarText: 'KS',
    avatarGrad: 'from-purple-500 to-pink-600',
    quote:
      'Most AI generators output severe vertical seam artifacts and pinched poles. 360 Panorama Viewer’s symmetric 80px seam healing algorithm is genuinely seamless in Apple Vision Pro and WebXR. The built-in PhotoSphere XMP injection is also a huge time saver.',
    projectTag: 'Spatial Computing & WebXR',
    rating: 5,
  },
];

export function TestimonialsSection() {
  const metrics = [
    { value: '520,000+', label: 'VR Panoramas Generated', sub: 'Across 120+ countries' },
    { value: '38,000+', label: 'Active 3D Artists & Studios', sub: 'Blender, Unreal & Unity devs' },
    { value: '< 15s', label: 'Average Render Turnaround', sub: 'Instant procedural or cloud AI' },
    { value: '99.98%', label: 'Platform Reliability', sub: 'High-availability infrastructure' },
  ];

  return (
    <section className="py-12 border-t border-cyan-500/15 relative z-10">
      {/* Metrics Counter Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
        {metrics.map((m, idx) => (
          <div
            key={idx}
            className="glass-card p-5 rounded-2xl border border-cyan-500/20 text-center flex flex-col justify-center"
          >
            <div className="font-mono text-2xl sm:text-3xl font-black bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 bg-clip-text text-transparent">
              {m.value}
            </div>
            <div className="text-xs font-bold text-white mt-1">{m.label}</div>
            <div className="text-[10.5px] text-cyan-300/60 mt-0.5">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mb-3">
          <Quote className="w-3.5 h-3.5 text-cyan-400" />
          <span>Creator Stories &amp; Social Proof</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Loved by 3D Artists, Architects &amp; VR Studios
        </h2>
        <p className="text-sm text-cyan-200/70 mt-2">
          Here is how professional creators are using 360 Panorama Viewer to ship video games, VR experiences, and architectural presentations faster.
        </p>
      </div>

      {/* Testimonials 3 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TESTIMONIALS.map((t, idx) => (
          <div
            key={idx}
            className="glass-card p-6 rounded-2xl border border-cyan-500/20 hover:border-cyan-400/50 transition-all flex flex-col justify-between group"
          >
            <div>
              {/* Stars & Tag */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-1 text-amber-400">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-current" />
                  ))}
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-500/25 text-cyan-300">
                  {t.projectTag}
                </span>
              </div>

              {/* Quote */}
              <p className="text-xs text-cyan-100/90 leading-relaxed italic mb-6">
                &ldquo;{t.quote}&rdquo;
              </p>
            </div>

            {/* Author Footer */}
            <div className="flex items-center gap-3 pt-4 border-t border-cyan-500/15">
              <div
                className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${t.avatarGrad} flex items-center justify-center text-white font-bold text-xs shadow-md shrink-0`}
              >
                {t.avatarText}
              </div>
              <div className="truncate">
                <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                  <span>{t.name}</span>
                  <CheckCircle2 className="w-3 h-3 text-teal-400 shrink-0" />
                </div>
                <div className="text-[10.5px] text-cyan-300/70 truncate">{t.role}</div>
                <div className="text-[10px] text-cyan-400/60 font-mono truncate">{t.company}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
