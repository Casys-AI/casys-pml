#!/usr/bin/env -S deno run --allow-all
/**
 * CompactInformedGRU — Benchmark (Node.js + Deno compatible)
 *
 * Measures model performance with synthetic data (no database required).
 * Compare Deno WASM vs Node.js native C++ on the same operations:
 *
 *   Deno:    deno run --allow-all src/benchmark-node.ts
 *   Node.js: node --loader ts-node/esm src/benchmark-node.ts
 *
 * Metrics:
 *   - Model init time (buildModel + setToolVocabulary)
 *   - Train step time (batch=32, 10 iterations)
 *   - buildPath time (10 paths)
 *   - Memory usage before/after
 */

import { initTensorFlow, logMemory, getBackend } from "./tf/backend.ts";
import { CompactInformedGRU } from "./transition/gru-model.ts";
import { computeJaccardMatrix, computeBigramMatrix } from "./transition/structural-bias.ts";
import type { TransitionExample, ToolCapabilityMap } from "./transition/types.ts";

// ---------------------------------------------------------------------------
// Synthetic data generators
// ---------------------------------------------------------------------------

const NUM_TOOLS = 100;
const NUM_CAPS = 50;
const EMBEDDING_DIM = 1024;
const CAP_SPARSITY = 0.10; // ~10% filled

