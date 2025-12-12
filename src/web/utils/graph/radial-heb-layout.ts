/**
 * Radial HEB Layout - Hierarchical Edge Bundling with Concentric Circles
 *
 * Based on Holten 2006 "Hierarchical Edge Bundles"
 * Layout: Tools on outer circle, Capabilities on inner circle
 * Bundling: D3's native curveBundle with beta tension parameter
 *
 * @module web/utils/graph/radial-heb-layout
 */

// D3 loaded from CDN
// deno-lint-ignore no-explicit-any
const d3 = (globalThis as any).d3;

import type {
  CapabilityEdge,
  HierarchyNodeData,
  RootNodeData,
  ToolNodeData,
} from "./hierarchy-builder.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RadialLayoutConfig {
  /** Container width */
  width: number;
  /** Container height */
  height: number;
  /** Outer radius for tools (default: min(width,height)/2 - 80) */
  radiusTools?: number;
  /** Inner radius for capabilities (default: radiusTools * 0.4) */
  radiusCapabilities?: number;
  /** Bundle tension/beta (0 = tight bundles, 1 = straight lines, default: 0.85) */
  tension?: number;
  /** Label font size (default: 10) */
  labelFontSize?: number;
}

/** Positioned node after layout */
export interface PositionedNode {
  id: string;
  name: string;
  type: "root" | "capability" | "tool";
  /** Angle in radians */
  x: number;
  /** Radius from center */
  y: number;
  /** Cartesian X (computed) */
  cartX: number;
  /** Cartesian Y (computed) */
  cartY: number;
  /** Original data */
  data: HierarchyNodeData;
  /** D3 hierarchy node reference */
  // deno-lint-ignore no-explicit-any
  d3Node: any;
}

/** Edge path for rendering */
export interface BundledPath {
  id: string;
  sourceId: string;
  targetId: string;
  /** SVG path d attribute */
  pathD: string;
  /** Edge type for styling */
  edgeType: "hierarchy" | "hyperedge" | "capability_link";
}

