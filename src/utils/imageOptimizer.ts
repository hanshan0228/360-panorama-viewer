/**
 * Image processing utilities for handling non-2:1 or standard photos
 * so they render beautifully inside 360 viewer without distortion.
 */

export interface ImageDimensionInfo {
  width: number;
  height: number;
  aspectRatio: number;
  isStandard2to1: boolean;
}

export function analyzeImageDimensions(
  img: HTMLImageElement
): ImageDimensionInfo {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const aspectRatio = width / height;
  const isStandard2to1 = Math.abs(aspectRatio - 2.0) <= 0.08;

  return {
    width,
    height,
    aspectRatio,
    isStandard2to1,
  };
}

/**
 * Converts a standard 2D photo (e.g. 16:9, 4:3, wide landscape) into a
 * clean 2:1 Equirectangular canvas by placing the photo in the central visual field
 * with an ambient seamless background, preventing vertical funhouse stretching.
 */
export function convertFlatPhotoToEquirectangular(
  sourceImage: HTMLImageElement,
  targetWidth = 2048
): HTMLCanvasElement {
  const targetHeight = targetWidth / 2;
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const srcW = sourceImage.naturalWidth || sourceImage.width;
  const srcH = sourceImage.naturalHeight || sourceImage.height;
  const srcRatio = srcW / srcH;

  // 1. Draw blurred, ambient background to fill the 360 canvas
  ctx.save();
  ctx.filter = 'blur(40px) brightness(0.6)';
  ctx.drawImage(sourceImage, -targetWidth * 0.2, -targetHeight * 0.2, targetWidth * 1.4, targetHeight * 1.4);
  ctx.restore();

  // Subtle dark vignette on poles to make viewer feel grounded
  const poleGrad = ctx.createLinearGradient(0, 0, 0, targetHeight);
  poleGrad.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
  poleGrad.addColorStop(0.2, 'rgba(0, 0, 0, 0.2)');
  poleGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  poleGrad.addColorStop(0.8, 'rgba(0, 0, 0, 0.2)');
  poleGrad.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
  ctx.fillStyle = poleGrad;
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  // 2. Fit the subject in the central viewing arc (e.g., spans ~120° to 180° horizontally)
  // At 2:1, targetWidth represents 360°. A 140° view is (140/360) * targetWidth
  const viewSpanDeg = Math.min(180, Math.max(90, srcRatio * 60));
  const drawWidth = (viewSpanDeg / 360) * targetWidth;
  const drawHeight = drawWidth / srcRatio;

  const drawX = -drawWidth / 2;
  const drawY = (targetHeight - drawHeight) / 2;

  // Draw clean, sharp subject photo with soft feather border
  ctx.drawImage(sourceImage, drawX, drawY, drawWidth, drawHeight);
  ctx.drawImage(sourceImage, drawX + targetWidth, drawY, drawWidth, drawHeight);

  // Soft border gradient feather
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  ctx.strokeRect(drawX, drawY, drawWidth, drawHeight);
  ctx.strokeRect(drawX + targetWidth, drawY, drawWidth, drawHeight);

  return canvas;
}

/** Encode a smaller sharing copy without modifying the generation or its local downloads. */
export async function preparePanoramaShare(source: Blob, signal?: AbortSignal): Promise<{ blob: Blob; width: number; height: number; compressed: boolean }> {
  const targetBytes = 8 * 1024 * 1024, maximumBytes = 20 * 1024 * 1024;
  signal?.throwIfAborted();
  const image = await createImageBitmap(source);
  try {
    if (image.width !== image.height * 2 || image.width > 16384 || image.width * image.height > 64 * 1024 * 1024) throw new Error('Share the prepared 2:1 panorama, rather than a non-2:1 model original.');
    if (['image/png', 'image/jpeg'].includes(source.type) && source.size <= targetBytes) return { blob: source, width: image.width, height: image.height, compressed: false };
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image preparation is unavailable.');
    let width = image.width;
    while (true) {
      signal?.throwIfAborted();
      canvas.width = width; canvas.height = width / 2;
      // JPEG cannot represent transparency; flatten onto a neutral background.
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let last: Blob | null = null;
      for (const quality of [0.92, 0.84, 0.74]) {
        signal?.throwIfAborted();
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value?.size ? resolve(value) : reject(new Error('Share image encoding failed.')), 'image/jpeg', quality));
        signal?.throwIfAborted();
        if (blob.type !== 'image/jpeg') throw new Error('This browser cannot encode a compressed JPEG sharing copy.');
        last = blob;
        if (blob.size <= targetBytes) return { blob, width, height: width / 2, compressed: true };
      }
      // ponytail: prefer native pixels over the 8 MB target; resize only above the hard 20 MB ceiling.
      if (last && last.size <= maximumBytes) return { blob: last, width, height: width / 2, compressed: true };
      if (width <= Math.min(1024, image.width)) throw new Error('The image could not be compressed below the sharing limit.');
      width = Math.max(Math.min(1024, image.width), Math.floor(width * 0.75 / 2) * 2);
    }
  } finally { image.close(); }
}
