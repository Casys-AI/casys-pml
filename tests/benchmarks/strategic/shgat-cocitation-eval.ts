/**
 * SHGAT evaluation on CocitationCora using lib/shgat
 * Called from Python benchmark with seed as argument
 * Outputs accuracy to stdout
 */

import { createSHGAT, seedRng } from "../../../lib/shgat/mod.ts";
import { initBlasAcceleration } from "../../../lib/shgat/src/utils/math.ts";
import type { Node } from "../../../lib/shgat/src/core/types.ts";

// Initialize OpenBLAS
await initBlasAcceleration();

const seed = parseInt(Deno.args[0] || "42");
seedRng(seed);

// Load CocitationCora
const data = JSON.parse(await Deno.readTextFile("./tests/benchmarks/datasets/cocitation-cora/cocitation-cora.json"));

const numNodes = data.num_vertices as number;
// num_classes = 7 for CocitationCora
const features: number[][] = data.features;
const labels: number[] = data.labels;
const hyperedges: number[][] = data.hyperedges;
const trainIdx: number[] = data.train_indices;
const testIdx: number[] = data.test_indices;

// Build unified nodes using the new API:
// - Papers = leaves (children: []) - niveau 0
// - Hyperedges = composites (children: paper ids) - niveau 1
const nodes: Node[] = [];

// Papers as leaf nodes
for (let i = 0; i < numNodes; i++) {
  nodes.push({
    id: `paper-${i}`,
    embedding: features[i],
    children: [],
    level: 0,
  });
}

// Hyperedges as composite nodes
for (let he = 0; he < hyperedges.length; he++) {
  // Compute mean embedding from member papers
  const memberEmbs = hyperedges[he].map(idx => features[idx]);
  const meanEmb = new Array(features[0].length).fill(0);
  for (const emb of memberEmbs) {
    for (let d = 0; d < emb.length; d++) {
      meanEmb[d] += emb[d] / memberEmbs.length;
    }
  }

  nodes.push({
    id: `he-${he}`,
    embedding: meanEmb,
    children: hyperedges[he].map(idx => `paper-${idx}`),
    level: 1,
  });
}

console.error(`Building SHGAT with ${nodes.length} nodes...`);

// Create SHGAT with production config (unified API)
const shgat = createSHGAT(nodes, {
  numHeads: 16,
  hiddenDim: 1024,
  headDim: 64,
  embeddingDim: features[0].length,
  preserveDim: true,
  preserveDimResidual: 0.3,
  dropout: 0.1,
  leakyReluSlope: 0.2,
  learningRate: 0.05,
});

console.error(`SHGAT created. Starting training setup...`);

// Group papers by class for training
const classToPapers: Map<number, number[]> = new Map();
for (let i = 0; i < numNodes; i++) {
  const label = labels[i];
  if (!classToPapers.has(label)) classToPapers.set(label, []);
  classToPapers.get(label)!.push(i);
}

// Train: contrastive learning - same class papers should be similar
// Note: SHGAT training expects candidateId to be a CAPABILITY, not a tool
// We train by using hyperedges that connect same-class papers
const EPOCHS = 200;
const BATCH_SIZE = 32;
const TEST_SAMPLE_SIZE = 200;  // Sample test set for faster evaluation

// Build hyperedge-to-class mapping (majority class of member papers)
const heToClass: number[] = hyperedges.map(paperIndices => {
  const classCounts = new Map<number, number>();
  for (const idx of paperIndices) {
    const c = labels[idx];
    classCounts.set(c, (classCounts.get(c) || 0) + 1);
  }
  let maxClass = 0, maxCount = 0;
  for (const [c, count] of classCounts) {
    if (count > maxCount) { maxClass = c; maxCount = count; }
  }
  return maxClass;
});

// Group hyperedges by class
const classToHe: Map<number, number[]> = new Map();
for (let he = 0; he < hyperedges.length; he++) {
  const c = heToClass[he];
  if (!classToHe.has(c)) classToHe.set(c, []);
  classToHe.get(c)!.push(he);
}

console.error(`Starting training: ${EPOCHS} epochs...`);

for (let epoch = 0; epoch < EPOCHS; epoch++) {
  if (epoch % 50 === 0) console.error(`  Epoch ${epoch}/${EPOCHS}`);
  const shuffled = [...trainIdx].sort(() => Math.random() - 0.5);

  for (let b = 0; b < shuffled.length; b += BATCH_SIZE) {
    const batch = shuffled.slice(b, b + BATCH_SIZE);

    const examples = batch.map(nodeIdx => {
      const nodeClass = labels[nodeIdx];
      // Find a hyperedge dominated by same class
      const sameClassHe = classToHe.get(nodeClass) || [];
      const heIdx = sameClassHe[Math.floor(Math.random() * sameClassHe.length)] ?? 0;

      return {
        intentEmbedding: features[nodeIdx],
        contextTools: [] as string[],
        candidateId: `he-${heIdx}`,  // Target is a capability (hyperedge)
        outcome: 1,
      };
    });

    if (examples.length > 0) {
      shgat.trainBatchV1KHeadBatched(examples, examples.map(() => 1.0), false, 0.07);
    }
  }
}

// Evaluate: kNN classification using SHGAT scores on leaf nodes (papers)
// Sample test set for faster evaluation
const sampledTestIdx = testIdx
  .sort(() => Math.random() - 0.5)
  .slice(0, TEST_SAMPLE_SIZE);

console.error(`Evaluating on ${sampledTestIdx.length} samples...`);
let correct = 0;

for (let i = 0; i < sampledTestIdx.length; i++) {
  const testNodeIdx = sampledTestIdx[i];
  const queryEmb = features[testNodeIdx];
  const trueLabel = labels[testNodeIdx];

  // Score all papers using unified API (level 0 = leaves)
  const scored = shgat.scoreLeaves(queryEmb);

  // Find nearest neighbor (excluding self)
  for (const result of scored) {
    const paperIdx = parseInt(result.nodeId.split("-")[1]);
    if (paperIdx !== testNodeIdx) {
      if (labels[paperIdx] === trueLabel) correct++;
      break;
    }
  }

  if ((i + 1) % 50 === 0) {
    console.error(`  Evaluated ${i + 1}/${sampledTestIdx.length}`);
  }
}

const accuracy = correct / sampledTestIdx.length;
console.log(accuracy.toFixed(6));