/** Seeded pseudo-random number generator (Mulberry32). */
function createRng(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = createRng(42);

function randomEmbedding(): number[] {
  const emb = new Array(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    emb[i] = rng() * 2 - 1; // [-1, 1]
  }
  return emb;
}

// Generate tool IDs and embeddings
const toolIds: string[] = [];
const toolEmbeddings = new Map<string, number[]>();
for (let i = 0; i < NUM_TOOLS; i++) {
  const id = `tool_${String(i).padStart(3, "0")}`;
  toolIds.push(id);
  toolEmbeddings.set(id, randomEmbedding());
}

// Generate sparse tool-to-capability matrix (~10% filled)
const capMatrix = new Float32Array(NUM_TOOLS * NUM_CAPS);
for (let t = 0; t < NUM_TOOLS; t++) {
  // Ensure at least 1 capability per tool
  const guaranteedCap = Math.floor(rng() * NUM_CAPS);
  capMatrix[t * NUM_CAPS + guaranteedCap] = 1;
  for (let c = 0; c < NUM_CAPS; c++) {
    if (rng() < CAP_SPARSITY) {
      capMatrix[t * NUM_CAPS + c] = 1;
    }
  }
}

const toolCapMap: ToolCapabilityMap = {
  matrix: capMatrix,
  numTools: NUM_TOOLS,
  numCapabilities: NUM_CAPS,
};

// Build toolToIndex for bigram
const toolToIndex = new Map<string, number>();
toolIds.forEach((id, i) => toolToIndex.set(id, i));

// Generate synthetic traces for bigram (multi-tool only, 2-5 tools each)
const syntheticTraces: string[][] = [];
for (let i = 0; i < 200; i++) {
  const len = 2 + Math.floor(rng() * 4); // 2..5
  const trace: string[] = [];
  for (let j = 0; j < len; j++) {
    trace.push(toolIds[Math.floor(rng() * NUM_TOOLS)]);
  }
  syntheticTraces.push(trace);
}

// Generate training examples: 150 multi-tool + 50 single-tool
function generateExamples(): TransitionExample[] {
  const examples: TransitionExample[] = [];

  // 150 multi-tool examples (2-4 tool sequences)
  for (let i = 0; i < 150; i++) {
    const intentEmb = randomEmbedding();
    const seqLen = 2 + Math.floor(rng() * 3); // 2..4
    const tools: string[] = [];
    for (let j = 0; j < seqLen; j++) {
      tools.push(toolIds[Math.floor(rng() * NUM_TOOLS)]);
    }
    for (let step = 0; step < tools.length; step++) {
      examples.push({
        intentEmbedding: intentEmb,
        contextToolIds: tools.slice(0, step),
        targetToolId: tools[step],
        isTerminal: step === tools.length - 1 ? 1 : 0,
        isSingleTool: false,
      });
    }
  }

  // 50 single-tool examples
  for (let i = 0; i < 50; i++) {
    examples.push({
      intentEmbedding: randomEmbedding(),
      contextToolIds: [],
      targetToolId: toolIds[Math.floor(rng() * NUM_TOOLS)],
      isTerminal: 1,
      isSingleTool: true,
    });
  }

  return examples;
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms.toFixed(1)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

async function run(): Promise<void> {
  console.log("=".repeat(60));
  console.log("  CompactInformedGRU Benchmark (synthetic data)");
  console.log("=".repeat(60));
  console.log(`  Tools: ${NUM_TOOLS}, Caps: ${NUM_CAPS}, EmbDim: ${EMBEDDING_DIM}`);
  console.log();

  // 1. Init TensorFlow
  console.log("[1/5] Initializing TensorFlow.js...");
  const tfStart = performance.now();
  const backendName = await initTensorFlow();
  const tfTime = performance.now() - tfStart;
  console.log(`      Backend: ${backendName} (${getBackend()})`);
  console.log(`      Init time: ${formatMs(tfTime)}`);
  logMemory("      ");
  console.log();

  // 2. Model init (buildModel + setToolVocabulary + structural bias)
  console.log("[2/5] Initializing model...");
  logMemory("      [before] ");

  const initStart = performance.now();
  const model = new CompactInformedGRU({ embeddingDim: EMBEDDING_DIM });

  const jaccardMatrix = computeJaccardMatrix(toolCapMap);
  const bigramMatrix = computeBigramMatrix(syntheticTraces, toolToIndex, NUM_TOOLS);

  model.setToolVocabulary(toolEmbeddings, toolCapMap);
  model.setStructuralBias({ jaccardMatrix, bigramMatrix, numTools: NUM_TOOLS });
  const initTime = performance.now() - initStart;

  console.log(`      Init time: ${formatMs(initTime)}`);
  logMemory("      [after]  ");
  console.log();

  // 3. Model summary
  console.log("[3/5] Model summary:");
  model.summary();
  console.log();

  // 4. Training benchmark (10 iterations, batch=32)
  console.log("[4/5] Training benchmark (10 x batch=32)...");
  const examples = generateExamples();
  const BATCH_SIZE = 32;
  const TRAIN_ITERS = 10;

  // Warmup (1 step, not counted)
  const warmupBatch = examples.slice(0, BATCH_SIZE);
  model.trainStep(warmupBatch);

  const trainTimes: number[] = [];
  let batchOffset = 0;
  for (let i = 0; i < TRAIN_ITERS; i++) {
    const batch = examples.slice(batchOffset, batchOffset + BATCH_SIZE);
    if (batch.length === 0) {
      batchOffset = 0;
      continue;
    }
    batchOffset = (batchOffset + BATCH_SIZE) % examples.length;

    model.annealTemperature(i, TRAIN_ITERS);
    const stepStart = performance.now();
    const metrics = model.trainStep(batch);
    const stepTime = performance.now() - stepStart;
    trainTimes.push(stepTime);

    console.log(
      `      iter ${String(i + 1).padStart(2)}: ${formatMs(stepTime)} ` +
        `(loss=${metrics.loss.toFixed(4)}, nextAcc=${(metrics.nextToolAccuracy * 100).toFixed(1)}%, ` +
        `termAcc=${(metrics.terminationAccuracy * 100).toFixed(1)}%)`,
    );
  }

  const avgTrain = trainTimes.reduce((a, b) => a + b, 0) / trainTimes.length;
  const minTrain = Math.min(...trainTimes);
  const maxTrain = Math.max(...trainTimes);
  console.log(
    `      avg=${formatMs(avgTrain)}, min=${formatMs(minTrain)}, max=${formatMs(maxTrain)}`,
  );
  logMemory("      ");
  console.log();

  // 5. buildPath benchmark (10 paths)
  console.log("[5/5] buildPath benchmark (10 paths)...");
  const NUM_PATHS = 10;
  const pathTimes: number[] = [];
  const pathLengths: number[] = [];

  for (let i = 0; i < NUM_PATHS; i++) {
    const intentEmb = randomEmbedding();
    const startTool = toolIds[Math.floor(rng() * NUM_TOOLS)];

    const pathStart = performance.now();
    const path = model.buildPath(intentEmb, startTool);
    const pathTime = performance.now() - pathStart;

    pathTimes.push(pathTime);
    pathLengths.push(path.length);

    console.log(
      `      path ${String(i + 1).padStart(2)}: ${formatMs(pathTime)} ` +
        `(${path.length} tools: ${path.slice(0, 4).join(" -> ")}${path.length > 4 ? " -> ..." : ""})`,
    );
  }

  const avgPath = pathTimes.reduce((a, b) => a + b, 0) / pathTimes.length;
  const avgPathLen =
    pathLengths.reduce((a, b) => a + b, 0) / pathLengths.length;
  console.log(
    `      avg=${formatMs(avgPath)}, avg_length=${avgPathLen.toFixed(1)} tools`,
  );
  logMemory("      ");

  // Summary
  console.log();
  console.log("=".repeat(60));
  console.log("  SUMMARY");
  console.log("=".repeat(60));
  console.log(`  Backend:            ${getBackend()}`);
  console.log(`  TF init:            ${formatMs(tfTime)}`);
  console.log(`  Model init:         ${formatMs(initTime)}`);
  console.log(`  trainStep avg:      ${formatMs(avgTrain)}`);
  console.log(`  buildPath avg:      ${formatMs(avgPath)}`);
  console.log(`  buildPath avg len:  ${avgPathLen.toFixed(1)}`);
  logMemory("  ");
  console.log("=".repeat(60));

  // Cleanup
  model.dispose();
}

run().catch((err) => {
  console.error("[FATAL]", err);
  // Use exit code 1 -- compatible Node.js + Deno
  if (typeof process !== "undefined") {
    process.exit(1);
  }
});
