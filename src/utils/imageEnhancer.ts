export interface EnhanceOptions {
  resolution?: '1K' | '2K' | '4K';
  preserveNative?: boolean;
  scaleFactor?: 1 | 2 | 4;
  sharpness?: number; // 0.0 to 1.0
  contrastBoost?: number; // 1.0 to 1.3
}

export function enhanceAndUpscalePanorama<Canvas extends HTMLCanvasElement | OffscreenCanvas = HTMLCanvasElement>(
  sourceImage: HTMLImageElement | ImageBitmap,
  options: EnhanceOptions = {},
  createCanvas: () => Canvas = () => document.createElement('canvas') as Canvas
): Canvas {
  const { resolution, preserveNative = false, scaleFactor = 2, sharpness = 0.65, contrastBoost = 1.08 } = options;

  const origW = 'naturalWidth' in sourceImage ? sourceImage.naturalWidth || sourceImage.width : sourceImage.width;
  const origH = 'naturalHeight' in sourceImage ? sourceImage.naturalHeight || sourceImage.height : sourceImage.height;
  if (!Number.isFinite(origW) || !Number.isFinite(origH) || origW < 2 || origH < 1) {
    throw new Error('Invalid image dimensions');
  }

  const outputWidth = resolution === '1K' ? 1024 : resolution === '2K' ? 2048 : resolution === '4K' ? 3840 : undefined;
  const cropWidth = Math.floor(Math.min(origW, origH * 2) / 2) * 2;
  const targetW = preserveNative ? cropWidth : outputWidth ?? (scaleFactor === 1 ? origW : Math.min(4096, origW * scaleFactor));
  const targetH = preserveNative ? cropWidth / 2 : outputWidth ? outputWidth / 2 : (scaleFactor === 1 ? origH : Math.min(2048, origH * scaleFactor));

  const canvas = createCanvas();
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas unavailable');

  // 1. High-quality smooth upscaled draw
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (preserveNative) {
    // ponytail: center cropping preserves pixel density, not missing 360 geometry; AI outpainting would require another model call.
    ctx.drawImage(sourceImage, Math.floor((origW - targetW) / 2), Math.floor((origH - targetH) / 2), targetW, targetH, 0, 0, targetW, targetH);
  } else {
    ctx.drawImage(sourceImage, 0, 0, targetW, targetH);
  }
  if (sharpness === 0 && contrastBoost === 1) return canvas;

  // 2. Extract pixel data for sharpening & micro-contrast
  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const src = new Uint8ClampedArray(imgData.data);
  const dst = imgData.data;

  // Sharpening strength
  const kWeight = sharpness * 0.7;

  // Convolution unsharp mask pass (3x3 kernel)
  // [  0,   -k,    0 ]
  // [ -k, 1+4k,   -k ]
  // [  0,   -k,    0 ]
  const centerWeight = 1.0 + 4.0 * kWeight;

  for (let y = 1; y < targetH - 1; y++) {
    const rowOffset = y * targetW;
    const upOffset = (y - 1) * targetW;
    const downOffset = (y + 1) * targetW;

    for (let x = 0; x < targetW; x++) {
      const idx = (rowOffset + x) * 4;
      const upIdx = (upOffset + x) * 4;
      const downIdx = (downOffset + x) * 4;
      // Seamless 360° Horizontal Wrap: left of x=0 is targetW-1, right of targetW-1 is 0
      const leftX = (x - 1 + targetW) % targetW;
      const rightX = (x + 1) % targetW;
      const leftIdx = (rowOffset + leftX) * 4;
      const rightIdx = (rowOffset + rightX) * 4;

      for (let c = 0; c < 3; c++) {
        const center = src[idx + c];
        const up = src[upIdx + c];
        const down = src[downIdx + c];
        const left = src[leftIdx + c];
        const right = src[rightIdx + c];

        // Convolve
        let sharpened = center * centerWeight - (up + down + left + right) * kWeight;

        // Apply subtle micro-contrast curve (S-curve around midpoint 128)
        if (contrastBoost > 1.0) {
          const norm = (sharpened - 128) / 128;
          sharpened = 128 + norm * contrastBoost * 128;
        }

        dst[idx + c] = Math.max(0, Math.min(255, Math.round(sharpened)));
      }
      dst[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}
