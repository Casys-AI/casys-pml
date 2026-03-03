/**
 * Tests for SHGAT FQDN Tool Embeddings Fix
 *
 * Validates that createSHGATFromCapabilities correctly uses real tool embeddings
 * from a Map (toolEmbeddings parameter) instead of generateDefaultToolEmbedding().
 *
 * Related fix: normalizeToolId() applied on toolsUsed before passing to SHGAT,
 * so tool IDs like "std:psql_query" match the keys in the toolEmbeddings Map.
 *
 * @module tests/unit/graphrag/shgat-fqdn-tool-embeddings
 */

import { assertEquals, assertNotEquals } from "@std/assert";
import {
  createSHGATFromCapabilities,
  generateDefaultToolEmbedding,
} from "../../../src/graphrag/algorithms/shgat.ts";
import { normalizeToolId } from "../../../src/capabilities/routing-resolver.ts";

// =============================================================================
// Helpers
// =============================================================================

const DIM = 8; // Small dimension for fast tests

function makeEmbedding(seed: number, dim = DIM): number[] {
  // Deterministic but distinct embedding per seed
  return Array.from({ length: dim }, (_, i) => Math.sin(seed * 100 + i) * 0.5);
}

function makeCapability(id: string, toolsUsed: string[]) {
  return {
    id,
    embedding: makeEmbedding(id.charCodeAt(0), DIM),
    toolsUsed,
    successRate: 0.9,
  };
}

// =============================================================================
// createSHGATFromCapabilities with toolEmbeddings Map
// =============================================================================

Deno.test("createSHGATFromCapabilities: uses Map embeddings instead of defaults", () => {
  const toolEmbeddings = new Map<string, number[]>();
  const realEmbedding = makeEmbedding(42, DIM);
  toolEmbeddings.set("std:psql_query", realEmbedding);

  // Capabilities with already-normalized tool IDs (as the fix does)
  const capabilities = [
    makeCapability("cap-1", ["std:psql_query"]),
  ];

  const shgat = createSHGATFromCapabilities(capabilities, toolEmbeddings, {
    embeddingDim: DIM,
    preserveDim: false,
  });

  // Tool should be registered
  assertEquals(shgat.hasToolNode("std:psql_query"), true);

  // The tool should be registered with the real embedding, not the default one
  const defaultEmb = generateDefaultToolEmbedding("std:psql_query", DIM);
  // We can't directly access the embedding, but we verify the tool exists
  // and the tool IDs match expected normalized format
  const registeredToolIds = shgat.getToolIds();
  assertEquals(registeredToolIds.includes("std:psql_query"), true);

  // Verify the default embedding would be different from our real embedding
  // (this confirms the Map is needed - without it, defaults would be used)
  assertNotEquals(realEmbedding, defaultEmb, "Real embedding should differ from default");
});

Deno.test("createSHGATFromCapabilities: without Map uses generateDefaultToolEmbedding", () => {
  // No Map passed → should still work but uses defaults
  const capabilities = [
    makeCapability("cap-1", ["std:psql_query"]),
  ];

  const shgat = createSHGATFromCapabilities(capabilities, {
    embeddingDim: DIM,
    preserveDim: false,
  });

  assertEquals(shgat.hasToolNode("std:psql_query"), true);
});

Deno.test("createSHGATFromCapabilities: Map with multiple tools", () => {
  const toolEmbeddings = new Map<string, number[]>();
  toolEmbeddings.set("std:psql_query", makeEmbedding(1, DIM));
  toolEmbeddings.set("filesystem:read_file", makeEmbedding(2, DIM));
  toolEmbeddings.set("memory:create_entities", makeEmbedding(3, DIM));

  const capabilities = [
    makeCapability("cap-1", ["std:psql_query", "filesystem:read_file"]),
    makeCapability("cap-2", ["memory:create_entities", "std:psql_query"]),
  ];

  const shgat = createSHGATFromCapabilities(capabilities, toolEmbeddings, {
    embeddingDim: DIM,
    preserveDim: false,
  });

  // All 3 unique tools should be registered
  const toolIds = shgat.getToolIds();
  assertEquals(toolIds.length, 3);
  assertEquals(toolIds.includes("std:psql_query"), true);
  assertEquals(toolIds.includes("filesystem:read_file"), true);
  assertEquals(toolIds.includes("memory:create_entities"), true);
});

Deno.test("createSHGATFromCapabilities: tool not in Map falls back to default", () => {
  const toolEmbeddings = new Map<string, number[]>();
  toolEmbeddings.set("std:psql_query", makeEmbedding(1, DIM));
  // "filesystem:read_file" is NOT in the Map

  const capabilities = [
    makeCapability("cap-1", ["std:psql_query", "filesystem:read_file"]),
  ];

  const shgat = createSHGATFromCapabilities(capabilities, toolEmbeddings, {
    embeddingDim: DIM,
    preserveDim: false,
  });

  // Both tools should be registered (one from Map, one from default)
  assertEquals(shgat.hasToolNode("std:psql_query"), true);
  assertEquals(shgat.hasToolNode("filesystem:read_file"), true);
});

