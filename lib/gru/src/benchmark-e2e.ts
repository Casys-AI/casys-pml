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

// Data-prep: shared normalization + cleanup logic (aligned with train-gru-with-caps.ts)
import { normalizeToolId, l2Normalize, l2NormalizeMap } from "./data-prep/normalize.ts";
import { resolveExecHashRefs, canonicalizeCaps, resolveL2Hierarchy } from "./data-prep/cap-cleanup.ts";
import type { CapData } from "./data-prep/cap-cleanup.ts";
import { buildToolNameResolver, buildRenameChain } from "./data-prep/resolve-tool-name.ts";

// SHGAT adapter (pure JS — no TF.js dependency)
import { SHGATAdapter } from "../../shgat-for-gru/src/index.ts";
import type { CooccurrenceEntry, GraphNode, OBTrainedParams } from "../../shgat-for-gru/src/types.ts";

// Paper-style two-phase MP (Fujita n-SuHGAT)
import { PaperMP } from "../../shgat-for-gru/src/paper-mp.ts";
import { trainPaperMP } from "../../shgat-for-gru/src/train-paper-mp.ts";
import type { TrainExample } from "../../shgat-for-gru/src/train-paper-mp.ts";

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

// PROD_ONLY=true → skip Smithery expanded vocab + n8n augmentation, PML tools only
const PROD_ONLY = process.env["PROD_ONLY"] === "true";
// SAVE_VOCAB=true → save toolIds + vocabNodeIds in weights JSON (for inference vocab mapping)
const SAVE_VOCAB = process.env["SAVE_VOCAB"] !== "false"; // default true

// NO_SHGAT=true → skip all SHGAT processing, use raw BGE-M3 embeddings (pure GRU baseline)
const NO_SHGAT = process.env["NO_SHGAT"] === "true";
// SHGAT_RANDOM=true → use random orthogonal projections for MP (no trained params, ADR frozen mode)
const SHGAT_RANDOM = process.env["SHGAT_RANDOM"] === "true";
// SHGAT_PAPER=true → paper-style two-phase MP (Fujita n-SuHGAT), ~500K params, random init
const SHGAT_PAPER = process.env["SHGAT_PAPER"] === "true";
// V2V_ONLY=true → V→V co-occurrence enrichment only, no message passing
// Decomposes the gap: is V→V or MP the culprit?
const V2V_ONLY = process.env["V2V_ONLY"] === "true";
// PAPER_WF=true → add n8n workflows as hyperedges in SHGAT_PAPER mode (alongside capabilities)
const PAPER_WF = process.env["PAPER_WF"] === "true";
// TRAIN_PAPER=true → train PaperMP W/W1 via InfoNCE before GRU benchmark
const TRAIN_PAPER = process.env["TRAIN_PAPER"] === "true";
// PAPER_PARAMS=path → load pre-trained PaperMP params from JSON (skip training)
const PAPER_PARAMS = process.env["PAPER_PARAMS"] || "";
// NO_EDGES=true → force linear context fallback (ignore static_structure edges)
// Used for A/B testing causal edges vs linear context
const NO_EDGES = process.env["NO_EDGES"] === "true";
// FULL_GRAPH=true → load provides/sequence edges from tool_dependency into V2V co-occurrence
const FULL_GRAPH = process.env["FULL_GRAPH"] === "true";
// Helper: modes without SHGAT graph (no adapter, no standalone scoring)
const NO_GRAPH = NO_SHGAT || V2V_ONLY;

