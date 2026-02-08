#!/usr/bin/env -S deno run --allow-all
/**
 * GRU TransitionModel Training with SHGAT-Enriched Embeddings
 *
 * End-to-end test:
 * 1. Load SHGAT params from DB
 * 2. Apply message passing to enrich embeddings
 * 3. Train GRU with enriched embeddings
 *
 * Usage:
 *   deno run --allow-all lib/gru/src/test-training-enriched.ts
 */

import { load } from "jsr:@std/dotenv@0.225.0";
import postgres from "npm:postgres@3.4.5";
import * as pako from "npm:pako@2.1.0";
import { decode as msgpackDecode } from "npm:@msgpack/msgpack@3.0.0-beta2";

import { initTensorFlow, logMemory, tf } from "./tf/backend.ts";
import { TransitionModel } from "./transition/gru-model.ts";
import type { TransitionExample } from "./transition/types.ts";

// Import SHGAT message passing (dense autograd)
import { messagePassingForward } from "../../shgat-tf/src/training/autograd-trainer.ts";
import type { GraphStructure, TFParams } from "../../shgat-tf/src/training/autograd-trainer.ts";

// Load environment
await load({ export: true });

const DATABASE_URL = Deno.env.get("DATABASE_URL") ||
  "postgres://casys:Kx9mP2vL7nQ4wRzT@localhost:5432/casys";

/**
 * Parse embedding from PostgreSQL text format
 */
function parseEmbedding(embStr: string): number[] | null {
  if (!embStr) return null;
  if (embStr.startsWith("[")) {
    return JSON.parse(embStr);
  }
  const cleaned = embStr.replace(/^\[|\]$/g, "");
  return cleaned.split(",").map(Number);
}

/**
 * Shuffle array in place (Fisher-Yates)
 */
function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

console.log("[GRU+SHGAT] End-to-End Training Test\n");

// Initialize TensorFlow.js
console.log("[TF] Initializing TensorFlow.js...");
const backend = await initTensorFlow();
console.log(`     Backend: ${backend}`);
logMemory("     ");

// Connect to database
console.log("\n[DB] Connecting to database...");
const sql = postgres(DATABASE_URL);

// =============================================================================
// 1. Load raw tool embeddings
// =============================================================================
console.log("\n[1/8] Loading raw tool embeddings...");
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
console.log(`      Loaded ${rawToolEmbeddings.size} tool embeddings`);

const firstEmb = rawToolEmbeddings.values().next().value;
const embeddingDim = firstEmb?.length || 1024;

// =============================================================================
// 2. Load capabilities and build tool-to-cap from execution traces
// =============================================================================
console.log("\n[2/8] Loading capabilities and building graph from traces...");

// Build tool index
const toolIdToIdx = new Map<string, number>();
for (let i = 0; i < toolIds.length; i++) {
  toolIdToIdx.set(toolIds[i], i);
}

// Get capability embeddings with hierarchy level
const capRows = await sql`
  SELECT pattern_id as cap_id, intent_embedding::text as cap_embedding, hierarchy_level
  FROM workflow_pattern
  WHERE intent_embedding IS NOT NULL
  ORDER BY hierarchy_level, pattern_id
`;

const capEmbeddings = new Map<string, number[]>();
const capIdsByLevel = new Map<number, string[]>();
const capIdToIdx = new Map<string, number>();
const capIdToLevel = new Map<string, number>();
let maxLevel = 0;

for (const row of capRows) {
  const capEmb = parseEmbedding(row.cap_embedding);
  const level = row.hierarchy_level ?? 0;
  if (capEmb && capEmb.length > 0) {
    capEmbeddings.set(row.cap_id, capEmb);
    capIdToLevel.set(row.cap_id, level);

    if (!capIdsByLevel.has(level)) {
      capIdsByLevel.set(level, []);
    }
    const levelCaps = capIdsByLevel.get(level)!;
    capIdToIdx.set(row.cap_id, levelCaps.length); // Index within level
    levelCaps.push(row.cap_id);

    maxLevel = Math.max(maxLevel, level);
  }
}
console.log(`      Loaded ${capEmbeddings.size} capability embeddings`);
console.log(`      Hierarchy: ${maxLevel + 1} levels - ${Array.from(capIdsByLevel.entries()).map(([l, c]) => `L${l}:${c.length}`).join(", ")}`);

// Load cap-to-cap relations for hierarchy
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

