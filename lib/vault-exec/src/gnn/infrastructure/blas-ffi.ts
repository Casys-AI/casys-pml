/**
 * OpenBLAS FFI helpers for vault-exec GNN.
 *
 * Best-effort:
 * - If FFI is unavailable, callers transparently fall back to JS backend.
 */

const CblasRowMajor = 101;
const CblasNoTrans = 111;

const BLAS_PATHS = [
  "/lib/x86_64-linux-gnu/libopenblas.so.0",
  "/lib/x86_64-linux-gnu/libopenblas.so",
  "/usr/lib/x86_64-linux-gnu/openblas-pthread/libblas.so.3",
  "/usr/lib/x86_64-linux-gnu/blas/libblas.so.3",
  "/lib/x86_64-linux-gnu/libblas.so.3",
];

type BlasLib = Deno.DynamicLibrary<{
  cblas_sgemv: {
    parameters: [
      "i32",
      "i32",
      "i32",
      "i32",
      "f32",
      "pointer",
      "i32",
      "pointer",
      "i32",
      "f32",
      "pointer",
      "i32",
    ];
    result: "void";
  };
}>;

let blasLib: BlasLib | null = null;
let initDone = false;
let available = false;
let loadedPath: string | null = null;

function initBlas(): void {
  if (initDone) return;
  initDone = true;
  if (typeof Deno?.dlopen !== "function") return;

  for (const path of BLAS_PATHS) {
    try {
      blasLib = Deno.dlopen(path, {
        cblas_sgemv: {
          parameters: [
            "i32",
            "i32",
            "i32",
            "i32",
            "f32",
            "pointer",
            "i32",
            "pointer",
            "i32",
            "f32",
            "pointer",
            "i32",
          ],
          result: "void",
        },
      });
      available = true;
      loadedPath = path;
      return;
    } catch {
      // Try next candidate.
    }
  }
}

export function isBlasAvailable(): boolean {
  return available;
}

export function initBlasAcceleration(): boolean {
  initBlas();
  return available;
}

export function getBlasStatus(): { available: boolean; path: string | null } {
  return { available, path: loadedPath };
}

export function closeBlasAcceleration(): void {
  if (blasLib) {
    try {
      blasLib.close();
    } catch {
      // ignore teardown errors
    }
  }
  blasLib = null;
  initDone = false;
  available = false;
  loadedPath = null;
}

function jsMatVecFallback(matrix: number[][], vector: number[], cols: number): number[] {
  return matrix.map((row) => {
    let sum = 0;
    const n = Math.min(cols, row.length, vector.length);
    for (let i = 0; i < n; i++) sum += row[i] * vector[i];
    return sum;
  });
}

export function blasMatVec(matrix: number[][], vector: number[]): number[] {
  const m = matrix.length;
  const n = matrix[0]?.length ?? 0;
  if (m === 0 || n === 0) return new Array(m).fill(0);
  if (!isBlasAvailable() || !blasLib) return jsMatVecFallback(matrix, vector, n);

  const flatA = new Float32Array(m * n);
  const flatX = new Float32Array(n);
  const flatY = new Float32Array(m);

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) flatA[i * n + j] = matrix[i][j] ?? 0;
  }
  for (let i = 0; i < n; i++) flatX[i] = vector[i] ?? 0;

  const pA = Deno.UnsafePointer.of(flatA);
  const pX = Deno.UnsafePointer.of(flatX);
  const pY = Deno.UnsafePointer.of(flatY);

  blasLib.symbols.cblas_sgemv(
    CblasRowMajor,
    CblasNoTrans,
    m,
    n,
    1.0,
    pA!,
    n,
    pX!,
    1,
    0.0,
    pY!,
    1,
  );
  return Array.from(flatY);
}

