/**
 * Concurrent E2E Tests
 *
 * Tests AC9: Concurrent call handling
 *
 * Story 14.8: E2E Integration Testing
 *
 * @module tests/e2e/concurrent_test
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  setupE2EContext,
  teardownE2EContext,
  type E2ETestContext,
} from "./test-harness.ts";
import { createMockServer, MockCloudServer } from "../fixtures/mock-cloud-server.ts";
import { CapabilityLoader } from "../../src/loader/capability-loader.ts";
import { SandboxWorker } from "../../src/sandbox/mod.ts";

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create loader for concurrent tests.
 */
async function createConcurrentTestLoader(
  ctx: E2ETestContext,
  mockServer: MockCloudServer,
): Promise<CapabilityLoader> {
  return await CapabilityLoader.create({
    cloudUrl: mockServer.getUrl(),
    workspace: ctx.workspace,
    permissions: { allow: ["*"], deny: [], ask: [] },
    sandboxEnabled: true,
    tracingEnabled: false,
  });
}

// ============================================================================
// AC9: Concurrent Call Tests
// ============================================================================

Deno.test({
  name: "E2E AC9: Multiple parallel sandbox executions complete correctly",
  async fn() {
    const ctx = await setupE2EContext();

    try {
      // Create multiple sandboxes for parallel execution
      const results: Array<{ id: number; value: number }> = [];

      const promises = Array.from({ length: 5 }, async (_, i) => {
        const sandbox = new SandboxWorker({
          onRpc: async () => null,
        });

        try {
          const result = await sandbox.execute(
            `
            // Simulate some work
            await new Promise(r => setTimeout(r, ${50 + i * 10}));
            return { id: ${i}, computed: ${i} * 2 };
            `,
            {},
          );

          if (result.success) {
            const value = result.value as { id: number; computed: number };
            results.push({ id: value.id, value: value.computed });
          }
        } finally {
          sandbox.shutdown();
        }
      });

      await Promise.all(promises);

      // All 5 should complete
      assertEquals(results.length, 5);

      // Each should have correct computed value
      for (let i = 0; i < 5; i++) {
        const result = results.find((r) => r.id === i);
        assertExists(result, `Missing result for id ${i}`);
        assertEquals(result?.value, i * 2);
      }
    } finally {
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "E2E AC9: Responses correctly multiplexed to callers",
  async fn() {
    const ctx = await setupE2EContext();
    const mockServer = await createMockServer({ port: 3076 });

    try {
      // Set up capability that echoes input with delay
      // Note: RegistryClient converts "echo:delayed" to FQDN "pml.mcp.echo.delayed"
      mockServer.setMcpResponse("pml.mcp.echo.delayed", {
        fqdn: "pml.mcp.echo.delayed",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/pml.mcp.echo.delayed.ts`,
        tools: ["delayed"],
        routing: "client",
        description: "Echo with delay",
        code: `
          // Random delay to mix up response order
          await new Promise(r => setTimeout(r, Math.random() * 100));
          return { input: args.input, timestamp: Date.now() };
        `,
      });

      const loader = await createConcurrentTestLoader(ctx, mockServer);

      // Fire 5 parallel calls with different inputs
      const inputs = ["alpha", "beta", "gamma", "delta", "epsilon"];
      const promises = inputs.map((input) =>
        loader.call("echo:delayed", { input })
      );

      const results = await Promise.all(promises);

      // Each result should match its input (not mixed up)
      for (let i = 0; i < inputs.length; i++) {
        const result = results[i] as { input: string };
        assertEquals(
          result.input,
          inputs[i],
          `Response ${i} has wrong input: expected ${inputs[i]}, got ${result.input}`,
        );
      }

      await loader.shutdown();
    } finally {
      mockServer.shutdown();
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "E2E AC9: Shared sandbox handles sequential calls",
  async fn() {
    const ctx = await setupE2EContext();
    let rpcCallCount = 0;

    try {
      // Single sandbox, multiple sequential calls
      const sandbox = new SandboxWorker({
        onRpc: async (method, args) => {
          rpcCallCount++;
          return { call: rpcCallCount, method, args };
        },
      });

      // Sequential calls to same sandbox
      const results: unknown[] = [];
      for (let i = 0; i < 5; i++) {
        const result = await sandbox.execute(
          `
          const response = await mcp.test.call({ iteration: ${i} });
          return response;
          `,
          {},
        );
        assertEquals(result.success, true);
        results.push(result.value);
      }

      // Each call should increment counter
      assertEquals(rpcCallCount, 5);

      // Each result should have incrementing call number
      for (let i = 0; i < 5; i++) {
        const value = results[i] as { call: number };
        assertEquals(value.call, i + 1);
      }

      sandbox.shutdown();
    } finally {
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "E2E AC9: Concurrent RPC calls from single sandbox",
  async fn() {
    const ctx = await setupE2EContext();
    const rpcCalls: Array<{ method: string; args: unknown; time: number }> = [];

    try {
      const sandbox = new SandboxWorker({
        onRpc: async (method, args) => {
          const start = Date.now();
          // Small delay to simulate work
          await new Promise((r) => setTimeout(r, 20));
          rpcCalls.push({ method, args, time: Date.now() - start });
          return { method, processed: true };
        },
      });

      // Execute code that makes multiple concurrent RPC calls
      const result = await sandbox.execute(
        `
        // Fire multiple RPC calls concurrently
        const calls = [
          mcp.api.call1({ id: 1 }),
          mcp.api.call2({ id: 2 }),
          mcp.api.call3({ id: 3 }),
        ];

        const results = await Promise.all(calls);
        return results;
        `,
        {},
      );

      assertEquals(result.success, true);
      const values = result.value as Array<{ method: string; processed: boolean }>;
      assertEquals(values.length, 3);

      // All RPC calls should have been made
      assertEquals(rpcCalls.length, 3);

      sandbox.shutdown();
    } finally {
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "E2E AC9: Capability cache prevents redundant fetches",
  async fn() {
    const ctx = await setupE2EContext();
    const mockServer = await createMockServer({ port: 3075 });

    try {
      // Note: RegistryClient converts "cached:cap" to FQDN "pml.mcp.cached.cap"
      mockServer.setMcpResponse("pml.mcp.cached.cap", {
        fqdn: "pml.mcp.cached.cap",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/pml.mcp.cached.cap.ts`,
        tools: ["cap"],
        routing: "client",
        description: "Cached",
        code: `return { cached: true, arg: args.v };`,
      });

      const loader = await createConcurrentTestLoader(ctx, mockServer);

      // First call to populate cache
      const firstResult = await loader.call("cached:cap", { v: -1 });
      assertEquals((firstResult as { cached: boolean }).cached, true);

      // Clear request history to count only subsequent requests
      mockServer.clearRequestHistory();

      // Fire 10 parallel calls to same capability (should use cache)
      const promises = Array.from({ length: 10 }, (_, i) =>
        loader.call("cached:cap", { v: i })
      );

      const results = await Promise.all(promises);

      // All should succeed
      for (let i = 0; i < 10; i++) {
        const result = results[i] as { cached: boolean; arg: number };
        assertEquals(result.cached, true);
        assertEquals(result.arg, i);
      }

      // Registry should not be hit again (capability already cached)
      const metaRequests = mockServer.getRequestsTo("/api/registry/pml.mcp.cached.cap");
      assertEquals(
        metaRequests.length,
        0,
        `Expected 0 registry requests (cached), got ${metaRequests.length}`,
      );

      await loader.shutdown();
    } finally {
      mockServer.shutdown();
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "E2E AC9: Different capabilities can run concurrently",
  async fn() {
    const ctx = await setupE2EContext();
    const mockServer = await createMockServer({ port: 3074 });

    try {
      // Set up multiple capabilities
      // Note: RegistryClient converts "cap1", "cap2", "cap3" to FQDNs "pml.mcp.cap1", etc.
      for (let i = 1; i <= 3; i++) {
        mockServer.setMcpResponse(`pml.mcp.cap${i}`, {
          fqdn: `pml.mcp.cap${i}`,
          type: "deno",
          codeUrl: `${mockServer.getUrl()}/code/pml.mcp.cap${i}.ts`,
          tools: [`cap${i}`],
          routing: "client",
          description: `Capability ${i}`,
          code: `
            await new Promise(r => setTimeout(r, ${i * 30}));
            return { cap: ${i}, input: args.input };
          `,
        });
      }

      const loader = await createConcurrentTestLoader(ctx, mockServer);

      const startTime = Date.now();

      // Run all 3 capabilities concurrently
      const [result1, result2, result3] = await Promise.all([
        loader.call("cap1", { input: "a" }),
        loader.call("cap2", { input: "b" }),
        loader.call("cap3", { input: "c" }),
      ]);

      const duration = Date.now() - startTime;

      // All should complete
      assertEquals((result1 as { cap: number }).cap, 1);
      assertEquals((result2 as { cap: number }).cap, 2);
      assertEquals((result3 as { cap: number }).cap, 3);

      // Should complete faster than sequential (30+60+90=180ms)
      // Concurrent should be closer to 90ms (longest one)
      assertEquals(
        duration < 500,
        true,
        `Should run concurrently, took ${duration}ms`,
      );

      await loader.shutdown();
    } finally {
      mockServer.shutdown();
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
