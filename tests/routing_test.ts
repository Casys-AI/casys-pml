/**
 * Tests for PML Routing Module
 *
 * @module tests/routing_test
 */

import { assertEquals, assertThrows } from "@std/assert";
import {
  extractNamespace,
  getClientTools,
  getServerTools,
  initializeRouting,
  isClientTool,
  isRoutingInitialized,
  isServerTool,
  resetRouting,
  resolveToolRouting,
} from "../src/routing/mod.ts";
import type { RoutingConfig } from "../src/types.ts";

// ============================================================================
// Test Config (simulates what server would return)
// ============================================================================

/**
 * Test routing config - mirrors production config from server
 */
const TEST_ROUTING_CONFIG: RoutingConfig = {
  version: "test-1.0.0",
  clientTools: [
    "filesystem",
    "git",
    "shell",
    "process",
    "docker",
    "kubernetes",
    "ssh",
    "database",
    "sqlite",
    "postgres",
  ],
  serverTools: [
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
  ],
  defaultRouting: "client",
};

// ============================================================================
// Setup/Teardown
// ============================================================================

function setupRouting(config?: RoutingConfig): void {
  resetRouting();
  initializeRouting(config ?? TEST_ROUTING_CONFIG);
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

Deno.test("resolveToolRouting - client tools → 'client'", () => {
  setupRouting();
  // Filesystem, shell, etc. run on user's machine
  assertEquals(resolveToolRouting("filesystem:read_file"), "client");
  assertEquals(resolveToolRouting("shell:exec"), "client");
  assertEquals(resolveToolRouting("process:spawn"), "client");
  assertEquals(resolveToolRouting("docker:run"), "client");
});

Deno.test("resolveToolRouting - server tools → 'server'", () => {
  setupRouting();
  // API services route to pml.casys.ai
  assertEquals(resolveToolRouting("tavily:search"), "server");
  assertEquals(resolveToolRouting("github:get_pr"), "server");
  assertEquals(resolveToolRouting("slack:post_message"), "server");
});

Deno.test("resolveToolRouting - utility tools → 'server'", () => {
  setupRouting();
  // Pure utility tools route to server
  assertEquals(resolveToolRouting("json:parse"), "server");
  assertEquals(resolveToolRouting("math:add"), "server");
  assertEquals(resolveToolRouting("datetime:now"), "server");
  assertEquals(resolveToolRouting("crypto:hash"), "server");
});

Deno.test("resolveToolRouting - AI services → 'server'", () => {
  setupRouting();
  // AI/thinking services route to server
  assertEquals(resolveToolRouting("sequential-thinking:think"), "server");
  assertEquals(resolveToolRouting("context7:retrieve"), "server");
  assertEquals(resolveToolRouting("magic:generate"), "server");
});

Deno.test("resolveToolRouting - unknown tool → default routing", () => {
  setupRouting();
  // Unknown = default (client for security)
  assertEquals(resolveToolRouting("unknown:tool"), "client");
  assertEquals(resolveToolRouting("custom_server:action"), "client");
  assertEquals(resolveToolRouting("my_app:do_thing"), "client");
});

Deno.test("resolveToolRouting - MCP SDK format routes correctly", () => {
  setupRouting();
  // MCP SDK format should extract namespace and route correctly
  assertEquals(resolveToolRouting("mcp__tavily__search"), "server");
  assertEquals(resolveToolRouting("mcp__filesystem__read"), "client");
  assertEquals(resolveToolRouting("mcp__github__pr"), "server");
});

// Note: PML meta-tools (discover, execute, admin) are handled directly by the PML server,
// not via routing. They don't need namespace routing - the server handles them internally.

// ============================================================================
// isClientTool / isServerTool Tests
// ============================================================================

Deno.test("isClientTool - returns true for client tools", () => {
  setupRouting();
  assertEquals(isClientTool("filesystem:read"), true);
  assertEquals(isClientTool("shell:exec"), true);
  assertEquals(isClientTool("docker:build"), true);
});

Deno.test("isClientTool - returns false for server tools", () => {
  setupRouting();
  assertEquals(isClientTool("tavily:search"), false);
  assertEquals(isClientTool("json:parse"), false);
});

Deno.test("isServerTool - returns true for server tools", () => {
  setupRouting();
  assertEquals(isServerTool("tavily:search"), true);
  assertEquals(isServerTool("github:get_pr"), true);
  assertEquals(isServerTool("math:add"), true);
});

Deno.test("isServerTool - returns false for client tools", () => {
  setupRouting();
  assertEquals(isServerTool("filesystem:read"), false);
  assertEquals(isServerTool("shell:exec"), false);
});

// ============================================================================
// getClientTools / getServerTools Tests
// ============================================================================

Deno.test("getClientTools - returns array of client namespaces", () => {
  setupRouting();
  const tools = getClientTools();
  assertEquals(Array.isArray(tools), true);
  assertEquals(tools.includes("filesystem"), true);
  assertEquals(tools.includes("docker"), true);
  assertEquals(tools.includes("ssh"), true);
});

Deno.test("getServerTools - returns array of server namespaces", () => {
  setupRouting();
  const tools = getServerTools();
  assertEquals(Array.isArray(tools), true);
  assertEquals(tools.includes("tavily"), true);
  assertEquals(tools.includes("github"), true);
  assertEquals(tools.includes("json"), true);
  assertEquals(tools.includes("pml"), true);
});

Deno.test("getServerTools - does not include client namespaces", () => {
  setupRouting();
  const tools = getServerTools();
  assertEquals(tools.includes("filesystem"), false);
  assertEquals(tools.includes("shell"), false);
});

Deno.test("getClientTools - returns empty if not initialized", () => {
  resetRouting();
  const tools = getClientTools();
  assertEquals(tools, []);
});

Deno.test("getServerTools - returns empty if not initialized", () => {
  resetRouting();
  const tools = getServerTools();
  assertEquals(tools, []);
});

// ============================================================================
// Custom Config Tests
// ============================================================================

Deno.test("resolveToolRouting - respects custom config", () => {
  const customConfig: RoutingConfig = {
    version: "custom-1.0",
    clientTools: ["mylocal"],
    serverTools: ["myserver", "custom-api"],
    defaultRouting: "client",
  };
  resetRouting();
  initializeRouting(customConfig);

  // Explicit client tools
  assertEquals(resolveToolRouting("mylocal:action"), "client");
  // Explicit server tools
  assertEquals(resolveToolRouting("myserver:action"), "server");
  assertEquals(resolveToolRouting("custom-api:call"), "server");
  // Unknown → default (client)
  assertEquals(resolveToolRouting("tavily:search"), "client");
  assertEquals(resolveToolRouting("json:parse"), "client");
});

Deno.test("resolveToolRouting - respects defaultRouting=server", () => {
  const customConfig: RoutingConfig = {
    version: "custom-1.0",
    clientTools: ["filesystem"],
    serverTools: ["pml"],
    defaultRouting: "server",
  };
  resetRouting();
  initializeRouting(customConfig);

  // Explicit client
  assertEquals(resolveToolRouting("filesystem:read"), "client");
  // Explicit server
  assertEquals(resolveToolRouting("execute"), "server");
  // Unknown → default (server in this config)
  assertEquals(resolveToolRouting("unknown:tool"), "server");
});

// ============================================================================
// Edge Cases
// ============================================================================

Deno.test("resolveToolRouting - handles edge case namespaces", () => {
  setupRouting();
  // Empty or malformed → default routing
  assertEquals(resolveToolRouting(""), "client");
  assertEquals(resolveToolRouting(":tool"), "client"); // Empty namespace

  // Partial matches shouldn't work
  assertEquals(resolveToolRouting("tavil:search"), "client"); // typo
  assertEquals(resolveToolRouting("jsons:parse"), "client"); // wrong namespace
});

Deno.test("resolveToolRouting - all known server tools route correctly", () => {
  setupRouting();
  // Comprehensive check against TEST_ROUTING_CONFIG
  for (const server of TEST_ROUTING_CONFIG.serverTools) {
    assertEquals(
      resolveToolRouting(`${server}:any_tool`),
      "server",
      `Expected ${server} to route to server`,
    );
  }
});

Deno.test("resolveToolRouting - all known client tools route correctly", () => {
  setupRouting();
  // Comprehensive check against TEST_ROUTING_CONFIG
  for (const client of TEST_ROUTING_CONFIG.clientTools) {
    assertEquals(
      resolveToolRouting(`${client}:any_tool`),
      "client",
      `Expected ${client} to route to client`,
    );
  }
});
