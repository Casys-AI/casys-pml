/**
 * SHGAT-TF Gradient Correctness Tests
 *
 * Verifies analytical gradients against numerical (finite-difference) gradients.
 * These tests run in seconds and catch gradient bugs that would take 35+ minutes
 * to discover through benchmarking.
 *
 * Run: deno test -A --no-check lib/shgat-tf/tests/gradient_check_test.ts
 *
 * @module shgat-tf/tests/gradient_check_test
 */

import { assertGreater, assertLess } from "@std/assert";
import * as tf from "npm:@tensorflow/tfjs@4.22.0";
import {
  AutogradTrainer,
  forwardScoring,
  kHeadScoring,
  infoNCELoss,
  initTFParams,
  buildGraphStructure,
  disposeGraphStructure,
  sparseMPForward,
  sparseMPBackward,
  type TFParams,
  type CapabilityInfo,
  type TrainingExample,
} from "../src/training/index.ts";
import { type SHGATConfig, DEFAULT_SHGAT_CONFIG } from "../src/core/types.ts";

// ============================================================================
// Small config for fast tests
// ============================================================================

const SMALL_CONFIG: SHGATConfig = {
  ...DEFAULT_SHGAT_CONFIG,
  embeddingDim: 32,
  numHeads: 2,
  headDim: 16,
  hiddenDim: 32,
  preserveDim: true,
};

const EPSILON = 5e-4;
// Float32 + small dims = expect ~10-15% relative error. >25% is a real bug.
const GRAD_TOL = 0.25;

// ============================================================================
// Helpers
// ============================================================================

function makeEmb(seed: number, dim: number): number[] {
  return Array.from({ length: dim }, (_, j) => Math.sin(seed * 0.7 + j * 0.3) * 0.5);
}

function relError(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-8);
  return Math.abs(a - b) / denom;
}

function disposeParams(params: TFParams): void {
  for (const W of params.W_k) W.dispose();
  if (params.W_q) for (const W of params.W_q) W.dispose();
  params.W_intent.dispose();
  params.residualWeights?.dispose();
  for (const [, ws] of params.W_up) ws.forEach((w) => w.dispose());
  for (const [, ws] of params.W_down) ws.forEach((w) => w.dispose());
  for (const [, ws] of params.a_up) ws.forEach((w) => w.dispose());
  for (const [, ws] of params.a_down) ws.forEach((w) => w.dispose());
  if (params.projectionHead) {
    params.projectionHead.W1.dispose();
    params.projectionHead.b1.dispose();
    params.projectionHead.W2.dispose();
    params.projectionHead.b2.dispose();
  }
}

function createSmallGraph() {
  const dim = SMALL_CONFIG.embeddingDim;
  const toolIds = ["t0", "t1", "t2", "t3", "t4"];
  const capIds = ["c0", "c1", "c2"];
  const embeddings = new Map<string, number[]>();
  toolIds.forEach((id, i) => embeddings.set(id, makeEmb(i, dim)));
  capIds.forEach((id, i) => embeddings.set(id, makeEmb(10 + i, dim)));
  return { toolIds, capIds, embeddings };
}

// ============================================================================
// Test 1: K-head scoring dScore/dW_k
// ============================================================================

