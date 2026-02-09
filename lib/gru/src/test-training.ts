/**
 * CompactInformedGRU — Training Pipeline
 *
 * Loads data from PostgreSQL and trains the Compact Informed GRU:
 * 1. Load tool embeddings
 * 2. Load execution traces (single-tool + multi-tool)
 * 3. Build tool-to-capability matrix
 * 4. Compute structural bias (Jaccard + bigram)
 * 5. Generate TransitionExamples (with dedup for single-tool)
 * 6. Train with temperature annealing
 * 7. Evaluate on test set
 * 8. Test path building
 *
 * Usage:
 *   Node:  npx tsx src/test-training.ts   (4x faster with tfjs-node)
 *   Deno:  deno run --allow-all src/test-training.ts
 *
 * Environment:
 *   DATABASE_URL - PostgreSQL connection string
 */

import "dotenv/config";
import postgres from "postgres";

import { initTensorFlow, logMemory } from "./tf/backend.ts";
import { CompactInformedGRU } from "./transition/gru-model.ts";
import { computeJaccardMatrix, computeBigramMatrix } from "./transition/structural-bias.ts";
import type { TransitionExample, ToolCapabilityMap } from "./transition/types.ts";

/**
 * Parse embedding from PostgreSQL text format.
 * Handles both JSON arrays and pgvector format.
 */
