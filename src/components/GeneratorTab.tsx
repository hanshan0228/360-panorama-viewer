import { useTranslation } from '../utils/i18n';
import { generatorMessages } from '../utils/generatorTranslations';
import { MyWorks } from './commercial/MyWorks';
import { SharePanoramaModal } from './commercial/SharePanorama';
import { useState, useRef, useEffect, useCallback } from 'react';
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
  Compass,
  Sliders,
  RotateCw,
  Eye,
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
  type PanoramaQuality,
} from '../utils/geminiClient';
import { ShowcaseGallery } from './commercial/ShowcaseGallery';
import { FeatureMatrix } from './commercial/FeatureMatrix';
import { HowItWorksSteps } from './commercial/HowItWorksSteps';
import { IntegrationBadges } from './commercial/IntegrationBadges';
import coastalCover from '../assets/coastal-cover.png';
import { CommercialFaq } from './commercial/CommercialFaq';
import { PhotoToVideoModal } from './commercial/PhotoToVideoModal';
import { exportVrReadyJpegBlob } from '../utils/xmpInjector';
import { healPanoramaSeam } from '../utils/seamHealer';
import { processPanoramaImage } from '../utils/panoramaProcessor';
import { repairPanoramaPoles } from '../utils/poleRepair';
import { rollPanoramaCanvas } from '../utils/seamInpaint';
import { inspectImageResolution, type ImageResolution } from '../utils/imageModelRequest.mjs';
import { saveWorkThumbnail } from '../utils/workThumbnail';
import {
  getCurrentUser,
  deductCurrentUserCredits,
  getModelExecutionPipeline,
  DEFAULT_GUEST_USER,
  DEFAULT_BILLING_CONFIG,
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
  isWorksOpen: boolean;
  onWorksOpenChange: (open: boolean) => void;
  isActive: boolean;
  isViewerHomepage?: boolean;
  trialNotice?: string;
  currentUser?: ManagedUser;
  billingConfig?: SystemBillingConfig;
  onUserChange?: (user: ManagedUser) => void;
  currentPanoramaUrl: string;
  onPanoramaChange: (url: string, owner?: string | null) => void;
  getPanoramaOwner: () => string | null;
  onNavigateTab?: (tab: ActiveTab) => void;
  externalInputMode?: 'text' | 'image';
  onInputModeChange?: (mode: 'text' | 'image') => void;
  externalPrompt?: string;
  externalStyle?: StylePresetId;
}

const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'custom',
    name: 'None (follow my description)',
    description: 'No preset scene or visual style is added.',
    promptSuffix: '',
    previewColor: 'from-slate-500 to-slate-700',
  },
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
];

const QUICK_TRY_CHIPS = [
  { label: 'Cyberpunk Tokyo, 2087', prompt: 'futuristic cyberpunk city at night with flying vehicles, wet reflective asphalt, holographic neon signage, 8k equirectangular 360' },
  { label: 'Alpine Mountain Lake', prompt: 'majestic snow-capped alpine mountains at sunrise, crystal clear turquoise lake reflection, morning mist, golden sunbeams, 8k equirectangular 360' },
  { label: 'Sci-Fi Space Station', prompt: 'deep space orbital station observation deck, purple nebula dust, glowing galaxies, ringed planet, star clusters, 8k equirectangular 360' },
  { label: 'Ancient Rome, 80 AD', prompt: 'ancient Rome forum and colosseum at golden hour, marble pillars, toga citizens, sun-drenched stone plaza, 8k equirectangular 360' },
  { label: 'Renaissance Florence, 1503', prompt: 'Renaissance Florence cathedral dome, terracotta rooftops, Arno river reflection, warm Mediterranean twilight, 8k 360' },
  { label: 'Minimalist Luxury Villa', prompt: 'ultra-luxury modern minimalist villa interior, floor-to-ceiling glass windows overlooking private ocean infinity pool, warm architectural lighting, 8k 360' },
  { label: 'Ancient Shinto Shrine', prompt: 'tranquil Japanese ancient Shinto temple garden in autumn, crimson maple leaves, stone lanterns, misty sacred forest pond, 8k 360' },
  { label: 'Deep Space Ringed Planet', prompt: 'deep space nebula, purple and teal cosmic dust, glowing galaxies, massive ringed planet, volumetric stellar skybox, 8k equirectangular 360' },
  { label: 'Medieval Fantasy Tavern', prompt: 'warm cozy medieval fantasy tavern interior, glowing fireplace, rustic wooden beams, candlelight, cobblestone floor, high fantasy game skybox, 8k 360' },
];

interface CameraViewpoint {
  id: string;
  name: string;
  promptSnippet: string;
  desc: string;
}

const CAMERA_VIEWPOINTS: CameraViewpoint[] = [
  { id: 'auto', name: 'Auto (Natural)', promptSnippet: '', desc: 'Natural perspective based on scene description' },
  { id: 'eye-level', name: 'Eye-level (1.6m)', promptSnippet: 'eye-level human perspective at 1.6m height, level eye-level horizon', desc: 'Standing human perspective with realistic spatial height' },
  { id: 'aerial', name: 'Aerial (50m)', promptSnippet: 'drone aerial 360 overview, panoramic bird-eye horizon, expansive landscape below', desc: 'Drone or high-altitude aerial view looking outward' },
  { id: 'seated', name: 'Seated (1.1m)', promptSnippet: 'seated human eye-level viewpoint at 1.1m, realistic interior room proportion', desc: 'Seated perspective for indoor rooms, cafes, and studios' },
];

