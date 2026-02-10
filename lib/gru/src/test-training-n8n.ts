/**
 * CompactInformedGRU — Mixed Training Pipeline (Production + n8n)
 *
 * Combines production traces (focal CE) with n8n augmentation (KL divergence):
 * 1. Load production data (same as test-training.ts)
 * 2. Load n8n soft-target examples from data/n8n-training-examples.json
 * 3. Oversample production examples 3x to prevent distribution shift
 * 4. Mixed training: prod (focal CE) + n8n (KL div, weight 0.3)
 * 5. Evaluate on production test set only (ground truth)
 *
 * Usage: npx tsx src/test-training-n8n.ts
 */

import "dotenv/config";
import postgres from "postgres";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { initTensorFlow, logMemory } from "./tf/backend.ts";
import { CompactInformedGRU } from "./transition/gru-model.ts";
import { computeJaccardMatrix, computeBigramMatrix } from "./transition/structural-bias.ts";
import type { TransitionExample, ToolCapabilityMap } from "./transition/types.ts";
import { buildDAGAwareExamples, generateKFolds, formatKFoldMetric } from "./training-utils.ts";
import type { TaskResultWithLayer } from "./training-utils.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const N8N_DATA_PATH = resolve(__dirname, "../data/n8n-training-examples.json");

// ---------------------------------------------------------------------------
// Helpers (same as test-training.ts)
// ---------------------------------------------------------------------------

function parseEmbedding(embStr: string): number[] | null {
  if (!embStr) return null;
  if (embStr.startsWith("[")) return JSON.parse(embStr);
  return embStr.replace(/^\[|\]$/g, "").split(",").map(Number);
}

// Seeded PRNG (mulberry32) for reproducible train/test splits
function seededRng(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const SPLIT_SEED = parseInt(process.argv.find((a) => a.startsWith("--seed="))?.slice(7) ?? "42", 10);
const rng = seededRng(SPLIT_SEED);

function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function embedHash(emb: number[]): string {
  return emb.slice(0, 8).map((v) => v.toFixed(4)).join(",");
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const PROD_OVERSAMPLE = parseInt(process.argv.find((a) => a.startsWith("--oversample="))?.slice(13) ?? "3", 10);
const EPOCHS = parseInt(process.argv.find((a) => a.startsWith("--epochs="))?.slice(9) ?? "30", 10);
const N8N_LOSS_WEIGHT = parseFloat(process.argv.find((a) => a.startsWith("--n8n-weight="))?.slice(13) ?? "0.3");

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    "[GRU] DATABASE_URL environment variable is required. " +
    "Set it in .env or export it before running this script.",
  );
}

console.log("[GRU] CompactInformedGRU — Mixed Training (Prod + n8n)\n");
console.log(`      Prod oversample: ${PROD_OVERSAMPLE}x, Epochs: ${EPOCHS}`);

// Initialize TensorFlow.js
console.log("\n[TF] Initializing TensorFlow.js...");
const backend = await initTensorFlow();
console.log(`     Backend: ${backend}`);

// Connect to database
const sql = postgres(DATABASE_URL);

// =====================================================================
// PHASE 1: Load production data (identical to test-training.ts)
// =====================================================================

console.log("\n[1/9] Loading tool embeddings...");
const toolRows = await sql`
  SELECT tool_id, embedding::text FROM tool_embedding ORDER BY tool_id
`;
const toolEmbeddings = new Map<string, number[]>();
for (const row of toolRows) {
  const embedding = parseEmbedding(row.embedding);
  if (embedding && embedding.length > 0) toolEmbeddings.set(row.tool_id, embedding);
}
console.log(`      ${toolEmbeddings.size} tool embeddings`);
const embeddingDim = toolEmbeddings.values().next().value?.length || 1024;

