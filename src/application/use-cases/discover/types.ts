/**
 * Discover Use Case Types
 *
 * Types for tool and capability discovery use cases.
 *
 * @module application/use-cases/discover/types
 */

import type { Scope } from "../../../capabilities/types/fqdn.ts";

// Re-export Scope for convenience
export type { Scope };

/**
 * Common discover request fields
 */
export interface DiscoverRequest {
  intent: string;
  limit?: number;
  minScore?: number;
  includeRelated?: boolean;
  correlationId?: string;
}

// ============================================================================
// Extended Discover Types (Tech-Spec: MCP Tools Consolidation)
// ============================================================================

/**
 * Request for listing capabilities by pattern
 */
export interface ListCapabilitiesRequest {
  /** Glob pattern for filtering (e.g., 'auth:*', 'fs:read_*') */
  pattern: string;
  /** User scope for multi-tenant filtering */
  scope: Scope;
  /** Maximum results (default: 50, max: 500) */
  limit?: number;
  /** Pagination offset */
  offset?: number;
}

/**
 * Single capability in list response
 */
export interface ListCapabilityItem {
  id: string;
  fqdn: string;
  name: string;
  description: string | null;
  namespace: string;
  action: string;
  usageCount: number;
  successRate: number;
}

/**
 * Response from list capabilities
 */
export interface ListCapabilitiesResult {
  items: ListCapabilityItem[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Request for looking up a capability or tool by exact name
 */
export interface LookupRequest {
  /** Exact name to look up (namespace:action or server:tool) */
  name: string;
  /** User scope for multi-tenant filtering */
  scope: Scope;
}

/**
 * Unified lookup result (for both capabilities and tools)
 */
export interface LookupResult {
  /** Result type */
  type: "capability" | "tool";
  /** Unique identifier (UUID for capabilities, tool_id for tools) */
  id: string;
  /** Display name (namespace:action or tool name) */
  name: string;
  /** Description */
  description: string | null;
  /** For capabilities: namespace */
  namespace?: string;
  /** For capabilities: action */
  action?: string;
  /** For capabilities: FQDN */
  fqdn?: string;
  /** For capabilities: usage count */
  usageCount?: number;
  /** For capabilities: success rate */
  successRate?: number;
  /** For capabilities: tools used */
  toolsUsed?: string[] | null;
  /** For tools: MCP server ID */
  serverId?: string;
  /** For tools: input schema */
  inputSchema?: Record<string, unknown>;
}

/**
 * Request for getting detailed capability/tool metadata
 */
export interface GetDetailsRequest {
  /** UUID or FQDN to look up */
  id: string;
  /** User scope for multi-tenant filtering */
  scope: Scope;
  /** Fields to return (true = all, array = specific fields) */
  details?: boolean | string[];
}

/**
 * Full capability metadata (whois-style response)
 */
export interface CapabilityDetails {
  id: string;
  fqdn: string;
  displayName: string;
  org: string;
  project: string;
  namespace: string;
  action: string;
  hash: string;
  workflowPatternId: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string | null;
  version: number;
  versionTag: string | null;
  verified: boolean;
  signature: string | null;
  usageCount: number;
  successCount: number;
  tags: string[];
  visibility: "private" | "project" | "org" | "public";
  routing: "client" | "server" | "local" | "cloud";
  description?: string | null;
  parametersSchema?: Record<string, unknown> | null;
  toolsUsed?: string[] | null;
}

/**
 * Full tool metadata (whois-style response)
 */
export interface ToolDetails {
  id: string;
  name: string;
  description: string | null;
  serverId: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Unified details result
 */
export interface GetDetailsResult {
  type: "capability" | "tool";
  data: CapabilityDetails | ToolDetails;
}

/**
 * Tool discovery result item
 */
export interface DiscoveredTool {
  type: "tool";
  record_type: "mcp-tool";
  id: string;
  name: string;
  description: string;
  score: number;
  server_id?: string;
  input_schema?: Record<string, unknown>;
  related_tools?: Array<{
    tool_id: string;
    relation: string;
    score: number;
  }>;
}

/**
 * Capability discovery result item
 */
export interface DiscoveredCapability {
  type: "capability";
  record_type: "capability";
  id: string;
  name: string;
  description: string;
  score: number;
  code_snippet?: string;
  success_rate?: number;
  usage_count?: number;
  semantic_score?: number;
  call_name?: string;
  input_schema?: Record<string, unknown>;
  called_capabilities?: Array<{
    id: string;
    call_name?: string;
    input_schema?: Record<string, unknown>;
  }>;
}

/**
 * Discover tools result
 */
export interface DiscoverToolsResult {
  tools: DiscoveredTool[];
  totalFound: number;
}

/**
 * Discover capabilities result
 */
export interface DiscoverCapabilitiesResult {
  capabilities: DiscoveredCapability[];
  totalFound: number;
}
