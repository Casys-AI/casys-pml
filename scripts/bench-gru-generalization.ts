/**
 * GRU Generalization Benchmark — Leave-cap-out split
 * 
 * Holds out N caps entirely from training, trains on the rest,
 * tests if GRU can compose the right tool sequences for unseen caps.
 * 
 * Usage: deno run -A scripts/bench-gru-generalization.ts
 */
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";
import { normalizeToolId } from "../src/capabilities/routing-resolver.ts";
import { spawnGRUTraining } from "../src/graphrag/algorithms/gru/spawn-training.ts";
import { capExamplesPerTarget as _capExamplesPerTarget } from "../lib/gru/src/data-prep/cap-frequency-cap.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
if (!DATABASE_URL) { console.error("DATABASE_URL required"); Deno.exit(1); }
const sql = postgres(DATABASE_URL);

// --- Resolution chain (copied from train-gru-with-caps.ts) ---
const renameRows = await sql`SELECT old_name, new_name, old_fqdn FROM capability_name_history ORDER BY renamed_at ASC`;
const renameMap = new Map<string, string>();
for (const r of renameRows) {
  renameMap.set(r.old_name as string, r.new_name as string);
  if (r.old_fqdn) renameMap.set(r.old_fqdn as string, r.new_name as string);
}
for (const [old] of renameMap) {
  let current = renameMap.get(old)!;
  const visited = new Set([old]);
  while (renameMap.has(current) && !visited.has(current)) { visited.add(current); current = renameMap.get(current)!; }
  renameMap.set(old, current);
}
const hashRows = await sql`SELECT wp.code_hash, cr.namespace || ':' || cr.action as cap_name FROM workflow_pattern wp JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id WHERE wp.code_hash IS NOT NULL`;
const execHashMap = new Map<string, string>();
for (const r of hashRows) execHashMap.set((r.code_hash as string).slice(0, 8), r.cap_name as string);
const execPattern = /^(?:code|std|filesystem):exec_([a-f0-9]{8})/;

function resolve(name: string): string {
  const m = execPattern.exec(name);
  if (m) name = execHashMap.get(m[1]) ?? name;
  name = renameMap.get(name) ?? name;
  return name;
}

// --- Load tool embeddings ---
const embRows = await sql`SELECT tool_id, COALESCE(shgat_embedding, embedding) as embedding FROM tool_embedding ORDER BY tool_id`;
const toolEmbeddings: Record<string, number[]> = {};
for (const row of embRows) {
  const emb = typeof row.embedding === "string" ? JSON.parse(row.embedding) : row.embedding;
  if (emb?.length > 0) toolEmbeddings[row.tool_id as string] = emb;
}
const toolVocab = new Set(Object.keys(toolEmbeddings));
console.log(`Tools: ${toolVocab.size}`);

// --- Load all traces with task_results ---
const rawTraces = await sql`
  SELECT et.task_results, et.intent_embedding, cr.namespace || ':' || cr.action as cap_name
  FROM execution_trace et
  LEFT JOIN workflow_pattern wp ON wp.pattern_id = et.capability_id
  LEFT JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id
  WHERE et.task_results IS NOT NULL AND jsonb_typeof(et.task_results) = 'array'
    AND jsonb_array_length(et.task_results) >= 1 AND et.intent_embedding IS NOT NULL
  ORDER BY et.executed_at DESC`;

interface ParsedTrace {
  tools: string[];
  intentEmb: number[];
  capName?: string;
}

const allTraces: ParsedTrace[] = [];
for (const r of rawTraces) {
  const tr = r.task_results as Array<{ tool?: string }>;
  const tools = tr.map(t => t.tool).filter(Boolean).map(t => resolve(normalizeToolId(t!))).filter(Boolean) as string[];
  if (!tools.length) continue;
  const ie = typeof r.intent_embedding === "string" ? JSON.parse(r.intent_embedding) : r.intent_embedding;
  if (!ie?.length) continue;
  const cn = r.cap_name ? resolve(r.cap_name as string) : undefined;
  allTraces.push({ tools, intentEmb: ie, capName: cn });
}

