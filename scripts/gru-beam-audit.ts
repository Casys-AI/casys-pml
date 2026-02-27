/**
 * GRU Beam Path Audit
 *
 * Charge le GRU depuis la DB (poids les plus récents), connecte à la DB,
 * et inspecte les chemins beam vs ground truth.
 *
 * Usage: deno run -A scripts/gru-beam-audit.ts [--file lib/gru/gru-weights-prod.json]
 */

import { GRUInference } from "../src/graphrag/algorithms/gru/gru-inference.ts";
import {
  loadGRUWeightsFile,
  parseGRUWeights,
  buildVocabulary,
  computeStructuralMatrices,
} from "../src/graphrag/algorithms/gru/gru-loader.ts";
import { normalizeToolId } from "../src/capabilities/routing-resolver.ts";
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

const DATABASE_URL = Deno.env.get("DATABASE_URL") ?? "postgres://localhost:5432/agentcards";
const sql = postgres(DATABASE_URL);

// --- 1. Load GRU weights (DB or file) ---
const fileArg = Deno.args.includes("--file") ? Deno.args[Deno.args.indexOf("--file") + 1] : null;

let weights;
let toolIds: string[];
let vocabNodes: Array<{ id: string; level: number; embedding: number[]; children?: string[] }>;

if (fileArg) {
  // Load from file (old path)
  console.log(`Loading weights from file: ${fileArg}...`);
  const file = await loadGRUWeightsFile(fileArg);
  weights = file.weights;
  const savedVocab = file.vocab!;
  toolIds = savedVocab.toolIds;
  vocabNodes = savedVocab.vocabNodes;
  console.log(`  ${toolIds.length} tools, ${vocabNodes.length} vocab nodes`);
} else {
  // Load from DB (latest weights — includes vocab metadata)
  console.log("Loading weights from DB (gru_params)...");
  const paramRows = await sql`SELECT params FROM gru_params ORDER BY updated_at DESC LIMIT 1`;
  if (!paramRows || paramRows.length === 0) {
    console.error("No weights in gru_params table");
    await sql.end();
    Deno.exit(1);
  }
  const paramsRaw = paramRows[0].params;
  const paramsObj = typeof paramsRaw === "string" ? JSON.parse(paramsRaw) : paramsRaw;
  weights = parseGRUWeights(paramsObj);

  // Extract vocab from saved metadata
  const savedVocab = paramsObj.vocab;
  if (!savedVocab || !savedVocab.toolIds) {
    console.error("No vocab metadata in gru_params — retrain with latest worker to embed vocab");
    await sql.end();
    Deno.exit(1);
  }
  toolIds = savedVocab.toolIds;

  // vocabNodes need embeddings (not stored in metadata — extract from kernel)
  // kernel shape = [embDim, vocabSize], transposed row i = embedding for node i
  const kernel = weights.similarityHeadKernel; // [embDim, vocabSize]
  const embDim = kernel.length;
  vocabNodes = [];
  for (let vi = 0; vi < savedVocab.vocabNodes.length; vi++) {
    const n = savedVocab.vocabNodes[vi];
    const nodeIdx = toolIds.length + vi;
    // Extract embedding from kernel column nodeIdx
    const emb = new Array(embDim);
    for (let d = 0; d < embDim; d++) {
      emb[d] = kernel[d][nodeIdx] ?? 0;
    }
    vocabNodes.push({ id: n.id, level: n.level, embedding: emb, children: n.children });
  }
  console.log(`  ${toolIds.length} tools, ${vocabNodes.length} vocab nodes (from DB metadata)`);
}

// --- 2. Build vocabulary ---
const vocab = buildVocabulary(toolIds, vocabNodes, weights.similarityHeadKernel);
const expectedVocab = weights.similarityHeadKernel[0]?.length ?? 0;
console.log(`  Vocab: ${vocab.vocabSize} (kernel expects ${expectedVocab}) ${vocab.vocabSize === expectedVocab ? "OK" : "MISMATCH ⚠️"}`);

// --- 3. Load traces for bigram ---
const traceRows = await sql`
  SELECT task_results
  FROM execution_trace
  WHERE task_results IS NOT NULL
    AND jsonb_typeof(task_results) = 'array'
    AND jsonb_array_length(task_results) > 1
  ORDER BY executed_at DESC
  LIMIT 1000
`;

