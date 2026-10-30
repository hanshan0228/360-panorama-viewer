import { combineAbortSignals } from './abortSignal';

/** Save a private 320px JPEG thumbnail and return its data URL. Rejects on failure or session change. */
export async function saveWorkThumbnail(id: string, imageUrl: string, token: string, signal: AbortSignal): Promise<string> {
  const requestSignal = combineAbortSignals([signal, AbortSignal.timeout(8000)]);
  const checkSession = () => {
    requestSignal.throwIfAborted();
    if (!token || localStorage.getItem('panorama_server_user_token') !== token) throw new Error('Account changed.');
  };
  checkSession();
  if (!/^[a-f0-9]{32}$/.test(id) || !/^data:image\/(?:png|jpeg|webp);base64,/i.test(imageUrl)) throw new Error('Invalid thumbnail source.');
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { image.onload = null; image.onerror = null; requestSignal.removeEventListener('abort', onAbort); };
      const onAbort = () => { cleanup(); reject(requestSignal.reason); };
      image.onload = () => { cleanup(); resolve(); };
      image.onerror = () => { cleanup(); reject(new Error('Could not load thumbnail source.')); };
      requestSignal.addEventListener('abort', onAbort, { once: true });
      if (requestSignal.aborted) onAbort();
      else image.src = imageUrl;
    });
    checkSession();
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create thumbnail.');
    let thumbnail = '';
    // ponytail: shrink quality first, then dimensions, to keep the entire JSON body under 20 KiB.
    for (const maxSize of [320, 240, 160, 80]) {
      const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.75, 0.55, 0.35]) {
        thumbnail = canvas.toDataURL('image/jpeg', quality);
        if (thumbnail.startsWith('data:image/jpeg;base64,') && JSON.stringify({ thumbnail }).length <= 20 * 1024) break;
      }
      if (thumbnail.startsWith('data:image/jpeg;base64,') && JSON.stringify({ thumbnail }).length <= 20 * 1024) break;
    }
    if (!thumbnail.startsWith('data:image/jpeg;base64,') || JSON.stringify({ thumbnail }).length > 20 * 1024) throw new Error('Thumbnail is too large.');
    checkSession();
    const response = await fetch(`/api/works/${id}/thumbnail`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ thumbnail }), signal: requestSignal,
    });
    checkSession();
    if (!response.ok) throw new Error('Thumbnail could not be saved.');
    return thumbnail;
  } finally {
    image.src = '';
  }
}
