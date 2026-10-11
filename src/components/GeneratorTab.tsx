import { useState, useRef } from 'react';
import {
  Sparkles,
  Download,
  Box,
  Globe2,
  Sliders,
  CheckCircle2,
  RefreshCw,
  FileCode2,
  AlertCircle,
  Zap,
  ImagePlus,
  Trash2,
  Upload,
  Coins,
  Wand2,
  Star,
  ShieldCheck,
  RotateCcw,
  Film,
  Code2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import type { ActiveTab, StylePreset, StylePresetId, ResolutionTier } from '../types/panorama';
import { SphereViewer } from './SphereViewer';
import { exportCanvasToHdrBlob } from '../utils/hdrExporter';
import {
  generateWithGemini,
  buildPanoramaPrompt,
  type GeminiConfig,
} from '../utils/geminiClient';
import { ShowcaseGallery } from './commercial/ShowcaseGallery';
import { FeatureMatrix } from './commercial/FeatureMatrix';
import { SeamShowcase } from './commercial/SeamShowcase';
import { CameraComparison } from './commercial/CameraComparison';
import { HowItWorksSteps } from './commercial/HowItWorksSteps';
import { IntegrationBadges } from './commercial/IntegrationBadges';
import { TestimonialsSection } from './commercial/TestimonialsSection';
import { CommercialFaq } from './commercial/CommercialFaq';
import { PhotoToVideoModal } from './commercial/PhotoToVideoModal';
import { EmbedModal } from './commercial/EmbedModal';
import { CheckoutModal } from './commercial/CheckoutModal';
import { exportVrReadyJpegBlob } from '../utils/xmpInjector';
import { healPanoramaSeam } from '../utils/seamHealer';
import { enhanceAndUpscalePanorama } from '../utils/imageEnhancer';
import {
  getCurrentUser,
  deductCurrentUserCredits,
  getModelExecutionPipeline,
  getStoredBillingConfig,
} from '../utils/adminStorage';

const PROMPT_BUILDER_CATEGORIES = [
  {
    name: 'Lighting & Atmosphere',
    tags: [
      'golden hour warm sunlight',
      'cyberpunk neon reflections',
      'volumetric fog & god rays',
      'starry milky way nebula',
      'overcast soft architectural lighting',
    ],
  },
  {
    name: 'Perspective & Horizon',
    tags: [
      '360 degree panoramic view',
      'seamless equirectangular projection',
      'eye-level human horizon',
      'drone aerial 360 overview',
      'spherical wide angle view',
    ],
  },
  {
    name: 'Environment & Setting',
    tags: [
      'luxury penthouse interior',
      'snow-capped alpine lake',
      'futuristic orbital hangar',
      'ancient stone temple sanctuary',
      'tropical ocean island beach',
    ],
  },
  {
    name: 'Engine & Quality',
    tags: [
      '8k photorealistic photography',
      'Unreal Engine 5 Octane render',
      'architectural digest photography',
      'hyper-detailed raytracing reflections',
      'Studio Ghibli anime watercolor',
    ],
  },
];

interface GeneratorTabProps {
  currentPanoramaUrl: string;
  onPanoramaChange: (url: string) => void;
  onNavigateTab: (tab: ActiveTab) => void;
  externalInputMode?: 'text' | 'image';
  onInputModeChange?: (mode: 'text' | 'image') => void;
  externalPrompt?: string;
  externalStyle?: StylePresetId;
}

const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    description: 'Sci-fi megacity, wet asphalt reflections & holographic neon',
    promptSuffix: 'cyberpunk futuristic metropolis at night, glowing neon billboards, volumetric fog, rainy reflections',
    previewColor: 'from-pink-500 to-cyan-400',
  },
  {
    id: 'nature',
    name: 'Tropical Sunset',
    description: 'Golden ocean waves, crystal reflections, palms & twilight',
    promptSuffix: 'tropical island sunset, golden reflections on ocean waves, palm trees, purple clouds',
    previewColor: 'from-amber-400 to-orange-500',
  },
  {
    id: 'space',
    name: 'Deep Space Nebula',
    description: 'Cosmic dust, glowing star clusters, planetary rings & celestial sphere',
    promptSuffix: 'deep space nebula, purple and teal cosmic dust, glowing galaxies, ringed planet, stellar skybox',
    previewColor: 'from-cyan-400 to-blue-600',
  },
  {
    id: 'interior',
    name: 'Modern Penthouse',
    description: 'Floor-to-ceiling glass, warm oak wood, luxury skyline dusk view',
    promptSuffix: 'luxury modern penthouse interior, floor-to-ceiling glass windows, evening city view, warm oak wood',
    previewColor: 'from-teal-500 to-sky-700',
  },
  {
    id: 'anime',
    name: 'Anime Watercolor',
    description: 'Hand-drawn watercolor aesthetic, coastal road, blue skies & summer breeze',
    promptSuffix: 'Japanese anime hand-drawn watercolor aesthetic, gentle coastal breeze, lush green summer grass, fluffy white clouds, warm natural sunlight, nostalgic peaceful anime scenery',
    previewColor: 'from-sky-400 via-teal-300 to-emerald-400',
  },
  {
    id: 'fantasy',
    name: 'Floating Ruins',
    description: 'Ancient celestial sanctuary, magical runes & glowing aurora skies',
    promptSuffix: 'ancient fantasy temple ruins, floating celestial stones, glowing magical runes, aurora sky',
    previewColor: 'from-emerald-400 to-teal-600',
  },
  {
    id: 'custom',
    name: 'Raw / Custom Prompt',
    description: 'Pure input mode with no extra style suffixes added',
    promptSuffix: '',
    previewColor: 'from-slate-500 to-slate-700',
  },
];

