/**
 * HIL Flow E2E Tests
 *
 * Tests AC6: HIL approval flow
 * Tests AC7: Dependency installation flow
 *
 * Story 14.8: E2E Integration Testing
 *
 * @module tests/e2e/hil_flow_test
 */

import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import {
  appendEnvVar,
  setupE2EContext,
  teardownE2EContext,
  type E2ETestContext,
} from "./test-harness.ts";
import { createMockServer, MockCloudServer } from "./mock-cloud-server.ts";
import { CapabilityLoader } from "../../src/loader/capability-loader.ts";
import type { ApprovalRequiredResult } from "../../src/loader/types.ts";

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create loader with "ask" permissions for HIL testing.
 */
async function createHilTestLoader(
  ctx: E2ETestContext,
  mockServer: MockCloudServer,
  permissions?: { allow?: string[]; deny?: string[]; ask?: string[] },
): Promise<CapabilityLoader> {
  return await CapabilityLoader.create({
    cloudUrl: mockServer.getUrl(),
    workspace: ctx.workspace,
    permissions: {
      allow: permissions?.allow ?? [],
      deny: permissions?.deny ?? [],
      ask: permissions?.ask ?? ["*"],
    },
    sandboxEnabled: true,
    tracingEnabled: false,
    // Use isolated dep state per test to prevent cross-test contamination
    depStatePath: join(ctx.workspace, "dep-state.json"),
  });
}

/**
 * Check if result is approval required.
 */
function isApprovalRequired(result: unknown): result is ApprovalRequiredResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "approvalRequired" in result &&
    (result as { approvalRequired: boolean }).approvalRequired === true
  );
}

// ============================================================================
// AC6: HIL Approval Flow Tests
// ============================================================================

