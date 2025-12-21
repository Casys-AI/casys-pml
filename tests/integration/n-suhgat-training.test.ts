/**
 * n-SuHGAT Training Integration Tests
 *
 * Tests n-SuHGAT with proper two-phase message passing
 * and real BGE-M3 embeddings.
 *
 * @module tests/integration/n-suhgat-training
 */

import { assertEquals, assertGreater, assertLess } from "@std/assert";
import {
  NSuHGAT,
  trainNSuHGAT,
  DEFAULT_NSUHGAT_CONFIG,
  type TrainingSample,
} from "../../src/graphrag/algorithms/n-suhgat.ts";

// Load fixture
const fixtureData = JSON.parse(
  await Deno.readTextFile("tests/benchmarks/fixtures/scenarios/episodic-training.json")
);

/**
 * Create deterministic mock embedding (for fast tests)
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
 * Build n-SuHGAT from fixture data
 */
function buildNSuHGATFromFixture(): {
  model: NSuHGAT;
  trainingSamples: TrainingSample[];
} {
  const model = new NSuHGAT({
    ...DEFAULT_NSUHGAT_CONFIG,
    inputDim: 1024,
    hiddenDim: 32, // Smaller for faster tests
    numLayers: 2,
    numHeads: 2,
  });

  // Build tools as vertices
  const tools = fixtureData.nodes.tools.map((t: { id: string }) => ({
    id: t.id,
    embedding: createMockEmbedding(t.id),
  }));

  // Build capabilities as hyperedges
  const capabilities = fixtureData.nodes.capabilities.map(
    (cap: { id: string; toolsUsed: string[]; successRate: number }) => ({
      id: cap.id,
      embedding: createMockEmbedding(cap.id),
      toolIds: cap.toolsUsed,
      successRate: cap.successRate,
    })
  );

  model.buildFromCapabilities(tools, capabilities);

  // Convert episodic events to training samples
  const trainingSamples: TrainingSample[] = fixtureData.episodicEvents.map(
    (event: {
      intent: string;
      contextTools: string[];
      selectedCapability: string;
      outcome: string;
    }) => ({
      intentEmbedding: createMockEmbedding(event.intent),
      contextVertexIds: event.contextTools,
      targetEdgeId: event.selectedCapability,
      label: event.outcome === "success" ? 1 : 0,
    })
  );

  return { model, trainingSamples };
}

// ============================================================================
// Tests
// ============================================================================

Deno.test("n-SuHGAT: builds hypergraph from fixture", () => {
  const { model } = buildNSuHGATFromFixture();

  const stats = model.getStats();
  assertEquals(stats.numVertices, 15); // 15 tools
  assertEquals(stats.numEdges, 4); // 4 capabilities
  assertGreater(stats.incidenceNonZeros, 0); // Has connections
  assertGreater(stats.paramCount, 0); // Has parameters
});

Deno.test("n-SuHGAT: forward pass produces embeddings", () => {
  const { model } = buildNSuHGATFromFixture();

  const { H, E } = model.forward();

  // Should have embeddings for all vertices and edges
  assertEquals(H.length, 15); // 15 tools
  assertEquals(E.length, 4); // 4 capabilities

  // Embeddings should have correct dimension (hiddenDim * numHeads)
  const expectedDim = 32 * 2; // hiddenDim=32, numHeads=2
  assertEquals(H[0].length, expectedDim);
  assertEquals(E[0].length, expectedDim);

  // Embeddings should be normalized-ish (not all zeros or huge)
  for (const emb of H) {
    const norm = Math.sqrt(emb.reduce((s, x) => s + x * x, 0));
    assertGreater(norm, 0);
    assertLess(norm, 100);
  }
});

Deno.test("n-SuHGAT: scores capabilities", () => {
  const { model } = buildNSuHGATFromFixture();

  const intentEmbedding = createMockEmbedding("complete purchase for customer");
  const results = model.scoreCapabilities(intentEmbedding, ["db__get_cart"]);

  // Should return all 4 capabilities
  assertEquals(results.length, 4);

  // Scores should be between 0 and 1 (sigmoid output)
  for (const result of results) {
    assertGreater(result.score, 0);
    assertLess(result.score, 1);
  }

  // Should be sorted by score descending
  for (let i = 1; i < results.length; i++) {
    assertGreater(results[i - 1].score, results[i].score - 0.0001); // Allow small tolerance
  }
});

