export interface PanoramaPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function validatePixels(image: PanoramaPixels) {
  if (!Number.isSafeInteger(image.width) || image.width < 2 || !Number.isSafeInteger(image.height) || image.height < 1
    || !(image.data instanceof Uint8ClampedArray) || image.data.length !== image.width * image.height * 4) {
    throw new Error('Invalid panorama pixels');
  }
}

/** Positive shifts move pixels right; negative shifts undo the roll, including odd widths. */
export function rollPanoramaPixels(image: PanoramaPixels, shift = Math.floor(image.width / 2)): PanoramaPixels {
  validatePixels(image);
  if (!Number.isSafeInteger(shift)) throw new Error('Invalid panorama shift');
  const { width, height, data } = image;
  const offset = ((shift % width) + width) % width;
  const result = new Uint8ClampedArray(data.length);
  const rowBytes = width * 4;
  const split = (width - offset) * 4;
  for (let y = 0; y < height; y++) {
    const row = y * rowBytes;
    result.set(data.subarray(row + split, row + rowBytes), row);
    result.set(data.subarray(row, row + split), row + offset * 4);
  }
  return { width, height, data: result };
}

/** OpenAI edit masks use alpha=0 for the editable band and alpha=255 elsewhere. */
export function createSeamInpaintMask(width: number, height: number,
  bandWidth = Math.max(1, Math.round(width * 0.15625))): PanoramaPixels {
  if (!Number.isSafeInteger(width) || width < 2 || !Number.isSafeInteger(height) || height < 1
    || !Number.isSafeInteger(bandWidth) || bandWidth < 1 || bandWidth > width) throw new Error('Invalid seam mask dimensions');
  const data = new Uint8ClampedArray(width * height * 4);
  const left = Math.floor((width - bandWidth) / 2);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    data[(y * width + x) * 4 + 3] = x >= left && x < left + bandWidth ? 0 : 255;
  }
  return { width, height, data };
}

/** Accept an edit of the rolled image; return the original orientation with untouched pixels outside the band. */
export function compositeSeamInpaint(original: PanoramaPixels, editedRolled: PanoramaPixels,
  bandWidth = Math.max(1, Math.round(original.width * 0.15625)),
  featherWidth = Math.min(Math.round(original.width * 0.03125), Math.floor((bandWidth - 1) / 2))): PanoramaPixels {
  validatePixels(original);
  validatePixels(editedRolled);
  const { width, height } = original;
  if (editedRolled.width !== width || editedRolled.height !== height) throw new Error('Edited panorama dimensions must match');
  if (!Number.isSafeInteger(bandWidth) || bandWidth < 1 || bandWidth > width
    || !Number.isSafeInteger(featherWidth) || featherWidth < 0 || featherWidth > Math.floor((bandWidth - 1) / 2)) {
    throw new Error('Invalid seam band or feather width');
  }
  const data = new Uint8ClampedArray(original.data);
  const left = Math.floor((width - bandWidth) / 2);
  const shift = Math.floor(width / 2);
  for (let x = left; x < left + bandWidth; x++) {
    const distance = Math.min(x - left, left + bandWidth - 1 - x);
    const weight = featherWidth === 0 ? 1 : Math.min(1, distance / featherWidth);
    const originalX = (x - shift + width) % width;
    for (let y = 0; y < height; y++) {
      const target = (y * width + originalX) * 4;
      const source = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) data[target + c] = Math.round(
        original.data[target + c] * (1 - weight) + editedRolled.data[source + c] * weight);
    }
  }
  return { width, height, data };
}
