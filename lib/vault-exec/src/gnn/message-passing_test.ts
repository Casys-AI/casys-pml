import { assertEquals } from "jsr:@std/assert";
import { vertexToEdge, edgeToVertex } from "./message-passing.ts";
import type { GNNNode, LevelParams } from "./types.ts";

// Helper: create a simple level params with numHeads=1, headDim=2, embDim=4
function makeLevelParams(): LevelParams {
  return {
    W_child: [[[1, 0, 0, 0], [0, 1, 0, 0]]],    // 1 head, 2x4
    W_parent: [[[0, 0, 1, 0], [0, 0, 0, 1]]],   // 1 head, 2x4
    a_upward: [[1, 1, 1, 1]],                      // 1 head, 2*headDim=4
    a_downward: [[1, 1, 1, 1]],
  };
}

Deno.test("vertexToEdge - aggregates child embeddings into parent", () => {
  const children: GNNNode[] = [
    { name: "A", level: 0, embedding: [1, 0, 0, 0], children: [] },
    { name: "B", level: 0, embedding: [0, 1, 0, 0], children: [] },
  ];
  const parent: GNNNode = { name: "P", level: 1, embedding: [0, 0, 1, 0], children: ["A", "B"] };
  const params = makeLevelParams();

  const result = vertexToEdge(parent, children, params, -1.0, 0.5, 0.2);

  // Result should be embDim length
  assertEquals(result.length, 4);
  // Should not be identical to original (MP changed it)
  const same = result.every((v, i) => v === parent.embedding[i]);
  assertEquals(same, false);
});

Deno.test("vertexToEdge - no children returns copy of parent embedding", () => {
  const parent: GNNNode = { name: "P", level: 1, embedding: [0.5, 0.3, 0.1, 0.7], children: [] };
  const params = makeLevelParams();

  const result = vertexToEdge(parent, [], params, -1.0, 0.5, 0.2);
  assertEquals(result.length, 4);
  result.forEach((v, i) => assertEquals(Math.abs(v - parent.embedding[i]) < 1e-10, true));
});

Deno.test("edgeToVertex - sends parent context back to child", () => {
  const parents: GNNNode[] = [
    { name: "P", level: 1, embedding: [0, 0, 1, 0], children: ["C"] },
  ];
  const child: GNNNode = { name: "C", level: 0, embedding: [1, 0, 0, 0], children: [] };
  const params = makeLevelParams();

  const result = edgeToVertex(child, parents, params, 0.2);

  assertEquals(result.length, 4);
  // Additive skip: result should differ from original
  const origNorm = Math.sqrt(child.embedding.reduce((s, v) => s + v * v, 0));
  const newNorm = Math.sqrt(result.reduce((s, v) => s + v * v, 0));
  assertEquals(newNorm >= origNorm, true);
});

Deno.test("edgeToVertex - no parents returns copy of child embedding", () => {
  const child: GNNNode = { name: "C", level: 0, embedding: [1, 0, 0, 0], children: [] };
  const params = makeLevelParams();

  const result = edgeToVertex(child, [], params, 0.2);
  assertEquals(result.length, 4);
  result.forEach((v, i) => assertEquals(Math.abs(v - child.embedding[i]) < 1e-10, true));
});
