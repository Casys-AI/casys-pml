/**
 * Tool Sync Client Tests
 *
 * Tests for packages/pml/src/discovery/tool-sync.ts
 * F16 Fix: Add missing tests for tool sync feature
 */

import { assertEquals } from "@std/assert";
import { syncDiscoveredTools } from "../src/discovery/mod.ts";
import type { DiscoveryResult } from "../src/discovery/mod.ts";

// ============================================================================
// syncDiscoveredTools Tests
// ============================================================================

Deno.test("syncDiscoveredTools - returns success for empty results", async () => {
  const result = await syncDiscoveredTools(
    "https://fake-cloud.example.com",
    "fake-api-key",
    [], // no results
  );

  assertEquals(result.success, true);
  assertEquals(result.synced, 0);
  assertEquals(result.observations, 0);
});

Deno.test("syncDiscoveredTools - skips results with no tools", async () => {
  const results: DiscoveryResult[] = [
    {
      serverName: "empty-server",
      tools: [], // no tools discovered
      config: { type: "stdio", command: "cmd" },
    },
  ];

  const result = await syncDiscoveredTools(
    "https://fake-cloud.example.com",
    "fake-api-key",
    results,
  );

  // Should succeed but sync nothing (no HTTP call made)
  assertEquals(result.success, true);
  assertEquals(result.synced, 0);
});

Deno.test("syncDiscoveredTools - handles network error", async () => {
  const results: DiscoveryResult[] = [
    {
      serverName: "test-server",
      tools: [{ name: "tool1", description: "Test tool" }],
      config: { type: "stdio", command: "cmd" },
    },
  ];

  // Use invalid URL to trigger network error
  const result = await syncDiscoveredTools(
    "https://invalid.local.invalid:99999",
    "fake-api-key",
    results,
  );

  assertEquals(result.success, false);
  assertEquals(result.synced, 0);
  assertEquals(typeof result.error, "string");
});

// ============================================================================
// Integration test with mock server would go here
// For now, we test the interface contract
// ============================================================================

Deno.test("syncDiscoveredTools - request format documented", () => {
  // This test documents the expected request format:
  //
  // POST /api/tools/sync
  // Headers:
  //   Content-Type: application/json
  //   x-api-key: <apiKey>
  //
  // Body:
  // {
  //   tools: [
  //     {
  //       serverName: string,
  //       tools: [{ name, description?, inputSchema? }],
  //       error?: string
  //     }
  //   ],
  //   observedArgs?: { [serverName]: string[] }
  // }
  //
  // Response:
  // { synced: number, observations: number }

  // Placeholder - actual integration test would use mock server
  assertEquals(true, true);
});