console.log("=== GRU + SHGAT-TF End-to-End Benchmark ===");
console.log(`    Date: ${new Date().toISOString()}`);
if (NO_SHGAT) console.log(`    Mode: NO_SHGAT (raw BGE-M3 embeddings, pure GRU baseline)`);
else if (V2V_ONLY) console.log(`    Mode: V2V_ONLY (V→V co-occurrence enrichment, no MP)`);
else if (SHGAT_PAPER) console.log(`    Mode: SHGAT_PAPER (paper-style two-phase MP${PAPER_WF ? " + wf hyperedges" : ""}${TRAIN_PAPER ? " + TRAINING" : ""}${PAPER_PARAMS ? " + pre-trained" : ""})`);
else if (SHGAT_RANDOM) console.log(`    Mode: SHGAT_RANDOM (frozen MP with random orthogonal projections)`);
else if (SHGAT_PARAMS_PATH) console.log(`    SHGAT params: ${SHGAT_PARAMS_PATH}`);
else console.log(`    Mode: SHGAT trained (params from DB)${FULL_GRAPH ? " + FULL_GRAPH" : ""}${PAPER_WF ? " + WF hyperedges" : ""}`);
if (PROD_ONLY) console.log(`    Data: PROD_ONLY (no Smithery, no n8n — PML tools only)`);
if (NO_EDGES) console.log(`    Context: NO_EDGES (force linear fallback, ignore static_structure edges)`);
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
if (PROD_ONLY) {
  console.log("      PROD_ONLY: skipping Smithery expanded vocab");
} else if (existsSync(EXPANDED_VOCAB_PATH)) {
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

// --- 2a. Cap data via namespace:action (aligned with train-gru-with-caps.ts) ---
const capRows = await sql`
  SELECT DISTINCT ON (cr.namespace, cr.action)
    cr.namespace || ':' || cr.action as cap_id,
    COALESCE(wp.shgat_embedding, wp.intent_embedding)::text as cap_embedding,
    COALESCE(wp.hierarchy_level, 1) as hierarchy_level,
    wp.dag_structure->'tools_used' as tools_used,
    COALESCE(wp.usage_count, 0) as usage_count
  FROM workflow_pattern wp
  JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id
  WHERE wp.code_snippet IS NOT NULL
    AND wp.intent_embedding IS NOT NULL
    AND wp.dag_structure->'tools_used' IS NOT NULL
  ORDER BY cr.namespace, cr.action, wp.last_used DESC
`;

// Build CapData[] with normalizeToolId on toolChildren
const capabilityData: CapData[] = [];
const capChildrenMap = new Map<string, string[]>();
for (const row of capRows) {
  const capEmb = parseEmbedding(row.cap_embedding);
  if (!capEmb || capEmb.length === 0) continue;
  const children = ((row.tools_used ?? []) as string[])
    .map(normalizeToolId)
    .filter(Boolean) as string[];
  if (children.length === 0) continue;
  const capId = row.cap_id as string;
  capChildrenMap.set(capId, children);
  capabilityData.push({
    id: capId,
    embedding: capEmb,
    toolChildren: children,
    level: Number(row.hierarchy_level),
    usageCount: Number(row.usage_count),
  });
}

console.log(`      ${capabilityData.length} capabilities (namespace:action, COALESCE shgat/intent)`);

// --- 2b. Resolve stale exec_hash references ---
const codeHashRows = await sql`
  SELECT wp.code_hash, cr.namespace || ':' || cr.action as cap_name
  FROM workflow_pattern wp
  JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id
  WHERE wp.code_hash IS NOT NULL
`;
const execHashToCapName = new Map<string, string>();
for (const row of codeHashRows) {
  const shortHash = (row.code_hash as string).substring(0, 8);
  execHashToCapName.set(shortHash, row.cap_name as string);
}
const { resolved: execResolved } = resolveExecHashRefs(capabilityData, execHashToCapName);
// Also update capChildrenMap
const execPattern = /^(?:code|std|filesystem):exec_([a-f0-9]{8})/;
for (const [key, children] of capChildrenMap) {
  capChildrenMap.set(key, children.map(child => {
    const m = child.match(execPattern);
    return m ? (execHashToCapName.get(m[1]) ?? child) : child;
  }));
}
if (execResolved > 0) console.log(`      Resolved ${execResolved} stale exec_hash refs`);

// --- 2c. Cap canonicalization ---
const NO_CANONICALIZE = process.env["NO_CANONICALIZE"] === "true";
let capCanonicalMap = new Map<string, string>();
if (!NO_CANONICALIZE) {
  const result = canonicalizeCaps(capabilityData);
  capCanonicalMap = result.canonicalMap;
  // Also clean capChildrenMap
  for (const nonCanon of capCanonicalMap.keys()) {
    capChildrenMap.delete(nonCanon);
  }
  for (const [key, children] of capChildrenMap) {
    capChildrenMap.set(key, children.map(c => capCanonicalMap.get(c) ?? c));
  }
  console.log(`      Canonicalize: ${result.groupCount} toolset groups, ${result.remapped} remapped → ${capabilityData.length} canonical`);
} else {
  console.log(`      NO_CANONICALIZE=true — all caps kept as separate vocab entries`);
}

// --- 2d. L2+ hierarchy walk ---
const toolVocab = new Set(toolIds);
const { resolved: l2Resolved } = resolveL2Hierarchy(capabilityData, toolVocab);
if (l2Resolved > 0) console.log(`      Resolved ${l2Resolved} L2+ caps to L0 tools`);

// --- Rebuild capEmbeddings, capIdToLevel, capIdsByLevel, capToToolChildren, toolToCapSet from capabilityData ---
const capEmbeddings = new Map<string, number[]>();
const capIdsByLevel = new Map<number, string[]>();
const capIdToLevel = new Map<string, number>();
let maxLevel = 0;
const capToToolChildren = new Map<string, string[]>();

for (const cap of capabilityData) {
  capEmbeddings.set(cap.id, cap.embedding);
  capIdToLevel.set(cap.id, cap.level);
  if (!capIdsByLevel.has(cap.level)) capIdsByLevel.set(cap.level, []);
  capIdsByLevel.get(cap.level)!.push(cap.id);
  maxLevel = Math.max(maxLevel, cap.level);
  capToToolChildren.set(cap.id, cap.toolChildren);
}

console.log(
  `      Hierarchy: ${maxLevel + 1} levels - ${
    Array.from(capIdsByLevel.entries())
      .map(([l, c]) => `L${l}:${c.length}`)
      .join(", ")
  }`,
);

// Invert capToToolChildren → toolToCapSet
const toolToCapSet: Set<string>[] = toolIds.map(() => new Set());
for (const [capId, children] of capToToolChildren) {
  for (const toolId of children) {
    const toolIdx = toolIdToIdx.get(toolId);
    if (toolIdx !== undefined) {
      toolToCapSet[toolIdx].add(capId);
    }
  }
}

// Inject n8n workflows as level-0 capabilities (hyperedges E^0)
// Each workflow = a capability with description embedding + tool members
// Cap at MAX_N8N_CAPS to keep incidence matrix manageable (memory: tools×caps×4B)
const MAX_N8N_CAPS = parseInt(process.env["MAX_N8N_CAPS"] || "99999", 10);
let n8nCapsAdded = 0;
if (PROD_ONLY) {
  console.log("      PROD_ONLY: skipping n8n workflow injection");
} else if (existsSync(N8N_SHGAT_PAIRS_PATH)) {
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
  `      ${connectedTools}/${toolIds.length} tools connected to caps (all levels, PML + n8n)`,
);
for (let lvl = 0; lvl <= maxLevel; lvl++) {
  const lvlCaps = capIdsByLevel.get(lvl) || [];
  const withTools = lvlCaps.filter((c) => capEmbeddings.has(c)).length;
  console.log(`      L${lvl}: ${lvlCaps.length} caps (${withTools} with embedding)`);
}

// Build VocabNode[] — ALL caps already have flattened L0 tool children (via resolveL2Hierarchy).
// Children are filtered to tools in the vocabulary (setToolVocabulary requires allChildrenKnown).
const higherLevelNodes: VocabNode[] = [];
for (const cap of capabilityData) {
  const capEmb = capEmbeddings.get(cap.id);
  if (!capEmb) continue;

  // Filter to only tools in the vocabulary
  const children = cap.toolChildren.filter((t) => toolIdToIdx.has(t));
  if (children.length === 0) continue;

  higherLevelNodes.push({
    id: cap.id,
    level: cap.level + 1, // Shift up: GRU L0 = tools, L1+ = caps
    embedding: capEmb,
    children,
  });
}
const n8nVocabNodes = higherLevelNodes.filter((n) => n.id.startsWith("n8n:wf:")).length;
const pmlVocabNodes = higherLevelNodes.length - n8nVocabNodes;
console.log(
  `      VocabNodes: ${higherLevelNodes.length} higher-level (${pmlVocabNodes} PML + ${n8nVocabNodes} n8n)`,
);
for (let lvl = 1; lvl <= maxLevel + 1; lvl++) {
  const count = higherLevelNodes.filter((n) => n.level === lvl).length;
  if (count > 0) console.log(`        GRU-L${lvl}: ${count} nodes`);
}

// --- Step 3: Build graph structure ---
console.log("\n[3/9] Building graph structure (ALL levels)...");

// Collect all cap IDs that made it into VocabNodes (have tool children in vocab)
const vocabCapIds = higherLevelNodes.map((n) => n.id);
const vocabCapIdToIdx = new Map<string, number>();
for (let i = 0; i < vocabCapIds.length; i++) {
  vocabCapIdToIdx.set(vocabCapIds[i], i);
}

// Build ToolCapabilityMap for CompactInformedGRU (flat binary matrix)
// Uses ALL vocab caps (not just L0) — fix 2026-02-23
const numCaps = vocabCapIds.length;
const toolCapFlatData = new Float32Array(toolIds.length * numCaps);
for (let t = 0; t < toolIds.length; t++) {
  for (const capId of toolToCapIds[t]) {
    const capIdx = vocabCapIdToIdx.get(capId);
    if (capIdx !== undefined) {
      toolCapFlatData[t * numCaps + capIdx] = 1;
    }
  }
}
const toolCapMap: ToolCapabilityMap = {
  matrix: toolCapFlatData,
  numTools: toolIds.length,
  numCapabilities: numCaps,
};
console.log(`      ToolCapabilityMap: ${toolIds.length} tools x ${numCaps} caps`);
console.log(`      Graph: maxLevel=${maxLevel}, using ALL levels`);

// --- Steps 4-6: SHGAT loading + enrichment (conditional on mode) ---
const shgatAdapter = new SHGATAdapter();
let enrichedToolEmbeddings: Map<string, number[]>;
let enrichmentMs = 0;
let cooccurrenceEdgeCount = 0; // hoisted for results JSON (cooccurrence is block-scoped)

if (NO_SHGAT) {
  // ============ Mode A: Pure GRU baseline — raw BGE-M3 embeddings ============
  console.log("\n[4-6/11] SKIPPED — NO_SHGAT mode: using raw BGE-M3 embeddings");
  enrichedToolEmbeddings = new Map<string, number[]>();
  for (let i = 0; i < toolIds.length; i++) {
    enrichedToolEmbeddings.set(toolIds[i], rawToolEmbeddings.get(toolIds[i])!);
  }
  // Adapter stays empty — no graph, no scoring. E2E sections guard with `if (!NO_SHGAT)`.
  console.log(`      Using ${enrichedToolEmbeddings.size} raw tool embeddings (no V→V, no MP)`);

} else if (V2V_ONLY) {
  // ============ Mode V: V→V co-occurrence only — no message passing ============
  console.log("\n[4/11] SKIPPED — V2V_ONLY mode: no SHGAT/PaperMP initialization");
  console.log("\n[5/11] V→V co-occurrence enrichment (V2V_ONLY mode)...");
  const v2vStart = performance.now();

  const workflowToolLists: string[][] = [];
  if (existsSync(N8N_SHGAT_PAIRS_PATH)) {
    const n8nPairsForV2V: Array<{ positiveToolIds: string[] }> = JSON.parse(
      readFileSync(N8N_SHGAT_PAIRS_PATH, "utf-8"),
    );
    for (const pair of n8nPairsForV2V) {
      workflowToolLists.push(pair.positiveToolIds);
    }
  }
  for (const [, children] of capToToolChildren) {
    if (children.length >= 2) workflowToolLists.push(children);
  }

  const cooccurrence = buildCooccurrenceFromWorkflows(workflowToolLists, toolIdToIdx);
  cooccurrenceEdgeCount = cooccurrence.length;
  console.log(
    `      Built co-occurrence: ${cooccurrence.length} edges from ${workflowToolLists.length} workflows`,
  );

  const H_raw: number[][] = toolIds.map((id) => rawToolEmbeddings.get(id)!);
  const H_v2v_enriched = v2vEnrich(H_raw, cooccurrence, { residualWeight: 0.3 });

  let v2vDelta = 0;
  for (let i = 0; i < H_raw.length; i++) {
    for (let j = 0; j < H_raw[i].length; j++) {
      v2vDelta += Math.abs(H_v2v_enriched[i][j] - H_raw[i][j]);
    }
  }
  const v2vTime = ((performance.now() - v2vStart) / 1000).toFixed(2);
  console.log(
    `      V→V enrichment: avg_delta=${(v2vDelta / H_raw.length).toFixed(4)}, applied, time=${v2vTime}s`,
  );

  console.log("\n[6/11] SKIPPED — V2V_ONLY mode: no message passing");

  // Use V→V-enriched embeddings directly (no MP)
  enrichedToolEmbeddings = new Map<string, number[]>();
  for (let i = 0; i < toolIds.length; i++) {
    enrichedToolEmbeddings.set(toolIds[i], H_v2v_enriched[i]);
  }
  console.log(`      Using ${enrichedToolEmbeddings.size} V→V-enriched tool embeddings (no MP)`);

} else if (SHGAT_PAPER) {
  // ============ Mode P: Paper-style two-phase MP (Fujita n-SuHGAT) ============
  console.log("\n[4/11] SHGAT_PAPER: initializing paper-style two-phase MP...");
  const paperAlpha = TRAIN_PAPER ? 0.5 : 0.3;
  const paperMP = new PaperMP({
    embDim: embeddingDim,
    projDim: 256,
    residualAlpha: paperAlpha,
    activation: "leaky_relu",
    seed: SPLIT_SEED,
  });
  console.log(`      PaperMP: projDim=256, alpha=${paperAlpha}, params=${paperMP.getParamCount()}, seed=${SPLIT_SEED}`);

  // Still need adapter with random params for K-head scoring in E2E section
  shgatAdapter.initRandomParams(embeddingDim, 16, 64, maxLevel + 1, SPLIT_SEED);

  // --- Step 5: V→V co-occurrence enrichment ---
  console.log("\n[5/11] V→V co-occurrence enrichment...");
  const v2vStart = performance.now();

  const workflowToolLists: string[][] = [];
  if (existsSync(N8N_SHGAT_PAIRS_PATH)) {
    const n8nPairsForV2V: Array<{ positiveToolIds: string[] }> = JSON.parse(
      readFileSync(N8N_SHGAT_PAIRS_PATH, "utf-8"),
    );
    for (const pair of n8nPairsForV2V) {
      workflowToolLists.push(pair.positiveToolIds);
    }
  }
  for (const [, children] of capToToolChildren) {
    if (children.length >= 2) workflowToolLists.push(children);
  }

  const cooccurrence = buildCooccurrenceFromWorkflows(workflowToolLists, toolIdToIdx);
  cooccurrenceEdgeCount = cooccurrence.length;
  console.log(
    `      Built co-occurrence: ${cooccurrence.length} edges from ${workflowToolLists.length} workflows`,
  );

  const H_raw: number[][] = toolIds.map((id) => rawToolEmbeddings.get(id)!);
  const SKIP_V2V = process.env["SKIP_V2V"] === "true";
  const H_v2v_enriched = SKIP_V2V ? H_raw : v2vEnrich(H_raw, cooccurrence, { residualWeight: 0.3 });

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

  // --- Step 6: Build graph & enrich with paper-style MP ---
  console.log("\n[6/11] Paper-style two-phase MP (V→E→V)...");

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
      // All caps have flattened L0 tool children (via resolveL2Hierarchy + canonicalization)
      const children = capToToolChildren.get(capId) ?? [];
      if (children.length === 0) continue;
      shgatGraphNodes.push({ id: capId, embedding: emb, children, level });
    }
  }

  // --- PAPER_WF: add n8n workflows as additional L1 hyperedges ---
  let wfHyperedgeCount = 0;
  if (PAPER_WF && existsSync(N8N_SHGAT_PAIRS_PATH)) {
    console.log(`      Loading n8n workflows as hyperedges (PAPER_WF=true)...`);
    const n8nPairs: Array<{
      workflowId: number;
      workflowName: string;
      intentEmbedding: number[];
      positiveToolIds: string[];
    }> = JSON.parse(readFileSync(N8N_SHGAT_PAIRS_PATH, "utf-8"));

    // Deduplicate by workflowId, filter by size and vocab coverage
    const seenWf = new Set<number>();
    const l0IdSet = new Set(toolIds);
    for (const pair of n8nPairs) {
      if (seenWf.has(pair.workflowId)) continue;
      seenWf.add(pair.workflowId);

      // Filter children to those in our vocab
      const mappedChildren = pair.positiveToolIds.filter((id) => l0IdSet.has(id));
      // 3-20 tools per workflow, min 2 in vocab
      if (mappedChildren.length < 2 || pair.positiveToolIds.length < 3 || pair.positiveToolIds.length > 20) continue;

      shgatGraphNodes.push({
        id: `n8n:wf:${pair.workflowId}`,
        embedding: pair.intentEmbedding,
        children: mappedChildren,
        level: 0, // same level as capabilities (L1 hyperedges connecting L0 tools)
      });
      wfHyperedgeCount++;
    }
    console.log(
      `      Added ${wfHyperedgeCount} workflow hyperedges (from ${seenWf.size} unique workflows, filtered 3-20 tools, ≥2 in vocab)`,
    );
  }

  const paperGraph = paperMP.buildGraph(shgatGraphNodes);
  console.log(
    `      Graph: ${paperGraph.l0Ids.length} L0 nodes, ${
      Array.from(paperGraph.nodeIdsByLevel.entries())
        .map(([l, ids]) => `L${l}:${ids.length}`)
        .join(", ")
    } higher nodes${wfHyperedgeCount > 0 ? ` (incl. ${wfHyperedgeCount} wf hyperedges)` : ""}, maxLevel=${paperGraph.maxLevel}`,
  );

  // --- PAPER_PARAMS: load pre-trained PaperMP params ---
  if (PAPER_PARAMS && existsSync(PAPER_PARAMS)) {
    console.log(`\n[6b/11] Loading pre-trained PaperMP params from ${PAPER_PARAMS}...`);
    const saved = JSON.parse(readFileSync(PAPER_PARAMS, "utf-8"));
    paperMP.setParams(saved.bestW, saved.bestW1);
    console.log(`      Loaded: R@1=${saved.bestR1?.toFixed?.(1) ?? "?"}% from epoch ${saved.bestEpoch ?? "?"}`);
  }

  // --- TRAIN_PAPER: train PaperMP via InfoNCE ---
  if (TRAIN_PAPER) {
    console.log("\n[6b/11] Training PaperMP via InfoNCE contrastive...");
    // Load execution traces for training (minimal: intent + target tools)
    const paperTraceRows = await sql`
      SELECT
        wp.intent_embedding::text as intent_embedding,
        et.task_results,
        et.id as trace_id
      FROM execution_trace et
      JOIN workflow_pattern wp ON et.capability_id = wp.pattern_id
      WHERE et.task_results IS NOT NULL
        AND jsonb_array_length(et.task_results) >= 1
        AND wp.intent_embedding IS NOT NULL
      ORDER BY et.executed_at DESC
    `;
    console.log(`      Loaded ${paperTraceRows.length} execution traces`);

    // Convert to TrainExample[] (each step = one example)
    const allPaperExamples: (TrainExample & { traceId: string })[] = [];
    for (const row of paperTraceRows) {
      const intentEmb = parseEmbedding(row.intent_embedding as string);
      if (!intentEmb || intentEmb.length !== embeddingDim) continue;
      const tasks = row.task_results as Array<{ tool?: string }>;
      for (const task of tasks) {
        if (!task.tool) continue;
        const idx = toolIdToIdx.get(task.tool);
        if (idx === undefined) continue;
        allPaperExamples.push({
          intentEmbedding: intentEmb,
          targetToolIdx: idx,
          traceId: row.trace_id as string,
        });
      }
    }
    console.log(`      Extracted ${allPaperExamples.length} prod training examples`);

    // Load n8n contrastive pairs (intent + positive tools per workflow)
    const n8nPairsPath = resolve(__dirname, "../data/n8n-shgat-contrastive-pairs.json");
    if (existsSync(n8nPairsPath)) {
      const n8nPairs: Array<{
        intentEmbedding: number[];
        positiveToolIds: string[];
        workflowId: number;
      }> = JSON.parse(readFileSync(n8nPairsPath, "utf-8"));
      let n8nCount = 0;
      const n8nRng = seededRng(SPLIT_SEED + 13);
      for (const pair of n8nPairs) {
        if (!pair.intentEmbedding || pair.intentEmbedding.length !== embeddingDim) continue;
        for (const toolId of pair.positiveToolIds) {
          const idx = toolIdToIdx.get(toolId);
          if (idx === undefined) continue;
          // Subsample: keep ~5K examples (probability = 5000 / estimated 30K total)
          if (n8nRng() > 0.18) continue;
          allPaperExamples.push({
            intentEmbedding: pair.intentEmbedding,
            targetToolIdx: idx,
            traceId: `n8n-${pair.workflowId}`,
          });
          n8nCount++;
        }
      }
      console.log(`      + ${n8nCount} n8n contrastive examples (from ${n8nPairs.length} workflows)`);
    }
    console.log(`      Total: ${allPaperExamples.length} training examples`);

    // Split 80/20 by trace (seeded, same as GRU split)
    const paperTraceIds = [...new Set(allPaperExamples.map((ex) => ex.traceId))];
    const paperRng = seededRng(SPLIT_SEED + 7);
    for (let i = paperTraceIds.length - 1; i > 0; i--) {
      const j = Math.floor(paperRng() * (i + 1));
      [paperTraceIds[i], paperTraceIds[j]] = [paperTraceIds[j], paperTraceIds[i]];
    }
    const paperSplitIdx = Math.floor(paperTraceIds.length * 0.8);
    const paperTrainIds = new Set(paperTraceIds.slice(0, paperSplitIdx));
    const paperTrainExamples = allPaperExamples.filter((ex) => paperTrainIds.has(ex.traceId));
    const paperTestExamples = allPaperExamples.filter((ex) => !paperTrainIds.has(ex.traceId));
    console.log(`      Split: ${paperTrainExamples.length} train / ${paperTestExamples.length} test (${paperTraceIds.length} traces)`);

    // Train
    const trainResult = trainPaperMP(paperMP, toolIds, paperTrainExamples, paperTestExamples, {
      epochs: 15,
      lr: 0.005,
      batchSize: 64,
      temperature: 0.07,
      patience: 5,
      seed: SPLIT_SEED,
    });

    // Save trained params
    const paramsPath = resolve(__dirname, "../data/paper-mp-trained.json");
    writeFileSync(paramsPath, JSON.stringify({
      bestW: trainResult.bestW,
      bestW1: trainResult.bestW1,
      bestR1: trainResult.bestR1,
      bestMRR: trainResult.bestMRR,
      bestEpoch: trainResult.bestEpoch,
      config: paperMP.getConfig(),
      history: trainResult.history,
    }));
    console.log(`      Saved trained params to ${paramsPath}`);
  }

  const enrichResult = paperMP.enrich();
  enrichedToolEmbeddings = enrichResult.l0Embeddings;
  enrichmentMs = enrichResult.enrichmentMs;

  // Also build graph for shgatAdapter (needed for standalone scoring in step 7d)
  shgatAdapter.buildGraph(shgatGraphNodes);

} else {
  // ============ Load SHGAT params ============
  if (SHGAT_RANDOM) {
    // Mode B: Frozen MP — random orthogonal projections (ADR 2026-02-08)
    console.log("\n[4/11] SHGAT_RANDOM: initializing random orthogonal projections...");
    const cfg = shgatAdapter.initRandomParams(embeddingDim, 16, 64, maxLevel + 1, SPLIT_SEED);
    console.log(`      Config: numHeads=${cfg.numHeads}, headDim=${cfg.headDim}, embDim=${cfg.embeddingDim}`);
  } else if (SHGAT_PARAMS_PATH && existsSync(SHGAT_PARAMS_PATH)) {
    console.log(`\n[4/11] Loading SHGAT params from file: ${SHGAT_PARAMS_PATH}`);
    const shgatExportConfig = shgatAdapter.loadParams(SHGAT_PARAMS_PATH);
    console.log(`      Config: numHeads=${shgatExportConfig.numHeads}, headDim=${shgatExportConfig.headDim}, embDim=${shgatExportConfig.embeddingDim}`);
  } else {
    // --- Legacy: load from DB, convert to OBTrainedParams ---
    console.log("\n[4/11] Loading SHGAT params from DB...");
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

  // ============ Step 5: V→V co-occurrence enrichment ============
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

  let cooccurrence = buildCooccurrenceFromWorkflows(workflowToolLists, toolIdToIdx);
  console.log(
    `      Built co-occurrence: ${cooccurrence.length} edges from ${workflowToolLists.length} workflows`,
  );

  // --- FULL_GRAPH: load provides/sequence edges from tool_dependency ---
  if (FULL_GRAPH) {
    console.log("      Loading provides/sequence edges from tool_dependency (FULL_GRAPH=true)...");
    const depEdges = await sql`
      SELECT from_tool_id, to_tool_id, edge_type, confidence_score, edge_source, observed_count
      FROM tool_dependency
      WHERE edge_type IN ('provides', 'sequence')
    `;
    const extraEntries: CooccurrenceEntry[] = [];
    let matched = 0;
    for (const row of depEdges) {
      const fromIdx = toolIdToIdx.get(row.from_tool_id as string);
      const toIdx = toolIdToIdx.get(row.to_tool_id as string);
      if (fromIdx === undefined || toIdx === undefined) continue;
      matched++;
      // Typed weights: provides×observed=0.70, provides×inferred=0.49, sequence×observed=0.50, sequence×inferred=0.35
      const isObserved = (row.edge_source as string) === "observed";
      const baseWeight = (row.edge_type as string) === "provides"
        ? (isObserved ? 0.70 : 0.49)
        : (isObserved ? 0.50 : 0.35);
      const weight = baseWeight * Math.log2(1 + (row.observed_count as number || 1));
      extraEntries.push({ from: fromIdx, to: toIdx, weight });
      extraEntries.push({ from: toIdx, to: fromIdx, weight }); // symmetric
    }
    cooccurrence = cooccurrence.concat(extraEntries);
    console.log(
      `      Added ${extraEntries.length} edges from ${matched}/${depEdges.length} dependency rows (provides+sequence)`,
    );
  }

  cooccurrenceEdgeCount = cooccurrence.length;

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

  // ============ Step 6: Build SHGAT graph & enrich (V→E→V) ============
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
      // All caps have flattened L0 tool children (via resolveL2Hierarchy + canonicalization)
      const children = capToToolChildren.get(capId) ?? [];
      if (children.length === 0) continue;
      shgatGraphNodes.push({ id: capId, embedding: emb, children, level });
    }
  }

  // --- PAPER_WF: add n8n workflows as L1 hyperedges in default mode too ---
  let defaultWfHyperedgeCount = 0;
  if (PAPER_WF && existsSync(N8N_SHGAT_PAIRS_PATH)) {
    console.log(`      Loading n8n workflows as hyperedges (PAPER_WF=true)...`);
    const n8nPairs: Array<{
      workflowId: number;
      workflowName: string;
      intentEmbedding: number[];
      positiveToolIds: string[];
    }> = JSON.parse(readFileSync(N8N_SHGAT_PAIRS_PATH, "utf-8"));

    const seenWf = new Set<number>();
    const l0IdSet = new Set(toolIds);
    for (const pair of n8nPairs) {
      if (seenWf.has(pair.workflowId)) continue;
      seenWf.add(pair.workflowId);
      const mappedChildren = pair.positiveToolIds.filter((id) => l0IdSet.has(id));
      if (mappedChildren.length < 2 || pair.positiveToolIds.length < 3 || pair.positiveToolIds.length > 20) continue;
      shgatGraphNodes.push({
        id: `n8n:wf:${pair.workflowId}`,
        embedding: pair.intentEmbedding,
        children: mappedChildren,
        level: 0, // L1 hyperedges connecting L0 tools
      });
      defaultWfHyperedgeCount++;
    }
    console.log(
      `      Added ${defaultWfHyperedgeCount} workflow hyperedges (from ${seenWf.size} unique workflows)`,
    );
  }

  const shgatGraph = shgatAdapter.buildGraph(shgatGraphNodes);
  console.log(
    `      Graph: ${shgatGraph.l0Ids.length} L0 nodes, ${
      Array.from(shgatGraph.nodeIdsByLevel.entries())
        .map(([l, ids]) => `L${l}:${ids.length}`)
        .join(", ")
    } higher nodes${defaultWfHyperedgeCount > 0 ? ` (incl. ${defaultWfHyperedgeCount} wf hyperedges)` : ""}, maxLevel=${shgatGraph.maxLevel}`,
  );

  // Enrich embeddings via multi-head attention message passing
  const enrichResult = shgatAdapter.enrichEmbeddings();
  enrichedToolEmbeddings = enrichResult.l0Embeddings;
  enrichmentMs = enrichResult.enrichmentMs;
}

