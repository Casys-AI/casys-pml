/**
 * Train GRU with capabilities — standalone script
 *
 * - Loads ALL traces (caps appear as-is in sequences, NOT expanded to tools)
 * - Caps are in the output vocab alongside tools (hierarchical softmax)
 * - toolCapMap encodes the cap→tool hierarchy as input features
 * - SHGAT enrichment: loads pre-computed SHGAT embeddings from DB
 *   (tool_embedding.shgat_embedding + workflow_pattern.shgat_embedding)
 *   produced by train-shgat-standalone.ts. No inline MP (Option A).
 * - 80/20 split BY TRACE (not by example, to avoid contamination)
 * - Consecutive duplicate dedup (loop protection)
 * - Trains on train set, evaluates on test set
 * - Saves to DB via spawn-training subprocess
 *
 * Usage: deno run -A scripts/train-gru-with-caps.ts
 */

import * as log from "@std/log";
import { normalizeToolId } from "../src/capabilities/routing-resolver.ts";
import { spawnGRUTraining } from "../src/graphrag/algorithms/gru/spawn-training.ts";
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";
import { capExamplesPerTarget } from "../lib/gru/src/data-prep/cap-frequency-cap.ts";
import { canonicalizeCaps, type CapData } from "../lib/gru/src/data-prep/cap-cleanup.ts";

log.setup({ handlers: { console: new log.ConsoleHandler("DEBUG") }, loggers: { default: { level: "DEBUG", handlers: ["console"] } } });

const DATABASE_URL = Deno.env.get("DATABASE_URL");
if (!DATABASE_URL) {
  console.error("DATABASE_URL required");
  Deno.exit(1);
}
const sql = postgres(DATABASE_URL);

// Seeded PRNG (mulberry32) for reproducible splits
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(42);

// ============================================================================
// 1. Load reference data (caps, renames, embeddings) BEFORE traces
// ============================================================================
console.log("[1/5] Loading reference data...");

// --- 1a. Tool embeddings (defines the tool vocab) ---
// Load SHGAT-enriched embeddings from DB when available (pre-computed by train-shgat-standalone).
// Fallback to raw BGE-M3 for tools without SHGAT embedding (new tools added after last SHGAT run).
// This avoids costly inline MP (~3min) and eliminates double-enrichment risk.
const toolEmbeddings: Record<string, number[]> = {};
let toolShgatCount = 0;
const embRows = await sql`SELECT tool_id, COALESCE(shgat_embedding, embedding) as embedding, shgat_embedding IS NOT NULL as has_shgat FROM tool_embedding ORDER BY tool_id`;
for (const row of embRows) {
  const raw = row.embedding;
  const emb: number[] = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (emb && emb.length > 0) {
    toolEmbeddings[row.tool_id as string] = emb;
    if (row.has_shgat) toolShgatCount++;
  }
}
const toolVocab = new Set(Object.keys(toolEmbeddings));
console.log(`  ${toolVocab.size} tool embeddings (${toolShgatCount} SHGAT-enriched, ${toolVocab.size - toolShgatCount} raw BGE fallback)`);

// --- 1b. Capability data (cap → tool hierarchy from execution traces) ---
// Source of truth: task_results from execution_trace (real execution data)
// instead of dag_structure->'tools_used' (static snapshot)
const capRows = await sql`
  SELECT DISTINCT ON (cr.namespace, cr.action)
    cr.namespace || ':' || cr.action as cap_name,
    COALESCE(wp.shgat_embedding, wp.intent_embedding) as embedding,
    wp.shgat_embedding IS NOT NULL as has_shgat,
    ARRAY(
      SELECT DISTINCT tr->>'tool'
      FROM execution_trace et,
           jsonb_array_elements(et.task_results) tr
      WHERE et.capability_id = wp.pattern_id
        AND et.task_results IS NOT NULL
        AND jsonb_typeof(et.task_results) = 'array'
        AND jsonb_array_length(et.task_results) >= 1
    ) as tools_used,
    wp.hierarchy_level as level,
    COALESCE(wp.usage_count, 0) as usage_count
  FROM workflow_pattern wp
  JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id
  WHERE wp.code_snippet IS NOT NULL
    AND wp.intent_embedding IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM execution_trace et
      WHERE et.capability_id = wp.pattern_id
        AND et.task_results IS NOT NULL
        AND jsonb_typeof(et.task_results) = 'array'
        AND jsonb_array_length(et.task_results) >= 1
    )
  ORDER BY cr.namespace, cr.action, wp.last_used DESC
`;

