import { enhanceAndUpscalePanorama, type EnhanceOptions } from './imageEnhancer';
import { healPanoramaSeam } from './seamHealer';

self.onmessage = async (event: MessageEvent<{ image: Blob; options: EnhanceOptions; healSeam: boolean | 'auto' }>) => {
  let image: ImageBitmap | undefined;
  try {
    image = await createImageBitmap(event.data.image);
    const options = event.data.options;
    const cropWidth = Math.floor(Math.min(image.width, image.height * 2) / 2) * 2;
    const exactCrop = options.preserveNative === true && cropWidth === image.width && cropWidth / 2 === image.height;
    const noToneChange = (options.sharpness ?? 0.65) === 0 && (options.contrastBoost ?? 1.08) === 1;
    if (exactCrop && noToneChange && event.data.healSeam === false) {
      self.postMessage({ blob: event.data.image });
      return;
    }
    const createCanvas = () => new OffscreenCanvas(1, 1);
    const canvas = enhanceAndUpscalePanorama(image, options, createCanvas);
    const result = event.data.healSeam ? healPanoramaSeam(canvas, 160, createCanvas, event.data.healSeam === 'auto') : canvas;
    if (exactCrop && noToneChange && result === canvas) {
      // Automatic seam inspection found nothing to blend; keep the model's exact original bytes.
      self.postMessage({ blob: event.data.image });
      return;
    }
    const blob = await result.convertToBlob({ type: 'image/png' });
    self.postMessage({ blob });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Image processing failed' });
  } finally {
    image?.close();
  }
};
