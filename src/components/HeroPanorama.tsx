/**
 * HeroPanorama — interactive 360° panorama backdrop for the studio hero.
 *
 * A deliberately slim sibling of SphereViewer: it keeps the same conventions
 * (sphere radius 500 with geometry.scale(-1, 1, 1), degree-based lon/lat camera,
 * drag sensitivity scaled by fov, per-frame momentum glide) but drops all viewer
 * chrome. In particular it does NOT capture wheel or keyboard events, so scrolling
 * and typing keep working while the hero is on screen.
 *
 * The static <img> rendered behind this layer stays in place as the instant LCP
 * paint and as the fallback whenever WebGL is unavailable.
 */
import { memo, useEffect, useRef } from 'react';
import * as THREE from 'three';

const SPHERE_RADIUS = 500;
const FOV = 68;
const LAT_LIMIT = 55;
const DRAG_SENSITIVITY_BASE = 0.16; // deg per px at fov 75, scaled like SphereViewer
const FLING_CAP = 2.8; // max momentum, deg per frame at 60 fps
const FRICTION_PER_FRAME = 0.948; // SphereViewer's momentum decay
const GLIDE_PER_FRAME = 0.14; // SphereViewer's target/current smoothing
const AUTO_ROTATE_RESUME_DELAY = 2.2; // seconds of idle before rotation resumes
const AUTO_ROTATE_DEG_PER_SEC = 1.2;

const clampLat = (value: number) => Math.max(-LAT_LIMIT, Math.min(LAT_LIMIT, value));

interface HeroPanoramaProps {
  textureUrl: string;
  className?: string;
}

