import { useTranslation } from '../utils/i18n';
import { landingMessages } from '../utils/landingTranslations';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RotateCw, Sun, Pause, Play, Maximize, Minimize, ZoomIn, ZoomOut } from 'lucide-react';

interface GlobeViewerProps {
  textureUrl: string;
  className?: string;
}

export function GlobeViewer({ textureUrl, className = '' }: GlobeViewerProps) {
  const t = useTranslation(landingMessages);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const distanceRef = useRef(320);
  const globeMeshRef = useRef<THREE.Mesh | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  const [isRotating, setIsRotating] = useState(true);
  const isRotatingRef = useRef(isRotating);
  const [rotationSpeed, setRotationSpeed] = useState(0.005);
  const rotationSpeedRef = useRef(rotationSpeed);
  const [wireframe, setWireframe] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    isRotatingRef.current = isRotating;
  }, [isRotating]);

  useEffect(() => {
    rotationSpeedRef.current = rotationSpeed;
  }, [rotationSpeed]);

  // Drag interaction
  const isDraggingRef = useRef(false);
  const prevMouseXRef = useRef(0);
  const prevMouseYRef = useRef(0);

  const zoom = (factor: number) => {
    distanceRef.current = Math.max(150, Math.min(650, distanceRef.current * factor));
    if (cameraRef.current) cameraRef.current.position.z = distanceRef.current;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 700;
    const height = container.clientHeight || 500;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, distanceRef.current);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight.position.set(200, 150, 250);
    scene.add(dirLight);

    // Globe Geometry & Texture
    const geometry = new THREE.SphereGeometry(100, 64, 48);
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load(textureUrl);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.6,
      metalness: 0.1,
      wireframe: wireframe,
    });

    const globe = new THREE.Mesh(geometry, material);
    scene.add(globe);
    globeMeshRef.current = globe;

    // Atmosphere Glow Mesh
    const atmosGeo = new THREE.SphereGeometry(103, 48, 48);
    const atmosMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide,
    });
    const atmosphere = new THREE.Mesh(atmosGeo, atmosMat);
    scene.add(atmosphere);

    // Render Loop
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      if (isRotatingRef.current && !isDraggingRef.current) {
        globe.rotation.y += rotationSpeedRef.current;
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    const handleWheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest('button, input')) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1);
      zoom(Math.exp(Math.max(-1, Math.min(1, delta * 0.001))));
    };
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      resizeObserver.disconnect();
      container.removeEventListener('wheel', handleWheel);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      atmosGeo.dispose();
      atmosMat.dispose();
      texture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      cameraRef.current = null;
    };
  }, [textureUrl, wireframe]);

  // Pointer drag controls
  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) return;
    isDraggingRef.current = true;
    prevMouseXRef.current = e.clientX;
    prevMouseYRef.current = e.clientY;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !globeMeshRef.current) return;
    const deltaX = e.clientX - prevMouseXRef.current;
    const deltaY = e.clientY - prevMouseYRef.current;

    globeMeshRef.current.rotation.y += deltaX * 0.006;
    globeMeshRef.current.rotation.x += deltaY * 0.006;

    prevMouseXRef.current = e.clientX;
    prevMouseYRef.current = e.clientY;
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  const handleToggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden select-none bg-slate-950 cursor-grab active:cursor-grabbing ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Control overlay */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-wrap justify-center items-center gap-1 sm:gap-2 w-max max-w-[calc(100%_-_1rem)] px-3 py-1.5 bg-slate-900/80 backdrop-blur-md border border-slate-700/60 rounded-2xl sm:rounded-full shadow-2xl z-20 text-xs text-slate-200">
        <button type="button" onClick={() => zoom(0.85)} aria-label={t("Zoom in on globe")} className="p-2 hover:bg-slate-800 rounded-full"><ZoomIn className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={() => zoom(1 / 0.85)} aria-label={t("Zoom out of globe")} className="p-2 hover:bg-slate-800 rounded-full"><ZoomOut className="w-3.5 h-3.5" /></button>
        <button
          type="button"
          onClick={() => setIsRotating((p) => !p)}
          className={`p-2 rounded-full transition-colors ${
            isRotating ? 'bg-cyan-600 text-white' : 'hover:bg-slate-800 text-slate-300'
          }`}
          title={isRotating ? t("Pause planetary rotation") : t("Start planetary rotation")}
        >
          {isRotating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>

        <div className="flex items-center gap-1.5 px-2">
          <RotateCw className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="range"
            min="0.001"
            max="0.02"
            step="0.001"
            value={rotationSpeed}
            onChange={(e) => setRotationSpeed(parseFloat(e.target.value))}
            className="w-16 accent-cyan-500 cursor-pointer"
            title={t("Rotation speed tuning")}
          />
        </div>

        <button
          type="button"
          onClick={() => setWireframe((p) => !p)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1 transition-colors ${
            wireframe ? 'bg-cyan-400 text-slate-950 font-bold shadow-md shadow-cyan-500/30' : 'hover:bg-slate-800 text-slate-300'
          }`}
          title={t("Toggle wireframe / solid material")}
        >
          <Sun className="w-3.5 h-3.5" />
          <span>{wireframe ? t("Solid Surface") : t("Wireframe")}</span>
        </button>

        <button
          type="button"
          onClick={handleToggleFullscreen}
          className="p-2 hover:bg-slate-800 rounded-full text-slate-300 hover:text-white transition-colors"
          title={t("Toggle fullscreen")}
        >
          {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className="absolute top-4 left-4 pointer-events-none bg-slate-900/60 backdrop-blur-sm border border-slate-800/80 rounded-lg px-2.5 py-1 text-[11px] text-cyan-400 font-mono">
        {t("3D Orbital Globe")}
      </div>
    </div>
  );
}
