import { useEffect, useRef, useState } from 'preact/hooks';
import type { HexCell, CameraState } from '../types';
import { HexRendererPixi } from '../renderer/HexRendererPixi';
import { ZOOM_MIN, ZOOM_MAX } from '../App';

interface HexCanvasProps {
  cells: HexCell[];
  onZoomLevelChange?: (zoom: number) => void;
  onCellClick?: (cell: HexCell | null) => void;
  targetZoom?: number;
}

export function HexCanvas({
  cells,
  onZoomLevelChange,
  onCellClick,
  targetZoom,
}: HexCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<HexRendererPixi | null>(null);
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 1 });
  const [error, setError] = useState<string | null>(null);

  const cellsRef = useRef(cells);
  const cameraRef = useRef(camera);
  const isDragging = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const lastMouse = useRef({ x: 0, y: 0 });

  useEffect(() => { cellsRef.current = cells; }, [cells]);
  useEffect(() => { cameraRef.current = camera; }, [camera]);

  // Initialize PixiJS
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: HexRendererPixi | null = null;
    let isDestroyed = false;

    const init = async () => {
      try {
        renderer = new HexRendererPixi();
        await renderer.init(canvas);
        rendererRef.current = renderer;
        // Initial render
        renderer.setCamera(cameraRef.current);
        renderer.render(cellsRef.current);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to init renderer');
      }
    };

    init();

    return () => {
      isDestroyed = true;
      renderer?.destroy();
      rendererRef.current = null;
    };
  }, []);

  // Render only when cells or camera change
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer?.isInitialized()) return;
    renderer.setCamera(camera);
    renderer.render(cells);
  }, [cells, camera]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      if (canvasRef.current) {
        canvasRef.current.width = rect.width;
        canvasRef.current.height = rect.height;
      }
      rendererRef.current?.resize(rect.width, rect.height);
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);
    handleResize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => { onZoomLevelChange?.(camera.zoom); }, [camera.zoom, onZoomLevelChange]);

  // Controlled zoom
  useEffect(() => {
    if (targetZoom !== undefined && Math.abs(camera.zoom - targetZoom) > 0.01) {
      setCamera((prev) => ({ ...prev, zoom: targetZoom }));
    }
  }, [targetZoom]);

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.85 : 1.18;
    setCamera((prev) => ({
      ...prev,
      zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev.zoom * factor)),
    }));
  };

  const handleMouseDown = (e: MouseEvent) => {
    isDragging.current = true;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
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
      y: prev.y + dy / prev.zoom,
    }));
  };

  const handleMouseUp = (e: MouseEvent) => {
    const wasDragging = isDragging.current;
    isDragging.current = false;

    // Only trigger click if we didn't drag much
    const dist = Math.hypot(
      e.clientX - dragStartPos.current.x,
      e.clientY - dragStartPos.current.y
    );

    if (wasDragging && dist < 5) {
      // Find cell at click position
      const cellId = rendererRef.current?.findCellAt(e.clientX, e.clientY);
      if (cellId) {
        const cell = cellsRef.current.find(c => c.id === cellId);
        onCellClick?.(cell || null);
      } else {
        onCellClick?.(null);
      }
    }
  };

  const handleDoubleClick = (e: MouseEvent) => {
    e.preventDefault();
    setCamera((prev) => ({
      x: prev.x * 0.5,
      y: prev.y * 0.5,
      zoom: Math.max(ZOOM_MIN, prev.zoom / 2),
    }));
  };

  if (error) {
    return (
      <div style={{ padding: 20, color: '#f66', textAlign: 'center' }}>
        <h3>Renderer Error</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { isDragging.current = false; }}
      onDblClick={handleDoubleClick}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }}
      />
    </div>
  );
}