// Dedup
const seen = new Set<string>();
const deduped: ParsedTrace[] = [];
for (const t of allTraces) {
  const gk = t.capName ?? t.tools.join("|");
  const ik = t.intentEmb.map(v => v.toFixed(6)).join(",");
  const dk = `${gk}::${ik}`;
  if (seen.has(dk)) continue;
  seen.add(dk);
  deduped.push(t);
}
console.log(`Traces: ${rawTraces.length} raw → ${deduped.length} deduped`);

// --- Group by cap, find multi-tool caps with enough traces ---
const byCap = new Map<string, ParsedTrace[]>();
for (const t of deduped) {
  if (!t.capName || t.tools.length < 2) continue;
  if (!byCap.has(t.capName)) byCap.set(t.capName, []);
  byCap.get(t.capName)!.push(t);
}

// Candidates: multi-tool caps with >= 3 traces, whose tools appear in OTHER caps too
const candidates: Array<{ cap: string; traces: ParsedTrace[]; tools: Set<string> }> = [];
for (const [cap, traces] of byCap) {
  if (traces.length < 3) continue;
  const toolSet = new Set<string>();
  for (const t of traces) t.tools.forEach(tool => toolSet.add(tool));
  candidates.push({ cap, traces, tools: toolSet });
}
candidates.sort((a, b) => b.traces.length - a.traces.length);

// Check tool coverage: for each candidate, are its tools seen in OTHER caps' traces?
const toolToOtherCaps = new Map<string, Set<string>>();
for (const t of deduped) {
  if (!t.capName) continue;
  for (const tool of t.tools) {
    if (!toolToOtherCaps.has(tool)) toolToOtherCaps.set(tool, new Set());
    toolToOtherCaps.get(tool)!.add(t.capName);
  }
}

console.log(`\nCandidates for hold-out (multi-tool, >= 3 traces):`);
const heldOut: string[] = [];
for (const c of candidates) {
  const toolsCoveredElsewhere = [...c.tools].filter(t => {
    const caps = toolToOtherCaps.get(t);
    return caps && caps.size > 1; // tool appears in at least 1 OTHER cap
  }).length;
  const coverage = toolsCoveredElsewhere / c.tools.size;
  const mark = coverage >= 0.5 ? "✅" : "❌";
  console.log(`  ${c.cap}: ${c.traces.length} traces, ${c.tools.size} tools, ${(100*coverage).toFixed(0)}% tools seen elsewhere ${mark}`);
  if (coverage >= 0.5 && heldOut.length < 10) {
    heldOut.push(c.cap);
  }
}

console.log(`\nHeld-out caps: ${heldOut.length}`);
const heldOutSet = new Set(heldOut);

// --- Split: train = all traces NOT from held-out caps, test = held-out traces ---
const trainTraces = deduped.filter(t => !t.capName || !heldOutSet.has(t.capName));
const testTraces = deduped.filter(t => t.capName && heldOutSet.has(t.capName));
console.log(`Train traces: ${trainTraces.length}, Test traces (held-out): ${testTraces.length}`);

// --- Build examples (tool-to-tool only, no cap-as-terminal) ---
function buildExamples(traces: ParsedTrace[]) {
  const examples: Array<{
    intentEmbedding: number[];
    contextToolIds: string[];
    targetToolId: string;
    isTerminal: number;
    isSingleTool: boolean;
  }> = [];
  for (const trace of traces) {
    for (let i = 0; i < trace.tools.length; i++) {
      if (i > 0 && trace.tools[i] === trace.tools[i - 1]) continue;
      examples.push({
        intentEmbedding: trace.intentEmb,
        contextToolIds: trace.tools.slice(0, i),
        targetToolId: trace.tools[i],
        isTerminal: i === trace.tools.length - 1 ? 1 : 0,
        isSingleTool: trace.tools.length === 1,
      });
    }
  }
  return examples;
}

const trainExamples = buildExamples(trainTraces);
const testExamples = buildExamples(testTraces);

console.log(`Train examples: ${trainExamples.length}`);
console.log(`Test examples (held-out caps): ${testExamples.length}`);

// --- Evaluate: for each test example, check if the target tool can be predicted ---
// Using cosine similarity with intent embedding as a baseline
const toolIds = Object.keys(toolEmbeddings);
const toolMatrix: number[][] = toolIds.map(t => toolEmbeddings[t]);