export const HeroPanorama = memo(function HeroPanorama({ textureUrl, className = '' }: HeroPanoramaProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      return; // keep the static cover fallback
    }

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionQuery.matches;
    const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
    };
    motionQuery.addEventListener('change', onMotionPreferenceChange);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearAlpha(0);
    const canvas = renderer.domElement;
    canvas.className = 'studio-hero-panorama-canvas';
    container.appendChild(canvas);
    container.setAttribute('aria-hidden', 'true');

    // The "drag to look around" affordance only exists while WebGL is live,
    // so it is created imperatively next to the canvas and fades on first use.
    const hint = document.createElement('span');
    hint.className = 'studio-hero-panorama-hint';
    hint.textContent = 'DRAG TO LOOK AROUND · 360°';
    container.appendChild(hint);
    requestAnimationFrame(() => {
      hint.style.opacity = '1';
    });
    let hintTimer = 0;
    const dismissHint = () => {
      hint.style.opacity = '0';
      hintTimer = window.setTimeout(() => hint.remove(), 650);
    };

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 2, 0.1, 1000);

    const geometry = new THREE.SphereGeometry(SPHERE_RADIUS, 96, 56);
    geometry.scale(-1, 1, 1);

    const texture = new THREE.TextureLoader().load(textureUrl, () => {
      // fade the live sphere in over the static cover once the texture is ready
      requestAnimationFrame(() => {
        canvas.style.opacity = '1';
      });
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

    const material = new THREE.MeshBasicMaterial({ map: texture });
    scene.add(new THREE.Mesh(geometry, material));

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    // ---- look-around state (degrees) ----
    let targetLon = 0; // yaw, starts on the horizontal center of the panorama
    let targetLat = -5; // pitch, a touch below the horizon
    let curLon = targetLon;
    let curLat = targetLat;
    let velLon = 0;
    let velLat = 0;
    let interacting = false;
    let activePointerId: number | null = null;
    let idleFor = AUTO_ROTATE_RESUME_DELAY + 1; // begin with a slow drift
    let lastX = 0;
    let lastY = 0;
    let lastMoveAt = 0;

    const abortController = new AbortController();
    const { signal } = abortController;

    container.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (activePointerId !== null) return; // ignore additional pointers while a drag is live
      activePointerId = event.pointerId;
      interacting = true;
      idleFor = 0;
      velLon = 0;
      velLat = 0;
      lastX = event.clientX;
      lastY = event.clientY;
      lastMoveAt = performance.now();
      container.setPointerCapture(event.pointerId);
      dismissHint();
    }, { signal });

    container.addEventListener('pointermove', (event) => {
      if (!interacting || event.pointerId !== activePointerId) return;
      const now = performance.now();
      const dtMs = Math.max(1, now - lastMoveAt);
      const sensitivity = (FOV / 75) * DRAG_SENSITIVITY_BASE;
      const moveX = (lastX - event.clientX) * sensitivity;
      const moveY = (event.clientY - lastY) * sensitivity;
      lastX = event.clientX;
      lastY = event.clientY;
      lastMoveAt = now;

      targetLon += moveX;
      targetLat = clampLat(targetLat + moveY);

      const instantLon = (moveX * 16) / dtMs;
      const instantLat = (moveY * 16) / dtMs;
      velLon = velLon * 0.35 + instantLon * 0.65;
      velLat = velLat * 0.35 + instantLat * 0.65;
    }, { signal });

    const endDrag = (event: PointerEvent) => {
      if (!interacting || event.pointerId !== activePointerId) return;
      interacting = false;
      activePointerId = null;
      idleFor = 0;
      if (performance.now() - lastMoveAt > 65) {
        velLon = 0;
        velLat = 0;
      } else {
        velLon = Math.max(-FLING_CAP, Math.min(FLING_CAP, velLon));
        velLat = Math.max(-FLING_CAP, Math.min(FLING_CAP, velLat));
      }
      if (container.hasPointerCapture(event.pointerId)) {
        container.releasePointerCapture(event.pointerId);
      }
    };
    container.addEventListener('pointerup', endDrag, { signal });
    container.addEventListener('pointercancel', endDrag, { signal });
    // Browsers fire this when capture is lost (e.g. the pointer left the window) instead of pointerup.
    container.addEventListener('lostpointercapture', endDrag, { signal });

    let rafId = 0;
    let running = false;
    let lastTime = 0;

    const tick = (now: number) => {
      const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 1 / 60;
      lastTime = now;
      const frameScale = dt * 60; // keeps per-frame constants frame-rate independent

      if (!interacting) {
        // momentum glide, then idle auto-rotation (SphereViewer's physics)
        targetLon += velLon * frameScale;
        targetLat = clampLat(targetLat + velLat * frameScale);
        const friction = Math.pow(FRICTION_PER_FRAME, frameScale);
        velLon *= friction;
        velLat *= friction;
        if (Math.abs(velLon) < 0.002) velLon = 0;
        if (Math.abs(velLat) < 0.002) velLat = 0;

        if (velLon === 0 && velLat === 0) {
          idleFor += dt;
          if (!reducedMotion && idleFor > AUTO_ROTATE_RESUME_DELAY) {
            targetLon += AUTO_ROTATE_DEG_PER_SEC * dt;
          }
        } else {
          idleFor = 0;
        }
      }

      const glide = 1 - Math.pow(1 - GLIDE_PER_FRAME, frameScale);
      curLon += (targetLon - curLon) * glide;
      curLat += (targetLat - curLat) * glide;

      const phi = THREE.MathUtils.degToRad(90 - curLat);
      const theta = THREE.MathUtils.degToRad(curLon);
      camera.lookAt(
        SPHERE_RADIUS * Math.sin(phi) * Math.cos(theta),
        SPHERE_RADIUS * Math.cos(phi),
        SPHERE_RADIUS * Math.sin(phi) * Math.sin(theta),
      );

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      lastTime = 0;
      rafId = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(rafId);
    };

    const intersectionObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      if (entry.isIntersecting) start();
      else stop();
    }, { threshold: 0 });
    intersectionObserver.observe(container);

    // If the GPU context is lost, stop rendering and reveal the static cover behind the canvas
    // instead of leaving a frozen frame on screen.
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      canvas.style.opacity = '0';
      stop();
    };
    canvas.addEventListener('webglcontextlost', handleContextLost, false);

    return () => {
      stop();
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      motionQuery.removeEventListener('change', onMotionPreferenceChange);
      abortController.abort();
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      window.clearTimeout(hintTimer);
      hint.remove();
      canvas.remove();
      container.removeAttribute('aria-hidden');
    };
  }, [textureUrl]);

  return <div ref={containerRef} className={`studio-hero-panorama ${className}`.trim()} />;
});
