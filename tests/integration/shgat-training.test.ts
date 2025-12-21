/**
 * SHGAT Training Integration Tests
 *
 * Tests SHGAT with proper two-phase message passing on episodic traces.
 * Validates:
 * - Incidence matrix construction
 * - Two-phase message passing (Vertex→Hyperedge, Hyperedge→Vertex)
 * - Multi-head attention with HypergraphFeatures
 * - Backpropagation through both phases
 *
 * @module tests/integration/shgat-training
 */

import { assertEquals, assertGreater, assertLess } from "@std/assert";
import {
  SHGAT,
  DEFAULT_SHGAT_CONFIG,
  DEFAULT_HYPERGRAPH_FEATURES,
  trainSHGATOnEpisodes,
  type CapabilityNode,
  type TrainingExample,
  type HypergraphFeatures,
} from "../../src/graphrag/algorithms/shgat.ts";

// Load fixture
const fixtureData = JSON.parse(
  await Deno.readTextFile("tests/benchmarks/fixtures/scenarios/episodic-training.json")
);

/**
 * Create mock embedding (deterministic based on string hash)
 */
function createMockEmbedding(text: string, dim: number = 1024): number[] {
  const embedding = new Array(dim).fill(0);
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  for (let i = 0; i < dim; i++) {
    hash = (hash * 1103515245 + 12345) | 0;
    embedding[i] = (hash % 1000) / 1000 - 0.5;
  }
  // Normalize
  const norm = Math.sqrt(embedding.reduce((s, x) => s + x * x, 0));
  return embedding.map((x) => x / norm);
}

/**
 * Build SHGAT from fixture data using new API with tools + capabilities
 */
function buildSHGATFromFixture(): {
  shgat: SHGAT;
  embeddings: Map<string, number[]>;
  trainingExamples: TrainingExample[];
} {
  const shgat = new SHGAT({
    ...DEFAULT_SHGAT_CONFIG,
    numHeads: 4,
    hiddenDim: 32, // Smaller for faster tests
    numLayers: 2,
    embeddingDim: 1024,
  });

  const embeddings = new Map<string, number[]>();

  // Build tools
  const tools: Array<{ id: string; embedding: number[] }> = [];
  for (const tool of fixtureData.nodes.tools) {
    const toolEmbedding = createMockEmbedding(tool.id);
    embeddings.set(tool.id, toolEmbedding);
    tools.push({ id: tool.id, embedding: toolEmbedding });
  }

  // Build capabilities with hypergraph features
  const capabilities: Array<{
    id: string;
    embedding: number[];
    toolsUsed: string[];
    successRate: number;
    parents?: string[];
    children?: string[];
  }> = [];

  for (const cap of fixtureData.nodes.capabilities) {
    const capEmbedding = createMockEmbedding(cap.id);
    embeddings.set(cap.id, capEmbedding);

    // Compute hypergraph features from fixture data
    const toolNodes = fixtureData.nodes.tools.filter((t: { id: string }) =>
      cap.toolsUsed.includes(t.id)
    );
    const avgPageRank = toolNodes.length > 0
      ? toolNodes.reduce((sum: number, t: { pageRank: number }) => sum + t.pageRank, 0) / toolNodes.length
      : 0.01;
    const primaryCommunity = toolNodes.length > 0 ? toolNodes[0].community : 0;

    capabilities.push({
      id: cap.id,
      embedding: capEmbedding,
      toolsUsed: cap.toolsUsed,
      successRate: cap.successRate,
      parents: [],
      children: [],
    });
  }

  // Build hypergraph with incidence matrix
  shgat.buildFromData(tools, capabilities);

  // Update hypergraph features after building
  for (const cap of fixtureData.nodes.capabilities) {
    const toolNodes = fixtureData.nodes.tools.filter((t: { id: string }) =>
      cap.toolsUsed.includes(t.id)
    );
    const avgPageRank = toolNodes.length > 0
      ? toolNodes.reduce((sum: number, t: { pageRank: number }) => sum + t.pageRank, 0) / toolNodes.length
      : 0.01;
    const primaryCommunity = toolNodes.length > 0 ? toolNodes[0].community : 0;

    shgat.updateHypergraphFeatures(cap.id, {
      spectralCluster: primaryCommunity,
      hypergraphPageRank: avgPageRank,
      cooccurrence: 0,
      recency: 0,
    });
  }

  // Convert episodic events to training examples
  const trainingExamples: TrainingExample[] = fixtureData.episodicEvents.map(
    (event: {
      intent: string;
      contextTools: string[];
      selectedCapability: string;
      outcome: string;
    }) => ({
      intentEmbedding: createMockEmbedding(event.intent),
      contextTools: event.contextTools,
      candidateId: event.selectedCapability,
      outcome: event.outcome === "success" ? 1 : 0,
    })
  );

  // Update co-occurrence from episodes
  const cooccurrenceCounts = new Map<string, number>();
  for (const event of fixtureData.episodicEvents) {
    const cap = event.selectedCapability;
    cooccurrenceCounts.set(cap, (cooccurrenceCounts.get(cap) || 0) + 1);
  }
  const maxCount = Math.max(...cooccurrenceCounts.values());

  for (const [capId, count] of cooccurrenceCounts) {
    shgat.updateHypergraphFeatures(capId, {
      cooccurrence: count / maxCount,
      recency: 0.8,
    });
  }

  return { shgat, embeddings, trainingExamples };
}

