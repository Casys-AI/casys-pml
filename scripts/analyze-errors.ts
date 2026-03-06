import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";
import { GRUInference } from "../src/graphrag/algorithms/gru/gru-inference.ts";
import { loadGRUWeightsFromDb, buildVocabulary } from "../src/graphrag/algorithms/gru/gru-loader.ts";
import { buildRenameChain, buildToolNameResolver } from "../lib/gru/src/data-prep/index.ts";

const sql = postgres(Deno.env.get("DATABASE_URL")!);
const renameRows = await sql`SELECT old_name, new_name, old_fqdn FROM capability_name_history ORDER BY renamed_at ASC`;
const renameMap = buildRenameChain(renameRows as any);
const hashRows = await sql`SELECT wp.code_hash, cr.namespace || ':' || cr.action as cap_name FROM workflow_pattern wp JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id WHERE wp.code_hash IS NOT NULL`;
const execHashMap = new Map<string, string>();
for (const r of hashRows) execHashMap.set((r.code_hash as string).slice(0, 8), r.cap_name as string);
const resolve = buildToolNameResolver(renameMap, execHashMap);

// Adapter for postgres.js → db.query interface
const dbAdapter = {
  query: async (text: string, params?: unknown[]) => {
    const result = await sql.unsafe(text, params as any);
    return result;
  }
};

const weights = await loadGRUWeightsFromDb(dbAdapter);
if (!weights) { console.error("No GRU weights in DB"); Deno.exit(1); }
const vocab = await buildVocabulary(dbAdapter, resolve, weights.vocabSize);
const gru = new GRUInference(weights, vocab);

const canonRows = await sql`
  SELECT DISTINCT ON (cr.namespace, cr.action)
    cr.namespace || ':' || cr.action as cap_name,
    ARRAY(SELECT DISTINCT tr->>'tool' FROM execution_trace et, jsonb_array_elements(et.task_results) tr
          WHERE et.capability_id = wp.pattern_id AND tr->>'tool' IS NOT NULL) as tools_used,
    wp.intent_embedding as emb
  FROM workflow_pattern wp JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id
  WHERE wp.code_snippet IS NOT NULL AND wp.intent_embedding IS NOT NULL
    AND EXISTS (SELECT 1 FROM execution_trace et WHERE et.capability_id = wp.pattern_id)
  ORDER BY cr.namespace, cr.action, wp.last_used DESC`;

let correct = 0, total = 0;
const errors: any[] = [];
for (const row of canonRows) {
  const emb = row.emb as number[];
  if (!emb || emb.length < 10) continue;
  const gt_tools = (row.tools_used as string[]).map(t => resolve(t)).sort();
  if (gt_tools.length === 0) continue;
  
  const result = gru.predict(emb, { topK: 5 });
  const predicted = result.sequence.map((s: any) => s.nodeId);
  const gt_set = new Set(gt_tools);
  
  const firstCorrect = predicted.length > 0 && gt_set.has(predicted[0]);
  total++;
  if (firstCorrect) correct++;
  else {
    errors.push({
      cap: row.cap_name,
      gt: gt_tools,
      pred: predicted.slice(0, 3),
      gt_len: gt_tools.length,
    });
  }
}

console.log("\n=== ERROR ANALYSIS ===");
console.log(`Total: ${total}, Correct first tool: ${correct}, Rate: ${(correct/total*100).toFixed(1)}%`);
console.log(`Errors: ${errors.length}`);

// Most common wrong first prediction
const byPredicted = new Map<string, number>();
for (const e of errors) {
  const k = e.pred[0] || "(empty)";
  byPredicted.set(k, (byPredicted.get(k) || 0) + 1);
}
console.log("\n--- Most common wrong first predictions ---");
[...byPredicted.entries()].sort((a,b) => b[1]-a[1]).slice(0, 15).forEach(([k,v]) => console.log(`  ${k}: ${v} times`));

// By GT namespace
const byNs = new Map<string, {total: number, err: number}>();
for (const row of canonRows) {
  const ns = (row.cap_name as string).split(":")[0];
  const entry = byNs.get(ns) || {total: 0, err: 0};
  entry.total++;
  byNs.set(ns, entry);
}
for (const e of errors) {
  const ns = e.cap.split(":")[0];
  const entry = byNs.get(ns)!;
  entry.err++;
}
console.log("\n--- Error rate by namespace ---");
[...byNs.entries()].sort((a,b) => b[1].err - a[1].err).slice(0, 15).forEach(([ns, v]) => {
  console.log(`  ${ns}: ${v.err}/${v.total} errors (${(v.err/v.total*100).toFixed(0)}%)`);
});

// By GT length
const byLen = new Map<number, {total: number, err: number}>();
for (const e of errors) {
  const entry = byLen.get(e.gt_len) || {total: 0, err: 0};
  entry.err++;
  byLen.set(e.gt_len, entry);
}
console.log("\n--- Errors by GT tool count ---");
[...byLen.entries()].sort((a,b) => a[0] - b[0]).forEach(([len, v]) => {
  console.log(`  ${len} tools: ${v.err} errors`);
});

console.log("\n--- Sample errors (20) ---");
errors.slice(0, 20).forEach(e => {
  console.log(`  ${e.cap}`);
  console.log(`    GT:   [${e.gt.slice(0,4).join(", ")}]${e.gt.length > 4 ? " (+" + (e.gt.length-4) + " more)" : ""}`);
  console.log(`    PRED: [${e.pred.join(", ")}]`);
});

await sql.end();
