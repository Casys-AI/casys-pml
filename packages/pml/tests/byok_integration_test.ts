/**
 * BYOK Integration Tests
 *
 * Story 14.6: BYOK API Key Management
 *
 * Tests the FULL flow including actual .env file operations:
 * - Missing key → HIL pause → User adds to .env → Continue → Execute
 *
 * These tests use real file I/O to verify the complete workflow.
 */

import {
  assertEquals,
  assertExists,
  assertFalse,
  assertStringIncludes,
} from "@std/assert";
import { join } from "@std/path";
import {
  checkKeys,
  formatKeyInstruction,
  getRequiredKeys,
  handleApiKeyContinue,
  isApiKeyApprovalRequired,
  pauseForMissingKeys,
  reloadEnv,
  sanitize,
} from "../src/byok/mod.ts";
import type { ApiKeyApprovalRequired } from "../src/loader/types.ts";

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a temporary test workspace with optional .env file.
 */
async function createTestWorkspace(
  envContent?: string,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const tempDir = await Deno.makeTempDir({ prefix: "byok_test_" });

  if (envContent !== undefined) {
    await Deno.writeTextFile(join(tempDir, ".env"), envContent);
  }

  return {
    path: tempDir,
    cleanup: async () => {
      try {
        await Deno.remove(tempDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

/**
 * Write .env file to workspace (simulates user action).
 */
async function writeEnvFile(workspace: string, content: string): Promise<void> {
  await Deno.writeTextFile(join(workspace, ".env"), content);
}

/**
 * Append to .env file (simulates user adding a key).
 */
async function appendToEnvFile(
  workspace: string,
  content: string,
): Promise<void> {
  const envPath = join(workspace, ".env");
  let existing = "";
  try {
    existing = await Deno.readTextFile(envPath);
  } catch {
    // File doesn't exist yet
  }
  await Deno.writeTextFile(envPath, existing + "\n" + content);
}

// ============================================================================
// Full Flow Integration Tests
// ============================================================================

Deno.test("Integration: Full flow - missing key → HIL → add to .env → continue → success", async () => {
  // 1. Create workspace WITHOUT the required key
  const workspace = await createTestWorkspace("");

  try {
    // Clear any existing env var
    Deno.env.delete("TAVILY_API_KEY");

    // 2. Load env (should be empty)
    await reloadEnv(workspace.path);

    // 3. Check keys - should fail
    const requiredKeys = getRequiredKeys("tavily:search");
    const initialCheck = checkKeys(requiredKeys);

    assertFalse(initialCheck.allValid);
    assertEquals(initialCheck.missing, ["TAVILY_API_KEY"]);

    // 4. Create HIL pause response
    const hilPause = pauseForMissingKeys(initialCheck);

    assertEquals(hilPause.approvalRequired, true);
    assertEquals(hilPause.approvalType, "api_key_required");
    assertExists(hilPause.workflowId);
    assertEquals(hilPause.missingKeys, ["TAVILY_API_KEY"]);
    assertStringIncludes(hilPause.instruction, "TAVILY_API_KEY");

    // 5. Simulate user adding key to .env file
    await writeEnvFile(workspace.path, "TAVILY_API_KEY=tvly-real-key-12345");

    // 6. Handle continue workflow (reloads .env and re-checks)
    const continueResult = await handleApiKeyContinue(hilPause, workspace.path);

    // 7. Should now succeed
    assertEquals(continueResult.success, true);
    assertEquals(continueResult.validKeys, ["TAVILY_API_KEY"]);
    assertEquals(continueResult.remainingIssues, []);

    // 8. Verify the key is now in Deno.env
    assertEquals(Deno.env.get("TAVILY_API_KEY"), "tvly-real-key-12345");
  } finally {
    await workspace.cleanup();
    Deno.env.delete("TAVILY_API_KEY");
  }
});

Deno.test("Integration: Full flow - multiple keys, partial fix, then complete", async () => {
  const workspace = await createTestWorkspace("");

  try {
    // Clear env vars
    Deno.env.delete("TAVILY_API_KEY");
    Deno.env.delete("EXA_API_KEY");

    await reloadEnv(workspace.path);

    // 1. Check multiple keys - both missing
    const requiredKeys = [
      { name: "TAVILY_API_KEY", requiredBy: "tavily:search" },
      { name: "EXA_API_KEY", requiredBy: "exa:search" },
    ];
    const initialCheck = checkKeys(requiredKeys);

    assertFalse(initialCheck.allValid);
    assertEquals(initialCheck.missing.length, 2);

    // 2. Create HIL pause
    const hilPause = pauseForMissingKeys(initialCheck);
    assertEquals(hilPause.missingKeys.length, 2);

    // 3. User adds only ONE key
    await writeEnvFile(workspace.path, "TAVILY_API_KEY=tvly-key-abc123");

    // 4. Continue - should still fail (EXA missing)
    const partialResult = await handleApiKeyContinue(hilPause, workspace.path);

    assertFalse(partialResult.success);
    assertEquals(partialResult.validKeys, ["TAVILY_API_KEY"]);
    assertEquals(partialResult.remainingIssues, ["EXA_API_KEY"]);

    // 5. User adds second key
    await appendToEnvFile(workspace.path, "EXA_API_KEY=exa-key-xyz789");

    // 6. Continue again - should succeed
    const finalResult = await handleApiKeyContinue(
      {
        ...hilPause,
        missingKeys: ["EXA_API_KEY"], // Only remaining key
      },
      workspace.path,
    );

    assertEquals(finalResult.success, true);
    assertEquals(finalResult.validKeys, ["EXA_API_KEY"]);
  } finally {
    await workspace.cleanup();
    Deno.env.delete("TAVILY_API_KEY");
    Deno.env.delete("EXA_API_KEY");
  }
});

Deno.test("Integration: Full flow - placeholder value rejected, then fixed", async () => {
  const workspace = await createTestWorkspace("");

  try {
    Deno.env.delete("OPENAI_API_KEY");

    // 1. User adds placeholder value
    await writeEnvFile(workspace.path, "OPENAI_API_KEY=your-key-here");
    await reloadEnv(workspace.path);

    // 2. Check - should detect invalid placeholder
    const check1 = checkKeys([
      { name: "OPENAI_API_KEY", requiredBy: "openai:chat" },
    ]);

    assertFalse(check1.allValid);
    assertEquals(check1.invalid, ["OPENAI_API_KEY"]);
    assertEquals(check1.missing, []); // Key exists but is invalid

    // 3. Create HIL pause
    const hilPause = pauseForMissingKeys(check1);
    assertStringIncludes(hilPause.instruction, "placeholder");

    // 4. User fixes the value
    await writeEnvFile(
      workspace.path,
      "OPENAI_API_KEY=sk-real-openai-key-1234567890abcdef",
    );

    // 5. Continue - should succeed
    const result = await handleApiKeyContinue(hilPause, workspace.path);

    assertEquals(result.success, true);
  } finally {
    await workspace.cleanup();
    Deno.env.delete("OPENAI_API_KEY");
  }
});

Deno.test("Integration: No .env file exists - graceful handling", async () => {
  const workspace = await createTestWorkspace(); // No .env file created

  try {
    Deno.env.delete("TEST_KEY");

    // Should not throw when .env doesn't exist
    await reloadEnv(workspace.path);

    // Key check should show missing
    const check = checkKeys([{ name: "TEST_KEY", requiredBy: "test:tool" }]);
    assertFalse(check.allValid);
    assertEquals(check.missing, ["TEST_KEY"]);
  } finally {
    await workspace.cleanup();
  }
});

Deno.test("Integration: .env file created after initial load", async () => {
  const workspace = await createTestWorkspace(); // No .env initially

  try {
    Deno.env.delete("LATE_KEY");

    // 1. Initial load - no .env
    await reloadEnv(workspace.path);

    const check1 = checkKeys([{ name: "LATE_KEY", requiredBy: "late:tool" }]);
    assertFalse(check1.allValid);

    // 2. User creates .env file
    await writeEnvFile(workspace.path, "LATE_KEY=created-later-value");

    // 3. Reload - should pick up new file
    await reloadEnv(workspace.path);

    const check2 = checkKeys([{ name: "LATE_KEY", requiredBy: "late:tool" }]);
    assertEquals(check2.allValid, true);
    assertEquals(Deno.env.get("LATE_KEY"), "created-later-value");
  } finally {
    await workspace.cleanup();
    Deno.env.delete("LATE_KEY");
  }
});

// ============================================================================
// Sanitization Integration Tests
// ============================================================================

Deno.test("Integration: Sanitization in error flow", async () => {
  const workspace = await createTestWorkspace(
    "SECRET_KEY=sk-ant-api03-super-secret-key-12345",
  );

  try {
    await reloadEnv(workspace.path);

    // Simulate an error message containing the key
    const errorMessage = `Failed to call API with key: ${
      Deno.env.get("SECRET_KEY")
    }`;

    // Sanitize should redact the key
    const sanitized = sanitize(errorMessage);

    assertFalse(sanitized.includes("sk-ant-api03"));
    assertFalse(sanitized.includes("super-secret"));
    assertStringIncludes(sanitized, "[REDACTED]");
  } finally {
    await workspace.cleanup();
    Deno.env.delete("SECRET_KEY");
  }
});

Deno.test("Integration: formatKeyInstruction provides actionable guidance", () => {
  // Test that instructions are helpful for different key types
  const tavilyInstruction = formatKeyInstruction(["TAVILY_API_KEY"], []);
  assertStringIncludes(tavilyInstruction, ".env");
  assertStringIncludes(tavilyInstruction, "TAVILY_API_KEY=");
  assertStringIncludes(tavilyInstruction.toLowerCase(), "tavily");

  const multiInstruction = formatKeyInstruction(
    ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"],
    [],
  );
  assertStringIncludes(multiInstruction, "ANTHROPIC_API_KEY");
  assertStringIncludes(multiInstruction, "OPENAI_API_KEY");

  const invalidInstruction = formatKeyInstruction([], ["BAD_KEY"]);
  assertStringIncludes(invalidInstruction.toLowerCase(), "placeholder");
});

// ============================================================================
// Edge Case Tests
// ============================================================================

Deno.test("Integration: Empty .env file", async () => {
  const workspace = await createTestWorkspace(""); // Empty .env

  try {
    Deno.env.delete("SOME_KEY");
    await reloadEnv(workspace.path);

    const check = checkKeys([{ name: "SOME_KEY", requiredBy: "some:tool" }]);
    assertFalse(check.allValid);
    assertEquals(check.missing, ["SOME_KEY"]);
  } finally {
    await workspace.cleanup();
  }
});

Deno.test("Integration: .env with comments and whitespace", async () => {
  const envContent = `
# This is a comment
VALID_KEY=real-value-123

# Another comment
  SPACED_KEY=value-with-leading-space

# Empty line above
`;
  const workspace = await createTestWorkspace(envContent);

  try {
    Deno.env.delete("VALID_KEY");
    Deno.env.delete("SPACED_KEY");

    await reloadEnv(workspace.path);

    assertEquals(Deno.env.get("VALID_KEY"), "real-value-123");
    // Note: @std/dotenv handles whitespace
  } finally {
    await workspace.cleanup();
    Deno.env.delete("VALID_KEY");
    Deno.env.delete("SPACED_KEY");
  }
});

Deno.test("Integration: .env with quoted values", async () => {
  const envContent = `
QUOTED_KEY="value with spaces"
SINGLE_QUOTED='another value'
`;
  const workspace = await createTestWorkspace(envContent);

  try {
    Deno.env.delete("QUOTED_KEY");
    Deno.env.delete("SINGLE_QUOTED");

    await reloadEnv(workspace.path);

    // @std/dotenv should handle quotes
    const quotedValue = Deno.env.get("QUOTED_KEY");
    assertExists(quotedValue);
  } finally {
    await workspace.cleanup();
    Deno.env.delete("QUOTED_KEY");
    Deno.env.delete("SINGLE_QUOTED");
  }
});

Deno.test("Integration: Workflow ID tracking across continue calls", async () => {
  const workspace = await createTestWorkspace("");

  try {
    Deno.env.delete("TRACKED_KEY");

    const check = checkKeys([{ name: "TRACKED_KEY", requiredBy: "tracked:tool" }]);
    const hilPause = pauseForMissingKeys(check);

    // Workflow ID should be preserved
    const originalWorkflowId = hilPause.workflowId;
    assertExists(originalWorkflowId);
    assertStringIncludes(originalWorkflowId, "wf-byok-");

    // First continue - still missing
    const result1 = await handleApiKeyContinue(hilPause, workspace.path);
    assertFalse(result1.success);

    // Add key
    await writeEnvFile(workspace.path, "TRACKED_KEY=finally-added");

    // Second continue - success
    const result2 = await handleApiKeyContinue(hilPause, workspace.path);
    assertEquals(result2.success, true);
  } finally {
    await workspace.cleanup();
    Deno.env.delete("TRACKED_KEY");
  }
});

// ============================================================================
// Type Guard Tests
// ============================================================================

Deno.test("Integration: isApiKeyApprovalRequired type guard", () => {
  const validApproval: ApiKeyApprovalRequired = {
    approvalRequired: true,
    approvalType: "api_key_required",
    workflowId: "wf-test",
    missingKeys: ["KEY"],
    instruction: "Add key",
  };

  assertEquals(isApiKeyApprovalRequired(validApproval), true);

  // Not API key approval
  assertEquals(
    isApiKeyApprovalRequired({
      approvalRequired: true,
      approvalType: "dependency",
    }),
    false,
  );

  // Not approval at all
  assertEquals(isApiKeyApprovalRequired({ success: true }), false);
  assertEquals(isApiKeyApprovalRequired(null), false);
  assertEquals(isApiKeyApprovalRequired("string"), false);
});
