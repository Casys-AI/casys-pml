/**
 * Unit tests for graph-mappers.ts
 *
 * Tests UUID→name resolution for executedPath display (Issue 6 fix).
 *
 * @module tests/unit/api/graph_mappers_test
 */

import { assertEquals } from "@std/assert";
import { resolveExecutedPathForDisplay } from "../../../src/api/graph-mappers.ts";

// ============================================================================
// resolveExecutedPathForDisplay Tests (Issue 6 fix)
// ============================================================================

Deno.test("resolveExecutedPathForDisplay - returns undefined for undefined input", () => {
  const result = resolveExecutedPathForDisplay(undefined);
  assertEquals(result, undefined);
});

Deno.test("resolveExecutedPathForDisplay - passes tool names unchanged", () => {
  const executedPath = ["std:psql_query", "filesystem:read_file", "code:map"];

  const result = resolveExecutedPathForDisplay(executedPath);

  assertEquals(result, ["std:psql_query", "filesystem:read_file", "code:map"]);
});

Deno.test("resolveExecutedPathForDisplay - resolves UUIDs via capabilityNameMap", () => {
  const executedPath = [
    "std:psql_query",
    "9f597aff-1234-4abc-8def-567890abcdef", // UUID for capability
    "filesystem:read_file",
  ];

  const capabilityNameMap = new Map([
    ["9f597aff-1234-4abc-8def-567890abcdef", "meta:my_capability"],
  ]);

  const result = resolveExecutedPathForDisplay(executedPath, capabilityNameMap);

  assertEquals(result, [
    "std:psql_query",
    "meta:my_capability", // Resolved from UUID
    "filesystem:read_file",
  ]);
});

Deno.test("resolveExecutedPathForDisplay - falls back to short UUID when not in map", () => {
  const executedPath = [
    "std:psql_query",
    "abcd1234-5678-4abc-9def-fedcba987654", // Unknown UUID
  ];

  const capabilityNameMap = new Map<string, string>(); // Empty map

  const result = resolveExecutedPathForDisplay(executedPath, capabilityNameMap);

  assertEquals(result, [
    "std:psql_query",
    "cap:abcd1234", // Fallback to short UUID prefix
  ]);
});

Deno.test("resolveExecutedPathForDisplay - handles mixed tools and capabilities", () => {
  // Realistic executedPath after Issue 6 fix:
  // - Tools: namespace:action format
  // - Capabilities: UUID format
  const executedPath = [
    "std:crypto_uuid",                         // Tool
    "0a01917e-79d0-4580-8619-65f5de42ca11",   // Capability A
    "filesystem:read_file",                    // Tool
    "cc48a02a-bdd8-4af7-b1f1-b43d5207d39b",   // Capability B
    "std:json_parse",                          // Tool
  ];

  const capabilityNameMap = new Map([
    ["0a01917e-79d0-4580-8619-65f5de42ca11", "data:fetch_person"],
    ["cc48a02a-bdd8-4af7-b1f1-b43d5207d39b", "meta:process_data"],
  ]);

  const result = resolveExecutedPathForDisplay(executedPath, capabilityNameMap);

  assertEquals(result, [
    "std:crypto_uuid",
    "data:fetch_person",      // Resolved
    "filesystem:read_file",
    "meta:process_data",      // Resolved
    "std:json_parse",
  ]);
});

Deno.test("resolveExecutedPathForDisplay - empty path returns empty array", () => {
  const result = resolveExecutedPathForDisplay([]);
  assertEquals(result, []);
});

Deno.test("resolveExecutedPathForDisplay - works without capabilityNameMap", () => {
  const executedPath = [
    "std:psql_query",
    "9f597aff-1234-4abc-8def-567890abcdef",
  ];

  // No map provided - should fallback for UUID
  const result = resolveExecutedPathForDisplay(executedPath);

  assertEquals(result, [
    "std:psql_query",
    "cap:9f597aff", // Fallback
  ]);
});

// ============================================================================
// Regression test: Issue 6 - executedPath must handle UUID format
// ============================================================================

Deno.test("REGRESSION Issue 6: executedPath with UUIDs must be resolvable", () => {
  // This test prevents regression where executedPath contained capability NAMES
  // instead of UUIDs, causing flattenExecutedPath() key mismatch.
  //
  // After Issue 6 fix:
  // - executedPath contains UUIDs for capabilities
  // - capabilityNameMap resolves UUIDs to display names

  const executedPath = [
    "std:tool_a",
    "12345678-1234-4abc-8def-123456789abc", // Valid v4 UUID
    "std:tool_b",
  ];

  const capabilityNameMap = new Map([
    ["12345678-1234-4abc-8def-123456789abc", "test:my_cap"],
  ]);

  const result = resolveExecutedPathForDisplay(executedPath, capabilityNameMap);

  // Verify UUID was resolved (not passed through as-is)
  assertEquals(result?.[1], "test:my_cap");
  assertEquals(result?.[1]?.includes("-"), false, "UUID should be resolved, not passed through");
});

