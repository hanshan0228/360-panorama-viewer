import { useTranslation } from '../../utils/i18n';
import { sharedMessages } from '../../utils/sharedTranslations';
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
  const t = useTranslation(sharedMessages);
  const features: FeatureCardProps[] = [
    {
      icon: <Sparkles className="w-5 h-5 text-cyan-400" />,
      title: t("Text-to-360 Generation"),
      badge: t("Core Engine"),
      description:
        t("Generic image models do not understand equirectangular geometry. We automatically inject 360° cylindrical wrap-around cues into your prompt."),
      bulletPoints: [
        t("Natural language prompt expansion"),
        t("Automatic lighting & depth hints"),
        t("Zero prompt syntax learning curve"),
      ],
    },
    {
      icon: <Image className="w-5 h-5 text-teal-400" />,
      title: t("Image-to-Pano Conditioning"),
      badge: t("Multi-Reference"),
      description:
        t("Upload up to 3 reference photos to steer style, architectural elements, lighting, and palette while letting the model fill full spherical coverage."),
      bulletPoints: [
        t("Multi-image style conditioning"),
        t("Palette & material transfer"),
        t("Preserves real-world design cues"),
      ],
    },
    {
      icon: <Scissors className="w-5 h-5 text-amber-400" />,
      title: t("Seam-Aware Post-Processing"),
      badge: t("Optional"),
      description:
        t("Inspect the left and right edges in the viewer after automatic seam detection and optional blending. Blending can soften a boundary, but cannot reconstruct mismatched scene geometry."),
      bulletPoints: [
        t("Automatic hard-boundary detection"),
        t("May introduce ghosting at the edges"),
        t("Keep the original before blending"),
      ],
    },
    {
      icon: <Layers className="w-5 h-5 text-blue-400" />,
      title: t("Inspect Every Direction"),
      badge: t("Quality Check"),
      description:
        t("Look up, down, and around your result to check the horizon, poles, and seam. A 2:1 image alone does not guarantee a geometrically correct panorama."),
      bulletPoints: [
        t("Check the sky and ground"),
        t("Look for warping and repeated objects"),
        t("Regenerate when geometry is inconsistent"),
      ],
    },
    {
      icon: <Box className="w-5 h-5 text-emerald-400" />,
      title: t("Resolution Choices & HDR Export"),
      badge: t("Game Ready"),
      description:
        t("Request 1K, 2K, or 4K and see the actual returned dimensions. A requested tier is not a guarantee of model detail. Export your result as PNG or a Radiance .hdr container."),
      bulletPoints: [
        t("Actual model dimensions displayed"),
        t("Radiance .hdr container from image colors"),
        t("Commercial usage on paid plans"),
      ],
    },
    {
      icon: <Eye className="w-5 h-5 text-pink-400" />,
      title: t("Built-in WebGL 3D Sphere Viewer"),
      badge: t("Three.js Powered"),
      description:
        t("Inspect, pan, zoom, and fullscreen your results immediately in WebGL. Includes cardboard split-screen VR, little-planet projection, and minimap radar."),
      bulletPoints: [
        t("Cardboard split-screen mobile VR"),
        t("Fisheye & Little-Planet projections"),
        t("Directional radar compass & audio"),
      ],
    },
  ];

  return (
    <section className="py-12 border-t border-cyan-500/15 relative z-10">
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mb-3">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          <span>{t("Professional WebGL & VR Standards")}</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          {t("Built for VR-Ready Equirectangular Output")}</h2>
        <p className="text-sm text-cyan-200/70 mt-2">
          {t("Generate a 2:1 image, inspect it in the sphere viewer, and export it for your workflow. Check geometry and target-tool requirements before production use.")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((f, i) => (
          <FeatureCard key={i} {...f} />
        ))}
      </div>
    </section>
  );
}
