/**
 * Quick test: Verify shgat-tf tensor-native scoring works
 */

import { createSHGATFromCapabilities, seedRng, initTensorFlow } from "../../lib/shgat-tf/mod.ts";
import { loadScenario } from "./fixtures/scenario-loader.ts";

// Initialize TensorFlow.js with WASM backend
const backend = await initTensorFlow();
console.log(`TensorFlow.js backend: ${backend}`);

console.log("Loading scenario...");
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
type QueryWithEmb = {
  intent: string;
  intentEmbedding: number[];
  expectedCapability: string;
};

const rawCaps = scenario.nodes.capabilities as CapWithEmb[];
const rawTools = scenario.nodes.tools as unknown as ToolWithEmb[];
const rawQueries = (scenario as { testQueries?: QueryWithEmb[] }).testQueries || [];

const capabilities = rawCaps.map((c) => ({
  id: c.id,
  embedding: c.embedding,
  toolsUsed: c.toolsUsed,
  successRate: c.successRate,
  parents: c.parents || [],
  children: c.children || [],
}));

const toolEmbeddings = new Map<string, number[]>();
for (const t of rawTools) {
  if (t.embedding) {
    toolEmbeddings.set(t.id, t.embedding);
  }
}

console.log(`Loaded: ${capabilities.length} caps, ${toolEmbeddings.size} tools, ${rawQueries.length} queries`);

// Create shgat-tf instance
seedRng(42);
const shgat = createSHGATFromCapabilities(capabilities, toolEmbeddings);

// Warm up
console.log("\nWarm up...");
const warmupQuery = rawQueries[0];
const warmupResult = shgat.scoreNodes(warmupQuery.intentEmbedding, 1);
console.log(`Warmup: ${warmupResult.length} results, top score: ${warmupResult[0]?.score.toFixed(4)}`);

// Benchmark scoring
console.log("\nBenchmarking scoreNodes()...");
const iterations = 10;
const start = performance.now();

for (let i = 0; i < iterations; i++) {
  const query = rawQueries[i % rawQueries.length];
  const results = shgat.scoreNodes(query.intentEmbedding, 1);
  if (i === 0) {
    console.log(`  Query 0: ${results.length} results, top: ${results[0]?.nodeId} (${results[0]?.score.toFixed(4)})`);
  }
}

const elapsed = performance.now() - start;
console.log(`\n✅ ${iterations} scoreNodes() calls in ${elapsed.toFixed(1)}ms`);
console.log(`   Average: ${(elapsed / iterations).toFixed(1)}ms per call`);

// Clean up
shgat.dispose();
console.log("\n✅ dispose() called - tensors freed");
