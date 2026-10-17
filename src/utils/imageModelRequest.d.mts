import type { ResolutionTier } from '../types/panorama';

export interface ImageResolution {
  requested: ResolutionTier;
  targetWidth: number;
  targetHeight: number;
  width: number | null;
  height: number | null;
  panoramaWidth: number | null;
  panoramaHeight: number | null;
  status: 'met' | 'below-request' | 'unverified';
}

export function inspectImageResolution(imageUrl: string, resolution: ResolutionTier): ImageResolution;

export function buildImageModelRequest(
  endpoint: { baseUrl: string; model: string; apiKey?: string },
  input: { prompt: string; referenceImages?: string[]; resolution?: ResolutionTier }
): {
  url: string;
  headers: Record<string, string>;
  mode: 'google-imagen' | 'google-gemini' | 'chat' | 'images';
  payload: Record<string, unknown>;
};
