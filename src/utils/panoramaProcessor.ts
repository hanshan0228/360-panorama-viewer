import { enhanceAndUpscalePanorama, type EnhanceOptions } from './imageEnhancer';
import { healPanoramaSeam } from './seamHealer';

export async function processPanoramaImage(
  imageUrl: string,
  options: EnhanceOptions,
  healSeam: boolean | 'auto',
  signal?: AbortSignal
): Promise<string> {
  const deadline = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
  deadline.throwIfAborted();
  const response = await fetch(imageUrl, { signal: deadline });
  if (!response.ok) throw new Error(`Image download failed (${response.status})`);
  const image = await response.blob();
  deadline.throwIfAborted();
  let result: Blob;
  if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function') {
    result = await new Promise<Blob>((resolve, reject) => {
      const worker = new Worker(new URL('./panoramaProcessor.worker.ts', import.meta.url), { type: 'module' });
      let settled = false;
      const finish = (blob?: Blob, error?: unknown) => {
        if (settled) return;
        settled = true;
        deadline.removeEventListener('abort', abort);
        worker.terminate();
        if (blob) resolve(blob);
        else reject(error);
      };
      const abort = () => finish(undefined, deadline.reason);
      deadline.addEventListener('abort', abort, { once: true });
      worker.onmessage = (event: MessageEvent<{ blob?: Blob; error?: string }>) => {
        if (event.data.blob instanceof Blob && event.data.blob.size > 0) finish(event.data.blob);
        else finish(undefined, new Error(event.data.error || 'Empty processed image'));
      };
      worker.onerror = () => finish(undefined, new Error('Image worker failed'));
      worker.onmessageerror = () => finish(undefined, new Error('Image worker response could not be read'));
      try { worker.postMessage({ image, options, healSeam }); }
      catch (error) { finish(undefined, error); }
    });
  } else {
    // ponytail: legacy browsers retain main-thread processing; modern Worker/OffscreenCanvas avoids this ceiling.
    result = await new Promise<Blob>((resolve, reject) => {
      const imageElement = new Image();
      const objectUrl = URL.createObjectURL(image);
      let settled = false;
      const finish = (blob?: Blob, error?: unknown) => {
        if (settled) return;
        settled = true;
        deadline.removeEventListener('abort', abort);
        imageElement.onload = null;
        imageElement.onerror = null;
        URL.revokeObjectURL(objectUrl);
        if (blob) resolve(blob);
        else reject(error);
      };
      const abort = () => finish(undefined, deadline.reason);
      deadline.addEventListener('abort', abort, { once: true });
      imageElement.onload = () => {
        try {
          const canvas = enhanceAndUpscalePanorama(imageElement, options);
          const processed = healSeam ? healPanoramaSeam(canvas, 160, undefined, healSeam === 'auto') : canvas;
          processed.toBlob(blob => blob?.size ? finish(blob) : finish(undefined, new Error('PNG encoding failed')), 'image/png');
        } catch (error) { finish(undefined, error); }
      };
      imageElement.onerror = () => finish(undefined, new Error('Image decoding failed'));
      try { imageElement.src = objectUrl; }
      catch (error) { finish(undefined, error); }
    });
  }
  deadline.throwIfAborted();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => deadline.removeEventListener('abort', abort);
    const abort = () => { reader.abort(); cleanup(); reject(deadline.reason); };
    deadline.addEventListener('abort', abort, { once: true });
    reader.onload = () => {
      cleanup();
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Invalid image encoding'));
    };
    reader.onerror = () => { cleanup(); reject(reader.error || new Error('Image encoding failed')); };
    reader.onabort = () => { cleanup(); reject(deadline.reason || new Error('Image encoding aborted')); };
    try { reader.readAsDataURL(result); }
    catch (error) { cleanup(); reject(error); }
  });
}
