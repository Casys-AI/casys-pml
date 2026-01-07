/**
 * Capability Loader Integration Tests
 *
 * Tests for the unified capability loader.
 *
 * @module tests/capability_loader_test
 */

import { assertEquals, assertExists, assertRejects } from "@std/assert";
import { CapabilityLoader } from "../src/loader/capability-loader.ts";
import { LoaderError } from "../src/loader/types.ts";

// ============================================================================
// CapabilityLoader Unit Tests
// ============================================================================

Deno.test("CapabilityLoader.create - initializes successfully", async () => {
  const loader = await CapabilityLoader.create({
    cloudUrl: "https://pml.casys.ai",
    workspace: "/tmp",
    depStatePath: "/tmp/test-loader-deps.json",
  });

  assertExists(loader);
  assertEquals(loader.isLoaded("test:tool"), false);

  loader.shutdown();
});

Deno.test("CapabilityLoader - getStatus returns correct info", async () => {
  const loader = await CapabilityLoader.create({
    cloudUrl: "https://test.example.com",
    workspace: "/workspace",
    depStatePath: "/tmp/test-loader-status.json",
  });

  const status = loader.getStatus();

  assertEquals(status.initialized, true);
  assertEquals(status.loadedCapabilities, 0);
  assertEquals(status.runningProcesses, []);
  assertEquals(status.cloudUrl, "https://test.example.com");

  loader.shutdown();
});

Deno.test("CapabilityLoader - getLoadedCapabilities empty initially", async () => {
  const loader = await CapabilityLoader.create({
    cloudUrl: "https://pml.casys.ai",
    workspace: "/tmp",
    depStatePath: "/tmp/test-loader-caps.json",
  });

  assertEquals(loader.getLoadedCapabilities(), []);

  loader.shutdown();
});

Deno.test("CapabilityLoader - clearCache resets state", async () => {
  const loader = await CapabilityLoader.create({
    cloudUrl: "https://pml.casys.ai",
    workspace: "/tmp",
    depStatePath: "/tmp/test-loader-cache.json",
  });

  // Clear should not throw
  loader.clearCache();
  assertEquals(loader.getLoadedCapabilities(), []);

  loader.shutdown();
});

Deno.test("CapabilityLoader - shutdown cleans up", async () => {
  const loader = await CapabilityLoader.create({
    cloudUrl: "https://pml.casys.ai",
    workspace: "/tmp",
    depStatePath: "/tmp/test-loader-shutdown.json",
  });

  loader.shutdown();

  // After shutdown, status should show no processes
  const status = loader.getStatus();
  assertEquals(status.runningProcesses, []);
});

Deno.test("CapabilityLoader - load fails for nonexistent capability", async () => {
  const loader = await CapabilityLoader.create({
    cloudUrl: "https://pml.casys.ai",
    workspace: "/tmp",
    depStatePath: "/tmp/test-loader-fail.json",
  });

  // Mock fetch to return 404
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(null, { status: 404 });
  };

  try {
    await assertRejects(
      async () => {
        await loader.load("nonexistent:capability");
      },
      LoaderError,
    );
  } finally {
    globalThis.fetch = originalFetch;
    loader.shutdown();
  }
});

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

  const validMetadata = {
    fqdn: "casys.pml.hil.test",
    type: "deno",
    codeUrl: "https://pml.casys.ai/mcp/casys.pml.hil.test",
    tools: ["hil:test"],
    routing: "client",
    mcpDeps: [
      {
        name: "memory",
        type: "stdio",
        install: "npx @mcp/memory@1.0.0",
        version: "1.0.0",
        integrity: "sha256-abc123",
      },
    ],
  };

  // Mock fetch to return metadata with deps
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(JSON.stringify(validMetadata), { status: 200 });
  };

  try {
    const result = await loader.load("hil:test");

    // Should return ApprovalRequiredResult, not throw
    assertEquals(CapabilityLoader.isApprovalRequired(result), true);

    if (CapabilityLoader.isApprovalRequired(result)) {
      assertEquals(result.dependency.name, "memory");
      assertEquals(result.dependency.version, "1.0.0");
      assertEquals(result.description.includes("memory@1.0.0"), true);
    }
  } finally {
    globalThis.fetch = originalFetch;
    loader.shutdown();
  }
});

