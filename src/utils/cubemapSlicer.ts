import type { CubemapFace, CubemapFaceName } from '../types/panorama';

const FACES: Array<{ name: CubemapFaceName; label: string }> = [
  { name: 'posx', label: 'Right (+X)' },
  { name: 'negx', label: 'Left (-X)' },
  { name: 'posy', label: 'Top (+Y)' },
  { name: 'negy', label: 'Bottom (-Y)' },
  { name: 'posz', label: 'Front (+Z)' },
  { name: 'negz', label: 'Back (-Z)' },
];

/**
 * Converts a 2:1 equirectangular image into 6 cubemap faces using 3D ray-casting.
 */
export function sliceEquirectangularToCubemap(
  sourceCanvas: HTMLCanvasElement,
  faceSize = 512
): CubemapFace[] {
  const eqWidth = sourceCanvas.width;
  const eqHeight = sourceCanvas.height;

  const srcCtx = sourceCanvas.getContext('2d');
  if (!srcCtx) {
    throw new Error('Failed to acquire 2D context from source canvas');
  }

  const srcData = srcCtx.getImageData(0, 0, eqWidth, eqHeight);
  const srcPixels = srcData.data;

  const cubemapFaces: CubemapFace[] = [];

  for (const face of FACES) {
    const faceCanvas = document.createElement('canvas');
    faceCanvas.width = faceSize;
    faceCanvas.height = faceSize;
    const faceCtx = faceCanvas.getContext('2d');
    if (!faceCtx) continue;

    const faceImgData = faceCtx.createImageData(faceSize, faceSize);
    const facePixels = faceImgData.data;

    for (let j = 0; j < faceSize; j++) {
      // Normalized v in [-1, 1]
      const v = 1 - (2 * (j + 0.5)) / faceSize;

      for (let i = 0; i < faceSize; i++) {
        // Normalized u in [-1, 1]
        const u = (2 * (i + 0.5)) / faceSize - 1;

        let rx = 0;
        let ry = 0;
        let rz = 0;

        switch (face.name) {
          case 'posx': // Right
            rx = 1;
            ry = v;
            rz = -u;
            break;
          case 'negx': // Left
            rx = -1;
            ry = v;
            rz = u;
            break;
          case 'posy': // Top
            rx = u;
            ry = 1;
            rz = -v;
            break;
          case 'negy': // Bottom
            rx = u;
            ry = -1;
            rz = v;
            break;
          case 'posz': // Front
            rx = u;
            ry = v;
            rz = 1;
            break;
          case 'negz': // Back
            rx = -u;
            ry = v;
            rz = -1;
            break;
        }

        const rLen = Math.hypot(rx, ry, rz);
        const nx = rx / rLen;
        const ny = ry / rLen;
        const nz = rz / rLen;

        // Longitude in [-PI, PI], Latitude in [-PI/2, PI/2]
        const lon = Math.atan2(nx, nz);
        const lat = Math.asin(Math.max(-1, Math.min(1, ny)));

        // Map to Equirectangular coordinates (0 to eqWidth - 1, 0 to eqHeight - 1)
        const eqX = ((lon / Math.PI + 1) * 0.5) * (eqWidth - 1);
        const eqY = (0.5 - lat / Math.PI) * (eqHeight - 1);

        // Nearest-neighbor sample
        const srcX = Math.min(eqWidth - 1, Math.max(0, Math.round(eqX)));
        const srcY = Math.min(eqHeight - 1, Math.max(0, Math.round(eqY)));

        const srcIdx = (srcY * eqWidth + srcX) * 4;
        const faceIdx = (j * faceSize + i) * 4;

        facePixels[faceIdx] = srcPixels[srcIdx];
        facePixels[faceIdx + 1] = srcPixels[srcIdx + 1];
        facePixels[faceIdx + 2] = srcPixels[srcIdx + 2];
        facePixels[faceIdx + 3] = 255;
      }
    }

    faceCtx.putImageData(faceImgData, 0, 0);

    cubemapFaces.push({
      name: face.name,
      label: face.label,
      dataUrl: faceCanvas.toDataURL('image/png'),
      canvas: faceCanvas,
    });
  }

  return cubemapFaces;
}

