#!/usr/bin/env -S deno run --unstable-ffi --allow-ffi --allow-read --allow-write --allow-env
/**
 * SHGAT-TF OB Training — Manual backward + OpenBLAS FFI
 *
 * Replaces TF.js autograd training (11-15GB RAM) with manual backward
 * passes and OpenBLAS FFI acceleration (target: 1-3GB RAM).
 *
 * Full gradient chain:
 *   InfoNCE → dLogits → K-head backward (dW_q, dW_k, dNodeEmbedding)
 *   → W_intent backward (dW_intent)
 *   → MP backward (dW_child, dW_parent, da_upward, da_downward)
 *
 * Decision log:
 *   - W_q/W_k are SEPARATE for training (not shared like inference init)
 *   - preserveDim=true → embeddingDim=hiddenDim=1024 → no dimension mismatch
 *   - MP backward via orchestrator.backwardMultiLevel() — handles dH (L0 nodes)
 *     through E→V backward AND dE (L1+ nodes) through E→E/V→E backward
 *   - Both InfoNCE and KL paths propagate gradients into MP weights
 *   - Uses forwardMultiLevelWithCache (not forwardMultiLevel) for per-phase caches
 *   - Adam optimizer with per-epoch LR via .lr setter
 *   - MP weights use mpLrScale for smaller updates (noisy subgraph gradients)
 *
 * Data: Parquet files (default) or msgpack.gz (--msgpack) from tools/export-dataset.ts
 *
 * Usage:
 *   cd lib/shgat-tf
 *   deno run --unstable-ffi --allow-ffi --allow-read --allow-write --allow-env \
 *     tools/train-ob.ts --epochs 15 --lr 0.005 --kl --seed 42
 *
 * @module shgat-tf/tools/train-ob
 */

import { dirname, resolve, fromFileUrl } from "https://deno.land/std@0.224.0/path/mod.ts";
import { decode as msgpackDecode } from "@msgpack/msgpack";
import pako from "pako";
import { loadFullDataset } from "./load-parquet.ts";

import { ensureBLAS } from "../src/utils/blas-ffi.ts";
import * as math from "../src/utils/math.ts";
import { infoNCELossAndGradient } from "../src/training/infonce-loss.ts";
import {
  batchContrastiveForward,
  batchContrastiveBackward,
} from "../src/training/batch-contrastive-loss.ts";
import { AdamOptimizer } from "../src/training/adam-optimizer.ts";
import {
  computeMultiHeadKHeadScoresWithCache,
  backpropMultiHeadKHeadLogit,
  backpropWIntent,
  initMultiLevelKHeadGradients,
  resetMultiLevelKHeadGradients,
} from "../src/training/multi-level-trainer-khead.ts";
import type { MultiLevelKHeadGradientAccumulators } from "../src/training/multi-level-trainer-khead.ts";
import { MultiLevelOrchestrator } from "../src/message-passing/multi-level-orchestrator.ts";
import type { SparseConnectivity } from "../src/message-passing/phase-interface.ts";
import type { LevelParams, SHGATConfig } from "../src/core/types.ts";
import type { HeadParams } from "../src/initialization/parameters.ts";

// ==========================================================================
// BLAS — FAIL-FAST (must succeed or the script is useless)
// ==========================================================================

ensureBLAS();
console.log("[BLAS] OpenBLAS FFI loaded.");

// ==========================================================================
// Dataset type (matches export-dataset.ts output)
// ==========================================================================

interface ExportedNode {
  id: string;
  embedding: number[];
  children: string[];
  level: number;
}

interface ProdExample {
  intentEmbedding: number[];
  contextToolIds: string[];
  targetToolId: string;
  isTerminal: number;
  _traceId: string;
}

interface N8nExample {
  intentEmbedding: number[];
  contextToolIds: string[];
  targetToolId: string;
  isTerminal: number;
  softTargetSparse: [number, number][];
}

interface ExportedDataset {
  nodes: ExportedNode[];
  leafIds: string[];
  embeddingDim: number;
  workflowToolLists: string[][];
  prodTrain: ProdExample[];
  prodTest: ProdExample[];
  n8nTrain: N8nExample[];
  n8nEval: N8nExample[];
}

// ==========================================================================
// CLI args
// ==========================================================================

const cliArgs = Deno.args;

function getArg(name: string, def: string): string {
  const idx = cliArgs.indexOf(`--${name}`);
  if (idx === -1) return def;
  const next = cliArgs[idx + 1];
  return next && !next.startsWith("--") ? next : def;
}
function boolArg(name: string, def: boolean): boolean {
  if (cliArgs.includes(`--no-${name}`)) return false;
  if (cliArgs.includes(`--${name}`)) return true;
  return def;
}

if (cliArgs.includes("--help")) {
  console.log(`
SHGAT-TF OB Training — Manual backward + OpenBLAS FFI

Options:
  --epochs <n>         Training epochs (default: 15)
  --batch-size <n>     Batch size (default: 32)
  --lr <n>             Peak learning rate (default: 0.005)
  --lr-warmup <n>      LR warmup epochs (default: 3)
  --temperature <n>    InfoNCE temperature start (default: 0.10)
  --num-negatives <n>  Negatives per InfoNCE example (default: 32)
  --seed <n>           Random seed (default: 42)
  --kl / --no-kl       KL divergence on n8n soft targets (default: ON)
  --kl-warmup <n>      KL warmup epochs (default: 3)
  --kl-weight <n>      KL loss weight at plateau (default: 0.2)
  --mp-lr-scale <n>    LR scale for MP weights (default: 0.1)
  --eval-every <n>     Run full eval every N epochs (default: 2)
  --eval-chunk <n>     Tools per eval scoring chunk (default: 256)
  --batch-contrastive / --no-batch-contrastive  Use batch contrastive loss (default: ON)
  --kl-subsample <n>   Max n8n examples per epoch (default: 2000, 0=all)
  --msgpack            Use msgpack.gz loader instead of Parquet (default: Parquet)
  --data-path <path>   Path to msgpack.gz dataset (only with --msgpack)
  --help               Show this help
`);
  Deno.exit(0);
}

const EPOCHS = parseInt(getArg("epochs", "15"), 10);
const BATCH_SIZE = parseInt(getArg("batch-size", "32"), 10);
const LEARNING_RATE = parseFloat(getArg("lr", "0.005"));
const LR_WARMUP = parseInt(getArg("lr-warmup", "3"), 10);
const TAU_START = parseFloat(getArg("temperature", "0.10"));
const TAU_END = 0.06;
const NUM_NEGATIVES = parseInt(getArg("num-negatives", "32"), 10);
const SEED = parseInt(getArg("seed", "42"), 10);
const USE_KL = boolArg("kl", true);
const KL_WARMUP = parseInt(getArg("kl-warmup", "3"), 10);
const KL_WEIGHT_PLATEAU = parseFloat(getArg("kl-weight", "0.2"));
const MP_LR_SCALE = parseFloat(getArg("mp-lr-scale", "0.1"));
const EVAL_EVERY = Math.max(1, parseInt(getArg("eval-every", "2"), 10));
const EVAL_CHUNK = parseInt(getArg("eval-chunk", "256"), 10);
const USE_BATCH_CONTRASTIVE = boolArg("batch-contrastive", true);
const KL_SUBSAMPLE = parseInt(getArg("kl-subsample", "2000"), 10);

