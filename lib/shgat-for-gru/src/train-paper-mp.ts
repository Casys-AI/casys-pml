/**
 * PaperMP Training — InfoNCE contrastive on enriched embeddings
 *
 * Trains the 2 projection matrices (W, W1) of PaperMP via InfoNCE loss.
 * All embeddings (tools, caps) are FROZEN. Only W, W1 are updated.
 *
 * Training loop (per epoch):
 *   1. enrichWithCache() → forward MP on full graph
 *   2. For each batch: InfoNCE all-vs-all → accumulate dH
 *   3. backward(cache, dH) → dW, dW1
 *   4. Adam update (with warmup + cosine decay) → setParams(W_new, W1_new)
 *   5. Eval R@1 on test split → early stopping
 *
 * Standalone usage:
 *   source .env && node --import tsx lib/shgat-for-gru/src/train-paper-mp.ts \
 *     --epochs 10 --lr 0.001 --batch-size 32 --temperature 0.07 \
 *     --alpha 0.9 --proj-dim 256 --seed 42 \
 *     --output lib/gru/data/paper-mp-params.json
 *
 * @module shgat-for-gru/train-paper-mp
 */

import type { PaperMP } from "./paper-mp.ts";

// ==========================================================================
// Types
// ==========================================================================

export interface TrainConfig {
  epochs: number;
  lr: number;
  batchSize: number;
  temperature: number;
  patience: number;
  seed: number;
  /** Number of warmup epochs with linear LR ramp (default: 0 = flat) */
  warmupEpochs?: number;
  /** Use cosine decay after warmup (default: false = flat) */
  cosineDecay?: boolean;
}

export interface TrainExample {
  intentEmbedding: number[];
  targetToolIdx: number;
}

export interface TrainResult {
  bestW: number[][];
  bestW1: number[][];
  bestR1: number;
  bestMRR: number;
  bestEpoch: number;
  history: { epoch: number; r1: number; mrr: number; loss: number; lr: number; timeMs: number }[];
}

// ==========================================================================
// PRNG (mulberry32 — same as paper-mp.ts)
// ==========================================================================

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ==========================================================================
// L2 normalize
// ==========================================================================

function l2Normalize(v: number[]): number[] {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) + 1e-10;
  const out = new Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

function l2Norm(v: number[]): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s) + 1e-10;
}

// ==========================================================================
// LR schedule: linear warmup + cosine decay
// ==========================================================================

function getLR(epoch: number, config: TrainConfig): number {
  const warmup = config.warmupEpochs ?? 0;
  const baseLR = config.lr;

  if (warmup > 0 && epoch < warmup) {
    // Linear warmup: 0 → baseLR over warmupEpochs
    return baseLR * ((epoch + 1) / warmup);
  }

  if (config.cosineDecay) {
    const decayEpochs = config.epochs - warmup;
    const decayStep = epoch - warmup;
    // Cosine decay: baseLR → 0
    return baseLR * 0.5 * (1 + Math.cos(Math.PI * decayStep / decayEpochs));
  }

  return baseLR;
}

// ==========================================================================
// Adam optimizer (inline, for 2D matrices)
// ==========================================================================

interface AdamState {
  m: number[][];
  v: number[][];
  t: number;
}

function createAdamState(rows: number, cols: number): AdamState {
  return {
    m: Array.from({ length: rows }, () => new Array(cols).fill(0)),
    v: Array.from({ length: rows }, () => new Array(cols).fill(0)),
    t: 0,
  };
}

function adamUpdate(
  params: number[][],
  grads: number[][],
  state: AdamState,
  lr: number,
  beta1 = 0.9,
  beta2 = 0.999,
  eps = 1e-8,
): void {
  state.t++;
  const bc1 = 1 - Math.pow(beta1, state.t);
  const bc2 = 1 - Math.pow(beta2, state.t);

  for (let i = 0; i < params.length; i++) {
    for (let j = 0; j < params[i].length; j++) {
      const g = grads[i][j];
      state.m[i][j] = beta1 * state.m[i][j] + (1 - beta1) * g;
      state.v[i][j] = beta2 * state.v[i][j] + (1 - beta2) * g * g;
      const mHat = state.m[i][j] / bc1;
      const vHat = state.v[i][j] / bc2;
      params[i][j] -= lr * mHat / (Math.sqrt(vHat) + eps);
    }
  }
}

