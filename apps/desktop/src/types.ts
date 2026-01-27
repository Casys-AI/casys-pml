/** Graph node representation */
export interface GraphNode {
  id: string;
  x: number;
  y: number;
  label: string;
  size?: number;
  color?: [number, number, number, number]; // RGBA 0-1
}

/** Graph edge representation */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  color?: [number, number, number, number]; // RGBA 0-1
}

/** Camera state for zoom/pan */
export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

/** WebGPU renderer context */
export interface RendererContext {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
}
