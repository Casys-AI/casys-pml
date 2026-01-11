/**
 * Sandbox RPC Bridge Tests
 *
 * Tests that mcp.* calls from sandbox are properly routed via RPC.
 * The sandbox should be able to call mcp.namespace.action() and
 * receive responses from the main thread.
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { SandboxWorker } from "../src/sandbox/mod.ts";

Deno.test({
  name: "Sandbox RPC: mcp.* proxy sends RPC messages",
  async fn() {
    const rpcCalls: { method: string; args: unknown }[] = [];

    const sandbox = new SandboxWorker({
      onRpc: async (method, args) => {
        rpcCalls.push({ method, args });
        return { success: true, data: "mock response" };
      },
    });

    try {
      const result = await sandbox.execute(
        `
        const response = await mcp.filesystem.read_file({ path: "/test.txt" });
        return response;
        `,
        {},
      );

      assertEquals(result.success, true);
      assertEquals(result.value, { success: true, data: "mock response" });

      // Verify RPC was called with correct format
      assertEquals(rpcCalls.length, 1);
      assertEquals(rpcCalls[0].method, "filesystem:read_file");
      assertEquals(rpcCalls[0].args, { path: "/test.txt" });
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Sandbox RPC: multiple mcp.* calls work",
  async fn() {
    const rpcCalls: { method: string; args: unknown }[] = [];

    const sandbox = new SandboxWorker({
      onRpc: async (method, args) => {
        rpcCalls.push({ method, args });
        if (method === "filesystem:read_file") {
          return "file content";
        }
        if (method === "shell:exec") {
          return { stdout: "output", exitCode: 0 };
        }
        return null;
      },
    });

    try {
      const result = await sandbox.execute(
        `
        const file = await mcp.filesystem.read_file({ path: "/test.txt" });
        const shell = await mcp.shell.exec({ command: "ls" });
        return { file, shell };
        `,
        {},
      );

      assertEquals(result.success, true);
      const value = result.value as { file: string; shell: { stdout: string; exitCode: number } };
      assertEquals(value.file, "file content");
      assertEquals(value.shell.stdout, "output");

      // Verify both RPCs were called
      assertEquals(rpcCalls.length, 2);
      assertEquals(rpcCalls[0].method, "filesystem:read_file");
      assertEquals(rpcCalls[1].method, "shell:exec");
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Sandbox RPC: errors from RPC handler propagate correctly",
  async fn() {
    const sandbox = new SandboxWorker({
      onRpc: async () => {
        throw new Error("Permission denied by HIL");
      },
    });

    try {
      const result = await sandbox.execute(
        `
        try {
          await mcp.filesystem.read_file({ path: "/secret.txt" });
          return { caught: false };
        } catch (e) {
          return { caught: true, error: e.message };
        }
        `,
        {},
      );

      assertEquals(result.success, true);
      const value = result.value as { caught: boolean; error?: string };
      assertEquals(value.caught, true);
      assertStringIncludes(value.error ?? "", "Permission denied");
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Sandbox RPC: sequential mcp.* calls maintain order",
  async fn() {
    const callOrder: number[] = [];
    let callCount = 0;

    const sandbox = new SandboxWorker({
      onRpc: async (method, _args) => {
        const idx = ++callCount;
        callOrder.push(idx);
        // Simulate varying response times
        await new Promise((r) => setTimeout(r, Math.random() * 20));
        return { order: idx, method };
      },
    });

    try {
      const result = await sandbox.execute(
        `
        const r1 = await mcp.test.call1({});
        const r2 = await mcp.test.call2({});
        const r3 = await mcp.test.call3({});
        return [r1.order, r2.order, r3.order];
        `,
        {},
      );

      assertEquals(result.success, true);
      // Sequential calls should return in order 1, 2, 3
      assertEquals(result.value, [1, 2, 3]);
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Sandbox RPC: parallel mcp.* calls work correctly",
  async fn() {
    const startTimes: number[] = [];

    const sandbox = new SandboxWorker({
      onRpc: async (method, _args) => {
        startTimes.push(Date.now());
        await new Promise((r) => setTimeout(r, 50)); // 50ms delay
        return method;
      },
    });

    try {
      const startTime = Date.now();
      const result = await sandbox.execute(
        `
        // Fire 3 calls in parallel
        const [r1, r2, r3] = await Promise.all([
          mcp.test.call1({}),
          mcp.test.call2({}),
          mcp.test.call3({}),
        ]);
        return [r1, r2, r3];
        `,
        {},
      );
      const duration = Date.now() - startTime;

      assertEquals(result.success, true);
      assertEquals(result.value, ["test:call1", "test:call2", "test:call3"]);

      // Parallel calls should complete in ~50-100ms, not 150ms+
      // (with some margin for test flakiness)
      assertEquals(duration < 200, true, `Expected <200ms but took ${duration}ms`);
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Sandbox RPC: complex nested mcp.* calls work",
  async fn() {
    const sandbox = new SandboxWorker({
      onRpc: async (method, args) => {
        if (method === "memory:get") {
          const key = (args as { key: string }).key;
          if (key === "user") return { name: "Alice", id: 1 };
          return null;
        }
        if (method === "memory:set") {
          return { success: true };
        }
        return null;
      },
    });

    try {
      const result = await sandbox.execute(
        `
        const user = await mcp.memory.get({ key: "user" });
        const updated = { ...user, lastSeen: "now" };
        const saveResult = await mcp.memory.set({ key: "user", value: updated });
        return { user, saveResult };
        `,
        {},
      );

      assertEquals(result.success, true);
      const value = result.value as {
        user: { name: string; id: number };
        saveResult: { success: boolean };
      };
      assertEquals(value.user.name, "Alice");
      assertEquals(value.saveResult.success, true);
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Sandbox RPC: RPC with args from input args",
  async fn() {
    const sandbox = new SandboxWorker({
      onRpc: async (method, rpcArgs) => {
        return { method, received: rpcArgs };
      },
    });

    try {
      const result = await sandbox.execute(
        `
        // Use input args in RPC call
        const response = await mcp.custom.process({
          inputData: args.data,
          multiplier: args.factor * 2,
        });
        return response;
        `,
        { data: "hello", factor: 5 },
      );

      assertEquals(result.success, true);
      const value = result.value as { method: string; received: { inputData: string; multiplier: number } };
      assertEquals(value.method, "custom:process");
      assertEquals(value.received.inputData, "hello");
      assertEquals(value.received.multiplier, 10);
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
