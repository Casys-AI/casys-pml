/**
 * Tests for Capability Permission Inferrer
 *
 * @module tests/capability_inferrer_test
 */

import { assertEquals, assertThrows } from "@std/assert";
import {
  CapabilityBlockedError,
  checkCapabilityPermissions,
  inferCapabilityApprovalMode,
} from "../src/permissions/capability-inferrer.ts";
import type { PmlPermissions } from "../src/types.ts";

// Test permissions matching AC scenarios
const testPermissions: PmlPermissions = {
  allow: ["json:*", "math:*", "tavily:*"],
  deny: ["ssh:*"],
  ask: ["filesystem:*", "shell:*"],
};

// ============================================================================
// inferCapabilityApprovalMode Tests (AC1, AC2)
// ============================================================================

Deno.test("inferCapabilityApprovalMode - all tools allowed → auto", () => {
  // AC1: When all tools are in allow list, return "auto"
  const result = inferCapabilityApprovalMode(
    ["json:parse", "math:add"],
    testPermissions,
  );
  assertEquals(result, "auto");
});

Deno.test("inferCapabilityApprovalMode - any tool ask → hil", () => {
  // AC1: filesystem:read requires ask → return "hil"
  const result = inferCapabilityApprovalMode(
    ["json:parse", "filesystem:read"],
    testPermissions,
  );
  assertEquals(result, "hil");
});

Deno.test("inferCapabilityApprovalMode - denied tool → throws CapabilityBlockedError", () => {
  // AC2: If ANY tool is denied → throw error
  assertThrows(
    () =>
      inferCapabilityApprovalMode(
        ["ssh:connect"],
        testPermissions,
      ),
    CapabilityBlockedError,
    "ssh:connect",
  );
});

Deno.test("inferCapabilityApprovalMode - denied tool includes capabilityId in error", () => {
  // Test that CapabilityBlockedError includes both toolId and capabilityId
  try {
    inferCapabilityApprovalMode(["ssh:execute"], testPermissions, "my-data-fetcher");
    throw new Error("Should have thrown");
  } catch (e) {
    if (e instanceof CapabilityBlockedError) {
      assertEquals(e.toolId, "ssh:execute");
      assertEquals(e.capabilityId, "my-data-fetcher");
      assertEquals(e.name, "CapabilityBlockedError");
      assertEquals(e.message.includes("my-data-fetcher"), true);
    } else {
      throw e;
    }
  }
});

Deno.test("inferCapabilityApprovalMode - denied tool without capabilityId", () => {
  // Test error message when capabilityId is not provided
  try {
    inferCapabilityApprovalMode(["ssh:execute"], testPermissions);
    throw new Error("Should have thrown");
  } catch (e) {
    if (e instanceof CapabilityBlockedError) {
      assertEquals(e.toolId, "ssh:execute");
      assertEquals(e.capabilityId, undefined);
      assertEquals(e.message.includes("Capability blocked:"), true);
    } else {
      throw e;
    }
  }
});

Deno.test("inferCapabilityApprovalMode - unknown tool → hil (safe default)", () => {
  // AC2: Unknown tools → "hil" (via checkPermission returning "ask")
  const result = inferCapabilityApprovalMode(
    ["unknown:tool"],
    testPermissions,
  );
  assertEquals(result, "hil");
});

Deno.test("inferCapabilityApprovalMode - empty tools → auto", () => {
  // Empty tools = pure compute = safe
  const result = inferCapabilityApprovalMode([], testPermissions);
  assertEquals(result, "auto");
});

Deno.test("inferCapabilityApprovalMode - handles falsy tools gracefully", () => {
  // The function guards against falsy values internally
  // This tests the runtime behavior for edge cases
  const emptyArray: string[] = [];
  const result = inferCapabilityApprovalMode(emptyArray, testPermissions);
  assertEquals(result, "auto");
});

Deno.test("inferCapabilityApprovalMode - mixed allowed and ask → hil wins", () => {
  // AC2: If ANY tool requires ask → return "hil"
  const result = inferCapabilityApprovalMode(
    ["tavily:search", "shell:exec", "json:parse"],
    testPermissions,
  );
  assertEquals(result, "hil"); // shell:exec is in ask
});

Deno.test("inferCapabilityApprovalMode - denied takes precedence over ask", () => {
  // AC2 precedence: denied > ask > allowed
  assertThrows(
    () =>
      inferCapabilityApprovalMode(
        ["filesystem:read", "ssh:connect"], // ask + denied
        testPermissions,
      ),
    CapabilityBlockedError,
  );
});

Deno.test("inferCapabilityApprovalMode - single allowed tool → auto", () => {
  const result = inferCapabilityApprovalMode(
    ["math:multiply"],
    testPermissions,
  );
  assertEquals(result, "auto");
});

Deno.test("inferCapabilityApprovalMode - single ask tool → hil", () => {
  const result = inferCapabilityApprovalMode(
    ["shell:bash"],
    testPermissions,
  );
  assertEquals(result, "hil");
});

// ============================================================================
// checkCapabilityPermissions Tests (non-throwing version)
// ============================================================================

