/**
 * TDD Tests for PendingWorkflowStore
 *
 * Tests the stateful workflow store for managing pending approval workflows.
 * Supports all approval types: dependency, api_key_required, integrity.
 *
 * @module tests/workflow/pending_store_test
 */

import { assertEquals, assertExists, assertStrictEquals } from "@std/assert";
import { FakeTime } from "@std/testing/time";
import { PendingWorkflowStore, type ApprovalType } from "../../src/workflow/pending-store.ts";
import type { McpDependency } from "../../src/loader/types.ts";

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockDependency = (name = "filesystem"): McpDependency => ({
  name,
  type: "stdio",
  version: "latest",
  install: `npx -y @modelcontextprotocol/server-${name}`,
  integrity: "sha256-abc123",
});

const TEST_CODE = `const content = await mcp.filesystem.read_file({ path: "/test.txt" });
return content;`;

const TAVILY_CODE = `const result = await mcp.tavily.search({ query: "test" });
return result;`;

// =============================================================================
// Unit Tests: PendingWorkflowStore
// =============================================================================

Deno.test("PendingWorkflowStore - create() returns unique workflow ID", () => {
  const store = new PendingWorkflowStore();
  const dep = createMockDependency();

  const id1 = store.create(TEST_CODE, "filesystem:read_file", "dependency", dep);
  const id2 = store.create(TEST_CODE, "filesystem:write_file", "dependency", dep);

  assertExists(id1);
  assertExists(id2);
  assertEquals(typeof id1, "string");
  assertEquals(id1.length, 36); // UUID format
  assertEquals(id1 !== id2, true, "IDs should be unique");
});

Deno.test("PendingWorkflowStore - get() retrieves stored workflow", () => {
  const store = new PendingWorkflowStore();
  const dep = createMockDependency();
  const toolId = "filesystem:read_file";

  const id = store.create(TEST_CODE, toolId, "dependency", dep);
  const workflow = store.get(id);

  assertExists(workflow);
  assertEquals(workflow.code, TEST_CODE);
  assertEquals(workflow.toolId, toolId);
  assertEquals(workflow.approvalType, "dependency");
  assertEquals(workflow.dependency?.name, "filesystem");
  assertExists(workflow.createdAt);
});

Deno.test("PendingWorkflowStore - get() returns null for unknown ID", () => {
  const store = new PendingWorkflowStore();

  const workflow = store.get("non-existent-id");

  assertStrictEquals(workflow, null);
});

Deno.test("PendingWorkflowStore - delete() removes workflow", () => {
  const store = new PendingWorkflowStore();
  const dep = createMockDependency();

  const id = store.create(TEST_CODE, "filesystem:read_file", "dependency", dep);

  // Verify it exists
  assertExists(store.get(id));

  // Delete it
  store.delete(id);

  // Verify it's gone
  assertStrictEquals(store.get(id), null);
});

Deno.test("PendingWorkflowStore - delete() is idempotent", () => {
  const store = new PendingWorkflowStore();
  const dep = createMockDependency();

  const id = store.create(TEST_CODE, "filesystem:read_file", "dependency", dep);
  store.delete(id);
  store.delete(id); // Should not throw
  store.delete("non-existent"); // Should not throw

  assertStrictEquals(store.get(id), null);
});

Deno.test("PendingWorkflowStore - get() returns null for expired workflow (TTL)", () => {
  using time = new FakeTime();
  const store = new PendingWorkflowStore();
  const dep = createMockDependency();

  const id = store.create(TEST_CODE, "filesystem:read_file", "dependency", dep);

  // Workflow exists initially
  assertExists(store.get(id));

  // Advance time by 4 minutes - still valid
  time.tick(4 * 60 * 1000);
  assertExists(store.get(id));

  // Advance time to 5 minutes + 1ms - expired
  time.tick(60 * 1000 + 1);
  assertStrictEquals(store.get(id), null);
});

Deno.test("PendingWorkflowStore - create() cleans up expired workflows", () => {
  using time = new FakeTime();
  const store = new PendingWorkflowStore();
  const dep = createMockDependency();

  // Create first workflow
  const id1 = store.create(TEST_CODE, "filesystem:read_file", "dependency", dep);

  // Advance time past TTL
  time.tick(6 * 60 * 1000);

  // Create second workflow - should trigger cleanup
  const id2 = store.create(TEST_CODE, "filesystem:write_file", "dependency", dep);

  // First workflow should be cleaned up
  assertStrictEquals(store.get(id1), null);
  // Second workflow should exist
  assertExists(store.get(id2));
});

Deno.test("PendingWorkflowStore - handles multiple concurrent workflows", () => {
  const store = new PendingWorkflowStore();

  const workflows = [
    { code: "code1", toolId: "filesystem:read_file", type: "dependency" as ApprovalType, dep: createMockDependency("filesystem") },
    { code: "code2", toolId: "git:status", type: "dependency" as ApprovalType, dep: createMockDependency("git") },
    { code: "code3", toolId: "docker:ps", type: "dependency" as ApprovalType, dep: createMockDependency("docker") },
  ];

  const ids = workflows.map((w) => store.create(w.code, w.toolId, w.type, w.dep));

  // All should be retrievable
  for (let i = 0; i < workflows.length; i++) {
    const workflow = store.get(ids[i]);
    assertExists(workflow);
    assertEquals(workflow.code, workflows[i].code);
    assertEquals(workflow.toolId, workflows[i].toolId);
  }

  // Delete middle one
  store.delete(ids[1]);

  // First and last should still exist
  assertExists(store.get(ids[0]));
  assertStrictEquals(store.get(ids[1]), null);
  assertExists(store.get(ids[2]));
});