// ==========================================================================
// InfoNCE all-vs-all + dH accumulation
// ==========================================================================

/**
 * Compute InfoNCE loss for a batch and accumulate dH gradients.
 *
 * For each example (intent, targetIdx):
 *   logits[j] = dot(intent_norm, enriched_norm[j]) / temperature  for all j
 *   loss += -log(softmax(logits)[targetIdx])
 *   dH[j] += gradient through cosine normalization
 */
function batchInfoNCE(
  batch: TrainExample[],
  enrichedNorm: number[][],  // [numTools, D] — pre-normalized
  _enrichedRaw: number[][],  // [numTools, D] — un-normalized (kept for API compat)
  enrichedNorms: number[],   // [numTools] — L2 norms of raw enriched
  temperature: number,
  dH: number[][],            // [numTools, D] — accumulated gradient (mutated)
): { loss: number; correct: number } {
  const numTools = enrichedNorm.length;
  const D = enrichedNorm[0].length;
  let totalLoss = 0;
  let correct = 0;

  for (const ex of batch) {
    const intentNorm = l2Normalize(ex.intentEmbedding);
    const targetIdx = ex.targetToolIdx;

    // Compute logits: dot(intent_norm, enriched_norm[j]) / T
    const logits = new Float64Array(numTools);
    let maxLogit = -Infinity;
    for (let j = 0; j < numTools; j++) {
      let d = 0;
      for (let k = 0; k < D; k++) d += intentNorm[k] * enrichedNorm[j][k];
      logits[j] = d / temperature;
      if (logits[j] > maxLogit) maxLogit = logits[j];
    }

    // Softmax
    let sumExp = 0;
    for (let j = 0; j < numTools; j++) sumExp += Math.exp(logits[j] - maxLogit);
    const logSumExp = maxLogit + Math.log(sumExp);

    totalLoss -= logits[targetIdx] - logSumExp;

    // Check top-1
    let bestJ = 0;
    for (let j = 1; j < numTools; j++) {
      if (logits[j] > logits[bestJ]) bestJ = j;
    }
    if (bestJ === targetIdx) correct++;

    // dLogits = softmax - one_hot(target)
    // dEnriched[j] = dLogits[j]/T * d/d(enriched[j]) cosine(intent, enriched[j])
    // d/d(x) cosine(a, x) = (a_norm - cos * x_norm) / |x|
    for (let j = 0; j < numTools; j++) {
      const prob = Math.exp(logits[j] - logSumExp);
      const dLogit = (prob - (j === targetIdx ? 1 : 0)) / temperature;

      if (Math.abs(dLogit) < 1e-8) continue;

      // Cosine gradient: d/d(enriched[j]) = (intent_norm - sim * enriched_norm[j]) / |enriched[j]|
      const sim = logits[j] * temperature; // un-scale to get raw cosine
      const invNorm = 1.0 / enrichedNorms[j];
      for (let k = 0; k < D; k++) {
        dH[j][k] += dLogit * (intentNorm[k] - sim * enrichedNorm[j][k]) * invNorm;
      }
    }
  }

  return { loss: totalLoss / batch.length, correct };
}

// ==========================================================================
// Evaluation
// ==========================================================================

function evaluate(
  examples: TrainExample[],
  enrichedNorm: number[][],
  numTools: number,
): { r1: number; r3: number; r5: number; mrr: number } {
  const D = enrichedNorm[0].length;
  let r1 = 0, r3 = 0, r5 = 0, mrrSum = 0;

  for (const ex of examples) {
    const intentNorm = l2Normalize(ex.intentEmbedding);
    const target = ex.targetToolIdx;

    // Compute all cosine sims
    const sims = new Float64Array(numTools);
    for (let j = 0; j < numTools; j++) {
      let d = 0;
      for (let k = 0; k < D; k++) d += intentNorm[k] * enrichedNorm[j][k];
      sims[j] = d;
    }

    // Rank
    let rank = 1;
    const targetSim = sims[target];
    for (let j = 0; j < numTools; j++) {
      if (j !== target && sims[j] > targetSim) rank++;
    }

    if (rank === 1) r1++;
    if (rank <= 3) r3++;
    if (rank <= 5) r5++;
    mrrSum += 1 / rank;
  }

  const n = examples.length;
  return {
    r1: (r1 / n) * 100,
    r3: (r3 / n) * 100,
    r5: (r5 / n) * 100,
    mrr: mrrSum / n,
  };
}

