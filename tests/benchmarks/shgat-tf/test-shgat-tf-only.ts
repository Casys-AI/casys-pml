/**
 * Test shgat-tf seul
 */
import {
  DEFAULT_SHGAT_CONFIG as TF_CONFIG,
  seedRng as tfSeedRng,
  AutogradTrainer,
  buildGraphStructure,
  initLayersTrainer,
  type TrainingExample,
  type CapabilityInfo,
} from "/home/ubuntu/CascadeProjects/AgentCards/lib/shgat-tf/mod.ts";

import { loadScenario } from "/home/ubuntu/CascadeProjects/AgentCards/tests/benchmarks/fixtures/scenario-loader.ts";

// Init TF with WASM
const tfBackend = await initLayersTrainer();
console.log(`[TF] Backend: ${tfBackend}`);

// Load data
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
const trainingExamples: TrainingExample[] = rawEvents.map((event) => {
  const negatives = allCapIds.filter(id => id !== event.selectedCapability).sort(() => Math.random() - 0.5).slice(0, 10);
  return { intentEmbedding: event.intentEmbedding, contextTools: event.contextTools, candidateId: event.selectedCapability, outcome: event.outcome === "success" ? 1 : 0, negativeCapIds: negatives };
});

console.log("Data:", capabilities.length, "caps,", toolEmbeddings.size, "tools,", trainingExamples.length, "examples");

// Init trainer
tfSeedRng(42);
const nodeEmbeddings = new Map<string, number[]>();
for (const cap of capabilities) nodeEmbeddings.set(cap.id, cap.embedding);
for (const [toolId, emb] of toolEmbeddings) nodeEmbeddings.set(toolId, emb);

// Note: After backward pass fixes (2026-02-03), use lower LR due to stronger gradients
// LR=0.005 gives MRR 0.778, LR=0.05 causes instability
const tfTrainer = new AutogradTrainer(TF_CONFIG, { temperature: 0.07, learningRate: 0.005 });
tfTrainer.setNodeEmbeddings(nodeEmbeddings);

// Build graph (same as lib-vs-tf benchmark)
const capInfos: CapabilityInfo[] = capabilities.map(c => ({ id: c.id, toolsUsed: c.toolsUsed, parents: c.parents, children: c.children }));
const toolIds = Array.from(toolEmbeddings.keys());
const graphStructure = buildGraphStructure(capInfos, toolIds);
tfTrainer.setGraph(graphStructure);

console.log("Graph:", toolIds.length, "tools,", allCapIds.length, "caps, maxLevel=", graphStructure.maxLevel);
console.log("Message passing:", tfTrainer.hasMessagePassing() ? "ENABLED" : "disabled");

// Train
const EPOCHS = 3;
const BATCH_SIZE = 32;

console.log("\nTraining", EPOCHS, "epochs on", trainingExamples.length, "examples...");
const start = Date.now();

for (let epoch = 0; epoch < EPOCHS; epoch++) {
  let epochLoss = 0, epochAcc = 0, batches = 0;
  for (let i = 0; i < trainingExamples.length; i += BATCH_SIZE) {
    const batch = trainingExamples.slice(i, i + BATCH_SIZE);
    if (batch.length === 0) continue;
    const result = tfTrainer.trainBatch(batch);
    epochLoss += result.loss;
    epochAcc += result.accuracy;
    batches++;
  }
  console.log("Epoch", epoch + 1, "- Loss:", (epochLoss / batches).toFixed(4), "Acc:", (epochAcc / batches * 100).toFixed(1) + "%");
}

console.log("Training time:", ((Date.now() - start) / 1000).toFixed(1), "s");

// Test MRR
console.log("\nScoring test queries...");
const capIds = capabilities.map(c => c.id);
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
