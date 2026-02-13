#!/usr/bin/env npx tsx
/**
 * GRU + SHGAT-TF End-to-End Benchmark
 *
 * Complete pipeline test:
 * 1. Load SHGAT params from DB (ALL levels: L0, L1, L2)
 * 2. Build graph structure with full hierarchy
 * 3. Enrich embeddings via SHGAT message passing (V ↔ E^0 ↔ E^1 ↔ E^2)
 * 4. Train CompactInformedGRU with enriched embeddings
 * 5. Evaluate: next tool accuracy, termination accuracy
 * 6. End-to-end path building benchmark
 *
 * Requires Node.js + tfjs-node (native C++ backend). Do NOT run with Deno.
 *
 * Usage:
 *   cd lib/gru
 *   NODE_OPTIONS="--max-old-space-size=8192" npx tsx src/benchmark-e2e.ts
 *
 * @module gru/benchmark-e2e
 */

import dotenv from "dotenv";
import postgres from "postgres";
import * as pako from "pako";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const N8N_DATA_DIR = resolve(__dirname, "../data");
const EXPANDED_VOCAB_PATH = resolve(N8N_DATA_DIR, "expanded-vocab.json");
const N8N_SHGAT_PAIRS_PATH = resolve(N8N_DATA_DIR, "n8n-shgat-contrastive-pairs.json");

// Load .env (Node.js compatible)
dotenv.config({ path: new URL("../../../.env", import.meta.url).pathname });

import { initTensorFlow, logMemory } from "./tf/backend.ts";
import { CompactInformedGRU } from "./transition/gru-model.ts";
import { computeBigramMatrix, computeJaccardMatrix } from "./transition/structural-bias.ts";
import type { ToolCapabilityMap, TransitionExample, VocabNode } from "./transition/types.ts";
import { buildDAGAwareExamples, formatKFoldMetric, generateKFolds } from "./training-utils.ts";
import type { TaskResultWithLayer } from "./training-utils.ts";
import { trainGRU } from "./training/train-loop.ts";
import type { GRUTrainingResult } from "./training/train-loop.ts";

// SHGAT adapter (pure JS — no TF.js dependency)
import { SHGATAdapter } from "../../shgat-for-gru/src/index.ts";
import type { GraphNode, OBTrainedParams } from "../../shgat-for-gru/src/types.ts";

// V→V co-occurrence enrichment (pure JS, from shgat-for-gru)
import {
  buildCooccurrenceFromWorkflows,
  v2vEnrich,
} from "../../shgat-for-gru/src/index.ts";

// =============================================================================
// Helpers
// =============================================================================

function parseEmbedding(embStr: string): number[] | null {
  if (!embStr) return null;
  if (embStr.startsWith("[")) return JSON.parse(embStr);
  const cleaned = embStr.replace(/^\[|\]$/g, "");
  return cleaned.split(",").map(Number);
}

// Seeded PRNG (mulberry32) for reproducible train/test splits
function seededRng(seed: number) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const SPLIT_SEED = parseInt(process.env["SEED"] || "42", 10);
const rng = seededRng(SPLIT_SEED);

function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// =============================================================================
// Main
// =============================================================================

const DATABASE_URL = process.env.DATABASE_URL ||
  "postgres://casys:Kx9mP2vL7nQ4wRzT@localhost:5432/casys";

// Optional: load SHGAT params from JSON file instead of DB
// Usage: SHGAT_PARAMS=path/to/shgat-params.json deno run ...
const SHGAT_PARAMS_PATH = process.env.SHGAT_PARAMS || "";

console.log("=== GRU + SHGAT-TF End-to-End Benchmark ===");
console.log(`    Date: ${new Date().toISOString()}`);
if (SHGAT_PARAMS_PATH) console.log(`    SHGAT params: ${SHGAT_PARAMS_PATH}`);
console.log();

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
console.log(`      ${rawToolEmbeddings.size} PML tools, dim=${embeddingDim}`);

// Load expanded vocab (Smithery MCP tools) — needed for n8n capability tool references
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
  console.log(
    `      + ${added} Smithery tools from expanded vocab → ${rawToolEmbeddings.size} total`,
  );
} else {
  console.log("      No expanded vocab found — PML-only (644 tools)");
}

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

// Inject n8n workflows as level-0 capabilities (hyperedges E^0)
// Each workflow = a capability with description embedding + tool members
// Cap at MAX_N8N_CAPS to keep incidence matrix manageable (memory: tools×caps×4B)
const MAX_N8N_CAPS = parseInt(process.env["MAX_N8N_CAPS"] || "99999", 10);
let n8nCapsAdded = 0;
if (existsSync(N8N_SHGAT_PAIRS_PATH)) {
  console.log(
    `      Loading n8n workflows as L1 capabilities / E^0 hyperedges (max=${MAX_N8N_CAPS})...`,
  );
  const n8nPairs: Array<{
    intentEmbedding: number[];
    positiveToolIds: string[];
    workflowId: number;
    workflowName: string;
  }> = JSON.parse(readFileSync(N8N_SHGAT_PAIRS_PATH, "utf-8"));

  // Score each pair by number of valid tools, take top-N richest workflows
  const scored = n8nPairs
    .map((pair) => ({
      pair,
      validTools: pair.positiveToolIds.filter((t) => toolIdToIdx.has(t)),
    }))
    .filter((s) => s.validTools.length >= 2)
    .sort((a, b) => b.validTools.length - a.validTools.length)
    .slice(0, MAX_N8N_CAPS);

  for (const { pair, validTools } of scored) {
    const capId = `n8n:wf:${pair.workflowId}`;
    capEmbeddings.set(capId, pair.intentEmbedding);
    capIdToLevel.set(capId, 0);
    if (!capIdsByLevel.has(0)) capIdsByLevel.set(0, []);
    capIdsByLevel.get(0)!.push(capId);

    // Connect tools → this capability
    for (const toolId of validTools) {
      const toolIdx = toolIdToIdx.get(toolId);
      if (toolIdx !== undefined) {
        toolToCapSet[toolIdx].add(capId);
      }
    }
    n8nCapsAdded++;
  }
  console.log(
    `      + ${n8nCapsAdded} n8n workflows as L1 capabilities (from ${n8nPairs.length} total, min 2 tools)`,
  );
  if (scored.length > 0) {
    console.log(
      `      Top n8n cap: ${scored[0].validTools.length} tools, bottom: ${
        scored[scored.length - 1].validTools.length
      } tools`,
    );
  }
}

const toolToCapIds: string[][] = toolToCapSet.map((set) => Array.from(set));
const connectedTools = toolToCapIds.filter((arr) => arr.length > 0).length;
console.log(
  `      ${connectedTools}/${toolIds.length} tools (L0) connected to L1 caps (PML + n8n)`,
);
console.log(`      ${capDepRows.length} cap-to-cap relations`);
console.log(
  `      Total L1 caps (E^0): ${(capIdsByLevel.get(0) || []).length} (${
    (capIdsByLevel.get(0) || []).length - n8nCapsAdded
  } PML + ${n8nCapsAdded} n8n workflows)`,
);

// Build VocabNode[] for higher-level nodes (capabilities L0, L1, L2, ...)
// L0 caps: children = tool IDs (from toolToCapSet, inverted)
const capToToolChildren = new Map<string, string[]>();
for (let t = 0; t < toolIds.length; t++) {
  for (const capId of toolToCapIds[t]) {
    if (!capToToolChildren.has(capId)) capToToolChildren.set(capId, []);
    capToToolChildren.get(capId)!.push(toolIds[t]);
  }
}

// L1+ caps: children = cap IDs of level below (from capToCapByLevel)
const capToCapChildren = new Map<string, string[]>();
for (const [_level, levelMap] of capToCapByLevel) {
  for (const [parentId, childIds] of levelMap) {
    capToCapChildren.set(parentId, childIds);
  }
}

// Build VocabNode[] sorted by level (L0 first, then L1, L2, ...)
const higherLevelNodes: VocabNode[] = [];
for (let level = 0; level <= maxLevel; level++) {
  const levelCaps = capIdsByLevel.get(level) || [];
  for (const capId of levelCaps) {
    const capEmb = capEmbeddings.get(capId);
    if (!capEmb) continue;

    // Determine children based on level
    let children: string[];
    if (level === 0) {
      children = capToToolChildren.get(capId) ?? [];
    } else {
      children = capToCapChildren.get(capId) ?? [];
    }

    // Skip caps with no children (setToolVocabulary requires known children)
    if (children.length === 0) continue;

    higherLevelNodes.push({
      id: capId,
      level: level + 1, // Shift up: GRU L0 = tools, L1 = L0 caps, L2 = L1 caps, etc.
      embedding: capEmb,
      children,
    });
  }
}
const n8nVocabNodes = higherLevelNodes.filter((n) => n.id.startsWith("n8n:wf:")).length;
console.log(
  `      VocabNodes: ${higherLevelNodes.length} higher-level (${n8nVocabNodes} n8n + ${
    higherLevelNodes.length - n8nVocabNodes
  } PML, L2+: ${higherLevelNodes.filter((n) => n.level >= 2).length})`,
);

