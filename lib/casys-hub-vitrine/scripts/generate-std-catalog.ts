#!/usr/bin/env -S deno run -A
/**
 * Generate static catalog JSON from @casys/mcp-std tools.
 *
 * Usage: deno run -A scripts/generate-std-catalog.ts
 * Output: src/data/mcp-std-catalog.json
 */

import { allTools } from "../../std/mod.ts";

interface CatalogEntry {
  recordType: "mcp-tool";
  id: string;
  name: string;
  description: string | null;
  routing: "local";
  serverId: "std";
  namespace: null;
  action: null;
  hasUi?: boolean;
}

const entries: CatalogEntry[] = allTools.map((tool) => ({
  recordType: "mcp-tool" as const,
  id: tool.name,
  name: tool.name,
  description: tool.description ?? null,
  routing: "local" as const,
  serverId: "std" as const,
  namespace: null,
  action: null,
  ...(tool._meta?.ui ? { hasUi: true } : {}),
}));

const outPath = new URL("../src/data/mcp-std-catalog.json", import.meta.url);
await Deno.mkdir(new URL("../src/data/", import.meta.url), { recursive: true });
await Deno.writeTextFile(outPath, JSON.stringify(entries, null, 2));

console.log(`Generated ${entries.length} entries → src/data/mcp-std-catalog.json`);
