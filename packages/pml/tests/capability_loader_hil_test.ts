/**
 * Capability Loader HIL Tests
 *
 * Tests for Human-in-the-Loop (HIL) approval flows:
 * - Dependency approval (ask/allow/deny permissions)
 * - continue_workflow handling
 * - ApprovalRequired type detection
 *
 * Story 14.3b: HIL Approval Flow
 * Story 14.6: Dynamic envRequired Key Detection
 *
 * Split from capability_loader_test.ts for maintainability.
 *
 * @module tests/capability_loader_hil_test
 */

import { assertEquals, assertRejects } from "@std/assert";
import { CapabilityLoader } from "../src/loader/capability-loader.ts";
import { LoaderError } from "../src/loader/types.ts";
import {
  mockFetch,
  mockJsonResponse,
  createTestCapabilityMetadata,
  createTestMcpDep,
} from "./fixtures/index.ts";

// ============================================================================
// HIL Approval Flow Tests (Story 14.3b)
// ============================================================================

Deno.test("CapabilityLoader - returns ApprovalRequiredResult for deps with ask permission", async () => {
  const loader = await CapabilityLoader.create({
    cloudUrl: "https://pml.casys.ai",
    workspace: "/tmp",
    depStatePath: "/tmp/test-loader-hil.json",
    permissions: {
      allow: [],
      deny: [],
      ask: ["*"], // Default: ask for everything
    },
  });

  const validMetadata = createTestCapabilityMetadata({
    fqdn: "casys.pml.hil.test",
    codeUrl: "https://pml.casys.ai/mcp/casys.pml.hil.test",
    tools: ["hil:test"],
    mcpDeps: [
      createTestMcpDep({
        name: "memory",
        install: "npx @mcp/memory@1.0.0",
      }),
    ],
  });

  const fetchCtx = mockFetch(() => mockJsonResponse(validMetadata));

  try {
    const result = await loader.load("hil:test");

    // Should return ApprovalRequiredResult, not throw
    assertEquals(CapabilityLoader.isApprovalRequired(result), true);

    if (CapabilityLoader.isApprovalRequired(result)) {
      // Story 14.6: Check approval type - can be tool_permission or dependency
      // depending on which check fails first
      const validTypes = ["tool_permission", "dependency"];
      assertEquals(validTypes.includes(result.approvalType), true);
    }
  } finally {
    fetchCtx.restore();
    loader.shutdown();
  }
});

Deno.test("CapabilityLoader - auto-installs deps in allow list", async () => {
  let installCalled = false;

  const validMetadata = createTestCapabilityMetadata({
    fqdn: "casys.pml.auto.test",
    codeUrl: "data:application/javascript,export function run() { return 'ok'; }",
    tools: ["auto:test"],
    mcpDeps: [
      createTestMcpDep({
        name: "memory",
        install: "npx @mcp/memory@1.0.0",
      }),
    ],
  });

  // Mock fetch BEFORE creating loader (so registry requests are mocked)
  const fetchCtx = mockFetch(() => mockJsonResponse(validMetadata));

  try {
    const loader = await CapabilityLoader.create({
      cloudUrl: "https://pml.casys.ai",
      workspace: "/tmp",
      depStatePath: "/tmp/test-loader-auto-install.json",
      permissions: {
        allow: ["memory"], // Auto-approve memory
        deny: [],
        ask: [],
      },
    });

    try {
      // With allow permission, should NOT return ApprovalRequiredResult
      // But install will fail since we don't have actual npx - that's expected
      // The key test is that it tries to auto-install, not return approval_required
      const result = await loader.load("auto:test").catch((e) => {
        // Install failed because npx command doesn't actually run
        // But the important thing is it tried to install, not ask for approval
        if (e.code === "DEPENDENCY_INSTALL_FAILED") {
          installCalled = true;
          return { _installAttempted: true };
        }
        throw e;
      });

      // Either it succeeded (if somehow deps are installed) or it tried to install
      assertEquals(
        installCalled || !CapabilityLoader.isApprovalRequired(result),
        true,
      );
    } finally {
      loader.shutdown();
    }
  } finally {
    fetchCtx.restore();
  }
});

Deno.test("CapabilityLoader - denies deps in deny list", async () => {
  const loader = await CapabilityLoader.create({
    cloudUrl: "https://pml.casys.ai",
    workspace: "/tmp",
    depStatePath: "/tmp/test-loader-deny.json",
    permissions: {
      allow: [],
      deny: ["memory"], // Deny memory
      ask: [],
    },
  });

  const validMetadata = createTestCapabilityMetadata({
    fqdn: "casys.pml.deny.test",
    codeUrl: "https://pml.casys.ai/mcp/casys.pml.deny.test",
    tools: ["deny:test"],
    mcpDeps: [
      createTestMcpDep({
        name: "memory",
        install: "npx @mcp/memory@1.0.0",
      }),
    ],
  });

  const fetchCtx = mockFetch(() => mockJsonResponse(validMetadata));

  try {
    await assertRejects(
      async () => {
        await loader.load("deny:test");
      },
      LoaderError,
      "deny list",
    );
  } finally {
    fetchCtx.restore();
    loader.shutdown();
  }
});

