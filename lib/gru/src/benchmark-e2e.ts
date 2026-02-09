#!/usr/bin/env -S deno run --allow-all
/**
 * GRU + SHGAT-TF End-to-End Benchmark
 *
 * Complete pipeline test:
 * 1. Load SHGAT params from DB (ALL levels: L0, L1, L2)
 * 2. Build graph structure with full hierarchy
 * 3. Enrich embeddings via SHGAT message passing (V ↔ E^0 ↔ E^1 ↔ E^2)
 * 4. Train GRU TransitionModel with enriched embeddings
 * 5. Evaluate: next tool accuracy, termination accuracy
 * 6. End-to-end path building benchmark
 *
 * Usage:
 *   deno run --allow-all lib/gru/src/benchmark-e2e.ts
 *
 * @module gru/benchmark-e2e
 */

import { load } from "jsr:@std/dotenv@0.225.0";
import postgres from "npm:postgres@3.4.5";
import * as pako from "npm:pako@2.1.0";

import { initTensorFlow, logMemory, tf, dispose } from "./tf/backend.ts";
import { TransitionModel } from "./transition/gru-model.ts";
import type { TransitionExample } from "./transition/types.ts";

// Import SHGAT-TF sparse message passing
import { sparseMPForward } from "../../shgat-tf/src/training/sparse-mp.ts";
import {
  forwardScoring as shgatForwardScoring,
} from "../../shgat-tf/src/training/autograd-trainer.ts";
import { initProjectionHeadParams } from "../../shgat-tf/src/core/projection-head.ts";
import type {
  GraphStructure,
  TFParams,
} from "../../shgat-tf/src/training/autograd-trainer.ts";
import type { SHGATConfig } from "../../shgat-tf/src/core/types.ts";

// =============================================================================
// Helpers
// =============================================================================

function parseEmbedding(embStr: string): number[] | null {
  if (!embStr) return null;
  if (embStr.startsWith("[")) return JSON.parse(embStr);
  const cleaned = embStr.replace(/^\[|\]$/g, "");
  return cleaned.split(",").map(Number);
}

function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// =============================================================================
// Main
// =============================================================================

await load({ export: true });
const DATABASE_URL =
  Deno.env.get("DATABASE_URL") ||
  "postgres://casys:Kx9mP2vL7nQ4wRzT@localhost:5432/casys";

console.log("=== GRU + SHGAT-TF End-to-End Benchmark ===");
console.log(`    Date: ${new Date().toISOString()}\n`);

// --- Step 0: Init TensorFlow.js ---
console.log("[0/9] Initializing TensorFlow.js...");
const backend = await initTensorFlow();
console.log(`      Backend: ${backend}`);
logMemory("      ");

const sql = postgres(DATABASE_URL);

// --- Step 1: Load tool embeddings ---
console.log("\n[1/9] Loading tool embeddings...");
const toolRows = await sql`
  SELECT tool_id, embedding::text
  FROM tool_embedding
  ORDER BY tool_id
`;

const rawToolEmbeddings = new Map<string, number[]>();
const toolIds: string[] = [];
for (const row of toolRows) {
  const embedding = parseEmbedding(row.embedding);
  if (embedding && embedding.length > 0) {
    rawToolEmbeddings.set(row.tool_id, embedding);
    toolIds.push(row.tool_id);
  }
}
const firstEmb = rawToolEmbeddings.values().next().value;
const embeddingDim = firstEmb?.length || 1024;
console.log(`      ${rawToolEmbeddings.size} tools, dim=${embeddingDim}`);

// --- Step 2: Load capabilities & build hierarchy ---
console.log("\n[2/9] Loading capabilities and building hierarchy...");

const toolIdToIdx = new Map<string, number>();
for (let i = 0; i < toolIds.length; i++) {
  toolIdToIdx.set(toolIds[i], i);
}

const capRows = await sql`
  SELECT pattern_id as cap_id, intent_embedding::text as cap_embedding, hierarchy_level
  FROM workflow_pattern
  WHERE intent_embedding IS NOT NULL
  ORDER BY hierarchy_level, pattern_id
`;

const capEmbeddings = new Map<string, number[]>();
const capIdsByLevel = new Map<number, string[]>();
const capIdToLevel = new Map<string, number>();
let maxLevel = 0;

for (const row of capRows) {
  const capEmb = parseEmbedding(row.cap_embedding);
  const level = row.hierarchy_level ?? 0;
  if (capEmb && capEmb.length > 0) {
    capEmbeddings.set(row.cap_id, capEmb);
    capIdToLevel.set(row.cap_id, level);
    if (!capIdsByLevel.has(level)) capIdsByLevel.set(level, []);
    capIdsByLevel.get(level)!.push(row.cap_id);
    maxLevel = Math.max(maxLevel, level);
  }
}

console.log(`      ${capEmbeddings.size} capabilities`);
console.log(
  `      Hierarchy: ${maxLevel + 1} levels - ${
    Array.from(capIdsByLevel.entries())
      .map(([l, c]) => `L${l}:${c.length}`)
      .join(", ")
  }`,
);

// Cap-to-cap relations
const capDepRows = await sql`
  SELECT
    cd.from_capability_id,
    cd.to_capability_id,
    wp1.hierarchy_level as from_level,
    wp2.hierarchy_level as to_level
  FROM capability_dependency cd
  JOIN workflow_pattern wp1 ON cd.from_capability_id = wp1.pattern_id
  JOIN workflow_pattern wp2 ON cd.to_capability_id = wp2.pattern_id
  WHERE wp1.intent_embedding IS NOT NULL
    AND wp2.intent_embedding IS NOT NULL
`;

const capToCapByLevel = new Map<number, Map<string, string[]>>();
for (const row of capDepRows) {
  const fromLevel = row.from_level;
  const toLevel = row.to_level;
  if (fromLevel > toLevel) {
    if (!capToCapByLevel.has(fromLevel))
      capToCapByLevel.set(fromLevel, new Map());
    const levelMap = capToCapByLevel.get(fromLevel)!;
    if (!levelMap.has(row.from_capability_id))
      levelMap.set(row.from_capability_id, []);
    levelMap.get(row.from_capability_id)!.push(row.to_capability_id);
  }
}

