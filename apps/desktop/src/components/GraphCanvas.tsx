import { useEffect, useRef, useState } from 'preact/hooks';
import type { GraphNode, GraphEdge, CameraState } from '../types';
import { GraphRenderer } from '../renderer/GraphRenderer';
import { ZOOM_MIN, ZOOM_MAX } from '../App';

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onZoomLevelChange?: (zoom: number) => void;
  targetZoom?: number; // Controlled zoom from parent
}

export function GraphCanvas({ nodes, edges, onZoomLevelChange, targetZoom }: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GraphRenderer | null>(null);
  const contextRef = useRef<GPUCanvasContext | null>(null);
  const deviceRef = useRef<GPUDevice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 1 });

  // F2 Fix: Use refs to avoid stale closures
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  // F4 Fix: Use ref for camera in render loop
  const cameraRef = useRef(camera);

  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  // Keep refs updated
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  // F7 Fix: Resize observer to match canvas buffer size to display size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.floor(rect.width * dpr);
      const height = Math.floor(rect.height * dpr);

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;

        // Reconfigure context if device exists
        if (deviceRef.current && contextRef.current) {
          const format = navigator.gpu.getPreferredCanvasFormat();
          contextRef.current.configure({
            device: deviceRef.current,
            format,
            alphaMode: 'premultiplied',
          });
        }
      }
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(canvas);

    // Initial resize
    handleResize();

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animationId: number;
    let renderer: GraphRenderer | null = null;
    let isDestroyed = false;

    const init = async () => {
      if (!navigator.gpu) {
        setError('WebGPU not supported in this browser');
        return;
      }

      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        setError('Failed to get WebGPU adapter');
        return;
      }

      const device = await adapter.requestDevice();
      deviceRef.current = device;

      // F5 Fix: Handle device lost
      device.lost.then((info) => {
        console.error(`WebGPU device was lost: ${info.message}`);
        deviceRef.current = null;
        if (!isDestroyed) {
          setError(`GPU device lost: ${info.reason}. Please refresh the page.`);
        }
      });

      const context = canvas.getContext('webgpu');
      if (!context) {
        setError('Failed to get WebGPU context');
        return;
      }
      contextRef.current = context;

      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({ device, format, alphaMode: 'premultiplied' });

      renderer = new GraphRenderer({ device, context, format }, canvas);
      rendererRef.current = renderer;

      const renderLoop = () => {
        if (isDestroyed) return;

        if (renderer && rendererRef.current) {
          // F2 & F4 Fix: Use refs for current values
          renderer.setCamera(cameraRef.current);
          renderer.render(nodesRef.current, edgesRef.current);
        }
        animationId = requestAnimationFrame(renderLoop);
      };
      renderLoop();
    };

    init().catch((err) => setError(err.message));

    return () => {
      isDestroyed = true;
      if (animationId) cancelAnimationFrame(animationId);
      renderer?.destroy();
      rendererRef.current = null;
      deviceRef.current = null;
      contextRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setCamera(camera);
    }
  }, [camera]);

  useEffect(() => {
    onZoomLevelChange?.(camera.zoom);
  }, [camera.zoom, onZoomLevelChange]);

  // Sync with controlled zoom from parent (sidebar navigation)
  useEffect(() => {
    if (targetZoom !== undefined && Math.abs(camera.zoom - targetZoom) > 0.01) {
      setCamera((prev) => ({ ...prev, zoom: targetZoom }));
    }
  }, [targetZoom]);

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setCamera((prev) => ({
      ...prev,
      zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev.zoom * zoomFactor)),
    }));
  };

  const handleMouseDown = (e: MouseEvent) => {
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setCamera((prev) => ({
      ...prev,
      x: prev.x + dx / prev.zoom,
      y: prev.y - dy / prev.zoom,
    }));
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  if (error) {
    return (
      <div class="webgpu-error" style={{ padding: '20px', color: 'red', textAlign: 'center' }}>
        <h3>WebGPU Error</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', cursor: isDragging.current ? 'grabbing' : 'grab' }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
}
