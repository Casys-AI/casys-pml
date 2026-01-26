/**
 * Error Recovery E2E Tests
 *
 * Tests AC10: Error recovery and resource cleanup
 *
 * Story 14.8: E2E Integration Testing
 *
 * @module tests/e2e/error_recovery_test
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
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
 * Create loader for error recovery tests.
 */
async function createErrorTestLoader(
  ctx: E2ETestContext,
  mockServer: MockCloudServer,
): Promise<CapabilityLoader> {
  return await CapabilityLoader.create({
    cloudUrl: mockServer.getUrl(),
    workspace: ctx.workspace,
    permissions: { allow: ["*"], deny: [], ask: [] },
    sandboxEnabled: true,
    tracingEnabled: false,
    // Use isolated dep state per test
    depStatePath: join(ctx.workspace, "dep-state.json"),
  });
}

// ============================================================================
// AC10: Error Recovery Tests
// ============================================================================

Deno.test({
  name: "E2E AC10: Timeout scenario returns TimeoutError",
  async fn() {
    const ctx = await setupE2EContext();

    try {
      const sandbox = new SandboxWorker({
        onRpc: async () => null,
        executionTimeoutMs: 200, // Short timeout
      });

      // Code that exceeds timeout
      const result = await sandbox.execute(
        `
        // Infinite loop
        while (true) {
          await new Promise(r => setTimeout(r, 10));
        }
        `,
        {},
      );

      assertEquals(result.success, false);
      assertEquals(result.error?.code, "EXECUTION_TIMEOUT");
      assertStringIncludes(result.error?.message ?? "", "timeout");

      sandbox.shutdown();
    } finally {
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "E2E AC10: Sandbox crash returns ExecutionError + cleanup",
  async fn() {
    const ctx = await setupE2EContext();

    try {
      const sandbox = new SandboxWorker({
        onRpc: async () => null,
      });

      // Code that throws uncaught error
      const result = await sandbox.execute(
        `
        throw new Error("Simulated crash");
        `,
        {},
      );

      assertEquals(result.success, false);
      assertStringIncludes(result.error?.message ?? "", "Simulated crash");

      // Sandbox should still be usable after crash
      const result2 = await sandbox.execute(`return "recovered";`, {});
      assertEquals(result2.success, true);
      assertEquals(result2.value, "recovered");

      sandbox.shutdown();
    } finally {
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "E2E AC10: Malformed code returns ParseError",
  async fn() {
    const ctx = await setupE2EContext();

    try {
      const sandbox = new SandboxWorker({
        onRpc: async () => null,
      });

      // Malformed JavaScript
      const result = await sandbox.execute(
        `
        this is not valid javascript {{{{
        `,
        {},
      );

      assertEquals(result.success, false);
      // Should indicate syntax/parse error
      const errorLower = result.error?.message?.toLowerCase() ?? "";
      assertEquals(
        errorLower.includes("syntax") ||
          errorLower.includes("unexpected") ||
          errorLower.includes("parse") ||
          errorLower.includes("error"),
        true,
        `Expected parse error, got: ${result.error?.message}`,
      );

      sandbox.shutdown();
    } finally {
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "E2E AC10: Resource cleanup after shutdown",
  async fn() {
    const ctx = await setupE2EContext();

    try {
      const sandbox = new SandboxWorker({
        onRpc: async () => null,
      });

      // Execute something
      const result1 = await sandbox.execute(`return "before shutdown";`, {});
      assertEquals(result1.success, true);

      // Shutdown
      sandbox.shutdown();
      assertEquals(sandbox.isActive(), false);

      // Subsequent calls should fail gracefully
      const result2 = await sandbox.execute(`return "after shutdown";`, {});
      assertEquals(result2.success, false);
      assertEquals(result2.error?.code, "WORKER_TERMINATED");
    } finally {
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "E2E AC10: RPC timeout handled gracefully",
  async fn() {
    const ctx = await setupE2EContext();

    try {
      const sandbox = new SandboxWorker({
        onRpc: async () => {
          // Simulate slow RPC that exceeds timeout
          await new Promise((r) => setTimeout(r, 10000));
          return "should not reach";
        },
        rpcTimeoutMs: 200, // Short RPC timeout
      });

      const result = await sandbox.execute(
        `
        try {
          const response = await mcp.slow.rpc({});
          return { timedOut: false, response };
        } catch (e) {
          return { timedOut: true, error: e.message };
        }
        `,
        {},
      );

      assertEquals(result.success, true);
      const value = result.value as { timedOut: boolean; error?: string };
      assertEquals(value.timedOut, true);
      assertStringIncludes(value.error ?? "", "timeout");

      sandbox.shutdown();
    } finally {
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "E2E AC10: Subsequent calls work after error",
  async fn() {
    const ctx = await setupE2EContext();
    const mockServer = await createMockServer({ port: 3073 });

    try {
      // Note: loader.call("flaky:cap") converts to FQDN "pml.mcp.flaky.cap"
      mockServer.setMcpResponse("pml.mcp.flaky.cap", {
        fqdn: "pml.mcp.flaky.cap",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/pml.mcp.flaky.cap.ts`,
        tools: ["cap"],
        routing: "client",
        description: "Flaky capability",
        code: `
          if (args.fail) {
            throw new Error("Intentional failure");
          }
          return { success: true, attempt: args.attempt };
        `,
      });

      const loader = await createErrorTestLoader(ctx, mockServer);

      // First call fails
      try {
        await loader.call("flaky:cap", { fail: true, attempt: 1 });
        throw new Error("Expected failure");
      } catch (error) {
        assertStringIncludes((error as Error).message, "Intentional failure");
      }

      // Second call succeeds
      const result2 = await loader.call("flaky:cap", {
        fail: false,
        attempt: 2,
      });
      assertEquals((result2 as { success: boolean }).success, true);
      assertEquals((result2 as { attempt: number }).attempt, 2);

      // Third call also succeeds
      const result3 = await loader.call("flaky:cap", {
        fail: false,
        attempt: 3,
      });
      assertEquals((result3 as { attempt: number }).attempt, 3);

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
  name: "E2E AC10: Registry error returns appropriate error type",
  async fn() {
    const ctx = await setupE2EContext();
    const mockServer = await createMockServer({ port: 3072 });

    try {
      // Set up error response for registry
      // Note: loader.call("not:found") converts to FQDN "pml.mcp.not.found"
      mockServer.setMcpResponse("pml.mcp.not.found", {
        error: { code: 404, message: "Capability not found in registry" },
      });

      const loader = await createErrorTestLoader(ctx, mockServer);

      try {
        await loader.call("not:found", {});
        throw new Error("Expected registry error");
      } catch (error) {
        const msg = (error as Error).message.toLowerCase();
        assertEquals(
          msg.includes("not found") ||
            msg.includes("404") ||
            msg.includes("registry"),
          true,
          `Expected registry error, got: ${(error as Error).message}`,
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
  name: "E2E AC10: Memory leak prevention - sandbox cleanup",
  async fn() {
    const ctx = await setupE2EContext();
    const mockServer = await createMockServer({ port: 3071 });

    try {
      // Note: loader.call("mem:test") converts to FQDN "pml.mcp.mem.test"
      mockServer.setMcpResponse("pml.mcp.mem.test", {
        fqdn: "pml.mcp.mem.test",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/pml.mcp.mem.test.ts`,
        tools: ["test"],
        routing: "client",
        description: "Memory test",
        code: `
          // Create some data
          const data = Array.from({ length: 1000 }, (_, i) => ({ id: i, value: "x".repeat(100) }));
          return { count: data.length };
        `,
      });

      const loader = await createErrorTestLoader(ctx, mockServer);

      // Run multiple iterations
      for (let i = 0; i < 10; i++) {
        const result = await loader.call("mem:test", { iteration: i });
        assertEquals((result as { count: number }).count, 1000);
      }

      // Get status to verify no resource leaks
      const status = loader.getStatus();
      assertEquals(status.initialized, true);
      assertEquals(status.loadedCapabilities, 1); // Only one capability loaded (cached)

      await loader.shutdown();

      // After shutdown, verify cleanup
      const statusAfter = loader.getStatus();
      assertEquals(statusAfter.loadedCapabilities, 0);
      assertEquals(statusAfter.runningProcesses.length, 0);
    } finally {
      mockServer.shutdown();
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "E2E AC10: Mixed errors and successes handled correctly",
  async fn() {
    const ctx = await setupE2EContext();
    const mockServer = await createMockServer({ port: 3070 });

    try {
      // Note: loader.call("mixed:cap") converts to FQDN "pml.mcp.mixed.cap"
      mockServer.setMcpResponse("pml.mcp.mixed.cap", {
        fqdn: "pml.mcp.mixed.cap",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/pml.mcp.mixed.cap.ts`,
        tools: ["cap"],
        routing: "client",
        description: "Mixed results",
        code: `
          if (args.id % 3 === 0) {
            throw new Error("Every third call fails");
          }
          return { id: args.id, ok: true };
        `,
      });

      const loader = await createErrorTestLoader(ctx, mockServer);

      const results: Array<{ id: number; success: boolean }> = [];

      for (let i = 1; i <= 9; i++) {
        try {
          await loader.call("mixed:cap", { id: i });
          results.push({ id: i, success: true });
        } catch {
          results.push({ id: i, success: false });
        }
      }

      // Verify pattern: 1,2,3,4,5,6,7,8,9 -> 3,6,9 should fail
      assertEquals(results.length, 9);
      assertEquals(results[0].success, true); // 1
      assertEquals(results[1].success, true); // 2
      assertEquals(results[2].success, false); // 3 fails
      assertEquals(results[3].success, true); // 4
      assertEquals(results[4].success, true); // 5
      assertEquals(results[5].success, false); // 6 fails
      assertEquals(results[6].success, true); // 7
      assertEquals(results[7].success, true); // 8
      assertEquals(results[8].success, false); // 9 fails

      await loader.shutdown();
    } finally {
      mockServer.shutdown();
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