Deno.test("Gradient: K-head dScore/dW_k matches finite differences", () => {
  const params = initTFParams(SMALL_CONFIG, 1);
  try {
    const dim = SMALL_CONFIG.embeddingDim;
    const intentEmb = tf.tensor1d(makeEmb(50, dim));
    const nodeEmbs = tf.tensor2d([makeEmb(0, dim), makeEmb(1, dim), makeEmb(2, dim)]);

    const { grads, value } = tf.variableGrads(() => {
      const scores = kHeadScoring(intentEmb, nodeEmbs, params, SMALL_CONFIG);
      return tf.sum(scores) as tf.Scalar;
    });

    const W_k_0_grad = grads[params.W_k[0].name]?.arraySync() as number[][];
    const W_k_0_data = params.W_k[0].arraySync() as number[][];

    let maxRelErr = 0;
    let numChecked = 0;
    const spots = [[0, 0], [2, 5], [dim - 1, SMALL_CONFIG.headDim - 1]];

    for (const [i, j] of spots) {
      if (i >= W_k_0_data.length || j >= W_k_0_data[0].length) continue;

      const perturb = (delta: number): number => {
        const W = W_k_0_data.map((r) => [...r]);
        W[i][j] += delta;
        const t = tf.tensor2d(W);
        params.W_k[0].assign(t);
        t.dispose();
        return tf.tidy(() => {
          const s = kHeadScoring(intentEmb, nodeEmbs, params, SMALL_CONFIG);
          return tf.sum(s).arraySync() as number;
        });
      };

      const numGrad = (perturb(+EPSILON) - perturb(-EPSILON)) / (2 * EPSILON);
      // Restore
      const restore = tf.tensor2d(W_k_0_data);
      params.W_k[0].assign(restore);
      restore.dispose();

      const err = relError(W_k_0_grad[i][j], numGrad);
      if (err > maxRelErr) maxRelErr = err;
      numChecked++;
    }

    console.log(`  K-head dW_k: ${numChecked} checked, maxRelErr=${(maxRelErr * 100).toFixed(1)}%`);
    assertLess(maxRelErr, GRAD_TOL, `K-head gradient error ${(maxRelErr * 100).toFixed(1)}% > ${GRAD_TOL * 100}%`);

    Object.values(grads).forEach((g) => g.dispose());
    (value as tf.Tensor).dispose();
    intentEmb.dispose();
    nodeEmbs.dispose();
  } finally {
    disposeParams(params);
  }
});

// ============================================================================
// Test 2: InfoNCE loss gradient
// ============================================================================

Deno.test("Gradient: InfoNCE dLoss/dScores matches finite differences", () => {
  const temperature = 0.1;
  const posVar = tf.variable(tf.scalar(0.8), true, "test_pos_v2");
  const negVar = tf.variable(tf.tensor1d([0.3, 0.5, 0.1]), true, "test_neg_v2");

  try {
    const { grads, value } = tf.variableGrads(() =>
      infoNCELoss(posVar as unknown as tf.Scalar, negVar as unknown as tf.Tensor1D, temperature)
    );

    const dPos = grads["test_pos_v2"]?.arraySync() as number;
    const dNeg = grads["test_neg_v2"]?.arraySync() as number[];

    // Numerical: positive
    const posData = posVar.arraySync() as number;
    const lossAt = (pDelta: number): number => {
      const t = tf.scalar(posData + pDelta);
      posVar.assign(t);
      t.dispose();
      return tf.tidy(() =>
        (infoNCELoss(posVar as unknown as tf.Scalar, negVar as unknown as tf.Tensor1D, temperature).arraySync() as number)
      );
    };
    const numDPos = (lossAt(+EPSILON) - lossAt(-EPSILON)) / (2 * EPSILON);
    posVar.assign(tf.scalar(posData));

    const posErr = relError(dPos, numDPos);
    console.log(`  InfoNCE dPos: analytical=${dPos.toFixed(6)} numerical=${numDPos.toFixed(6)} err=${(posErr * 100).toFixed(1)}%`);
    assertLess(posErr, GRAD_TOL);

    // Numerical: negatives
    const negData = negVar.arraySync() as number[];
    let maxNegErr = 0;
    for (let i = 0; i < negData.length; i++) {
      const lossAtNeg = (delta: number): number => {
        const arr = [...negData];
        arr[i] += delta;
        const t = tf.tensor1d(arr);
        negVar.assign(t);
        t.dispose();
        return tf.tidy(() =>
          (infoNCELoss(posVar as unknown as tf.Scalar, negVar as unknown as tf.Tensor1D, temperature).arraySync() as number)
        );
      };
      const numG = (lossAtNeg(+EPSILON) - lossAtNeg(-EPSILON)) / (2 * EPSILON);
      const t = tf.tensor1d(negData);
      negVar.assign(t);
      t.dispose();
      const err = relError(dNeg[i], numG);
      if (err > maxNegErr) maxNegErr = err;
    }

    console.log(`  InfoNCE dNeg: maxRelErr=${(maxNegErr * 100).toFixed(1)}%`);
    assertLess(maxNegErr, GRAD_TOL);

    Object.values(grads).forEach((g) => g.dispose());
    (value as tf.Tensor).dispose();
  } finally {
    posVar.dispose();
    negVar.dispose();
  }
});

