/** Sigmoid function */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Compute residual gate gamma based on number of children.
 * γ(n) = sigmoid(a * log(n+1) + b)
 * Default init: a = -1.0, b = 0.5
 * More children → lower gamma → more MP signal retained
 */
export function residualGamma(nChildren: number, a: number, b: number): number {
  return sigmoid(a * Math.log(nChildren + 1) + b);
}

/**
 * Convex gated residual (V→E, E→E downward).
 * E = (1 - γ) * E_MP + γ * E_original
 */
export function convexGatedResidual(
  mp: number[],
  original: number[],
  gamma: number,
): number[] {
  return mp.map((m, i) => (1 - gamma) * m + gamma * original[i]);
}

/**
 * Additive skip residual (E→V downward).
 * H = H_MP + H_original
 */
export function additiveSkipResidual(
  mp: number[],
  original: number[],
): number[] {
  return mp.map((m, i) => m + original[i]);
}