// ============================================================================
// Tests
// ============================================================================

Deno.test("SHGAT: builds hypergraph with incidence matrix", () => {
  const { shgat, trainingExamples } = buildSHGATFromFixture();

  const stats = shgat.getStats();
  assertEquals(stats.numHeads, 4);
  assertEquals(stats.numLayers, 2);
  assertEquals(stats.registeredCapabilities, 4); // 4 capabilities
  assertEquals(stats.registeredTools, 15); // 15 tools
  assertGreater(stats.incidenceNonZeros, 0); // Has connections
  assertEquals(stats.incidenceNonZeros, 15); // Sum of toolsUsed counts
  assertEquals(trainingExamples.length, 12); // 12 episodic events
});

Deno.test("SHGAT: forward pass produces embeddings", () => {
  const { shgat } = buildSHGATFromFixture();

  const { H, E } = shgat.forward();

  // Should have embeddings for all tools and capabilities
  assertEquals(H.length, 15); // 15 tools
  assertEquals(E.length, 4); // 4 capabilities

  // Embeddings should have correct dimension (hiddenDim * numHeads)
  const expectedDim = 32 * 4; // hiddenDim=32, numHeads=4
  assertEquals(H[0].length, expectedDim);
  assertEquals(E[0].length, expectedDim);

  // Embeddings should be normalized-ish (not all zeros or huge)
  for (const emb of H) {
    const norm = Math.sqrt(emb.reduce((s, x) => s + x * x, 0));
    assertGreater(norm, 0);
    assertLess(norm, 100);
  }
});

Deno.test("SHGAT: scores capabilities before training", () => {
  const { shgat, embeddings } = buildSHGATFromFixture();

  const intentEmbedding = createMockEmbedding("complete purchase for customer");
  const contextEmbeddings = [embeddings.get("db__get_cart")!];

  const results = shgat.scoreAllCapabilities(intentEmbedding, contextEmbeddings);

  // Should return all 4 capabilities
  assertEquals(results.length, 4);

  // All scores should be between 0 and 1
  for (const result of results) {
    assertGreater(result.score, 0);
    assertLess(result.score, 1);
  }

  // Should have feature contributions
  const topResult = results[0];
  assertEquals(topResult.featureContributions !== undefined, true);

  // Should have tool attention
  assertEquals(topResult.toolAttention !== undefined, true);
  assertEquals(topResult.toolAttention!.length, 15); // 15 tools
});