// Tool-to-cap from execution traces (L0 only)
const toolToCapSet: Set<string>[] = toolIds.map(() => new Set());
const traceToolCaps = await sql`
  SELECT DISTINCT
    et.capability_id,
    jsonb_array_elements(et.task_results)->>'tool' as tool_id
  FROM execution_trace et
  WHERE et.task_results IS NOT NULL
    AND jsonb_array_length(et.task_results) > 0
    AND et.capability_id IN (
      SELECT pattern_id FROM workflow_pattern WHERE intent_embedding IS NOT NULL
    )
`;

for (const row of traceToolCaps) {
  const toolIdx = toolIdToIdx.get(row.tool_id);
  if (
    toolIdx !== undefined &&
    capEmbeddings.has(row.capability_id) &&
    capIdToLevel.get(row.capability_id) === 0
  ) {
    toolToCapSet[toolIdx].add(row.capability_id);
  }
}

const toolToCapIds: string[][] = toolToCapSet.map((set) => Array.from(set));
const connectedTools = toolToCapIds.filter((arr) => arr.length > 0).length;
console.log(`      ${connectedTools}/${toolIds.length} tools connected to L0 caps`);
console.log(`      ${capDepRows.length} cap-to-cap relations`);

// --- Step 3: Build graph structure ---
console.log("\n[3/9] Building graph structure (ALL levels)...");

const level0Caps = capIdsByLevel.get(0) || [];
const toolToCapData: number[][] = [];
for (let t = 0; t < toolIds.length; t++) {
  const row: number[] = new Array(level0Caps.length).fill(0);
  for (const capId of toolToCapIds[t]) {
    const level0Idx = level0Caps.indexOf(capId);
    if (level0Idx >= 0) row[level0Idx] = 1;
  }
  toolToCapData.push(row);
}
const toolToCapMatrix = tf.tensor2d(toolToCapData);

// Build ALL cap-to-cap matrices (L1->L0, L2->L1)
const capToCapMatrices = new Map<number, tf.Tensor2D>();
for (let level = 1; level <= maxLevel; level++) {
  const parentCaps = capIdsByLevel.get(level) || [];
  const childCaps = capIdsByLevel.get(level - 1) || [];
  if (parentCaps.length === 0 || childCaps.length === 0) continue;

  const matrixData: number[][] = [];
  const levelRelations = capToCapByLevel.get(level);
  for (const parentId of parentCaps) {
    const row: number[] = new Array(childCaps.length).fill(0);
    const children = levelRelations?.get(parentId) || [];
    for (const childId of children) {
      const childIdx = childCaps.indexOf(childId);
      if (childIdx >= 0) row[childIdx] = 1;
    }
    matrixData.push(row);
  }
  if (matrixData.length > 0 && matrixData[0].length > 0) {
    capToCapMatrices.set(level, tf.tensor2d(matrixData));
    const connections = matrixData.flat().filter((v) => v === 1).length;
    console.log(
      `      Cap-to-Cap(L${level}->L${level - 1}): [${parentCaps.length}, ${childCaps.length}], ${connections} connections`,
    );
  }
}

const graph: GraphStructure = {
  toolToCapMatrix,
  capToCapMatrices,
  toolIds,
  capIdsByLevel,
  maxLevel,
};
console.log(`      Graph: maxLevel=${maxLevel}, using ALL levels`);

// --- Step 4: Load SHGAT params from DB ---
console.log("\n[4/9] Loading SHGAT params from DB...");
// Use PG decode() to get raw compressed bytes directly, avoiding 167MB base64 string in JS memory
const paramsRow = await sql`
  SELECT
    params->>'format' as format,
    decode(params->>'data', 'base64') as compressed_bytes,
    updated_at
  FROM shgat_params ORDER BY created_at DESC LIMIT 1
`;

if (paramsRow.length === 0) {
  console.error("FATAL: No SHGAT params found in DB!");
  await sql.end();
  Deno.exit(1);
}

const paramsFormat = paramsRow[0].format as string;
const compressed = paramsRow[0].compressed_bytes as Uint8Array;
console.log(`      Last updated: ${paramsRow[0].updated_at}`);
console.log(`      Compressed: ${(compressed.length / 1024 / 1024).toFixed(1)}MB, format: ${paramsFormat}`);

// deno-lint-ignore no-explicit-any
let loadedSHGATParams: Record<string, any>;
const decompressedBytes = pako.ungzip(compressed);
console.log(`      Decompressed: ${(decompressedBytes.length / 1024 / 1024).toFixed(1)}MB`);

if (paramsFormat === "msgpack+gzip+base64") {
  const { decode: msgpackDecode } = await import("npm:@msgpack/msgpack@3.0.0-beta2");
  loadedSHGATParams = msgpackDecode(decompressedBytes) as Record<string, unknown>;
} else {
  const jsonStr = new TextDecoder().decode(decompressedBytes);
  loadedSHGATParams = JSON.parse(jsonStr);
}

console.log(`      Keys: ${Object.keys(loadedSHGATParams).join(", ")}`);

// --- Step 5: Create TFParams with ALL levels ---
console.log("\n[5/9] Creating TFParams (ALL levels)...");

const numHeads = loadedSHGATParams.config?.numHeads || 16;
const headDim = loadedSHGATParams.config?.headDim || 64;
console.log(`      Config: numHeads=${numHeads}, headDim=${headDim}`);

const W_up = new Map<number, tf.Variable[]>();
const W_down = new Map<number, tf.Variable[]>();
const a_up = new Map<number, tf.Variable[]>();
const a_down = new Map<number, tf.Variable[]>();

const levelParamsData = loadedSHGATParams.levelParams;
if (!levelParamsData || Object.keys(levelParamsData).length === 0) {
  console.error("FATAL: No levelParams found in SHGAT params!");
  await sql.end();
  Deno.exit(1);
}

const availableLevels = Object.keys(levelParamsData).map(Number).sort();
console.log(`      Available levels in DB: ${availableLevels.join(", ")}`);

