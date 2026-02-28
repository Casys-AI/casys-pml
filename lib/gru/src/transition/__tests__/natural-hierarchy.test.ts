/**
 * Natural Hierarchy Tests
 *
 * Validates that the GRU correctly handles cap-children (L1+ caps as children of L2+ caps)
 * instead of flattening everything to L0 tools.
 *
 * Run with: npx tsx --test src/transition/__tests__/natural-hierarchy.test.ts
 *
 * @module gru/transition/__tests__/natural-hierarchy
 */

import { describe, it, before } from "node:test";
import { strict as assert } from "node:assert";
import { initTensorFlow } from "../../tf/backend.ts";
import { CompactInformedGRU } from "../gru-model.ts";
import type { ToolCapabilityMap, VocabNode } from "../types.ts";

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

/** Build a minimal toolCapMap (tools only, no cap conditioning). */
function makeToolCapMap(numTools: number, numCaps: number): ToolCapabilityMap {
  return {
    matrix: new Float32Array(numTools * numCaps),
    numTools,
    numCapabilities: numCaps,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Natural hierarchy", () => {
  let tools: Map<string, number[]>;

  before(async () => {
    await initTensorFlow();
    tools = makeToolVocab();
  });

  describe("setToolVocabulary bottom-up registration", () => {
    it("registers L1 caps with L0 children", () => {
      const capL1: VocabNode = {
        id: "cap:l1_a",
        level: 1,
        embedding: randomEmb(EMB_DIM),
        children: ["tool_0", "tool_1"],
      };

      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, makeToolCapMap(NUM_TOOLS, 1), [capL1]);

      // vocabSize should be numTools + 1 cap
      const config = (model as any).config;
      assert.equal(config.numVocabNodes, 1, "should register 1 vocab node");

      model.dispose();
    });

    it("registers L2 caps with L1 cap-children via bottom-up", () => {
      const capL1: VocabNode = {
        id: "cap:l1_a",
        level: 1,
        embedding: randomEmb(EMB_DIM),
        children: ["tool_0", "tool_1"],
      };
      const capL2: VocabNode = {
        id: "cap:l2_x",
        level: 2,
        embedding: randomEmb(EMB_DIM),
        children: ["cap:l1_a"],  // L1 cap as child, NOT L0 tools
      };

      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, makeToolCapMap(NUM_TOOLS, 2), [capL1, capL2]);

      const config = (model as any).config;
      assert.equal(config.numVocabNodes, 2, "should register both L1 and L2 nodes");

      // Both should have valid indices
      const nodeToIndex = (model as any).nodeToIndex as Map<string, number>;
      assert.ok(nodeToIndex.has("cap:l1_a"), "L1 cap should be registered");
      assert.ok(nodeToIndex.has("cap:l2_x"), "L2 cap should be registered");

      // L2 index should be after L1
      const l1Idx = nodeToIndex.get("cap:l1_a")!;
      const l2Idx = nodeToIndex.get("cap:l2_x")!;
      assert.ok(l1Idx >= NUM_TOOLS, "L1 index should be >= numTools");
      assert.ok(l2Idx > l1Idx, "L2 index should be after L1");

      model.dispose();
    });

    it("skips L2 cap if its L1 children are unknown", () => {
      const capL2: VocabNode = {
        id: "cap:l2_orphan",
        level: 2,
        embedding: randomEmb(EMB_DIM),
        children: ["cap:l1_nonexistent"],
      };

      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, makeToolCapMap(NUM_TOOLS, 1), [capL2]);

      const config = (model as any).config;
      assert.equal(config.numVocabNodes, 0, "should NOT register orphan L2 cap");

      model.dispose();
    });
  });

  describe("getToolEmbedding cap lookup", () => {
    it("returns cap embedding (not zeros) for registered L1 cap", () => {
      const capEmb = randomEmb(EMB_DIM);
      const capL1: VocabNode = {
        id: "cap:test_cap",
        level: 1,
        embedding: capEmb,
        children: ["tool_0", "tool_1"],
      };

      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, makeToolCapMap(NUM_TOOLS, 1), [capL1]);

      // Access private method via prototype
      const getToolEmbedding = (model as any).getToolEmbedding.bind(model);
      const result = getToolEmbedding("cap:test_cap");

      // Should NOT be all zeros
      const sumAbs = result.reduce((s: number, v: number) => s + Math.abs(v), 0);
      assert.ok(sumAbs > 0, "cap embedding should not be zeros");

      // Should match the original cap embedding
      for (let i = 0; i < EMB_DIM; i++) {
        assert.ok(
          Math.abs(result[i] - capEmb[i]) < 1e-6,
          `embedding[${i}] mismatch`,
        );
      }

      model.dispose();
    });

    it("returns zeros for unknown tool/cap", () => {
      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, makeToolCapMap(NUM_TOOLS, 1), []);

      const getToolEmbedding = (model as any).getToolEmbedding.bind(model);
      const result = getToolEmbedding("cap:nonexistent");

      const sumAbs = result.reduce((s: number, v: number) => s + Math.abs(v), 0);
      assert.equal(sumAbs, 0, "unknown cap should return zeros");

      model.dispose();
    });
  });

  describe("prepareBatchInputs OOB guard", () => {
    it("excludes cap indices from cap fingerprint context", () => {
      const capL1: VocabNode = {
        id: "cap:l1_a",
        level: 1,
        embedding: randomEmb(EMB_DIM),
        children: ["tool_0", "tool_1"],
      };

      const toolCapMap = makeToolCapMap(NUM_TOOLS, 1);
      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, toolCapMap, [capL1]);

      // Context with a mix of L0 tool and L1 cap — should NOT crash
      const example = {
        intentEmbedding: randomEmb(EMB_DIM),
        contextToolIds: ["tool_0", "cap:l1_a", "tool_2"],
        targetToolId: "tool_3",
        isTerminal: 0,
        isSingleTool: false,
      };

      // prepareBatchInputs is private, but trainStep calls it internally.
      // If OOB guard works, this should NOT throw.
      assert.doesNotThrow(() => {
        model.trainStep([example]);
      }, "trainStep with cap in context should not throw OOB");

      model.dispose();
    });
  });

  describe("applyStructuralBias resolves caps to L0 children", () => {
    it("applies bias via L0 children when last context item is a cap", () => {
      const capL1: VocabNode = {
        id: "cap:l1_a",
        level: 1,
        embedding: randomEmb(EMB_DIM),
        children: ["tool_0", "tool_1"],
      };

      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, makeToolCapMap(NUM_TOOLS, 1), [capL1]);

      const numTools = NUM_TOOLS;
      const jaccardMatrix = new Float32Array(numTools * numTools);
      const bigramMatrix = new Float32Array(numTools * numTools);
      // Make tool_0 → tool_3 have high Jaccard, tool_1 → tool_4 have high Jaccard
      jaccardMatrix[0 * numTools + 3] = 5.0;
      jaccardMatrix[1 * numTools + 4] = 5.0;
      model.setStructuralBias({
        jaccardMatrix,
        bigramMatrix,
        numTools,
      });

      const applyStructuralBias = (model as any).applyStructuralBias.bind(model);
      const vocabSize = numTools + 1; // tools + 1 cap
      const probs = new Float32Array(vocabSize);
      for (let i = 0; i < vocabSize; i++) probs[i] = 1 / vocabSize;

      // Last context item is a cap with children [tool_0, tool_1]
      // → should average their Jaccard rows → tool_3 and tool_4 get boosted
      const result = applyStructuralBias(probs, ["tool_2", "cap:l1_a"]);
      assert.ok(
        result[3] > 1 / vocabSize || result[4] > 1 / vocabSize,
        "children's Jaccard bias should boost tool_3 or tool_4",
      );

      model.dispose();
    });

    it("returns raw probs for unknown cap (no L0 children)", () => {
      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, makeToolCapMap(NUM_TOOLS, 1), []);

      const numTools = NUM_TOOLS;
      const jaccardMatrix = new Float32Array(numTools * numTools);
      for (let i = 0; i < numTools * numTools; i++) jaccardMatrix[i] = Math.random();
      model.setStructuralBias({
        jaccardMatrix,
        bigramMatrix: new Float32Array(numTools * numTools),
        numTools,
      });

      const applyStructuralBias = (model as any).applyStructuralBias.bind(model);
      const probs = new Float32Array(numTools);
      for (let i = 0; i < numTools; i++) probs[i] = 1 / numTools;

      // Unknown cap → should return unchanged
      const result = applyStructuralBias(probs, ["tool_0", "cap:unknown"]);
      for (let i = 0; i < numTools; i++) {
        assert.ok(
          Math.abs(result[i] - probs[i]) < 1e-6,
          `probs[${i}] should be unchanged for unknown cap`,
        );
      }

      model.dispose();
    });

    it("applies bias when last context item is a L0 tool", () => {
      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, makeToolCapMap(NUM_TOOLS, 1), []);

      const numTools = NUM_TOOLS;
      const jaccardMatrix = new Float32Array(numTools * numTools);
      // Non-zero Jaccard: make tool_0 → tool_1 have high similarity
      jaccardMatrix[0 * numTools + 1] = 5.0;
      model.setStructuralBias({
        jaccardMatrix,
        bigramMatrix: new Float32Array(numTools * numTools),
        numTools,
      });

      const applyStructuralBias = (model as any).applyStructuralBias.bind(model);
      const vocabSize = numTools;
      const probs = new Float32Array(vocabSize);
      for (let i = 0; i < vocabSize; i++) probs[i] = 1 / vocabSize;

      // Last context item is tool_0 → bias should alter probs
      const result = applyStructuralBias(probs, ["tool_0"]);
      // tool_1 should have higher prob than uniform
      assert.ok(
        result[1] > 1 / vocabSize,
        "tool_1 should have boosted probability from Jaccard bias",
      );

      model.dispose();
    });
  });

  describe("expandPrediction for L2 caps", () => {
    it("returns L1 cap children for L2 prediction", () => {
      const capL1: VocabNode = {
        id: "cap:l1_a",
        level: 1,
        embedding: randomEmb(EMB_DIM),
        children: ["tool_0", "tool_1"],
      };
      const capL2: VocabNode = {
        id: "cap:l2_x",
        level: 2,
        embedding: randomEmb(EMB_DIM),
        children: ["cap:l1_a"],
      };

      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, makeToolCapMap(NUM_TOOLS, 2), [capL1, capL2]);

      const nodeToIndex = (model as any).nodeToIndex as Map<string, number>;
      const l2Idx = nodeToIndex.get("cap:l2_x")!;
      assert.ok(l2Idx !== undefined, "L2 cap should be registered");

      const expandPrediction = (model as any).expandPrediction.bind(model);
      const expanded = expandPrediction(l2Idx);
      assert.deepEqual(expanded, ["cap:l1_a"], "L2 should expand to L1 cap children");

      model.dispose();
    });
  });

  describe("soft labels transitive propagation", () => {
    it("L0 tool's ancestor caps include both L1 and L2", () => {
      const capL1: VocabNode = {
        id: "cap:l1_a",
        level: 1,
        embedding: randomEmb(EMB_DIM),
        children: ["tool_0", "tool_1"],
      };
      const capL2: VocabNode = {
        id: "cap:l2_x",
        level: 2,
        embedding: randomEmb(EMB_DIM),
        children: ["cap:l1_a"],
      };

      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, makeToolCapMap(NUM_TOOLS, 2), [capL1, capL2]);

      const nodeToIndex = (model as any).nodeToIndex as Map<string, number>;
      const toolIdxToCapIndices = (model as any).toolIdxToCapIndices as Map<number, number[]>;

      const tool0Idx = nodeToIndex.get("tool_0")!;
      const l1Idx = nodeToIndex.get("cap:l1_a")!;
      const l2Idx = nodeToIndex.get("cap:l2_x")!;

      const ancestors = toolIdxToCapIndices.get(tool0Idx)!;
      assert.ok(ancestors.includes(l1Idx), "tool_0 ancestors should include L1 cap");
      assert.ok(ancestors.includes(l2Idx), "tool_0 ancestors should include L2 cap (transitive)");

      model.dispose();
    });
  });

  describe("resolveToL0Indices", () => {
    it("returns [idx] for L0 tool", () => {
      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, makeToolCapMap(NUM_TOOLS, 1), []);

      const resolve = (model as any).resolveToL0Indices.bind(model);
      const result = resolve("tool_0");
      assert.deepEqual(result, [0], "L0 tool should return its own index");

      model.dispose();
    });

    it("returns L0 children indices for L1 cap", () => {
      const capL1: VocabNode = {
        id: "cap:l1_a",
        level: 1,
        embedding: randomEmb(EMB_DIM),
        children: ["tool_0", "tool_1"],
      };

      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, makeToolCapMap(NUM_TOOLS, 1), [capL1]);

      const resolve = (model as any).resolveToL0Indices.bind(model);
      const result = resolve("cap:l1_a");
      assert.deepEqual(result.sort(), [0, 1], "L1 cap should resolve to tool_0 and tool_1 indices");

      model.dispose();
    });

    it("BFS through L2 → L1 → L0", () => {
      const capL1: VocabNode = {
        id: "cap:l1_a",
        level: 1,
        embedding: randomEmb(EMB_DIM),
        children: ["tool_0", "tool_1"],
      };
      const capL2: VocabNode = {
        id: "cap:l2_x",
        level: 2,
        embedding: randomEmb(EMB_DIM),
        children: ["cap:l1_a"],
      };

      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, makeToolCapMap(NUM_TOOLS, 2), [capL1, capL2]);

      const resolve = (model as any).resolveToL0Indices.bind(model);
      const result = resolve("cap:l2_x");
      assert.deepEqual(result.sort(), [0, 1], "L2 cap should BFS down to L0 tools through L1");

      model.dispose();
    });

    it("returns [] for unknown tool", () => {
      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, makeToolCapMap(NUM_TOOLS, 1), []);

      const resolve = (model as any).resolveToL0Indices.bind(model);
      assert.deepEqual(resolve("unknown:tool"), [], "unknown tool should return empty array");

      model.dispose();
    });
  });

  describe("predictNextTopK with mixed L0/L1 context", () => {
    it("does not crash with cap IDs in context", () => {
      const capL1: VocabNode = {
        id: "cap:l1_a",
        level: 1,
        embedding: randomEmb(EMB_DIM),
        children: ["tool_0", "tool_1"],
      };

      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, makeToolCapMap(NUM_TOOLS, 1), [capL1]);

      const intent = randomEmb(EMB_DIM);
      // Mixed context: L0 tool + L1 cap + L0 tool
      const context = ["tool_0", "cap:l1_a", "tool_2"];

      assert.doesNotThrow(() => {
        const result = model.predictNextTopK(intent, context, 3);
        assert.ok(result.ranked.length > 0, "should return predictions");
      }, "predictNextTopK with cap in context should not throw");

      model.dispose();
    });
  });

  describe("strict child filter (allChildrenKnown)", () => {
    it("skips cap when ANY child is unknown (strict mode)", () => {
      const capL1: VocabNode = {
        id: "cap:partial",
        level: 1,
        embedding: randomEmb(EMB_DIM),
        children: ["tool_0", "tool_nonexistent", "tool_1"],
      };

      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, makeToolCapMap(NUM_TOOLS, 1), [capL1]);

      const config = (model as any).config;
      assert.equal(config.numVocabNodes, 0, "should NOT register cap with unknown child");

      model.dispose();
    });

    it("registers cap when all children known", () => {
      const capL1: VocabNode = {
        id: "cap:complete",
        level: 1,
        embedding: randomEmb(EMB_DIM),
        children: ["tool_0", "tool_1", "tool_2"],
      };

      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, makeToolCapMap(NUM_TOOLS, 1), [capL1]);

      const indexToNode = (model as any).indexToNode as Map<number, VocabNode>;
      const capIdx = (model as any).nodeToIndex.get("cap:complete")!;
      const registeredNode = indexToNode.get(capIdx)!;
      assert.deepEqual(
        registeredNode.children,
        ["tool_0", "tool_1", "tool_2"],
        "all children should be preserved when all known",
      );

      model.dispose();
    });
  });

  describe("structural bias does NOT override cap scores", () => {
    it("cap score comes from similarity head, not from children average", () => {
      const capL1: VocabNode = {
        id: "cap:l1_biased",
        level: 1,
        embedding: randomEmb(EMB_DIM),
        children: ["tool_0", "tool_1"],
      };

      const model = new CompactInformedGRU({ embeddingDim: EMB_DIM });
      model.setToolVocabulary(tools, makeToolCapMap(NUM_TOOLS, 1), [capL1]);

      const numTools = NUM_TOOLS;
      const jaccardMatrix = new Float32Array(numTools * numTools);
      // tool_2 → tool_0 has high Jaccard, tool_2 → tool_1 has high Jaccard
      jaccardMatrix[2 * numTools + 0] = 5.0;
      jaccardMatrix[2 * numTools + 1] = 5.0;
      model.setStructuralBias({
        jaccardMatrix,
        bigramMatrix: new Float32Array(numTools * numTools),
        numTools,
      });

      const applyStructuralBias = (model as any).applyStructuralBias.bind(model);
      const vocabSize = numTools + 1; // 5 tools + 1 cap
      const probs = new Float32Array(vocabSize);
      for (let i = 0; i < vocabSize; i++) probs[i] = 1 / vocabSize;

      // Last context is tool_2 → structural bias only applies to L0 tools (rows in Jaccard matrix).
      // The cap score should NOT be overridden by children average.
      const result = applyStructuralBias(probs, ["tool_2"]);

      // Cap index is numTools (= 5)
      const capProb = result[numTools];
      const tool0Prob = result[0];
      const tool1Prob = result[1];

      // Children are boosted by Jaccard, but cap should NOT be their average.
      // Cap prob comes from softmax renormalization of its original logProb
      // (no Jaccard row exists for caps), so it should be LOWER than boosted children.
      assert.ok(
        capProb < tool0Prob,
        `cap prob (${capProb.toFixed(4)}) should be lower than boosted tool_0 (${tool0Prob.toFixed(4)})`,
      );

      model.dispose();
    });
  });
});