// Normalize
function l2norm(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1e-12;
  return v.map(x => x / n);
}
const toolMatrixNorm = toolMatrix.map(l2norm);

let hit1 = 0;
let hit5 = 0;
let total = 0;

// Seen tool sequences in training
const trainSeqSet = new Set<string>();
for (const t of trainTraces) trainSeqSet.add(t.tools.join("|"));

let novelSeqs = 0;

for (const ex of testExamples) {
  const target = ex.targetToolId;
  const targetIdx = toolIds.indexOf(target);
  if (targetIdx < 0) continue;
  
  const intentNorm = l2norm(ex.intentEmbedding);
  
  // Score all tools
  const scores = toolMatrixNorm.map(t => t.reduce((s, x, i) => s + x * intentNorm[i], 0));
  
  // Rank
  const sorted = scores.map((s, i) => ({ i, s })).sort((a, b) => b.s - a.s);
  const rank = sorted.findIndex(s => s.i === targetIdx) + 1;
  
  if (rank === 1) hit1++;
  if (rank <= 5) hit5++;
  total++;
}

// Check which test traces are truly novel (sequence never seen in training)
for (const t of testTraces) {
  const seq = t.tools.join("|");
  if (!trainSeqSet.has(seq)) novelSeqs++;
}

console.log(`\n${"=".repeat(60)}`);
console.log("GENERALIZATION BENCHMARK (leave-cap-out)");
console.log("=".repeat(60));
console.log(`\nHeld-out caps: ${heldOut.join(", ")}`);
console.log(`Test traces: ${testTraces.length} (${novelSeqs} truly novel sequences)`);
console.log(`Test examples: ${total}`);
console.log(`\n--- Intent-only baseline (cosine, tools only) ---`);
console.log(`  Hit@1: ${hit1}/${total} = ${(100*hit1/Math.max(total,1)).toFixed(1)}%`);
console.log(`  Hit@5: ${hit5}/${total} = ${(100*hit5/Math.max(total,1)).toFixed(1)}%`);

console.log(`\nNow training GRU on train split and evaluating on held-out...`);

// --- Load cap data for GRU training ---
const capRows = await sql`
  SELECT DISTINCT ON (cr.namespace, cr.action)
    cr.namespace || ':' || cr.action as cap_name,
    COALESCE(wp.shgat_embedding, wp.intent_embedding) as embedding,
    wp.shgat_embedding IS NOT NULL as has_shgat,
    wp.hierarchy_level as level,
    ARRAY(SELECT DISTINCT tr->>'tool' FROM execution_trace et, jsonb_array_elements(et.task_results) tr
          WHERE et.capability_id = wp.pattern_id AND tr->>'tool' IS NOT NULL) as tools_used
  FROM workflow_pattern wp JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id
  WHERE wp.code_snippet IS NOT NULL AND wp.intent_embedding IS NOT NULL
    AND EXISTS (SELECT 1 FROM execution_trace et WHERE et.capability_id = wp.pattern_id AND et.task_results IS NOT NULL)
  ORDER BY cr.namespace, cr.action, wp.last_used DESC`;

const capabilityData: Array<{ id: string; embedding: number[]; level: number; toolChildren: string[] }> = [];
for (const r of capRows) {
  const emb = typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding;
  const tools = (r.tools_used as string[])?.map(t => resolve(normalizeToolId(t))).filter(t => t && toolVocab.has(t)) ?? [];
  if (!emb?.length || tools.length === 0) continue;
  capabilityData.push({
    id: r.cap_name as string,
    embedding: emb,
    level: (r.level as number) ?? 1,
    toolChildren: tools,
  });
}

// Train GRU
const result = await spawnGRUTraining({
  examples: trainExamples,
  testExamples,
  evalEvery: 2,
  toolEmbeddings,
  capabilityData,
  epochs: 100,
  learningRate: 0.001,
});

if (result.success) {
  console.log(`\n--- GRU Results (trained without held-out caps) ---`);
  console.log(`  Loss: ${result.finalLoss?.toFixed(4)}, Train acc: ${result.finalAccuracy?.toFixed(2)}`);
  console.log(`  (Test Hit@1 from training output includes held-out cap traces)`);
} else {
  console.error(`Training failed: ${result.error}`);
}

console.log("\n✅ Done");
await sql.end();