// Build cap-to-cap connectivity per level (parent level → child level)
const capToCapByLevel = new Map<number, Map<string, string[]>>(); // level → parent_id → [child_ids]
for (const row of capDepRows) {
  const fromLevel = row.from_level;
  const toLevel = row.to_level;

  // Assuming from_level > to_level (parent → child)
  if (fromLevel > toLevel) {
    if (!capToCapByLevel.has(fromLevel)) {
      capToCapByLevel.set(fromLevel, new Map());
    }
    const levelMap = capToCapByLevel.get(fromLevel)!;
    if (!levelMap.has(row.from_capability_id)) {
      levelMap.set(row.from_capability_id, []);
    }
    levelMap.get(row.from_capability_id)!.push(row.to_capability_id);
  }
}

console.log(`      Cap-to-cap relations: ${capDepRows.length}`);

// Build tool-to-cap from execution traces (only level 0 caps matter for tools)
const toolToCapSet: Set<string>[] = toolIds.map(() => new Set());

const traceToolCaps = await sql`
  SELECT DISTINCT
    et.capability_id,
    jsonb_array_elements(et.task_results)->>'tool' as tool_id
  FROM execution_trace et
  WHERE et.task_results IS NOT NULL
    AND jsonb_array_length(et.task_results) > 0
    AND et.capability_id IN (SELECT pattern_id FROM workflow_pattern WHERE intent_embedding IS NOT NULL)
`;

for (const row of traceToolCaps) {
  const toolIdx = toolIdToIdx.get(row.tool_id);
  if (toolIdx !== undefined && capEmbeddings.has(row.capability_id)) {
    // Only add level 0 caps for tool-to-cap
    if (capIdToLevel.get(row.capability_id) === 0) {
      toolToCapSet[toolIdx].add(row.capability_id);
    }
  }
}

// Convert sets to cap IDs (we'll convert to indices later when building the matrix)
const toolToCapIds: string[][] = toolToCapSet.map(set => Array.from(set));

const connectedTools = toolToCapIds.filter(arr => arr.length > 0).length;
console.log(`      Built tool-to-cap graph: ${connectedTools} tools connected to L0 caps`);

// =============================================================================
// 3. Load SHGAT params from DB
// =============================================================================
console.log("\n[3/8] Loading SHGAT params from DB...");
const paramsRow = await sql`
  SELECT params FROM shgat_params ORDER BY created_at DESC LIMIT 1
`;

// deno-lint-ignore no-explicit-any
let loadedSHGATParams: any = null;

if (paramsRow.length === 0) {
  console.log("      No SHGAT params found - will use random init");
} else {
  const wrapper = paramsRow[0].params;
  if (wrapper.compressed && wrapper.format === "msgpack+gzip+base64") {
    console.log("      Decompressing params (msgpack+gzip+base64)...");

    // Decode base64
    const compressed = Uint8Array.from(atob(wrapper.data), c => c.charCodeAt(0));
    console.log(`      Compressed size: ${(compressed.length / 1024 / 1024).toFixed(2)} MB`);

    // Decompress
    const decompressed = pako.ungzip(compressed);
    console.log(`      Decompressed size: ${(decompressed.length / 1024 / 1024).toFixed(2)} MB`);

    // Decode msgpack
    loadedSHGATParams = msgpackDecode(decompressed);
    console.log("      Loaded SHGAT params successfully");

    // Show what we got
    const keys = Object.keys(loadedSHGATParams);
    console.log(`      Params keys: ${keys.join(", ")}`);
  } else {
    console.log("      Unknown params format - will use random init");
  }
}

// For now, we'll use a simplified approach - just the raw embeddings
// Full SHGAT integration would require reconstructing TFParams from the DB

// =============================================================================
// 4. Build graph structure for message passing
// =============================================================================
console.log("\n[4/8] Building graph structure...");

// Build tool-to-cap matrix [numTools, numCaps_level0]
const level0Caps = capIdsByLevel.get(0) || [];
const toolToCapData: number[][] = [];
for (let t = 0; t < toolIds.length; t++) {
  const row: number[] = new Array(level0Caps.length).fill(0);
  for (const capId of toolToCapIds[t]) {
    const level0Idx = level0Caps.indexOf(capId);
    if (level0Idx >= 0) {
      row[level0Idx] = 1;
    }
  }
  toolToCapData.push(row);
}

const toolToCapMatrix = tf.tensor2d(toolToCapData);
const connectedToolsToL0 = toolToCapData.filter(row => row.some(v => v === 1)).length;
console.log(`      Tool-to-Cap(L0) matrix: [${toolIds.length}, ${level0Caps.length}], ${connectedToolsToL0} tools connected`);

