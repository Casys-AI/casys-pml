/**
 * Tests for Routing Resolver (Story 13.9)
 *
 * @module tests/unit/capabilities/routing_resolver_test
 */

import { assertEquals } from "@std/assert";
import {
  extractServerName,
  getToolRouting,
  initRoutingConfig,
  isCloudServer,
  isLocalServer,
  reloadRoutingConfig,
  resolveRouting,
} from "../../../src/capabilities/routing-resolver.ts";

// Initialize config before tests
Deno.test("routing-resolver: init config", async () => {
  await initRoutingConfig();
});

// ============================================
// extractServerName tests
// ============================================

Deno.test("extractServerName: standard format server:action", () => {
  assertEquals(extractServerName("filesystem:read_file"), "filesystem");
  assertEquals(extractServerName("memory:store"), "memory");
  assertEquals(extractServerName("tavily:search"), "tavily");
  assertEquals(extractServerName("pml:execute"), "pml");
});

Deno.test("extractServerName: capability tool format mcp__namespace__action", () => {
  assertEquals(extractServerName("mcp__code__analyze"), "code");
  assertEquals(extractServerName("mcp__data__transform"), "data");
  assertEquals(extractServerName("mcp__fs__read_json"), "fs");
});

Deno.test("extractServerName: server only (no action)", () => {
  assertEquals(extractServerName("memory"), "memory");
  assertEquals(extractServerName("filesystem"), "filesystem");
});

// ============================================
// isLocalServer / isCloudServer tests
// ============================================

Deno.test("isLocalServer: filesystem is local", () => {
  assertEquals(isLocalServer("filesystem"), true);
  assertEquals(isCloudServer("filesystem"), false);
});

Deno.test("isLocalServer: fs is local", () => {
  assertEquals(isLocalServer("fs"), true);
});

Deno.test("isLocalServer: shell is local", () => {
  assertEquals(isLocalServer("shell"), true);
  assertEquals(isLocalServer("process"), true);
});

Deno.test("isLocalServer: docker/kubernetes are local", () => {
  assertEquals(isLocalServer("docker"), true);
  assertEquals(isLocalServer("kubernetes"), true);
});

// Note: With default "all client" config, no tools are server-routed
// These tests verify the current security-first configuration

Deno.test("isCloudServer: memory defaults to client (security-first config)", () => {
  // With empty server list in config, all tools default to client
  assertEquals(isCloudServer("memory"), false);
  assertEquals(isLocalServer("memory"), true);
});

Deno.test("isCloudServer: tavily defaults to client (security-first config)", () => {
  assertEquals(isCloudServer("tavily"), false);
});

Deno.test("isCloudServer: pml defaults to client (security-first config)", () => {
  assertEquals(isCloudServer("pml"), false);
});

Deno.test("isCloudServer: json/math/crypto default to client (security-first config)", () => {
  assertEquals(isCloudServer("json"), false);
  assertEquals(isCloudServer("math"), false);
  assertEquals(isCloudServer("crypto"), false);
});

Deno.test("isLocalServer: unknown server defaults to local", () => {
  assertEquals(isLocalServer("unknown_server"), true);
  assertEquals(isCloudServer("unknown_server"), false);
});

// ============================================
// getToolRouting tests
// ============================================

Deno.test("getToolRouting: filesystem:read_file -> client", () => {
  assertEquals(getToolRouting("filesystem:read_file"), "client");
});

Deno.test("getToolRouting: memory:store -> client (security-first config)", () => {
  // With empty server list, all tools default to client
  assertEquals(getToolRouting("memory:store"), "client");
});

Deno.test("getToolRouting: mcp__fs__read -> client", () => {
  assertEquals(getToolRouting("mcp__fs__read"), "client");
});

// ============================================
// resolveRouting tests
// ============================================

Deno.test("resolveRouting: empty tools -> server (pure compute)", () => {
  assertEquals(resolveRouting([]), "server");
});

Deno.test("resolveRouting: explicit override takes precedence", () => {
  // Even with filesystem tool, explicit "server" wins
  assertEquals(resolveRouting(["filesystem:read"], "server"), "server");
  // Explicit "client" wins over server tools
  assertEquals(resolveRouting(["memory:store"], "client"), "client");
});

Deno.test("resolveRouting: any client tool -> client", () => {
  // Mix of client and server -> client wins
  assertEquals(
    resolveRouting(["filesystem:read", "memory:store", "tavily:search"]),
    "client",
  );
});

Deno.test("resolveRouting: with security-first config, all tools -> client", () => {
  // With empty server list, all tools default to client
  assertEquals(
    resolveRouting(["memory:store", "tavily:search", "json:parse"]),
    "client",
  );
});

Deno.test("resolveRouting: single client tool -> client", () => {
  assertEquals(resolveRouting(["filesystem:read"]), "client");
  assertEquals(resolveRouting(["shell:execute"]), "client");
  assertEquals(resolveRouting(["docker:run"]), "client");
});

Deno.test("resolveRouting: with security-first config, single tool -> client", () => {
  // With empty server list, all tools default to client
  assertEquals(resolveRouting(["memory:store"]), "client");
  assertEquals(resolveRouting(["pml:search"]), "client");
});

Deno.test("resolveRouting: capability tools resolve correctly", () => {
  // mcp__fs__read -> fs -> client
  assertEquals(resolveRouting(["mcp__fs__read"]), "client");
  // mcp__json__parse -> json -> client (with security-first config)
  assertEquals(resolveRouting(["mcp__json__parse"]), "client");
});

// ============================================
// Config reload tests
// ============================================

Deno.test("reloadRoutingConfig: clears cache", async () => {
  // First load
  await initRoutingConfig();
  const result1 = resolveRouting(["memory:store"]);
  assertEquals(result1, "client"); // With security-first config

  // Reload and verify still works
  reloadRoutingConfig();
  await initRoutingConfig();
  const result2 = resolveRouting(["memory:store"]);
  assertEquals(result2, "client"); // With security-first config
});

// ============================================
// Edge case tests (Problem 5 fixes)
// ============================================

Deno.test("extractServerName: empty string -> empty string", () => {
  assertEquals(extractServerName(""), "");
});

Deno.test("extractServerName: tool with multiple colons", () => {
  // Takes first segment before colon
  assertEquals(extractServerName("server:sub:action"), "server");
});

Deno.test("extractServerName: colon only", () => {
  // colonIndex is 0, not > 0, so returns original
  assertEquals(extractServerName(":action"), ":action");
});

Deno.test("resolveRouting: null/undefined in array filtered out", () => {
  // @ts-ignore - testing runtime behavior with bad data
  const result = resolveRouting([null, "memory:store", undefined, ""]);
  // memory:store defaults to client with security-first config, invalid entries filtered
  assertEquals(result, "client");
});

Deno.test("resolveRouting: all invalid entries -> server (pure compute)", () => {
  // @ts-ignore - testing runtime behavior with bad data
  const result = resolveRouting([null, undefined, ""]);
  // All filtered out = no tools = server
  assertEquals(result, "server");
});

Deno.test("isLocalServer: empty string -> client (safe default)", () => {
  assertEquals(isLocalServer(""), true);
});

Deno.test("isCloudServer: empty string -> false (not server)", () => {
  assertEquals(isCloudServer(""), false);
});

Deno.test("getToolRouting: empty string -> client", () => {
  assertEquals(getToolRouting(""), "client");
});

Deno.test("resolveRouting: mixed valid/invalid with client tool -> client", () => {
  // @ts-ignore - testing runtime behavior
  const result = resolveRouting([null, "filesystem:read", "memory:store"]);
  assertEquals(result, "client");
});
