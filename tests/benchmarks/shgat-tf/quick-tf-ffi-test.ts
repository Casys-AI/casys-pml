/**
 * Quick test for shgat-tf with FFI backend (libtensorflow)
 *
 * This test uses libtensorflow via FFI which has UnsortedSegmentSum,
 * enabling full autograd for tf.gather gradients.
 *
 * Run: deno run --allow-all --unstable-ffi tests/benchmarks/quick-tf-ffi-test.ts
 */
import {
  DEFAULT_SHGAT_CONFIG as TF_CONFIG,
  seedRng as tfSeedRng,
  AutogradTrainer,
  buildGraphStructure,
  type TrainingExample,
  type CapabilityInfo,
} from "../../lib/shgat-tf/mod.ts";

import { tff } from "../../lib/shgat-tf/src/tf/index.ts";
import { loadScenario } from "./fixtures/scenario-loader.ts";

// Check FFI availability
if (!tff.isAvailable()) {
  console.error("[TF-FFI] libtensorflow not available!");
  console.error("Install with: ./lib/shgat-tf/scripts/install-libtensorflow.sh");
  Deno.exit(1);
}

console.log("[TF-FFI] Backend: libtensorflow", tff.version());

// For now, we still use TF.js WASM for the trainer internals
// but the FFI module is available for custom operations
import { initTensorFlow } from "../../lib/shgat-tf/mod.ts";

// Use CPU backend (slower but has UnsortedSegmentSum)
// Or use WASM with sparse MP (default, faster)
const USE_DENSE_AUTOGRAD = Deno.args.includes("--dense");
const tfBackend = await initTensorFlow(USE_DENSE_AUTOGRAD ? "cpu" : "wasm");
console.log("[TF.js] Backend:", tfBackend, USE_DENSE_AUTOGRAD ? "(dense autograd)" : "(sparse MP)");

// Load scenario
const scenario = await loadScenario("production-traces");

type CapWithEmb = { id: string; embedding: number[]; toolsUsed: string[]; successRate: number; parents?: string[]; children?: string[] };
type ToolWithEmb = { id: string; embedding: number[] };
type EventWithEmb = { intent: string; intentEmbedding: number[]; contextTools: string[]; selectedCapability: string; outcome: string };
type QueryWithEmb = { intent: string; intentEmbedding: number[]; expectedCapability: string };

const rawCaps = scenario.nodes.capabilities as CapWithEmb[];
const rawTools = scenario.nodes.tools as unknown as ToolWithEmb[];
const rawEvents = (scenario as { episodicEvents?: EventWithEmb[] }).episodicEvents || [];
const rawQueries = (scenario as { testQueries?: QueryWithEmb[] }).testQueries || [];

const capabilities = rawCaps.map((c) => ({
  id: c.id, embedding: c.embedding, toolsUsed: c.toolsUsed, successRate: c.successRate,
  parents: c.parents || [], children: c.children || [],
}));

const toolEmbeddings = new Map<string, number[]>();
for (const t of rawTools) { if (t.embedding) toolEmbeddings.set(t.id, t.embedding); }

const allCapIds = capabilities.map(c => c.id);
const trainingExamples: TrainingExample[] = rawEvents.slice(0, 50).map((event) => {
  const negatives = allCapIds.filter(id => id !== event.selectedCapability).sort(() => Math.random() - 0.5).slice(0, 5);
  return { intentEmbedding: event.intentEmbedding, contextTools: event.contextTools, candidateId: event.selectedCapability, outcome: event.outcome === "success" ? 1 : 0, negativeCapIds: negatives };
});

console.log("Data:", capabilities.length, "caps,", toolEmbeddings.size, "tools,", trainingExamples.length, "examples");

// Init trainer
tfSeedRng(42);
const tfTrainer = new AutogradTrainer(TF_CONFIG, { temperature: 0.07, learningRate: 0.05 });

// Set sparse/dense mode
if (USE_DENSE_AUTOGRAD) {
  tfTrainer.setSparseMP(false);  // Use dense TF.js autograd
  console.log("[Trainer] Using DENSE autograd (CPU backend, slower but full gradients)");
} else {
  tfTrainer.setSparseMP(true);   // Use sparse JS loops (default)
  console.log("[Trainer] Using SPARSE MP (WASM backend, faster)");
}

