/**
 * Quick test for sparse MP - minimal example
 */
import {
  DEFAULT_SHGAT_CONFIG as TF_CONFIG,
  seedRng as tfSeedRng,
  AutogradTrainer,
  initTensorFlow,
  buildGraphStructure,
  type TrainingExample,
  type CapabilityInfo,
} from "../../lib/shgat-tf/mod.ts";

console.log("Initializing TF.js (WASM)...");
const tfBackend = await initTensorFlow("wasm");
console.log("[TF.js] Backend:", tfBackend);

// Create test data - larger but still manageable
const embDim = 1024;
const numTools = 50;   // Reduced from 675
const numCaps = 20;    // Reduced from 123

function randomEmb(): number[] {
  return Array.from({ length: embDim }, () => Math.random() - 0.5);
}

// Create tools and caps
const toolIds = Array.from({ length: numTools }, (_, i) => `tool_${i}`);
const capIds = Array.from({ length: numCaps }, (_, i) => `cap_${i}`);

const nodeEmbeddings = new Map<string, number[]>();
for (const id of toolIds) nodeEmbeddings.set(id, randomEmb());
for (const id of capIds) nodeEmbeddings.set(id, randomEmb());

// Create cap infos (each cap uses 2 tools)
const capInfos: CapabilityInfo[] = capIds.map((id, i) => ({
  id,
  toolsUsed: [toolIds[i * 2 % numTools], toolIds[(i * 2 + 1) % numTools]],
  level: 0,
}));

console.log("Building graph...");
const graphStructure = buildGraphStructure(capInfos, toolIds);
console.log("Graph built: tools=", graphStructure.toolIds.length, "maxLevel=", graphStructure.maxLevel);

// Create training examples
const examples: TrainingExample[] = Array.from({ length: 32 }, (_, i) => ({
  intentEmbedding: randomEmb(),
  contextTools: [],
  candidateId: capIds[i % numCaps],
  outcome: 1,
  negativeCapIds: capIds.filter(id => id !== capIds[i % numCaps]).slice(0, 5),
}));

// Init trainer with sparse MP (default)
tfSeedRng(42);
const trainer = new AutogradTrainer(TF_CONFIG, { temperature: 0.07, learningRate: 0.01 }, 1);
trainer.setNodeEmbeddings(nodeEmbeddings);
trainer.setGraph(graphStructure);

console.log("Message passing:", trainer.hasMessagePassing() ? "ENABLED" : "disabled");

// Train 1 batch
console.log("\nTraining 1 batch with sparse MP...");
const start = Date.now();
const metrics = trainer.trainBatch(examples);
const elapsed = Date.now() - start;

console.log("Batch time:", elapsed, "ms");
console.log("Loss:", metrics.loss.toFixed(4));
console.log("Accuracy:", (metrics.accuracy * 100).toFixed(1) + "%");
console.log("Gradient norm:", metrics.gradientNorm.toFixed(4));

// Score
console.log("\nScoring...");
const scores = trainer.score(randomEmb(), capIds);
console.log("Scores:", scores.map(s => s.toFixed(3)).join(", "));

console.log("\nTest completed!");
trainer.dispose();
