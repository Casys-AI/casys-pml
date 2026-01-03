/**
 * Tests for PML Routing Resolver
 *
 * @module tests/routing_test
 */

import { assertEquals } from "@std/assert";
import {
  extractNamespace,
  getCloudServers,
  isCloudTool,
  isLocalTool,
  resolveToolRouting,
} from "../src/routing/resolver.ts";

// ============================================================================
// extractNamespace Tests
// ============================================================================

Deno.test("extractNamespace - standard format (namespace:tool)", () => {
  assertEquals(extractNamespace("filesystem:read_file"), "filesystem");
  assertEquals(extractNamespace("tavily:search"), "tavily");
  assertEquals(extractNamespace("json:parse"), "json");
});

Deno.test("extractNamespace - MCP SDK format (mcp__server__tool)", () => {
  assertEquals(extractNamespace("mcp__tavily__search"), "tavily");
  assertEquals(extractNamespace("mcp__filesystem__read"), "filesystem");
  assertEquals(extractNamespace("mcp__github__get_pr"), "github");
});

Deno.test("extractNamespace - no namespace (tool only)", () => {
  assertEquals(extractNamespace("json_parse"), "json_parse");
  assertEquals(extractNamespace("search"), "search");
});

Deno.test("extractNamespace - empty string", () => {
  assertEquals(extractNamespace(""), "");
});

Deno.test("extractNamespace - tool with multiple colons", () => {
  assertEquals(extractNamespace("namespace:sub:tool"), "namespace");
});

// ============================================================================
// resolveToolRouting Tests (AC3)
// ============================================================================

Deno.test("resolveToolRouting - local tools → 'local'", () => {
  // Filesystem, shell, etc. are LOCAL
  assertEquals(resolveToolRouting("filesystem:read_file"), "local");
  assertEquals(resolveToolRouting("shell:exec"), "local");
  assertEquals(resolveToolRouting("process:spawn"), "local");
});

Deno.test("resolveToolRouting - cloud tools → 'cloud'", () => {
  // API services route to cloud
  assertEquals(resolveToolRouting("tavily:search"), "cloud");
  assertEquals(resolveToolRouting("github:get_pr"), "cloud");
  assertEquals(resolveToolRouting("slack:post_message"), "cloud");
  assertEquals(resolveToolRouting("memory:save"), "cloud");
});

Deno.test("resolveToolRouting - utility tools → 'cloud'", () => {
  // Pure utility tools route to cloud
  assertEquals(resolveToolRouting("json:parse"), "cloud");
  assertEquals(resolveToolRouting("math:add"), "cloud");
  assertEquals(resolveToolRouting("datetime:now"), "cloud");
  assertEquals(resolveToolRouting("crypto:hash"), "cloud");
});

Deno.test("resolveToolRouting - AI services → 'cloud'", () => {
  // AI/thinking services route to cloud
  assertEquals(resolveToolRouting("sequential-thinking:think"), "cloud");
  assertEquals(resolveToolRouting("context7:retrieve"), "cloud");
  assertEquals(resolveToolRouting("magic:generate"), "cloud");
});

Deno.test("resolveToolRouting - unknown tool → 'local' (safe default)", () => {
  // Unknown = local for security
  assertEquals(resolveToolRouting("unknown:tool"), "local");
  assertEquals(resolveToolRouting("custom_server:action"), "local");
  assertEquals(resolveToolRouting("my_app:do_thing"), "local");
});

Deno.test("resolveToolRouting - MCP SDK format routes correctly", () => {
  // MCP SDK format should extract namespace and route correctly
  assertEquals(resolveToolRouting("mcp__tavily__search"), "cloud");
  assertEquals(resolveToolRouting("mcp__filesystem__read"), "local");
  assertEquals(resolveToolRouting("mcp__github__pr"), "cloud");
});

Deno.test("resolveToolRouting - pml namespace → 'cloud'", () => {
  // PML meta-tools route to cloud
  assertEquals(resolveToolRouting("pml:discover"), "cloud");
  assertEquals(resolveToolRouting("pml:execute"), "cloud");
});

// ============================================================================
// isLocalTool / isCloudTool Tests
// ============================================================================

Deno.test("isLocalTool - returns true for local tools", () => {
  assertEquals(isLocalTool("filesystem:read"), true);
  assertEquals(isLocalTool("shell:exec"), true);
  assertEquals(isLocalTool("unknown:tool"), true);
});

Deno.test("isLocalTool - returns false for cloud tools", () => {
  assertEquals(isLocalTool("tavily:search"), false);
  assertEquals(isLocalTool("json:parse"), false);
});

Deno.test("isCloudTool - returns true for cloud tools", () => {
  assertEquals(isCloudTool("tavily:search"), true);
  assertEquals(isCloudTool("github:get_pr"), true);
  assertEquals(isCloudTool("math:add"), true);
});

Deno.test("isCloudTool - returns false for local tools", () => {
  assertEquals(isCloudTool("filesystem:read"), false);
  assertEquals(isCloudTool("shell:exec"), false);
});

// ============================================================================
// getCloudServers Tests
// ============================================================================

Deno.test("getCloudServers - returns array of namespaces", () => {
  const servers = getCloudServers();
  assertEquals(Array.isArray(servers), true);
  assertEquals(servers.includes("tavily"), true);
  assertEquals(servers.includes("github"), true);
  assertEquals(servers.includes("json"), true);
  assertEquals(servers.includes("pml"), true);
});

Deno.test("getCloudServers - does not include local namespaces", () => {
  const servers = getCloudServers();
  assertEquals(servers.includes("filesystem"), false);
  assertEquals(servers.includes("shell"), false);
});

// ============================================================================
// Edge Cases
// ============================================================================

Deno.test("resolveToolRouting - handles edge case namespaces", () => {
  // Empty or malformed
  assertEquals(resolveToolRouting(""), "local");
  assertEquals(resolveToolRouting(":tool"), "local"); // Empty namespace = local

  // Partial matches shouldn't work
  assertEquals(resolveToolRouting("tavil:search"), "local"); // typo
  assertEquals(resolveToolRouting("jsons:parse"), "local"); // wrong namespace
});

Deno.test("resolveToolRouting - all known cloud servers route correctly", () => {
  // Comprehensive check against mcp-routing.json
  const expectedCloud = [
    "memory",
    "tavily",
    "brave_search",
    "exa",
    "github",
    "slack",
    "api",
    "http",
    "fetch",
    "sequential-thinking",
    "context7",
    "magic",
    "json",
    "math",
    "datetime",
    "crypto",
    "collections",
    "validation",
    "format",
    "transform",
    "algo",
    "string",
    "color",
    "geo",
    "resilience",
    "schema",
    "diff",
    "state",
    "plots",
    "pml",
  ];

  for (const server of expectedCloud) {
    assertEquals(
      resolveToolRouting(`${server}:any_tool`),
      "cloud",
      `Expected ${server} to route to cloud`,
    );
  }
});
