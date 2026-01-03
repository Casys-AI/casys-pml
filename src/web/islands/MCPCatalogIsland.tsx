/**
 * MCPCatalogIsland - Island wrapper for the Registry Catalog
 *
 * Cloud-only: wraps the CatalogIsland component for Fresh island hydration.
 *
 * @module web/islands/MCPCatalogIsland
 */

import CatalogIsland from "../../cloud/ui/catalog/CatalogIsland.tsx";
import type { CatalogEntry } from "../../cloud/ui/catalog/types.ts";

interface MCPCatalogIslandProps {
  entries: CatalogEntry[];
}

export default function MCPCatalogIsland({ entries }: MCPCatalogIslandProps) {
  return <CatalogIsland entries={entries} />;
}