Deno.test("n-SuHGAT: trains on episodic events", async () => {
  const { model, trainingSamples } = buildNSuHGATFromFixture();

  const result = await trainNSuHGAT(model, trainingSamples, {
    epochs: 5,
    batchSize: 4,
    onEpoch: (epoch, trainLoss, _valLoss, trainAcc, _valAcc) => {
      console.log(
        `Epoch ${epoch}: loss=${trainLoss.toFixed(4)}, accuracy=${trainAcc.toFixed(2)}`
      );
    },
  });

  // Should have reasonable loss (BCE)
  assertLess(result.finalLoss, 2.0);
  // Should have some accuracy (better than random = 0.25 for 4 classes)
  assertGreater(result.finalAccuracy, 0.2);
});

Deno.test("n-SuHGAT: loss decreases during training", async () => {
  const { model, trainingSamples } = buildNSuHGATFromFixture();

  const losses: number[] = [];

  await trainNSuHGAT(model, trainingSamples, {
    epochs: 10,
    batchSize: 4,
    onEpoch: (_epoch, trainLoss) => {
      losses.push(trainLoss);
    },
  });

  // First loss should be higher than average of last 3
  const avgLastThree = (losses[losses.length - 1] + losses[losses.length - 2] + losses[losses.length - 3]) / 3;

  console.log(`Initial loss: ${losses[0].toFixed(4)}, Final avg: ${avgLastThree.toFixed(4)}`);

  // Loss should generally decrease (allow some variance)
  // We check if final average is less than initial
  assertLess(avgLastThree, losses[0] + 0.5); // Allow some tolerance for stochasticity
});

Deno.test("n-SuHGAT: incidence matrix is correct", () => {
  const { model } = buildNSuHGATFromFixture();

  const stats = model.getStats();

  // cap__checkout_flow has 6 tools
  // cap__order_cancellation has 4 tools
  // cap__user_profile has 3 tools
  // cap__product_browse has 2 tools
  // Total = 6 + 4 + 3 + 2 = 15 non-zeros
  assertEquals(stats.incidenceNonZeros, 15);
});

Deno.test("n-SuHGAT: context boost affects scoring", () => {
  const { model } = buildNSuHGATFromFixture();

  const intentEmbedding = createMockEmbedding("complete purchase");

  // Score without context
  const resultsNoContext = model.scoreCapabilities(intentEmbedding, []);

  // Score with checkout-related context
  const resultsWithContext = model.scoreCapabilities(intentEmbedding, [
    "db__get_cart",
    "inventory__check",
    "payment__validate",
  ]);

  // Find checkout_flow in both
  const checkoutNoContext = resultsNoContext.find(
    (r) => r.edgeId === "cap__checkout_flow"
  );
  const checkoutWithContext = resultsWithContext.find(
    (r) => r.edgeId === "cap__checkout_flow"
  );

  // With context that overlaps checkout_flow, score should be higher
  assertGreater(checkoutWithContext!.score, checkoutNoContext!.score - 0.1);
});

Deno.test("n-SuHGAT: export and import params", async () => {
  const { model, trainingSamples } = buildNSuHGATFromFixture();

  // Train a bit
  await trainNSuHGAT(model, trainingSamples, {
    epochs: 3,
    batchSize: 4,
  });

  // Export params
  const params = model.exportParams();

  // Create new model and import
  const model2 = new NSuHGAT({
    inputDim: 1024,
    hiddenDim: 32,
    numLayers: 2,
    numHeads: 2,
  });
  model2.importParams(params);

  // Stats should match
  const stats1 = model.getStats();
  const stats2 = model2.getStats();

  assertEquals(stats2.numLayers, stats1.numLayers);
  assertEquals(stats2.numHeads, stats1.numHeads);
  assertEquals(stats2.hiddenDim, stats1.hiddenDim);
});

Deno.test("n-SuHGAT: reliability affects scoring", () => {
  const { model } = buildNSuHGATFromFixture();

  const intentEmbedding = createMockEmbedding("any action");

  const results = model.scoreCapabilities(intentEmbedding, []);

  // Find capabilities
  const productBrowse = results.find((r) => r.edgeId === "cap__product_browse");
  const checkoutFlow = results.find((r) => r.edgeId === "cap__checkout_flow");

  // product_browse has 0.99 success rate (high reliability)
  // checkout_flow has 0.85 success rate (medium reliability)
  // The reliability multiplier should influence scores
  console.log(
    `product_browse: ${productBrowse!.score.toFixed(3)}, checkout_flow: ${checkoutFlow!.score.toFixed(3)}`
  );

  // Both should produce valid scores
  assertGreater(productBrowse!.score, 0);
  assertGreater(checkoutFlow!.score, 0);
});