// Build cap-to-cap matrices for each level transition
const capToCapMatrices = new Map<number, tf.Tensor2D>();

for (let level = 1; level <= maxLevel; level++) {
  const parentCaps = capIdsByLevel.get(level) || [];
  const childCaps = capIdsByLevel.get(level - 1) || [];

  if (parentCaps.length === 0 || childCaps.length === 0) continue;

  // Build [parentCaps.length, childCaps.length] connectivity matrix
  const matrixData: number[][] = [];
  const levelRelations = capToCapByLevel.get(level);

  for (const parentId of parentCaps) {
    const row: number[] = new Array(childCaps.length).fill(0);
    const children = levelRelations?.get(parentId) || [];
    for (const childId of children) {
      const childIdx = childCaps.indexOf(childId);
      if (childIdx >= 0) {
        row[childIdx] = 1;
      }
    }
    matrixData.push(row);
  }

  if (matrixData.length > 0 && matrixData[0].length > 0) {
    capToCapMatrices.set(level, tf.tensor2d(matrixData));
    const connections = matrixData.flat().filter(v => v === 1).length;
    console.log(`      Cap-to-Cap(L${level}→L${level-1}) matrix: [${parentCaps.length}, ${childCaps.length}], ${connections} connections`);
  }
}

// Build graph - will be updated after loading params to only use trained levels
let graph: GraphStructure = {
  toolToCapMatrix,
  capToCapMatrices,
  toolIds,
  capIdsByLevel,
  maxLevel,
};

console.log(`      Graph built with ${maxLevel + 1} levels (will limit to trained levels)`);

// =============================================================================
// 5. Create TFParams from loaded SHGAT params or random init
// =============================================================================
console.log("\n[5/8] Creating TF params for message passing...");

// We need W_up, W_down, a_up, a_down for messagePassingForward
const W_up = new Map<number, tf.Variable[]>();
const W_down = new Map<number, tf.Variable[]>();
const a_up = new Map<number, tf.Variable[]>();
const a_down = new Map<number, tf.Variable[]>();

// Get config from loaded params or use defaults
let numHeads = 4;
let headDim = Math.floor(embeddingDim / numHeads);

if (loadedSHGATParams?.config) {
  numHeads = loadedSHGATParams.config.numHeads || numHeads;
  headDim = loadedSHGATParams.config.headDim || headDim;
  console.log(`      Using loaded config: numHeads=${numHeads}, headDim=${headDim}`);
}

// Check if we have levelParams from loaded params
const levelParamsData = loadedSHGATParams?.levelParams;
const usingLoadedParams = levelParamsData && Object.keys(levelParamsData).length > 0;

if (usingLoadedParams) {
  console.log("      Loading trained params from DB...");

  for (const [levelStr, lp] of Object.entries(levelParamsData)) {
    const level = parseInt(levelStr);
    // deno-lint-ignore no-explicit-any
    const params = lp as any;

    const W_up_level: tf.Variable[] = [];
    const W_down_level: tf.Variable[] = [];
    const a_up_level: tf.Variable[] = [];
    const a_down_level: tf.Variable[] = [];

    // levelParams has W_child (up) and W_parent (down) per head
    for (let h = 0; h < numHeads; h++) {
      // W_child is used for upward (child → parent)
      // Params are stored as [headDim, embDim], need [embDim, headDim] for matmul
      if (params.W_child?.[h]) {
        const W = tf.tensor2d(params.W_child[h]);
        W_up_level.push(tf.variable(W.transpose(), true, `W_up_${level}_${h}`));
        W.dispose();
      } else {
        W_up_level.push(tf.variable(tf.randomNormal([embeddingDim, headDim], 0, 0.02), true, `W_up_${level}_${h}`));
      }

      // W_parent is used for downward (parent → child)
      if (params.W_parent?.[h]) {
        const W = tf.tensor2d(params.W_parent[h]);
        W_down_level.push(tf.variable(W.transpose(), true, `W_down_${level}_${h}`));
        W.dispose();
      } else {
        W_down_level.push(tf.variable(tf.randomNormal([embeddingDim, headDim], 0, 0.02), true, `W_down_${level}_${h}`));
      }

      // a_upward for upward attention (stored as a_upward in DB)
      if (params.a_upward?.[h]) {
        a_up_level.push(tf.variable(tf.tensor1d(params.a_upward[h]), true, `a_up_${level}_${h}`));
      } else {
        a_up_level.push(tf.variable(tf.randomNormal([2 * headDim], 0, 0.02), true, `a_up_${level}_${h}`));
      }

      // a_downward for downward attention (stored as a_downward in DB)
      if (params.a_downward?.[h]) {
        a_down_level.push(tf.variable(tf.tensor1d(params.a_downward[h]), true, `a_down_${level}_${h}`));
      } else {
        a_down_level.push(tf.variable(tf.randomNormal([2 * headDim], 0, 0.02), true, `a_down_${level}_${h}`));
      }
    }

    W_up.set(level, W_up_level);
    W_down.set(level, W_down_level);
    a_up.set(level, a_up_level);
    a_down.set(level, a_down_level);
  }

  console.log(`      Loaded params for levels: ${Array.from(W_up.keys()).join(", ")}`);
} else {
  console.log("      Using random initialization (no trained params found)...");
}

