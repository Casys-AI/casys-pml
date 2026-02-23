/**
 * Unit tests for path-level-features UUID filtering
 *
 * Verifies that UUID capability IDs in executedPath are filtered out
 * before computing pathKey, so that functionally identical workflows
 * produce stable, identical keys.
 *
 * @module tests/unit/graphrag/learning/path_level_features_test
 */

import { assertEquals } from "@std/assert";
import {
  extractPathLevelFeatures,
  getPathKey,
} from "../../../../src/graphrag/learning/path-level-features.ts";
import type { ExecutionTrace } from "../../../../src/capabilities/types.ts";

/**
 * Helper to create a minimal ExecutionTrace for testing
 */
function makeTrace(
  overrides: Partial<ExecutionTrace> & { executedPath: string[]; success: boolean },
): ExecutionTrace {
  return {
    id: "trace-1",
    capabilityId: "cap-1",
    durationMs: 100,
    decisions: [],
    taskResults: [],
    priority: 0.5,
    createdAt: new Date(),
    ...overrides,
  } as ExecutionTrace;
}

// ============================================================================
// getPathKey: UUID filtering
// ============================================================================

Deno.test("path-level-features: getPathKey filters UUIDs from path", () => {
  const trace = makeTrace({
    executedPath: [
      "filesystem:read",
      "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "json:parse",
    ],
    success: true,
  });

  const key = getPathKey(trace);
  assertEquals(key, "filesystem:read->json:parse");
});

Deno.test("path-level-features: getPathKey is stable with/without UUIDs", () => {
  const traceWithUUID = makeTrace({
    executedPath: [
      "filesystem:read",
      "d47f2e3a-1234-4abc-9def-abcdef012345",
      "slack:send",
    ],
    success: true,
  });

  const traceWithoutUUID = makeTrace({
    executedPath: ["filesystem:read", "slack:send"],
    success: true,
  });

  assertEquals(getPathKey(traceWithUUID), getPathKey(traceWithoutUUID));
});

Deno.test("path-level-features: getPathKey handles path of only UUIDs", () => {
  const trace = makeTrace({
    executedPath: [
      "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "11111111-2222-3333-4444-555555555555",
    ],
    success: true,
  });

  const key = getPathKey(trace);
  assertEquals(key, "");
});

Deno.test("path-level-features: getPathKey preserves tool:action format", () => {
  const trace = makeTrace({
    executedPath: ["fs:read", "json:parse", "slack:send"],
    success: true,
  });

  const key = getPathKey(trace);
  assertEquals(key, "fs:read->json:parse->slack:send");
});

Deno.test("path-level-features: getPathKey handles UUIDv7 (timestamp-based)", () => {
  const trace = makeTrace({
    executedPath: [
      "filesystem:read",
      "019516a2-c5d4-7def-8abc-123456789abc", // UUIDv7
      "json:parse",
    ],
    success: true,
  });

  const key = getPathKey(trace);
  assertEquals(key, "filesystem:read->json:parse");
});

// ============================================================================
// extractPathLevelFeatures: UUID filtering prevents fragmentation
// ============================================================================

Deno.test("path-level-features: extractPathLevelFeatures groups traces with different UUIDs together", () => {
  const traces = [
    makeTrace({
      id: "t1",
      executedPath: ["fs:read", "aaaa1111-bbbb-cccc-dddd-eeee00001111", "json:parse"],
      success: true,
    }),
    makeTrace({
      id: "t2",
      executedPath: ["fs:read", "ffff2222-3333-4444-5555-666677778888", "json:parse"],
      success: false,
    }),
    makeTrace({
      id: "t3",
      executedPath: ["fs:read", "json:parse"],
      success: true,
    }),
  ];

  const features = extractPathLevelFeatures(traces);

  // All three traces should map to the same pathKey
  assertEquals(features.size, 1, "Should have exactly 1 path group, not 3");

  const entry = features.get("fs:read->json:parse");
  assertEquals(entry !== undefined, true, "Path key should be fs:read->json:parse");
  assertEquals(entry!.pathFrequency, 1.0, "All traces belong to same path");
  assertEquals(entry!.isDominantPath, true);
  // 2 successes out of 3
  assertEquals(entry!.pathSuccessRate, 2 / 3);
});

Deno.test("path-level-features: extractPathLevelFeatures keeps different real paths separate", () => {
  const traces = [
    makeTrace({
      id: "t1",
      executedPath: ["fs:read", "json:parse"],
      success: true,
    }),
    makeTrace({
      id: "t2",
      executedPath: ["fs:read", "csv:parse"],
      success: true,
    }),
  ];

  const features = extractPathLevelFeatures(traces);
  assertEquals(features.size, 2, "Different real paths should stay separate");
});
