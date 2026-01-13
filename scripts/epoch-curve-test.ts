import { createSHGATFromCapabilities, type TrainingExample } from "../src/graphrag/algorithms/shgat.ts";
import { NUM_NEGATIVES } from "../src/graphrag/algorithms/shgat/types.ts";

// Load production data
const data = JSON.parse(await Deno.readTextFile("tests/benchmarks/fixtures/scenarios/production-traces.json"));

const capabilities = data.nodes.capabilities.map((c: any) => ({
  id: c.id,
  embedding: c.embedding,
  toolsUsed: c.toolsUsed,
  successRate: c.successRate,
}));

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

console.log("Training curve (40 epochs) on PRODUCTION DATA:");
console.log("Epoch | Loss   | TrainAcc | TestAcc");
console.log("------|--------|----------|--------");

const shgat = createSHGATFromCapabilities(capabilities);

for (let epoch = 0; epoch < 40; epoch++) {
  const temperature = 0.10 - (0.10 - 0.06) * (epoch / 39);

  // Train one epoch
  const batchSize = 16;
  let epochLoss = 0, epochAcc = 0, batches = 0;

  for (let i = 0; i < train.length; i += batchSize) {
    const batch = train.slice(i, i + batchSize);
    const weights = batch.map(() => 1.0);
    const result = shgat.trainBatchV1KHeadBatched(batch, weights, false, temperature);
    epochLoss += result.loss;
    epochAcc += result.accuracy;
    batches++;
  }

  // Test
  const testResult = shgat.trainBatchV1KHeadBatched(test, test.map(() => 1.0), true, temperature);

  console.log(`${String(epoch+1).padStart(5)} | ${(epochLoss/batches).toFixed(4)} | ${(epochAcc/batches*100).toFixed(1)}%    | ${(testResult.accuracy*100).toFixed(1)}%`);
}