console.log("\n[2/9] Loading execution traces...");
const traceRows = await sql`
  SELECT et.id, et.task_results, et.success,
         wp.intent_embedding::text as intent_embedding
  FROM execution_trace et
  JOIN workflow_pattern wp ON et.capability_id = wp.pattern_id
  WHERE et.task_results IS NOT NULL
    AND jsonb_array_length(et.task_results) >= 1
    AND wp.intent_embedding IS NOT NULL
  ORDER BY et.executed_at DESC
`;
console.log(`      ${traceRows.length} traces`);

console.log("\n[3/9] Building tool-to-capability matrix...");
const capRows = await sql`
  SELECT DISTINCT et.capability_id,
         jsonb_array_elements(et.task_results)->>'tool' as tool_id
  FROM execution_trace et
  WHERE et.task_results IS NOT NULL
`;

const capSet = new Set<string>();
const toolCapPairs: Array<{ capId: string; toolId: string }> = [];
for (const row of capRows) {
  if (row.tool_id && toolEmbeddings.has(row.tool_id)) {
    capSet.add(row.capability_id);
    toolCapPairs.push({ capId: row.capability_id, toolId: row.tool_id });
  }
}

const capIds = [...capSet].sort();
const capToIndex = new Map<string, number>();
capIds.forEach((c, i) => capToIndex.set(c, i));
const numCaps = capIds.length;
const numToolsForMatrix = toolEmbeddings.size;
const toolIdsOrdered = [...toolEmbeddings.keys()];
const matrixToolIndex = new Map<string, number>();
toolIdsOrdered.forEach((t, i) => matrixToolIndex.set(t, i));

const capMatrix = new Float32Array(numToolsForMatrix * numCaps);
for (const { capId, toolId } of toolCapPairs) {
  const tIdx = matrixToolIndex.get(toolId);
  const cIdx = capToIndex.get(capId);
  if (tIdx !== undefined && cIdx !== undefined) capMatrix[tIdx * numCaps + cIdx] = 1;
}
const toolCapMap: ToolCapabilityMap = { matrix: capMatrix, numTools: numToolsForMatrix, numCapabilities: numCaps };

console.log("\n[4/9] Computing structural bias...");
const jaccardMatrix = computeJaccardMatrix(toolCapMap);
const allTraces: string[][] = [];
for (const trace of traceRows) {
  const taskResults = trace.task_results as Array<{ tool?: string }>;
  const toolSeq = taskResults.map((t) => t.tool).filter((t): t is string => !!t && toolEmbeddings.has(t));
  if (toolSeq.length >= 2) allTraces.push(toolSeq);
}
const bigramMatrix = computeBigramMatrix(allTraces, matrixToolIndex, numToolsForMatrix);

console.log("\n[5/9] Generating production TransitionExamples (DAG-aware)...");
const prodExamples: (TransitionExample & { _traceId: string })[] = [];
const singleToolSeen = new Set<string>();
let singleToolCount = 0, multiToolCount = 0;
let dagAwareCount = 0, linearFallbackCount = 0;

const validToolIdSet = new Set(toolEmbeddings.keys());

for (const trace of traceRows) {
  const intentEmbedding = parseEmbedding(trace.intent_embedding);
  if (!intentEmbedding) continue;
  const taskResults = trace.task_results as TaskResultWithLayer[];

  // Use DAG-aware example generation (P0-1 fix)
  const traceResult = buildDAGAwareExamples(
    trace.id, intentEmbedding, taskResults,
    validToolIdSet, singleToolSeen, embedHash,
  );

  if (traceResult.isSingleTool) singleToolCount++;
  if (traceResult.isMultiTool) {
    multiToolCount++;
    const hasLayers = taskResults.some((t: TaskResultWithLayer) =>
      (t.layer_index ?? t.layerIndex ?? -1) >= 0);
    if (hasLayers) dagAwareCount++;
    else linearFallbackCount++;
  }
  prodExamples.push(...traceResult.examples);
}
console.log(`      Prod: ${prodExamples.length} examples (${singleToolCount} single, ${multiToolCount} multi-tool)`);
console.log(`      DAG-aware context: ${dagAwareCount} traces, linear fallback: ${linearFallbackCount} traces`);