const QUICK_TRY_CHIPS = [
  { label: 'Cyberpunk Tokyo, 2087', prompt: 'futuristic cyberpunk city at night with flying vehicles, wet reflective asphalt, holographic neon signage, 8k equirectangular 360', style: 'cyberpunk' as StylePresetId },
  { label: 'Alpine Mountain Lake', prompt: 'majestic snow-capped alpine mountains at sunrise, crystal clear turquoise lake reflection, morning mist, golden sunbeams, 8k equirectangular 360', style: 'nature' as StylePresetId },
  { label: 'Sci-Fi Space Station', prompt: 'deep space orbital station observation deck, purple nebula dust, glowing galaxies, ringed planet, star clusters, 8k equirectangular 360', style: 'space' as StylePresetId },
  { label: 'Ancient Rome, 80 AD', prompt: 'ancient Rome forum and colosseum at golden hour, marble pillars, toga citizens, sun-drenched stone plaza, 8k equirectangular 360', style: 'fantasy' as StylePresetId },
  { label: 'Renaissance Florence, 1503', prompt: 'Renaissance Florence cathedral dome, terracotta rooftops, Arno river reflection, warm Mediterranean twilight, 8k 360', style: 'interior' as StylePresetId },
  { label: 'Minimalist Luxury Villa', prompt: 'ultra-luxury modern minimalist villa interior, floor-to-ceiling glass windows overlooking private ocean infinity pool, warm architectural lighting, 8k 360', style: 'interior' as StylePresetId },
];

const SAMPLE_REFERENCE_PRESETS = [
  {
    id: 'ref-interior',
    name: 'Modern Living Room',
    desc: 'Oak timber & architectural glass',
    style: 'interior' as StylePresetId,
    previewGrad: 'from-amber-600 to-stone-800',
    promptSnippet: 'luxury interior architecture, oak wood paneling, warm ambient lighting',
  },
  {
    id: 'ref-alpine',
    name: 'Alpine Glacial Lake',
    desc: 'Granite peaks & turquoise water',
    style: 'nature' as StylePresetId,
    previewGrad: 'from-teal-600 to-sky-900',
    promptSnippet: 'alpine mountain range, crystalline turquoise glacial lake, pine forest',
  },
  {
    id: 'ref-cyber',
    name: 'Neon Cyber City',
    desc: 'Rainy asphalt & neon glow',
    style: 'cyberpunk' as StylePresetId,
    previewGrad: 'from-pink-600 to-purple-900',
    promptSnippet: 'cyberpunk neon metropolis, rain reflections on pavement, holographic signs',
  },
];