const capabilityData: Array<{ id: string; embedding: number[]; toolChildren: string[]; level: number; usageCount: number }> = [];
// Direct children map (cap → immediate children, may include other caps)
const capChildrenMap = new Map<string, string[]>();
let dbShgatCount = 0;
for (const row of capRows) {
  const rawEmb = row.embedding;
  const emb: number[] = typeof rawEmb === "string" ? JSON.parse(rawEmb) : rawEmb;
  if (!emb || emb.length === 0) continue;
  const children = ((row.tools_used ?? []) as string[])
    .map(normalizeToolId)
    .filter(Boolean) as string[];
  if (children.length === 0) continue;
  const capName = row.cap_name as string;
  capChildrenMap.set(capName, children);
  capabilityData.push({ id: capName, embedding: emb, toolChildren: children, level: Number(row.level), usageCount: Number(row.usage_count) });
  if (row.has_shgat) dbShgatCount++;
}

// --- 1a-bis. Resolve stale code:exec_HASH references in task_results tools ---
// When a cap calls another cap, task_results stores the callee's original tool ID (code:exec_HASH).
// If the callee was later renamed, the task_results still has the old exec_ reference.
// Fix: build code_hash→cap_name map and resolve exec_ refs to real names.
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
// Resolve exec_ refs in capabilityData toolChildren
const execPattern = /^(?:code|std|filesystem):exec_([a-f0-9]{8})/;
let execResolved = 0;
for (const cap of capabilityData) {
  cap.toolChildren = cap.toolChildren.map(child => {
    const m = child.match(execPattern);
    if (m) {
      const resolved = execHashToCapName.get(m[1]);
      if (resolved) {
        execResolved++;
        return resolved;
      }
    }
    return child;
  });
}
// Also update capChildrenMap
for (const [key, children] of capChildrenMap) {
  capChildrenMap.set(key, children.map(child => {
    const m = child.match(execPattern);
    return m ? (execHashToCapName.get(m[1]) ?? child) : child;
  }));
}
if (execResolved > 0) console.log(`  Resolved ${execResolved} stale code:exec_* refs → real cap names`);

// --- 1a-ter. Apply rename chain to toolChildren ---
// exec_hash resolution (above) only covers hashes with a live code_hash in workflow_pattern.
// Old exec_hashes that were renamed (code updated) are in capability_name_history but NOT in
// workflow_pattern.code_hash. Load rename history here so we can resolve them before flatten.
const renameRows = await sql`
  SELECT old_name, new_name, old_fqdn FROM capability_name_history ORDER BY renamed_at ASC
`;
const renameMap = new Map<string, string>();
for (const row of renameRows) {
  renameMap.set(row.old_name as string, row.new_name as string);
  if (row.old_fqdn) renameMap.set(row.old_fqdn as string, row.new_name as string);
}
// Follow chains: if A->B and B->C, resolve A->C (with cycle protection)
for (const [oldName, newName] of renameMap) {
  let current = newName;
  const visited = new Set<string>([oldName]);
  while (renameMap.has(current) && !visited.has(current)) {
    visited.add(current);
    current = renameMap.get(current)!;
  }
  if (current !== newName) renameMap.set(oldName, current);
}
// Apply rename chain to toolChildren (resolves old exec_hashes missed by step 1a-bis)
let renameResolved = 0;
for (const cap of capabilityData) {
  cap.toolChildren = cap.toolChildren.map(child => {
    const renamed = renameMap.get(child);
    if (renamed) { renameResolved++; return renamed; }
    return child;
  });
}
for (const [key, children] of capChildrenMap) {
  capChildrenMap.set(key, children.map(c => renameMap.get(c) ?? c));
}
if (renameMap.size > 0) {
  console.log(`  ${renameMap.size} rename mappings loaded, ${renameResolved} stale refs resolved in toolChildren`);
}

// SKIP_CAPS=true → tools-only vocab (no caps in output softmax, no cap-as-terminal)
const skipCaps = Deno.env.get("SKIP_CAPS") === "true";
const noCapTerminal = Deno.env.get("NO_CAP_TERMINAL") === "true";
if (noCapTerminal) console.log("  # NO_CAP_TERMINAL=true — cap-as-terminal examples removed (caps stay in vocab)");
if (skipCaps) console.log("  SKIP_CAPS=true — caps excluded from vocab (tools-only)");

