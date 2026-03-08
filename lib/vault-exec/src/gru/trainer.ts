// gru/trainer.ts — TF.js autograd trainer
import * as tf from "@tensorflow/tfjs";
import type { GRUConfig, GRUVocabulary, GRUWeights } from "./types.ts";
import { gruStep } from "./cell.ts";
import { dotProduct, softmax } from "../gnn/domain/attention.ts";

/**
 * Focal loss: FL(p) = -(1-p)^gamma * log(p)
 * gamma = 0 reduces to standard cross-entropy
 */
export function focalLoss(p: number, gamma: number): number {
  const clipped = Math.max(p, 1e-10);
  return -Math.pow(1 - clipped, gamma) * Math.log(clipped);
}

/**
 * Soft label loss with learnable alpha_up/alpha_down.
 */
export function softLabelLoss(
  probs: number[],
  targetIdx: number,
  parentIdx: number | null,
  childIdx: number | null,
  alphaUp: number,
  alphaDown: number,
  gamma = 2.0,
): number {
  let loss = focalLoss(probs[targetIdx], gamma);
  if (parentIdx !== null) {
    loss += (1 / (1 + Math.exp(-alphaUp))) * focalLoss(probs[parentIdx], gamma);
  }
  if (childIdx !== null) {
    loss += (1 / (1 + Math.exp(-alphaDown))) *
      focalLoss(probs[childIdx], gamma);
  }
  return loss;
}

export interface TrainingExample {
  intentEmb: number[];
  path: string[];
  targetIdx: number;
  parentIdx: number | null;
  childIdx: number | null;
  /** If true, this is a negative example — push AWAY from targetIdx */
  negative?: boolean;
}

/**
 * Clip gradient vector to max L2 norm.
 */
export function clipGradients(
  gradients: number[],
  maxNorm: number,
): number[] {
  let sumSq = 0;
  for (const g of gradients) sumSq += g * g;
  const gradNorm = Math.sqrt(sumSq);
  if (gradNorm <= maxNorm) return gradients;
  const scale = maxNorm / gradNorm;
  return gradients.map((g) => g * scale);
}

// ── TF.js variable management ─────────────────────────────────────────────

interface TFWeights {
  W_input: tf.Variable;
  b_input: tf.Variable;
  W_z: tf.Variable;
  b_z: tf.Variable;
  U_z: tf.Variable;
  W_r: tf.Variable;
  b_r: tf.Variable;
  U_r: tf.Variable;
  W_h: tf.Variable;
  b_h: tf.Variable;
  U_h: tf.Variable;
  W_intent: tf.Variable;
  b_intent: tf.Variable;
  W_fusion: tf.Variable;
  b_fusion: tf.Variable;
  W_output: tf.Variable;
  b_output: tf.Variable;
  alpha_up: tf.Variable;
  alpha_down: tf.Variable;
}

function weightsToTF(w: GRUWeights): TFWeights {
  return {
    W_input: tf.variable(tf.tensor2d(w.W_input), true, "W_input"),
    b_input: tf.variable(tf.tensor1d(w.b_input), true, "b_input"),
    W_z: tf.variable(tf.tensor2d(w.W_z), true, "W_z"),
    b_z: tf.variable(tf.tensor1d(w.b_z), true, "b_z"),
    U_z: tf.variable(tf.tensor2d(w.U_z), true, "U_z"),
    W_r: tf.variable(tf.tensor2d(w.W_r), true, "W_r"),
    b_r: tf.variable(tf.tensor1d(w.b_r), true, "b_r"),
    U_r: tf.variable(tf.tensor2d(w.U_r), true, "U_r"),
    W_h: tf.variable(tf.tensor2d(w.W_h), true, "W_h"),
    b_h: tf.variable(tf.tensor1d(w.b_h), true, "b_h"),
    U_h: tf.variable(tf.tensor2d(w.U_h), true, "U_h"),
    W_intent: tf.variable(tf.tensor2d(w.W_intent), true, "W_intent"),
    b_intent: tf.variable(tf.tensor1d(w.b_intent), true, "b_intent"),
    W_fusion: tf.variable(tf.tensor2d(w.W_fusion), true, "W_fusion"),
    b_fusion: tf.variable(tf.tensor1d(w.b_fusion), true, "b_fusion"),
    W_output: tf.variable(tf.tensor2d(w.W_output), true, "W_output"),
    b_output: tf.variable(tf.tensor1d(w.b_output), true, "b_output"),
    alpha_up: tf.variable(tf.scalar(w.alpha_up), true, "alpha_up"),
    alpha_down: tf.variable(tf.scalar(w.alpha_down), true, "alpha_down"),
  };
}