// --- Baseline embeddings for delta comparison (available in all modes) ---
const H_baseline: number[][] = toolIds.map((id) => rawToolEmbeddings.get(id)!);

function cosineSim(a: number[] | Float64Array, b: number[] | Float64Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

// Split tools by hierarchy status (used in all modes)
const hierToolIndices: number[] = [];
const orphToolIndices: number[] = [];
for (let i = 0; i < toolIds.length; i++) {
  if (toolToCapIds[i].length > 0) hierToolIndices.push(i);
  else orphToolIndices.push(i);
}

let hierAvgDelta = 0, orphAvgDelta = 0, deltaRatio = 0;
let rawIntraMean = 0, enrichedIntraMean = 0, simImprovement = 0;
let intraPairs = 0;
let avgDelta = 0;

if (!NO_SHGAT) {
  const mpTime = (enrichmentMs / 1000).toFixed(2);
  console.log(`      Message passing complete in ${mpTime}s`);
  console.log(`      Enriched ${enrichedToolEmbeddings.size} tool embeddings`);

  // Measure enrichment quality vs raw
  let totalDelta = 0;
  let maxDelta = 0;
  for (let i = 0; i < toolIds.length; i++) {
    const enriched = enrichedToolEmbeddings.get(toolIds[i])!;
    let delta = 0;
    for (let j = 0; j < enriched.length; j++) {
      delta += Math.abs(enriched[j] - H_baseline[i][j]);
    }
    totalDelta += delta;
    maxDelta = Math.max(maxDelta, delta);
  }
  avgDelta = totalDelta / toolIds.length;
  console.log(
    `      Embedding delta: avg=${avgDelta.toFixed(2)}, max=${maxDelta.toFixed(2)} (higher = more enrichment)`,
  );

  logMemory("      ");

  // --- Step 6b: SHGAT Enrichment Quality Analysis ---
  console.log("\n[6b/11] SHGAT Enrichment Quality Analysis...");

  // 1) MP delta split by hierarchy status
  let hierDeltaSum = 0, orphDeltaSum = 0;
  for (const i of hierToolIndices) {
    const enriched = enrichedToolEmbeddings.get(toolIds[i])!;
    for (let j = 0; j < enriched.length; j++) {
      hierDeltaSum += Math.abs(enriched[j] - H_baseline[i][j]);
    }
  }
  for (const i of orphToolIndices) {
    const enriched = enrichedToolEmbeddings.get(toolIds[i])!;
    for (let j = 0; j < enriched.length; j++) {
      orphDeltaSum += Math.abs(enriched[j] - H_baseline[i][j]);
    }
  }
  hierAvgDelta = hierToolIndices.length > 0 ? hierDeltaSum / hierToolIndices.length : 0;
  orphAvgDelta = orphToolIndices.length > 0 ? orphDeltaSum / orphToolIndices.length : 0;
  deltaRatio = orphAvgDelta > 0.001 ? hierAvgDelta / orphAvgDelta : Infinity;

  console.log(`      Connected (hier): ${hierToolIndices.length} tools, avg MP delta: ${hierAvgDelta.toFixed(2)}`);
  console.log(`      Orphan tools:     ${orphToolIndices.length} tools, avg MP delta: ${orphAvgDelta.toFixed(2)}`);
  console.log(`      Delta ratio (hier/orph): ${deltaRatio.toFixed(2)}x ${deltaRatio > 2 ? "(MP enriches connected tools more — good)" : "(low ratio — MP not discriminating)"}`);

  // 2) Intra-capability cosine similarity (before vs after MP enrichment)
  const capGroupsForSim: Array<{ capId: string; toolIndices: number[] }> = [];
  for (const [capId, children] of capToToolChildren) {
    const indices = children
      .map((id) => toolIdToIdx.get(id))
      .filter((i): i is number => i !== undefined);
    if (indices.length >= 3 && indices.length <= 50) capGroupsForSim.push({ capId, toolIndices: indices });
  }

  let rawIntraSimSum = 0, enrichedIntraSimSum = 0;
  const MAX_SIM_GROUPS = 300;
  const sampledGroups = capGroupsForSim.slice(0, MAX_SIM_GROUPS);

  for (const group of sampledGroups) {
    for (let a = 0; a < group.toolIndices.length; a++) {
      for (let b = a + 1; b < group.toolIndices.length; b++) {
        const ia = group.toolIndices[a], ib = group.toolIndices[b];
        rawIntraSimSum += cosineSim(H_baseline[ia], H_baseline[ib]);
        enrichedIntraSimSum += cosineSim(
          enrichedToolEmbeddings.get(toolIds[ia])!,
          enrichedToolEmbeddings.get(toolIds[ib])!,
        );
        intraPairs++;
      }
    }
  }

  rawIntraMean = intraPairs > 0 ? rawIntraSimSum / intraPairs : 0;
  enrichedIntraMean = intraPairs > 0 ? enrichedIntraSimSum / intraPairs : 0;
  simImprovement = enrichedIntraMean - rawIntraMean;

  console.log(`      Intra-cap cosine sim (${sampledGroups.length} groups, ${intraPairs} pairs):`);
  console.log(`        Before MP: ${rawIntraMean.toFixed(4)}`);
  console.log(`        After MP:  ${enrichedIntraMean.toFixed(4)}`);
  console.log(`        Delta:     ${simImprovement >= 0 ? "+" : ""}${simImprovement.toFixed(4)} ${simImprovement > 0 ? "(clustering improved)" : "(no improvement)"}`);
} else {
  console.log(`      ${enrichedToolEmbeddings.size} tool embeddings (raw, no enrichment)`);
  logMemory("      ");
}

// --- L2 normalization (aligned with train-gru-with-caps.ts step 1c-bis) ---
{
  const toolsNormalized = l2NormalizeMap(enrichedToolEmbeddings);
  let capsNormalized = 0;
  for (const cap of capabilityData) {
    let norm = 0;
    for (const v of cap.embedding) norm += v * v;
    if (Math.abs(Math.sqrt(norm) - 1.0) > 0.001) {
      cap.embedding = l2Normalize(cap.embedding);
      capsNormalized++;
    }
  }
  // Update capEmbeddings map with normalized values
  for (const cap of capabilityData) {
    capEmbeddings.set(cap.id, cap.embedding);
  }
  console.log(`      L2 norm: ${toolsNormalized} tools, ${capsNormalized} caps re-normalized`);
}

// 3) SHGAT standalone scoring eval on prod test (quick, before GRU training)
//    Uses K-head attention scoring to rank tools for each test intent
//    We need prod test intents — but we haven't loaded traces yet.
//    So we compute this lazily after step 7 and store results here.
let shgatStandaloneR1 = 0, shgatStandaloneR3 = 0, shgatStandaloneR5 = 0;
let shgatStandaloneTotal = 0;
let shgatStandaloneMRR = 0;
// Split by hier/orph
let shgatHierR1 = 0, shgatHierTotal = 0;
let shgatOrphR1 = 0, shgatOrphTotal = 0;

const shgatEnrichmentStats = {
  hierTools: hierToolIndices.length,
  orphTools: orphToolIndices.length,
  hierAvgDelta,
  orphAvgDelta,
  deltaRatio,
  rawIntraMean,
  enrichedIntraMean,
  simImprovement,
  intraPairs,
  capGroupsSampled: NO_GRAPH ? 0 : intraPairs,
};

// --- Step 7-pre: Rename history + resolveToolName (aligned with train-gru-with-caps.ts) ---
console.log("\n[7-pre/11] Loading rename history + building tool name resolver...");
const renameRows = await sql`
  SELECT old_name, new_name, old_fqdn FROM capability_name_history ORDER BY renamed_at ASC
`;
const renameMap = buildRenameChain(
  renameRows.map((r) => ({
    old_name: r.old_name as string,
    new_name: r.new_name as string,
    old_fqdn: r.old_fqdn as string | null,
  })),
);
console.log(`      ${renameMap.size} rename mappings loaded`);
const resolveToolName = buildToolNameResolver(execHashToCapName, renameMap, capCanonicalMap);

// --- Step 7: Load traces & generate transition examples ---
console.log("\n[7/11] Loading execution traces...");
const traceRows = await sql`
  SELECT
    et.id,
    et.task_results,
    et.success,
    COALESCE(et.intent_embedding, wp.intent_embedding)::text as intent_embedding,
    wp.pattern_id as capability_id,
    wp.dag_structure->'static_structure'->'edges' as static_edges,
    cr.namespace || ':' || cr.action as cap_name
  FROM execution_trace et
  JOIN workflow_pattern wp ON et.capability_id = wp.pattern_id
  LEFT JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id
  WHERE et.task_results IS NOT NULL
    AND jsonb_array_length(et.task_results) >= 1
    AND wp.intent_embedding IS NOT NULL
  ORDER BY et.executed_at DESC
`;

console.log(`      ${traceRows.length} traces (incl. single-tool)`);

const prodExamples: (TransitionExample & { _traceId: string; _capId: string })[] = [];
const tracePathsForEval: Array<{
  intentEmbedding: number[];
  actualPath: string[];
  traceId: string;
}> = [];
const singleToolSeen = new Set<string>();
let singleToolCount = 0, multiToolCount = 0;
let edgesCount = 0, dagAwareCount = 0, linearFallbackCount = 0;

function embedHash(emb: number[]): string {
  return emb.slice(0, 8).map((v) => v.toFixed(4)).join(",");
}

// Extend validToolIdSet to include cap IDs (for cap-as-terminal)
const capIdSet = new Set(capabilityData.map((c) => c.id));
const validToolIdSet = new Set([...enrichedToolEmbeddings.keys(), ...capIdSet]);

// Map traceId → capabilityId for capability-level eval
const traceIdToCapId = new Map<string, string>();

let capTerminalCount = 0;
let consecutiveDedupCount = 0;

for (const trace of traceRows) {
  const intentEmbedding = parseEmbedding(trace.intent_embedding);
  if (!intentEmbedding) continue;

  // Resolve capability_id (UUID) → namespace:action for cap-level eval
  const traceCapName = trace.cap_name ? resolveToolName(trace.cap_name as string) : trace.capability_id;
  traceIdToCapId.set(trace.id, traceCapName);

  const rawTaskResults = trace.task_results as TaskResultWithLayer[];

  // Pre-resolve tool names (normalizeToolId + resolveToolName, aligned with train-gru-with-caps.ts)
  const resolvedTaskResults = rawTaskResults.map((t) => ({
    ...t,
    tool: t.tool ? resolveToolName(normalizeToolId(t.tool)) : t.tool,
  }));

  // Consecutive dedup (prevents loops like 360x embedding_encode from flooding training set)
  const dedupedTaskResults = resolvedTaskResults.filter((t, i) =>
    i === 0 || t.tool !== resolvedTaskResults[i - 1]?.tool
  );
  consecutiveDedupCount += resolvedTaskResults.length - dedupedTaskResults.length;

  // Parse static structure edges if available (P1 DAG causal fix)
  // NO_EDGES=true → force linear fallback for A/B testing
  const staticEdges = NO_EDGES ? undefined :
    (Array.isArray(trace.static_edges) ? trace.static_edges : undefined);

  // Use DAG-aware example generation with edges → layerIndex → linear fallback
  const traceResult = buildDAGAwareExamples(
    trace.id,
    intentEmbedding,
    dedupedTaskResults,
    validToolIdSet,
    singleToolSeen,
    embedHash,
    staticEdges,
  );

  if (traceResult.isSingleTool) singleToolCount++;
  if (traceResult.isMultiTool) {
    multiToolCount++;
    if (traceResult.contextMode === "edges") edgesCount++;
    else if (traceResult.contextMode === "layerIndex") dagAwareCount++;
    else linearFallbackCount++;

    // Also build the path for E2E eval (linear order for path comparison)
    const toolSequence = dedupedTaskResults
      .map((t: TaskResultWithLayer) => t.tool)
      .filter((t): t is string => !!t && validToolIdSet.has(t));
    tracePathsForEval.push({ intentEmbedding, actualPath: toolSequence, traceId: trace.id });
  }

  // Attach _capId to each example for capability-level eval
  for (const ex of traceResult.examples) {
    prodExamples.push({ ...ex, _capId: traceCapName });
  }

  // Cap-as-terminal: after the full tool sequence, predict the wrapping capability
  // Teaches: "after seeing [tool1, tool2, ...], the whole thing = this cap"
  const rawCapName = trace.cap_name as string | null;
  const capName = rawCapName ? resolveToolName(rawCapName) : null;
  if (capName && capIdSet.has(capName) && traceResult.isMultiTool) {
    const toolSeq = dedupedTaskResults
      .map((t) => t.tool)
      .filter((t): t is string => !!t && validToolIdSet.has(t));
    if (toolSeq.length > 0) {
      prodExamples.push({
        intentEmbedding,
        contextToolIds: toolSeq,
        targetToolId: capName,
        isTerminal: 1,
        isSingleTool: false,
        _traceId: trace.id,
        _capId: traceCapName,
      });
      capTerminalCount++;
    }
  }
}

console.log(
  `      Prod: ${prodExamples.length} examples (${singleToolCount} single, ${multiToolCount} multi-tool)`,
);
console.log(
  `      Context mode: edges=${edgesCount}, layerIndex=${dagAwareCount}, linear=${linearFallbackCount} traces`,
);
if (consecutiveDedupCount > 0) console.log(`      Consecutive dedup: ${consecutiveDedupCount} steps removed`);
if (capTerminalCount > 0) console.log(`      Cap-as-terminal: ${capTerminalCount} examples added`);
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
const N8N_DATA_PATH_PARQUET = resolve(N8N_DATA_DIR, "n8n-training-examples.parquet");
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

// Helper: reconstruct dense probs from Parquet sparse indices/probs columns.
// The sparse indices reference the same allToolIds ordering as toolIds in this script
// (PML from DB sorted by tool_id + Smithery from expanded-vocab.json), so they map
// directly to model indices without remapping.
function sparseParquetToProbs(
  indicesBytes: Uint8Array,
  probsBytes: Uint8Array,
  vocabSize: number,
): number[] | null {
  if (!indicesBytes || indicesBytes.length === 0) return null;
  // Ensure alignment for typed array views
  const idxAligned = new Uint8Array(indicesBytes.length);
  idxAligned.set(indicesBytes);
  const indices = new Int32Array(idxAligned.buffer, 0, idxAligned.length / 4);

  const probAligned = new Uint8Array(probsBytes.length);
  probAligned.set(probsBytes);
  const probs = new Float32Array(probAligned.buffer, 0, probAligned.length / 4);

  const dense = new Array(vocabSize).fill(0);
  let total = 0;
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    if (idx >= 0 && idx < vocabSize) {
      dense[idx] = probs[i];
      total += probs[i];
    }
  }
  if (total > 0) {
    for (let i = 0; i < dense.length; i++) dense[i] /= total;
  }
  return total > 0 ? dense : null;
}

