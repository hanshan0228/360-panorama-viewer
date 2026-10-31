import { lazy, Suspense, useState, useRef, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import './studio.css';
import { LANGUAGES, useLanguage, useTranslation } from './utils/i18n';
import { shellTranslations } from './utils/shellTranslations';
import { generatorMessages } from './utils/generatorTranslations';
import {
  Compass,
  Sparkles,
  Eye,
  Box,
  Globe2,
  CreditCard,
  Code2,
  Zap,
  Activity,
  ChevronDown,
  Coins,
  Wand2,
  ImagePlus,
  ShieldCheck,
  Sun,
  Gamepad2,
  Camera,
  Film,
} from 'lucide-react';
import type { ActiveTab, StylePresetId, ManagedUser } from './types/panorama';
import { GeneratorTab } from './components/GeneratorTab';
import { ViewerTab } from './components/ViewerTab';
import { MetadataInjectorModal } from './components/commercial/MetadataInjectorModal';
import { CheckoutModal } from './components/commercial/CheckoutModal';
import { UserAuthModal } from './components/commercial/UserAuthModal';
import {
  getCurrentUser,
  DEFAULT_GUEST_USER,
  setCurrentUserId,
  getStoredManagedUsers,
  saveStoredManagedUsers,
  saveStoredModelEndpoints,
  saveStoredRoutingConfig,
  getStoredBillingConfig,
  saveStoredBillingConfig,
  DEFAULT_BILLING_CONFIG,
} from './utils/adminStorage';
import samplePanoramaUrl from './assets/coastal-cover.png';
import { fetchServerUser, fetchPublicModelsConfig, fetchPublicBillingConfig } from './utils/commercialApi';
import { EmbedViewer } from './components/commercial/EmbedViewer';

const AdminTab = lazy(() => import('./components/AdminTab').then(module => ({ default: module.AdminTab })));
const PricingTab = lazy(() => import('./components/PricingTab').then(module => ({ default: module.PricingTab })));
const AiHdriGeneratorPage = lazy(() => import('./components/landing/AiHdriGeneratorPage').then(module => ({ default: module.AiHdriGeneratorPage })));
const HdriViewerPage = lazy(() => import('./components/landing/HdriViewerPage').then(module => ({ default: module.HdriViewerPage })));
const SkyboxGeneratorPage = lazy(() => import('./components/landing/SkyboxGeneratorPage').then(module => ({ default: module.SkyboxGeneratorPage })));
const PhotoTo360Page = lazy(() => import('./components/landing/PhotoTo360Page').then(module => ({ default: module.PhotoTo360Page })));
const CubemapGeneratorPage = lazy(() => import('./components/landing/CubemapGeneratorPage').then(module => ({ default: module.CubemapGeneratorPage })));
const MetadataInjectorPage = lazy(() => import('./components/landing/MetadataInjectorPage').then(module => ({ default: module.MetadataInjectorPage })));
const PhotoToVideoPage = lazy(() => import('./components/landing/PhotoToVideoPage').then(module => ({ default: module.PhotoToVideoPage })));
const ShowcasePage = lazy(() => import('./components/landing/ShowcasePage').then(module => ({ default: module.ShowcasePage })));
const PhotoToGlobePage = lazy(() => import('./components/landing/PhotoToGlobePage').then(module => ({ default: module.PhotoToGlobePage })));
const CubemapToEquirectPage = lazy(() => import('./components/landing/CubemapToEquirectPage').then(module => ({ default: module.CubemapToEquirectPage })));
const TextToPanoramaPage = lazy(() => import('./components/landing/TextToPanoramaPage').then(module => ({ default: module.TextToPanoramaPage })));
const DevelopersPage = lazy(() => import('./components/landing/DevelopersPage').then(module => ({ default: module.DevelopersPage })));

const GUIDE_LANGUAGES = [
  { code: 'zh', name: '简体中文' },
  { code: 'es', name: 'Español' },
  { code: 'de', name: 'Deutsch' },
  { code: 'ja', name: '日本語' },
];

function getInitialTabFromLocation(): ActiveTab {
  if (typeof window === 'undefined') return 'generator';
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();

  if (path.includes('ai-hdri-generator') || hash.includes('ai-hdri-generator')) return 'landing-hdri';
  if (path.includes('hdri-viewer') || hash.includes('hdri-viewer') || path.includes('hdri-to-cubemap')) return 'landing-hdri-viewer';
  if (path.includes('skybox-generator') || hash.includes('skybox-generator')) return 'landing-skybox';
  if (path.includes('photo-to-360-converter') || hash.includes('photo-to-360-converter')) return 'landing-photo360';
  if (path.includes('cubemap-generator') || hash.includes('cubemap-generator')) return 'landing-cubemap';
  if (path.includes('360-metadata-injector') || hash.includes('360-metadata-injector')) return 'landing-metadata';
  if (path.includes('360-photo-to-video') || hash.includes('360-photo-to-video') || path.includes('360-product-video-generator')) return 'landing-video';
  if (path.includes('cubemap-to-equirectangular') || hash.includes('cubemap-to-equirectangular')) return 'landing-cube2eq';
  if (path.includes('text-to-panorama') || hash.includes('text-to-panorama')) return 'landing-text2pano';
  if (path.includes('developers') || hash.includes('developers')) return 'developers';
  if (path.includes('360-image-maker') || hash.includes('360-image-maker')) return 'generator';
  if (path.includes('viewer') || hash.includes('viewer')) return 'viewer';
  if (path.includes('cubemap') || hash.includes('cubemap')) return 'landing-cubemap';
  if (path.includes('globe') || hash.includes('globe')) return 'globe';
  if (path.includes('pricing') || hash.includes('pricing')) return 'pricing';
  if (path.includes('showcase') || hash.includes('showcase')) return 'showcase';
  if (path.includes('admin') || hash.includes('admin')) return 'admin';
  return 'generator';
}

export function App() {
  const [lang, setLanguage] = useLanguage();
  const t = useTranslation(shellTranslations);
  const tg = useTranslation(generatorMessages);
  const withLanguage = (path: string) => {
    const url = new URL(path, window.location.origin);
    if (lang !== 'en') url.searchParams.set('lang', lang);
    return url.pathname + url.search + url.hash;
  };
  const [activeTab, setActiveTab] = useState<ActiveTab>(getInitialTabFromLocation);
  const [generatorVisited, setGeneratorVisited] = useState(activeTab === 'generator');
  const [isWorksOpen, setIsWorksOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  const languageGuidePath = ({
    generator: currentPath === '/' ? '/' : undefined,
    viewer: '/360-panorama-viewer/',
    globe: '/photo-to-globe/',
    cubemap: '/cubemap-generator/',
    'landing-cubemap': '/cubemap-generator/',
    'landing-photo360': '/photo-to-360-converter/',
  } as Partial<Record<ActiveTab, string>>)[activeTab];
  const [isToolsDropdownOpen, setIsToolsDropdownOpen] = useState(false);
  const [generatorInputMode, setGeneratorInputMode] = useState<'text' | 'image'>('text');
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
  const [studioPresetPrompt, setStudioPresetPrompt] = useState<string | undefined>(undefined);
  const [studioPresetStyle, setStudioPresetStyle] = useState<StylePresetId | undefined>(undefined);
  const toolsDropdownRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Active user and modal states
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const [currentPanoramaUrl, setCurrentPanoramaUrl] = useState<string>(() => {
    const panoFromQuery = new URLSearchParams(window.location.search).get('pano');
    return panoFromQuery && (panoFromQuery.startsWith('http://') || panoFromQuery.startsWith('https://')) ? panoFromQuery : samplePanoramaUrl;
  });
  const panoramaOwner = useRef<string | null>(null);
  const [viewerSession, setViewerSession] = useState(0);
  const [billingConfig, setBillingConfig] = useState(getStoredBillingConfig);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(() => new URLSearchParams(window.location.search).has('paypal'));
  const [verificationToken, setVerificationToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('verify-email') || '');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(() => Boolean(new URLSearchParams(window.location.hash.slice(1)).get('verify-email')));
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authNotice, setAuthNotice] = useState<'login' | 'register' | ''>('');
  const [authModalNotice, setAuthModalNotice] = useState('');
  const [checkoutSelection, setCheckoutSelection] = useState<{ plan: 'pro' | 'enterprise'; cycle: 'monthly' | 'yearly' }>({ plan: 'pro', cycle: 'monthly' });
  const [pendingCheckout, setPendingCheckout] = useState<typeof checkoutSelection | null>(null);

  const updateCurrentUser = (user: ManagedUser) => {
    const users = getStoredManagedUsers();
    const existingIdx = users.findIndex(entry => entry.id === user.id);
    if (existingIdx !== -1) users[existingIdx] = user;
    else users.unshift(user);
    saveStoredManagedUsers(users);
    if (user.id === 'usr_guest') {
      try { localStorage.setItem('panorama_guest_user_data', JSON.stringify(user)); } catch {}
    }
    setCurrentUserId(user.id);
    setCurrentUser(user);
  };

  const handleChoosePlan = (plan: 'pro' | 'enterprise', cycle: 'monthly' | 'yearly') => {
    const selection = { plan, cycle };
    if (currentUser.id === 'usr_guest' || currentUser.id.startsWith('usr_guest_') || !localStorage.getItem('panorama_server_user_token')) {
      setAuthMode('login');
      setPendingCheckout(selection);
      setIsCheckoutModalOpen(false);
      setIsAuthModalOpen(true);
      return;
    }
    setCheckoutSelection(selection);
    setIsCheckoutModalOpen(true);
  };

  const handleAuthSuccess = (user: ManagedUser, action?: 'login' | 'register') => {
    updateCurrentUser(user);
    if (action) setAuthNotice(action);
    if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
      if (action === 'register') (window as any).gtag('event', 'sign_up', { method: 'email' });
      else if (action === 'login') (window as any).gtag('event', 'login', { method: 'email' });
    }
    if (pendingCheckout && !user.id.startsWith('usr_guest')) {
      setCheckoutSelection(pendingCheckout);
      setPendingCheckout(null);
      setIsCheckoutModalOpen(true);
    }
  };

  const handleCloseAuth = () => {
    setVerificationToken('');
    setAuthModalNotice('');
    setIsAuthModalOpen(false);
    setPendingCheckout(null);
  };

  useEffect(() => {
    let active = true;
    let userRequest = 0;
    const refreshUser = () => {
      setCurrentUser(getCurrentUser());
      setBillingConfig(getStoredBillingConfig());
    };
    refreshUser();
    // 启动时从云端同步管理员配置的公共模型端点与调度策略
    fetchPublicModelsConfig().then((cloudModels) => {
      if (active && cloudModels && Array.isArray(cloudModels.endpoints)) {
        saveStoredModelEndpoints(cloudModels.endpoints);
        if (cloudModels.routingConfig) {
          saveStoredRoutingConfig(cloudModels.routingConfig);
        }
      }
    });

    fetchPublicBillingConfig().then(config => {
      if (!active || !config) return;
      const merged = { ...DEFAULT_BILLING_CONFIG, ...config };
      saveStoredBillingConfig(merged);
      setBillingConfig(merged);
    });

    const applyUser = (u: any) => {
      const managed: ManagedUser = {
        id: u.id,
        name: u.name,
        email: u.email,
        plan: u.plan,
        creditsBalance: u.creditsBalance ?? u.credits_balance ?? 0,
        creditsTotal: u.creditsTotal ?? u.credits_total ?? 0,
        emailVerified: u.emailVerified === true,
        status: u.status || 'active',
        joinedAt: u.createdAt || new Date().toISOString().split('T')[0],
        lastActiveAt: 'Just now',
        apiCallsCount: u.apiCallsCount || 0,
      };
      updateCurrentUser(managed);
    };

    const refreshPaymentUser = () => {
      const token = localStorage.getItem('panorama_server_user_token');
      if (!token) return;
      const request = ++userRequest;
      const userId = getCurrentUser().id;
      fetchServerUser(token).then(result => {
        if (active && request === userRequest && getCurrentUser().id === userId && localStorage.getItem('panorama_server_user_token') === token && result.success && result.user) applyUser(result.user);
      });
    };
    window.addEventListener('panorama-payment-updated', refreshPaymentUser);
    window.addEventListener('panorama-user-refresh', refreshPaymentUser);

    const initializeGuest = () => {
      applyUser({ ...DEFAULT_GUEST_USER });
    };

    const synchronizeSession = () => {
      const token = localStorage.getItem('panorama_server_user_token');
      const request = ++userRequest;
      const userId = getCurrentUser().id;
      if (!token) {
        initializeGuest();
        return;
      }
      fetchServerUser(token).then((res) => {
        if (!active || request !== userRequest || getCurrentUser().id !== userId || localStorage.getItem('panorama_server_user_token') !== token) return;
        if (res.success && res.user) {
          applyUser(res.user);
        } else if (res.status === 401 || res.status === 404) {
          if (typeof localStorage !== 'undefined') localStorage.removeItem('panorama_server_user_token');
          window.dispatchEvent(new Event('panorama-session-changed'));
        }
      });
    };
    const handleSessionChange = () => {
      setIsWorksOpen(false);
      if (panoramaOwner.current && panoramaOwner.current !== localStorage.getItem('panorama_server_user_token')) {
        panoramaOwner.current = null;
        setCurrentPanoramaUrl(samplePanoramaUrl);
        setViewerSession(value => value + 1);
      }
      refreshUser();
      synchronizeSession();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'panorama_server_user_token' || event.key === null) handleSessionChange();
    };
    synchronizeSession();
    window.addEventListener('panorama-session-changed', handleSessionChange);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', refreshUser);
    const handleOpenAuth = (e?: Event) => {
      const custom = e as CustomEvent<{ mode?: 'login' | 'register'; notice?: string }> | undefined;
      setAuthMode(custom?.detail?.mode || 'login');
      setAuthModalNotice(custom?.detail?.notice || '');
      setIsAuthModalOpen(true);
    };
    window.addEventListener('panorama-open-auth', handleOpenAuth);
    return () => {
      active = false;
      window.removeEventListener('panorama-payment-updated', refreshPaymentUser);
      window.removeEventListener('panorama-user-refresh', refreshPaymentUser);
      window.removeEventListener('panorama-session-changed', handleSessionChange);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', refreshUser);
      window.removeEventListener('panorama-open-auth', handleOpenAuth);
    };
  }, [activeTab]);

  useEffect(() => {
    if (verificationToken) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, [verificationToken]);

  // Dynamic SEO metadata synchronization across active tabs & landing pages
  useEffect(() => {
    const tabSeoMap: Record<ActiveTab, { title: string; desc: string }> = {
      generator: {
        title: '360 Panorama Viewer Online — Free Viewer & AI Generator',
        desc: 'View 360° photos locally for free, with no upload or signup. Generate panoramas from text or reference photos using AI credits.',
      },
      viewer: {
        title: 'Panorama Viewer — Free Online 360° Photo Viewer, No Upload',
        desc: 'Free online panorama viewer and 360° photo viewer: open equirectangular photos or Photo Spheres in WebGL with Little Planet, cardboard VR, hotspots. No upload, no signup.',
      },
      cubemap: {
        title: 'Free Cubemap Generator — Panorama to 6 Faces Online',
        desc: 'Convert a 2:1 panorama to six PNG cube faces online. Free local cubemap generator with sample panoramas, ZIP export and Unity skybox setup. No signup.',
      },
      globe: {
        title: 'Map to Globe — Free Image to 3D Globe Maker, No Upload',
        desc: 'Convert any 2D map, flat world image, or 360° panorama into an interactive rotating 3D globe. Free online MapToGlobe alternative with real-time WebGL atmosphere glow, wireframe toggle, and rotation speed controls. Zero upload required.',
      },
      pricing: {
        title: 'Pricing & Credit Plans | 360 Panorama Viewer Pro',
        desc: 'Transparent credit-based pricing for AI 360 panorama generation. Starter credits for eligible verified accounts, Pro subscriptions with full commercial license.',
      },
      showcase: {
        title: '360 Panorama Showcase — Real 360° Photo & VR Skybox Examples',
        desc: 'Browse a community showcase of real equirectangular 360° panoramas and VR skyboxes, published by their creators. Open any example in the free browser-based panorama viewer.',
      },
      admin: {
        title: 'Admin Console | 360 Panorama Viewer',
        desc: 'Model endpoint routing, usage quotas, and system administration console for 360 Panorama Viewer.',
      },
      'landing-hdri': {
        title: 'AI HDRI Generator | Free 360° HDR for Blender & Unreal (No Upload)',
        desc: 'Generate photorealistic 360° high dynamic range lighting maps and panoramic skyboxes in seconds. 4K equirectangular textures, seamless 360° wrap, and 32-bit Radiance .HDR export for Blender and Unreal Engine. No upload needed.',
      },
      'landing-skybox': {
        title: 'AI Skybox Generator — Free 360° VR Skybox, Unity & Unreal Ready',
        desc: 'Craft panoramic 360° skyboxes and game environments from text prompts or concept art in seconds. Instant 6-sided cubemap slicing (+X, -X, +Y, -Y, +Z, -Z) and equirectangular export for Unity and Unreal Engine. Free online, no upload required.',
      },
      'landing-photo360': {
        title: 'Photo to 360° Panorama Converter | Free Online Equirectangular AI',
        desc: 'Transform standard 2D photos, architectural concept renders, or scenery snapshots into immersive 360° equirectangular panoramas. Multi-reference AI style and spatial expansion with seamless 360° wrap. Free online tool.',
      },
      'landing-cubemap': {
        title: 'Free Cubemap Generator — Panorama to 6 Faces Online',
        desc: 'Convert a 2:1 panorama to six PNG cube faces online. Free local cubemap generator with sample panoramas, ZIP export and Unity skybox setup. No signup.',
      },
      'landing-metadata': {
        title: 'Free 360° Photo Metadata Injector | Facebook & Google Street View Ready',
        desc: 'Embed official Google PhotoSphere XMP and EXIF metadata into any equirectangular JPG image directly in your browser. Fix flat panorama upload issues on Facebook, Google Street View, and VR headsets.',
      },
      'landing-video': {
        title: '360° Photo to Video Generator | Turn Panoramas into Rotating Videos',
        desc: 'Convert any 360° equirectangular photo into a cinematic rotating MP4/WebM video in seconds. Perfect for TikTok, Instagram Reels, YouTube Shorts, and Amazon 360 product showcases.',
      },
      'landing-cube2eq': {
        title: 'Cubemap to Equirectangular Converter — Free 2:1 Panorama Maker',
        desc: 'Turn 6 cube faces (posx, negx, posy, negy, posz, negz) back into one seamless 2:1 equirectangular 360° panorama. Free online, client-side, PNG export up to 4096×2048.',
      },
      'landing-hdri-viewer': {
        title: 'HDRI Viewer — Open .HDR Files Online & Export Cubemap Faces',
        desc: 'Free HDRI viewer: open .hdr files locally, adjust exposure and export a tone-mapped PNG or six cube faces. No account, no upload. Up to 8K.',
      },
      'landing-text2pano': {
        title: 'Text to Panorama AI — Free 360° Prompt Generator Online',
        desc: 'Describe a scene and get a seamless 2:1 equirectangular 360° panorama. Free text to panorama AI with a copy-ready prompt library, seam healing, cubemap slicing and .HDR export.',
      },
      developers: {
        title: 'Developer Docs — 360° Panorama Embed & Free JSON API',
        desc: 'Embed an interactive 360° panorama with one iframe, or use the free JSON API: generate panoramas, publish shares, and read images for galleries, AI agents and MCP tools.',
      },
    };

    // Special override if current pathname is 360-image-maker
    const isImageMakerPath = currentPath.includes('360-image-maker');

    const routeSeoMap: Record<string, { title: string; desc: string; slug: string }> = {
      '/hdri-to-cubemap/': {
        title: 'HDRI to Cubemap Converter — Convert .HDR to 6 PNG Faces',
        desc: 'Decode a Radiance .hdr panorama, adjust exposure, and export six tone-mapped PNG cube faces as a ZIP. Free, local processing. OpenEXR is not supported.',
        slug: 'hdri-to-cubemap/',
      },
      '/360-product-video-generator/': {
        title: '360 Panorama Showcase Video Generator — Free Browser Export',
        desc: 'Turn a 2:1 panorama into a panning showcase video for a store, portfolio or social feed. Free local MP4 or WebM export, depending on browser support.',
        slug: '360-product-video-generator/',
      },
    };
    const routeSeo = routeSeoMap[`${currentPath.replace(/\/$/, '')}/`];
    const target = routeSeo ?? (isImageMakerPath
      ? {
          title: '360 Image Maker — Free AI 360° Image Creator Online (No Upload)',
          desc: 'Create seamless 360° equirectangular panoramas and VR images from text prompts or 2D photos in seconds. Free online 360 image maker with WebGL preview, harmonic seam healing, and 4K HDR export. No upload needed.',
        }
      : tabSeoMap[activeTab] || tabSeoMap.generator);

    document.title = target.title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', target.desc);
    }
    for (const selector of ['meta[name="title"]', 'meta[property="og:title"]', 'meta[name="twitter:title"]']) {
      document.querySelector(selector)?.setAttribute('content', target.title);
    }
    for (const selector of ['meta[property="og:description"]', 'meta[name="twitter:description"]']) {
      document.querySelector(selector)?.setAttribute('content', target.desc);
    }

    const canonicalLink = document.querySelector('link[rel="canonical"]');
    if (canonicalLink) {
      const slugMap: Partial<Record<ActiveTab, string>> = {
        'landing-hdri': 'ai-hdri-generator/',
        'landing-skybox': 'skybox-generator/',
        'landing-photo360': 'photo-to-360-converter/',
        'landing-cubemap': 'cubemap-generator/',
        cubemap: 'cubemap-generator/',
        'landing-metadata': '360-metadata-injector/',
        'landing-video': '360-photo-to-video/',
        'landing-cube2eq': 'cubemap-to-equirectangular/',
        'landing-hdri-viewer': 'hdri-viewer/',
        'landing-text2pano': 'text-to-panorama-ai/',
        developers: 'developers/',
        viewer: '360-panorama-viewer/',
        globe: 'photo-to-globe/',
        showcase: 'showcase/',
      };
      let slug = slugMap[activeTab] || '';
      if (isImageMakerPath) {
        slug = '360-image-maker/';
      }
      const canonicalUrl = `https://360panoramaviewer.com/${routeSeo?.slug ?? slug}`;
      canonicalLink.setAttribute('href', canonicalUrl);
      document.querySelector('meta[property="og:url"]')?.setAttribute('content', canonicalUrl);
      document.querySelector('meta[name="twitter:url"]')?.setAttribute('content', canonicalUrl);
    }

    if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
      (window as any).gtag('event', 'page_view', {
        page_title: document.title,
        page_location: window.location.origin + window.location.pathname,
        page_path: window.location.pathname,
      });
    }
  }, [activeTab, currentPath]);

  // Synchronize history & popstate for browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const tab = getInitialTabFromLocation();
      if (tab === 'generator') setGeneratorVisited(true);
      else setIsWorksOpen(false);
      setActiveTab(tab);
      setCurrentPath(window.location.pathname);
      const token = new URLSearchParams(window.location.hash.slice(1)).get('verify-email');
      if (token) { setVerificationToken(token); setIsAuthModalOpen(true); }
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  const navigateTo = (tab: ActiveTab, pushPath?: string) => {
    if (tab === 'cubemap') tab = 'landing-cubemap';
    if (tab === 'generator') setGeneratorVisited(true);
    else setIsWorksOpen(false);
    setActiveTab(tab);
    setIsToolsDropdownOpen(false);
    if (typeof window !== 'undefined' && window.scrollY > 0) {
      window.scrollTo(0, 0);
    }

    const targetPath = pushPath || (() => {
      switch (tab) {
        case 'landing-hdri': return '/ai-hdri-generator/';
        case 'landing-skybox': return '/skybox-generator/';
        case 'landing-photo360': return '/photo-to-360-converter/';
        case 'landing-cubemap': return '/cubemap-generator/';
        case 'landing-metadata': return '/360-metadata-injector/';
        case 'landing-video': return '/360-photo-to-video/';
        case 'landing-cube2eq': return '/cubemap-to-equirectangular/';
        case 'landing-hdri-viewer': return '/hdri-viewer/';
        case 'landing-text2pano': return '/text-to-panorama-ai/';
        case 'developers': return '/developers/';
        case 'generator': return '/';
        case 'viewer': return '/360-panorama-viewer/';
        case 'globe': return '/photo-to-globe/';
        case 'pricing': return '/#pricing';
        case 'showcase': return '/showcase/';
        case 'admin': return '/#admin';
        default: return '/';
      }
    })();

    const targetUrl = new URL(targetPath, window.location.origin);
    if (lang !== 'en') targetUrl.searchParams.set('lang', lang);
    const localizedPath = targetUrl.pathname + targetUrl.search + targetUrl.hash;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== localizedPath) {
      window.history.pushState(null, '', localizedPath);
    }
    if (typeof setCurrentPath === 'function') {
      setCurrentPath(window.location.pathname);
    }
  };

  const handleRouteLink = (event: ReactMouseEvent<HTMLAnchorElement>, tab: ActiveTab, path: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateTo(tab, path);
  };

  // Close dropdown on outside click or escape
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (toolsDropdownRef.current && !toolsDropdownRef.current.contains(e.target as Node)) {
        setIsToolsDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsToolsDropdownOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const handleMouseEnterTools = () => {
    // 仅在真实桌面鼠标 hover 环境下触发，杜绝移动端 tap 产生的虚假 mouseenter 导致菜单取反闪退
    if (typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsToolsDropdownOpen(true);
    }
  };

  const handleMouseLeaveTools = () => {
    closeTimerRef.current = setTimeout(() => {
      setIsToolsDropdownOpen(false);
    }, 180);
  };

  const handleSelectTextTo360 = () => {
    setGeneratorInputMode('text');
    navigateTo('generator', '/360-image-maker/');
    setTimeout(() => {
      const el = document.getElementById('prompt-input');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (el as HTMLTextAreaElement).focus();
      }
    }, 60);
  };

  const handleSelectImageToPano = () => {
    setGeneratorInputMode('image');
    navigateTo('generator', '/360-image-maker/');
    setTimeout(() => {
      const el = document.getElementById('reference-uploader') || document.getElementById('studio-generator-workbench');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-cyan-400');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-cyan-400');
        }, 1200);
      }
    }, 60);
  };

  const handleSelectViewer = () => {
    navigateTo('viewer', '/360-panorama-viewer/');
  };

  const handleSelectCubemap = () => {
    navigateTo('landing-cubemap', '/cubemap-generator/');
  };

  const handleSelectGlobe = () => {
    navigateTo('globe', '/photo-to-globe/');
  };

  const isEmbedMode = typeof window !== 'undefined' && (
    window.location.search.includes('embed=true') || window.location.hash.includes('embed')
  );

  if (isEmbedMode) {
    return <EmbedViewer textureUrl={currentPanoramaUrl} autoRotate={new URLSearchParams(window.location.search).get('autorotate') === '1'} />;
  }

  return (
    <div className={`min-h-screen bg-[#040c1a] text-sky-100 flex flex-col relative overflow-hidden bg-grid-cyber selection:bg-cyan-500/30 selection:text-white ${activeTab !== 'admin' ? 'studio-shell' : ''}`}>
      {/* Dynamic Ambient Aurora Glows */}
      <div aria-hidden="true" className="studio-ambient fixed inset-0 pointer-events-none overflow-hidden z-0 will-change-transform">
        <div
          className="absolute -top-32 left-1/4 w-[750px] h-[750px] bg-cyan-500/20 rounded-full blur-[120px]"
        />
        <div
          className="absolute top-1/3 -right-24 w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[130px]"
        />
        <div
          className="absolute -bottom-24 left-1/3 w-[650px] h-[650px] bg-teal-400/16 rounded-full blur-[120px]"
        />
      </div>

      {activeTab !== 'admin' && (
        <a className="studio-skip-link" href="#studio-main" onClick={(event) => {
          event.preventDefault();
          document.getElementById('studio-main')?.focus();
        }}>{t("Skip to workspace")}</a>
      )}
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-[#040e22]/90 backdrop-blur-2xl border-b border-cyan-500/20 shadow-[0_4px_35px_rgba(0,242,254,0.12)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 relative z-10">
          {/* Logo & Brand */}
          <a
            href={withLanguage("/")}
            onClick={(event) => handleRouteLink(event, 'generator', '/')}
            aria-label={t("360 Panorama Viewer home")}
            aria-current={activeTab === 'generator' && currentPath === '/' ? 'page' : undefined}
            className="studio-brand flex items-center gap-3 cursor-pointer group shrink-0"
          >
            <div className="relative p-2.5 bg-gradient-to-tr from-cyan-400 via-teal-400 to-blue-600 rounded-2xl text-slate-950 shadow-lg shadow-cyan-500/30 group-hover:shadow-cyan-400/60 group-hover:scale-105 transition-all duration-300">
              <Compass className="w-5 h-5 transition-transform duration-500 group-hover:rotate-45 font-bold" />
              <div className="absolute inset-0 rounded-2xl bg-white/25 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-base tracking-tight bg-gradient-to-r from-white via-cyan-100 to-cyan-400 bg-clip-text text-transparent">
                  360 Panorama
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-cyan-400/15 border border-cyan-400/40 text-cyan-300 rounded-md font-bold tracking-wider shadow-sm">
                  VIEWER
                </span>
              </div>
              <div className="text-[10px] text-cyan-300/70 hidden sm:flex items-center gap-1.5 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#00F2FE]" />
                <span>{t("AI 360° Generator, Free Viewer & VR Skybox")}</span>
              </div>
            </div>
          </a>

          {/* Navigation Links with Tools Dropdown */}
          <nav aria-label={t("Main navigation")} className="flex items-center gap-1 bg-[#06152d]/90 border border-cyan-500/25 p-1.5 rounded-2xl backdrop-blur-xl shadow-inner overflow-visible">
            {/* Tools Mega Dropdown */}
            <div
              ref={toolsDropdownRef}
              className="relative"
              onMouseEnter={handleMouseEnterTools}
              onMouseLeave={handleMouseLeaveTools}
            >
              <button
                type="button"
                aria-expanded={isToolsDropdownOpen}
                aria-controls="studio-tools-menu"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setIsToolsDropdownOpen(false);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsToolsDropdownOpen((prev) => !prev);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer border ${
                  isToolsDropdownOpen
                    ? 'bg-cyan-500/20 text-white border-cyan-400/40 shadow-sm'
                    : 'text-cyan-200/80 hover:text-white hover:bg-cyan-500/10 border-transparent'
                }`}
              >
                <span>{t("Tools")}</span>
                <ChevronDown
                  className={`w-3 h-3 text-cyan-400 transition-transform duration-200 ${
                    isToolsDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Tools Dropdown Card with zero-gap hitbox */}
              {isToolsDropdownOpen && (
                <div id="studio-tools-menu" onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setIsToolsDropdownOpen(false);
                    toolsDropdownRef.current?.querySelector('button')?.focus();
                  }
                }} className="absolute top-full left-0 pt-2 w-[340px] sm:w-[600px] z-50">
                  {/* Invisible Bridge above panel to prevent hover flickering */}
                  <div className="absolute -top-2 left-0 right-0 h-4 pointer-events-auto" />
                  <div className="bg-[#020b18]/95 border border-cyan-400/35 rounded-2xl p-4 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Col 1: Studio & Direct Tools */}
                    <div className="space-y-1.5">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-cyan-400/70 px-2 pb-1 flex items-center justify-between border-b border-cyan-500/15">
                        <span>{t("AI Studio Creators")}</span>
                        <span className="text-[9px] font-mono text-cyan-500">{t("Interactive")}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleSelectTextTo360}
                        className="w-full px-2.5 py-1.5 rounded-xl hover:bg-cyan-950/80 hover:border hover:border-cyan-500/30 text-left flex items-center gap-2.5 text-xs text-white transition-all cursor-pointer group"
                      >
                        <div className="p-1.5 rounded-lg bg-cyan-500/15 text-cyan-400 group-hover:bg-cyan-500/30 group-hover:text-cyan-200 transition-colors">
                          <Wand2 className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-semibold text-xs text-white group-hover:text-cyan-200 transition-colors">
                            {t("AI Text to 360 Panorama")}
                          </div>
                          <div className="text-[10px] text-cyan-300/60">{t("Generate from prompt")}</div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={handleSelectImageToPano}
                        className="w-full px-2.5 py-1.5 rounded-xl hover:bg-cyan-950/80 hover:border hover:border-cyan-500/30 text-left flex items-center gap-2.5 text-xs text-white transition-all cursor-pointer group"
                      >
                        <div className="p-1.5 rounded-lg bg-teal-500/15 text-teal-400 group-hover:bg-teal-500/30 group-hover:text-teal-200 transition-colors">
                          <ImagePlus className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-semibold text-xs text-white group-hover:text-teal-200 transition-colors">
                            {t("AI Image to 360 Pano")}
                          </div>
                          <div className="text-[10px] text-cyan-300/60">{t("Steer with up to 3 photos")}</div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={handleSelectViewer}
                        className="w-full px-2.5 py-1.5 rounded-xl hover:bg-cyan-950/80 hover:border hover:border-cyan-500/30 text-left flex items-center gap-2.5 text-xs text-white transition-all cursor-pointer group"
                      >
                        <div className="p-1.5 rounded-lg bg-teal-500/15 text-teal-400 group-hover:bg-teal-500/30 group-hover:text-teal-200 transition-colors">
                          <Eye className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-semibold text-xs text-white group-hover:text-teal-200 transition-colors">
                            {t("360° VR WebGL Viewer")}
                          </div>
                          <div className="text-[10px] text-cyan-300/60">{t("Inspect, cardboard VR, radar")}</div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={handleSelectCubemap}
                        className="w-full px-2.5 py-1.5 rounded-xl hover:bg-cyan-950/80 hover:border hover:border-cyan-500/30 text-left flex items-center gap-2.5 text-xs text-white transition-all cursor-pointer group"
                      >
                        <div className="p-1.5 rounded-lg bg-cyan-500/15 text-cyan-400 group-hover:bg-cyan-500/30 group-hover:text-cyan-200 transition-colors">
                          <Box className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-semibold text-xs text-white group-hover:text-cyan-200 transition-colors">
                            {t("Cubemap 6-Sided Slicer")}
                          </div>
                          <div className="text-[10px] text-cyan-300/60">{t("Export ZIP for game engines")}</div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={handleSelectGlobe}
                        className="w-full px-2.5 py-1.5 rounded-xl hover:bg-cyan-950/80 hover:border hover:border-cyan-500/30 text-left flex items-center gap-2.5 text-xs text-white transition-all cursor-pointer group"
                      >
                        <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 group-hover:bg-emerald-500/30 group-hover:text-emerald-200 transition-colors">
                          <Globe2 className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-semibold text-xs text-white group-hover:text-emerald-200 transition-colors">
                            {t("3D Planetary Globe")}
                          </div>
                          <div className="text-[10px] text-cyan-300/60">{t("Orbital sphere projection")}</div>
                        </div>
                      </button>
                    </div>

                    {/* Col 2: Programmatic Tools & Sub-Pages */}
                    <div className="space-y-1.5">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-cyan-400/70 px-2 pb-1 flex items-center justify-between border-b border-cyan-500/15">
                        <span>{t("Specialized Tools")}</span>
                        <span className="text-[9px] font-mono text-teal-400">{t("Create & Convert")}</span>
                      </div>
                      <a
                        href={withLanguage("/ai-hdri-generator/")}
                        onClick={(event) => handleRouteLink(event, 'landing-hdri', '/ai-hdri-generator/')}
                        className="w-full px-2.5 py-1.5 rounded-xl hover:bg-cyan-950/80 hover:border hover:border-cyan-500/30 text-left flex items-center gap-2.5 text-xs text-white transition-all cursor-pointer group"
                      >
                        <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400 group-hover:bg-amber-500/30 group-hover:text-amber-200 transition-colors">
                          <Sun className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-semibold text-xs flex items-center gap-1.5 text-white group-hover:text-amber-200 transition-colors">
                            <span>{t("AI HDRI Generator")}</span>
                            <span className="text-[9px] px-1 py-0.2 bg-amber-400/20 text-amber-300 rounded font-mono font-bold">
                              Blender
                            </span>
                          </div>
                          <div className="text-[10px] text-cyan-300/60">{t("32-bit IBL lighting environments")}</div>
                        </div>
                      </a>

                      <a
                        href={withLanguage("/skybox-generator/")}
                        onClick={(event) => handleRouteLink(event, 'landing-skybox', '/skybox-generator/')}
                        className="w-full px-2.5 py-1.5 rounded-xl hover:bg-cyan-950/80 hover:border hover:border-cyan-500/30 text-left flex items-center gap-2.5 text-xs text-white transition-all cursor-pointer group"
                      >
                        <div className="p-1.5 rounded-lg bg-indigo-500/15 text-indigo-400 group-hover:bg-indigo-500/30 group-hover:text-indigo-200 transition-colors">
                          <Gamepad2 className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-semibold text-xs flex items-center gap-1.5 text-white group-hover:text-indigo-200 transition-colors">
                            <span>{t("AI Skybox Generator")}</span>
                            <span className="text-[9px] px-1 py-0.2 bg-indigo-400/20 text-indigo-300 rounded font-mono font-bold">
                              VR &bull; Unity
                            </span>
                          </div>
                          <div className="text-[10px] text-cyan-300/60">{t("Panoramic game environments")}</div>
                        </div>
                      </a>

                      <a
                        href={withLanguage("/photo-to-360-converter/")}
                        onClick={(event) => handleRouteLink(event, 'landing-photo360', '/photo-to-360-converter/')}
                        className="w-full px-2.5 py-1.5 rounded-xl hover:bg-cyan-950/80 hover:border hover:border-cyan-500/30 text-left flex items-center gap-2.5 text-xs text-white transition-all cursor-pointer group"
                      >
                        <div className="p-1.5 rounded-lg bg-teal-500/15 text-teal-400 group-hover:bg-teal-500/30 group-hover:text-teal-200 transition-colors">
                          <Camera className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-semibold text-xs flex items-center gap-1.5 text-white group-hover:text-teal-200 transition-colors">
                            <span>{t("Photo to 360 Converter")}</span>
                            <span className="text-[9px] px-1 py-0.2 bg-teal-400/20 text-teal-300 rounded font-mono font-bold">
                              {t("2D to 360")}
                            </span>
                          </div>
                          <div className="text-[10px] text-cyan-300/60">{t("Spatial expansion from photos")}</div>
                        </div>
                      </a>

                      <a
                        href={withLanguage("/cubemap-generator/")}
                        onClick={(event) => handleRouteLink(event, 'landing-cubemap', '/cubemap-generator/')}
                        className="w-full px-2.5 py-1.5 rounded-xl hover:bg-cyan-950/80 hover:border hover:border-cyan-500/30 text-left flex items-center gap-2.5 text-xs text-white transition-all cursor-pointer group"
                      >
                        <div className="p-1.5 rounded-lg bg-cyan-500/15 text-cyan-400 group-hover:bg-cyan-500/30 group-hover:text-cyan-200 transition-colors">
                          <Box className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-semibold text-xs flex items-center gap-1.5 text-white group-hover:text-cyan-200 transition-colors">
                            <span>{t("Cubemap 6-Face Slicer")}</span>
                            <span className="text-[9px] px-1 py-0.2 bg-cyan-400/20 text-cyan-300 rounded font-mono font-bold">
                              ZIP
                            </span>
                          </div>
                          <div className="text-[10px] text-cyan-300/60">{t("Batch 6 cube face packaging")}</div>
                        </div>
                      </a>

                      <a
                        href={withLanguage("/360-metadata-injector/")}
                        onClick={(event) => handleRouteLink(event, 'landing-metadata', '/360-metadata-injector/')}
                        className="w-full px-2.5 py-1.5 rounded-xl hover:bg-cyan-950/80 hover:border hover:border-cyan-500/30 text-left flex items-center gap-2.5 text-xs text-white transition-all cursor-pointer group"
                      >
                        <div className="p-1.5 rounded-lg bg-blue-500/15 text-blue-400 group-hover:bg-blue-500/30 group-hover:text-blue-200 transition-colors">
                          <ShieldCheck className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-semibold text-xs flex items-center gap-1.5 text-white group-hover:text-blue-200 transition-colors">
                            <span>{t("360° Metadata Injector")}</span>
                            <span className="text-[9px] px-1 py-0.2 bg-blue-400/25 text-blue-300 rounded font-mono font-bold">
                              XMP
                            </span>
                          </div>
                          <div className="text-[10px] text-cyan-300/60">{t("PhotoSphere Facebook tagger")}</div>
                        </div>
                      </a>

                      <a
                        href={withLanguage("/360-photo-to-video/")}
                        onClick={(event) => handleRouteLink(event, 'landing-video', '/360-photo-to-video/')}
                        className="w-full px-2.5 py-1.5 rounded-xl hover:bg-cyan-950/80 hover:border hover:border-cyan-500/30 text-left flex items-center gap-2.5 text-xs text-white transition-all cursor-pointer group"
                      >
                        <div className="p-1.5 rounded-lg bg-purple-500/15 text-purple-400 group-hover:bg-purple-500/30 group-hover:text-purple-200 transition-colors">
                          <Film className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-semibold text-xs flex items-center gap-1.5 text-white group-hover:text-purple-200 transition-colors">
                            <span>{t("360° Photo to Video")}</span>
                            <span className="text-[9px] px-1 py-0.2 bg-purple-400/25 text-purple-300 rounded font-mono font-bold">
                              MP4
                            </span>
                          </div>
                          <div className="text-[10px] text-cyan-300/60">{t("TikTok & YouTube rotation animator")}</div>
                        </div>
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <a
              href={withLanguage("/360-image-maker/")}
              aria-label={t("Studio")}
              aria-current={activeTab === 'generator' && currentPath !== '/' ? 'page' : undefined}
              onClick={(event) => handleRouteLink(event, 'generator', '/360-image-maker/')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                activeTab === 'generator' && currentPath !== '/'
                  ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-md shadow-cyan-500/35 font-extrabold'
                  : 'text-cyan-200/70 hover:text-white hover:bg-cyan-500/10'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-300 fill-current" />
              <span>{t("AI Studio")}</span>
              <span className="text-[9px] px-1 py-0.2 bg-cyan-400/25 border border-cyan-400/40 text-cyan-300 rounded font-mono font-bold tracking-wide">
                AI
              </span>
            </a>

            <a
              href={withLanguage("/360-panorama-viewer/")}
              aria-current={activeTab === 'viewer' ? 'page' : undefined}
              onClick={(event) => handleRouteLink(event, 'viewer', '/360-panorama-viewer/')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                activeTab === 'viewer'
                  ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-md shadow-cyan-500/35 font-extrabold'
                  : 'text-cyan-200/70 hover:text-white hover:bg-cyan-500/10'
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-teal-300" />
              <span>{t("360° Viewer")}</span>
              <span className="text-[9px] px-1 py-0.2 bg-teal-400/25 text-teal-300 rounded font-mono font-bold">
                {t("FREE")}
              </span>
            </a>

            <a
              href={withLanguage("/cubemap-generator/")}
              onClick={(event) => handleRouteLink(event, 'landing-cubemap', '/cubemap-generator/')}
              className={`studio-secondary-nav px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                activeTab === 'landing-cubemap' || activeTab === 'cubemap'
                  ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-md shadow-cyan-500/35 font-extrabold'
                  : 'text-cyan-200/70 hover:text-white hover:bg-cyan-500/10'
              }`}
            >
              <Box className="w-3.5 h-3.5 text-cyan-300" />
              <span>{t("Cubemap")}</span>
            </a>

            <a
              href={withLanguage("/photo-to-globe/")}
              onClick={(event) => handleRouteLink(event, 'globe', '/photo-to-globe/')}
              className={`studio-secondary-nav px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                activeTab === 'globe'
                  ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-md shadow-cyan-500/35 font-extrabold'
                  : 'text-cyan-200/70 hover:text-white hover:bg-cyan-500/10'
              }`}
            >
              <Globe2 className="w-3.5 h-3.5 text-teal-300" />
              <span>{t("3D Globe")}</span>
            </a>

            <a
              href={withLanguage("/#pricing")}
              onClick={(event) => handleRouteLink(event, 'pricing', '/#pricing')}
              className={`studio-secondary-nav px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                activeTab === 'pricing'
                  ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-md shadow-cyan-500/35 font-extrabold'
                  : 'text-cyan-200/70 hover:text-white hover:bg-cyan-500/10'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5 text-cyan-300" />
              <span>{t("Pricing")}</span>
            </a>
          </nav>

          {/* Right Action Trigger, Active Account Status & Checkout */}
          <div className="studio-account-actions flex items-center gap-2 sm:gap-2.5">
            <label className="flex items-center text-xs text-cyan-100">
              <span className="sr-only">{t('Language')}</span>
              <select
                aria-label={t('Language')}
                data-testid="interface-language"
                value={lang}
                onChange={event => setLanguage(event.target.value as typeof lang)}
                className="min-h-11 max-w-28 rounded-lg border border-cyan-500/30 bg-[#06152d] px-1.5 text-xs text-cyan-100"
              >
                {LANGUAGES.map(language => <option key={language.code} value={language.code} lang={language.code}>{language.name}</option>)}
              </select>
            </label>
            {currentUser.id.startsWith('usr_guest') ? <>
              <button type="button" onClick={() => { setAuthMode('login'); setAuthNotice(''); setIsAuthModalOpen(true); }} className="text-xs font-bold text-cyan-100 cursor-pointer">{t("Sign in")}</button>
              <button type="button" onClick={() => { setAuthMode('register'); setAuthNotice(''); setIsAuthModalOpen(true); }} className="studio-register px-3 py-2 rounded-xl bg-cyan-300 text-slate-950 text-xs font-bold cursor-pointer">{t("Create account")}</button>
            </> : <><button type="button" onClick={() => { if (!localStorage.getItem('panorama_server_user_token')) return; navigateTo('generator', '/360-image-maker/'); setIsWorksOpen(true); }} className="min-h-11 rounded-xl border border-cyan-400/50 bg-cyan-950/60 px-3 text-xs font-bold text-cyan-100 hover:bg-cyan-900/60">{tg('My works')}</button><button
              type="button"
              onClick={() => { setAuthNotice(''); setIsAuthModalOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-bold hover:bg-cyan-900/60 transition-colors cursor-pointer"
              title={`${currentUser.name} — ${t('Sign in, create an account, or view your profile')}`}
              aria-label={t('Open your account, {credits} credits available').replace('{credits}', String(currentUser.creditsBalance))}
            >
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>{currentUser.creditsBalance}<span className="sr-only sm:not-sr-only"> {t("Credits")}</span></span>
              <span className="text-[10px] px-1.5 py-0.2 bg-cyan-500/20 rounded text-cyan-200 uppercase font-bold">
                {t(currentUser.plan === 'free' ? 'Free' : currentUser.plan === 'pro' ? 'Pro' : 'Enterprise')}
              </span>
            </button></>}

            <button
              type="button"
              onClick={() => currentUser.plan === 'free' ? navigateTo('pricing') : handleChoosePlan(currentUser.plan, 'monthly')}
              className="flex shimmer-btn px-3 sm:px-4 py-2 bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 text-xs font-extrabold rounded-xl shadow-lg shadow-cyan-400/35 hover:shadow-cyan-400/60 hover:scale-105 active:scale-95 transition-all items-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span className="hidden sm:inline">{t(currentUser.plan === 'free' ? 'View plans' : 'Manage plan')}</span>
              <span className="sm:hidden">{t(currentUser.plan === 'free' ? 'Plans' : 'Manage')}</span>
            </button>
          </div>
        </div>
      </header>

      {authNotice && <div role="status" className="mx-auto max-w-5xl w-full px-4 pt-4 text-sm text-cyan-100 flex justify-between gap-3"><span>{authNotice === 'register' ? <>
        {t('Account created. Verify your email to receive starter credits.')}
      </> : t('You are signed in. Welcome back.')}</span><button type="button" aria-label={t("Dismiss account notice")} onClick={() => setAuthNotice('')} className="underline">{t("Dismiss")}</button></div>}

      {/* Main App Canvas / Tab Container */}
      <main id="studio-main" tabIndex={-1} className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 relative z-10 animate-in fade-in duration-200">
        <Suspense fallback={<div role="status" className="py-20 text-center text-cyan-400 font-mono text-xs">{t("Loading view...")}</div>}>
        {(generatorVisited || activeTab === 'generator') && <div hidden={activeTab !== 'generator'}>
          <GeneratorTab
            isViewerHomepage={currentPath === '/'}
            currentUser={currentUser}
            billingConfig={billingConfig}
            onUserChange={user => {
              if (user.id === getCurrentUser().id) updateCurrentUser(user);
            }}
            currentPanoramaUrl={currentPanoramaUrl}
            onPanoramaChange={(url, owner) => {
              if (owner !== undefined) panoramaOwner.current = owner;
              setCurrentPanoramaUrl(url);
            }}
            getPanoramaOwner={() => panoramaOwner.current}
            onNavigateTab={navigateTo}
            externalInputMode={generatorInputMode}
            onInputModeChange={setGeneratorInputMode}
            externalPrompt={studioPresetPrompt}
            externalStyle={studioPresetStyle}
            isWorksOpen={isWorksOpen}
            onWorksOpenChange={setIsWorksOpen}
            isActive={activeTab === 'generator'}
          />
        </div>}
        {activeTab === 'viewer' && (
          <ViewerTab
            key={viewerSession}
            currentPanoramaUrl={currentPanoramaUrl}
            onPanoramaChange={setCurrentPanoramaUrl}
            onNavigateTab={navigateTo}
          />
        )}
        {activeTab === 'globe' && (
          <PhotoToGlobePage
            currentPanoramaUrl={currentPanoramaUrl}
            onNavigateTab={navigateTo}
            onLaunchStudio={() => navigateTo('generator', '/360-image-maker/')}
          />
        )}
        {activeTab === 'pricing' && <PricingTab currentUser={currentUser} billingConfig={billingConfig} onChoosePlan={handleChoosePlan} onOpenStudio={() => navigateTo('generator')} />}
        {activeTab === 'admin' && <AdminTab />}
        {activeTab === 'showcase' && (
          <ShowcasePage
            onOpenStudio={() => navigateTo('generator', '/360-image-maker/')}
            onOpenViewer={() => navigateTo('viewer', '/360-panorama-viewer/')}
            onOpenInStudio={(url, prompt, style) => {
              if (url) setCurrentPanoramaUrl(url);
              if (prompt) setStudioPresetPrompt(prompt);
              setStudioPresetStyle(style);
              navigateTo('generator', '/360-image-maker/');
            }}
          />
        )}

        {/* Programmatic SEO Sub-Landing Pages */}
        {activeTab === 'landing-cube2eq' && (
          <CubemapToEquirectPage
            onNavigateTab={navigateTo}
            onPanoramaChange={setCurrentPanoramaUrl}
            onLaunchStudio={() => navigateTo('generator', '/360-image-maker/')}
          />
        )}
        {activeTab === 'landing-hdri-viewer' && (
          <HdriViewerPage
            cubemapMode={currentPath.replace(/\/$/, '') === '/hdri-to-cubemap'}
            onNavigateTab={navigateTo}
            onPanoramaChange={setCurrentPanoramaUrl}
            onLaunchStudio={() => navigateTo('generator', '/360-image-maker/')}
          />
        )}
        {activeTab === 'landing-text2pano' && (
          <TextToPanoramaPage
            onUsePrompt={(prompt, style) => {
              setStudioPresetPrompt(prompt);
              setStudioPresetStyle(style);
              setGeneratorInputMode('text');
              navigateTo('generator', '/360-image-maker/');
            }}
            onNavigateTab={navigateTo}
            onLaunchStudio={() => navigateTo('generator', '/360-image-maker/')}
          />
        )}
        {activeTab === 'developers' && (
          <DevelopersPage onNavigateTab={navigateTo} />
        )}
        {activeTab === 'landing-hdri' && (
          <AiHdriGeneratorPage
            onLaunchStudio={(presetPrompt) => {
              if (presetPrompt) setStudioPresetPrompt(presetPrompt);
              setStudioPresetStyle('nature');
              setGeneratorInputMode('text');
              navigateTo('generator', '/360-image-maker/');
            }}
            onOpenCubemap={() => navigateTo('cubemap', '/#cubemap')}
          />
        )}
        {activeTab === 'landing-skybox' && (
          <SkyboxGeneratorPage
            onLaunchStudio={(presetPrompt) => {
              if (presetPrompt) setStudioPresetPrompt(presetPrompt);
              setStudioPresetStyle('space');
              setGeneratorInputMode('text');
              navigateTo('generator', '/360-image-maker/');
            }}
            onOpenCubemap={() => navigateTo('cubemap', '/#cubemap')}
          />
        )}
        {activeTab === 'landing-photo360' && (
          <PhotoTo360Page
            onLaunchImageToPano={() => {
              navigateTo('generator', '/360-image-maker/');
              setGeneratorInputMode('image');
              setTimeout(() => {
                const el = document.getElementById('reference-uploader') || document.getElementById('studio-generator-workbench');
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }, 100);
            }}
            onOpenViewer={() => navigateTo('viewer', '/#viewer')}
          />
        )}
        {activeTab === 'landing-cubemap' && (
          <CubemapGeneratorPage
            onLaunchStudio={() => navigateTo('generator', '/360-image-maker/')}
            currentPanoramaUrl={currentPanoramaUrl}
            onPanoramaChange={setCurrentPanoramaUrl}
          />
        )}
        {activeTab === 'landing-metadata' && (
          <MetadataInjectorPage
            onLaunchStudio={() => navigateTo('generator', '/360-image-maker/')}
          />
        )}
        {activeTab === 'landing-video' && (
          <PhotoToVideoPage
            key={currentPath}
            showcaseMode={currentPath.replace(/\/$/, '') === '/360-product-video-generator'}
            onLaunchStudio={() => navigateTo('generator', '/360-image-maker/')}
            currentPanoramaUrl={currentPanoramaUrl}
            onPanoramaChange={setCurrentPanoramaUrl}
          />
        )}
        </Suspense>
      </main>

      {/* =========================================================================
          MULTI-COLUMN FOOTER
      ========================================================================= */}
      <footer className="border-t border-cyan-500/20 bg-[#020814]/95 backdrop-blur-2xl py-12 mt-16 text-xs text-cyan-200/70 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 pb-10 border-b border-cyan-500/15">
            {/* Col 1: Brand & Bio */}
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-gradient-to-tr from-cyan-400 to-blue-600 rounded-xl text-slate-950 font-bold shadow-md shadow-cyan-500/25">
                  <Compass className="w-4 h-4" />
                </div>
                <span className="text-white font-extrabold text-base tracking-tight">360 Panorama Viewer</span>
              </div>
              <p className="text-xs text-cyan-200/70 leading-relaxed">
                {t("Free 360° panorama viewer and AI studio: inspect equirectangular photos in real-time WebGL, or generate seamless 2:1 panoramas, cubemap slices, and 4K HDR environments.")}
              </p>
              <div className="flex items-center gap-2 pt-1 text-[11px] text-cyan-400">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                <span>{t("Commercial Usage Rights Available on All Paid Plans")}</span>
              </div>
            </div>

            {/* Col 2: Studio Tools */}
            <div className="space-y-3">
              <h4 className="text-white font-bold text-xs uppercase tracking-wider">{t("Studio Creators")}</h4>
              <ul className="space-y-2 text-xs">
                <li>
                  <a
                    href={withLanguage("/360-image-maker/")}
                    onClick={(e) => { e.preventDefault(); navigateTo('generator', '/360-image-maker/'); }}
                    className="hover:text-cyan-300 transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span>{t("360 Image Maker & Creator")}</span>
                    <span className="text-[9px] font-mono px-1 rounded bg-cyan-400/20 text-cyan-300">AI</span>
                  </a>
                </li>
                <li>
                  <button type="button" onClick={() => navigateTo('generator', '/360-image-maker/')} className="hover:text-cyan-300 transition-colors cursor-pointer">
                    {t("Text to 360 Panorama")}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => { setGeneratorInputMode('image'); navigateTo('generator', '/360-image-maker/'); }} className="hover:text-cyan-300 transition-colors cursor-pointer">
                    {t("Image to 360 (Reference Mode)")}
                  </button>
                </li>
                <li>
                  <a
                    href={withLanguage("/360-panorama-viewer/")}
                    onClick={(e) => { e.preventDefault(); navigateTo('viewer', '/360-panorama-viewer/'); }}
                    className="hover:text-cyan-300 transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span>{t("360° WebGL Panorama Viewer")}</span>
                    <span className="text-[9px] font-mono px-1 rounded bg-teal-400/20 text-teal-300">{t("FREE")}</span>
                  </a>
                </li>
                <li>
                  <a
                    href={withLanguage("/showcase/")}
                    onClick={(e) => { e.preventDefault(); navigateTo('showcase', '/showcase/'); }}
                    className="hover:text-cyan-300 transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span>{t("360° Panorama Showcase")}</span>
                    <span className="text-[9px] font-mono px-1 rounded bg-teal-400/20 text-teal-300">{t("NEW")}</span>
                  </a>
                </li>
                <li>
                  <a
                    href={withLanguage("/photo-to-globe/")}
                    onClick={(e) => { e.preventDefault(); navigateTo('globe', '/photo-to-globe/'); }}
                    className="hover:text-cyan-300 transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span>{t("Map to 3D Globe Maker")}</span>
                    <span className="text-[9px] font-mono px-1 rounded bg-cyan-400/20 text-cyan-300">WEBGL</span>
                  </a>
                </li>
              </ul>
            </div>

            {/* Col 3: Programmatic SEO Matrix */}
            <div className="space-y-3">
              <h4 className="text-white font-bold text-xs uppercase tracking-wider">{t("Specialized AI Tools")}</h4>
              <ul className="space-y-2 text-xs">
                <li>
                  <a
                    href={withLanguage("/ai-hdri-generator/")}
                    onClick={(e) => { e.preventDefault(); navigateTo('landing-hdri', '/ai-hdri-generator/'); }}
                    className="hover:text-cyan-300 transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span>{t("AI HDRI Generator")}</span>
                    <span className="text-[9px] font-mono px-1 rounded bg-amber-400/20 text-amber-300">3D</span>
                  </a>
                </li>
                <li>
                  <a
                    href={withLanguage("/skybox-generator/")}
                    onClick={(e) => { e.preventDefault(); navigateTo('landing-skybox', '/skybox-generator/'); }}
                    className="hover:text-cyan-300 transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span>{t("AI Skybox Generator")}</span>
                    <span className="text-[9px] font-mono px-1 rounded bg-indigo-400/20 text-indigo-300">VR</span>
                  </a>
                </li>
                <li>
                  <a
                    href={withLanguage("/photo-to-360-converter/")}
                    onClick={(e) => { e.preventDefault(); navigateTo('landing-photo360', '/photo-to-360-converter/'); }}
                    className="hover:text-cyan-300 transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span>{t("Photo to 360 Converter")}</span>
                    <span className="text-[9px] font-mono px-1 rounded bg-teal-400/20 text-teal-300">2D</span>
                  </a>
                </li>
                <li>
                  <a
                    href={withLanguage("/cubemap-generator/")}
                    onClick={(e) => { e.preventDefault(); navigateTo('landing-cubemap', '/cubemap-generator/'); }}
                    className="hover:text-cyan-300 transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span>{t("Cubemap 6-Face Slicer")}</span>
                    <span className="text-[9px] font-mono px-1 rounded bg-cyan-400/20 text-cyan-300">ZIP</span>
                  </a>
                </li>
                <li>
                  <a
                    href={withLanguage("/360-metadata-injector/")}
                    onClick={(e) => { e.preventDefault(); navigateTo('landing-metadata', '/360-metadata-injector/'); }}
                    className="hover:text-cyan-300 transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span>{t("360° Metadata Injector")}</span>
                    <span className="text-[9px] font-mono px-1 rounded bg-blue-400/20 text-blue-300">XMP</span>
                  </a>
                </li>
                <li>
                  <a
                    href={withLanguage("/360-photo-to-video/")}
                    onClick={(e) => { e.preventDefault(); navigateTo('landing-video', '/360-photo-to-video/'); }}
                    className="hover:text-cyan-300 transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span>{t("360° Photo to Video")}</span>
                    <span className="text-[9px] font-mono px-1 rounded bg-purple-400/20 text-purple-300">MP4</span>
                  </a>
                </li>
                <li>
                  <a
                    href={withLanguage("/360-product-video-generator/")}
                    onClick={(e) => handleRouteLink(e, 'landing-video', '/360-product-video-generator/')}
                    className="hover:text-cyan-300 transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span>{t("Panorama Showcase Video")}</span>
                    <span className="text-[9px] font-mono px-1 rounded bg-emerald-400/20 text-emerald-300">{t("SHOP")}</span>
                  </a>
                </li>
                <li>
                  <a
                    href={withLanguage("/hdri-to-cubemap/")}
                    onClick={(e) => handleRouteLink(e, 'landing-hdri-viewer', '/hdri-to-cubemap/')}
                    className="hover:text-cyan-300 transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span>{t("HDRI to Cubemap")}</span>
                    <span className="text-[9px] font-mono px-1 rounded bg-teal-400/20 text-teal-300">HDR</span>
                  </a>
                </li>
                <li>
                  <a
                    href={withLanguage("/cubemap-to-equirectangular/")}
                    onClick={(e) => { e.preventDefault(); navigateTo('landing-cube2eq', '/cubemap-to-equirectangular/'); }}
                    className="hover:text-cyan-300 transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span>{t("Cubemap to Equirectangular")}</span>
                    <span className="text-[9px] font-mono px-1 rounded bg-teal-400/20 text-teal-300">2:1</span>
                  </a>
                </li>
                <li>
                  <a
                    href={withLanguage("/text-to-panorama-ai/")}
                    onClick={(e) => { e.preventDefault(); navigateTo('landing-text2pano', '/text-to-panorama-ai/'); }}
                    className="hover:text-cyan-300 transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span>{t("Text to Panorama AI")}</span>
                    <span className="text-[9px] font-mono px-1 rounded bg-cyan-400/20 text-cyan-300">{t("PROMPT")}</span>
                  </a>
                </li>
                <li>
                  <a
                    href={withLanguage("/hdri-viewer/")}
                    onClick={(e) => { e.preventDefault(); navigateTo('landing-hdri-viewer', '/hdri-viewer/'); }}
                    className="hover:text-cyan-300 transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span>{t("HDRI Viewer & Cube Export")}</span>
                    <span className="text-[9px] font-mono px-1 rounded bg-amber-400/20 text-amber-300">.HDR</span>
                  </a>
                </li>
              </ul>
            </div>

            {/* Col 4: Converters & Engine Formats */}
            <div className="space-y-3">
              <h4 className="text-white font-bold text-xs uppercase tracking-wider">{t("Engine Formats")}</h4>
              <ul className="space-y-2 text-xs">
                <li>
                  <button type="button" onClick={() => navigateTo('cubemap', '/#cubemap')} className="hover:text-cyan-300 transition-colors cursor-pointer">
                    {t("Unity Skybox Export (ZIP)")}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => navigateTo('landing-hdri', '/ai-hdri-generator/')} className="hover:text-cyan-300 transition-colors cursor-pointer">
                    {t("Radiance .HDR Container")}
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => navigateTo('landing-skybox', '/skybox-generator/')} className="hover:text-cyan-300 transition-colors cursor-pointer">
                    Unreal Engine HDRIBackdrop
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setIsMetadataModalOpen(true)}
                    className="hover:text-cyan-300 transition-colors cursor-pointer flex items-center gap-1.5 text-cyan-200/90"
                  >
                    <span>PhotoSphere Facebook XMP</span>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
                      EXIF
                    </span>
                  </button>
                </li>
              </ul>
            </div>

            {/* Col 5: Company & Legal */}
            <div className="space-y-3">
              <h4 className="text-white font-bold text-xs uppercase tracking-wider">{t("Company & Legal")}</h4>
              <ul className="space-y-2 text-xs">
                <li>
                  <a href={withLanguage("/blog/")} className="hover:text-cyan-300 transition-colors">{t("360 Panorama Guides & Fixes")}</a>
                </li>
                <li>
                  <button type="button" onClick={() => navigateTo('pricing', '/#pricing')} className="hover:text-cyan-300 transition-colors cursor-pointer">
                    {t("Pricing & API Plans")}
                  </button>
                </li>
                <li>
                  <a
                    href={withLanguage("/developers/")}
                    onClick={(e) => { e.preventDefault(); navigateTo('developers', '/developers/'); }}
                    className="hover:text-cyan-300 transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span>{t("Developer Docs: Embed & API")}</span>
                    <span className="text-[9px] font-mono px-1 rounded bg-emerald-400/20 text-emerald-300">JSON</span>
                  </a>
                </li>
                <li>
                  <a href="/terms/" className="hover:text-cyan-300 transition-colors">{t("Terms of Service")}</a>
                </li>
                <li>
                  <a href="/privacy/" className="hover:text-cyan-300 transition-colors">{t("Privacy Policy")}</a>
                </li>
                <li>
                  <a href="/about/" className="hover:text-cyan-300 transition-colors">{t("About & Open Source")}</a>
                </li>
                <li>
                  <a href="https://github.com/hanshan0228/360-panorama-viewer" target="_blank" rel="noopener" className="hover:text-cyan-300 transition-colors">{t("Open Source on GitHub")}</a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => navigateTo('admin', '/#admin')}
                    className="text-cyan-500 hover:text-cyan-300 text-[11px] transition-colors cursor-pointer"
                  >
                    Admin Console
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {languageGuidePath && (
            <nav aria-label="Language guides" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-cyan-200/80">
              <span>{t("Read this guide in:")}</span>
              {GUIDE_LANGUAGES.map(language => (
                <a key={language.code} lang={language.code} hrefLang={language.code} href={`/${language.code}${languageGuidePath}`} className="hover:text-white underline">
                  {language.name}
                </a>
              ))}
            </nav>
          )}

          {/* Bottom Bar */}
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-cyan-400/60">
            <div>
              {t("© 2026 360 Panorama Viewer. All rights reserved. 2:1 Equirectangular Standard.")}
              {' · '}<a href="/about/" className="underline text-cyan-200">{t("About & Open Source")}</a>
              {' · '}<a href="https://github.com/hanshan0228/360-panorama-viewer" target="_blank" rel="noopener" className="underline text-cyan-200">GitHub</a>
              {' · '}<a href="/copyright/" className="underline text-cyan-200">Copyright / DMCA</a>
              {' · '}<a href="mailto:support@360panoramaviewer.com" className="underline text-cyan-200">support@360panoramaviewer.com</a>
            </div>

            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300">
                <Activity className="w-3 h-3 text-teal-400" />
                <span>{t("Local viewing · No upload")}</span>
              </span>
              <div className="flex items-center gap-1 text-cyan-300">
                <Code2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Three.js • WebGL 2.0</span>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Global 360° Metadata Injector Modal */}
      <MetadataInjectorModal
        isOpen={isMetadataModalOpen}
        onClose={() => setIsMetadataModalOpen(false)}
      />

      {/* Global Commercial Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutModalOpen}
        onClose={() => setIsCheckoutModalOpen(false)}
        currentUser={currentUser}
        initialPlan={checkoutSelection.plan}
        initialCycle={checkoutSelection.cycle}
        onSignIn={() => handleChoosePlan(checkoutSelection.plan, checkoutSelection.cycle)}
      />

      {/* Global User Authentication (Sign In / Register / Profile) Modal */}
      <UserAuthModal
        key={`${isAuthModalOpen}-${authMode}`}
        isOpen={isAuthModalOpen}
        initialMode={authMode}
        initialNotice={authModalNotice}
        onClose={handleCloseAuth}
        currentUser={currentUser}
        verificationToken={verificationToken}
        onVerificationComplete={() => {
          setVerificationToken('');
          if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
            (window as any).gtag('event', 'email_verification_complete');
          }
          window.dispatchEvent(new Event('panorama-user-refresh'));
        }}
        trialCredits={billingConfig.freeMonthlyCredits}
        continueToCheckout={Boolean(pendingCheckout)}
        checkoutIntent={pendingCheckout}
        onAuthSuccess={handleAuthSuccess}
        onOpenWorks={() => {
          if (!localStorage.getItem('panorama_server_user_token')) return;
          handleCloseAuth();
          navigateTo('generator', '/360-image-maker/');
          setIsWorksOpen(true);
        }}
      />
    </div>
  );
}

export default App;
