/**
 * SHGAT evaluation on ToolBench dataset using lib/shgat
 *
 * ToolBench: 88k queries, 10k+ APIs, 3k+ tools, 49 categories
 * Hierarchical structure: Category (L2) → Tool (L1) → API (L0)
 *
 * Evaluates using nDCG@K and Recall@K for hierarchical retrieval
 *
 * Usage:
 *   deno run -A tests/benchmarks/strategic/shgat-toolbench-eval.ts [--subset SIZE] [--epochs N]
 */

import { createSHGAT, seedRng } from "../../../lib/shgat/mod.ts";
import { initBlasAcceleration } from "../../../lib/shgat/src/utils/math.ts";
import type { Node } from "../../../lib/shgat/src/core/types.ts";

// Initialize OpenBLAS
await initBlasAcceleration();

const args = Deno.args;
const SUBSET_SIZE = parseInt(args.find(a => a.startsWith("--subset="))?.split("=")[1] || "5000");
const EPOCHS = parseInt(args.find(a => a.startsWith("--epochs="))?.split("=")[1] || "30");
const seed = parseInt(args.find(a => a.startsWith("--seed="))?.split("=")[1] || "42");
const K = parseInt(args.find(a => a.startsWith("--k="))?.split("=")[1] || "10");

seedRng(seed);
console.error(`Config: subset=${SUBSET_SIZE}, epochs=${EPOCHS}, seed=${seed}, k=${K}`);

// Load ToolBench dataset
console.error("Loading ToolBench dataset...");
const dataDir = "./tests/benchmarks/datasets/toolbench";

interface ToolBenchQuery {
  query_id: string;
  query: string;
  domain: string;
  api_list: Array<{
    category_name: string;
    tool_name: string;
    api_name: string;
    api_description?: string;
  }>;
}

// Parse NPY file (simple float32 array) - returns Float32Array view for efficiency
function parseNpyLazy(buffer: Uint8Array, numQueries: number, embDim: number): Float32Array {
  const headerLen = new DataView(buffer.buffer).getUint16(8, true);
  const dataStart = 10 + headerLen;
  return new Float32Array(buffer.buffer, dataStart, numQueries * embDim);
}

// Load embeddings first (faster than JSON parsing)
console.error("Loading embeddings...");
const embeddingsRaw = await Deno.readFile(`${dataDir}/toolbench-embeddings.npy`);

console.error("Loading queries JSON...");
const queries: ToolBenchQuery[] = JSON.parse(
  await Deno.readTextFile(`${dataDir}/toolbench-queries.json`)
);

const embeddingsFlat = parseNpyLazy(embeddingsRaw, queries.length, 768);
console.error(`Loaded ${queries.length} queries with embeddings`);

// Helper to get embedding for a query index
function getEmbedding(idx: number): number[] {
  const start = idx * 768;
  return Array.from(embeddingsFlat.slice(start, start + 768));
}

// Sample subset FIRST for faster processing
console.error("Sampling subset...");
const sampledIndices = Array.from({ length: queries.length }, (_, i) => i)
  .sort(() => Math.random() - 0.5)
  .slice(0, SUBSET_SIZE);

const sampledQueries = sampledIndices.map(i => ({
  ...queries[i],
  embedding: getEmbedding(i),
}));

console.error(`Sampled ${sampledQueries.length} queries`);

// Build hierarchy ONLY from sampled queries (much faster)
console.error("Building hierarchy from sampled queries...");
interface APINode {
  id: string;
  category: string;
  tool: string;
  api: string;
  description: string;
}

const apiNodes = new Map<string, APINode>();
const toolToApis = new Map<string, Set<string>>();
const categoryToTools = new Map<string, Set<string>>();

