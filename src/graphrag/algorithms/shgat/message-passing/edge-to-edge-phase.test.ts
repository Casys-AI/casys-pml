/**
 * Tests for EdgeToEdgePhase (E→E multi-level)
 *
 * Run: deno test --no-check src/graphrag/algorithms/shgat/message-passing/edge-to-edge-phase.test.ts
 */
import { assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/assert_almost_equals.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { EdgeToEdgePhase } from "./edge-to-edge-phase.ts";
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

// 3 child caps (L1), 2 parent caps (L2)
// Child 0,1 → Parent 0. Child 1,2 → Parent 1.
const CONTAINMENT = [
  [1, 0], // child 0 in parent 0 only
  [1, 1], // child 1 in both parents
  [0, 1], // child 2 in parent 1 only
];

function makeEmbeddings() {
  const E_k = [
    [0.5, -0.3, 0.8, 0.1],
    [0.2, 0.7, -0.1, 0.4],
    [-0.4, 0.6, 0.3, -0.2],
  ];
  const E_kPlus1 = [
    [0.3, 0.1, -0.5, 0.9],
    [-0.2, 0.4, 0.6, 0.1],
  ];
  return { E_k, E_kPlus1 };
}

Deno.test("E→E forward: output shapes are correct", () => {
  const phase = new EdgeToEdgePhase(0, 1);
  const { E_k, E_kPlus1 } = makeEmbeddings();
  const result = phase.forwardWithCache(E_k, E_kPlus1, CONTAINMENT, makeParams(), { leakyReluSlope: LEAKY_SLOPE });

  assertEquals(result.embeddings.length, 2, "numParentCaps output rows");
  assertEquals(result.embeddings[0].length, HEAD_DIM, "headDim output cols");
  assertEquals(result.attention.length, 3, "attention rows = numChildCaps");
  assertEquals(result.attention[0].length, 2, "attention cols = numParentCaps");
});

Deno.test("E→E forward: attention is masked by containment", () => {
  const phase = new EdgeToEdgePhase(0, 1);
  const { E_k, E_kPlus1 } = makeEmbeddings();
  const result = phase.forwardWithCache(E_k, E_kPlus1, CONTAINMENT, makeParams(), { leakyReluSlope: LEAKY_SLOPE });

  assertAlmostEquals(result.attention[0][1], 0, 1e-10, "child 0 → parent 1 = 0");
  assertAlmostEquals(result.attention[2][0], 0, 1e-10, "child 2 → parent 0 = 0");
});

Deno.test("E→E forward: attention normalizes to 1 per parent", () => {
  const phase = new EdgeToEdgePhase(0, 1);
  const { E_k, E_kPlus1 } = makeEmbeddings();
  const result = phase.forwardWithCache(E_k, E_kPlus1, CONTAINMENT, makeParams(), { leakyReluSlope: LEAKY_SLOPE });

  for (let p = 0; p < 2; p++) {
    let sum = 0;
    for (let c = 0; c < 3; c++) {
      sum += result.attention[c][p];
    }
    assertAlmostEquals(sum, 1.0, 1e-6, `softmax sum for parent ${p}`);
  }
});

Deno.test("E→E forward: getName reflects levels", () => {
  const phase01 = new EdgeToEdgePhase(0, 1);
  assertEquals(phase01.getName(), "Edge^0→Edge^1");
  const phase12 = new EdgeToEdgePhase(1, 2);
  assertEquals(phase12.getName(), "Edge^1→Edge^2");
});

Deno.test("E→E forward: dot_product attention mode works", () => {
  const phase = new EdgeToEdgePhase(0, 1);
  const { E_k, E_kPlus1 } = makeEmbeddings();
  const result = phase.forwardWithCache(E_k, E_kPlus1, CONTAINMENT, makeParams(),
    { leakyReluSlope: LEAKY_SLOPE, attentionType: "dot_product" });

  assertEquals(result.embeddings.length, 2);
  for (let p = 0; p < 2; p++) {
    let sum = 0;
    for (let c = 0; c < 3; c++) sum += result.attention[c][p];
    assertAlmostEquals(sum, 1.0, 1e-6, `dot_product softmax sum for parent ${p}`);
  }
});

Deno.test("E→E backward: gradient shapes are correct", () => {
  const phase = new EdgeToEdgePhase(0, 1);
  const { E_k, E_kPlus1 } = makeEmbeddings();
  const params = makeParams();
  const { cache } = phase.forwardWithCache(E_k, E_kPlus1, CONTAINMENT, params, { leakyReluSlope: LEAKY_SLOPE });

  const dE_kPlus1_new = [[0.1, -0.3], [0.2, 0.4]]; // [numParent][headDim]
  const grads = phase.backward(dE_kPlus1_new, cache, params);

  assertEquals(grads.dW_source.length, HEAD_DIM);
  assertEquals(grads.dW_source[0].length, EMB_DIM);
  assertEquals(grads.dW_target.length, HEAD_DIM);
  assertEquals(grads.dW_target[0].length, EMB_DIM);
  assertEquals(grads.da_attention.length, 2 * HEAD_DIM);
  assertEquals(grads.dE_k.length, 3);
  assertEquals(grads.dE_k[0].length, EMB_DIM);
  assertEquals(grads.dE_kPlus1.length, 2);
  assertEquals(grads.dE_kPlus1[0].length, EMB_DIM);
});

Deno.test("E→E backward: all gradients are finite", () => {
  const phase = new EdgeToEdgePhase(0, 1);
  const { E_k, E_kPlus1 } = makeEmbeddings();
  const params = makeParams();
  const { cache } = phase.forwardWithCache(E_k, E_kPlus1, CONTAINMENT, params, { leakyReluSlope: LEAKY_SLOPE });

  const dE_kPlus1_new = [[0.1, -0.3], [0.2, 0.4]];
  const grads = phase.backward(dE_kPlus1_new, cache, params);

  for (const row of grads.dW_source) for (const v of row) assert(isFinite(v), `dW_source NaN/Inf`);
  for (const row of grads.dW_target) for (const v of row) assert(isFinite(v), `dW_target NaN/Inf`);
  for (const v of grads.da_attention) assert(isFinite(v), `da_attention NaN/Inf`);
  for (const row of grads.dE_k) for (const v of row) assert(isFinite(v), `dE_k NaN/Inf`);
  for (const row of grads.dE_kPlus1) for (const v of row) assert(isFinite(v), `dE_kPlus1 NaN/Inf`);
});

Deno.test("E→E backward: numerical gradient check on W_source", () => {
  const phase = new EdgeToEdgePhase(0, 1);
  const { E_k, E_kPlus1 } = makeEmbeddings();
  const params = makeParams();
  const eps = 1e-5;

  function loss(p: PhaseParameters): number {
    const res = phase.forwardWithCache(E_k, E_kPlus1, CONTAINMENT, p, { leakyReluSlope: LEAKY_SLOPE });
    return res.embeddings.flat().reduce((s, v) => s + v, 0);
  }

  const { cache } = phase.forwardWithCache(E_k, E_kPlus1, CONTAINMENT, params, { leakyReluSlope: LEAKY_SLOPE });
  const dOnes = Array.from({ length: 2 }, () => Array(HEAD_DIM).fill(1));
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

Deno.test("E→E backward: numerical gradient check on a_attention", () => {
  const phase = new EdgeToEdgePhase(0, 1);
  const { E_k, E_kPlus1 } = makeEmbeddings();
  const params = makeParams();
  const eps = 1e-5;

  function loss(p: PhaseParameters): number {
    const res = phase.forwardWithCache(E_k, E_kPlus1, CONTAINMENT, p, { leakyReluSlope: LEAKY_SLOPE });
    return res.embeddings.flat().reduce((s, v) => s + v, 0);
  }

  const { cache } = phase.forwardWithCache(E_k, E_kPlus1, CONTAINMENT, params, { leakyReluSlope: LEAKY_SLOPE });
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

Deno.test("E→E backward: numerical gradient check on W_target", () => {
  const phase = new EdgeToEdgePhase(0, 1);
  const { E_k, E_kPlus1 } = makeEmbeddings();
  const params = makeParams();
  const eps = 1e-5;

  function loss(p: PhaseParameters): number {
    const res = phase.forwardWithCache(E_k, E_kPlus1, CONTAINMENT, p, { leakyReluSlope: LEAKY_SLOPE });
    return res.embeddings.flat().reduce((s, v) => s + v, 0);
  }

  const { cache } = phase.forwardWithCache(E_k, E_kPlus1, CONTAINMENT, params, { leakyReluSlope: LEAKY_SLOPE });
  const dOnes = Array.from({ length: 2 }, () => Array(HEAD_DIM).fill(1));
  const grads = phase.backward(dOnes, cache, params);

  for (let i = 0; i < HEAD_DIM; i++) {
    for (let j = 0; j < EMB_DIM; j++) {
      const p_plus = { ...params, W_target: params.W_target.map((r, ri) => r.map((v, ci) =>
        ri === i && ci === j ? v + eps : v)) };
      const p_minus = { ...params, W_target: params.W_target.map((r, ri) => r.map((v, ci) =>
        ri === i && ci === j ? v - eps : v)) };
      const numGrad = (loss(p_plus) - loss(p_minus)) / (2 * eps);

      assertAlmostEquals(grads.dW_target[i][j], numGrad, 1e-3,
        `dW_target[${i}][${j}]: analytical=${grads.dW_target[i][j].toFixed(6)}, numerical=${numGrad.toFixed(6)}`);
    }
  }
});
