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
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** ELU activation */
export function elu(x: number, alpha = 1.0): number {
  return x >= 0 ? x : alpha * (Math.exp(x) - 1);
}

/** Matrix-vector multiply: result[i] = sum_j(matrix[i][j] * vec[j]) */
export function matVecMul(matrix: number[][], vec: number[]): number[] {
  return matrix.map((row) => dotProduct(row, vec));
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
  const concat = [...childProj, ...parentProj];
  const activated = concat.map((x) => leakyRelu(x, leakyAlpha));
  return dotProduct(a, activated);
}
