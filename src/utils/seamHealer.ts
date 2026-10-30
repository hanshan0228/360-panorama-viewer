/** Edge blending reduces a wrap discontinuity; it cannot reconstruct mismatched geometry. */
export function inspectPanoramaSeam(data: Uint8ClampedArray, width: number, height: number) {
  if (width < 2 || height < 1 || data.length !== width * height * 4) throw new Error('Invalid panorama pixels');
  let boundary = 0;
  let adjacent = 0;
  for (let y = 0; y < height; y++) {
    const left = y * width * 4;
    const right = left + (width - 1) * 4;
    for (let c = 0; c < 3; c++) {
      boundary += Math.abs(data[left + c] - data[right + c]);
      adjacent += (Math.abs(data[left + c] - data[left + 4 + c])
        + Math.abs(data[right + c] - data[right - 4 + c])) / 2;
    }
  }
  const difference = boundary / (height * 3);
  const baseline = adjacent / (height * 3);
  // ponytail: an O(height) color-jump heuristic detects hard boundaries, not semantic geometry;
  // upgrade to model-assisted seam reconstruction for mismatched objects.
  return { difference, baseline, needsBlending: difference > Math.max(12, baseline * 3) };
}

function smooth1D(arr: Float32Array, radius: number): Float32Array {
  const len = arr.length;
  const out = new Float32Array(len);
  let windowSum = 0;
  let count = 0;
  const initialEnd = Math.min(len - 1, radius);
  for (let j = 0; j <= initialEnd; j++) {
    windowSum += arr[j];
    count++;
  }
  for (let i = 0; i < len; i++) {
    if (i > 0) {
      if (i + radius < len) { windowSum += arr[i + radius]; count++; }
      if (i - radius - 1 >= 0) { windowSum -= arr[i - radius - 1]; count--; }
    }
    out[i] = windowSum / count;
  }
  return out;
}