if (PROD_ONLY) {
  console.log("      PROD_ONLY: skipping n8n augmentation data");
} else if (existsSync(N8N_DATA_PATH_PARQUET)) {
  // Primary: Parquet format (memory-efficient, avoids ~12GB msgpack decode)
  // FAIL-FAST: if Parquet exists but fails to load, throw — no silent fallback
  console.log(`      Loading Parquet: ${N8N_DATA_PATH_PARQUET}`);
  const t0Parquet = performance.now();

  const arrowMod = await import("apache-arrow");
  const parquetWasm = await import("parquet-wasm");
  if (typeof parquetWasm.default === "function") {
    await (parquetWasm.default as unknown as () => Promise<void>)();
  }
  const { readParquet: readPq } = parquetWasm;

  const parquetBytes = new Uint8Array(readFileSync(N8N_DATA_PATH_PARQUET));
  console.log(`      Parquet file: ${(parquetBytes.length / 1024 / 1024).toFixed(1)} MB`);
  const wasmTable = readPq(parquetBytes);
  const ipcStream = wasmTable.intoIPCStream();
  const arrowTable = arrowMod.tableFromIPC(ipcStream);

  const numRows = arrowTable.numRows;
  const colEmb = arrowTable.getChild("intent_embedding")!;
  const colCtx = arrowTable.getChild("context_tool_ids_json")!;
  const colTarget = arrowTable.getChild("target_tool_id")!;
  const colTerm = arrowTable.getChild("is_terminal")!;
  const colSparseIdx = arrowTable.getChild("soft_target_indices")!;
  const colSparseProb = arrowTable.getChild("soft_target_probs")!;

  let rawCount = 0;
  for (let i = 0; i < numRows; i++) {
    rawCount++;
    const targetToolId = colTarget.get(i) as string;
    const contextToolIds = JSON.parse(colCtx.get(i) as string) as string[];

    if (!enrichedToolEmbeddings.has(targetToolId)) continue;
    if (contextToolIds.some((id: string) => !enrichedToolEmbeddings.has(id))) continue;

    const embBytes = colEmb.get(i) as Uint8Array;
    const embAligned = new Uint8Array(embBytes.length);
    embAligned.set(embBytes);
    const intentEmbedding = Array.from(
      new Float32Array(embAligned.buffer, 0, embAligned.length / 4),
    );

    const indicesBytes = colSparseIdx.get(i) as Uint8Array;
    const probsBytes = colSparseProb.get(i) as Uint8Array;
    const softTargetProbs = sparseParquetToProbs(indicesBytes, probsBytes, toolIds.length);

    n8nExamples.push({
      intentEmbedding,
      contextToolIds,
      targetToolId,
      isTerminal: (colTerm.get(i) as number) || 0,
      isSingleTool: false,
      softTargetProbs: softTargetProbs ?? undefined,
    });
  }

  const elapsed = ((performance.now() - t0Parquet) / 1000).toFixed(1);
  console.log(`      n8n examples loaded: ${n8nExamples.length} (from ${rawCount} raw, ${elapsed}s)`);
} else if (existsSync(N8N_DATA_PATH_BIN)) {
  // Fallback 1: msgpack+gzip format (WARNING: requires ~12GB RAM to decode)
  console.log(`      WARNING: Parquet not found, falling back to msgpack+gzip (high memory usage)`);
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
  // Fallback 2: JSON format
  console.log(`      WARNING: Parquet and msgpack not found, falling back to JSON`);
  console.log(`      Loading JSON: ${N8N_DATA_PATH_JSON}`);
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
  console.warn(`      WARNING: n8n data not found (tried parquet, msgpack.gz and json)`);
  console.warn(`      Continuing with production-only training.`);
}
// --- n8n loading done ---

