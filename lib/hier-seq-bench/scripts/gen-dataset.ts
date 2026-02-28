/**
 * CLI — generate a synthetic hierarchical sequence benchmark dataset.
 *
 * Usage:
 *   deno run --allow-write scripts/gen-dataset.ts [options]
 *
 * Options:
 *   --traces <n>        Number of traces to generate (default: 2000)
 *   --out <file>        Output file path (default: benchmark-YYYY-MM-DD.json)
 *   --seed <n>          Random seed (default: 42)
 *   --format jsonl|json Output format (default: json)
 */
import { buildGrammar } from "../src/grammar.ts";
import { buildVocabulary } from "../src/vocabulary.ts";
import { TraceGenerator } from "../src/generator.ts";
import { datasetStats, paraphraseAwareSplit, tracesToExamples } from "../src/dataset.ts";
import type { GeneratorConfig } from "../src/types.ts";

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  Deno.args
    .join(" ")
    .match(/--\w[\w-]* [^\s-][^\s]*/g)
    ?.map(s => s.split(" ") as [string, string])
    .map(([k, v]) => [k.replace("--", ""), v]) ?? []
);

const N_TRACES   = parseInt(args.traces ?? "2000");
const SEED       = parseInt(args.seed   ?? "42");
const FORMAT     = (args.format ?? "json") as "json" | "jsonl";
const OUT_PATH   = args.out ?? `benchmark-${new Date().toISOString().slice(0, 10)}.json`;

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * keepProbByLevel: probability a node stays as-is (not expanded into children).
 *
 * The key design insight:
 * - A high-level node (L2/L3) that EXISTS in the vocab stays as a unit when keepProb is high
 *   → compressed trace: [L2:auth-flow, L1:file-io, ...]
 * - When expanded (keepProb low), the trace shows the sub-graph
 *   → flat trace: [L0:check_token, L0:validate_permissions, L0:read_file, ...]
 *
 * The mix of levels in a single trace is the core challenge for the model.
 */
const config: GeneratorConfig = {
  keepProbByLevel: {
    0: 1.00, // always leaf — no sub-steps
    1: 0.60, // 60% opaque unit, 40% also shows L0 sub-steps
    2: 0.50, // 50% opaque unit, 50% also shows L1/L0 sub-steps
    3: 0.45, // 45% opaque unit, 55% also shows L2 sub-steps
    4: 0.00, // n/a — intent node never appears itself
  },
  intentLevelWeights: {
    // L0 excluded: expandChildren(L0) has no grammar rule → always empty → 100% rejection
    // L1 excluded: produces only 2 L0 nodes → trivial single-step prediction
    2: 0.35, // "ingest data", "auth flow", "report generation"
    3: 0.40, // "etl pipeline", "full auth cycle" — richest for prediction
    4: 0.25, // cross-domain scenarios — longest traces
  },
  minSequenceLength: 3,  // at least 2 prediction steps
  maxSequenceLength: 20,
  seed: SEED,
};

// ─── Generate ─────────────────────────────────────────────────────────────────

console.log(`Generating ${N_TRACES} traces (seed=${SEED})…`);

const nodes   = buildVocabulary();
const grammar = buildGrammar();
const gen     = new TraceGenerator(nodes, grammar, config);

const traces            = gen.generateDataset(N_TRACES);
// Paraphrase-aware split: train on phrasings 0-2, test on 3-4 (never seen)
const { train, test }   = paraphraseAwareSplit(traces);
const trainExamples     = tracesToExamples(train, nodes);
const testExamples      = tracesToExamples(test, nodes);

const trainStats = datasetStats(train, nodes);
const testStats  = datasetStats(test, nodes);

// ─── Output ───────────────────────────────────────────────────────────────────

const vocabObj = Object.fromEntries(
  Array.from(nodes.entries()).map(([id, n]) => [id, {
    id: n.id, level: n.level, domain: n.domain,
    description: n.description,
    childIds: n.childIds, parentIds: n.parentIds,
  }])
);

if (FORMAT === "jsonl") {
  const lines = [...trainExamples, ...testExamples]
    .map(ex => JSON.stringify({ split: trainExamples.includes(ex) ? "train" : "test", ...ex }))
    .join("\n");
  await Deno.writeTextFile(OUT_PATH, lines);
} else {
  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      seed: SEED,
      config,
      vocabSize: nodes.size,
      totalTraces: traces.length,
      train: trainStats,
      test: testStats,
    },
    vocab: vocabObj,
    train: trainExamples,
    test: testExamples,
  };
  await Deno.writeTextFile(OUT_PATH, JSON.stringify(output, null, 2));
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\nVocabulary: ${nodes.size} nodes`);
const byLevel = Array.from(nodes.values()).reduce((acc, n) => {
  acc[n.level] = (acc[n.level] ?? 0) + 1;
  return acc;
}, {} as Record<number, number>);
for (const [lvl, cnt] of Object.entries(byLevel).sort()) {
  console.log(`  L${lvl}: ${cnt} nodes`);
}

console.log(`\nDataset:`);
console.log(`  train: ${train.length} traces, avg seq length ${trainStats.seqLength.avg}`);
console.log(`  test:  ${test.length} traces, avg seq length ${testStats.seqLength.avg}`);

console.log(`\nTrain — nodes by level:`);
for (const [lvl, cnt] of Object.entries(trainStats.nodesByLevel).sort()) {
  const total = Object.values(trainStats.nodesByLevel).reduce((s, x) => s + x, 0);
  console.log(`  L${lvl}: ${cnt} (${((cnt / total) * 100).toFixed(1)}%)`);
}

console.log(`\nOutput: ${OUT_PATH} (${FORMAT})`);