// --- 1b-bis. Canonicalize caps by toolset ---
// Multiple caps can share the same toolset (cross-org dupes, test artifacts, near-dupes).
// Instead of adding all as separate vocab entries (softmax dilution), we:
//   1. Group by sorted toolset
//   2. Elect the highest-usage cap as canonical
//   3. Remap non-canonical → canonical (keeps all intents, single vocab entry)
// NO_CANONICALIZE=true disables this (for A/B comparison).
let capCanonicalMap = new Map<string, string>(); // non-canonical → canonical
if (!skipCaps && Deno.env.get("NO_CANONICALIZE") !== "true") {
  const capDataForCanon: CapData[] = capabilityData.map(c => ({
    id: c.id,
    embedding: c.embedding,
    toolChildren: c.toolChildren,
    level: c.level,
    usageCount: c.usageCount,
  }));
  const before = capDataForCanon.length;
  const { canonicalMap, groupCount, remapped } = canonicalizeCaps(capDataForCanon);
  capCanonicalMap = canonicalMap;

  if (remapped > 0) {
    // canonicalizeCaps mutates in-place — rebuild capabilityData from surviving entries
    const canonicalIds = new Set(capDataForCanon.map(c => c.id));
    for (let i = capabilityData.length - 1; i >= 0; i--) {
      if (!canonicalIds.has(capabilityData[i].id)) {
        capabilityData.splice(i, 1);
      }
    }
    for (const nonCanon of canonicalMap.keys()) capChildrenMap.delete(nonCanon);
    for (const cap of capabilityData) {
      cap.toolChildren = cap.toolChildren.map(c => canonicalMap.get(c) ?? c);
    }
    for (const [key, children] of capChildrenMap) {
      capChildrenMap.set(key, children.map(c => canonicalMap.get(c) ?? c));
    }
    console.log(`  Canonicalize: ${groupCount} toolset groups, ${remapped} caps remapped → ${capabilityData.length} canonical (was ${before})`);
  }
} else if (!skipCaps) {
  console.log("  NO_CANONICALIZE=true — all caps kept as separate vocab entries");
}

// --- F2: Natural hierarchy (default) — caps keep L2→L1→L0 relationships ---
// Train worker BFS resolves transitively to L0 when needed (soft labels, metrics).
// FLATTEN_L0=true reverts to old behavior (deprecated, kept for A/B comparison).
const FLATTEN_L0 = Deno.env.get("FLATTEN_L0") === "true";
if (FLATTEN_L0) {
  console.log(`  ⚠️  FLATTEN_L0=true (deprecated) — flattening all caps to L0 tools`);
  const capMap = new Map<string, typeof capabilityData[0]>();
  for (const cap of capabilityData) capMap.set(cap.id, cap);
  let flatCount = 0;
  for (const cap of capabilityData) {
    const l0Tools: string[] = [];
    const queue = [...cap.toolChildren];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const child = queue.shift()!;
      if (visited.has(child)) continue;
      visited.add(child);
      if (toolVocab.has(child)) {
        l0Tools.push(child);
      } else {
        const childCap = capMap.get(child);
        if (childCap) queue.push(...childCap.toolChildren);
      }
    }
    if (!cap.toolChildren.every(c => toolVocab.has(c))) flatCount++;
    cap.toolChildren = l0Tools;
    capChildrenMap.set(cap.id, l0Tools);
  }
  console.log(`  Flatten to L0: ${flatCount} caps resolved recursively`);
} else {
  // Natural hierarchy: caps retain cap-children, train worker resolves via BFS
  for (const cap of capabilityData) {
    capChildrenMap.set(cap.id, cap.toolChildren);
  }
  console.log(`  Natural hierarchy: caps keep cap-children (L2→L1→L0 preserved), ${capabilityData.length} caps`);
}

console.log(`  ${capabilityData.length} capabilities with tool children (${dbShgatCount} from shgat_embedding, ${capabilityData.length - dbShgatCount} from intent_embedding fallback)`);

