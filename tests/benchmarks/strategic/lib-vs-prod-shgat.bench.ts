/**
 * lib/shgat vs prod SHGAT Divergence Benchmark
 *
 * Validates that the standalone lib/shgat package produces identical results
 * to the production SHGAT in src/graphrag/algorithms/shgat.ts.
 *
 * Uses REAL production configs:
 * - batchSize: 32
 * - numHeads: 16
 * - temperature: 0.07 (CLIP-style InfoNCE)
 * - learningRate: 0.05
 *
 * Run: deno bench --allow-all tests/benchmarks/strategic/lib-vs-prod-shgat.bench.ts
 *
 * @module tests/benchmarks/strategic/lib-vs-prod-shgat
 */

// Import lib/shgat (standalone package)
import {
  createSHGATFromCapabilities as createLibSHGAT,
  DEFAULT_SHGAT_CONFIG as LIB_CONFIG,
  seedRng as libSeedRng,
  type TrainingExample as LibTrainingExample,
} from "../../../lib/shgat/mod.ts";

// Import prod SHGAT
import {
  createSHGATFromCapabilities as createProdSHGAT,
  DEFAULT_SHGAT_CONFIG as PROD_CONFIG,
  seedRng as prodSeedRng,
  type TrainingExample as ProdTrainingExample,
} from "../../../src/graphrag/algorithms/shgat.ts";

import { loadScenario } from "../fixtures/scenario-loader.ts";

// ============================================================================
// REAL Production Config Values
// ============================================================================

const BATCH_SIZE = PROD_CONFIG.batchSize; // 32
const TEMPERATURE = 0.07; // CLIP-style InfoNCE
const LEARNING_RATE = PROD_CONFIG.learningRate; // 0.05
const EPOCHS = 10; // Enough to see convergence

console.log("=".repeat(70));
console.log("lib/shgat vs prod SHGAT - REAL PRODUCTION CONFIG");
console.log("=".repeat(70));
console.log(`batchSize: ${BATCH_SIZE}`);
console.log(`temperature: ${TEMPERATURE}`);
console.log(`learningRate: ${LEARNING_RATE}`);
console.log(`epochs: ${EPOCHS}`);
console.log(`lib numHeads: ${LIB_CONFIG.numHeads}, hiddenDim: ${LIB_CONFIG.hiddenDim}`);
console.log(`prod numHeads: ${PROD_CONFIG.numHeads}, hiddenDim: ${PROD_CONFIG.hiddenDim}`);
console.log("=".repeat(70));

// ============================================================================
// Test Data Setup
// ============================================================================

console.log("\n📦 Loading production-traces scenario...");
const scenario = await loadScenario("production-traces");

type CapWithEmb = {
  id: string;
  embedding: number[];
  toolsUsed: string[];
  successRate: number;
  parents?: string[];
  children?: string[];
};
type ToolWithEmb = { id: string; embedding: number[] };
type EventWithEmb = {
  intent: string;
  intentEmbedding: number[];
  contextTools: string[];
  selectedCapability: string;
  outcome: string;
};
type QueryWithEmb = {
  intent: string;
  intentEmbedding: number[];
  expectedCapability: string;
};

const rawCaps = scenario.nodes.capabilities as CapWithEmb[];
const rawTools = scenario.nodes.tools as unknown as ToolWithEmb[];
const rawEvents = (scenario as { episodicEvents?: EventWithEmb[] }).episodicEvents || [];
const rawQueries = (scenario as { testQueries?: QueryWithEmb[] }).testQueries || [];

// Build capabilities array
const capabilities = rawCaps.map((c) => ({
  id: c.id,
  embedding: c.embedding,
  toolsUsed: c.toolsUsed,
  successRate: c.successRate,
  parents: c.parents || [],
  children: c.children || [],
}));

// Build tool embeddings map
const toolEmbeddings = new Map<string, number[]>();
for (const t of rawTools) {
  if (t.embedding) {
    toolEmbeddings.set(t.id, t.embedding);
  }
}

