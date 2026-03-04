// gru/trainer.ts
import type { GRUConfig, GRUWeights, GRUVocabulary } from "./types.ts";
import { gruStep } from "./cell.ts";
import { dotProduct, softmax } from "../gnn/attention.ts";

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
 * loss = FL(target) + sigmoid(alpha_up)*FL(parent) + sigmoid(alpha_down)*FL(child)
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
    const sigUp = 1 / (1 + Math.exp(-alphaUp));
    loss += sigUp * focalLoss(probs[parentIdx], gamma);
  }

  if (childIdx !== null) {
    const sigDown = 1 / (1 + Math.exp(-alphaDown));
    loss += sigDown * focalLoss(probs[childIdx], gamma);
  }

  return loss;
}

/** L2 norm */
function norm(vec: number[]): number {
  let sum = 0;
  for (const v of vec) sum += v * v;
  return Math.sqrt(sum);
}

/** Cosine similarity scoring against vocab */
function scoreVocab(logits: number[], vocab: GRUVocabulary): number[] {
  const logitNorm = norm(logits);
  return vocab.nodes.map((node) => {
    const sim = dotProduct(logits, node.embedding) /
      (logitNorm * norm(node.embedding) + 1e-8);
    return sim;
  });
}

export interface TrainingExample {
  intentEmb: number[];
  path: string[];
  targetIdx: number;
  parentIdx: number | null;
  childIdx: number | null;
}

/**
 * Compute average loss over all examples (forward-only, no weight mutation).
 * Used both for reporting and as the objective for numerical gradient estimation.
 */
function batchLoss(
  examples: TrainingExample[],
  weights: GRUWeights,
  vocab: GRUVocabulary,
  config: GRUConfig,
  gamma: number,
): number {
  if (examples.length === 0) return 0;
  let totalLoss = 0;

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
    const probs = softmax(scores.map((s) => s / 0.05));

    totalLoss += softLabelLoss(
      probs,
      ex.targetIdx,
      ex.parentIdx,
      ex.childIdx,
      weights.alpha_up,
      weights.alpha_down,
      gamma,
    );
  }

  return totalLoss / examples.length;
}

/**
 * Iterate over every individual weight in GRUWeights.
 * Calls `fn` with accessors to get/set the scalar value at each position,
 * plus the key name for diagnostics.
 *
 * Handles 2D matrices (number[][]), 1D biases (number[]), and scalars (number).
 */
function forEachWeight(
  weights: GRUWeights,
  fn: (get: () => number, set: (v: number) => void, key: string) => void,
): void {
  for (const key of Object.keys(weights) as Array<keyof GRUWeights>) {
    const val = weights[key];
    if (typeof val === "number") {
      // Scalar (alpha_up, alpha_down)
      fn(
        () => weights[key] as number,
        (v: number) => {
          // deno-lint-ignore no-explicit-any
          (weights as any)[key] = v;
        },
        key,
      );
    } else if (Array.isArray(val) && val.length > 0 && Array.isArray(val[0])) {
      // 2D matrix
      const mat = val as number[][];
      for (let i = 0; i < mat.length; i++) {
        for (let j = 0; j < mat[i].length; j++) {
          fn(
            () => mat[i][j],
            (v: number) => { mat[i][j] = v; },
            `${key}[${i}][${j}]`,
          );
        }
      }
    } else if (Array.isArray(val)) {
      // 1D bias
      const arr = val as number[];
      for (let i = 0; i < arr.length; i++) {
        fn(
          () => arr[i],
          (v: number) => { arr[i] = v; },
          `${key}[${i}]`,
        );
      }
    }
  }
}

/**
 * Clip gradient vector to max L2 norm.
 * If ||grads|| > maxNorm, scale all gradients down proportionally.
 * Returns the (possibly clipped) gradients.
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

/**
 * Train one epoch over examples.
 * Uses numerical gradient estimation (finite differences) -- viable for
 * vault-exec's small parameter space (hidden=32, vocab<200).
 *
 * Algorithm per epoch:
 *   1. Compute base loss over all examples
 *   2. For each weight w:
 *        perturb +epsilon -> loss_plus
 *        perturb -epsilon -> loss_minus
 *        gradient = (loss_plus - loss_minus) / (2 * epsilon)
 *   3. Clip gradient vector to maxNorm=1.0
 *   4. Update: w -= lr * clipped_gradient
 *
 * Returns average loss (pre-update) and accuracy (pre-update).
 */
export function trainEpoch(
  examples: TrainingExample[],
  weights: GRUWeights,
  vocab: GRUVocabulary,
  config: GRUConfig,
  lr: number,
  gamma = 2.0,
  epsilon = 1e-4,
  maxGradNorm = 1.0,
): { avgLoss: number; accuracy: number } {
  if (examples.length === 0) {
    return { avgLoss: 0, accuracy: 0 };
  }

  // --- Phase 1: Forward pass for metrics (loss + accuracy) BEFORE update ---
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
    const probs = softmax(scores.map((s) => s / 0.05));

    totalLoss += softLabelLoss(
      probs,
      ex.targetIdx,
      ex.parentIdx,
      ex.childIdx,
      weights.alpha_up,
      weights.alpha_down,
      gamma,
    );

    let bestIdx = 0;
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > probs[bestIdx]) bestIdx = i;
    }
    if (bestIdx === ex.targetIdx) correct++;
  }

  const avgLoss = totalLoss / examples.length;
  const accuracy = correct / examples.length;

  // --- Phase 2: Numerical gradient estimation via central differences ---
  // Collect all (get, set) accessors and compute gradients
  const accessors: Array<{ get: () => number; set: (v: number) => void }> = [];
  forEachWeight(weights, (get, set) => {
    accessors.push({ get, set });
  });

  const gradients = new Array(accessors.length);

  for (let i = 0; i < accessors.length; i++) {
    const { get, set } = accessors[i];
    const original = get();

    // f(w + epsilon)
    set(original + epsilon);
    const lossPlus = batchLoss(examples, weights, vocab, config, gamma);

    // f(w - epsilon)
    set(original - epsilon);
    const lossMinus = batchLoss(examples, weights, vocab, config, gamma);

    // Restore original
    set(original);

    gradients[i] = (lossPlus - lossMinus) / (2 * epsilon);
  }

  // --- Phase 3: Gradient clipping ---
  const clipped = clipGradients(gradients, maxGradNorm);

  // --- Phase 4: Weight update ---
  for (let i = 0; i < accessors.length; i++) {
    const { get, set } = accessors[i];
    set(get() - lr * clipped[i]);
  }

  return { avgLoss, accuracy };
}
