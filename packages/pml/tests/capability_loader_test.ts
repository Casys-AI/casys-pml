/**
 * Capability Loader Integration Tests
 *
 * Tests for the unified capability loader.
 *
 * @module tests/capability_loader_test
 */

import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { CapabilityLoader } from "../src/loader/capability-loader.ts";
import { LoaderError } from "../src/loader/types.ts";

// ============================================================================
// CapabilityLoader Unit Tests
// ============================================================================

Deno.test("CapabilityLoader.create - initializes successfully", async () => {
  const loader = await CapabilityLoader.create({
    cloudUrl: "https://pml.casys.ai",
    workspace: "/tmp",
    depStatePath: "/tmp/test-loader-deps.json",
  });

  assertExists(loader);
  assertEquals(loader.isLoaded("test:tool"), false);

  loader.shutdown();
});

Deno.test("CapabilityLoader - getStatus returns correct info", async () => {
  const loader = await CapabilityLoader.create({
    cloudUrl: "https://test.example.com",
    workspace: "/workspace",
    depStatePath: "/tmp/test-loader-status.json",
  });

  const status = loader.getStatus();

  assertEquals(status.initialized, true);
  assertEquals(status.loadedCapabilities, 0);
  assertEquals(status.runningProcesses, []);
  assertEquals(status.cloudUrl, "https://test.example.com");

  loader.shutdown();
});

Deno.test("CapabilityLoader - getLoadedCapabilities empty initially", async () => {
  const loader = await CapabilityLoader.create({
    cloudUrl: "https://pml.casys.ai",
    workspace: "/tmp",
    depStatePath: "/tmp/test-loader-caps.json",
  });

  assertEquals(loader.getLoadedCapabilities(), []);

  loader.shutdown();
});

Deno.test("CapabilityLoader - clearCache resets state", async () => {
  const loader = await CapabilityLoader.create({
    cloudUrl: "https://pml.casys.ai",
    workspace: "/tmp",
    depStatePath: "/tmp/test-loader-cache.json",
  });

  // Clear should not throw
  loader.clearCache();
  assertEquals(loader.getLoadedCapabilities(), []);

  loader.shutdown();
});

Deno.test("CapabilityLoader - shutdown cleans up", async () => {
  const loader = await CapabilityLoader.create({
    cloudUrl: "https://pml.casys.ai",
    workspace: "/tmp",
    depStatePath: "/tmp/test-loader-shutdown.json",
  });

  loader.shutdown();

  // After shutdown, status should show no processes
  const status = loader.getStatus();
  assertEquals(status.runningProcesses, []);
});

Deno.test("CapabilityLoader - load fails for nonexistent capability", async () => {
  const loader = await CapabilityLoader.create({
    cloudUrl: "https://pml.casys.ai",
    workspace: "/tmp",
    depStatePath: "/tmp/test-loader-fail.json",
  });

  // Mock fetch to return 404
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(null, { status: 404 });
  };

  try {
    await assertRejects(
      async () => {
        await loader.load("nonexistent:capability");
      },
      LoaderError,
    );
  } finally {
    globalThis.fetch = originalFetch;
    loader.shutdown();
  }
});

Deno.test("CapabilityLoader - HIL callback is invoked for deps", async () => {
  let hilCalled = false;
  let hilPrompt = "";

  const loader = await CapabilityLoader.create({
    cloudUrl: "https://pml.casys.ai",
    workspace: "/tmp",
    depStatePath: "/tmp/test-loader-hil.json",
    hilCallback: async (prompt: string) => {
      hilCalled = true;
      hilPrompt = prompt;
      return false; // Deny
    },
  });

  const validMetadata = {
    fqdn: "casys.pml.hil.test",
    type: "deno",
    codeUrl: "https://pml.casys.ai/mcp/casys.pml.hil.test",
    tools: ["hil:test"],
    routing: "client",
    mcpDeps: [
      {
        name: "memory",
        type: "stdio",
        install: "npx @mcp/memory@1.0.0",
        version: "1.0.0",
        integrity: "sha256-abc123",
      },
    ],
  };

  // Mock fetch to return metadata with deps
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(JSON.stringify(validMetadata), { status: 200 });
  };

  try {
    await assertRejects(
      async () => {
        await loader.load("hil:test");
      },
      LoaderError,
      "not approved",
    );

    assertEquals(hilCalled, true);
    assertEquals(hilPrompt.includes("memory@1.0.0"), true);
  } finally {
    globalThis.fetch = originalFetch;
    loader.shutdown();
  }
});

// ============================================================================
// Module Loading Tests (with mocks)
// ============================================================================

Deno.test("CapabilityLoader - caches loaded capabilities", async () => {
  const loader = await CapabilityLoader.create({
    cloudUrl: "https://pml.casys.ai",
    workspace: "/tmp",
    depStatePath: "/tmp/test-loader-cache2.json",
  });

  const validMetadata = {
    fqdn: "casys.pml.cache.test",
    type: "deno",
    codeUrl: "data:application/javascript,export function run() { return 'ok'; }",
    tools: ["cache:test"],
    routing: "client",
  };

  let fetchCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCount++;
    return new Response(JSON.stringify(validMetadata), { status: 200 });
  };

  try {
    // First load
    const cap1 = await loader.load("cache:test");
    assertEquals(loader.isLoaded("cache:test"), true);
    assertEquals(fetchCount, 1);

    // Second load should use cache
    const cap2 = await loader.load("cache:test");
    assertEquals(fetchCount, 1); // No additional fetch
    assertEquals(cap1, cap2); // Same instance
  } finally {
    globalThis.fetch = originalFetch;
    loader.shutdown();
  }
});
