/**
 * MCP Catalog Types
 *
 * Cloud-only: types for the public registry catalog display.
 * Aligned with pml_registry VIEW schema (Story 13.8).
 *
 * @module cloud/ui/catalog/types
 */

import type { PmlRegistryRecordType } from "../../../capabilities/types/fqdn.ts";

/**
 * Catalog entry from pml_registry VIEW
 *
 * Displays both MCP tools and learned capabilities in a unified catalog.
 * Uses record_type to distinguish between them.
 */
export interface CatalogEntry {
  /** Record type: 'mcp-tool' or 'capability' */
  recordType: PmlRegistryRecordType;
  /** Unique identifier (tool_id or capability UUID) */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string | null;
  /** Execution routing: 'local' or 'cloud' */
  routing: "local" | "cloud";
  /** MCP server ID (for mcp-tool only) */
  serverId: string | null;
  /** Namespace (for capability only) */
  namespace: string | null;
  /** Action (for capability only) */
  action: string | null;
}

/**
 * Catalog filter state
 */
export interface CatalogFilters {
  search: string;
  recordTypes: PmlRegistryRecordType[];
}

/**
 * Record type display info
 */
export const RECORD_TYPE_INFO: Record<PmlRegistryRecordType, { label: string; color: string; description: string }> = {
  "mcp-tool": {
    label: "MCP Tool",
    color: "#FFB86F",
    description: "Tools from MCP servers",
  },
  capability: {
    label: "Capability",
    color: "#4ade80",
    description: "Learned capabilities from workflows",
  },
};

// Legacy exports for backward compatibility during migration
/** @deprecated Use CatalogEntry instead */
export type MCPCatalogEntry = CatalogEntry;
/** @deprecated Use PmlRegistryRecordType instead */
export type MCPServerType = PmlRegistryRecordType;
/** @deprecated Use RECORD_TYPE_INFO instead */
export const TYPE_INFO = RECORD_TYPE_INFO;