/** Layout result */
export interface RadialLayoutResult {
  /** All positioned nodes */
  nodes: PositionedNode[];
  /** Capability nodes only */
  capabilities: PositionedNode[];
  /** Tool nodes only */
  tools: PositionedNode[];
  /** Bundled edge paths */
  paths: BundledPath[];
  /** Center point */
  center: { x: number; y: number };
  /** Actual radii used */
  radii: {
    tools: number;
    capabilities: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create radial HEB layout from hierarchy
 *
 * @param root Hierarchy root from buildHierarchy()
 * @param capabilityEdges Edges between capabilities
 * @param config Layout configuration
 * @returns Positioned nodes and bundled paths
 */
export function createRadialLayout(
  root: RootNodeData,
  capabilityEdges: CapabilityEdge[],
  config: RadialLayoutConfig,
): RadialLayoutResult {
  const { width, height } = config;
  const centerX = width / 2;
  const centerY = height / 2;

  // Calculate radii
  const maxRadius = Math.min(width, height) / 2 - 80;
  const radiusTools = config.radiusTools ?? maxRadius;
  const radiusCapabilities = config.radiusCapabilities ?? radiusTools * 0.4;
  const tension = config.tension ?? 0.85;

  // Create D3 hierarchy
  const hierarchy = d3.hierarchy(root);

  // Create cluster layout (radial)
  const cluster = d3.cluster().size([2 * Math.PI, radiusTools]);

  // Apply layout
  cluster(hierarchy);

  // Collect positioned nodes
  const nodes: PositionedNode[] = [];
  const capabilities: PositionedNode[] = [];
  const tools: PositionedNode[] = [];
  // deno-lint-ignore no-explicit-any
  const nodeMap = new Map<string, any>(); // id -> d3 node

  // deno-lint-ignore no-explicit-any
  hierarchy.each((d: any) => {
    // Skip root node (has no x/y from cluster layout)
    if (d.data.type === "root" || d.x === undefined) {
      nodeMap.set(d.data.id, d);
      return;
    }

    // Override Y (radius) based on node type
    if (d.data.type === "capability") {
      d.y = radiusCapabilities;
    }
    // Tools keep the cluster-assigned y = radiusTools

    // Convert polar to cartesian
    const angle = d.x - Math.PI / 2; // Rotate so 0 is at top
    const cartX = centerX + d.y * Math.cos(angle);
    const cartY = centerY + d.y * Math.sin(angle);

    const positioned: PositionedNode = {
      id: d.data.id,
      name: d.data.name,
      type: d.data.type,
      x: d.x,
      y: d.y,
      cartX,
      cartY,
      data: d.data,
      d3Node: d,
    };

    nodes.push(positioned);
    nodeMap.set(d.data.id, d);

    if (d.data.type === "capability") {
      capabilities.push(positioned);
    } else if (d.data.type === "tool") {
      tools.push(positioned);
    }
  });

  // Create bundled paths
  const paths: BundledPath[] = [];

  // Line generator for radial bundled paths
  // Note: d.path() includes root node which has x=undefined, so we default to 0
  const lineRadial = d3
    .lineRadial()
    .curve(d3.curveBundle.beta(tension))
    // deno-lint-ignore no-explicit-any
    .radius((d: any) => d.y ?? 0)
    // deno-lint-ignore no-explicit-any
    .angle((d: any) => d.x ?? 0);

  // 1. Hierarchy edges (capability → tool) using d3's path()
  // deno-lint-ignore no-explicit-any
  hierarchy.each((d: any) => {
    if (d.data.type === "tool" && d.parent) {
      const path = d.path(d.parent);
      const pathD = lineRadial(path);

      if (pathD) {
        paths.push({
          id: `hier-${d.parent.data.id}-${d.data.id}`,
          sourceId: d.parent.data.id,
          targetId: d.data.id,
          pathD,
          edgeType: "hierarchy",
        });
      }
    }
  });

  // 2. Hyperedges (tool → non-primary parent capabilities)
  // deno-lint-ignore no-explicit-any
  hierarchy.each((d: any) => {
    if (d.data.type === "tool") {
      const toolData = d.data as ToolNodeData;
      const primaryParent = toolData.primaryParent;

      for (const capId of toolData.parentCapabilities) {
        if (capId !== primaryParent) {
          const capNode = nodeMap.get(capId);
          if (capNode && d.parent) {
            // Path goes: tool → primary parent → root → secondary parent
            // Using d3's path() through common ancestor
            const path = d.path(capNode);
            const pathD = lineRadial(path);

            if (pathD) {
              paths.push({
                id: `hyper-${capId}-${d.data.id}`,
                sourceId: capId,
                targetId: d.data.id,
                pathD,
                edgeType: "hyperedge",
              });
            }
          }
        }
      }
    }
  });

  // 3. Capability-to-capability edges (bundled through center)
  for (const edge of capabilityEdges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    if (sourceNode && targetNode) {
      // Path through root (center)
      const path = sourceNode.path(targetNode);
      const pathD = lineRadial(path);

      if (pathD) {
        paths.push({
          id: `cap-${edge.source}-${edge.target}`,
          sourceId: edge.source,
          targetId: edge.target,
          pathD,
          edgeType: "capability_link",
        });
      }
    }
  }

  return {
    nodes,
    capabilities,
    tools,
    paths,
    center: { x: centerX, y: centerY },
    radii: {
      tools: radiusTools,
      capabilities: radiusCapabilities,
    },
  };
}

/**
 * Update bundle tension and recompute paths
 * More efficient than full relayout when only tension changes
 *
 * @param root Hierarchy root
 * @param capabilityEdges Capability edges
 * @param nodeMap Map of id to d3 node
 * @param tension New tension value (0-1)
 * @returns Updated bundled paths
 */
export function updateBundleTension(
  // deno-lint-ignore no-explicit-any
  hierarchy: any,
  capabilityEdges: CapabilityEdge[],
  // deno-lint-ignore no-explicit-any
  nodeMap: Map<string, any>,
  tension: number,
): BundledPath[] {
  const paths: BundledPath[] = [];

  const lineRadial = d3
    .lineRadial()
    .curve(d3.curveBundle.beta(tension))
    // deno-lint-ignore no-explicit-any
    .radius((d: any) => d.y ?? 0)
    // deno-lint-ignore no-explicit-any
    .angle((d: any) => d.x ?? 0);

  // Rebuild all paths with new tension
  // deno-lint-ignore no-explicit-any
  hierarchy.each((d: any) => {
    // Hierarchy edges
    if (d.data.type === "tool" && d.parent) {
      const path = d.path(d.parent);
      const pathD = lineRadial(path);
      if (pathD) {
        paths.push({
          id: `hier-${d.parent.data.id}-${d.data.id}`,
          sourceId: d.parent.data.id,
          targetId: d.data.id,
          pathD,
          edgeType: "hierarchy",
        });
      }
    }

    // Hyperedges
    if (d.data.type === "tool") {
      const toolData = d.data as ToolNodeData;
      for (const capId of toolData.parentCapabilities) {
        if (capId !== toolData.primaryParent) {
          const capNode = nodeMap.get(capId);
          if (capNode) {
            const path = d.path(capNode);
            const pathD = lineRadial(path);
            if (pathD) {
              paths.push({
                id: `hyper-${capId}-${d.data.id}`,
                sourceId: capId,
                targetId: d.data.id,
                pathD,
                edgeType: "hyperedge",
              });
            }
          }
        }
      }
    }
  });

  // Capability edges
  for (const edge of capabilityEdges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (sourceNode && targetNode) {
      const path = sourceNode.path(targetNode);
      const pathD = lineRadial(path);
      if (pathD) {
        paths.push({
          id: `cap-${edge.source}-${edge.target}`,
          sourceId: edge.source,
          targetId: edge.target,
          pathD,
          edgeType: "capability_link",
        });
      }
    }
  }

  return paths;
}

/**
 * Calculate label rotation for radial text
 * Labels on the left side of the circle should be flipped
 *
 * @param angle Angle in radians
 * @returns CSS transform rotation
 */
export function getLabelRotation(angle: number): { rotate: number; anchor: string } {
  // Convert to degrees
  const degrees = (angle * 180) / Math.PI - 90;

  // Labels on left side (90° to 270°) should be flipped
  if (angle > Math.PI / 2 && angle < (3 * Math.PI) / 2) {
    return {
      rotate: degrees + 180,
      anchor: "end",
    };
  }

  return {
    rotate: degrees,
    anchor: "start",
  };
}

/**
 * Get edge color based on type
 */
export function getRadialEdgeColor(edgeType: BundledPath["edgeType"]): string {
  switch (edgeType) {
    case "hierarchy":
      return "#888888"; // Gray for cap→tool
    case "hyperedge":
      return "#f59e0b"; // Amber for multi-parent tools
    case "capability_link":
      return "#3b82f6"; // Blue for cap↔cap
    default:
      return "#888888";
  }
}

/**
 * Get edge opacity based on type
 */
export function getRadialEdgeOpacity(edgeType: BundledPath["edgeType"]): number {
  switch (edgeType) {
    case "hierarchy":
      return 0.4;
    case "hyperedge":
      return 0.6;
    case "capability_link":
      return 0.7;
    default:
      return 0.4;
  }
}
