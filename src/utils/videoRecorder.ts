import * as THREE from 'three';

export interface VideoRecordOptions {
  durationSeconds: number;
  fps: number;
  width: number;
  height: number;
  rotationRounds?: number;
  tiltDeg?: number;
  onProgress?: (percent: number) => void;
}

export async function renderPanoramaToVideoBlob(
  textureUrl: string,
  options: VideoRecordOptions
): Promise<Blob> {
  const { durationSeconds = 8, fps = 30, width = 1920, height = 1080,
    rotationRounds = 1, tiltDeg = 0, onProgress } = options;
  if (![durationSeconds, fps, width, height].every(value => Number.isFinite(value) && value > 0)
    || !Number.isFinite(rotationRounds) || !Number.isFinite(tiltDeg)) {
    throw new Error('Invalid video recording options');
  }
  return new Promise((resolve, reject) => {
    let renderer: THREE.WebGLRenderer | undefined;
    let texture: THREE.Texture | undefined;
    let geometry: THREE.SphereGeometry | undefined;
    let material: THREE.MeshBasicMaterial | undefined;
    let stream: MediaStream | undefined;
    let recorder: MediaRecorder | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let settled = false;
    const cleanup = () => {
      if (timer !== undefined) clearInterval(timer);
      if (recorder) {
        recorder.onstop = recorder.onerror = recorder.ondataavailable = null;
        if (recorder.state !== 'inactive') {
          try { recorder.stop(); } catch { /* ponytail: cleanup continues after recorder failure. */ }
        }
      }
      const resources = [...(stream?.getTracks() ?? []).map(track => () => track.stop()),
        () => geometry?.dispose(), () => material?.dispose(),
        () => texture?.dispose(), () => renderer?.dispose()];
      for (const release of resources) {
        try { release(); } catch { /* ponytail: release remaining resources after cleanup failure. */ }
      }
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true,
        preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(1);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      texture = new THREE.TextureLoader().load(textureUrl, loadedTexture => {
        if (settled) { loadedTexture.dispose(); return; }
        texture = loadedTexture;
        try {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter = texture.magFilter = THREE.LinearFilter;
          geometry = new THREE.SphereGeometry(500, 64, 48);
          geometry.scale(-1, 1, 1);
          material = new THREE.MeshBasicMaterial({ map: texture });
          scene.add(new THREE.Mesh(geometry, material));
          const mimeType = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
            .find(type => MediaRecorder.isTypeSupported(type));
          stream = canvas.captureStream(fps);
          try {
            recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
          } catch {
            recorder = new MediaRecorder(stream);
          }
          const recordedChunks: Blob[] = [];
          recorder.ondataavailable = event => {
            if (event.data?.size > 0) recordedChunks.push(event.data);
          };
          recorder.onerror = event => fail(
            (event as Event & { error?: DOMException }).error ?? new Error('Video recording failed')
          );
          recorder.onstop = () => {
            if (settled) return;
            try {
              const blob = new Blob(recordedChunks, { type: recorder?.mimeType || 'video/webm' });
              if (!blob.size) throw new Error('Video recording produced no data');
              settled = true;
              cleanup();
              resolve(blob);
            } catch (error) { fail(error); }
          };
          recorder.start();
          if (settled) return;
          const totalFrames = Math.max(1, Math.round(durationSeconds * fps));
          let currentFrame = 0;
          timer = setInterval(() => {
            try {
              if (currentFrame >= totalFrames) {
                clearInterval(timer);
                onProgress?.(100);
                recorder!.stop();
                return;
              }
              const progress = currentFrame / totalFrames;
              const theta = progress * Math.PI * 2 * rotationRounds;
              const phi = THREE.MathUtils.degToRad(tiltDeg * Math.sin(progress * Math.PI * 2));
              camera.rotation.set(phi, -theta, 0, 'YXZ');
              renderer!.render(scene, camera);
              onProgress?.(Math.round(progress * 100));
              currentFrame++;
            } catch (error) { fail(error); }
          }, 1000 / fps);
        } catch (error) { fail(error); }
      }, undefined, fail);
    } catch (error) { fail(error); }
  });
}
