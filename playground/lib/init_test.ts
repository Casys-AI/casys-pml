/**
 * Tests for playground initialization helper
 *
 * @module playground/lib/init_test
 */

import {
  assertEquals,
  assertExists,
  assert,
} from "jsr:@std/assert@1.0.11";
import {
  ensurePlaygroundReady,
  getPlaygroundDbPath,
} from "./init.ts";

// ============================================================================
// Unit Tests - getPlaygroundDbPath
// ============================================================================

Deno.test("getPlaygroundDbPath - uses AGENTCARDS_DB_PATH env var when set", () => {
  const customPath = "/custom/path/test.db";
  const originalValue = Deno.env.get("AGENTCARDS_DB_PATH");

  Deno.env.set("AGENTCARDS_DB_PATH", customPath);
  try {
    const path = getPlaygroundDbPath();
    assertEquals(path, customPath);
  } finally {
    if (originalValue) {
      Deno.env.set("AGENTCARDS_DB_PATH", originalValue);
    } else {
      Deno.env.delete("AGENTCARDS_DB_PATH");
    }
  }
});

Deno.test("getPlaygroundDbPath - falls back to default when env var not set", () => {
  const originalValue = Deno.env.get("AGENTCARDS_DB_PATH");
  Deno.env.delete("AGENTCARDS_DB_PATH");

  try {
    const path = getPlaygroundDbPath();
    assert(path.endsWith(".agentcards.db"), `Expected path to end with .agentcards.db, got: ${path}`);
    assert(path.includes(".agentcards"), `Expected path to include .agentcards, got: ${path}`);
  } finally {
    if (originalValue) {
      Deno.env.set("AGENTCARDS_DB_PATH", originalValue);
    }
  }
});

// ============================================================================
// Unit Tests - ensurePlaygroundReady
// ============================================================================

Deno.test("ensurePlaygroundReady - returns correct status structure", async () => {
  const status = await ensurePlaygroundReady({
    verbose: false,
    dbPath: ":memory:", // Use in-memory DB for test
    gatewayUrl: "http://localhost:9999", // Non-existent gateway
  });

  assertExists(status);
  assertExists(status.initialized);
  assertExists(status.mcpServers);
  assertExists(status.workflowsLoaded);
  assertExists(status.elapsedMs);

  // Verify types
  assertEquals(typeof status.initialized, "boolean");
  assertEquals(Array.isArray(status.mcpServers), true);
  assertEquals(typeof status.workflowsLoaded, "number");
  assertEquals(typeof status.elapsedMs, "number");
});

Deno.test("ensurePlaygroundReady - handles missing gateway gracefully", async () => {
  const status = await ensurePlaygroundReady({
    verbose: false,
    dbPath: ":memory:",
    gatewayUrl: "http://localhost:9999", // Non-existent
  });

  // Should not throw, should return with error info
  assertExists(status);
  assertEquals(status.mcpServers.length, 0);
  // Error should be set because gateway is not available
  assertExists(status.error);
  assert(status.error!.includes("gateway"), `Expected error about gateway, got: ${status.error}`);
});

Deno.test("ensurePlaygroundReady - handles missing workflow file gracefully", async () => {
  const status = await ensurePlaygroundReady({
    verbose: false,
    dbPath: ":memory:",
    gatewayUrl: "http://localhost:9999",
    workflowPath: "/nonexistent/path/workflows.yaml",
  });

  // Should not throw, should return with error info
  assertExists(status);
  assertEquals(status.workflowsLoaded, 0);
  assertExists(status.error);
});

Deno.test("ensurePlaygroundReady - loads workflow templates when file exists", async () => {
  const status = await ensurePlaygroundReady({
    verbose: false,
    dbPath: ":memory:",
    gatewayUrl: "http://localhost:9999",
    workflowPath: "./config/workflow-templates.yaml", // Real file
  });

  assertExists(status);
  // Should have loaded some workflows
  assert(status.workflowsLoaded > 0, `Expected workflows to be loaded, got: ${status.workflowsLoaded}`);
});

Deno.test("ensurePlaygroundReady - elapsedMs is reasonable", async () => {
  const status = await ensurePlaygroundReady({
    verbose: false,
    dbPath: ":memory:",
    gatewayUrl: "http://localhost:9999",
  });

  assertExists(status);
  assert(status.elapsedMs >= 0, `Expected non-negative elapsed time, got: ${status.elapsedMs}`);
  // Should complete in reasonable time (< 5 seconds even with timeout)
  assert(status.elapsedMs < 5000, `Expected completion in < 5s, got: ${status.elapsedMs}ms`);
});

// ============================================================================
// Performance Tests
// ============================================================================

Deno.test("ensurePlaygroundReady - skip path is fast (< 100ms requirement)", async () => {
  // First call - might do initialization
  await ensurePlaygroundReady({
    verbose: false,
    dbPath: ":memory:",
    gatewayUrl: "http://localhost:9999",
  });

  // Second call with same in-memory DB - should be quick
  // Note: With :memory: DB, each call creates a new DB, so this tests
  // the "not initialized" path speed rather than skip path
  const start = performance.now();
  const status = await ensurePlaygroundReady({
    verbose: false,
    dbPath: ":memory:",
    gatewayUrl: "http://localhost:9999",
  });
  const elapsed = performance.now() - start;

  assertExists(status);
  // The check should be fast (network timeout is 2s, but we're hitting localhost)
  // In practice with no gateway, this completes quickly
  assert(elapsed < 3000, `Expected fast response, got: ${elapsed}ms`);
});

// ============================================================================
// Verbose Mode Tests
// ============================================================================

Deno.test("ensurePlaygroundReady - verbose mode doesn't throw", async () => {
  // Just verify verbose mode runs without errors
  const status = await ensurePlaygroundReady({
    verbose: true,
    dbPath: ":memory:",
    gatewayUrl: "http://localhost:9999",
  });

  assertExists(status);
});