export function healPanoramaSeam<Canvas extends HTMLCanvasElement | OffscreenCanvas>(
  sourceCanvas: Canvas,
  blendWidth = 160,
  createCanvas: () => Canvas = () => document.createElement('canvas') as Canvas,
  onlyIfNeeded = false
): Canvas {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  const resultCanvas = createCanvas();
  resultCanvas.width = width;
  resultCanvas.height = height;

  const ctx = resultCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return sourceCanvas;
  }

  // Draw original image into destination
  ctx.drawImage(sourceCanvas, 0, 0);

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  if (onlyIfNeeded && !inspectPanoramaSeam(data, width, height).needsBlending) return sourceCanvas;

  // Clone original buffer so we sample pristine pixels while writing
  const src = new Uint8ClampedArray(data);

  // Blend width for structural cross-fade: default ~8% of width, min 48, max width / 4
  const safeBlend = Math.max(48, Math.min(blendWidth || Math.floor(width * 0.08), Math.floor(width / 4)));

  // Wide harmonic window for global illumination and exposure alignment (12-16% of width)
  const harmDist = Math.max(safeBlend * 1.5, Math.min(Math.floor(width * 0.14), Math.floor(width / 3)));

  // Tiny images cannot host these wide blending windows; skip healing rather than
  // walking row indices past the buffer bounds.
  if (safeBlend > width || harmDist > width) {
    return sourceCanvas;
  }

  // Precompute Cosine S-curve weights for harmonic gradient
  const wHarm = new Float32Array(harmDist);
  for (let d = 0; d < harmDist; d++) {
    const t = d / harmDist;
    wHarm[d] = 0.5 * (1 + Math.cos(Math.PI * t)); // 1.0 at d=0, 0.0 at d=harmDist
  }

  // Precompute Cosine S-curve weights for boundary step ramp (1.0 at d=0, 0.0 at d=safeBlend)
  const wCross = new Float32Array(safeBlend);
  for (let d = 0; d < safeBlend; d++) {
    const t = d / safeBlend;
    wCross[d] = 0.5 * (1 + Math.cos(Math.PI * t));
  }

  const sampleCount = Math.min(8, Math.floor(safeBlend * 0.2));

  const rawDeltaR = new Float32Array(height);
  const rawDeltaG = new Float32Array(height);
  const rawDeltaB = new Float32Array(height);

  // 1. Multi-sample boundary colors for gradient estimation per row
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    let lR = 0, lG = 0, lB = 0;
    let rR = 0, rG = 0, rB = 0;

    for (let s = 0; s < sampleCount; s++) {
      const lIdx = (rowOffset + s) * 4;
      const rIdx = (rowOffset + (width - 1 - s)) * 4;

      lR += src[lIdx];
      lG += src[lIdx + 1];
      lB += src[lIdx + 2];

      rR += src[rIdx];
      rG += src[rIdx + 1];
      rB += src[rIdx + 2];
    }

    rawDeltaR[y] = (rR - lR) / sampleCount;
    rawDeltaG[y] = (rG - lG) / sampleCount;
    rawDeltaB[y] = (rB - lB) / sampleCount;
  }

  // Vertically smooth illumination deltas to prevent horizontal scanline striations ("拉丝")
  const vRadius = Math.max(4, Math.min(32, Math.floor(height * 0.04)));
  const smoothDeltaR = smooth1D(rawDeltaR, vRadius);
  const smoothDeltaG = smooth1D(rawDeltaG, vRadius);
  const smoothDeltaB = smooth1D(rawDeltaB, vRadius);

  // First pass: Wide harmonic illumination harmonization
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    const deltaR = smoothDeltaR[y];
    const deltaG = smoothDeltaG[y];
    const deltaB = smoothDeltaB[y];

    for (let d = 0; d < harmDist; d++) {
      const leftIdx = (rowOffset + d) * 4;
      const rightIdx = (rowOffset + (width - 1 - d)) * 4;
      const hWeight = wHarm[d];

      data[leftIdx] = Math.min(255, Math.max(0, Math.round(src[leftIdx] + 0.5 * deltaR * hWeight)));
      data[leftIdx + 1] = Math.min(255, Math.max(0, Math.round(src[leftIdx + 1] + 0.5 * deltaG * hWeight)));
      data[leftIdx + 2] = Math.min(255, Math.max(0, Math.round(src[leftIdx + 2] + 0.5 * deltaB * hWeight)));

      data[rightIdx] = Math.min(255, Math.max(0, Math.round(src[rightIdx] - 0.5 * deltaR * hWeight)));
      data[rightIdx + 1] = Math.min(255, Math.max(0, Math.round(src[rightIdx + 1] - 0.5 * deltaG * hWeight)));
      data[rightIdx + 2] = Math.min(255, Math.max(0, Math.round(src[rightIdx + 2] - 0.5 * deltaB * hWeight)));
    }
  }

  // Second pass: Bridge boundary step smoothly without mirroring opposite textures
  const rawStepR = new Float32Array(height);
  const rawStepG = new Float32Array(height);
  const rawStepB = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    const seamPixelL = rowOffset * 4;
    const seamPixelR = (rowOffset + (width - 1)) * 4;
    rawStepR[y] = data[seamPixelR] - data[seamPixelL];
    rawStepG[y] = data[seamPixelR + 1] - data[seamPixelL + 1];
    rawStepB[y] = data[seamPixelR + 2] - data[seamPixelL + 2];
  }
  const smoothStepR = smooth1D(rawStepR, vRadius);
  const smoothStepG = smooth1D(rawStepG, vRadius);
  const smoothStepB = smooth1D(rawStepB, vRadius);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    const stepR = smoothStepR[y];
    const stepG = smoothStepG[y];
    const stepB = smoothStepB[y];

    for (let d = 0; d < safeBlend; d++) {
      const leftIdx = (rowOffset + d) * 4;
      const rightIdx = (rowOffset + (width - 1 - d)) * 4;
      const ramp = wCross[d];

      data[leftIdx] = Math.min(255, Math.max(0, Math.round(data[leftIdx] + 0.5 * stepR * ramp)));
      data[leftIdx + 1] = Math.min(255, Math.max(0, Math.round(data[leftIdx + 1] + 0.5 * stepG * ramp)));
      data[leftIdx + 2] = Math.min(255, Math.max(0, Math.round(data[leftIdx + 2] + 0.5 * stepB * ramp)));

      data[rightIdx] = Math.min(255, Math.max(0, Math.round(data[rightIdx] - 0.5 * stepR * ramp)));
      data[rightIdx + 1] = Math.min(255, Math.max(0, Math.round(data[rightIdx + 1] - 0.5 * stepG * ramp)));
      data[rightIdx + 2] = Math.min(255, Math.max(0, Math.round(data[rightIdx + 2] - 0.5 * stepB * ramp)));
    }

    // 3. Exact Bit-for-Bit Seam Equality at column 0 and column (width - 1)
    const seamPixelL = rowOffset * 4;
    const seamPixelR = (rowOffset + (width - 1)) * 4;

    const exactR = Math.round((data[seamPixelL] + data[seamPixelR]) / 2);
    const exactG = Math.round((data[seamPixelL + 1] + data[seamPixelR + 1]) / 2);
    const exactB = Math.round((data[seamPixelL + 2] + data[seamPixelR + 2]) / 2);

    data[seamPixelL] = exactR;
    data[seamPixelR] = exactR;
    data[seamPixelL + 1] = exactG;
    data[seamPixelR + 1] = exactG;
    data[seamPixelL + 2] = exactB;
    data[seamPixelR + 2] = exactB;
  }

  // 4. Pole (Zenith +90° and Nadir -90°) Pinch Smoothing
  smoothPoleRow(data, width, height, 0, 4);
  smoothPoleRow(data, width, height, height - 1, 4);

  ctx.putImageData(imgData, 0, 0);
  return resultCanvas;
}

function smoothPoleRow(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  targetRow: number,
  depth: number
): void {
  // Compute average color across pole row
  let sumR = 0, sumG = 0, sumB = 0;
  const rowOffset = targetRow * width;
  for (let x = 0; x < width; x++) {
    const idx = (rowOffset + x) * 4;
    sumR += data[idx];
    sumG += data[idx + 1];
    sumB += data[idx + 2];
  }
  const poleR = Math.round(sumR / width);
  const poleG = Math.round(sumG / width);
  const poleB = Math.round(sumB / width);

  // Gently blend top/bottom depth rows towards uniform pole color
  const isTop = targetRow === 0;
  for (let i = 0; i < depth; i++) {
    const y = isTop ? i : height - 1 - i;
    const factor = (depth - i) / (depth + 1);
    const rOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = (rOffset + x) * 4;
      data[idx] = Math.round(data[idx] * (1 - factor) + poleR * factor);
      data[idx + 1] = Math.round(data[idx + 1] * (1 - factor) + poleG * factor);
      data[idx + 2] = Math.round(data[idx + 2] * (1 - factor) + poleB * factor);
    }
  }
}