Deno.test("PendingWorkflowStore - size() returns current workflow count", () => {
  const store = new PendingWorkflowStore();
  const dep = createMockDependency();

  assertEquals(store.size(), 0);

  const id1 = store.create(TEST_CODE, "tool1", "dependency", dep);
  assertEquals(store.size(), 1);

  const id2 = store.create(TEST_CODE, "tool2", "dependency", dep);
  assertEquals(store.size(), 2);

  store.delete(id1);
  assertEquals(store.size(), 1);

  store.delete(id2);
  assertEquals(store.size(), 0);
});

Deno.test("PendingWorkflowStore - clear() removes all workflows", () => {
  const store = new PendingWorkflowStore();
  const dep = createMockDependency();

  const id1 = store.create(TEST_CODE, "tool1", "dependency", dep);
  const id2 = store.create(TEST_CODE, "tool2", "dependency", dep);
  const id3 = store.create(TEST_CODE, "tool3", "dependency", dep);

  assertEquals(store.size(), 3);

  store.clear();

  assertEquals(store.size(), 0);
  assertStrictEquals(store.get(id1), null);
  assertStrictEquals(store.get(id2), null);
  assertStrictEquals(store.get(id3), null);
});

// =============================================================================
// Tests for different approval types
// =============================================================================

Deno.test("PendingWorkflowStore - stores api_key_required workflow (no dependency)", () => {
  const store = new PendingWorkflowStore();

  // API key approval doesn't have a dependency
  const id = store.create(TAVILY_CODE, "tavily:search", "api_key_required");
  const workflow = store.get(id);

  assertExists(workflow);
  assertEquals(workflow.code, TAVILY_CODE);
  assertEquals(workflow.toolId, "tavily:search");
  assertEquals(workflow.approvalType, "api_key_required");
  assertEquals(workflow.dependency, undefined);
});

Deno.test("PendingWorkflowStore - stores integrity workflow", () => {
  const store = new PendingWorkflowStore();
  const dep = createMockDependency();

  const id = store.create(TEST_CODE, "filesystem:read_file", "integrity", dep);
  const workflow = store.get(id);

  assertExists(workflow);
  assertEquals(workflow.code, TEST_CODE);
  assertEquals(workflow.approvalType, "integrity");
  assertEquals(workflow.dependency?.name, "filesystem");
});

// =============================================================================
// Integration-style Tests: Approval Flow
// =============================================================================

Deno.test("PendingWorkflowStore - full dependency approval flow simulation", () => {
  const store = new PendingWorkflowStore();
  const code = `await mcp.filesystem.read_file({ path: "/data.json" })`;
  const toolId = "filesystem:read_file";
  const dependency = createMockDependency();

  // Step 1: Code execution hits missing dependency
  // Store the pending workflow
  const workflowId = store.create(code, toolId, "dependency", dependency);

  // Step 2: Return approval_required to Claude
  const approvalResponse = {
    status: "approval_required",
    approval_type: "dependency",
    workflow_id: workflowId,
    context: {
      tool: toolId,
      dependency: {
        name: dependency.name,
        install: dependency.install,
      },
    },
  };
  assertEquals(approvalResponse.workflow_id, workflowId);

  // Step 3: Claude sends continue_workflow
  const continueRequest = {
    continue_workflow: {
      workflow_id: workflowId,
      approved: true,
    },
  };

  // Step 4: Retrieve pending workflow
  const pending = store.get(continueRequest.continue_workflow.workflow_id);
  assertExists(pending);
  assertEquals(pending.code, code);
  assertEquals(pending.toolId, toolId);
  assertEquals(pending.approvalType, "dependency");

  // Step 5: Install dependency (mocked) and re-execute
  // ... installation logic ...

  // Step 6: Cleanup
  store.delete(workflowId);
  assertStrictEquals(store.get(workflowId), null);
});

Deno.test("PendingWorkflowStore - full api_key approval flow simulation", () => {
  const store = new PendingWorkflowStore();
  const code = `await mcp.tavily.search({ query: "AI news" })`;
  const toolId = "tavily:search";

  // Step 1: Code execution hits missing API key
  const workflowId = store.create(code, toolId, "api_key_required");

  // Step 2: Return approval_required to Claude
  const approvalResponse = {
    status: "approval_required",
    approval_type: "api_key_required",
    workflow_id: workflowId,
    context: {
      tool: toolId,
      missing_keys: ["TAVILY_API_KEY"],
    },
  };
  assertEquals(approvalResponse.workflow_id, workflowId);

  // Step 3: User adds key to .env, Claude sends continue_workflow
  const pending = store.get(workflowId);
  assertExists(pending);
  assertEquals(pending.approvalType, "api_key_required");
  assertEquals(pending.code, code);

  // Step 4: Reload .env and re-execute
  // ... reload and execute logic ...

  // Step 5: Cleanup
  store.delete(workflowId);
  assertStrictEquals(store.get(workflowId), null);
});

Deno.test("PendingWorkflowStore - rejection flow removes workflow", () => {
  const store = new PendingWorkflowStore();
  const dep = createMockDependency();

  const workflowId = store.create(TEST_CODE, "filesystem:read_file", "dependency", dep);

  // User rejects the installation
  const continueRequest = {
    continue_workflow: {
      workflow_id: workflowId,
      approved: false,
    },
  };

  // On rejection, we should still clean up
  const pending = store.get(continueRequest.continue_workflow.workflow_id);
  assertExists(pending); // Still exists until we delete

  store.delete(workflowId);
  assertStrictEquals(store.get(workflowId), null);
});
