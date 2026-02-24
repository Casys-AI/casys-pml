/**
 * Train GRU with capabilities — standalone script
 *
 * - Loads ALL traces (caps appear as-is in sequences, NOT expanded to tools)
 * - Caps are in the output vocab alongside tools (hierarchical softmax)
 * - toolCapMap encodes the cap→tool hierarchy as input features
 * - SHGAT enrichment: loads trained SHGAT params from DB, enriches tool
 *   embeddings via message passing before passing to GRU training
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
    wp.intent_embedding as embedding,
    wp.dag_structure->'tools_used' as tools_used,
    COALESCE(wp.hierarchy_level, 1) as level
  FROM workflow_pattern wp
  JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id
  WHERE wp.code_snippet IS NOT NULL
    AND wp.intent_embedding IS NOT NULL
    AND wp.dag_structure->'tools_used' IS NOT NULL
  ORDER BY cr.namespace, cr.action, wp.last_used DESC
`;

const capabilityData: Array<{ id: string; embedding: number[]; toolChildren: string[]; level: number }> = [];
// Direct children map (cap → immediate children, may include other caps)
const capChildrenMap = new Map<string, string[]>();
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
  capabilityData.push({ id: capName, embedding: emb, toolChildren: children, level: Number(row.level) });
}
console.log(`  ${capabilityData.length} capabilities with tool children`);

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
    console.log(`    Enriched ${replaced}/${toolVocab.size} tool embeddings via SHGAT MP (${enrichmentMs}ms)`);

    try { await Deno.remove(shgatTmpPath); } catch { /* ignore */ }
  } else {
    console.log("  No SHGAT params in DB — using raw BGE-M3 embeddings");
    try { await Deno.remove(shgatTmpPath); } catch { /* ignore */ }
  }
} else {
  console.log("  SKIP_SHGAT=true — using raw BGE-M3 embeddings");
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

const resolveToolName = (name: string): string => renameMap.get(name) ?? name;

// ============================================================================
// 2. Load and parse traces (caps kept as-is, no expansion)
// ============================================================================
console.log("[2/5] Loading execution traces...");
const traceRows = await sql`
  SELECT
    task_results,
    intent_embedding,
    success
  FROM execution_trace
  WHERE task_results IS NOT NULL
    AND jsonb_typeof(task_results) = 'array'
    AND jsonb_array_length(task_results) >= 1
    AND intent_embedding IS NOT NULL
  ORDER BY executed_at DESC
`;
console.log(`  ${traceRows.length} traces loaded`);

interface ParsedTrace {
  tools: string[];  // may contain both tool IDs and cap IDs
  intentEmb: number[];
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

  allTraces.push({ tools, intentEmb });
}
console.log(`  ${allTraces.length} usable traces (${capTargetCount} cap targets kept as-is in sequences)`);

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

  for (const trace of traces) {
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
  }
  if (skippedConsecutive > 0) {
    console.log(`  (skipped ${skippedConsecutive} consecutive duplicate examples)`);
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

// SKIP_CAPS=true → tools-only vocab (no caps in output softmax)
const skipCaps = Deno.env.get("SKIP_CAPS") === "true";
if (skipCaps) console.log("  SKIP_CAPS=true — caps excluded from vocab (tools-only)");

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
