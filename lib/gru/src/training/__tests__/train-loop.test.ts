/**
 * Train Loop Unit Tests
 *
 * Tests for the extracted trainGRU() and evaluateGRU() functions.
 * Run with: npx tsx --test src/training/__tests__/train-loop.test.ts
 *
 * @module gru/training/__tests__/train-loop
 */

import { before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { initTensorFlow } from "../../tf/backend.ts";
import { CompactInformedGRU } from "../../transition/gru-model.ts";
import type { ToolCapabilityMap, TransitionExample, VocabNode } from "../../transition/types.ts";
import { evaluateGRU, trainGRU } from "../train-loop.ts";
import type { GRUTrainingResult } from "../train-loop.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMB_DIM = 1024;
const NUM_TOOLS = 5;

/** Generate a random embedding of the given dimension. */
function randomEmb(dim: number): number[] {
  return Array.from({ length: dim }, () => Math.random() * 2 - 1);
}

/** Create a minimal tool vocabulary. */
function makeToolVocab(): Map<string, number[]> {
  const tools = new Map<string, number[]>();
  for (let i = 0; i < NUM_TOOLS; i++) {
    tools.set(`tool_${i}`, randomEmb(EMB_DIM));
  }
  return tools;
}

/** Create a minimal ToolCapabilityMap. */
function makeToolCapMap(numTools: number): ToolCapabilityMap {
  return {
    matrix: new Float32Array(numTools * 2), // 2 capabilities
    numTools,
    numCapabilities: 2,
  };
}

/** Create a training example. */
function makeExample(
  tools: Map<string, number[]>,
  targetIdx: number,
  contextIdxs: number[] = [],
  isTerminal = 0,
): TransitionExample {
  const toolIds = [...tools.keys()];
  return {
    intentEmbedding: randomEmb(EMB_DIM),
    contextToolIds: contextIdxs.map((i) => toolIds[i]),
    targetToolId: toolIds[targetIdx],
    isTerminal,
    isSingleTool: false,
  };
}

/** Deterministic identity shuffle (preserves order). */
function identityShuffle<T>(arr: T[]): T[] {
  return [...arr];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("evaluateGRU", () => {
  let model: CompactInformedGRU;
  let tools: Map<string, number[]>;

  before(async () => {
    await initTensorFlow();
    tools = makeToolVocab();
    model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
    model.setToolVocabulary(tools, makeToolCapMap(NUM_TOOLS), []);
  });

  it("returns metrics with correct shape", () => {
    const testSet: TransitionExample[] = [];
    for (let i = 0; i < 10; i++) {
      testSet.push(makeExample(tools, i % NUM_TOOLS, [], 0));
    }
    const result = evaluateGRU(model, testSet);

    assert.ok(typeof result.hit1 === "number", "hit1 should be a number");
    assert.ok(typeof result.hit3 === "number", "hit3 should be a number");
    assert.ok(typeof result.hit5 === "number", "hit5 should be a number");
    assert.ok(typeof result.mrr === "number", "mrr should be a number");
    assert.ok(typeof result.testTermAcc === "number", "testTermAcc should be a number");
    assert.ok(typeof result.testNextAcc === "number", "testNextAcc should be a number");
    assert.ok(result.hit1 >= 0 && result.hit1 <= 100, "hit1 in [0,100]");
    assert.ok(result.mrr >= 0 && result.mrr <= 1, "mrr in [0,1]");
  });

  it("returns zero metrics for empty test set", () => {
    const result = evaluateGRU(model, []);
    assert.equal(result.hit1, 0);
    assert.equal(result.mrr, 0);
    assert.equal(result.testNextAcc, 0);
  });

  it("skips single-tool examples for nextAcc", () => {
    const singleEx: TransitionExample = {
      intentEmbedding: randomEmb(EMB_DIM),
      contextToolIds: [],
      targetToolId: [...tools.keys()][0],
      isTerminal: 1,
      isSingleTool: true,
    };
    const result = evaluateGRU(model, [singleEx]);
    assert.equal(
      result.testNextAcc,
      0,
      "single-tool should have 0 nextAcc (excluded from ranking)",
    );
  });
});

describe("trainGRU", () => {
  let model: CompactInformedGRU;
  let tools: Map<string, number[]>;

  before(async () => {
    await initTensorFlow();
    tools = makeToolVocab();
    model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
    model.setToolVocabulary(tools, makeToolCapMap(NUM_TOOLS), []);
  });

  it("trains for specified epochs and returns result", () => {
    const prodTrain: TransitionExample[] = [];
    const prodTest: TransitionExample[] = [];
    for (let i = 0; i < 20; i++) {
      prodTrain.push(makeExample(tools, i % NUM_TOOLS, [], i === 4 ? 1 : 0));
    }
    for (let i = 0; i < 5; i++) {
      prodTest.push(makeExample(tools, i % NUM_TOOLS));
    }

    const result: GRUTrainingResult = trainGRU(
      model,
      { prodTrain, prodTest, n8nTrain: [] },
      { epochs: 2, batchSize: 8, prodOversample: 1 },
      identityShuffle,
      false, // quiet
    );

    assert.equal(result.epochLog.length, 2, "should have 2 epoch logs");
    assert.ok(result.trainTimeSec >= 0, "trainTimeSec >= 0");
    assert.ok(typeof result.bestTestHit1 === "number");
    assert.ok(typeof result.bestMRR === "number");
    assert.ok(typeof result.finalHit1 === "number");
    assert.ok(typeof result.finalHit3 === "number");
    assert.ok(typeof result.finalHit5 === "number");
    assert.ok(typeof result.finalMRR === "number");
    assert.ok(result.bestEpoch >= 1 && result.bestEpoch <= 2);
  });

  it("handles n8nTrain examples", () => {
    const prodTrain = [makeExample(tools, 0)];
    const prodTest = [makeExample(tools, 1)];
    const n8nTrain: TransitionExample[] = [];
    for (let i = 0; i < 10; i++) {
      const ex = makeExample(tools, i % NUM_TOOLS);
      ex.softTargetProbs = Array.from({ length: NUM_TOOLS }, () => 1 / NUM_TOOLS);
      n8nTrain.push(ex);
    }

    const result = trainGRU(
      model,
      { prodTrain, prodTest, n8nTrain },
      { epochs: 1, batchSize: 8, prodOversample: 1 },
      identityShuffle,
      false,
    );

    assert.equal(result.epochLog.length, 1);
  });

  it("prodOversample multiplies prod examples", () => {
    const prodTrain = [makeExample(tools, 0), makeExample(tools, 1)];
    const prodTest = [makeExample(tools, 2)];

    // With oversample=3, pool should have 6 prod + 0 n8n = 6 examples
    const result = trainGRU(
      model,
      { prodTrain, prodTest, n8nTrain: [] },
      { epochs: 1, batchSize: 32, prodOversample: 3 },
      identityShuffle,
      false,
    );

    // 6 examples / 32 batch = 1 batch minimum
    assert.equal(result.epochLog.length, 1);
  });
});