// Split n8n into train/eval BY WORKFLOW (group by intentEmbedding hash)
function intentHash(emb: number[]): string {
  return emb.slice(0, 12).map((v) => v.toFixed(3)).join(",");
}

let n8nTrainKeys = new Set<string>();
let n8nEvalKeys = new Set<string>();
const n8nTrain: TransitionExample[] = [];
const n8nEval: TransitionExample[] = [];
let n8nSplitPct = "0";

if (!PROD_ONLY && n8nExamples.length > 0) {
  const n8nByWorkflow = new Map<string, TransitionExample[]>();
  for (const ex of n8nExamples) {
    const key = intentHash(ex.intentEmbedding);
    if (!n8nByWorkflow.has(key)) n8nByWorkflow.set(key, []);
    n8nByWorkflow.get(key)!.push(ex);
  }

  const n8nWorkflowKeys = shuffle([...n8nByWorkflow.keys()]);
  const n8nSplitIdx = Math.floor(n8nWorkflowKeys.length * 0.8);
  n8nTrainKeys = new Set(n8nWorkflowKeys.slice(0, n8nSplitIdx));
  n8nEvalKeys = new Set(n8nWorkflowKeys.slice(n8nSplitIdx));

  for (const [key, exs] of n8nByWorkflow) {
    if (n8nTrainKeys.has(key)) n8nTrain.push(...exs);
    else n8nEval.push(...exs);
  }

  n8nSplitPct = ((n8nTrainKeys.size / n8nByWorkflow.size) * 100).toFixed(0);
  console.log(
    `      n8n split (by workflow): ${n8nTrainKeys.size} train / ${n8nEvalKeys.size} eval workflows  (${n8nSplitPct}/${
      100 - +n8nSplitPct
    } split)`,
  );
  console.log(`      n8n examples:            ${n8nTrain.length} train / ${n8nEval.length} eval`);
}

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
  const toolSeq = taskResults
    .map((t) => t.tool ? resolveToolName(normalizeToolId(t.tool)) : null)
    .filter((t): t is string => !!t && enrichedToolEmbeddings.has(t));
  if (toolSeq.length >= 2) allTraces.push(toolSeq);
}
const bigramMatrix = computeBigramMatrix(allTraces, toolIdToIdx, toolIds.length);
console.log(
  `      Jaccard: ${toolIds.length}x${toolIds.length}, Bigram from ${allTraces.length} traces`,
);

// --- Step 7d: Prod-style Scoring Eval (capability K-head + cosine BGE tools) ---
let shgatMRR = 0;

// === 7d-A: Cosine BGE tool scoring (like prod vectorSearch.searchTools) ===
// This is what prod does for tool discovery — cosine(intent, raw_BGE_embedding)
console.log(`\n[7d/11] Prod-style scoring eval (prod test)...`);
console.log(`      7d-A: Cosine BGE tool scoring (raw embeddings, like prod pgvector)...`);

let bgeToolR1 = 0, bgeToolR3 = 0, bgeToolR5 = 0, bgeToolMRRSum = 0;
let bgeToolTotal = 0;

// Pre-compute norms for all raw tool embeddings
const rawToolNorms = new Float64Array(toolIds.length);
for (let i = 0; i < toolIds.length; i++) {
  const emb = rawToolEmbeddings.get(toolIds[i])!;
  let norm = 0;
  for (let d = 0; d < emb.length; d++) norm += emb[d] * emb[d];
  rawToolNorms[i] = Math.sqrt(norm);
}

for (const ex of prodTest) {
  // Compute cosine(intent, rawEmb[t]) for all tools
  let intentNorm = 0;
  for (let d = 0; d < ex.intentEmbedding.length; d++) intentNorm += ex.intentEmbedding[d] * ex.intentEmbedding[d];
  intentNorm = Math.sqrt(intentNorm);

  const scores: Array<{ idx: number; score: number }> = [];
  for (let t = 0; t < toolIds.length; t++) {
    const rawEmb = rawToolEmbeddings.get(toolIds[t])!;
    let dot = 0;
    for (let d = 0; d < rawEmb.length; d++) dot += ex.intentEmbedding[d] * rawEmb[d];
    scores.push({ idx: t, score: dot / (intentNorm * rawToolNorms[t] + 1e-10) });
  }
  scores.sort((a, b) => b.score - a.score);

  const rank = scores.findIndex((s) => toolIds[s.idx] === ex.targetToolId);
  bgeToolTotal++;
  if (rank === 0) bgeToolR1++;
  if (rank >= 0 && rank < 3) bgeToolR3++;
  if (rank >= 0 && rank < 5) bgeToolR5++;
  if (rank >= 0) bgeToolMRRSum += 1 / (rank + 1);
}

const bgeMRR = bgeToolTotal > 0 ? bgeToolMRRSum / bgeToolTotal : 0;
console.log(`      BGE Tool R@1: ${bgeToolR1}/${bgeToolTotal} (${(bgeToolR1 / Math.max(bgeToolTotal, 1) * 100).toFixed(1)}%)`);
console.log(`      BGE Tool R@3: ${bgeToolR3}/${bgeToolTotal} (${(bgeToolR3 / Math.max(bgeToolTotal, 1) * 100).toFixed(1)}%)`);
console.log(`      BGE Tool R@5: ${bgeToolR5}/${bgeToolTotal} (${(bgeToolR5 / Math.max(bgeToolTotal, 1) * 100).toFixed(1)}%)`);
console.log(`      BGE Tool MRR: ${bgeMRR.toFixed(3)}`);