// ==========================================================================
// Main training function (used by benchmark-e2e.ts + standalone)
// ==========================================================================

export function trainPaperMP(
  mp: PaperMP,
  toolIds: string[],
  trainExamples: TrainExample[],
  testExamples: TrainExample[],
  config: TrainConfig,
): TrainResult {
  const numTools = toolIds.length;
  const { epochs, batchSize, temperature, patience, seed } = config;
  const rng = mulberry32(seed);

  console.log(`\n[PaperMP Training] ${mp.getParamCount()} params, ${trainExamples.length} train, ${testExamples.length} test`);
  console.log(`  Config: epochs=${epochs}, lr=${config.lr}, batch=${batchSize}, T=${temperature}, patience=${patience}`);
  console.log(`  Alpha: ${mp.getConfig().residualAlpha} (residual), projDim=${mp.getConfig().projDim}`);
  if (config.warmupEpochs) console.log(`  LR schedule: warmup=${config.warmupEpochs} epochs, cosineDecay=${!!config.cosineDecay}`);

  // Initialize Adam states
  const { projDim, embDim } = mp.getConfig();
  const adamW = createAdamState(projDim, embDim);
  const adamW1 = createAdamState(projDim, embDim);

  let bestR1 = -1;
  let bestMRR = -1;
  let bestW: number[][] = [];
  let bestW1: number[][] = [];
  let bestEpoch = -1;
  let patienceCounter = 0;
  const history: TrainResult["history"] = [];

  for (let epoch = 0; epoch < epochs; epoch++) {
    const t0 = Date.now();
    const epochLR = getLR(epoch, config);

    // 1. Forward: enrich all tool embeddings
    const { enriched, cache } = mp.enrichWithCache();
    const enrichedMap = enriched.l0Embeddings;

    // Build enriched arrays (indexed by tool position)
    const enrichedRaw: number[][] = new Array(numTools);
    const enrichedNorm: number[][] = new Array(numTools);
    const enrichedNorms: number[] = new Array(numTools);
    for (let i = 0; i < numTools; i++) {
      const emb = enrichedMap.get(toolIds[i]);
      if (!emb) throw new Error(`[PaperMP Training] Missing enriched embedding for ${toolIds[i]}`);
      enrichedRaw[i] = emb;
      enrichedNorms[i] = l2Norm(emb);
      enrichedNorm[i] = l2Normalize(emb);
    }

    // 2. Shuffle and batch
    const indices = Array.from({ length: trainExamples.length }, (_, i) => i);
    shuffleInPlace(indices, rng);

    // Initialize dH accumulator
    const dH: number[][] = Array.from({ length: numTools }, () => new Array(embDim).fill(0));

    let epochLoss = 0;
    let epochCorrect = 0;
    let numBatches = 0;

    for (let bStart = 0; bStart < indices.length; bStart += batchSize) {
      const bEnd = Math.min(bStart + batchSize, indices.length);
      const batch: TrainExample[] = [];
      for (let b = bStart; b < bEnd; b++) batch.push(trainExamples[indices[b]]);

      const { loss, correct } = batchInfoNCE(
        batch, enrichedNorm, enrichedRaw, enrichedNorms,
        temperature, dH,
      );
      epochLoss += loss;
      epochCorrect += correct;
      numBatches++;
    }

    // 3. Normalize dH by total number of examples (not batches)
    const scale = 1 / trainExamples.length;
    for (let i = 0; i < numTools; i++) {
      for (let j = 0; j < embDim; j++) dH[i][j] *= scale;
    }

    // 4. Backward through PaperMP
    const dHMap = new Map<string, number[]>();
    for (let i = 0; i < numTools; i++) {
      dHMap.set(toolIds[i], dH[i]);
    }
    const { dW, dW1 } = mp.backward(cache, dHMap);

    // 5. Log gradient norms (no clipping — let Adam handle scaling)
    let dWNorm = 0, dW1Norm = 0;
    for (const row of dW) for (const v of row) dWNorm += v * v;
    for (const row of dW1) for (const v of row) dW1Norm += v * v;
    dWNorm = Math.sqrt(dWNorm);
    dW1Norm = Math.sqrt(dW1Norm);
    if (epoch === 0) {
      console.log(`  Grad norms: ||dW||=${dWNorm.toFixed(4)}, ||dW1||=${dW1Norm.toFixed(4)}`);
    }

    // 6. Adam update with scheduled LR
    const params = mp.exportParams();
    adamUpdate(params.W, dW, adamW, epochLR);
    adamUpdate(params.W1, dW1, adamW1, epochLR);
    mp.setParams(params.W, params.W1);

    // 7. Eval on test set (need fresh enrichment with updated params)
    const enrichedEval = mp.enrichWithCache().enriched.l0Embeddings;
    const evalNorm: number[][] = new Array(numTools);
    for (let i = 0; i < numTools; i++) {
      evalNorm[i] = l2Normalize(enrichedEval.get(toolIds[i])!);
    }
    const evalResult = evaluate(testExamples, evalNorm, numTools);

    const timeMs = Date.now() - t0;
    const avgLoss = epochLoss / numBatches;
    const trainAcc = ((epochCorrect / trainExamples.length) * 100).toFixed(1);

    history.push({ epoch: epoch + 1, r1: evalResult.r1, mrr: evalResult.mrr, loss: avgLoss, lr: epochLR, timeMs });

    const isBest = evalResult.r1 > bestR1 || (evalResult.r1 === bestR1 && evalResult.mrr > bestMRR);
    if (isBest) {
      bestR1 = evalResult.r1;
      bestMRR = evalResult.mrr;
      bestEpoch = epoch + 1;
      bestW = mp.exportParams().W;
      bestW1 = mp.exportParams().W1;
      patienceCounter = 0;
    } else {
      patienceCounter++;
    }

    console.log(
      `  Epoch ${(epoch + 1).toString().padStart(2)}/${epochs}` +
      `  lr=${epochLR.toFixed(5)}  loss=${avgLoss.toFixed(4)}  trainAcc=${trainAcc}%` +
      `  R@1=${evalResult.r1.toFixed(1)}%  R@3=${evalResult.r3.toFixed(1)}%  MRR=${evalResult.mrr.toFixed(3)}` +
      `  ${isBest ? "★ BEST" : ""}  ${(timeMs / 1000).toFixed(1)}s`,
    );

    if (patienceCounter >= patience) {
      console.log(`  Early stopping: no improvement for ${patience} epochs`);
      break;
    }
  }

  // Restore best params
  if (bestW.length > 0) {
    mp.setParams(bestW, bestW1);
  }

  console.log(`\n[PaperMP Training] Best: R@1=${bestR1.toFixed(1)}% MRR=${bestMRR.toFixed(3)} (epoch ${bestEpoch})`);
  return { bestW, bestW1, bestR1, bestMRR, bestEpoch, history };
}

