/**
 * Capability Loader Core Tests
 *
 * Unit tests for basic CapabilityLoader functionality:
 * - Initialization
 * - Status reporting
 * - Cache management
 * - Shutdown/cleanup
 *
 * Split from capability_loader_test.ts for maintainability.
 *
 * @module tests/capability_loader_core_test
 */

import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { CapabilityLoader } from "../src/loader/capability-loader.ts";
import { LoaderError } from "../src/loader/types.ts";
import {
  mockFetch,
  mock404Response,
  mockJsonResponse,
  createTestCapabilityMetadata,
} from "./fixtures/index.ts";

// ============================================================================
// Initialization Tests
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

// ============================================================================
// Cache Management Tests
// ============================================================================

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

Deno.test("CapabilityLoader - caches loaded capabilities", async () => {
  const loader = await CapabilityLoader.create({
    cloudUrl: "https://pml.casys.ai",
    workspace: "/tmp",
    depStatePath: "/tmp/test-loader-cache2.json",
    sandboxEnabled: false, // Disable sandbox for this test to isolate caching behavior
  });

  const validMetadata = createTestCapabilityMetadata({
    fqdn: "casys.pml.cache.test",
    tools: ["cache:test"],
  });

  const fetchCtx = mockFetch(() => mockJsonResponse(validMetadata));

  try {
    // First load
    const cap1 = await loader.load("cache:test");
    assertEquals(loader.isLoaded("cache:test"), true);
    assertEquals(fetchCtx.callCount, 1);

    // Second load should use cache
    const cap2 = await loader.load("cache:test");
    assertEquals(fetchCtx.callCount, 1); // No additional fetch
    assertEquals(cap1, cap2); // Same instance
  } finally {
    fetchCtx.restore();
    loader.shutdown();
  }
});

// ============================================================================
// Shutdown Tests
// ============================================================================

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

// ============================================================================
// Error Handling Tests
// ============================================================================

Deno.test("CapabilityLoader - load fails for nonexistent capability", async () => {
  const loader = await CapabilityLoader.create({
    cloudUrl: "https://pml.casys.ai",
    workspace: "/tmp",
    depStatePath: "/tmp/test-loader-fail.json",
  });

  const fetchCtx = mockFetch(() => mock404Response());

  try {
    await assertRejects(
      async () => {
        await loader.load("nonexistent:capability");
      },
      LoaderError,
    );
  } finally {
    fetchCtx.restore();
    loader.shutdown();
  }
});
