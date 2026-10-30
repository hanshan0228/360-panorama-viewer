import { getActiveModelEndpoint } from './adminStorage';
import type { ResolutionTier } from '../types/panorama';
import { buildImageModelRequest, inspectImageResolution, IMAGE_GENERATION_TIMEOUT_MS, type ImageResolution } from './imageModelRequest.mjs';

export interface GeminiConfig {
  endpointId?: string;
  provider?: string;
  apiKey: string;
  baseUrl: string; // e.g. "http://localhost:8045" or "https://generativelanguage.googleapis.com"
  model: string;   // e.g. "imagen-3.0-generate-002" or "gemini-2.5-flash-image" / "gemini-pro-vision"
  resolution?: ResolutionTier;
  sessionToken?: string | null;
}

export interface PanoramaQuality {
  status: 'passed' | 'failed' | 'unavailable';
  issues: string[];
  explanation?: string;
  reviewModel: string;
  attempts: number;
}

export interface GeminiGenerationResult {
  imageUrl: string;
  quality?: PanoramaQuality;
  remainingCredits?: number;
  creditsDeducted?: number;
  creditsRefunded?: number;
  imageResolution?: ImageResolution;
  modelUsed?: string;
  library?: { saved: boolean; id?: string; error?: string };
  generationTiming?: { upstreamWaitMs: number; upstreamBodyMs: number };
}

export const DEFAULT_GEMINI_CONFIG: GeminiConfig = {
  apiKey: '',
  baseUrl: 'http://127.0.0.1:8317',
  model: 'gemini-3.1-flash-image',
};

export const GOOGLE_OFFICIAL_CONFIG: GeminiConfig = {
  apiKey: '',
  baseUrl: 'https://generativelanguage.googleapis.com',
  model: 'imagen-3.0-generate-002',
};

const GEMINI_CONFIG_STORAGE_KEY = 'panorama_gemini_config';

export function getStoredGeminiConfig(): GeminiConfig {
  // Check if an enabled active endpoint is configured in Admin Ops Hub
  try {
    const activeEp = getActiveModelEndpoint();
    if (activeEp && activeEp.isEnabled) {
      return {
        baseUrl: activeEp.baseUrl || DEFAULT_GEMINI_CONFIG.baseUrl,
        apiKey: activeEp.apiKey || DEFAULT_GEMINI_CONFIG.apiKey,
        model: activeEp.model || DEFAULT_GEMINI_CONFIG.model,
      };
    }
  } catch {
    // fallback to local config
  }

  try {
    const raw = localStorage.getItem(GEMINI_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate from old dead port 8045
      if (!parsed.baseUrl || parsed.baseUrl.includes('8045')) {
        return {
          ...DEFAULT_GEMINI_CONFIG,
          apiKey: parsed.apiKey || DEFAULT_GEMINI_CONFIG.apiKey,
        };
      }
      return {
        ...DEFAULT_GEMINI_CONFIG,
        ...parsed,
        apiKey: (parsed.apiKey || '').trim(),
      };
    }
  } catch {
    // fallback
  }
  return DEFAULT_GEMINI_CONFIG;
}

