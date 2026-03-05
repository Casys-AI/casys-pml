/**
 * Tests for VertexToEdgePhase (V→E)
 *
 * Run: deno test --no-check src/graphrag/algorithms/shgat/message-passing/vertex-to-edge-phase.test.ts
 */
import { assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/assert_almost_equals.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { VertexToEdgePhase } from "./vertex-to-edge-phase.ts";
import type { PhaseParameters } from "./phase-interface.ts";

// Small dims for fast, deterministic tests
const EMB_DIM = 4;
const HEAD_DIM = 2;
const LEAKY_SLOPE = 0.2;

function makeParams(): PhaseParameters {
  // Identity-like projection: W[i][j] = (i===j) ? 1 : 0.1
  const W_source = Array.from({ length: HEAD_DIM }, (_, i) =>
    Array.from({ length: EMB_DIM }, (_, j) => (i === j ? 1.0 : 0.1)));
  const W_target = Array.from({ length: HEAD_DIM }, (_, i) =>
    Array.from({ length: EMB_DIM }, (_, j) => (i === j ? 1.0 : 0.05)));
  const a_attention = Array.from({ length: 2 * HEAD_DIM }, (_, i) => 0.5 - i * 0.1);
  return { W_source, W_target, a_attention };
}

// 3 tools, 2 caps. Tool 0,1 → Cap 0. Tool 1,2 → Cap 1.
const CONNECTIVITY = [
  [1, 0], // tool 0 in cap 0 only
  [1, 1], // tool 1 in both caps
  [0, 1], // tool 2 in cap 1 only
];

function makeEmbeddings() {
  const H = [
    [1.0, 0.5, -0.3, 0.8],
    [0.2, -0.1, 0.7, 0.3],
    [-0.5, 0.9, 0.1, -0.4],
  ];
  const E = [
    [0.3, 0.4, -0.2, 0.6],
    [-0.1, 0.8, 0.5, 0.2],
  ];
  return { H, E };
}

Deno.test("V→E forward: output shapes are correct", () => {
  const phase = new VertexToEdgePhase();
  const { H, E } = makeEmbeddings();
  const result = phase.forwardWithCache(H, E, CONNECTIVITY, makeParams(), { leakyReluSlope: LEAKY_SLOPE });

  assertEquals(result.embeddings.length, 2, "numCaps output rows");
  assertEquals(result.embeddings[0].length, HEAD_DIM, "headDim output cols");
  assertEquals(result.attention.length, 3, "attention rows = numTools");
  assertEquals(result.attention[0].length, 2, "attention cols = numCaps");
});

Deno.test("V→E forward: attention is masked by connectivity", () => {
  const phase = new VertexToEdgePhase();
  const { H, E } = makeEmbeddings();
  const result = phase.forwardWithCache(H, E, CONNECTIVITY, makeParams(), { leakyReluSlope: LEAKY_SLOPE });

  // tool 0 should have zero attention for cap 1 (not connected)
  assertAlmostEquals(result.attention[0][1], 0, 1e-10, "tool 0 → cap 1 should be 0");
  // tool 2 should have zero attention for cap 0
  assertAlmostEquals(result.attention[2][0], 0, 1e-10, "tool 2 → cap 0 should be 0");
});

Deno.test("V→E forward: attention normalizes to 1 per cap", () => {
  const phase = new VertexToEdgePhase();
  const { H, E } = makeEmbeddings();
  const result = phase.forwardWithCache(H, E, CONNECTIVITY, makeParams(), { leakyReluSlope: LEAKY_SLOPE });

  for (let c = 0; c < 2; c++) {
    let sum = 0;
    for (let t = 0; t < 3; t++) {
      sum += result.attention[t][c];
    }
    assertAlmostEquals(sum, 1.0, 1e-6, `softmax sum for cap ${c}`);
  }
});

Deno.test("V→E forward: single-tool cap gets attention = 1.0", () => {
  // Cap with exactly 1 tool: that tool gets full attention
  const conn = [[1, 0], [0, 1], [0, 0]]; // each cap has exactly 1 tool
  const phase = new VertexToEdgePhase();
  const { H, E } = makeEmbeddings();
  const result = phase.forwardWithCache(H, E, conn, makeParams(), { leakyReluSlope: LEAKY_SLOPE });

  assertAlmostEquals(result.attention[0][0], 1.0, 1e-6, "sole tool in cap 0 gets 1.0");
  assertAlmostEquals(result.attention[1][1], 1.0, 1e-6, "sole tool in cap 1 gets 1.0");
});

Deno.test("V→E backward: gradient shapes are correct", () => {
  const phase = new VertexToEdgePhase();
  const { H, E } = makeEmbeddings();
  const params = makeParams();
  const { cache } = phase.forwardWithCache(H, E, CONNECTIVITY, params, { leakyReluSlope: LEAKY_SLOPE });

  const dE_new = [[0.1, -0.2], [0.3, 0.1]]; // [numCaps][headDim]
  const grads = phase.backward(dE_new, cache, params);

  assertEquals(grads.dW_source.length, HEAD_DIM);
  assertEquals(grads.dW_source[0].length, EMB_DIM);
  assertEquals(grads.dW_target.length, HEAD_DIM);
  assertEquals(grads.dW_target[0].length, EMB_DIM);
  assertEquals(grads.da_attention.length, 2 * HEAD_DIM);
  assertEquals(grads.dH.length, 3);
  assertEquals(grads.dH[0].length, EMB_DIM);
  assertEquals(grads.dE.length, 2);
  assertEquals(grads.dE[0].length, EMB_DIM);
});

Deno.test("V→E backward: all gradients are finite", () => {
  const phase = new VertexToEdgePhase();
  const { H, E } = makeEmbeddings();
  const params = makeParams();
  const { cache } = phase.forwardWithCache(H, E, CONNECTIVITY, params, { leakyReluSlope: LEAKY_SLOPE });

  const dE_new = [[0.1, -0.2], [0.3, 0.1]];
  const grads = phase.backward(dE_new, cache, params);

  for (const row of grads.dW_source) for (const v of row) assert(isFinite(v), `dW_source NaN/Inf: ${v}`);
  for (const row of grads.dW_target) for (const v of row) assert(isFinite(v), `dW_target NaN/Inf: ${v}`);
  for (const v of grads.da_attention) assert(isFinite(v), `da_attention NaN/Inf: ${v}`);
  for (const row of grads.dH) for (const v of row) assert(isFinite(v), `dH NaN/Inf: ${v}`);
  for (const row of grads.dE) for (const v of row) assert(isFinite(v), `dE NaN/Inf: ${v}`);
});

Deno.test("V→E backward: numerical gradient check on W_source", () => {
  const phase = new VertexToEdgePhase();
  const { H, E } = makeEmbeddings();
  const params = makeParams();
  const eps = 1e-5;

  // Scalar loss = sum of all output elements
  function loss(p: PhaseParameters): number {
    const res = phase.forwardWithCache(H, E, CONNECTIVITY, p, { leakyReluSlope: LEAKY_SLOPE });
    return res.embeddings.flat().reduce((s, v) => s + v, 0);
  }

  // Analytical gradient (dL/dOutput = ones)
  const { cache } = phase.forwardWithCache(H, E, CONNECTIVITY, params, { leakyReluSlope: LEAKY_SLOPE });
  const dE_new = cache.embeddings ?? Array.from({ length: 2 }, () => Array(HEAD_DIM).fill(1));
  const dOnes = Array.from({ length: 2 }, () => Array(HEAD_DIM).fill(1));
  const grads = phase.backward(dOnes, cache, params);

  // Numerical gradient for each W_source[i][j]
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

Deno.test("V→E backward: numerical gradient check on a_attention", () => {
  const phase = new VertexToEdgePhase();
  const { H, E } = makeEmbeddings();
  const params = makeParams();
  const eps = 1e-5;

  function loss(p: PhaseParameters): number {
    const res = phase.forwardWithCache(H, E, CONNECTIVITY, p, { leakyReluSlope: LEAKY_SLOPE });
    return res.embeddings.flat().reduce((s, v) => s + v, 0);
  }

  const { cache } = phase.forwardWithCache(H, E, CONNECTIVITY, params, { leakyReluSlope: LEAKY_SLOPE });
  const dOnes = Array.from({ length: 2 }, () => Array(HEAD_DIM).fill(1));
  const grads = phase.backward(dOnes, cache, params);

  for (let k = 0; k < 2 * HEAD_DIM; k++) {
    const a_plus = [...params.a_attention]; a_plus[k] += eps;
    const a_minus = [...params.a_attention]; a_minus[k] -= eps;
    const numGrad = (loss({ ...params, a_attention: a_plus }) - loss({ ...params, a_attention: a_minus })) / (2 * eps);

    assertAlmostEquals(grads.da_attention[k], numGrad, 1e-3,
      `da_attention[${k}]: analytical=${grads.da_attention[k].toFixed(6)}, numerical=${numGrad.toFixed(6)}`);
  }
});
