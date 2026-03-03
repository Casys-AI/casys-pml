#!/usr/bin/env -S deno run --allow-all
/**
 * Compare raw BGE-M3 embeddings vs SHGAT-enriched embeddings
 * 
 * Metrics:
 * - Cosine similarity between raw and enriched
 * - Recall@1/3/5 and MRR for capability discovery: raw vs SHGAT
 */

import { load } from "@std/dotenv";
import { getDb } from "../src/db/mod.ts";

await load({ export: true });
const db = await getDb();

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

function parseVector(v: string | number[]): number[] {
  if (Array.isArray(v)) return v;
  return JSON.parse(v);
}

function stats(arr: number[]) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
  return { mean: mean.toFixed(4), std: std.toFixed(4), min: sorted[0]?.toFixed(4), max: sorted[sorted.length - 1]?.toFixed(4), median: sorted[Math.floor(sorted.length / 2)]?.toFixed(4) };
}

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║     EMBEDDING COMPARISON: Raw BGE-M3 vs SHGAT-Enriched     ║");
console.log("╚══════════════════════════════════════════════════════════════╝\n");

// === TOOL EMBEDDINGS ===
console.log("═══ TOOL EMBEDDINGS ═══\n");
const tools = await db.query(`SELECT tool_id, embedding::text as raw, shgat_embedding::text as shgat FROM tool_embedding WHERE embedding IS NOT NULL AND shgat_embedding IS NOT NULL`);
const toolSims: number[] = [];
let identical = 0;
for (const row of tools) {
  const r = row as Record<string, unknown>;
  const sim = cosine(parseVector(r.raw as string), parseVector(r.shgat as string));
  toolSims.push(sim);
  if (sim > 0.9999) identical++;
}
console.log(`Total: ${tools.length} | Identical: ${identical} | Enriched: ${tools.length - identical}`);
console.log(`Cosine (raw↔enriched):`, stats(toolSims));

// === CAPABILITY EMBEDDINGS ===
console.log("\n═══ CAPABILITY EMBEDDINGS ═══\n");
const caps = await db.query(`SELECT pattern_id, intent_embedding::text as raw, shgat_embedding::text as shgat FROM workflow_pattern WHERE intent_embedding IS NOT NULL AND shgat_embedding IS NOT NULL`);
const capSims: number[] = [];
const capEmbeddings = new Map<string, { raw: number[]; shgat: number[] }>();
for (const row of caps) {
  const r = row as Record<string, unknown>;
  const raw = parseVector(r.raw as string);
  const shgat = parseVector(r.shgat as string);
  capSims.push(cosine(raw, shgat));
  capEmbeddings.set(r.pattern_id as string, { raw, shgat });
}
console.log(`Total: ${caps.length} | Identical: ${capSims.filter(s => s > 0.9999).length} | Enriched: ${caps.length - capSims.filter(s => s > 0.9999).length}`);
console.log(`Cosine (raw↔enriched):`, stats(capSims));

// === RECALL BENCHMARK ===
console.log("\n═══ RECALL BENCHMARK ═══\n");
const traces = await db.query(`SELECT et.capability_id, COALESCE(et.intent_embedding, wp.intent_embedding)::text as intent_emb FROM execution_trace et JOIN workflow_pattern wp ON wp.pattern_id = et.capability_id WHERE COALESCE(et.intent_embedding, wp.intent_embedding) IS NOT NULL LIMIT 500`);

function recall(mode: "raw" | "shgat") {
  let hit1 = 0, hit3 = 0, hit5 = 0, mrr = 0, count = 0;
  for (const row of traces) {
    const r = row as Record<string, unknown>;
    const traceEmb = parseVector(r.intent_emb as string);
    const trueCapId = r.capability_id as string;
    if (!capEmbeddings.has(trueCapId)) continue;
    const scores: { id: string; score: number }[] = [];
    for (const [capId, embs] of capEmbeddings) {
      scores.push({ id: capId, score: cosine(traceEmb, mode === "raw" ? embs.raw : embs.shgat) });
    }
    scores.sort((a, b) => b.score - a.score);
    const rank = scores.findIndex(s => s.id === trueCapId) + 1;
    if (rank <= 1) hit1++;
    if (rank <= 3) hit3++;
    if (rank <= 5) hit5++;
    mrr += 1 / rank;
    count++;
  }
  return { count, hit1: (hit1/count*100).toFixed(1), hit3: (hit3/count*100).toFixed(1), hit5: (hit5/count*100).toFixed(1), mrr: (mrr/count).toFixed(4) };
}

const rawR = recall("raw");
const shgatR = recall("shgat");

console.log(`Traces: ${rawR.count} | Capabilities: ${capEmbeddings.size}\n`);
console.log("┌──────────┬─────────┬─────────┬─────────┬─────────┐");
console.log("│ Method   │ Hit@1   │ Hit@3   │ Hit@5   │ MRR     │");
console.log("├──────────┼─────────┼─────────┼─────────┼─────────┤");
console.log(`│ Raw BGE  │ ${rawR.hit1.padStart(5)}%  │ ${rawR.hit3.padStart(5)}%  │ ${rawR.hit5.padStart(5)}%  │ ${rawR.mrr}  │`);
console.log(`│ SHGAT    │ ${shgatR.hit1.padStart(5)}%  │ ${shgatR.hit3.padStart(5)}%  │ ${shgatR.hit5.padStart(5)}%  │ ${shgatR.mrr}  │`);
console.log("└──────────┴─────────┴─────────┴─────────┴─────────┘");

await db.close();