export interface CubemapFacePixels {
  name: CubemapFaceName;
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Exact inverse of the slicer's per-face ray mapping: cube normal -> face + (u, v). */
function projectToFace(nx: number, ny: number, nz: number): [CubemapFaceName, number, number] {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  if (az >= ax && az >= ay) return nz > 0 ? ['posz', nx / nz, ny / nz] : ['negz', nx / nz, -ny / nz];
  if (ax >= ay) return nx > 0 ? ['posx', -nz / nx, ny / nx] : ['negx', -nz / nx, -ny / nx];
  return ny > 0 ? ['posy', nx / ny, -nz / ny] : ['negy', -nx / ny, -nz / ny];
}

/**
 * Stitches 6 cube faces back into a 2:1 equirectangular image by ray-marching every
 * output pixel to its source face. Splitting the pure pixel math out keeps it testable
 * without a DOM; `stitchCubemapToEquirectangular` is the canvas wrapper.
 */
export function stitchCubemapPixelsToEquirectangular(
  faces: CubemapFacePixels[],
  eqWidth: number,
  eqHeight: number
): Uint8ClampedArray {
  const byName = new Map(faces.map(face => [face.name, face]));
  const out = new Uint8ClampedArray(eqWidth * eqHeight * 4);

  for (let y = 0; y < eqHeight; y++) {
    const lat = (0.5 - y / Math.max(1, eqHeight - 1)) * Math.PI;
    const cosLat = Math.cos(lat);
    const ny = Math.sin(lat);

    for (let x = 0; x < eqWidth; x++) {
      const lon = ((x / Math.max(1, eqWidth - 1)) * 2 - 1) * Math.PI;
      const [name, u, v] = projectToFace(
        Math.sin(lon) * cosLat,
        ny,
        Math.cos(lon) * cosLat
      );

      const outIdx = (y * eqWidth + x) * 4;
      const face = byName.get(name);
      if (!face) {
        // Faces the caller did not provide stay transparent instead of guessing.
        continue;
      }

      const srcX = Math.min(face.width - 1, Math.max(0, Math.round(((u + 1) * 0.5) * face.width - 0.5)));
      const srcY = Math.min(face.height - 1, Math.max(0, Math.round(((1 - v) * 0.5) * face.height - 0.5)));
      const srcIdx = (srcY * face.width + srcX) * 4;

      out[outIdx] = face.data[srcIdx];
      out[outIdx + 1] = face.data[srcIdx + 1];
      out[outIdx + 2] = face.data[srcIdx + 2];
      out[outIdx + 3] = 255;
    }
  }

  return out;
}

/**
 * Canvas wrapper used by the Cubemap to Equirectangular page. `faces` may be a partial
 * set: missing faces are left transparent so a 5-of-6 import still previews.
 */
export function stitchCubemapToEquirectangular(
  faces: CubemapFace[],
  eqWidth = 2048
): HTMLCanvasElement {
  const eqHeight = Math.round(eqWidth / 2);
  const pixels: CubemapFacePixels[] = [];
  for (const face of faces) {
    const ctx = face.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to read cubemap face pixels');
    const image = ctx.getImageData(0, 0, face.canvas.width, face.canvas.height);
    pixels.push({ name: face.name, width: face.canvas.width, height: face.canvas.height, data: image.data });
  }

  const out = stitchCubemapPixelsToEquirectangular(pixels, eqWidth, eqHeight);
  const canvas = document.createElement('canvas');
  canvas.width = eqWidth;
  canvas.height = eqHeight;
  const outCtx = canvas.getContext('2d');
  if (!outCtx) throw new Error('Failed to acquire 2D context for the equirectangular canvas');
  const image = outCtx.createImageData(eqWidth, eqHeight);
  image.data.set(out);
  outCtx.putImageData(image, 0, 0);
  return canvas;
}