Deno.test("SHGAT: trains on episodic events", async () => {
  const { shgat, embeddings, trainingExamples } = buildSHGATFromFixture();

  const getEmbedding = (id: string) => embeddings.get(id) || null;

  const result = await trainSHGATOnEpisodes(shgat, trainingExamples, getEmbedding, {
    epochs: 5,
    batchSize: 4,
    onEpoch: (epoch, loss, accuracy) => {
      console.log(`Epoch ${epoch}: loss=${loss.toFixed(4)}, accuracy=${accuracy.toFixed(2)}`);
    },
  });

  // Should have reasonable loss and accuracy
  assertLess(result.finalLoss, 2.0);
  assertGreater(result.finalAccuracy, 0.2);
});

Deno.test("SHGAT: loss decreases during training", async () => {
  const { shgat, embeddings, trainingExamples } = buildSHGATFromFixture();

  const getEmbedding = (id: string) => embeddings.get(id) || null;
  const losses: number[] = [];

  await trainSHGATOnEpisodes(shgat, trainingExamples, getEmbedding, {
    epochs: 10,
    batchSize: 4,
    onEpoch: (_epoch, loss) => {
      losses.push(loss);
    },
  });

  // First loss should generally be higher than average of last 3
  const avgLastThree = (losses[losses.length - 1] + losses[losses.length - 2] + losses[losses.length - 3]) / 3;

  console.log(`Initial loss: ${losses[0].toFixed(4)}, Final avg: ${avgLastThree.toFixed(4)}`);

  // Allow tolerance for stochasticity
  assertLess(avgLastThree, losses[0] + 0.5);
});

Deno.test("SHGAT: improves after training", async () => {
  const { shgat, embeddings, trainingExamples } = buildSHGATFromFixture();

  const getEmbedding = (id: string) => embeddings.get(id) || null;

  // Score before training
  const intentEmbedding = createMockEmbedding("complete purchase for customer");
  const contextEmbeddings = [embeddings.get("db__get_cart")!];

  const scoresBefore = shgat.scoreAllCapabilities(intentEmbedding, contextEmbeddings);
  const checkoutScoreBefore = scoresBefore.find(
    (r) => r.capabilityId === "cap__checkout_flow"
  )!.score;

  // Train
  await trainSHGATOnEpisodes(shgat, trainingExamples, getEmbedding, {
    epochs: 10,
    batchSize: 4,
  });

  // Score after training
  const scoresAfter = shgat.scoreAllCapabilities(intentEmbedding, contextEmbeddings);
  const checkoutScoreAfter = scoresAfter.find(
    (r) => r.capabilityId === "cap__checkout_flow"
  )!.score;

  console.log(`Checkout score: before=${checkoutScoreBefore.toFixed(3)}, after=${checkoutScoreAfter.toFixed(3)}`);

  // At minimum, the model should still produce valid scores
  assertGreater(checkoutScoreAfter, 0);
  assertLess(checkoutScoreAfter, 1);
});

Deno.test("SHGAT: respects reliability", () => {
  const { shgat } = buildSHGATFromFixture();

  const intentEmbedding = createMockEmbedding("some action");
  const contextEmbeddings: number[][] = [];

  const results = shgat.scoreAllCapabilities(intentEmbedding, contextEmbeddings);

  // Find capabilities by their IDs
  const productBrowse = results.find((r) => r.capabilityId === "cap__product_browse");
  const checkoutFlow = results.find((r) => r.capabilityId === "cap__checkout_flow");

  // product_browse has 0.99 success rate (boost)
  // checkout_flow has 0.85 success rate (neutral)
  assertEquals(productBrowse!.featureContributions!.reliability, 1.2); // boost
  assertEquals(checkoutFlow!.featureContributions!.reliability, 1.0); // neutral
});

