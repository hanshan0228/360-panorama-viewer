import { enhanceAndUpscalePanorama, type EnhanceOptions } from './imageEnhancer';
import { healPanoramaSeam } from './seamHealer';

self.onmessage = async (event: MessageEvent<{ image: Blob; options: EnhanceOptions; healSeam: boolean }>) => {
  let image: ImageBitmap | undefined;
  try {
    image = await createImageBitmap(event.data.image);
    const createCanvas = () => new OffscreenCanvas(1, 1);
    const canvas = enhanceAndUpscalePanorama(image, event.data.options, createCanvas);
    const result = event.data.healSeam ? healPanoramaSeam(canvas, 160, createCanvas) : canvas;
    const blob = await result.convertToBlob({ type: 'image/png' });
    self.postMessage({ blob });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Image processing failed' });
  } finally {
    image?.close();
  }
};
