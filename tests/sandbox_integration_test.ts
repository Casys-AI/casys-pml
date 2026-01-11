/**
 * Sandbox Integration Tests
 *
 * Tests the full sandbox flow including:
 * - Timeout handling
 * - Shutdown behavior
 * - Resource cleanup
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { SandboxWorker } from "../src/sandbox/mod.ts";

Deno.test({
  name: "Sandbox Integration: execution timeout works",
  async fn() {
    const sandbox = new SandboxWorker({
      onRpc: async () => null,
      executionTimeoutMs: 200, // Short timeout for test
    });

    try {
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
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Sandbox Integration: can execute after previous execution",
  async fn() {
    const sandbox = new SandboxWorker({
      onRpc: async () => null,
    });

    try {
      // First execution
      const result1 = await sandbox.execute(
        `return 1;`,
        {},
      );
      assertEquals(result1.success, true);
      assertEquals(result1.value, 1);

      // Second execution
      const result2 = await sandbox.execute(
        `return 2;`,
        {},
      );
      assertEquals(result2.success, true);
      assertEquals(result2.value, 2);
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Sandbox Integration: shutdown prevents further execution",
  async fn() {
    const sandbox = new SandboxWorker({
      onRpc: async () => null,
    });

    // Execute once
    const result1 = await sandbox.execute(
      `return "before shutdown";`,
      {},
    );
    assertEquals(result1.success, true);

    // Shutdown
    sandbox.shutdown();

    // Try to execute after shutdown
    const result2 = await sandbox.execute(
      `return "after shutdown";`,
      {},
    );
    assertEquals(result2.success, false);
    assertEquals(result2.error?.code, "WORKER_TERMINATED");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Sandbox Integration: durationMs is tracked",
  async fn() {
    const sandbox = new SandboxWorker({
      onRpc: async () => null,
    });

    try {
      const result = await sandbox.execute(
        `
        await new Promise(r => setTimeout(r, 100));
        return "done";
        `,
        {},
      );

      assertEquals(result.success, true);
      assertEquals(result.durationMs >= 100, true, `Expected >=100ms but got ${result.durationMs}ms`);
      assertEquals(result.durationMs < 500, true, `Expected <500ms but got ${result.durationMs}ms`);
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Sandbox Integration: isActive reflects state correctly",
  async fn() {
    const sandbox = new SandboxWorker({
      onRpc: async () => null,
    });

    // Initially not active (no worker created yet)
    assertEquals(sandbox.isActive(), false);

    // After execution, should be active
    await sandbox.execute(`return 1;`, {});
    assertEquals(sandbox.isActive(), true);

    // After shutdown, should not be active
    sandbox.shutdown();
    assertEquals(sandbox.isActive(), false);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Sandbox Integration: RPC timeout works",
  async fn() {
    const sandbox = new SandboxWorker({
      onRpc: async () => {
        // Simulate slow RPC that exceeds timeout
        await new Promise((r) => setTimeout(r, 5000));
        return "should not reach";
      },
      rpcTimeoutMs: 200, // Short timeout for test
    });

    try {
      const result = await sandbox.execute(
        `
        try {
          await mcp.slow.call({});
          return { timedOut: false };
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
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Sandbox Integration: large data passes through RPC",
  async fn() {
    const sandbox = new SandboxWorker({
      onRpc: async (_method, args) => {
        // Echo back the data
        return args;
      },
    });

    try {
      // Create large array in sandbox and pass via RPC
      const result = await sandbox.execute(
        `
        const largeArray = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          data: "item-" + i.toString().padStart(4, "0"),
        }));
        const echoed = await mcp.test.echo({ items: largeArray });
        return echoed.items.length;
        `,
        {},
      );

      assertEquals(result.success, true);
      assertEquals(result.value, 1000);
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Sandbox Integration: security - cannot access globalThis.Deno",
  async fn() {
    const sandbox = new SandboxWorker({
      onRpc: async () => null,
    });

    try {
      const result = await sandbox.execute(
        `
        // Try various ways to access Deno APIs
        const tests = [];

        // Direct Deno access
        try {
          await Deno.readFile("/etc/passwd");
          tests.push("Deno.readFile: ACCESSIBLE");
        } catch (e) {
          tests.push("Deno.readFile: blocked");
        }

        // globalThis.Deno
        try {
          await globalThis.Deno.readFile("/etc/passwd");
          tests.push("globalThis.Deno: ACCESSIBLE");
        } catch (e) {
          tests.push("globalThis.Deno: blocked");
        }

        // self.Deno (in worker context)
        try {
          await self.Deno.readFile("/etc/passwd");
          tests.push("self.Deno: ACCESSIBLE");
        } catch (e) {
          tests.push("self.Deno: blocked");
        }

        return tests;
        `,
        {},
      );

      assertEquals(result.success, true);
      const tests = result.value as string[];
      // All should be blocked
      for (const test of tests) {
        assertStringIncludes(test, "blocked");
      }
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Sandbox Integration: mcp proxy is the only way to interact with outside",
  async fn() {
    let rpcWasCalled = false;

    const sandbox = new SandboxWorker({
      onRpc: async () => {
        rpcWasCalled = true;
        return "success via mcp";
      },
    });

    try {
      const result = await sandbox.execute(
        `
        // Try direct access - should fail
        let directFailed = false;
        try {
          await fetch("https://example.com");
        } catch {
          directFailed = true;
        }

        // Use mcp - should succeed
        const mcpResult = await mcp.http.fetch({ url: "https://example.com" });

        return { directFailed, mcpResult };
        `,
        {},
      );

      assertEquals(result.success, true);
      const value = result.value as { directFailed: boolean; mcpResult: string };
      assertEquals(value.directFailed, true);
      assertEquals(value.mcpResult, "success via mcp");
      assertEquals(rpcWasCalled, true);
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