Deno.test({
  name: "E2E AC6: 'ask' permission returns approval_required",
  async fn() {
    const ctx = await setupE2EContext();
    const mockServer = await createMockServer({ port: 3089 });

    try {
      // Set up capability with dependency
      mockServer.setMcpResponse("casys.pml.dangerous.action", {
        fqdn: "casys.pml.dangerous.action",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/casys.pml.dangerous.action.ts`,
        tools: ["dangerous:action"],
        routing: "client",
        description: "Dangerous action",
        code: `return { done: true };`,
        mcpDeps: [
          {
            name: "dangerous-dep",
            version: "1.0.0",
            type: "stdio",
            install: "npm install dangerous-dep",
            integrity: "sha256-mock-dangerous",
          },
        ],
      });

      // Create loader with "ask" permission for all
      const loader = await createHilTestLoader(ctx, mockServer, {
        ask: ["*"],
      });

      // Call should return approval_required
      const result = await loader.call("dangerous:action", {});

      assertEquals(isApprovalRequired(result), true);
      if (isApprovalRequired(result) && result.approvalType === "dependency") {
        assertExists(result.dependency);
        assertEquals(result.dependency.name, "dangerous-dep");
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
  name: "E2E AC6: continue_workflow(approved: true) executes",
  async fn() {
    const ctx = await setupE2EContext();
    const mockServer = await createMockServer({ port: 3088 });

    try {
      mockServer.setMcpResponse("casys.pml.needs.approval", {
        fqdn: "casys.pml.needs.approval",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/casys.pml.needs.approval.ts`,
        tools: ["needs:approval"],
        routing: "client",
        description: "Needs approval",
        code: `return { executed: true, input: args.input };`,
        mcpDeps: [
          {
            name: "approval-dep",
            version: "1.0.0",
            type: "stdio",
            install: "echo 'mock install'",
            integrity: "sha256-mock-approval",
          },
        ],
      });

      const loader = await createHilTestLoader(ctx, mockServer, { ask: ["*"] });

      // First call returns approval_required
      const result1 = await loader.call("needs:approval", { input: "test" });
      assertEquals(isApprovalRequired(result1), true);

      // Second call with continue_workflow(approved: true)
      const result2 = await loader.call("needs:approval", { input: "test" }, {
        approved: true,
      });

      // Should execute successfully
      assertEquals(isApprovalRequired(result2), false);
      assertEquals((result2 as { executed: boolean }).executed, true);

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
  name: "E2E AC6: continue_workflow(approved: false) returns abort error",
  async fn() {
    const ctx = await setupE2EContext();
    const mockServer = await createMockServer({ port: 3087 });

    try {
      mockServer.setMcpResponse("casys.pml.deny.test", {
        fqdn: "casys.pml.deny.test",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/casys.pml.deny.test.ts`,
        tools: ["deny:test"],
        routing: "client",
        description: "Deny test",
        code: `return { done: true };`,
        mcpDeps: [
          {
            name: "deny-dep",
            version: "1.0.0",
            type: "stdio",
            install: "echo 'mock'",
            integrity: "sha256-mock-deny",
          },
        ],
      });

      const loader = await createHilTestLoader(ctx, mockServer, { ask: ["*"] });

      // First call returns approval_required
      const result1 = await loader.call("deny:test", {});
      assertEquals(isApprovalRequired(result1), true);

      // Second call with approved: false
      try {
        await loader.call("deny:test", {}, { approved: false });
        throw new Error("Expected abort error");
      } catch (error) {
        assertStringIncludes(
          (error as Error).message.toLowerCase(),
          "not approved",
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
  name: "E2E AC6: API key approval flow works",
  async fn() {
    const ctx = await setupE2EContext({
      envFileContent: "", // Empty .env initially
    });
    const mockServer = await createMockServer({ port: 3086 });

    try {
      // Set up capability that requires a custom API key (not set in env)
      mockServer.setMcpResponse("casys.pml.custom.api", {
        fqdn: "casys.pml.custom.api",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/casys.pml.custom.api.ts`,
        tools: ["custom:api"],
        routing: "client",
        description: "Custom API",
        code: `return { results: [] };`,
        mcpDeps: [
          {
            name: "custom-mcp",
            version: "1.0.0",
            type: "stdio",
            install: "echo 'mock'",
            integrity: "sha256-mock-custom",
            // Use a unique env var name that won't exist in test environment
            envRequired: ["E2E_TEST_CUSTOM_API_KEY"],
          },
        ],
      });

      const loader = await createHilTestLoader(ctx, mockServer, {
        allow: ["custom-mcp"], // Auto-approve dep
      });

      // Call should return api_key_required because E2E_TEST_CUSTOM_API_KEY is not set
      const result = await loader.call("custom:api", { query: "test" });

      assertEquals(isApprovalRequired(result), true);
      if (isApprovalRequired(result)) {
        assertEquals(result.approvalType, "api_key_required");
        assertExists((result as { missingKeys: string[] }).missingKeys);
        assertStringIncludes(
          (result as { missingKeys: string[] }).missingKeys.join(","),
          "E2E_TEST_CUSTOM_API_KEY",
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
// AC7: Dependency Installation Flow Tests
// ============================================================================

Deno.test({
  name: "E2E AC7: Dependency in allow list auto-installs",
  async fn() {
    const ctx = await setupE2EContext();
    const mockServer = await createMockServer({ port: 3085 });

    try {
      mockServer.setMcpResponse("casys.pml.allowed.dep", {
        fqdn: "casys.pml.allowed.dep",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/casys.pml.allowed.dep.ts`,
        tools: ["allowed:dep"],
        routing: "client",
        description: "Allowed dep",
        code: `return { autoInstalled: true };`,
        mcpDeps: [
          {
            name: "auto-dep",
            version: "1.0.0",
            type: "stdio",
            install: "echo 'auto installed'",
            integrity: "sha256-mock-auto",
          },
        ],
      });

      // Allow list includes the dependency
      const loader = await createHilTestLoader(ctx, mockServer, {
        allow: ["auto-dep"],
        ask: [],
      });

      // Should execute without approval (auto-install)
      const result = await loader.call("allowed:dep", {});

      assertEquals(isApprovalRequired(result), false);
      assertEquals((result as { autoInstalled: boolean }).autoInstalled, true);

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
  name: "E2E AC7: Dependency in deny list blocks execution",
  async fn() {
    const ctx = await setupE2EContext();
    const mockServer = await createMockServer({ port: 3084 });

    try {
      mockServer.setMcpResponse("casys.pml.denied.dep", {
        fqdn: "casys.pml.denied.dep",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/casys.pml.denied.dep.ts`,
        tools: ["denied:dep"],
        routing: "client",
        description: "Denied dep",
        code: `return {};`,
        mcpDeps: [
          {
            name: "blocked-dep",
            version: "1.0.0",
            type: "stdio",
            install: "echo 'blocked'",
            integrity: "sha256-mock-blocked",
          },
        ],
      });

      // Deny list includes the dependency
      const loader = await createHilTestLoader(ctx, mockServer, {
        allow: [],
        deny: ["blocked-dep"],
        ask: ["*"],
      });

      // Should throw error (denied)
      try {
        await loader.call("denied:dep", {});
        throw new Error("Expected deny error");
      } catch (error) {
        const errorLower = (error as Error).message?.toLowerCase() ?? "";
        assertEquals(
          errorLower.includes("deny") ||
          errorLower.includes("blocked") ||
          errorLower.includes("not approved"),
          true,
          `Expected error message to contain 'deny', 'blocked', or 'not approved', got: ${errorLower}`,
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
  name: "E2E AC7: Missing env var triggers API key HIL",
  async fn() {
    const ctx = await setupE2EContext({
      envFileContent: "", // No env vars
    });
    const mockServer = await createMockServer({ port: 3083 });

    try {
      mockServer.setMcpResponse("casys.pml.needs.key", {
        fqdn: "casys.pml.needs.key",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/casys.pml.needs.key.ts`,
        tools: ["needs:key"],
        routing: "client",
        description: "Needs key",
        code: `return { done: true };`,
        mcpDeps: [
          {
            name: "keyed-dep",
            version: "1.0.0",
            type: "stdio",
            install: "echo 'mock'",
            integrity: "sha256-mock-keyed",
            envRequired: ["MY_SECRET_KEY"],
          },
        ],
      });

      const loader = await createHilTestLoader(ctx, mockServer, {
        allow: ["keyed-dep"], // Auto-approve dep
      });

      // Should return api_key_required
      const result = await loader.call("needs:key", {});

      assertEquals(isApprovalRequired(result), true);
      if (isApprovalRequired(result)) {
        assertEquals(result.approvalType, "api_key_required");
        const missingKeys = (result as { missingKeys: string[] }).missingKeys;
        assertStringIncludes(missingKeys.join(","), "MY_SECRET_KEY");
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
  name: "E2E AC7: Subsequent calls skip install (cached)",
  async fn() {
    const ctx = await setupE2EContext();
    const mockServer = await createMockServer({ port: 3082 });

    try {
      mockServer.setMcpResponse("casys.pml.cached.dep", {
        fqdn: "casys.pml.cached.dep",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/casys.pml.cached.dep.ts`,
        tools: ["cached:dep"],
        routing: "client",
        description: "Cached dep",
        code: `return { call: args.call };`,
        mcpDeps: [
          {
            name: "cached-dep",
            version: "1.0.0",
            type: "stdio",
            install: "echo 'install'",
            integrity: "sha256-mock-cached",
          },
        ],
      });

      const loader = await createHilTestLoader(ctx, mockServer, {
        allow: ["cached-dep"],
      });

      // First call - installs
      const result1 = await loader.call("cached:dep", { call: 1 });
      assertEquals((result1 as { call: number }).call, 1);

      // Second call - should use cache (no re-install)
      const result2 = await loader.call("cached:dep", { call: 2 });
      assertEquals((result2 as { call: number }).call, 2);

      // Third call - still cached
      const result3 = await loader.call("cached:dep", { call: 3 });
      assertEquals((result3 as { call: number }).call, 3);

      // Registry should only have been called once for metadata
      const metaRequests = mockServer.getRequestsTo("/mcp/casys.pml.cached.dep");
      assertEquals(metaRequests.length, 1);

      await loader.shutdown();
    } finally {
      mockServer.shutdown();
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
