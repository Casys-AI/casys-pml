// gnn/forward_test.ts
import { assertEquals } from "jsr:@std/assert";
import { gnnForward } from "./forward.ts";
import { initParams } from "./params.ts";
import type { GNNNode, GNNConfig } from "./types.ts";
import { DEFAULT_GNN_CONFIG } from "./types.ts";

function makeNode(name: string, level: number, children: string[] = []): GNNNode {
  const emb = Array.from({ length: 1024 }, (_, i) => Math.sin(name.charCodeAt(0) + i) * 0.1);
  return { name, level, embedding: emb, children };
}

Deno.test("gnnForward - produces embeddings for all nodes", () => {
  const nodes: GNNNode[] = [
    makeNode("A", 0),
    makeNode("B", 0),
    makeNode("C", 1, ["A", "B"]),
    makeNode("D", 2, ["C"]),
  ];
  const config: GNNConfig = { ...DEFAULT_GNN_CONFIG, numHeads: 2, headDim: 4 };
  const params = initParams(config, 3); // 3 levels: 0, 1, 2
  const result = gnnForward(nodes, params, config);

  assertEquals(result.size, 4);
  for (const [name, emb] of result) {
    assertEquals(emb.length, 1024);
    // Embedding should be different from input (message-passing changed it)
    const orig = nodes.find((n) => n.name === name)!.embedding;
    const changed = emb.some((v, i) => Math.abs(v - orig[i]) > 1e-10);
    // Leaf nodes change via E->V, non-leaves via V->E
    assertEquals(changed, true, `Expected ${name} embedding to change after MP`);
  }
});

Deno.test("gnnForward - single node vault returns original embedding", () => {
  const nodes: GNNNode[] = [makeNode("Solo", 0)];
  const config = { ...DEFAULT_GNN_CONFIG, numHeads: 2, headDim: 4 };
  const params = initParams(config, 1);
  const result = gnnForward(nodes, params, config);

  assertEquals(result.size, 1);
  assertEquals(result.get("Solo")!.length, 1024);
});

Deno.test("gnnForward - all same level returns original embeddings", () => {
  const nodes: GNNNode[] = [
    makeNode("X", 0),
    makeNode("Y", 0),
    makeNode("Z", 0),
  ];
  const config = { ...DEFAULT_GNN_CONFIG, numHeads: 2, headDim: 4 };
  const params = initParams(config, 1);
  const result = gnnForward(nodes, params, config);

  assertEquals(result.size, 3);
  // maxLevel=0, so no message passing happens
  for (const [name, emb] of result) {
    const orig = nodes.find((n) => n.name === name)!.embedding;
    assertEquals(emb, orig);
  }
});

Deno.test("initParams - shared weights reuse same object", () => {
  const config: GNNConfig = { ...DEFAULT_GNN_CONFIG, shareLevelWeights: true, numHeads: 2, headDim: 4 };
  const params = initParams(config, 3);

  // All levels should share the same LevelParams reference
  const l0 = params.levels.get(0);
  const l1 = params.levels.get(1);
  const l2 = params.levels.get(2);
  assertEquals(l0 === l1, true, "Level 0 and 1 should share weights");
  assertEquals(l1 === l2, true, "Level 1 and 2 should share weights");
});

Deno.test("initParams - unshared weights are independent", () => {
  const config: GNNConfig = { ...DEFAULT_GNN_CONFIG, shareLevelWeights: false, numHeads: 2, headDim: 4 };
  const params = initParams(config, 3);

  const l0 = params.levels.get(0);
  const l1 = params.levels.get(1);
  assertEquals(l0 !== l1, true, "Level 0 and 1 should NOT share weights");
});