for (const q of sampledQueries) {
  for (const api of q.api_list) {
    const apiId = `${api.category_name}::${api.tool_name}::${api.api_name}`;
    const toolId = `${api.category_name}::${api.tool_name}`;

    if (!apiNodes.has(apiId)) {
      apiNodes.set(apiId, {
        id: apiId,
        category: api.category_name,
        tool: api.tool_name,
        api: api.api_name,
        description: api.api_description || "",
      });
    }

    if (!toolToApis.has(toolId)) {
      toolToApis.set(toolId, new Set());
    }
    toolToApis.get(toolId)!.add(apiId);

    if (!categoryToTools.has(api.category_name)) {
      categoryToTools.set(api.category_name, new Set());
    }
    categoryToTools.get(api.category_name)!.add(toolId);
  }
}

console.error(`Hierarchy: ${categoryToTools.size} categories → ${toolToApis.size} tools → ${apiNodes.size} APIs`);

// Collect all APIs referenced in sampled queries
const referencedApis = new Set<string>(apiNodes.keys());
console.error(`Referencing ${referencedApis.size} unique APIs`);

// IMPORTANT: Split train/test BEFORE computing API embeddings
// This ensures test queries don't leak into API embeddings
console.error("Splitting train/test...");
const shuffled = [...sampledQueries].sort(() => Math.random() - 0.5);
const splitIdx = Math.floor(shuffled.length * 0.8);
const trainQueries = shuffled.slice(0, splitIdx);
const testQueries = shuffled.slice(splitIdx);

console.error(`Train: ${trainQueries.length}, Test: ${testQueries.length}`);

// Compute API embeddings ONLY from training queries (no data leakage)
console.error("Computing API embeddings from TRAIN queries only...");
const apiEmbeddings = new Map<string, number[]>();
const apiQueryCounts = new Map<string, number>();

for (const q of trainQueries) {
  for (const api of q.api_list) {
    const apiId = `${api.category_name}::${api.tool_name}::${api.api_name}`;

    if (!apiEmbeddings.has(apiId)) {
      apiEmbeddings.set(apiId, new Array(768).fill(0));
      apiQueryCounts.set(apiId, 0);
    }

    const emb = apiEmbeddings.get(apiId)!;
    for (let d = 0; d < 768; d++) {
      emb[d] += q.embedding[d];
    }
    apiQueryCounts.set(apiId, apiQueryCounts.get(apiId)! + 1);
  }
}

// Normalize API embeddings
for (const [apiId, emb] of apiEmbeddings) {
  const count = apiQueryCounts.get(apiId)!;
  for (let d = 0; d < 768; d++) {
    emb[d] /= count;
  }
}

// Filter test queries to only those with APIs that have embeddings
const validTestQueries = testQueries.filter(q =>
  q.api_list.some(api => {
    const apiId = `${api.category_name}::${api.tool_name}::${api.api_name}`;
    return apiEmbeddings.has(apiId);
  })
);
console.error(`Valid test queries (with known APIs): ${validTestQueries.length}/${validTestQueries.length}`);

// Build SHGAT graph with 3-level hierarchy
console.error("Building SHGAT graph...");
const nodes: Node[] = [];

// Level 0: API nodes (leaves)
for (const [apiId, emb] of apiEmbeddings) {
  nodes.push({
    id: apiId,
    embedding: emb,
    children: [],
    level: 0,
  });
}

// Level 1: Tool hypernodes
for (const [toolId, apis] of toolToApis) {
  const toolApis = Array.from(apis).filter(a => apiEmbeddings.has(a));
  if (toolApis.length === 0) continue;

  // Compute mean embedding
  const meanEmb = new Array(768).fill(0);
  for (const apiId of toolApis) {
    const apiEmb = apiEmbeddings.get(apiId)!;
    for (let d = 0; d < 768; d++) {
      meanEmb[d] += apiEmb[d] / toolApis.length;
    }
  }

  nodes.push({
    id: `tool::${toolId}`,
    embedding: meanEmb,
    children: toolApis,
    level: 1,
  });
}

