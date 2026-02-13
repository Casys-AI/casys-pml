/**
 * GRU Weight Persistence Tests
 *
 * Tests for exportWeights() and loadWeights() on CompactInformedGRU.
 * Run with: npx tsx --test src/transition/__tests__/gru-weights.test.ts
 *
 * @module gru/transition/__tests__/gru-weights
 */

import { describe, it, before } from "node:test";
import { strict as assert } from "node:assert";
import { initTensorFlow } from "../../tf/backend.ts";
import { CompactInformedGRU } from "../gru-model.ts";
import type { ToolCapabilityMap, TransitionExample } from "../types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMB_DIM = 1024;
const NUM_TOOLS = 5;

function randomEmb(dim: number): number[] {
  return Array.from({ length: dim }, () => Math.random() * 2 - 1);
}

function makeToolVocab(): Map<string, number[]> {
  const tools = new Map<string, number[]>();
  for (let i = 0; i < NUM_TOOLS; i++) {
    tools.set(`tool_${i}`, randomEmb(EMB_DIM));
  }
  return tools;
}

function makeToolCapMap(numTools: number): ToolCapabilityMap {
  return {
    matrix: new Float32Array(numTools * 2),
    numTools,
    numCapabilities: 2,
  };
}

function makeExample(toolIds: string[], targetIdx: number): TransitionExample {
  return {
    intentEmbedding: randomEmb(EMB_DIM),
    contextToolIds: [],
    targetToolId: toolIds[targetIdx],
    isTerminal: 0,
    isSingleTool: false,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CompactInformedGRU weight persistence", () => {
  let tools: Map<string, number[]>;
  let toolCapMap: ToolCapabilityMap;

  before(async () => {
    await initTensorFlow();
    tools = makeToolVocab();
    toolCapMap = makeToolCapMap(NUM_TOOLS);
  });

  describe("exportWeights", () => {
    it("throws if model not built", () => {
      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      assert.throws(() => model.exportWeights(), /not built/i);
    });

    it("returns names and weights arrays", () => {
      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, toolCapMap, []);
      const exported = model.exportWeights();

      assert.ok(Array.isArray(exported.names), "names should be an array");
      assert.ok(Array.isArray(exported.weights), "weights should be an array");
      assert.equal(exported.names.length, exported.weights.length, "names.length === weights.length");
      assert.ok(exported.names.length > 0, "should have at least one weight tensor");

      // Each weight should be a flat number array
      for (const w of exported.weights) {
        assert.ok(Array.isArray(w), "each weight should be an array");
        assert.ok(w.every((v) => typeof v === "number"), "all values should be numbers");
      }

      // Names should be non-empty strings
      for (const n of exported.names) {
        assert.ok(typeof n === "string" && n.length > 0, `name should be non-empty string, got: ${n}`);
      }

      model.dispose();
    });

    it("is JSON-serializable", () => {
      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, toolCapMap, []);
      const exported = model.exportWeights();

      const json = JSON.stringify(exported);
      assert.ok(json.length > 0, "JSON should not be empty");
      const parsed = JSON.parse(json);
      assert.deepEqual(parsed.names, exported.names);
      assert.equal(parsed.weights.length, exported.weights.length);

      model.dispose();
    });
  });

  describe("loadWeights", () => {
    it("throws if model not built", () => {
      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      assert.throws(() => model.loadWeights({ names: [], weights: [] }), /not built/i);
    });

    it("throws on weight count mismatch", () => {
      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, toolCapMap, []);
      assert.throws(
        () => model.loadWeights({ names: ["x"], weights: [[1, 2, 3]] }),
        /mismatch/i,
      );
      model.dispose();
    });

    it("round-trips weights through export/load", () => {
      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, toolCapMap, []);

      const exported = model.exportWeights();

      // Create a second model with same vocab
      const model2 = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model2.setToolVocabulary(tools, toolCapMap, []);

      // Load weights from first model
      model2.loadWeights(exported);

      // Export from second model and compare
      const exported2 = model2.exportWeights();
      assert.equal(exported2.names.length, exported.names.length);

      // Weights should match (except similarity_head which is re-injected)
      for (let i = 0; i < exported.weights.length; i++) {
        const w1 = exported.weights[i];
        const w2 = exported2.weights[i];
        assert.equal(w1.length, w2.length, `weight ${i} length mismatch`);
        for (let j = 0; j < w1.length; j++) {
          assert.ok(
            Math.abs(w1[j] - w2[j]) < 1e-5,
            `weight ${exported.names[i]}[${j}]: ${w1[j]} !== ${w2[j]}`,
          );
        }
      }

      model.dispose();
      model2.dispose();
    });

    it("preserves predictions after round-trip", () => {
      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, toolCapMap, []);

      // Train a few steps so weights diverge from init
      const toolIds = [...tools.keys()];
      const examples = Array.from({ length: 10 }, (_, i) => makeExample(toolIds, i % NUM_TOOLS));
      model.trainStep(examples);

      // Get predictions before export
      const intent = randomEmb(EMB_DIM);
      const pred1 = model.predictNextTopK(intent, [], 5);

      // Export, load into new model
      const exported = model.exportWeights();
      const model2 = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model2.setToolVocabulary(tools, toolCapMap, []);
      model2.loadWeights(exported);

      // Predictions should match
      const pred2 = model2.predictNextTopK(intent, [], 5);
      assert.equal(pred1.ranked.length, pred2.ranked.length, "ranked length should match");
      for (let i = 0; i < pred1.ranked.length; i++) {
        assert.equal(pred1.ranked[i].toolId, pred2.ranked[i].toolId, `rank ${i} toolId mismatch`);
        assert.ok(
          Math.abs(pred1.ranked[i].score - pred2.ranked[i].score) < 1e-4,
          `rank ${i} score mismatch: ${pred1.ranked[i].score} vs ${pred2.ranked[i].score}`,
        );
      }

      model.dispose();
      model2.dispose();
    });
  });
});
