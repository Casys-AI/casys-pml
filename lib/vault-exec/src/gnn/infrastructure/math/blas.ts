import { blasMatVec, isBlasAvailable } from "../blas-ffi.ts";
import type { MathBackend } from "./backend.ts";
import { jsMatVec } from "./js.ts";

export function blasMatVecWithFallback(
  matrix: number[][],
  vector: number[],
): number[] {
  if (!isBlasAvailable()) return jsMatVec(matrix, vector);
  return blasMatVec(matrix, vector);
}

export const blasBackend: MathBackend = {
  name: "blas",
  get available() {
    return isBlasAvailable();
  },
  matVec: blasMatVecWithFallback,
};
