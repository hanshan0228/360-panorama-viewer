import { MyWorks } from './commercial/MyWorks';
import { SharePanoramaModal } from './commercial/SharePanorama';
import { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Download,
  Box,
  Globe2,
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
  ArrowUpRight,
  Play,
  ShieldCheck,
  RotateCcw,
  Film,
  Code2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import type { ActiveTab, StylePreset, StylePresetId, ResolutionTier, ManagedUser, SystemBillingConfig } from '../types/panorama';
import { SphereViewer } from './SphereViewer';
import { HeroPanorama } from './HeroPanorama';
import { exportCanvasToHdrBlob } from '../utils/hdrExporter';
import {
  generateWithGemini,
  buildPanoramaPrompt,
  type GeminiConfig,
} from '../utils/geminiClient';
import { ShowcaseGallery } from './commercial/ShowcaseGallery';
import { FeatureMatrix } from './commercial/FeatureMatrix';
import { HowItWorksSteps } from './commercial/HowItWorksSteps';
import { IntegrationBadges } from './commercial/IntegrationBadges';
import coastalCover from '../assets/coastal-cover.png';
import { CommercialFaq } from './commercial/CommercialFaq';
import { PhotoToVideoModal } from './commercial/PhotoToVideoModal';
import { EmbedModal } from './commercial/EmbedModal';
import { exportVrReadyJpegBlob } from '../utils/xmpInjector';
import { healPanoramaSeam } from '../utils/seamHealer';
import { processPanoramaImage } from '../utils/panoramaProcessor';
import { inspectImageResolution, type ImageResolution } from '../utils/imageModelRequest.mjs';
import {
  getCurrentUser,
  deductCurrentUserCredits,
  getModelExecutionPipeline,
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
  currentUser: ManagedUser;
  billingConfig: SystemBillingConfig;
  onUserChange: (user: ManagedUser) => void;
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
  currentUser,
  billingConfig,
  onUserChange,
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

  const [resolution, setResolution] = useState<ResolutionTier>('4K');
  const [seamCorrection, setSeamCorrection] = useState<boolean | 'auto'>('auto');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState('');
  const [generationElapsed, setGenerationElapsed] = useState(0);
  const [generationTiming, setGenerationTiming] = useState<string | null>(null);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isWorksOpen, setIsWorksOpen] = useState(false);
  const [isEmbedModalOpen, setIsEmbedModalOpen] = useState(false);
  const [isPreviewActive, setIsPreviewActive] = useState(false);
  const [initialPanoramaUrl] = useState(currentPanoramaUrl);

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
  const generationRef = useRef({ mounted: false, request: 0, processing: null as AbortController | null });
  useEffect(() => {
    const generation = generationRef.current;
    generation.mounted = true;
    const invalidateGeneration = () => {
      generation.request++;
      generation.processing?.abort();
      setIsGenerating(false);
    };
    window.addEventListener('panorama-session-changed', invalidateGeneration);
    return () => {
      generation.mounted = false;
      generation.request++;
      generation.processing?.abort();
      window.removeEventListener('panorama-session-changed', invalidateGeneration);
    };
  }, [currentUser.id]);

  // Dynamic credit cost from admin billing configuration
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
    const user = currentUser;
    const sessionToken = typeof localStorage !== 'undefined' ? localStorage.getItem('panorama_server_user_token') : null;
    const request = ++generationRef.current.request;
    const isCurrentGeneration = () => generationRef.current.mounted
      && generationRef.current.request === request
      && getCurrentUser().id === user.id
      && localStorage.getItem('panorama_server_user_token') === sessionToken;
    if (!isCurrentGeneration()) return;
    if (user.status === 'suspended') {
      setApiError('This account is suspended. Contact support before generating images.');
      return;
    }

    // 2. Check credit balance before firing requests
    if (!sessionToken && user.creditsBalance < creditsCost) {
      setApiError(
        `Insufficient credits. A ${resolution} panorama costs ${creditsCost} credits; your account has ${user.creditsBalance}. View plans to add credits.`
      );
      return;
    }

    // 3. Check execution pipeline availability
    const pipeline = getModelExecutionPipeline();
    if (pipeline.endpoints.length === 0) {
      setApiError(
        'No image models are currently available. Please try again later or contact support.'
      );
      return;
    }

    setIsGenerating(true);
    setApiError(null);
    setGenerationStage('Preparing generation request');
    setGenerationElapsed(0);
    setGenerationTiming(null);
    const startedAt = performance.now();
    const elapsedTimer = setInterval(() => {
      if (isCurrentGeneration()) setGenerationElapsed(Math.floor((performance.now() - startedAt) / 1000));
    }, 1000);

    try {
      const styleObj = STYLE_PRESETS.find((s) => s.id === selectedStyle);

      let promptWithRefs = prompt;
      if (referenceImages.length > 0) {
        promptWithRefs += `, matched reference style palette and lighting from [${referenceImages.map((r) => r.name).join(', ')}]`;
      }

      const fullPrompt = buildPanoramaPrompt(promptWithRefs, styleObj?.promptSuffix || '');

      // Attempt AI image generation across execution pipeline (Single, Failover, or Round-Robin).
      // An undersized result only moves on to the next model when this attempt was confirmed fully
      // refunded (or runs without server billing), so resolution fallback never charges twice.
      let rawGenUrl: string | null = null;
      let usedEndpointName = '';
      let hadFailover = false;
      let serverRemaining: number | undefined = undefined;
      let serverCost: number | undefined = undefined;
      let serverRefunded = 0;
      let serverDeductedTotal = 0;
      let resultResolution: ImageResolution | undefined;
      let bestAttempt: { url: string; resolution: ImageResolution; endpointName: string; index: number; cost?: number; library?: { saved: boolean; error?: string } } | null = null;
      const failedAttempts: Array<{ endpoint: string; error: string }> = [];
      const attemptDetails: string[] = [];

      for (let i = 0; i < pipeline.endpoints.length; i++) {
        const ep = pipeline.endpoints[i];
        setGenerationStage(`Waiting for ${ep.name} and network response (${i + 1}/${pipeline.endpoints.length})`);
        const attemptStarted = performance.now();
        try {
          const modelConfig: GeminiConfig = {
            endpointId: ep.id,
            provider: ep.provider,
            baseUrl: ep.baseUrl,
            apiKey: ep.apiKey,
            model: ep.model,
            resolution,
            sessionToken,
          };
          const refPreviews = referenceImages.map((r) => r.preview);
          const genResult = await generateWithGemini(fullPrompt, modelConfig, refPreviews);
          if (!isCurrentGeneration()) return;
          if (sessionToken) window.dispatchEvent(new Event('panorama-user-refresh'));
          const attemptResolution = genResult.imageResolution ?? inspectImageResolution(genResult.imageUrl, resolution);
          const attemptRefunded = genResult.creditsRefunded ?? 0;
          attemptDetails.push(`${genResult.modelUsed || ep.model || ep.name}: ${attemptResolution.width ?? '?'}×${attemptResolution.height ?? '?'} (${attemptResolution.status}), ${((performance.now() - attemptStarted) / 1000).toFixed(1)} s${genResult.generationTiming ? ` [upstream wait ${(genResult.generationTiming.upstreamWaitMs / 1000).toFixed(1)} s; response transfer ${(genResult.generationTiming.upstreamBodyMs / 1000).toFixed(1)} s]` : ''}`);
          serverRefunded += attemptRefunded;
          if (typeof genResult.creditsDeducted === 'number') serverDeductedTotal += genResult.creditsDeducted;
          if (!bestAttempt || (attemptResolution.panoramaWidth ?? 0) > (bestAttempt.resolution.panoramaWidth ?? 0)) {
            bestAttempt = {
              url: genResult.imageUrl,
              resolution: attemptResolution,
              endpointName: ep.name,
              index: i,
              cost: genResult.creditsDeducted,
              library: genResult.library,
            };
          }
          if (typeof genResult.remainingCredits === 'number') {
            // Freshest server balance includes every attempt's deduction and refund so far.
            serverRemaining = genResult.remainingCredits;
          }
          const refundConfirmed = attemptRefunded > 0 && (genResult.creditsDeducted ?? 0) === 0;
          const hasNextModel = pipeline.mode !== 'single' && i < pipeline.endpoints.length - 1;
          if (attemptResolution.status === 'below-request' && hasNextModel && (!sessionToken || refundConfirmed)) {
            setGenerationStage(`${ep.name} returned ${attemptResolution.width}×${attemptResolution.height}, below the requested ${resolution} panorama; trying the next model`);
            continue;
          }
          break; // Succeeded (or no confirmed refund): stop trying further models
        } catch (callErr) {
          if (!isCurrentGeneration()) return;
          const errMessage = callErr instanceof Error ? callErr.message : String(callErr);
          failedAttempts.push({ endpoint: ep.model || ep.name, error: errMessage });
          attemptDetails.push(`${ep.model || ep.name}: failed after ${((performance.now() - attemptStarted) / 1000).toFixed(1)} s — ${errMessage}`);

          // If in strict single model mode, immediately fail without fallback
          if (pipeline.mode === 'single') {
            throw new Error(`[Single model] ${ep.name} failed: ${errMessage}`);
          }
          // In failover or round-robin mode, seamlessly try next configured fallback model
        }
      }

      if (bestAttempt) {
        rawGenUrl = bestAttempt.url;
        resultResolution = bestAttempt.resolution;
        serverCost = bestAttempt.cost;
        usedEndpointName = bestAttempt.endpointName;
        hadFailover = bestAttempt.index > 0;
      }

      if (!rawGenUrl) {
        // All configured models failed: NEVER mock AI output with procedural graphics, NEVER deduct credits!
        const detailLogs = failedAttempts
          .map((f) => `• ${f.endpoint}: ${f.error}`)
          .join('\n');
        throw new Error(
          `All configured image models failed.\nDetails:\n${detailLogs}`
        );
      }

      const attemptSummary = attemptDetails.join(' | ');
      try {
        // ponytail: keep only this account's latest attempt summary in the current tab; no prompts or image data.
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(`panorama-last-generation:${user.id}`,
          JSON.stringify({ timestamp: new Date().toISOString(), resolution, attempts: attemptDetails }));
      } catch { /* Storage denial must not discard a completed image. */ }
      const fallbackNotice = failedAttempts.length ? ` Other model attempts failed: ${failedAttempts.map(f => `${f.endpoint}: ${f.error}`).join('; ')}` : '';
      const modelElapsed = performance.now() - startedAt;
      setGenerationStage(seamCorrection ? 'Preparing native-detail panorama with optional seam blending' : 'Preparing native-detail panorama without stretching');
      let finalDataUrl = rawGenUrl;
      let processingFailed = false;
      const processing = new AbortController();
      generationRef.current.processing = processing;
      try {
        finalDataUrl = await processPanoramaImage(rawGenUrl, {
          resolution,
          preserveNative: true,
          sharpness: 0,
          contrastBoost: 1,
        }, seamCorrection, processing.signal);
      } catch {
        processingFailed = true;
        finalDataUrl = rawGenUrl;
      } finally {
        if (generationRef.current.processing === processing) generationRef.current.processing = null;
      }

      if (!isCurrentGeneration()) return;
      const processingElapsed = performance.now() - startedAt - modelElapsed;
      const originalSize = resultResolution?.width && resultResolution.height
        ? `Model original: ${resultResolution.width}×${resultResolution.height}`
        : 'Model original dimensions unverified';
      setGenerationTiming(`Requested: ${resolution} · ${originalSize} · Model/network (including failover): ${(modelElapsed / 1000).toFixed(1)} s · Image processing: ${(processingElapsed / 1000).toFixed(1)} s${processingFailed ? ' (processing failed; original image preserved)' : ''} · Attempts: ${attemptSummary}${bestAttempt?.library ? bestAttempt.library.saved ? ' · Saved privately in My works' : ` · NOT saved: ${bestAttempt.library.error}` : ''}`);
      setOriginalRawUrl(rawGenUrl);
      setEnhanced4kUrl(null);

      setGenerationStage('Updating panorama preview');
      if (isCurrentGeneration()) onPanoramaChange(finalDataUrl);
      if (!isCurrentGeneration()) return;

      // Synchronize credits upon generation success
      let deductSuccess = false;
      let remainingCredits = 0;

      if (sessionToken) {
        // Server-authoritative deduction already executed in /api/generate
        deductSuccess = true;
        remainingCredits = serverRemaining ?? getCurrentUser().creditsBalance;
      } else {
        // Direct local developer offline usage fallback
        const localRes = resultResolution?.status === 'below-request'
          ? { success: true, remaining: getCurrentUser().creditsBalance }
          : deductCurrentUserCredits(creditsCost);
        deductSuccess = localRes.success;
        remainingCredits = localRes.remaining;
        if (isCurrentGeneration()) onUserChange(getCurrentUser());
      }

      if (deductSuccess) {
        const updatedUser = getCurrentUser();
        // Prefer what the server actually netted across all attempts; serverCost only covers the kept attempt.
        const deductedCost = serverDeductedTotal > 0
          ? serverDeductedTotal
          : serverCost ?? (!sessionToken && resultResolution?.status === 'below-request' ? 0 : creditsCost);
        const isFreeExhausted = updatedUser.plan === 'free' && remainingCredits < deductedCost;
        const toastNotice = isFreeExhausted
          ? `You have ${remainingCredits} credits left, which is not enough for another generation at this resolution. View plans to add credits.`
          : hadFailover
          ? `Generated with fallback model ${usedEndpointName}. Used ${deductedCost} credits.`
          : `Panorama generated with ${usedEndpointName}. Used ${deductedCost} credits; ${remainingCredits} remaining.`;
        if (isCurrentGeneration()) setFeedbackNotice(toastNotice);
        if (!isFreeExhausted) {
          setTimeout(() => { if (isCurrentGeneration()) setFeedbackNotice(null); }, 5000);
        }
      }

      if (isCurrentGeneration()) setIsGenerating(false);

      if (resultResolution?.status === 'below-request') {
        // Each attempt's creditsDeducted is already net of its own refund, so the sum is the real charge.
        const netCharged = serverDeductedTotal;
        const billingNotice = serverRefunded > 0
          ? netCharged > 0
            ? `${serverRefunded} credits were returned, but fallback attempts still report ${netCharged} credits charged without a confirmed refund.`
            : `${serverRefunded} credits were returned; no generation credits were charged.`
          : sessionToken
          ? `The server reported ${serverCost ?? creditsCost} credits charged; no automatic refund was confirmed.`
          : 'No local credits were deducted.';
        setApiError(`The model returned ${resultResolution.width}×${resultResolution.height}; its 2:1 crop is ${resultResolution.panoramaWidth}×${resultResolution.panoramaHeight}, below the requested ${resolution} panorama (${resultResolution.targetWidth}×${resultResolution.targetHeight}). The image was retained without upscaling. ${billingNotice}${fallbackNotice}`);
        return;
      }

      if (!isCurrentGeneration()) return;
      if (fallbackNotice) setApiError(`A usable image was retained.${fallbackNotice}`);
      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.8 },
      });
    } catch (err: unknown) {
      if (!isCurrentGeneration()) return;
      setIsGenerating(false);
      setGenerationTiming(`Request failed after ${((performance.now() - startedAt) / 1000).toFixed(1)} s`);
      const errMsg = err instanceof Error ? err.message : 'Unknown image generation error';
      if (isCurrentGeneration()) setApiError(errMsg);
    } finally {
      clearInterval(elapsedTimer);
    }
  };

  const handleDownloadPng = () => {
    const a = document.createElement('a');
    a.href = currentPanoramaUrl;
    a.download = `360-panorama-${selectedStyle}-${Date.now()}.png`;
    a.click();
  };

  const handleDownloadOriginal = async () => {
    if (!originalRawUrl) return;
    try {
      const response = await fetch(originalRawUrl, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error('Original image download failed');
      const blob = await response.blob();
      const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[blob.type];
      if (!extension || !blob.size) throw new Error('Original image format is not supported');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `model-original-${Date.now()}.${extension}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setFeedbackNotice(error instanceof Error ? error.message : 'Original image download failed');
    }
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
    img.onerror = () => {
      setFeedbackNotice('HDR export failed: the current panorama could not be loaded.');
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
        a.download = `360-vr-photosphere-${selectedStyle}-${canvas.width}x${canvas.height}-${Date.now()}.jpg`;
        a.click();
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      setFeedbackNotice('VR JPEG export failed: the current panorama could not be loaded.');
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
        setFeedbackNotice('Seam blending applied. It can create ghosting when edges differ; use View Original to undo.');
        confetti({ particleCount: 35, spread: 55, origin: { y: 0.7 } });
        setTimeout(() => setFeedbackNotice(null), 3500);
      }
    };
    img.src = currentPanoramaUrl;
  };

  const handleEnhanceClarity = async () => {
    const request = ++generationRef.current.request;
    const processing = new AbortController();
    generationRef.current.processing?.abort();
    generationRef.current.processing = processing;
    setIsUpscalingClarity(true);
    try {
      const result = await processPanoramaImage(currentPanoramaUrl, {
        scaleFactor: 1, sharpness: 0.2, contrastBoost: 1,
      }, false, processing.signal);
      if (!generationRef.current.mounted || generationRef.current.request !== request || processing.signal.aborted) return;
      if (!originalRawUrl) setOriginalRawUrl(currentPanoramaUrl);
      setEnhanced4kUrl(result);
      onPanoramaChange(result);
      setFeedbackNotice('Light sharpening applied at the existing resolution. No upscaling or AI super-resolution.');
    } catch (error) {
      if (generationRef.current.mounted && generationRef.current.request === request && !processing.signal.aborted) {
        setFeedbackNotice(error instanceof Error ? error.message : 'Image sharpening failed');
      }
    } finally {
      if (generationRef.current.processing === processing) {
        generationRef.current.processing = null;
        if (generationRef.current.mounted) setIsUpscalingClarity(false);
      }
    }
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
      <section className="studio-hero" aria-labelledby="studio-hero-title">
        <img className="studio-hero-image" src={coastalCover} alt="" width={2560} height={1280} fetchPriority="high" />
        <HeroPanorama textureUrl={coastalCover} />
        <div className="studio-hero-content">
          <span className="studio-coordinate">AI 360° PANORAMA GENERATOR</span>
          <h1 id="studio-hero-title">Create a world.<br /><em>Not just an image.</em></h1>
          <p>From a few words to a new perspective. Create panoramic environments for your next game, virtual space, or creative escape.</p>
          <div className="studio-hero-actions">
            <button type="button" className="studio-primary-action" onClick={() => {
              const input = document.getElementById('prompt-input');
              input?.focus({ preventScroll: true });
              input?.scrollIntoView({ block: 'center' });
            }}>Start creating <ArrowUpRight aria-hidden="true" size={17} /></button>
            <button type="button" className="studio-secondary-action" onClick={() => {
              setIsPreviewActive(true);
              document.getElementById('studio-preview')?.scrollIntoView({ block: 'center' });
              document.getElementById('studio-preview')?.focus({ preventScroll: true });
            }}><Play aria-hidden="true" size={15} /> Try the 360° demo</button>
          </div>
          <span className="studio-hero-note">Free starter credits · No card required</span>
        </div>
        <div className="studio-hero-caption"><span>COASTAL STUDY <span>/ REAL 4K PANORAMA</span></span><span aria-hidden="true">↗ A DIFFERENT PERSPECTIVE</span></div>
      </section>

      <div className="studio-workbench-heading">
        <div><span className="studio-coordinate">THE WORKSPACE</span><h2>Make room for your next idea.</h2></div>
        <p>Your scene, your style. Start with a description.</p>
      </div>

      {/* =========================================================================
          STUDIO INTERACTIVE WORKBENCH (2 Columns: Controls & 360 Viewport)
      ========================================================================= */}
      <div id="studio-generator-workbench" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start relative">
        {/* =========================================================================
            LEFT COLUMN: GENERATOR CONTROLS (Benchmarked from panoramagenerator.com)
        ========================================================================= */}
        <div className="studio-controls lg:col-span-5 space-y-5 glass-panel rounded-3xl p-6 relative overflow-hidden shadow-[0_16px_50px_rgba(0,0,0,0.6)]">
          {/* Subtle decorative glow */}

          {/* Mode Switcher Tabs (Text Prompt vs Image to Pano) */}
          <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3 relative z-10">
            <div className="flex items-center gap-1 bg-[#020b18] p-1 border border-cyan-500/25 rounded-2xl">
              <button
                type="button"
                aria-pressed={inputMode === 'text'}
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
                aria-pressed={inputMode === 'image'}
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
                  <span>Add detail</span>
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
          <details className="studio-advanced relative z-10">
            <summary>
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Prompt keywords</span>
              </span>
            </summary>

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
          </details>

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
            <label htmlFor="environment-style" className="text-xs font-bold text-cyan-100">Environment style</label>
            <select id="environment-style" value={selectedStyle} onChange={event => setSelectedStyle(event.target.value as StylePresetId)} className="studio-style-select">
              {STYLE_PRESETS.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}
            </select>
            <p className="text-xs text-slate-400">{STYLE_PRESETS.find(style => style.id === selectedStyle)?.description}</p>
          </div>

          {/* Resolution & Seam Correction Matrix */}
          <div className="space-y-3 pt-1 relative z-10">
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-cyan-100">Requested resolution</span>
              <div role="group" aria-label="Requested resolution" className="flex items-center gap-1 bg-[#030c1c] p-1 border border-cyan-500/20 rounded-xl">
                {(['1K', '2K', '4K'] as ResolutionTier[]).map((res) => (
                  <button
                    key={res}
                    type="button"
                    aria-pressed={resolution === res}
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
              <p className="text-[10px] text-cyan-200/60">The provider may return fewer pixels. Check the actual dimensions after generation. Non-2:1 images are center-cropped, never upscaled.</p>
            </div>

            <details className="studio-advanced">
              <summary>Advanced: seam blending</summary>
              <div className="space-y-2 pt-3">
              <button
                type="button"
                aria-pressed={seamCorrection !== false}
                aria-label="Optional seam blending"
                title="Auto blends detected hard boundaries; On always blends; Off keeps the edges unchanged. May cause ghosting."
                onClick={() => setSeamCorrection((prev) => prev === 'auto' ? false : prev === false ? true : 'auto')}
                className={`w-full py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                  seamCorrection
                    ? 'bg-teal-500/15 border-teal-400/60 text-teal-300 shadow-[0_0_15px_rgba(13,242,201,0.2)]'
                    : 'bg-[#030c1c] border-cyan-500/20 text-cyan-400/60 hover:text-cyan-200'
                }`}
              >
                <span>{seamCorrection === 'auto' ? 'Blending: Auto (detect edge mismatch)' : seamCorrection ? 'Blending: On' : 'Blending: Off'}</span>
                {seamCorrection && <CheckCircle2 className="w-3.5 h-3.5 text-teal-300" />}
              </button>
              <p className="text-[10px] text-cyan-200/60">Auto detects and blends hard wrap boundaries. Smooth edges are preserved. Blending may cause ghosting and cannot reconstruct mismatched objects. The model original remains available.</p>
              </div>
            </details>
          </div>

          {/* API Error Notice */}
          {apiError && (
            <div role="alert" className="p-3 bg-red-950/60 border border-red-500/50 rounded-2xl text-xs text-red-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold">Generation Notice:</p>
                <p className="text-xs leading-relaxed text-red-200 break-words">{apiError}</p>
                {apiError.includes('Insufficient credit') && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab('pricing')}
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
              onClick={() => onNavigateTab('pricing')}
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
              disabled={isGenerating || isUpscalingClarity}
              onClick={handleGenerate}
              className="shimmer-btn w-full py-4 bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-black text-sm rounded-2xl shadow-xl shadow-cyan-400/35 hover:shadow-cyan-400/60 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer tracking-wide"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  <span>
                    Generating — {generationElapsed} s elapsed
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 fill-current text-slate-950" />
                  <span>Generate ({creditsCost} Credits)</span>
                </>
              )}
            </button>
            {isGenerating && (
              <p role="status" className="mt-2 text-xs text-cyan-200">{generationStage}</p>
            )}
            {generationTiming && (
              <p role="status" className="mt-2 text-xs text-slate-300">{generationTiming}</p>
            )}
          </div>
        </div>

        {/* =========================================================================
            RIGHT COLUMN: INTERACTIVE 360 WEBGL VIEWPORT & EXPORT BAR
        ========================================================================= */}
        <div className="studio-preview-column lg:col-span-7 space-y-4" id="studio-preview" tabIndex={-1}>
          {/* WebGL 3D Sphere Container with cinematic frame */}
          <div className="glass-panel border border-cyan-500/30 rounded-3xl overflow-hidden shadow-[0_25px_60px_rgba(0,10,30,0.8)]">
            <div className="studio-preview-toolbar px-5 py-3.5 bg-[#030e20]/90 border-b border-cyan-500/20 flex flex-wrap items-center justify-between gap-2 text-xs text-cyan-200">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#00F2FE]" />
                <span className="font-bold text-white tracking-wide">360° preview</span>
                <span className="text-cyan-400/60 hidden sm:inline">| Drag to look around, scroll to zoom</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {originalRawUrl && (
                  <button type="button" onClick={handleDownloadOriginal} className="text-[11px] text-cyan-200 underline cursor-pointer">
                    Download model original
                  </button>
                )}
                <button type="button" disabled={isGenerating} onClick={() => setIsWorksOpen(true)} className="rounded-xl border border-cyan-400/40 px-3 py-2 text-sm text-cyan-200">My works</button>
                <button type="button" disabled={isGenerating} onClick={() => setIsShareOpen(true)} className="rounded-xl border border-teal-400/40 bg-teal-400/10 px-3 py-2 text-sm font-semibold text-teal-200">Share panorama</button>
                {/* Restore Original Button */}
                {originalRawUrl && originalRawUrl !== currentPanoramaUrl && (
                  <button
                    type="button"
                    onClick={handleRestoreOriginal}
                    className="flex items-center gap-1.5 text-[11px] text-amber-300 hover:text-white bg-amber-500/15 hover:bg-amber-500/25 px-2.5 py-1 rounded-full border border-amber-500/35 transition-all cursor-pointer font-bold active:scale-95 shadow-sm animate-in fade-in"
                    disabled={isGenerating || isUpscalingClarity}
                    title="View the uncropped model original; a non-2:1 source may look stretched in the sphere viewer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                    <span>View Original</span>
                  </button>
                )}

                {/* 4K Enhanced Badge */}
                {enhanced4kUrl && currentPanoramaUrl === enhanced4kUrl && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-400/20 text-cyan-200 border border-cyan-400/40 font-mono font-bold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-cyan-300" />
                    <span>Lightly sharpened</span>
                  </span>
                )}

                <button
                  type="button"
                  disabled={isGenerating || isUpscalingClarity || currentPanoramaUrl === enhanced4kUrl}
                  onClick={handleEnhanceClarity}
                  className="flex items-center gap-1.5 text-[11px] text-cyan-300 hover:text-white bg-cyan-500/15 hover:bg-cyan-500/25 px-2.5 py-1 rounded-full border border-cyan-500/30 transition-all cursor-pointer font-semibold active:scale-95 shadow-sm disabled:opacity-50"
                  title="Light sharpening at the existing pixel dimensions; no upscaling or AI super-resolution"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>
                    {isUpscalingClarity
                      ? 'Enhancing...'
                      : 'Light sharpening'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleManualHealSeam}
                  disabled={isGenerating || isUpscalingClarity}
                  className="flex items-center gap-1.5 text-[11px] text-teal-300 hover:text-white bg-teal-500/15 hover:bg-teal-500/25 px-2.5 py-1 rounded-full border border-teal-500/30 transition-all cursor-pointer font-semibold active:scale-95 shadow-sm"
                  title="Optional edge blending. May create ghosting; it cannot reconstruct mismatched scene geometry."
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                  <span>Blend seam (optional)</span>
                </button>
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

            <div className="studio-preview-stage h-[490px] w-full relative bg-[#020712]">
              {isPreviewActive || currentPanoramaUrl !== initialPanoramaUrl ? (
                <SphereViewer textureUrl={currentPanoramaUrl} initialAutoRotate={false} className="w-full h-full" />
              ) : (
                <div className="studio-preview-placeholder">
                  <div className="studio-preview-orbit" aria-hidden="true"><Globe2 size={66} strokeWidth={0.7} /></div>
                  <span className="studio-coordinate">A SPACE FOR POSSIBILITY</span>
                  <h3>Your world goes here.</h3>
                  <p>Generate a panorama to explore it here.<br />Or open the built-in procedural demo — no credits used.</p>
                  <button type="button" className="studio-secondary-action" onClick={() => setIsPreviewActive(true)}><Play size={15} aria-hidden="true" /> Open 360° demo</button>
                </div>
              )}
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
          setIsPreviewActive(true);
        }}
      />

      {/* 2. Built for VR-Ready Equirectangular Output (Feature Matrix) */}
      <FeatureMatrix />

      {/* 5. How AI 360° Panorama Generation Works (4-Step Workflow) */}
      <HowItWorksSteps />

      {/* 6. Drop Straight into Your Production Stack (Game Engine Badges) */}
      <IntegrationBadges />

      {/* 8. Comprehensive FAQ Accordion */}
      <CommercialFaq />

      {/* 360 Photo-to-Video Animation Modal */}
      <PhotoToVideoModal
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        currentPanoramaUrl={currentPanoramaUrl}
      />

      <MyWorks isOpen={isWorksOpen} accountId={currentUser.id} onClose={() => setIsWorksOpen(false)} onOpen={async (original, share, signal) => {
        const accountToken = localStorage.getItem('panorama_server_user_token');
        const processed = await processPanoramaImage(original, { resolution: '4K', preserveNative: true, sharpness: 0, contrastBoost: 1 }, 'auto', signal);
        signal.throwIfAborted();
        if (localStorage.getItem('panorama_server_user_token') !== accountToken) throw new Error('Account changed. Reopen My works.');
        setOriginalRawUrl(original); setEnhanced4kUrl(null); onPanoramaChange(processed); setIsPreviewActive(true);
        if (share) setIsShareOpen(true);
      }} />
      <SharePanoramaModal isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} imageUrl={currentPanoramaUrl} prompt={prompt} accountId={currentUser.id} />

      {/* Embed 360 Viewer Modal */}
      <EmbedModal
        isOpen={isEmbedModalOpen}
        onClose={() => setIsEmbedModalOpen(false)}
        currentPanoramaUrl={currentPanoramaUrl}
      />

    </div>
  );
}