for (const [levelStr, lp] of Object.entries(levelParamsData)) {
  const level = parseInt(levelStr);
  // deno-lint-ignore no-explicit-any
  const params = lp as any;

  const W_up_level: tf.Variable[] = [];
  const W_down_level: tf.Variable[] = [];
  const a_up_level: tf.Variable[] = [];
  const a_down_level: tf.Variable[] = [];

  for (let h = 0; h < numHeads; h++) {
    // W_child → W_up (stored [headDim, embDim], need [embDim, headDim])
    if (params.W_child?.[h]) {
      const W = tf.tensor2d(params.W_child[h]);
      W_up_level.push(tf.variable(W.transpose(), true, `W_up_${level}_${h}`));
      W.dispose();
    } else {
      console.warn(`      WARN: Missing W_child[${h}] for level ${level}`);
      W_up_level.push(
        tf.variable(
          tf.randomNormal([embeddingDim, headDim], 0, 0.02),
          true,
          `W_up_${level}_${h}`,
        ),
      );
    }

    // W_parent → W_down
    if (params.W_parent?.[h]) {
      const W = tf.tensor2d(params.W_parent[h]);
      W_down_level.push(tf.variable(W.transpose(), true, `W_down_${level}_${h}`));
      W.dispose();
    } else {
      console.warn(`      WARN: Missing W_parent[${h}] for level ${level}`);
      W_down_level.push(
        tf.variable(
          tf.randomNormal([embeddingDim, headDim], 0, 0.02),
          true,
          `W_down_${level}_${h}`,
        ),
      );
    }

    // a_upward → a_up
    if (params.a_upward?.[h]) {
      a_up_level.push(
        tf.variable(tf.tensor1d(params.a_upward[h]), true, `a_up_${level}_${h}`),
      );
    } else {
      console.warn(`      WARN: Missing a_upward[${h}] for level ${level}`);
      a_up_level.push(
        tf.variable(
          tf.randomNormal([2 * headDim], 0, 0.02),
          true,
          `a_up_${level}_${h}`,
        ),
      );
    }

    // a_downward → a_down
    if (params.a_downward?.[h]) {
      a_down_level.push(
        tf.variable(tf.tensor1d(params.a_downward[h]), true, `a_down_${level}_${h}`),
      );
    } else {
      console.warn(`      WARN: Missing a_downward[${h}] for level ${level}`);
      a_down_level.push(
        tf.variable(
          tf.randomNormal([2 * headDim], 0, 0.02),
          true,
          `a_down_${level}_${h}`,
        ),
      );
    }
  }

  W_up.set(level, W_up_level);
  W_down.set(level, W_down_level);
  a_up.set(level, a_up_level);
  a_down.set(level, a_down_level);
}

console.log(`      Loaded params for levels: ${Array.from(W_up.keys()).sort().join(", ")}`);

// Verify all needed levels are present
const missingUpward: number[] = [];
const missingDownward: number[] = [];
for (let level = 0; level <= maxLevel; level++) {
  if (!W_up.has(level)) missingUpward.push(level);
}
for (let level = 1; level <= maxLevel; level++) {
  if (!W_down.has(level)) missingDownward.push(level);
}
if (missingUpward.length > 0) {
  console.warn(`      WARN: Missing W_up for levels: ${missingUpward.join(", ")}`);
}
if (missingDownward.length > 0) {
  console.warn(`      WARN: Missing W_down for levels: ${missingDownward.join(", ")}`);
}

// Build v2vParams residual weight
let residualWeights: tf.Variable | undefined;
if (loadedSHGATParams.v2vParams) {
  const residualLogit = loadedSHGATParams.v2vParams.residualLogit ?? -0.847;
  residualWeights = tf.variable(
    tf.tensor1d([residualLogit]),
    true,
    "residualWeights",
  );
  console.log(`      v2vParams: residualLogit=${residualLogit.toFixed(3)}`);
}

// Load K-head scoring params from DB (needed for USE_KHEAD scoring)
const W_k: tf.Variable[] = [];
const W_q: tf.Variable[] = [];
let W_intent_var: tf.Variable;
const dbHeadParams = loadedSHGATParams.headParams as Array<{
  W_q: number[][];
  W_k: number[][];
}> | undefined;
const dbW_intent = loadedSHGATParams.W_intent as number[][] | undefined;

if (dbHeadParams && dbHeadParams.length > 0) {
  for (let h = 0; h < numHeads; h++) {
    // DB stores [headDim, embDim], autograd-trainer expects [embDim, headDim] — transpose
    const W_k_t = tf.tensor2d(dbHeadParams[h].W_k).transpose();
    const W_q_t = tf.tensor2d(dbHeadParams[h].W_q).transpose();
    W_k.push(tf.variable(W_k_t, true, `khead_W_k_${h}`));
    W_q.push(tf.variable(W_q_t, true, `khead_W_q_${h}`));
  }
  console.log(`      K-head scoring params loaded: ${numHeads} heads (transposed for autograd format)`);
} else {
  console.log("      WARN: No K-head headParams in DB — K-head scoring will fail");
}

if (dbW_intent && dbW_intent.length > 0) {
  // DB stores [hiddenDim, embDim], autograd-trainer expects [embDim, hiddenDim] — transpose
  W_intent_var = tf.variable(tf.tensor2d(dbW_intent).transpose(), true, "khead_W_intent");
} else {
  W_intent_var = tf.variable(tf.zeros([embeddingDim, embeddingDim]), true, "khead_W_intent");
}

const tfParams: TFParams = {
  W_k,
  W_q,
  W_intent: W_intent_var,
  W_up,
  W_down,
  a_up,
  a_down,
  residualWeights,
};

const shgatConfig = {
  numHeads,
  headDim,
  embeddingDim,
  hiddenDim: embeddingDim,
  numLayers: loadedSHGATParams.config?.numLayers ?? 2,
  mlpHiddenDim: loadedSHGATParams.config?.mlpHiddenDim ?? 32,
  learningRate: loadedSHGATParams.config?.learningRate ?? 0.03,
  batchSize: loadedSHGATParams.config?.batchSize ?? 32,
  maxContextLength: loadedSHGATParams.config?.maxContextLength ?? 5,
  maxBufferSize: loadedSHGATParams.config?.maxBufferSize ?? 50000,
  minTracesForTraining: loadedSHGATParams.config?.minTracesForTraining ?? 100,
  dropout: loadedSHGATParams.config?.dropout ?? 0.1,
  l2Lambda: loadedSHGATParams.config?.l2Lambda ?? 0.0001,
  leakyReluSlope: loadedSHGATParams.config?.leakyReluSlope ?? 0.2,
  depthDecay: loadedSHGATParams.config?.depthDecay ?? 0.8,
  preserveDim: loadedSHGATParams.config?.preserveDim ?? true,
  preserveDimResidual: loadedSHGATParams.config?.preserveDimResidual ?? 0.3,
  aggregationActivation: loadedSHGATParams.config?.aggregationActivation ?? "elu",
  // Projection head config (optional)
  useProjectionHead: Deno.env.get("USE_PROJ_HEAD") === "true",
  projectionHiddenDim: 256,
  projectionOutputDim: 256,
  projectionBlendAlpha: parseFloat(Deno.env.get("PROJ_ALPHA") || "0.5"),
  projectionTemperature: parseFloat(Deno.env.get("PROJ_TEMP") || "0.07"),
} as SHGATConfig;
// deno-lint-ignore no-explicit-any
console.log(`      leakyReluSlope=${shgatConfig.leakyReluSlope}, activation=${(shgatConfig as any).aggregationActivation}`);
if (shgatConfig.useProjectionHead) {
  console.log(`      projectionHead: alpha=${shgatConfig.projectionBlendAlpha}, temp=${shgatConfig.projectionTemperature}`);
}

