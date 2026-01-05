/**
 * Tests for PML Routing Module
 *
 * @module tests/routing_test
 */

import { assertEquals, assertThrows } from "@std/assert";
import {
  DEFAULT_ROUTING_CONFIG,
  extractNamespace,
  getCloudServers,
  initializeRouting,
  isCloudTool,
  isLocalTool,
  isRoutingInitialized,
  resetRouting,
  resolveToolRouting,
} from "../src/routing/mod.ts";
import type { RoutingConfig } from "../src/types.ts";

// ============================================================================
// Setup/Teardown
// ============================================================================

function setupRouting(config?: RoutingConfig): void {
  resetRouting();
  initializeRouting(config ?? DEFAULT_ROUTING_CONFIG);
}

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
// initializeRouting / isRoutingInitialized Tests
// ============================================================================

Deno.test("isRoutingInitialized - returns false before init", () => {
  resetRouting();
  assertEquals(isRoutingInitialized(), false);
});

Deno.test("isRoutingInitialized - returns true after init", () => {
  setupRouting();
  assertEquals(isRoutingInitialized(), true);
});

// ============================================================================
// resolveToolRouting Tests
// ============================================================================

Deno.test("resolveToolRouting - throws if not initialized", () => {
  resetRouting();
  assertThrows(
    () => resolveToolRouting("filesystem:read"),
    Error,
    "Routing not initialized",
  );
});

Deno.test("resolveToolRouting - local tools → 'local'", () => {
  setupRouting();
  // Filesystem, shell, etc. are LOCAL (not in cloud list)
  assertEquals(resolveToolRouting("filesystem:read_file"), "local");
  assertEquals(resolveToolRouting("shell:exec"), "local");
  assertEquals(resolveToolRouting("process:spawn"), "local");
});

Deno.test("resolveToolRouting - cloud tools → 'cloud'", () => {
  setupRouting();
  // API services route to cloud
  assertEquals(resolveToolRouting("tavily:search"), "cloud");
  assertEquals(resolveToolRouting("github:get_pr"), "cloud");
  assertEquals(resolveToolRouting("slack:post_message"), "cloud");
  assertEquals(resolveToolRouting("memory:save"), "cloud");
});

Deno.test("resolveToolRouting - utility tools → 'cloud'", () => {
  setupRouting();
  // Pure utility tools route to cloud
  assertEquals(resolveToolRouting("json:parse"), "cloud");
  assertEquals(resolveToolRouting("math:add"), "cloud");
  assertEquals(resolveToolRouting("datetime:now"), "cloud");
  assertEquals(resolveToolRouting("crypto:hash"), "cloud");
});

Deno.test("resolveToolRouting - AI services → 'cloud'", () => {
  setupRouting();
  // AI/thinking services route to cloud
  assertEquals(resolveToolRouting("sequential-thinking:think"), "cloud");
  assertEquals(resolveToolRouting("context7:retrieve"), "cloud");
  assertEquals(resolveToolRouting("magic:generate"), "cloud");
});

Deno.test("resolveToolRouting - unknown tool → 'local' (safe default)", () => {
  setupRouting();
  // Unknown = local for security
  assertEquals(resolveToolRouting("unknown:tool"), "local");
  assertEquals(resolveToolRouting("custom_server:action"), "local");
  assertEquals(resolveToolRouting("my_app:do_thing"), "local");
});

Deno.test("resolveToolRouting - MCP SDK format routes correctly", () => {
  setupRouting();
  // MCP SDK format should extract namespace and route correctly
  assertEquals(resolveToolRouting("mcp__tavily__search"), "cloud");
  assertEquals(resolveToolRouting("mcp__filesystem__read"), "local");
  assertEquals(resolveToolRouting("mcp__github__pr"), "cloud");
});

Deno.test("resolveToolRouting - pml namespace → 'cloud'", () => {
  setupRouting();
  // PML meta-tools route to cloud
  assertEquals(resolveToolRouting("pml:discover"), "cloud");
  assertEquals(resolveToolRouting("pml:execute"), "cloud");
});

// ============================================================================
// isLocalTool / isCloudTool Tests
// ============================================================================

Deno.test("isLocalTool - returns true for local tools", () => {
  setupRouting();
  assertEquals(isLocalTool("filesystem:read"), true);
  assertEquals(isLocalTool("shell:exec"), true);
  assertEquals(isLocalTool("unknown:tool"), true);
});

Deno.test("isLocalTool - returns false for cloud tools", () => {
  setupRouting();
  assertEquals(isLocalTool("tavily:search"), false);
  assertEquals(isLocalTool("json:parse"), false);
});

Deno.test("isCloudTool - returns true for cloud tools", () => {
  setupRouting();
  assertEquals(isCloudTool("tavily:search"), true);
  assertEquals(isCloudTool("github:get_pr"), true);
  assertEquals(isCloudTool("math:add"), true);
});

Deno.test("isCloudTool - returns false for local tools", () => {
  setupRouting();
  assertEquals(isCloudTool("filesystem:read"), false);
  assertEquals(isCloudTool("shell:exec"), false);
});

// ============================================================================
// getCloudServers Tests
// ============================================================================

Deno.test("getCloudServers - returns array of namespaces", () => {
  setupRouting();
  const servers = getCloudServers();
  assertEquals(Array.isArray(servers), true);
  assertEquals(servers.includes("tavily"), true);
  assertEquals(servers.includes("github"), true);
  assertEquals(servers.includes("json"), true);
  assertEquals(servers.includes("pml"), true);
});

Deno.test("getCloudServers - does not include local namespaces", () => {
  setupRouting();
  const servers = getCloudServers();
  assertEquals(servers.includes("filesystem"), false);
  assertEquals(servers.includes("shell"), false);
});

Deno.test("getCloudServers - returns empty if not initialized", () => {
  resetRouting();
  const servers = getCloudServers();
  assertEquals(servers, []);
});

// ============================================================================
// Custom Config Tests
// ============================================================================

Deno.test("resolveToolRouting - respects custom config", () => {
  const customConfig: RoutingConfig = {
    version: "custom-1.0",
    cloudServers: ["mycloud", "custom-api"],
  };
  resetRouting();
  initializeRouting(customConfig);

  // Only mycloud and custom-api are cloud
  assertEquals(resolveToolRouting("mycloud:action"), "cloud");
  assertEquals(resolveToolRouting("custom-api:call"), "cloud");
  // Everything else is local
  assertEquals(resolveToolRouting("tavily:search"), "local");
  assertEquals(resolveToolRouting("json:parse"), "local");
});

// ============================================================================
// Edge Cases
// ============================================================================

Deno.test("resolveToolRouting - handles edge case namespaces", () => {
  setupRouting();
  // Empty or malformed
  assertEquals(resolveToolRouting(""), "local");
  assertEquals(resolveToolRouting(":tool"), "local"); // Empty namespace = local

  // Partial matches shouldn't work
  assertEquals(resolveToolRouting("tavil:search"), "local"); // typo
  assertEquals(resolveToolRouting("jsons:parse"), "local"); // wrong namespace
});

Deno.test("resolveToolRouting - all known cloud servers route correctly", () => {
  setupRouting();
  // Comprehensive check against DEFAULT_ROUTING_CONFIG
  for (const server of DEFAULT_ROUTING_CONFIG.cloudServers) {
    assertEquals(
      resolveToolRouting(`${server}:any_tool`),
      "cloud",
      `Expected ${server} to route to cloud`,
    );
  }
});
