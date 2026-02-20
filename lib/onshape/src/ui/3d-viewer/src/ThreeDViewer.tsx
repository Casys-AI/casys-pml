/**
 * ThreeDViewer -- 3D glTF viewer + image gallery fallback for Onshape
 *
 * Mode A: glTF JSON (data has `asset` + `scenes`) -- Three.js interactive 3D
 * Mode B: Image gallery (data has `images` array of base64 PNGs) -- pan/zoom viewer
 *
 * @module lib/onshape/src/ui/3d-viewer
 */

import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ContentSkeleton, OnshapeBadge } from "../../shared";
import { cx } from "../../components/utils";

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "3D Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Types
// ============================================================================

type BgMode = "dark" | "mid" | "white";

interface GltfData {
  asset: unknown;
  scenes: unknown[];
  [key: string]: unknown;
}

interface ImageGalleryData {
  images: string[];
  [key: string]: unknown;
}

type ViewerData = GltfData | ImageGalleryData;

function isGltfData(d: ViewerData): d is GltfData {
  return d != null && "asset" in d && "scenes" in d;
}

function isImageData(d: ViewerData): d is ImageGalleryData {
  return d != null && "images" in d && Array.isArray((d as ImageGalleryData).images);
}

// ============================================================================
// Background color map
// ============================================================================

const BG_COLORS: Record<BgMode, number> = {
  dark: 0x08080a,
  mid: 0x1a1a2e,
  white: 0xffffff,
};

const BG_CYCLE: BgMode[] = ["dark", "mid", "white"];

// ============================================================================
// Toolbar button style
// ============================================================================

const toolbarBtnClass =
  "bg-bg-muted/80 backdrop-blur-sm border border-border-subtle rounded px-2 py-1.5 text-[10px] font-mono text-fg-muted hover:text-fg-default hover:bg-bg-muted cursor-pointer transition-colors select-none";

const toolbarBtnActiveClass =
  "bg-[#00A6F0]/20 text-[#00A6F0] border-[#00A6F0]/40";

// ============================================================================
// Icons (inline SVG for zero dependencies)
// ============================================================================

function GridIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="12" y1="3" x2="12" y2="21" />
    </svg>
  );
}

function WireframeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function BgIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function FitIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <path d="M21 3l-7 7" />
      <path d="M3 21l7-7" />
    </svg>
  );
}

function ChevronLeftIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ============================================================================
// ThreeDViewer -- main component
// ============================================================================

