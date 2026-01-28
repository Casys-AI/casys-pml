/**
 * Integrity E2E Tests
 *
 * Tests AC8: Lockfile integrity validation
 *
 * Story 14.8: E2E Integration Testing
 *
 * @module tests/e2e/integrity_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { join } from "@std/path";
import {
  setupE2EContext,
  teardownE2EContext,
  type E2ETestContext,
} from "./test-harness.ts";
import { createMockServer, MockCloudServer } from "../fixtures/mock-cloud-server.ts";
import { CapabilityLoader } from "../../src/loader/capability-loader.ts";
import { LockfileManager } from "../../src/lockfile/lockfile-manager.ts";
import type { IntegrityApprovalRequired } from "../../src/lockfile/types.ts";

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create loader with lockfile manager for integrity tests.
 */
async function createIntegrityTestLoader(
  ctx: E2ETestContext,
  mockServer: MockCloudServer,
  lockfileManager: LockfileManager,
): Promise<CapabilityLoader> {
  return await CapabilityLoader.create({
    cloudUrl: mockServer.getUrl(),
    workspace: ctx.workspace,
    permissions: { allow: ["*"], deny: [], ask: [] },
    sandboxEnabled: true,
    tracingEnabled: false,
    lockfileManager,
    // Use isolated dep state per test
    depStatePath: join(ctx.workspace, "dep-state.json"),
  });
}

/**
 * Check if result is integrity approval required.
 */
function isIntegrityApproval(
  result: unknown,
): result is IntegrityApprovalRequired {
  return (
    typeof result === "object" &&
    result !== null &&
    "approvalRequired" in result &&
    "approvalType" in result &&
    (result as { approvalType: string }).approvalType === "integrity"
  );
}

// ============================================================================
// AC8: Lockfile Integrity Tests
// ============================================================================