// ============================================================================
// Test 3: Sparse MP backward dW_up
// ============================================================================

Deno.test("Gradient: sparse MP backward dW_up matches finite differences", () => {
  const { toolIds, capIds, embeddings } = createSmallGraph();
  const dim = SMALL_CONFIG.embeddingDim;
  const params = initTFParams(SMALL_CONFIG, 1);

  try {
    const capInfos: CapabilityInfo[] = [
      { id: "c0", toolsUsed: ["t0", "t1"] },
      { id: "c1", toolsUsed: ["t2", "t3"] },
      { id: "c2", toolsUsed: ["t1", "t4"] },
    ];
    const graph = buildGraphStructure(capInfos, toolIds);

    const H_init = toolIds.map((id) => embeddings.get(id)!);
    const E_init = new Map<number, number[][]>();
    E_init.set(0, capIds.map((id) => embeddings.get(id)!));

    // Forward
    const { H, E, cache } = sparseMPForward(H_init, E_init, graph, params, SMALL_CONFIG);

    // Loss = Σ all enriched values (simple scalar loss for gradient check)
    const computeLossFromResult = (H_r: number[][], E_r: Map<number, number[][]>): number => {
      let sum = 0;
      for (const row of H_r) for (const v of row) sum += v;
      for (const [, embs] of E_r) for (const row of embs) for (const v of row) sum += v;
      return sum;
    };

    // dH = 1 everywhere, dE = 1 everywhere (gradient of sum)
    const dH = H.map((row) => row.map(() => 1.0));
    const dE = new Map<number, number[][]>();
    for (const [level, embs] of E) {
      dE.set(level, embs.map((row) => row.map(() => 1.0)));
    }

    // Analytical
    const mpGrads = sparseMPBackward(dH, dE, cache, params);

    // Numerical for W_up[0][head=0]
    const W_up_level0 = params.W_up.get(0);
    if (!W_up_level0 || W_up_level0.length === 0) {
      console.log("  No W_up at level 0 — skipping");
      disposeGraphStructure(graph);
      return;
    }

    const W_h0_data = W_up_level0[0].arraySync() as number[][];
    const dW_analytical = mpGrads.dW_up.get(0)?.[0]; // [headDim][embDim]

    let maxRelErr = 0;
    let numChecked = 0;
    const spots = [[0, 0], [3, 7], [dim - 1, SMALL_CONFIG.headDim - 1]];

    for (const [i, j] of spots) {
      if (i >= W_h0_data.length || j >= W_h0_data[0].length) continue;

      const perturb = (delta: number): number => {
        const W = W_h0_data.map((r) => [...r]);
        W[i][j] += delta;
        const t = tf.tensor2d(W);
        W_up_level0[0].assign(t);
        t.dispose();
        const result = sparseMPForward(H_init, E_init, graph, params, SMALL_CONFIG);
        const loss = computeLossFromResult(result.H, result.E);
        // Restore
        const restore = tf.tensor2d(W_h0_data);
        W_up_level0[0].assign(restore);
        restore.dispose();
        return loss;
      };

      const numGrad = (perturb(+EPSILON) - perturb(-EPSILON)) / (2 * EPSILON);
      // dW_up is [headDim][embDim], W is [embDim][headDim] → read transposed
      const anaGrad = dW_analytical?.[j]?.[i] ?? 0;
      const err = relError(anaGrad, numGrad);
      if (err > maxRelErr) maxRelErr = err;
      numChecked++;

      if (err > GRAD_TOL) {
        console.error(`  FAIL W_up[0][0][${i}][${j}]: ana=${anaGrad.toFixed(6)} num=${numGrad.toFixed(6)} err=${(err * 100).toFixed(1)}%`);
      }
    }

    console.log(`  MP dW_up: ${numChecked} checked, maxRelErr=${(maxRelErr * 100).toFixed(1)}%`);
    assertLess(maxRelErr, GRAD_TOL, `MP W_up gradient error ${(maxRelErr * 100).toFixed(1)}% > ${GRAD_TOL * 100}%`);
    disposeGraphStructure(graph);
  } finally {
    disposeParams(params);
  }
});