// === 7d-B: Capability-level scoring (cosine BGE on cap embeddings) ===
// This mirrors what SHGAT K-head does in prod (scoreAllCapabilities), but here
// we use cosine as baseline — K-head eval requires the SHGAT adapter with prod params.
console.log(`\n      7d-B: Capability-level scoring...`);

// Build list of PML capabilities (not n8n, which are synthetic)
const pmlCapIds = [...capEmbeddings.keys()].filter(id => !id.startsWith("n8n:"));
console.log(`      PML capabilities: ${pmlCapIds.length} (excluding ${capEmbeddings.size - pmlCapIds.length} n8n)`);

let capCosR1 = 0, capCosR3 = 0, capCosMRRSum = 0, capCosTotal = 0;
let capCoverage1 = 0, capCoverage3 = 0, capCoverage5 = 0, capCoverageTotal = 0;

// Deduplicate: one eval per (traceId, intentEmbedding) — avoid counting the same trace multiple times
const seenTraceForCapEval = new Set<string>();

for (const ex of prodTest) {
  const capId = ex._capId;
  if (!capId || !capEmbeddings.has(capId)) continue;
  if (seenTraceForCapEval.has(ex._traceId)) continue;
  seenTraceForCapEval.add(ex._traceId);

  // Cosine(intent, cap_embedding) for all PML capabilities
  let intentNorm = 0;
  for (let d = 0; d < ex.intentEmbedding.length; d++) intentNorm += ex.intentEmbedding[d] * ex.intentEmbedding[d];
  intentNorm = Math.sqrt(intentNorm);

  const capScores: Array<{ capId: string; score: number }> = [];
  for (const cId of pmlCapIds) {
    const capEmb = capEmbeddings.get(cId)!;
    let dot = 0, capNorm = 0;
    for (let d = 0; d < capEmb.length; d++) {
      dot += ex.intentEmbedding[d] * capEmb[d];
      capNorm += capEmb[d] * capEmb[d];
    }
    capScores.push({ capId: cId, score: dot / (intentNorm * Math.sqrt(capNorm) + 1e-10) });
  }
  capScores.sort((a, b) => b.score - a.score);

  // Cap R@K: is the correct capability in the top-K?
  const capRank = capScores.findIndex((s) => s.capId === capId);
  capCosTotal++;
  if (capRank === 0) capCosR1++;
  if (capRank >= 0 && capRank < 3) capCosR3++;
  if (capRank >= 0) capCosMRRSum += 1 / (capRank + 1);

  // Coverage@K: do the tools of top-K capabilities contain the target tool?
  capCoverageTotal++;
  for (const topK of [1, 3, 5]) {
    const topCapTools = new Set<string>();
    for (let k = 0; k < Math.min(topK, capScores.length); k++) {
      const children = capToToolChildren.get(capScores[k].capId) ?? [];
      for (const t of children) topCapTools.add(t);
    }
    if (topCapTools.has(ex.targetToolId)) {
      if (topK === 1) capCoverage1++;
      if (topK === 3) capCoverage3++;
      if (topK === 5) capCoverage5++;
    }
  }
}

const capCosMRR = capCosTotal > 0 ? capCosMRRSum / capCosTotal : 0;
console.log(`      Cap Cosine R@1: ${capCosR1}/${capCosTotal} (${(capCosR1 / Math.max(capCosTotal, 1) * 100).toFixed(1)}%)`);
console.log(`      Cap Cosine R@3: ${capCosR3}/${capCosTotal} (${(capCosR3 / Math.max(capCosTotal, 1) * 100).toFixed(1)}%)`);
console.log(`      Cap Cosine MRR: ${capCosMRR.toFixed(3)}`);
console.log(`      Tool Coverage@1: ${capCoverage1}/${capCoverageTotal} (${(capCoverage1 / Math.max(capCoverageTotal, 1) * 100).toFixed(1)}%)`);
console.log(`      Tool Coverage@3: ${capCoverage3}/${capCoverageTotal} (${(capCoverage3 / Math.max(capCoverageTotal, 1) * 100).toFixed(1)}%)`);
console.log(`      Tool Coverage@5: ${capCoverage5}/${capCoverageTotal} (${(capCoverage5 / Math.max(capCoverageTotal, 1) * 100).toFixed(1)}%)`);

