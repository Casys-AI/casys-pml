import type { MathBackend } from "./backend.ts";

export function jsMatVec(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) => {
    let sum = 0;
    const n = Math.min(row.length, vector.length);
    for (let i = 0; i < n; i++) {
      sum += row[i] * vector[i];
    }
    return sum;
  });
}

export const jsBackend: MathBackend = {
  name: "js",
  available: true,
  matVec: jsMatVec,
};