// ==========================================================================
// Seeded PRNG (mulberry32 — inlined from parameters.ts to avoid TF.js import)
// ==========================================================================

let rngState = SEED | 0;

function random(): number {
  rngState |= 0;
  rngState = (rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function gaussianRandom(): number {
  const u1 = random() || 1e-10;
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ==========================================================================
// Parameter initialization (inlined from parameters.ts — avoids TF.js import)
// ==========================================================================

function initMatrix(rows: number, cols: number): number[][] {
  const scale = Math.sqrt(2.0 / (rows + cols));
  return Array.from({ length: rows },
    () => Array.from({ length: cols }, () => (random() - 0.5) * 2 * scale));
}

function initOrthogonalMatrix(rows: number, cols: number): number[][] {
  const M: number[][] = Array.from({ length: rows },
    () => Array.from({ length: cols }, () => gaussianRandom()));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < i; j++) {
      let dot = 0;
      for (let k = 0; k < cols; k++) dot += M[i][k] * M[j][k];
      for (let k = 0; k < cols; k++) M[i][k] -= dot * M[j][k];
    }
    let norm = 0;
    for (let k = 0; k < cols; k++) norm += M[i][k] * M[i][k];
    norm = Math.sqrt(norm);
    if (norm > 1e-10) {
      for (let k = 0; k < cols; k++) M[i][k] /= norm;
    }
  }
  const scale = Math.sqrt(cols / rows);
  for (let i = 0; i < rows; i++) {
    for (let k = 0; k < cols; k++) M[i][k] *= scale;
  }
  return M;
}

function initVector(size: number): number[] {
  const scale = Math.sqrt(1.0 / size);
  return Array.from({ length: size }, () => (random() - 0.5) * 2 * scale);
}

function initTensor3DIdentityLike(numHeads: number, headDim: number, inputDim: number): number[][][] {
  const noiseScale = 0.01;
  return Array.from({ length: numHeads }, (_, head) =>
    Array.from({ length: headDim }, (_, i) =>
      Array.from({ length: inputDim }, (_, j) => {
        const targetJ = head * headDim + i;
        return j === targetJ ? 1.0 : (random() - 0.5) * noiseScale;
      })));
}

// ==========================================================================
// LR / KL / Temperature scheduling (from train-from-bench.ts)
// ==========================================================================

function scheduleLR(epoch: number, totalEpochs: number, lrPeak: number, warmupEpochs: number): number {
  const lrMin = lrPeak * 0.01;
  if (epoch < warmupEpochs) {
    const progress = (epoch + 1) / Math.max(warmupEpochs, 1);
    return lrMin + (lrPeak - lrMin) * progress;
  }
  const decayEpochs = totalEpochs - warmupEpochs;
  const decayProgress = Math.min((epoch - warmupEpochs) / Math.max(decayEpochs - 1, 1), 1.0);
  return lrMin + (lrPeak - lrMin) * 0.5 * (1 + Math.cos(Math.PI * decayProgress));
}

function scheduleKLWeight(epoch: number, warmupEpochs: number, plateau: number): number {
  if (epoch < warmupEpochs) return 0;
  const rampEnd = warmupEpochs * 2;
  if (epoch >= rampEnd) return plateau;
  const progress = (epoch - warmupEpochs) / Math.max(rampEnd - warmupEpochs, 1);
  return plateau * progress;
}

function scheduleTemperature(epoch: number, totalEpochs: number, start: number, end: number): number {
  const progress = epoch / Math.max(totalEpochs - 1, 1);
  return end + (start - end) * 0.5 * (1 + Math.cos(Math.PI * progress));
}

// ==========================================================================
// Gradient norm helpers (logging only — no training logic changes)
// ==========================================================================

/** L2 norm of a 2D matrix (flattened) */
function matrixL2Norm(m: number[][]): number {
  let sum = 0;
  for (let i = 0; i < m.length; i++) {
    const row = m[i];
    for (let j = 0; j < row.length; j++) {
      sum += row[j] * row[j];
    }
  }
  return Math.sqrt(sum);
}

/** L2 norm of a 3D tensor (flattened) */
function tensor3DL2Norm(t: number[][][]): number {
  let sum = 0;
  for (let i = 0; i < t.length; i++) {
    for (let j = 0; j < t[i].length; j++) {
      for (let k = 0; k < t[i][j].length; k++) {
        sum += t[i][j][k] * t[i][j][k];
      }
    }
  }
  return Math.sqrt(sum);
}

/**
 * Compute gradient norms for K-head and W_intent accumulators.
 *
 * |dWq| = average L2 norm across heads, |dWk| = same, |dWi| = L2 of dW_intent.
 * total = sqrt(sum of squares of all gradient elements).
 */
function computeGradNorms(grads: MultiLevelKHeadGradientAccumulators): {
  wq: number; wk: number; wIntent: number; total: number;
} {
  const numHeads = grads.khead.dW_q.length;
  let wqSum = 0, wkSum = 0;
  let totalSqSum = 0;

  for (let h = 0; h < numHeads; h++) {
    const nq = matrixL2Norm(grads.khead.dW_q[h]);
    const nk = matrixL2Norm(grads.khead.dW_k[h]);
    wqSum += nq;
    wkSum += nk;
    totalSqSum += nq * nq + nk * nk;
  }

  const wIntentNorm = matrixL2Norm(grads.dW_intent);
  totalSqSum += wIntentNorm * wIntentNorm;

  // Include MP level gradients in total norm
  for (const [, lg] of grads.levelGradients) {
    const wcNorm = tensor3DL2Norm(lg.dW_child);
    const wpNorm = tensor3DL2Norm(lg.dW_parent);
    const auNorm = matrixL2Norm(lg.da_upward);
    const adNorm = matrixL2Norm(lg.da_downward);
    totalSqSum += wcNorm * wcNorm + wpNorm * wpNorm + auNorm * auNorm + adNorm * adNorm;
  }

  return {
    wq: wqSum / Math.max(numHeads, 1),
    wk: wkSum / Math.max(numHeads, 1),
    wIntent: wIntentNorm,
    total: Math.sqrt(totalSqSum),
  };
}

// ==========================================================================
// Graph structure building (pure JS, no TF.js)
// ==========================================================================

interface PureGraphStructure {
  l0ToL1Conn: SparseConnectivity;
  interLevelConns: Map<number, SparseConnectivity>;
  l0Ids: string[];
  l0IdxMap: Map<string, number>;
  nodeIdsByLevel: Map<number, string[]>;
  maxLevel: number;
  E_levels_init: Map<number, number[][]>;
  H_init: number[][];
}

/**
 * Build graph structure from dataset nodes.
 *
 * Level mapping:
 *   dataset level 0  = L0 nodes (leaves)
 *   dataset level 1  = orchestrator level 0 (first L1+ parent level)
 *   dataset level k+1 = orchestrator level k
 */
function buildGraphStructure(nodes: ExportedNode[], leafIds: string[]): PureGraphStructure {
  const nodeMap = new Map<string, ExportedNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const l0Ids = leafIds;
  const l0IdxMap = new Map<string, number>();
  for (let i = 0; i < l0Ids.length; i++) l0IdxMap.set(l0Ids[i], i);

  // Infer levels from children (bottom-up BFS)
  // Leaves (children=[]) → level 0, else level = max(child levels) + 1
  const levelMap = new Map<string, number>();
  for (const id of leafIds) levelMap.set(id, 0);

  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes) {
      if (levelMap.has(n.id)) continue;
      if (!n.children || n.children.length === 0) {
        levelMap.set(n.id, 0);
        changed = true;
        continue;
      }
      const childLevels = n.children.map(c => levelMap.get(c));
      if (childLevels.every(l => l !== undefined)) {
        levelMap.set(n.id, Math.max(...(childLevels as number[])) + 1);
        changed = true;
      }
    }
  }

  // Group non-leaf nodes by orchestrator level (dataset level - 1)
  const nodeIdsByLevel = new Map<number, string[]>();
  let maxLevel = 0;
  for (const n of nodes) {
    const dsLevel = levelMap.get(n.id) ?? 0;
    if (dsLevel === 0) continue; // L0 leaf nodes
    const orchLevel = dsLevel - 1;
    if (!nodeIdsByLevel.has(orchLevel)) nodeIdsByLevel.set(orchLevel, []);
    nodeIdsByLevel.get(orchLevel)!.push(n.id);
    if (orchLevel > maxLevel) maxLevel = orchLevel;
  }

  // Level index maps per level
  const levelIdxMaps = new Map<number, Map<string, number>>();
  for (const [level, ids] of nodeIdsByLevel) {
    const map = new Map<string, number>();
    for (let i = 0; i < ids.length; i++) map.set(ids[i], i);
    levelIdxMaps.set(level, map);
  }

  // Build sparse L0→L1 connectivity (orch level 0)
  const nodesL1 = nodeIdsByLevel.get(0) ?? [];
  const l0ToL1Src = new Map<number, number[]>(); // L0 → L1
  const l0ToL1Tgt = new Map<number, number[]>(); // L1 → L0

  for (let c = 0; c < nodesL1.length; c++) {
    const parentNode = nodeMap.get(nodesL1[c]);
    if (!parentNode) continue;
    for (const childId of parentNode.children) {
      const tIdx = l0IdxMap.get(childId);
      if (tIdx !== undefined) {
        if (!l0ToL1Src.has(tIdx)) l0ToL1Src.set(tIdx, []);
        l0ToL1Src.get(tIdx)!.push(c);
        if (!l0ToL1Tgt.has(c)) l0ToL1Tgt.set(c, []);
        l0ToL1Tgt.get(c)!.push(tIdx);
      }
    }
  }

  const l0ToL1Conn: SparseConnectivity = {
    sourceToTargets: l0ToL1Src,
    targetToSources: l0ToL1Tgt,
    numSources: l0Ids.length,
    numTargets: nodesL1.length,
  };

  // Build sparse inter-level connectivity per parent level
  const interLevelConns = new Map<number, SparseConnectivity>();
  for (let parentLevel = 1; parentLevel <= maxLevel; parentLevel++) {
    const children = nodeIdsByLevel.get(parentLevel - 1) ?? [];
    const parents = nodeIdsByLevel.get(parentLevel) ?? [];
    const childIdx = levelIdxMaps.get(parentLevel - 1) ?? new Map();

    const src = new Map<number, number[]>(); // child → parents
    const tgt = new Map<number, number[]>(); // parent → children

    for (let p = 0; p < parents.length; p++) {
      const parentNode = nodeMap.get(parents[p]);
      if (!parentNode) continue;
      for (const childId of parentNode.children) {
        const cIdx = childIdx.get(childId);
        if (cIdx !== undefined) {
          if (!src.has(cIdx)) src.set(cIdx, []);
          src.get(cIdx)!.push(p);
          if (!tgt.has(p)) tgt.set(p, []);
          tgt.get(p)!.push(cIdx);
        }
      }
    }

    interLevelConns.set(parentLevel, {
      sourceToTargets: src,
      targetToSources: tgt,
      numSources: children.length,
      numTargets: parents.length,
    });
  }

  // Build embedding matrices
  const H_init: number[][] = l0Ids.map(id => [...(nodeMap.get(id)?.embedding ?? [])]);
  const E_levels_init = new Map<number, number[][]>();
  for (const [level, ids] of nodeIdsByLevel) {
    E_levels_init.set(level, ids.map(id => [...(nodeMap.get(id)?.embedding ?? [])]));
  }

  return { l0ToL1Conn, interLevelConns, l0Ids, l0IdxMap, nodeIdsByLevel, maxLevel, E_levels_init, H_init };
}

