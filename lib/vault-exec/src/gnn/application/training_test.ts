// gnn/application/training_test.ts
import { assertEquals } from "jsr:@std/assert";
import {
  deserializeGnnParams,
  serializeGnnParams,
} from "../infrastructure/params-codec.ts";
import { gnnTrainStep } from "./training.ts";
import { initParams } from "../domain/params.ts";
import type { GNNConfig, GNNNode } from "../domain/types.ts";

// Small dims to keep numerical gradient tractable
const TEST_CONFIG: GNNConfig = {
  numHeads: 2,
  headDim: 4,
  embDim: 8,
  shareLevelWeights: true,
  leakyReluAlpha: 0.2,
};

function makeNode(
  name: string,
  level: number,
  children: string[] = [],
): GNNNode {
  // Deterministic embedding from name
  const emb = Array.from(
    { length: TEST_CONFIG.embDim },
    (_, i) => Math.sin(name.charCodeAt(0) * 7 + i * 0.3) * 0.5,
  );
  return { name, level, embedding: emb, children };
}

Deno.test("gnnTrainStep reduces MSE loss over 5 steps", () => {
  const nodes: GNNNode[] = [
    makeNode("leaf1", 0),
    makeNode("leaf2", 0),
    makeNode("parent", 1, ["leaf1", "leaf2"]),
  ];

  const params = initParams(TEST_CONFIG, 2); // levels 0, 1

  // Random but deterministic targets
  const targets = new Map<string, number[]>();
  for (const node of nodes) {
    targets.set(
      node.name,
      Array.from(
        { length: TEST_CONFIG.embDim },
        (_, i) => Math.cos(node.name.charCodeAt(0) * 3 + i * 0.7) * 0.3,
      ),
    );
  }

  const losses: number[] = [];
  const lr = 0.01;

  for (let step = 0; step < 5; step++) {
    const { loss } = gnnTrainStep(nodes, params, TEST_CONFIG, targets, lr);
    losses.push(loss);
  }

  // Loss should decrease over training
  assertEquals(
    losses[4] < losses[0],
    true,
    `Expected loss to decrease: first=${losses[0].toFixed(6)}, last=${
      losses[4].toFixed(6)
    }`,
  );

  // Sanity: loss should be finite and positive
  for (const loss of losses) {
    assertEquals(isFinite(loss), true, `Loss should be finite, got ${loss}`);
    assertEquals(loss >= 0, true, `Loss should be non-negative, got ${loss}`);
  }
});

Deno.test("serialize/deserialize round-trip preserves GNNParams", async () => {
  const params = initParams(TEST_CONFIG, 3); // 3 levels (0, 1, 2)

  // Mutate some values so they're not defaults
  params.veResidualA.set(0, -0.77);
  params.veResidualB.set(1, 1.23);
  const lp = params.levels.get(0)!;
  lp.W_child[0][0][0] = 42.5;
  lp.a_upward[1][3] = -0.99;

  const blob = await serializeGnnParams(params);

  // Should be compressed (smaller than raw JSON)
  assertEquals(blob instanceof Uint8Array, true);
  assertEquals(blob.length > 0, true);

  const restored = await deserializeGnnParams(blob);

  // Structural equality
  assertEquals(restored.numHeads, params.numHeads);
  assertEquals(restored.headDim, params.headDim);
  assertEquals(restored.embDim, params.embDim);
  assertEquals(restored.shareLevelWeights, params.shareLevelWeights);

  // Residual params
  assertEquals(restored.veResidualA.get(0), -0.77);
  assertEquals(restored.veResidualB.get(1), 1.23);

  // Level params (mutated values)
  const restoredLp = restored.levels.get(0)!;
  assertEquals(restoredLp.W_child[0][0][0], 42.5);
  assertEquals(restoredLp.a_upward[1][3], -0.99);

  // All levels present
  assertEquals(restored.levels.size, params.levels.size);
  for (const [level] of params.levels) {
    assertEquals(restored.levels.has(level), true, `Missing level ${level}`);
  }

  // Shapes match
  for (const [level] of params.levels) {
    const orig = params.levels.get(level)!;
    const rest = restored.levels.get(level)!;
    assertEquals(rest.W_child.length, orig.W_child.length);
    assertEquals(rest.W_parent.length, orig.W_parent.length);
    assertEquals(rest.a_upward.length, orig.a_upward.length);
    assertEquals(rest.a_downward.length, orig.a_downward.length);
  }
});
