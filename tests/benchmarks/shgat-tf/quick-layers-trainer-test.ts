/**
 * Quick test for LayersTrainer (tf.layers.* + model.trainOnBatch)
 *
 * Run: deno run --allow-all tests/benchmarks/quick-layers-trainer-test.ts
 */
import {
  DEFAULT_SHGAT_CONFIG,
  LayersTrainer,
  initLayersTrainer,
  seedRng,
  type TrainingExample,
} from "../../lib/shgat-tf/mod.ts";

// Initialize
console.log("Initializing LayersTrainer...");
const backend = await initLayersTrainer();
console.log("Backend:", backend);

// Seed for reproducibility
seedRng(42);

// Create trainer
const config = { ...DEFAULT_SHGAT_CONFIG };
const trainer = new LayersTrainer(config, {
  learningRate: 0.01,
  temperature: 0.07,
});

// Create fake embeddings
const embDim = config.embeddingDim;
const nodeEmbeddings = new Map<string, number[]>();

// 10 fake capabilities
for (let i = 0; i < 10; i++) {
  const emb = new Array(embDim).fill(0).map(() => Math.random() - 0.5);
  nodeEmbeddings.set(`cap_${i}`, emb);
}

trainer.setNodeEmbeddings(nodeEmbeddings);

// Model summary
console.log("\nModel architecture:");
trainer.summary();

// Create training examples
const examples: TrainingExample[] = [];
for (let i = 0; i < 32; i++) {
  const intentEmb = new Array(embDim).fill(0).map(() => Math.random() - 0.5);
  const positiveIdx = i % 10;
  const negatives = Array.from({ length: 5 }, (_, j) => `cap_${(positiveIdx + j + 1) % 10}`);

  examples.push({
    intentEmbedding: intentEmb,
    candidateId: `cap_${positiveIdx}`,
    negativeCapIds: negatives,
    contextTools: [],
    outcome: 1,
  });
}

// Train
console.log("\nTraining 5 epochs...");
for (let epoch = 0; epoch < 5; epoch++) {
  const metrics = await trainer.trainBatch(examples);
  console.log(`Epoch ${epoch + 1}: loss=${metrics.loss.toFixed(4)}, acc=${(metrics.accuracy * 100).toFixed(1)}%`);
}

// Score
console.log("\nScoring...");
const testIntent = new Array(embDim).fill(0).map(() => Math.random() - 0.5);
const scores = trainer.score(testIntent, ["cap_0", "cap_1", "cap_2"]);
console.log("Scores:", scores.map(s => s.toFixed(3)));

// Cleanup
trainer.dispose();

console.log("\n✅ LayersTrainer test complete!");
