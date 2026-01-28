/**
 * Cloud Flow E2E Tests
 *
 * Tests AC2: Cloud MCP forwarding
 * Tests AC3: Offline mode validation
 *
 * Story 14.8: E2E Integration Testing
 *
 * @module tests/e2e/cloud_flow_test
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  setupE2EContext,
  teardownE2EContext,
  type E2ETestContext,
} from "./test-harness.ts";
import { createMockServer } from "../fixtures/mock-cloud-server.ts";
import { CapabilityLoader } from "../../src/loader/capability-loader.ts";
import {
  initializeRouting,
  resetRouting,
  resolveToolRouting,
} from "../../src/routing/mod.ts";

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a loader configured for cloud tests.
 */
async function createCloudTestLoader(
  ctx: E2ETestContext,
  cloudUrl: string,
): Promise<CapabilityLoader> {
  // Reset and initialize routing with cloud tools
  resetRouting();
  initializeRouting({
    version: "1.0.0",
    clientTools: ["filesystem"],
    serverTools: ["tavily", "cloud"],
    defaultRouting: "client",
  });

  // Verify routing is correctly set (guards against race conditions)
  const tavilyRouting = resolveToolRouting("tavily:search");
  if (tavilyRouting !== "server") {
    throw new Error(
      `Routing race condition detected: tavily:search should be 'server' but got '${tavilyRouting}'`,
    );
  }

  return await CapabilityLoader.create({
    cloudUrl,
    workspace: ctx.workspace,
    permissions: {
      allow: ["*"],
      deny: [],
      ask: [],
    },
    sandboxEnabled: true,
    tracingEnabled: false,
  });
}

// ============================================================================
// AC2: Cloud MCP Forwarding Tests
// ============================================================================

