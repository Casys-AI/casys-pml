/**
 * Hierarchy Builder - Transform flat hypergraph to D3 hierarchy
 *
 * Converts HypergraphResponse (flat nodes/edges) to hierarchical structure
 * suitable for radial HEB (Holten's Hierarchical Edge Bundles) visualization.
 *
 * Structure: Root -> Capabilities -> Tools
 *
 * @module web/utils/graph/hierarchy-builder
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Base node in hierarchy */
export interface HierarchyNodeData {
  id: string;
  name: string;
  type: "root" | "capability" | "tool";
}

/** Root node containing all capabilities */
export interface RootNodeData extends HierarchyNodeData {
  type: "root";
  children: CapabilityNodeData[];
}

/** Capability node containing its tools */
export interface CapabilityNodeData extends HierarchyNodeData {
  type: "capability";
  successRate: number;
  usageCount: number;
  codeSnippet?: string;
  children: ToolNodeData[];
}

/** Tool node (leaf) */
export interface ToolNodeData extends HierarchyNodeData {
  type: "tool";
  server: string;
  pagerank: number;
  degree: number;
  /** All parent capability IDs (for hyperedges) */
  parentCapabilities: string[];
  /** Primary parent (first in parents array) */
  primaryParent: string;
}

/** Edge between capabilities (for cap↔cap bundling) */
export interface CapabilityEdge {
  source: string; // cap-{uuid}
  target: string; // cap-{uuid}
  edgeType: string;
  observedCount: number;
}

/** Result of hierarchy building */
export interface HierarchyBuildResult {
  /** Hierarchical data for d3.hierarchy() */
  root: RootNodeData;
  /** Edges between capabilities (not in hierarchy) */
  capabilityEdges: CapabilityEdge[];
  /** Tools that were excluded (orphans) */
  orphanTools: ToolNodeData[];
  /** Stats */
  stats: {
    totalCapabilities: number;
    totalTools: number;
    orphanCount: number;
    hyperedgeCount: number; // Tools with multiple parents
  };
}

/** Input node from API (snake_case) */
interface ApiNode {
  data: {
    id: string;
    type: "capability" | "tool";
    label: string;
    server?: string;
    pagerank?: number;
    degree?: number;
    parents?: string[];
    success_rate?: number;
    usage_count?: number;
    code_snippet?: string;
  };
}

/** Input edge from API (snake_case) */
interface ApiEdge {
  data: {
    id: string;
    source: string;
    target: string;
    edge_type: string;
    observed_count?: number;
  };
}

/** API response structure */
export interface HypergraphApiResponse {
  nodes: ApiNode[];
  edges: ApiEdge[];
  capabilities_count: number;
  tools_count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build hierarchical structure from flat hypergraph API response
 *
 * @param response HypergraphResponse from /api/graph/hypergraph
 * @returns Hierarchical data structure for D3 + metadata
 */
export function buildHierarchy(response: HypergraphApiResponse): HierarchyBuildResult {
  const capabilities = new Map<string, CapabilityNodeData>();
  const tools = new Map<string, ToolNodeData>();
  const capabilityEdges: CapabilityEdge[] = [];
  const orphanTools: ToolNodeData[] = [];

  // 1. First pass: Create capability nodes
  for (const node of response.nodes) {
    if (node.data.type === "capability") {
      capabilities.set(node.data.id, {
        id: node.data.id,
        name: node.data.label,
        type: "capability",
        successRate: node.data.success_rate ?? 0,
        usageCount: node.data.usage_count ?? 0,
        codeSnippet: node.data.code_snippet,
        children: [],
      });
    }
  }

  // 2. Second pass: Create tool nodes and assign to capabilities
  let hyperedgeCount = 0;

  for (const node of response.nodes) {
    if (node.data.type === "tool") {
      const parents = node.data.parents ?? [];
      const validParents = parents.filter((p) => capabilities.has(p));

      const toolNode: ToolNodeData = {
        id: node.data.id,
        name: node.data.label,
        type: "tool",
        server: node.data.server ?? "unknown",
        pagerank: node.data.pagerank ?? 0,
        degree: node.data.degree ?? 0,
        parentCapabilities: validParents,
        primaryParent: validParents[0] ?? "",
      };

      tools.set(node.data.id, toolNode);

      if (validParents.length === 0) {
        // Orphan tool - no valid capability parent
        orphanTools.push(toolNode);
      } else {
        // Add to primary parent's children
        const primaryCap = capabilities.get(validParents[0]);
        if (primaryCap) {
          primaryCap.children.push(toolNode);
        }

        // Track hyperedges (tools with multiple parents)
        if (validParents.length > 1) {
          hyperedgeCount++;
        }
      }
    }
  }

  // 3. Extract capability-to-capability edges
  for (const edge of response.edges) {
    const sourceId = edge.data.source;
    const targetId = edge.data.target;

    // Only include edges between capabilities (not cap→tool or tool→tool)
    if (capabilities.has(sourceId) && capabilities.has(targetId)) {
      capabilityEdges.push({
        source: sourceId,
        target: targetId,
        edgeType: edge.data.edge_type,
        observedCount: edge.data.observed_count ?? 1,
      });
    }
  }

  // 4. Build root node (only include capabilities with children)
  // D3.cluster requires leaf nodes to have proper positions
  const capsWithChildren = Array.from(capabilities.values()).filter(
    (cap) => cap.children.length > 0,
  );

  const root: RootNodeData = {
    id: "root",
    name: "Capabilities",
    type: "root",
    children: capsWithChildren,
  };

  // Filter capabilityEdges to only include edges between capabilities in the tree
  const capsInTree = new Set(capsWithChildren.map((c) => c.id));
  const filteredCapEdges = capabilityEdges.filter(
    (e) => capsInTree.has(e.source) && capsInTree.has(e.target),
  );

  return {
    root,
    capabilityEdges: filteredCapEdges,
    orphanTools,
    stats: {
      totalCapabilities: capsWithChildren.length,
      totalTools: tools.size - orphanTools.length,
      orphanCount: orphanTools.length,
      hyperedgeCount,
    },
  };
}

/**
 * Get all hyperedges (tools with multiple parent capabilities)
 * Used for drawing additional edges in the visualization
 *
 * @param root Hierarchy root node
 * @returns Array of {toolId, capabilityIds} for tools with >1 parent
 */
export function getHyperedges(
  root: RootNodeData,
): Array<{ toolId: string; capabilityIds: string[] }> {
  const hyperedges: Array<{ toolId: string; capabilityIds: string[] }> = [];

  for (const cap of root.children) {
    for (const tool of cap.children) {
      if (tool.parentCapabilities.length > 1) {
        hyperedges.push({
          toolId: tool.id,
          capabilityIds: tool.parentCapabilities,
        });
      }
    }
  }

  return hyperedges;
}