Deno.test("CapabilityLoader - auto-installs deps in allow list", async () => {
  let installCalled = false;

  const validMetadata = {
    fqdn: "casys.pml.auto.test",
    type: "deno",
    codeUrl: "data:application/javascript,export function run() { return 'ok'; }",
    tools: ["auto:test"],
    routing: "client",
    mcpDeps: [
      {
        name: "memory",
        type: "stdio",
        install: "npx @mcp/memory@1.0.0",
        version: "1.0.0",
        integrity: "sha256-abc123",
      },
    ],
  };

  // Mock fetch BEFORE creating loader (so registry requests are mocked)
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(JSON.stringify(validMetadata), { status: 200 });
  };

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
    globalThis.fetch = originalFetch;
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

  const validMetadata = {
    fqdn: "casys.pml.deny.test",
    type: "deno",
    codeUrl: "https://pml.casys.ai/mcp/casys.pml.deny.test",
    tools: ["deny:test"],
    routing: "client",
    mcpDeps: [
      {
        name: "memory",
        type: "stdio",
        install: "npx @mcp/memory@1.0.0",
        version: "1.0.0",
        integrity: "sha256-abc123",
      },
    ],
  };

  // Mock fetch to return metadata with deps
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(JSON.stringify(validMetadata), { status: 200 });
  };

  try {
    await assertRejects(
      async () => {
        await loader.load("deny:test");
      },
      LoaderError,
      "deny list",
    );
  } finally {
    globalThis.fetch = originalFetch;
    loader.shutdown();
  }
});

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

  const validMetadata = {
    fqdn: "casys.pml.continue.test",
    type: "deno",
    codeUrl: "data:application/javascript,export function run() { return 'ok'; }",
    tools: ["continue:test"],
    routing: "client",
    mcpDeps: [
      {
        name: "memory",
        type: "stdio",
        install: "npx @mcp/memory@1.0.0",
        version: "1.0.0",
        integrity: "sha256-abc123",
      },
    ],
  };

  // Mock fetch to return metadata with deps
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(JSON.stringify(validMetadata), { status: 200 });
  };

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
    globalThis.fetch = originalFetch;
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

  const validMetadata = {
    fqdn: "casys.pml.abort.test",
    type: "deno",
    codeUrl: "https://pml.casys.ai/mcp/casys.pml.abort.test",
    tools: ["abort:test"],
    routing: "client",
    mcpDeps: [
      {
        name: "memory",
        type: "stdio",
        install: "npx @mcp/memory@1.0.0",
        version: "1.0.0",
        integrity: "sha256-abc123",
      },
    ],
  };

  // Mock fetch to return metadata with deps
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(JSON.stringify(validMetadata), { status: 200 });
  };

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
    globalThis.fetch = originalFetch;
    loader.shutdown();
  }
});

Deno.test("CapabilityLoader.isApprovalRequired - correctly identifies result types", () => {
  // ApprovalRequiredResult
  const approvalResult = {
    approvalRequired: true,
    dependency: { name: "test", type: "stdio", install: "npx test", version: "1.0.0", integrity: "sha256-abc" },
    description: "Install test",
  };
  assertEquals(CapabilityLoader.isApprovalRequired(approvalResult), true);

  // Not an ApprovalRequiredResult
  assertEquals(CapabilityLoader.isApprovalRequired(null), false);
  assertEquals(CapabilityLoader.isApprovalRequired(undefined), false);
  assertEquals(CapabilityLoader.isApprovalRequired({}), false);
  assertEquals(CapabilityLoader.isApprovalRequired({ approvalRequired: false }), false);
  assertEquals(CapabilityLoader.isApprovalRequired("string"), false);
  assertEquals(CapabilityLoader.isApprovalRequired(123), false);
});

// ============================================================================
// Module Loading Tests (with mocks)
// ============================================================================

Deno.test("CapabilityLoader - caches loaded capabilities", async () => {
  const loader = await CapabilityLoader.create({
    cloudUrl: "https://pml.casys.ai",
    workspace: "/tmp",
    depStatePath: "/tmp/test-loader-cache2.json",
    sandboxEnabled: false, // Disable sandbox for this test to isolate caching behavior
  });

  const validMetadata = {
    fqdn: "casys.pml.cache.test",
    type: "deno",
    codeUrl: "data:application/javascript,export function run() { return 'ok'; }",
    tools: ["cache:test"],
    routing: "client",
  };

  let fetchCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCount++;
    return new Response(JSON.stringify(validMetadata), { status: 200 });
  };

  try {
    // First load
    const cap1 = await loader.load("cache:test");
    assertEquals(loader.isLoaded("cache:test"), true);
    assertEquals(fetchCount, 1);

    // Second load should use cache
    const cap2 = await loader.load("cache:test");
    assertEquals(fetchCount, 1); // No additional fetch
    assertEquals(cap1, cap2); // Same instance
  } finally {
    globalThis.fetch = originalFetch;
    loader.shutdown();
  }
});