// ==========================================================================
// MAIN
// ==========================================================================

const scriptDir = dirname(fromFileUrl(import.meta.url));
const GRU_DATA_DIR = resolve(scriptDir, "../../gru/data");

console.log("=== SHGAT-TF OB Training (Manual Backward + OpenBLAS) ===");
console.log(`    Epochs: ${EPOCHS}, Batch: ${BATCH_SIZE}, LR: ${LEARNING_RATE} (warmup: ${LR_WARMUP}ep)`);
console.log(`    \u03C4: ${TAU_START}\u2192${TAU_END}, Negatives: ${NUM_NEGATIVES}`);
console.log(`    KL: ${USE_KL}, KL warmup: ${KL_WARMUP}ep, KL weight: ${KL_WEIGHT_PLATEAU}`);
console.log(`    MP LR scale: ${MP_LR_SCALE}, Seed: ${SEED}`);
console.log(`    Batch contrastive: ${USE_BATCH_CONTRASTIVE}`);
console.log(`    KL subsample: ${KL_SUBSAMPLE > 0 ? KL_SUBSAMPLE : 'all'}`);
console.log(`    Eval every: ${EVAL_EVERY}, Eval chunk: ${EVAL_CHUNK}\n`);

// ---- Load dataset ----
// Default: Parquet (lower peak memory, lazy per-table loading).
// Fallback: --msgpack flag → monolithic msgpack.gz (1.2GB compressed, ~5GB peak).
const useMsgpack = cliArgs.includes("--msgpack");
let ds: ExportedDataset;
if (useMsgpack) {
  const dataPath = getArg("data-path", resolve(GRU_DATA_DIR, "bench-dataset-export.msgpack.gz"));
  console.log(`[Data] Loading msgpack from ${dataPath}...`);
  // Stage 1: read compressed (1.2GB)
  let compressed: Uint8Array | null = Deno.readFileSync(dataPath);
  // Stage 2: decompress (~3-5GB raw), then drop compressed
  let raw: Uint8Array | null = pako.ungzip(compressed);
  compressed = null; // free 1.2GB
  // Stage 3: decode msgpack → JS objects, then drop raw
  ds = msgpackDecode(raw) as ExportedDataset;
  raw = null; // free 3-5GB
} else {
  console.log(`[Data] Loading Parquet from ${GRU_DATA_DIR}...`);
  ds = await loadFullDataset(GRU_DATA_DIR);
}