const traces: string[][] = [];
for (const row of traceRows) {
  const tools = (row.task_results as Array<{ tool?: string }>)
    .map((t) => t.tool)
    .filter((t): t is string => !!t)
    .map(normalizeToolId)
    .filter(Boolean) as string[];
  if (tools.length > 1) traces.push(tools);
}

// Path length distribution
const lenDist = new Map<number, number>();
for (const t of traces) lenDist.set(t.length, (lenDist.get(t.length) ?? 0) + 1);
console.log(`\n${traces.length} traces for bigram. Path length distribution (GT):`);
for (const [len, count] of [...lenDist.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  len=${len}: ${count} ${"█".repeat(Math.ceil(count / 5))}`);
}

// --- 4. Structural matrices + GRU ---
const structural = computeStructuralMatrices(traces, vocab.nodeToIndex, vocab.numTools, undefined);
const gru = new GRUInference();
gru.setWeights(weights);
gru.setVocabulary(vocab);
gru.setStructuralMatrices(structural);
console.log(`\nGRU ready: ${gru.isReady()}`);

// --- 5. Load test intents ---
const intentRows = await sql`
  SELECT
    et.intent_embedding,
    et.task_results,
    et.initial_context->>'intent' as intent_text
  FROM execution_trace et
  WHERE et.intent_embedding IS NOT NULL
    AND et.task_results IS NOT NULL
    AND jsonb_typeof(et.task_results) = 'array'
    AND jsonb_array_length(et.task_results) > 1
  ORDER BY et.executed_at DESC
  LIMIT 30
`;

// --- 6. Beam audit ---
console.log("\n" + "=".repeat(100));
console.log("BEAM PATH AUDIT — predicted vs ground truth");
console.log("=".repeat(100));

let truncatedCount = 0;
let totalCount = 0;
let firstToolCorrect = 0;
const beamLengths: number[] = [];
const gtLengths: number[] = [];

for (const row of intentRows) {
  const intentEmb: number[] = typeof row.intent_embedding === "string"
    ? JSON.parse(row.intent_embedding)
    : row.intent_embedding;

  const gtTools = (row.task_results as Array<{ tool?: string }>)
    .map((t) => t.tool)
    .filter((t): t is string => !!t)
    .map(normalizeToolId)
    .filter(Boolean) as string[];

  if (gtTools.length < 2) continue;

  const first = gru.predictFirstTool(intentEmb);
  const beams = gru.buildPathBeam(intentEmb, first.toolId, 3);
  const best = beams[0];
  if (!best) continue;

  totalCount++;
  beamLengths.push(best.path.length);
  gtLengths.push(gtTools.length);
  if (first.toolId === gtTools[0]) firstToolCorrect++;

  const isTruncated = best.path.length < gtTools.length;
  if (isTruncated) truncatedCount++;

  const tag = isTruncated ? "TRUNC" : best.path.length === gtTools.length ? "MATCH" : "LONG ";
  const intentShort = ((row.intent_text as string) ?? "(no text)").slice(0, 60);

  console.log(`\n${tag} | "${intentShort}"`);
  console.log(`  GT  (${gtTools.length}): ${gtTools.join(" -> ")}`);
  console.log(`  GRU (${best.path.length}): ${best.path.join(" -> ")}  [score=${best.score.toFixed(3)}, hit1=${first.score.toFixed(3)}]`);

  for (let i = 0; i < beams.length; i++) {
    const b = beams[i];
    console.log(`    beam[${i}] (${b.path.length}): ${b.path.join(" -> ")}  [${b.score.toFixed(3)}]`);
  }
}

// --- 7. Summary ---
console.log("\n" + "=".repeat(100));
console.log(`SUMMARY: ${truncatedCount}/${totalCount} truncated (${(truncatedCount / totalCount * 100).toFixed(1)}%)`);
console.log(`First tool correct: ${firstToolCorrect}/${totalCount} (${(firstToolCorrect / totalCount * 100).toFixed(1)}%)`);
console.log(`Avg beam len: ${(beamLengths.reduce((a, b) => a + b, 0) / beamLengths.length).toFixed(1)}`);
console.log(`Avg GT len:   ${(gtLengths.reduce((a, b) => a + b, 0) / gtLengths.length).toFixed(1)}`);

await sql.end();
