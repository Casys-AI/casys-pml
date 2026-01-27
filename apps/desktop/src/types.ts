/** Hexagonal cell representation */
export interface HexCell {
  id: string;
  q: number;           // Axial Q coordinate
  r: number;           // Axial R coordinate
  level: number;       // Hierarchy depth (0 = root, 1 = child, etc.)
  label: string;
  parentId?: string;   // Parent cell ID
  children?: string[]; // Child cell IDs
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

// Legacy types kept for backward compatibility
/** @deprecated Use HexCell instead */
export interface GraphNode {
  id: string;
  x: number;
  y: number;
  label: string;
  size?: number;
  color?: [number, number, number, number];
}

/** @deprecated No longer used in hex visualization */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  color?: [number, number, number, number];
}