export function saveStoredGeminiConfig(config: GeminiConfig): void {
  try {
    localStorage.setItem(GEMINI_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // fallback
  }
}

/**
 * Test connectivity with local or remote proxy, or Google official API.
 */
export async function testProxyConnection(config: GeminiConfig): Promise<{
  success: boolean;
  models?: string[];
  message: string;
}> {
  const normalizedBase = (config.baseUrl || 'http://127.0.0.1:8317').replace(/\/+$/, '');
  const apiKey = config.apiKey.trim();
  const isGoogle = normalizedBase.includes('googleapis.com');

  if (isGoogle) {
    if (!apiKey) {
      return {
        success: false,
        message: 'Google AI Studio direct mode requires an API Key. Please obtain one at https://aistudio.google.com/.',
      };
    }
    const googleEndpoint = `${normalizedBase}/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    try {
      const res = await fetch(googleEndpoint, { method: 'GET' });
      if (!res.ok) {
        const errText = await res.text();
        let errMsg = errText;
        try {
          const json = JSON.parse(errText);
          errMsg = json.error?.message || errText;
        } catch {
          // ignore
        }
        return {
          success: false,
          message: `Google AI Studio HTTP ${res.status}: ${errMsg.slice(0, 160)}`,
        };
      }
      const data = await res.json();
      const models: string[] = Array.isArray(data.models)
        ? data.models.map((m: { name: string }) => m.name.replace(/^models\//, ''))
        : [];
      return {
        success: true,
        models,
        message: `Successfully connected to Google AI Studio! Detected ${models.length} models (Recommended for imaging: imagen-3.0-generate-002).`,
      };
    } catch (err: unknown) {
      return {
        success: false,
        message: `Unable to connect to Google official endpoint (${err instanceof Error ? err.message : String(err)}). Please ensure network connectivity to Google services.`,
      };
    }
  }

  // Standard OpenAI-compatible local proxy check
  const endpoint = normalizedBase.endsWith('/v1')
    ? `${normalizedBase}/models`
    : `${normalizedBase}/v1/models`;

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      if (res.status === 401) {
        return {
          success: false,
          message: 'Proxy returned 401 Unauthorized. Please check your API Key.',
        };
      }
      return {
        success: false,
        message: `Proxy returned HTTP ${res.status} error`,
      };
    }

    const data = await res.json();
    const models: string[] = Array.isArray(data.data)
      ? data.data.map((m: { id: string }) => m.id)
      : [];

    return {
      success: true,
      models,
      message: `Connected! ${models.length} models detected (Recommended: gemini-3.1-flash-image / gpt-image-2.5).`,
    };
  } catch (err: unknown) {
    const isLocal = normalizedBase.includes('localhost') || normalizedBase.includes('127.0.0.1');
    const isPublic = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    let hint = `Cannot connect to ${normalizedBase}. Please ensure proxy server is running. (${err instanceof Error ? err.message : String(err)})`;
    if (isPublic && isLocal) {
      hint += ` [Public deployment: configure a publicly accessible proxy or the Google API; a localhost address cannot reach your computer from the server.]`;
    }
    return {
      success: false,
      message: hint,
    };
  }
}

/**
 * Known artist / trademark keywords that trigger OpenAI DALL-E safety moderation blocks
 * (Code 400: "Your request was rejected by the safety system / moderation_blocked").
 * We automatically replace them with rich, safe, evocative artistic descriptors!
 */
const SAFETY_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /hayao\s*miyazaki|studio\s*ghibli/gi,
    replacement: 'Japanese anime hand-drawn watercolor aesthetic, nostalgic summer breeze, lush green grass, fluffy white clouds, warm natural sunlight',
  },
  {
    pattern: /makoto\s*shinkai/gi,
    replacement: 'vibrant atmospheric anime cinematic lighting, detailed cumulus clouds, high-contrast emotional sky',
  },
  {
    pattern: /disney(\s*animation)?/gi,
    replacement: '3D stylized animation cinematic render, magical atmosphere, rich volumetric light',
  },
  {
    pattern: /pixar(\s*animation)?/gi,
    replacement: '3D animated feature film render, soft subsurface scattering, vibrant colors',
  },
];

export function sanitizePromptForSafety(rawPrompt: string): { sanitized: string; replaced: boolean } {
  let text = rawPrompt;
  let replaced = false;

  for (const item of SAFETY_REPLACEMENTS) {
    if (item.pattern.test(text)) {
      text = text.replace(item.pattern, item.replacement);
      replaced = true;
    }
  }

  return { sanitized: text, replaced };
}

/**
 * Builds a 360 VR Equirectangular skybox prompt with rigorous topological constraints.
 * Requests full spherical coverage; geometry and edge continuity still require inspection.
 */
export function buildPanoramaPrompt(userPrompt: string, styleSuffix = '', hasReferenceImages = false): string {
  const { sanitized } = sanitizePromptForSafety(userPrompt.trim());
  if (hasReferenceImages) {
    return `Treat the attached reference photos as perspective views of ONE part of the source scene. Synthesize ONE continuous 360-degree by 180-degree equirectangular environment from ONE stationary camera at the original source viewpoint. Preserve recognizable subjects, structures, materials, lighting and spatial relationships visible in the photos, while allowing the requested changes and visual style. Show each source subject only once unless the user explicitly requests copies. Infer unseen surroundings consistently around this same camera. The entire canvas must be one coherent spherical scene: no collage, stacked horizontal bands, repeated panorama strips, split views, insets or pasted source photo. Use one level horizon across the vertical center. The top edge looks straight up into sky or ceiling; the bottom edge looks straight down onto continuous ground or floor. The left and right edges meet at the same rearward view with continuous geometry and lighting. Do not invent camera equipment, a foreground cockpit, steering wheel or dashboard, or a duplicate foreground subject. Output a single flat latitude-longitude spherical texture map with a 2:1 ratio and full 360 by 180 degree coverage, matching left and right edges, filling the frame without borders; no fisheye, rendered globe or little planet.${sanitized ? ` Apply these requested changes: ${sanitized}` : ''}${styleSuffix ? ` Visual style: ${styleSuffix}` : ''}`;
  }
  const suffix = styleSuffix ? `, ${styleSuffix}` : '';
  // Equirectangular 360 panoramic magic tokens:
  // Keep projection constraints separate from the selected visual style and API resolution.
  return `${sanitized}${suffix}, full 360 degree equirectangular projection panorama, 360 spherical VR skybox, 2:1 ratio texture map, seamless horizontal wrap, continuous 360 panoramic loop, matching left and right edges, level horizontal horizon at 50% vertical center, flat camera zero pitch, full frame edge to edge, no borders, no circular lens, no black frame, no vignettes`;
}

/**
 * Request real image generation via Gemini Imagen / OpenAI-compatible local proxy.
 * Supports both:
 * 1. Native Google AI Studio / Gemini endpoint format
 * 2. Standard OpenAI-compatible /v1/images/generations format often used by local proxy bridges (One-API, New-API, etc.)
 */
export async function generateWithGemini(
  prompt: string,
  config: GeminiConfig,
  referenceImages?: string[]
): Promise<GeminiGenerationResult> {
  const normalizedBase = (config.baseUrl || 'http://127.0.0.1:8317').replace(/\/+$/, '');
  const apiKey = (config.apiKey || '').trim();
  const model = config.model.trim() || 'gpt-image-2.5';

  let rawImageUrl: string | null = null;

  // Route through secure backend proxy when on public domain or no client apiKey is provided
  const isPublicWeb = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  if ((!apiKey || isPublicWeb) && typeof window !== 'undefined') {
    const token = config.sessionToken !== undefined ? config.sessionToken
      : typeof localStorage !== 'undefined' ? localStorage.getItem('panorama_server_user_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let proxyRes: Response;
    try {
      proxyRes = await fetch('/api/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt,
          endpointId: config.endpointId,
          modelId: model,
          referenceImages,
          resolution: config.resolution || '4K',
        }),
      });
    } catch (netErr) {
      // Network failure reaching local/edge server
      if (!isPublicWeb && apiKey) {
        // Only allow falling back to direct local connection if user is local developer with own key
      } else {
        throw new Error(`Unable to reach the image generation service: ${netErr instanceof Error ? netErr.message : String(netErr)}`);
      }
    }

    if (proxyRes!) {
      const proxyData = await proxyRes.json().catch(() => ({}));
      if (proxyData.code === 'GENERATION_QUALITY_REJECTED' || proxyData.code === 'GENERATION_REVIEW_UNAVAILABLE'
        || proxyData.quality?.status === 'failed' || proxyData.quality?.status === 'unavailable') {
        const unavailable = proxyData.code === 'GENERATION_REVIEW_UNAVAILABLE' || proxyData.quality?.status === 'unavailable';
        const error = new Error(unavailable
          ? 'The AI quality check could not be completed. Your credits were returned. Please try again later.'
          : 'The panorama did not pass the AI quality check after one retry. Your credits were returned.');
        error.name = 'PanoramaQualityError';
        throw error;
      }
      if (proxyRes.ok) {
        if (proxyData.success && proxyData.imageUrl) {
          return {
            quality: proxyData.quality,
            library: proxyData.library, generationTiming: proxyData.generationTiming, modelUsed: proxyData.modelUsed, imageUrl: proxyData.imageUrl, remainingCredits: proxyData.remainingCredits,
            creditsDeducted: proxyData.creditsDeducted, creditsRefunded: proxyData.creditsRefunded,
            imageResolution: proxyData.imageResolution ?? inspectImageResolution(proxyData.imageUrl, config.resolution || '4K'),
          };
        }
      } else {
        // Server returned an explicit error (400 Insufficient credits, 403 Suspended, etc.): NEVER silently bypass!
        throw new Error(proxyData.error || `Image generation proxy error [HTTP ${proxyRes.status}]`);
      }
    }
  }

  const directRequest = buildImageModelRequest({ baseUrl: normalizedBase, apiKey, model }, {
    prompt, referenceImages, resolution: config.resolution || '4K',
  });
  const isGoogleDirect = directRequest.mode.startsWith('google-');
  if (!isGoogleDirect) {
    const isGeminiChatImage = directRequest.mode === 'chat';

    if (isGeminiChatImage) {
      // 8317 CLIProxyAPI serves gemini-3.1-flash-image via /v1/chat/completions
      // and returns images in choices[0].message.images[0].image_url.url
      const chatEndpoint = directRequest.url;
      const headers = directRequest.headers;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), IMAGE_GENERATION_TIMEOUT_MS);

      let res: Response;
      try {
        res = await fetch(chatEndpoint, {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify(directRequest.payload),
        });
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        const isAbort = err instanceof Error && err.name === 'AbortError';
        const isLocal = chatEndpoint.includes('localhost') || chatEndpoint.includes('127.0.0.1');
        const isPublic = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        let detail = `Unable to connect to proxy endpoint [${chatEndpoint}]: ${err instanceof Error ? err.message : String(err)}`;
        if (isPublic && isLocal) {
          detail += ' (Public deployment: use a publicly accessible proxy or Google API, not localhost:8317.)';
        }
        throw new Error(
          isAbort
            ? 'Gemini image generation timed out (90s). The model computation took too long, please try again.'
            : detail
        );
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) {
        const errText = await res.text();
        let parsedMsg = errText;
        try {
          const json = JSON.parse(errText);
          parsedMsg = json.error?.message || json.message || errText;
        } catch {
          // ignore
        }
        throw new Error(`Proxy chat completions error [HTTP ${res.status}]: ${parsedMsg}`);
      }

      const data = await res.json();
      const msg = data.choices?.[0]?.message;
      if (msg?.images && Array.isArray(msg.images) && msg.images[0]?.image_url?.url) {
        rawImageUrl = msg.images[0].image_url.url;
      } else if (typeof msg?.content === 'string') {
        const matchBase64 = msg.content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
        if (matchBase64) {
          rawImageUrl = matchBase64[0];
        } else {
          const matchUrl = msg.content.match(/https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|webp)/i);
          if (matchUrl) {
            rawImageUrl = matchUrl[0];
          }
        }
      }

      if (!rawImageUrl) {
        throw new Error(`Proxy Gemini response did not contain image data: ${JSON.stringify(msg).slice(0, 200)}`);
      }
    } else {
      // Standard OpenAI-compatible image generation or reference-image editing.
      const endpoint = directRequest.url;
      const headers = directRequest.headers;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IMAGE_GENERATION_TIMEOUT_MS); // Shared deadline includes model work and response transfer

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: directRequest.payload instanceof FormData ? directRequest.payload : JSON.stringify(directRequest.payload),
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const isLocal = endpoint.includes('localhost') || endpoint.includes('127.0.0.1');
      const isPublic = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      let detail = `Failed to connect to proxy endpoint [${endpoint}]. Please check if proxy is active. (${err instanceof Error ? err.message : String(err)})`;
      if (isPublic && isLocal) {
        detail += ' (Public deployment: use a publicly accessible proxy or Google API, not localhost:8317.)';
      }
      throw new Error(
        isAbort
          ? 'Image generation timed out after 90s. The AI model took too long to compute. Please retry.'
          : detail
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const errText = await res.text();
      let parsedMsg = errText;
      let isSafetyBlock = false;
      try {
        const json = JSON.parse(errText);
        parsedMsg = json.error?.message || json.message || errText;
        if (json.error?.code === 'moderation_blocked' || parsedMsg.toLowerCase().includes('safety system')) {
          isSafetyBlock = true;
        }
      } catch {
        if (errText.toLowerCase().includes('safety system')) {
          isSafetyBlock = true;
        }
      }

      if (isSafetyBlock) {
        throw new Error(
          `Your prompt triggered the AI platform's copyright or content safety filter [HTTP 400 - Rejected by safety system].\n\n` +
          `AI models (OpenAI) prohibit direct references to specific protected artist names (such as "Hayao Miyazaki" or "Studio Ghibli") or commercial trademarks.\n\n` +
          `Tip: Please describe the visual style instead (e.g. "Japanese anime hand-drawn watercolor aesthetic, lush clouds and summer breeze", or choose the "Ghibli Anime" preset) to generate seamlessly.`
        );
      }

      throw new Error(`Proxy error [HTTP ${res.status}]: ${parsedMsg}`);
    }

    const data = await res.json();
    if (data.data && data.data[0]) {
      const item = data.data[0];
      if (item.b64_json) {
        rawImageUrl = item.b64_json.startsWith('data:image')
          ? item.b64_json
          : `data:image/png;base64,${item.b64_json}`;
      } else if (item.url) {
        try {
          const imgRes = await fetch(item.url);
          const imgBlob = await imgRes.blob();
          rawImageUrl = await new Promise<string>((resolveData) => {
            const reader = new FileReader();
            reader.onload = () => resolveData(reader.result as string);
            reader.readAsDataURL(imgBlob);
          });
        } catch {
          rawImageUrl = item.url;
        }
      }
    }

    if (!rawImageUrl) {
      throw new Error(`No image data received from proxy. Response: ${JSON.stringify(data).slice(0, 160)}`);
    }
  }
} else {
    const googleEndpoint = directRequest.url;

    const res = await fetch(googleEndpoint, {
      method: 'POST',
      headers: directRequest.headers,
      body: JSON.stringify(directRequest.payload),
      signal: AbortSignal.timeout(IMAGE_GENERATION_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errText = await res.text();
      let readableMsg = errText;
      try {
        const json = JSON.parse(errText);
        readableMsg = json.error?.message || errText;
      } catch {
        // ignore
      }
      if (res.status === 400 || res.status === 403) {
        if (readableMsg.includes('API_KEY_INVALID') || readableMsg.toLowerCase().includes('api key')) {
          throw new Error(
            `Invalid or expired Google API Key [HTTP ${res.status}]:\n` +
            `Please verify your API Key in Settings. You can create a free key starting with AIzaSy at https://aistudio.google.com/.`
          );
        }
      }
      throw new Error(`Google image API request failed [HTTP ${res.status}]: ${readableMsg}`);
    }

    const data = await res.json();
    const part = data.candidates?.[0]?.content?.parts?.find((part: { inlineData?: { data?: string } }) => part.inlineData?.data);
    const b64 = directRequest.mode === 'google-imagen' ? data.predictions?.[0]?.bytesBase64Encoded : part?.inlineData?.data;

    if (!b64) {
      throw new Error('No image bytes received. Please check model name and API response.');
    }

    rawImageUrl = `data:${part?.inlineData?.mimeType || 'image/png'};base64,${b64}`;
  }

  return { imageUrl: rawImageUrl, imageResolution: inspectImageResolution(rawImageUrl, config.resolution || '4K') };
}
