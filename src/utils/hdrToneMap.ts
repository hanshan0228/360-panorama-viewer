/**
 * Radiance .hdr files store linear radiance, so a normal environment map holds
 * values well above 1.0 (a sun disk can reach 1000+). Truncating those to 8 bits
 * throws the highlights away, so the viewer runs them through the ACES filmic
 * curve (Narkowicz approximation) and then the sRGB transfer function.
 */
const ACES_A = 2.51;
const ACES_B = 0.03;
const ACES_C = 2.43;
const ACES_D = 0.59;
const ACES_E = 0.14;

function encodeSrgb(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

/**
 * Tone-maps RGBA linear-light samples (4 components per pixel, matching what
 * three's HDRLoader returns) into 8-bit sRGB bytes ready for putImageData.
 */
export function toneMapLinearRgbToRgba(linear: ArrayLike<number>, exposure = 1): Uint8ClampedArray {
  const pixels = Math.floor(linear.length / 4);
  const output = new Uint8ClampedArray(pixels * 4);
  for (let pixel = 0; pixel < pixels; pixel++) {
    const index = pixel * 4;
    for (let channel = 0; channel < 3; channel++) {
      const value = Math.max(0, linear[index + channel]) * exposure;
      const mapped = (value * (ACES_A * value + ACES_B)) / (value * (ACES_C * value + ACES_D) + ACES_E);
      output[index + channel] = encodeSrgb(mapped) * 255;
    }
    output[index + 3] = 255;
  }
  return output;
}