console.log(`  Nodes: ${ds.nodes.length} (${ds.leafIds.length} leaves), EmbDim: ${ds.embeddingDim}`);
console.log(`  Prod: ${ds.prodTrain.length} train / ${ds.prodTest.length} test`);
console.log(`  N8n: ${ds.n8nTrain.length} train / ${ds.n8nEval.length} eval`);

// ---- Build graph ----
console.log("\n[Graph] Building sparse connectivity...");
const graph = buildGraphStructure(ds.nodes, ds.leafIds);
const l0IdxMap = graph.l0IdxMap;
console.log(`  L0 nodes: ${graph.l0Ids.length}, MaxLevel: ${graph.maxLevel}`);
{
  let totalEdges = 0;
  for (const [, targets] of graph.l0ToL1Conn.sourceToTargets) totalEdges += targets.length;
  const denseSize = graph.l0ToL1Conn.numSources * graph.l0ToL1Conn.numTargets;
  console.log(`  L0: ${totalEdges} edges (sparse) vs ${denseSize} dense entries (${(totalEdges / denseSize * 100).toFixed(1)}% fill)`);
  for (const [level, conn] of graph.interLevelConns) {
    let edges = 0;
    for (const [, targets] of conn.sourceToTargets) edges += targets.length;
    console.log(`  L${level}: ${edges} edges (${conn.numSources}→${conn.numTargets})`);
  }
}
for (const [level, ids] of graph.nodeIdsByLevel) {
  console.log(`  Level ${level}: ${ids.length} L${level + 1} nodes`);
}

// ---- Free heavy data no longer needed ----
// ds.nodes has 8884 entries × 1024D embeddings (~144MB JS overhead).
// Embeddings are now in graph.H_init / E_levels_init, nodes no longer needed.
(ds as { nodes: unknown }).nodes = [];

// Subsample n8n train in-place: KL path only uses KL_SUBSAMPLE per epoch,
// no need to keep all 30K in memory (~500MB). Keep 2× subsample for shuffle variance.
if (KL_SUBSAMPLE > 0 && ds.n8nTrain.length > KL_SUBSAMPLE * 2) {
  const kept = KL_SUBSAMPLE * 2;
  console.log(`  [Mem] Trimming n8nTrain: ${ds.n8nTrain.length} → ${kept} (2× KL subsample)`);
  shuffleInPlace(ds.n8nTrain);
  ds.n8nTrain.length = kept;
}

{
  const rss = (Deno.memoryUsage().rss / 1024 / 1024).toFixed(0);
  console.log(`  [Mem] Post-cleanup RSS: ${rss}MB`);
}

// ---- Config ----
const NUM_HEADS = 16;
const HEAD_DIM = Math.floor(ds.embeddingDim / NUM_HEADS); // 64 for 1024
const config: SHGATConfig = {
  numHeads: NUM_HEADS,
  hiddenDim: ds.embeddingDim,
  headDim: HEAD_DIM,
  embeddingDim: ds.embeddingDim,
  numLayers: 1,
  mlpHiddenDim: 128,
  learningRate: LEARNING_RATE,
  batchSize: BATCH_SIZE,
  maxContextLength: 10,
  maxBufferSize: 5000,
  minTracesForTraining: 10,
  dropout: 0,
  leakyReluSlope: 0.2,
  depthDecay: 0.8,
  preserveDim: true,
  l2Lambda: 0,
};

// ---- Init parameters ----
console.log("\n[Init] Parameters...");

// K-head: W_q and W_k SEPARATE for training (decision: not shared like inference)
const headParams: HeadParams[] = [];
for (let h = 0; h < NUM_HEADS; h++) {
  headParams.push({
    W_q: initOrthogonalMatrix(HEAD_DIM, ds.embeddingDim),
    W_k: initOrthogonalMatrix(HEAD_DIM, ds.embeddingDim),
    W_v: initMatrix(HEAD_DIM, ds.embeddingDim),
    a: initVector(2 * HEAD_DIM),
  });
}

const W_intent: number[][] = initMatrix(ds.embeddingDim, ds.embeddingDim);

// MP level params: identity-like init (preserveDim)
const levelParams = new Map<number, LevelParams>();
for (let level = 0; level <= graph.maxLevel; level++) {
  levelParams.set(level, {
    W_child: initTensor3DIdentityLike(NUM_HEADS, HEAD_DIM, ds.embeddingDim),
    W_parent: initTensor3DIdentityLike(NUM_HEADS, HEAD_DIM, ds.embeddingDim),
    a_upward: initMatrix(NUM_HEADS, 2 * HEAD_DIM),
    a_downward: initMatrix(NUM_HEADS, 2 * HEAD_DIM),
  });
}

let paramCount = 0;
paramCount += NUM_HEADS * HEAD_DIM * ds.embeddingDim * 2; // W_q + W_k
paramCount += ds.embeddingDim * ds.embeddingDim; // W_intent
for (let level = 0; level <= graph.maxLevel; level++) {
  paramCount += NUM_HEADS * HEAD_DIM * ds.embeddingDim * 2; // W_child + W_parent
  paramCount += NUM_HEADS * 2 * HEAD_DIM * 2; // a_upward + a_downward
}
console.log(`  Trainable: ${(paramCount / 1e6).toFixed(2)}M params`);

// ---- Adam ----
const adam = new AdamOptimizer({ lr: LEARNING_RATE, gradientClip: 1.0 });
for (let h = 0; h < NUM_HEADS; h++) {
  adam.register(`W_q_${h}`, [HEAD_DIM, ds.embeddingDim]);
  adam.register(`W_k_${h}`, [HEAD_DIM, ds.embeddingDim]);
}
adam.register("W_intent", [ds.embeddingDim, ds.embeddingDim]);
for (let level = 0; level <= graph.maxLevel; level++) {
  for (let h = 0; h < NUM_HEADS; h++) {
    adam.register(`W_child_L${level}_H${h}`, [HEAD_DIM, ds.embeddingDim]);
    adam.register(`W_parent_L${level}_H${h}`, [HEAD_DIM, ds.embeddingDim]);
  }
  adam.register(`a_up_L${level}`, [NUM_HEADS, 2 * HEAD_DIM]);
  adam.register(`a_down_L${level}`, [NUM_HEADS, 2 * HEAD_DIM]);
}