// Split prod into train/test BY TRACE (not by example) to avoid contamination
// This ensures all examples from a given trace are in the same split
const uniqueTraceIds = [...new Set(prodExamples.map((ex) => ex._traceId))];
shuffle(uniqueTraceIds);
const traceSplitIdx = Math.floor(uniqueTraceIds.length * 0.8);
const trainTraceIds = new Set(uniqueTraceIds.slice(0, traceSplitIdx));
const testTraceIds = new Set(uniqueTraceIds.slice(traceSplitIdx));

const prodTrain = prodExamples.filter((ex) => trainTraceIds.has(ex._traceId));
const prodTest = prodExamples.filter((ex) => testTraceIds.has(ex._traceId));
console.log(`      Prod train: ${prodTrain.length}, Prod test: ${prodTest.length} (${trainTraceIds.size}/${testTraceIds.size} traces)`);

// =====================================================================
// PHASE 2: Load n8n augmentation data
// =====================================================================

console.log("\n[6/9] Loading n8n augmentation data...");

let n8nExamples: TransitionExample[] = [];

if (!existsSync(N8N_DATA_PATH)) {
  console.warn(`      WARNING: n8n data not found at ${N8N_DATA_PATH}`);
  console.warn(`      Run 'npm run n8n:pipeline' first. Continuing with production-only training.`);
} else {
  const n8nData = JSON.parse(readFileSync(N8N_DATA_PATH, "utf-8")) as {
    mcpToolIds: string[];
    examples: Array<{
      intentEmbedding: number[];
      contextToolIds: string[];
      targetToolId: string;
      isTerminal: number;
      isSingleTool: boolean;
      softTargetProbs: number[];
    }>;
  };

  // Remap soft target probs from n8n tool ordering to model's tool ordering
  const n8nToolIds = n8nData.mcpToolIds;
  const n8nToModelIdx = new Map<number, number>();
  for (let i = 0; i < n8nToolIds.length; i++) {
    const modelIdx = matrixToolIndex.get(n8nToolIds[i]);
    if (modelIdx !== undefined) n8nToModelIdx.set(i, modelIdx);
  }

  for (const ex of n8nData.examples) {
    // Filter: only keep examples where target and context tools exist in our vocabulary
    if (!toolEmbeddings.has(ex.targetToolId)) continue;
    if (ex.contextToolIds.some((id) => !toolEmbeddings.has(id))) continue;

    // Remap softTargetProbs to model's tool ordering
    const remappedProbs = new Array(numToolsForMatrix).fill(0);
    let total = 0;
    for (let i = 0; i < ex.softTargetProbs.length; i++) {
      const modelIdx = n8nToModelIdx.get(i);
      if (modelIdx !== undefined) {
        remappedProbs[modelIdx] = ex.softTargetProbs[i];
        total += ex.softTargetProbs[i];
      }
    }
    // Re-normalize (some probability mass may have been lost)
    if (total > 0) {
      for (let i = 0; i < remappedProbs.length; i++) remappedProbs[i] /= total;
    }

    n8nExamples.push({
      intentEmbedding: ex.intentEmbedding,
      contextToolIds: ex.contextToolIds,
      targetToolId: ex.targetToolId,
      isTerminal: ex.isTerminal,
      isSingleTool: false,
      softTargetProbs: remappedProbs,
    });
  }

  console.log(`      n8n examples loaded: ${n8nExamples.length} (from ${n8nData.examples.length} raw)`);
}

// =====================================================================
// PHASE 3: Create mixed training set
// =====================================================================

console.log("\n[7/9] Building mixed training set...");