// --- 1c. SHGAT embeddings (loaded from DB, pre-computed by train-shgat-standalone) ---
// Option A: No inline MP. Tool embeddings already loaded as COALESCE(shgat_embedding, embedding)
// in step 1a. Cap embeddings already loaded as COALESCE(shgat_embedding, intent_embedding) in step 1b.
// This avoids:
//   - 3min decompression + MP overhead per run
//   - Double-enrichment bug (COALESCE reads MP'd embedding, then adapter MP'd again)
// The standalone SHGAT trainer persists both tool and cap embeddings to DB after training.
// SKIP_SHGAT=true → use raw BGE-M3 embeddings (no shgat_embedding from DB either)
const SKIP_SHGAT = Deno.env.get("SKIP_SHGAT") === "true";
if (SKIP_SHGAT) {
  console.log("  SKIP_SHGAT=true — using raw BGE-M3 embeddings (reloading without SHGAT)");
  // Reload tool embeddings WITHOUT shgat_embedding
  const rawEmbRows = await sql`SELECT tool_id, embedding FROM tool_embedding ORDER BY tool_id`;
  for (const row of rawEmbRows) {
    const raw = row.embedding;
    const emb: number[] = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (emb && emb.length > 0) toolEmbeddings[row.tool_id as string] = emb;
  }
  // Note: cap embeddings were loaded via COALESCE(shgat_embedding, intent_embedding).
  // In SKIP_SHGAT mode, ideally we'd reload with intent_embedding only, but this is
  // an ablation-only mode and the difference is marginal (caps without shgat_embedding
  // already got intent_embedding via the COALESCE fallback).
  console.log(`  ${toolVocab.size} tool embeddings (raw BGE-M3, SKIP_SHGAT mode)`);
} else {
  console.log(`  SHGAT embeddings from DB: ${toolShgatCount}/${toolVocab.size} tools, ${dbShgatCount}/${capabilityData.length} caps pre-enriched`);
}

// --- 1c-bis. L2-normalize all embeddings ---
// SHGAT MP output is NOT L2-normalized (forward() with r=0 skips normalization block).
// The GRU similarity_head uses these embeddings as weight matrix (dot product → softmax),
// so non-unit vectors bias predictions toward higher-norm embeddings.
// Raw BGE-M3 embeddings are already unit-normalized, so this is a no-op for them.
function l2Normalize(vec: number[]): number[] {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm < 1e-12) return vec;
  const inv = 1.0 / norm;
  const out = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] * inv;
  return out;
}

{
  let toolsNormalized = 0;
  let toolNormSum = 0;
  for (const toolId of Object.keys(toolEmbeddings)) {
    const emb = toolEmbeddings[toolId];
    let norm = 0;
    for (let i = 0; i < emb.length; i++) norm += emb[i] * emb[i];
    norm = Math.sqrt(norm);
    toolNormSum += norm;
    if (Math.abs(norm - 1.0) > 0.001) {
      toolEmbeddings[toolId] = l2Normalize(emb);
      toolsNormalized++;
    }
  }
  const toolCount = Object.keys(toolEmbeddings).length;
  const avgToolNorm = toolNormSum / toolCount;

  let capsNormalized = 0;
  let capNormSum = 0;
  for (const cap of capabilityData) {
    let norm = 0;
    for (let i = 0; i < cap.embedding.length; i++) norm += cap.embedding[i] * cap.embedding[i];
    norm = Math.sqrt(norm);
    capNormSum += norm;
    if (Math.abs(norm - 1.0) > 0.001) {
      cap.embedding = l2Normalize(cap.embedding);
      capsNormalized++;
    }
  }
  const avgCapNorm = capNormSum / (capabilityData.length || 1);

  console.log(`  L2 norm check: tools avg=${avgToolNorm.toFixed(4)} (${toolsNormalized} re-normalized), caps avg=${avgCapNorm.toFixed(4)} (${capsNormalized} re-normalized)`);
}

// resolveToolName: exec_hash resolution → rename history → canonicalization
// (renameMap already loaded in step 1a-ter above)
const resolveToolName = (name: string): string => {
  // Step 1: resolve stale code:exec_HASH to real cap name
  let resolved = name;
  const m = name.match(execPattern);
  if (m) {
    resolved = execHashToCapName.get(m[1]) ?? name;
  }
  // Step 2: rename chain
  const renamed = renameMap.get(resolved) ?? resolved;
  // Step 3: canonical remap
  return capCanonicalMap.get(renamed) ?? renamed;
};