// ---- Gradient accumulators ----
const grads = initMultiLevelKHeadGradients(levelParams, headParams, config);

// ---- Orchestrator (training mode = true → caches per-phase backward caches) ----
const orchestrator = new MultiLevelOrchestrator(true);

// ==========================================================================
// Training loop
// ==========================================================================

console.log(`\n=== Training: ${EPOCHS} epochs ===\n`);
const trainingStartMs = Date.now();
let bestHit1 = 0, bestMRR = 0, bestEpoch = 0;

/** Epoch durations for ETA calculation */
const epochDurationsMs: number[] = [];

// Pre-allocate gradient buffers ONCE — zeroed at the start of each batch.
// Previously, these were allocated per-batch (1932×1024 + 6916×1024 = ~145MB per batch),
// causing ~5GB GC pressure per epoch and OOM at 4GB heap.
const _batchDH: number[][] = graph.l0Ids.map(() => new Float64Array(ds.embeddingDim) as unknown as number[]);
const _batchDE = new Map<number, number[][]>();
for (const [level, ids] of graph.nodeIdsByLevel) {
  _batchDE.set(level, ids.map(() => new Float64Array(ds.embeddingDim) as unknown as number[]));
}
// Zero-only DE buffer for KL MP backward (n8n targets are L0-only, no dE needed)
const _emptyDE = new Map<number, number[][]>();
for (const [level, ids] of graph.nodeIdsByLevel) {
  _emptyDE.set(level, ids.map(() => new Float64Array(ds.embeddingDim) as unknown as number[]));
}

function zeroDH(dh: number[][]): void {
  for (let i = 0; i < dh.length; i++) (dh[i] as unknown as Float64Array).fill(0);
}
function zeroDE(de: Map<number, number[][]>): void {
  for (const [, arr] of de) {
    for (let i = 0; i < arr.length; i++) (arr[i] as unknown as Float64Array).fill(0);
  }
}

