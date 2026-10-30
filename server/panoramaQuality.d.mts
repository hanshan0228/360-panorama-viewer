export const DEFAULT_PANORAMA_REVIEW_MODEL: 'gemini-3-flash';
export const PANORAMA_REVIEW_TIMEOUT_MS: 90000;

export type PanoramaQualityIssue = 'reference_mismatch' | 'collage' | 'duplicate_subject'
  | 'disconnected_geometry' | 'seam' | 'pole_distortion';

export interface PanoramaQualityReview {
  status: 'passed' | 'failed' | 'unavailable';
  issues: PanoramaQualityIssue[];
  explanation?: string;
  reviewModel: string;
}

export function reviewPanorama(input: {
  endpoint: { baseUrl: string; apiKey?: string };
  model?: string;
  prompt: string;
  referenceImages?: string[];
  imageUrl: string;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}): Promise<PanoramaQualityReview>;

export function buildQualityRetryPrompt(prompt: string, issues: string[]): string;