export function ThreeDViewer() {
  const [data, setData] = useState<ViewerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mode A state
  const [showGrid, setShowGrid] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [bgMode, setBgMode] = useState<BgMode>("dark");

  // Mode B state
  const [imageIdx, setImageIdx] = useState(0);
  const [imgZoom, setImgZoom] = useState(1);
  const [imgPan, setImgPan] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOffsetRef = useRef({ x: 0, y: 0 });

  // Three.js refs (Mode A)
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameRef = useRef<number>(0);
  const modelRef = useRef<THREE.Group | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const boundingBoxRef = useRef<THREE.Box3 | null>(null);

  // ---------- MCP connection ----------

  useEffect(() => {
    app.connect().then(() => { appConnected = true; }).catch(() => {});

    app.ontoolresult = (result: { content?: { type: string; text?: string }[] }) => {
      setLoading(false);
      setError(null);
      try {
        const text = result.content?.find((c) => c.type === "text")?.text;
        if (!text) { setData(null); return; }
        const raw = JSON.parse(text) as { data?: ViewerData } & ViewerData;
        // Tools wrap result in { data: ... } — unwrap if needed
        const parsed = (raw.data && typeof raw.data === "object") ? raw.data : raw;
        setData(parsed as ViewerData);
        setImageIdx(0);
        setImgZoom(1);
        setImgPan({ x: 0, y: 0 });
      } catch (e) {
        setError(`Failed to parse data: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  // ---------- fitCamera helper ----------

  const fitCamera = useCallback(() => {
    const model = modelRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!model || !camera || !controls) return;

    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) return;

    boundingBoxRef.current = box;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    // Use FOV to guarantee the model fills ~80% of the viewport
    const fovRad = (camera.fov * Math.PI) / 180;
    const distance = (maxDim / 2) / Math.tan(fovRad / 2) * 1.4;

    camera.position.set(
      center.x + distance * 0.6,
      center.y + distance * 0.5,
      center.z + distance * 0.8
    );
    camera.lookAt(center);
    camera.near = distance * 0.001;
    camera.far = distance * 100;
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    controls.update();

    notifyModel("camera-fit", {
      center: { x: center.x, y: center.y, z: center.z },
      size: { x: size.x, y: size.y, z: size.z },
    });
  }, []);

  // ---------- Three.js setup (Mode A) ----------

  useEffect(() => {
    if (!data || !isGltfData(data)) return;

    const container = containerRef.current;
    if (!container) return;

    // Cleanup previous scene
    disposeScene();

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(BG_COLORS[bgMode]);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
    camera.position.set(5, 5, 5);
    cameraRef.current = camera;

    // Lights
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(5, 10, 7.5);
    dirLight.castShadow = false;
    scene.add(dirLight);

    // Secondary fill light for better model readability
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-5, 0, -5);
    scene.add(fillLight);

    // Grid
    const grid = new THREE.GridHelper(10, 10, 0x00a6f0, 0x333333);
    grid.visible = showGrid;
    scene.add(grid);
    gridRef.current = grid;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.minDistance = 0.1;
    controls.maxDistance = 1000;
    controlsRef.current = controls;

    // Load glTF
    const loader = new GLTFLoader();
    loader.parse(JSON.stringify(data), "", (gltf) => {
      modelRef.current = gltf.scene;
      scene.add(gltf.scene);

      // Apply wireframe if active
      if (wireframe) {
        gltf.scene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach((m) => { m.wireframe = true; });
            } else {
              mesh.material.wireframe = true;
            }
          }
        });
      }

      // Fit camera to model
      fitCamera();

      // Scale grid to model
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) {
        const gridSize = Math.pow(10, Math.ceil(Math.log10(maxDim * 2)));
        grid.scale.setScalar(gridSize / 10);
      }
    }, (err) => {
      console.error("[3d-viewer] glTF parse error:", err);
      setError(`Failed to load 3D model: ${err.message || "Unknown error"}`);
    });

    // Animation loop
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Resize handler
    function handleResize() {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      disposeScene();
    };
  }, [data]); // Intentionally only depend on data, not bgMode/showGrid/wireframe

  // ---------- Reactive updates (no re-create) ----------

  // Background color
  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer) {
      renderer.setClearColor(BG_COLORS[bgMode]);
    }
  }, [bgMode]);

  // Grid visibility
  useEffect(() => {
    const grid = gridRef.current;
    if (grid) {
      grid.visible = showGrid;
    }
  }, [showGrid]);

  // Wireframe toggle
  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;

    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => { m.wireframe = wireframe; });
        } else {
          mesh.material.wireframe = wireframe;
        }
      }
    });
  }, [wireframe]);

  // ---------- Cleanup helper ----------

  function disposeScene() {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }

    const scene = sceneRef.current;
    if (scene) {
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(disposeMaterial);
          } else if (mesh.material) {
            disposeMaterial(mesh.material);
          }
        }
      });
      scene.clear();
    }

    controlsRef.current?.dispose();
    controlsRef.current = null;

    const renderer = rendererRef.current;
    if (renderer) {
      renderer.dispose();
      renderer.domElement.parentElement?.removeChild(renderer.domElement);
      rendererRef.current = null;
    }

    sceneRef.current = null;
    cameraRef.current = null;
    modelRef.current = null;
    gridRef.current = null;
    boundingBoxRef.current = null;
  }

  function disposeMaterial(material: THREE.Material) {
    const mat = material as THREE.MeshStandardMaterial;
    mat.map?.dispose();
    mat.normalMap?.dispose();
    mat.roughnessMap?.dispose();
    mat.metalnessMap?.dispose();
    mat.aoMap?.dispose();
    mat.emissiveMap?.dispose();
    material.dispose();
  }

  // ---------- Mode B: Image gallery handlers ----------

  const handleImageWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setImgZoom((z) => {
      const next = z - e.deltaY * 0.002;
      return Math.max(1, Math.min(5, next));
    });
  }, []);

  const handleImageMouseDown = useCallback((e: MouseEvent) => {
    if (imgZoom <= 1) return;
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX, y: e.clientY };
    panOffsetRef.current = { x: imgPan.x, y: imgPan.y };
  }, [imgZoom, imgPan]);

  const handleImageMouseMove = useCallback((e: MouseEvent) => {
    if (!isPanningRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setImgPan({
      x: panOffsetRef.current.x + dx,
      y: panOffsetRef.current.y + dy,
    });
  }, []);

  const handleImageMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  // Reset pan when zoom goes to 1
  useEffect(() => {
    if (imgZoom <= 1) {
      setImgPan({ x: 0, y: 0 });
    }
  }, [imgZoom]);

  // Reset pan/zoom when image changes
  useEffect(() => {
    setImgZoom(1);
    setImgPan({ x: 0, y: 0 });
  }, [imageIdx]);

  // ---------- Render: loading ----------

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-bg-canvas">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-[#00A6F0]/30 border-t-[#00A6F0] rounded-full animate-spin" />
          <span className="text-sm text-fg-muted font-mono">Loading 3D model...</span>
        </div>
      </div>
    );
  }

  // ---------- Render: error ----------

  if (error) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-bg-canvas">
        <div className="flex flex-col items-center gap-3 max-w-sm text-center px-6">
          <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-error">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <p className="text-sm text-error font-medium">{error}</p>
        </div>
      </div>
    );
  }

  // ---------- Render: no data ----------

  if (!data) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-bg-canvas">
        <p className="text-sm text-fg-muted">No 3D data received</p>
      </div>
    );
  }

  // ---------- Render: Mode A -- glTF 3D ----------

  if (isGltfData(data)) {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-bg-canvas">
        {/* Header overlay */}
        <div className="absolute top-3 left-3 z-50 flex items-center gap-2 bg-bg-canvas/70 backdrop-blur-md rounded-lg px-3 py-1.5 border border-border-subtle">
          <OnshapeBadge />
          <span className="text-xs font-semibold text-fg-default">3D Viewer</span>
        </div>

        {/* Toolbar */}
        <div className="absolute top-3 right-3 z-50 flex flex-col gap-1">
          {/* Grid */}
          <button
            onClick={() => setShowGrid((g) => !g)}
            className={cx(toolbarBtnClass, showGrid && toolbarBtnActiveClass)}
            title="Toggle grid"
          >
            <span className="flex items-center gap-1.5">
              <GridIcon />
              <span>Grid</span>
            </span>
          </button>

          {/* Wireframe */}
          <button
            onClick={() => setWireframe((w) => !w)}
            className={cx(toolbarBtnClass, wireframe && toolbarBtnActiveClass)}
            title="Toggle wireframe"
          >
            <span className="flex items-center gap-1.5">
              <WireframeIcon />
              <span>Wire</span>
            </span>
          </button>

          {/* Background */}
          <button
            onClick={() => setBgMode((m) => BG_CYCLE[(BG_CYCLE.indexOf(m) + 1) % BG_CYCLE.length])}
            className={cx(toolbarBtnClass)}
            title={`Background: ${bgMode}`}
          >
            <span className="flex items-center gap-1.5">
              <BgIcon />
              <span className="capitalize">{bgMode}</span>
            </span>
          </button>

          {/* Zoom to fit */}
          <button
            onClick={fitCamera}
            className={cx(toolbarBtnClass)}
            title="Zoom to fit"
          >
            <span className="flex items-center gap-1.5">
              <FitIcon />
              <span>Fit</span>
            </span>
          </button>
        </div>

        {/* Three.js container */}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    );
  }

  // ---------- Render: Mode B -- Image gallery ----------

  if (isImageData(data)) {
    const images = data.images;
    const total = images.length;

    if (total === 0) {
      return (
        <div className="w-full h-screen flex items-center justify-center bg-bg-canvas">
          <p className="text-sm text-fg-muted">No images in data</p>
        </div>
      );
    }

    return (
      <div className="relative w-full h-screen overflow-hidden bg-bg-canvas">
        {/* Header overlay */}
        <div className="absolute top-3 left-3 z-50 flex items-center gap-2 bg-bg-canvas/70 backdrop-blur-md rounded-lg px-3 py-1.5 border border-border-subtle">
          <OnshapeBadge />
          <span className="text-xs font-semibold text-fg-default">3D Viewer</span>
          <span className="text-[10px] font-mono text-fg-muted bg-bg-muted px-1.5 py-0.5 rounded">
            Shaded Views
          </span>
        </div>

        {/* Navigation toolbar */}
        <div className="absolute top-3 right-3 z-50 flex items-center gap-1">
          <button
            onClick={() => setImageIdx((i) => Math.max(0, i - 1))}
            disabled={imageIdx === 0}
            className={cx(toolbarBtnClass, "disabled:opacity-30 disabled:cursor-not-allowed")}
            title="Previous image"
          >
            <ChevronLeftIcon />
          </button>
          <span className="px-2 py-1.5 text-[10px] font-mono text-fg-muted bg-bg-muted/80 backdrop-blur-sm rounded border border-border-subtle select-none">
            {imageIdx + 1} / {total}
          </span>
          <button
            onClick={() => setImageIdx((i) => Math.min(total - 1, i + 1))}
            disabled={imageIdx >= total - 1}
            className={cx(toolbarBtnClass, "disabled:opacity-30 disabled:cursor-not-allowed")}
            title="Next image"
          >
            <ChevronRightIcon />
          </button>
        </div>

        {/* Zoom indicator */}
        {imgZoom > 1 && (
          <div className="absolute bottom-3 right-3 z-50 px-2 py-1 text-[10px] font-mono text-fg-muted bg-bg-muted/80 backdrop-blur-sm rounded border border-border-subtle">
            {Math.round(imgZoom * 100)}%
          </div>
        )}

        {/* Image container */}
        <div
          className="w-full h-full flex items-center justify-center overflow-hidden"
          style={{ cursor: imgZoom > 1 ? "grab" : "default" }}
          onWheel={handleImageWheel}
          onMouseDown={handleImageMouseDown}
          onMouseMove={handleImageMouseMove}
          onMouseUp={handleImageMouseUp}
          onMouseLeave={handleImageMouseUp}
        >
          <img
            src={`data:image/png;base64,${images[imageIdx]}`}
            alt={`Shaded view ${imageIdx + 1} of ${total}`}
            className="max-w-full max-h-full object-contain select-none"
            style={{
              transform: `scale(${imgZoom}) translate(${imgPan.x / imgZoom}px, ${imgPan.y / imgZoom}px)`,
              transformOrigin: "center center",
              transition: isPanningRef.current ? "none" : "transform 0.15s ease-out",
            }}
            draggable={false}
          />
        </div>
      </div>
    );
  }

  // ---------- Render: unknown data shape ----------

  return (
    <div className="w-full h-screen flex items-center justify-center bg-bg-canvas">
      <div className="flex flex-col items-center gap-3 max-w-sm text-center px-6">
        <p className="text-sm text-fg-muted">
          Unrecognized data format. Expected glTF JSON (with <code className="text-[#00A6F0]">asset</code> +{" "}
          <code className="text-[#00A6F0]">scenes</code>) or image gallery (with{" "}
          <code className="text-[#00A6F0]">images</code> array).
        </p>
      </div>
    </div>
  );
}