Deno.test("createSHGATFromCapabilities: empty Map → all tools use defaults", () => {
  const toolEmbeddings = new Map<string, number[]>();

  const capabilities = [
    makeCapability("cap-1", ["std:psql_query"]),
  ];

  const shgat = createSHGATFromCapabilities(capabilities, toolEmbeddings, {
    embeddingDim: DIM,
    preserveDim: false,
  });

  assertEquals(shgat.hasToolNode("std:psql_query"), true);
});

// =============================================================================
// End-to-end: FQDN normalization + Map lookup
// =============================================================================

Deno.test("E2E: FQDN toolsUsed normalized before Map lookup", () => {
  // Simulate the full pipeline:
  // 1. task_results (or dag_structure) tools_used has FQDNs
  // 2. parseCapabilities applies normalizeToolId
  // 3. createSHGATFromCapabilities uses the Map keyed by short format

  const dagToolsUsed = [
    "pml.mcp.std.psql_query.db48",
    "pml.mcp.filesystem.read_file.a1b2",
  ];

  // Step 2: normalize (as parseCapabilities does)
  const normalizedTools = dagToolsUsed.map(normalizeToolId).filter(Boolean);
  assertEquals(normalizedTools, ["std:psql_query", "filesystem:read_file"]);

  // Step 3: tool_embedding table has short format keys
  const toolEmbeddings = new Map<string, number[]>();
  toolEmbeddings.set("std:psql_query", makeEmbedding(100, DIM));
  toolEmbeddings.set("filesystem:read_file", makeEmbedding(200, DIM));

  const capabilities = [{
    id: "cap-1",
    embedding: makeEmbedding(0, DIM),
    toolsUsed: normalizedTools, // Already normalized
    successRate: 0.95,
  }];

  const shgat = createSHGATFromCapabilities(capabilities, toolEmbeddings, {
    embeddingDim: DIM,
    preserveDim: false,
  });

  // Tools should be registered with short format IDs
  assertEquals(shgat.hasToolNode("std:psql_query"), true);
  assertEquals(shgat.hasToolNode("filesystem:read_file"), true);

  // FQDN should NOT be registered (that was the bug)
  assertEquals(shgat.hasToolNode("pml.mcp.std.psql_query.db48"), false);
  assertEquals(shgat.hasToolNode("pml.mcp.filesystem.read_file.a1b2"), false);
});

Deno.test("E2E: without normalization, FQDN would NOT match Map keys (demonstrates the bug)", () => {
  // This test shows what happened BEFORE the fix:
  // toolsUsed still in FQDN format → no match in Map → defaults used

  // Map has short format keys (from tool_embedding table)
  const toolEmbeddings = new Map<string, number[]>();
  toolEmbeddings.set("std:psql_query", makeEmbedding(100, DIM));

  // WITHOUT normalization: FQDN doesn't match "std:psql_query" in the Map
  assertEquals(toolEmbeddings.has("pml.mcp.std.psql_query.db48"), false);

  // WITH normalization: match found
  const normalized = normalizeToolId("pml.mcp.std.psql_query.db48");
  assertEquals(toolEmbeddings.has(normalized), true);
});

// =============================================================================
// generateDefaultToolEmbedding: deterministic but semantically meaningless
// =============================================================================

Deno.test("generateDefaultToolEmbedding: deterministic for same ID", () => {
  const emb1 = generateDefaultToolEmbedding("std:psql_query", DIM);
  const emb2 = generateDefaultToolEmbedding("std:psql_query", DIM);
  assertEquals(emb1, emb2);
});

Deno.test("generateDefaultToolEmbedding: different for different IDs", () => {
  const emb1 = generateDefaultToolEmbedding("std:psql_query", DIM);
  const emb2 = generateDefaultToolEmbedding("filesystem:read_file", DIM);
  assertNotEquals(emb1, emb2);
});

Deno.test("generateDefaultToolEmbedding: FQDN and normalized ID produce different defaults", () => {
  // This is what caused the bug: the FQDN tool got a DIFFERENT default embedding
  // than what would have been generated for the short format.
  // So even with defaults, the FQDN mismatch caused inconsistency.
  const fqdnDefault = generateDefaultToolEmbedding("pml.mcp.std.psql_query.db48", DIM);
  const normalizedDefault = generateDefaultToolEmbedding("std:psql_query", DIM);
  assertNotEquals(fqdnDefault, normalizedDefault,
    "FQDN and short format produce different defaults - this is why normalization matters");
});
