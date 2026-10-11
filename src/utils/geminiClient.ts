import { healPanoramaSeam } from './seamHealer';
import { getActiveModelEndpoint } from './adminStorage';

export interface GeminiConfig {
  apiKey: string;
  baseUrl: string; // e.g. "http://localhost:8045" or "https://generativelanguage.googleapis.com"
  model: string;   // e.g. "imagen-3.0-generate-002" or "gemini-2.5-flash-image" / "gemini-pro-vision"
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
      hint += ` [公网部署注意：当前网页运行于公网环境，访问者的浏览器无法连接访问者本机端口。请配置公网反代接口或 Google 官方直连端点]`;
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
 * Ensures the AI generates a full-bleed panoramic environment rather than a framed picture.
 */
export function buildPanoramaPrompt(userPrompt: string, styleSuffix = ''): string {
  const { sanitized } = sanitizePromptForSafety(userPrompt.trim());
  const suffix = styleSuffix ? `, ${styleSuffix}` : '';
  // Equirectangular 360 panoramic magic tokens:
  // Forbids borders, frames, vignettes, and circular fisheyes so the AI generates a true full-bleed 360 environment!
  return `${sanitized}${suffix}, full 360 degree equirectangular projection panorama, 360 spherical VR skybox, 2:1 ratio texture map, seamless horizontal wrap, continuous 360 panoramic loop, matching left and right edges, level horizontal horizon at 50% vertical center, flat camera zero pitch, ultra sharp focus, 8k uhd resolution, crisp micro-details, highly detailed photorealistic environment, full frame edge to edge, no borders, no circular lens, no black frame, no vignettes`;
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
): Promise<string> {
  const normalizedBase = (config.baseUrl || 'http://127.0.0.1:8317').replace(/\/+$/, '');
  const apiKey = (config.apiKey || '').trim();
  const model = config.model.trim() || 'gpt-image-2.5';

  const isGoogleDirect = normalizedBase.includes('googleapis.com');
  let rawImageUrl: string | null = null;

  if (!isGoogleDirect) {
    const isGeminiChatImage = model.toLowerCase().includes('gemini');

    if (isGeminiChatImage) {
      // 8317 CLIProxyAPI serves gemini-3.1-flash-image via /v1/chat/completions
      // and returns images in choices[0].message.images[0].image_url.url
      const chatEndpoint = normalizedBase.endsWith('/v1')
        ? `${normalizedBase}/chat/completions`
        : `${normalizedBase}/v1/chat/completions`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      // Support multimodal reference images if provided
      const validRefs = (referenceImages || []).filter(Boolean);
      const messageContent =
        validRefs.length > 0
          ? [
              { type: 'text', text: prompt },
              ...validRefs.map((img) => ({
                type: 'image_url',
                image_url: { url: img },
              })),
            ]
          : prompt;

      let res: Response;
      try {
        res = await fetch(chatEndpoint, {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'user',
                content: messageContent,
              },
            ],
          }),
        });
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        const isAbort = err instanceof Error && err.name === 'AbortError';
        const isLocal = chatEndpoint.includes('localhost') || chatEndpoint.includes('127.0.0.1');
        const isPublic = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        let detail = `Unable to connect to proxy endpoint [${chatEndpoint}]: ${err instanceof Error ? err.message : String(err)}`;
        if (isPublic && isLocal) {
          detail += ' (公网部署提示：当前网页运行在公网，无法连接至访问者本机的 8317 代理端口。请在后台管理配置公网可访问端点或 Google 官方 API)';
        }
        throw new Error(
          isAbort
            ? 'Gemini image generation timed out (90s). The model computation took too long, please try again.'
            : detail
        );
      } finally {
        clearTimeout(timeoutId);
      }

      // If multimodal array failed with 400 Bad Request, retry once with pure text prompt
      if (!res.ok && res.status === 400 && validRefs.length > 0) {
        try {
          const fallbackRes = await fetch(chatEndpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: 'user',
                  content: prompt,
                },
              ],
            }),
          });
          if (fallbackRes.ok) {
            res = fallbackRes;
          }
        } catch {
          // keep original res
        }
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
      // 1. Standard OpenAI-compatible /v1/images/generations (used by 8317 cli-proxy-api, One-API, etc.)
      const endpoint = normalizedBase.endsWith('/v1')
        ? `${normalizedBase}/images/generations`
        : `${normalizedBase}/v1/images/generations`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout for image diffusion

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model,
          prompt,
          n: 1,
          size: '1792x1024',
          response_format: 'b64_json',
        }),
      });

      // If the model rejects 1792x1024 due to size constraints, automatically retry with 1024x1024
      if (!res.ok && res.status === 400) {
        const errPeek = await res.clone().text();
        if (errPeek.toLowerCase().includes('size')) {
          res = await fetch(endpoint, {
            method: 'POST',
            headers,
            signal: controller.signal,
            body: JSON.stringify({
              model,
              prompt,
              n: 1,
              size: '1024x1024',
              response_format: 'b64_json',
            }),
          });
        }
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const isLocal = endpoint.includes('localhost') || endpoint.includes('127.0.0.1');
      const isPublic = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      let detail = `Failed to connect to proxy endpoint [${endpoint}]. Please check if proxy is active. (${err instanceof Error ? err.message : String(err)})`;
      if (isPublic && isLocal) {
        detail += ' (公网部署提示：当前网页运行在公网，无法连接至访问者本机的 8317 代理端口。请在后台管理配置公网可访问端点或 Google 官方 API)';
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
  // 2. Google Native Imagen API format:
    // POST https://generativelanguage.googleapis.com/v1beta/models/{model}:predict?key={apiKey}
    const keyParam = apiKey ? `?key=${encodeURIComponent(apiKey)}` : '';
    const googleEndpoint = `${normalizedBase}/v1beta/models/${model}:predict${keyParam}`;

    const res = await fetch(googleEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: '16:9',
          outputMimeType: 'image/png',
        },
      }),
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
      throw new Error(`Google Imagen 3 API request failed [HTTP ${res.status}]: ${readableMsg}`);
    }

    const data = await res.json();
    const prediction = data.predictions?.[0];
    const b64 = prediction?.bytesBase64Encoded;

    if (!b64) {
      throw new Error('No image bytes received. Please check model name and API response.');
    }

    rawImageUrl = `data:image/png;base64,${b64}`;
  }

  // 3. Post-processing: Render full-bleed 2:1 equirectangular sphere (360° coverage, NO empty background borders!)
  if (rawImageUrl.startsWith('http')) {
    try {
      const imgRes = await fetch(rawImageUrl);
      const imgBlob = await imgRes.blob();
      rawImageUrl = await new Promise<string>((resolveData) => {
        const reader = new FileReader();
        reader.onload = () => resolveData(reader.result as string);
        reader.readAsDataURL(imgBlob);
      });
    } catch {
      // ignore
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const targetW = 2048;
        const targetH = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          // Fill 100% full-frame 360 degree sphere without any empty background borders!
          ctx.drawImage(img, 0, 0, targetW, targetH);
          // Heal the 360° horizontal wrap boundary so left and right seam connects seamlessly
          const healedCanvas = healPanoramaSeam(canvas, 160);
          resolve(healedCanvas.toDataURL('image/png'));
        } else {
          resolve(rawImageUrl as string);
        }
      } catch (err) {
        console.warn('Canvas seam healing error:', err);
        resolve(rawImageUrl as string);
      }
    };
    img.onerror = () => reject(new Error('Failed to load image texture into 360 viewer'));
    img.src = rawImageUrl as string;
  });
}