// ============================================================================
// Test 4: End-to-end chain rule dLoss/dEnrichedEmb
// ============================================================================

Deno.test("Gradient: end-to-end dLoss/dEmb chain rule", () => {
  const { toolIds, capIds, embeddings } = createSmallGraph();
  const dim = SMALL_CONFIG.embeddingDim;
  const params = initTFParams(SMALL_CONFIG, 1);

  try {
    const capInfos: CapabilityInfo[] = [
      { id: "c0", toolsUsed: ["t0", "t1"] },
      { id: "c1", toolsUsed: ["t2", "t3"] },
      { id: "c2", toolsUsed: ["t1", "t4"] },
    ];
    const graph = buildGraphStructure(capInfos, toolIds);

    const H_init = toolIds.map((id) => embeddings.get(id)!);
    const E_init = new Map<number, number[][]>();
    E_init.set(0, capIds.map((id) => embeddings.get(id)!));

    const { E } = sparseMPForward(H_init, E_init, graph, params, SMALL_CONFIG);
    const E_level0 = E.get(0)!;

    const temperature = 0.1;
    const intentArr = makeEmb(50, dim);

    // Compute manual dLogits + gradBase (same as trainStepSparse)
    const W_k_arrays = params.W_k.map((w) => w.arraySync() as number[][]);
    const { numHeads, headDim, embeddingDim } = SMALL_CONFIG;
    const sqrtHeadDim = Math.sqrt(headDim);

    const scores = tf.tidy(() => {
      const intentT = tf.tensor1d(intentArr);
      const capT = tf.tensor2d(E_level0);
      return kHeadScoring(intentT, capT, params, SMALL_CONFIG).arraySync() as number[];
    });

    const logits = scores.map((s) => s / temperature);
    const maxLogit = Math.max(...logits);
    const expLogits = logits.map((s) => Math.exp(s - maxLogit));
    const sumExp = expLogits.reduce((a, b) => a + b, 0);
    const softmaxProbs = expLogits.map((e) => e / sumExp);
    const dLogits = softmaxProbs.map((p, i) => (i === 0 ? p - 1 : p) / temperature);

    // gradBase = (1/H) * Σ_h W_k[h] @ Q_h / sqrt(d)
    const gradBase = new Array(embeddingDim).fill(0);
    for (let h = 0; h < numHeads; h++) {
      const W_k_h = W_k_arrays[h];
      const Q_h = new Array(headDim).fill(0);
      for (let j = 0; j < headDim; j++)
        for (let d = 0; d < embeddingDim; d++)
          Q_h[j] += intentArr[d] * W_k_h[d][j];
      for (let ii = 0; ii < embeddingDim; ii++) {
        let dot = 0;
        for (let j = 0; j < headDim; j++) dot += W_k_h[ii][j] * Q_h[j];
        gradBase[ii] += dot / (numHeads * sqrtHeadDim);
      }
    }

    // Analytical: dEmb[capIdx][d] = dLogit[capIdx] * gradBase[d]
    const analyticalDEmb = capIds.map((_, idx) => gradBase.map((gb) => dLogits[idx] * gb));

    // Numerical: perturb each enriched cap embedding
    let maxRelErr = 0;
    let numChecked = 0;

    for (let capIdx = 0; capIdx < capIds.length; capIdx++) {
      for (const d of [0, dim - 1]) {
        const lossAt = (delta: number): number => {
          const E_p = E_level0.map((r) => [...r]);
          E_p[capIdx][d] += delta;
          return tf.tidy(() => {
            const intentT = tf.tensor1d(intentArr);
            const capT = tf.tensor2d(E_p);
            const s = kHeadScoring(intentT, capT, params, SMALL_CONFIG).arraySync() as number[];
            // InfoNCE: positive=cap0, negatives=[cap1, cap2]
            const allS = tf.concat([tf.scalar(s[0]).expandDims(0), tf.tensor1d(s.slice(1))]);
            const l = tf.div(allS, temperature);
            const maxL = tf.max(l);
            const expL = tf.exp(tf.sub(l, maxL));
            const sumE = tf.sum(expL);
            return tf.neg(tf.sub(l.slice([0], [1]).squeeze(), tf.log(sumE))).arraySync() as number;
          });
        };

        const numGrad = (lossAt(+EPSILON) - lossAt(-EPSILON)) / (2 * EPSILON);
        const anaGrad = analyticalDEmb[capIdx][d];
        const err = relError(anaGrad, numGrad);
        if (err > maxRelErr) maxRelErr = err;
        numChecked++;

        if (err > GRAD_TOL) {
          console.error(`  FAIL dEmb[${capIdx}][${d}]: ana=${anaGrad.toFixed(6)} num=${numGrad.toFixed(6)} err=${(err * 100).toFixed(1)}%`);
        }
      }
    }

    console.log(`  Chain rule dEmb: ${numChecked} checked, maxRelErr=${(maxRelErr * 100).toFixed(1)}%`);
    assertLess(maxRelErr, GRAD_TOL, `Chain rule error ${(maxRelErr * 100).toFixed(1)}% > ${GRAD_TOL * 100}%`);
    disposeGraphStructure(graph);
  } finally {
    disposeParams(params);
  }
});

