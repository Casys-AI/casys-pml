/**
 * GRU Sequence Generation Benchmark
 * Uses the REAL GRU inference engine to generate full sequences from intent embeddings.
 * Metrics: exact match, tool recall/precision/F1, order accuracy, cap match.
 * Usage: deno run -A scripts/bench-gru-sequence.ts
 */
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";
import { GRUInference } from "../src/graphrag/algorithms/gru/gru-inference.ts";
import { loadGRUWeightsFromDb, buildVocabulary } from "../src/graphrag/algorithms/gru/gru-loader.ts";
import {
  normalizeToolId,
  buildRenameChain,
  buildToolNameResolver,
  dedupTracesByIntent,
} from "../lib/gru/src/data-prep/index.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
if (!DATABASE_URL) { console.error("DATABASE_URL required"); Deno.exit(1); }
const sql = postgres(DATABASE_URL);

// --- Resolution chain (centralized via data-prep) ---
const renameRows = await sql`SELECT old_name, new_name, old_fqdn FROM capability_name_history ORDER BY renamed_at ASC`;
// deno-lint-ignore no-explicit-any
const renameMap = buildRenameChain(renameRows as any as Array<{ old_name: string; new_name: string; old_fqdn?: string | null }>);

const hashRows = await sql`SELECT wp.code_hash, cr.namespace || ':' || cr.action as cap_name FROM workflow_pattern wp JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id WHERE wp.code_hash IS NOT NULL`;
const execHashMap = new Map<string, string>();
for (const r of hashRows) execHashMap.set((r.code_hash as string).slice(0, 8), r.cap_name as string);

const canonRows = await sql`
  SELECT DISTINCT ON (cr.namespace, cr.action)
    cr.namespace || ':' || cr.action as cap_name,
    ARRAY(SELECT DISTINCT tr->>'tool' FROM execution_trace et, jsonb_array_elements(et.task_results) tr
          WHERE et.capability_id = wp.pattern_id AND tr->>'tool' IS NOT NULL) as tools_used,
    COALESCE(wp.usage_count, 0) as usage_count
  FROM workflow_pattern wp JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id
  WHERE wp.code_snippet IS NOT NULL AND wp.intent_embedding IS NOT NULL
    AND EXISTS (SELECT 1 FROM execution_trace et WHERE et.capability_id = wp.pattern_id AND et.task_results IS NOT NULL AND jsonb_array_length(et.task_results) >= 1)
  ORDER BY cr.namespace, cr.action, wp.last_used DESC`;
const toolsetGroups = new Map<string, Array<{ name: string; usage: number }>>();
for (const r of canonRows) {
  const tools = (r.tools_used as string[])?.map(t => normalizeToolId(t)).filter(Boolean).sort() ?? [];
  const sig = tools.join(",");
  if (!toolsetGroups.has(sig)) toolsetGroups.set(sig, []);
  toolsetGroups.get(sig)!.push({ name: r.cap_name as string, usage: r.usage_count as number });
}
const canonicalMap = new Map<string, string>();
for (const [, group] of toolsetGroups) {
  if (group.length <= 1) continue;
  group.sort((a, b) => b.usage - a.usage || a.name.localeCompare(b.name));
  for (let i = 1; i < group.length; i++) canonicalMap.set(group[i].name, group[0].name);
}
const resolve = buildToolNameResolver(execHashMap, renameMap, canonicalMap);

// --- Load GRU ---
console.log("[1/4] Loading GRU...");
const dbAdapter = { query: async (s: string) => { const rows = await sql.unsafe(s); return rows as unknown[]; } };
const weightsFile = await loadGRUWeightsFromDb(dbAdapter);
if (!weightsFile) { console.error("No GRU weights"); Deno.exit(1); }

const gru = new GRUInference();
gru.setWeights(weightsFile.weights);

const toolEmbRows = await sql`SELECT tool_id, COALESCE(shgat_embedding, embedding) as emb FROM tool_embedding ORDER BY tool_id`;
const toolEmbeddings: Record<string, number[]> = {};
for (const r of toolEmbRows) {
  const emb = typeof r.emb === "string" ? JSON.parse(r.emb) : r.emb;
  if (emb?.length > 0) toolEmbeddings[r.tool_id as string] = emb;
}

