/**
 * DAG Suggester Adapter — GRU-only Tests
 *
 * Tests the GRU-only strategy in DAGSuggesterAdapter.
 * No SHGAT fallback — SHGAT is only used for scoreCapabilities().
 *
 * @module tests/unit/graphrag/gru_dag_suggester_test
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  DAGSuggesterAdapter,
} from "../../../src/infrastructure/di/adapters/execute/dag-suggester-adapter.ts";
import type { IGRUInference } from "../../../src/graphrag/algorithms/gru/types.ts";

// ============================================================================
// Mocks
// ============================================================================

function mockGRU(opts: {
  ready?: boolean;
  firstToolScore?: number;
  firstToolId?: string;
  beamPath?: string[];
} = {}): IGRUInference {
  const {
    ready = true,
    firstToolScore = 0.6,
    firstToolId = "std:gru_tool",
    beamPath = ["std:gru_tool", "std:gru_tool_2"],
  } = opts;

  return {
    isReady: () => ready,
    predictFirstTool: () => ({
      toolId: firstToolId,
      score: firstToolScore,
      ranked: [{ toolId: firstToolId, score: firstToolScore }],
    }),
    buildPath: () => beamPath,
    buildPathBeam: () => [{
      path: beamPath,
      score: firstToolScore,
    }],
  };
}

// ============================================================================
// GRU-only strategy Tests
// ============================================================================

Deno.test("suggest - uses GRU when ready and confident", async () => {
  const adapter = new DAGSuggesterAdapter({
    gru: mockGRU({ firstToolScore: 0.6 }),
    embeddingModel: { encode: async () => new Array(8).fill(0.1) },
  });

  const result = await adapter.suggest("test intent", "corr-1", new Array(8).fill(0.1));

  assertExists(result.suggestedDag);
  assertEquals(result.suggestedDag!.tasks[0].callName, "std:gru_tool");
  assertEquals(result.suggestedDag!.tasks.length, 2); // beam path has 2 tools
});

Deno.test("suggest - returns confidence 0 when GRU not ready", async () => {
  const adapter = new DAGSuggesterAdapter({
    gru: mockGRU({ ready: false }),
    embeddingModel: { encode: async () => new Array(8).fill(0.1) },
  });

  const result = await adapter.suggest("test intent", "corr-2", new Array(8).fill(0.1));

  // No fallback to SHGAT — just confidence: 0
  assertEquals(result.confidence, 0);
  assertEquals(result.suggestedDag, undefined);
});

Deno.test("suggest - returns confidence 0 when GRU confidence too low", async () => {
  const adapter = new DAGSuggesterAdapter({
    gru: mockGRU({ firstToolScore: 0.01 }), // Below GRU_CONFIDENCE_THRESHOLD
    embeddingModel: { encode: async () => new Array(8).fill(0.1) },
  });

  const result = await adapter.suggest("test intent", "corr-3", new Array(8).fill(0.1));

  // No fallback to SHGAT — just confidence: 0
  assertEquals(result.confidence, 0);
  assertEquals(result.suggestedDag, undefined);
});

Deno.test("suggest - GRU path creates sequential dependencies", async () => {
  const adapter = new DAGSuggesterAdapter({
    gru: mockGRU({
      beamPath: ["tool_a", "tool_b", "tool_c"],
      firstToolScore: 0.5,
    }),
    embeddingModel: { encode: async () => new Array(8).fill(0.1) },
  });

  const result = await adapter.suggest("test intent", "corr-4", new Array(8).fill(0.1));

  assertExists(result.suggestedDag);
  const tasks = result.suggestedDag!.tasks;
  assertEquals(tasks.length, 3);
  assertEquals(tasks[0].dependsOn, []);
  assertEquals(tasks[1].dependsOn, ["task_0"]);
  assertEquals(tasks[2].dependsOn, ["task_1"]);
});

Deno.test("suggest - returns confidence 0 without GRU (no fallback)", async () => {
  const adapter = new DAGSuggesterAdapter({
    // No GRU provided
    embeddingModel: { encode: async () => new Array(8).fill(0.1) },
  });

  const result = await adapter.suggest("test intent", "corr-5", new Array(8).fill(0.1));

  // No GRU → no suggestion, regardless of SHGAT
  assertEquals(result.confidence, 0);
  assertEquals(result.suggestedDag, undefined);
});

Deno.test("suggest - returns confidence 0 without GRU and without SHGAT", async () => {
  const adapter = new DAGSuggesterAdapter({
    embeddingModel: { encode: async () => new Array(8).fill(0.1) },
  });

  const result = await adapter.suggest("test intent", "corr-6", new Array(8).fill(0.1));
  assertEquals(result.confidence, 0);
});

Deno.test("suggest - canSpeculate true when score >= 0.5", async () => {
  const adapter = new DAGSuggesterAdapter({
    gru: mockGRU({ firstToolScore: 0.7 }),
    embeddingModel: { encode: async () => new Array(8).fill(0.1) },
  });

  const result = await adapter.suggest("test", "corr-cs", new Array(8).fill(0.1));
  assertExists(result.suggestedDag);
  assertEquals(result.canSpeculate, true);
});

Deno.test("suggest - canSpeculate false when score < 0.5", async () => {
  const adapter = new DAGSuggesterAdapter({
    gru: mockGRU({ firstToolScore: 0.3 }),
    embeddingModel: { encode: async () => new Array(8).fill(0.1) },
  });

  const result = await adapter.suggest("test", "corr-cs2", new Array(8).fill(0.1));
  assertExists(result.suggestedDag);
  assertEquals(result.canSpeculate, false);
});

// ============================================================================
// setGRU lazy initialization Tests
// ============================================================================

Deno.test("setGRU - enables GRU after construction", async () => {
  const adapter = new DAGSuggesterAdapter({
    embeddingModel: { encode: async () => new Array(8).fill(0.1) },
  });

  // Without GRU → no suggestion
  const r1 = await adapter.suggest("test", "corr-7", new Array(8).fill(0.1));
  assertEquals(r1.confidence, 0);

  // Set GRU → should work now
  adapter.setGRU(mockGRU({ firstToolScore: 0.5 }));
  const r2 = await adapter.suggest("test", "corr-8", new Array(8).fill(0.1));
  assertExists(r2.suggestedDag);
  assertEquals(r2.suggestedDag!.tasks[0].callName, "std:gru_tool");
});

// ============================================================================
// GRU error handling Tests
// ============================================================================

Deno.test("suggest - GRU exception returns confidence 0 (no fallback)", async () => {
  const brokenGRU: IGRUInference = {
    isReady: () => true,
    predictFirstTool: () => { throw new Error("GRU exploded"); },
    buildPath: () => [],
    buildPathBeam: () => [],
  };

  const adapter = new DAGSuggesterAdapter({
    gru: brokenGRU,
    embeddingModel: { encode: async () => new Array(8).fill(0.1) },
  });

  const result = await adapter.suggest("test intent", "corr-9", new Array(8).fill(0.1));

  // No crash, no SHGAT fallback — just confidence: 0
  assertEquals(result.confidence, 0);
  assertEquals(result.suggestedDag, undefined);
});

Deno.test("suggest - returns confidence 0 when no embedding available", async () => {
  const adapter = new DAGSuggesterAdapter({
    gru: mockGRU({ firstToolScore: 0.8 }),
    // No embedding model, no precomputed embedding
  });

  const result = await adapter.suggest("test intent", "corr-10");
  assertEquals(result.confidence, 0);
});