// ============================================================================
// continue_workflow Tests
// ============================================================================

Deno.test("CapabilityLoader - continue_workflow approved installs and executes", async () => {
  const loader = await CapabilityLoader.create({
    cloudUrl: "https://pml.casys.ai",
    workspace: "/tmp",
    depStatePath: "/tmp/test-loader-continue.json",
    permissions: {
      allow: [],
      deny: [],
      ask: ["*"],
    },
  });

  const validMetadata = createTestCapabilityMetadata({
    fqdn: "casys.pml.continue.test",
    codeUrl: "data:application/javascript,export function run() { return 'ok'; }",
    tools: ["continue:test"],
    mcpDeps: [
      createTestMcpDep({
        name: "memory",
        install: "npx @mcp/memory@1.0.0",
      }),
    ],
  });

  const fetchCtx = mockFetch(() => mockJsonResponse(validMetadata));

  try {
    // First call should return ApprovalRequiredResult
    const firstResult = await loader.load("continue:test");
    assertEquals(CapabilityLoader.isApprovalRequired(firstResult), true);

    // Second call with approved: true should try to install
    // (will fail because no real npx, but tests the flow)
    const secondResult = await loader.load("continue:test", { approved: true }).catch((e) => {
      // Expected: install fails because no real npx
      if (e.code === "DEPENDENCY_INSTALL_FAILED") {
        return { _installAttempted: true };
      }
      throw e;
    });

    // Should have tried to install, not return approval_required again
    assertEquals(CapabilityLoader.isApprovalRequired(secondResult), false);
  } finally {
    fetchCtx.restore();
    loader.shutdown();
  }
});

Deno.test("CapabilityLoader - continue_workflow denied throws error", async () => {
  const loader = await CapabilityLoader.create({
    cloudUrl: "https://pml.casys.ai",
    workspace: "/tmp",
    depStatePath: "/tmp/test-loader-abort.json",
    permissions: {
      allow: [],
      deny: [],
      ask: ["*"],
    },
  });

  const validMetadata = createTestCapabilityMetadata({
    fqdn: "casys.pml.abort.test",
    codeUrl: "https://pml.casys.ai/mcp/casys.pml.abort.test",
    tools: ["abort:test"],
    mcpDeps: [
      createTestMcpDep({
        name: "memory",
        install: "npx @mcp/memory@1.0.0",
      }),
    ],
  });

  const fetchCtx = mockFetch(() => mockJsonResponse(validMetadata));

  try {
    // Call with approved: false should throw
    await assertRejects(
      async () => {
        await loader.load("abort:test", { approved: false });
      },
      LoaderError,
      "not approved",
    );
  } finally {
    fetchCtx.restore();
    loader.shutdown();
  }
});

// ============================================================================
// ApprovalRequired Type Detection Tests
// ============================================================================

Deno.test("CapabilityLoader.isApprovalRequired - correctly identifies result types", () => {
  // DependencyApprovalRequired (Story 14.6: with approvalType and workflowId)
  const dependencyApproval = {
    approvalRequired: true,
    approvalType: "dependency",
    workflowId: "wf-dep-test-456",
    dependency: { name: "test", type: "stdio", install: "npx test", version: "1.0.0", integrity: "sha256-abc" },
    description: "Install test",
  };
  assertEquals(CapabilityLoader.isApprovalRequired(dependencyApproval), true);

  // ApiKeyApprovalRequired (Story 14.6)
  const apiKeyApproval = {
    approvalRequired: true,
    approvalType: "api_key_required",
    workflowId: "wf-test-123",
    missingKeys: ["TEST_KEY"],
    instruction: "Add key",
  };
  assertEquals(CapabilityLoader.isApprovalRequired(apiKeyApproval), true);

  // Not an ApprovalRequiredResult
  assertEquals(CapabilityLoader.isApprovalRequired(null), false);
  assertEquals(CapabilityLoader.isApprovalRequired(undefined), false);
  assertEquals(CapabilityLoader.isApprovalRequired({}), false);
  assertEquals(CapabilityLoader.isApprovalRequired({ approvalRequired: false }), false);
  assertEquals(CapabilityLoader.isApprovalRequired("string"), false);
  assertEquals(CapabilityLoader.isApprovalRequired(123), false);
});