// Oversample production
const oversampledProd: TransitionExample[] = [];
for (let r = 0; r < PROD_OVERSAMPLE; r++) {
  oversampledProd.push(...prodTrain);
}
console.log(`      Oversampled prod: ${oversampledProd.length} (${PROD_OVERSAMPLE}x ${prodTrain.length})`);

const mixedTrain = [...oversampledProd, ...n8nExamples];
console.log(`      n8n examples: ${n8nExamples.length}`);
console.log(`      Mixed total: ${mixedTrain.length}`);
console.log(`      Prod/n8n ratio: ${(oversampledProd.length / Math.max(n8nExamples.length, 1)).toFixed(1)}:1`);

await sql.end();

// =====================================================================
// PHASE 4: Model setup + Training
// =====================================================================

console.log("\n[8/9] Creating CompactInformedGRU...");
const model = new CompactInformedGRU({ embeddingDim, n8nLossWeight: N8N_LOSS_WEIGHT });
model.setToolVocabulary(toolEmbeddings, toolCapMap);
model.setStructuralBias({ jaccardMatrix, bigramMatrix, numTools: numToolsForMatrix });
model.summary();

console.log(`\n[Training] ${EPOCHS} epochs, batch_size=32, n8n_weight=${N8N_LOSS_WEIGHT}`);
const BATCH_SIZE = 32;

for (let epoch = 0; epoch < EPOCHS; epoch++) {
  const epochStart = performance.now();
  model.annealTemperature(epoch, EPOCHS);
  const shuffledTrain = shuffle([...mixedTrain]);

  let epochLoss = 0, epochNextToolLoss = 0, epochTermLoss = 0;
  let epochNextAcc = 0, epochTermAcc = 0, batchCount = 0;

  for (let i = 0; i < shuffledTrain.length; i += BATCH_SIZE) {
    const batch = shuffledTrain.slice(i, i + BATCH_SIZE);
    if (batch.length === 0) continue;
    const metrics = model.trainStep(batch);
    epochLoss += metrics.loss;
    epochNextToolLoss += metrics.nextToolLoss;
    epochTermLoss += metrics.terminationLoss;
    epochNextAcc += metrics.nextToolAccuracy;
    epochTermAcc += metrics.terminationAccuracy;
    batchCount++;
  }

  const avgLoss = epochLoss / batchCount;
  const avgNextToolLoss = epochNextToolLoss / batchCount;
  const avgTermLoss = epochTermLoss / batchCount;
  const avgNextAcc = (epochNextAcc / batchCount) * 100;
  const avgTermAcc = (epochTermAcc / batchCount) * 100;
  const epochTime = (performance.now() - epochStart) / 1000;

  console.log(
    `  Epoch ${String(epoch + 1).padStart(2)}/${EPOCHS}: ` +
    `loss=${avgLoss.toFixed(4)} (nextTool=${avgNextToolLoss.toFixed(4)}, term=${avgTermLoss.toFixed(4)}), ` +
    `nextAcc=${avgNextAcc.toFixed(1)}%, ` +
    `termAcc=${avgTermAcc.toFixed(1)}%, T=${model.getTemperature().toFixed(4)}, ` +
    `time=${epochTime.toFixed(1)}s`,
  );
}

// =====================================================================
// PHASE 5: Evaluate on PRODUCTION test set only
// =====================================================================

console.log("\n[9/9] Evaluating on production test set...");
let correctNext = 0, correctTerm = 0, nextTotal = 0;

for (const ex of prodTest) {
  const pred = model.predictNext(ex.intentEmbedding, ex.contextToolIds);
  if (!ex.isSingleTool) {
    nextTotal++;
    if (pred.toolId === ex.targetToolId) correctNext++;
  }
  if ((pred.shouldTerminate ? 1 : 0) === ex.isTerminal) correctTerm++;
}

const testNextAcc = nextTotal > 0 ? (correctNext / nextTotal) * 100 : 0;
const testTermAcc = (correctTerm / prodTest.length) * 100;

