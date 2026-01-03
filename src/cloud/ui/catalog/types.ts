/**
 * MCP Catalog Types
 *
 * Cloud-only: types for the public MCP catalog display.
 *
 * @module cloud/ui/catalog/types
 */

/**
 * MCP Server type for transport/installation method
 */
export type MCPServerType = "deno" | "stdio" | "cloud";

/**
 * MCP Server entry for catalog display
 *
 * Currently available fields:
 * - fqdn, name, description, type, icon
 *
 * Future additions (when metadata is available):
 * - toolCount, category, tags, docsUrl, requiresApiKey
 */
export interface MCPCatalogEntry {
  /** Fully qualified domain name (e.g., "std:json", "github:*") */
  fqdn: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Server type (transport method) */
  type: MCPServerType;
  /** Icon URL or emoji (optional) */
  icon?: string;

  // === Future metadata (not yet available) ===

  /** Number of tools provided (optional, computed from registry) */
  toolCount?: number;
  /** Whether BYOK (Bring Your Own Key) is required */
  requiresApiKey?: boolean;
  /** Whether this is a PML built-in */
  isBuiltin?: boolean;
  /** Tags for additional filtering */
  tags?: string[];
  /** Documentation URL */
  docsUrl?: string;
}

/**
 * Catalog filter state
 */
export interface CatalogFilters {
  search: string;
  types: MCPServerType[];
  showBuiltinOnly: boolean;
}

/**
 * Server type display info
 */
export const TYPE_INFO: Record<MCPServerType, { label: string; color: string; description: string }> = {
  deno: {
    label: "Deno",
    color: "#FFB86F",
    description: "Native Deno module, instant import",
  },
  stdio: {
    label: "Stdio",
    color: "#4ade80",
    description: "Local subprocess (npm/docker)",
  },
  cloud: {
    label: "Cloud",
    color: "#60a5fa",
    description: "Remote API via PML proxy",
  },
};
