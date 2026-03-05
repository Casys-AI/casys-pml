import { blasBackend } from "./blas.ts";
import { jsBackend } from "./js.ts";

export interface MathBackend {
  readonly name: "js" | "blas";
  readonly available: boolean;
  matVec(matrix: number[][], vector: number[]): number[];
  matMul?(left: number[][], right: number[][]): number[][];
}

export interface MatVecSelectionPolicy {
  readonly blasMinRows: number;
  readonly blasMinCols: number;
}

// Keep current behavior: BLAS only for sufficiently large mat-vec ops.
export const DEFAULT_MATVEC_POLICY: MatVecSelectionPolicy = {
  blasMinRows: 16,
  blasMinCols: 64,
};

/** Select BLAS only when dimensions are large enough and BLAS is available. */
export function selectMatVecBackend(
  rows: number,
  cols: number,
  policy: MatVecSelectionPolicy = DEFAULT_MATVEC_POLICY,
): MathBackend {
  if (rows >= policy.blasMinRows && cols >= policy.blasMinCols && blasBackend.available) {
    return blasBackend;
  }
  return jsBackend;
}

export function matVec(matrix: number[][], vector: number[]): number[] {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  return selectMatVecBackend(rows, cols).matVec(matrix, vector);
}