// ============================================================================
// Test 5: Training non-regression
// ============================================================================

Deno.test("Training: must not degrade scoring on training data", () => {
  const { toolIds, capIds, embeddings } = createSmallGraph();

  const trainer = new AutogradTrainer(SMALL_CONFIG, {
    learningRate: 0.01,
    batchSize: 3,
    temperature: 0.1,
    gradientClip: 1.0,
    l2Lambda: 0.0001,
  }, 1);

  try {
    trainer.setNodeEmbeddings(embeddings);
    const capInfos: CapabilityInfo[] = [
      { id: "c0", toolsUsed: ["t0", "t1"] },
      { id: "c1", toolsUsed: ["t2", "t3"] },
      { id: "c2", toolsUsed: ["t1", "t4"] },
    ];
    const graph = buildGraphStructure(capInfos, toolIds);
    trainer.setGraph(graph);

    const examples: TrainingExample[] = capIds.map((capId, i) => ({
      intentEmbedding: makeEmb(100 + i, SMALL_CONFIG.embeddingDim),
      contextTools: [],
      candidateId: capId,
      outcome: 1,
      negativeCapIds: capIds.filter((c) => c !== capId),
    }));

    // Baseline
    let baselineCorrect = 0;
    for (const ex of examples) {
      const scores = trainer.score(ex.intentEmbedding, capIds);
      const maxIdx = scores.indexOf(Math.max(...scores));
      if (capIds[maxIdx] === ex.candidateId) baselineCorrect++;
    }
    console.log(`  Baseline: ${baselineCorrect}/${examples.length}`);

    // Train 30 epochs
    for (let epoch = 0; epoch < 30; epoch++) {
      trainer.trainBatch(examples);
    }

    // Post-training
    let trainedCorrect = 0;
    for (const ex of examples) {
      const scores = trainer.score(ex.intentEmbedding, capIds);
      const maxIdx = scores.indexOf(Math.max(...scores));
      if (capIds[maxIdx] === ex.candidateId) trainedCorrect++;
    }
    console.log(`  Trained:  ${trainedCorrect}/${examples.length}`);
    console.log(`  Delta: ${trainedCorrect - baselineCorrect}`);

    // With only 3 examples and 30 epochs of training, we should at least not regress
    assertGreater(
      trainedCorrect,
      baselineCorrect - 1,
      `Training degraded: ${baselineCorrect} -> ${trainedCorrect}`,
    );

    disposeGraphStructure(graph);
  } finally {
    trainer.dispose();
  }
});