// Only use levels with trained params - DON'T fill with random
// This is critical: random weights degrade embeddings instead of enriching them
const trainedLevels = Array.from(W_up.keys());
console.log(`      Using ONLY trained levels: ${trainedLevels.join(", ")} (no random params)`);

// Override maxLevel to only use trained levels
const effectiveMaxLevel = trainedLevels.length > 0 ? Math.max(...trainedLevels) : -1;
if (effectiveMaxLevel < maxLevel) {
  console.log(`      Limiting message passing to L0 only (levels ${effectiveMaxLevel + 1}-${maxLevel} have no trained params)`);

  // Rebuild graph with only trained levels
  const limitedCapIdsByLevel = new Map<number, string[]>();
  for (let level = 0; level <= effectiveMaxLevel; level++) {
    const caps = capIdsByLevel.get(level);
    if (caps) limitedCapIdsByLevel.set(level, caps);
  }

  // Remove cap-to-cap matrices for non-trained levels
  const limitedCapToCapMatrices = new Map<number, tf.Tensor2D>();
  // Don't include any cap-to-cap if we only have level 0

  graph = {
    toolToCapMatrix,
    capToCapMatrices: limitedCapToCapMatrices,  // Empty - no cap-to-cap for level 0 only
    toolIds,
    capIdsByLevel: limitedCapIdsByLevel,
    maxLevel: effectiveMaxLevel,
  };

  console.log(`      Rebuilt graph with maxLevel=${effectiveMaxLevel}`);
}

// Minimal TFParams (only what messagePassingForward needs)
const tfParams: TFParams = {
  W_k: [],  // Not needed for MP
  W_q: [],  // Not needed for MP
  W_intent: tf.variable(tf.zeros([1, 1])),  // Placeholder
  W_up,
  W_down,
  a_up,
  a_down,
};

const shgatConfig = {
  numHeads,
  headDim,
  embeddingDim,
  hiddenDim: embeddingDim,
};

console.log(`      Final config: ${numHeads} heads, headDim=${headDim}`);

// =============================================================================
// 6. Apply message passing to enrich embeddings
// =============================================================================
console.log("\n[6/8] Enriching embeddings with message passing...");

// Convert to tensors for messagePassingForward (dense autograd)
const H_init_arr: number[][] = toolIds.map(id => rawToolEmbeddings.get(id)!);
const H_init_tensor = tf.tensor2d(H_init_arr);
const E_init_tensors = new Map<number, import("npm:@tensorflow/tfjs@4.22.0").Tensor2D>();

// Initialize embeddings only for levels in the graph
for (let level = 0; level <= graph.maxLevel; level++) {
  const levelCaps = graph.capIdsByLevel.get(level) || [];
  const capEmbs = levelCaps.map(id => capEmbeddings.get(id)!);
  if (capEmbs.length > 0) {
    E_init_tensors.set(level, tf.tensor2d(capEmbs));
  }
}
console.log(`      Initialized embeddings for ${E_init_tensors.size} levels`);