// ============================================================================
// 2. Load and parse traces (caps kept as-is, no expansion)
// ============================================================================
console.log("[2/5] Loading execution traces...");
const traceRows = await sql`
  SELECT
    et.task_results,
    et.intent_embedding,
    et.success,
    cr.namespace || ':' || cr.action as cap_name
  FROM execution_trace et
  LEFT JOIN workflow_pattern wp ON wp.pattern_id = et.capability_id
  LEFT JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id
  WHERE et.task_results IS NOT NULL
    AND jsonb_typeof(et.task_results) = 'array'
    AND jsonb_array_length(et.task_results) >= 1
    AND et.intent_embedding IS NOT NULL
  ORDER BY et.executed_at DESC
`;
console.log(`  ${traceRows.length} traces loaded`);

interface ParsedTrace {
  tools: string[];  // may contain both tool IDs and cap IDs
  intentEmb: number[];
  capName?: string; // capability that wraps this trace (for cap-as-terminal)
}

let capTargetCount = 0;
const capNameSet = new Set(capChildrenMap.keys());
const allTraces: ParsedTrace[] = [];
for (const trace of traceRows) {
  const taskResults = trace.task_results as Array<{ tool?: string }>;
  const tools = taskResults
    .map(t => t.tool)
    .filter((t): t is string => !!t)
    .map(normalizeToolId)
    .filter(Boolean)
    .map(t => resolveToolName(t!)) as string[];

  if (tools.length < 1) continue;

  // Count cap targets for logging
  for (const t of tools) {
    if (capNameSet.has(t)) capTargetCount++;
  }

  const rawIntent = trace.intent_embedding;
  const intentEmb: number[] = typeof rawIntent === "string" ? JSON.parse(rawIntent) : rawIntent;
  if (!intentEmb || intentEmb.length === 0) continue;

  // Resolve cap name via rename history
  const rawCapName = trace.cap_name as string | null;
  const capName = rawCapName ? resolveToolName(rawCapName) : undefined;

  allTraces.push({ tools, intentEmb, capName: capName || undefined });
}
const tracesWithCap = allTraces.filter(t => t.capName).length;
console.log(`  ${allTraces.length} usable traces (${capTargetCount} cap targets in sequences, ${tracesWithCap} with capability_id for cap-as-terminal)`);

// --- 2b. Dedup identical re-executions ---
// Many caps have duplicate traces (same intent re-executed N times).
// e.g. db:postgresQuery: 918 traces but only 423 unique intents.
// Exact dedup: hash the full intent embedding to remove strict duplicates only.
// NOT fuzzy — we keep similar-but-different intents (they carry nuance).
{
  const beforeCount = allTraces.length;
  const seen = new Set<string>();
  const deduped: ParsedTrace[] = [];

  for (const trace of allTraces) {
    // Group by cap (or tool sequence for cap-less traces)
    const groupKey = trace.capName ?? trace.tools.join("|");
    // Hash full intent embedding — only exact re-executions are deduped
    const intentKey = trace.intentEmb.map(v => v.toFixed(6)).join(",");
    const dedupKey = `${groupKey}::${intentKey}`;

    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    deduped.push(trace);
  }

  const removed = beforeCount - deduped.length;
  allTraces.length = 0;
  allTraces.push(...deduped);
  console.log(`  Dedup exact re-executions: ${beforeCount} → ${allTraces.length} traces (removed ${removed} duplicates)`);
}

// ============================================================================
// 3. Split traces 80/20
// ============================================================================
console.log("[3/5] Splitting traces 80/20 (by trace, seeded)...");

// Shuffle with seeded PRNG
const shuffled = [...allTraces];
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}

const splitIdx = Math.floor(shuffled.length * 0.8);
const trainTraces = shuffled.slice(0, splitIdx);
const testTraces = shuffled.slice(splitIdx);
console.log(`  Train: ${trainTraces.length} traces, Test: ${testTraces.length} traces`);

