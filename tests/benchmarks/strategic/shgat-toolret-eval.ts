/**
 * SHGAT evaluation on ToolRet benchmark using lib/shgat
 *
 * ToolRet: 43k tools, 7.6k queries - intent → tool retrieval benchmark
 * Evaluates using nDCG@10 and Recall@10 (standard IR metrics)
 *
 * Usage:
 *   deno run -A tests/benchmarks/strategic/shgat-toolret-eval.ts [--subset SIZE] [--epochs N]
 */

import { createSHGAT, seedRng } from "../../../lib/shgat/mod.ts";
import { initBlasAcceleration } from "../../../lib/shgat/src/utils/math.ts";
import type { Node } from "../../../lib/shgat/src/core/types.ts";
import { pipeline } from "npm:@huggingface/transformers@3";

// Initialize OpenBLAS
await initBlasAcceleration();

const args = Deno.args;
const SUBSET_SIZE = parseInt(args.find(a => a.startsWith("--subset="))?.split("=")[1] || "1000");
const EPOCHS = parseInt(args.find(a => a.startsWith("--epochs="))?.split("=")[1] || "50");
const seed = parseInt(args.find(a => a.startsWith("--seed="))?.split("=")[1] || "42");

seedRng(seed);
console.error(`Config: subset=${SUBSET_SIZE}, epochs=${EPOCHS}, seed=${seed}`);

// Load BGE-M3 embedding model
console.error("Loading BGE-M3 model...");
const embeddingModel = await pipeline("feature-extraction", "Xenova/bge-m3");

