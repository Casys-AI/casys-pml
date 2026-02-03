/**
 * lib/shgat vs shgat-tf Quick Benchmark
 *
 * Fast comparison between lib/shgat and shgat-tf (TensorFlow.js version).
 * Excludes prod SHGAT for faster iteration.
 *
 * Run: deno bench --allow-all tests/benchmarks/strategic/lib-vs-tf-shgat.bench.ts
 *
 * @module tests/benchmarks/strategic/lib-vs-tf-shgat
 */

// Import lib/shgat (standalone package)
import {
  createSHGATFromCapabilities as createLibSHGAT,
  DEFAULT_SHGAT_CONFIG as LIB_CONFIG,
  seedRng as libSeedRng,
  type TrainingExample as LibTrainingExample,
} from "../../../lib/shgat/mod.ts";

// Import shgat-tf (AutogradTrainer with message passing)
import {
  DEFAULT_SHGAT_CONFIG as TF_CONFIG,
  seedRng as tfSeedRng,
  AutogradTrainer,
  buildGraphStructure,
  initLayersTrainer,
  type TrainingExample as TfTrainingExample,
  type GraphStructure,
} from "../../../lib/shgat-tf/mod.ts";

import { loadScenario } from "../fixtures/scenario-loader.ts";

// Initialize LayersTrainer (WASM backend + FFI custom kernel for UnsortedSegmentSum)
const tfBackend = await initLayersTrainer();
console.log(`[TF] Backend: ${tfBackend}`);

// ============================================================================
// Config
// ============================================================================

const BATCH_SIZE = LIB_CONFIG.batchSize; // 32
const TEMPERATURE = 0.07; // CLIP-style InfoNCE
const LEARNING_RATE = LIB_CONFIG.learningRate; // 0.05
const EPOCHS = 3;

console.log("=".repeat(70));
console.log("lib/shgat vs shgat-tf - QUICK BENCHMARK");
console.log("=".repeat(70));
console.log(`batchSize: ${BATCH_SIZE}`);
console.log(`temperature: ${TEMPERATURE}`);
console.log(`learningRate: ${LEARNING_RATE}`);
console.log(`epochs: ${EPOCHS}`);
console.log(`lib numHeads: ${LIB_CONFIG.numHeads}, hiddenDim: ${LIB_CONFIG.hiddenDim}`);
console.log(`tf numHeads: ${TF_CONFIG.numHeads}, hiddenDim: ${TF_CONFIG.hiddenDim}`);
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