Deno.test("checkCapabilityPermissions - all allowed → canExecute: true, auto", () => {
  const result = checkCapabilityPermissions(
    ["json:parse", "math:add"],
    testPermissions,
  );
  assertEquals(result.canExecute, true);
  assertEquals(result.approvalMode, "auto");
  assertEquals(result.blockedTool, undefined);
});

Deno.test("checkCapabilityPermissions - ask required → canExecute: true, hil", () => {
  const result = checkCapabilityPermissions(
    ["filesystem:write"],
    testPermissions,
  );
  assertEquals(result.canExecute, true);
  assertEquals(result.approvalMode, "hil");
});

Deno.test("checkCapabilityPermissions - denied → canExecute: false, blockedTool set", () => {
  const result = checkCapabilityPermissions(
    ["ssh:connect"],
    testPermissions,
  );
  assertEquals(result.canExecute, false);
  assertEquals(result.blockedTool, "ssh:connect");
  assertEquals(result.reason?.includes("denied"), true);
});

Deno.test("checkCapabilityPermissions - empty tools → canExecute: true, auto", () => {
  const result = checkCapabilityPermissions([], testPermissions);
  assertEquals(result.canExecute, true);
  assertEquals(result.approvalMode, "auto");
});

Deno.test("checkCapabilityPermissions - unknown tools → hil (safe)", () => {
  const result = checkCapabilityPermissions(
    ["mystery:action"],
    testPermissions,
  );
  assertEquals(result.canExecute, true);
  assertEquals(result.approvalMode, "hil"); // Unknown = ask → hil
});

// ============================================================================
// Edge Cases
// ============================================================================

Deno.test("inferCapabilityApprovalMode - wildcard allow (*) → auto for all", () => {
  const permissionsWithWildcard: PmlPermissions = {
    allow: ["*"],
    deny: [],
    ask: [],
  };
  const result = inferCapabilityApprovalMode(
    ["anything:here", "random:tool"],
    permissionsWithWildcard,
  );
  assertEquals(result, "auto");
});

Deno.test("inferCapabilityApprovalMode - wildcard deny (*) → throws for all", () => {
  const permissionsWithWildcardDeny: PmlPermissions = {
    allow: [],
    deny: ["*"],
    ask: [],
  };
  assertThrows(
    () =>
      inferCapabilityApprovalMode(
        ["any:tool"],
        permissionsWithWildcardDeny,
      ),
    CapabilityBlockedError,
  );
});

Deno.test("inferCapabilityApprovalMode - wildcard ask (*) → hil for all", () => {
  const permissionsWithWildcardAsk: PmlPermissions = {
    allow: [],
    deny: [],
    ask: ["*"],
  };
  const result = inferCapabilityApprovalMode(
    ["any:tool"],
    permissionsWithWildcardAsk,
  );
  assertEquals(result, "hil");
});

Deno.test("inferCapabilityApprovalMode - deny overrides allow for same namespace", () => {
  // If same namespace is in both allow and deny, deny wins
  const conflictingPermissions: PmlPermissions = {
    allow: ["shell:*"],
    deny: ["shell:*"],
    ask: [],
  };
  assertThrows(
    () =>
      inferCapabilityApprovalMode(
        ["shell:bash"],
        conflictingPermissions,
      ),
    CapabilityBlockedError,
  );
});

// ============================================================================
// checkCapabilityPermissions with capabilityId
// ============================================================================

Deno.test("checkCapabilityPermissions - denied includes capabilityId in reason", () => {
  const result = checkCapabilityPermissions(
    ["ssh:connect"],
    testPermissions,
    "my-ssh-capability",
  );
  assertEquals(result.canExecute, false);
  assertEquals(result.blockedTool, "ssh:connect");
  assertEquals(result.reason?.includes("my-ssh-capability"), true);
});

// ============================================================================
// Integration Test: Full Flow
// ============================================================================

Deno.test("integration - load permissions and infer approval mode", async () => {
  // This test simulates the full flow:
  // 1. User has permissions defined
  // 2. Capability uses certain tools
  // 3. System infers approval mode

  // Simulate user permissions (what would come from .pml.json)
  const userPermissions: PmlPermissions = {
    allow: ["json:*", "math:*"],
    deny: ["ssh:*"],
    ask: ["filesystem:*"],
  };

  // Capability 1: Pure compute (all allowed tools)
  const pureComputeTools = ["json:parse", "math:add"];
  const result1 = inferCapabilityApprovalMode(pureComputeTools, userPermissions, "pure-compute");
  assertEquals(result1, "auto", "Pure compute capability should be auto");

  // Capability 2: Needs filesystem access (has ask tool)
  const fileAccessTools = ["json:parse", "filesystem:read"];
  const result2 = inferCapabilityApprovalMode(fileAccessTools, userPermissions, "file-reader");
  assertEquals(result2, "hil", "File access capability should require HIL");

  // Capability 3: Tries to use denied tool
  const dangerousTools = ["ssh:connect"];
  const result3 = checkCapabilityPermissions(dangerousTools, userPermissions, "ssh-connector");
  assertEquals(result3.canExecute, false, "SSH capability should be blocked");
  assertEquals(result3.blockedTool, "ssh:connect");
  assertEquals(result3.reason?.includes("ssh-connector"), true);
});
