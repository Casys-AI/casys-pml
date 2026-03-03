/**
 * Tests for FQDN Tool ID Normalization Fix
 *
 * Bug: tool IDs from dag_structure/task_results may be in FQDN format (e.g. "pml.mcp.std.psql_query.db48")
 * but tool_embedding.tool_id uses short format ("std:psql_query").
 * createSHGATFromCapabilities registered tools with FQDN IDs that didn't match
 * any real embedding, causing random embeddings (generateDefaultToolEmbedding) to be used.
 *
 * Fix: normalizeToolId() applied on toolsUsed wherever tool IDs are read (task_results or dag_structure).
 *
 * @module tests/unit/capabilities/normalize-tool-id-fqdn
 */

import { assertEquals } from "@std/assert";
import { normalizeToolId } from "../../../src/capabilities/routing-resolver.ts";

// =============================================================================
// normalizeToolId: FQDN 5-part format (org.project.namespace.action.hash)
// =============================================================================

Deno.test("normalizeToolId: FQDN 5-part format → namespace:action", () => {
  // This is the core of the bug: task_results and dag_structure store these FQDNs
  assertEquals(normalizeToolId("pml.mcp.std.psql_query.db48"), "std:psql_query");
  assertEquals(normalizeToolId("pml.mcp.std.pglite_query.3cd9"), "std:pglite_query");
  assertEquals(normalizeToolId("pml.mcp.filesystem.read_file.a1b2"), "filesystem:read_file");
  assertEquals(normalizeToolId("pml.mcp.memory.create_entities.f00d"), "memory:create_entities");
});

Deno.test("normalizeToolId: FQDN 4-part format → namespace:action", () => {
  // Some FQDNs don't have a hash suffix
  assertEquals(normalizeToolId("local.default.startup.fullProfile"), "startup:fullProfile");
  assertEquals(normalizeToolId("alice.default.meta.myFunc"), "meta:myFunc");
  assertEquals(normalizeToolId("org.project.server.action"), "server:action");
});

Deno.test("normalizeToolId: FQDN with various hash lengths", () => {
  assertEquals(normalizeToolId("pml.mcp.std.fetch_url.ab"), "std:fetch_url");
  assertEquals(normalizeToolId("pml.mcp.std.fetch_url.abcdef1234"), "std:fetch_url");
});

// =============================================================================
// normalizeToolId: mcp.server.action format (JavaScript dot notation)
// =============================================================================

Deno.test("normalizeToolId: mcp.server.action → server:action", () => {
  assertEquals(normalizeToolId("mcp.std.fetch_url"), "std:fetch_url");
  assertEquals(normalizeToolId("mcp.filesystem.read_file"), "filesystem:read_file");
  assertEquals(normalizeToolId("mcp.memory.create_entities"), "memory:create_entities");
});

Deno.test("normalizeToolId: mcp.server only → server", () => {
  assertEquals(normalizeToolId("mcp.filesystem"), "filesystem");
});

// =============================================================================
// normalizeToolId: mcp__server__action format (internal)
// =============================================================================

Deno.test("normalizeToolId: mcp__server__action → server:action", () => {
  assertEquals(normalizeToolId("mcp__std__fetch_url"), "std:fetch_url");
  assertEquals(normalizeToolId("mcp__code__analyze"), "code:analyze");
  assertEquals(normalizeToolId("mcp__filesystem__read_file"), "filesystem:read_file");
});

// =============================================================================
// normalizeToolId: already canonical format
// =============================================================================

Deno.test("normalizeToolId: canonical format unchanged", () => {
  assertEquals(normalizeToolId("std:psql_query"), "std:psql_query");
  assertEquals(normalizeToolId("filesystem:read_file"), "filesystem:read_file");
  assertEquals(normalizeToolId("fetch:fetch"), "fetch:fetch");
  assertEquals(normalizeToolId("code:filter"), "code:filter");
});

Deno.test("normalizeToolId: bare server name unchanged", () => {
  assertEquals(normalizeToolId("memory"), "memory");
  assertEquals(normalizeToolId("filesystem"), "filesystem");
});

