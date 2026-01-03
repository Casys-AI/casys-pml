/**
 * MCPCatalogIsland - Island wrapper for the MCP Catalog
 *
 * Cloud-only: wraps the CatalogIsland component for Fresh island hydration.
 *
 * @module web/islands/MCPCatalogIsland
 */

import CatalogIsland from "../../cloud/ui/catalog/CatalogIsland.tsx";
import type { MCPCatalogEntry } from "../../cloud/ui/catalog/types.ts";

interface MCPCatalogIslandProps {
  entries: MCPCatalogEntry[];
}

export default function MCPCatalogIsland({ entries }: MCPCatalogIslandProps) {
  return <CatalogIsland entries={entries} />;
}
