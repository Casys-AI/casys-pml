/**
 * Graph Utilities - Hierarchical Edge Bundling (HEB)
 *
 * Based on Holten 2006 "Hierarchical Edge Bundles"
 *
 * Modules:
 * - hierarchy-builder: Transform flat hypergraph to D3 hierarchy
 * - radial-heb-layout: Concentric circle layout with D3 curveBundle
 *
 * Legacy modules (deprecated, kept for reference):
 * - edge-compatibility: 4 compatibility metrics (Ca, Cs, Cp, Cv)
 * - fdeb-bundler: FDEB algorithm with iterative refinement
 * - bounded-force-layout: D3 force simulation with viewport bounds
 */

// Edge Compatibility
export {
  angleCompatibility,
  type CompatibilityResult,
  type Edge,
  edgeCompatibility,
  isCompatible,
  type Point,
  positionCompatibility,
  scaleCompatibility,
  visibilityCompatibility,
} from "./edge-compatibility.ts";

// FDEB Bundler
export { type BundledEdge, bundleEdges, FDEBBundler, type FDEBConfig } from "./fdeb-bundler.ts";

// Bounded Force Layout
export {
  type BoundedForceConfig,
  BoundedForceLayout,
  createBoundedForceLayout,
  type SimulationLink,
  type SimulationNode,
} from "./bounded-force-layout.ts";

// Edge Renderer
export {
  type EdgeClickHandler,
  type EdgeHoverHandler,
  type EdgeRenderConfig,
  EdgeRenderer,
  renderSimpleEdges,
} from "./edge-renderer.ts";

// Edge Heatmap (Holten paper - WebGL density visualization)
export { DEFAULT_HEATMAP_COLORS, EdgeHeatmap, type EdgeHeatmapConfig } from "./edge-heatmap.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Hierarchical Edge Bundling (HEB) - Holten 2006
// ─────────────────────────────────────────────────────────────────────────────

// Hierarchy Builder
export {
  buildHierarchy,
  type CapabilityEdge,
  type CapabilityNodeData,
  getHyperedges,
  type HierarchyBuildResult,
  type HierarchyNodeData,
  type HypergraphApiResponse,
  type RootNodeData,
  type ToolEdge,
  type ToolNodeData,
} from "./hierarchy-builder.ts";

// Radial HEB Layout
export {
  type BundledPath,
  createRadialLayout,
  getLabelRotation,
  getRadialEdgeColor,
  getRadialEdgeOpacity,
  type PositionedNode,
  type RadialLayoutConfig,
  type RadialLayoutResult,
  updateBundleTension,
} from "./radial-heb-layout.ts";
