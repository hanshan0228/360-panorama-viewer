import { useTranslation } from '../../utils/i18n';
import { sharedMessages } from '../../utils/sharedTranslations';
import { Gamepad2, Box } from 'lucide-react';

export function IntegrationBadges() {
  const t = useTranslation(sharedMessages);
  const integrations = [
    {
      name: 'Unreal Engine 5',
      badge: t("HDRI Backdrop"),
      desc: t("Check Unreal import settings and required texture type. PNG cube faces are not an Unreal TextureCube asset."),
      color: 'from-blue-600 to-indigo-800',
    },
    {
      name: 'Unity 2023 / 6',
      badge: t("Panoramic Skybox"),
      desc: t("Assign a 2:1 image to a material using the Skybox/Panoramic shader; check orientation and exposure."),
      color: 'from-slate-700 to-slate-900',
    },
    {
      name: 'Blender 4.x',
      badge: t("World Environment"),
      desc: t("Use an Environment Texture in the World shader. An HDR container made from an ordinary image does not recover scene lighting."),
      color: 'from-orange-500 to-amber-700',
    },
    {
      name: 'Three.js / WebGL',
      badge: t("Equirectangular Texture"),
      desc: t("Load via THREE.TextureLoader() or RGBELoader() and map to scene.background or MeshBasicMaterial."),
      color: 'from-teal-600 to-cyan-800',
    },
    {
      name: 'Meta Quest 3',
      badge: t("Browser Viewing"),
      desc: t("Try browser viewing and Cardboard split-screen. Native WebXR sessions are not provided by this viewer."),
      color: 'from-purple-600 to-pink-800',
    },
    {
      name: 'Apple Vision Pro',
      badge: t("Browser Compatibility"),
      desc: t("Browser viewing depends on device support. A native visionOS or immersive WebXR mode is not provided."),
      color: 'from-slate-800 to-zinc-950',
    },
  ];

  return (
    <section className="py-12 border-t border-cyan-500/15 relative z-10">
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mb-3">
          <Gamepad2 className="w-3.5 h-3.5 text-cyan-400" />
          <span>{t("Universal 3D & Game Engine Pipeline")}</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          {t("Prepare Exports for Your Workflow")}</h2>
        <p className="text-sm text-cyan-200/70 mt-2">
          {t("Export 2:1 images or six PNG cube faces, then check your target tool’s import requirements. HDR containers do not add captured dynamic range.")}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {integrations.map((item, idx) => (
          <div
            key={idx}
            className="glass-card p-4 rounded-2xl border border-cyan-500/20 hover:border-cyan-400/50 transition-all flex flex-col justify-between group"
          >
            <div>
              <div className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${item.color} flex items-center justify-center text-white mb-3 shadow-md`}>
                <Box className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">
                {item.name}
              </h3>
              <span className="text-[10px] font-mono font-medium text-cyan-400/90 block mt-0.5">
                {item.badge}
              </span>
            </div>

            <p className="text-[11px] text-cyan-200/60 leading-relaxed mt-3 pt-2 border-t border-cyan-500/10">
              {item.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
