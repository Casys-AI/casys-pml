/**
 * Type definitions for Capability Storage (Epic 7 - Story 7.2a)
 *
 * Capabilities are learned code patterns that can be matched and reused.
 * Eager learning: store on 1st successful execution, no wait for patterns.
 *
 * @module capabilities/types
 */

/**
 * JSON Schema type (simplified for capability parameters)
 *
 * Note: 'type' is optional to support unconstrained schemas ({})
 * which accept any value when no type can be inferred.
 */
export interface JSONSchema {
  $schema?: string;
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  default?: unknown;
}

/**
 * Cache configuration for a capability
 */
export interface CacheConfig {
  /** Time-to-live in milliseconds (default: 3600000 = 1 hour) */
  ttl_ms: number;
  /** Whether this capability can be cached (default: true) */
  cacheable: boolean;
}

/**
 * A learned capability - executable code pattern with metadata
 *
 * Capabilities are stored on first successful execution (eager learning).
 * Subsequent executions update usage statistics via ON CONFLICT upsert.
 */
export interface Capability {
  /** Unique identifier (UUID) */
  id: string;
  /** The TypeScript code snippet */
  codeSnippet: string;
  /** SHA-256 hash of normalized code for deduplication */
  codeHash: string;
  /** 1024-dim embedding of intent for semantic search */
  intentEmbedding: Float32Array;
  /** JSON Schema for parameters (populated by Story 7.2b) */
  parametersSchema?: JSONSchema;
  /** Cache configuration */
  cacheConfig: CacheConfig;
  /** Human-readable name (auto-generated or manual) */
  name?: string;
  /** Description of what this capability does */
  description?: string;
  /** Total number of times this capability was used */
  usageCount: number;
  /** Number of successful executions */
  successCount: number;
  /** Success rate (0-1, calculated as successCount/usageCount) */
  successRate: number;
  /** Average execution duration in milliseconds */
  avgDurationMs: number;
  /** When this capability was first learned */
  createdAt: Date;
  /** When this capability was last used */
  lastUsed: Date;
  /** Source: 'emergent' (auto-learned) or 'manual' (user-defined) */
  source: "emergent" | "manual";
  /** Tools used by this capability (extracted from dag_structure) - Story 7.4 */
  toolsUsed?: string[];
}

/**
 * Input for saving a capability after execution
 */
export interface SaveCapabilityInput {
  /** The TypeScript code that was executed */
  code: string;
  /** The natural language intent (used for embedding) */
  intent: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Whether execution was successful */
  success?: boolean;
  /** Optional name for the capability */
  name?: string;
  /** Optional description */
  description?: string;
  /** Tool IDs used during execution (from traces) */
  toolsUsed?: string[];
}

/**
 * Result of capability search
 */
export interface CapabilitySearchResult {
  /** The matched capability */
  capability: Capability;
  /** Semantic similarity score (0-1) - harmonized with HybridSearchResult */
  semanticScore: number;
}

/**
 * Result of intelligent capability matching (Story 7.3a)
 * Includes final score calculation and threshold comparison data.
 */
export interface CapabilityMatch {
  /** The matched capability */
  capability: Capability;
  /** Final calculated score (Semantic * Reliability) */
  score: number;
  /** Raw semantic similarity score (0-1) */
  semanticScore: number;
  /** The adaptive threshold used for the decision */
  thresholdUsed: number;
  /** The inferred parameters schema for calling this capability */
  parametersSchema: JSONSchema | null;
}

// Note: Database row types are inferred from PGlite query results.
// See rowToCapability() in capability-store.ts for the mapping logic.

/**
 * Edge types for capability dependencies
 * Same vocabulary as tool_dependency for consistency
 */
export type CapabilityEdgeType =
  | "contains" // Composition: capability A includes capability B
  | "sequence" // Temporal order: A then B
  | "dependency" // Explicit DAG dependency
  | "alternative"; // Same intent, different implementation

/**
 * Edge sources for capability dependencies
 */
export type CapabilityEdgeSource =
  | "template" // Bootstrap, not yet confirmed
  | "inferred" // 1-2 observations
  | "observed"; // 3+ observations (promoted from inferred)

/**
 * A capability-to-capability dependency relationship
 * Stored in capability_dependency table with FKs to workflow_pattern
 */
export interface CapabilityDependency {
  fromCapabilityId: string;
  toCapabilityId: string;
  observedCount: number;
  confidenceScore: number;
  edgeType: CapabilityEdgeType;
  edgeSource: CapabilityEdgeSource;
  createdAt: Date;
  lastObserved: Date;
}

/**
 * Input for creating a capability dependency
 */
export interface CreateCapabilityDependencyInput {
  fromCapabilityId: string;
  toCapabilityId: string;
  edgeType: CapabilityEdgeType;
  edgeSource?: CapabilityEdgeSource;
}

/**
 * API Types (Story 8.1)
 * INTERNAL types use camelCase. Mapping to snake_case happens in gateway-server.ts
 */

/**
 * Filters for listing capabilities (internal camelCase)
 */
export interface CapabilityFilters {
  /** Filter by Louvain community */
  communityId?: number;
  /** Minimum success rate (0-1) */
  minSuccessRate?: number;
  /** Minimum usage count */
  minUsage?: number;
  /** Maximum results per page */
  limit?: number;
  /** Pagination offset */
  offset?: number;
  /** Sort field */
  sort?: "usageCount" | "successRate" | "lastUsed" | "createdAt";
  /** Sort order */
  order?: "asc" | "desc";
}

/**
 * Single capability in API response (internal camelCase)
 * Maps to snake_case at API boundary in gateway-server.ts
 */
