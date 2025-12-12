/**
 * Graph Utilities - Force-Directed Edge Bundling (FDEB)
 *
 * Based on Holten & van Wijk, 2009
 *
 * Modules:
 * - edge-compatibility: 4 compatibility metrics (Ca, Cs, Cp, Cv)
 * - fdeb-bundler: FDEB algorithm with iterative refinement
 * - bounded-force-layout: D3 force simulation with viewport bounds
 * - edge-renderer: SVG rendering for bundled edges
 */

// Edge Compatibility
export {
  type Point,
  type Edge,
  type CompatibilityResult,
  angleCompatibility,
  scaleCompatibility,
  positionCompatibility,
  visibilityCompatibility,
  edgeCompatibility,
  isCompatible,
} from "./edge-compatibility.ts";

// FDEB Bundler
export {
  type FDEBConfig,
  type BundledEdge,
  FDEBBundler,
  bundleEdges,
} from "./fdeb-bundler.ts";

// Bounded Force Layout
export {
  type BoundedForceConfig,
  type SimulationNode,
  type SimulationLink,
  BoundedForceLayout,
  createBoundedForceLayout,
} from "./bounded-force-layout.ts";

// Edge Renderer
export {
  type EdgeRenderConfig,
  type EdgeClickHandler,
  type EdgeHoverHandler,
  EdgeRenderer,
  renderSimpleEdges,
} from "./edge-renderer.ts";
