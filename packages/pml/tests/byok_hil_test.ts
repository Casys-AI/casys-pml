/**
 * Tests for BYOK HIL Integration
 *
 * Story 14.6: BYOK API Key Management
 * Tests AC2, AC3 - HIL flow for missing keys, continue workflow
 */

import { assertEquals, assertExists, assertFalse } from "@std/assert";
import {
  formatKeyInstruction,
  handleApiKeyContinue,
  isApiKeyApprovalRequired,
  pauseForMissingKeys,
} from "../src/byok/mod.ts";
import type { ApiKeyApprovalRequired } from "../src/loader/types.ts";

// ============================================================================
// pauseForMissingKeys Tests (AC2)
// ============================================================================

Deno.test("pauseForMissingKeys - creates valid approval response", () => {
  const result = pauseForMissingKeys({
    allValid: false,
    missing: ["TAVILY_API_KEY"],
    invalid: [],
  });

  assertEquals(result.approvalRequired, true);
  assertEquals(result.approvalType, "api_key_required");
  assertExists(result.workflowId);
  assertEquals(result.missingKeys, ["TAVILY_API_KEY"]);
  assertExists(result.instruction);
});

Deno.test("pauseForMissingKeys - combines missing and invalid keys", () => {
  const result = pauseForMissingKeys({
    allValid: false,
    missing: ["TAVILY_API_KEY"],
    invalid: ["EXA_API_KEY"],
  });

  // Both keys should be in missingKeys (combined)
  assertEquals(result.missingKeys.includes("TAVILY_API_KEY"), true);
  assertEquals(result.missingKeys.includes("EXA_API_KEY"), true);
});

Deno.test("pauseForMissingKeys - preserves workflow ID on continuation", () => {
  const workflowId = "wf-test-123";
  const result = pauseForMissingKeys(
    {
      allValid: false,
      missing: ["TEST_KEY"],
      invalid: [],
    },
    workflowId,
  );

  assertEquals(result.workflowId, workflowId);
});

Deno.test("pauseForMissingKeys - generates unique workflow IDs", () => {
  const result1 = pauseForMissingKeys({
    allValid: false,
    missing: ["KEY1"],
    invalid: [],
  });

  const result2 = pauseForMissingKeys({
    allValid: false,
    missing: ["KEY2"],
    invalid: [],
  });

  // Should be different workflow IDs
  assertEquals(result1.workflowId !== result2.workflowId, true);
});

// ============================================================================
// formatKeyInstruction Tests
// ============================================================================

Deno.test("formatKeyInstruction - missing keys only", () => {
  const instruction = formatKeyInstruction(["TAVILY_API_KEY"], []);

  assertEquals(instruction.includes("TAVILY_API_KEY"), true);
  assertEquals(instruction.includes(".env"), true);
});

Deno.test("formatKeyInstruction - invalid keys only", () => {
  const instruction = formatKeyInstruction([], ["EXA_API_KEY"]);

  assertEquals(instruction.includes("EXA_API_KEY"), true);
  assertEquals(instruction.includes("placeholder"), true);
});

Deno.test("formatKeyInstruction - both missing and invalid", () => {
  const instruction = formatKeyInstruction(["TAVILY_API_KEY"], ["EXA_API_KEY"]);

  assertEquals(instruction.includes("TAVILY_API_KEY"), true);
  assertEquals(instruction.includes("EXA_API_KEY"), true);
});

Deno.test("formatKeyInstruction - provides helpful hints", () => {
  const instruction = formatKeyInstruction(["TAVILY_API_KEY"], []);

  // Should include a hint about what kind of key
  assertEquals(instruction.includes("tavily"), true);
});

// ============================================================================
// isApiKeyApprovalRequired Tests
// ============================================================================

Deno.test("isApiKeyApprovalRequired - returns true for API key approval", () => {
  const approval: ApiKeyApprovalRequired = {
    approvalRequired: true,
    approvalType: "api_key_required",
    workflowId: "test-123",
    missingKeys: ["TEST_KEY"],
    instruction: "Add key",
  };

  assertEquals(isApiKeyApprovalRequired(approval), true);
});

Deno.test("isApiKeyApprovalRequired - returns false for dependency approval", () => {
  const approval = {
    approvalRequired: true,
    approvalType: "dependency",
    dependency: { name: "test", type: "stdio", install: "npm", version: "1.0.0", integrity: "sha256-abc" },
    description: "Install test",
  };

  assertFalse(isApiKeyApprovalRequired(approval));
});

Deno.test("isApiKeyApprovalRequired - returns false for non-approval objects", () => {
  assertFalse(isApiKeyApprovalRequired(null));
  assertFalse(isApiKeyApprovalRequired(undefined));
  assertFalse(isApiKeyApprovalRequired({}));
  assertFalse(isApiKeyApprovalRequired({ approvalRequired: false }));
});

// ============================================================================
// handleApiKeyContinue Tests (AC3)
// ============================================================================

Deno.test("handleApiKeyContinue - success when keys are now present", async () => {
  // Set up test key
  Deno.env.set("TEST_CONTINUE_KEY", "valid-key-value");

  const approval: ApiKeyApprovalRequired = {
    approvalRequired: true,
    approvalType: "api_key_required",
    workflowId: "test-continue-123",
    missingKeys: ["TEST_CONTINUE_KEY"],
    instruction: "Add key",
  };

  // Use a test workspace that exists
  const result = await handleApiKeyContinue(approval, "/tmp");

  assertEquals(result.success, true);
  assertEquals(result.validKeys.includes("TEST_CONTINUE_KEY"), true);
  assertEquals(result.remainingIssues.length, 0);

  // Cleanup
  Deno.env.delete("TEST_CONTINUE_KEY");
});

Deno.test("handleApiKeyContinue - failure when keys still missing", async () => {
  // Ensure key is not set
  Deno.env.delete("NONEXISTENT_CONTINUE_KEY");

  const approval: ApiKeyApprovalRequired = {
    approvalRequired: true,
    approvalType: "api_key_required",
    workflowId: "test-continue-456",
    missingKeys: ["NONEXISTENT_CONTINUE_KEY"],
    instruction: "Add key",
  };

  const result = await handleApiKeyContinue(approval, "/tmp");

  assertFalse(result.success);
  assertEquals(result.remainingIssues.includes("NONEXISTENT_CONTINUE_KEY"), true);
  assertExists(result.error);
});

Deno.test("handleApiKeyContinue - partial success", async () => {
  // Set up one key but not the other
  Deno.env.set("KEY_A", "valid-value");
  Deno.env.delete("KEY_B");

  const approval: ApiKeyApprovalRequired = {
    approvalRequired: true,
    approvalType: "api_key_required",
    workflowId: "test-partial-789",
    missingKeys: ["KEY_A", "KEY_B"],
    instruction: "Add keys",
  };

  const result = await handleApiKeyContinue(approval, "/tmp");

  // Should fail because KEY_B is still missing
  assertFalse(result.success);
  // KEY_A should now be valid
  assertEquals(result.validKeys.includes("KEY_A"), true);
  // KEY_B should still be missing
  assertEquals(result.remainingIssues.includes("KEY_B"), true);

  // Cleanup
  Deno.env.delete("KEY_A");
});
