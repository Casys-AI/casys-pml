/**
 * Tests for EdgeToVertexPhase (E→V)
 *
 * Run: deno test --no-check src/graphrag/algorithms/shgat/message-passing/edge-to-vertex-phase.test.ts
 */
import { assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/assert_almost_equals.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { EdgeToVertexPhase } from "./edge-to-vertex-phase.ts";
import type { PhaseParameters } from "./phase-interface.ts";

const EMB_DIM = 4;
const HEAD_DIM = 2;
const LEAKY_SLOPE = 0.2;

function makeParams(): PhaseParameters {
  const W_source = Array.from({ length: HEAD_DIM }, (_, i) =>
    Array.from({ length: EMB_DIM }, (_, j) => (i === j ? 1.0 : 0.1)));
  const W_target = Array.from({ length: HEAD_DIM }, (_, i) =>
    Array.from({ length: EMB_DIM }, (_, j) => (i === j ? 1.0 : 0.05)));
  const a_attention = Array.from({ length: 2 * HEAD_DIM }, (_, i) => 0.5 - i * 0.1);
  return { W_source, W_target, a_attention };
}

// 3 tools, 2 caps. Tool 0,1 → Cap 0. Tool 1,2 → Cap 1.
// connectivity is [tools][caps] orientation (same as V→E)
const CONNECTIVITY = [
  [1, 0],
  [1, 1],
  [0, 1],
];

function makeEmbeddings() {
  const E = [
    [0.3, 0.4, -0.2, 0.6],
    [-0.1, 0.8, 0.5, 0.2],
  ];
  const H = [
    [1.0, 0.5, -0.3, 0.8],
    [0.2, -0.1, 0.7, 0.3],
    [-0.5, 0.9, 0.1, -0.4],
  ];
  return { E, H };
}

Deno.test("E→V forward: output shapes are correct", () => {
  const phase = new EdgeToVertexPhase();
  const { E, H } = makeEmbeddings();
  const result = phase.forwardWithCache(E, H, CONNECTIVITY, makeParams(), { leakyReluSlope: LEAKY_SLOPE });

  assertEquals(result.embeddings.length, 3, "numTools output rows");
  assertEquals(result.embeddings[0].length, HEAD_DIM, "headDim output cols");
  assertEquals(result.attention.length, 2, "attention rows = numCaps");
  assertEquals(result.attention[0].length, 3, "attention cols = numTools");
});

Deno.test("E→V forward: attention is masked by connectivity", () => {
  const phase = new EdgeToVertexPhase();
  const { E, H } = makeEmbeddings();
  const result = phase.forwardWithCache(E, H, CONNECTIVITY, makeParams(), { leakyReluSlope: LEAKY_SLOPE });

  // Cap 1 should have zero attention for tool 0 (not connected)
  assertAlmostEquals(result.attention[1][0], 0, 1e-10, "cap 1 → tool 0 = 0");
  // Cap 0 should have zero attention for tool 2
  assertAlmostEquals(result.attention[0][2], 0, 1e-10, "cap 0 → tool 2 = 0");
});

Deno.test("E→V forward: attention normalizes to 1 per tool", () => {
  const phase = new EdgeToVertexPhase();
  const { E, H } = makeEmbeddings();
  const result = phase.forwardWithCache(E, H, CONNECTIVITY, makeParams(), { leakyReluSlope: LEAKY_SLOPE });

  // E→V softmax is per TOOL (each tool normalizes over its parent caps)
  for (let t = 0; t < 3; t++) {
    let sum = 0;
    for (let c = 0; c < 2; c++) {
      sum += result.attention[c][t];
    }
    // Tool 0 has 1 parent, tool 1 has 2 parents, tool 2 has 1 parent
    if (t === 0 || t === 2) {
      assertAlmostEquals(sum, 1.0, 1e-6, `single-parent tool ${t} attention sum`);
    } else {
      assertAlmostEquals(sum, 1.0, 1e-6, `multi-parent tool ${t} attention sum`);
    }
  }
});

Deno.test("E→V forward: orphan tool gets zero embedding update", () => {
  // Tool 2 disconnected from all caps
  const conn = [[1, 0], [1, 0], [0, 0]];
  const phase = new EdgeToVertexPhase();
  const { E, H } = makeEmbeddings();
  const result = phase.forwardWithCache(E, H, conn, makeParams(), { leakyReluSlope: LEAKY_SLOPE });

  // Orphan tool (no parent caps) → aggregation = all zeros → ELU(0) = 0
  for (let d = 0; d < HEAD_DIM; d++) {
    assertAlmostEquals(result.embeddings[2][d], 0, 1e-10,
      `orphan tool embedding[2][${d}] should be 0`);
  }
});

Deno.test("E→V backward: gradient shapes are correct", () => {
  const phase = new EdgeToVertexPhase();
  const { E, H } = makeEmbeddings();
  const params = makeParams();
  const { cache } = phase.forwardWithCache(E, H, CONNECTIVITY, params, { leakyReluSlope: LEAKY_SLOPE });

  const dH_new = [[0.1, -0.2], [0.3, 0.1], [-0.1, 0.4]]; // [numTools][headDim]
  const grads = phase.backward(dH_new, cache, params);

  assertEquals(grads.dW_source.length, HEAD_DIM);
  assertEquals(grads.dW_source[0].length, EMB_DIM);
  assertEquals(grads.dW_target.length, HEAD_DIM);
  assertEquals(grads.dW_target[0].length, EMB_DIM);
  assertEquals(grads.da_attention.length, 2 * HEAD_DIM);
  assertEquals(grads.dE.length, 2);
  assertEquals(grads.dE[0].length, EMB_DIM);
  assertEquals(grads.dH.length, 3);
  assertEquals(grads.dH[0].length, EMB_DIM);
});

Deno.test("E→V backward: all gradients are finite", () => {
  const phase = new EdgeToVertexPhase();
  const { E, H } = makeEmbeddings();
  const params = makeParams();
  const { cache } = phase.forwardWithCache(E, H, CONNECTIVITY, params, { leakyReluSlope: LEAKY_SLOPE });

  const dH_new = [[0.1, -0.2], [0.3, 0.1], [-0.1, 0.4]];
  const grads = phase.backward(dH_new, cache, params);

  for (const row of grads.dW_source) for (const v of row) assert(isFinite(v), `dW_source NaN/Inf`);
  for (const row of grads.dW_target) for (const v of row) assert(isFinite(v), `dW_target NaN/Inf`);
  for (const v of grads.da_attention) assert(isFinite(v), `da_attention NaN/Inf`);
  for (const row of grads.dE) for (const v of row) assert(isFinite(v), `dE NaN/Inf`);
  for (const row of grads.dH) for (const v of row) assert(isFinite(v), `dH NaN/Inf`);
});

Deno.test("E→V backward: numerical gradient check on W_source", () => {
  const phase = new EdgeToVertexPhase();
  const { E, H } = makeEmbeddings();
  const params = makeParams();
  const eps = 1e-5;

  function loss(p: PhaseParameters): number {
    const res = phase.forwardWithCache(E, H, CONNECTIVITY, p, { leakyReluSlope: LEAKY_SLOPE });
    return res.embeddings.flat().reduce((s, v) => s + v, 0);
  }

  const { cache } = phase.forwardWithCache(E, H, CONNECTIVITY, params, { leakyReluSlope: LEAKY_SLOPE });
  const dOnes = Array.from({ length: 3 }, () => Array(HEAD_DIM).fill(1));
  const grads = phase.backward(dOnes, cache, params);

  for (let i = 0; i < HEAD_DIM; i++) {
    for (let j = 0; j < EMB_DIM; j++) {
      const p_plus = { ...params, W_source: params.W_source.map((r, ri) => r.map((v, ci) =>
        ri === i && ci === j ? v + eps : v)) };
      const p_minus = { ...params, W_source: params.W_source.map((r, ri) => r.map((v, ci) =>
        ri === i && ci === j ? v - eps : v)) };
      const numGrad = (loss(p_plus) - loss(p_minus)) / (2 * eps);

      assertAlmostEquals(grads.dW_source[i][j], numGrad, 1e-3,
        `dW_source[${i}][${j}]: analytical=${grads.dW_source[i][j].toFixed(6)}, numerical=${numGrad.toFixed(6)}`);
    }
  }
});

Deno.test("E→V backward: numerical gradient check on a_attention", () => {
  const phase = new EdgeToVertexPhase();
  const { E, H } = makeEmbeddings();
  const params = makeParams();
  const eps = 1e-5;

  function loss(p: PhaseParameters): number {
    const res = phase.forwardWithCache(E, H, CONNECTIVITY, p, { leakyReluSlope: LEAKY_SLOPE });
    return res.embeddings.flat().reduce((s, v) => s + v, 0);
  }

  const { cache } = phase.forwardWithCache(E, H, CONNECTIVITY, params, { leakyReluSlope: LEAKY_SLOPE });
  const dOnes = Array.from({ length: 3 }, () => Array(HEAD_DIM).fill(1));
  const grads = phase.backward(dOnes, cache, params);

  for (let k = 0; k < 2 * HEAD_DIM; k++) {
    const a_plus = [...params.a_attention]; a_plus[k] += eps;
    const a_minus = [...params.a_attention]; a_minus[k] -= eps;
    const numGrad = (loss({ ...params, a_attention: a_plus }) - loss({ ...params, a_attention: a_minus })) / (2 * eps);

    assertAlmostEquals(grads.da_attention[k], numGrad, 1e-3,
      `da_attention[${k}]: analytical=${grads.da_attention[k].toFixed(6)}, numerical=${numGrad.toFixed(6)}`);
  }
});
