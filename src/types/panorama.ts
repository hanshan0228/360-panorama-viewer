export type StylePresetId =
  | 'cyberpunk'
  | 'nature'
  | 'interior'
  | 'fantasy'
  | 'space'
  | 'anime'
  | 'custom';

export interface StylePreset {
  id: StylePresetId;
  name: string;
  description: string;
  promptSuffix: string;
  previewColor: string;
}

export type ResolutionTier = '1K' | '2K' | '4K';

export interface ResolutionConfig {
  label: ResolutionTier;
  width: number;
  height: number;
  credits: number;
}

export interface PanoramaAsset {
  id: string;
  title: string;
  prompt: string;
  style: StylePresetId;
  resolution: ResolutionTier;
  dataUrl: string; // 2:1 equirectangular data URL
  createdAt: number;
  isSeamCorrected: boolean;
}

export type ViewerProjectionMode = 'sphere' | 'curved' | 'little-planet' | 'vr-cardboard';

export interface PanoramaHotspot {
  id: string;
  lon: number; // -180 to 180 degrees
  lat: number; // -90 to 90 degrees
  title: string;
  description: string;
  color?: string;
}

export type CubemapFaceName = 'posx' | 'negx' | 'posy' | 'negy' | 'posz' | 'negz';

export interface CubemapFace {
  name: CubemapFaceName;
  label: string; // e.g. Right (+X), Left (-X), Top (+Y), Bottom (-Y), Front (+Z), Back (-Z)
  dataUrl: string;
  canvas: HTMLCanvasElement;
}

export interface ReferenceImage {
  id: string;
  url: string;
  name: string;
  preview: string;
}

export interface ShowcaseItem {
  id: string;
  title: string;
  category: string;
  prompt: string;
  style: StylePresetId;
  author: string;
  views: number;
  likes: number;
  resolution: string;
  tags: string[];
}

export type ActiveTab =
  | 'generator'
  | 'viewer'
  | 'cubemap'
  | 'globe'
  | 'showcase'
  | 'pricing'
  | 'admin'
  | 'landing-hdri'
  | 'landing-hdri-viewer'
  | 'landing-skybox'
  | 'landing-photo360'
  | 'landing-cubemap'
  | 'landing-metadata'
  | 'landing-cube2eq'
  | 'landing-text2pano'
  | 'developers'
  | 'landing-video';

export type ModelRoutingMode = 'single' | 'failover' | 'round-robin';

export interface ModelRoutingConfig {
  mode: ModelRoutingMode;
  primaryEndpointId: string;
  secondaryEndpointId: string;
  tertiaryEndpointId?: string;
  roundRobinIndex: number;
}

export interface ModelEndpointConfig {
  id: string;
  name: string;
  provider: 'gemini' | 'openai' | 'fal' | 'replicate' | 'custom';
  baseUrl: string;
  apiKey: string;
  model: string;
  isEnabled: boolean;
  priority: number;
  maxResolution: string;
  isDefault: boolean;
}

export type UserPlanTier = 'free' | 'pro' | 'enterprise';

export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  plan: UserPlanTier;
  creditsBalance: number;
  creditsTotal: number;
  status: 'active' | 'suspended' | 'cancelled';
  joinedAt: string;
  lastActiveAt: string;
  apiCallsCount: number;
  emailVerified?: boolean;
}

export interface SystemBillingConfig {
  freeMonthlyCredits: number;
  proMonthlyPriceUsd: number;
  proMonthlyCredits: number;
  enterpriseCustomPricing: boolean;
  creditCostPer1K: number;
  creditCostPer2K: number;
  creditCostPer4K: number;
}

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';

export interface SubscriptionRecord {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  plan: 'pro' | 'enterprise';
  billingCycle: 'monthly' | 'yearly';
  amount: number;
  currency: string;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  paymentMethod: string;
}

export interface InvoiceRecord {
  id: string;
  subscriptionId: string;
  userId: string;
  userEmail: string;
  amount: number;
  currency: string;
  status: 'paid' | 'open' | 'refunded';
  date: string;
  planName: string;
}

export interface PaymentGatewayConfig {
  // Stripe Configuration
  stripeEnabled: boolean;
  stripePublishableKey: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripeProMonthlyPriceId: string;
  stripeProYearlyPriceId: string;
  stripeEnterpriseMonthlyPriceId: string;
  stripeEnterpriseYearlyPriceId: string;

  // PayPal Subscriptions Configuration
  paypalEnabled: boolean;
  paypalMode: 'sandbox' | 'live';
  paypalClientId: string;
  paypalClientSecret: string;
  paypalProMonthlyPlanId: string;
  paypalProYearlyPlanId: string;
  paypalEnterpriseMonthlyPlanId: string;
  paypalEnterpriseYearlyPlanId: string;
}