async function embed(text: string): Promise<number[]> {
  const output = await embeddingModel(text.slice(0, 500), { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

// Load ToolRet dataset
console.error("Loading ToolRet dataset...");
const dataDir = "./tests/benchmarks/datasets/toolret";
const tools: { id: string; documentation: string; category: string }[] =
  JSON.parse(await Deno.readTextFile(`${dataDir}/tools.json`));
const queries: { id: string; query: string; instruction: string; labels: string; subset: string }[] =
  JSON.parse(await Deno.readTextFile(`${dataDir}/queries.json`));

console.error(`Loaded ${tools.length} tools and ${queries.length} queries`);

// Sample subset for faster evaluation
const sampledTools = tools.sort(() => Math.random() - 0.5).slice(0, SUBSET_SIZE);
const toolIdSet = new Set(sampledTools.map(t => t.id));

// Filter queries that have relevant tools in our subset
const validQueries = queries.filter(q => {
  const labels = JSON.parse(q.labels) as { id: string }[];
  return labels.some(l => toolIdSet.has(l.id));
}).slice(0, Math.min(500, SUBSET_SIZE / 2));

console.error(`Using ${sampledTools.length} tools and ${validQueries.length} queries`);

// Check for cached embeddings
const embeddingsPath = `${dataDir}/embeddings-${SUBSET_SIZE}.json`;
let toolEmbeddings: Map<string, number[]> = new Map();

try {
  const cached = JSON.parse(await Deno.readTextFile(embeddingsPath));
  toolEmbeddings = new Map(Object.entries(cached));
  console.error(`Loaded ${toolEmbeddings.size} cached embeddings`);
} catch {
  console.error("No cached embeddings found, generating...");
}

// Generate embeddings for tools not in cache
console.error("Generating tool embeddings...");
let embeddingsGenerated = 0;
for (let i = 0; i < sampledTools.length; i++) {
  const tool = sampledTools[i];
  if (!toolEmbeddings.has(tool.id)) {
    try {
      const doc = JSON.parse(tool.documentation);
      const text = `${doc.name || ""}: ${doc.description || ""}`.slice(0, 500);
      const emb = await embed(text);
      toolEmbeddings.set(tool.id, emb);
      embeddingsGenerated++;
    } catch {
      // Fallback for malformed documentation
      const emb = await embed(tool.documentation.slice(0, 500));
      toolEmbeddings.set(tool.id, emb);
      embeddingsGenerated++;
    }
    if ((i + 1) % 100 === 0) {
      console.error(`  Embedded ${i + 1}/${sampledTools.length} tools`);
    }
  }
}

if (embeddingsGenerated > 0) {
  console.error(`Generated ${embeddingsGenerated} new embeddings, saving cache...`);
  const cacheObj = Object.fromEntries(toolEmbeddings);
  await Deno.writeTextFile(embeddingsPath, JSON.stringify(cacheObj));
}

// Build SHGAT nodes
// Level 0: Individual tools (leaves)
// Level 1: Tool categories (web, code, customized)
console.error("Building SHGAT graph...");
const nodes: Node[] = [];

// Tool nodes (level 0)
for (const tool of sampledTools) {
  const emb = toolEmbeddings.get(tool.id);
  if (emb) {
    nodes.push({
      id: tool.id,
      embedding: emb,
      children: [],
      level: 0,
    });
  }
}

// Category hyperedges (level 1)
const categories = ["web", "code", "customized"];
for (const category of categories) {
  const catTools = sampledTools.filter(t => t.category === category);
  if (catTools.length > 0) {
    // Compute mean embedding
    const catEmbs = catTools.map(t => toolEmbeddings.get(t.id)!).filter(Boolean);
    const meanEmb = new Array(1024).fill(0);
    for (const emb of catEmbs) {
      for (let d = 0; d < 1024; d++) {
        meanEmb[d] += emb[d] / catEmbs.length;
      }
    }
    nodes.push({
      id: `category-${category}`,
      embedding: meanEmb,
      children: catTools.map(t => t.id),
      level: 1,
    });
  }
}

console.error(`Built graph with ${nodes.length} nodes (${sampledTools.length} tools + ${categories.length} categories)`);

// Create SHGAT
const shgat = createSHGAT(nodes, {
  numHeads: 16,
  hiddenDim: 1024,
  headDim: 64,
  embeddingDim: 1024, // BGE-M3 dimension
  preserveDim: true,
  preserveDimResidual: 0.3,
  dropout: 0.1,
  leakyReluSlope: 0.2,
  learningRate: 0.01,
});

// Parse query labels for training/evaluation
interface QueryWithLabels {
  query: string;
  instruction: string;
  relevantTools: Set<string>;
  queryEmbedding?: number[];
}

console.error("Parsing query labels and generating query embeddings...");
const parsedQueries: QueryWithLabels[] = [];

for (let i = 0; i < validQueries.length; i++) {
  const q = validQueries[i];
  const labels = JSON.parse(q.labels) as { id: string; relevance?: number }[];
  const relevantInSubset = labels.filter(l => toolIdSet.has(l.id));

  if (relevantInSubset.length > 0) {
    const emb = await embed(q.query);
    parsedQueries.push({
      query: q.query,
      instruction: q.instruction,
      relevantTools: new Set(relevantInSubset.map(l => l.id)),
      queryEmbedding: emb,
    });
  }

  if ((i + 1) % 50 === 0) {
    console.error(`  Parsed ${i + 1}/${validQueries.length} queries`);
  }
}

console.error(`Parsed ${parsedQueries.length} valid queries`);

// Split train/test
const shuffled = parsedQueries.sort(() => Math.random() - 0.5);
const splitIdx = Math.floor(shuffled.length * 0.8);
const trainQueries = shuffled.slice(0, splitIdx);
const testQueries = shuffled.slice(splitIdx);

console.error(`Train: ${trainQueries.length}, Test: ${testQueries.length}`);

// Training: Contrastive learning - query should match its relevant tools
if (EPOCHS > 0) {
  console.error(`\nStarting training: ${EPOCHS} epochs...`);
  const BATCH_SIZE = 16;

  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const epochQueries = [...trainQueries].sort(() => Math.random() - 0.5);

    for (let b = 0; b < epochQueries.length; b += BATCH_SIZE) {
      const batch = epochQueries.slice(b, b + BATCH_SIZE);

      const examples = batch.map(q => {
        const relevantArray = Array.from(q.relevantTools);
        const targetTool = relevantArray[Math.floor(Math.random() * relevantArray.length)];

        return {
          intentEmbedding: q.queryEmbedding!,
          contextTools: [] as string[],
          candidateId: targetTool,
          outcome: 1,
        };
      });

      if (examples.length > 0) {
        shgat.trainBatchV1KHeadBatched(examples, examples.map(() => 1.0), false, 0.07);
      }
    }

    if ((epoch + 1) % 10 === 0) {
      console.error(`  Epoch ${epoch + 1}/${EPOCHS}`);
    }
  }
}

// Evaluation: Compute nDCG@10 and Recall@10
console.error("\nEvaluating...");

function computeNDCG(ranked: string[], relevant: Set<string>, k: number = 10): number {
  let dcg = 0;
  for (let i = 0; i < Math.min(k, ranked.length); i++) {
    if (relevant.has(ranked[i])) {
      dcg += 1 / Math.log2(i + 2); // i+2 because positions are 1-indexed in DCG formula
    }
  }

  // Ideal DCG: all relevant items at top
  const idealCount = Math.min(k, relevant.size);
  let idcg = 0;
  for (let i = 0; i < idealCount; i++) {
    idcg += 1 / Math.log2(i + 2);
  }

  return idcg > 0 ? dcg / idcg : 0;
}

function computeRecall(ranked: string[], relevant: Set<string>, k: number = 10): number {
  const topK = new Set(ranked.slice(0, k));
  let hits = 0;
  for (const r of relevant) {
    if (topK.has(r)) hits++;
  }
  return relevant.size > 0 ? hits / relevant.size : 0;
}

let totalNDCG = 0;
let totalRecall = 0;

for (let i = 0; i < testQueries.length; i++) {
  const q = testQueries[i];

  // Score all tools using SHGAT unified API
  const scored = shgat.scoreLeaves(q.queryEmbedding!);
  const rankedToolIds = scored.map(s => s.nodeId);

  const ndcg = computeNDCG(rankedToolIds, q.relevantTools, 10);
  const recall = computeRecall(rankedToolIds, q.relevantTools, 10);

  totalNDCG += ndcg;
  totalRecall += recall;

  if ((i + 1) % 20 === 0) {
    console.error(`  Evaluated ${i + 1}/${testQueries.length}`);
  }
}

const avgNDCG = totalNDCG / testQueries.length;
const avgRecall = totalRecall / testQueries.length;

console.error("\n=== Results ===");
console.error(`nDCG@10:   ${(avgNDCG * 100).toFixed(2)}%`);
console.error(`Recall@10: ${(avgRecall * 100).toFixed(2)}%`);

// Output for automated parsing
console.log(JSON.stringify({
  ndcg10: avgNDCG,
  recall10: avgRecall,
  subset_size: SUBSET_SIZE,
  epochs: EPOCHS,
  num_tools: sampledTools.length,
  num_test_queries: testQueries.length,
}));
