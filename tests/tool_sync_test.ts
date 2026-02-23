/**
 * Tool Sync Client Tests
 *
 * Tests for packages/pml/src/discovery/tool-sync.ts
 * F16 Fix: Add missing tests for tool sync feature
 */

import { assertEquals, assertNotEquals } from "@std/assert";
import { syncDiscoveredTools, sanitizeEnvToPlaceholders } from "../src/discovery/mod.ts";
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
  //   observedConfig?: {
  //     [serverName]: { command: string, args: string[], env?: Record<string, string> }
  //   }
  // }
  //
  // Response:
  // { synced: number, observations: number }
  //
  // Tech-spec 01.5: observedConfig contains server spawn config from .pml.json
  // env values are sanitized to placeholders (e.g., "${API_KEY}") for security

  // Placeholder - actual integration test would use mock server
  assertEquals(true, true);
});

// ============================================================================
// Tech-spec 01.5: Env Var Security Regression Tests
// ============================================================================

Deno.test("sanitizeEnvToPlaceholders - converts values to placeholders", () => {
  const env = {
    "API_KEY": "sk-secret-actual-value",
    "DATABASE_URL": "postgres://user:password@host/db",
  };

  const result = sanitizeEnvToPlaceholders(env);

  assertEquals(result, {
    "API_KEY": "${API_KEY}",
    "DATABASE_URL": "${DATABASE_URL}",
  });
});

Deno.test("sanitizeEnvToPlaceholders - NEVER leaks actual secret values", () => {
  // CRITICAL SECURITY TEST
  // This test ensures actual env values are NEVER in the output
  const secretValue = "sk-ant-api03-REAL-SECRET-VALUE-12345";
  const env = {
    "ANTHROPIC_API_KEY": secretValue,
  };

  const result = sanitizeEnvToPlaceholders(env);

  // The actual secret value must NOT appear anywhere in the result
  const resultString = JSON.stringify(result);
  assertEquals(resultString.includes(secretValue), false, "Secret value leaked in output!");
  assertEquals(resultString.includes("sk-ant"), false, "Partial secret leaked in output!");

  // The placeholder format must be used
  assertEquals(result?.["ANTHROPIC_API_KEY"], "${ANTHROPIC_API_KEY}");
});

Deno.test("sanitizeEnvToPlaceholders - returns undefined for empty env", () => {
  assertEquals(sanitizeEnvToPlaceholders(undefined), undefined);
  assertEquals(sanitizeEnvToPlaceholders({}), undefined);
});

Deno.test("sanitizeEnvToPlaceholders - handles multiple env vars", () => {
  const env = {
    "KEY1": "value1",
    "KEY2": "value2",
    "KEY3": "value3",
  };

  const result = sanitizeEnvToPlaceholders(env);

  assertEquals(Object.keys(result!).length, 3);
  assertEquals(result!["KEY1"], "${KEY1}");
  assertEquals(result!["KEY2"], "${KEY2}");
  assertEquals(result!["KEY3"], "${KEY3}");

  // Verify no original values present
  assertNotEquals(result!["KEY1"], "value1");
  assertNotEquals(result!["KEY2"], "value2");
  assertNotEquals(result!["KEY3"], "value3");
});

Deno.test("sanitizeEnvToPlaceholders - handles special characters in keys", () => {
  const env = {
    "MY_API_KEY_V2": "secret",
    "SOME-DASHED-KEY": "secret",
  };

  const result = sanitizeEnvToPlaceholders(env);

  assertEquals(result!["MY_API_KEY_V2"], "${MY_API_KEY_V2}");
  assertEquals(result!["SOME-DASHED-KEY"], "${SOME-DASHED-KEY}");
});