Deno.test({
  name: "E2E AC8: First fetch creates lockfile entry",
  async fn() {
    const ctx = await setupE2EContext();
    const mockServer = await createMockServer({ port: 3081 });

    // Create lockfile in temp dir
    const lockfilePath = `${ctx.workspace}/.pml/mcp.lock`;
    const lockfileManager = new LockfileManager({
      lockfilePath,
      autoCreate: true,
      autoApproveNew: true,
    });

    try {
      mockServer.setMcpResponse("pml.mcp.new.capability", {
        fqdn: "pml.mcp.new.capability",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/pml.mcp.new.capability.ts`,
        tools: ["capability"],
        routing: "client",
        description: "New capability",
        code: `return { new: true };`,
        integrity: "sha256-newCapabilityHash123",
      });

      const loader = await createIntegrityTestLoader(
        ctx,
        mockServer,
        lockfileManager,
      );

      // First fetch - should create lockfile entry
      const result = await loader.call("new:capability", {});
      assertEquals((result as { new: boolean }).new, true);

      // Verify lockfile has entry
      const entry = await lockfileManager.getEntry("pml.mcp.new.capability");
      assertExists(entry);
      assertEquals(entry?.integrity, "sha256-newCapabilityHash123");
      assertEquals(entry?.approved, true);

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
  name: "E2E AC8: Hash mismatch returns IntegrityApprovalRequired",
  async fn() {
    const ctx = await setupE2EContext();
    const mockServer = await createMockServer({ port: 3080 });

    const lockfilePath = `${ctx.workspace}/.pml/mcp.lock`;
    const lockfileManager = new LockfileManager({
      lockfilePath,
      autoCreate: true,
      autoApproveNew: false, // Don't auto-approve new entries
    });

    try {
      // Pre-populate lockfile with old hash (FQDN must match what loader will use)
      await lockfileManager.addEntry({
        fqdn: "pml.mcp.updated.capability",
        integrity: "sha256-oldHashValue",
        type: "deno",
      });

      // Mock returns different hash (simulating update)
      mockServer.setMcpResponse("pml.mcp.updated.capability", {
        fqdn: "pml.mcp.updated.capability",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/pml.mcp.updated.capability.ts`,
        tools: ["capability"],
        routing: "client",
        description: "Updated capability",
        code: `return { updated: true };`,
        integrity: "sha256-newHashValue", // Different from lockfile
      });

      const loader = await createIntegrityTestLoader(
        ctx,
        mockServer,
        lockfileManager,
      );

      // Fetch should return integrity approval required
      const result = await loader.load("updated:capability");

      assertEquals(isIntegrityApproval(result), true);
      if (isIntegrityApproval(result)) {
        assertEquals(result.approvalType, "integrity");
        assertEquals(result.fqdnBase, "pml.mcp.updated.capability");
        assertExists(result.workflowId);
        assertExists(result.description);
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
  name: "E2E AC8: User approval updates lockfile",
  async fn() {
    const ctx = await setupE2EContext();
    const mockServer = await createMockServer({ port: 3079 });

    const lockfilePath = `${ctx.workspace}/.pml/mcp.lock`;
    const lockfileManager = new LockfileManager({
      lockfilePath,
      autoCreate: true,
      autoApproveNew: false,
    });

    try {
      // Pre-populate lockfile (FQDN must match what loader will use)
      await lockfileManager.addEntry({
        fqdn: "pml.mcp.approve.test",
        integrity: "sha256-originalHash",
        type: "deno",
      });

      // Mock returns updated hash
      mockServer.setMcpResponse("pml.mcp.approve.test", {
        fqdn: "pml.mcp.approve.test",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/pml.mcp.approve.test.ts`,
        tools: ["test"],
        routing: "client",
        description: "Approve test",
        code: `return { approved: true };`,
        integrity: "sha256-updatedHash",
      });

      const loader = await createIntegrityTestLoader(
        ctx,
        mockServer,
        lockfileManager,
      );

      // First call returns approval required
      const result1 = await loader.load("approve:test");
      assertEquals(isIntegrityApproval(result1), true);

      // Continue with approval
      const result2 = await loader.load("approve:test", { approved: true });
      assertEquals(isIntegrityApproval(result2), false);

      // Verify lockfile was updated
      const entry = await lockfileManager.getEntry("pml.mcp.approve.test");
      assertExists(entry);
      assertEquals(entry?.integrity, "sha256-updatedHash");
      assertEquals(entry?.approved, true);

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
  name: "E2E AC8: Rejection throws LoaderError",
  async fn() {
    const ctx = await setupE2EContext();
    const mockServer = await createMockServer({ port: 3078 });

    const lockfilePath = `${ctx.workspace}/.pml/mcp.lock`;
    const lockfileManager = new LockfileManager({
      lockfilePath,
      autoCreate: true,
      autoApproveNew: false,
    });

    try {
      // Pre-populate lockfile (FQDN must match what loader will use)
      await lockfileManager.addEntry({
        fqdn: "pml.mcp.reject.test",
        integrity: "sha256-safeHash",
        type: "deno",
      });

      // Mock returns suspicious hash
      mockServer.setMcpResponse("pml.mcp.reject.test", {
        fqdn: "pml.mcp.reject.test",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/pml.mcp.reject.test.ts`,
        tools: ["test"],
        routing: "client",
        description: "Reject test",
        code: `return {};`,
        integrity: "sha256-suspiciousHash",
      });

      const loader = await createIntegrityTestLoader(
        ctx,
        mockServer,
        lockfileManager,
      );

      // First call returns approval required
      const result1 = await loader.load("reject:test");
      assertEquals(isIntegrityApproval(result1), true);

      // Reject the approval
      try {
        await loader.load("reject:test", { approved: false });
        throw new Error("Expected rejection error");
      } catch (error) {
        const errorLower = (error as Error).message?.toLowerCase() ?? "";
        assertEquals(
          errorLower.includes("rejected") ||
          errorLower.includes("integrity") ||
          errorLower.includes("user"),
          true,
          `Expected error message to contain 'rejected', 'integrity', or 'user', got: ${errorLower}`,
        );
      }

      // Lockfile should still have old hash
      const entry = await lockfileManager.getEntry("pml.mcp.reject.test");
      assertExists(entry);
      assertEquals(entry?.integrity, "sha256-safeHash");

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
  name: "E2E AC8: Matching hash skips approval",
  async fn() {
    const ctx = await setupE2EContext();
    const mockServer = await createMockServer({ port: 3077 });

    const lockfilePath = `${ctx.workspace}/.pml/mcp.lock`;
    const lockfileManager = new LockfileManager({
      lockfilePath,
      autoCreate: true,
      autoApproveNew: true,
    });

    try {
      const sameHash = "sha256-unchangedHash456";

      // Pre-populate lockfile with hash (FQDN must match what loader will use)
      await lockfileManager.addEntry({
        fqdn: "pml.mcp.unchanged.cap",
        integrity: sameHash,
        type: "deno",
      });

      // Mock returns same hash
      mockServer.setMcpResponse("pml.mcp.unchanged.cap", {
        fqdn: "pml.mcp.unchanged.cap",
        type: "deno",
        codeUrl: `${mockServer.getUrl()}/code/pml.mcp.unchanged.cap.ts`,
        tools: ["cap"],
        routing: "client",
        description: "Unchanged",
        code: `return { unchanged: true };`,
        integrity: sameHash, // Same as lockfile
      });

      const loader = await createIntegrityTestLoader(
        ctx,
        mockServer,
        lockfileManager,
      );

      // Should execute directly without approval
      const result = await loader.call("unchanged:cap", {});
      assertEquals(isIntegrityApproval(result), false);
      assertEquals((result as { unchanged: boolean }).unchanged, true);

      await loader.shutdown();
    } finally {
      mockServer.shutdown();
      await teardownE2EContext(ctx);
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
