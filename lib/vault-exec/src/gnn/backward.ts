// gnn/backward.ts — Numerical gradient training + parameter serialization
import type { GNNNode, GNNParams, GNNConfig, LevelParams } from "./types.ts";
import { gnnForward } from "./forward.ts";
import { gzipCompress, gzipDecompress } from "../compress.ts";

// ── Loss ───────────────────────────────────────────────────────────────

/** MSE loss between forward-pass outputs and target embeddings */
function mseLoss(
  nodes: GNNNode[],
  params: GNNParams,
  config: GNNConfig,
  targets: Map<string, number[]>,
): number {
  const outputs = gnnForward(nodes, params, config);
  let totalSE = 0;
  let count = 0;

  for (const [name, target] of targets) {
    const output = outputs.get(name);
    if (!output) continue;
    for (let i = 0; i < target.length; i++) {
      const diff = output[i] - target[i];
      totalSE += diff * diff;
    }
    count++;
  }

  return count > 0 ? totalSE / count : 0;
}

// ── Numerical gradient helpers ─────────────────────────────────────────

const EPSILON = 1e-4;

/** Estimate gradient for a single scalar via central differences */
function scalarGradient(
  getValue: () => number,
  setValue: (v: number) => void,
  lossFn: () => number,
): number {
  const original = getValue();

  setValue(original + EPSILON);
  const lossPlus = lossFn();

  setValue(original - EPSILON);
  const lossMinus = lossFn();

  setValue(original); // restore
  return (lossPlus - lossMinus) / (2 * EPSILON);
}

/** Clip gradient by max absolute value */
function clipGrad(grad: number, maxNorm: number): number {
  if (grad > maxNorm) return maxNorm;
  if (grad < -maxNorm) return -maxNorm;
  return grad;
}

// ── Parameter iteration ────────────────────────────────────────────────

interface ParamAccessor {
  get: () => number;
  set: (v: number) => void;
}

/**
 * Yield all scalar parameter accessors for a GNNParams object.
 * When shareLevelWeights is true, the same LevelParams object is referenced
 * by all levels — we only iterate it once to avoid double-counting gradients.
 */
function* iterParams(params: GNNParams): Generator<ParamAccessor> {
  // Deduplicate level params (shared weights = same reference)
  const visitedLevelParams = new Set<LevelParams>();

  for (const [, lp] of params.levels) {
    if (visitedLevelParams.has(lp)) continue;
    visitedLevelParams.add(lp);

    // W_child: [numHeads][headDim][embDim]
    for (let h = 0; h < lp.W_child.length; h++) {
      for (let i = 0; i < lp.W_child[h].length; i++) {
        for (let j = 0; j < lp.W_child[h][i].length; j++) {
          const hh = h, ii = i, jj = j;
          yield {
            get: () => lp.W_child[hh][ii][jj],
            set: (v: number) => { lp.W_child[hh][ii][jj] = v; },
          };
        }
      }
    }

    // W_parent: [numHeads][headDim][embDim]
    for (let h = 0; h < lp.W_parent.length; h++) {
      for (let i = 0; i < lp.W_parent[h].length; i++) {
        for (let j = 0; j < lp.W_parent[h][i].length; j++) {
          const hh = h, ii = i, jj = j;
          yield {
            get: () => lp.W_parent[hh][ii][jj],
            set: (v: number) => { lp.W_parent[hh][ii][jj] = v; },
          };
        }
      }
    }

    // a_upward: [numHeads][2*headDim]
    for (let h = 0; h < lp.a_upward.length; h++) {
      for (let i = 0; i < lp.a_upward[h].length; i++) {
        const hh = h, ii = i;
        yield {
          get: () => lp.a_upward[hh][ii],
          set: (v: number) => { lp.a_upward[hh][ii] = v; },
        };
      }
    }

    // a_downward: [numHeads][2*headDim]
    for (let h = 0; h < lp.a_downward.length; h++) {
      for (let i = 0; i < lp.a_downward[h].length; i++) {
        const hh = h, ii = i;
        yield {
          get: () => lp.a_downward[hh][ii],
          set: (v: number) => { lp.a_downward[hh][ii] = v; },
        };
      }
    }
  }

  // veResidualA, veResidualB per level (always per-level, not shared)
  for (const [level] of params.veResidualA) {
    const l = level;
    yield {
      get: () => params.veResidualA.get(l)!,
      set: (v: number) => { params.veResidualA.set(l, v); },
    };
  }
  for (const [level] of params.veResidualB) {
    const l = level;
    yield {
      get: () => params.veResidualB.get(l)!,
      set: (v: number) => { params.veResidualB.set(l, v); },
    };
  }
}

// ── Training step ──────────────────────────────────────────────────────

/**
 * One training step with numerical gradients (central finite differences).
 * Viable for vault-exec's small graphs (tens of nodes, few heads).
 *
 * 1. Compute MSE loss
 * 2. For each scalar parameter, perturb by +/-epsilon, compute gradient
 * 3. Clip gradient (max abs 1.0)
 * 4. SGD update: param -= lr * clipped_grad
 */
export function gnnTrainStep(
  nodes: GNNNode[],
  params: GNNParams,
  config: GNNConfig,
  targets: Map<string, number[]>,
  lr: number,
): { loss: number } {
  const MAX_GRAD_NORM = 1.0;

  const lossFn = () => mseLoss(nodes, params, config, targets);
  const loss = lossFn();

  for (const accessor of iterParams(params)) {
    const grad = scalarGradient(accessor.get, accessor.set, lossFn);
    const clipped = clipGrad(grad, MAX_GRAD_NORM);
    accessor.set(accessor.get() - lr * clipped);
  }

  return { loss };
}

// ── Serialization ──────────────────────────────────────────────────────

interface SerializedLevelParams {
  W_child: number[][][];
  W_parent: number[][][];
  a_upward: number[][];
  a_downward: number[][];
}

interface SerializedGNNParams {
  levels: Array<[number, SerializedLevelParams]>;
  numHeads: number;
  headDim: number;
  embDim: number;
  veResidualA: Array<[number, number]>;
  veResidualB: Array<[number, number]>;
  shareLevelWeights: boolean;
}

/** Serialize GNNParams to gzipped JSON (Uint8Array) */
export async function serializeGnnParams(params: GNNParams): Promise<Uint8Array> {
  const serialized: SerializedGNNParams = {
    levels: Array.from(params.levels.entries()),
    numHeads: params.numHeads,
    headDim: params.headDim,
    embDim: params.embDim,
    veResidualA: Array.from(params.veResidualA.entries()),
    veResidualB: Array.from(params.veResidualB.entries()),
    shareLevelWeights: params.shareLevelWeights,
  };

  const encoded = new TextEncoder().encode(JSON.stringify(serialized));
  return gzipCompress(encoded);
}

/** Deserialize gzipped JSON back to GNNParams */
export async function deserializeGnnParams(blob: Uint8Array): Promise<GNNParams> {
  const decompressed = await gzipDecompress(blob);
  const json = new TextDecoder().decode(decompressed);
  const serialized: SerializedGNNParams = JSON.parse(json);

  return {
    levels: new Map(serialized.levels),
    numHeads: serialized.numHeads,
    headDim: serialized.headDim,
    embDim: serialized.embDim,
    veResidualA: new Map(serialized.veResidualA),
    veResidualB: new Map(serialized.veResidualB),
    shareLevelWeights: serialized.shareLevelWeights,
  };
}
