/**
 * Export benchmark data for PyTorch Geometric comparison
 *
 * Run: deno run --allow-all tests/benchmarks/strategic/export-benchmark-data.ts
 */

import { loadScenario } from "../fixtures/scenario-loader.ts";

console.log("📦 Loading production-traces scenario...");
const scenario = await loadScenario("production-traces");

type CapWithEmb = {
  id: string;
  embedding: number[];
  toolsUsed: string[];
  successRate: number;
};
type ToolWithEmb = { id: string; embedding: number[] };
type EventWithEmb = {
  intentEmbedding: number[];
  contextTools: string[];
  selectedCapability: string;
  outcome: string;
};
type QueryWithEmb = {
  intentEmbedding: number[];
  expectedCapability: string;
};

const rawCaps = scenario.nodes.capabilities as CapWithEmb[];
const rawTools = scenario.nodes.tools as unknown as ToolWithEmb[];
const rawEvents = (scenario as { episodicEvents?: EventWithEmb[] }).episodicEvents || [];
const rawQueries = (scenario as { testQueries?: QueryWithEmb[] }).testQueries || [];

// Build graph structure
const capIds = rawCaps.map(c => c.id);
const capIdToIdx = new Map(capIds.map((id, idx) => [id, idx]));

const toolIds: string[] = [];
const toolIdToIdx = new Map<string, number>();
for (const t of rawTools) {
  if (t.embedding) {
    toolIdToIdx.set(t.id, toolIds.length);
    toolIds.push(t.id);
  }
}

// Build edges: capability -> tool (bipartite graph)
const edges: [number, number][] = [];
for (const cap of rawCaps) {
  const capIdx = capIdToIdx.get(cap.id)!;
  for (const toolId of cap.toolsUsed) {
    const toolIdx = toolIdToIdx.get(toolId);
    if (toolIdx !== undefined) {
      // capability node index, tool node index (offset by num caps)
      edges.push([capIdx, rawCaps.length + toolIdx]);
      edges.push([rawCaps.length + toolIdx, capIdx]); // bidirectional
    }
  }
}

// Node features: [capabilities, tools]
const nodeFeatures: number[][] = [
  ...rawCaps.map(c => c.embedding),
  ...toolIds.map(id => rawTools.find(t => t.id === id)!.embedding),
];

// Training examples
const trainingExamples = rawEvents.map(e => ({
  intentEmbedding: e.intentEmbedding,
  capabilityIdx: capIdToIdx.get(e.selectedCapability) ?? -1,
  outcome: e.outcome === "success" ? 1 : 0,
})).filter(e => e.capabilityIdx >= 0);

// Test queries
const testQueries = rawQueries.map(q => ({
  intentEmbedding: q.intentEmbedding,
  expectedCapabilityIdx: capIdToIdx.get(q.expectedCapability) ?? -1,
})).filter(q => q.expectedCapabilityIdx >= 0);

const exportData = {
  numCapabilities: rawCaps.length,
  numTools: toolIds.length,
  numNodes: nodeFeatures.length,
  embDim: nodeFeatures[0]?.length || 1024,
  capIds,
  toolIds,
  nodeFeatures,
  edges,
  trainingExamples,
  testQueries,
  config: {
    hiddenDim: 1024,
    numHeads: 16,
    temperature: 0.07,
    lr: 0.05,
    epochs: 10,
    batchSize: 32,
  },
};

const outputPath = "tests/benchmarks/strategic/benchmark-data.json";
await Deno.writeTextFile(outputPath, JSON.stringify(exportData));

console.log(`✅ Exported to ${outputPath}`);
console.log(`   Capabilities: ${rawCaps.length}`);
console.log(`   Tools: ${toolIds.length}`);
console.log(`   Nodes: ${nodeFeatures.length}`);
console.log(`   Edges: ${edges.length}`);
console.log(`   Training examples: ${trainingExamples.length}`);
console.log(`   Test queries: ${testQueries.length}`);