export function GeneratorTab({
  isWorksOpen,
  onWorksOpenChange,
  isActive,
  isViewerHomepage = false,
  trialNotice,
  currentUser = DEFAULT_GUEST_USER,
  billingConfig = DEFAULT_BILLING_CONFIG,
  onUserChange = () => {},
  currentPanoramaUrl,
  onPanoramaChange: onParentPanoramaChange,
  getPanoramaOwner,
  onNavigateTab = () => {},
  externalInputMode,
  onInputModeChange,
  externalPrompt,
  externalStyle,
}: GeneratorTabProps) {
  const t = useTranslation(generatorMessages);
  const [localInputMode, setInputMode] = useState<'text' | 'image'>(externalInputMode ?? 'text');
  const inputMode = externalInputMode ?? localInputMode;

  const handleModeChange = (newMode: 'text' | 'image') => {
    if (externalInputMode === undefined) setInputMode(newMode);
    onInputModeChange?.(newMode);
  };
  const [prompt, setPrompt] = useState(externalPrompt ?? '');
  const [selectedStyle, setSelectedStyle] = useState<StylePresetId>(externalStyle ?? 'custom');
  const [previousPresets, setPreviousPresets] = useState({ prompt: externalPrompt, style: externalStyle, inputMode: externalInputMode });

  // Apply changed external presets once, without overwriting subsequent local edits.
  if (externalPrompt !== previousPresets.prompt || externalStyle !== previousPresets.style || externalInputMode !== previousPresets.inputMode) {
    setPreviousPresets({ prompt: externalPrompt, style: externalStyle, inputMode: externalInputMode });
    if (externalPrompt !== previousPresets.prompt && externalPrompt !== undefined) setPrompt(externalPrompt);
    if (externalStyle !== previousPresets.style && externalStyle !== undefined) setSelectedStyle(externalStyle);
    // Preserve the last controlled mode if the parent releases control.
    if (externalInputMode !== previousPresets.inputMode && externalInputMode) setInputMode(externalInputMode);
  }

  const [resolution, setResolution] = useState<ResolutionTier>('4K');
  const [seamCorrection, setSeamCorrection] = useState<boolean | 'auto'>('auto');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedViewpoint, setSelectedViewpoint] = useState<string>('auto');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isRolled180, setIsRolled180] = useState(false);
  const [generationStage, setGenerationStage] = useState('');
  const [generationElapsed, setGenerationElapsed] = useState(0);
  const [generationTiming, setGenerationTiming] = useState<string | null>(null);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [workPrompt, setWorkPrompt] = useState<{ url: string; prompt: string } | null>(null);
  const [saveStatus, setSaveStatus] = useState<{ url: string; status: 'saved' | 'unsaved' | 'unknown' } | null>(null);
  const [isPreviewActive, setIsPreviewActive] = useState(false);

  const handleAppendTag = (tag: string) => {
    setPrompt((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return tag;
      if (trimmed.toLowerCase().includes(tag.toLowerCase())) return prev;
      return `${trimmed}, ${tag}`;
    });
  };

  // Reference photos state for Image-to-Pano mode
  const [referenceImages, setReferenceImages] = useState<Array<{ id: string; name: string; preview: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoadingSample, setIsLoadingSample] = useState(false);

  // Restore unauthenticated draft once user signs in / verifies
  useEffect(() => {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
    const sessionToken = localStorage.getItem('panorama_server_user_token');
    if (!currentUser.id.startsWith('usr_guest') && sessionToken && (currentUser.plan !== 'free' || currentUser.emailVerified)) {
      try {
        const rawDraft = sessionStorage.getItem('panorama_pending_draft');
        if (rawDraft) {
          sessionStorage.removeItem('panorama_pending_draft');
          const draft = JSON.parse(rawDraft);
          if (draft && typeof draft === 'object') {
            if (typeof draft.prompt === 'string' && draft.prompt.trim()) setPrompt(draft.prompt);
            if (typeof draft.selectedStyle === 'string') setSelectedStyle(draft.selectedStyle);
            if (typeof draft.selectedViewpoint === 'string') setSelectedViewpoint(draft.selectedViewpoint);
            if (typeof draft.negativePrompt === 'string') setNegativePrompt(draft.negativePrompt);
            if (['1K', '2K', '4K'].includes(draft.resolution)) setResolution(draft.resolution);
            if (draft.inputMode === 'text' || draft.inputMode === 'image') setInputMode(draft.inputMode);
            if (Array.isArray(draft.referenceImages) && draft.referenceImages.length > 0) setReferenceImages(draft.referenceImages);
            setFeedbackNotice(t("Your generation draft has been restored."));
          }
        }
      } catch {}
    }
  }, [currentUser]);

  const [apiError, setApiError] = useState<string | null>(null);
  const [isUpscalingClarity, setIsUpscalingClarity] = useState(false);
  const [originalRawUrl, setOriginalRawUrl] = useState<string | null>(null);
  const originalOwner = useRef<string | null>(null);
  const [resultQuality, setResultQuality] = useState<{ url: string; quality?: PanoramaQuality } | null>(null);
  const [enhanced4kUrl, setEnhanced4kUrl] = useState<string | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  const expectedPanoramaUrl = useRef(currentPanoramaUrl);
  const onPanoramaChange = useCallback((url: string, owner?: string | null) => {
    expectedPanoramaUrl.current = url;
    onParentPanoramaChange(url, owner);
  }, [onParentPanoramaChange]);

  // User credit and commercial checkout state
  const generationRef = useRef({ mounted: false, request: 0, processing: null as AbortController | null, thumbnails: new Set<AbortController>() });
  useEffect(() => {
    const generation = generationRef.current;
    generation.mounted = true;
    const invalidateGeneration = () => {
      generation.request++;
      generation.processing?.abort();
      generation.thumbnails.forEach(controller => controller.abort());
      generation.thumbnails.clear();
      setIsGenerating(false);
      setIsShareOpen(false);
      if (originalOwner.current && originalOwner.current !== localStorage.getItem('panorama_server_user_token')) {
        originalOwner.current = null;
        setOriginalRawUrl(null);
        setEnhanced4kUrl(null);
        setResultQuality(null);
        setSaveStatus(null);
        setWorkPrompt(null);
        setGenerationTiming(null);
        setIsPreviewActive(false);
        setIsVideoModalOpen(false);
      }
    };
    window.addEventListener('panorama-session-changed', invalidateGeneration);
    const handleStorage = (event: StorageEvent) => { if (event.key === 'panorama_server_user_token' || event.key === null) invalidateGeneration(); };
    window.addEventListener('storage', handleStorage);
    return () => {
      generation.mounted = false;
      generation.request++;
      generation.processing?.abort();
      generation.thumbnails.forEach(controller => controller.abort());
      generation.thumbnails.clear();
      window.removeEventListener('panorama-session-changed', invalidateGeneration);
      window.removeEventListener('storage', handleStorage);
    };
  }, [currentUser.id]);

  useEffect(() => {
    if (currentPanoramaUrl === expectedPanoramaUrl.current) return;
    expectedPanoramaUrl.current = currentPanoramaUrl;
    generationRef.current.request++;
    generationRef.current.processing?.abort();
    generationRef.current.processing = null;
    originalOwner.current = null;
    setOriginalRawUrl(null); setEnhanced4kUrl(null); setResultQuality(null); setSaveStatus(null); setWorkPrompt(null); setGenerationTiming(null);
    setIsGenerating(false); setIsUpscalingClarity(false); setIsPreviewActive(false);
    setIsShareOpen(false); setIsVideoModalOpen(false); setFeedbackNotice(null); setApiError(null);
  }, [currentPanoramaUrl]);

  // Dynamic credit cost from admin billing configuration
  const creditsCost =
    resolution === '4K'
      ? billingConfig.creditCostPer4K
      : resolution === '2K'
      ? billingConfig.creditCostPer2K
      : billingConfig.creditCostPer1K;

  const loadPreviewPanoramaFile = useCallback((file: File) => {
    if (isGenerating || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result;
      if (typeof url === 'string') {
        originalOwner.current = null;
        setOriginalRawUrl(url);
        setEnhanced4kUrl(null); setResultQuality(null); setSaveStatus(null); setWorkPrompt(null); setGenerationTiming(null);
        onPanoramaChange(url, null);
        setIsPreviewActive(true);
      }
    };
    reader.readAsDataURL(file);
  }, [isGenerating, onPanoramaChange]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!isActive || isShareOpen || isWorksOpen || isVideoModalOpen || document.querySelector('dialog[open]') ||
        (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) loadPreviewPanoramaFile(file);
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [loadPreviewPanoramaFile, isShareOpen, isWorksOpen, isVideoModalOpen, isActive]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = 3 - referenceImages.length;
    if (remainingSlots <= 0) {
      alert(t("You can attach a maximum of 3 reference photos."));
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

  const handleAddSampleReference = async () => {
    if (isLoadingSample || referenceImages.length >= 3) return;
    const request = generationRef.current.request;
    setIsLoadingSample(true);
    try {
      const preview = await processPanoramaImage(coastalCover, {
        preserveNative: true, sharpness: 0, contrastBoost: 1,
      }, false);
      if (!generationRef.current.mounted || generationRef.current.request !== request) return;
      setReferenceImages(prev => prev.length < 3 ? [...prev, {
        id: `ref_coastal_${Date.now()}`,
        name: t('Bundled coastal sample'),
        preview,
      }] : prev);
    } catch {
      if (generationRef.current.mounted && generationRef.current.request === request) {
        setApiError(t('Could not load the sample image. Upload your own photo instead.'));
      }
    } finally {
      if (generationRef.current.mounted) setIsLoadingSample(false);
    }
  };

  const handlePreviewSample = () => {
    if (isGenerating || isUpscalingClarity) return;
    originalOwner.current = null;
    setOriginalRawUrl(null); setEnhanced4kUrl(null); setResultQuality(null); setSaveStatus(null); setWorkPrompt(null); setGenerationTiming(null);
    setFeedbackNotice(null); setApiError(null);
    onPanoramaChange(coastalCover, null);
    setIsPreviewActive(true);
  };

  const handleRemoveReference = (id: string) => {
    setReferenceImages((prev) => prev.filter((r) => r.id !== id));
  };

  const handleRemixScene = () => {
    if (!currentPanoramaUrl || isGenerating || currentPanoramaUrl === coastalCover) return;
    setInputMode('image');
    setReferenceImages([{
      id: `remix-${Date.now()}`,
      name: 'current-panorama.png',
      preview: currentPanoramaUrl,
    }]);
    setFeedbackNotice(t("Current panorama set as reference photo. Describe lighting, weather, or style changes below."));
    const promptInput = document.getElementById('prompt-input');
    if (promptInput) {
      promptInput.focus();
      promptInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleGenerate = async () => {
    if (inputMode === 'image' && isLoadingSample) return;
    const styleObj = STYLE_PRESETS.find(s => s.id === selectedStyle);
    if (!prompt.trim() && !(inputMode === 'image' && referenceImages.length > 0) && !styleObj?.promptSuffix.trim()) {
      setApiError(t('Describe a scene, add a reference photo, or choose a preset before generating.'));
      document.getElementById('prompt-input')?.focus();
      return;
    }
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
      setApiError(t("This account is suspended. Contact support before generating images."));
      return;
    }
    if (user.id.startsWith('usr_guest') || !sessionToken || (user.plan === 'free' && !user.emailVerified)) {
      setApiError(t('Register and verify your email before using free AI generation.'));
      const isUnauth = user.id.startsWith('usr_guest') || !sessionToken;
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('panorama_pending_draft', JSON.stringify({
            prompt,
            selectedStyle,
            selectedViewpoint,
            negativePrompt,
            resolution,
            inputMode,
            referenceImages,
          }));
        }
      } catch {}
      window.dispatchEvent(new CustomEvent('panorama-open-auth', {
        detail: {
          mode: isUnauth ? 'register' : 'login',
          notice: isUnauth
            ? 'Register and verify your email before generating images.'
            : 'Verify your email before generating images.',
        }
      }));
      return;
    }

    // 2. Check credit balance before firing requests
    if (!sessionToken && user.creditsBalance < creditsCost) {
      setApiError(
        t('Insufficient credits.') + ' ' + t("A {resolution} panorama costs {cost} credits; your account has {balance}. View plans to add credits.").replace("{resolution}", () => String(resolution)).replace("{cost}", () => String(creditsCost)).replace("{balance}", () => String(user.creditsBalance))
      );
      return;
    }

    // 3. Check execution pipeline availability
    const pipeline = getModelExecutionPipeline();
    if (pipeline.endpoints.length === 0) {
      setApiError(
        t("No image models are currently available. Please try again later or contact support.")
      );
      return;
    }

    setIsGenerating(true);
    setApiError(null);
    setGenerationStage(t("Preparing generation request"));
    setGenerationElapsed(0);
    setGenerationTiming(null);
    const startedAt = performance.now();
    const elapsedTimer = setInterval(() => {
      if (isCurrentGeneration()) {
        const secs = Math.floor((performance.now() - startedAt) / 1000);
        setGenerationElapsed(secs);
        if (secs >= 24) {
          setGenerationStage(t("Finalizing equirectangular texture map and automated quality checks..."));
        } else if (secs >= 14) {
          setGenerationStage(t("Calculating spherical horizon, perspective depth, and scene coherence..."));
        } else if (secs >= 5) {
          setGenerationStage(t("AI diffusion model generating lighting and volumetric environment..."));
        }
      }
    }, 1000);

    try {
      const refPreviews = inputMode === 'image' ? referenceImages.map(r => r.preview) : [];
      let effectiveUserPrompt = prompt;
      if (typeof selectedViewpoint !== 'undefined' && typeof CAMERA_VIEWPOINTS !== 'undefined') {
        const viewpointObj = CAMERA_VIEWPOINTS.find(v => v.id === selectedViewpoint);
        if (viewpointObj?.promptSnippet && prompt.trim()) {
          effectiveUserPrompt = `${prompt.trim()}, ${viewpointObj.promptSnippet}`;
        }
      }
      const effNegative = typeof negativePrompt !== 'undefined' && typeof negativePrompt === 'string' ? negativePrompt : '';
      const fullPrompt = effNegative
        ? buildPanoramaPrompt(effectiveUserPrompt, styleObj?.promptSuffix || '', refPreviews.length > 0, effNegative)
        : buildPanoramaPrompt(effectiveUserPrompt, styleObj?.promptSuffix || '', refPreviews.length > 0);

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
      let bestAttempt: { url: string; resolution: ImageResolution; endpointName: string; index: number; cost?: number; library?: { saved: boolean; error?: string }; quality?: PanoramaQuality } | null = null;
      const failedAttempts: Array<{ endpoint: string; error: string }> = [];
      const attemptDetails: string[] = [];

      for (let i = 0; i < pipeline.endpoints.length; i++) {
        const ep = pipeline.endpoints[i];
        setGenerationStage(t("Waiting for {model} and network response ({attempt}/{total})").replace("{model}", () => String(ep.name)).replace("{attempt}", () => String(i + 1)).replace("{total}", () => String(pipeline.endpoints.length)));
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
          const genResult = await generateWithGemini(fullPrompt, modelConfig, refPreviews);
          if (!isCurrentGeneration()) return;
          if (genResult.library?.saved && genResult.library.id && sessionToken) {
            const controller = new AbortController();
            generationRef.current.thumbnails.add(controller);
            void saveWorkThumbnail(genResult.library.id, genResult.imageUrl, sessionToken, controller.signal)
              .catch(() => {})
              .finally(() => generationRef.current.thumbnails.delete(controller));
          }
          if (sessionToken) window.dispatchEvent(new Event('panorama-user-refresh'));
          const attemptResolution = genResult.imageResolution ?? inspectImageResolution(genResult.imageUrl, resolution);
          const attemptRefunded = genResult.creditsRefunded ?? 0;
          attemptDetails.push(`${genResult.modelUsed || ep.model || ep.name}: ${attemptResolution.width ?? '?'}×${attemptResolution.height ?? '?'} (${attemptResolution.status}), ${((performance.now() - attemptStarted) / 1000).toFixed(1)} s${genResult.generationTiming ? ` [${t('upstream wait')} ${(genResult.generationTiming.upstreamWaitMs / 1000).toFixed(1)} s; ${t('response transfer')} ${(genResult.generationTiming.upstreamBodyMs / 1000).toFixed(1)} s]` : ''}`);
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
              quality: genResult.quality,
            };
          }
          if (typeof genResult.remainingCredits === 'number') {
            // Freshest server balance includes every attempt's deduction and refund so far.
            serverRemaining = genResult.remainingCredits;
          }
          const refundConfirmed = attemptRefunded > 0 && (genResult.creditsDeducted ?? 0) === 0;
          const hasNextModel = pipeline.mode !== 'single' && i < pipeline.endpoints.length - 1;
          if (attemptResolution.status === 'below-request' && hasNextModel && (!sessionToken || refundConfirmed)) {
            setGenerationStage(t("{model} returned {width}×{height}, below the requested {resolution} panorama; trying the next model").replace("{model}", () => String(ep.name)).replace("{width}", () => String(attemptResolution.width)).replace("{height}", () => String(attemptResolution.height)).replace("{resolution}", () => String(resolution)));
            continue;
          }
          break; // Succeeded (or no confirmed refund): stop trying further models
        } catch (callErr) {
          if (!isCurrentGeneration()) return;
          if (callErr instanceof Error && callErr.name === 'PanoramaQualityError') {
            if (sessionToken) window.dispatchEvent(new Event('panorama-user-refresh'));
            throw callErr;
          }
          const errMessage = callErr instanceof Error ? callErr.message : String(callErr);
          failedAttempts.push({ endpoint: ep.model || ep.name, error: errMessage });
          attemptDetails.push(`${ep.model || ep.name}: ${t('failed after')} ${((performance.now() - attemptStarted) / 1000).toFixed(1)} s — ${errMessage}`);

          // If in strict single model mode, immediately fail without fallback
          if (pipeline.mode === 'single') {
            throw new Error(t('[Single model] {model} failed: {error}').replace('{model}', () => ep.name).replace('{error}', () => t(errMessage)));
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
          t('All configured image models failed. Details:') + '\n' + detailLogs
        );
      }

      const attemptSummary = attemptDetails.join(' | ');
      try {
        // ponytail: keep only this account's latest attempt summary in the current tab; no prompts or image data.
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(`panorama-last-generation:${user.id}`,
          JSON.stringify({ timestamp: new Date().toISOString(), resolution, attempts: attemptDetails }));
      } catch { /* Storage denial must not discard a completed image. */ }
      const fallbackNotice = failedAttempts.length ? ` ${t('Other model attempts failed:')} ${failedAttempts.map(f => `${f.endpoint}: ${t(f.error)}`).join('; ')}` : '';
      const modelElapsed = performance.now() - startedAt;
      setGenerationStage(seamCorrection ? t("Preparing native-detail panorama with optional seam blending") : t("Preparing native-detail panorama without stretching"));
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
        ? `${t('Model original:')} ${resultResolution.width}×${resultResolution.height}`
        : t("Model original dimensions unverified");
      setGenerationTiming(`${t('Requested:')} ${resolution} · ${originalSize} · ${t('Model/network (including failover):')} ${(modelElapsed / 1000).toFixed(1)} s · ${t('Image processing:')} ${(processingElapsed / 1000).toFixed(1)} s${processingFailed ? ` ${t('(processing failed; original image preserved)')}` : ''} · ${t('Attempts:')} ${attemptSummary}${bestAttempt?.library ? bestAttempt.library.saved ? ` · ${t('Saved privately in My works')}` : ` · ${t('NOT saved:')} ${t(bestAttempt.library.error ?? '')}` : ''}`);
      originalOwner.current = sessionToken;
      setOriginalRawUrl(rawGenUrl);
      setWorkPrompt(null);
      setSaveStatus({ url: rawGenUrl, status: bestAttempt?.library ? bestAttempt.library.saved ? 'saved' : 'unsaved' : 'unknown' });
      setResultQuality({ url: finalDataUrl, quality: bestAttempt?.quality });
      setEnhanced4kUrl(null);

      setGenerationStage(t("Updating panorama preview"));
      if (isCurrentGeneration()) onPanoramaChange(finalDataUrl, sessionToken);
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
          ? t("You have {balance} credits left, which is not enough for another generation at this resolution. View plans to add credits.").replace("{balance}", () => String(remainingCredits))
          : hadFailover
          ? t("Generated with fallback model {model}. Used {cost} credits.").replace("{model}", () => String(usedEndpointName)).replace("{cost}", () => String(deductedCost))
          : t("Panorama generated with {model}. Used {cost} credits; {balance} remaining.").replace("{model}", () => String(usedEndpointName)).replace("{cost}", () => String(deductedCost)).replace("{balance}", () => String(remainingCredits));
        if (isCurrentGeneration()) setFeedbackNotice(toastNotice);
        if (!isFreeExhausted) {
          setTimeout(() => { if (isCurrentGeneration()) setFeedbackNotice(null); }, 5000);
        }
      }

      if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
        const resolutionStatus = resultResolution?.status ?? 'unverified';
        const event = resolutionStatus === 'met' ? 'generation_success'
          : resolutionStatus === 'below-request' ? 'generation_below_resolution' : 'generation_resolution_unverified';
        (window as any).gtag('event', event, { resolution, model: usedEndpointName, resolution_status: resolutionStatus });
      }

      if (isCurrentGeneration()) setIsGenerating(false);

      if (resultResolution?.status === 'below-request') {
        // Each attempt's creditsDeducted is already net of its own refund, so the sum is the real charge.
        const netCharged = serverDeductedTotal;
        const billingNotice = serverRefunded > 0
          ? netCharged > 0
            ? t("{refund} credits were returned, but fallback attempts still report {charged} credits charged without a confirmed refund.").replace("{refund}", () => String(serverRefunded)).replace("{charged}", () => String(netCharged))
            : t("{refund} credits were returned; no generation credits were charged.").replace("{refund}", () => String(serverRefunded))
          : sessionToken
          ? t("The server reported {cost} credits charged; no automatic refund was confirmed.").replace("{cost}", () => String(serverCost ?? creditsCost))
          : t("No local credits were deducted.");
        setApiError(t("The model returned {width}×{height}; its 2:1 crop is {cropWidth}×{cropHeight}, below the requested {resolution} panorama ({targetWidth}×{targetHeight}). The image was retained without upscaling.").replace("{width}", () => String(resultResolution.width)).replace("{height}", () => String(resultResolution.height)).replace("{cropWidth}", () => String(resultResolution.panoramaWidth)).replace("{cropHeight}", () => String(resultResolution.panoramaHeight)).replace("{resolution}", () => String(resolution)).replace("{targetWidth}", () => String(resultResolution.targetWidth)).replace("{targetHeight}", () => String(resultResolution.targetHeight)) + ' ' + billingNotice + fallbackNotice);
        return;
      }

      if (!isCurrentGeneration()) return;
      if (fallbackNotice) setApiError(t('A usable image was retained.') + fallbackNotice);
      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.8 },
      });
    } catch (err: unknown) {
      if (!isCurrentGeneration()) return;
      setIsGenerating(false);
      setGenerationTiming(t("Request failed after {seconds} s").replace("{seconds}", () => String(((performance.now() - startedAt) / 1000).toFixed(1))));
      const errMsg = err instanceof Error ? err.message : t("Unknown image generation error");
      if (isCurrentGeneration()) setApiError(t(errMsg));
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
      if (!response.ok) throw new Error(t("Original image download failed"));
      const blob = await response.blob();
      const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[blob.type];
      if (!extension || !blob.size) throw new Error(t("Original image format is not supported"));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `model-original-${Date.now()}.${extension}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setFeedbackNotice(error instanceof Error ? error.message : t("Original image download failed"));
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
      setFeedbackNotice(t("HDR export failed: the current panorama could not be loaded."));
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
      setFeedbackNotice(t("VR JPEG export failed: the current panorama could not be loaded."));
    };
    img.src = currentPanoramaUrl;
  };

  const handleEnhancePrompt = () => {
    if (!prompt.trim()) {
      const random = QUICK_TRY_CHIPS[Math.floor(Math.random() * QUICK_TRY_CHIPS.length)];
      setPrompt(random.prompt);
      return;
    }
    const enhancements = [
      'continuous 360 degree equirectangular horizon, 8k resolution, seamless horizontal loop, photorealistic lighting, balanced zenith and nadir',
      'unreal engine 5 lumen lighting, 360 vr spherical skybox, ultra detailed architectural textures, golden hour volumetric atmosphere',
      'equirectangular projection 2:1 ratio, vibrant color grading, sharp specular highlights, high dynamic range skybox environment',
      'seamless 360 pano wrapping, hyper-detailed volumetric clouds, raytraced atmospheric haze, ultra-sharp horizon line',
      'seamless 360 wrap with centered primary subjects, level horizon, uniform peripheral boundaries, balanced zenith and nadir',
    ];
    const picked = enhancements[Math.floor(Math.random() * enhancements.length)];
    if (!prompt.toLowerCase().includes('equirectangular')) {
      setPrompt(`${prompt.trim()}, ${picked}`);
    } else {
      setPrompt(`${prompt.trim()}, cinematic volumetric lighting, 8k ultra-sharp detail`);
    }
  };

  const handleManualHealSeam = () => {
    const sourceOwner = getPanoramaOwner();
    if (!originalRawUrl) {
      originalOwner.current = sourceOwner;
      setOriginalRawUrl(currentPanoramaUrl);
    }
    const request = generationRef.current.request;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!generationRef.current.mounted || generationRef.current.request !== request || (sourceOwner && localStorage.getItem('panorama_server_user_token') !== sourceOwner)) return;
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const healed = healPanoramaSeam(canvas, 160);
        onPanoramaChange(healed.toDataURL('image/png'), sourceOwner);
        setFeedbackNotice(t("Seam blending applied. It can create ghosting when edges differ; use View Original to undo."));
        confetti({ particleCount: 35, spread: 55, origin: { y: 0.7 } });
        setTimeout(() => setFeedbackNotice(null), 3500);
      }
    };
    img.src = currentPanoramaUrl;
  };

  const handleRepairPoles = () => {
    const sourceOwner = getPanoramaOwner();
    if (!originalRawUrl) {
      originalOwner.current = sourceOwner;
      setOriginalRawUrl(currentPanoramaUrl);
    }
    const request = generationRef.current.request;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!generationRef.current.mounted || generationRef.current.request !== request || (sourceOwner && localStorage.getItem('panorama_server_user_token') !== sourceOwner)) return;
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const repaired = repairPanoramaPoles(canvas, {
          repairNadir: true,
          repairZenith: true,
          nadirRadiusRatio: 0.10,
          zenithRadiusRatio: 0.06,
        });
        onPanoramaChange(repaired.toDataURL('image/png'), sourceOwner);
        setFeedbackNotice(t("Zenith and nadir pole smoothing applied. Use View Original to undo."));
        confetti({ particleCount: 35, spread: 55, origin: { y: 0.7 } });
        setTimeout(() => setFeedbackNotice(null), 3500);
      }
    };
    img.src = currentPanoramaUrl;
  };

  const handleRoll180 = () => {
    const sourceOwner = getPanoramaOwner();
    if (!originalRawUrl) {
      originalOwner.current = sourceOwner;
      setOriginalRawUrl(currentPanoramaUrl);
    }
    const request = generationRef.current.request;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!generationRef.current.mounted || generationRef.current.request !== request || (sourceOwner && localStorage.getItem('panorama_server_user_token') !== sourceOwner)) return;
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const rolled = rollPanoramaCanvas(canvas);
        setIsRolled180(prev => !prev);
        onPanoramaChange(rolled.toDataURL('image/png'), sourceOwner);
        setFeedbackNotice(t("Panorama rolled 180° horizontally. Seam is now centered."));
        setTimeout(() => setFeedbackNotice(null), 3500);
      }
    };
    img.src = currentPanoramaUrl;
  };

  const handleEnhanceClarity = async () => {
    const sourceOwner = getPanoramaOwner();
    const request = ++generationRef.current.request;
    const processing = new AbortController();
    generationRef.current.processing?.abort();
    generationRef.current.processing = processing;
    setIsUpscalingClarity(true);
    try {
      const result = await processPanoramaImage(currentPanoramaUrl, {
        scaleFactor: 1, sharpness: 0.2, contrastBoost: 1,
      }, false, processing.signal);
      if (!generationRef.current.mounted || generationRef.current.request !== request || processing.signal.aborted || (sourceOwner && localStorage.getItem('panorama_server_user_token') !== sourceOwner)) return;
      if (!originalRawUrl) { originalOwner.current = sourceOwner; setOriginalRawUrl(currentPanoramaUrl); }
      setEnhanced4kUrl(result);
      onPanoramaChange(result, sourceOwner);
      setFeedbackNotice(t("Light sharpening applied at the existing resolution. No upscaling or AI super-resolution."));
    } catch (error) {
      if (generationRef.current.mounted && generationRef.current.request === request && !processing.signal.aborted) {
        setFeedbackNotice(error instanceof Error ? error.message : t("Image sharpening failed"));
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
      onPanoramaChange(originalRawUrl, originalOwner.current);
      setFeedbackNotice(t("Restored to original pre-enhancement panorama."));
      setTimeout(() => setFeedbackNotice(null), 3500);
    }
  };

  const isBundledPreview = currentPanoramaUrl === coastalCover || originalRawUrl === coastalCover;

  return (
    <div className={`studio-generator space-y-12 ${isViewerHomepage ? 'studio-home' : 'studio-creator'}`}>
      {/* =========================================================================
          HERO BANNER & VALUE PROP
      ========================================================================= */}
      <section className="studio-hero" aria-labelledby="studio-hero-title">
        <img className="studio-hero-image" src={coastalCover} alt="" width={2560} height={1280} fetchPriority="high" />
        <HeroPanorama textureUrl={coastalCover} />
        <div className="studio-hero-content">
          <span className="studio-coordinate">{t("AI 360° PANORAMA GENERATOR · FREE WEBGL VIEWER")}</span>
          <h1 id="studio-hero-title">{isViewerHomepage ? <>{t("AI 360° Panorama")}<br /><em>{t("Generator & Viewer.")}</em></> : <>{t("AI 360° Panorama")}<br /><em>{t("Generator.")}</em></>}</h1>
          <p>{isViewerHomepage ? t("Create 360° panoramas with AI, or explore local panorama files in the free viewer.") : t("Describe a scene or add reference photos. Preview and export a 2:1 panorama.")}</p>
          <div className="studio-hero-actions">
            {isViewerHomepage && <a href="/360-panorama-viewer/" className="studio-primary-action" onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              onNavigateTab('viewer');
            }}>{t("Open the free 360° viewer")} <ArrowUpRight aria-hidden="true" size={17} /></a>}
            <button type="button" className={isViewerHomepage ? 'studio-secondary-action' : 'studio-primary-action'} onClick={() => {
              const input = document.getElementById('prompt-input');
              input?.focus({ preventScroll: true });
              input?.scrollIntoView({ block: 'center' });
            }}>{isViewerHomepage ? t("Create with AI") : t("Start creating")} <ArrowUpRight aria-hidden="true" size={17} /></button>
            {!isViewerHomepage && <button type="button" className="studio-secondary-action" onClick={() => {
              handlePreviewSample();
              document.getElementById('studio-preview')?.scrollIntoView({ block: 'center' });
              document.getElementById('studio-preview')?.focus({ preventScroll: true });
            }}><Play aria-hidden="true" size={15} /> {t("Try the 360° demo")}</button>}
          </div>
          <span className="studio-hero-note">{isViewerHomepage ? t("Viewing is free · AI generation uses credits") : t("AI generation uses credits. Preview is free.")}</span>
        </div>
        <div className="studio-hero-caption"><span>{t("COASTAL STUDY")} <span>{t("/ 360° PANORAMA")}</span></span><span aria-hidden="true">{t("↗ A DIFFERENT PERSPECTIVE")}</span></div>
      </section>

      <div className="studio-workbench-heading">
        <div><span className="studio-coordinate">{t("AI GENERATION STUDIO")}</span><h2>{t("Create your panorama.")}</h2></div>
        <p>{t("Choose text or reference photos to get started.")}</p>
      </div>

      {trialNotice && <p role="status" className="text-sm text-amber-200 mb-4">{trialNotice}</p>}

      {/* =========================================================================
          STUDIO INTERACTIVE WORKBENCH (2 Columns: Controls & 360 Viewport)
      ========================================================================= */}
      <div id="studio-generator-workbench" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start relative">
        {/* =========================================================================
            LEFT COLUMN: GENERATOR CONTROLS
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
                <span>{t("Text Prompt")}</span>
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
                <span>{t("Image to Pano")}</span>
                {referenceImages.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-cyan-400 text-slate-950 text-[10px] font-black flex items-center justify-center">
                    {referenceImages.length}
                  </span>
                )}
              </button>
            </div>

            <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-cyan-300 bg-cyan-950/60 px-2.5 py-1 rounded-full border border-cyan-500/30">
              <Coins className="w-3 h-3 text-amber-400" />
              <span>{creditsCost} {t("credits")}</span>
            </div>
          </div>

          {/* Mode 2: Image to Pano Reference Photo Upload Box */}
          {inputMode === 'image' && (
            <div id="reference-uploader" className="space-y-3 bg-[#020b1c]/80 border border-cyan-500/25 p-4 rounded-2xl relative z-10 animate-fade-in transition-all">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <ImagePlus className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t("Attach Reference Photos (Up to 3)")}</span>
                </span>
                <span className="text-[10px] text-cyan-300/70">
                  {referenceImages.length} {t("/ 3 Attached")}
                </span>
              </div>
              <p className="text-[11px] text-cyan-200/70 leading-relaxed">
                {t("Your photos are sent to an image-capable model to generate a new panorama based on the visible scene. Describe any changes below. Unseen areas are generated by AI and may differ from reality.")}
              </p>

              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-cyan-500/30 hover:border-cyan-400/60 rounded-xl p-3 text-center cursor-pointer bg-cyan-950/20 hover:bg-cyan-950/40 transition-colors"
              >
                <Upload className="w-5 h-5 text-cyan-400 mx-auto mb-1 opacity-80" />
                <span className="text-xs font-semibold text-cyan-200">
                  {t("Choose photos (up to 3)")}
                </span>
              </button>

              {/* Reference Image Previews */}
              {referenceImages.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {referenceImages.map((refImg) => (
                    <div key={refImg.id} className="relative rounded-xl overflow-hidden border border-cyan-500/30 group aspect-video bg-black">
                      <img src={refImg.preview} alt={refImg.name} className="w-full h-full object-cover" />
                      <div className="studio-reference-remove absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveReference(refImg.id)}
                          aria-label={t("Remove reference {name}").replace("{name}", () => String(refImg.name))}
                          className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full bg-red-500/80 hover:bg-red-500 text-white cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[9px] text-cyan-200 font-mono truncate px-1 py-0.5 pointer-events-none">
                        {refImg.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-cyan-500/15">
                <button
                  type="button"
                  disabled={isLoadingSample || referenceImages.length >= 3}
                  aria-busy={isLoadingSample}
                  onClick={handleAddSampleReference}
                  className="px-2 py-1 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/25 rounded-lg text-[11px] text-cyan-200 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isLoadingSample && <RefreshCw aria-hidden="true" className="inline-block w-3 h-3 mr-1 animate-spin" />}
                  {t('Use coastal sample')}
                </button>
                <p className="mt-1.5 text-[11px] text-cyan-200/70">{t('This bundled image is a reference example, not a result of your prompt.')}</p>
              </div>
            </div>
          )}

          {/* Prompt Description Input */}
          <div className="space-y-2 relative z-10">
            <div className="studio-prompt-toolbar flex items-center justify-between">
              <label htmlFor="prompt-input" className="text-xs font-bold text-cyan-100">
                {t("Scene Description")}
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleEnhancePrompt}
                  className="text-[11px] text-teal-300 hover:text-white flex items-center gap-1 px-2.5 py-1 rounded-xl bg-teal-500/15 border border-teal-500/30 hover:border-teal-400 transition-all cursor-pointer font-semibold active:scale-95 shadow-sm"
                  title={t("Enhance prompt with 360° equirectangular VR keywords")}
                >
                  <Sparkles className="w-3 h-3 text-teal-400" />
                  <span>{t("Add detail")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const random = QUICK_TRY_CHIPS[Math.floor(Math.random() * QUICK_TRY_CHIPS.length)];
                    setPrompt(random.prompt);
                  }}
                  className="text-[11px] text-cyan-300 hover:text-white flex items-center gap-1 px-2.5 py-1 rounded-xl bg-cyan-500/15 border border-cyan-500/30 hover:border-cyan-400 transition-all cursor-pointer font-semibold active:scale-95 shadow-sm"
                  title={t("Pick a random high-quality prompt")}
                >
                  <RefreshCw className="w-3 h-3 text-cyan-400" />
                  <span>{t("Surprise Me")}</span>
                </button>
              </div>
            </div>
            <textarea
              id="prompt-input"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t("Describe the 360° environment you want to generate (e.g. futuristic cyberpunk city at night with neon reflections, alpine mountain lake at sunrise, sci-fi orbital space station)...")}
              className="w-full px-4 py-3 bg-[#030c1c]/90 border border-cyan-500/25 rounded-2xl text-sm text-cyan-100 placeholder-cyan-500/40 focus:outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/20 transition-all resize-none shadow-inner"
            />
          </div>

          {/* Scene Templates */}
          <div className="relative z-10">
            <span className="text-[10px] text-cyan-400/80 uppercase font-mono font-bold block mb-1.5">
              {t("Scene templates:")}
            </span>
            <div className="studio-scene-templates flex flex-wrap gap-1.5">
              {QUICK_TRY_CHIPS.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setPrompt(chip.prompt);
                  }}
                  className="px-2.5 py-1 bg-cyan-950/40 hover:bg-cyan-900/70 border border-cyan-500/20 hover:border-cyan-400/50 rounded-xl text-[11px] text-cyan-200 hover:text-white transition-all cursor-pointer font-medium"
                >
                  {t(chip.label)}
                </button>
              ))}
            </div>
          </div>

          {/* Visual Style Selector */}
          <div className="space-y-2 relative z-10">
            <label htmlFor="environment-style" className="text-xs font-bold text-cyan-100">{t("Visual style (optional)")}</label>
            <select id="environment-style" value={selectedStyle} onChange={event => setSelectedStyle(event.target.value as StylePresetId)} className="studio-style-select">
              {STYLE_PRESETS.map(style => <option key={style.id} value={style.id}>{t(style.name)}</option>)}
            </select>
            <p className="text-xs text-slate-400">{t(STYLE_PRESETS.find(style => style.id === selectedStyle)?.description ?? '')}</p>
          </div>

          {/* Camera Viewpoint & Horizon Selector */}
          <div className="space-y-2 relative z-10">
            <label className="text-xs font-bold text-cyan-100 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t("Camera viewpoint (optional)")}</span>
            </label>
            <div role="group" aria-label={t("Camera viewpoint")} className="studio-camera-viewpoints grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {CAMERA_VIEWPOINTS.map((vp) => (
                <button
                  key={vp.id}
                  type="button"
                  aria-pressed={selectedViewpoint === vp.id}
                  onClick={() => setSelectedViewpoint(vp.id)}
                  className={`py-1.5 px-2 rounded-xl text-[11px] font-semibold border transition-all cursor-pointer text-center ${
                    selectedViewpoint === vp.id
                      ? 'bg-cyan-500/25 border-cyan-400 text-white shadow-sm shadow-cyan-400/20'
                      : 'bg-cyan-950/30 border-cyan-500/20 text-cyan-200/70 hover:text-white hover:border-cyan-400/40'
                  }`}
                  title={t(vp.desc)}
                >
                  {t(vp.name)}
                </button>
              ))}
            </div>
          </div>

          {/* Advanced options accordion (Negative Prompt, etc.) */}
          <div className="space-y-2 relative z-10">
            <button
              type="button"
              onClick={() => setIsAdvancedOpen(prev => !prev)}
              className="text-xs font-bold text-cyan-200/80 hover:text-cyan-100 flex items-center gap-1.5 transition-colors cursor-pointer py-1"
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t("Advanced generation options (optional)")}</span>
              <span className="text-[10px] text-cyan-400/60 font-mono">
                {isAdvancedOpen ? '▲' : '▼'}
              </span>
            </button>

            {isAdvancedOpen && (
              <div className="p-3 rounded-2xl bg-[#030e20]/80 border border-cyan-500/20 space-y-2.5 animate-in fade-in">
                <div className="space-y-1.5">
                  <label htmlFor="negative-prompt" className="text-[11px] font-semibold text-cyan-100 flex items-center justify-between">
                    <span>{t("Negative prompt (elements to avoid)")}</span>
                    {negativePrompt && (
                      <button
                        type="button"
                        onClick={() => setNegativePrompt('')}
                        className="text-[10px] text-cyan-400/60 hover:text-cyan-300 transition-colors cursor-pointer"
                      >
                        {t("Clear")}
                      </button>
                    )}
                  </label>
                  <input
                    id="negative-prompt"
                    type="text"
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    placeholder={t("e.g. split view, collage, seam line, distorted text, fisheye")}
                    className="w-full bg-[#020a17]/90 border border-cyan-500/25 rounded-xl px-3 py-2 text-xs text-white placeholder-cyan-400/35 focus:outline-none focus:border-cyan-400 transition-colors font-mono"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[10px] text-cyan-300/60 font-semibold">{t("Quick negative tags:")}</span>
                  {[
                    { label: t("No collage/split"), tag: 'split view, collage, multiple frames' },
                    { label: t("No seam lines"), tag: 'seam line, visible boundary, split seam' },
                    { label: t("No text/watermark"), tag: 'distorted text, watermark, signature' },
                    { label: t("No fisheye/borders"), tag: 'fisheye lens, black border, round vignette' },
                  ].map((tagItem) => (
                    <button
                      key={tagItem.label}
                      type="button"
                      onClick={() => {
                        setNegativePrompt(prev => {
                          const trimmed = prev.trim();
                          if (!trimmed) return tagItem.tag;
                          if (trimmed.includes(tagItem.tag)) return trimmed;
                          return `${trimmed}, ${tagItem.tag}`;
                        });
                      }}
                      className="text-[10px] px-2 py-0.5 rounded-lg bg-cyan-950/60 border border-cyan-500/20 text-cyan-200/80 hover:text-white hover:border-cyan-400/40 transition-colors cursor-pointer"
                    >
                      + {tagItem.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Resolution & Seam Correction Matrix */}
          <div className="space-y-3 pt-1 relative z-10">
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-cyan-100">{t("Requested resolution")}</span>
              <div role="group" aria-label={t("Requested resolution")} className="flex items-center gap-1 bg-[#030c1c] p-1 border border-cyan-500/20 rounded-xl">
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
              <p className="text-[10px] text-cyan-200/60">{t("The provider may return fewer pixels. Check the actual dimensions after generation. Non-2:1 images are center-cropped, never upscaled.")}</p>
            </div>

            <details className="studio-advanced">
              <summary>{t("Advanced: prompt keywords and seam blending")}</summary>
              <p className="text-xs font-bold text-cyan-100">{t("Prompt keywords")}</p>
              <div className="space-y-2 pt-1.5 border-t border-cyan-500/15 animate-in fade-in duration-150">
                {PROMPT_BUILDER_CATEGORIES.map((cat, idx) => (
                  <div key={idx} className="space-y-1">
                    <span className="text-[10px] uppercase font-mono font-bold text-cyan-400/70 block">
                      {t(cat.name)}:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {cat.tags.map((tag, tIdx) => (
                        <button
                          key={tIdx}
                          type="button"
                          onClick={() => handleAppendTag(tag)}
                          className="px-2 py-0.5 bg-cyan-950/70 hover:bg-cyan-900/80 border border-cyan-500/20 hover:border-cyan-400 text-cyan-200 hover:text-white rounded-lg text-[10px] font-medium transition-all cursor-pointer active:scale-95"
                        >
                          + {t(tag)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2 pt-3">
              <button
                type="button"
                aria-pressed={seamCorrection !== false}
                aria-label={t("Optional seam blending")}
                title={t("Auto blends detected hard boundaries; On always blends; Off keeps the edges unchanged. May cause ghosting.")}
                onClick={() => setSeamCorrection((prev) => prev === 'auto' ? false : prev === false ? true : 'auto')}
                className={`w-full py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                  seamCorrection
                    ? 'bg-teal-500/15 border-teal-400/60 text-teal-300 shadow-[0_0_15px_rgba(13,242,201,0.2)]'
                    : 'bg-[#030c1c] border-cyan-500/20 text-cyan-400/60 hover:text-cyan-200'
                }`}
              >
                <span>{seamCorrection === 'auto' ? t("Blending: Auto (detect edge mismatch)") : seamCorrection ? t("Blending: On") : t("Blending: Off")}</span>
                {seamCorrection && <CheckCircle2 className="w-3.5 h-3.5 text-teal-300" />}
              </button>
              <p className="text-[10px] text-cyan-200/60">{t("Auto detects and blends hard wrap boundaries. Smooth edges are preserved. Blending may cause ghosting and cannot reconstruct mismatched objects. The model original remains available.")}</p>
              </div>
            </details>
          </div>

          {/* API Error Notice */}
          {apiError && (
            <div role="alert" className="p-3 bg-red-950/60 border border-red-500/50 rounded-2xl text-xs text-red-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold">{t("Generation Notice:")}</p>
                <p className="text-xs leading-relaxed text-red-200 break-words">{t(apiError)}</p>
                {(apiError.includes('Insufficient credit') || apiError.startsWith(t('Insufficient credits.'))) && (
                  <button
                    type="button"
                    onClick={() => onNavigateTab('pricing')}
                    className="mt-2 px-3 py-1.5 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-cyan-500/25"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current" />
                   <span>{t("Add credits (from $4.99)")}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Active User Account & Balance Bar */}
          <div className="flex items-center justify-between text-[11px] text-cyan-300/80 px-1 pt-1">
            <span className="flex items-center gap-1">
              <span>{t("Account:")}</span>
              <strong className="text-white">{currentUser.name}</strong>
              <span className="uppercase text-[9px] px-1.5 py-0.2 bg-cyan-400/20 text-cyan-300 rounded font-bold font-mono">
                {t(currentUser.plan)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('pricing')}
              className="text-amber-300 hover:text-white font-mono flex items-center gap-1 cursor-pointer"
            >
              <Coins className="w-3 h-3 text-amber-400" />
              <span>{currentUser.creditsBalance} {t("credits left")}</span>
            </button>
          </div>

          {/* Primary Generate Button */}
          <div className="pt-2 relative z-10">
            {(currentUser.id.startsWith('usr_guest') || (currentUser.plan === 'free' && !currentUser.emailVerified)) && (
              <div id="studio-trial-notice" className="studio-trial-notice mb-3 text-xs text-cyan-200">
                <p className="font-semibold">{t('Before you generate')}</p>
                <p>{currentUser.id.startsWith('usr_guest')
                  ? t('Create an account and verify your email. Eligible accounts receive {credits} starter credits once; no subscription required.').replace('{credits}', () => String(billingConfig.freeMonthlyCredits))
                  : t('Verify your email before generating. Trial credits are subject to eligibility.')}</p>
                <button type="button" onClick={() => onNavigateTab('pricing')} className="mt-1 underline">{t('View plans')}</button>
              </div>
            )}
            <button
              type="button"
              disabled={isGenerating || isUpscalingClarity || (inputMode === 'image' && isLoadingSample)}
              onClick={handleGenerate}
              aria-describedby={currentUser.id.startsWith('usr_guest') || (currentUser.plan === 'free' && !currentUser.emailVerified) ? 'studio-trial-notice' : undefined}
              className="shimmer-btn w-full py-4 bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-black text-sm rounded-2xl shadow-xl shadow-cyan-400/35 hover:shadow-cyan-400/60 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer tracking-wide"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  <span>
                    {t("Generating —")} {generationElapsed} {t("s elapsed")}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 fill-current text-slate-950" />
                  <span>{t("Generate (")}{creditsCost} {t("Credits)")}</span>
                </>
              )}
            </button>
            {isGenerating && (
              <div className="mt-3 p-3.5 rounded-2xl bg-[#030e20]/95 border border-cyan-500/30 space-y-2.5 animate-in fade-in">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-mono text-cyan-300 font-bold flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                    </span>
                    <span>{t("AI Generation in progress")}</span>
                  </span>
                  <span className="font-mono text-cyan-300/80 text-[10px] bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-500/20">
                    {generationElapsed}s {t("elapsed")}
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-cyan-500/20 p-0.5">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 transition-all duration-700 ease-out rounded-full shadow-[0_0_12px_rgba(34,211,238,0.5)]"
                    style={{
                      width: `${Math.min(95, Math.max(15, generationElapsed < 5 ? 25 : generationElapsed < 14 ? 55 : generationElapsed < 24 ? 78 : 92))}%`
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-cyan-400/60 font-mono px-0.5">
                  <span>1. {t("Topology")}</span>
                  <span>2. {t("Diffusion")}</span>
                  <span>3. {t("Healing")}</span>
                </div>
                <p role="status" className="text-xs text-cyan-100 font-medium leading-relaxed pt-0.5">
                  {generationStage}
                </p>
              </div>
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
                <span className="font-bold text-white tracking-wide">{t("360° preview")}</span>
                <span className="text-cyan-400/60 hidden sm:inline">| {t('Drag to look around, scroll to zoom')}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {originalRawUrl && (
                  <button type="button" onClick={handleDownloadOriginal} className="text-[11px] text-cyan-200 underline cursor-pointer">
                    {t("Download model original")}
                  </button>
                )}
                <button type="button" onClick={() => onWorksOpenChange(true)} className="rounded-xl border border-cyan-400/40 px-3 py-2 text-sm text-cyan-200">{t("My works")}</button>
                <button type="button" disabled={isGenerating} onClick={() => setIsShareOpen(true)} className="rounded-xl border border-teal-400/40 bg-teal-400/10 px-3 py-2 text-sm font-semibold text-teal-200">{t("Share panorama")}</button>
                {/* Restore Original Button */}
                {originalRawUrl && originalRawUrl !== currentPanoramaUrl && (
                  <button
                    type="button"
                    onClick={handleRestoreOriginal}
                    className="flex items-center gap-1.5 text-[11px] text-amber-300 hover:text-white bg-amber-500/15 hover:bg-amber-500/25 px-2.5 py-1 rounded-full border border-amber-500/35 transition-all cursor-pointer font-bold active:scale-95 shadow-sm animate-in fade-in"
                    disabled={isGenerating || isUpscalingClarity}
                    title={t("View the uncropped model original; a non-2:1 source may look stretched in the sphere viewer")}
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t("View Original")}</span>
                  </button>
                )}

                {/* 4K Enhanced Badge */}
                {enhanced4kUrl && currentPanoramaUrl === enhanced4kUrl && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-400/20 text-cyan-200 border border-cyan-400/40 font-mono font-bold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-cyan-300" />
                    <span>{t("Lightly sharpened")}</span>
                  </span>
                )}

                <button
                  type="button"
                  disabled={isGenerating || isUpscalingClarity || currentPanoramaUrl === enhanced4kUrl}
                  onClick={handleEnhanceClarity}
                  className="flex items-center gap-1.5 text-[11px] text-cyan-300 hover:text-white bg-cyan-500/15 hover:bg-cyan-500/25 px-2.5 py-1 rounded-full border border-cyan-500/30 transition-all cursor-pointer font-semibold active:scale-95 shadow-sm disabled:opacity-50"
                  title={t("Light sharpening at the existing pixel dimensions; no upscaling or AI super-resolution")}
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>
                    {isUpscalingClarity
                      ? t("Enhancing...")
                      : t("Light sharpening")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleManualHealSeam}
                  disabled={isGenerating || isUpscalingClarity}
                  className="flex items-center gap-1.5 text-[11px] text-teal-300 hover:text-white bg-teal-500/15 hover:bg-teal-500/25 px-2.5 py-1 rounded-full border border-teal-500/30 transition-all cursor-pointer font-semibold active:scale-95 shadow-sm"
                  title={t("Optional edge blending. May create ghosting; it cannot reconstruct mismatched scene geometry.")}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                  <span>{t("Blend seam (optional)")}</span>
                </button>
                <button
                  type="button"
                  onClick={handleRepairPoles}
                  disabled={isGenerating || isUpscalingClarity}
                  className="flex items-center gap-1.5 text-[11px] text-indigo-300 hover:text-white bg-indigo-500/15 hover:bg-indigo-500/25 px-2.5 py-1 rounded-full border border-indigo-500/30 transition-all cursor-pointer font-semibold active:scale-95 shadow-sm"
                  title={t("Smooth zenith and nadir pole distortion")}
                >
                  <Compass className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{t("Smooth poles")}</span>
                </button>
                <button
                  type="button"
                  onClick={handleRoll180}
                  disabled={isGenerating || isUpscalingClarity}
                  className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border transition-all cursor-pointer font-semibold active:scale-95 shadow-sm ${
                    isRolled180
                      ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                      : 'text-amber-300 hover:text-white bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30'
                  }`}
                  title={t("Roll panorama 180° horizontally to inspect seam alignment down the center")}
                >
                  <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t("Inspect seam (180° roll)")}</span>
                </button>
              </div>
            </div>

            {resultQuality && resultQuality.url === currentPanoramaUrl && (
              <div role="status" className="px-5 py-3 border-b border-cyan-500/20 text-xs text-cyan-200">
                <p className="font-semibold">
                  {resultQuality.quality?.status === 'passed'
                    ? t('AI quality check passed')
                    : t('AI quality check was not performed for this image.')}
                  {resultQuality.quality?.status === 'passed' && resultQuality.quality.attempts > 1
                    ? ` · ${t('Passed after one retry')}` : ''}
                </p>
                {resultQuality.quality?.status === 'passed' && (
                  <p className="mt-1 text-cyan-200/70">{t('AI visual checks are probabilistic and do not guarantee a flawless panorama. Inspect the 360° preview.')}</p>
                )}
              </div>
            )}

            {isBundledPreview && (isPreviewActive || currentPanoramaUrl !== coastalCover) && <div className="studio-demo-notice px-5 py-3 text-xs text-cyan-200">
              <p>{t('Demo panorama — not generated from your prompt')}</p>
              <button type="button" className="mt-2 min-h-11 underline" onClick={() => onNavigateTab('showcase')}>{t('Browse public panoramas')}</button>
            </div>}

            {/* Feedback notification toast */}
            {feedbackNotice && (
              <div className="px-5 py-2 bg-gradient-to-r from-cyan-950/90 via-blue-950/90 to-cyan-950/90 border-b border-cyan-500/30 flex items-center justify-between text-xs text-cyan-200 animate-in fade-in duration-150">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <span className="font-medium text-white">{t(feedbackNotice)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFeedbackNotice(null)}
                  aria-label={t('Close notification')}
                  className="text-cyan-400 hover:text-white text-xs px-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) loadPreviewPanoramaFile(file);
              }}
              className="studio-preview-stage h-[490px] w-full relative bg-[#020712]"
            >
              {isPreviewActive || currentPanoramaUrl !== coastalCover ? (
                <SphereViewer textureUrl={currentPanoramaUrl} initialAutoRotate={false} className="w-full h-full" />
              ) : (
                <div className="studio-preview-placeholder">
                  <div className="studio-preview-orbit" aria-hidden="true"><Globe2 size={66} strokeWidth={0.7} /></div>
                  <span className="studio-coordinate">{t("A SPACE FOR POSSIBILITY")}</span>
                  <h3>{t("Your world goes here.")}</h3>
                  <p>{t("Generate a panorama to explore it here.")}<br />{t("Or explore the bundled 360° sample — no credits used.")}</p>
                  <button type="button" className="studio-secondary-action" onClick={handlePreviewSample}><Play size={15} aria-hidden="true" /> {t("Open 360° demo")}</button>
                  <button type="button" className="min-h-11 underline text-sm text-cyan-200" onClick={() => onNavigateTab('showcase')}>{t('Browse public panoramas')}</button>
                </div>
              )}
            </div>
          </div>

          {/* Multi-Format Export Action Bar */}
          {saveStatus && saveStatus.url === originalRawUrl && (
            <div role="status" className="studio-save-notice rounded-xl border border-cyan-400/40 bg-cyan-950/50 p-3 text-sm text-cyan-100">
              <p>{t(saveStatus.status === 'saved'
                ? 'The model original is saved in My works. Cropping and edits stay in this browser; download the current version to keep them.'
                : saveStatus.status === 'unsaved'
                  ? 'The model original is not saved in My works. Download the original and current version before leaving.'
                  : 'The model original save status is unknown. Download the original and current version before leaving.')}</p>
              <button type="button" onClick={handleDownloadOriginal} className="mt-2 underline">{t('Download model original')}</button>
              <button type="button" onClick={handleDownloadPng} className="ml-3 mt-2 underline">{t('Download current version')}</button>
            </div>
          )}
          <div className="studio-export-actions grid grid-cols-2 gap-3">
            {currentPanoramaUrl && currentPanoramaUrl !== coastalCover && (
              <button
                type="button"
                disabled={isGenerating}
                onClick={handleRemixScene}
                className="glass-card p-3 rounded-2xl text-left cursor-pointer group hover:border-cyan-400/50 transition-all col-span-2 bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-slate-900 border border-cyan-500/30 disabled:opacity-40"
              >
                <div className="flex items-center justify-between mb-1 text-cyan-300 group-hover:text-white">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-cyan-400/20 rounded-lg group-hover:scale-110 transition-transform text-cyan-300">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-white">{t("Remix scene")}</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 font-bold border border-cyan-500/30">
                    {t("Lock geometry")}
                  </span>
                </div>
                <div className="text-[10px] text-cyan-200/70">
                  {t("Use this panorama as a reference to change weather, lighting, or style while keeping the scene layout.")}
                </div>
              </button>
            )}
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
              <div className="text-xs font-bold text-white">{t("Download PNG")}</div>
              <div className="text-[10px] text-cyan-300/60 mt-0.5">{t("2:1 Equirectangular")}</div>
            </button>

            <button
              type="button"
              disabled={isGenerating}
              onClick={() => setIsShareOpen(true)}
              className="glass-card p-3.5 rounded-2xl text-left cursor-pointer hover:border-teal-400/50 transition-all"
            >
              <div className="text-xs font-bold text-white">{t('Share panorama')}</div>
            </button>
          </div>
          <details className="studio-export-options studio-advanced">
            <summary>{t('More export options')}</summary>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3">
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
              <div className="text-xs font-bold text-white">{t("Download VR JPG")}</div>
              <div className="text-[10px] text-cyan-300/60 mt-0.5">{t("PhotoSphere XMP Tagged")}</div>
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
              <div className="text-xs font-bold text-white">{t("Export .HDR")}</div>
              <div className="text-[10px] text-cyan-300/60 mt-0.5">{t("For Blender & Unreal")}</div>
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
              <div className="text-xs font-bold text-white">{t("Export Video")}</div>
              <div className="text-[10px] text-cyan-300/60 mt-0.5">{t("360° Orbit Animation")}</div>
            </button>

            <button
              type="button"
              onClick={() => setIsShareOpen(true)}
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
              <div className="text-xs font-bold text-white">{t("Embed on Web")}</div>
              <div className="text-[10px] text-cyan-300/60 mt-0.5">{t("Interactive 3D Sphere")}</div>
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
                  {t("6 Faces")}
                </span>
              </div>
              <div className="text-xs font-bold text-white">{t("Cubemap Slices")}</div>
              <div className="text-[10px] text-cyan-300/60 mt-0.5">{t("For Unity Skybox")}</div>
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
              <div className="text-xs font-bold text-white">{t("3D Globe")}</div>
              <div className="text-[10px] text-cyan-300/60 mt-0.5">{t("Planetary Orbit Simulator")}</div>
            </button>
            </div>
          </details>
        </div>
      </div>

      {/* =========================================================================
          FEATURE & COMMUNITY SHOWCASE SECTIONS
      ========================================================================= */}
      
      {/* 1. Community Showcase Gallery */}
      <ShowcaseGallery
        onSelectPanorama={(url, newPrompt, style) => {
          originalOwner.current = null;
          setOriginalRawUrl(null); setEnhanced4kUrl(null); setResultQuality(null); setSaveStatus(null); setWorkPrompt(null); setGenerationTiming(null);
          onPanoramaChange(url, null);
          setPrompt(newPrompt);
          setSelectedStyle(style);
          setIsPreviewActive(true);
        }}
        onTryPrompt={(newPrompt, style) => {
          setPrompt(newPrompt);
          setSelectedStyle(style);
          setFeedbackNotice(t("Showcase prompt applied! Customize or click Generate to create your version."));
          const promptInput = document.getElementById('prompt-input');
          if (promptInput) {
            promptInput.focus();
            promptInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
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

      <MyWorks isOpen={isWorksOpen} accountId={currentUser.id} onClose={() => onWorksOpenChange(false)} onOpen={async (original, share, signal, selectedPrompt) => {
        if (isGenerating) throw new Error(t('Wait for generation to finish before opening a work.'));
        const accountToken = localStorage.getItem('panorama_server_user_token');
        signal.throwIfAborted();
        if (localStorage.getItem('panorama_server_user_token') !== accountToken) throw new Error(t("Account changed. Reopen My works."));
        originalOwner.current = accountToken;
        setOriginalRawUrl(original); setEnhanced4kUrl(null); setResultQuality(null); setSaveStatus({ url: original, status: 'saved' }); setGenerationTiming(null); setWorkPrompt({ url: original, prompt: selectedPrompt }); onPanoramaChange(original, accountToken); setIsPreviewActive(true);
        if (share) setIsShareOpen(true);
      }} />
      <SharePanoramaModal isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} imageUrl={currentPanoramaUrl} prompt={isBundledPreview ? t('Demo panorama — not generated from your prompt') : workPrompt?.url === currentPanoramaUrl ? workPrompt.prompt : prompt} accountId={currentUser.id} />

      {/* Mobile Sticky Generation Bar */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#030e20]/95 backdrop-blur-xl border-t border-cyan-500/30 p-2.5 px-4 shadow-[0_-8px_30px_rgba(0,0,0,0.8)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {currentPanoramaUrl && currentPanoramaUrl !== coastalCover ? (
            <button
              type="button"
              onClick={() => {
                document.getElementById('studio-preview')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-2.5 py-1.5 rounded-lg bg-teal-500/15 border border-teal-400/40 text-teal-300 text-[11px] font-bold flex items-center gap-1 active:scale-95 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{t("360° preview")}</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-cyan-300 font-mono font-bold bg-cyan-950/60 px-2.5 py-1.5 rounded-xl border border-cyan-500/20">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>{creditsCost} {t("credits")}</span>
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={isGenerating}
          onClick={() => {
            if (!prompt.trim()) {
              const input = document.getElementById('prompt-input');
              input?.focus({ preventScroll: true });
              input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              return;
            }
            handleGenerate();
          }}
          className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-md ${
            isGenerating
              ? 'bg-cyan-950/60 border border-cyan-500/30 text-cyan-400'
              : 'shimmer-btn bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 text-slate-950 shadow-cyan-400/30'
          }`}
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>{t("Generating —")}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 fill-current" />
              <span>{prompt.trim() ? `${t("Generate (")}${creditsCost} ${t("Credits)")}` : t("Start creating")}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