for (let epoch = 0; epoch < EPOCHS; epoch++) {
  const t0 = Date.now();
  const epochLR = scheduleLR(epoch, EPOCHS, LEARNING_RATE, LR_WARMUP);
  const tau = scheduleTemperature(epoch, EPOCHS, TAU_START, TAU_END);
  const klWeight = USE_KL ? scheduleKLWeight(epoch, KL_WARMUP, KL_WEIGHT_PLATEAU) : 0;

  // Update Adam LR for this epoch
  adam.lr = epochLR;

  // ---- MP Forward (once per epoch) ----
  // Uses forwardMultiLevelWithCache so we get MultiLevelBackwardCache with
  // per-phase caches (VE/EE/EV), required for orchestrator.backwardMultiLevel().
  const mpT0 = Date.now();
  const orchConfig = { numHeads: NUM_HEADS, numLayers: 1, dropout: 0, leakyReluSlope: 0.2 };
  const { result: mpResult, cache: mpBackwardCache } = orchestrator.forwardMultiLevelWithCache(
    graph.H_init,
    graph.E_levels_init,
    graph.l0ToL1Conn,
    graph.interLevelConns,
    levelParams,
    orchConfig,
  );
  const mpMs = Date.now() - mpT0;

  // Build enriched embeddings map from MP result
  const enrichedEmbs = new Map<string, number[]>();
  const H_final = mpResult.H;
  for (let i = 0; i < graph.l0Ids.length; i++) {
    enrichedEmbs.set(graph.l0Ids[i], H_final[i]);
  }
  for (const [level, ids] of graph.nodeIdsByLevel) {
    const E_level = mpResult.E.get(level) ?? [];
    for (let i = 0; i < ids.length; i++) {
      enrichedEmbs.set(ids[i], E_level[i]);
    }
  }

  console.log(`  [Epoch ${epoch + 1}/${EPOCHS}] LR=${epochLR.toFixed(5)} \u03C4=${tau.toFixed(4)} klW=${klWeight.toFixed(3)} MP=${mpMs}ms`);

  // ---- Epoch-level accuracy accumulators ----
  let epochAccCorrect = 0, epochAccTotal = 0;
  // ---- Epoch-level gradient norm accumulator (sum of squared total norms per batch) ----
  let epochGradNormSqSum = 0, epochGradBatches = 0;

  // ---- InfoNCE batches (prod) ----
  let infoLossSum = 0, infoBatches = 0;
  const prodShuffled = [...ds.prodTrain];
  shuffleInPlace(prodShuffled);
  const numInfoBatches = Math.ceil(prodShuffled.length / BATCH_SIZE);

  for (let b = 0; b < numInfoBatches; b++) {
    const batch = prodShuffled.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    if (batch.length === 0) continue;

    resetMultiLevelKHeadGradients(grads, levelParams, headParams, config);

    // Zero pre-allocated gradient buffers (avoids per-batch allocation)
    zeroDH(_batchDH);
    zeroDE(_batchDE);

    let batchLoss = 0;
    let batchCorrect = 0;

    if (USE_BATCH_CONTRASTIVE) {
      // ---- Batch contrastive: in-batch negatives with symmetric CE ----
      // Collect batch data
      const intentsProjected: number[][] = [];
      const positiveEmbs: number[][] = [];
      for (const ex of batch) {
        intentsProjected.push(math.matVecBlas(W_intent, ex.intentEmbedding));
        positiveEmbs.push(enrichedEmbs.get(ex.targetToolId) ?? []);
      }

      // Forward
      const { loss, cache } = batchContrastiveForward(
        intentsProjected, positiveEmbs, headParams, config, tau,
      );
      batchLoss = loss * batch.length; // batchContrastiveForward returns mean loss

      // Batch accuracy from cache.logits: check if diagonal is max per row
      for (let i = 0; i < batch.length; i++) {
        let maxLogit = -Infinity;
        for (let j = 0; j < batch.length; j++) {
          if (cache.logits[i][j] > maxLogit) maxLogit = cache.logits[i][j];
        }
        if (cache.logits[i][i] >= maxLogit) batchCorrect++;
      }

      // Backward
      const { dIntentsProjected, dNodeEmbeddings } = batchContrastiveBackward(
        cache, headParams, grads.khead, config,
      );

      // Accumulate dNodeEmbeddings into _batchDH (positives are always L0 nodes)
      for (let i = 0; i < batch.length; i++) {
        const l0Idx = l0IdxMap.get(batch[i].targetToolId);
        if (l0Idx !== undefined) {
          for (let d = 0; d < ds.embeddingDim; d++) {
            _batchDH[l0Idx][d] += dNodeEmbeddings[i][d];
          }
        }
      }

      // W_intent backward for each example
      for (let i = 0; i < batch.length; i++) {
        backpropWIntent(dIntentsProjected[i], batch[i].intentEmbedding, grads, config);
      }
    } else {
      // ---- Legacy per-example InfoNCE (fallback) ----
      for (const ex of batch) {
        const intentProjected = math.matVecBlas(W_intent, ex.intentEmbedding);

        // Sample negatives
        const exclude = new Set([ex.targetToolId, ...ex.contextToolIds]);
        const pool = graph.l0Ids.filter(id => !exclude.has(id));
        shuffleInPlace(pool);
        const negIds = pool.slice(0, NUM_NEGATIVES);
        const candidateIds = [ex.targetToolId, ...negIds];

        // Forward K-head: compute logits for all candidates
        const allLogits: number[] = [];
        const allCaches: Array<{ Q: number[]; K: number[]; dotQK: number }>[] = [];
        const allNodeEmbs: number[][] = [];

        for (const candId of candidateIds) {
          const nodeEmb = enrichedEmbs.get(candId) ?? [];
          allNodeEmbs.push(nodeEmb);
          const { logits, caches } = computeMultiHeadKHeadScoresWithCache(
            intentProjected, nodeEmb, headParams, config);
          let avg = 0;
          for (const l of logits) avg += l;
          allLogits.push(avg / logits.length);
          allCaches.push(caches);
        }

        // Batch accuracy: positive is at index 0, check if it has the max logit
        let maxLogit = -Infinity;
        for (const l of allLogits) if (l > maxLogit) maxLogit = l;
        if (allLogits[0] >= maxLogit) batchCorrect++;

        // InfoNCE loss + gradient (positive at index 0)
        const { loss, gradient: dLogits } = infoNCELossAndGradient(allLogits, 0, tau);
        batchLoss += loss;

        // Backward through each candidate
        const totalDIntentProjected = new Array(ds.embeddingDim).fill(0);

        for (let j = 0; j < candidateIds.length; j++) {
          if (Math.abs(dLogits[j]) < 1e-10) continue;

          const { dIntentProjected, dNodeEmbedding } = backpropMultiHeadKHeadLogit(
            dLogits[j], allCaches[j], intentProjected, allNodeEmbs[j],
            headParams, grads.khead, config,
          );

          for (let d = 0; d < ds.embeddingDim; d++) {
            totalDIntentProjected[d] += dIntentProjected[d];
          }

          // Accumulate dNodeEmbedding into _batchDH or _batchDE depending on node type
          const candId = candidateIds[j];
          const l0Idx = l0IdxMap.get(candId);
          if (l0Idx !== undefined) {
            // L0 candidate: accumulate into dH for E→V backward
            for (let d = 0; d < ds.embeddingDim; d++) {
              _batchDH[l0Idx][d] += dNodeEmbedding[d];
            }
          } else {
            // L1+ candidate: accumulate into dE at the correct level
            for (const [level, ids] of graph.nodeIdsByLevel) {
              const nodeIdx = ids.indexOf(candId);
              if (nodeIdx >= 0) {
                const dELevel = _batchDE.get(level)!;
                for (let d = 0; d < ds.embeddingDim; d++) {
                  dELevel[nodeIdx][d] += dNodeEmbedding[d];
                }
                break;
              }
            }
          }
        }

        // W_intent backward
        backpropWIntent(totalDIntentProjected, ex.intentEmbedding, grads, config);
      }
    }

    // ---- MP backward (full graph, once per batch) ----
    const mpGrads = orchestrator.backwardMultiLevel(
      _batchDE, _batchDH, mpBackwardCache, levelParams,
    );

    // Compute gradient norms BEFORE Adam step
    const batchGN = computeGradNorms(grads);
    epochGradNormSqSum += batchGN.total * batchGN.total;
    epochGradBatches++;

    // ---- Adam step ----
    for (let h = 0; h < NUM_HEADS; h++) {
      adam.step(`W_q_${h}`, headParams[h].W_q, grads.khead.dW_q[h]);
      adam.step(`W_k_${h}`, headParams[h].W_k, grads.khead.dW_k[h]);
    }
    adam.step("W_intent", W_intent, grads.dW_intent);

    // MP params (with reduced LR)
    const savedLr = adam.lr;
    adam.lr = epochLR * MP_LR_SCALE;
    for (const [level, lp] of levelParams) {
      const lg = mpGrads.levelGrads.get(level);
      if (!lg) continue;
      for (let h = 0; h < NUM_HEADS; h++) {
        adam.step(`W_child_L${level}_H${h}`, lp.W_child[h], lg.dW_child[h]);
        adam.step(`W_parent_L${level}_H${h}`, lp.W_parent[h], lg.dW_parent[h]);
      }
      adam.step(`a_up_L${level}`, lp.a_upward, lg.da_upward);
      adam.step(`a_down_L${level}`, lp.a_downward, lg.da_downward);
    }
    adam.lr = savedLr;

    infoLossSum += batchLoss / batch.length;
    infoBatches++;
    epochAccCorrect += batchCorrect;
    epochAccTotal += batch.length;

    // ---- Batch log ----
    const batchAcc = (batchCorrect / batch.length * 100).toFixed(1);
    if ((b + 1) % 10 === 0 || b === numInfoBatches - 1) {
      const mem = (Deno.memoryUsage().rss / 1024 / 1024).toFixed(0);
      Deno.stdout.writeSync(new TextEncoder().encode(
        `\r    [Batch ${b + 1}/${numInfoBatches}] loss=${(batchLoss / batch.length).toFixed(4)} acc=${batchAcc}% |dWq|=${batchGN.wq.toFixed(4)} |dWk|=${batchGN.wk.toFixed(4)} |dWi|=${batchGN.wIntent.toFixed(4)} ${mem}MB`));
    }
  }
  if (numInfoBatches > 0) console.log();

  // ---- KL batches (n8n soft targets) ----
  // Architecture decision: KL path also trains MP weights via dH → E→V backward.
  // n8n data provides ~2000+ examples → sufficient signal for W_child/W_parent.
  // The KL gradient flows: dLogit → K-head backward → dNodeEmbedding → dH → MP backward.
  let klLossSum = 0, klBatches = 0;
  if (klWeight > 0 && ds.n8nTrain.length > 0) {
    const n8nShuffled = [...ds.n8nTrain];
    shuffleInPlace(n8nShuffled);
    // Sub-sample to avoid processing all 35K+ examples (KL per-L0-node scoring is slow)
    const n8nSample = KL_SUBSAMPLE > 0 ? n8nShuffled.slice(0, KL_SUBSAMPLE) : n8nShuffled;
    const numKLBatches = Math.ceil(n8nSample.length / BATCH_SIZE);

    for (let b = 0; b < numKLBatches; b++) {
      const batch = n8nSample.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
      if (batch.length === 0) continue;

      resetMultiLevelKHeadGradients(grads, levelParams, headParams, config);

      // Reuse pre-allocated _batchDH (zeroed) for KL MP backward
      zeroDH(_batchDH);
      let batchKL = 0;

      for (const ex of batch) {
        if (!ex.softTargetSparse || ex.softTargetSparse.length === 0) continue;

        const intentProjected = math.matVecBlas(W_intent, ex.intentEmbedding);

        // Get logits for L0 nodes in softTargetSparse
        const sparseL0Ids: string[] = [];
        const sparseProbs: number[] = [];
        for (const [l0Idx, prob] of ex.softTargetSparse) {
          if (l0Idx >= 0 && l0Idx < ds.leafIds.length) {
            sparseL0Ids.push(ds.leafIds[l0Idx]);
            sparseProbs.push(prob);
          }
        }
        if (sparseL0Ids.length === 0) continue;

        const logits: number[] = [];
        const caches: Array<{ Q: number[]; K: number[]; dotQK: number }>[] = [];
        const nodeEmbs: number[][] = [];

        for (const nodeId of sparseL0Ids) {
          const nodeEmb = enrichedEmbs.get(nodeId) ?? [];
          nodeEmbs.push(nodeEmb);
          const r = computeMultiHeadKHeadScoresWithCache(intentProjected, nodeEmb, headParams, config);
          let avg = 0;
          for (const l of r.logits) avg += l;
          logits.push(avg / r.logits.length);
          caches.push(r.caches);
        }

        // Softmax → model distribution q
        let maxL = -Infinity;
        for (const l of logits) if (l > maxL) maxL = l;
        const expL = logits.map(l => Math.exp((l - maxL) / tau));
        const sumE = expL.reduce((a, b) => a + b, 0);
        const q = expL.map(e => e / sumE);

        // KL divergence loss
        let kl = 0;
        for (let j = 0; j < sparseProbs.length; j++) {
          if (sparseProbs[j] > 1e-8 && q[j] > 1e-8) {
            kl += sparseProbs[j] * Math.log(sparseProbs[j] / q[j]);
          }
        }
        batchKL += kl;

        // KL gradient: dLogit[j] = (q[j] - p[j]) * klWeight / tau
        const totalDIntentProjected = new Array(ds.embeddingDim).fill(0);
        for (let j = 0; j < sparseL0Ids.length; j++) {
          const dLogit = (q[j] - sparseProbs[j]) * klWeight / tau;
          if (Math.abs(dLogit) < 1e-10) continue;

          const { dIntentProjected, dNodeEmbedding } = backpropMultiHeadKHeadLogit(
            dLogit, caches[j], intentProjected, nodeEmbs[j],
            headParams, grads.khead, config,
          );
          for (let d = 0; d < ds.embeddingDim; d++) {
            totalDIntentProjected[d] += dIntentProjected[d];
          }

          // Accumulate dNodeEmbedding into dH for MP backward
          const tIdx = l0IdxMap.get(sparseL0Ids[j]);
          if (tIdx !== undefined) {
            for (let d = 0; d < ds.embeddingDim; d++) {
              _batchDH[tIdx][d] += dNodeEmbedding[d];
            }
          }
        }
        backpropWIntent(totalDIntentProjected, ex.intentEmbedding, grads, config);
      }

      // MP backward for KL path (dH only, no dE since n8n targets are L0 nodes)
      // _emptyDE is pre-allocated and always zeros (never written to in KL path)
      const klMpGrads = orchestrator.backwardMultiLevel(
        _emptyDE, _batchDH, mpBackwardCache, levelParams,
      );

      // Capture KL gradient norms for epoch-level accumulation
      const klGN = computeGradNorms(grads);
      epochGradNormSqSum += klGN.total * klGN.total;
      epochGradBatches++;

      // Adam step: K-head + W_intent + MP (full, including KL contribution)
      for (let h = 0; h < NUM_HEADS; h++) {
        adam.step(`W_q_${h}`, headParams[h].W_q, grads.khead.dW_q[h]);
        adam.step(`W_k_${h}`, headParams[h].W_k, grads.khead.dW_k[h]);
      }
      adam.step("W_intent", W_intent, grads.dW_intent);

      // MP params from KL backward (with reduced LR, same as InfoNCE)
      const klSavedLr = adam.lr;
      adam.lr = epochLR * MP_LR_SCALE;
      for (const [level, lp] of levelParams) {
        const lg = klMpGrads.levelGrads.get(level);
        if (!lg) continue;
        for (let h = 0; h < NUM_HEADS; h++) {
          adam.step(`W_child_L${level}_H${h}`, lp.W_child[h], lg.dW_child[h]);
          adam.step(`W_parent_L${level}_H${h}`, lp.W_parent[h], lg.dW_parent[h]);
        }
        adam.step(`a_up_L${level}`, lp.a_upward, lg.da_upward);
        adam.step(`a_down_L${level}`, lp.a_downward, lg.da_downward);
      }
      adam.lr = klSavedLr;

      klLossSum += batchKL / batch.length;
      klBatches++;

      if ((b + 1) % 20 === 0 || b === numKLBatches - 1) {
        const mem = (Deno.memoryUsage().rss / 1024 / 1024).toFixed(0);
        console.log(`    [KL ${b + 1}/${numKLBatches}] loss=${(klLossSum / klBatches).toFixed(4)} w=${klWeight.toFixed(3)} ${mem}MB`);
      }
    }
  }

  // ---- Epoch summary (enriched) ----
  const infoLoss = infoBatches > 0 ? infoLossSum / infoBatches : 0;
  const klLoss = klBatches > 0 ? klLossSum / klBatches : 0;
  const epochAcc = epochAccTotal > 0 ? (epochAccCorrect / epochAccTotal * 100) : 0;
  const epochGradNorm = epochGradBatches > 0
    ? Math.sqrt(epochGradNormSqSum / epochGradBatches)
    : 0;
  const elapsedMs = Date.now() - t0;
  epochDurationsMs.push(elapsedMs);
  const mem = (Deno.memoryUsage().rss / 1024 / 1024 / 1024).toFixed(1);

  // ETA: average of past epoch durations * remaining epochs
  const avgEpochMs = epochDurationsMs.reduce((a, b) => a + b, 0) / epochDurationsMs.length;
  const remainingEpochs = EPOCHS - (epoch + 1);
  const etaMs = avgEpochMs * remainingEpochs;
  const etaMin = (etaMs / 60000).toFixed(0);

  console.log(
    `Epoch ${epoch + 1}/${EPOCHS} | LR=${epochLR.toFixed(4)} \u03C4=${tau.toFixed(3)} KL_w=${klWeight.toFixed(2)}` +
    ` | loss=${infoLoss.toFixed(3)}` + (klBatches > 0 ? `+kl=${klLoss.toFixed(3)}` : "") +
    ` acc=${epochAcc.toFixed(1)}%` +
    ` | |grad|=${epochGradNorm.toFixed(4)}` +
    ` | MP=${mpMs}ms | ${(elapsedMs / 1000).toFixed(1)}s | ${mem}GB` +
    (remainingEpochs > 0 ? ` | ETA ${etaMin}min` : ""),
  );

  // ---- Eval ----
  const shouldEval = (epoch + 1) % EVAL_EVERY === 0 || epoch === EPOCHS - 1;
  let testHit1 = 0, testHit3 = 0, testHit5 = 0, testMRR = 0;

  if (shouldEval && ds.prodTest.length > 0) {
    const evalT0 = Date.now();
    const testSample = ds.prodTest.slice(0, Math.min(ds.prodTest.length, 500));
    let hit1 = 0, hit3 = 0, hit5 = 0, rr = 0;

    // --- Batched eval: precompute K projections for ALL L0 nodes per head ---
    // AllL0Embs: [numL0 × embDim] matrix
    const numL0 = graph.l0Ids.length;
    const embDim = ds.embeddingDim;
    const AllL0Embs: number[][] = new Array(numL0);
    for (let i = 0; i < numL0; i++) {
      AllL0Embs[i] = enrichedEmbs.get(graph.l0Ids[i]) ?? new Array(embDim).fill(0);
    }
    // K_all_h[h] = W_k[h] @ AllL0Embs^T → [headDim × numL0]
    const AllL0EmbsT = math.transpose(AllL0Embs); // [embDim × numL0]
    const K_all: number[][][] = new Array(config.numHeads);
    for (let h = 0; h < config.numHeads; h++) {
      K_all[h] = math.matmul(headParams[h].W_k, AllL0EmbsT); // [headDim × numL0]
    }

    const scale = 1.0 / Math.sqrt(config.headDim);
    let validCount = 0;

    for (const ex of testSample) {
      const intentProjected = math.matVecBlas(W_intent, ex.intentEmbedding);
      const targetIdx = graph.l0Ids.indexOf(ex.targetToolId);
      if (targetIdx < 0) continue;
      validCount++;

      // Compute Q_h for each head, then dot with all K columns → scores[numL0]
      const scores = new Float64Array(numL0); // accumulates across heads
      for (let h = 0; h < config.numHeads; h++) {
        const Q_h = math.matVecBlas(headParams[h].W_q, intentProjected); // [headDim]
        const K_h = K_all[h]; // [headDim × numL0]
        // scores[i] += Q_h · K_h[:,i] * scale
        for (let i = 0; i < numL0; i++) {
          let dot = 0;
          for (let d = 0; d < config.headDim; d++) {
            dot += Q_h[d] * K_h[d][i];
          }
          scores[i] += dot * scale;
        }
      }
      // Average across heads
      const invHeads = 1.0 / config.numHeads;
      for (let i = 0; i < numL0; i++) scores[i] *= invHeads;

      // Find rank of target
      const targetScore = scores[targetIdx];
      let rank = 1;
      for (let i = 0; i < numL0; i++) {
        if (i !== targetIdx && scores[i] > targetScore) rank++;
      }

      if (rank <= 1) hit1++;
      if (rank <= 3) hit3++;
      if (rank <= 5) hit5++;
      rr += 1 / rank;
    }

    const count = validCount || 1;
    testHit1 = hit1 / count;
    testHit3 = hit3 / count;
    testHit5 = hit5 / count;
    testMRR = rr / count;

    if (testHit1 > bestHit1) { bestHit1 = testHit1; bestEpoch = epoch + 1; }
    if (testMRR > bestMRR) bestMRR = testMRR;

    const evalMs = Date.now() - evalT0;
    console.log(`  [EVAL epoch ${epoch + 1}] Recall@1=${(testHit1 * 100).toFixed(1)}% Recall@3=${(testHit3 * 100).toFixed(1)}% Recall@5=${(testHit5 * 100).toFixed(1)}% MRR=${testMRR.toFixed(3)} (${validCount} exemples test, ${evalMs}ms)`);
    console.log(`  -- Best Recall@1=${(bestHit1 * 100).toFixed(1)}% MRR=${bestMRR.toFixed(3)} (epoch ${bestEpoch})\n`);
  }
}