function parseEmbedding(embStr: string): number[] | null {
  if (!embStr) return null;
  if (embStr.startsWith("[")) {
    return JSON.parse(embStr);
  }
  // pgvector format: remove brackets and split
  const cleaned = embStr.replace(/^\[|\]$/g, "");
  return cleaned.split(",").map(Number);
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

/**
 * Shuffle array in place (Fisher-Yates) with seeded PRNG.
 */
function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Compute a simple hash from the first 8 floats of an embedding.
 * Used for deduplication of single-tool traces by intent.
 */
function embedHash(emb: number[]): string {
  return emb.slice(0, 8).map((v) => v.toFixed(4)).join(",");
}

const DATABASE_URL = process.env.DATABASE_URL ||
  "postgres://casys:Kx9mP2vL7nQ4wRzT@localhost:5432/casys";

console.log("[GRU] CompactInformedGRU Training Pipeline\n");

// Initialize TensorFlow.js
console.log("[TF] Initializing TensorFlow.js...");
const backend = await initTensorFlow();
console.log(`     Backend: ${backend}`);
logMemory("     ");

// Connect to database
console.log("\n[DB] Connecting to database...");
const sql = postgres(DATABASE_URL);

// ---------------------------------------------------------------------------
// 1. Load tool embeddings
// ---------------------------------------------------------------------------
console.log("\n[1/8] Loading tool embeddings...");
const toolRows = await sql`
  SELECT tool_id, embedding::text
  FROM tool_embedding
  ORDER BY tool_id
`;

const toolEmbeddings = new Map<string, number[]>();
for (const row of toolRows) {
  const embedding = parseEmbedding(row.embedding);
  if (embedding && embedding.length > 0) {
    toolEmbeddings.set(row.tool_id, embedding);
  }
}
console.log(`      Loaded ${toolEmbeddings.size} tool embeddings`);

const firstEmb = toolEmbeddings.values().next().value;
const embeddingDim = firstEmb?.length || 1024;
console.log(`      Embedding dimension: ${embeddingDim}`);

// ---------------------------------------------------------------------------
// 2. Load execution traces (single-tool + multi-tool)
// ---------------------------------------------------------------------------
console.log("\n[2/8] Loading execution traces...");
const traceRows = await sql`
  SELECT
    et.id,
    et.task_results,
    et.success,
    wp.intent_embedding::text as intent_embedding
  FROM execution_trace et
  JOIN workflow_pattern wp ON et.capability_id = wp.pattern_id
  WHERE et.task_results IS NOT NULL
    AND jsonb_array_length(et.task_results) >= 1
    AND wp.intent_embedding IS NOT NULL
  ORDER BY et.executed_at DESC
`;

console.log(`      Loaded ${traceRows.length} traces with intent embeddings`);

// ---------------------------------------------------------------------------
// 3. Build tool-to-capability matrix from DB
// ---------------------------------------------------------------------------
console.log("\n[3/8] Building tool-to-capability matrix...");
const capRows = await sql`
  SELECT DISTINCT et.capability_id,
         jsonb_array_elements(et.task_results)->>'tool' as tool_id
  FROM execution_trace et
  WHERE et.task_results IS NOT NULL
`;

// Collect unique capabilities and tools
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

// Build tool index for matrix (same order as toolEmbeddings)
const toolIdsOrdered = [...toolEmbeddings.keys()];
const matrixToolIndex = new Map<string, number>();
toolIdsOrdered.forEach((t, i) => matrixToolIndex.set(t, i));

// Fill binary matrix [numTools, numCaps]
const capMatrix = new Float32Array(numToolsForMatrix * numCaps);
for (const { capId, toolId } of toolCapPairs) {
  const tIdx = matrixToolIndex.get(toolId);
  const cIdx = capToIndex.get(capId);
  if (tIdx !== undefined && cIdx !== undefined) {
    capMatrix[tIdx * numCaps + cIdx] = 1;
  }
}

const toolCapMap: ToolCapabilityMap = {
  matrix: capMatrix,
  numTools: numToolsForMatrix,
  numCapabilities: numCaps,
};

console.log(`      Capabilities: ${numCaps}, Tools: ${numToolsForMatrix}`);
console.log(`      Tool-cap pairs: ${toolCapPairs.length}`);

// ---------------------------------------------------------------------------
// 4. Compute structural bias (Jaccard + bigram)
// ---------------------------------------------------------------------------
console.log("\n[4/8] Computing structural bias matrices...");

const jaccardMatrix = computeJaccardMatrix(toolCapMap);

// Collect all tool sequences for bigram computation
const allTraces: string[][] = [];
for (const trace of traceRows) {
  const taskResults = trace.task_results as Array<{ tool?: string }>;
  const toolSeq = taskResults
    .map((t) => t.tool)
    .filter((t): t is string => !!t && toolEmbeddings.has(t));
  if (toolSeq.length >= 2) {
    allTraces.push(toolSeq);
  }
}

const bigramMatrix = computeBigramMatrix(allTraces, matrixToolIndex, numToolsForMatrix);
console.log(`      Jaccard matrix: ${numToolsForMatrix}x${numToolsForMatrix}`);
console.log(`      Bigram matrix: ${numToolsForMatrix}x${numToolsForMatrix} (from ${allTraces.length} multi-tool traces)`);

// ---------------------------------------------------------------------------
// 5. Generate TransitionExamples (with dedup for single-tool)
// ---------------------------------------------------------------------------
console.log("\n[5/8] Generating TransitionExamples...");
const allExamples: TransitionExample[] = [];

// Dedup set for single-tool traces: key = embedHash + ":" + toolId
const singleToolSeen = new Set<string>();

let singleToolCount = 0;
let multiToolCount = 0;
let singleToolDeduped = 0;

for (const trace of traceRows) {
  const intentEmbedding = parseEmbedding(trace.intent_embedding);
  if (!intentEmbedding) continue;

  const taskResults = trace.task_results as Array<{ tool?: string }>;
  const toolSequence = taskResults
    .map((t) => t.tool)
    .filter((t): t is string => !!t && toolEmbeddings.has(t));

  if (toolSequence.length === 0) continue;

  if (toolSequence.length === 1) {
    // Single-tool trace: dedup by intent hash + tool_id
    const key = embedHash(intentEmbedding) + ":" + toolSequence[0];
    if (singleToolSeen.has(key)) {
      singleToolDeduped++;
      continue;
    }
    singleToolSeen.add(key);

    allExamples.push({
      intentEmbedding,
      contextToolIds: [],
      targetToolId: toolSequence[0],
      isTerminal: 1,
      isSingleTool: true,
      _traceId: trace.id,
    });
    singleToolCount++;
  } else {
    // Multi-tool trace: generate step-by-step examples
    for (let i = 0; i < toolSequence.length; i++) {
      allExamples.push({
        intentEmbedding,
        contextToolIds: toolSequence.slice(0, i),
        targetToolId: toolSequence[i],
        isTerminal: i === toolSequence.length - 1 ? 1 : 0,
        isSingleTool: false,
        _traceId: trace.id,
      });
    }
    multiToolCount++;
  }
}

console.log(`      Single-tool examples: ${singleToolCount} (deduped ${singleToolDeduped})`);
console.log(`      Multi-tool traces: ${multiToolCount}`);
console.log(`      Total examples: ${allExamples.length}`);

// Split train/test BY TRACE (80/20) to avoid contamination
const uniqueTraceIds = [...new Set(allExamples.map((ex) => (ex as any)._traceId as string))];
shuffle(uniqueTraceIds);
const traceSplitIdx = Math.floor(uniqueTraceIds.length * 0.8);
const trainTraceIds = new Set(uniqueTraceIds.slice(0, traceSplitIdx));
const testTraceIds = new Set(uniqueTraceIds.slice(traceSplitIdx));

const trainExamples = allExamples.filter((ex) => trainTraceIds.has((ex as any)._traceId));
const testExamples = allExamples.filter((ex) => testTraceIds.has((ex as any)._traceId));

console.log(`      Train: ${trainExamples.length}, Test: ${testExamples.length} (${trainTraceIds.size}/${testTraceIds.size} traces)`);

// ---------------------------------------------------------------------------
// 6. Create model, set vocabulary, structural bias
// ---------------------------------------------------------------------------
console.log("\n[6/8] Creating CompactInformedGRU...");
const model = new CompactInformedGRU({
  embeddingDim,
});

model.setToolVocabulary(toolEmbeddings, toolCapMap);
model.setStructuralBias({
  jaccardMatrix,
  bigramMatrix,
  numTools: numToolsForMatrix,
});

console.log(`      Vocabulary: ${toolEmbeddings.size} tools, ${numCaps} capabilities`);
model.summary();

// ---------------------------------------------------------------------------
// 7. Training loop with temperature annealing
// ---------------------------------------------------------------------------
console.log("\n[7/8] Training...");
const EPOCHS = 30;
const BATCH_SIZE = 32;

for (let epoch = 0; epoch < EPOCHS; epoch++) {
  const epochStart = performance.now();

  // Anneal temperature at the start of each epoch
  model.annealTemperature(epoch, EPOCHS);

  // Shuffle training data each epoch
  const shuffledTrain = shuffle([...trainExamples]);

  let epochLoss = 0;
  let epochNextAcc = 0;
  let epochTermAcc = 0;
  let batchCount = 0;

  for (let i = 0; i < shuffledTrain.length; i += BATCH_SIZE) {
    const batch = shuffledTrain.slice(i, i + BATCH_SIZE);
    if (batch.length === 0) continue;

    const metrics = model.trainStep(batch);

    epochLoss += metrics.loss;
    epochNextAcc += metrics.nextToolAccuracy;
    epochTermAcc += metrics.terminationAccuracy;
    batchCount++;
  }

  const avgLoss = epochLoss / batchCount;
  const avgNextAcc = (epochNextAcc / batchCount) * 100;
  const avgTermAcc = (epochTermAcc / batchCount) * 100;
  const epochTime = (performance.now() - epochStart) / 1000;

  console.log(
    `      Epoch ${String(epoch + 1).padStart(2)}/${EPOCHS}: ` +
      `loss=${avgLoss.toFixed(4)}, ` +
      `nextAcc=${avgNextAcc.toFixed(1)}%, ` +
      `termAcc=${avgTermAcc.toFixed(1)}%, ` +
      `T=${model.getTemperature().toFixed(4)}, ` +
      `time=${epochTime.toFixed(1)}s`,
  );

  logMemory("      ");
}

// ---------------------------------------------------------------------------
// 8. Evaluation on test set
// ---------------------------------------------------------------------------
console.log("\n[8/8] Evaluating on test set...");
let correctNext = 0;
let correctTerm = 0;
let nextTotal = 0;

for (const ex of testExamples) {
  const pred = model.predictNext(ex.intentEmbedding, ex.contextToolIds);

  // Next-tool accuracy (skip single-tool)
  if (!ex.isSingleTool) {
    nextTotal++;
    if (pred.toolId === ex.targetToolId) correctNext++;
  }
  // Termination accuracy
  if ((pred.shouldTerminate ? 1 : 0) === ex.isTerminal) correctTerm++;
}

const testNextAcc = nextTotal > 0 ? (correctNext / nextTotal) * 100 : 0;
const testTermAcc = (correctTerm / testExamples.length) * 100;

console.log(`      Next tool accuracy: ${testNextAcc.toFixed(1)}% (${correctNext}/${nextTotal})`);
console.log(`      Termination accuracy: ${testTermAcc.toFixed(1)}% (${correctTerm}/${testExamples.length})`);

// Test path building: greedy vs beam search
console.log("\n      Path building — Greedy vs Beam(3):");

// Collect multi-tool traces for evaluation (test set only, no contamination)
const multiToolTraces = traceRows.filter((t) => {
  if (!testTraceIds.has(t.id)) return false;
  const results = t.task_results as Array<{ tool?: string }>;
  const tools = results.map((r) => r.tool).filter((t): t is string => !!t && toolEmbeddings.has(t));
  return tools.length >= 2;
});

let greedyExactMatch = 0;
let beamExactMatch = 0;
let beamContainsMatch = 0;
const evalCount = Math.min(multiToolTraces.length, 50);

for (let i = 0; i < evalCount; i++) {
  const trace = multiToolTraces[i];
  const intentEmb = parseEmbedding(trace.intent_embedding);
  if (!intentEmb) continue;

  const taskResults = trace.task_results as Array<{ tool?: string }>;
  const actualPath = taskResults
    .map((t) => t.tool)
    .filter((t): t is string => !!t && toolEmbeddings.has(t));
  if (actualPath.length < 2) continue;

  const greedyPath = model.buildPath(intentEmb, actualPath[0]);
  const beamResults = model.buildPathBeam(intentEmb, actualPath[0], 3);

  const actualStr = actualPath.join(" -> ");
  const greedyStr = greedyPath.join(" -> ");

  if (greedyStr === actualStr) greedyExactMatch++;

  for (const beam of beamResults) {
    if (beam.path.join(" -> ") === actualStr) {
      beamExactMatch++;
      break;
    }
  }

  // Also check if beam contains all the right tools (order-independent)
  for (const beam of beamResults) {
    const beamSet = new Set(beam.path);
    if (actualPath.every((t) => beamSet.has(t)) && beam.path.length === actualPath.length) {
      beamContainsMatch++;
      break;
    }
  }

  // Print first 5 examples
  if (i < 5) {
    console.log(`\n      [${i + 1}] Actual:  [${actualStr}]`);
    console.log(`          Greedy:  [${greedyStr}]`);
    for (let b = 0; b < Math.min(beamResults.length, 3); b++) {
      console.log(
        `          Beam[${b}]: [${beamResults[b].path.join(" -> ")}] (score: ${beamResults[b].score.toExponential(2)})`,
      );
    }
  }
}

console.log(`\n      === Path Evaluation (${evalCount} traces) ===`);
console.log(`      Greedy exact match:  ${greedyExactMatch}/${evalCount} (${(greedyExactMatch / evalCount * 100).toFixed(1)}%)`);
console.log(`      Beam@3 exact match:  ${beamExactMatch}/${evalCount} (${(beamExactMatch / evalCount * 100).toFixed(1)}%)`);
console.log(`      Beam@3 tools match:  ${beamContainsMatch}/${evalCount} (${(beamContainsMatch / evalCount * 100).toFixed(1)}%)`);

// Cleanup
console.log("\n[Done] Training complete!");
logMemory("Final ");
model.dispose();
await sql.end();