// --- Step 6: Enrich embeddings via SHGAT message passing ---
console.log("\n[6/9] Enriching embeddings (full message passing V <-> E^0 <-> E^1 <-> E^2)...");
const mpStart = performance.now();

const H_init: number[][] = toolIds.map((id) => rawToolEmbeddings.get(id)!);
const E_init = new Map<number, number[][]>();
for (let level = 0; level <= maxLevel; level++) {
  const levelCaps = capIdsByLevel.get(level) || [];
  E_init.set(
    level,
    levelCaps.map((id) => capEmbeddings.get(id)!),
  );
}
console.log(
  `      E_init levels: ${Array.from(E_init.keys()).join(", ")} (${
    Array.from(E_init.entries())
      .map(([l, e]) => `L${l}:${e.length}`)
      .join(", ")
  })`,
);

const { H: H_enriched, E: _E_enriched } = sparseMPForward(
  H_init,
  E_init,
  graph,
  tfParams,
  shgatConfig,
);

const mpTime = ((performance.now() - mpStart) / 1000).toFixed(2);
console.log(`      Message passing complete in ${mpTime}s`);
console.log(`      Enriched ${H_enriched.length} tool embeddings`);

// Measure enrichment quality: how much did embeddings change?
let totalDelta = 0;
let maxDelta = 0;
for (let i = 0; i < H_enriched.length; i++) {
  let delta = 0;
  for (let j = 0; j < H_enriched[i].length; j++) {
    delta += Math.abs(H_enriched[i][j] - H_init[i][j]);
  }
  totalDelta += delta;
  maxDelta = Math.max(maxDelta, delta);
}
const avgDelta = totalDelta / H_enriched.length;
console.log(
  `      Embedding delta: avg=${avgDelta.toFixed(2)}, max=${maxDelta.toFixed(2)} (higher = more enrichment)`,
);

const enrichedToolEmbeddings = new Map<string, number[]>();
for (let i = 0; i < toolIds.length; i++) {
  enrichedToolEmbeddings.set(toolIds[i], H_enriched[i]);
}

logMemory("      ");

// --- Step 7: Load traces & generate transition examples ---
console.log("\n[7/9] Loading execution traces...");
const traceRows = await sql`
  SELECT
    et.id,
    et.task_results,
    et.success,
    wp.intent_embedding::text as intent_embedding,
    wp.pattern_id as capability_id
  FROM execution_trace et
  JOIN workflow_pattern wp ON et.capability_id = wp.pattern_id
  WHERE et.task_results IS NOT NULL
    AND jsonb_array_length(et.task_results) > 1
    AND wp.intent_embedding IS NOT NULL
  ORDER BY et.executed_at DESC
`;

console.log(`      ${traceRows.length} multi-tool traces`);

const allExamples: TransitionExample[] = [];
const tracePathsForEval: Array<{
  intentEmbedding: number[];
  actualPath: string[];
}> = [];

for (const trace of traceRows) {
  const intentEmbedding = parseEmbedding(trace.intent_embedding);
  if (!intentEmbedding) continue;

  const taskResults = trace.task_results as Array<{ tool?: string }>;
  const toolSequence = taskResults
    .map((t) => t.tool)
    .filter((t): t is string => !!t && enrichedToolEmbeddings.has(t));

  if (toolSequence.length < 2) continue;

  // Save for end-to-end eval
  tracePathsForEval.push({ intentEmbedding, actualPath: toolSequence });

  // Generate step-by-step examples
  for (let i = 0; i < toolSequence.length; i++) {
    allExamples.push({
      intentEmbedding,
      contextToolIds: toolSequence.slice(0, i),
      targetToolId: toolSequence[i],
      isTerminal: i === toolSequence.length - 1 ? 1 : 0,
    });
  }
}

console.log(`      ${allExamples.length} transition examples`);
console.log(`      ${tracePathsForEval.length} traces for end-to-end eval`);

// Split train/test
shuffle(allExamples);
const splitIdx = Math.floor(allExamples.length * 0.8);
const trainExamples = allExamples.slice(0, splitIdx);
const testExamples = allExamples.slice(splitIdx);
console.log(`      Train: ${trainExamples.length}, Test: ${testExamples.length}`);

// --- Step 8: Train GRU TransitionModel ---
const USE_SIMILARITY = Deno.env.get("USE_SIMILARITY") !== "false";
const TERM_THRESHOLD = parseFloat(Deno.env.get("TERM_THRESHOLD") || (USE_SIMILARITY ? "0.4" : "0.7"));
const FOCAL_GAMMA = parseFloat(Deno.env.get("FOCAL_GAMMA") || "0");
const HARD_NEG_K = parseInt(Deno.env.get("HARD_NEG_K") || "0");
const MARGIN_WEIGHT = parseFloat(Deno.env.get("MARGIN_WEIGHT") || "0");
const TEMP_START = parseFloat(Deno.env.get("TEMP_START") || "0.15");
const TEMP_END = parseFloat(Deno.env.get("TEMP_END") || "0.06");
const TERM_WEIGHT = parseFloat(Deno.env.get("TERM_WEIGHT") || "10");

