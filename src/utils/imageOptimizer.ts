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