// --- Step 3: Build graph structure ---
console.log("\n[3/9] Building graph structure (ALL levels)...");

const level0Caps = capIdsByLevel.get(0) || [];

// Build ToolCapabilityMap for CompactInformedGRU (flat binary matrix)
const toolToCapData: number[][] = [];
for (let t = 0; t < toolIds.length; t++) {
  const row: number[] = new Array(level0Caps.length).fill(0);
  for (const capId of toolToCapIds[t]) {
    const level0Idx = level0Caps.indexOf(capId);
    if (level0Idx >= 0) row[level0Idx] = 1;
  }
  toolToCapData.push(row);
}
const numCaps = level0Caps.length;
const toolCapFlatData = new Float32Array(toolIds.length * numCaps);
for (let t = 0; t < toolIds.length; t++) {
  for (let c = 0; c < numCaps; c++) {
    toolCapFlatData[t * numCaps + c] = toolToCapData[t][c];
  }
}
const toolCapMap: ToolCapabilityMap = {
  matrix: toolCapFlatData,
  numTools: toolIds.length,
  numCapabilities: numCaps,
};
console.log(`      ToolCapabilityMap: ${toolIds.length} tools x ${numCaps} caps`);
console.log(`      Graph: maxLevel=${maxLevel}, using ALL levels`);

// --- Step 4: Load SHGAT params via adapter ---
const shgatAdapter = new SHGATAdapter();

if (SHGAT_PARAMS_PATH && existsSync(SHGAT_PARAMS_PATH)) {
  console.log(`\n[4/9] Loading SHGAT params from file: ${SHGAT_PARAMS_PATH}`);
  const shgatExportConfig = shgatAdapter.loadParams(SHGAT_PARAMS_PATH);
  console.log(`      Config: numHeads=${shgatExportConfig.numHeads}, headDim=${shgatExportConfig.headDim}, embDim=${shgatExportConfig.embeddingDim}`);
} else {
  // --- Legacy: load from DB, convert to OBTrainedParams ---
  console.log("\n[4/9] Loading SHGAT params from DB...");
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
    process.exit(1);
  }

  const paramsFormat = paramsRow[0].format as string;
  const compressed = paramsRow[0].compressed_bytes as Uint8Array;
  console.log(`      Last updated: ${paramsRow[0].updated_at}`);
  console.log(`      Compressed: ${(compressed.length / 1024 / 1024).toFixed(1)}MB, format: ${paramsFormat}`);

  const decompressedBytes = pako.ungzip(compressed);
  // deno-lint-ignore no-explicit-any
  let loadedRaw: Record<string, any>;
  if (paramsFormat === "msgpack+gzip+base64") {
    const { decode: msgpackDecode } = await import("@msgpack/msgpack");
    loadedRaw = msgpackDecode(decompressedBytes) as Record<string, unknown>;
  } else {
    loadedRaw = JSON.parse(new TextDecoder().decode(decompressedBytes));
  }

  // Convert to OBTrainedParams format
  if ("W_up" in loadedRaw) {
    // Autograd format → convert (transposes W matrices)
    shgatAdapter.setParams(SHGATAdapter.convertAutogradToOB(loadedRaw));
  } else {
    // Legacy/OB format — use directly
    shgatAdapter.setParams(loadedRaw as OBTrainedParams);
  }
  const cfg = shgatAdapter.getConfig();
  console.log(`      Config: numHeads=${cfg.numHeads}, headDim=${cfg.headDim}`);
}

// --- Step 5: V→V co-occurrence enrichment (before V→E→V) ---
console.log("\n[5/11] V→V co-occurrence enrichment...");
const v2vStart = performance.now();

// Build co-occurrence from n8n workflow tool lists
const workflowToolLists: string[][] = [];
if (existsSync(N8N_SHGAT_PAIRS_PATH)) {
  const n8nPairsForV2V: Array<{ positiveToolIds: string[] }> = JSON.parse(
    readFileSync(N8N_SHGAT_PAIRS_PATH, "utf-8"),
  );
  for (const pair of n8nPairsForV2V) {
    workflowToolLists.push(pair.positiveToolIds);
  }
}
// Also add PML cap-to-tool connections as co-occurrence sources
for (const [, children] of capToToolChildren) {
  if (children.length >= 2) workflowToolLists.push(children);
}

const cooccurrence = buildCooccurrenceFromWorkflows(workflowToolLists, toolIdToIdx);
console.log(
  `      Built co-occurrence: ${cooccurrence.length} edges from ${workflowToolLists.length} workflows`,
);

// Apply V→V enrichment to raw tool embeddings
const H_raw: number[][] = toolIds.map((id) => rawToolEmbeddings.get(id)!);
const SKIP_V2V = process.env["SKIP_V2V"] === "true";
const H_v2v_enriched = SKIP_V2V ? H_raw : v2vEnrich(H_raw, cooccurrence, { residualWeight: 0.3 });

// Measure V→V enrichment delta
let v2vDelta = 0;
for (let i = 0; i < H_raw.length; i++) {
  for (let j = 0; j < H_raw[i].length; j++) {
    v2vDelta += Math.abs(H_v2v_enriched[i][j] - H_raw[i][j]);
  }
}
const v2vTime = ((performance.now() - v2vStart) / 1000).toFixed(2);
console.log(
  `      V→V enrichment: avg_delta=${(v2vDelta / H_raw.length).toFixed(4)}, ${
    SKIP_V2V ? "SKIPPED" : "applied"
  }, time=${v2vTime}s`,
);

// --- Step 6: Build SHGAT graph & enrich embeddings (V→E→V) ---
console.log("\n[6/11] Building graph & enriching embeddings (V→V enriched → V↔E^0↔E^1↔E^2)...");
const mpStart = performance.now();

// Build GraphNode[] from V→V-enriched tools + capability embeddings
const shgatGraphNodes: GraphNode[] = [];
for (let i = 0; i < toolIds.length; i++) {
  shgatGraphNodes.push({
    id: toolIds[i],
    embedding: H_v2v_enriched[i],
    children: [],
    level: 0,
  });
}
for (let level = 0; level <= maxLevel; level++) {
  const levelCaps = capIdsByLevel.get(level) || [];
  for (const capId of levelCaps) {
    const emb = capEmbeddings.get(capId);
    if (!emb) continue;
    const children = level === 0
      ? (capToToolChildren.get(capId) ?? [])
      : (capToCapChildren.get(capId) ?? []);
    if (children.length === 0) continue;
    shgatGraphNodes.push({ id: capId, embedding: emb, children, level });
  }
}

const shgatGraph = shgatAdapter.buildGraph(shgatGraphNodes);
console.log(
  `      Graph: ${shgatGraph.toolIds.length} tools, ${
    Array.from(shgatGraph.capIdsByLevel.entries())
      .map(([l, ids]) => `L${l}:${ids.length}`)
      .join(", ")
  } caps, maxLevel=${shgatGraph.maxLevel}`,
);

// Enrich embeddings via multi-head attention message passing
const { toolEmbeddings: enrichedToolEmbeddings, enrichmentMs } = shgatAdapter.enrichEmbeddings();

const mpTime = (enrichmentMs / 1000).toFixed(2);
console.log(`      Message passing complete in ${mpTime}s`);
console.log(`      Enriched ${enrichedToolEmbeddings.size} tool embeddings`);

// Measure enrichment quality
let totalDelta = 0;
let maxDelta = 0;
for (let i = 0; i < toolIds.length; i++) {
  const enriched = enrichedToolEmbeddings.get(toolIds[i])!;
  let delta = 0;
  for (let j = 0; j < enriched.length; j++) {
    delta += Math.abs(enriched[j] - H_v2v_enriched[i][j]);
  }
  totalDelta += delta;
  maxDelta = Math.max(maxDelta, delta);
}
const avgDelta = totalDelta / toolIds.length;
console.log(
  `      Embedding delta: avg=${avgDelta.toFixed(2)}, max=${maxDelta.toFixed(2)} (higher = more enrichment)`,
);

logMemory("      ");

// --- Step 7: Load traces & generate transition examples ---
console.log("\n[7/11] Loading execution traces...");
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
    AND jsonb_array_length(et.task_results) >= 1
    AND wp.intent_embedding IS NOT NULL
  ORDER BY et.executed_at DESC
