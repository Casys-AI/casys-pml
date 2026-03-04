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
 * Train one epoch over examples.
 * Uses numerical gradient estimation (finite differences) -- viable for
 * vault-exec's small parameter space (hidden=32, vocab<200).
 *
 * Returns average loss and accuracy.
 */
export function trainEpoch(
  examples: TrainingExample[],
  weights: GRUWeights,
  vocab: GRUVocabulary,
  config: GRUConfig,
  _lr: number,
  gamma = 2.0,
): { avgLoss: number; accuracy: number } {
  let totalLoss = 0;
  let correct = 0;

  for (const ex of examples) {
    // Forward pass through the path
    let hidden = new Array(config.hiddenDim).fill(0);
    let input = new Array(config.inputDim).fill(0);

    for (let t = 0; t < ex.path.length - 1; t++) {
      const idx = vocab.nameToIndex.get(ex.path[t]);
      if (idx === undefined) continue;
      input = vocab.nodes[idx].embedding;
      const step = gruStep(input, hidden, ex.intentEmb, weights, config);
      hidden = step.hNew;
    }

    // Get prediction for the last step
    const { logits } = gruStep(input, hidden, ex.intentEmb, weights, config);

    // Score and compute probabilities
    const scores = scoreVocab(logits, vocab);
    const probs = softmax(scores.map((s) => s / 0.05));

    // Loss
    const loss = softLabelLoss(
      probs,
      ex.targetIdx,
      ex.parentIdx,
      ex.childIdx,
      weights.alpha_up,
      weights.alpha_down,
      gamma,
    );
    totalLoss += loss;

    // Accuracy
    let bestIdx = 0;
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > probs[bestIdx]) bestIdx = i;
    }
    if (bestIdx === ex.targetIdx) correct++;
  }

  // NOTE: For V1, we don't backpropagate -- just compute forward loss + accuracy.
  // Full backprop with numerical gradients will be added in a follow-up task.
  // The training infrastructure (data loading, loss computation, accuracy tracking) is ready.

  return {
    avgLoss: examples.length > 0 ? totalLoss / examples.length : 0,
    accuracy: examples.length > 0 ? correct / examples.length : 0,
  };
}