function tfToWeights(tfW: TFWeights, w: GRUWeights): void {
  w.W_input = tfW.W_input.arraySync() as number[][];
  w.b_input = tfW.b_input.arraySync() as number[];
  w.W_z = tfW.W_z.arraySync() as number[][];
  w.b_z = tfW.b_z.arraySync() as number[];
  w.U_z = tfW.U_z.arraySync() as number[][];
  w.W_r = tfW.W_r.arraySync() as number[][];
  w.b_r = tfW.b_r.arraySync() as number[];
  w.U_r = tfW.U_r.arraySync() as number[][];
  w.W_h = tfW.W_h.arraySync() as number[][];
  w.b_h = tfW.b_h.arraySync() as number[];
  w.U_h = tfW.U_h.arraySync() as number[][];
  w.W_intent = tfW.W_intent.arraySync() as number[][];
  w.b_intent = tfW.b_intent.arraySync() as number[];
  w.W_fusion = tfW.W_fusion.arraySync() as number[][];
  w.b_fusion = tfW.b_fusion.arraySync() as number[];
  w.W_output = tfW.W_output.arraySync() as number[][];
  w.b_output = tfW.b_output.arraySync() as number[];
  w.alpha_up = tfW.alpha_up.dataSync()[0];
  w.alpha_down = tfW.alpha_down.dataSync()[0];
}

function disposeTFWeights(tfW: TFWeights): void {
  for (const v of Object.values(tfW)) (v as tf.Variable).dispose();
}

// ── TF.js differentiable forward pass ─────────────────────────────────────

/** Focal loss in TF: FL(p) = -(1-p)^gamma * log(p) */
function focalLossTF(prob: tf.Scalar, gamma: number): tf.Scalar {
  const clipped = tf.maximum(prob, 1e-10) as tf.Scalar;
  return tf.mul(
    tf.scalar(-1),
    tf.mul(
      tf.pow(tf.sub(tf.scalar(1), clipped), tf.scalar(gamma)),
      tf.log(clipped),
    ),
  ) as tf.Scalar;
}

/**
 * Full forward pass for one example → loss scalar.
 * Input embeddings (from BGE) are frozen constants.
 * All weight matrices are TF variables → autograd computes gradients.
 */
/** Weight for negative examples (0-1). Lower = softer repulsion. */
const NEGATIVE_WEIGHT = 0.5;
/** Temperature for vocab softmax (higher = smoother, numerically safer). */
const TRAIN_SOFTMAX_TEMPERATURE = 0.1;
/** Conservative cap to keep TF.js Adam updates stable with random init. */
const MAX_EFFECTIVE_LR = 5e-3;
/** Per-variable gradient clipping max L2 norm. */
const MAX_GRAD_NORM = 1.0;