console.log(`      Next tool accuracy: ${testNextAcc.toFixed(1)}% (${correctNext}/${nextTotal})`);
console.log(`      Termination accuracy: ${testTermAcc.toFixed(1)}% (${correctTerm}/${prodTest.length})`);

// Path evaluation: greedy vs beam (using test-set traces only, no DB reconnection)
console.log("\n      Path building — Greedy vs Beam(3) [test set only]:");

// Filter traceRows already in memory: multi-tool traces from test set only
// No need to check trainTraceIds since trace-level split guarantees no overlap
const testTraceRowsForPath = traceRows.filter((trace) => {
  if (!testTraceIds.has(trace.id)) return false;
  const taskResults = trace.task_results as Array<{ tool?: string }>;
  const toolSeq = taskResults.map((t) => t.tool).filter((t): t is string => !!t && toolEmbeddings.has(t));
  return toolSeq.length >= 2;
});

let greedyExactMatch = 0, beamExactMatch = 0, beamContainsMatch = 0;
let evalCount = 0;

for (const trace of testTraceRowsForPath) {
  const intentEmb = parseEmbedding(trace.intent_embedding);
  if (!intentEmb) continue;
  const taskResults = trace.task_results as Array<{ tool?: string }>;
  const actualPath = taskResults.map((t) => t.tool).filter((t): t is string => !!t && toolEmbeddings.has(t));
  if (actualPath.length < 2) continue;

  const greedyPath = model.buildPath(intentEmb, actualPath[0]);
  const beamResults = model.buildPathBeam(intentEmb, actualPath[0], 3);
  const actualStr = actualPath.join(" -> ");
  evalCount++;

  if (greedyPath.join(" -> ") === actualStr) greedyExactMatch++;

  for (const beam of beamResults) {
    if (beam.path.join(" -> ") === actualStr) { beamExactMatch++; break; }
  }
  for (const beam of beamResults) {
    const beamSet = new Set(beam.path);
    if (actualPath.every((t) => beamSet.has(t)) && beam.path.length === actualPath.length) { beamContainsMatch++; break; }
  }

  if (evalCount <= 5) {
    console.log(`\n      [${evalCount}] Actual: [${actualStr}]`);
    console.log(`          Greedy: [${greedyPath.join(" -> ")}]`);
    for (let b = 0; b < Math.min(beamResults.length, 3); b++) {
      console.log(`          Beam[${b}]: [${beamResults[b].path.join(" -> ")}] (score: ${beamResults[b].score.toExponential(2)})`);
    }
  }
}

console.log(`\n      === Path Evaluation (${evalCount} test-only traces) ===`);
console.log(`      Greedy exact match:  ${greedyExactMatch}/${evalCount} (${evalCount > 0 ? (greedyExactMatch / evalCount * 100).toFixed(1) : "0.0"}%)`);
console.log(`      Beam@3 exact match:  ${beamExactMatch}/${evalCount} (${evalCount > 0 ? (beamExactMatch / evalCount * 100).toFixed(1) : "0.0"}%)`);
console.log(`      Beam@3 tools match:  ${beamContainsMatch}/${evalCount} (${evalCount > 0 ? (beamContainsMatch / evalCount * 100).toFixed(1) : "0.0"}%)`);

// --- K-fold Cross-Validation (P0-2) ---
const K_FOLDS = parseInt(process.argv.find((a) => a.startsWith("--kfolds="))?.slice(9) ?? "5", 10);
const RUN_KFOLD = !process.argv.includes("--no-kfold");

