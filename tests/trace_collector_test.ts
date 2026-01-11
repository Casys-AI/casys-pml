/**
 * Trace Collector Tests
 *
 * Story 14.5b: Test TraceCollector accumulation and finalization.
 *
 * Tests:
 * - Recording mcp.* calls
 * - Trace finalization
 * - Branch decision recording
 * - Sanitization integration
 */

import { assertEquals, assertThrows } from "@std/assert";
import { TraceCollector } from "../src/tracing/mod.ts";

Deno.test("TraceCollector: records mcp.* calls", () => {
  const collector = new TraceCollector();

  collector.recordMcpCall(
    "filesystem:read_file",
    { path: "/tmp/test.txt" },
    { content: "Hello" },
    50,
    true,
  );

  collector.recordMcpCall(
    "json:parse",
    { input: '{"key":"value"}' },
    { key: "value" },
    10,
    true,
  );

  assertEquals(collector.getCallCount(), 2);
});

Deno.test("TraceCollector: generates sequential task IDs", () => {
  const collector = new TraceCollector();

  collector.recordMcpCall("test:one", {}, null, 10, true);
  collector.recordMcpCall("test:two", {}, null, 20, true);
  collector.recordMcpCall("test:three", {}, null, 30, true);

  const snapshot = collector.getSnapshot();

  assertEquals(snapshot[0].taskId, "t1");
  assertEquals(snapshot[1].taskId, "t2");
  assertEquals(snapshot[2].taskId, "t3");
});

Deno.test("TraceCollector: records branch decisions", () => {
  const collector = new TraceCollector();

  collector.recordBranchDecision("d1", "true", "x > 5");
  collector.recordBranchDecision("d2", "case:default");

  const trace = collector.finalize("test:cap", true);

  assertEquals(trace.decisions.length, 2);
  assertEquals(trace.decisions[0].nodeId, "d1");
  assertEquals(trace.decisions[0].outcome, "true");
  assertEquals(trace.decisions[0].condition, "x > 5");
  assertEquals(trace.decisions[1].nodeId, "d2");
  assertEquals(trace.decisions[1].outcome, "case:default");
});

Deno.test("TraceCollector: finalizes with success", () => {
  const collector = new TraceCollector();

  collector.recordMcpCall("test:call", { arg: "value" }, { result: "ok" }, 100, true);

  const trace = collector.finalize("my:capability", true);

  assertEquals(trace.capabilityId, "my:capability");
  assertEquals(trace.success, true);
  assertEquals(trace.error, undefined);
  assertEquals(trace.taskResults.length, 1);
  assertEquals(trace.taskResults[0].tool, "test:call");
});

Deno.test("TraceCollector: finalizes with error", () => {
  const collector = new TraceCollector();

  collector.recordMcpCall("test:call", {}, null, 50, false);

  const trace = collector.finalize("my:capability", false, "Something went wrong");

  assertEquals(trace.success, false);
  assertEquals(trace.error, "Something went wrong");
});

Deno.test("TraceCollector: calculates duration", async () => {
  const collector = new TraceCollector();

  // Wait a bit to accumulate time
  await new Promise((resolve) => setTimeout(resolve, 50));

  const trace = collector.finalize("test:cap", true);

  // Duration should be at least 50ms
  assertEquals(trace.durationMs >= 50, true);
});

Deno.test("TraceCollector: includes timestamp", () => {
  const collector = new TraceCollector();
  const beforeFinalize = new Date().toISOString();

  const trace = collector.finalize("test:cap", true);

  // Timestamp should be a valid ISO string
  assertEquals(typeof trace.timestamp, "string");
  assertEquals(trace.timestamp.length > 0, true);
  // Should be roughly now
  const traceTime = new Date(trace.timestamp).getTime();
  const beforeTime = new Date(beforeFinalize).getTime();
  assertEquals(traceTime >= beforeTime - 1000, true);
});

Deno.test("TraceCollector: includes userId when provided", () => {
  const collector = new TraceCollector();

  const trace = collector.finalize("test:cap", true, undefined, "user123");

  assertEquals(trace.userId, "user123");
});

Deno.test("TraceCollector: throws on record after finalize", () => {
  const collector = new TraceCollector();
  collector.finalize("test:cap", true);

  assertThrows(
    () => collector.recordMcpCall("test:call", {}, null, 10, true),
    Error,
    "finalized",
  );
});

Deno.test("TraceCollector: throws on branch decision after finalize", () => {
  const collector = new TraceCollector();
  collector.finalize("test:cap", true);

  assertThrows(
    () => collector.recordBranchDecision("d1", "true"),
    Error,
    "finalized",
  );
});

Deno.test("TraceCollector: throws on double finalize", () => {
  const collector = new TraceCollector();
  collector.finalize("test:cap", true);

  assertThrows(
    () => collector.finalize("test:cap", true),
    Error,
    "already been finalized",
  );
});

Deno.test("TraceCollector: isFinalized returns correct state", () => {
  const collector = new TraceCollector();

  assertEquals(collector.isFinalized(), false);

  collector.finalize("test:cap", true);

  assertEquals(collector.isFinalized(), true);
});

Deno.test("TraceCollector: getElapsedMs works before finalize", async () => {
  const collector = new TraceCollector();

  await new Promise((resolve) => setTimeout(resolve, 30));

  const elapsed = collector.getElapsedMs();
  assertEquals(elapsed >= 30, true);
});

Deno.test("TraceCollector: sanitizes sensitive data on finalize", () => {
  const collector = new TraceCollector();

  // Record a call with sensitive data
  collector.recordMcpCall(
    "http:request",
    { api_key: "secret123", url: "https://api.example.com" },
    { email: "user@example.com", data: "response" },
    100,
    true,
  );

  const trace = collector.finalize("test:cap", true);

  // api_key should be redacted
  assertEquals(trace.taskResults[0].args.api_key, "[REDACTED]");
  // email should be masked
  assertEquals(
    JSON.stringify(trace.taskResults[0].result).includes("[EMAIL]"),
    true,
  );
});

Deno.test("TraceCollector: sanitizes error message", () => {
  const collector = new TraceCollector();

  const trace = collector.finalize(
    "test:cap",
    false,
    "Token sk-test1234567890test1234567890 is invalid",
  );

  // Token should be redacted in error
  assertEquals(trace.error!.includes("[REDACTED]"), true);
  assertEquals(trace.error!.includes("sk-test"), false);
});

Deno.test("TraceCollector: getSnapshot returns copy", () => {
  const collector = new TraceCollector();

  collector.recordMcpCall("test:one", {}, null, 10, true);

  const snapshot1 = collector.getSnapshot();
  const snapshot2 = collector.getSnapshot();

  // Should be different arrays
  assertEquals(snapshot1 !== snapshot2, true);
  // But same content
  assertEquals(snapshot1.length, snapshot2.length);
});

Deno.test("TraceCollector: empty trace is valid", () => {
  const collector = new TraceCollector();

  const trace = collector.finalize("test:cap", true);

  assertEquals(trace.taskResults.length, 0);
  assertEquals(trace.decisions.length, 0);
  assertEquals(trace.success, true);
});