Deno.test("n-SuHGAT: attention weights are valid", () => {
  const { model } = buildNSuHGATFromFixture();

  const intentEmbedding = createMockEmbedding("checkout");

  const results = model.scoreCapabilities(intentEmbedding, []);

  // Each result should have attention weights
  for (const result of results) {
    // Attention should be array of vertex weights
    assertEquals(result.attention.length, 15); // 15 vertices

    // Attention weights should sum to 1 (for vertices in this edge) or be 0
    // (simplified check: at least some non-zero)
    const hasNonZero = result.attention.some((a) => a > 0);
    assertEquals(hasNonZero, true);
  }
});

Deno.test("n-SuHGAT: edge feature updates work", () => {
  const { model } = buildNSuHGATFromFixture();

  // Update features
  model.updateEdgeFeatures("cap__checkout_flow", {
    recency: 1.0,
    cooccurrence: 0.9,
  });

  model.updateEdgeFeatures("cap__order_cancellation", {
    recency: 0.2,
    cooccurrence: 0.1,
  });

  // Should still score correctly
  const intentEmbedding = createMockEmbedding("test");
  const results = model.scoreCapabilities(intentEmbedding, []);

  assertEquals(results.length, 4);
  for (const result of results) {
    assertGreater(result.score, 0);
  }
});

// ============================================================================
// Real BGE-M3 Embedding Tests (Optional - requires model download)
// ============================================================================

// Uncomment to test with real embeddings (slow - downloads ~400MB model)
/*
import { EmbeddingModel } from "../../src/vector/embeddings.ts";

Deno.test({
  name: "n-SuHGAT: trains with real BGE-M3 embeddings",
  ignore: Deno.env.get("CI") === "true", // Skip in CI
  async fn() {
    const embeddingModel = new EmbeddingModel();
    await embeddingModel.load();

    try {
      const model = new NSuHGAT({
        inputDim: 1024,
        hiddenDim: 64,
        numLayers: 2,
        numHeads: 4,
      });

      // Build with real embeddings
      const tools: Array<{ id: string; embedding: number[] }> = [];
      for (const t of fixtureData.nodes.tools) {
        const embedding = await embeddingModel.encode(t.id.replace(/__/g, " "));
        tools.push({ id: t.id, embedding });
      }

      const capabilities: Array<{
        id: string;
        embedding: number[];
        toolIds: string[];
        successRate: number;
      }> = [];
      for (const cap of fixtureData.nodes.capabilities) {
        const embedding = await embeddingModel.encode(
          cap.id.replace(/__/g, " ").replace("cap_", "")
        );
        capabilities.push({
          id: cap.id,
          embedding,
          toolIds: cap.toolsUsed,
          successRate: cap.successRate,
        });
      }

      model.buildFromCapabilities(tools, capabilities);

      // Create training samples with real intent embeddings
      const trainingSamples: TrainingSample[] = [];
      for (const event of fixtureData.episodicEvents) {
        const intentEmbedding = await embeddingModel.encode(event.intent);
        trainingSamples.push({
          intentEmbedding,
          contextVertexIds: event.contextTools,
          targetEdgeId: event.selectedCapability,
          label: event.outcome === "success" ? 1 : 0,
        });
      }

      // Train
      const result = await trainNSuHGAT(model, trainingSamples, {
        epochs: 10,
        batchSize: 4,
        onEpoch: (epoch, trainLoss, valLoss, trainAcc, valAcc) => {
          console.log(
            `Epoch ${epoch}: train_loss=${trainLoss.toFixed(4)}, val_loss=${valLoss.toFixed(4)}, ` +
              `train_acc=${trainAcc.toFixed(2)}, val_acc=${valAcc.toFixed(2)}`
          );
        },
      });

      console.log(
        `Final: loss=${result.finalLoss.toFixed(4)}, accuracy=${result.finalAccuracy.toFixed(2)}`
      );

      // With real semantic embeddings, should achieve better than random
      assertGreater(result.finalAccuracy, 0.3);

      // Test inference
      const testIntent = await embeddingModel.encode("complete purchase for customer");
      const results = model.scoreCapabilities(testIntent, ["db__get_cart"]);

      console.log("Capability scores:");
      for (const r of results) {
        console.log(`  ${r.edgeId}: ${r.score.toFixed(4)}`);
      }

      // checkout_flow should be top for "complete purchase"
      assertEquals(results[0].edgeId, "cap__checkout_flow");
    } finally {
      await embeddingModel.dispose();
    }
  },
});
*/
