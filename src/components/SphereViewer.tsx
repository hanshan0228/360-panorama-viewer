import { useEffect, useRef, useState, useCallback, memo } from 'react';
import * as THREE from 'three';
import {
  Camera,
  Eye,
  Maximize,
  Minimize,
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  Sliders,
  Sun,
  Tv,
  Globe2,
  Volume2,
  VolumeX,
  Compass,
  Smartphone,
  Glasses,
  MapPin,
  X,
} from 'lucide-react';
import type { ViewerProjectionMode, PanoramaHotspot } from '../types/panorama';
import { soundEngine, type AmbientSoundType } from '../utils/audioSynthesizer';

interface SphereViewerProps {
  textureUrl: string;
  projectionMode?: ViewerProjectionMode;
  initialFov?: number;
  initialAutoRotate?: boolean;
  className?: string;
  showControlsBar?: boolean;
  hotspots?: PanoramaHotspot[];
  onAddHotspot?: (hotspot: PanoramaHotspot) => void;
  onRemoveHotspot?: (id: string) => void;
}

export const SphereViewer = memo(function SphereViewer({
  textureUrl,
  projectionMode = 'sphere',
  initialFov = 75,
  initialAutoRotate = false,
  className = '',
  showControlsBar = true,
  hotspots = [],
  onAddHotspot,
  onRemoveHotspot,
}: SphereViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isPointerOverRef = useRef(false);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const displayMeshRef = useRef<THREE.Mesh | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Interaction & visual state
  const [isAutoRotating, setIsAutoRotating] = useState(initialAutoRotate);
  const isAutoRotatingRef = useRef(isAutoRotating);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeMode, setActiveMode] = useState<ViewerProjectionMode>(projectionMode);
  const [exposure, setExposure] = useState(1.1);
  const exposureRef = useRef(exposure);
  const [contrast, setContrast] = useState(105);
  const [saturation, setSaturation] = useState(110);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);

  useEffect(() => {
    isAutoRotatingRef.current = isAutoRotating;
  }, [isAutoRotating]);

  // Gyroscope & VR state
  const [isGyroActive, setIsGyroActive] = useState(false);
  const [gyroAvailable] = useState(() => typeof window !== 'undefined' && 'DeviceOrientationEvent' in window);
  const gyroAlphaRef = useRef<number | null>(null);
  const gyroBetaRef = useRef<number | null>(null);
  const gyroGammaRef = useRef<number | null>(null);
  const baseGyroAlphaRef = useRef<number | null>(null);

  // Hotspots creation & inspection
  const [isAddingHotspotMode, setIsAddingHotspotMode] = useState(false);
  const [activeHotspot, setActiveHotspot] = useState<PanoramaHotspot | null>(null);
  const [newHotspotTitle, setNewHotspotTitle] = useState('');
  const [newHotspotDesc, setNewHotspotDesc] = useState('');
  const [pendingHotspotCoords, setPendingHotspotCoords] = useState<{ lon: number; lat: number } | null>(null);
  const hotspotsRef = useRef(hotspots);
  const hotspotElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    hotspotsRef.current = hotspots;
  }, [hotspots]);

  // Ambient Soundscape state
  const [ambientSound, setAmbientSound] = useState<AmbientSoundType>('none');
  const [isMuted, setIsMuted] = useState(false);

  // Smooth Damping Physics & Coordinates
  const targetLonRef = useRef(0);
  const currentLonRef = useRef(0);
  const targetLatRef = useRef(0);
  const currentLatRef = useRef(0);

  // Smooth FOV zoom damping
  const targetFovRef = useRef<number>(initialFov);
  const currentFovRef = useRef<number>(initialFov);

  // Performance & DOM Dirty-checking tracking refs
  const lastHeadingTextRef = useRef('');
  const lastFrustumStateRef = useRef('');

  // High-fidelity Momentum & Fling Tracking
  const isUserInteractingRef = useRef(false);
  const prevPointerXRef = useRef(0);
  const prevPointerYRef = useRef(0);
  const lastPointerXRef = useRef(0);
  const lastPointerYRef = useRef(0);
  const lastPointerTimeRef = useRef(0);
  const velocityXRef = useRef(0);
  const velocityYRef = useRef(0);

  // 2:1 Minimap Overview DOM refs
  const [showMinimap, setShowMinimap] = useState<boolean>(true);
  const minimapHeadingRef = useRef<HTMLSpanElement | null>(null);
  const minimapFrustumRef1 = useRef<HTMLDivElement | null>(null);
  const minimapFrustumRef2 = useRef<HTMLDivElement | null>(null);

  // Multi-touch pinch tracking
  const initialPinchDistRef = useRef<number | null>(null);
  const initialFovOnPinchRef = useRef<number>(initialFov);

  // Keyboard navigation keys state
  const keysPressedRef = useRef<{ [key: string]: boolean }>({});

  const hotspotsAvailable = activeMode !== 'vr-cardboard' && activeMode !== 'little-planet';
  function selectProjectionMode(mode: ViewerProjectionMode): void {
    setActiveMode(mode);
    if (mode === 'vr-cardboard' || mode === 'little-planet') {
      setIsAddingHotspotMode(false);
      setPendingHotspotCoords(null);
    }
  }

  // Sync mode with props during render
  const [prevPropMode, setPrevPropMode] = useState(projectionMode);
  if (projectionMode !== prevPropMode) {
    setPrevPropMode(projectionMode);
    selectProjectionMode(projectionMode);
  }

  // Audio lifecycle
  useEffect(() => {
    if (isMuted) {
      soundEngine.stop();
    } else {
      soundEngine.play(ambientSound);
    }
    return () => {
      soundEngine.stop();
    };
  }, [ambientSound, isMuted]);

  // Request & listen to Gyroscope
  const toggleGyroscope = async () => {
    if (isGyroActive) {
      setIsGyroActive(false);
      return;
    }

    // iOS 13+ permission request
    const DeviceOrientation = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };

    if (typeof DeviceOrientation?.requestPermission === 'function') {
      try {
        const response = await DeviceOrientation.requestPermission();
        if (response === 'granted') {
          setIsGyroActive(true);
        } else {
          alert('Please allow motion sensor access in your mobile browser');
        }
      } catch {
        // Fallback
      }
    } else {
      setIsGyroActive(true);
    }
  };

  useEffect(() => {
    if (!isGyroActive) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha === null || e.beta === null) return;
      if (baseGyroAlphaRef.current === null) {
        baseGyroAlphaRef.current = e.alpha;
      }
      gyroAlphaRef.current = e.alpha;
      gyroBetaRef.current = e.beta;
      gyroGammaRef.current = e.gamma;

      // Map device tilt to Lon/Lat
      const deltaAlpha = e.alpha - (baseGyroAlphaRef.current || 0);
      targetLonRef.current = -deltaAlpha;
      // Clamp pitch (-90 to +90)
      const pitch = (e.beta || 90) - 90;
      targetLatRef.current = Math.max(-85, Math.min(85, -pitch));
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [isGyroActive]);

  // Three.js scene setup
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(currentFovRef.current, width / height, 0.1, 2500);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.toneMapping = THREE.LinearToneMapping;
    renderer.toneMappingExposure = exposureRef.current;
    renderer.autoClear = false;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load(textureUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const maxAnisotropy = renderer.capabilities?.getMaxAnisotropy?.() || 1;
    texture.anisotropy = Math.min(4, maxAnisotropy);

    let geometry: THREE.BufferGeometry;
    let material: THREE.Material;

    if (activeMode === 'curved') {
      geometry = new THREE.CylinderGeometry(450, 450, 360, 64, 1, true, Math.PI, Math.PI);
      geometry.scale(-1, 1, 1);
      material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });

      camera.position.set(0, 0, 0);
      camera.fov = currentFovRef.current;
      camera.updateProjectionMatrix();
    } else if (activeMode === 'little-planet') {
      geometry = new THREE.SphereGeometry(300, 96, 64);
      material = new THREE.MeshBasicMaterial({ map: texture });

      camera.position.set(0, 0, 720);
      camera.fov = 95;
      camera.updateProjectionMatrix();
    } else {
      geometry = new THREE.SphereGeometry(500, 128, 64);
      geometry.scale(-1, 1, 1);
      material = new THREE.MeshBasicMaterial({ map: texture });

      camera.position.set(0, 0, 0);
      camera.fov = currentFovRef.current;
      camera.updateProjectionMatrix();
    }

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    displayMeshRef.current = mesh;

    const tempHotspotVec = new THREE.Vector3();

    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      // Keyboard navigation handling
      const keys = keysPressedRef.current;
      if (keys['KeyW'] || keys['ArrowUp']) targetLatRef.current += 0.8;
      if (keys['KeyS'] || keys['ArrowDown']) targetLatRef.current -= 0.8;
      if (keys['KeyA'] || keys['ArrowLeft']) targetLonRef.current -= 0.8;
      if (keys['KeyD'] || keys['ArrowRight']) targetLonRef.current += 0.8;

      if (isAutoRotatingRef.current && !isUserInteractingRef.current && !isGyroActive) {
        targetLonRef.current += 0.08;
      }

      // Physics momentum glide & friction decay (PhotoSphereViewer standard)
      if (!isUserInteractingRef.current && !isGyroActive) {
        targetLonRef.current += velocityXRef.current;
        targetLatRef.current += velocityYRef.current;
        velocityXRef.current *= 0.948;
        velocityYRef.current *= 0.948;
        if (Math.abs(velocityXRef.current) < 0.001) velocityXRef.current = 0;
        if (Math.abs(velocityYRef.current) < 0.001) velocityYRef.current = 0;
      }

      const maxLat = activeMode === 'curved' ? 40 : 85;
      targetLatRef.current = Math.max(-maxLat, Math.min(maxLat, targetLatRef.current));

      currentLonRef.current += (targetLonRef.current - currentLonRef.current) * 0.14;
      currentLatRef.current += (targetLatRef.current - currentLatRef.current) * 0.14;

      // Smooth FOV zoom damping
      const prevFov = currentFovRef.current;
      currentFovRef.current += (targetFovRef.current - currentFovRef.current) * 0.12;
      if (Math.abs(currentFovRef.current - prevFov) > 0.005) {
        camera.fov = currentFovRef.current;
        camera.updateProjectionMatrix();
      }

      if (activeMode === 'little-planet') {
        mesh.rotation.y += 0.003;
        camera.lookAt(0, 0, 0);
      } else {
        const phi = THREE.MathUtils.degToRad(90 - currentLatRef.current);
        const theta = THREE.MathUtils.degToRad(currentLonRef.current);

        const targetX = 500 * Math.sin(phi) * Math.cos(theta);
        const targetY = 500 * Math.cos(phi);
        const targetZ = 500 * Math.sin(phi) * Math.sin(theta);
        camera.lookAt(targetX, targetY, targetZ);
      }

      // Check if VR Cardboard split-screen mode is active
      const curWidth = container.clientWidth || 800;
      const curHeight = container.clientHeight || 500;

      // Real-time Minimap & Heading updates (Benchmarked from panoramagenerator.com)
      const normLon = ((currentLonRef.current % 360) + 360) % 360;
      const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const cardIdx = Math.round(normLon / 45) % 8;
      const degRounded = Math.round(normLon);
      const headingText = `${CARDINALS[cardIdx]} · ${degRounded}°`;
      if (minimapHeadingRef.current && lastHeadingTextRef.current !== headingText) {
        lastHeadingTextRef.current = headingText;
        minimapHeadingRef.current.textContent = headingText;
      }

      if (minimapFrustumRef1.current) {
        const aspect = curWidth / Math.max(1, curHeight);
        const horizFovDeg =
          2 *
          Math.atan(Math.tan(THREE.MathUtils.degToRad(currentFovRef.current / 2)) * aspect) *
          (180 / Math.PI);
        const wPct = Math.min(100, Math.max(8, (horizFovDeg / 360) * 100));
        const hPct = Math.min(100, Math.max(10, (currentFovRef.current / 180) * 100));
        const topPct = Math.max(
          0,
          Math.min(100 - hPct, 50 - (currentLatRef.current / 90) * 50 - hPct / 2)
        );

        const leftCenter = (normLon / 360) * 100;
        const startLeft = leftCenter - wPct / 2;

        const frustumKey = `${startLeft.toFixed(1)}_${topPct.toFixed(1)}_${wPct.toFixed(1)}_${hPct.toFixed(1)}`;
        if (lastFrustumStateRef.current !== frustumKey) {
          lastFrustumStateRef.current = frustumKey;
          if (startLeft < 0) {
            minimapFrustumRef1.current.style.display = 'block';
            minimapFrustumRef1.current.style.left = `${startLeft + 100}%`;
            minimapFrustumRef1.current.style.width = `${-startLeft}%`;
            minimapFrustumRef1.current.style.top = `${topPct}%`;
            minimapFrustumRef1.current.style.height = `${hPct}%`;

            if (minimapFrustumRef2.current) {
              minimapFrustumRef2.current.style.display = 'block';
              minimapFrustumRef2.current.style.left = '0%';
              minimapFrustumRef2.current.style.width = `${wPct + startLeft}%`;
              minimapFrustumRef2.current.style.top = `${topPct}%`;
              minimapFrustumRef2.current.style.height = `${hPct}%`;
            }
          } else if (startLeft + wPct > 100) {
            minimapFrustumRef1.current.style.display = 'block';
            minimapFrustumRef1.current.style.left = `${startLeft}%`;
            minimapFrustumRef1.current.style.width = `${100 - startLeft}%`;
            minimapFrustumRef1.current.style.top = `${topPct}%`;
            minimapFrustumRef1.current.style.height = `${hPct}%`;

            if (minimapFrustumRef2.current) {
              minimapFrustumRef2.current.style.display = 'block';
              minimapFrustumRef2.current.style.left = '0%';
              minimapFrustumRef2.current.style.width = `${wPct - (100 - startLeft)}%`;
              minimapFrustumRef2.current.style.top = `${topPct}%`;
              minimapFrustumRef2.current.style.height = `${hPct}%`;
            }
          } else {
            minimapFrustumRef1.current.style.display = 'block';
            minimapFrustumRef1.current.style.left = `${startLeft}%`;
            minimapFrustumRef1.current.style.width = `${wPct}%`;
            minimapFrustumRef1.current.style.top = `${topPct}%`;
            minimapFrustumRef1.current.style.height = `${hPct}%`;

            if (minimapFrustumRef2.current) {
              minimapFrustumRef2.current.style.display = 'none';
            }
          }
        }
      }

      if (activeMode === 'vr-cardboard') {
        const halfWidth = curWidth / 2;
        renderer.clear();

        // Left Eye
        renderer.setViewport(0, 0, halfWidth, curHeight);
        renderer.setScissor(0, 0, halfWidth, curHeight);
        renderer.setScissorTest(true);
        camera.aspect = halfWidth / curHeight;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);

        // Right Eye
        renderer.setViewport(halfWidth, 0, halfWidth, curHeight);
        renderer.setScissor(halfWidth, 0, halfWidth, curHeight);
        renderer.setScissorTest(true);
        renderer.render(scene, camera);

        renderer.setScissorTest(false);
      } else {
        renderer.setViewport(0, 0, curWidth, curHeight);
        renderer.clear();
        renderer.render(scene, camera);
      }

      // Real-time 3D spatial Hotspots projection to screen space
      if (activeMode !== 'little-planet' && activeMode !== 'vr-cardboard') {
        const spotList = hotspotsRef.current;
        for (let sIdx = 0; sIdx < spotList.length; sIdx++) {
          const spot = spotList[sIdx];
          const el = hotspotElementsRef.current.get(spot.id);
          if (!el) continue;
          const sPhi = THREE.MathUtils.degToRad(90 - spot.lat);
          const sTheta = THREE.MathUtils.degToRad(spot.lon);
          const sx = 500 * Math.sin(sPhi) * Math.cos(sTheta);
          const sy = 500 * Math.cos(sPhi);
          const sz = 500 * Math.sin(sPhi) * Math.sin(sTheta);
          tempHotspotVec.set(sx, sy, sz);
          tempHotspotVec.project(camera);
          if (
            tempHotspotVec.z < 1 &&
            tempHotspotVec.x >= -1.1 &&
            tempHotspotVec.x <= 1.1 &&
            tempHotspotVec.y >= -1.1 &&
            tempHotspotVec.y <= 1.1
          ) {
            const screenX = (tempHotspotVec.x * 0.5 + 0.5) * curWidth;
            const screenY = (-(tempHotspotVec.y * 0.5) + 0.5) * curHeight;
            el.style.display = 'block';
            el.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) translate(-50%, -50%)`;
          } else {
            el.style.display = 'none';
          }
        }
      } else {
        hotspotElementsRef.current.forEach((el) => {
          el.style.display = 'none';
        });
      }
    };

    animate();

    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = activeMode === 'vr-cardboard' ? (w / 2) / h : w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      resizeObserver.disconnect();
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }, [textureUrl, activeMode, isGyroActive]);

  // Keyboard navigation listeners
  useEffect(() => {
    const isInteractiveTarget = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      return (
        target &&
        (target.isContentEditable || target.closest('input, textarea, select, button, a, [role="button"], [role="dialog"], dialog'))
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isInteractiveTarget(e)) return;
      if (!['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) return;
      // Only hijack keys while the viewer is the interaction context: the pointer is over it,
      // the event target sits inside it, or it is the fullscreen element. The rest of the
      // page keeps its native keyboard behavior.
      const container = containerRef.current;
      const insideViewer = !!container && !!e.target && typeof container.contains === 'function'
        && container.contains(e.target as Node);
      const inFullscreen = typeof document !== 'undefined' && !!container && document.fullscreenElement === container;
      if (!insideViewer && !isPointerOverRef.current && !inFullscreen) return;
      e.preventDefault();
      keysPressedRef.current[e.code] = true;
      if (e.code === 'Space' && !e.repeat) {
        setIsAutoRotating((p) => !p);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressedRef.current[e.code] = false;
    };
    const handleBlur = () => { keysPressedRef.current = {}; };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    if (cameraRef.current && activeMode !== 'little-planet') {
      cameraRef.current.fov = currentFovRef.current;
      cameraRef.current.updateProjectionMatrix();
    }
  }, [activeMode]);

  useEffect(() => {
    exposureRef.current = exposure;
    if (rendererRef.current) {
      rendererRef.current.toneMappingExposure = exposure;
    }
  }, [exposure]);

  // Pointer drag interaction with High-Precision Momentum Fling (PhotoSphereViewer standard)
  const handlePointerDown = (e: React.PointerEvent) => {
    isUserInteractingRef.current = true;
    prevPointerXRef.current = e.clientX;
    prevPointerYRef.current = e.clientY;
    lastPointerXRef.current = e.clientX;
    lastPointerYRef.current = e.clientY;
    lastPointerTimeRef.current = performance.now();
    velocityXRef.current = 0;
    velocityYRef.current = 0;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isUserInteractingRef.current) return;
    const now = performance.now();
    const dt = Math.max(1, now - lastPointerTimeRef.current);
    const deltaX = prevPointerXRef.current - e.clientX;
    const deltaY = e.clientY - prevPointerYRef.current;

    const sensitivity = (currentFovRef.current / 75) * 0.16;
    const moveX = deltaX * sensitivity;
    const moveY = deltaY * sensitivity;

    targetLonRef.current += moveX;
    targetLatRef.current += moveY;

    // Fling velocity with exponential moving average
    const instantVx = (moveX * 16) / dt;
    const instantVy = (moveY * 16) / dt;
    velocityXRef.current = velocityXRef.current * 0.35 + instantVx * 0.65;
    velocityYRef.current = velocityYRef.current * 0.35 + instantVy * 0.65;

    prevPointerXRef.current = e.clientX;
    prevPointerYRef.current = e.clientY;
    lastPointerXRef.current = e.clientX;
    lastPointerYRef.current = e.clientY;
    lastPointerTimeRef.current = now;
  };

  const handlePointerUp = () => {
    isUserInteractingRef.current = false;
    const timeSinceLastMove = performance.now() - lastPointerTimeRef.current;
    if (timeSinceLastMove > 65) {
      velocityXRef.current = 0;
      velocityYRef.current = 0;
    } else {
      // Cap maximum fling velocity to prevent wild runaway rotation
      const maxVelocity = 2.8;
      velocityXRef.current = Math.max(-maxVelocity, Math.min(maxVelocity, velocityXRef.current));
      velocityYRef.current = Math.max(-maxVelocity, Math.min(maxVelocity, velocityYRef.current));
    }

    // Hotspot click to add in adding mode
    if (hotspotsAvailable && isAddingHotspotMode && onAddHotspot) {
      const lon = currentLonRef.current % 360;
      const lat = currentLatRef.current;
      setPendingHotspotCoords({ lon, lat });
      setIsAddingHotspotMode(false);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    targetFovRef.current = Math.max(35, Math.min(100, targetFovRef.current + e.deltaY * 0.04));
  };

  // Click on 2:1 Minimap to immediately orient camera
  const handleMinimapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const pctX = clickX / rect.width;
    const pctY = clickY / rect.height;

    // Convert to target Lon (0° to 360°) and Lat (+85° to -85°)
    const clickLon = pctX * 360;
    const clickLat = (0.5 - pctY) * 160;

    targetLonRef.current = clickLon;
    targetLatRef.current = Math.max(-85, Math.min(85, clickLat));
    velocityXRef.current = 0;
    velocityYRef.current = 0;
  };

  // Touch Pinch-to-zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialPinchDistRef.current = dist;
      initialFovOnPinchRef.current = targetFovRef.current;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDistRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = initialPinchDistRef.current / dist;
      targetFovRef.current = Math.max(35, Math.min(100, initialFovOnPinchRef.current * scale));
    }
  };

  const handleTouchEnd = () => {
    initialPinchDistRef.current = null;
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

  const handleTakeSnapshot = () => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const dataUrl = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `360-view-snapshot-${Date.now()}.png`;
    a.click();
  };

  const resetOrientation = useCallback(() => {
    targetLonRef.current = 0;
    targetLatRef.current = 0;
  }, []);

  const handleCreateHotspot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hotspotsAvailable || !pendingHotspotCoords || !onAddHotspot) return;

    onAddHotspot({
      id: `spot_${Date.now()}`,
      lon: pendingHotspotCoords.lon,
      lat: pendingHotspotCoords.lat,
      title: newHotspotTitle || 'Tour Hotspot',
      description: newHotspotDesc,
    });

    setPendingHotspotCoords(null);
    setNewHotspotTitle('');
    setNewHotspotDesc('');
  };

  return (
    <div
      ref={containerRef}
      style={{
        filter: `contrast(${contrast}%) saturate(${saturation}%)`,
      }}
      className={`relative overflow-hidden select-none bg-slate-950 cursor-grab active:cursor-grabbing transition-[filter] ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerEnter={() => { isPointerOverRef.current = true; }}
      onPointerLeave={() => { isPointerOverRef.current = false; handlePointerUp(); }}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* VR Cardboard Divider Overlay */}
      {activeMode === 'vr-cardboard' && (
        <div className="absolute inset-0 pointer-events-none z-10 flex">
          <div className="w-1/2 border-r border-slate-700/60" />
          <div className="w-1/2" />
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900/90 text-[10px] px-3 py-1 rounded-full text-cyan-300 border border-slate-700">
            VR Cardboard Stereoscopic Split-Screen
          </div>
        </div>
      )}

      {activeMode === 'vr-cardboard' && onAddHotspot && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 rounded-lg bg-slate-900/90 px-3 py-1 text-[10px] text-slate-300 pointer-events-none">
          Hotspots are unavailable in VR split-screen mode.
        </div>
      )}

      {/* Adding Hotspot Overlay Guide */}
      {hotspotsAvailable && isAddingHotspotMode && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-2 bg-gradient-to-r from-cyan-400 to-teal-300 text-slate-950 font-bold border border-cyan-200 rounded-xl shadow-2xl text-xs flex items-center gap-2 animate-bounce">
          <MapPin className="w-4 h-4 text-slate-950" />
          <span>Rotate view & click canvas to place spatial hotspot</span>
          <button
            type="button"
            onClick={() => setIsAddingHotspotMode(false)}
            className="p-1 hover:bg-black/10 rounded-lg ml-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Projection Mode Quick Switcher Tag */}
      <div className="absolute top-4 left-4 right-4 sm:right-auto z-20 flex flex-wrap items-center gap-1.5 p-1 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-xl text-xs shadow-lg">
        <button
          type="button"
          onClick={() => selectProjectionMode('sphere')}
          className={`px-2.5 py-1 rounded-lg font-medium flex items-center gap-1 transition-all cursor-pointer ${
            activeMode === 'sphere'
              ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 font-bold shadow-sm shadow-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="360° Spherical Panoramic Mode"
        >
          <Globe2 className="w-3.5 h-3.5" />
          <span>360° Sphere</span>
        </button>

        <button
          type="button"
          onClick={() => selectProjectionMode('curved')}
          className={`px-2.5 py-1 rounded-lg font-medium flex items-center gap-1 transition-all cursor-pointer ${
            activeMode === 'curved'
              ? 'bg-cyan-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="180° IMAX Curved Screen Mode"
        >
          <Tv className="w-3.5 h-3.5" />
          <span>180° Curved</span>
        </button>

        <button
          type="button"
          onClick={() => selectProjectionMode('little-planet')}
          className={`px-2.5 py-1 rounded-lg font-medium flex items-center gap-1 transition-all cursor-pointer ${
            activeMode === 'little-planet'
              ? 'bg-teal-400 text-slate-950 font-bold shadow-sm shadow-teal-400/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Little Planet Stereographic Fisheye"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Little Planet</span>
        </button>

        <button
          type="button"
          onClick={() => selectProjectionMode(activeMode === 'vr-cardboard' ? 'sphere' : 'vr-cardboard')}
          className={`px-2.5 py-1 rounded-lg font-medium flex items-center gap-1 transition-all cursor-pointer ${
            activeMode === 'vr-cardboard'
              ? 'bg-pink-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="VR Stereoscopic Cardboard Mode"
        >
          <Glasses className="w-3.5 h-3.5" />
          <span>VR Split</span>
        </button>
      </div>

      {/* Top Right Mini Compass, Gyroscope & Hotspots Trigger */}
      <div className="absolute top-24 sm:top-4 right-4 z-20 flex items-center gap-2">
        {gyroAvailable && (
          <button
            type="button"
            onClick={toggleGyroscope}
            className={`p-2 backdrop-blur-md border rounded-xl transition-colors cursor-pointer ${
              isGyroActive
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 animate-pulse'
                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title={isGyroActive ? 'Disable mobile gyroscope tracking' : 'Enable mobile gyroscope orientation'}
          >
            <Smartphone className="w-4 h-4" />
          </button>
        )}

        {onAddHotspot && (
          <button
            type="button"
            onClick={() => setIsAddingHotspotMode((p) => !p)}
            disabled={!hotspotsAvailable}
            className={`p-2 backdrop-blur-md border rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              isAddingHotspotMode
                ? 'bg-cyan-500 border-cyan-400 text-slate-950 font-bold'
                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title={hotspotsAvailable ? 'Add spatial tour hotspot to 360° scene' : 'Hotspots are unavailable in VR split-screen and little-planet modes'}
          >
            <MapPin className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={resetOrientation}
          className="p-2 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-xl text-slate-300 hover:text-white transition-colors cursor-pointer"
          title="Reset view to front-facing center"
        >
          <Compass className="w-4 h-4 text-cyan-400" />
        </button>
      </div>

      {/* Hotspots Overlay Markers on Screen */}
      {hotspots.map((spot) => (
        <div
          key={spot.id}
          ref={(el) => {
            if (el) {
              hotspotElementsRef.current.set(spot.id, el);
            } else {
              hotspotElementsRef.current.delete(spot.id);
            }
          }}
          style={{ display: 'none' }}
          className="absolute top-0 left-0 z-20 cursor-pointer group pointer-events-auto"
          onClick={(e) => {
            e.stopPropagation();
            setActiveHotspot(spot);
          }}
        >
          <div className="p-2 bg-gradient-to-tr from-cyan-400 to-teal-400 text-slate-950 rounded-full shadow-[0_0_15px_rgba(0,242,254,0.6)] border-2 border-white group-hover:scale-125 transition-transform animate-pulse">
            <MapPin className="w-3.5 h-3.5" />
          </div>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 bg-slate-950/90 border border-slate-700 text-white text-[10px] rounded whitespace-nowrap shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            {spot.title}
          </div>
        </div>
      ))}

      {/* Active Hotspot Inspector Card */}
      {activeHotspot && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 p-4 bg-slate-900/95 border border-slate-700 rounded-2xl shadow-2xl max-w-sm w-full text-xs text-slate-200 space-y-2 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white flex items-center gap-1.5 text-sm">
              <MapPin className="w-4 h-4 text-cyan-400" />
              {activeHotspot.title}
            </span>
            <button
              type="button"
              onClick={() => setActiveHotspot(null)}
              className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-slate-300 leading-relaxed text-[11px]">{activeHotspot.description || 'No detailed description provided'}</p>
          {onRemoveHotspot && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => {
                  onRemoveHotspot(activeHotspot.id);
                  setActiveHotspot(null);
                }}
                className="text-[10px] text-red-400 hover:text-red-300 cursor-pointer"
              >
                Delete Hotspot
              </button>
            </div>
          )}
        </div>
      )}

      {/* New Hotspot Details Modal */}
      {hotspotsAvailable && pendingHotspotCoords && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateHotspot}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-5 space-y-3.5 text-xs text-slate-200 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-cyan-400" />
                New 360° Tour Hotspot
              </span>
              <button
                type="button"
                onClick={() => setPendingHotspotCoords(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Hotspot Title</label>
              <input
                type="text"
                required
                value={newHotspotTitle}
                onChange={(e) => setNewHotspotTitle(e.target.value)}
                placeholder="e.g. Master Bedroom, Terrace View, Grand Lobby..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Detailed Description</label>
              <textarea
                rows={3}
                value={newHotspotDesc}
                onChange={(e) => setNewHotspotDesc(e.target.value)}
                placeholder="Enter scene overview, spatial guide, or interactive notes..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPendingHotspotCoords(null)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-bold rounded-lg cursor-pointer shadow-lg shadow-cyan-500/20"
              >
                Confirm & Add
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2:1 Minimap & Heading Radar Overview (Benchmarked from panoramagenerator.com) */}
      {showMinimap && activeMode !== 'little-planet' && activeMode !== 'vr-cardboard' && (
        <div
          data-testid="viewer-minimap"
          className="absolute bottom-16 left-4 z-20 hidden sm:block w-48 overflow-hidden rounded-xl border border-white/10 shadow-2xl backdrop-blur-md select-none pointer-events-auto"
          style={{ background: 'rgba(15, 23, 42, 0.78)' }}
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between px-2.5 pt-2 font-mono text-[9px] uppercase tracking-wider text-slate-300">
            <span className="flex items-center gap-1 font-semibold text-slate-400">
              <Compass className="w-3 h-3 text-cyan-400" />
              <span>Spatial Radar</span>
            </span>
            <span ref={minimapHeadingRef} className="text-cyan-300 font-bold">
              N · 0°
            </span>
          </div>

          {/* 2:1 Panorama Map Thumbnail with Frustum Viewport */}
          <div
            onClick={handleMinimapClick}
            className="relative mx-2 mb-2 mt-1.5 aspect-[2/1] overflow-hidden rounded-lg cursor-crosshair border border-slate-700/80 bg-slate-950 group/minimap"
            title="Click minimap to orient viewpoint heading"
          >
            <img
              src={textureUrl}
              alt="Panorama radar minimap"
              className="h-full w-full object-cover opacity-85 group-hover/minimap:opacity-100 transition-opacity"
            />
            {/* Viewport Frustum Wireframe Boxes (Supports 360 boundary wrapping) */}
            <div
              ref={minimapFrustumRef1}
              className="absolute hidden border-2 border-cyan-400 bg-cyan-400/20 rounded-sm pointer-events-none transition-none shadow-[0_0_8px_rgba(34,211,238,0.5)]"
            />
            <div
              ref={minimapFrustumRef2}
              className="absolute hidden border-2 border-cyan-400 bg-cyan-400/20 rounded-sm pointer-events-none transition-none shadow-[0_0_8px_rgba(34,211,238,0.5)]"
            />
          </div>
        </div>
      )}

      {/* Main Floating Controls Bar */}
      {showControlsBar && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3.5 py-1.5 glass-dock rounded-full shadow-[0_16px_40px_rgba(0,0,0,0.7)] z-20 text-xs text-slate-200">
          <button
            type="button"
            onClick={() => setIsAutoRotating((prev) => !prev)}
            className={`p-2 rounded-full transition-all cursor-pointer ${
              isAutoRotating ? 'bg-gradient-to-r from-cyan-400 to-teal-300 text-slate-950 font-bold shadow-md shadow-cyan-500/40' : 'hover:bg-white/10 text-slate-300'
            }`}
            title={isAutoRotating ? 'Pause auto-rotation (Spacebar)' : 'Start auto-rotation (Spacebar)'}
          >
            {isAutoRotating ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          </button>

          <div className="w-[1px] h-4 bg-white/15 mx-1" />

          {/* Minimap toggle button */}
          <button
            type="button"
            onClick={() => setShowMinimap((p) => !p)}
            className={`p-2 rounded-full transition-all cursor-pointer ${
              showMinimap ? 'text-cyan-300 bg-cyan-500/20' : 'text-slate-400 hover:bg-white/10'
            }`}
            title={showMinimap ? 'Hide radar minimap' : 'Show radar minimap'}
          >
            <Compass className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              targetFovRef.current = Math.max(35, targetFovRef.current - 10);
            }}
            className="p-2 hover:bg-white/10 rounded-full text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Zoom in (Narrow FOV)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              targetFovRef.current = Math.min(100, targetFovRef.current + 10);
            }}
            className="p-2 hover:bg-white/10 rounded-full text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Zoom out (Widen FOV)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-4 bg-white/15 mx-1" />

          {/* Quality tuning toggle */}
          <button
            type="button"
            onClick={() => setShowSettingsDrawer((p) => !p)}
            className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              showSettingsDrawer ? 'bg-cyan-400 text-slate-950 font-bold shadow-md shadow-cyan-500/30' : 'hover:bg-white/10 text-slate-300'
            }`}
            title="Tone adjustments, exposure & ambient audio"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Tone & Audio</span>
          </button>

          <div className="w-[1px] h-4 bg-white/15 mx-1" />

          <button
            type="button"
            onClick={handleTakeSnapshot}
            className="p-2 hover:bg-white/10 rounded-full text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Capture high-resolution viewport snapshot (PNG)"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="p-2 hover:bg-white/10 rounded-full text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Toggle fullscreen immersive viewport"
          >
            {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* Real-time Quality & Lighting & Audio Tuning Drawer */}
      {showSettingsDrawer && (
        <div className="absolute top-16 right-4 z-30 p-5 glass-panel border border-cyan-500/20 rounded-3xl shadow-2xl text-xs space-y-4 w-72 text-slate-200 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.08]">
            <span className="font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              Tone & Ambient Audio
            </span>
            <button
              type="button"
              onClick={() => setShowSettingsDrawer(false)}
              className="w-6 h-6 rounded-full bg-white/[0.05] hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center text-xs cursor-pointer transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Exposure Slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                ACES Exposure
              </span>
              <span className="font-mono text-slate-300">{exposure.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.6"
              max="1.8"
              step="0.05"
              value={exposure}
              onChange={(e) => setExposure(parseFloat(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* Contrast Slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Contrast</span>
              <span className="font-mono text-slate-300">{contrast}%</span>
            </div>
            <input
              type="range"
              min="80"
              max="150"
              step="2"
              value={contrast}
              onChange={(e) => setContrast(parseInt(e.target.value, 10))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* Saturation Slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Saturation</span>
              <span className="font-mono text-slate-300">{saturation}%</span>
            </div>
            <input
              type="range"
              min="70"
              max="160"
              step="5"
              value={saturation}
              onChange={(e) => setSaturation(parseInt(e.target.value, 10))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* Ambient Soundscape Selection */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1 font-medium text-slate-300">
                {isMuted || ambientSound === 'none' ? (
                  <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-pink-400" />
                )}
                Spatial Ambient Audio (Web Audio)
              </span>
              <button
                type="button"
                onClick={() => setIsMuted((p) => !p)}
                className="text-[10px] text-slate-400 hover:text-slate-200 cursor-pointer underline"
              >
                {isMuted ? 'Unmute' : 'Mute'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              {[
                { id: 'none', label: 'Off' },
                { id: 'ocean', label: '🌊 Ocean Waves' },
                { id: 'cyberpunk', label: '🌆 Cyber City' },
                { id: 'breeze', label: '🍃 Forest Breeze' },
                { id: 'space', label: '🌌 Deep Space' },
              ].map((sound) => (
                <button
                  key={sound.id}
                  type="button"
                  onClick={() => {
                    setAmbientSound(sound.id as AmbientSoundType);
                    setIsMuted(false);
                  }}
                  className={`py-1 px-2 rounded-lg text-[11px] font-medium text-center transition-colors cursor-pointer ${
                    ambientSound === sound.id && !isMuted
                      ? 'bg-pink-600/20 border border-pink-500/50 text-pink-300'
                      : 'bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {sound.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