function computeExampleLoss(
  ex: TrainingExample,
  tfW: TFWeights,
  vocabEmbeddings: number[][], // [vocabSize, inputDim] — frozen JS arrays
  vocab: GRUVocabulary,
  config: GRUConfig,
  gamma: number,
): tf.Scalar {
  // Run GRU sequence
  let h: tf.Tensor1D = tf.zeros([config.hiddenDim]);

  for (let t = 0; t < ex.path.length - 1; t++) {
    const idx = vocab.nameToIndex.get(ex.path[t]);
    if (idx === undefined) continue;

    // Frozen input embedding → project through trainable W_input
    const rawEmb = tf.tensor1d(vocabEmbeddings[idx]);
    const x = tf.relu(tf.add(
      tf.dot(tfW.W_input, rawEmb) as tf.Tensor1D,
      tfW.b_input,
    )) as tf.Tensor1D;

    // GRU gates
    const zGate = tf.sigmoid(tf.add(
      tf.add(tf.dot(tfW.W_z, x) as tf.Tensor1D, tfW.b_z),
      tf.dot(tfW.U_z, h) as tf.Tensor1D,
    )) as tf.Tensor1D;

    const rGate = tf.sigmoid(tf.add(
      tf.add(tf.dot(tfW.W_r, x) as tf.Tensor1D, tfW.b_r),
      tf.dot(tfW.U_r, h) as tf.Tensor1D,
    )) as tf.Tensor1D;

    const rh = tf.mul(rGate, h) as tf.Tensor1D;
    const hCandidate = tf.tanh(tf.add(
      tf.add(tf.dot(tfW.W_h, x) as tf.Tensor1D, tfW.b_h),
      tf.dot(tfW.U_h, rh) as tf.Tensor1D,
    )) as tf.Tensor1D;

    const ones = tf.onesLike(zGate);
    h = tf.add(
      tf.mul(zGate, h),
      tf.mul(tf.sub(ones, zGate), hCandidate),
    ) as tf.Tensor1D;
  }

  // Intent projection
  const intentRaw = tf.tensor1d(ex.intentEmb);
  const intentProj = tf.relu(tf.add(
    tf.dot(tfW.W_intent, intentRaw) as tf.Tensor1D,
    tfW.b_intent,
  )) as tf.Tensor1D;

  // Fusion: concat(h, intentProj) → fusionDim
  const concat = tf.concat([h, intentProj]) as tf.Tensor1D;
  const fused = tf.relu(tf.add(
    tf.dot(tfW.W_fusion, concat) as tf.Tensor1D,
    tfW.b_fusion,
  )) as tf.Tensor1D;

  // Output projection → embedding space
  const logits = tf.add(
    tf.dot(tfW.W_output, fused) as tf.Tensor1D,
    tfW.b_output,
  ) as tf.Tensor1D;

  // Cosine similarity against vocab (frozen)
  const vocabTensor = tf.tensor2d(vocabEmbeddings);
  const vocabNorms = tf.add(
    tf.norm(vocabTensor, 2, 1),
    tf.scalar(1e-8),
  ) as tf.Tensor1D;
  const logitNorm = tf.add(tf.norm(logits), tf.scalar(1e-8));
  const normalizedLogits = tf.div(logits, logitNorm) as tf.Tensor1D;
  const normalizedVocab = tf.div(vocabTensor, vocabNorms.reshape([-1, 1]));

  // scores = normalizedVocab @ normalizedLogits
  const scores = tf.dot(normalizedVocab, normalizedLogits) as tf.Tensor1D;

  // Temperature-scaled softmax
  const probs = tf.softmax(
    tf.div(scores, tf.scalar(TRAIN_SOFTMAX_TEMPERATURE)),
  ) as tf.Tensor1D;

  // Focal loss on target
  let loss = focalLossTF(
    tf.gather(probs, ex.targetIdx).reshape([]) as tf.Scalar,
    gamma,
  );

  // Soft labels
  if (ex.parentIdx !== null) {
    const parentLoss = focalLossTF(
      tf.gather(probs, ex.parentIdx!).reshape([]) as tf.Scalar,
      gamma,
    );
    loss = tf.add(
      loss,
      tf.mul(tf.sigmoid(tfW.alpha_up), parentLoss),
    ) as tf.Scalar;
  }
  if (ex.childIdx !== null) {
    const childLoss = focalLossTF(
      tf.gather(probs, ex.childIdx!).reshape([]) as tf.Scalar,
      gamma,
    );
    loss = tf.add(
      loss,
      tf.mul(tf.sigmoid(tfW.alpha_down), childLoss),
    ) as tf.Scalar;
  }

  // Negative examples: flip the loss (push away from target)
  // Multiplied by NEGATIVE_WEIGHT to avoid overshooting
  if (ex.negative) {
    loss = tf.mul(loss, tf.scalar(-NEGATIVE_WEIGHT)) as tf.Scalar;
  }

  return loss;
}

// ── JS scoring helpers (for accuracy computation) ─────────────────────────

function vecNorm(vec: number[]): number {
  let sum = 0;
  for (const v of vec) sum += v * v;
  return Math.sqrt(sum);
}

function scoreVocab(logits: number[], vocab: GRUVocabulary): number[] {
  const logitNorm = vecNorm(logits);
  return vocab.nodes.map((node) => {
    const sim = dotProduct(logits, node.embedding) /
      (logitNorm * vecNorm(node.embedding) + 1e-8);
    return sim;
  });
}

/**
 * Train one epoch using TF.js autograd (Adam optimizer).
 *
 * Returns average loss and accuracy (both pre-update).
 */