// ============================================================================
// Test 6: Temperature effect on loss
// ============================================================================

Deno.test("Temperature: lower temp produces sharper loss", () => {
  const posScore = tf.scalar(0.8);
  const negScores = tf.tensor1d([0.3, 0.5, 0.1]);

  const lossHigh = infoNCELoss(posScore, negScores, 0.10).arraySync() as number;
  const lossLow = infoNCELoss(posScore, negScores, 0.06).arraySync() as number;

  console.log(`  Loss tau=0.10: ${lossHigh.toFixed(6)}, tau=0.06: ${lossLow.toFixed(6)}`);
  assertGreater(Math.abs(lossHigh - lossLow), 0.001, "Temperature has no effect");

  posScore.dispose();
  negScores.dispose();
});

// ============================================================================
// Test 7: Gradient scale — batch-sum = N * single
// ============================================================================

Deno.test("Gradient scale: batch-sum grad = N * single-example grad", () => {
  const params = initTFParams(SMALL_CONFIG, 1);

  try {
    const dim = SMALL_CONFIG.embeddingDim;
    const temperature = 0.1;
    const intent = tf.tensor1d(makeEmb(50, dim));
    const nodes = tf.tensor2d([makeEmb(0, dim), makeEmb(1, dim), makeEmb(2, dim)]);

    // Single
    const { grads: g1, value: v1 } = tf.variableGrads(() => {
      const scores = forwardScoring(intent, nodes, params, SMALL_CONFIG);
      const pos = scores.slice([0], [1]).squeeze() as tf.Scalar;
      const neg = scores.slice([1], [2]) as tf.Tensor1D;
      return infoNCELoss(pos, neg, temperature);
    });
    const singleGrad = g1[params.W_k[0].name]?.arraySync() as number[][];

    // 3x same example
    const { grads: g3, value: v3 } = tf.variableGrads(() => {
      let loss = tf.scalar(0);
      for (let i = 0; i < 3; i++) {
        const scores = forwardScoring(intent, nodes, params, SMALL_CONFIG);
        const pos = scores.slice([0], [1]).squeeze() as tf.Scalar;
        const neg = scores.slice([1], [2]) as tf.Tensor1D;
        loss = loss.add(infoNCELoss(pos, neg, temperature));
      }
      return loss as tf.Scalar;
    });
    const tripleGrad = g3[params.W_k[0].name]?.arraySync() as number[][];

    let maxRatioErr = 0;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (Math.abs(singleGrad[i][j]) < 1e-10) continue;
        const ratio = tripleGrad[i][j] / singleGrad[i][j];
        const err = Math.abs(ratio - 3.0) / 3.0;
        if (err > maxRatioErr) maxRatioErr = err;
      }
    }

    console.log(`  Scale ratio error: ${(maxRatioErr * 100).toFixed(2)}%`);
    assertLess(maxRatioErr, 0.01, "Batch gradient ≠ 3x single gradient");

    Object.values(g1).forEach((g) => g.dispose());
    Object.values(g3).forEach((g) => g.dispose());
    (v1 as tf.Tensor).dispose();
    (v3 as tf.Tensor).dispose();
    intent.dispose();
    nodes.dispose();
  } finally {
    disposeParams(params);
  }
});