// ==========================================================================
// Report + Export
// ==========================================================================

const totalMs = Date.now() - trainingStartMs;
console.log("\n" + "=".repeat(60));
console.log("  OB TRAINING REPORT");
console.log("=".repeat(60));
console.log(`  Time:      ${(totalMs / 1000).toFixed(1)}s total (${(totalMs / EPOCHS / 1000).toFixed(1)}s/epoch)`);
console.log(`  Peak RSS:  ${(Deno.memoryUsage().rss / 1024 / 1024).toFixed(0)}MB`);
console.log(`  Best Recall@1: ${(bestHit1 * 100).toFixed(1)}% (epoch ${bestEpoch})`);
console.log(`  Best MRR:   ${bestMRR.toFixed(3)}`);
console.log("=".repeat(60));

// Export trained params
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const exportParams = {
  headParams: headParams.map(hp => ({ W_q: hp.W_q, W_k: hp.W_k, W_v: hp.W_v, a: hp.a })),
  W_intent,
  levelParams: Object.fromEntries(
    Array.from(levelParams.entries()).map(([level, lp]) => [level, {
      W_child: lp.W_child, W_parent: lp.W_parent,
      a_upward: lp.a_upward, a_downward: lp.a_downward,
    }])),
  config: { numHeads: NUM_HEADS, headDim: HEAD_DIM, embeddingDim: ds.embeddingDim, preserveDim: true, maxLevel: graph.maxLevel },
};

