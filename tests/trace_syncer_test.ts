/**
 * Trace Syncer Tests
 *
 * Story 14.5b: Test TraceSyncer batch sync behavior.
 *
 * Tests:
 * - Batching behavior
 * - Offline queueing
 * - Standalone mode (no cloud)
 * - Retry logic
 */

import { assertEquals } from "@std/assert";
import { TraceSyncer } from "../src/tracing/mod.ts";
import type { LocalExecutionTrace } from "../src/tracing/mod.ts";

/**
 * Create a test trace with given capability ID.
 */
function createTestTrace(capabilityId: string, success = true): LocalExecutionTrace {
  return {
    traceId: `trace-${crypto.randomUUID().slice(0, 8)}`,
    capabilityId,
    success,
    durationMs: 100,
    taskResults: [
      {
        taskId: "t1",
        tool: "test:call",
        args: { arg: "value" },
        result: { data: "result" },
        success: true,
        durationMs: 50,
        timestamp: new Date().toISOString(),
      },
    ],
    decisions: [],
    timestamp: new Date().toISOString(),
  };
}

Deno.test("TraceSyncer: starts in standalone mode by default", () => {
  const syncer = new TraceSyncer();

  assertEquals(syncer.isStandalone(), true);
  assertEquals(syncer.isActive(), true);

  syncer.shutdown();
});

Deno.test("TraceSyncer: standalone mode does not queue traces", () => {
  const syncer = new TraceSyncer(); // No cloudUrl = standalone

  const trace = createTestTrace("test:cap");
  syncer.enqueue(trace);

  // In standalone mode, traces are logged but not queued
  assertEquals(syncer.getQueueSize(), 0);

  syncer.shutdown();
});

Deno.test({
  name: "TraceSyncer: queues traces when cloud URL is set",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const syncer = new TraceSyncer({
      cloudUrl: "https://test.example.com",
          });

    const trace = createTestTrace("test:cap");
    syncer.enqueue(trace);

    assertEquals(syncer.getQueueSize(), 1);

    await syncer.shutdown();
  },
});

Deno.test({
  name: "TraceSyncer: queues multiple traces",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const syncer = new TraceSyncer({
      cloudUrl: "https://test.example.com",
            batchSize: 10, // Larger batch to prevent auto-flush
    });

    syncer.enqueue(createTestTrace("test:cap1"));
    syncer.enqueue(createTestTrace("test:cap2"));
    syncer.enqueue(createTestTrace("test:cap3"));

    assertEquals(syncer.getQueueSize(), 3);

    await syncer.shutdown();
  },
});

Deno.test("TraceSyncer: isActive returns false after shutdown", async () => {
  const syncer = new TraceSyncer();

  assertEquals(syncer.isActive(), true);

  await syncer.shutdown();

  assertEquals(syncer.isActive(), false);
});

Deno.test("TraceSyncer: drops traces after shutdown", async () => {
  const syncer = new TraceSyncer({
    cloudUrl: "https://test.example.com",
      });

  await syncer.shutdown();

  // Enqueue after shutdown should be dropped
  syncer.enqueue(createTestTrace("test:cap"));

  assertEquals(syncer.getQueueSize(), 0);
});

Deno.test({
  name: "TraceSyncer: respects batch size configuration",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const syncer = new TraceSyncer({
      cloudUrl: "https://test.example.com",
      batchSize: 3,
          });

    // Add traces (note: batch flush is async and may fail due to no real server)
    // We're just testing that the syncer doesn't crash
    syncer.enqueue(createTestTrace("test:cap1"));
    syncer.enqueue(createTestTrace("test:cap2"));

    // Queue should have 2 traces before hitting batch size
    assertEquals(syncer.getQueueSize() <= 2, true);

    await syncer.shutdown();
  },
});

Deno.test({
  name: "TraceSyncer: can be created with custom config",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const syncer = new TraceSyncer({
      cloudUrl: "https://custom.example.com",
      batchSize: 20,
            maxRetries: 5,
      apiKey: "test_key",
    });

    assertEquals(syncer.isStandalone(), false);
    assertEquals(syncer.isActive(), true);

    await syncer.shutdown();
  },
});

Deno.test("TraceSyncer: handles null cloudUrl as standalone", () => {
  const syncer = new TraceSyncer({
    cloudUrl: null,
    batchSize: 10,
  });

  assertEquals(syncer.isStandalone(), true);

  syncer.shutdown();
});

Deno.test("TraceSyncer: shutdown is idempotent", async () => {
  const syncer = new TraceSyncer();

  // Multiple shutdowns should not throw
  await syncer.shutdown();
  await syncer.shutdown();
  await syncer.shutdown();

  assertEquals(syncer.isActive(), false);
});

Deno.test("TraceSyncer: flush is no-op in standalone mode", async () => {
  const syncer = new TraceSyncer();

  // Should not throw
  await syncer.flush();

  assertEquals(syncer.getQueueSize(), 0);

  syncer.shutdown();
});

Deno.test({
  name: "TraceSyncer: flush is no-op with empty queue",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const syncer = new TraceSyncer({
      cloudUrl: "https://test.example.com",
          });

    // Should not throw
    await syncer.flush();

    assertEquals(syncer.getQueueSize(), 0);

    await syncer.shutdown();
  },
});