export interface CapabilityResponseInternal {
  id: string; // pattern_id UUID
  name: string | null; // Human-readable name
  description: string | null; // Intent description
  codeSnippet: string; // TypeScript code
  toolsUsed: string[]; // ["filesystem:read", "github:create_issue"]
  successRate: number; // 0-1
  usageCount: number; // Total executions
  avgDurationMs: number; // Average execution time
  communityId: number | null; // Louvain cluster
  intentPreview: string; // First 100 chars of intent
  createdAt: string; // ISO timestamp
  lastUsed: string; // ISO timestamp
  source: "emergent" | "manual"; // Learning source
}

/**
 * Response from listCapabilities (internal camelCase)
 */
export interface CapabilityListResponseInternal {
  capabilities: CapabilityResponseInternal[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Options for building hypergraph data (internal camelCase)
 */
export interface HypergraphOptions {
  /** Include standalone tools not in capabilities */
  includeTools?: boolean;
  /** Filter capabilities by minimum success rate */
  minSuccessRate?: number;
  /** Filter capabilities by minimum usage */
  minUsage?: number;
}

/**
 * Graph node for capability (parent node in compound graph)
 * Internal camelCase - maps to snake_case at API boundary
 * Note: Previously named CytoscapeNode, renamed after D3.js migration
 */
export interface CapabilityNode {
  data: {
    id: string; // "cap-{uuid}"
    type: "capability";
    label: string; // Name or intent preview
    codeSnippet: string;
    successRate: number;
    usageCount: number;
    toolsCount: number; // Number of child tools
    pagerank: number; // Hypergraph PageRank score (0-1)
  };
}

/**
 * Graph node for tool (child of capability or standalone)
 * Internal camelCase - maps to snake_case at API boundary
 * Note: Previously named CytoscapeNode, renamed after D3.js migration
 *
 * Story 8.2: Changed from `parent?: string` to `parents: string[]`
 * to support hyperedges (tool belonging to multiple capabilities).
 */
export interface ToolNode {
  data: {
    id: string; // "filesystem:read"
    /** @deprecated Use `parents` instead. Kept for backward compatibility. */
    parent?: string; // Single parent (legacy)
    /** Parent capability IDs - supports hyperedges (multi-parent). Empty array for standalone tools. */
    parents: string[]; // ["cap-uuid-1", "cap-uuid-2"] or [] for standalone
    type: "tool";
    server: string; // "filesystem"
    label: string; // "read"
    pagerank: number; // From GraphSnapshot
    degree: number; // From GraphSnapshot
  };
}

/**
 * Graph edge between capabilities that share tools
 * Internal camelCase - maps to snake_case at API boundary
 * Note: Previously named CytoscapeEdge, renamed after D3.js migration
 */
export interface CapabilityEdge {
  data: {
    id: string;
    source: string; // "cap-{uuid1}"
    target: string; // "cap-{uuid2}"
    sharedTools: number; // Count of shared tools
    edgeType: "capability_link";
    edgeSource: "inferred";
  };
}

/**
 * Hierarchical edge (capability → tool via parentTraceId, ADR-041)
 * Internal camelCase - maps to snake_case at API boundary
 */
export interface HierarchicalEdge {
  data: {
    id: string;
    source: string; // "cap-{uuid}" (parent)
    target: string; // "filesystem:read" (child tool)
    edgeType: "hierarchy";
    edgeSource: "observed"; // From trace data
    observedCount: number; // Number of times this call was traced
  };
}

/**
 * Tech-spec: Capability-to-capability dependency edge (hyperedge)
 * Represents relationships between capabilities in the hypergraph
 */
export interface CapabilityDependencyEdge {
  data: {
    id: string;
    source: string; // "cap-{uuid1}"
    target: string; // "cap-{uuid2}"
    edgeType: "contains" | "sequence" | "dependency" | "alternative";
    edgeSource: "template" | "inferred" | "observed";
    observedCount: number;
  };
}

/**
 * Union type for all graph nodes
 * @deprecated Use GraphNode instead. Kept for backward compatibility.
 */
export type CytoscapeNode = CapabilityNode | ToolNode;

/**
 * Union type for all graph edges
 * @deprecated Use GraphEdge instead. Kept for backward compatibility.
 */
export type CytoscapeEdge = CapabilityEdge | HierarchicalEdge | CapabilityDependencyEdge;

/**
 * Union type for all graph nodes (D3.js visualization)
 */
export type GraphNode = CapabilityNode | ToolNode;

/**
 * Union type for all graph edges (D3.js visualization)
 */
export type GraphEdge = CapabilityEdge | HierarchicalEdge | CapabilityDependencyEdge;

/**
 * Hull zone metadata for capability visualization (Story 8.2)
 * Each capability is rendered as a convex hull around its tools
 */
export interface CapabilityZone {
  /** Capability ID (cap-{uuid}) */
  id: string;
  /** Display label */
  label: string;
  /** Zone color (hex) */
  color: string;
  /** Opacity (0-1) for overlapping zones */
  opacity: number;
  /** Tool IDs contained in this zone */
  toolIds: string[];
  /** Padding around tools in px */
  padding: number;
  /** Minimum hull radius */
  minRadius: number;
}

/**
 * Response from buildHypergraphData (internal camelCase)
 * Maps to snake_case at API boundary in gateway-server.ts
 */
export interface HypergraphResponseInternal {
  nodes: CytoscapeNode[];
  edges: CytoscapeEdge[];
  /** Hull zone metadata for D3.js hull rendering (Story 8.2) */
  capabilityZones?: CapabilityZone[];
  capabilitiesCount: number;
  toolsCount: number;
  metadata: {
    generatedAt: string;
    version: string;
  };
}