// Build training examples (use all available) with negative samples
const allCapIds = capabilities.map(c => c.id);
const trainingExamples: LibTrainingExample[] = rawEvents.map((event) => {
  // Generate random negatives (exclude the positive)
  const negatives = allCapIds
    .filter(id => id !== event.selectedCapability)
    .sort(() => Math.random() - 0.5)
    .slice(0, 10);

  return {
    intentEmbedding: event.intentEmbedding,
    contextTools: event.contextTools,
    candidateId: event.selectedCapability,
    outcome: event.outcome === "success" ? 1 : 0,
    negativeCapIds: negatives,
  };
});

// Test intent
const testIntent = rawQueries[0]?.intentEmbedding || new Array(1024).fill(0.1);

console.log(`📊 Data loaded:`);
console.log(`   Capabilities: ${capabilities.length}`);
console.log(`   Tools with embeddings: ${toolEmbeddings.size}`);
console.log(`   Training examples: ${trainingExamples.length}`);
console.log(`   Test queries: ${rawQueries.length}`);

// ============================================================================
// Initialize Both Models with Same Seed
// ============================================================================

const SEED = 42;

console.log("\n🔧 Initializing models with seed=" + SEED);

libSeedRng(SEED);
const libSHGAT = createLibSHGAT(capabilities, toolEmbeddings);

prodSeedRng(SEED);
const prodSHGAT = createProdSHGAT(capabilities, toolEmbeddings);

console.log("✅ Both models initialized");

// ============================================================================
// Divergence Metrics
// ============================================================================

interface DivergenceResult {
  maxDiff: number;
  avgDiff: number;
  correlationCoeff: number;
  rankAgreement: number;
}

function computeDivergence(
  libScores: Array<{ capabilityId: string; score: number }>,
  prodScores: Array<{ capabilityId: string; score: number }>,
): DivergenceResult {
  const libMap = new Map(libScores.map((s) => [s.capabilityId, s.score]));
  const prodMap = new Map(prodScores.map((s) => [s.capabilityId, s.score]));

  const diffs: number[] = [];
  const libVals: number[] = [];
  const prodVals: number[] = [];

  for (const [id, libScore] of libMap) {
    const prodScore = prodMap.get(id);
    if (prodScore !== undefined) {
      diffs.push(Math.abs(libScore - prodScore));
      libVals.push(libScore);
      prodVals.push(prodScore);
    }
  }

  const maxDiff = Math.max(...diffs);
  const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;

  // Pearson correlation coefficient
  const n = libVals.length;
  const meanLib = libVals.reduce((a, b) => a + b, 0) / n;
  const meanProd = prodVals.reduce((a, b) => a + b, 0) / n;

  let num = 0, denLib = 0, denProd = 0;
  for (let i = 0; i < n; i++) {
    const dLib = libVals[i] - meanLib;
    const dProd = prodVals[i] - meanProd;
    num += dLib * dProd;
    denLib += dLib * dLib;
    denProd += dProd * dProd;
  }
  const correlationCoeff = num / (Math.sqrt(denLib) * Math.sqrt(denProd) || 1);

  // Rank agreement (top 5)
  const libTop5 = libScores.slice(0, 5).map((s) => s.capabilityId);
  const prodTop5 = prodScores.slice(0, 5).map((s) => s.capabilityId);
  const rankAgreement = libTop5.filter((id) => prodTop5.includes(id)).length / 5;

  return { maxDiff, avgDiff, correlationCoeff, rankAgreement };
}

// ============================================================================
// Pre-Training Divergence Test
// ============================================================================

console.log("\n" + "=".repeat(70));
console.log("PRE-TRAINING DIVERGENCE TEST");
console.log("=".repeat(70));

const libPreScores = libSHGAT.scoreAllCapabilities(testIntent);
const prodPreScores = prodSHGAT.scoreAllCapabilities(testIntent);

const preDivergence = computeDivergence(libPreScores, prodPreScores);

console.log(`Max score difference:  ${preDivergence.maxDiff.toFixed(6)}`);
console.log(`Avg score difference:  ${preDivergence.avgDiff.toFixed(6)}`);
console.log(`Correlation:           ${preDivergence.correlationCoeff.toFixed(4)}`);
console.log(`Top-5 rank agreement:  ${(preDivergence.rankAgreement * 100).toFixed(0)}%`);

const preTrainPassed = preDivergence.maxDiff < 0.001 && preDivergence.correlationCoeff > 0.999;
console.log(`\nPre-training test: ${preTrainPassed ? "✅ PASS" : "❌ FAIL (expected identical scores)"}`);