// === 7d-C: SHGAT K-head scoring (if graph available) ===
if (NO_GRAPH) {
  console.log(`\n      7d-C: SHGAT K-head scoring: SKIPPED (${NO_SHGAT ? "NO_SHGAT" : "V2V_ONLY"} mode)`);
} else {
  console.log(`\n      7d-C: SHGAT K-head scoring (adapter scoreNodes on tools)...`);

  // Ensure graph is built for adapter scoring
  if (!shgatAdapter.hasGraph()) {
    const scoringGraphNodes: GraphNode[] = [];
    for (let i = 0; i < toolIds.length; i++) {
      scoringGraphNodes.push({ id: toolIds[i], embedding: [...enrichedToolEmbeddings.get(toolIds[i])!], children: [], level: 0 });
    }
    for (let level = 0; level <= maxLevel; level++) {
      const levelCaps = capIdsByLevel.get(level) || [];
      for (const capId of levelCaps) {
        const emb = capEmbeddings.get(capId);
        if (!emb) continue;
        const children = capToToolChildren.get(capId) ?? [];
        if (children.length === 0) continue;
        scoringGraphNodes.push({ id: capId, embedding: emb, children, level });
      }
    }
    shgatAdapter.buildGraph(scoringGraphNodes);
    shgatAdapter.enrichEmbeddings();
  }

  const hierToolSet = new Set(hierToolIndices.map((i) => toolIds[i]));

  for (const ex of prodTest) {
    const topK = shgatAdapter.scoreNodes(ex.intentEmbedding, 5).topK;
    const rank = topK.findIndex((r) => r.nodeId === ex.targetToolId);
    shgatStandaloneTotal++;
    if (rank === 0) shgatStandaloneR1++;
    if (rank >= 0 && rank < 3) shgatStandaloneR3++;
    if (rank >= 0 && rank < 5) shgatStandaloneR5++;
    if (rank >= 0) shgatStandaloneMRR += 1 / (rank + 1);

    if (hierToolSet.has(ex.targetToolId)) {
      shgatHierTotal++;
      if (rank === 0) shgatHierR1++;
    } else {
      shgatOrphTotal++;
      if (rank === 0) shgatOrphR1++;
    }
  }

  shgatMRR = shgatStandaloneTotal > 0 ? shgatStandaloneMRR / shgatStandaloneTotal : 0;
  console.log(`      SHGAT standalone R@1: ${shgatStandaloneR1}/${shgatStandaloneTotal} (${(shgatStandaloneR1 / Math.max(shgatStandaloneTotal, 1) * 100).toFixed(1)}%)`);
  console.log(`      SHGAT standalone R@3: ${shgatStandaloneR3}/${shgatStandaloneTotal} (${(shgatStandaloneR3 / Math.max(shgatStandaloneTotal, 1) * 100).toFixed(1)}%)`);
  console.log(`      SHGAT standalone R@5: ${shgatStandaloneR5}/${shgatStandaloneTotal} (${(shgatStandaloneR5 / Math.max(shgatStandaloneTotal, 1) * 100).toFixed(1)}%)`);
  console.log(`      SHGAT standalone MRR: ${shgatMRR.toFixed(3)}`);
}
console.log(`      Split: hier R@1=${shgatHierR1}/${shgatHierTotal} (${(shgatHierR1 / Math.max(shgatHierTotal, 1) * 100).toFixed(1)}%), orph R@1=${shgatOrphR1}/${shgatOrphTotal} (${(shgatOrphR1 / Math.max(shgatOrphTotal, 1) * 100).toFixed(1)}%)`);

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
    // Build vocab mapping for inference (tool order must match similarity_head columns)
    // Only save vocabNodes that are ACTUALLY in the model's vocab (filtered by allChildrenKnown)
    const modelVocab = model.getNodeToIndex();
    const vocabNodeIds = higherLevelNodes
      .filter((n) => n.level > 0 && modelVocab.has(n.id))
      .map((n) => ({ id: n.id, children: n.children }));
    const saved: Record<string, unknown> = {
      date: new Date().toISOString(),
      weights: model.exportWeights(),
      trainingResult: gruResult,
      config: { epochs: EPOCHS, batchSize: BATCH_SIZE, prodOversample: PROD_OVERSAMPLE },
      ...(SAVE_VOCAB ? { vocab: { toolIds, vocabNodes: vocabNodeIds } } : {}),
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
): Array<{ nodeId: string; score: number }> {
  if (!shgatAdapter.hasGraph()) {
    throw new Error(
      "[shgatRetrieveTopK] No SHGAT graph built. " +
      "In NO_SHGAT mode, callers MUST guard with `if (!NO_SHGAT)` instead of calling this."
    );
  }
  return shgatAdapter.scoreNodes(intentEmb, k).topK;
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

// --- Extended KPIs: Termination P/R, Hit@1 by position, Confusion ---
console.log("\n      --- Extended KPIs (full step-by-step sweep, all test traces) ---");

// Per-position accuracy
const positionStats: Array<{ correct: number; total: number }> = [];
// Termination precision/recall
let termTP = 0, termFP = 0, termFN = 0, termTN = 0;
// Confusion: target → { predicted → count } (only when wrong)
const confusionWrong = new Map<string, Map<string, number>>();

for (const { intentEmbedding, actualPath } of testTracePathsForEval) {
  for (let step = 0; step <= actualPath.length; step++) {
    const context = actualPath.slice(0, step);
    const pred = model.predictNextTopK(intentEmbedding, context, 3);
    const isEnd = step === actualPath.length;

    // Termination P/R
    if (pred.shouldTerminate && isEnd) termTP++;
    else if (pred.shouldTerminate && !isEnd) termFP++;
    else if (!pred.shouldTerminate && isEnd) termFN++;
    else termTN++;

    // Per-position Hit@1 (only for non-terminal steps)
    if (!isEnd) {
      if (!positionStats[step]) positionStats[step] = { correct: 0, total: 0 };
      positionStats[step].total++;
      if (pred.ranked[0]?.toolId === actualPath[step]) {
        positionStats[step].correct++;
      } else {
        // Confusion tracking
        const target = actualPath[step];
        const predicted = pred.ranked[0]?.toolId ?? "?";
        if (!confusionWrong.has(target)) confusionWrong.set(target, new Map());
        const m = confusionWrong.get(target)!;
        m.set(predicted, (m.get(predicted) || 0) + 1);
      }
    }
  }
}

// Display Termination P/R
const termPrecision = termTP + termFP > 0 ? termTP / (termTP + termFP) : 0;
const termRecall = termTP + termFN > 0 ? termTP / (termTP + termFN) : 0;
const termF1 = termPrecision + termRecall > 0
  ? 2 * termPrecision * termRecall / (termPrecision + termRecall)
  : 0;
console.log(`      Termination:  P=${(termPrecision * 100).toFixed(1)}%  R=${(termRecall * 100).toFixed(1)}%  F1=${(termF1 * 100).toFixed(1)}%  (TP=${termTP} FP=${termFP} FN=${termFN} TN=${termTN})`);

// Display Hit@1 by position
console.log("      Hit@1 by position:");
for (let p = 0; p < Math.min(positionStats.length, 8); p++) {
  const s = positionStats[p];
  if (!s || s.total === 0) continue;
  const acc = (s.correct / s.total * 100).toFixed(1);
  const bar = "#".repeat(Math.round(s.correct / s.total * 20));
  console.log(`        pos=${p} (ctx=${p}): ${acc.padStart(5)}% (${s.correct}/${s.total}) ${bar}`);
}

// Display top confused pairs
const confusionPairs: Array<{ target: string; predicted: string; count: number }> = [];
confusionWrong.forEach((preds, target) => {
  preds.forEach((count, predicted) => {
    confusionPairs.push({ target, predicted, count });
  });
});
confusionPairs.sort((a, b) => b.count - a.count);
console.log("      Top confused tool pairs (target → predicted, count):");
for (let i = 0; i < Math.min(confusionPairs.length, 15); i++) {
  const { target, predicted, count } = confusionPairs[i];
  console.log(`        ${target} → ${predicted} (${count}x)`);
}

// --- Hit@1 split: connected (MP-enriched) vs orphan tools ---
console.log("\n      --- Hit@1 by MP connectivity (connected vs orphan) ---");

// A tool is "connected" if it has at least one parent capability in the hierarchy
const connectedToolIdSet = new Set<string>();
for (let i = 0; i < toolIds.length; i++) {
  if (toolToCapIds[i].length > 0) connectedToolIdSet.add(toolIds[i]);
}

let mpConnHit1 = 0, mpConnHit3 = 0, mpConnTotal = 0;
let mpOrphHit1 = 0, mpOrphHit3 = 0, mpOrphTotal = 0;

for (const { intentEmbedding, actualPath } of testTracePathsForEval) {
  for (let step = 0; step < actualPath.length; step++) {
    const context = actualPath.slice(0, step);
    const pred = model.predictNextTopK(intentEmbedding, context, 3);
    const target = actualPath[step];
    const top1 = pred.ranked[0]?.toolId;
    const inTop3 = pred.ranked.slice(0, 3).some(r => r.toolId === target);

    if (connectedToolIdSet.has(target)) {
      mpConnTotal++;
      if (top1 === target) mpConnHit1++;
      if (inTop3) mpConnHit3++;
    } else {
      mpOrphTotal++;
      if (top1 === target) mpOrphHit1++;
      if (inTop3) mpOrphHit3++;
    }
  }
}

const mpConnH1Pct = mpConnTotal > 0 ? (mpConnHit1 / mpConnTotal * 100) : 0;
const mpConnH3Pct = mpConnTotal > 0 ? (mpConnHit3 / mpConnTotal * 100) : 0;
const mpOrphH1Pct = mpOrphTotal > 0 ? (mpOrphHit1 / mpOrphTotal * 100) : 0;
const mpOrphH3Pct = mpOrphTotal > 0 ? (mpOrphHit3 / mpOrphTotal * 100) : 0;
const mpDeltaPP = mpConnH1Pct - mpOrphH1Pct;

console.log(`      Connected tools (in hierarchy):  Hit@1=${mpConnH1Pct.toFixed(1)}%  Hit@3=${mpConnH3Pct.toFixed(1)}%  (${mpConnHit1}/${mpConnTotal})`);
console.log(`      Orphan tools (no MP benefit):    Hit@1=${mpOrphH1Pct.toFixed(1)}%  Hit@3=${mpOrphH3Pct.toFixed(1)}%  (${mpOrphHit1}/${mpOrphTotal})`);
console.log(`      MP delta (connected - orphan):   ${mpDeltaPP > 0 ? "+" : ""}${mpDeltaPP.toFixed(1)}pp`);

// --- Standard E2E eval with buildPath ---
console.log("\n      --- E2E Path Building (test set only) ---");
let pathExactMatch = 0;
let pathFirstToolMatch = 0;
let pathLengthMatch = 0;
let totalPathLenDiff = 0;
let firstNCorrect = 0;

// Length distribution tracking
const actualLengths: number[] = [];
const predictedLengths: number[] = [];

const maxSamples = testTracePathsForEval.length;
const sampleTraces = testTracePathsForEval;

for (let t = 0; t < sampleTraces.length; t++) {
  const { intentEmbedding, actualPath } = sampleTraces[t];
  const firstTool = actualPath[0];

  const predictedPath = await model.buildPath(intentEmbedding, firstTool);

  // Collect lengths for distribution
  actualLengths.push(actualPath.length);
  predictedLengths.push(predictedPath.length);

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

// --- Length Distribution ---
console.log("\n      --- Length Distribution (actual vs predicted) ---");
const maxLen = Math.max(...actualLengths, ...predictedLengths, 1);
const actualLenHist = new Array(maxLen + 1).fill(0);
const predLenHist = new Array(maxLen + 1).fill(0);
for (const l of actualLengths) actualLenHist[l]++;
for (const l of predictedLengths) predLenHist[l]++;
console.log("      Len | Actual | Predicted | Delta");
for (let l = 1; l <= maxLen; l++) {
  if (actualLenHist[l] === 0 && predLenHist[l] === 0) continue;
  const delta = predLenHist[l] - actualLenHist[l];
  const sign = delta >= 0 ? "+" : "";
  console.log(
    `        ${String(l).padStart(2)} |  ${String(actualLenHist[l]).padStart(3)}  |    ${String(predLenHist[l]).padStart(3)}    | ${sign}${delta}`,
  );
}
const avgActual = actualLengths.reduce((s, l) => s + l, 0) / actualLengths.length;
const avgPred = predictedLengths.reduce((s, l) => s + l, 0) / predictedLengths.length;
console.log(`      Avg length: actual=${avgActual.toFixed(2)}, predicted=${avgPred.toFixed(2)} (bias=${(avgPred - avgActual >= 0 ? "+" : "")}${(avgPred - avgActual).toFixed(2)})`);

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

  // --- Mode A: SHGAT picks first tool (requires graph — skip in NO_GRAPH) ---
  let shgatGreedy: string[] = [];
  if (!NO_GRAPH) {
    const shgatTop = shgatRetrieveTopK(intentEmbedding, 3);
    const shgatFirst = shgatTop[0].nodeId;
    const shgatTop3Ids = shgatTop.map((x) => x.nodeId);
    if (shgatFirst === actualPath[0]) modes.shgat.first1++;
    if (shgatTop3Ids.includes(actualPath[0])) modes.shgat.first3++;
    shgatGreedy = await model.buildPath(intentEmbedding, shgatFirst);
    const shgatBeamRes = model.buildPathBeam(intentEmbedding, shgatFirst, BEAM_WIDTH);
    const shgatBeam = shgatBeamRes[0]?.path ?? [shgatFirst];
    if (pathExact(shgatGreedy, actualPath)) modes.shgat.greedy++;
    if (pathFirstN(shgatGreedy, actualPath)) modes.shgat.firstN++;
    if (pathExact(shgatBeam, actualPath)) modes.shgat.beam++;
    if (pathFirstN(shgatBeam, actualPath)) modes.shgat.beamFirstN++;
  }

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
    if (!NO_GRAPH) {
      console.log(
        `           SHGAT→GRU:  [${shgatGreedy.join(" -> ")}] ${
          pathExact(shgatGreedy, actualPath) ? "EXACT" : ""
        }`,
      );
    }
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
const modesToShow = NO_GRAPH ? [modes.gru, modes.multi] : [modes.shgat, modes.gru, modes.multi];
if (NO_GRAPH) console.log(`      (SHGAT-first skipped — ${NO_SHGAT ? "NO_SHGAT" : "V2V_ONLY"} mode, no graph available)`);
for (const m of modesToShow) {
  console.log(
    `      ${m.label.padEnd(15)} | ${(m.first1 / n * 100).toFixed(1).padStart(5)}% | ${
      (m.first3 / n * 100).toFixed(1).padStart(5)
    }% | ${(m.greedy / n * 100).toFixed(1).padStart(5)}% | ${
      (m.firstN / n * 100).toFixed(1).padStart(6)
    }% | ${(m.beam / n * 100).toFixed(1).padStart(5)}%`,
  );
}

// --- Step 9b-dump: Dump beam candidates + SHGAT scores for NB18 rescoring analysis ---
if (process.env["DUMP_BEAM"] === "true" && !NO_GRAPH) {
  console.log(`\n      --- 9b-dump) Dumping beam candidates + SHGAT scores ---`);
  const dumpBeamWidth = parseInt(process.env["DUMP_BEAM_WIDTH"] || "5", 10);
  // deno-lint-ignore no-explicit-any
  const beamDump: any[] = [];

  for (let t = 0; t < sampleTraces.length; t++) {
    const { intentEmbedding, actualPath } = sampleTraces[t];
    const traceId = sampleTraces[t].traceId ?? `trace_${t}`;

    // GRU auto-start
    const gruAutoStart = model.buildPathAutoStart(intentEmbedding);
    const gruFirst = gruAutoStart.path[0] ?? "";
    const gruTop3 = gruAutoStart.firstToolRanked.slice(0, 3).map((x) => ({
      toolId: x.toolId, score: x.score,
    }));

    // Beam search from GRU first tool
    const beamResults = gruFirst
      ? model.buildPathBeam(intentEmbedding, gruFirst, dumpBeamWidth)
      : [];

    // SHGAT cosine scores per beam (using enriched embeddings)
    const shgatScoresPerBeam: number[][] = [];
    const shgatMeanPerBeam: number[] = [];
    const shgatFirstPerBeam: number[] = [];
    for (const b of beamResults) {
      const sc = b.path.map((toolId: string) => {
        const emb = enrichedToolEmbeddings.get(toolId);
        if (!emb) return 0;
        // cosine(intent, enriched)
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < intentEmbedding.length; i++) {
          dot += intentEmbedding[i] * emb[i];
          na += intentEmbedding[i] * intentEmbedding[i];
          nb += emb[i] * emb[i];
        }
        return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
      });
      shgatScoresPerBeam.push(sc);
      shgatMeanPerBeam.push(sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : 0);
      shgatFirstPerBeam.push(sc[0] ?? 0);
    }

    // SHGAT K-head scoring top-5
    const shgatTop5 = shgatRetrieveTopK(intentEmbedding, 5).map((x) => ({
      nodeId: x.nodeId, score: x.score,
    }));

    beamDump.push({
      traceId, actualPath, gruFirstTool: gruFirst,
      gruFirstScore: gruAutoStart.firstToolRanked[0]?.score ?? 0,
      gruTop3,
      beamCandidates: beamResults.map((b) => ({ path: b.path, gruScore: b.score })),
      shgatScoresPerBeam, shgatMeanPerBeam, shgatFirstPerBeam,
      shgatTop5,
    });
  }

  const dumpPath = process.env["DUMP_BEAM_PATH"] || "../shgat-for-gru/notebooks/18-beam-rescore-data.json";
  writeFileSync(dumpPath, JSON.stringify({ results: beamDump, beamWidth: dumpBeamWidth, seed: SPLIT_SEED }, null, 2));
  console.log(`      Dumped ${beamDump.length} traces to ${dumpPath} (${(readFileSync(dumpPath).length / 1e6).toFixed(1)}MB)`);
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

    // Pick first tool: SHGAT if available, GRU-first otherwise
    let firstTool: string;
    if (NO_GRAPH) {
      const autoStart = model.buildPathAutoStart(wf.intentEmbedding);
      firstTool = autoStart.path[0] ?? "";
    } else {
      const topTools = shgatRetrieveTopK(wf.intentEmbedding, 1);
      firstTool = topTools[0].nodeId;
    }

    // GRU builds path
    const predictedPath = firstTool
      ? await model.buildPath(wf.intentEmbedding, firstTool)
      : [];

    const exact = predictedPath.length === actualPath.length &&
      predictedPath.every((t, i) => t === actualPath[i]);
    if (exact) n8nPathExact++;
    if (firstTool === actualPath[0]) n8nPathFirstToolOk++;

    // Tool set match (same tools, maybe different order)
    const predSet = new Set(predictedPath);
    const actualSet = new Set(actualPath);
    if (predSet.size === actualSet.size && [...actualSet].every((t) => predSet.has(t))) {
      n8nPathToolSetOk++;
    }

    if (n8nWfCount <= 10) {
      const firstOk = firstTool === actualPath[0] ? "OK" : `MISS(${firstTool})`;
      const modeLabel = NO_GRAPH ? "GRU→GRU" : "SHGAT→GRU";
      console.log(`      [${n8nWfCount}] first=${firstOk} ${exact ? "EXACT" : "MISS"}`);
      console.log(`           n8n actual:  [${actualPath.join(" -> ")}]`);
      console.log(`           ${modeLabel}:   [${predictedPath.join(" -> ")}]`);
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

  let topToolsDisplay: Array<{ nodeId: string; score: number }> = [];
  let predictedPath: string[];
  if (NO_GRAPH) {
    const autoStart = model.buildPathAutoStart(intentEmb);
    predictedPath = autoStart.path;
    topToolsDisplay = autoStart.firstToolRanked.slice(0, 5).map((r) => ({ nodeId: r.toolId, score: r.score }));
  } else {
    topToolsDisplay = shgatRetrieveTopK(intentEmb, 5);
    const firstTool = topToolsDisplay[0].nodeId;
    predictedPath = await model.buildPath(intentEmb, firstTool);
  }

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

  const retrievalLabel = NO_GRAPH ? "GRU top-3" : "SHGAT top-3";
  console.log(`      [${i + 1}] "${row.description}"`);
  console.log(
    `           ${retrievalLabel}: ${
      topToolsDisplay.slice(0, 3).map((t) => `${t.nodeId}(${t.score.toFixed(3)})`).join(", ")
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

  let topToolsDisp: Array<{ nodeId: string; score: number }> = [];
  let predictedPath: string[];
  if (NO_GRAPH) {
    const autoStart = model.buildPathAutoStart(intentEmb);
    predictedPath = autoStart.path;
    topToolsDisp = autoStart.firstToolRanked.slice(0, 5).map((r) => ({ nodeId: r.toolId, score: r.score }));
  } else {
    topToolsDisp = shgatRetrieveTopK(intentEmb, 5);
    const firstTool = topToolsDisp[0].nodeId;
    predictedPath = await model.buildPath(intentEmb, firstTool);
  }

  // Check if predicted path contains the hint tools (order-aware partial match)
  const hintSet = new Set(ci.toolHints);
  const matchedHints = predictedPath.filter((t) => hintSet.has(t)).length;
  const coverage = matchedHints / ci.toolHints.length;
  const verdict = coverage >= 0.8 ? "GOOD" : coverage >= 0.5 ? "PARTIAL" : "MISS";
  if (coverage >= 0.5) syntheticHits++;

  const retLabel = NO_GRAPH ? "GRU top-3" : "SHGAT top-3";
  console.log(
    `      [${i + 1}] "${ci.name}" → ${verdict} (${(coverage * 100).toFixed(0)}% tool coverage)`,
  );
  console.log(
    `           ${retLabel}: ${
      topToolsDisp.slice(0, 3).map((t) => `${t.nodeId}(${t.score.toFixed(3)})`).join(", ")
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
console.log(`  --- SHGAT Enrichment Quality ---`);
console.log(`  SHGAT params:            ${SHGAT_PARAMS_PATH || "from DB"}`);
console.log(`  SHGAT levels used:       L0, L1, L2 (all trained)`);
console.log(`  SHGAT scoring:           ${scoringMode}`);
if (NO_SHGAT) {
  console.log(`  Mode:                    NO_SHGAT (raw BGE-M3, pure GRU baseline)`);
} else if (V2V_ONLY) {
  console.log(`  Mode:                    V2V_ONLY (V→V co-occurrence, no MP)`);
} else if (SHGAT_PAPER) {
  console.log(`  Mode:                    SHGAT_PAPER (paper-style two-phase MP${PAPER_WF ? " + wf hyperedges" : ""})`);
  console.log(`  MP time:                 ${(enrichmentMs / 1000).toFixed(2)}s`);
  console.log(`  MP delta hier/orph:      ${hierAvgDelta.toFixed(2)} / ${orphAvgDelta.toFixed(2)} (ratio: ${deltaRatio.toFixed(2)}x)`);
  console.log(`  Intra-cap cosine sim:    ${rawIntraMean.toFixed(4)} → ${enrichedIntraMean.toFixed(4)} (Δ=${simImprovement >= 0 ? "+" : ""}${simImprovement.toFixed(4)})`);
  console.log(`  SHGAT standalone R@1:    ${(shgatStandaloneR1 / Math.max(shgatStandaloneTotal, 1) * 100).toFixed(1)}% (hier: ${(shgatHierR1 / Math.max(shgatHierTotal, 1) * 100).toFixed(1)}%, orph: ${(shgatOrphR1 / Math.max(shgatOrphTotal, 1) * 100).toFixed(1)}%)`);
  console.log(`  SHGAT standalone MRR:    ${shgatMRR.toFixed(3)}`);
} else {
  console.log(`  Mode:                    ${SHGAT_RANDOM ? "SHGAT_RANDOM (frozen MP)" : "SHGAT trained"}`);
  console.log(`  MP time:                 ${(enrichmentMs / 1000).toFixed(2)}s`);
  console.log(`  MP delta hier/orph:      ${hierAvgDelta.toFixed(2)} / ${orphAvgDelta.toFixed(2)} (ratio: ${deltaRatio.toFixed(2)}x)`);
  console.log(`  Intra-cap cosine sim:    ${rawIntraMean.toFixed(4)} → ${enrichedIntraMean.toFixed(4)} (Δ=${simImprovement >= 0 ? "+" : ""}${simImprovement.toFixed(4)})`);
  console.log(`  SHGAT standalone R@1:    ${(shgatStandaloneR1 / Math.max(shgatStandaloneTotal, 1) * 100).toFixed(1)}% (hier: ${(shgatHierR1 / Math.max(shgatHierTotal, 1) * 100).toFixed(1)}%, orph: ${(shgatOrphR1 / Math.max(shgatOrphTotal, 1) * 100).toFixed(1)}%)`);
  console.log(`  SHGAT standalone MRR:    ${shgatMRR.toFixed(3)}`);
}
console.log(`  --- Prod-style Scoring (7d) ---`);
console.log(`  BGE Tool R@1:            ${(bgeToolR1 / Math.max(bgeToolTotal, 1) * 100).toFixed(1)}%  R@3: ${(bgeToolR3 / Math.max(bgeToolTotal, 1) * 100).toFixed(1)}%  MRR: ${bgeMRR.toFixed(3)}`);
console.log(`  Cap Cosine R@1:          ${(capCosR1 / Math.max(capCosTotal, 1) * 100).toFixed(1)}%  R@3: ${(capCosR3 / Math.max(capCosTotal, 1) * 100).toFixed(1)}%  MRR: ${capCosMRR.toFixed(3)}`);
console.log(`  Tool Coverage@1/3/5:     ${(capCoverage1 / Math.max(capCoverageTotal, 1) * 100).toFixed(1)}% / ${(capCoverage3 / Math.max(capCoverageTotal, 1) * 100).toFixed(1)}% / ${(capCoverage5 / Math.max(capCoverageTotal, 1) * 100).toFixed(1)}%`);
console.log(`  --- GRU Training ---`);
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
console.log(`  --- Extended KPIs ---`);
console.log(`  Termination P/R/F1:      P=${(termPrecision * 100).toFixed(1)}% R=${(termRecall * 100).toFixed(1)}% F1=${(termF1 * 100).toFixed(1)}%`);
console.log(`  Hit@1 by position:       ${positionStats.slice(0, 6).map((s, i) => `pos${i}=${s ? (s.correct / s.total * 100).toFixed(0) : "?"}%`).join("  ")}`);
console.log(`  Length bias:             avg actual=${avgActual.toFixed(2)} vs predicted=${avgPred.toFixed(2)} (${avgPred - avgActual >= 0 ? "+" : ""}${(avgPred - avgActual).toFixed(2)})`);
console.log(`  Top confused pair:       ${confusionPairs[0] ? `${confusionPairs[0].target} → ${confusionPairs[0].predicted} (${confusionPairs[0].count}x)` : "none"}`);
console.log(`  --- MP Impact (connected vs orphan) ---`);
console.log(`  Connected Hit@1/3:       ${mpConnH1Pct.toFixed(1)}% / ${mpConnH3Pct.toFixed(1)}%  (${mpConnTotal} steps)`);
console.log(`  Orphan Hit@1/3:          ${mpOrphH1Pct.toFixed(1)}% / ${mpOrphH3Pct.toFixed(1)}%  (${mpOrphTotal} steps)`);
console.log(`  MP delta:                ${mpDeltaPP > 0 ? "+" : ""}${mpDeltaPP.toFixed(1)}pp Hit@1`);
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
const RUN_KFOLD = process.env["KFOLD"] === "true"; // disabled by default, set KFOLD=true to enable

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
    shgatParams: SHGAT_PARAMS_PATH || "from DB",
    vocabTools: enrichedToolEmbeddings.size,
    vocabTotal: model.getToolToIndex().size,
    n8nCaps: capIdsByLevel.get(0)?.length ?? 0,
    mode: NO_SHGAT ? "NO_SHGAT" : V2V_ONLY ? "V2V_ONLY" : SHGAT_PAPER ? (PAPER_WF ? "SHGAT_PAPER+WF" : "SHGAT_PAPER") : SHGAT_RANDOM ? "SHGAT_RANDOM" : "SHGAT_TRAINED",
    v2v: process.env["SKIP_V2V"] !== "true",
    v2vResidualWeight: process.env["SKIP_V2V"] === "true" ? 0 : 0.3,
    v2vCooccurrenceEdges: cooccurrenceEdgeCount,
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
  shgat: {
    enrichment: shgatEnrichmentStats,
    standalone: {
      r1: shgatStandaloneR1 / Math.max(shgatStandaloneTotal, 1),
      r3: shgatStandaloneR3 / Math.max(shgatStandaloneTotal, 1),
      r5: shgatStandaloneR5 / Math.max(shgatStandaloneTotal, 1),
      mrr: shgatMRR,
      total: shgatStandaloneTotal,
      hierR1: shgatHierR1 / Math.max(shgatHierTotal, 1),
      hierTotal: shgatHierTotal,
      orphR1: shgatOrphR1 / Math.max(shgatOrphTotal, 1),
      orphTotal: shgatOrphTotal,
    },
    mpTimeMs: enrichmentMs,
    avgEmbeddingDelta: avgDelta,
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
  extendedKpis: {
    termination: { precision: termPrecision, recall: termRecall, f1: termF1, tp: termTP, fp: termFP, fn: termFN, tn: termTN },
    hitByPosition: positionStats.map((s, i) => ({ position: i, accuracy: s ? s.correct / s.total : 0, total: s?.total ?? 0 })),
    lengthDistribution: { avgActual, avgPredicted: avgPred, bias: avgPred - avgActual, actualHist: actualLenHist, predictedHist: predLenHist },
    topConfusedPairs: confusionPairs.slice(0, 20).map(({ target, predicted, count }) => ({ target, predicted, count })),
  },
};
try {
  writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n      Results saved to ${resultsPath}`);
} catch (e) {
  console.warn(`      Failed to save results: ${e}`);
}

console.log("\n=== Benchmark complete ===");
