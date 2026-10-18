import { Sparkles, Image, Eye, Scissors, Layers, CheckCircle2, ShieldCheck, Box } from 'lucide-react';

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  description: string;
  bulletPoints: string[];
}

function FeatureCard({ icon, title, badge, description, bulletPoints }: FeatureCardProps) {
  return (
    <div className="glass-card p-6 rounded-2xl border border-cyan-500/20 hover:border-cyan-400/50 transition-all duration-300 flex flex-col justify-between group">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="p-3 bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 rounded-xl text-cyan-300 group-hover:scale-105 transition-transform">
            {icon}
          </div>
          {badge && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/70 border border-cyan-500/30 text-cyan-300 font-bold">
              {badge}
            </span>
          )}
        </div>

        <h3 className="text-base font-bold text-white mb-2 tracking-tight group-hover:text-cyan-200 transition-colors">
          {title}
        </h3>
        <p className="text-xs text-cyan-200/70 leading-relaxed mb-4">
          {description}
        </p>
      </div>

      <ul className="space-y-2 pt-3 border-t border-cyan-500/15">
        {bulletPoints.map((point, idx) => (
          <li key={idx} className="flex items-start gap-2 text-[11px] text-cyan-100/80">
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FeatureMatrix() {
  const features: FeatureCardProps[] = [
    {
      icon: <Sparkles className="w-5 h-5 text-cyan-400" />,
      title: 'Text-to-360 Generation',
      badge: 'Core Engine',
      description:
        'Generic image models do not understand equirectangular geometry. We automatically inject 360° cylindrical wrap-around cues into your prompt.',
      bulletPoints: [
        'Natural language prompt expansion',
        'Automatic lighting & depth hints',
        'Zero prompt syntax learning curve',
      ],
    },
    {
      icon: <Image className="w-5 h-5 text-teal-400" />,
      title: 'Image-to-Pano Conditioning',
      badge: 'Multi-Reference',
      description:
        'Upload up to 3 reference photos to steer style, architectural elements, lighting, and palette while letting the model fill full spherical coverage.',
      bulletPoints: [
        'Multi-image style conditioning',
        'Palette & material transfer',
        'Preserves real-world design cues',
      ],
    },
    {
      icon: <Scissors className="w-5 h-5 text-amber-400" />,
      title: 'Seam-Aware Post-Processing',
      badge: 'Optional',
      description:
        'Inspect the left and right edges in the viewer after automatic seam detection and optional blending. Blending can soften a boundary, but cannot reconstruct mismatched scene geometry.',
      bulletPoints: [
        'Automatic hard-boundary detection',
        'May introduce ghosting at the edges',
        'Keep the original before blending',
      ],
    },
    {
      icon: <Layers className="w-5 h-5 text-blue-400" />,
      title: 'Inspect Every Direction',
      badge: 'Quality Check',
      description:
        'Look up, down, and around your result to check the horizon, poles, and seam. A 2:1 image alone does not guarantee a geometrically correct panorama.',
      bulletPoints: [
        'Check the sky and ground',
        'Look for warping and repeated objects',
        'Regenerate when geometry is inconsistent',
      ],
    },
    {
      icon: <Box className="w-5 h-5 text-emerald-400" />,
      title: 'Resolution Choices & HDR Export',
      badge: 'Game Ready',
      description:
        'Request 1K, 2K, or 4K and see the actual returned dimensions. A requested tier is not a guarantee of model detail. Export your result as PNG or a Radiance .hdr container.',
      bulletPoints: [
        'Actual model dimensions displayed',
        'Radiance .hdr format for 3D IBL',
        'Commercial usage on paid plans',
      ],
    },
    {
      icon: <Eye className="w-5 h-5 text-pink-400" />,
      title: 'Built-in WebGL 3D Sphere Viewer',
      badge: 'Three.js Powered',
      description:
        'Inspect, pan, zoom, and fullscreen your results immediately in WebGL. Includes cardboard split-screen VR, little-planet projection, and minimap radar.',
      bulletPoints: [
        'Cardboard split-screen mobile VR',
        'Fisheye & Little-Planet projections',
        'Directional radar compass & audio',
      ],
    },
  ];

  return (
    <section className="py-12 border-t border-cyan-500/15 relative z-10">
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mb-3">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          <span>Professional WebGL &amp; VR Standards</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Built for VR-Ready Equirectangular Output
        </h2>
        <p className="text-sm text-cyan-200/70 mt-2">
          Standard AI models produce flat images that pinch and tear when wrapped onto a sphere. 360 Panorama Viewer adds the panorama-specific engineering pipeline so your output drops straight into any 360° viewer or VR headset.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((f, i) => (
          <FeatureCard key={i} {...f} />
        ))}
      </div>
    </section>
  );
}