// ============================================================================
// Train Both Models with REAL prod config
// ============================================================================

console.log("\n" + "=".repeat(70));
console.log(`TRAINING BOTH MODELS (${EPOCHS} epochs, batch=${BATCH_SIZE}, τ=${TEMPERATURE})`);
console.log("=".repeat(70));

// Reset seeds for training
libSeedRng(SEED);
prodSeedRng(SEED);

// Train in batches like prod does
const numBatches = Math.ceil(trainingExamples.length / BATCH_SIZE);

console.log(`Training ${trainingExamples.length} examples in ${numBatches} batches per epoch`);

// Train lib/shgat
console.log("\nTraining lib/shgat...");
let libFinalLoss = 0, libFinalAcc = 0;
for (let epoch = 0; epoch < EPOCHS; epoch++) {
  let epochLoss = 0, epochAcc = 0, batchCount = 0;
  for (let b = 0; b < numBatches; b++) {
    const start = b * BATCH_SIZE;
    const batch = trainingExamples.slice(start, start + BATCH_SIZE);
    if (batch.length === 0) continue;

    const result = libSHGAT.trainBatchV1KHeadBatched(
      batch,
      batch.map(() => 1.0),
      false,
      TEMPERATURE,
    );
    epochLoss += result.loss;
    epochAcc += result.accuracy;
    batchCount++;
  }
  libFinalLoss = epochLoss / batchCount;
  libFinalAcc = epochAcc / batchCount;
  if (epoch === 0 || epoch === EPOCHS - 1) {
    console.log(`   Epoch ${epoch + 1}: loss=${libFinalLoss.toFixed(4)}, acc=${(libFinalAcc * 100).toFixed(1)}%`);
  }
}

// Train prod SHGAT
console.log("\nTraining prod SHGAT...");
let prodFinalLoss = 0, prodFinalAcc = 0;
for (let epoch = 0; epoch < EPOCHS; epoch++) {
  let epochLoss = 0, epochAcc = 0, batchCount = 0;
  for (let b = 0; b < numBatches; b++) {
    const start = b * BATCH_SIZE;
    const batch = trainingExamples.slice(start, start + BATCH_SIZE) as ProdTrainingExample[];
    if (batch.length === 0) continue;

    const result = prodSHGAT.trainBatchV1KHeadBatched(
      batch,
      batch.map(() => 1.0),
      false,
      TEMPERATURE,
    );
    epochLoss += result.loss;
    epochAcc += result.accuracy;
    batchCount++;
  }
  prodFinalLoss = epochLoss / batchCount;
  prodFinalAcc = epochAcc / batchCount;
  if (epoch === 0 || epoch === EPOCHS - 1) {
    console.log(`   Epoch ${epoch + 1}: loss=${prodFinalLoss.toFixed(4)}, acc=${(prodFinalAcc * 100).toFixed(1)}%`);
  }
}

// ============================================================================
// Post-Training Divergence Test
// ============================================================================

console.log("\n" + "=".repeat(70));
console.log("POST-TRAINING DIVERGENCE TEST");
console.log("=".repeat(70));

const libPostScores = libSHGAT.scoreAllCapabilities(testIntent);
const prodPostScores = prodSHGAT.scoreAllCapabilities(testIntent);

const postDivergence = computeDivergence(libPostScores, prodPostScores);

console.log(`Max score difference:  ${postDivergence.maxDiff.toFixed(6)}`);
console.log(`Avg score difference:  ${postDivergence.avgDiff.toFixed(6)}`);
console.log(`Correlation:           ${postDivergence.correlationCoeff.toFixed(4)}`);
console.log(`Top-5 rank agreement:  ${(postDivergence.rankAgreement * 100).toFixed(0)}%`);

console.log(`\nTraining convergence comparison:`);
console.log(`   lib/shgat:  loss=${libFinalLoss.toFixed(4)}, acc=${(libFinalAcc * 100).toFixed(1)}%`);
console.log(`   prod SHGAT: loss=${prodFinalLoss.toFixed(4)}, acc=${(prodFinalAcc * 100).toFixed(1)}%`);

const postTrainPassed = postDivergence.correlationCoeff > 0.95 && postDivergence.rankAgreement >= 0.6;
console.log(`\nPost-training test: ${postTrainPassed ? "✅ PASS" : "❌ FAIL (divergence too high)"}`);