// =============================================================================
// normalizeToolId: edge cases
// =============================================================================

Deno.test("normalizeToolId: empty/null/undefined → empty string", () => {
  assertEquals(normalizeToolId(""), "");
  // @ts-ignore: testing runtime safety
  assertEquals(normalizeToolId(null), "");
  // @ts-ignore: testing runtime safety
  assertEquals(normalizeToolId(undefined), "");
});

Deno.test("normalizeToolId: single dot not treated as FQDN (< 4 parts)", () => {
  // 2 parts: not FQDN (< 4), not mcp.* prefix → unchanged
  assertEquals(normalizeToolId("server.action"), "server.action");
  // 3 parts, not mcp prefix: still < 4 parts → unchanged
  assertEquals(normalizeToolId("a.b.c"), "a.b.c");
});

Deno.test("normalizeToolId: 3-part with mcp prefix is mcp.server.action format", () => {
  // mcp.server.action → server:action (3 parts starting with mcp.)
  assertEquals(normalizeToolId("mcp.std.query"), "std:query");
});

// =============================================================================
// normalizeToolId applied to toolsUsed arrays (simulates parseCapabilities)
// =============================================================================

Deno.test("normalizeToolId on toolsUsed array: all FQDN → all short format", () => {
  const toolsUsed = [
    "pml.mcp.std.psql_query.db48",
    "pml.mcp.filesystem.read_file.a1b2",
    "pml.mcp.memory.create_entities.f00d",
  ];

  const normalized = toolsUsed.map(normalizeToolId).filter(Boolean);

  assertEquals(normalized, [
    "std:psql_query",
    "filesystem:read_file",
    "memory:create_entities",
  ]);
});

Deno.test("normalizeToolId on toolsUsed array: mixed formats → all short format", () => {
  const toolsUsed = [
    "pml.mcp.std.psql_query.db48",  // FQDN
    "filesystem:read_file",          // Already canonical
    "mcp.memory.create_entities",    // JS dot notation
    "mcp__code__analyze",            // Internal format
  ];

  const normalized = toolsUsed.map(normalizeToolId).filter(Boolean);

  assertEquals(normalized, [
    "std:psql_query",
    "filesystem:read_file",
    "memory:create_entities",
    "code:analyze",
  ]);
});

Deno.test("normalizeToolId on toolsUsed array: empty array → empty array", () => {
  const toolsUsed: string[] = [];
  const normalized = toolsUsed.map(normalizeToolId).filter(Boolean);
  assertEquals(normalized, []);
});

Deno.test("normalizeToolId on toolsUsed array: with empty strings filtered out", () => {
  // Simulates the .filter(Boolean) pattern used in parseCapabilities
  const toolsUsed = ["pml.mcp.std.psql_query.db48", "", "filesystem:read_file"];
  const normalized = toolsUsed.map(normalizeToolId).filter(Boolean);
  assertEquals(normalized, ["std:psql_query", "filesystem:read_file"]);
});

// =============================================================================
// Consistency: normalizeToolId output matches tool_embedding.tool_id format
// =============================================================================

Deno.test("normalizeToolId: output matches tool_embedding format for SHGAT lookup", () => {
  // The core requirement: normalized toolsUsed must match tool_embedding.tool_id
  // so createSHGATFromCapabilities can find the real embedding in the Map
  const dagToolsUsed = [
    "pml.mcp.std.psql_query.db48",
    "pml.mcp.std.pglite_query.3cd9",
    "pml.mcp.filesystem.read_file.a1b2",
  ];

  // tool_embedding.tool_id format (what's in the DB)
  const toolEmbeddingIds = [
    "std:psql_query",
    "std:pglite_query",
    "filesystem:read_file",
  ];

  const normalized = dagToolsUsed.map(normalizeToolId);
  assertEquals(normalized, toolEmbeddingIds);
});

Deno.test("normalizeToolId: idempotent (applying twice gives same result)", () => {
  const fqdn = "pml.mcp.std.psql_query.db48";
  const once = normalizeToolId(fqdn);
  const twice = normalizeToolId(once);
  assertEquals(once, twice);
  assertEquals(once, "std:psql_query");
});