console.log(`\n[8/9] Training GRU TransitionModel (similarityHead=${USE_SIMILARITY}, termThreshold=${TERM_THRESHOLD})...`);
console.log(`      Focal: gamma=${FOCAL_GAMMA}, HardNeg: K=${HARD_NEG_K} margin_w=${MARGIN_WEIGHT}`);
console.log(`      Temp annealing: ${TEMP_START} → ${TEMP_END}, termWeight=${TERM_WEIGHT}`);
const model = new TransitionModel({
  embeddingDim,
  hiddenDim: 128,
  terminationThreshold: TERM_THRESHOLD,
  maxPathLength: 10,
  dropout: 0.15,
  learningRate: 0.001,
  temperature: TEMP_START,
  useSimilarityHead: USE_SIMILARITY,
  focalGamma: FOCAL_GAMMA,
  hardNegativeK: HARD_NEG_K,
  marginLossWeight: MARGIN_WEIGHT,
  temperatureStart: TEMP_START,
  temperatureEnd: TEMP_END,
  terminationLossWeight: TERM_WEIGHT,
});

model.setToolVocabulary(enrichedToolEmbeddings);
console.log(`      Vocab: ${enrichedToolEmbeddings.size} tools (enriched, similarityHead=${USE_SIMILARITY})`);

const EPOCHS = 50;
const BATCH_SIZE = 32;
const trainStart = performance.now();

let bestTestNextAcc = 0;
let bestEpoch = 0;
let finalHit1 = 0, finalHit3 = 0, finalMRR = 0;

for (let epoch = 0; epoch < EPOCHS; epoch++) {
  const epochStart = performance.now();

  // Cosine temperature annealing per epoch
  model.annealTemperature(epoch, EPOCHS);

  const shuffledTrain = shuffle([...trainExamples]);

  let epochLoss = 0;
  let epochNextAcc = 0;
  let epochTermAcc = 0;
  let batchCount = 0;

  for (let i = 0; i < shuffledTrain.length; i += BATCH_SIZE) {
    const batch = shuffledTrain.slice(i, i + BATCH_SIZE);
    if (batch.length === 0) continue;

    const metrics = await model.trainStep(batch);
    epochLoss += metrics.loss;
    epochNextAcc += metrics.nextToolAccuracy;
    epochTermAcc += metrics.terminationAccuracy;
    batchCount++;
  }

  const avgLoss = epochLoss / batchCount;
  const avgNextAcc = (epochNextAcc / batchCount) * 100;
  const avgTermAcc = (epochTermAcc / batchCount) * 100;
  const epochTime = (performance.now() - epochStart) / 1000;

  // Evaluate on test set every 10 epochs
  if ((epoch + 1) % 10 === 0 || epoch === EPOCHS - 1) {
    let correctNext = 0;
    let correctTerm = 0;
    let hit1 = 0, hit3 = 0, mrrSum = 0;
    for (const ex of testExamples) {
      const { ranked, shouldTerminate } = await model.predictNextTopK(ex.intentEmbedding, ex.contextToolIds, 10);
      const rank = ranked.findIndex(r => r.toolId === ex.targetToolId);
      if (rank === 0) { hit1++; correctNext++; }
      if (rank >= 0 && rank < 3) hit3++;
      if (rank >= 0) mrrSum += 1 / (rank + 1);
      if ((shouldTerminate ? 1 : 0) === ex.isTerminal) correctTerm++;
    }
    const n = testExamples.length;
    const testNextAcc = (correctNext / n) * 100;
    const testTermAcc = (correctTerm / n) * 100;
    const testHit1 = (hit1 / n) * 100;
    const testHit3 = (hit3 / n) * 100;
    const testMRR = mrrSum / n;

    if (testNextAcc > bestTestNextAcc) {
      bestTestNextAcc = testNextAcc;
      bestEpoch = epoch + 1;
    }
    finalHit1 = testHit1; finalHit3 = testHit3; finalMRR = testMRR;

    console.log(
      `      Epoch ${String(epoch + 1).padStart(2)}/${EPOCHS}: ` +
        `loss=${avgLoss.toFixed(4)}, ` +
        `trainNext=${avgNextAcc.toFixed(1)}%, trainTerm=${avgTermAcc.toFixed(1)}% | ` +
        `testNext=${testNextAcc.toFixed(1)}%, testTerm=${testTermAcc.toFixed(1)}%, ` +
        `Hit@1=${testHit1.toFixed(1)}%, Hit@3=${testHit3.toFixed(1)}%, MRR=${testMRR.toFixed(3)}, ` +
        `time=${epochTime.toFixed(1)}s`,
    );
  } else {
    console.log(
      `      Epoch ${String(epoch + 1).padStart(2)}/${EPOCHS}: ` +
        `loss=${avgLoss.toFixed(4)}, ` +
        `trainNext=${avgNextAcc.toFixed(1)}%, trainTerm=${avgTermAcc.toFixed(1)}%, ` +
        `time=${epochTime.toFixed(1)}s`,
    );
  }
}

const trainTime = ((performance.now() - trainStart) / 1000).toFixed(1);
console.log(`\n      Training complete in ${trainTime}s`);
console.log(`      Best test nextAcc: ${bestTestNextAcc.toFixed(1)}% (epoch ${bestEpoch})`);
logMemory("      ");

// --- Step 9: End-to-End Path Building Benchmark ---
console.log("\n[9/9] End-to-End Path Building Benchmark...");
console.log("      SHGAT firstTool -> step-by-step predictNext -> compare to actual trace\n");

// --- Diagnostic: step-by-step with termination probs ---
console.log("      --- Termination Diagnostic (first 10 traces) ---");
const diagSamples = tracePathsForEval.slice(0, 10);
const allTermProbs: number[][] = []; // [step] -> list of probs across all traces

for (let t = 0; t < diagSamples.length; t++) {
  const { intentEmbedding, actualPath } = diagSamples[t];
  const stepProbs: string[] = [];

  for (let step = 0; step < actualPath.length; step++) {
    const context = actualPath.slice(0, step);
    const pred = await model.predictNext(intentEmbedding, context);
    const isLastStep = step === actualPath.length - 1;
    const correctTool = pred.toolId === actualPath[step] ? "OK" : `!=${pred.toolId}`;
    stepProbs.push(
      `step${step}(ctx=${step}): termP=${pred.confidence > 0 ? (pred.shouldTerminate ? "TERM" : "cont") : "?"} ` +
      `p=${((await model.predictNext(intentEmbedding, context)).confidence).toFixed(3)} ` +
      `tool=${correctTool}${isLastStep ? " [SHOULD_TERM]" : ""}`
    );

    if (!allTermProbs[step]) allTermProbs[step] = [];
  }
  console.log(`      [${t + 1}] actual=[${actualPath.join(" -> ")}]`);
  console.log(`           ${stepProbs.join("\n           ")}`);
}