// Level 2: Category hypernodes
for (const [category, tools] of categoryToTools) {
  const catTools = Array.from(tools).filter(t =>
    nodes.some(n => n.id === `tool::${t}`)
  );
  if (catTools.length === 0) continue;

  // Compute mean embedding from tools
  const meanEmb = new Array(768).fill(0);
  let count = 0;
  for (const toolId of catTools) {
    const toolNode = nodes.find(n => n.id === `tool::${toolId}`);
    if (toolNode) {
      for (let d = 0; d < 768; d++) {
        meanEmb[d] += toolNode.embedding[d];
      }
      count++;
    }
  }
  if (count > 0) {
    for (let d = 0; d < 768; d++) {
      meanEmb[d] /= count;
    }
  }

  nodes.push({
    id: `category::${category}`,
    embedding: meanEmb,
    children: catTools.map(t => `tool::${t}`),
    level: 2,
  });
}

const numApis = nodes.filter(n => n.level === 0).length;
const numTools = nodes.filter(n => n.level === 1).length;
const numCategories = nodes.filter(n => n.level === 2).length;

console.error(`Built graph: ${numCategories} categories (L2) → ${numTools} tools (L1) → ${numApis} APIs (L0)`);
console.error(`Total nodes: ${nodes.length}`);

// Create SHGAT
const shgat = createSHGAT(nodes, {
  numHeads: 16,
  hiddenDim: 768,
  headDim: 48,
  embeddingDim: 768, // ToolBench embedding dimension
  preserveDim: true,
  preserveDimResidual: 0.3,
  dropout: 0.1,
  leakyReluSlope: 0.2,
  learningRate: 0.005,
});

// Train/test already split above - use validTestQueries for evaluation

// Training: Contrastive learning
if (EPOCHS > 0) {
  console.error(`\nStarting training: ${EPOCHS} epochs...`);
  const BATCH_SIZE = 32;

  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const epochQueries = [...trainQueries].sort(() => Math.random() - 0.5);
    let epochLoss = 0;
    let batchCount = 0;

    for (let b = 0; b < epochQueries.length; b += BATCH_SIZE) {
      const batch = epochQueries.slice(b, b + BATCH_SIZE);

      const examples = batch.map(q => {
        // Pick a random target API from the query's api_list
        const targetApi = q.api_list[Math.floor(Math.random() * q.api_list.length)];
        const targetId = `${targetApi.category_name}::${targetApi.tool_name}::${targetApi.api_name}`;

        return {
          intentEmbedding: q.embedding,
          contextTools: [] as string[],
          candidateId: targetId,
          outcome: 1,
        };
      }).filter(e => apiEmbeddings.has(e.candidateId));

      if (examples.length > 0) {
        shgat.trainBatchV1KHeadBatched(
          examples,
          examples.map(() => 1.0),
          false,
          0.07 // temperature
        );
        batchCount++;
      }
    }

    if ((epoch + 1) % 5 === 0 || epoch === 0) {
      console.error(`  Epoch ${epoch + 1}/${EPOCHS}`);
    }
  }
}

// Evaluation: Compute nDCG@K and Recall@K
console.error("\nEvaluating...");

function computeNDCG(ranked: string[], relevant: Set<string>, k: number): number {
  let dcg = 0;
  for (let i = 0; i < Math.min(k, ranked.length); i++) {
    if (relevant.has(ranked[i])) {
      dcg += 1 / Math.log2(i + 2);
    }
  }

  const idealCount = Math.min(k, relevant.size);
  let idcg = 0;
  for (let i = 0; i < idealCount; i++) {
    idcg += 1 / Math.log2(i + 2);
  }

  return idcg > 0 ? dcg / idcg : 0;
}

function computeRecall(ranked: string[], relevant: Set<string>, k: number): number {
  const topK = new Set(ranked.slice(0, k));
  let hits = 0;
  for (const r of relevant) {
    if (topK.has(r)) hits++;
  }
  return relevant.size > 0 ? hits / relevant.size : 0;
}

