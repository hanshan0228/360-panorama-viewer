export type SupportedLang = 'en';

export interface TranslationDictionary {
  brandStudio: string;
  tools: string;
  studio: string;
  viewer: string;
  cubemap: string;
  globe: string;
  pricing: string;
  upgradePro: string;
  freeCredits: string;

  // Studio Workbench
  heroTitle: string;
  heroSubtitle: string;
  promptLabel: string;
  promptPlaceholder: string;
  enhanceAi: string;
  surpriseMe: string;
  promptHelperTitle: string;
  generateBtn: string;
  generating: string;

  // Actions
  downloadPng: string;
  downloadVrJpg: string;
  exportHdr: string;
  exportVideo: string;
  cubemapSlices: string;
  embedViewer: string;
  healSeam: string;
  enhanceClarity: string;
  restoreOriginal: string;

  // Embed Modal
  embedTitle: string;
  embedSubtitle: string;
  copyCode: string;
  codeCopied: string;
  includeBacklink: string;
  autoRotate: string;
}

export const TRANSLATIONS: Record<SupportedLang, TranslationDictionary> = {
  en: {
    brandStudio: 'AI 360° Panorama & VR Skybox Engine',
    tools: 'Tools',
    studio: 'Studio',
    viewer: '360° Viewer',
    cubemap: 'Cubemap',
    globe: '3D Globe',
    pricing: 'Pricing',
    upgradePro: 'Upgrade to Pro',
    freeCredits: '4 Free Trial Credits',

    heroTitle: 'AI 360° Panorama Generator',
    heroSubtitle: 'Turn text prompts or reference photos into seamless, VR-ready 2:1 equirectangular panoramas in seconds. Free to try — no credit card required.',
    promptLabel: 'Scene Description',
    promptPlaceholder: 'Describe the 360° environment you want to generate (e.g. futuristic cyberpunk city at night with neon reflections, alpine mountain lake at sunrise, sci-fi orbital space station)...',
    enhanceAi: 'Enhance with AI',
    surpriseMe: 'Surprise Me',
    promptHelperTitle: '360° Prompt Studio (Keyword Helper)',
    generateBtn: 'Generate',
    generating: 'Generating',

    downloadPng: 'Download PNG',
    downloadVrJpg: 'Download VR JPG',
    exportHdr: 'Export .HDR',
    exportVideo: 'Export Video',
    cubemapSlices: 'Cubemap Slices',
    embedViewer: 'Embed on Website',
    healSeam: 'Heal Seam',
    enhanceClarity: 'Enhance 4K Clarity',
    restoreOriginal: 'Restore Original',

    embedTitle: 'Embed Interactive 360° Viewer',
    embedSubtitle: 'Add this interactive 360° sphere directly to your WordPress, Webflow, Shopify, or portfolio site with responsive iframe embedding.',
    copyCode: 'Copy Embed Code',
    codeCopied: 'Embed Code Copied!',
    includeBacklink: 'Include "Powered by PanoramaAI" Badge',
    autoRotate: 'Enable Smooth Auto-Rotation',
  },
};

const LANG_STORAGE_KEY = 'panorama_user_lang';

export function getStoredLanguage(): SupportedLang {
  return 'en';
}

export function saveStoredLanguage(_lang: SupportedLang): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, 'en');
    document.documentElement.lang = 'en';
  } catch {
    // fallback
  }
}

export function useI18n(_lang?: SupportedLang): TranslationDictionary {
  return TRANSLATIONS.en;
}