const vocabData = weightsFile.vocab!;
// Filter vocab nodes same as training worker: drop caps with 0 valid children
const toolIdSet = new Set(vocabData.toolIds);
const capIdSet = new Set((vocabData.vocabNodes ?? []).map(n => n.id));
// Iterative bottom-up resolution (same as training worker)
const pendingNodes = (vocabData.vocabNodes ?? []).map(n => ({ ...n }));
const resolvedCaps = new Set<string>();
let changed = true;
while (changed) {
  changed = false;
  for (const n of pendingNodes) {
    if (resolvedCaps.has(n.id)) continue;
    const valid = (n.children ?? []).filter((c: string) => toolIdSet.has(c) || resolvedCaps.has(c));
    if (valid.length > 0) { n.children = valid; resolvedCaps.add(n.id); changed = true; }
  }
}
const filteredNodes = pendingNodes.filter(n => resolvedCaps.has(n.id));
console.log(`  Filtered vocab nodes: ${vocabData.vocabNodes?.length} → ${filteredNodes.length}`);
const vocab = buildVocabulary(vocabData.toolIds, filteredNodes, weightsFile.weights.similarityHeadKernel);
gru.setVocabulary(vocab);

// Structural bias disabled (Jaccard/bigram redundant with SHGAT — ablation 2026-02-28)
console.log(`  GRU ready: ${vocab.vocabSize} nodes (${vocab.numTools} tools)`);

// --- Load traces + dedup + split ---
console.log("[2/4] Loading test traces...");
const rawTraces = await sql`
  SELECT et.task_results, et.intent_embedding, cr.namespace || ':' || cr.action as cap_name
  FROM execution_trace et LEFT JOIN workflow_pattern wp ON wp.pattern_id = et.capability_id
  LEFT JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id
  WHERE et.task_results IS NOT NULL AND jsonb_typeof(et.task_results) = 'array'
    AND jsonb_array_length(et.task_results) >= 1 AND et.intent_embedding IS NOT NULL
  ORDER BY et.executed_at DESC`;

interface ParsedTrace { tools: string[]; intent: number[]; cap?: string; }
const allParsed: ParsedTrace[] = [];
for (const r of rawTraces) {
  const tr = r.task_results as Array<{ tool?: string }>;
  const tools = tr.map(t => t.tool).filter(Boolean).map(t => resolve(normalizeToolId(t!))).filter(Boolean) as string[];
  if (!tools.length) continue;
  const ie = typeof r.intent_embedding === "string" ? JSON.parse(r.intent_embedding) : r.intent_embedding;
  if (!ie?.length) continue;
  const cn = r.cap_name ? resolve(r.cap_name as string) : undefined;
  allParsed.push({ tools, intent: ie, cap: cn });
}

const { deduped } = dedupTracesByIntent(
  allParsed,
  (t) => t.cap ?? t.tools.join("|"),
  (t) => t.intent,
);
console.log(`  ${rawTraces.length} raw → ${deduped.length} deduped`);

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(42);
const shuffled = [...deduped];
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}
const splitIdx = Math.floor(shuffled.length * 0.8);
const testTraces = shuffled.slice(splitIdx);
console.log(`  Test traces: ${testTraces.length}`);

// --- Generate & evaluate ---
console.log("[3/4] Generating sequences...");
const capNameSet = new Set(vocabData.vocabNodes?.map(n => n.id) ?? []);

interface Result {
  gtTools: string[]; gtCap?: string;
  genTools: string[]; genCap?: string;
  recall: number; precision: number;
  exactMatch: boolean; orderAcc: number | null; capMatch: boolean;
}
const results: Result[] = [];

for (const trace of testTraces) {
  const first = gru.predictFirstTool(trace.intent);

  let genTools: string[] = [];
  let genCap: string | undefined;

  if (capNameSet.has(first.toolId)) {
    genCap = first.toolId;
  } else {
    const path = gru.buildPath(trace.intent, first.toolId);
    for (const p of path) {
      if (capNameSet.has(p)) genCap = p;
      else genTools.push(p);
    }
  }

  const gtSet = new Set(trace.tools);
  const genSet = new Set(genTools);
  const inter = [...gtSet].filter(t => genSet.has(t));
  const recall = gtSet.size > 0 ? inter.length / gtSet.size : 1;
  const precision = genSet.size > 0 ? inter.length / genSet.size : (gtSet.size === 0 ? 1 : 0);

  let orderAcc: number | null = null;
  const common = genTools.filter(t => gtSet.has(t));
  if (common.length >= 2) {
    const gtIdx = common.map(t => trace.tools.indexOf(t));
    let ok = 0, tot = 0;
    for (let i = 0; i < gtIdx.length - 1; i++) { tot++; if (gtIdx[i] < gtIdx[i + 1]) ok++; }
    orderAcc = tot > 0 ? ok / tot : 1;
  } else if (common.length === 1) orderAcc = 1;

  results.push({
    gtTools: trace.tools, gtCap: trace.cap,
    genTools, genCap,
    recall, precision,
    exactMatch: JSON.stringify(genTools) === JSON.stringify(trace.tools),
    orderAcc,
    capMatch: genCap === trace.cap,
  });
}