// ==========================================================================
// Standalone CLI — data loading, graph building, training
// ==========================================================================

async function main() {
  const { existsSync, readFileSync, writeFileSync } = await import("node:fs");
  const { resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { parseArgs } = await import("node:util");
  const dotenv = await import("dotenv");
  const postgres = (await import("postgres")).default;
  const { PaperMP } = await import("./paper-mp.ts");
  const { buildCooccurrenceFromWorkflows, v2vEnrich } = await import("./v2v.ts");

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const GRU_DATA_DIR = resolve(__dirname, "../../gru/data");

  dotenv.config({ path: resolve(__dirname, "../../../.env") });

  // --- Parse CLI args ---
  const { values: args } = parseArgs({
    options: {
      epochs: { type: "string", default: "10" },
      lr: { type: "string", default: "0.001" },
      "batch-size": { type: "string", default: "32" },
      temperature: { type: "string", default: "0.07" },
      alpha: { type: "string", default: "0.9" },
      "proj-dim": { type: "string", default: "256" },
      seed: { type: "string", default: "42" },
      patience: { type: "string", default: "3" },
      warmup: { type: "string", default: "2" },
      "n8n-max": { type: "string", default: "5000" },
      "no-n8n": { type: "boolean", default: false },
      "skip-v2v": { type: "boolean", default: false },
      output: { type: "string", default: resolve(GRU_DATA_DIR, "paper-mp-params.json") },
    },
    strict: false,
  });

  const EPOCHS = parseInt(args.epochs!, 10);
  const LR = parseFloat(args.lr!);
  const BATCH_SIZE = parseInt(args["batch-size"]!, 10);
  const TEMPERATURE = parseFloat(args.temperature!);
  const ALPHA = parseFloat(args.alpha!);
  const PROJ_DIM = parseInt(args["proj-dim"]!, 10);
  const SEED = parseInt(args.seed!, 10);
  const PATIENCE = parseInt(args.patience!, 10);
  const WARMUP = parseInt(args.warmup!, 10);
  const N8N_MAX = parseInt(args["n8n-max"]!, 10);
  const NO_N8N = args["no-n8n"]!;
  const SKIP_V2V = args["skip-v2v"]!;
  const OUTPUT_PATH = args.output!;

  const N8N_PAIRS_PATH = resolve(GRU_DATA_DIR, "n8n-shgat-contrastive-pairs.json");
  const EXPANDED_VOCAB_PATH = resolve(GRU_DATA_DIR, "expanded-vocab.json");

  console.log("=".repeat(72));
  console.log("  PaperMP Standalone Training — InfoNCE contrastive");
  console.log("=".repeat(72));
  console.log(`  epochs=${EPOCHS}  lr=${LR}  batch=${BATCH_SIZE}  T=${TEMPERATURE}`);
  console.log(`  alpha=${ALPHA}  projDim=${PROJ_DIM}  seed=${SEED}  patience=${PATIENCE}`);
  console.log(`  warmup=${WARMUP}  n8nMax=${N8N_MAX}  noN8n=${NO_N8N}  skipV2V=${SKIP_V2V}`);
  console.log(`  output=${OUTPUT_PATH}`);
  console.log();

  const DATABASE_URL = process.env.DATABASE_URL ||
    "postgres://casys:Kx9mP2vL7nQ4wRzT@localhost:5432/casys";
  const sql = postgres(DATABASE_URL);

  // --- Step 1: Load tool embeddings ---
  console.log("[1/7] Loading tool embeddings...");
  const toolRows = await sql`
    SELECT tool_id, embedding::text FROM tool_embedding ORDER BY tool_id
  `;
  const rawToolEmbeddings = new Map<string, number[]>();
  const toolIds: string[] = [];
  for (const row of toolRows) {
    const emb = parseEmbedding(row.embedding);
    if (emb && emb.length > 0) {
      rawToolEmbeddings.set(row.tool_id, emb);
      toolIds.push(row.tool_id);
    }
  }
  const embDim = rawToolEmbeddings.values().next().value?.length ?? 1024;
  console.log(`  ${rawToolEmbeddings.size} PML tools, dim=${embDim}`);

  // Load expanded vocab (Smithery)
  if (existsSync(EXPANDED_VOCAB_PATH)) {
    const expandedVocab = JSON.parse(readFileSync(EXPANDED_VOCAB_PATH, "utf-8"));
    const smIds: string[] = expandedVocab.smitheryToolIds;
    const smEmbs: number[][] = expandedVocab.smitheryToolEmbeddings;
    let added = 0;
    for (let i = 0; i < smIds.length; i++) {
      if (!rawToolEmbeddings.has(smIds[i])) {
        rawToolEmbeddings.set(smIds[i], smEmbs[i]);
        toolIds.push(smIds[i]);
        added++;
      }
    }
    console.log(`  + ${added} Smithery tools → ${rawToolEmbeddings.size} total`);
  }

  const toolIdToIdx = new Map<string, number>();
  for (let i = 0; i < toolIds.length; i++) toolIdToIdx.set(toolIds[i], i);

  // --- Step 2: Load capability hierarchy ---
  console.log("\n[2/7] Loading capabilities...");
  const capRows = await sql`
    SELECT pattern_id as cap_id, intent_embedding::text as cap_embedding, hierarchy_level
    FROM workflow_pattern
    WHERE intent_embedding IS NOT NULL
    ORDER BY hierarchy_level, pattern_id
  `;
  const capEmbeddings = new Map<string, number[]>();
  const capIdsByLevel = new Map<number, string[]>();
  let maxLevel = 0;
  for (const row of capRows) {
    const emb = parseEmbedding(row.cap_embedding);
    const level = row.hierarchy_level ?? 0;
    if (emb && emb.length > 0) {
      capEmbeddings.set(row.cap_id, emb);
      if (!capIdsByLevel.has(level)) capIdsByLevel.set(level, []);
      capIdsByLevel.get(level)!.push(row.cap_id);
      maxLevel = Math.max(maxLevel, level);
    }
  }
  console.log(`  ${capEmbeddings.size} capabilities, maxLevel=${maxLevel}`);

  // Cap-to-cap relations
  const capDepRows = await sql`
    SELECT cd.from_capability_id, cd.to_capability_id,
           wp1.hierarchy_level as from_level, wp2.hierarchy_level as to_level
    FROM capability_dependency cd
    JOIN workflow_pattern wp1 ON cd.from_capability_id = wp1.pattern_id
    JOIN workflow_pattern wp2 ON cd.to_capability_id = wp2.pattern_id
    WHERE wp1.intent_embedding IS NOT NULL AND wp2.intent_embedding IS NOT NULL
  `;
  const capToCapChildren = new Map<string, string[]>();
  for (const row of capDepRows) {
    if (row.from_level > row.to_level) {
      if (!capToCapChildren.has(row.from_capability_id))
        capToCapChildren.set(row.from_capability_id, []);
      capToCapChildren.get(row.from_capability_id)!.push(row.to_capability_id);
    }
  }

  // Tool-to-cap from execution traces
  const traceToolCaps = await sql`
    SELECT DISTINCT et.capability_id,
           jsonb_array_elements(et.task_results)->>'tool' as tool_id
    FROM execution_trace et
    WHERE et.task_results IS NOT NULL
      AND jsonb_array_length(et.task_results) > 0
      AND et.capability_id IN (
        SELECT pattern_id FROM workflow_pattern WHERE intent_embedding IS NOT NULL
      )
  `;
  const capToToolChildren = new Map<string, string[]>();
  for (const row of traceToolCaps) {
    if (!toolIdToIdx.has(row.tool_id)) continue;
    const capLevel = capIdsByLevel.get(0)?.includes(row.capability_id) ? 0 : -1;
    if (capLevel !== 0) continue;
    if (!capToToolChildren.has(row.capability_id))
      capToToolChildren.set(row.capability_id, []);
    const children = capToToolChildren.get(row.capability_id)!;
    if (!children.includes(row.tool_id)) children.push(row.tool_id);
  }

  // Also add n8n workflows as L0 capabilities
  let n8nCapsAdded = 0;
  if (!NO_N8N && existsSync(N8N_PAIRS_PATH)) {
    const n8nPairs: Array<{
      intentEmbedding: number[];
      positiveToolIds: string[];
      workflowId: number;
    }> = JSON.parse(readFileSync(N8N_PAIRS_PATH, "utf-8"));
    const scored = n8nPairs
      .map(p => ({ p, validTools: p.positiveToolIds.filter(t => toolIdToIdx.has(t)) }))
      .filter(s => s.validTools.length >= 2)
      .sort((a, b) => b.validTools.length - a.validTools.length);
    for (const { p, validTools } of scored) {
      const capId = `n8n:wf:${p.workflowId}`;
      capEmbeddings.set(capId, p.intentEmbedding);
      if (!capIdsByLevel.has(0)) capIdsByLevel.set(0, []);
      capIdsByLevel.get(0)!.push(capId);
      capToToolChildren.set(capId, validTools);
      n8nCapsAdded++;
    }
    console.log(`  + ${n8nCapsAdded} n8n workflow capabilities`);
  }

  // --- Step 3: V→V co-occurrence enrichment ---
  console.log("\n[3/7] V→V co-occurrence enrichment...");
  const workflowToolLists: string[][] = [];
  if (existsSync(N8N_PAIRS_PATH)) {
    const n8nPairs: Array<{ positiveToolIds: string[] }> = JSON.parse(
      readFileSync(N8N_PAIRS_PATH, "utf-8"),
    );
    for (const pair of n8nPairs) workflowToolLists.push(pair.positiveToolIds);
  }
  for (const [, children] of capToToolChildren) {
    if (children.length >= 2) workflowToolLists.push(children);
  }

  const cooccurrence = buildCooccurrenceFromWorkflows(workflowToolLists, toolIdToIdx);
  console.log(`  ${cooccurrence.length} co-occurrence edges from ${workflowToolLists.length} workflows`);

  const H_raw: number[][] = toolIds.map(id => rawToolEmbeddings.get(id)!);
  const H_v2v = SKIP_V2V ? H_raw : v2vEnrich(H_raw, cooccurrence, { residualWeight: 0.3 });
  if (!SKIP_V2V) {
    let delta = 0;
    for (let i = 0; i < H_raw.length; i++)
      for (let j = 0; j < H_raw[i].length; j++)
        delta += Math.abs(H_v2v[i][j] - H_raw[i][j]);
    console.log(`  V→V avg delta: ${(delta / H_raw.length).toFixed(4)}`);
  }

  // --- Step 4: Build graph & init PaperMP ---
  console.log("\n[4/7] Building graph & initializing PaperMP...");
  const paperMP = new PaperMP({
    embDim,
    projDim: PROJ_DIM,
    residualAlpha: ALPHA,
    activation: "leaky_relu",
    seed: SEED,
  });
  console.log(`  PaperMP: ${paperMP.getParamCount()} params (projDim=${PROJ_DIM}, alpha=${ALPHA})`);

  const graphNodes: Array<{ id: string; embedding: number[]; children: string[]; level: number }> = [];
  for (let i = 0; i < toolIds.length; i++) {
    graphNodes.push({ id: toolIds[i], embedding: H_v2v[i], children: [], level: 0 });
  }
  for (let level = 0; level <= maxLevel; level++) {
    for (const capId of (capIdsByLevel.get(level) || [])) {
      const emb = capEmbeddings.get(capId);
      if (!emb) continue;
      const children = level === 0
        ? (capToToolChildren.get(capId) ?? [])
        : (capToCapChildren.get(capId) ?? []);
      if (children.length === 0) continue;
      graphNodes.push({ id: capId, embedding: emb, children, level });
    }
  }

  const graph = paperMP.buildGraph(graphNodes);
  console.log(`  Graph: ${graph.l0Ids.length} L0, ${
    Array.from(graph.nodeIdsByLevel.entries()).map(([l, ids]) => `L${l}:${ids.length}`).join(", ")
  } higher, maxLevel=${graph.maxLevel}`);

  // --- Step 5: Load training data ---
  console.log("\n[5/7] Loading training data...");
  const rng = mulberry32(SEED);

  // 5a. Prod traces
  const traceRows = await sql`
    SELECT wp.intent_embedding::text as intent_embedding,
           et.task_results, et.id as trace_id
    FROM execution_trace et
    JOIN workflow_pattern wp ON et.capability_id = wp.pattern_id
    WHERE et.task_results IS NOT NULL
      AND jsonb_array_length(et.task_results) >= 1
      AND wp.intent_embedding IS NOT NULL
    ORDER BY et.executed_at DESC
  `;

  const allExamples: (TrainExample & { traceId: string; source: "prod" | "n8n" })[] = [];
  for (const row of traceRows) {
    const intentEmb = parseEmbedding(row.intent_embedding);
    if (!intentEmb || intentEmb.length !== embDim) continue;
    const tasks = row.task_results as Array<{ tool?: string }>;
    for (const task of tasks) {
      if (!task.tool) continue;
      const idx = toolIdToIdx.get(task.tool);
      if (idx === undefined) continue;
      allExamples.push({
        intentEmbedding: intentEmb,
        targetToolIdx: idx,
        traceId: row.trace_id as string,
        source: "prod",
      });
    }
  }
  const prodCount = allExamples.length;
  console.log(`  Prod: ${prodCount} examples from ${traceRows.length} traces`);

  // 5b. N8n hard targets from contrastive pairs
  let n8nCount = 0;
  if (!NO_N8N && existsSync(N8N_PAIRS_PATH)) {
    const n8nPairs: Array<{
      intentEmbedding: number[];
      positiveToolIds: string[];
      workflowId: number;
    }> = JSON.parse(readFileSync(N8N_PAIRS_PATH, "utf-8"));

    // Create one example per (intent, tool) pair
    const n8nExamples: (TrainExample & { traceId: string; source: "n8n" })[] = [];
    for (const pair of n8nPairs) {
      if (!pair.intentEmbedding || pair.intentEmbedding.length !== embDim) continue;
      for (const toolId of pair.positiveToolIds) {
        const idx = toolIdToIdx.get(toolId);
        if (idx === undefined) continue;
        n8nExamples.push({
          intentEmbedding: pair.intentEmbedding,
          targetToolIdx: idx,
          traceId: `n8n:${pair.workflowId}`,
          source: "n8n",
        });
      }
    }

    // Subsample to N8N_MAX
    if (n8nExamples.length > N8N_MAX) {
      shuffleInPlace(n8nExamples, rng);
      n8nExamples.length = N8N_MAX;
    }
    allExamples.push(...n8nExamples);
    n8nCount = n8nExamples.length;
    console.log(`  N8n: ${n8nCount} hard-target examples (from ${n8nPairs.length} workflows, capped at ${N8N_MAX})`);
  }

  console.log(`  Total: ${allExamples.length} examples (${prodCount} prod + ${n8nCount} n8n)`);

  // 5c. Split 80/20 by trace (seeded)
  const traceIds = [...new Set(allExamples.map(ex => ex.traceId))];
  const splitRng = mulberry32(SEED + 7);
  shuffleInPlace(traceIds, splitRng);
  const splitIdx = Math.floor(traceIds.length * 0.8);
  const trainTraceIds = new Set(traceIds.slice(0, splitIdx));

  const trainExamples: TrainExample[] = allExamples.filter(ex => trainTraceIds.has(ex.traceId));
  const testExamples: TrainExample[] = allExamples.filter(ex => !trainTraceIds.has(ex.traceId));

  // Count sources in each split
  const trainProd = trainExamples.filter(ex => (ex as typeof allExamples[0]).source === "prod").length;
  const testProd = testExamples.filter(ex => (ex as typeof allExamples[0]).source === "prod").length;
  console.log(`  Split: ${trainExamples.length} train (${trainProd} prod) / ${testExamples.length} test (${testProd} prod)`);

  // --- Step 6: Train ---
  console.log("\n[6/7] Training PaperMP...");
  const result = trainPaperMP(paperMP, toolIds, trainExamples, testExamples, {
    epochs: EPOCHS,
    lr: LR,
    batchSize: BATCH_SIZE,
    temperature: TEMPERATURE,
    patience: PATIENCE,
    seed: SEED,
    warmupEpochs: WARMUP,
    cosineDecay: true,
  });

  // --- Step 7: Save ---
  console.log("\n[7/7] Saving trained params...");
  writeFileSync(OUTPUT_PATH, JSON.stringify({
    bestW: result.bestW,
    bestW1: result.bestW1,
    bestR1: result.bestR1,
    bestMRR: result.bestMRR,
    bestEpoch: result.bestEpoch,
    config: paperMP.getConfig(),
    history: result.history,
    trainInfo: {
      nProd: prodCount,
      nN8n: n8nCount,
      nTotal: allExamples.length,
      nTrain: trainExamples.length,
      nTest: testExamples.length,
      nTools: toolIds.length,
      nGraphNodes: graphNodes.length,
      args: { epochs: EPOCHS, lr: LR, batchSize: BATCH_SIZE, temperature: TEMPERATURE,
              alpha: ALPHA, projDim: PROJ_DIM, seed: SEED, warmup: WARMUP, n8nMax: N8N_MAX },
    },
  }));

  const fileSizeMB = (readFileSync(OUTPUT_PATH).byteLength / 1024 / 1024).toFixed(1);
  console.log(`  Saved to ${OUTPUT_PATH} (${fileSizeMB} MB)`);
  console.log(`  Best R@1=${result.bestR1.toFixed(1)}% MRR=${result.bestMRR.toFixed(3)} (epoch ${result.bestEpoch})`);

  await sql.end();
  console.log("\nDone.");
}

// ==========================================================================
// Shared helpers
// ==========================================================================

function parseEmbedding(embStr: string): number[] | null {
  if (!embStr) return null;
  if (embStr.startsWith("[")) return JSON.parse(embStr);
  return embStr.replace(/^\[|\]$/g, "").split(",").map(Number);
}

// ==========================================================================
// Standalone entry point
// ==========================================================================

const isStandalone = process.argv[1] &&
  (process.argv[1].endsWith("/train-paper-mp.ts") ||
   process.argv[1].endsWith("\\train-paper-mp.ts"));

if (isStandalone) {
  main().catch((err) => {
    console.error("\n[FATAL]", err);
    process.exit(1);
  });
}
