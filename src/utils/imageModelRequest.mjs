export function buildImageModelRequest(endpoint, { prompt, referenceImages = [], resolution = '4K' }) {
  if (!['1K', '2K', '4K'].includes(resolution)) throw new Error('Invalid resolution');
  if (!Array.isArray(referenceImages) || referenceImages.some(image => typeof image !== 'string')) {
    throw new Error('Invalid reference images');
  }
  const base = new URL(String(endpoint.baseUrl || '').trim());
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error('Use an HTTP/HTTPS base URL without credentials, query parameters or fragments. Enter the key in API Key.');
  }
  const model = typeof endpoint.model === 'string' ? endpoint.model.trim() : '';
  if (!model) throw new Error('Model is required');
  const modelName = model.toLowerCase();
  const apiKey = String(endpoint.apiKey || '').trim();
  const refs = referenceImages.filter(Boolean);
  const isGemini = modelName.includes('gemini');
  const isImagen = modelName.includes('imagen');
  const isGptImage = /(?:^|\/)gpt-image-/.test(modelName);
  const isModernGptImage = /(?:^|\/)gpt-image-2(?:[.-]|$)/.test(modelName);
  // ponytail: Gemini has no native 2:1 ratio; use 16:9 until supported, retaining the existing final panorama resize.
  const imageConfig = { aspectRatio: '16:9',
    ...(/gemini-(?:3[.-]|nano-banana)/.test(modelName) ? { imageSize: resolution } : {}),
  };
  const headers = { 'Content-Type': 'application/json' };
  const path = base.pathname.replace(/\/+$/, '');

  if (base.hostname === 'generativelanguage.googleapis.com') {
    if (!apiKey) throw new Error('The Google AI endpoint requires a valid API Key.');
    if (isImagen && refs.length) throw new Error('This Imagen model does not support reference images.');
    const apiBase = /\/v1(?:beta)?$/.test(path) ? `${base.origin}${path}` : `${base.origin}${path}/v1beta`;
    const url = `${apiBase}/models/${encodeURIComponent(model)}:${isImagen ? 'predict' : 'generateContent'}`;
    headers['x-goog-api-key'] = apiKey;
    if (isImagen) return { url, headers, mode: 'google-imagen', payload: {
      instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: '16:9', outputMimeType: 'image/png' },
    } };
    const parts = [{ text: prompt }];
    for (const image of refs) {
      const match = image.match(/^data:(image\/[^;]+);base64,(.+)$/s);
      if (!match) throw new Error('Google reference images must be base64-encoded images.');
      parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    }
    return { url, headers, mode: 'google-gemini', payload: {
      contents: [{ parts }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig },
    } };
  }

  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const chat = !isGptImage && (isGemini || /\/chat(?:\/completions)?$/.test(path));
  const cleanPath = path.replace(/\/(?:chat(?:\/completions)?|images\/generations)$/, '');
  const apiBase = `${base.origin}${cleanPath}${cleanPath.endsWith('/v1') ? '' : '/v1'}`;
  if (chat) return { url: `${apiBase}/chat/completions`, headers, mode: 'chat', payload: {
    model,
    messages: [{ role: 'user', content: refs.length ? [
      { type: 'text', text: prompt }, ...refs.map(image => ({ type: 'image_url', image_url: { url: image } })),
    ] : prompt }],
    ...(isGemini ? { modalities: ['image'], image_config: {
      aspect_ratio: imageConfig.aspectRatio,
      ...(imageConfig.imageSize ? { image_size: imageConfig.imageSize } : {}),
    } } : {}),
  } };
  if (refs.length) throw new Error('This endpoint does not support reference images. Choose a multimodal model.');
  const modernSizes = { '1K': '1152x576', '2K': '2048x1024', '4K': '3840x1920' };
  const size = isModernGptImage ? modernSizes[resolution]
    : isGptImage ? '1536x1024' : modelName.includes('dall-e-2') ? '1024x1024' : '1792x1024';
  return { url: `${apiBase}/images/generations`, headers, mode: 'images', payload: {
    model, prompt, n: 1, size,
    ...(isGptImage ? { quality: 'auto', output_format: 'png' } : { response_format: 'b64_json' }),
  } };
}

export function inspectImageResolution(imageUrl, resolution) {
  const widths = { '1K': 1024, '2K': 2048, '4K': 3840 };
  if (!Object.hasOwn(widths, resolution)) throw new Error('Invalid resolution');
  const targetWidth = widths[resolution];
  let dimensions = null;
  try {
    const header = typeof imageUrl === 'string' && imageUrl.slice(0, 80).match(/^data:image\/[a-z0-9.+-]+;base64,/i);
    if (header) {
      const encoded = imageUrl.slice(header[0].length);
      let bytes = Uint8Array.from(atob(encoded.slice(0, 48)), character => character.charCodeAt(0));
      let view = new DataView(bytes.buffer);
      const tag = offset => String.fromCharCode(...bytes.subarray(offset, offset + 4));
      if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a && tag(12) === 'IHDR' && view.getUint32(8) === 13) {
        dimensions = [view.getUint32(16), view.getUint32(20)];
      } else if (bytes.length >= 20 && tag(0) === 'RIFF' && tag(8) === 'WEBP') {
        if (tag(12) === 'VP8X' && bytes.length >= 30) {
          dimensions = [1 + bytes[24] + bytes[25] * 256 + bytes[26] * 65536, 1 + bytes[27] + bytes[28] * 256 + bytes[29] * 65536];
        } else if (tag(12) === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
          dimensions = [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
        } else if (tag(12) === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
          const packed = view.getUint32(21, true);
          dimensions = [(packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1];
        }
      } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
        // ponytail: scan at most 192 KiB of JPEG metadata; longer headers remain unverified until a full decoder is available.
        bytes = Uint8Array.from(atob(encoded.slice(0, 262144)), character => character.charCodeAt(0));
        view = new DataView(bytes.buffer);
        let offset = 2;
        while (offset + 4 <= bytes.length && bytes[offset++] === 0xff) {
          while (bytes[offset] === 0xff) offset++;
          const marker = bytes[offset++];
          if (marker === 0xda || marker === 0xd9) break;
          if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
          const length = view.getUint16(offset);
          if (length < 2 || offset + length > bytes.length) break;
          if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
            if (length >= 8) dimensions = [view.getUint16(offset + 5), view.getUint16(offset + 3)];
            break;
          }
          offset += length;
        }
      }
    }
  } catch {
    dimensions = null;
  }
  const [width, height] = dimensions?.every(value => Number.isSafeInteger(value) && value > 0) ? dimensions : [null, null];
  const panoramaWidth = width && height ? Math.floor(Math.min(width, height * 2) / 2) * 2 : null;
  return {
    requested: resolution, targetWidth, targetHeight: targetWidth / 2, width, height,
    panoramaWidth, panoramaHeight: panoramaWidth === null ? null : panoramaWidth / 2,
    status: panoramaWidth === null ? 'unverified' : panoramaWidth >= targetWidth ? 'met' : 'below-request',
  };
}