const outputPath = resolve(GRU_DATA_DIR, `shgat-params-ob-${runId}.json`);
Deno.writeTextFileSync(outputPath, JSON.stringify(exportParams));
console.log(`\nParams \u2192 ${outputPath}`);

const report = {
  timestamp: new Date().toISOString(),
  mode: "ob-manual-backward",
  config: { EPOCHS, BATCH_SIZE, LEARNING_RATE, LR_WARMUP, TAU_START, TAU_END, NUM_NEGATIVES, SEED, USE_KL, KL_WARMUP, KL_WEIGHT_PLATEAU, MP_LR_SCALE },
  dataset: { nodes: ds.nodes.length, leaves: ds.leafIds.length, embDim: ds.embeddingDim, prodTrain: ds.prodTrain.length, prodTest: ds.prodTest.length, n8nTrain: ds.n8nTrain.length, n8nEval: ds.n8nEval.length },
  results: { bestHit1, bestMRR, bestEpoch, totalTimeSec: +(totalMs / 1000).toFixed(1), peakRssMB: Math.round(Deno.memoryUsage().rss / 1024 / 1024) },
};
const reportPath = resolve(GRU_DATA_DIR, `shgat-training-report-ob-${runId}.json`);
Deno.writeTextFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`Report \u2192 ${reportPath}`);
console.log("\n=== OB Training complete ===");