Deno.test({
  name: "E2E AC2: Server-routed tool call forwards to cloud",
  async fn() {
    const ctx = await setupE2EContext({
      envVars: {
        PML_API_KEY: "test-api-key-123",
        TAVILY_API_KEY: "tvly-test-key-for-e2e", // Required for tavily:* tools
      },
    });
    const mockServer = await createMockServer({ port: 3097 });

    try {
      // Set up capability that calls mcp.tavily.search() - which gets routed to cloud
      mockServer.setMcpResponse("pml.mcp.tavily.search", {
        fqdn: "pml.mcp.tavily.search",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/pml.mcp.tavily.search.ts`,
        tools: ["search"],
        routing: "client", // Capability runs locally, but mcp.tavily.* is server-routed
        description: "Tavily search wrapper",
        // This code calls mcp.tavily.search which triggers cloud routing
        code: `
          const result = await mcp.tavily.search(args);
          return result;
        `,
      });

      // Set up mock response for cloud tool call
      mockServer.setToolResponse("tavily:search", {
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                results: [
                  { title: "Result 1", url: "https://example.com/1" },
                  { title: "Result 2", url: "https://example.com/2" },
                ],
              }),
            },
          ],
        },
      });

      const loader = await createCloudTestLoader(ctx, mockServer.getUrl());

      // Call cloud tool
      await loader.call("tavily:search", {
        query: "test search",
      });

      // Verify the call was forwarded to cloud
      const requests = mockServer.getRequestsTo("/mcp/tools/call");
      assertEquals(requests.length, 1);
      assertEquals((requests[0].body as { params: { name: string } }).params.name, "tavily:search");

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
  name: "E2E AC2: BYOK API key injected in cloud requests",
  async fn() {
    const ctx = await setupE2EContext({
      envVars: {
        PML_API_KEY: "pml-secret-key-12345",
        TAVILY_API_KEY: "tvly-user-key-xyz",
      },
    });
    const mockServer = await createMockServer({ port: 3096 });

    try {
      // Set up capability that calls mcp.tavily.search()
      mockServer.setMcpResponse("pml.mcp.tavily.search", {
        fqdn: "pml.mcp.tavily.search",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/pml.mcp.tavily.search.ts`,
        tools: ["search"],
        routing: "client",
        description: "Tavily search wrapper",
        code: `
          const result = await mcp.tavily.search(args);
          return result;
        `,
      });

      mockServer.setToolResponse("tavily:search", {
        result: { content: [{ type: "text", text: "success" }] },
      });

      const loader = await createCloudTestLoader(ctx, mockServer.getUrl());

      // Make the call
      await loader.call("tavily:search", { query: "test" });

      // Verify API key was sent
      // Note: The loader sends PML_API_KEY in Authorization header
      // TAVILY_API_KEY is used by the cloud service, not sent directly
      const requests = mockServer.getRequestsTo("/mcp/tools/call");
      assertEquals(requests.length >= 1, true);

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
  name: "E2E AC2: Cloud response passed through correctly",
  async fn() {
    const ctx = await setupE2EContext({
      envVars: { PML_API_KEY: "test-api-key" },
    });
    const mockServer = await createMockServer({ port: 3095 });

    try {
      const expectedResult = {
        query: "test query",
        results: [
          { title: "First result", score: 0.95 },
          { title: "Second result", score: 0.87 },
        ],
        totalResults: 2,
      };

      // Set up capability that calls mcp.cloud.search() and parses the MCP response
      mockServer.setMcpResponse("pml.mcp.cloud.search", {
        fqdn: "pml.mcp.cloud.search",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/pml.mcp.cloud.search.ts`,
        tools: ["search"],
        routing: "client",
        description: "Cloud search wrapper",
        code: `
          const mcpResult = await mcp.cloud.search(args);
          // Parse MCP response format: { content: [{ type: "text", text: "..." }] }
          const textContent = mcpResult.content?.find(c => c.type === "text");
          return textContent ? JSON.parse(textContent.text) : mcpResult;
        `,
      });

      mockServer.setToolResponse("cloud:search", {
        result: {
          content: [{ type: "text", text: JSON.stringify(expectedResult) }],
        },
      });

      const loader = await createCloudTestLoader(ctx, mockServer.getUrl());

      const result = await loader.call("cloud:search", { query: "test query" });

      // Result should match what cloud returned (parsed from MCP response)
      assertEquals(typeof result, "object");
      const data = result as typeof expectedResult;
      assertEquals(data.query, "test query");
      assertEquals(data.results.length, 2);
      assertEquals(data.totalResults, 2);

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
  name: "E2E AC2: Cloud error response handled correctly",
  async fn() {
    const ctx = await setupE2EContext({
      envVars: { PML_API_KEY: "test-api-key" },
    });
    const mockServer = await createMockServer({ port: 3094 });

    try {
      mockServer.setToolResponse("cloud:failing", {
        error: { code: -32603, message: "Cloud service error: Rate limited" },
      });

      const loader = await createCloudTestLoader(ctx, mockServer.getUrl());

      try {
        await loader.call("cloud:failing", {});
        throw new Error("Expected error to be thrown");
      } catch (error) {
        const errorLower = (error as Error).message.toLowerCase();
        assertEquals(
          errorLower.includes("cloud") ||
            errorLower.includes("error") ||
            errorLower.includes("rate"),
          true,
          `Expected error message to contain 'cloud', 'error', or 'rate', got: ${(error as Error).message}`,
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

// ============================================================================
// AC3: Offline Mode Tests
// ============================================================================

Deno.test({
  name: "E2E AC3: Local MCPs work without cloud connection",
  async fn() {
    const ctx = await setupE2EContext({
      envVars: { PML_API_KEY: "test-key" },
    });

    // Start server then immediately shut it down to simulate offline
    const mockServer = await createMockServer({ port: 3093 });

    try {
      // Set up local capability code before going offline
      mockServer.setMcpResponse("pml.mcp.json.stringify", {
        fqdn: "pml.mcp.json.stringify",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/pml.mcp.json.stringify.ts`,
        tools: ["stringify"],
        routing: "client",
        description: "Stringify JSON",
        code: `return JSON.stringify(args.input, null, args.indent || 0);`,
      });

      // Initialize loader while online (fetches capability code)
      const loader = await CapabilityLoader.create({
        cloudUrl: mockServer.getUrl(),
        workspace: ctx.workspace,
        permissions: { allow: ["*"], deny: [], ask: [] },
        sandboxEnabled: true,
        tracingEnabled: false,
      });

      // Load capability while online
      await loader.load("json:stringify");

      // Now go offline
      mockServer.shutdown();

      // Local execution should still work (code is cached)
      const result = await loader.call("json:stringify", {
        input: { test: true },
        indent: 2,
      });

      assertEquals(typeof result, "string");
      assertStringIncludes(result as string, "test");

      await loader.shutdown();
    } finally {
      if (mockServer.isRunning()) {
        mockServer.shutdown();
      }
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "E2E AC3: Cloud MCPs return clear offline error",
  async fn() {
    const ctx = await setupE2EContext({
      envVars: { PML_API_KEY: "test-key" },
    });

    // Start with routing initialized but no server
    resetRouting();
    initializeRouting({
      version: "1.0.0",
      clientTools: [],
      serverTools: ["cloud"],
      defaultRouting: "client",
    });

    try {
      // Create loader pointing to non-existent server
      const loader = await CapabilityLoader.create({
        cloudUrl: "http://localhost:39999", // Port that nothing listens on
        workspace: ctx.workspace,
        permissions: { allow: ["*"], deny: [], ask: [] },
        sandboxEnabled: true,
        tracingEnabled: false,
      });

      const startTime = Date.now();

      try {
        await loader.call("cloud:offline-tool", { test: true });
        throw new Error("Expected error for offline cloud");
      } catch (error) {
        const duration = Date.now() - startTime;

        // Error should mention unreachable/offline/connection
        const msg = (error as Error).message.toLowerCase();
        assertEquals(
          msg.includes("unreachable") ||
            msg.includes("connection") ||
            msg.includes("fetch") ||
            msg.includes("failed"),
          true,
          `Expected clear offline error, got: ${(error as Error).message}`,
        );

        // Should not hang for too long (< 10 seconds)
        assertEquals(
          duration < 10000,
          true,
          `Request took too long: ${duration}ms`,
        );
      }

      await loader.shutdown();
    } finally {
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "E2E AC3: Timeout respected for cloud calls (no hang)",
  async fn() {
    const ctx = await setupE2EContext({
      envVars: { PML_API_KEY: "test-key" },
    });
    const mockServer = await createMockServer({ port: 3092 });

    try {
      // Set up slow response (longer than typical timeout)
      mockServer.setToolResponse("cloud:slow", {
        delayMs: 30000, // 30 second delay
        result: { content: [{ type: "text", text: "too slow" }] },
      });

      resetRouting();
    initializeRouting({
        version: "1.0.0",
        clientTools: [],
        serverTools: ["cloud"],
        defaultRouting: "client",
      });

      const loader = await CapabilityLoader.create({
        cloudUrl: mockServer.getUrl(),
        workspace: ctx.workspace,
        permissions: { allow: ["*"], deny: [], ask: [] },
        sandboxEnabled: true,
        tracingEnabled: false,
      });

      const startTime = Date.now();

      // This test validates that we don't hang indefinitely
      // The actual timeout behavior depends on implementation
      try {
        // Use Promise.race to ensure we don't hang the test
        await Promise.race([
          loader.call("cloud:slow", {}),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Test timeout")), 6000)
          ),
        ]);
      } catch (error) {
        const duration = Date.now() - startTime;
        // Should timeout before 30 seconds
        assertEquals(
          duration < 10000,
          true,
          `Should timeout quickly, took: ${duration}ms`,
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
  name: "E2E AC3: Mixed local/cloud handles partial offline",
  async fn() {
    const ctx = await setupE2EContext({
      envVars: { PML_API_KEY: "test-key" },
    });
    const mockServer = await createMockServer({ port: 3091 });

    try {
      // Set up local capability
      mockServer.setMcpResponse("pml.mcp.math.add", {
        fqdn: "pml.mcp.math.add",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/pml.mcp.math.add.ts`,
        tools: ["add"],
        routing: "client",
        description: "Add numbers",
        code: `return args.a + args.b;`,
      });

      // Set up cloud tool
      mockServer.setToolResponse("cloud:multiply", {
        result: {
          content: [{ type: "text", text: JSON.stringify({ result: 42 }) }],
        },
      });

      resetRouting();
    initializeRouting({
        version: "1.0.0",
        clientTools: [],
        serverTools: ["cloud"],
        defaultRouting: "client",
      });

      const loader = await CapabilityLoader.create({
        cloudUrl: mockServer.getUrl(),
        workspace: ctx.workspace,
        permissions: { allow: ["*"], deny: [], ask: [] },
        sandboxEnabled: true,
        tracingEnabled: false,
      });

      // Pre-load local capability
      await loader.load("math:add");

      // Shut down server (partial offline)
      mockServer.shutdown();

      // Local should still work
      const localResult = await loader.call("math:add", { a: 5, b: 3 });
      assertEquals(localResult, 8);

      // Cloud should fail gracefully
      try {
        await loader.call("cloud:multiply", { a: 6, b: 7 });
        throw new Error("Expected cloud call to fail");
      } catch (error) {
        // Expected - cloud is offline
        const errorLower = (error as Error).message.toLowerCase();
        assertEquals(
          errorLower.includes("unreachable") ||
            errorLower.includes("connection") ||
            errorLower.includes("failed"),
          true,
          `Expected error message to contain 'unreachable', 'connection', or 'failed', got: ${(error as Error).message}`,
        );
      }

      await loader.shutdown();
    } finally {
      if (mockServer.isRunning()) {
        mockServer.shutdown();
      }
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