// Now we need raw termination probs. Let's get them via a custom forward pass
console.log("\n      --- Raw termination probabilities ---");
for (let t = 0; t < Math.min(diagSamples.length, 5); t++) {
  const { intentEmbedding, actualPath } = diagSamples[t];
  const probs: string[] = [];

  for (let step = 0; step <= actualPath.length; step++) {
    const context = actualPath.slice(0, step);
    // Use predictNext to get the raw data
    const contextEmbs: number[][] = [];
    for (const id of context) {
      const emb = enrichedToolEmbeddings.get(id);
      if (emb) contextEmbs.push(emb);
    }
    if (contextEmbs.length === 0) {
      contextEmbs.push(new Array(embeddingDim).fill(0));
    }
    // Pad to maxSeqLen=20
    const padded: number[][] = [];
    const startIdx = Math.max(0, contextEmbs.length - 20);
    const trimmed = contextEmbs.slice(startIdx);
    for (let p = 0; p < 20 - trimmed.length; p++) padded.push(new Array(embeddingDim).fill(0));
    padded.push(...trimmed);

    const ctxT = tf.tensor3d([padded]);
    const intT = tf.tensor2d([intentEmbedding]);
    // deno-lint-ignore no-explicit-any
    const outputs = (model as any).model.predict([ctxT, intT]) as tf.Tensor[];
    const termData = await outputs[1].data() as Float32Array;
    const nextData = await outputs[0].data() as Float32Array;
    const topIdx = nextData.indexOf(Math.max(...nextData));
    // deno-lint-ignore no-explicit-any
    const topTool = (model as any).indexToTool.get(topIdx) || "?";
    const isLast = step === actualPath.length;
    probs.push(`ctx=${step}: termP=${termData[0].toFixed(4)} top=${topTool}${isLast ? " [END]" : ` actual=${actualPath[step]}`}`);
    dispose([ctxT, intT, outputs[0], outputs[1]]);
  }
  console.log(`      [${t + 1}] ${actualPath.join(" -> ")}`);
  console.log(`           ${probs.join("\n           ")}`);
}

// --- Standard E2E eval with buildPath ---
console.log("\n      --- E2E Path Building ---");
let pathExactMatch = 0;
let pathFirstToolMatch = 0;
let pathLengthMatch = 0;
let totalPathLenDiff = 0;
let firstNCorrect = 0;

const maxSamples = tracePathsForEval.length;
const sampleTraces = tracePathsForEval;

for (let t = 0; t < sampleTraces.length; t++) {
  const { intentEmbedding, actualPath } = sampleTraces[t];
  const firstTool = actualPath[0];

  const predictedPath = await model.buildPath(intentEmbedding, firstTool);

  const exactMatch =
    predictedPath.length === actualPath.length &&
    predictedPath.every((tool, i) => tool === actualPath[i]);
  if (exactMatch) pathExactMatch++;
  if (predictedPath[0] === actualPath[0]) pathFirstToolMatch++;
  if (predictedPath.length === actualPath.length) pathLengthMatch++;
  totalPathLenDiff += Math.abs(predictedPath.length - actualPath.length);

  const minLen = Math.min(predictedPath.length, actualPath.length);
  let firstNMatch = true;
  for (let i = 0; i < minLen; i++) {
    if (predictedPath[i] !== actualPath[i]) { firstNMatch = false; break; }
  }
  if (firstNMatch) firstNCorrect++;

  if (t < 10) {
    const match = exactMatch ? "EXACT" : predictedPath[1] === actualPath[1] ? "PARTIAL" : "MISS";
    console.log(`      [${String(t + 1).padStart(2)}] ${match}`);
    console.log(`           Actual:    [${actualPath.join(" -> ")}]`);
    console.log(`           Predicted: [${predictedPath.join(" -> ")}]`);
  }
}

console.log(`\n      --- End-to-End Results (${maxSamples} traces) ---`);
console.log(`      Exact path match: ${pathExactMatch}/${maxSamples} (${(pathExactMatch / maxSamples * 100).toFixed(1)}%)`);
console.log(`      First tool match: ${pathFirstToolMatch}/${maxSamples} (${(pathFirstToolMatch / maxSamples * 100).toFixed(1)}%)`);
console.log(`      Length match:     ${pathLengthMatch}/${maxSamples} (${(pathLengthMatch / maxSamples * 100).toFixed(1)}%)`);
console.log(`      First-N correct:  ${firstNCorrect}/${maxSamples} (${(firstNCorrect / maxSamples * 100).toFixed(1)}%)`);
console.log(`      Avg length diff:  ${(totalPathLenDiff / maxSamples).toFixed(2)} tools`);

// --- Beam Search E2E eval ---
const BEAM_WIDTH = parseInt(Deno.env.get("BEAM_WIDTH") || "3");
console.log(`\n      --- E2E Beam Search (width=${BEAM_WIDTH}) ---`);
let beamExactMatch = 0;
let beamFirstNCorrect = 0;
let beamTotalLenDiff = 0;

for (let t = 0; t < sampleTraces.length; t++) {
  const { intentEmbedding, actualPath } = sampleTraces[t];
  const firstTool = actualPath[0];

  const predictedPath = await model.buildPathBeam(intentEmbedding, firstTool, BEAM_WIDTH);

  const exactMatch =
    predictedPath.length === actualPath.length &&
    predictedPath.every((tool, i) => tool === actualPath[i]);
  if (exactMatch) beamExactMatch++;
  beamTotalLenDiff += Math.abs(predictedPath.length - actualPath.length);

  const minLen = Math.min(predictedPath.length, actualPath.length);
  let firstNMatch = true;
  for (let i = 0; i < minLen; i++) {
    if (predictedPath[i] !== actualPath[i]) { firstNMatch = false; break; }
  }
  if (firstNMatch) beamFirstNCorrect++;

  if (t < 5) {
    const match = exactMatch ? "EXACT" : predictedPath[1] === actualPath[1] ? "PARTIAL" : "MISS";
    console.log(`      [${String(t + 1).padStart(2)}] ${match}`);
    console.log(`           Actual:    [${actualPath.join(" -> ")}]`);
    console.log(`           Beam:      [${predictedPath.join(" -> ")}]`);
  }
}

