/**
 * Sandbox Isolation Tests
 *
 * Tests that the sandbox properly blocks direct system access.
 * Capability code should NOT be able to:
 * - Read files directly (Deno.readFile)
 * - Make network requests (fetch)
 * - Spawn processes (Deno.Command)
 * - Access environment variables (Deno.env)
 *
 * The ONLY way out is via mcp.* RPC calls.
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { SandboxWorker } from "../src/sandbox/mod.ts";

Deno.test({
  name: "Sandbox: blocks direct filesystem access (Deno.readFile)",
  async fn() {
    const sandbox = new SandboxWorker({
      onRpc: async () => {
        throw new Error("RPC should not be called");
      },
    });

    try {
      const result = await sandbox.execute(
        `
        try {
          await Deno.readFile("/etc/passwd");
          return { blocked: false };
        } catch (e) {
          return { blocked: true, error: e.message };
        }
        `,
        {},
      );

      assertEquals(result.success, true);
      const value = result.value as { blocked: boolean; error?: string };
      assertEquals(value.blocked, true);
      // Deno says "Requires read access" when permission denied
      assertStringIncludes(value.error ?? "", "Requires");
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Sandbox: blocks direct network access (fetch)",
  async fn() {
    const sandbox = new SandboxWorker({
      onRpc: async () => {
        throw new Error("RPC should not be called");
      },
    });

    try {
      const result = await sandbox.execute(
        `
        try {
          await fetch("https://example.com");
          return { blocked: false };
        } catch (e) {
          return { blocked: true, error: e.message };
        }
        `,
        {},
      );

      assertEquals(result.success, true);
      const value = result.value as { blocked: boolean; error?: string };
      assertEquals(value.blocked, true);
      // Deno says "Requires net access" when permission denied
      assertStringIncludes(value.error ?? "", "Requires");
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Sandbox: blocks subprocess spawning (Deno.Command)",
  async fn() {
    const sandbox = new SandboxWorker({
      onRpc: async () => {
        throw new Error("RPC should not be called");
      },
    });

    try {
      const result = await sandbox.execute(
        `
        try {
          const cmd = new Deno.Command("ls", { args: ["-la"] });
          await cmd.output();
          return { blocked: false };
        } catch (e) {
          return { blocked: true, error: e.message };
        }
        `,
        {},
      );

      assertEquals(result.success, true);
      const value = result.value as { blocked: boolean; error?: string };
      assertEquals(value.blocked, true);
      // Deno says "Requires run access" when permission denied
      assertStringIncludes(value.error ?? "", "Requires");
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Sandbox: blocks environment variable access (Deno.env)",
  async fn() {
    const sandbox = new SandboxWorker({
      onRpc: async () => {
        throw new Error("RPC should not be called");
      },
    });

    try {
      const result = await sandbox.execute(
        `
        try {
          const value = Deno.env.get("HOME");
          return { blocked: false, value };
        } catch (e) {
          return { blocked: true, error: e.message };
        }
        `,
        {},
      );

      assertEquals(result.success, true);
      const value = result.value as { blocked: boolean; error?: string };
      assertEquals(value.blocked, true);
      // Deno says "Requires env access" when permission denied
      assertStringIncludes(value.error ?? "", "Requires");
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Sandbox: basic code execution works",
  async fn() {
    const sandbox = new SandboxWorker({
      onRpc: async () => {
        throw new Error("RPC should not be called");
      },
    });

    try {
      const result = await sandbox.execute(
        `
        const x = 1 + 2;
        return x * 10;
        `,
        {},
      );

      assertEquals(result.success, true);
      assertEquals(result.value, 30);
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Sandbox: args are accessible in code",
  async fn() {
    const sandbox = new SandboxWorker({
      onRpc: async () => {
        throw new Error("RPC should not be called");
      },
    });

    try {
      const result = await sandbox.execute(
        `
        return { received: args, doubled: args.value * 2 };
        `,
        { value: 21 },
      );

      assertEquals(result.success, true);
      const value = result.value as { received: { value: number }; doubled: number };
      assertEquals(value.received.value, 21);
      assertEquals(value.doubled, 42);
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Sandbox: code errors are captured",
  async fn() {
    const sandbox = new SandboxWorker({
      onRpc: async () => {
        throw new Error("RPC should not be called");
      },
    });

    try {
      const result = await sandbox.execute(
        `
        throw new Error("Intentional error");
        `,
        {},
      );

      assertEquals(result.success, false);
      assertEquals(result.error?.code, "CODE_ERROR");
      assertStringIncludes(result.error?.message ?? "", "Intentional error");
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Sandbox: async code works",
  async fn() {
    const sandbox = new SandboxWorker({
      onRpc: async () => {
        throw new Error("RPC should not be called");
      },
    });

    try {
      const result = await sandbox.execute(
        `
        const delay = (ms) => new Promise(r => setTimeout(r, ms));
        await delay(50);
        return "async works";
        `,
        {},
      );

      assertEquals(result.success, true);
      assertEquals(result.value, "async works");
    } finally {
      sandbox.shutdown();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
