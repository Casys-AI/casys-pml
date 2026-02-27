/**
 * Train GRU with capabilities — standalone script
 *
 * - Loads ALL traces (caps appear as-is in sequences, NOT expanded to tools)
 * - Caps are in the output vocab alongside tools (hierarchical softmax)
 * - toolCapMap encodes the cap→tool hierarchy as input features
 * - SHGAT enrichment: loads trained SHGAT params from DB, enriches tool
 *   embeddings via V2V co-occurrence + message passing before passing to
 *   GRU training (aligned with prod pipeline in post-execution.service)
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
import { SHGATAdapter } from "../lib/shgat-for-gru/src/index.ts";
import { buildCooccurrenceFromWorkflows, v2vEnrich } from "../lib/shgat-for-gru/src/v2v.ts";
import type { GraphNode, OBTrainedParams } from "../lib/shgat-for-gru/src/types.ts";
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

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
const toolEmbeddings: Record<string, number[]> = {};
const embRows = await sql`SELECT tool_id, embedding FROM tool_embedding ORDER BY tool_id`;
for (const row of embRows) {
  const raw = row.embedding;
  const emb: number[] = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (emb && emb.length > 0) toolEmbeddings[row.tool_id as string] = emb;
}
const toolVocab = new Set(Object.keys(toolEmbeddings));
console.log(`  ${toolVocab.size} tool embeddings (output vocab)`);

// --- 1b. Capability data (cap → tool hierarchy) ---
const capRows = await sql`
  SELECT DISTINCT ON (cr.namespace, cr.action)
    cr.namespace || ':' || cr.action as cap_name,
    COALESCE(wp.shgat_embedding, wp.intent_embedding) as embedding,
    wp.shgat_embedding IS NOT NULL as has_shgat,
    wp.dag_structure->'tools_used' as tools_used,
    COALESCE(wp.hierarchy_level, 1) as level,
    COALESCE(wp.usage_count, 0) as usage_count
  FROM workflow_pattern wp
  JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id
  WHERE wp.code_snippet IS NOT NULL
    AND wp.intent_embedding IS NOT NULL
    AND wp.dag_structure->'tools_used' IS NOT NULL
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

// --- 1a-bis. Resolve stale code:exec_HASH references in tools_used ---
// When a cap calls another cap, tools_used stores the callee's original name (code:exec_HASH).
// If the callee was later renamed, the caller's tools_used still has the old exec_ reference.
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

// SKIP_CAPS=true → tools-only vocab (no caps in output softmax, no cap-as-terminal)
const skipCaps = Deno.env.get("SKIP_CAPS") === "true";
if (skipCaps) console.log("  SKIP_CAPS=true — caps excluded from vocab (tools-only)");

// --- 1b-bis. Canonicalize caps by toolset ---
// Multiple caps can share the same toolset (cross-org dupes, test artifacts, near-dupes).
// Instead of adding all as separate vocab entries (softmax dilution), we:
//   1. Group by sorted toolset
//   2. Elect the highest-usage cap as canonical
//   3. Remap non-canonical → canonical (keeps all intents, single vocab entry)
// NO_CANONICALIZE=true disables this (for A/B comparison).
const capCanonicalMap = new Map<string, string>(); // non-canonical → canonical
if (!skipCaps && Deno.env.get("NO_CANONICALIZE") !== "true") {
  // Group caps by sorted toolset signature
  const toolsetGroups = new Map<string, Array<{ id: string; usageCount: number; idx: number }>>();
  for (let i = 0; i < capabilityData.length; i++) {
    const cap = capabilityData[i];
    const sig = [...cap.toolChildren].sort().join(",");
    if (!toolsetGroups.has(sig)) toolsetGroups.set(sig, []);
    toolsetGroups.get(sig)!.push({ id: cap.id, usageCount: cap.usageCount, idx: i });
  }

  let ambiguousGroups = 0;
  let remappedCaps = 0;
  const capsToRemove = new Set<number>(); // indices to remove from capabilityData

  for (const [_sig, group] of toolsetGroups) {
    if (group.length <= 1) continue;
    ambiguousGroups++;
    // Elect canonical: highest usage, then alphabetical for determinism
    group.sort((a, b) => b.usageCount - a.usageCount || a.id.localeCompare(b.id));
    const canonical = group[0];
    for (let i = 1; i < group.length; i++) {
      capCanonicalMap.set(group[i].id, canonical.id);
      capsToRemove.add(group[i].idx);
      remappedCaps++;
    }
  }

  // Remove non-canonical caps from capabilityData (reverse order to preserve indices)
  if (capsToRemove.size > 0) {
    const sortedIndices = [...capsToRemove].sort((a, b) => b - a);
    for (const idx of sortedIndices) {
      capabilityData.splice(idx, 1);
    }
    // Also clean capChildrenMap: remove non-canonical entries
    for (const nonCanon of capCanonicalMap.keys()) {
      capChildrenMap.delete(nonCanon);
    }
    // Remap toolChildren references in remaining caps (L2 caps may reference non-canonical L1 children)
    for (const cap of capabilityData) {
      cap.toolChildren = cap.toolChildren.map(c => capCanonicalMap.get(c) ?? c);
    }
    for (const [key, children] of capChildrenMap) {
      capChildrenMap.set(key, children.map(c => capCanonicalMap.get(c) ?? c));
    }
  }

  if (ambiguousGroups > 0) {
    console.log(`  Canonicalize: ${ambiguousGroups} toolset groups, ${remappedCaps} caps remapped → ${capabilityData.length} canonical caps remaining`);
  }
} else if (!skipCaps) {
  console.log("  NO_CANONICALIZE=true — all caps kept as separate vocab entries");
}

// --- F2: Resolve L2+ caps transitively to L0 tools ---
// L2 caps have children = cap names (L1), not tool IDs. Without resolution,
// they get silently skipped when filtering by toolVocab.has().
// Fix: walk down the hierarchy until we reach tools in toolVocab.
let l2Resolved = 0;
for (const cap of capabilityData) {
  if (cap.level < 2) continue;
  const resolvedTools = new Set<string>();
  const queue = [...cap.toolChildren];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const child = queue.shift()!;
    if (visited.has(child)) continue;
    visited.add(child);
    if (toolVocab.has(child)) {
      resolvedTools.add(child);
    } else {
      const grandChildren = capChildrenMap.get(child);
      if (grandChildren) {
        queue.push(...grandChildren);
      } else {
        log.warn(`[caps] L${cap.level} cap "${cap.id}" has child "${child}" not in toolVocab and not a known cap — dropped`);
      }
    }
  }
  if (resolvedTools.size > 0) {
    cap.toolChildren = [...resolvedTools];
    l2Resolved++;
  } else {
    log.warn(`[caps] L${cap.level} cap "${cap.id}" resolved to 0 tools — will be excluded from SHGAT graph`);
  }
}
if (l2Resolved > 0) console.log(`  Resolved ${l2Resolved} L2+ caps transitively to L0 tools`);

console.log(`  ${capabilityData.length} capabilities with tool children (${dbShgatCount} from shgat_embedding, ${capabilityData.length - dbShgatCount} from intent_embedding fallback)`);

// --- 1c. SHGAT enrichment (message passing on tool embeddings) ---
const SKIP_SHGAT = Deno.env.get("SKIP_SHGAT") === "true";
if (!SKIP_SHGAT) {
  console.log("  Loading SHGAT params from DB...");
  // Use psql to extract base64 data + format (postgres.js OOMs on 160MB+ bytea)
  const shgatTmpPath = await Deno.makeTempFile({ prefix: "shgat-params-", suffix: ".json" });
  const dbUrl = Deno.env.get("DATABASE_URL")!;
  const fmtProc = new Deno.Command("psql", {
    args: [dbUrl, "-t", "-A", "-c",
      `SELECT params->>'format' FROM shgat_params ORDER BY created_at DESC LIMIT 1`],
    stdout: "piped", stderr: "piped",
  });
  const shgatFormat = new TextDecoder().decode((await fmtProc.output()).stdout).trim();

  const dataProc = new Deno.Command("psql", {
    args: [dbUrl, "-t", "-A", "-c",
      `SELECT params->>'data' FROM shgat_params ORDER BY created_at DESC LIMIT 1`],
    stdout: "piped", stderr: "piped",
  });
  const b64Data = new TextDecoder().decode((await dataProc.output()).stdout).trim();

  if (b64Data.length > 0) {
    console.log(`    SHGAT params: ${(b64Data.length / 1024 / 1024).toFixed(1)}MB base64, format=${shgatFormat}`);

    // Decode base64 → gzip bytes
    const binaryStr = atob(b64Data);
    const compressed = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) compressed[i] = binaryStr.charCodeAt(i);

    // Decompress gzip
    const ds = new DecompressionStream("gzip");
    const writer = ds.writable.getWriter();
    writer.write(compressed);
    writer.close();
    const decompressedChunks: Uint8Array[] = [];
    const reader = ds.readable.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      decompressedChunks.push(value);
    }
    const totalLen = decompressedChunks.reduce((s, c) => s + c.length, 0);
    const decompressed = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of decompressedChunks) {
      decompressed.set(chunk, offset);
      offset += chunk.length;
    }

    // Decode: msgpack or JSON depending on format
    // deno-lint-ignore no-explicit-any
    let loadedRaw: Record<string, any>;
    if (shgatFormat.includes("msgpack")) {
      const { decode: msgpackDecode } = await import("npm:@msgpack/msgpack");
      loadedRaw = msgpackDecode(decompressed) as Record<string, unknown>;
    } else {
      loadedRaw = JSON.parse(new TextDecoder().decode(decompressed));
    }
    console.log(`    Decompressed: ${(totalLen / 1024 / 1024).toFixed(1)}MB, keys: ${Object.keys(loadedRaw).join(", ")}`);

    // Convert autograd format if needed, then set params
    const adapter = new SHGATAdapter();
    if ("W_up" in loadedRaw) {
      adapter.setParams(SHGATAdapter.convertAutogradToOB(loadedRaw));
    } else {
      adapter.setParams(loadedRaw as OBTrainedParams);
    }
    const cfg = adapter.getConfig();
    console.log(`    SHGAT config: numHeads=${cfg.numHeads}, headDim=${cfg.headDim}, embDim=${cfg.embeddingDim}`);

    // --- V2V co-occurrence enrichment (BEFORE MP, matching prod pipeline) ---
    // Prod order: V2V first → then upward/downward MP on V2V-enriched embeddings
    // (see MultiLevelOrchestrator.forwardMultiLevel:347 → applyV2VEnrichment before upward)
    const workflowToolLists = capabilityData
      .map(c => c.toolChildren.filter(t => toolVocab.has(t)))
      .filter(list => list.length >= 2);

    if (workflowToolLists.length > 0) {
      const toolIds = Object.keys(toolEmbeddings);
      const toolIdToIdx = new Map<string, number>();
      toolIds.forEach((id, i) => toolIdToIdx.set(id, i));

      const cooccurrence = buildCooccurrenceFromWorkflows(workflowToolLists, toolIdToIdx);
      const H_raw = toolIds.map(id => toolEmbeddings[id]);
      const H_v2v = v2vEnrich(H_raw, cooccurrence, { residualWeight: 0.3 });

      toolIds.forEach((id, i) => { toolEmbeddings[id] = H_v2v[i]; });
      console.log(`    V2V co-occurrence: ${cooccurrence.length / 2} bidirectional edges from ${workflowToolLists.length} workflows`);
    } else {
      console.log("    V2V co-occurrence: no workflows with ≥2 tools in vocab — skipped");
    }

    // Build graph: tools (L0 leaves) + capabilities (higher nodes)
    // SHGATAdapter level numbering: first higher level = 0, second = 1, etc.
    // Our DB hierarchy_level: tools=0, caps=1, meta-caps=2
    // So we shift: adapterLevel = dbLevel - 1 (caps become 0, meta-caps become 1)
    const graphNodes: GraphNode[] = [];
    for (const [toolId, emb] of Object.entries(toolEmbeddings)) {
      graphNodes.push({ id: toolId, embedding: emb, children: [], level: 0 });
    }
    for (const cap of capabilityData) {
      const validChildren = cap.toolChildren.filter(c => toolVocab.has(c));
      if (validChildren.length === 0) continue;
      const adapterLevel = Math.max(0, cap.level - 1);
      graphNodes.push({ id: cap.id, embedding: cap.embedding, children: validChildren, level: adapterLevel });
    }

    const graph = adapter.buildGraph(graphNodes);
    console.log(`    Graph: ${graph.l0Ids.length} L0, ${Array.from(graph.nodeIdsByLevel.entries()).map(([l, ids]) => `L${l}:${ids.length}`).join(", ")} higher`);

    // Enrich and replace tool embeddings
    const { l0Embeddings, enrichmentMs } = adapter.enrichEmbeddings();
    let replaced = 0;
    for (const [toolId, enrichedEmb] of l0Embeddings) {
      if (toolEmbeddings[toolId]) {
        toolEmbeddings[toolId] = enrichedEmb;
        replaced++;
      }
    }
    console.log(`    Enriched ${replaced}/${toolVocab.size} tool embeddings via SHGAT V2V+MP (${enrichmentMs}ms)`);

    // Override cap embeddings with freshly enriched ones from adapter
    // Adapter uses cap IDs as passed to buildGraph() = capabilityData[].id = namespace:action
    if (!skipCaps) {
      try {
        const enrichedCaps = adapter.getEnrichedCapEmbeddings();
        let capReplaced = 0;
        for (const cap of capabilityData) {
          const enriched = enrichedCaps.get(cap.id);
          if (enriched) {
            cap.embedding = enriched;
            capReplaced++;
          }
        }
        console.log(`    Enriched ${capReplaced}/${capabilityData.length} cap embeddings via SHGAT MP`);
      } catch (e) {
        log.warn(`[caps] Could not override cap embeddings from adapter: ${e}`);
      }
    }

    try { await Deno.remove(shgatTmpPath); } catch { /* ignore */ }
  } else {
    console.log("  No SHGAT params in DB — using raw BGE-M3 embeddings");
    try { await Deno.remove(shgatTmpPath); } catch { /* ignore */ }
  }
} else {
  console.log("  SKIP_SHGAT=true — using raw BGE-M3 embeddings");
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

// --- 1d. Rename history ---
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
if (renameMap.size > 0) {
  console.log(`  ${renameMap.size} rename mappings loaded`);
}

// resolveToolName: exec_hash resolution → rename history → canonicalization
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
    if (trace.capName && !skipCaps) {
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

const trainExamples = buildExamples(trainTraces);
const testExamples = buildExamples(testTraces);
console.log(`  Train: ${trainExamples.length} examples, Test: ${testExamples.length} examples`);

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

const result = await spawnGRUTraining({
  examples: trainExamples,
  testExamples,
  evalEvery: 2,
  toolEmbeddings,
  capabilityData: skipCaps ? [] : capabilityData,
  existingWeightsPath,
  epochs: 50,
  learningRate: 0.001,
});

if (result.success) {
  console.log(`\nDone: loss=${result.finalLoss?.toFixed(4)}, train_acc=${result.finalAccuracy?.toFixed(2)}, savedToDb=${result.savedToDb}`);
} else {
  console.error(`\nTraining failed: ${result.error}`);
}

await sql.end();