`;

console.log(`      ${traceRows.length} traces (incl. single-tool)`);

const prodExamples: (TransitionExample & { _traceId: string })[] = [];
const tracePathsForEval: Array<{
  intentEmbedding: number[];
  actualPath: string[];
  traceId: string;
}> = [];
const singleToolSeen = new Set<string>();
let singleToolCount = 0, multiToolCount = 0;
let dagAwareCount = 0, linearFallbackCount = 0;

function embedHash(emb: number[]): string {
  return emb.slice(0, 8).map((v) => v.toFixed(4)).join(",");
}

const validToolIdSet = new Set(enrichedToolEmbeddings.keys());

for (const trace of traceRows) {
  const intentEmbedding = parseEmbedding(trace.intent_embedding);
  if (!intentEmbedding) continue;

  const taskResults = trace.task_results as TaskResultWithLayer[];

  // Use DAG-aware example generation (P0-1 fix)
  const traceResult = buildDAGAwareExamples(
    trace.id,
    intentEmbedding,
    taskResults,
    validToolIdSet,
    singleToolSeen,
    embedHash,
  );

  if (traceResult.isSingleTool) singleToolCount++;
  if (traceResult.isMultiTool) {
    multiToolCount++;
    // Check if this trace used DAG-aware context
    const hasLayers = taskResults.some((t: TaskResultWithLayer) =>
      (t.layer_index ?? t.layerIndex ?? -1) >= 0
    );
    if (hasLayers) dagAwareCount++;
    else linearFallbackCount++;

    // Also build the path for E2E eval (linear order for path comparison)
    const toolSequence = taskResults
      .map((t: TaskResultWithLayer) => t.tool)
      .filter((t): t is string => !!t && validToolIdSet.has(t));
    tracePathsForEval.push({ intentEmbedding, actualPath: toolSequence, traceId: trace.id });
  }

  prodExamples.push(...traceResult.examples);
}

console.log(
  `      Prod: ${prodExamples.length} examples (${singleToolCount} single, ${multiToolCount} multi-tool)`,
);
console.log(
  `      DAG-aware context: ${dagAwareCount} traces, linear fallback: ${linearFallbackCount} traces`,
);
console.log(`      ${tracePathsForEval.length} multi-tool traces for end-to-end eval`);

// Split prod into train/test BY TRACE (not by example) to avoid contamination
const uniqueTraceIds = [...new Set(prodExamples.map((ex) => ex._traceId))];
shuffle(uniqueTraceIds);
const traceSplitIdx = Math.floor(uniqueTraceIds.length * 0.8);
const trainTraceIds = new Set(uniqueTraceIds.slice(0, traceSplitIdx));
const testTraceIds = new Set(uniqueTraceIds.slice(traceSplitIdx));

const prodTrain = prodExamples.filter((ex) => trainTraceIds.has(ex._traceId));
const prodTest = prodExamples.filter((ex) => testTraceIds.has(ex._traceId));
const prodSplitPct = ((trainTraceIds.size / uniqueTraceIds.length) * 100).toFixed(0);
console.log(
  `      Prod split (by trace): ${trainTraceIds.size} train / ${testTraceIds.size} test traces  (${prodSplitPct}/${
    100 - +prodSplitPct
  } split, seed=${SPLIT_SEED})`,
);
console.log(
  `      Prod examples:         ${prodTrain.length} train / ${prodTest.length} test`,
);

// --- Step 7b: Load n8n augmentation data ---
const N8N_DATA_PATH_BIN = resolve(N8N_DATA_DIR, "n8n-training-examples.msgpack.gz");
const N8N_DATA_PATH_JSON = resolve(N8N_DATA_DIR, "n8n-training-examples.json");
const N8N_LOSS_WEIGHT = parseFloat(process.env["N8N_WEIGHT"] || "0.3");
const PROD_OVERSAMPLE = parseInt(process.env["PROD_OVERSAMPLE"] || "3", 10);

console.log(`\n[7b/11] Loading n8n augmentation data (weight=${N8N_LOSS_WEIGHT})...`);

let n8nExamples: TransitionExample[] = [];

// Helper: remap soft target probs from n8n tool ordering to model ordering
function remapProbs(
  probs: ArrayLike<number>,
  n8nToModelIdx: Map<number, number>,
  vocabSize: number,
): number[] | null {
  const remapped = new Array(vocabSize).fill(0);
  let total = 0;
  for (let i = 0; i < probs.length; i++) {
    if (probs[i] > 0) {
      const modelIdx = n8nToModelIdx.get(i);
      if (modelIdx !== undefined) {
        remapped[modelIdx] = probs[i];
        total += probs[i];
      }
    }
  }
  if (total > 0) {
    for (let i = 0; i < remapped.length; i++) remapped[i] /= total;
  }
  return total > 0 ? remapped : null;
}

if (existsSync(N8N_DATA_PATH_BIN)) {
  // Primary: msgpack+gzip format (fast, compact)
  console.log(`      Loading msgpack+gzip: ${N8N_DATA_PATH_BIN}`);
  const compressed = new Uint8Array(readFileSync(N8N_DATA_PATH_BIN));
  const decompressed = pako.ungzip(compressed);
  console.log(
    `      Compressed: ${(compressed.length / 1024 / 1024).toFixed(1)} MB → Decompressed: ${
      (decompressed.length / 1024 / 1024).toFixed(1)
    } MB`,
  );

  const { decode: msgpackDecode } = await import("@msgpack/msgpack");
  // deno-lint-ignore no-explicit-any
  const n8nData = msgpackDecode(decompressed) as any;
  const n8nToolIds: string[] = n8nData.mcpToolIds;
  const n8nToModelIdx = new Map<number, number>();
  for (let i = 0; i < n8nToolIds.length; i++) {
    const modelIdx = toolIdToIdx.get(n8nToolIds[i]);
    if (modelIdx !== undefined) n8nToModelIdx.set(i, modelIdx);
  }
  console.log(`      n8n vocab: ${n8nToolIds.length} tools, ${n8nToModelIdx.size} mapped to model`);

  // msgpack decodes Float32Array as Uint8Array (raw bytes) — reinterpret
  function asFloat32(raw: Uint8Array | Float32Array): Float32Array {
    if (raw instanceof Float32Array) return raw;
    const aligned = new Uint8Array(raw.byteLength);
    aligned.set(raw);
    return new Float32Array(aligned.buffer, 0, raw.byteLength / 4);
  }

  let rawCount = 0;
  for (const ex of n8nData.examples) {
    rawCount++;
    const targetToolId: string = ex.tid;
    const contextToolIds: string[] = ex.ctx;

    if (!enrichedToolEmbeddings.has(targetToolId)) continue;
    if (contextToolIds.some((id: string) => !enrichedToolEmbeddings.has(id))) continue;

    const probs = asFloat32(ex.probs as Uint8Array);
    const remapped = remapProbs(probs, n8nToModelIdx, toolIds.length);

    const ie = asFloat32(ex.ie as Uint8Array);
    n8nExamples.push({
      intentEmbedding: Array.from(ie),
      contextToolIds,
      targetToolId,
      isTerminal: ex.term,
      isSingleTool: false,
      softTargetProbs: remapped ?? undefined,
    });
  }

  console.log(`      n8n examples loaded: ${n8nExamples.length} (from ${rawCount} raw)`);
  // Free the large decompressed buffer (~510MB) before training
  // deno-lint-ignore no-explicit-any
  if ((globalThis as any).gc) {
    (globalThis as any).gc();
    console.log("      GC forced after msgpack load");
  }
} else if (existsSync(N8N_DATA_PATH_JSON)) {
  // Fallback: JSON format
  console.log(`      Falling back to JSON: ${N8N_DATA_PATH_JSON}`);
  const n8nRaw = readFileSync(N8N_DATA_PATH_JSON, "utf-8");
  // deno-lint-ignore no-explicit-any
  const n8nData = JSON.parse(n8nRaw) as any;
  const isSparse = n8nData.sparse === true;

  const n8nToolIds: string[] = n8nData.mcpToolIds;
  const n8nToModelIdx = new Map<number, number>();
  for (let i = 0; i < n8nToolIds.length; i++) {
    const modelIdx = toolIdToIdx.get(n8nToolIds[i]);
    if (modelIdx !== undefined) n8nToModelIdx.set(i, modelIdx);
  }

  for (const ex of n8nData.examples) {
    if (!enrichedToolEmbeddings.has(ex.targetToolId)) continue;
    if (ex.contextToolIds.some((id: string) => !enrichedToolEmbeddings.has(id))) continue;

    let remapped: number[] | null = null;
    if (isSparse && ex.sp) {
      const dense = new Array(n8nToolIds.length).fill(0);
      for (const [idx, prob] of ex.sp) dense[idx] = prob;
      remapped = remapProbs(dense, n8nToModelIdx, toolIds.length);
    } else if (ex.softTargetProbs) {
      remapped = remapProbs(ex.softTargetProbs, n8nToModelIdx, toolIds.length);
    }

    n8nExamples.push({
      intentEmbedding: ex.intentEmbedding,
      contextToolIds: ex.contextToolIds,
      targetToolId: ex.targetToolId,
      isTerminal: ex.isTerminal,
      isSingleTool: false,
      softTargetProbs: remapped ?? undefined,
    });
  }

  console.log(
    `      n8n examples loaded: ${n8nExamples.length} (from ${n8nData.examples.length} raw)`,
  );
} else {
  console.warn(`      WARNING: n8n data not found (tried msgpack.gz and json)`);
  console.warn(`      Continuing with production-only training.`);
}

// Split n8n into train/eval BY WORKFLOW (group by intentEmbedding hash)
function intentHash(emb: number[]): string {
  return emb.slice(0, 12).map((v) => v.toFixed(3)).join(",");
}

const n8nByWorkflow = new Map<string, TransitionExample[]>();
for (const ex of n8nExamples) {
  const key = intentHash(ex.intentEmbedding);
  if (!n8nByWorkflow.has(key)) n8nByWorkflow.set(key, []);
  n8nByWorkflow.get(key)!.push(ex);
}

const n8nWorkflowKeys = shuffle([...n8nByWorkflow.keys()]);
const n8nSplitIdx = Math.floor(n8nWorkflowKeys.length * 0.8);
const n8nTrainKeys = new Set(n8nWorkflowKeys.slice(0, n8nSplitIdx));
const n8nEvalKeys = new Set(n8nWorkflowKeys.slice(n8nSplitIdx));

const n8nTrain: TransitionExample[] = [];
const n8nEval: TransitionExample[] = [];
for (const [key, exs] of n8nByWorkflow) {
  if (n8nTrainKeys.has(key)) n8nTrain.push(...exs);
  else n8nEval.push(...exs);
}

const n8nSplitPct = ((n8nTrainKeys.size / n8nByWorkflow.size) * 100).toFixed(0);
console.log(
  `      n8n split (by workflow): ${n8nTrainKeys.size} train / ${n8nEvalKeys.size} eval workflows  (${n8nSplitPct}/${
    100 - +n8nSplitPct
  } split)`,
);
console.log(`      n8n examples:            ${n8nTrain.length} train / ${n8nEval.length} eval`);

// Build mixed training set (prod oversampled + n8n TRAIN only)
const oversampledProd: TransitionExample[] = [];
for (let r = 0; r < PROD_OVERSAMPLE; r++) {
  oversampledProd.push(...prodTrain);
}
const mixedTrain = [...oversampledProd, ...n8nTrain];
console.log(
  `      Oversampled prod: ${oversampledProd.length} (${PROD_OVERSAMPLE}x ${prodTrain.length})`,
);
console.log(
  `      Mixed total: ${mixedTrain.length} (${oversampledProd.length} prod + ${n8nTrain.length} n8n train)`,
);

// --- Step 7c: Structural bias (Jaccard + bigram) ---
console.log(`\n[7c/11] Computing structural bias...`);
const jaccardMatrix = computeJaccardMatrix(toolCapMap);
const allTraces: string[][] = [];
for (const trace of traceRows) {
  const taskResults = trace.task_results as Array<{ tool?: string }>;
  const toolSeq = taskResults.map((t) => t.tool).filter((t): t is string =>
    !!t && enrichedToolEmbeddings.has(t)
  );
  if (toolSeq.length >= 2) allTraces.push(toolSeq);
}
const bigramMatrix = computeBigramMatrix(allTraces, toolIdToIdx, toolIds.length);
console.log(
  `      Jaccard: ${toolIds.length}x${toolIds.length}, Bigram from ${allTraces.length} traces`,
);

// --- Step 8: Train GRU CompactInformedGRU (mixed prod+n8n) ---
const TERM_THRESHOLD = parseFloat(process.env["TERM_THRESHOLD"] || "0.5");
const FOCAL_GAMMA = parseFloat(process.env["FOCAL_GAMMA"] || "2.0");
const TEMP_START = parseFloat(process.env["TEMP_START"] || "0.20");
const TEMP_END = parseFloat(process.env["TEMP_END"] || "0.12");
const TERM_WEIGHT = parseFloat(process.env["TERM_WEIGHT"] || "10");

// --- Dataset summary ---
console.log(`\n${"=".repeat(70)}`);
console.log("  GRU DATASET SUMMARY");
console.log("=".repeat(70));
console.log(
  `  Graph:        ${toolIds.length} tools, ${embeddingDim}D embeddings (BGE-M3, enriched)`,
);
console.log(
  `  Capabilities: ${capEmbeddings.size} total (${n8nCapsAdded} n8n + ${
    capEmbeddings.size - n8nCapsAdded
  } PML)`,
);
console.log(`  ─── Production traces ───`);
console.log(
  `  Split:        by trace, seed=${SPLIT_SEED}  (${prodSplitPct}/${100 - +prodSplitPct})`,
);
console.log(`  Traces:       ${trainTraceIds.size} train / ${testTraceIds.size} test`);
console.log(`  Examples:     ${prodTrain.length} train / ${prodTest.length} test`);
console.log(
  `  Oversample:   ${PROD_OVERSAMPLE}x → ${oversampledProd.length} prod in training pool`,
);
console.log(`  ─── N8n soft targets ───`);
console.log(
  `  Split:        by workflow, seed=${SPLIT_SEED}  (${n8nSplitPct}/${100 - +n8nSplitPct})`,
);
console.log(`  Workflows:    ${n8nTrainKeys.size} train / ${n8nEvalKeys.size} eval`);
console.log(`  Examples:     ${n8nTrain.length} train / ${n8nEval.length} eval`);
console.log(`  ─── Mixed training pool ───`);
console.log(
  `  Total:        ${mixedTrain.length} (${oversampledProd.length} prod + ${n8nTrain.length} n8n)`,
);
console.log(`  N8n weight:   ${N8N_LOSS_WEIGHT}`);
console.log("=".repeat(70));

console.log(
  `\n[8/11] Training CompactInformedGRU (mixed prod+n8n, termThreshold=${TERM_THRESHOLD})...`,
);
console.log(`      Focal: gamma=${FOCAL_GAMMA}, n8nWeight=${N8N_LOSS_WEIGHT}`);
console.log(`      Temp annealing: ${TEMP_START} → ${TEMP_END}, termWeight=${TERM_WEIGHT}`);
const model = new CompactInformedGRU({
  embeddingDim,
  terminationThreshold: TERM_THRESHOLD,
  dropout: 0.4,
  learningRate: 0.001,
  focalGamma: FOCAL_GAMMA,
  temperatureStart: TEMP_START,
  temperatureEnd: TEMP_END,
  terminationLossWeight: TERM_WEIGHT,
  n8nLossWeight: N8N_LOSS_WEIGHT,
});

model.setToolVocabulary(enrichedToolEmbeddings, toolCapMap, higherLevelNodes);
model.setStructuralBias({ jaccardMatrix, bigramMatrix, numTools: toolIds.length });
const acceptedVocabNodes = model.getToolToIndex().size - enrichedToolEmbeddings.size;
console.log(
  `      Vocab: ${enrichedToolEmbeddings.size} tools (enriched) + ${acceptedVocabNodes} higher-level nodes = ${model.getToolToIndex().size} total`,
);
console.log(`      Structural bias: Jaccard + Bigram enabled`);

const EPOCHS = parseInt(process.env["EPOCHS"] || "30", 10);
const BATCH_SIZE = 32;
const GRU_WEIGHTS_PATH = process.env["GRU_WEIGHTS"] || "";
const GRU_SAVE_PATH = process.env["GRU_SAVE"] || "gru-weights-latest.json";

let gruResult: GRUTrainingResult;

if (GRU_WEIGHTS_PATH && existsSync(GRU_WEIGHTS_PATH)) {
  // --- Fast path: load pre-trained GRU weights (skip training) ---
  console.log(`\n      Loading GRU weights from ${GRU_WEIGHTS_PATH} (skipping training)...`);
  const saved = JSON.parse(readFileSync(GRU_WEIGHTS_PATH, "utf-8"));
  model.loadWeights(saved.weights);
  console.log(`      Loaded ${saved.weights.names.length} weight tensors`);
  console.log(
    `      Original training: ${saved.trainingResult?.bestEpoch ?? "?"} best epoch, Hit@1=${
      saved.trainingResult?.bestTestHit1?.toFixed(1) ?? "?"
    }%`,
  );

  // Quick eval on current test set to verify weights are valid
  const { evaluateGRU } = await import("./training/train-loop.ts");
  const ev = evaluateGRU(model, prodTest);
  console.log(
    `      Verification:  Hit@1=${ev.hit1.toFixed(1)}%  Hit@3=${ev.hit3.toFixed(1)}%  MRR=${
      ev.mrr.toFixed(3)
    }`,
  );

  gruResult = saved.trainingResult ?? {
    bestTestHit1: ev.hit1,
    bestMRR: ev.mrr,
    bestEpoch: 0,
    finalHit1: ev.hit1,
    finalHit3: ev.hit3,
    finalHit5: ev.hit5,
    finalMRR: ev.mrr,
    epochLog: [],
    trainTimeSec: 0,
  };
} else {
  // --- Train from scratch ---
  gruResult = trainGRU(
    model,
    { prodTrain, prodTest, n8nTrain },
    { epochs: EPOCHS, batchSize: BATCH_SIZE, prodOversample: PROD_OVERSAMPLE },
    shuffle,
  );

  // Save weights for next run
  try {
    const saved = {
      date: new Date().toISOString(),
      weights: model.exportWeights(),
      trainingResult: gruResult,
      config: { epochs: EPOCHS, batchSize: BATCH_SIZE, prodOversample: PROD_OVERSAMPLE },
    };
    writeFileSync(GRU_SAVE_PATH, JSON.stringify(saved));
    console.log(
      `      GRU weights saved to ${GRU_SAVE_PATH} (${
        (JSON.stringify(saved).length / 1024 / 1024).toFixed(1)
      }MB)`,
    );
    console.log(`      → Re-run with GRU_WEIGHTS=${GRU_SAVE_PATH} to skip training`);
  } catch (e) {
    console.warn(`      Failed to save GRU weights: ${e}`);
  }
}

const {
  bestTestHit1: bestTestNextAcc,
  bestMRR,
  bestEpoch,
  finalHit1,
  finalHit3,
  finalHit5,
  finalMRR,
  epochLog,
  trainTimeSec,
} = gruResult;
const trainTime = trainTimeSec.toFixed(1);
logMemory("      ");

// --- Setup SHGAT scoring via adapter (K-head multi-head attention) ---
const scoringMode = "K-head";

function shgatRetrieveTopK(
  intentEmb: number[],
  k: number,
): Array<{ toolId: string; score: number }> {
  return shgatAdapter.scoreTools(intentEmb, k).topK;
}

console.log(`\n      SHGAT scoring mode: ${scoringMode}`);

// --- Step 9: End-to-End Path Building Benchmark ---
console.log("\n[9/11] End-to-End Path Building Benchmark...");
console.log("      SHGAT firstTool -> step-by-step predictNext -> compare to actual trace");
console.log("      Evaluating on TEST traces only (split by trace, seed=" + SPLIT_SEED + ")\n");

// Filter to test-set traces only
const testTracePathsForEval = tracePathsForEval.filter((t) => testTraceIds.has(t.traceId));
console.log(
  `      ${testTracePathsForEval.length} test traces (from ${tracePathsForEval.length} total)`,
);

// --- Diagnostic: step-by-step with termination probs ---
console.log("      --- Termination Diagnostic (first 10 test traces) ---");
const diagSamples = testTracePathsForEval.slice(0, 10);
const allTermProbs: number[][] = []; // [step] -> list of probs across all traces

for (let t = 0; t < diagSamples.length; t++) {
  const { intentEmbedding, actualPath } = diagSamples[t];
  const stepProbs: string[] = [];

  for (let step = 0; step < actualPath.length; step++) {
    const context = actualPath.slice(0, step);
    const pred = model.predictNext(intentEmbedding, context);
    const isLastStep = step === actualPath.length - 1;
    const correctTool = pred.toolId === actualPath[step] ? "OK" : `!=${pred.toolId}`;
    stepProbs.push(
      `step${step}(ctx=${step}): termP=${pred.shouldTerminate ? "TERM" : "cont"} ` +
        `p=${pred.confidence.toFixed(3)} ` +
        `tool=${correctTool}${isLastStep ? " [SHOULD_TERM]" : ""}`,
    );

    if (!allTermProbs[step]) allTermProbs[step] = [];
  }
  console.log(`      [${t + 1}] actual=[${actualPath.join(" -> ")}]`);
  console.log(`           ${stepProbs.join("\n           ")}`);
}

// Raw termination probs via predictNextTopK (full ranking + termination prob)
console.log("\n      --- Raw termination probabilities ---");
for (let t = 0; t < Math.min(diagSamples.length, 5); t++) {
  const { intentEmbedding, actualPath } = diagSamples[t];
  const probs: string[] = [];

  for (let step = 0; step <= actualPath.length; step++) {
    const context = actualPath.slice(0, step);
    const pred = model.predictNextTopK(intentEmbedding, context, 1);
    const topTool = pred.ranked[0]?.toolId ?? "?";
    const isLast = step === actualPath.length;
    probs.push(
      `ctx=${step}: termP=${pred.terminationProb.toFixed(4)} top=${topTool}${
        isLast ? " [END]" : ` actual=${actualPath[step]}`
      }`,
    );
  }
  console.log(`      [${t + 1}] ${actualPath.join(" -> ")}`);
  console.log(`           ${probs.join("\n           ")}`);
}

// --- Standard E2E eval with buildPath ---
console.log("\n      --- E2E Path Building (test set only) ---");
let pathExactMatch = 0;
let pathFirstToolMatch = 0;
let pathLengthMatch = 0;
let totalPathLenDiff = 0;
let firstNCorrect = 0;

const maxSamples = testTracePathsForEval.length;
const sampleTraces = testTracePathsForEval;

for (let t = 0; t < sampleTraces.length; t++) {
  const { intentEmbedding, actualPath } = sampleTraces[t];
  const firstTool = actualPath[0];

  const predictedPath = await model.buildPath(intentEmbedding, firstTool);

  const exactMatch = predictedPath.length === actualPath.length &&
    predictedPath.every((tool, i) => tool === actualPath[i]);
  if (exactMatch) pathExactMatch++;
  if (predictedPath[0] === actualPath[0]) pathFirstToolMatch++;
  if (predictedPath.length === actualPath.length) pathLengthMatch++;
  totalPathLenDiff += Math.abs(predictedPath.length - actualPath.length);

  const minLen = Math.min(predictedPath.length, actualPath.length);
  let firstNMatch = true;
  for (let i = 0; i < minLen; i++) {
    if (predictedPath[i] !== actualPath[i]) {
      firstNMatch = false;
      break;
    }
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
console.log(
  `      Exact path match: ${pathExactMatch}/${maxSamples} (${
    (pathExactMatch / maxSamples * 100).toFixed(1)
  }%)`,
);
console.log(
  `      First tool match: ${pathFirstToolMatch}/${maxSamples} (${
    (pathFirstToolMatch / maxSamples * 100).toFixed(1)
  }%)`,
);
console.log(
  `      Length match:     ${pathLengthMatch}/${maxSamples} (${
    (pathLengthMatch / maxSamples * 100).toFixed(1)
  }%)`,
);
console.log(
  `      First-N correct:  ${firstNCorrect}/${maxSamples} (${
    (firstNCorrect / maxSamples * 100).toFixed(1)
  }%)`,
);
console.log(`      Avg length diff:  ${(totalPathLenDiff / maxSamples).toFixed(2)} tools`);

// --- Beam Search E2E eval ---
const BEAM_WIDTH = parseInt(process.env["BEAM_WIDTH"] || "3");
console.log(`\n      --- E2E Beam Search (width=${BEAM_WIDTH}) ---`);
let beamExactMatch = 0;
let beamFirstNCorrect = 0;
let beamTotalLenDiff = 0;

for (let t = 0; t < sampleTraces.length; t++) {
  const { intentEmbedding, actualPath } = sampleTraces[t];
  const firstTool = actualPath[0];

  const beamResults = model.buildPathBeam(intentEmbedding, firstTool, BEAM_WIDTH);
  const predictedPath = beamResults[0]?.path ?? [firstTool];

  const exactMatch = predictedPath.length === actualPath.length &&
    predictedPath.every((tool, i) => tool === actualPath[i]);
  if (exactMatch) beamExactMatch++;
  beamTotalLenDiff += Math.abs(predictedPath.length - actualPath.length);

  const minLen = Math.min(predictedPath.length, actualPath.length);
  let firstNMatch = true;
  for (let i = 0; i < minLen; i++) {
    if (predictedPath[i] !== actualPath[i]) {
      firstNMatch = false;
      break;
    }
  }
  if (firstNMatch) beamFirstNCorrect++;

  if (t < 5) {
    const match = exactMatch ? "EXACT" : predictedPath[1] === actualPath[1] ? "PARTIAL" : "MISS";
    console.log(
      `      [${String(t + 1).padStart(2)}] ${match} (score=${
        beamResults[0]?.score.toFixed(4) ?? "?"
      })`,
    );
    console.log(`           Actual:    [${actualPath.join(" -> ")}]`);
    console.log(`           Beam:      [${predictedPath.join(" -> ")}]`);
  }
}

console.log(`\n      --- Beam vs Greedy (${maxSamples} traces) ---`);
console.log(
  `      Greedy exact:    ${pathExactMatch}/${maxSamples} (${
    (pathExactMatch / maxSamples * 100).toFixed(1)
  }%)`,
);
console.log(
  `      Beam exact:      ${beamExactMatch}/${maxSamples} (${
    (beamExactMatch / maxSamples * 100).toFixed(1)
  }%)`,
);
console.log(
  `      Greedy first-N:  ${firstNCorrect}/${maxSamples} (${
    (firstNCorrect / maxSamples * 100).toFixed(1)
  }%)`,
);
console.log(
  `      Beam first-N:    ${beamFirstNCorrect}/${maxSamples} (${
    (beamFirstNCorrect / maxSamples * 100).toFixed(1)
  }%)`,
);
console.log(`      Greedy len diff: ${(totalPathLenDiff / maxSamples).toFixed(2)}`);
console.log(`      Beam len diff:   ${(beamTotalLenDiff / maxSamples).toFixed(2)}`);

// --- Step 9b: TRUE E2E — Compare SHGAT-first vs GRU-first vs Multi-start ---
console.log(`\n      --- 9b) True E2E: 3 modes compared (no ground truth for first tool) ---\n`);

// Counters for each mode
const modes = {
  shgat: {
    label: "SHGAT-first",
    first1: 0,
    first3: 0,
    greedy: 0,
    firstN: 0,
    beam: 0,
    beamFirstN: 0,
  },
  gru: { label: "GRU-first", first1: 0, first3: 0, greedy: 0, firstN: 0, beam: 0, beamFirstN: 0 },
  multi: {
    label: "Multi-start",
    first1: 0,
    first3: 0,
    greedy: 0,
    firstN: 0,
    beam: 0,
    beamFirstN: 0,
  },
};

function pathExact(pred: string[], actual: string[]) {
  return pred.length === actual.length && pred.every((t, i) => t === actual[i]);
}
function pathFirstN(pred: string[], actual: string[]) {
  const minLen = Math.min(pred.length, actual.length);
  for (let i = 0; i < minLen; i++) if (pred[i] !== actual[i]) return false;
  return true;
}

for (let t = 0; t < sampleTraces.length; t++) {
  const { intentEmbedding, actualPath } = sampleTraces[t];

  // --- Mode A: SHGAT picks first tool ---
  const shgatTop = shgatRetrieveTopK(intentEmbedding, 3);
  const shgatFirst = shgatTop[0].toolId;
  const shgatTop3Ids = shgatTop.map((x) => x.toolId);
  if (shgatFirst === actualPath[0]) modes.shgat.first1++;
  if (shgatTop3Ids.includes(actualPath[0])) modes.shgat.first3++;
  const shgatGreedy = await model.buildPath(intentEmbedding, shgatFirst);
  const shgatBeamRes = model.buildPathBeam(intentEmbedding, shgatFirst, BEAM_WIDTH);
  const shgatBeam = shgatBeamRes[0]?.path ?? [shgatFirst];
  if (pathExact(shgatGreedy, actualPath)) modes.shgat.greedy++;
  if (pathFirstN(shgatGreedy, actualPath)) modes.shgat.firstN++;
  if (pathExact(shgatBeam, actualPath)) modes.shgat.beam++;
  if (pathFirstN(shgatBeam, actualPath)) modes.shgat.beamFirstN++;

  // --- Mode B: GRU picks first tool (empty context) ---
  const gruAutoStart = model.buildPathAutoStart(intentEmbedding);
  const gruFirst = gruAutoStart.path[0] ?? "";
  const gruTop3Ids = gruAutoStart.firstToolRanked.slice(0, 3).map((x) => x.toolId);
  if (gruFirst === actualPath[0]) modes.gru.first1++;
  if (gruTop3Ids.includes(actualPath[0])) modes.gru.first3++;
  const gruGreedy = gruAutoStart.path;
  const gruBeamRes = gruFirst ? model.buildPathBeam(intentEmbedding, gruFirst, BEAM_WIDTH) : [];
  const gruBeam = gruBeamRes[0]?.path ?? gruGreedy;
  if (pathExact(gruGreedy, actualPath)) modes.gru.greedy++;
  if (pathFirstN(gruGreedy, actualPath)) modes.gru.firstN++;
  if (pathExact(gruBeam, actualPath)) modes.gru.beam++;
  if (pathFirstN(gruBeam, actualPath)) modes.gru.beamFirstN++;

  // --- Mode C: Multi-start beam (GRU top-3 starts) ---
  const multiResults = model.buildPathBeamMultiStart(intentEmbedding, 3, BEAM_WIDTH);
  const multiFirst = multiResults[0]?.startTool ?? "";
  const multiPath = multiResults[0]?.path ?? [];
  const multiTop3Starts = [...new Set(multiResults.slice(0, 3).map((r) => r.startTool))];
  if (multiFirst === actualPath[0]) modes.multi.first1++;
  if (multiTop3Starts.includes(actualPath[0])) modes.multi.first3++;
  if (pathExact(multiPath, actualPath)) modes.multi.greedy++; // "greedy" = best multi-start
  if (pathFirstN(multiPath, actualPath)) modes.multi.firstN++;
  // For multi-start, beam IS the mode — use same metrics
  modes.multi.beam = modes.multi.greedy;
  modes.multi.beamFirstN = modes.multi.firstN;

  if (t < 8) {
    console.log(
      `      [${String(t + 1).padStart(2)}] "${sampleTraces[t].actualPath.join(" -> ")}"`,
    );
    console.log(
      `           SHGAT→GRU:  [${shgatGreedy.join(" -> ")}] ${
        pathExact(shgatGreedy, actualPath) ? "EXACT" : ""
      }`,
    );
    console.log(
      `           GRU-first:  [${gruGreedy.join(" -> ")}] ${
        pathExact(gruGreedy, actualPath) ? "EXACT" : ""
      }`,
    );
    console.log(
      `           Multi-start:[${multiPath.join(" -> ")}] ${
        pathExact(multiPath, actualPath) ? "EXACT" : ""
      }`,
    );
  }
}

const n = sampleTraces.length;
console.log(`\n      --- True E2E Comparison (${n} test traces) ---`);
console.log(`      ${"Mode".padEnd(15)} | 1st@1  | 1st@3  | Greedy | First-N | Beam@${BEAM_WIDTH}`);
console.log(`      ${"-".repeat(70)}`);
for (const m of [modes.shgat, modes.gru, modes.multi]) {
  console.log(
    `      ${m.label.padEnd(15)} | ${(m.first1 / n * 100).toFixed(1).padStart(5)}% | ${
      (m.first3 / n * 100).toFixed(1).padStart(5)
    }% | ${(m.greedy / n * 100).toFixed(1).padStart(5)}% | ${
      (m.firstN / n * 100).toFixed(1).padStart(6)
    }% | ${(m.beam / n * 100).toFixed(1).padStart(5)}%`,
  );
}

// --- Step 9c: n8n EVAL — generalization to unseen workflows ---
console.log(
  `\n      --- 9c) n8n Generalization Eval (${n8nEval.length} held-out examples, ${n8nEvalKeys.size} workflows) ---`,
);

if (n8nEval.length > 0) {
  let n8nNextCorrect = 0;
  let n8nNextTop3 = 0;
  let n8nNextTop5 = 0;
  let n8nTermCorrect = 0;
  let n8nMRRSum = 0;
  let n8nTotal = 0;

  // Per-step evaluation: does the GRU predict the right next tool?
  for (const ex of n8nEval) {
    const pred = model.predictNextTopK(ex.intentEmbedding, ex.contextToolIds, 10);
    n8nTotal++;

    const rank = pred.ranked.findIndex((r) => r.toolId === ex.targetToolId);
    if (rank === 0) n8nNextCorrect++;
    if (rank >= 0 && rank < 3) n8nNextTop3++;
    if (rank >= 0 && rank < 5) n8nNextTop5++;
    if (rank >= 0) n8nMRRSum += 1 / (rank + 1);
    if ((pred.shouldTerminate ? 1 : 0) === ex.isTerminal) n8nTermCorrect++;
  }

  const n8nMRR = n8nTotal > 0 ? n8nMRRSum / n8nTotal : 0;
  console.log(
    `      n8n Hit@1:           ${n8nNextCorrect}/${n8nTotal} (${
      (n8nNextCorrect / n8nTotal * 100).toFixed(1)
    }%)`,
  );
  console.log(
    `      n8n Hit@3:           ${n8nNextTop3}/${n8nTotal} (${
      (n8nNextTop3 / n8nTotal * 100).toFixed(1)
    }%)`,
  );
  console.log(
    `      n8n Hit@5:           ${n8nNextTop5}/${n8nTotal} (${
      (n8nNextTop5 / n8nTotal * 100).toFixed(1)
    }%)`,
  );
  console.log(
    `      n8n MRR:             ${n8nMRR.toFixed(3)}`,
  );
  console.log(
    `      n8n termination:     ${n8nTermCorrect}/${n8nTotal} (${
      (n8nTermCorrect / n8nTotal * 100).toFixed(1)
    }%)`,
  );

  // Full path evaluation: reconstruct workflows from eval examples and test E2E
  // Group n8n eval by workflow (same intentEmbedding = same workflow)
  const n8nEvalWorkflows = new Map<
    string,
    { intentEmbedding: number[]; steps: Array<{ context: string[]; target: string }> }
  >();
  for (const ex of n8nEval) {
    const key = intentHash(ex.intentEmbedding);
    if (!n8nEvalWorkflows.has(key)) {
      n8nEvalWorkflows.set(key, { intentEmbedding: ex.intentEmbedding, steps: [] });
    }
    n8nEvalWorkflows.get(key)!.steps.push({ context: ex.contextToolIds, target: ex.targetToolId });
  }

  // Sort steps by context length to reconstruct the workflow order
  let n8nPathExact = 0;
  let n8nPathFirstToolOk = 0;
  let n8nPathToolSetOk = 0;
  let n8nWfCount = 0;

  for (const [_key, wf] of n8nEvalWorkflows) {
    wf.steps.sort((a, b) => a.context.length - b.context.length);
    // Reconstruct actual path: first step's target is tool[0], then tool[1], etc.
    const actualPath = wf.steps.map((s) => s.target);
    if (actualPath.length < 2) continue;
    n8nWfCount++;

    // SHGAT picks the first tool
    const topTools = shgatRetrieveTopK(wf.intentEmbedding, 1);
    const shgatFirst = topTools[0].toolId;

    // GRU builds path
    const predictedPath = await model.buildPath(wf.intentEmbedding, shgatFirst);

    const exact = predictedPath.length === actualPath.length &&
      predictedPath.every((t, i) => t === actualPath[i]);
    if (exact) n8nPathExact++;
    if (shgatFirst === actualPath[0]) n8nPathFirstToolOk++;

    // Tool set match (same tools, maybe different order)
    const predSet = new Set(predictedPath);
    const actualSet = new Set(actualPath);
    if (predSet.size === actualSet.size && [...actualSet].every((t) => predSet.has(t))) {
      n8nPathToolSetOk++;
    }

    if (n8nWfCount <= 10) {
      const firstOk = shgatFirst === actualPath[0] ? "OK" : `MISS(${shgatFirst})`;
      console.log(`      [${n8nWfCount}] first=${firstOk} ${exact ? "EXACT" : "MISS"}`);
      console.log(`           n8n actual:  [${actualPath.join(" -> ")}]`);
      console.log(`           SHGAT→GRU:   [${predictedPath.join(" -> ")}]`);
    }
  }

  if (n8nWfCount > 0) {
    console.log(`\n      --- n8n Workflow E2E (${n8nWfCount} multi-step workflows) ---`);
    console.log(
      `      First tool correct:  ${n8nPathFirstToolOk}/${n8nWfCount} (${
        (n8nPathFirstToolOk / n8nWfCount * 100).toFixed(1)
      }%)`,
    );
    console.log(
      `      Path exact match:    ${n8nPathExact}/${n8nWfCount} (${
        (n8nPathExact / n8nWfCount * 100).toFixed(1)
      }%)`,
    );
    console.log(
      `      Tool set match:      ${n8nPathToolSetOk}/${n8nWfCount} (${
        (n8nPathToolSetOk / n8nWfCount * 100).toFixed(1)
      }%)`,
    );
  }
} else {
  console.log(`      SKIP: no n8n eval data`);
}

// --- Step 10/11: Custom Intent Qualitative Test ---
console.log(`\n[10] Custom Intent Qualitative Test (scoring: ${scoringMode})...`);
console.log(`     SHGAT ${scoringMode} retrieval → GRU path building → qualitative assessment\n`);

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
      const trace = Array.isArray(row.example_trace)
        ? row.example_trace
        : JSON.parse(row.example_trace);
      if (Array.isArray(trace)) {
        exampleStr = trace.map((t: { tool?: string }) => t.tool || "?").join(" -> ");
      }
    } catch { /* ignore */ }
  }

  console.log(`      [${i + 1}] "${row.description}"`);
  console.log(
    `           SHGAT top-3: ${
      topTools.slice(0, 3).map((t) => `${t.toolId}(${t.score.toFixed(3)})`).join(", ")
    }`,
  );
  console.log(`           Predicted:   [${predictedPath.join(" -> ")}]`);
  console.log(`           DB example:  [${exampleStr}]`);
}

// --- Part B: Synthetic custom intents ---
console.log("\n      --- B) Synthetic custom intents (novel scenarios) ---");

const customIntents: Array<{
  name: string;
  toolHints: string[]; // tools to average for synthetic intent
  expectedPattern: string; // human description of expected behavior
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
  const matchedHints = predictedPath.filter((t) => hintSet.has(t)).length;
  const coverage = matchedHints / ci.toolHints.length;
  const verdict = coverage >= 0.8 ? "GOOD" : coverage >= 0.5 ? "PARTIAL" : "MISS";
  if (coverage >= 0.5) syntheticHits++;

  console.log(
    `      [${i + 1}] "${ci.name}" → ${verdict} (${(coverage * 100).toFixed(0)}% tool coverage)`,
  );
  console.log(
    `           SHGAT top-3: ${
      topTools.slice(0, 3).map((t) => `${t.toolId}(${t.score.toFixed(3)})`).join(", ")
    }`,
  );
  console.log(`           Predicted:   [${predictedPath.join(" -> ")}]`);
  console.log(`           Expected:    [${ci.expectedPattern}]`);
}

console.log(
  `\n      Synthetic intent coverage: ${syntheticHits}/${customIntents.length} (${
    (syntheticHits / customIntents.length * 100).toFixed(0)
  }% ≥50% tool match)`,
);

// --- Summary ---
console.log(
  `\n=== SUMMARY (termThreshold=${TERM_THRESHOLD}, shgatScoring=${scoringMode}, seed=${SPLIT_SEED}) ===`,
);
console.log(`  SHGAT levels used:       L0, L1, L2 (all trained)`);
console.log(`  SHGAT scoring:           ${scoringMode}`);
console.log(`  Message passing:         V <-> E^0 <-> E^1 <-> E^2`);
console.log(`  MP time:                 ${mpTime}s`);
console.log(`  Embedding delta (avg):   ${avgDelta.toFixed(2)}`);
console.log(
  `  Training:                ${mixedTrain.length} mixed (${oversampledProd.length} prod ${PROD_OVERSAMPLE}x + ${n8nExamples.length} n8n)`,
);
console.log(`  n8n weight:              ${N8N_LOSS_WEIGHT}`);
console.log(`  Structural bias:         Jaccard + Bigram`);
console.log(
  `  Context mode:            DAG-aware (${dagAwareCount} traces) + linear fallback (${linearFallbackCount} traces)`,
);
console.log(
  `  Split:                   by trace, seed=${SPLIT_SEED} (${trainTraceIds.size} train / ${testTraceIds.size} test)`,
);
console.log(`  Test examples:           ${prodTest.length} (prod-only)`);
console.log(`  Best test Hit@1:         ${bestTestNextAcc.toFixed(1)}% (epoch ${bestEpoch})`);
console.log(`  Best MRR:                ${bestMRR.toFixed(3)}`);
console.log(`  Final Hit@1:             ${finalHit1.toFixed(1)}%`);
console.log(`  Final Hit@3:             ${finalHit3.toFixed(1)}%`);
console.log(`  Final Hit@5:             ${finalHit5.toFixed(1)}%`);
console.log(`  Final MRR:               ${finalMRR.toFixed(3)}`);
console.log(
  `  E2E greedy exact:        ${
    (pathExactMatch / maxSamples * 100).toFixed(1)
  }% (${maxSamples} test traces)`,
);
console.log(`  E2E greedy first-N:      ${(firstNCorrect / maxSamples * 100).toFixed(1)}%`);
console.log(
  `  E2E beam(${BEAM_WIDTH}) exact:       ${(beamExactMatch / maxSamples * 100).toFixed(1)}%`,
);
console.log(
  `  E2E beam(${BEAM_WIDTH}) first-N:      ${(beamFirstNCorrect / maxSamples * 100).toFixed(1)}%`,
);
console.log(
  `  E2E avg length diff:     greedy=${(totalPathLenDiff / maxSamples).toFixed(2)}, beam=${
    (beamTotalLenDiff / maxSamples).toFixed(2)
  }`,
);
console.log(`  --- True E2E (no ground truth first tool) ---`);
console.log(`  ${"Mode".padEnd(15)} | 1st@1  | 1st@3  | Greedy | First-N | Beam@${BEAM_WIDTH}`);
console.log(`  ${"-".repeat(70)}`);
for (const m of [modes.shgat, modes.gru, modes.multi]) {
  console.log(
    `  ${m.label.padEnd(15)} | ${(m.first1 / n * 100).toFixed(1).padStart(5)}% | ${
      (m.first3 / n * 100).toFixed(1).padStart(5)
    }% | ${(m.greedy / n * 100).toFixed(1).padStart(5)}% | ${
      (m.firstN / n * 100).toFixed(1).padStart(6)
    }% | ${(m.beam / n * 100).toFixed(1).padStart(5)}%`,
  );
}
console.log(`  --- n8n Generalization (held-out workflows) ---`);
console.log(`  n8n eval examples:       ${n8nEval.length} (${n8nEvalKeys.size} workflows)`);
console.log(
  `  Custom intents coverage: ${syntheticHits}/${customIntents.length} synthetic (≥50% tool match)`,
);
console.log(`  Named intents tested:    ${namedIntentRows.length} from DB`);
console.log(`  Training time:           ${trainTime}s`);
logMemory("  ");

// --- Step 11: K-fold Cross-Validation (P0-2) ---
const K_FOLDS = parseInt(process.env["K_FOLDS"] || "5", 10);
const RUN_KFOLD = process.env["KFOLD"] !== "false"; // enabled by default, set KFOLD=false to skip

if (RUN_KFOLD && K_FOLDS >= 2) {
  console.log(`\n=== K-FOLD CROSS-VALIDATION (K=${K_FOLDS}, seed=${SPLIT_SEED}) ===`);
  console.log(`    Re-using same seeded shuffle for reproducible folds\n`);

  // Generate K folds from ALL unique trace IDs
  const folds = generateKFolds(uniqueTraceIds, K_FOLDS, shuffle);

  // Metrics accumulators (per fold)
  const foldNextAcc: number[] = [];
  const foldTermAcc: number[] = [];
  const foldHit1: number[] = [];
  const foldHit3: number[] = [];
  const foldMRR: number[] = [];
  const foldBeamExact: number[] = [];

  for (let f = 0; f < folds.length; f++) {
    const fold = folds[f];
    const foldTrain = prodExamples.filter((ex) => fold.trainTraceIds.has(ex._traceId));
    const foldTest = prodExamples.filter((ex) => fold.testTraceIds.has(ex._traceId));

    // Create fresh model for this fold
    const foldModel = new CompactInformedGRU({
      embeddingDim,
      terminationThreshold: TERM_THRESHOLD,
      dropout: 0.4,
      learningRate: 0.001,
      focalGamma: FOCAL_GAMMA,
      temperatureStart: TEMP_START,
      temperatureEnd: TEMP_END,
      terminationLossWeight: TERM_WEIGHT,
      n8nLossWeight: N8N_LOSS_WEIGHT,
    });
    foldModel.setToolVocabulary(enrichedToolEmbeddings, toolCapMap, higherLevelNodes);
    foldModel.setStructuralBias({ jaccardMatrix, bigramMatrix, numTools: toolIds.length });

    // Train (quiet — no per-epoch logging)
    const foldResult = trainGRU(
      foldModel,
      { prodTrain: foldTrain, prodTest: foldTest, n8nTrain },
      { epochs: EPOCHS, batchSize: BATCH_SIZE, prodOversample: PROD_OVERSAMPLE },
      shuffle,
      false,
    );

    const foldNextAccVal = foldResult.finalHit1;
    const foldTermAccVal = foldResult.epochLog[foldResult.epochLog.length - 1]?.testTerm ?? 0;
    const foldHit1Val = foldResult.finalHit1;
    const foldHit3Val = foldResult.finalHit3;
    const foldMRRVal = foldResult.finalMRR;

    // Beam eval on fold test traces
    const foldTestPaths = tracePathsForEval.filter((t) => fold.testTraceIds.has(t.traceId));
    let foldBeamExactCount = 0;
    for (const { intentEmbedding: ie, actualPath: ap } of foldTestPaths) {
      const beamRes = foldModel.buildPathBeam(ie, ap[0], BEAM_WIDTH);
      const bp = beamRes[0]?.path ?? [ap[0]];
      if (bp.length === ap.length && bp.every((t, i) => t === ap[i])) foldBeamExactCount++;
    }
    const foldBeamExactVal = foldTestPaths.length > 0
      ? (foldBeamExactCount / foldTestPaths.length) * 100
      : 0;

    foldNextAcc.push(foldNextAccVal);
    foldTermAcc.push(foldTermAccVal);
    foldHit1.push(foldHit1Val);
    foldHit3.push(foldHit3Val);
    foldMRR.push(foldMRRVal);
    foldBeamExact.push(foldBeamExactVal);

    console.log(
      `    Fold ${f + 1}/${K_FOLDS}: ` +
        `nextAcc=${foldNextAccVal.toFixed(1)}%, termAcc=${foldTermAccVal.toFixed(1)}%, ` +
        `Hit@1=${foldHit1Val.toFixed(1)}%, Hit@3=${foldHit3Val.toFixed(1)}%, ` +
        `MRR=${foldMRRVal.toFixed(3)}, Beam@${BEAM_WIDTH}=${foldBeamExactVal.toFixed(1)}% ` +
        `(${fold.trainTraceIds.size} train / ${fold.testTraceIds.size} test traces)`,
    );

    foldModel.dispose();
  }

  console.log(`\n    --- K-Fold Summary (K=${K_FOLDS}) ---`);
  console.log(`    ${formatKFoldMetric("Next-tool acc", foldNextAcc)}`);
  console.log(`    ${formatKFoldMetric("Termination acc", foldTermAcc)}`);
  console.log(`    ${formatKFoldMetric("Hit@1", foldHit1)}`);
  console.log(`    ${formatKFoldMetric("Hit@3", foldHit3)}`);
  console.log(`    ${formatKFoldMetric("MRR", foldMRR, "")}`);
  console.log(`    ${formatKFoldMetric("Beam@" + BEAM_WIDTH + " exact", foldBeamExact)}`);
} else {
  console.log(`\n    K-fold CV skipped (set KFOLD=true or K_FOLDS>=2 to enable)`);
}

// Cleanup
model.dispose();
// SHGAT adapter has no TF.js resources to dispose — pure JS

await sql.end();

// --- Save results to JSON ---
const resultsPath = `benchmark-results-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
const results = {
  date: new Date().toISOString(),
  config: {
    epochs: EPOCHS,
    batchSize: BATCH_SIZE,
    seed: SPLIT_SEED,
    vocabTools: enrichedToolEmbeddings.size,
    vocabTotal: model.getToolToIndex().size,
    n8nCaps: capIdsByLevel.get(0)?.length ?? 0,
    v2v: !SKIP_V2V,
    v2vResidualWeight: SKIP_V2V ? 0 : 0.3,
    v2vCooccurrenceEdges: cooccurrence.length,
    n8nWeight: N8N_LOSS_WEIGHT,
    prodOversample: PROD_OVERSAMPLE,
    focalGamma: FOCAL_GAMMA,
    embeddingDim,
    maxLevel,
  },
  data: {
    prodTrainExamples: prodTrain.length,
    prodTestExamples: prodTest.length,
    n8nTrainExamples: n8nTrain.length,
    n8nEvalExamples: n8nEval.length,
    mixedTrainTotal: mixedTrain.length,
  },
  training: {
    epochLog,
    bestTestNextAcc,
    bestEpoch,
    finalHit1,
    finalHit3,
    finalHit5,
    finalMRR,
    bestMRR,
    trainTimeSeconds: parseFloat(trainTime),
  },
};
try {
  writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n      Results saved to ${resultsPath}`);
} catch (e) {
  console.warn(`      Failed to save results: ${e}`);
}

console.log("\n=== Benchmark complete ===");