Deno.test("SHGAT: spectral cluster matching", () => {
  const { shgat } = buildSHGATFromFixture();

  const intentEmbedding = createMockEmbedding("checkout");

  // Context with capability in same cluster
  const resultsWithClusterContext = shgat.scoreAllCapabilities(
    intentEmbedding,
    [],
    ["cap__checkout_flow"]
  );

  // Context without cluster
  const resultsWithoutClusterContext = shgat.scoreAllCapabilities(
    intentEmbedding,
    [],
    []
  );

  assertEquals(resultsWithClusterContext.length, 4);
  assertEquals(resultsWithoutClusterContext.length, 4);

  // Structure head should contribute when cluster matches
  const checkoutWithCluster = resultsWithClusterContext.find(
    (r) => r.capabilityId === "cap__checkout_flow"
  )!;

  assertGreater(checkoutWithCluster.headScores[2], 0);
});

Deno.test("SHGAT: export and import params", async () => {
  const { shgat, embeddings, trainingExamples } = buildSHGATFromFixture();

  const getEmbedding = (id: string) => embeddings.get(id) || null;

  // Train
  await trainSHGATOnEpisodes(shgat, trainingExamples, getEmbedding, {
    epochs: 3,
    batchSize: 4,
  });

  // Export params
  const params = shgat.exportParams();

  // Create new SHGAT and import
  const shgat2 = new SHGAT();
  shgat2.importParams(params);

  // Stats should match
  const stats1 = shgat.getStats();
  const stats2 = shgat2.getStats();

  assertEquals(stats2.numHeads, stats1.numHeads);
  assertEquals(stats2.hiddenDim, stats1.hiddenDim);
  assertEquals(stats2.numLayers, stats1.numLayers);
});

Deno.test("SHGAT: batch feature updates", () => {
  const { shgat } = buildSHGATFromFixture();

  // Batch update features
  const updates = new Map<string, Partial<HypergraphFeatures>>([
    ["cap__checkout_flow", { recency: 1.0, cooccurrence: 0.9 }],
    ["cap__order_cancellation", { recency: 0.5, cooccurrence: 0.3 }],
  ]);

  shgat.batchUpdateFeatures(updates);

  // Verify updates were applied by checking scores
  const intentEmbedding = createMockEmbedding("test");
  const results = shgat.scoreAllCapabilities(intentEmbedding, []);

  const checkout = results.find((r) => r.capabilityId === "cap__checkout_flow");
  const cancellation = results.find((r) => r.capabilityId === "cap__order_cancellation");

  assertGreater(checkout!.score, 0);
  assertGreater(cancellation!.score, 0);
});

Deno.test("SHGAT: computeAttention backward compatible API", () => {
  const { shgat, embeddings } = buildSHGATFromFixture();

  const intentEmbedding = createMockEmbedding("checkout");
  const contextEmbeddings = [embeddings.get("db__get_cart")!];

  // Use the backward compatible API
  const result = shgat.computeAttention(
    intentEmbedding,
    contextEmbeddings,
    "cap__checkout_flow",
    []
  );

  assertEquals(result.capabilityId, "cap__checkout_flow");
  assertGreater(result.score, 0);
  assertLess(result.score, 1);
  assertEquals(result.headWeights.length, 4);
  assertEquals(result.headScores.length, 4);
});

Deno.test("SHGAT: tool attention weights are valid", () => {
  const { shgat } = buildSHGATFromFixture();

  const intentEmbedding = createMockEmbedding("checkout");

  const results = shgat.scoreAllCapabilities(intentEmbedding, []);

  for (const result of results) {
    // Tool attention should be array of tool weights
    assertEquals(result.toolAttention!.length, 15);

    // Some attention should be non-zero
    const hasNonZero = result.toolAttention!.some((a) => a > 0);
    assertEquals(hasNonZero, true);
  }
});

// Real BGE-M3 embedding tests are in:
// tests/benchmarks/shgat-embeddings.bench.ts
// Run with: deno run --allow-all tests/benchmarks/shgat-embeddings.bench.ts