// --- Report ---
console.log("\n" + "=".repeat(60));
console.log("GRU SEQUENCE GENERATION BENCHMARK (real inference engine)");
console.log("=".repeat(60));
const n = results.length;
const exactMatches = results.filter(r => r.exactMatch).length;
const meanRecall = results.reduce((s, r) => s + r.recall, 0) / n;
const meanPrecision = results.reduce((s, r) => s + r.precision, 0) / n;
const f1 = meanRecall + meanPrecision > 0 ? 2 * meanRecall * meanPrecision / (meanRecall + meanPrecision) : 0;
const orderResults = results.filter(r => r.orderAcc !== null);
const meanOrder = orderResults.length > 0 ? orderResults.reduce((s, r) => s + r.orderAcc!, 0) / orderResults.length : 0;
const capTotal = results.filter(r => r.gtCap).length;
const capMatches = results.filter(r => r.capMatch).length;

console.log(`\nTest traces: ${n}`);
console.log(`\n--- Sequence-level metrics ---`);
console.log(`  Exact match:     ${exactMatches}/${n} = ${(100*exactMatches/n).toFixed(1)}%`);
console.log(`  Tool Recall:     ${(100*meanRecall).toFixed(1)}%`);
console.log(`  Tool Precision:  ${(100*meanPrecision).toFixed(1)}%`);
console.log(`  Sequence F1:     ${(100*f1).toFixed(1)}%`);
console.log(`  Order accuracy:  ${(100*meanOrder).toFixed(1)}% (on ${orderResults.length} multi-tool seqs)`);
console.log(`  Cap match:       ${capMatches}/${capTotal} = ${(100*capMatches/Math.max(capTotal,1)).toFixed(1)}%`);

const lenDiffs = results.map(r => r.genTools.length - r.gtTools.length);
console.log(`\n--- Length analysis ---`);
console.log(`  Mean len diff: ${(lenDiffs.reduce((a,b)=>a+b,0)/n).toFixed(1)}`);
console.log(`  Too short: ${lenDiffs.filter(d=>d<0).length}/${n}  Exact: ${lenDiffs.filter(d=>d===0).length}/${n}  Too long: ${lenDiffs.filter(d=>d>0).length}/${n}`);

const byLen = new Map<number, Result[]>();
for (const r of results) { const l=r.gtTools.length; if(!byLen.has(l))byLen.set(l,[]); byLen.get(l)!.push(r); }
console.log(`\n--- By ground truth sequence length ---`);
for (const l of [...byLen.keys()].sort((a,b)=>a-b)) {
  const rs=byLen.get(l)!; const r=rs.reduce((s,r)=>s+r.recall,0)/rs.length; const p=rs.reduce((s,r)=>s+r.precision,0)/rs.length;
  const bf1=r+p>0?2*r*p/(r+p):0; const exact=rs.filter(r=>r.exactMatch).length;
  console.log(`  len=${l}: n=${String(rs.length).padStart(3)}  exact=${String(exact).padStart(3)} (${(100*exact/rs.length).toFixed(0).padStart(3)}%)  recall=${(100*r).toFixed(0).padStart(3)}%  prec=${(100*p).toFixed(0).padStart(3)}%  F1=${(100*bf1).toFixed(0).padStart(3)}%`);
}

console.log(`\n--- Sample successes (recall>=80%, multi-tool) ---`);
let shown=0;
for(const r of results){if(r.recall<0.8||r.gtTools.length<2)continue;
  console.log(`  GT:  [${r.gtTools.slice(0,6).join(", ")}] → ${r.gtCap??"-"}`);
  console.log(`  GEN: [${r.genTools.slice(0,6).join(", ")}] → ${r.genCap??"-"}`);
  console.log(`  recall=${(100*r.recall).toFixed(0)}% prec=${(100*r.precision).toFixed(0)}%\n`);
  if(++shown>=5)break;
}
console.log(`--- Sample failures (recall<30%, multi-tool) ---`);
shown=0;
for(const r of results){if(r.gtTools.length<2||r.recall>=0.3)continue;
  console.log(`  GT:  [${r.gtTools.slice(0,6).join(", ")}] → ${r.gtCap??"-"}`);
  console.log(`  GEN: [${r.genTools.slice(0,6).join(", ")}] → ${r.genCap??"-"}`);
  console.log(`  recall=${(100*r.recall).toFixed(0)}% prec=${(100*r.precision).toFixed(0)}%\n`);
  if(++shown>=10)break;
}

console.log("✅ Done");
await sql.end();
