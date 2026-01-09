/**
 * Local Flow E2E Tests
 *
 * Tests AC1: Full flow for local MCP execution
 * Tests AC4: Permission boundary (file access)
 * Tests AC5: Network isolation
 *
 * Story 14.8: E2E Integration Testing
 *
 * @module tests/e2e/local_flow_test
 */

import { assertEquals } from "@std/assert";
import {
  setupE2EContext,
  teardownE2EContext,
  type E2ETestContext,
} from "./test-harness.ts";
import { createMockServer, type MockCloudServer } from "./mock-cloud-server.ts";
import { CapabilityLoader } from "../../src/loader/capability-loader.ts";
import { SandboxWorker } from "../../src/sandbox/mod.ts";

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a loader with mock server for testing.
 */
async function createTestLoader(
  ctx: E2ETestContext,
  mockServer: MockCloudServer,
): Promise<CapabilityLoader> {
  return await CapabilityLoader.create({
    cloudUrl: mockServer.getUrl(),
    workspace: ctx.workspace,
    permissions: {
      allow: ["filesystem:*", "json:*"],
      deny: [],
      ask: ["*"],
    },
    sandboxEnabled: true,
    tracingEnabled: false, // Disable for tests
  });
}

// ============================================================================
// AC1: Full Local Flow Tests
// ============================================================================

