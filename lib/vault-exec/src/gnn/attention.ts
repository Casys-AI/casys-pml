import { matVec } from "./math/backend.ts";

/** Leaky ReLU activation */
export function leakyRelu(x: number, alpha = 0.2): number {
  return x >= 0 ? x : alpha * x;
}

/** Numerically stable softmax */
export function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/** Dot product of two vectors */
export function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

/** ELU activation */
export function elu(x: number, alpha = 1.0): number {
  return x >= 0 ? x : alpha * (Math.exp(x) - 1);
}

/** Matrix-vector multiply: result[i] = sum_j(matrix[i][j] * vec[j]) */
export function matVecMul(matrix: number[][], vec: number[]): number[] {
  return matVec(matrix, vec);
}

/**
 * GAT-style concat attention score.
 * score = a^T · LeakyReLU([child_proj || parent_proj])
 */
export function attentionScore(
  childProj: number[],
  parentProj: number[],
  a: number[],
  leakyAlpha = 0.2,
): number {
  const childLen = childProj.length;
  const parentLen = parentProj.length;
  const total = childLen + parentLen;
  const n = Math.min(total, a.length);

  let score = 0;
  for (let i = 0; i < n; i++) {
    const x = i < childLen ? childProj[i] : parentProj[i - childLen];
    score += a[i] * leakyRelu(x, leakyAlpha);
  }
  return score;
}