// ============================================================================
// Accuracy Comparison on Test Queries
// ============================================================================

console.log("\n" + "=".repeat(70));
console.log("ACCURACY ON TEST QUERIES (MRR, Hit@1, Hit@3)");
console.log("=".repeat(70));

let libHit1 = 0, libHit3 = 0, prodHit1 = 0, prodHit3 = 0;
let libMRR = 0, prodMRR = 0;

for (const query of rawQueries) {
  const libResults = libSHGAT.scoreAllCapabilities(query.intentEmbedding);
  const prodResults = prodSHGAT.scoreAllCapabilities(query.intentEmbedding);

  const libRank = libResults.findIndex((r) => r.capabilityId === query.expectedCapability) + 1;
  const prodRank = prodResults.findIndex((r) => r.capabilityId === query.expectedCapability) + 1;

  if (libRank === 1) libHit1++;
  if (libRank <= 3) libHit3++;
  if (prodRank === 1) prodHit1++;
  if (prodRank <= 3) prodHit3++;
  if (libRank > 0) libMRR += 1 / libRank;
  if (prodRank > 0) prodMRR += 1 / prodRank;
}

const n = rawQueries.length || 1;
console.log(`lib/shgat:  MRR=${(libMRR / n).toFixed(3)}, Hit@1=${(libHit1 / n * 100).toFixed(1)}%, Hit@3=${(libHit3 / n * 100).toFixed(1)}%`);
console.log(`prod SHGAT: MRR=${(prodMRR / n).toFixed(3)}, Hit@1=${(prodHit1 / n * 100).toFixed(1)}%, Hit@3=${(prodHit3 / n * 100).toFixed(1)}%`);

const mrrDiff = Math.abs((libMRR / n) - (prodMRR / n));
console.log(`\nMRR difference: ${mrrDiff.toFixed(4)} ${mrrDiff < 0.05 ? "✅" : "⚠️ DIVERGENCE"}`);

// ============================================================================
// Summary
// ============================================================================

console.log("\n" + "=".repeat(70));
console.log("SUMMARY");
console.log("=".repeat(70));

const allPassed = preTrainPassed && postTrainPassed && mrrDiff < 0.05;
if (allPassed) {
  console.log("✅ lib/shgat and prod SHGAT are ALIGNED - no significant divergence");
} else {
  console.log("❌ DIVERGENCE DETECTED - investigate differences");
  if (!preTrainPassed) console.log("   - Pre-training scores differ");
  if (!postTrainPassed) console.log("   - Post-training correlation/ranking differs");
  if (mrrDiff >= 0.05) console.log("   - MRR accuracy differs by ≥5%");
}
console.log("=".repeat(70) + "\n");

// ============================================================================
// Deno Benchmarks (Latency)
// ============================================================================

Deno.bench({
  name: "lib/shgat: scoreAllCapabilities",
  group: "lib-vs-prod-latency",
  baseline: true,
  fn: () => {
    libSHGAT.scoreAllCapabilities(testIntent);
  },
});

Deno.bench({
  name: "prod SHGAT: scoreAllCapabilities",
  group: "lib-vs-prod-latency",
  fn: () => {
    prodSHGAT.scoreAllCapabilities(testIntent);
  },
});

Deno.bench({
  name: "lib/shgat: trainBatchV1KHeadBatched (32 examples)",
  group: "lib-vs-prod-training",
  baseline: true,
  fn: () => {
    libSHGAT.trainBatchV1KHeadBatched(
      trainingExamples.slice(0, BATCH_SIZE),
      trainingExamples.slice(0, BATCH_SIZE).map(() => 1.0),
      true, // evaluateOnly
      TEMPERATURE,
    );
  },
});

Deno.bench({
  name: "prod SHGAT: trainBatchV1KHeadBatched (32 examples)",
  group: "lib-vs-prod-training",
  fn: () => {
    prodSHGAT.trainBatchV1KHeadBatched(
      trainingExamples.slice(0, BATCH_SIZE) as ProdTrainingExample[],
      trainingExamples.slice(0, BATCH_SIZE).map(() => 1.0),
      true, // evaluateOnly
      TEMPERATURE,
    );
  },
});
