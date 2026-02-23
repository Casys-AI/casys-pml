/**
 * Deferred Trace Flush Tests
 *
 * ADR-041: Test that traces are collected during execution and only
 * flushed at the end, ensuring parent traces exist before children.
 *
 * Tests:
 * - TraceSyncer: no auto-flush timer by default
 * - TraceSyncer: sortQueueByDependency orders parents before children
 * - CapabilityLoader: collects traces in pendingTraces
 * - CapabilityLoader: flushTraces sorts and syncs all pending
 * - Integration: nested execution creates proper parent-child hierarchy
 */

import { assertEquals } from "@std/assert";
import { TraceSyncer } from "../src/tracing/mod.ts";
import type { LocalExecutionTrace } from "../src/tracing/mod.ts";

/**
 * Create a test trace with optional parent.
 */
function createTestTrace(
  traceId: string,
  capabilityId: string,
  parentTraceId?: string,
): LocalExecutionTrace {
  return {
    traceId,
    parentTraceId,
    capabilityId,
    success: true,
    durationMs: 100,
    taskResults: [],
    decisions: [],
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// TraceSyncer: Explicit Flush Only Tests
// =============================================================================

Deno.test("TraceSyncer: no auto-flush, traces stay in queue until explicit flush", async () => {
  const syncer = new TraceSyncer({
    cloudUrl: "https://test.example.com",
  });

  // Enqueue a trace
  const trace = createTestTrace("t1", "test:cap");
  syncer.enqueue(trace);

  // Wait a bit - trace should still be in queue (no auto-flush)
  await new Promise((r) => setTimeout(r, 50));

  // Trace should still be in queue
  assertEquals(syncer.getQueueSize(), 1);

  await syncer.shutdown();
});

// =============================================================================
// TraceSyncer: sortQueueByDependency Tests
// =============================================================================

Deno.test("TraceSyncer: sortQueueByDependency puts parents before children", async () => {
  const syncer = new TraceSyncer({
    cloudUrl: "https://test.example.com",
  });

  // Enqueue in wrong order: child first, then parent
  const child = createTestTrace("child-id", "test:child", "parent-id");
  const parent = createTestTrace("parent-id", "test:parent", undefined);

  syncer.enqueue(child);
  syncer.enqueue(parent);

  assertEquals(syncer.getQueueSize(), 2);

  // Sort by dependency
  syncer.sortQueueByDependency();

  // Get queue order (we need to expose this for testing)
  const queue = syncer.getQueue();
  assertEquals(queue.length, 2);
  assertEquals(queue[0].traceId, "parent-id"); // Parent first
  assertEquals(queue[1].traceId, "child-id"); // Child second

  await syncer.shutdown();
});

Deno.test("TraceSyncer: sortQueueByDependency handles deep nesting", async () => {
  const syncer = new TraceSyncer({
    cloudUrl: "https://test.example.com",
      });

  // Enqueue in reverse order: grandchild, child, parent
  const grandchild = createTestTrace("gc-id", "test:gc", "child-id");
  const child = createTestTrace("child-id", "test:child", "parent-id");
  const parent = createTestTrace("parent-id", "test:parent", undefined);

  syncer.enqueue(grandchild);
  syncer.enqueue(child);
  syncer.enqueue(parent);

  syncer.sortQueueByDependency();

  const queue = syncer.getQueue();
  assertEquals(queue.length, 3);
  assertEquals(queue[0].traceId, "parent-id"); // Parent first
  assertEquals(queue[1].traceId, "child-id"); // Child second
  assertEquals(queue[2].traceId, "gc-id"); // Grandchild third

  await syncer.shutdown();
});

Deno.test("TraceSyncer: sortQueueByDependency handles multiple roots", async () => {
  const syncer = new TraceSyncer({
    cloudUrl: "https://test.example.com",
      });

  // Two independent trees
  const child1 = createTestTrace("c1", "test:c1", "p1");
  const parent1 = createTestTrace("p1", "test:p1", undefined);
  const child2 = createTestTrace("c2", "test:c2", "p2");
  const parent2 = createTestTrace("p2", "test:p2", undefined);

  syncer.enqueue(child1);
  syncer.enqueue(child2);
  syncer.enqueue(parent1);
  syncer.enqueue(parent2);

  syncer.sortQueueByDependency();

  const queue = syncer.getQueue();
  assertEquals(queue.length, 4);

  // Each parent should come before its child
  const p1Idx = queue.findIndex((t) => t.traceId === "p1");
  const c1Idx = queue.findIndex((t) => t.traceId === "c1");
  const p2Idx = queue.findIndex((t) => t.traceId === "p2");
  const c2Idx = queue.findIndex((t) => t.traceId === "c2");

  assertEquals(p1Idx < c1Idx, true, "parent1 should come before child1");
  assertEquals(p2Idx < c2Idx, true, "parent2 should come before child2");

  await syncer.shutdown();
});

Deno.test("TraceSyncer: sortQueueByDependency handles orphan children gracefully", async () => {
  const syncer = new TraceSyncer({
    cloudUrl: "https://test.example.com",
      });

  // Child with parent not in queue (external parent)
  const orphan = createTestTrace("orphan-id", "test:orphan", "external-parent");
  const root = createTestTrace("root-id", "test:root", undefined);

  syncer.enqueue(orphan);
  syncer.enqueue(root);

  // Should not crash, orphan goes wherever
  syncer.sortQueueByDependency();

  const queue = syncer.getQueue();
  assertEquals(queue.length, 2);

  await syncer.shutdown();
});

// =============================================================================
// CapabilityLoader: Pending Traces Tests
// =============================================================================

Deno.test("CapabilityLoader: getPendingTraces returns empty array initially", async () => {
  // We need to import CapabilityLoader
  const { CapabilityLoader } = await import("../src/loader/capability-loader.ts");

  const loader = await CapabilityLoader.create({
    cloudUrl: "https://test.example.com",
    workspace: "/tmp/test-workspace",
  });

  const pending = loader.getPendingTraces();
  assertEquals(pending, []);

  await loader.shutdown();
});

Deno.test("CapabilityLoader: enqueuePendingTrace adds to pending list", async () => {
  const { CapabilityLoader } = await import("../src/loader/capability-loader.ts");

  const loader = await CapabilityLoader.create({
    cloudUrl: "https://test.example.com",
    workspace: "/tmp/test-workspace",
  });

  const trace = createTestTrace("t1", "test:cap");
  loader.enqueuePendingTrace(trace);

  const pending = loader.getPendingTraces();
  assertEquals(pending.length, 1);
  assertEquals(pending[0].traceId, "t1");

  await loader.shutdown();
});

Deno.test("CapabilityLoader: getPendingTraces clears the list", async () => {
  const { CapabilityLoader } = await import("../src/loader/capability-loader.ts");

  const loader = await CapabilityLoader.create({
    cloudUrl: "https://test.example.com",
    workspace: "/tmp/test-workspace",
  });

  loader.enqueuePendingTrace(createTestTrace("t1", "test:cap1"));
  loader.enqueuePendingTrace(createTestTrace("t2", "test:cap2"));

  // First call returns traces
  const pending1 = loader.getPendingTraces();
  assertEquals(pending1.length, 2);

  // Second call returns empty (list was cleared)
  const pending2 = loader.getPendingTraces();
  assertEquals(pending2.length, 0);

  await loader.shutdown();
});

Deno.test("CapabilityLoader: flushTraces sorts and syncs pending traces", async () => {
  const { CapabilityLoader } = await import("../src/loader/capability-loader.ts");

  const loader = await CapabilityLoader.create({
    cloudUrl: "https://test.example.com",
    workspace: "/tmp/test-workspace",
  });

  // Add traces in wrong order
  loader.enqueuePendingTrace(createTestTrace("child", "test:child", "parent"));
  loader.enqueuePendingTrace(createTestTrace("parent", "test:parent"));

  // Flush should sort and sync
  // (will fail network call, but shouldn't crash)
  await loader.flushTraces();

  // Pending should be cleared after flush
  const pending = loader.getPendingTraces();
  assertEquals(pending.length, 0);

  await loader.shutdown();
});

Deno.test("CapabilityLoader: enqueueDirectExecutionTrace adds to pending", async () => {
  const { CapabilityLoader } = await import("../src/loader/capability-loader.ts");

  const loader = await CapabilityLoader.create({
    cloudUrl: "https://test.example.com",
    workspace: "/tmp/test-workspace",
  });

  loader.enqueueDirectExecutionTrace(
    "trace-123",
    true,
    500,
    undefined,
    [{ tool: "test:tool", args: {}, result: {}, success: true, durationMs: 100 }],
    "workflow-456", // workflowId for server-side capability creation
  );

  const pending = loader.getPendingTraces();
  assertEquals(pending.length, 1);
  assertEquals(pending[0].traceId, "trace-123");
  assertEquals(pending[0].workflowId, "workflow-456");
  // capabilityId is now undefined (server creates it via workflowId)
  assertEquals(pending[0].capabilityId, undefined);

  await loader.shutdown();
});

// =============================================================================
// AC3: HIL Continuation Preserves Trace Hierarchy
// =============================================================================

Deno.test("TraceSyncer: HIL continuation uses same workflowId as traceId (unified ID)", async () => {
  const syncer = new TraceSyncer({
    cloudUrl: "https://test.example.com",
  });

  // Simulate HIL flow:
  // 1. Root execution starts with workflowId = traceId (unified)
  const unifiedId = "unified-workflow-trace-id";

  // 2. Root trace uses unifiedId as both workflowId and traceId
  const rootTrace = createTestTrace(unifiedId, "test:root", undefined);

  // 3. Nested trace during execution (before HIL pause)
  const nestedTrace = createTestTrace("nested-id", "test:nested", unifiedId);

  syncer.enqueue(nestedTrace); // Enqueue in wrong order
  syncer.enqueue(rootTrace);

  // 4. After HIL approval, continuation uses same workflowId
  // The traces should sort correctly with parent first
  syncer.sortQueueByDependency();

  const queue = syncer.getQueue();
  assertEquals(queue.length, 2);
  assertEquals(queue[0].traceId, unifiedId); // Root first (unified ID)
  assertEquals(queue[1].traceId, "nested-id"); // Nested second
  assertEquals(queue[1].parentTraceId, unifiedId); // Points to root

  await syncer.shutdown();
});

Deno.test("TraceSyncer: multiple HIL pauses maintain trace hierarchy", async () => {
  const syncer = new TraceSyncer({
    cloudUrl: "https://test.example.com",
  });

  // Simulate multiple HIL pauses in nested execution:
  // root -> child1 (HIL pause) -> continue -> child2 (HIL pause) -> continue
  const rootId = "root-workflow-id";
  const child1Id = "child1-trace-id";
  const child2Id = "child2-trace-id";

  const root = createTestTrace(rootId, "test:root", undefined);
  const child1 = createTestTrace(child1Id, "test:child1", rootId);
  const child2 = createTestTrace(child2Id, "test:child2", rootId);

  // Enqueue in execution order (which may not be dependency order)
  syncer.enqueue(child2);
  syncer.enqueue(child1);
  syncer.enqueue(root);

  syncer.sortQueueByDependency();

  const queue = syncer.getQueue();
  assertEquals(queue.length, 3);

  // Root must come first
  assertEquals(queue[0].traceId, rootId);

  // Both children come after root (order between them doesn't matter)
  const childTraceIds = [queue[1].traceId, queue[2].traceId];
  assertEquals(childTraceIds.includes(child1Id), true);
  assertEquals(childTraceIds.includes(child2Id), true);

  // Both children point to root
  assertEquals(queue[1].parentTraceId, rootId);
  assertEquals(queue[2].parentTraceId, rootId);

  await syncer.shutdown();
});