export function trainEpoch(
  examples: TrainingExample[],
  weights: GRUWeights,
  vocab: GRUVocabulary,
  config: GRUConfig,
  lr: number,
  gamma = 2.0,
): { avgLoss: number; accuracy: number } {
  if (examples.length === 0) {
    return { avgLoss: 0, accuracy: 0 };
  }

  // --- Phase 1: JS forward pass for metrics (pre-update) ---
  let totalLoss = 0;
  let correct = 0;

  for (const ex of examples) {
    let hidden = new Array(config.hiddenDim).fill(0);
    let input = new Array(config.inputDim).fill(0);

    for (let t = 0; t < ex.path.length - 1; t++) {
      const idx = vocab.nameToIndex.get(ex.path[t]);
      if (idx === undefined) continue;
      input = vocab.nodes[idx].embedding;
      const step = gruStep(input, hidden, ex.intentEmb, weights, config);
      hidden = step.hNew;
    }

    const { logits } = gruStep(input, hidden, ex.intentEmb, weights, config);
    const scores = scoreVocab(logits, vocab);
    const probs = softmax(scores.map((s) => s / TRAIN_SOFTMAX_TEMPERATURE));

    const exLoss = softLabelLoss(
      probs,
      ex.targetIdx,
      ex.parentIdx,
      ex.childIdx,
      weights.alpha_up,
      weights.alpha_down,
      gamma,
    );
    totalLoss += ex.negative ? -exLoss * NEGATIVE_WEIGHT : exLoss;

    // Accuracy only counts positive examples
    if (!ex.negative) {
      let bestIdx = 0;
      for (let i = 1; i < probs.length; i++) {
        if (probs[i] > probs[bestIdx]) bestIdx = i;
      }
      if (bestIdx === ex.targetIdx) correct++;
    }
  }

  const avgLoss = totalLoss / examples.length;
  const positiveCount = examples.filter((e) => !e.negative).length;
  const accuracy = positiveCount > 0 ? correct / positiveCount : 0;

  // --- Phase 2: TF.js autograd update ---
  const tfW = weightsToTF(weights);
  const optimizer = tf.train.adam(Math.min(lr, MAX_EFFECTIVE_LR));
  const vocabEmbs = vocab.nodes.map((n) => n.embedding);

  // Compute gradients via automatic differentiation
  const { grads } = tf.variableGrads(() => {
    let batchLoss: tf.Scalar = tf.scalar(0);
    for (const ex of examples) {
      const exLoss = computeExampleLoss(
        ex,
        tfW,
        vocabEmbs,
        vocab,
        config,
        gamma,
      );
      batchLoss = tf.add(batchLoss, exLoss) as tf.Scalar;
    }
    return tf.div(batchLoss, tf.scalar(examples.length)) as tf.Scalar;
  });

  // Clip gradients per-variable and apply
  const gradPairs: Array<{ name: string; tensor: tf.Tensor }> = [];
  for (const [name, grad] of Object.entries(grads)) {
    // Replace non-finite values early to prevent NaN poisoning in optimizer state.
    const safeGrad = tf.where(tf.isFinite(grad), grad, tf.zerosLike(grad));
    const gradNorm = tf.norm(safeGrad);
    const scale = tf.minimum(
      tf.div(tf.scalar(MAX_GRAD_NORM), tf.add(gradNorm, tf.scalar(1e-8))),
      tf.scalar(1.0),
    );
    gradPairs.push({ name, tensor: tf.mul(safeGrad, scale) });
    safeGrad.dispose();
  }

  optimizer.applyGradients(
    gradPairs.map(({ name, tensor }) => ({ name, tensor })),
  );

  // Guard against occasional non-finite updates with random initialization.
  for (const variable of Object.values(tfW)) {
    const sanitized = tf.clipByValue(
      tf.where(tf.isFinite(variable), variable, tf.zerosLike(variable)),
      -1e3,
      1e3,
    );
    variable.assign(sanitized);
    sanitized.dispose();
  }

  // Write TF variables back to JS weights
  tfToWeights(tfW, weights);

  // Cleanup
  for (const g of Object.values(grads) as tf.Tensor[]) g.dispose();
  for (const { tensor } of gradPairs) tensor.dispose();
  disposeTFWeights(tfW);
  optimizer.dispose();

  return { avgLoss, accuracy };
}