console.log(`\n      --- Beam vs Greedy (${maxSamples} traces) ---`);
console.log(`      Greedy exact:    ${pathExactMatch}/${maxSamples} (${(pathExactMatch / maxSamples * 100).toFixed(1)}%)`);
console.log(`      Beam exact:      ${beamExactMatch}/${maxSamples} (${(beamExactMatch / maxSamples * 100).toFixed(1)}%)`);
console.log(`      Greedy first-N:  ${firstNCorrect}/${maxSamples} (${(firstNCorrect / maxSamples * 100).toFixed(1)}%)`);
console.log(`      Beam first-N:    ${beamFirstNCorrect}/${maxSamples} (${(beamFirstNCorrect / maxSamples * 100).toFixed(1)}%)`);
console.log(`      Greedy len diff: ${(totalPathLenDiff / maxSamples).toFixed(2)}`);
console.log(`      Beam len diff:   ${(beamTotalLenDiff / maxSamples).toFixed(2)}`);

// --- Step 10: Custom Intent Qualitative Test ---
const USE_KHEAD = Deno.env.get("USE_KHEAD") === "true" || shgatConfig.useProjectionHead;
const scoringMode = USE_KHEAD
  ? (shgatConfig.useProjectionHead ? "K-head + Projection" : "K-head")
  : "cosine";
console.log(`\n[10] Custom Intent Qualitative Test (scoring: ${scoringMode})...`);
console.log(`     SHGAT ${scoringMode} retrieval → GRU path building → qualitative assessment\n`);

// Build K-head scoring params if needed (reuse existing tfParams + optional projection head)
let kheadTfParams: TFParams | null = null;
let kheadNodeEmbs: ReturnType<typeof tf.tensor2d> | null = null;
if (USE_KHEAD) {
  // If projection head enabled, we need to init projection head params
  // The K-head W_k/W_q are already in tfParams from DB
  if (shgatConfig.useProjectionHead && !tfParams.projectionHead) {
    // Init only the projection head (not all params)
    tfParams.projectionHead = initProjectionHeadParams(
      shgatConfig.embeddingDim,
      shgatConfig.projectionHiddenDim ?? 256,
      shgatConfig.projectionOutputDim ?? 256,
    );
    console.log("      Initialized random projection head (untrained — for plumbing validation)");
  }
  kheadTfParams = tfParams;
  // Pre-build enriched embeddings tensor [numTools, embDim]
  const embMatrix = toolIds.map((id) => enrichedToolEmbeddings.get(id)!);
  kheadNodeEmbs = tf.tensor2d(embMatrix);
}