if (RUN_KFOLD && K_FOLDS >= 2) {
  console.log(`\n=== K-FOLD CROSS-VALIDATION (K=${K_FOLDS}, seed=${SPLIT_SEED}) ===`);

  const folds = generateKFolds(uniqueTraceIds, K_FOLDS, shuffle);

  const foldNextAcc: number[] = [];
  const foldTermAcc: number[] = [];
  const foldHit1: number[] = [];
  const foldHit3: number[] = [];
  const foldMRR: number[] = [];

  for (let f = 0; f < folds.length; f++) {
    const fold = folds[f];
    const foldTrain = prodExamples.filter((ex) => fold.trainTraceIds.has(ex._traceId));
    const foldTest = prodExamples.filter((ex) => fold.testTraceIds.has(ex._traceId));

    const foldOversampled: TransitionExample[] = [];
    for (let r = 0; r < PROD_OVERSAMPLE; r++) foldOversampled.push(...foldTrain);
    const foldMixed = [...foldOversampled, ...n8nExamples];

    const foldModel = new CompactInformedGRU({ embeddingDim, n8nLossWeight: N8N_LOSS_WEIGHT });
    foldModel.setToolVocabulary(toolEmbeddings, toolCapMap);
    foldModel.setStructuralBias({ jaccardMatrix, bigramMatrix, numTools: numToolsForMatrix });

    for (let epoch = 0; epoch < EPOCHS; epoch++) {
      foldModel.annealTemperature(epoch, EPOCHS);
      const shuffledFold = shuffle([...foldMixed]);
      for (let i = 0; i < shuffledFold.length; i += BATCH_SIZE) {
        const batch = shuffledFold.slice(i, i + BATCH_SIZE);
        if (batch.length > 0) foldModel.trainStep(batch);
      }
    }

    let correctNext = 0, correctTerm = 0, hit1 = 0, hit3 = 0, mrrSum = 0, nextTotal = 0;
    for (const ex of foldTest) {
      const pred = foldModel.predictNextTopK(ex.intentEmbedding, ex.contextToolIds, 10);
      if (!ex.isSingleTool) {
        nextTotal++;
        const rank = pred.ranked.findIndex(r => r.toolId === ex.targetToolId);
        if (rank === 0) { hit1++; correctNext++; }
        if (rank >= 0 && rank < 3) hit3++;
        if (rank >= 0) mrrSum += 1 / (rank + 1);
      }
      if ((pred.shouldTerminate ? 1 : 0) === ex.isTerminal) correctTerm++;
    }

    const nextAccVal = nextTotal > 0 ? (correctNext / nextTotal) * 100 : 0;
    const termAccVal = (correctTerm / foldTest.length) * 100;
    const hit1Val = nextTotal > 0 ? (hit1 / nextTotal) * 100 : 0;
    const hit3Val = nextTotal > 0 ? (hit3 / nextTotal) * 100 : 0;
    const mrrVal = nextTotal > 0 ? mrrSum / nextTotal : 0;

    foldNextAcc.push(nextAccVal);
    foldTermAcc.push(termAccVal);
    foldHit1.push(hit1Val);
    foldHit3.push(hit3Val);
    foldMRR.push(mrrVal);

    console.log(
      `  Fold ${f + 1}/${K_FOLDS}: nextAcc=${nextAccVal.toFixed(1)}%, termAcc=${termAccVal.toFixed(1)}%, ` +
      `Hit@1=${hit1Val.toFixed(1)}%, Hit@3=${hit3Val.toFixed(1)}%, MRR=${mrrVal.toFixed(3)} ` +
      `(${fold.trainTraceIds.size}/${fold.testTraceIds.size} traces)`
    );

    foldModel.dispose();
  }

  console.log(`\n  --- K-Fold Summary (K=${K_FOLDS}) ---`);
  console.log(`  ${formatKFoldMetric("Next-tool acc", foldNextAcc)}`);
  console.log(`  ${formatKFoldMetric("Termination acc", foldTermAcc)}`);
  console.log(`  ${formatKFoldMetric("Hit@1", foldHit1)}`);
  console.log(`  ${formatKFoldMetric("Hit@3", foldHit3)}`);
  console.log(`  ${formatKFoldMetric("MRR", foldMRR, "")}`);
}

console.log("\n[Done] Mixed training complete!");
logMemory("Final ");
model.dispose();
