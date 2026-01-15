#!/usr/bin/env -S deno run --allow-all
/**
 * Benchmark: SHGAT with all tools vs capability-referenced tools only
 *
 * Compares:
 * 1. Current: Only tools referenced by capabilities (65 tools)
 * 2. All tools: All tools from fixture (66 tools + simulated extras)
 */

import { createSHGATFromCapabilities, type TrainingExample } from "../src/graphrag/algorithms/shgat.ts";
import { SHGAT } from "../src/graphrag/algorithms/shgat.ts";
import { NUM_NEGATIVES } from "../src/graphrag/algorithms/shgat/types.ts";
import { initBlasAcceleration } from "../src/graphrag/algorithms/shgat/utils/math.ts";

// Initialize BLAS for fast matrix ops
const blasAvailable = await initBlasAcceleration();
console.log(`BLAS: ${blasAvailable ? "enabled (OpenBLAS)" : "disabled (JS fallback)"}`);

// Load production data
const data = JSON.parse(await Deno.readTextFile("tests/benchmarks/fixtures/scenarios/production-traces.json"));

const capabilities = data.nodes.capabilities.map((c: any) => ({
  id: c.id,
  embedding: c.embedding,
  toolsUsed: c.toolsUsed,
  successRate: c.successRate,
}));

// All tools from fixture
const allToolsFromFixture = data.nodes.tools.map((t: any) => ({
  id: t.id,
  embedding: t.embedding,
}));

// Use real tools from fixture only (no simulation needed)

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const examples: TrainingExample[] = data.episodicEvents.map((ev: any) => {
  const selectedCap = capabilities.find((c: any) => c.id === ev.selectedCapability);
  const allNegativesSorted = capabilities
    .filter((c: any) => c.id !== ev.selectedCapability)
    .map((c: any) => ({ id: c.id, sim: selectedCap ? cosineSimilarity(selectedCap.embedding, c.embedding) : 0 }))
    .sort((a: any, b: any) => b.sim - a.sim)
    .map((c: any) => c.id);
  return {
    intentEmbedding: ev.intentEmbedding,
    contextTools: ev.contextTools,
    candidateId: ev.selectedCapability,
    outcome: ev.outcome === "success" ? 1 : 0,
    negativeCapIds: shuffle(allNegativesSorted).slice(0, NUM_NEGATIVES),
    allNegativesSorted,
  };
});

const splitIdx = Math.floor(examples.length * 0.8);
const train = examples.slice(0, splitIdx);
const test = examples.slice(splitIdx);

console.log("╔═══════════════════════════════════════════════════════════════╗");
console.log("║  SHGAT: All Tools vs Capability-Referenced Tools Benchmark   ║");
console.log("╚═══════════════════════════════════════════════════════════════╝");
console.log("");

const EPOCHS = 10;
const BATCH_SIZE = 16;

async function runBenchmark(name: string, shgat: SHGAT) {
  const stats = shgat.getStats();
  console.log(`\n${name}:`);
  console.log(`  Tools: ${stats.toolCount}, Caps: ${stats.capabilityCount}`);

  const startTime = performance.now();

  const results: Array<{ epoch: number; loss: number; trainAcc: number; testAcc: number; timeMs: number }> = [];

  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const epochStart = performance.now();
    const temperature = 0.10 - (0.10 - 0.06) * (epoch / (EPOCHS - 1));

    let epochLoss = 0, epochAcc = 0, batches = 0;
    for (let i = 0; i < train.length; i += BATCH_SIZE) {
      const batch = train.slice(i, i + BATCH_SIZE);
      const result = shgat.trainBatchV1KHeadBatched(batch, batch.map(() => 1.0), false, temperature);
      epochLoss += result.loss;
      epochAcc += result.accuracy;
      batches++;
    }

    const testResult = shgat.trainBatchV1KHeadBatched(test, test.map(() => 1.0), true, temperature);
    const epochTime = performance.now() - epochStart;

    results.push({
      epoch: epoch + 1,
      loss: epochLoss / batches,
      trainAcc: epochAcc / batches,
      testAcc: testResult.accuracy,
      timeMs: epochTime,
    });

    console.log(`  Epoch ${epoch + 1}: loss=${(epochLoss/batches).toFixed(4)}, train=${(epochAcc/batches*100).toFixed(1)}%, test=${(testResult.accuracy*100).toFixed(1)}%, time=${epochTime.toFixed(0)}ms`);
  }

  const totalTime = performance.now() - startTime;
  const avgTimePerEpoch = totalTime / EPOCHS;
  const finalTestAcc = results[results.length - 1].testAcc;

  console.log(`  ────────────────────────────────────`);
  console.log(`  Total: ${(totalTime/1000).toFixed(1)}s, Avg/epoch: ${avgTimePerEpoch.toFixed(0)}ms`);
  console.log(`  Final test accuracy: ${(finalTestAcc * 100).toFixed(1)}%`);

  return { totalTime, avgTimePerEpoch, finalTestAcc, results };
}

// Version 1: Current behavior (capability-referenced tools only)
console.log("\n─── Version 1: Capability-referenced tools only ───");
const shgat1 = createSHGATFromCapabilities(capabilities, { numHeads: 16, hiddenDim: 1024, headDim: 64 });
const result1 = await runBenchmark("Current (65 tools)", shgat1);

// Version 2: All tools from fixture
console.log("\n─── Version 2: All tools from fixture ───");
const toolEmbeddingsMap = new Map(allToolsFromFixture.map((t: any) => [t.id, t.embedding]));
const shgat2 = createSHGATFromCapabilities(capabilities, toolEmbeddingsMap, { numHeads: 16, hiddenDim: 1024, headDim: 64 });
// Register extra tools that aren't in capabilities
for (const tool of allToolsFromFixture) {
  if (!shgat2.hasToolNode(tool.id)) {
    shgat2.registerTool({ id: tool.id, embedding: tool.embedding });
  }
}
const result2 = await runBenchmark(`All fixture tools (${allToolsFromFixture.length} tools)`, shgat2);

// Summary
console.log("\n╔═══════════════════════════════════════════════════════════════╗");
console.log("║                         SUMMARY                               ║");
console.log("╚═══════════════════════════════════════════════════════════════╝");
console.log("");
console.log("| Config                  | Tools | Time/epoch | Final Test Acc |");
console.log("|-------------------------|-------|------------|----------------|");
console.log(`| Cap-referenced only     | ${String(shgat1.getToolCount()).padStart(5)} | ${result1.avgTimePerEpoch.toFixed(0).padStart(7)}ms | ${(result1.finalTestAcc*100).toFixed(1).padStart(13)}% |`);
console.log(`| All fixture tools       | ${String(allToolsFromFixture.length).padStart(5)} | ${result2.avgTimePerEpoch.toFixed(0).padStart(7)}ms | ${(result2.finalTestAcc*100).toFixed(1).padStart(13)}% |`);
console.log("");

const slowdown = result2.avgTimePerEpoch / result1.avgTimePerEpoch;
const accDiff = (result2.finalTestAcc - result1.finalTestAcc) * 100;
console.log(`Slowdown with all tools: ${slowdown.toFixed(1)}x`);
console.log(`Accuracy difference: ${accDiff > 0 ? '+' : ''}${accDiff.toFixed(1)}%`);