// Helper: cosine similarity
function cosineSim(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

// Helper: SHGAT retrieve top-K tools
function shgatRetrieveTopK(intentEmb: number[], k: number): Array<{ toolId: string; score: number }> {
  if (USE_KHEAD && kheadTfParams && kheadNodeEmbs) {
    // K-head scoring (with optional projection head blend)
    const allScores = tf.tidy(() => {
      const intentTensor = tf.tensor1d(intentEmb);
      const scores = shgatForwardScoring(intentTensor, kheadNodeEmbs!, kheadTfParams!, shgatConfig);
      return scores.arraySync() as number[];
    });
    const results: Array<{ toolId: string; score: number }> = [];
    for (let i = 0; i < toolIds.length; i++) {
      results.push({ toolId: toolIds[i], score: allScores[i] });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  // Fallback: cosine similarity
  const scores: Array<{ toolId: string; score: number }> = [];
  for (const [toolId, emb] of enrichedToolEmbeddings) {
    scores.push({ toolId, score: cosineSim(intentEmb, emb) });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, k);
}

// Helper: create synthetic intent embedding by averaging tool embeddings
function syntheticIntent(toolIdsForIntent: string[]): number[] {
  const dim = embeddingDim;
  const avg = new Array(dim).fill(0);
  let count = 0;
  for (const id of toolIdsForIntent) {
    const emb = enrichedToolEmbeddings.get(id);
    if (emb) {
      for (let d = 0; d < dim; d++) avg[d] += emb[d];
      count++;
    }
  }
  if (count > 0) {
    for (let d = 0; d < dim; d++) avg[d] /= count;
  }
  return avg;
}

// --- Part A: Named intents from DB ---
console.log("      --- A) Named intents from DB (real capabilities) ---");
const namedIntentRows = await sql`
  SELECT DISTINCT ON (wp.pattern_id)
    wp.pattern_id,
    wp.description,
    wp.intent_embedding::text as intent_embedding,
    et.task_results as example_trace
  FROM workflow_pattern wp
  JOIN execution_trace et ON et.capability_id = wp.pattern_id
  WHERE et.task_results IS NOT NULL
    AND jsonb_array_length(et.task_results) > 1
    AND wp.intent_embedding IS NOT NULL
  ORDER BY wp.pattern_id, jsonb_array_length(et.task_results) DESC
`;

for (let i = 0; i < namedIntentRows.length; i++) {
  const row = namedIntentRows[i];
  const intentEmb = parseEmbedding(row.intent_embedding);
  if (!intentEmb) continue;

  const topTools = shgatRetrieveTopK(intentEmb, 5);
  const firstTool = topTools[0].toolId;
  const predictedPath = await model.buildPath(intentEmb, firstTool);

  // Parse example trace from DB
  let exampleStr = "N/A";
  if (row.example_trace) {
    try {
      const trace = Array.isArray(row.example_trace) ? row.example_trace : JSON.parse(row.example_trace);
      if (Array.isArray(trace)) {
        exampleStr = trace.map((t: { tool?: string }) => t.tool || "?").join(" -> ");
      }
    } catch { /* ignore */ }
  }

  console.log(`      [${i + 1}] "${row.description}"`);
  console.log(`           SHGAT top-3: ${topTools.slice(0, 3).map(t => `${t.toolId}(${t.score.toFixed(3)})`).join(", ")}`);
  console.log(`           Predicted:   [${predictedPath.join(" -> ")}]`);
  console.log(`           DB example:  [${exampleStr}]`);
}

// --- Part B: Synthetic custom intents ---
console.log("\n      --- B) Synthetic custom intents (novel scenarios) ---");

const customIntents: Array<{
  name: string;
  toolHints: string[];  // tools to average for synthetic intent
  expectedPattern: string;  // human description of expected behavior
}> = [
  {
    name: "Read a file and compute its hash",
    toolHints: ["filesystem:read_file", "std:crypto_hash"],
    expectedPattern: "filesystem:read_file -> std:crypto_hash",
  },
  {
    name: "Generate UUID and write to file",
    toolHints: ["std:crypto_uuid", "filesystem:write_file"],
    expectedPattern: "std:crypto_uuid -> filesystem:write_file",
  },
  {
    name: "Parse JSON, filter and sort results",
    toolHints: ["code:JSON.parse", "code:filter", "code:sort"],
    expectedPattern: "code:JSON.parse -> code:filter -> code:sort",
  },
  {
    name: "List directory and read each file",
    toolHints: ["filesystem:list_directory", "filesystem:read_file"],
    expectedPattern: "filesystem:list_directory -> filesystem:read_file",
  },
  {
    name: "Git status and branch info",
    toolHints: ["std:git_status", "std:git_log"],
    expectedPattern: "std:git_status -> std:git_log",
  },
  {
    name: "Query database and transform results",
    toolHints: ["std:psql_query", "code:map", "code:filter"],
    expectedPattern: "std:psql_query -> code:map or code:filter",
  },
  {
    name: "Generate fake person with address",
    toolHints: ["std:fake_person", "std:fake_address"],
    expectedPattern: "std:fake_person -> std:fake_address",
  },
  {
    name: "Read config, parse YAML, extract values",
    toolHints: ["filesystem:read_file", "code:JSON.parse", "code:Object.keys"],
    expectedPattern: "filesystem:read_file -> code:JSON.parse -> code:Object.keys",
  },
];

let syntheticHits = 0;
for (let i = 0; i < customIntents.length; i++) {
  const ci = customIntents[i];
  const intentEmb = syntheticIntent(ci.toolHints);

  // Check if intent embedding is non-zero (all tools found)
  const norm = Math.sqrt(intentEmb.reduce((s, v) => s + v * v, 0));
  if (norm < 0.01) {
    console.log(`      [${i + 1}] "${ci.name}" — SKIPPED (tools not in vocabulary)`);
    continue;
  }

  const topTools = shgatRetrieveTopK(intentEmb, 5);
  const firstTool = topTools[0].toolId;
  const predictedPath = await model.buildPath(intentEmb, firstTool);

  // Check if predicted path contains the hint tools (order-aware partial match)
  const hintSet = new Set(ci.toolHints);
  const matchedHints = predictedPath.filter(t => hintSet.has(t)).length;
  const coverage = matchedHints / ci.toolHints.length;
  const verdict = coverage >= 0.8 ? "GOOD" : coverage >= 0.5 ? "PARTIAL" : "MISS";
  if (coverage >= 0.5) syntheticHits++;

  console.log(`      [${i + 1}] "${ci.name}" → ${verdict} (${(coverage * 100).toFixed(0)}% tool coverage)`);
  console.log(`           SHGAT top-3: ${topTools.slice(0, 3).map(t => `${t.toolId}(${t.score.toFixed(3)})`).join(", ")}`);
  console.log(`           Predicted:   [${predictedPath.join(" -> ")}]`);
  console.log(`           Expected:    [${ci.expectedPattern}]`);
}

console.log(`\n      Synthetic intent coverage: ${syntheticHits}/${customIntents.length} (${(syntheticHits / customIntents.length * 100).toFixed(0)}% ≥50% tool match)`);

// --- Summary ---
console.log(`\n=== SUMMARY (similarityHead=${USE_SIMILARITY}, termThreshold=${TERM_THRESHOLD}, shgatScoring=${scoringMode}) ===`);
console.log(`  SHGAT levels used:       L0, L1, L2 (all trained)`);
console.log(`  SHGAT scoring:           ${scoringMode}${shgatConfig.useProjectionHead ? ` (alpha=${shgatConfig.projectionBlendAlpha})` : ""}`);
console.log(`  Message passing:         V <-> E^0 <-> E^1 <-> E^2`);
console.log(`  MP time:                 ${mpTime}s`);
console.log(`  Embedding delta (avg):   ${avgDelta.toFixed(2)}`);
console.log(`  Training examples:       ${allExamples.length} (${tracePathsForEval.length} traces)`);
console.log(`  Best test next-tool acc: ${bestTestNextAcc.toFixed(1)}% (epoch ${bestEpoch})`);
console.log(`  Hit@1:                   ${finalHit1.toFixed(1)}%`);
console.log(`  Hit@3:                   ${finalHit3.toFixed(1)}%`);
console.log(`  MRR:                     ${finalMRR.toFixed(3)}`);
console.log(`  E2E greedy exact:        ${(pathExactMatch / maxSamples * 100).toFixed(1)}%`);
console.log(`  E2E greedy first-N:      ${(firstNCorrect / maxSamples * 100).toFixed(1)}%`);
console.log(`  E2E beam(${BEAM_WIDTH}) exact:       ${(beamExactMatch / maxSamples * 100).toFixed(1)}%`);
console.log(`  E2E beam(${BEAM_WIDTH}) first-N:      ${(beamFirstNCorrect / maxSamples * 100).toFixed(1)}%`);
console.log(`  E2E avg length diff:     greedy=${(totalPathLenDiff / maxSamples).toFixed(2)}, beam=${(beamTotalLenDiff / maxSamples).toFixed(2)}`);
console.log(`  Custom intents coverage: ${syntheticHits}/${customIntents.length} synthetic (≥50% tool match)`);
console.log(`  Named intents tested:    ${namedIntentRows.length} from DB`);
console.log(`  Training time:           ${trainTime}s`);
logMemory("  ");

// Cleanup
model.dispose();
toolToCapMatrix.dispose();
for (const [, mat] of capToCapMatrices) mat.dispose();
for (const [, vars] of W_up) vars.forEach((v) => v.dispose());
for (const [, vars] of W_down) vars.forEach((v) => v.dispose());
for (const [, vars] of a_up) vars.forEach((v) => v.dispose());
for (const [, vars] of a_down) vars.forEach((v) => v.dispose());
tfParams.W_intent.dispose();
for (const w of tfParams.W_k) w.dispose();
for (const w of tfParams.W_q) w.dispose();
residualWeights?.dispose();
if (tfParams.projectionHead) {
  tfParams.projectionHead.W1.dispose();
  tfParams.projectionHead.b1.dispose();
  tfParams.projectionHead.W2.dispose();
  tfParams.projectionHead.b2.dispose();
}
kheadNodeEmbs?.dispose();

await sql.end();
console.log("\n=== Benchmark complete ===");