const nodeEmbeddings = new Map<string, number[]>();
for (const cap of capabilities) nodeEmbeddings.set(cap.id, cap.embedding);
for (const [toolId, emb] of toolEmbeddings) nodeEmbeddings.set(toolId, emb);
tfTrainer.setNodeEmbeddings(nodeEmbeddings);

// Build graph
const capInfos: CapabilityInfo[] = capabilities.map(c => ({ id: c.id, toolsUsed: c.toolsUsed, parents: c.parents, children: c.children }));
const toolIds = Array.from(toolEmbeddings.keys());
const graphStructure = buildGraphStructure(capInfos, toolIds);
tfTrainer.setGraph(graphStructure);

console.log("Graph:", toolIds.length, "tools,", allCapIds.length, "caps, maxLevel=", graphStructure.maxLevel);
console.log("Message passing:", tfTrainer.hasMessagePassing() ? "ENABLED" : "disabled");

// Train multiple epochs
const EPOCHS = 3;
const BATCH_SIZE = 32;
const allExamples: TrainingExample[] = rawEvents.map((event) => {
  const negatives = allCapIds.filter(id => id !== event.selectedCapability).sort(() => Math.random() - 0.5).slice(0, 10);
  return { intentEmbedding: event.intentEmbedding, contextTools: event.contextTools, candidateId: event.selectedCapability, outcome: event.outcome === "success" ? 1 : 0, negativeCapIds: negatives };
});

console.log("\nTraining", EPOCHS, "epochs on", allExamples.length, "examples...");
const start = Date.now();
let lastLoss = 0, lastAcc = 0;

for (let epoch = 0; epoch < EPOCHS; epoch++) {
  let epochLoss = 0, epochAcc = 0, batches = 0;
  for (let i = 0; i < allExamples.length; i += BATCH_SIZE) {
    const batch = allExamples.slice(i, i + BATCH_SIZE);
    if (batch.length === 0) continue;
    const result = tfTrainer.trainBatch(batch);
    epochLoss += result.loss;
    epochAcc += result.accuracy;
    batches++;
  }
  lastLoss = epochLoss / batches;
  lastAcc = epochAcc / batches;
  console.log("Epoch", epoch + 1, "- Loss:", lastLoss.toFixed(4), "Acc:", (lastAcc * 100).toFixed(1) + "%");
}

const elapsed = Date.now() - start;
console.log("Total training time:", (elapsed / 1000).toFixed(1), "s");

// Score
console.log("\nScoring...");
const capIds = capabilities.map(c => c.id);
const scores = tfTrainer.score(rawQueries[0].intentEmbedding, capIds);
console.log("Top score:", Math.max(...scores).toFixed(4));

// MRR on ALL queries
let mrr = 0, hit1 = 0, hit3 = 0;
for (const q of rawQueries) {
  const s = tfTrainer.score(q.intentEmbedding, capIds);
  const sorted = capIds.map((id, i) => ({ id, score: s[i] })).sort((a, b) => b.score - a.score);
  const rank = sorted.findIndex(x => x.id === q.expectedCapability) + 1;
  if (rank > 0) mrr += 1 / rank;
  if (rank === 1) hit1++;
  if (rank <= 3) hit3++;
}
const n = rawQueries.length;
console.log("MRR:", (mrr / n).toFixed(3), "Hit@1:", (hit1 / n * 100).toFixed(1) + "%", "Hit@3:", (hit3 / n * 100).toFixed(1) + "%");

// Quick FFI test to show UnsortedSegmentSum works
console.log("\n--- FFI UnsortedSegmentSum Test ---");
const data = tff.tensor([[1, 2], [3, 4], [5, 6]], [3, 2]);
const segIds = tff.tensorInt32(new Int32Array([0, 1, 0]), [3]);
const result = tff.unsortedSegmentSum(data, segIds, 2);
console.log("UnsortedSegmentSum result:", result.arraySync());
console.log("Expected: [[6, 8], [3, 4]]");
data.dispose();
segIds.dispose();
result.dispose();