// Build training examples with negative samples
const allCapIds = capabilities.map((c) => c.id);
const trainingExamples: LibTrainingExample[] = rawEvents.map((event) => {
  const negatives = allCapIds
    .filter((id) => id !== event.selectedCapability)
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

tfSeedRng(SEED);
const nodeEmbeddings = new Map<string, number[]>();
for (const cap of capabilities) {
  nodeEmbeddings.set(cap.id, cap.embedding);
}
for (const [toolId, emb] of toolEmbeddings) {
  nodeEmbeddings.set(toolId, emb);
}

// Build graph structure for message passing
const toolIds = Array.from(toolEmbeddings.keys());
const graphStructure: GraphStructure = buildGraphStructure(capabilities, toolIds);

// Create trainer with message passing enabled
const tfTrainer = new AutogradTrainer(
  TF_CONFIG,
  { temperature: TEMPERATURE, learningRate: LEARNING_RATE },
  graphStructure.maxLevel
);
tfTrainer.setNodeEmbeddings(nodeEmbeddings);
tfTrainer.setGraph(graphStructure);

// Pre-compute capability IDs for scoring
const capIds = capabilities.map((c) => c.id);

// Initialize graph structure with a forward pass
libSHGAT.scoreNodes(testIntent, 1);

console.log("✅ Both models initialized (lib/shgat, shgat-tf AutogradTrainer)");
console.log(`   shgat-tf uses AutogradTrainer with FULL MESSAGE PASSING`);
console.log(`   Graph: ${toolIds.length} tools, ${capIds.length} caps, maxLevel=${graphStructure.maxLevel}`);

// ============================================================================
// Train Both Models
// ============================================================================

console.log("\n" + "=".repeat(70));
console.log(`TRAINING BOTH MODELS (${EPOCHS} epochs, batch=${BATCH_SIZE}, τ=${TEMPERATURE})`);
console.log("=".repeat(70));

// Reset seeds for training
libSeedRng(SEED);

const numBatches = Math.ceil(trainingExamples.length / BATCH_SIZE);
console.log(`Training ${trainingExamples.length} examples in ${numBatches} batches per epoch`);

// Train lib/shgat
console.log("\nTraining lib/shgat...");
let libFinalLoss = 0,
  libFinalAcc = 0;
for (let epoch = 0; epoch < EPOCHS; epoch++) {
  let epochLoss = 0,
    epochAcc = 0,
    batchCount = 0;
  for (let b = 0; b < numBatches; b++) {
    const start = b * BATCH_SIZE;
    const batch = trainingExamples.slice(start, start + BATCH_SIZE);
    if (batch.length === 0) continue;

    const result = libSHGAT.trainBatchV1KHeadBatched(
      batch,
      batch.map(() => 1.0),
      false,
      TEMPERATURE
    );
    epochLoss += result.loss;
    epochAcc += result.accuracy;
    batchCount++;
  }
  libFinalLoss = epochLoss / batchCount;
  libFinalAcc = epochAcc / batchCount;
  console.log(`   Epoch ${epoch + 1}: loss=${libFinalLoss.toFixed(4)}, acc=${(libFinalAcc * 100).toFixed(1)}%`);
}

// Train shgat-tf
console.log("\nTraining shgat-tf (AutogradTrainer + Message Passing)...");
let tfFinalLoss = 0,
  tfFinalAcc = 0;
for (let epoch = 0; epoch < EPOCHS; epoch++) {
  let epochLoss = 0,
    epochAcc = 0,
    batchCount = 0;
  for (let b = 0; b < numBatches; b++) {
    const start = b * BATCH_SIZE;
    const batch = trainingExamples.slice(start, start + BATCH_SIZE) as TfTrainingExample[];
    if (batch.length === 0) continue;

    const result = tfTrainer.trainBatch(batch);
    epochLoss += result.loss;
    epochAcc += result.accuracy;
    batchCount++;
  }
  tfFinalLoss = epochLoss / batchCount;
  tfFinalAcc = epochAcc / batchCount;
  console.log(`   Epoch ${epoch + 1}: loss=${tfFinalLoss.toFixed(4)}, acc=${(tfFinalAcc * 100).toFixed(1)}%`);
}

// ============================================================================
// Accuracy Comparison on Test Queries
// ============================================================================

console.log("\n" + "=".repeat(70));
console.log("ACCURACY ON TEST QUERIES (MRR, Hit@1, Hit@3)");
console.log("=".repeat(70));

let libHit1 = 0,
  libHit3 = 0;
let tfHit1 = 0,
  tfHit3 = 0;
let libMRR = 0,
  tfMRR = 0;

for (const query of rawQueries) {
  const libResults = libSHGAT.scoreNodes(query.intentEmbedding, 1);

  const tfScores = tfTrainer.score(query.intentEmbedding, capIds);
  const tfResults = capIds
    .map((id, i) => ({ nodeId: id, score: tfScores[i] }))
    .sort((a, b) => b.score - a.score);

  const libRank = libResults.findIndex((r) => r.nodeId === query.expectedCapability) + 1;
  const tfRank = tfResults.findIndex((r) => r.nodeId === query.expectedCapability) + 1;

  if (libRank === 1) libHit1++;
  if (libRank <= 3) libHit3++;
  if (tfRank === 1) tfHit1++;
  if (tfRank <= 3) tfHit3++;
  if (libRank > 0) libMRR += 1 / libRank;
  if (tfRank > 0) tfMRR += 1 / tfRank;
}

const n = rawQueries.length || 1;
console.log(
  `lib/shgat:    MRR=${(libMRR / n).toFixed(3)}, Hit@1=${((libHit1 / n) * 100).toFixed(1)}%, Hit@3=${((libHit3 / n) * 100).toFixed(1)}%`
);
console.log(
  `shgat-tf:     MRR=${(tfMRR / n).toFixed(3)}, Hit@1=${((tfHit1 / n) * 100).toFixed(1)}%, Hit@3=${((tfHit3 / n) * 100).toFixed(1)}%`
);

const mrrDiff = Math.abs(libMRR / n - tfMRR / n);
console.log(`\nMRR lib vs shgat-tf: ${mrrDiff.toFixed(4)} ${mrrDiff < 0.05 ? "✅" : "⚠️ DIVERGENCE"}`);

// ============================================================================
// Summary
// ============================================================================

console.log("\n" + "=".repeat(70));
console.log("SUMMARY");
console.log("=".repeat(70));

console.log(`\nTraining convergence:`);
console.log(`   lib/shgat:  loss=${libFinalLoss.toFixed(4)}, acc=${(libFinalAcc * 100).toFixed(1)}%`);
console.log(`   shgat-tf:   loss=${tfFinalLoss.toFixed(4)}, acc=${(tfFinalAcc * 100).toFixed(1)}%`);

console.log(`\nTest MRR:`);
console.log(`   lib/shgat:  ${(libMRR / n).toFixed(3)}`);
console.log(`   shgat-tf:   ${(tfMRR / n).toFixed(3)}`);

if (mrrDiff < 0.05) {
  console.log("\n✅ lib/shgat and shgat-tf are ALIGNED");
} else {
  console.log("\n⚠️ DIVERGENCE DETECTED between lib/shgat and shgat-tf");
}
console.log("=".repeat(70) + "\n");

// ============================================================================
// Deno Benchmarks (Latency)
// ============================================================================

Deno.bench({
  name: "lib/shgat: scoreNodes",
  group: "lib-vs-tf-latency",
  baseline: true,
  fn: () => {
    libSHGAT.scoreNodes(testIntent, 1);
  },
});

Deno.bench({
  name: "shgat-tf AutogradTrainer: score",
  group: "lib-vs-tf-latency",
  fn: () => {
    tfTrainer.score(testIntent, capIds);
  },
});

Deno.bench({
  name: "lib/shgat: trainBatch (32 examples)",
  group: "lib-vs-tf-training",
  baseline: true,
  fn: () => {
    libSHGAT.trainBatchV1KHeadBatched(
      trainingExamples.slice(0, BATCH_SIZE),
      trainingExamples.slice(0, BATCH_SIZE).map(() => 1.0),
      true,
      TEMPERATURE
    );
  },
});

Deno.bench({
  name: "shgat-tf AutogradTrainer: trainBatch (32 examples)",
  group: "lib-vs-tf-training",
  fn: () => {
    tfTrainer.trainBatch(trainingExamples.slice(0, BATCH_SIZE) as TfTrainingExample[]);
  },
});