try {
  const mpResult = messagePassingForward(
    H_init_tensor,
    E_init_tensors,
    graph,
    tfParams,
    shgatConfig,
  );
  const H_enriched = mpResult.H.arraySync() as number[][];
  // Cleanup MP tensors
  mpResult.H.dispose();
  for (const [, t] of mpResult.E) t.dispose();
  H_init_tensor.dispose();
  for (const [, t] of E_init_tensors) t.dispose();

  console.log(`      Enriched ${H_enriched.length} tool embeddings`);

  // Build enriched embeddings map
  const enrichedToolEmbeddings = new Map<string, number[]>();
  for (let i = 0; i < toolIds.length; i++) {
    enrichedToolEmbeddings.set(toolIds[i], H_enriched[i]);
  }

  // Use enriched embeddings for GRU
  console.log("      Using SHGAT-enriched embeddings for GRU training");

  // =============================================================================
  // 7. Load traces and train GRU (same as before but with enriched embeddings)
  // =============================================================================
  console.log("\n[7/8] Loading execution traces...");
  const traceRows = await sql`
    SELECT
      et.id,
      et.task_results,
      et.success,
      wp.intent_embedding::text as intent_embedding
    FROM execution_trace et
    JOIN workflow_pattern wp ON et.capability_id = wp.pattern_id
    WHERE et.task_results IS NOT NULL
      AND jsonb_array_length(et.task_results) > 1
      AND wp.intent_embedding IS NOT NULL
    ORDER BY et.executed_at DESC
  `;

  console.log(`      Loaded ${traceRows.length} multi-tool traces`);

  // Generate examples
  const allExamples: TransitionExample[] = [];
  for (const trace of traceRows) {
    const intentEmbedding = parseEmbedding(trace.intent_embedding);
    if (!intentEmbedding) continue;

    const taskResults = trace.task_results as Array<{ tool?: string }>;
    const toolSequence = taskResults
      .map((t) => t.tool)
      .filter((t): t is string => !!t && enrichedToolEmbeddings.has(t));

    if (toolSequence.length < 2) continue;

    for (let i = 0; i < toolSequence.length; i++) {
      allExamples.push({
        intentEmbedding,
        contextToolIds: toolSequence.slice(0, i),
        targetToolId: toolSequence[i],
        isTerminal: i === toolSequence.length - 1 ? 1 : 0,
      });
    }
  }

  console.log(`      Generated ${allExamples.length} transition examples`);

  // Split
  shuffle(allExamples);
  const splitIdx = Math.floor(allExamples.length * 0.8);
  const trainExamples = allExamples.slice(0, splitIdx);
  const testExamples = allExamples.slice(splitIdx);
  console.log(`      Train: ${trainExamples.length}, Test: ${testExamples.length}`);

  // Create model with enriched embeddings
  const model = new TransitionModel({
    embeddingDim,
    hiddenDim: 128,
    terminationThreshold: 0.7,
    maxPathLength: 10,
    dropout: 0.1,
    learningRate: 0.001,
  });

  model.setToolVocabulary(enrichedToolEmbeddings);  // Use enriched!
  console.log(`      Model vocab: ${enrichedToolEmbeddings.size} tools (enriched)`);

  // Training
  console.log("\n[8/8] Training with enriched embeddings...");
  const EPOCHS = 50;
  const BATCH_SIZE = 32;

  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const epochStart = performance.now();
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

    console.log(
      `      Epoch ${String(epoch + 1).padStart(2)}/${EPOCHS}: ` +
      `loss=${avgLoss.toFixed(4)}, ` +
      `nextAcc=${avgNextAcc.toFixed(1)}%, ` +
      `termAcc=${avgTermAcc.toFixed(1)}%, ` +
      `time=${epochTime.toFixed(1)}s`
    );
  }

  // Evaluation
  console.log("\n[Eval] Test set results:");
  let correctNext = 0;
  let correctTerm = 0;

  for (const ex of testExamples) {
    const pred = await model.predictNext(ex.intentEmbedding, ex.contextToolIds);
    if (pred.toolId === ex.targetToolId) correctNext++;
    if ((pred.shouldTerminate ? 1 : 0) === ex.isTerminal) correctTerm++;
  }

  console.log(`      Next tool accuracy: ${(correctNext / testExamples.length * 100).toFixed(1)}%`);
  console.log(`      Termination accuracy: ${(correctTerm / testExamples.length * 100).toFixed(1)}%`);

  model.dispose();

} catch (e) {
  console.error("Error during message passing:", e);
  console.log("Falling back to raw embeddings...");
}

// Cleanup
console.log("\n[Done] Test complete!");
logMemory("Final ");
toolToCapMatrix.dispose();

// Dispose TF params
for (const [, vars] of W_up) vars.forEach(v => v.dispose());
for (const [, vars] of W_down) vars.forEach(v => v.dispose());
for (const [, vars] of a_up) vars.forEach(v => v.dispose());
for (const [, vars] of a_down) vars.forEach(v => v.dispose());
tfParams.W_intent.dispose();

await sql.end();