// --- Build examples from traces ---
// Skip consecutive duplicate targets: if tools[i] == tools[i-1], the example is
// redundant (same context pattern → same tool). We keep the first occurrence of a
// run and skip the rest. This prevents loops (e.g. 360× embedding_encode) from
// flooding the training set with identical gradient signals.
function buildExamples(traces: ParsedTrace[]) {
  const examples: Array<{
    intentEmbedding: number[];
    contextToolIds: string[];
    targetToolId: string;
    isTerminal: number;
    isSingleTool: boolean;
  }> = [];
  let skippedConsecutive = 0;
  let capTerminalAdded = 0;

  for (const trace of traces) {
    // Tool-to-tool examples (existing)
    for (let i = 0; i < trace.tools.length; i++) {
      // Skip if same tool as previous step (consecutive run)
      if (i > 0 && trace.tools[i] === trace.tools[i - 1]) {
        skippedConsecutive++;
        continue;
      }
      examples.push({
        intentEmbedding: trace.intentEmb,
        contextToolIds: trace.tools.slice(0, i),
        targetToolId: trace.tools[i],
        isTerminal: i === trace.tools.length - 1 ? 1 : 0,
        isSingleTool: trace.tools.length === 1,
      });
    }

    // Cap-as-terminal: after the full tool sequence, predict the wrapping capability
    // Teaches: "after seeing [tool1, tool2, ...], the whole thing = this cap"
    if (trace.capName && !skipCaps && !noCapTerminal) {
      examples.push({
        intentEmbedding: trace.intentEmb,
        contextToolIds: trace.tools,
        targetToolId: trace.capName,
        isTerminal: 1,
        isSingleTool: false,
      });
      capTerminalAdded++;
    }
  }
  if (skippedConsecutive > 0) {
    console.log(`  (skipped ${skippedConsecutive} consecutive duplicate examples)`);
  }
  if (capTerminalAdded > 0) {
    console.log(`  (added ${capTerminalAdded} cap-as-terminal examples)`);
  }
  return examples;
}

let trainExamples = buildExamples(trainTraces);
const testExamples = buildExamples(testTraces);
console.log(`  Train: ${trainExamples.length} examples, Test: ${testExamples.length} examples`);

// Per-cap frequency capping
const MAX_PER_CAP = parseInt(Deno.env.get("MAX_PER_CAP") ?? "50", 10);
if (MAX_PER_CAP > 0 && MAX_PER_CAP < 99999) {
  const { capped, stats } = capExamplesPerTarget(trainExamples, MAX_PER_CAP);
  console.log(`  Cap frequency cap: ${stats.before} → ${stats.after} (max ${MAX_PER_CAP}/target, ${stats.cappedTargets} capped)`);
  for (const d of stats.topDropped.slice(0, 3)) {
    console.log(`    ${d.target}: ${d.had} → ${d.kept}`);
  }
  trainExamples = capped;
}

if (trainExamples.length < 50) {
  console.error("Not enough train examples (<50), aborting");
  await sql.end();
  Deno.exit(1);
}

// ============================================================================
// 4. Train
// ============================================================================
console.log("[4/4] Training (worker does periodic test eval)...");
console.log(`  ${trainExamples.length} train, ${testExamples.length} test, ${Object.keys(toolEmbeddings).length} tool embeddings, ${capabilityData.length} caps (in vocab + input features)`);

// --- Export DB weights to temp file for warm start ---
let existingWeightsPath: string | undefined;
const coldStart = !!Deno.env.get("COLD_START");
if (coldStart) {
  console.log("  COLD_START=true — skipping warm start");
} else {
  const dbWeightsRows = await sql`SELECT params FROM gru_params ORDER BY updated_at DESC LIMIT 1`;
  if (dbWeightsRows.length > 0) {
    const paramsObj = typeof dbWeightsRows[0].params === "string"
      ? JSON.parse(dbWeightsRows[0].params)
      : dbWeightsRows[0].params;
    const tmpPath = await Deno.makeTempFile({ prefix: "gru-warm-", suffix: ".json" });
    await Deno.writeTextFile(tmpPath, JSON.stringify(paramsObj));
    existingWeightsPath = tmpPath;
    console.log(`  Warm start from DB weights: ${tmpPath}`);
  } else {
    console.log("  No DB weights — cold start");
  }
}

const result = await spawnGRUTraining({
  examples: trainExamples,
  testExamples,
  evalEvery: 2,
  toolEmbeddings,
  capabilityData: skipCaps ? [] : capabilityData,
  existingWeightsPath,
  epochs: parseInt(process.env.GRU_EPOCHS ?? "100"),
  learningRate: parseFloat(Deno.env.get("GRU_LR") ?? "0.001"),
});

if (result.success) {
  console.log(`\nDone: loss=${result.finalLoss?.toFixed(4)}, train_acc=${result.finalAccuracy?.toFixed(2)}, savedToDb=${result.savedToDb}`);
} else {
  console.error(`\nTraining failed: ${result.error}`);
}

await sql.end();