Deno.test({
  name: "E2E AC1: Full local flow - sandbox execution with mcp proxy",
  async fn() {
    const ctx = await setupE2EContext();
    const mockServer = await createMockServer({ port: 3098 });

    try {
      // Set up mock capability that uses mcp.* proxy
      // RegistryClient converts "json:parse" to FQDN "pml.mcp.json.parse"
      const fqdn = "pml.mcp.json.parse";
      mockServer.setMcpResponse(fqdn, {
        fqdn,
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/${fqdn}.ts`,
        tools: ["parse"],
        routing: "client",
        description: "Parse JSON",
        // Note: Sandbox expects code to be the BODY of an async function,
        // NOT an ES module. The code runs with `mcp` and `args` in scope.
        code: `
          // This code runs in sandbox as async function body
          const input = args.input || "{}";
          try {
            const parsed = JSON.parse(input);
            return { success: true, data: parsed };
          } catch (e) {
            return { success: false, error: e.message };
          }
        `,
      });

      const loader = await createTestLoader(ctx, mockServer);

      // Call the capability
      const result = await loader.call("json:parse", {
        input: '{"name": "test", "value": 42}',
      });

      assertEquals(typeof result, "object");
      const data = result as { success: boolean; data?: { name: string; value: number } };
      assertEquals(data.success, true);
      assertEquals(data.data?.name, "test");
      assertEquals(data.data?.value, 42);

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
  name: "E2E AC1: Sandbox executes code in isolated environment",
  async fn() {
    const ctx = await setupE2EContext();

    try {
      // Create sandbox directly
      const sandbox = new SandboxWorker({
        onRpc: async (method, args) => {
          // Mock RPC handler
          if (method === "test:echo") {
            return { echoed: args };
          }
          return null;
        },
      });

      // Execute simple code
      const result = await sandbox.execute(
        `
        const sum = 1 + 2 + 3;
        return { sum, computed: true };
        `,
        {},
      );

      assertEquals(result.success, true);
      assertEquals((result.value as { sum: number }).sum, 6);
      assertEquals((result.value as { computed: boolean }).computed, true);

      sandbox.shutdown();
    } finally {
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "E2E AC1: Sandbox can call mcp.* proxy methods",
  async fn() {
    const ctx = await setupE2EContext();
    let rpcCalled = false;
    let rpcMethod = "";
    let rpcArgs: unknown = null;

    try {
      const sandbox = new SandboxWorker({
        onRpc: async (method, args) => {
          rpcCalled = true;
          rpcMethod = method;
          rpcArgs = args;
          return { result: "from-rpc" };
        },
      });

      const result = await sandbox.execute(
        `
        const response = await mcp.test.call({ input: "hello" });
        return response;
        `,
        {},
      );

      assertEquals(result.success, true);
      assertEquals(rpcCalled, true);
      assertEquals(rpcMethod, "test:call");
      assertEquals((rpcArgs as { input: string }).input, "hello");
      assertEquals((result.value as { result: string }).result, "from-rpc");

      sandbox.shutdown();
    } finally {
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ============================================================================
// AC4: Permission Boundary Tests (File Access)
// ============================================================================

Deno.test({
  name: "E2E AC4: Sandbox blocks file read outside workspace",
  async fn() {
    const ctx = await setupE2EContext();

    try {
      const sandbox = new SandboxWorker({
        onRpc: async () => null,
      });

      // Try to read /etc/passwd from sandbox
      const result = await sandbox.execute(
        `
        try {
          // Direct Deno.readFile should be blocked
          const content = await Deno.readFile("/etc/passwd");
          return { blocked: false, content: new TextDecoder().decode(content) };
        } catch (e) {
          return { blocked: true, error: e.message };
        }
        `,
        {},
      );

      assertEquals(result.success, true);
      const value = result.value as { blocked: boolean; error?: string };
      assertEquals(value.blocked, true);
      // Error should indicate read access is blocked
      const errorLower = value.error?.toLowerCase() ?? "";
      assertEquals(
        errorLower.includes("requires") ||
          errorLower.includes("access") ||
          errorLower.includes("permission"),
        true,
        `Expected access error, got: ${value.error}`,
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
  name: "E2E AC4: Sandbox blocks file write outside workspace",
  async fn() {
    const ctx = await setupE2EContext();

    try {
      const sandbox = new SandboxWorker({
        onRpc: async () => null,
      });

      // Try to write to /tmp from sandbox
      const result = await sandbox.execute(
        `
        try {
          await Deno.writeTextFile("/tmp/pml-test-blocked.txt", "should not write");
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

      sandbox.shutdown();
    } finally {
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "E2E AC4: Sandbox blocks path traversal attacks",
  async fn() {
    const ctx = await setupE2EContext();

    try {
      const sandbox = new SandboxWorker({
        onRpc: async () => null,
      });

      // Try path traversal attack
      const result = await sandbox.execute(
        `
        const attacks = [
          "../../../etc/passwd",
          "..\\\\..\\\\..\\\\etc\\\\passwd",
          "/workspace/../../../etc/passwd",
        ];

        const results = [];
        for (const path of attacks) {
          try {
            await Deno.readFile(path);
            results.push({ path, blocked: false });
          } catch (e) {
            results.push({ path, blocked: true });
          }
        }
        return results;
        `,
        {},
      );

      assertEquals(result.success, true);
      const results = result.value as Array<{ path: string; blocked: boolean }>;

      // All path traversal attempts should be blocked
      for (const r of results) {
        assertEquals(r.blocked, true, `Path traversal not blocked: ${r.path}`);
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
  name: "E2E AC4: Sandbox blocks access to globalThis.Deno",
  async fn() {
    const ctx = await setupE2EContext();

    try {
      const sandbox = new SandboxWorker({
        onRpc: async () => null,
      });

      const result = await sandbox.execute(
        `
        const accessMethods = [
          { name: "Deno.readFile", fn: () => Deno.readFile("/etc/passwd") },
          { name: "globalThis.Deno", fn: () => globalThis.Deno.readFile("/etc/passwd") },
          { name: "self.Deno", fn: () => self.Deno.readFile("/etc/passwd") },
        ];

        const results = [];
        for (const method of accessMethods) {
          try {
            await method.fn();
            results.push({ method: method.name, blocked: false });
          } catch (e) {
            results.push({ method: method.name, blocked: true, error: e.message });
          }
        }
        return results;
        `,
        {},
      );

      assertEquals(result.success, true);
      const results = result.value as Array<{ method: string; blocked: boolean }>;

      // All Deno access methods should be blocked
      for (const r of results) {
        assertEquals(r.blocked, true, `${r.method} not blocked`);
      }

      sandbox.shutdown();
    } finally {
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ============================================================================
// AC5: Network Isolation Tests
// ============================================================================

Deno.test({
  name: "E2E AC5: Sandbox blocks HTTP fetch",
  async fn() {
    const ctx = await setupE2EContext();

    try {
      const sandbox = new SandboxWorker({
        onRpc: async () => null,
      });

      const result = await sandbox.execute(
        `
        try {
          const response = await fetch("https://example.com");
          return { blocked: false, status: response.status };
        } catch (e) {
          return { blocked: true, error: e.message };
        }
        `,
        {},
      );

      assertEquals(result.success, true);
      const value = result.value as { blocked: boolean; error?: string };
      assertEquals(value.blocked, true);
      // Error message should indicate network is not allowed
      const errorLower = value.error?.toLowerCase() ?? "";
      assertEquals(
        errorLower.includes("net") ||
          errorLower.includes("network") ||
          errorLower.includes("requires") ||
          errorLower.includes("access"),
        true,
        `Expected network error message, got: ${value.error}`,
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
  name: "E2E AC5: Sandbox allows mcp proxy for network operations",
  async fn() {
    const ctx = await setupE2EContext();

    try {
      let httpCalled = false;

      const sandbox = new SandboxWorker({
        onRpc: async (method, _args) => {
          if (method === "http:fetch") {
            httpCalled = true;
            return { status: 200, body: "mock response" };
          }
          return null;
        },
      });

      const result = await sandbox.execute(
        `
        // Direct fetch blocked
        let directBlocked = false;
        try {
          await fetch("https://example.com");
        } catch {
          directBlocked = true;
        }

        // mcp.http.fetch should work (routed via RPC)
        const mcpResult = await mcp.http.fetch({ url: "https://example.com" });

        return { directBlocked, mcpResult };
        `,
        {},
      );

      assertEquals(result.success, true);
      const value = result.value as {
        directBlocked: boolean;
        mcpResult: { status: number; body: string };
      };
      assertEquals(value.directBlocked, true);
      assertEquals(httpCalled, true);
      assertEquals(value.mcpResult.status, 200);

      sandbox.shutdown();
    } finally {
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "E2E AC5: Sandbox blocks WebSocket connections",
  async fn() {
    const ctx = await setupE2EContext();

    try {
      const sandbox = new SandboxWorker({
        onRpc: async () => null,
      });

      const result = await sandbox.execute(
        `
        try {
          const ws = new WebSocket("wss://example.com/socket");
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

      sandbox.shutdown();
    } finally {
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "E2E AC5: Error message clearly explains network isolation",
  async fn() {
    const ctx = await setupE2EContext();

    try {
      const sandbox = new SandboxWorker({
        onRpc: async () => null,
      });

      const result = await sandbox.execute(
        `
        try {
          await fetch("https://api.example.com/data");
          return { error: null };
        } catch (e) {
          return { error: e.message };
        }
        `,
        {},
      );

      assertEquals(result.success, true);
      const value = result.value as { error: string | null };

      // Error should exist and indicate network/permission issue
      assertEquals(value.error !== null, true);
      // The error should be clear about the restriction
      const errorLower = value.error?.toLowerCase() ?? "";
      assertEquals(
        errorLower.includes("permission") ||
          errorLower.includes("network") ||
          errorLower.includes("not defined") ||
          errorLower.includes("denied") ||
          errorLower.includes("requires") ||
          errorLower.includes("net") ||
          errorLower.includes("access"),
        true,
        `Error should explain network isolation: ${value.error}`,
      );

      sandbox.shutdown();
    } finally {
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
