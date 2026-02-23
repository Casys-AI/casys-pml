/**
 * Capability Loader Environment Tests
 *
 * Tests for dynamic envRequired key detection:
 * - Missing API keys detection
 * - Placeholder value detection
 * - Successful key validation
 *
 * Story 14.6: Dynamic envRequired Key Detection
 *
 * Split from capability_loader_test.ts for maintainability.
 *
 * @module tests/capability_loader_env_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { CapabilityLoader } from "../src/loader/capability-loader.ts";
import {
  mockFetch,
  mockJsonResponse,
  createTestCapabilityMetadata,
  createTestMcpDep,
  withEnvVars,
  withoutEnvVars,
} from "./fixtures/index.ts";

// ============================================================================
// Story 14.6: Dynamic envRequired Key Detection Tests
// ============================================================================

Deno.test("CapabilityLoader - returns ApiKeyApprovalRequired when envRequired keys missing", async () => {
  // Use withoutEnvVars to ensure test keys are NOT set
  await withoutEnvVars(["GOOGLE_PROJECT_ID", "GOOGLE_CLIENT_EMAIL"], async () => {
    const validMetadata = createTestCapabilityMetadata({
      fqdn: "casys.pml.gsheets.test",
      tools: ["gsheets:test"],
      mcpDeps: [
        createTestMcpDep({
          name: "google-sheets",
          install: "npx @mcp/google-sheets@1.0.0",
          envRequired: ["GOOGLE_PROJECT_ID", "GOOGLE_CLIENT_EMAIL"],
        }),
      ],
    });

    // Mock fetch BEFORE creating loader
    const fetchCtx = mockFetch(() => mockJsonResponse(validMetadata));

    try {
      const loader = await CapabilityLoader.create({
        cloudUrl: "https://pml.casys.ai",
        workspace: "/tmp",
        depStatePath: "/tmp/test-loader-envreq.json",
        permissions: {
          allow: ["google-sheets"], // Auto-approve dep, but env vars are missing
          deny: [],
          ask: [],
        },
      });

      try {
        const result = await loader.load("gsheets:test");

        // Should return ApiKeyApprovalRequired, not DependencyApprovalRequired
        assertEquals(CapabilityLoader.isApprovalRequired(result), true);

        if (CapabilityLoader.isApprovalRequired(result)) {
          // Story 14.6: Should be api_key_required type
          assertEquals(result.approvalType, "api_key_required");
          if (result.approvalType === "api_key_required") {
            // Both env vars should be in missingKeys
            assertEquals(result.missingKeys.includes("GOOGLE_PROJECT_ID"), true);
            assertEquals(result.missingKeys.includes("GOOGLE_CLIENT_EMAIL"), true);
            assertExists(result.instruction);
            assertExists(result.workflowId);
          }
        }
      } finally {
        loader.shutdown();
      }
    } finally {
      fetchCtx.restore();
    }
  });
});

Deno.test("CapabilityLoader - proceeds with envRequired keys when present", async () => {
  // Use withEnvVars to set test keys
  await withEnvVars(
    {
      TEST_ENV_KEY_1: "valid-value-1",
      TEST_ENV_KEY_2: "valid-value-2",
    },
    async () => {
      const validMetadata = createTestCapabilityMetadata({
        fqdn: "casys.pml.envok.test",
        tools: ["envok:test"],
        mcpDeps: [
          createTestMcpDep({
            name: "test-mcp",
            install: "npx @mcp/test@1.0.0",
            envRequired: ["TEST_ENV_KEY_1", "TEST_ENV_KEY_2"],
          }),
        ],
      });

      // Mock fetch BEFORE creating loader
      const fetchCtx = mockFetch(() => mockJsonResponse(validMetadata));

      try {
        const loader = await CapabilityLoader.create({
          cloudUrl: "https://pml.casys.ai",
          workspace: "/tmp",
          depStatePath: "/tmp/test-loader-envok.json",
          permissions: {
            allow: ["test-mcp"], // Auto-approve dep
            deny: [],
            ask: [],
          },
        });

        try {
          // With env vars set and dep approved, should try to install
          // (will fail because no real npx, but should NOT return approval_required)
          const result = await loader.load("envok:test").catch((e) => {
            // Install failed because npx command doesn't actually run
            // But the important thing is it tried to install, not ask for keys
            if (e.code === "DEPENDENCY_INSTALL_FAILED") {
              return { _installAttempted: true };
            }
            throw e;
          });

          // Should NOT be approval required (env vars are present)
          assertEquals(CapabilityLoader.isApprovalRequired(result), false);
        } finally {
          loader.shutdown();
        }
      } finally {
        fetchCtx.restore();
      }
    },
  );
});

Deno.test("CapabilityLoader - rejects invalid placeholder values in envRequired", async () => {
  // Use withEnvVars to set test key with placeholder value
  await withEnvVars({ TEST_PLACEHOLDER_KEY: "your-key-here" }, async () => {
    const validMetadata = createTestCapabilityMetadata({
      fqdn: "casys.pml.placeholder.test",
      tools: ["placeholder:test"],
      mcpDeps: [
        createTestMcpDep({
          name: "placeholder-mcp",
          install: "npx @mcp/placeholder@1.0.0",
          envRequired: ["TEST_PLACEHOLDER_KEY"],
        }),
      ],
    });

    // Mock fetch BEFORE creating loader
    const fetchCtx = mockFetch(() => mockJsonResponse(validMetadata));

    try {
      const loader = await CapabilityLoader.create({
        cloudUrl: "https://pml.casys.ai",
        workspace: "/tmp",
        depStatePath: "/tmp/test-loader-placeholder.json",
        permissions: {
          allow: ["placeholder-mcp"],
          deny: [],
          ask: [],
        },
      });

      try {
        const result = await loader.load("placeholder:test");

        // Should return ApiKeyApprovalRequired because placeholder is invalid
        assertEquals(CapabilityLoader.isApprovalRequired(result), true);

        if (CapabilityLoader.isApprovalRequired(result)) {
          assertEquals(result.approvalType, "api_key_required");
          if (result.approvalType === "api_key_required") {
            // Key should be marked as needing update (in missingKeys since it's invalid)
            assertEquals(result.missingKeys.includes("TEST_PLACEHOLDER_KEY"), true);
          }
        }
      } finally {
        loader.shutdown();
      }
    } finally {
      fetchCtx.restore();
    }
  });
});