function computeMRR(ranked: string[], relevant: Set<string>): number {
  for (let i = 0; i < ranked.length; i++) {
    if (relevant.has(ranked[i])) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

// Also compute hierarchical metrics (category/tool level)
let totalNDCG = 0;
let totalRecall = 0;
let totalMRR = 0;
let totalToolRecall = 0;
let totalCategoryRecall = 0;

for (let i = 0; i < validTestQueries.length; i++) {
  const q = validTestQueries[i];

  // Ground truth APIs, tools, categories
  const relevantApis = new Set(q.api_list.map(a =>
    `${a.category_name}::${a.tool_name}::${a.api_name}`
  ));
  const relevantTools = new Set(q.api_list.map(a =>
    `${a.category_name}::${a.tool_name}`
  ));
  const relevantCategories = new Set(q.api_list.map(a => a.category_name));

  // Score all APIs using SHGAT
  const scored = shgat.scoreLeaves(q.embedding);
  const rankedApiIds = scored.map(s => s.nodeId);

  // API-level metrics
  const ndcg = computeNDCG(rankedApiIds, relevantApis, K);
  const recall = computeRecall(rankedApiIds, relevantApis, K);
  const mrr = computeMRR(rankedApiIds, relevantApis);

  // Tool-level: check if predicted APIs belong to relevant tools
  const predictedTools = new Set(rankedApiIds.slice(0, K).map(id => {
    const parts = id.split("::");
    return `${parts[0]}::${parts[1]}`;
  }));
  let toolHits = 0;
  for (const t of relevantTools) {
    if (predictedTools.has(t)) toolHits++;
  }
  const toolRecall = relevantTools.size > 0 ? toolHits / relevantTools.size : 0;

  // Category-level
  const predictedCategories = new Set(rankedApiIds.slice(0, K).map(id => id.split("::")[0]));
  let catHits = 0;
  for (const c of relevantCategories) {
    if (predictedCategories.has(c)) catHits++;
  }
  const catRecall = relevantCategories.size > 0 ? catHits / relevantCategories.size : 0;

  totalNDCG += ndcg;
  totalRecall += recall;
  totalMRR += mrr;
  totalToolRecall += toolRecall;
  totalCategoryRecall += catRecall;

  if ((i + 1) % 100 === 0) {
    console.error(`  Evaluated ${i + 1}/${validTestQueries.length}`);
  }
}

const avgNDCG = totalNDCG / validTestQueries.length;
const avgRecall = totalRecall / validTestQueries.length;
const avgMRR = totalMRR / validTestQueries.length;
const avgToolRecall = totalToolRecall / validTestQueries.length;
const avgCategoryRecall = totalCategoryRecall / validTestQueries.length;

console.error("\n=== Results ===");
console.error(`API-level (L0):`);
console.error(`  nDCG@${K}:   ${(avgNDCG * 100).toFixed(2)}%`);
console.error(`  Recall@${K}: ${(avgRecall * 100).toFixed(2)}%`);
console.error(`  MRR:        ${(avgMRR * 100).toFixed(2)}%`);
console.error(`Hierarchical:`);
console.error(`  Tool Recall@${K} (L1):     ${(avgToolRecall * 100).toFixed(2)}%`);
console.error(`  Category Recall@${K} (L2): ${(avgCategoryRecall * 100).toFixed(2)}%`);

// Output JSON for automated parsing
console.log(JSON.stringify({
  ndcg_k: avgNDCG,
  recall_k: avgRecall,
  mrr: avgMRR,
  tool_recall_k: avgToolRecall,
  category_recall_k: avgCategoryRecall,
  k: K,
  subset_size: SUBSET_SIZE,
  epochs: EPOCHS,
  num_apis: numApis,
  num_tools: numTools,
  num_categories: numCategories,
  num_test_queries: validTestQueries.length,
}));