export function GeneratorTab({
  currentPanoramaUrl,
  onPanoramaChange,
  onNavigateTab,
  externalInputMode,
  onInputModeChange,
  externalPrompt,
  externalStyle,
}: GeneratorTabProps) {
  const [localInputMode, setInputMode] = useState<'text' | 'image'>(externalInputMode ?? 'text');
  const inputMode = externalInputMode ?? localInputMode;

  const handleModeChange = (newMode: 'text' | 'image') => {
    if (externalInputMode === undefined) setInputMode(newMode);
    onInputModeChange?.(newMode);
  };
  const [prompt, setPrompt] = useState(
    externalPrompt || 'futuristic cyberpunk city at night, neon holograms, rain reflections, volumetric fog, 8k equirectangular 360 panorama'
  );
  const [selectedStyle, setSelectedStyle] = useState<StylePresetId>(externalStyle ?? 'cyberpunk');
  const [previousPresets, setPreviousPresets] = useState({ prompt: externalPrompt, style: externalStyle, inputMode: externalInputMode });

  // Apply changed external presets once, without overwriting subsequent local edits.
  if (externalPrompt !== previousPresets.prompt || externalStyle !== previousPresets.style || externalInputMode !== previousPresets.inputMode) {
    setPreviousPresets({ prompt: externalPrompt, style: externalStyle, inputMode: externalInputMode });
    if (externalPrompt !== previousPresets.prompt && externalPrompt) setPrompt(externalPrompt);
    if (externalStyle !== previousPresets.style && externalStyle) setSelectedStyle(externalStyle);
    // Preserve the last controlled mode if the parent releases control.
    if (externalInputMode !== previousPresets.inputMode && externalInputMode) setInputMode(externalInputMode);
  }

  const [resolution, setResolution] = useState<ResolutionTier>('2K');
  const [seamCorrection, setSeamCorrection] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<number>(0);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isEmbedModalOpen, setIsEmbedModalOpen] = useState(false);
  const [showPromptBuilder, setShowPromptBuilder] = useState(true);

  const handleAppendTag = (tag: string) => {
    setPrompt((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return tag;
      if (trimmed.toLowerCase().includes(tag.toLowerCase())) return prev;
      return `${trimmed}, ${tag}`;
    });
  };

  // Reference photos state for Image-to-Pano mode (Benchmarked from panoramagenerator.com)
  const [referenceImages, setReferenceImages] = useState<Array<{ id: string; name: string; preview: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [apiError, setApiError] = useState<string | null>(null);
  const [isUpscalingClarity, setIsUpscalingClarity] = useState(false);
  const [originalRawUrl, setOriginalRawUrl] = useState<string | null>(null);
  const [enhanced4kUrl, setEnhanced4kUrl] = useState<string | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  // User credit and commercial checkout state
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Dynamic credit cost from admin billing configuration
  const billingConfig = getStoredBillingConfig();
  const creditsCost =
    resolution === '4K'
      ? billingConfig.creditCostPer4K
      : resolution === '2K'
      ? billingConfig.creditCostPer2K
      : billingConfig.creditCostPer1K;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = 3 - referenceImages.length;
    if (remainingSlots <= 0) {
      alert('You can attach a maximum of 3 reference photos.');
      return;
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots);
    filesToProcess.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const preview = event.target?.result as string;
        setReferenceImages((prev) => [
          ...prev,
          {
            id: `ref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name: file.name,
            preview,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddSampleReference = (preset: typeof SAMPLE_REFERENCE_PRESETS[0]) => {
    if (referenceImages.length >= 3) {
      alert('You can attach a maximum of 3 reference photos.');
      return;
    }

    // Generate a quick thumbnail canvas as sample preview
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 200;
    const ctx = c.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 400, 200);
      grad.addColorStop(0, preset.style === 'interior' ? '#854d0e' : preset.style === 'nature' ? '#0284c7' : '#ec4899');
      grad.addColorStop(1, '#0f172a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 400, 200);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(preset.name, 20, 100);
    }

    setReferenceImages((prev) => [
      ...prev,
      {
        id: `ref_sample_${preset.id}_${Date.now()}`,
        name: preset.name,
        preview: c.toDataURL('image/png'),
      },
    ]);

    // Supplement prompt if empty or brief
    if (!prompt.includes(preset.promptSnippet)) {
      setPrompt((prev) => `${prev}, guided by ${preset.promptSnippet}`);
    }
  };

  const handleRemoveReference = (id: string) => {
    setReferenceImages((prev) => prev.filter((r) => r.id !== id));
  };

  const handleGenerate = async () => {
    // 1. Account status check
    const user = getCurrentUser();
    if (user.status === 'suspended') {
      setApiError('您的账户当前已被管理员封禁挂起，无法使用 AI 全景图生成服务。请联系系统管理员。');
      return;
    }

    // 2. Check credit balance before firing requests
    if (user.creditsBalance < creditsCost) {
      setApiError(
        `账户全景图积分不足！生成 ${resolution} 全景图需要 ${creditsCost} 积分，但您的账号 (${user.name}) 当前仅有 ${user.creditsBalance} 积分。请升级会员套餐或充值积分。`
      );
      return;
    }

    // 3. Check execution pipeline availability
    const pipeline = getModelExecutionPipeline();
    if (pipeline.endpoints.length === 0) {
      setApiError(
        '当前无可用 AI 生图模型端点（所有端点均已被管理员停用，或指定的主模型未启用）。请前往管理员控制台检查并启用模型端点。'
      );
      return;
    }

    setIsGenerating(true);
    setApiError(null);
    setGenerationProgress(15);
    let progressTimer: ReturnType<typeof setInterval> | null = null;

    try {
      setGenerationProgress(25);
      const styleObj = STYLE_PRESETS.find((s) => s.id === selectedStyle);

      let promptWithRefs = prompt;
      if (referenceImages.length > 0) {
        promptWithRefs += `, matched reference style palette and lighting from [${referenceImages.map((r) => r.name).join(', ')}]`;
      }

      const fullPrompt = buildPanoramaPrompt(promptWithRefs, styleObj?.promptSuffix || '');

      setGenerationProgress(45);
      progressTimer = setInterval(() => {
        setGenerationProgress((p) => (p < 85 ? p + 8 : p));
      }, 500);

      // Attempt AI image generation across execution pipeline (Single, Failover, or Round-Robin)
      let rawGenUrl: string | null = null;
      let usedEndpointName = '';
      let hadFailover = false;
      const failedAttempts: Array<{ endpoint: string; error: string }> = [];

      for (let i = 0; i < pipeline.endpoints.length; i++) {
        const ep = pipeline.endpoints[i];
        try {
          const modelConfig: GeminiConfig = {
            baseUrl: ep.baseUrl,
            apiKey: ep.apiKey,
            model: ep.model,
          };
          const refPreviews = referenceImages.map((r) => r.preview);
          rawGenUrl = await generateWithGemini(fullPrompt, modelConfig, refPreviews);
          usedEndpointName = ep.name;
          if (i > 0) {
            hadFailover = true;
          }
          break; // Succeeded! Stop trying further models
        } catch (callErr) {
          const errMessage = callErr instanceof Error ? callErr.message : String(callErr);
          failedAttempts.push({ endpoint: ep.name, error: errMessage });

          // If in strict single model mode, immediately fail without fallback
          if (pipeline.mode === 'single') {
            throw new Error(`[单模型模式锁定] ${ep.name} 调用失败：${errMessage}`);
          }
          // In failover or round-robin mode, seamlessly try next configured fallback model
        }
      }

      if (!rawGenUrl) {
        // All configured models failed: NEVER mock AI output with procedural graphics, NEVER deduct credits!
        const detailLogs = failedAttempts
          .map((f) => `• ${f.endpoint}: ${f.error}`)
          .join('\n');
        throw new Error(
          `所有已配置的大模型端点均调用失败，本次生成未扣除任何积分。\n失败详情：\n${detailLogs}`
        );
      }

      setOriginalRawUrl(rawGenUrl);

      // Client-side super-resolution, sharpening & seam healing
      let finalDataUrl = rawGenUrl;
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        finalDataUrl = await new Promise<string>((resolve) => {
          img.onload = () => {
            let canvas: HTMLCanvasElement;
            if (resolution === '4K') {
              canvas = enhanceAndUpscalePanorama(img, {
                scaleFactor: 2,
                sharpness: 0.8,
                contrastBoost: 1.1,
              });
            } else if (resolution === '2K') {
              canvas = enhanceAndUpscalePanorama(img, {
                scaleFactor: 1,
                sharpness: 0.6,
                contrastBoost: 1.05,
              });
            } else {
              canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth || img.width;
              canvas.height = img.naturalHeight || img.height;
              const ctx = canvas.getContext('2d');
              if (ctx) ctx.drawImage(img, 0, 0);
            }

            const healed = seamCorrection ? healPanoramaSeam(canvas, 160) : canvas;
            resolve(healed.toDataURL('image/png'));
          };
          img.onerror = () => resolve(rawGenUrl!);
          img.src = rawGenUrl!;
        });
      } catch {
        finalDataUrl = rawGenUrl;
      }

      if (finalDataUrl !== rawGenUrl) {
        setEnhanced4kUrl(finalDataUrl);
      } else {
        setEnhanced4kUrl(null);
      }

      setGenerationProgress(95);
      onPanoramaChange(finalDataUrl);

      // Deduct user credits upon generation success
      const deductRes = deductCurrentUserCredits(creditsCost);
      if (deductRes.success) {
        setCurrentUser(getCurrentUser());
        const toastNotice = hadFailover
          ? `主模型额度耗尽或异常，已自动切换至备用模型 [${usedEndpointName}] 生成成功！已扣除 ${creditsCost} 积分。`
          : `360° 全景图通过 [${usedEndpointName}] 生成成功！扣除 ${creditsCost} 积分（剩余 ${deductRes.remaining} 积分）。`;
        setFeedbackNotice(toastNotice);
        setTimeout(() => setFeedbackNotice(null), 5000);
      }

      setGenerationProgress(100);
      setIsGenerating(false);

      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.8 },
      });
    } catch (err: unknown) {
      setIsGenerating(false);
      const errMsg = err instanceof Error ? err.message : '未知生图错误';
      setApiError(errMsg);
    } finally {
      if (progressTimer) {
        clearInterval(progressTimer);
      }
    }
  };

  const handleDownloadPng = () => {
    const a = document.createElement('a');
    a.href = currentPanoramaUrl;
    a.download = `360-panorama-${selectedStyle}-${resolution}-${Date.now()}.png`;
    a.click();
  };

  const handleExportHdr = () => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const hdrBlob = exportCanvasToHdrBlob(canvas);
        const url = URL.createObjectURL(hdrBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `360-environment-${selectedStyle}.hdr`;
        a.click();
        URL.revokeObjectURL(url);
      }
    };
    img.src = currentPanoramaUrl;
  };

  const handleDownloadVrJpg = () => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const vrBlob = await exportVrReadyJpegBlob(canvas, 0.95);
        const url = URL.createObjectURL(vrBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `360-vr-photosphere-${selectedStyle}-${resolution}-${Date.now()}.jpg`;
        a.click();
        URL.revokeObjectURL(url);
      }
    };
    img.src = currentPanoramaUrl;
  };

  const handleEnhancePrompt = () => {
    if (!prompt.trim()) {
      const random = QUICK_TRY_CHIPS[Math.floor(Math.random() * QUICK_TRY_CHIPS.length)];
      setPrompt(random.prompt);
      setSelectedStyle(random.style);
      return;
    }
    const enhancements = [
      'continuous 360 degree equirectangular horizon, 8k resolution, seamless horizontal loop, photorealistic lighting, balanced zenith and nadir',
      'unreal engine 5 lumen lighting, 360 vr spherical skybox, ultra detailed architectural textures, golden hour volumetric atmosphere',
      'equirectangular projection 2:1 ratio, vibrant color grading, sharp specular highlights, high dynamic range skybox environment',
      'seamless 360 pano wrapping, hyper-detailed volumetric clouds, raytraced atmospheric haze, ultra-sharp horizon line',
    ];
    const picked = enhancements[Math.floor(Math.random() * enhancements.length)];
    if (!prompt.toLowerCase().includes('equirectangular')) {
      setPrompt(`${prompt.trim()}, ${picked}`);
    } else {
      setPrompt(`${prompt.trim()}, cinematic volumetric lighting, 8k ultra-sharp detail`);
    }
  };

  const handleManualHealSeam = () => {
    if (!originalRawUrl) {
      setOriginalRawUrl(currentPanoramaUrl);
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const healed = healPanoramaSeam(canvas, 160);
        onPanoramaChange(healed.toDataURL('image/png'));
        setFeedbackNotice('360° boundary seam healed successfully! Click "Restore Original" anytime to undo.');
        confetti({ particleCount: 35, spread: 55, origin: { y: 0.7 } });
        setTimeout(() => setFeedbackNotice(null), 3500);
      }
    };
    img.src = currentPanoramaUrl;
  };

  const handleEnhanceClarity = () => {
    // If enhanced version is already cached and user is viewing the original, instant toggle!
    if (enhanced4kUrl && currentPanoramaUrl === originalRawUrl) {
      onPanoramaChange(enhanced4kUrl);
      setFeedbackNotice('Switched back to 4K Ultra clarity version.');
      setTimeout(() => setFeedbackNotice(null), 3000);
      return;
    }

    if (!originalRawUrl) {
      setOriginalRawUrl(currentPanoramaUrl);
    }
    setIsUpscalingClarity(true);
    setTimeout(() => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const enhancedCanvas = enhanceAndUpscalePanorama(img, {
          scaleFactor: 2,
          sharpness: 0.8,
          contrastBoost: 1.1,
        });
        const healed = healPanoramaSeam(enhancedCanvas, 160);
        const enhancedDataUrl = healed.toDataURL('image/png');
        setEnhanced4kUrl(enhancedDataUrl);
        onPanoramaChange(enhancedDataUrl);
        setIsUpscalingClarity(false);
        setFeedbackNotice('4K Super-Resolution clarity enhancement applied! Click "Restore Original" anytime to undo.');
        confetti({ particleCount: 45, spread: 60, origin: { y: 0.7 } });
        setTimeout(() => setFeedbackNotice(null), 4000);
      };
      img.onerror = () => setIsUpscalingClarity(false);
      img.src = currentPanoramaUrl;
    }, 80);
  };

  const handleRestoreOriginal = () => {
    if (originalRawUrl) {
      onPanoramaChange(originalRawUrl);
      setFeedbackNotice('Restored to original pre-enhancement panorama.');
      setTimeout(() => setFeedbackNotice(null), 3500);
    }
  };

  return (
    <div className="studio-generator space-y-12">
      {/* =========================================================================
          HERO BANNER & VALUE PROP (Benchmarked from panoramagenerator.com)
      ========================================================================= */}
      <div className="studio-hero text-center max-w-4xl mx-auto pt-2 pb-6">
        <div className="studio-eyebrow" aria-hidden="true">
          <span className="studio-coordinate">360° / CREATIVE WORKSPACE</span>
          <span className="studio-orbit-mark">◎</span>
          <span className="studio-coordinate">IMAGINE BEYOND THE FRAME</span>
        </div>
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/15 border border-cyan-400/35 text-cyan-200 text-xs font-semibold mb-4 shadow-sm backdrop-blur-md">
          <span className="flex items-center text-amber-400 gap-0.5">
            <Star className="w-3.5 h-3.5 fill-current" />
            <span className="font-bold">4.9 / 5</span>
          </span>
          <span className="text-cyan-500">•</span>
          <span>Trusted by 38,000+ 3D Artists, Architects &amp; VR Developers</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
          AI 360° Panorama Generator
        </h1>
        <p className="text-base sm:text-lg text-cyan-200/80 mt-3 max-w-2xl mx-auto leading-relaxed">
          Turn text prompts or reference photos into seamless, VR-ready 2:1 equirectangular panoramas in seconds. Free to try — no credit card required.
        </p>
      </div>

      {/* =========================================================================
          STUDIO INTERACTIVE WORKBENCH (2 Columns: Controls & 360 Viewport)
      ========================================================================= */}
      <div id="studio-generator-workbench" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start relative">
        {/* =========================================================================
            LEFT COLUMN: GENERATOR CONTROLS (Benchmarked from panoramagenerator.com)
        ========================================================================= */}
        <div className="lg:col-span-5 space-y-5 glass-panel rounded-3xl p-6 relative overflow-hidden shadow-[0_16px_50px_rgba(0,0,0,0.6)]">
          {/* Subtle decorative glow */}
          <div className="absolute top-0 right-0 w-52 h-52 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />

          {/* Mode Switcher Tabs (Text Prompt vs Image to Pano) */}
          <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3 relative z-10">
            <div className="flex items-center gap-1 bg-[#020b18] p-1 border border-cyan-500/25 rounded-2xl">
              <button
                type="button"
                onClick={() => handleModeChange('text')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  inputMode === 'text'
                    ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-md shadow-cyan-500/30'
                    : 'text-cyan-200/70 hover:text-white'
                }`}
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Text Prompt</span>
              </button>

              <button
                type="button"
                onClick={() => handleModeChange('image')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  inputMode === 'image'
                    ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-md shadow-cyan-500/30'
                    : 'text-cyan-200/70 hover:text-white'
                }`}
              >
                <ImagePlus className="w-3.5 h-3.5" />
                <span>Image to Pano</span>
                {referenceImages.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-cyan-400 text-slate-950 text-[10px] font-black flex items-center justify-center">
                    {referenceImages.length}
                  </span>
                )}
              </button>
            </div>

            <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-cyan-300 bg-cyan-950/60 px-2.5 py-1 rounded-full border border-cyan-500/30">
              <Coins className="w-3 h-3 text-amber-400" />
              <span>{creditsCost} credits</span>
            </div>
          </div>

          {/* Mode 2: Image to Pano Reference Photo Upload Box */}
          {inputMode === 'image' && (
            <div id="reference-uploader" className="space-y-3 bg-[#020b1c]/80 border border-cyan-500/25 p-4 rounded-2xl relative z-10 animate-fade-in transition-all">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <ImagePlus className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Attach Reference Photos (Up to 3)</span>
                </span>
                <span className="text-[10px] text-cyan-300/70">
                  {referenceImages.length} / 3 Attached
                </span>
              </div>
              <p className="text-[11px] text-cyan-200/70 leading-relaxed">
                Reference photos guide style, materials, lighting atmosphere, and color palette. Images are injected directly for vision-capable models, with automatic semantic prompt fallback for text-only endpoints.
              </p>

              {/* Upload Drop Area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-cyan-500/30 hover:border-cyan-400/60 rounded-xl p-3 text-center cursor-pointer bg-cyan-950/20 hover:bg-cyan-950/40 transition-colors"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Upload className="w-5 h-5 text-cyan-400 mx-auto mb-1 opacity-80" />
                <span className="text-xs font-semibold text-cyan-200">
                  Click or drag photos here (Max 3)
                </span>
              </div>

              {/* Reference Image Previews */}
              {referenceImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {referenceImages.map((refImg) => (
                    <div key={refImg.id} className="relative rounded-xl overflow-hidden border border-cyan-500/30 group aspect-video bg-black">
                      <img src={refImg.preview} alt={refImg.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveReference(refImg.id)}
                          className="p-1 rounded-full bg-red-500/80 hover:bg-red-500 text-white cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[9px] text-cyan-200 font-mono truncate px-1 py-0.5">
                        {refImg.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Preset Reference Chips */}
              <div className="pt-2 border-t border-cyan-500/15">
                <span className="text-[10px] text-cyan-400/80 uppercase font-mono font-bold block mb-1.5">
                  Try Sample References:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLE_REFERENCE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleAddSampleReference(preset)}
                      className="px-2 py-1 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/25 rounded-lg text-[11px] text-cyan-200 hover:text-white transition-colors cursor-pointer"
                    >
                      + {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Prompt Description Input */}
          <div className="space-y-2 relative z-10">
            <div className="flex items-center justify-between">
              <label htmlFor="prompt-input" className="text-xs font-bold text-cyan-100">
                Scene Description
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleEnhancePrompt}
                  className="text-[11px] text-teal-300 hover:text-white flex items-center gap-1 px-2.5 py-1 rounded-xl bg-teal-500/15 border border-teal-500/30 hover:border-teal-400 transition-all cursor-pointer font-semibold active:scale-95 shadow-sm"
                  title="Enhance prompt with 360° equirectangular VR keywords"
                >
                  <Sparkles className="w-3 h-3 text-teal-400" />
                  <span>Enhance with AI</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const random = QUICK_TRY_CHIPS[Math.floor(Math.random() * QUICK_TRY_CHIPS.length)];
                    setPrompt(random.prompt);
                    setSelectedStyle(random.style);
                  }}
                  className="text-[11px] text-cyan-300 hover:text-white flex items-center gap-1 px-2.5 py-1 rounded-xl bg-cyan-500/15 border border-cyan-500/30 hover:border-cyan-400 transition-all cursor-pointer font-semibold active:scale-95 shadow-sm"
                  title="Pick a random high-quality prompt"
                >
                  <RefreshCw className="w-3 h-3 text-cyan-400" />
                  <span>Surprise Me</span>
                </button>
              </div>
            </div>
            <textarea
              id="prompt-input"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the 360° environment you want to generate (e.g. futuristic cyberpunk city at night with neon reflections, alpine mountain lake at sunrise, sci-fi orbital space station)..."
              className="w-full px-4 py-3 bg-[#030c1c]/90 border border-cyan-500/25 rounded-2xl text-sm text-cyan-100 placeholder-cyan-500/40 focus:outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/20 transition-all resize-none shadow-inner"
            />
          </div>

          {/* 360° Prompt Studio (Keyword Helper) */}
          <div className="relative z-10 bg-[#020917]/90 border border-cyan-500/20 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-100 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>360° Prompt Studio</span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 bg-teal-400/20 text-teal-300 rounded">
                  Keyword Helper
                </span>
              </span>
              <button
                type="button"
                onClick={() => setShowPromptBuilder((prev) => !prev)}
                className="text-[11px] text-cyan-400 hover:text-cyan-200 font-semibold cursor-pointer underline"
              >
                {showPromptBuilder ? 'Hide Keywords' : 'Show Keywords'}
              </button>
            </div>

            {showPromptBuilder && (
              <div className="space-y-2 pt-1.5 border-t border-cyan-500/15 animate-in fade-in duration-150">
                {PROMPT_BUILDER_CATEGORIES.map((cat, idx) => (
                  <div key={idx} className="space-y-1">
                    <span className="text-[10px] uppercase font-mono font-bold text-cyan-400/70 block">
                      {cat.name}:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {cat.tags.map((tag, tIdx) => (
                        <button
                          key={tIdx}
                          type="button"
                          onClick={() => handleAppendTag(tag)}
                          className="px-2 py-0.5 bg-cyan-950/70 hover:bg-cyan-900/80 border border-cyan-500/20 hover:border-cyan-400 text-cyan-200 hover:text-white rounded-lg text-[10px] font-medium transition-all cursor-pointer active:scale-95"
                        >
                          + {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick "Try:" Chips (Benchmarked directly from panoramagenerator.com) */}
          <div className="relative z-10">
            <span className="text-[10px] text-cyan-400/80 uppercase font-mono font-bold block mb-1.5">
              Try Prompts:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TRY_CHIPS.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setPrompt(chip.prompt);
                    setSelectedStyle(chip.style);
                  }}
                  className="px-2.5 py-1 bg-cyan-950/40 hover:bg-cyan-900/70 border border-cyan-500/20 hover:border-cyan-400/50 rounded-xl text-[11px] text-cyan-200 hover:text-white transition-all cursor-pointer font-medium"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Style Presets Grid */}
          <div className="space-y-2 relative z-10">
            <label className="text-xs font-bold text-cyan-100">Environment Style</label>
            <div className="grid grid-cols-2 gap-2">
              {STYLE_PRESETS.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setSelectedStyle(style.id)}
                  className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden group active:scale-[0.97] ${
                    selectedStyle === style.id
                      ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-[0_0_20px_rgba(0,242,254,0.35)]'
                      : 'bg-[#030c1c]/60 border-cyan-500/15 text-cyan-200/60 hover:border-cyan-400/40 hover:text-cyan-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-bold">{style.name}</span>
                    <div
                      className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${style.previewColor} shadow-sm group-hover:scale-110 transition-transform`}
                    />
                  </div>
                  <p className="text-[10px] text-cyan-300/60 truncate">{style.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Resolution & Seam Correction Matrix */}
          <div className="grid grid-cols-2 gap-3 pt-1 relative z-10">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-cyan-100">Image Size</label>
              <div className="flex items-center gap-1 bg-[#030c1c] p-1 border border-cyan-500/20 rounded-xl">
                {(['1K', '2K', '4K'] as ResolutionTier[]).map((res) => (
                  <button
                    key={res}
                    type="button"
                    onClick={() => setResolution(res)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                      resolution === res
                        ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-md shadow-cyan-400/30'
                        : 'text-cyan-300/60 hover:text-white'
                    }`}
                  >
                    {res}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-cyan-100">360° Seam Blending</label>
              <button
                type="button"
                onClick={() => setSeamCorrection((prev) => !prev)}
                className={`w-full py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                  seamCorrection
                    ? 'bg-teal-500/15 border-teal-400/60 text-teal-300 shadow-[0_0_15px_rgba(13,242,201,0.2)]'
                    : 'bg-[#030c1c] border-cyan-500/20 text-cyan-400/60 hover:text-cyan-200'
                }`}
              >
                <span>Symmetric Seam Healing</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-300" />
              </button>
            </div>
          </div>

          {/* API Error Notice */}
          {apiError && (
            <div className="p-3 bg-red-950/60 border border-red-500/50 rounded-2xl text-xs text-red-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold">Generation Notice:</p>
                <p className="text-[11px] text-red-300 break-all">{apiError}</p>
                {apiError.includes('Insufficient credit') && (
                  <button
                    type="button"
                    onClick={() => setIsCheckoutOpen(true)}
                    className="mt-2 px-3 py-1.5 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-cyan-500/25"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span>Top Up Credits or Upgrade Plan Now →</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Active User Account & Balance Bar */}
          <div className="flex items-center justify-between text-[11px] text-cyan-300/80 px-1 pt-1">
            <span className="flex items-center gap-1">
              <span>Account:</span>
              <strong className="text-white">{currentUser.name}</strong>
              <span className="uppercase text-[9px] px-1.5 py-0.2 bg-cyan-400/20 text-cyan-300 rounded font-bold font-mono">
                {currentUser.plan}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setIsCheckoutOpen(true)}
              className="text-amber-300 hover:text-white font-mono flex items-center gap-1 cursor-pointer"
            >
              <Coins className="w-3 h-3 text-amber-400" />
              <span>{currentUser.creditsBalance} credits left</span>
            </button>
          </div>

          {/* Primary Generate Button (Benchmarked from panoramagenerator.com) */}
          <div className="pt-2 relative z-10">
            <button
              type="button"
              disabled={isGenerating}
              onClick={handleGenerate}
              className="shimmer-btn w-full py-4 bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-black text-sm rounded-2xl shadow-xl shadow-cyan-400/35 hover:shadow-cyan-400/60 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer tracking-wide"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  <span>
                    Generating ({generationProgress}%) — {generationProgress < 40 ? 'Synthesizing scene...' : generationProgress < 75 ? 'Healing seams...' : 'Finishing 3D mapping...'}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 fill-current text-slate-950" />
                  <span>Generate ({creditsCost} Credits)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* =========================================================================
            RIGHT COLUMN: INTERACTIVE 360 WEBGL VIEWPORT & EXPORT BAR
        ========================================================================= */}
        <div className="lg:col-span-7 space-y-4">
          {/* WebGL 3D Sphere Container with cinematic frame */}
          <div className="glass-panel border border-cyan-500/30 rounded-3xl overflow-hidden shadow-[0_25px_60px_rgba(0,10,30,0.8)]">
            <div className="px-5 py-3.5 bg-[#030e20]/90 border-b border-cyan-500/20 flex flex-wrap items-center justify-between gap-2 text-xs text-cyan-200">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#00F2FE]" />
                <span className="font-bold text-white tracking-wide">Live 360° Sphere Viewport</span>
                <span className="text-cyan-400/60 hidden sm:inline">| Drag to look around, scroll to zoom</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Restore Original Button */}
                {originalRawUrl && originalRawUrl !== currentPanoramaUrl && (
                  <button
                    type="button"
                    onClick={handleRestoreOriginal}
                    className="flex items-center gap-1.5 text-[11px] text-amber-300 hover:text-white bg-amber-500/15 hover:bg-amber-500/25 px-2.5 py-1 rounded-full border border-amber-500/35 transition-all cursor-pointer font-bold active:scale-95 shadow-sm animate-in fade-in"
                    title="Revert enhancements and restore original pre-4K panorama"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Restore Original</span>
                  </button>
                )}

                {/* 4K Enhanced Badge */}
                {enhanced4kUrl && currentPanoramaUrl === enhanced4kUrl && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-400/20 text-cyan-200 border border-cyan-400/40 font-mono font-bold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-cyan-300" />
                    <span>4K Ultra</span>
                  </span>
                )}

                <button
                  type="button"
                  disabled={isUpscalingClarity}
                  onClick={handleEnhanceClarity}
                  className="flex items-center gap-1.5 text-[11px] text-cyan-300 hover:text-white bg-cyan-500/15 hover:bg-cyan-500/25 px-2.5 py-1 rounded-full border border-cyan-500/30 transition-all cursor-pointer font-semibold active:scale-95 shadow-sm disabled:opacity-50"
                  title="Apply 4K super-resolution reconstruction and unsharp mask sharpening"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>
                    {isUpscalingClarity
                      ? 'Enhancing...'
                      : enhanced4kUrl && currentPanoramaUrl === originalRawUrl
                      ? 'Apply 4K Enhanced'
                      : 'Enhance 4K Clarity'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleManualHealSeam}
                  className="flex items-center gap-1.5 text-[11px] text-teal-300 hover:text-white bg-teal-500/15 hover:bg-teal-500/25 px-2.5 py-1 rounded-full border border-teal-500/30 transition-all cursor-pointer font-semibold active:scale-95 shadow-sm"
                  title="Run 160px multi-band seam alignment on current panorama"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                  <span>Heal Seam</span>
                </button>
                <div className="flex items-center gap-2 text-[11px] text-cyan-300 bg-cyan-950/60 px-2.5 py-1 rounded-full border border-cyan-500/30">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  <span>FOV: 75° (Interactive)</span>
                </div>
              </div>
            </div>

            {/* Feedback notification toast */}
            {feedbackNotice && (
              <div className="px-5 py-2 bg-gradient-to-r from-cyan-950/90 via-blue-950/90 to-cyan-950/90 border-b border-cyan-500/30 flex items-center justify-between text-xs text-cyan-200 animate-in fade-in duration-150">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <span className="font-medium text-white">{feedbackNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFeedbackNotice(null)}
                  className="text-cyan-400 hover:text-white text-xs px-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="h-[490px] w-full relative bg-[#020712]">
              <SphereViewer textureUrl={currentPanoramaUrl} className="w-full h-full" />
            </div>
          </div>

          {/* Multi-Format Export Action Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            <button
              type="button"
              onClick={handleDownloadPng}
              className="glass-card p-3.5 rounded-2xl text-left cursor-pointer group hover:border-cyan-400/50 transition-all"
            >
              <div className="flex items-center justify-between mb-2 text-cyan-400 group-hover:text-cyan-300">
                <div className="p-1.5 bg-cyan-500/15 rounded-lg group-hover:scale-110 transition-transform">
                  <Download className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-300 font-bold border border-cyan-500/20">
                  PNG
                </span>
              </div>
              <div className="text-xs font-bold text-white">Download PNG</div>
              <div className="text-[10px] text-cyan-300/60 mt-0.5">2:1 Equirectangular</div>
            </button>

            <button
              type="button"
              onClick={handleDownloadVrJpg}
              className="glass-card p-3.5 rounded-2xl text-left cursor-pointer group hover:border-blue-400/50 transition-all"
            >
              <div className="flex items-center justify-between mb-2 text-blue-400 group-hover:text-blue-300">
                <div className="p-1.5 bg-blue-500/15 rounded-lg group-hover:scale-110 transition-transform">
                  <Download className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 font-bold border border-blue-500/20">
                  VR JPG
                </span>
              </div>
              <div className="text-xs font-bold text-white">Download VR JPG</div>
              <div className="text-[10px] text-cyan-300/60 mt-0.5">PhotoSphere XMP Tagged</div>
            </button>

            <button
              type="button"
              onClick={handleExportHdr}
              className="glass-card p-3.5 rounded-2xl text-left cursor-pointer group hover:border-amber-400/50 transition-all"
            >
              <div className="flex items-center justify-between mb-2 text-amber-400 group-hover:text-amber-300">
                <div className="p-1.5 bg-amber-500/15 rounded-lg group-hover:scale-110 transition-transform">
                  <FileCode2 className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 font-bold border border-amber-500/20">
                  .HDR
                </span>
              </div>
              <div className="text-xs font-bold text-white">Export .HDR</div>
              <div className="text-[10px] text-cyan-300/60 mt-0.5">For Blender &amp; Unreal</div>
            </button>

            <button
              type="button"
              onClick={() => setIsVideoModalOpen(true)}
              className="glass-card p-3.5 rounded-2xl text-left cursor-pointer group hover:border-purple-400/50 transition-all"
            >
              <div className="flex items-center justify-between mb-2 text-purple-400 group-hover:text-purple-300">
                <div className="p-1.5 bg-purple-500/15 rounded-lg group-hover:scale-110 transition-transform">
                  <Film className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 font-bold border border-purple-500/20">
                  MP4
                </span>
              </div>
              <div className="text-xs font-bold text-white">Export Video</div>
              <div className="text-[10px] text-cyan-300/60 mt-0.5">360° Orbit Animation</div>
            </button>

            <button
              type="button"
              onClick={() => setIsEmbedModalOpen(true)}
              className="glass-card p-3.5 rounded-2xl text-left cursor-pointer group hover:border-pink-400/50 transition-all"
            >
              <div className="flex items-center justify-between mb-2 text-pink-400 group-hover:text-pink-300">
                <div className="p-1.5 bg-pink-500/15 rounded-lg group-hover:scale-110 transition-transform">
                  <Code2 className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-pink-950/60 text-pink-300 font-bold border border-pink-500/20">
                  IFRAME
                </span>
              </div>
              <div className="text-xs font-bold text-white">Embed on Web</div>
              <div className="text-[10px] text-cyan-300/60 mt-0.5">Interactive 3D Sphere</div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab('cubemap')}
              className="glass-card p-3.5 rounded-2xl text-left cursor-pointer group hover:border-teal-400/50 transition-all"
            >
              <div className="flex items-center justify-between mb-2 text-teal-400 group-hover:text-teal-300">
                <div className="p-1.5 bg-teal-500/15 rounded-lg group-hover:scale-110 transition-transform">
                  <Box className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-950/60 text-teal-300 font-bold border border-teal-500/20">
                  6 Faces
                </span>
              </div>
              <div className="text-xs font-bold text-white">Cubemap Slices</div>
              <div className="text-[10px] text-cyan-300/60 mt-0.5">For Unity Skybox</div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab('globe')}
              className="glass-card p-3.5 rounded-2xl text-left cursor-pointer group hover:border-emerald-400/50 transition-all"
            >
              <div className="flex items-center justify-between mb-2 text-emerald-400 group-hover:text-emerald-300">
                <div className="p-1.5 bg-emerald-500/15 rounded-lg group-hover:scale-110 transition-transform">
                  <Globe2 className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 font-bold border border-emerald-500/20">
                  3D
                </span>
              </div>
              <div className="text-xs font-bold text-white">3D Globe</div>
              <div className="text-[10px] text-cyan-300/60 mt-0.5">Planetary Orbit Simulator</div>
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          COMMERCIAL BENCHMARK SECTIONS (Benchmarked from panoramagenerator.com)
      ========================================================================= */}
      
      {/* 1. Community Showcase Gallery */}
      <ShowcaseGallery
        onSelectPanorama={(url, newPrompt, style) => {
          onPanoramaChange(url);
          setPrompt(newPrompt);
          setSelectedStyle(style);
        }}
      />

      {/* 2. Built for VR-Ready Equirectangular Output (Feature Matrix) */}
      <FeatureMatrix />

      {/* 3. Proprietary Seam Healer Interactive Demo */}
      <SeamShowcase />

      {/* 4. AI Panorama Generation vs 360° Camera Capture (Comparison Table) */}
      <CameraComparison />

      {/* 5. How AI 360° Panorama Generation Works (4-Step Workflow) */}
      <HowItWorksSteps />

      {/* 6. Drop Straight into Your Production Stack (Game Engine Badges) */}
      <IntegrationBadges />

      {/* 7. Creator Stories & Global Metrics (Testimonials & Social Proof) */}
      <TestimonialsSection />

      {/* 8. Comprehensive FAQ Accordion */}
      <CommercialFaq />

      {/* 360 Photo-to-Video Animation Modal */}
      <PhotoToVideoModal
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        currentPanoramaUrl={currentPanoramaUrl}
      />

      {/* Embed 360 Viewer Modal */}
      <EmbedModal
        isOpen={isEmbedModalOpen}
        onClose={() => setIsEmbedModalOpen(false)}
        currentPanoramaUrl={currentPanoramaUrl}
      />

      {/* Commercial Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        initialPlan="pro"
        initialCycle="yearly"
        onSuccess={(u) => {
          setCurrentUser(u);
          setFeedbackNotice(`Account upgraded successfully! New balance: ${u.creditsBalance} credits.`);
          setTimeout(() => setFeedbackNotice(null), 4000);
        }}
      />
    </div>
  );
}
