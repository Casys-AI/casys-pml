/**
 * Tests for Algorithm Initializer FQDN Fix
 *
 * Validates:
 * - filterContextTools: removes UUIDs, code:*, loop:* from executed_path
 * - parseCapabilities: normalizes FQDN toolsUsed to short format
 *
 * @module tests/unit/graphrag/algorithm-init-fqdn
 */

import { assertEquals } from "@std/assert";
import { filterContextTools } from "../../../src/mcp/algorithm-init/initializer.ts";

// =============================================================================
// filterContextTools
// =============================================================================

Deno.test("filterContextTools: removes UUID entries", () => {
  const path = [
    "std:psql_query",
    "0a01917e-1234-4567-8901-abcdef123456",
    "filesystem:read_file",
    "deadbeef-cafe-babe-dead-beefcafebabe",
  ];

  const filtered = filterContextTools(path);
  assertEquals(filtered, ["std:psql_query", "filesystem:read_file"]);
});

Deno.test("filterContextTools: removes code:* entries", () => {
  const path = [
    "std:psql_query",
    "code:filter",
    "code:map",
    "code:split",
    "filesystem:read_file",
  ];

  const filtered = filterContextTools(path);
  assertEquals(filtered, ["std:psql_query", "filesystem:read_file"]);
});

Deno.test("filterContextTools: removes loop:* entries", () => {
  const path = [
    "std:psql_query",
    "loop:forOf",
    "loop:forEach",
    "filesystem:read_file",
  ];

  const filtered = filterContextTools(path);
  assertEquals(filtered, ["std:psql_query", "filesystem:read_file"]);
});

Deno.test("filterContextTools: removes mixed UUID, code:*, loop:*", () => {
  const path = [
    "0a01917e-1234-4567-8901-abcdef123456",
    "code:filter",
    "loop:forOf",
    "std:psql_query",
    "memory:create_entities",
  ];

  const filtered = filterContextTools(path);
  assertEquals(filtered, ["std:psql_query", "memory:create_entities"]);
});

Deno.test("filterContextTools: empty array → empty array", () => {
  assertEquals(filterContextTools([]), []);
});

Deno.test("filterContextTools: null/undefined → empty array", () => {
  assertEquals(filterContextTools(null), []);
  assertEquals(filterContextTools(undefined), []);
});

Deno.test("filterContextTools: all entries filtered → empty array", () => {
  const path = [
    "0a01917e-1234-4567-8901-abcdef123456",
    "code:filter",
    "loop:forOf",
  ];

  assertEquals(filterContextTools(path), []);
});

Deno.test("filterContextTools: keeps valid tool IDs in all formats", () => {
  const path = [
    "std:psql_query",          // canonical
    "filesystem:read_file",    // canonical
    "fetch:fetch",             // canonical
    "memory",                  // bare server name
  ];

  const filtered = filterContextTools(path);
  assertEquals(filtered, path);
});

Deno.test("filterContextTools: UUID-v7 also filtered (not just v4)", () => {
  // UUIDv7 has a different version byte but same format
  const path = [
    "01917e0a-1234-7567-8901-abcdef123456", // UUIDv7 (starts with 0, version 7)
    "std:psql_query",
  ];

  const filtered = filterContextTools(path);
  assertEquals(filtered, ["std:psql_query"]);
});

Deno.test("filterContextTools: uppercase UUID also filtered", () => {
  const path = [
    "0A01917E-1234-4567-8901-ABCDEF123456",
    "std:psql_query",
  ];

  const filtered = filterContextTools(path);
  assertEquals(filtered, ["std:psql_query"]);
});
