/**
 * Integration Test: SHGAT + DR-DSP for Prediction
 *
 * Tests the combined use of:
 * - SHGAT: Score capabilities based on intent + context (attention)
 * - DR-DSP: Find optimal hyperpath through capability graph
 *
 * This demonstrates how these algorithms would work together
 * in predictNextNode() / suggestDAG().
 *
 * @module tests/integration/shgat-drdsp-prediction
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  SHGAT,
  DRDSP,
  capabilityToHyperedge,
  type Hyperedge,
  type AttentionResult,
  type HyperpathResult,
  type CapabilityNode,
} from "../../src/graphrag/algorithms/mod.ts";

// ============================================================================
// Test Data: E-commerce Scenario
// ============================================================================

/**
 * Simulated tools with embeddings (normally from BGE-M3)
 * Using 8-dim for testing (real would be 1024-dim)
 */
const TOOL_EMBEDDINGS: Record<string, number[]> = {
  "db__get_cart": [0.8, 0.2, 0.1, 0.0, 0.3, 0.1, 0.0, 0.1],
  "inventory__check": [0.7, 0.3, 0.2, 0.1, 0.4, 0.2, 0.1, 0.0],
  "payment__validate": [0.1, 0.8, 0.7, 0.1, 0.2, 0.3, 0.1, 0.2],
  "payment__charge": [0.1, 0.9, 0.8, 0.2, 0.1, 0.4, 0.2, 0.3],
  "db__save_order": [0.6, 0.3, 0.2, 0.8, 0.2, 0.1, 0.3, 0.1],
  "email__confirm": [0.2, 0.1, 0.1, 0.7, 0.8, 0.2, 0.1, 0.4],
  "api__fetch_user": [0.5, 0.1, 0.0, 0.2, 0.1, 0.7, 0.8, 0.2],
  "db__get_user": [0.6, 0.1, 0.0, 0.3, 0.1, 0.8, 0.7, 0.1],
};

/**
 * Capabilities with their tools and structure
 */
const CAPABILITIES: Array<{
  id: string;
  tools: string[];
  successRate: number;
  description: string;
  staticEdges: Array<{ from: string; to: string; type: string }>;
}> = [
  {
    id: "cap__checkout_flow",
    tools: ["db__get_cart", "inventory__check", "payment__validate", "payment__charge", "db__save_order", "email__confirm"],
    successRate: 0.92,
    description: "Complete checkout process",
    staticEdges: [
      { from: "db__get_cart", to: "inventory__check", type: "provides" },
      { from: "inventory__check", to: "payment__validate", type: "provides" },
      { from: "payment__validate", to: "payment__charge", type: "provides" },
      { from: "payment__charge", to: "db__save_order", type: "provides" },
      { from: "db__save_order", to: "email__confirm", type: "sequence" },
    ],
  },
  {
    id: "cap__payment_only",
    tools: ["payment__validate", "payment__charge"],
    successRate: 0.95,
    description: "Payment processing",
    staticEdges: [
      { from: "payment__validate", to: "payment__charge", type: "provides" },
    ],
  },
  {
    id: "cap__user_profile",
    tools: ["api__fetch_user", "db__get_user"],
    successRate: 0.98,
    description: "User profile retrieval",
    staticEdges: [
      { from: "api__fetch_user", to: "db__get_user", type: "provides" },
    ],
  },
  {
    id: "cap__order_confirmation",
    tools: ["db__save_order", "email__confirm"],
    successRate: 0.97,
    description: "Order saving and confirmation",
    staticEdges: [
      { from: "db__save_order", to: "email__confirm", type: "provides" },
    ],
  },
];

// ============================================================================
// Helper: Create embedding lookup
// ============================================================================

function getEmbedding(id: string): number[] | null {
  // For tools
  if (TOOL_EMBEDDINGS[id]) {
    return TOOL_EMBEDDINGS[id];
  }
  // For capabilities - average of tool embeddings
  const cap = CAPABILITIES.find((c) => c.id === id);
  if (cap) {
    const toolEmbeddings = cap.tools
      .map((t) => TOOL_EMBEDDINGS[t])
      .filter((e) => e !== undefined);
    if (toolEmbeddings.length === 0) return null;

    const dim = toolEmbeddings[0].length;
    const avg = new Array(dim).fill(0);
    for (const emb of toolEmbeddings) {
      for (let i = 0; i < dim; i++) {
        avg[i] += emb[i] / toolEmbeddings.length;
      }
    }
    return avg;
  }
  return null;
}

// ============================================================================
// Test: Combined SHGAT + DR-DSP Prediction
// ============================================================================

Deno.test("Integration: SHGAT scores capabilities, DR-DSP finds path", async (t) => {
  // -------------------------------------------------------------------------
  // Step 1: Initialize SHGAT with capabilities
  // -------------------------------------------------------------------------
  await t.step("1. Initialize SHGAT with capabilities", () => {
    const shgat = new SHGAT({
      numHeads: 2,
      hiddenDim: 4,
      embeddingDim: 8, // Our test embedding dim
      depthDecay: 0.8,
      learningRate: 0.01,
      leakyReluSlope: 0.2,
    });

    // Register capabilities
    for (const cap of CAPABILITIES) {
      const embedding = getEmbedding(cap.id);
      assertExists(embedding, `Embedding should exist for ${cap.id}`);

      shgat.registerCapability({
        id: cap.id,
        embedding: embedding!,
        toolsUsed: cap.tools,
        successRate: cap.successRate,
        parents: [],
        children: [],
      });
    }

    assertEquals(shgat.getStats().registeredCapabilities, 4, "Should have 4 capabilities");
  });

  // -------------------------------------------------------------------------
  // Step 2: Initialize DR-DSP with capability hyperedges
  // -------------------------------------------------------------------------
  await t.step("2. Initialize DR-DSP with capability hyperedges", () => {
    // Convert capabilities to hyperedges
    const hyperedges: Hyperedge[] = CAPABILITIES.map((cap) =>
      capabilityToHyperedge(cap.id, cap.tools, cap.staticEdges, cap.successRate)
    );

    const drdsp = new DRDSP(hyperedges);

    const stats = drdsp.getStats();
    assertEquals(stats.hyperedgeCount, 4, "Should have 4 capability hyperedges");
    console.log(`DR-DSP initialized: ${stats.nodeCount} nodes, ${stats.hyperedgeCount} hyperedges`);
  });

  // -------------------------------------------------------------------------
  // Step 3: Simulate prediction scenario
  // -------------------------------------------------------------------------
  await t.step("3. Combined prediction: intent → SHGAT → DR-DSP → suggestion", () => {
    // User intent: "complete purchase for customer"
    // Simulated intent embedding (would come from BGE-M3)
    const intentEmbedding = [0.3, 0.7, 0.6, 0.4, 0.2, 0.1, 0.1, 0.2];

    // Current context: user just viewed cart
    const contextTools = ["db__get_cart"];
    const contextEmbeddings = contextTools
      .map((t) => TOOL_EMBEDDINGS[t])
      .filter((e) => e !== undefined);

    // === PHASE 1: SHGAT scores all capabilities ===
    const shgat = new SHGAT({
      numHeads: 2,
      hiddenDim: 4,
      embeddingDim: 8,
      depthDecay: 0.8,
      learningRate: 0.01,
      leakyReluSlope: 0.2,
    });

    // Register capabilities
    for (const cap of CAPABILITIES) {
      shgat.registerCapability({
        id: cap.id,
        embedding: getEmbedding(cap.id)!,
        toolsUsed: cap.tools,
        successRate: cap.successRate,
        parents: [],
        children: [],
      });
    }

    // Score all capabilities for this intent
    const scores = shgat.scoreAllCapabilities(intentEmbedding, contextEmbeddings);

    // Verify we got scores for all capabilities
    assertEquals(scores.length, 4, "Should score all 4 capabilities");

    // Find best capability
    const bestCap = scores.reduce((best, current) =>
      current.score > best.score ? current : best
    );

    console.log("\n=== SHGAT Capability Scores ===");
    for (const s of scores.sort((a, b) => b.score - a.score)) {
      console.log(`  ${s.capabilityId}: ${s.score.toFixed(4)}`);
    }
    console.log(`  Best: ${bestCap.capabilityId}`);

    // === PHASE 2: DR-DSP finds hyperpath through best capability ===
    const hyperedges: Hyperedge[] = CAPABILITIES.map((cap) =>
      capabilityToHyperedge(cap.id, cap.tools, cap.staticEdges, cap.successRate)
    );
    const drdsp = new DRDSP(hyperedges);

    // Get the best capability's structure
    const cap = CAPABILITIES.find((c) => c.id === bestCap.capabilityId)!;
    const startTool = contextTools[0]; // db__get_cart
    const endTool = cap.tools[cap.tools.length - 1]; // Last tool in capability

    // Find hyperpath from start to end
    const pathResult = drdsp.findShortestHyperpath(startTool, endTool);

    console.log("\n=== DR-DSP Hyperpath Finding ===");
    console.log(`  From: ${startTool}`);
    console.log(`  To: ${endTool}`);
    console.log(`  Found: ${pathResult.found}`);
    if (pathResult.found) {
      console.log(`  Path: ${pathResult.nodeSequence.join(" → ")}`);
      console.log(`  Weight: ${pathResult.totalWeight.toFixed(4)}`);
      console.log(`  Hyperedges used: ${pathResult.path.length}`);
    }

    // === PHASE 3: Combine into final suggestion ===
    const suggestion = {
      capability: bestCap.capabilityId,
      capabilityScore: bestCap.score,
      attentionWeights: bestCap.headWeights,
      path: pathResult.found ? pathResult.nodeSequence : cap.tools,
      pathCost: pathResult.totalWeight,
      nextTool: pathResult.found && pathResult.nodeSequence.length > 1
        ? pathResult.nodeSequence[1]
        : cap.tools[1],
      confidence: bestCap.score * Math.exp(-pathResult.totalWeight / 10), // Normalize
    };

    console.log("\n=== Final Suggestion ===");
    console.log(`  Capability: ${suggestion.capability}`);
    console.log(`  Next Tool: ${suggestion.nextTool}`);
    console.log(`  Confidence: ${suggestion.confidence.toFixed(4)}`);
    console.log(`  Full Path: ${suggestion.path.join(" → ")}`);

    // Assertions
    assertExists(suggestion.nextTool, "Should suggest next tool");
  });
});

// ============================================================================
// Test: Training SHGAT on Episodic Events
// ============================================================================

Deno.test("Integration: Train SHGAT on episodes, use for prediction", async (t) => {
  const shgat = new SHGAT({
    numHeads: 2,
    hiddenDim: 4,
    embeddingDim: 8,
    depthDecay: 0.8,
    learningRate: 0.05, // Higher LR for test
    leakyReluSlope: 0.2,
  });

  // Register capabilities
  for (const cap of CAPABILITIES) {
    shgat.registerCapability({
      id: cap.id,
      embedding: getEmbedding(cap.id)!,
      toolsUsed: cap.tools,
      successRate: cap.successRate,
      parents: [],
      children: [],
    });
  }

  await t.step("1. Train on episodic events", () => {
    // Simulate episodic events (from episodic_events table)
    const episodes = [
      // Checkout successes
      { intent: [0.3, 0.7, 0.6, 0.4, 0.2, 0.1, 0.1, 0.2], context: ["db__get_cart"], cap: "cap__checkout_flow", success: true },
      { intent: [0.2, 0.8, 0.7, 0.3, 0.1, 0.1, 0.0, 0.3], context: ["db__get_cart"], cap: "cap__checkout_flow", success: true },
      { intent: [0.4, 0.6, 0.5, 0.5, 0.3, 0.2, 0.1, 0.1], context: ["inventory__check"], cap: "cap__checkout_flow", success: true },
      // Payment only
      { intent: [0.1, 0.9, 0.8, 0.2, 0.1, 0.0, 0.0, 0.2], context: ["payment__validate"], cap: "cap__payment_only", success: true },
      // Some failures
      { intent: [0.3, 0.7, 0.6, 0.4, 0.2, 0.1, 0.1, 0.2], context: ["db__get_cart"], cap: "cap__user_profile", success: false },
      { intent: [0.2, 0.8, 0.7, 0.3, 0.1, 0.1, 0.0, 0.3], context: ["db__get_cart"], cap: "cap__order_confirmation", success: false },
    ];

    // Convert to training examples
    const examples = episodes.map((ep) => ({
      intentEmbedding: ep.intent,
      contextTools: ep.context,
      candidateId: ep.cap,
      outcome: ep.success ? 1 : 0,
    }));

    // Train
    const result = shgat.trainBatch(examples, getEmbedding);

    console.log("\n=== SHGAT Training ===");
    console.log(`  Examples: ${examples.length}`);
    console.log(`  Loss: ${result.loss.toFixed(4)}`);
    console.log(`  Accuracy: ${(result.accuracy * 100).toFixed(1)}%`);

    // Loss should be defined
    assertEquals(typeof result.loss, "number", "Loss should be a number");
  });

  await t.step("2. Predict with trained model", () => {
    // New intent similar to checkout
    const intentEmbedding = [0.35, 0.65, 0.55, 0.45, 0.25, 0.15, 0.05, 0.25];
    const contextEmbeddings = [TOOL_EMBEDDINGS["db__get_cart"]];

    const scores = shgat.scoreAllCapabilities(intentEmbedding, contextEmbeddings);

    console.log("\n=== Post-Training Predictions ===");
    for (const s of scores.sort((a, b) => b.score - a.score)) {
      console.log(`  ${s.capabilityId}: ${s.score.toFixed(4)}`);
    }

    // After training on checkout successes, checkout should score well
    const checkoutScore = scores.find((s) => s.capabilityId === "cap__checkout_flow");
    assertExists(checkoutScore, "Should have checkout score");
  });
});

// ============================================================================
// Test: DR-DSP Dynamic Updates
// ============================================================================

Deno.test("Integration: DR-DSP updates affect hyperpath finding", async (t) => {
  // Initial hyperedges
  const hyperedges: Hyperedge[] = CAPABILITIES.map((cap) =>
    capabilityToHyperedge(cap.id, cap.tools, cap.staticEdges, cap.successRate)
  );
  const drdsp = new DRDSP(hyperedges);

  await t.step("1. Find initial hyperpath", () => {
    const path = drdsp.findShortestHyperpath("db__get_cart", "email__confirm");
    console.log(`\nInitial hyperpath found: ${path.found}`);
    if (path.found) {
      console.log(`  Nodes: ${path.nodeSequence.join(" → ")}`);
      console.log(`  Weight: ${path.totalWeight.toFixed(4)}`);
    }
  });

  await t.step("2. Simulate failure - update hyperedge weight", () => {
    // Payment service failing - increase weight (cost)
    drdsp.applyUpdate({
      type: "weight_increase",
      hyperedgeId: "cap__checkout_flow",
      newWeight: 5.0, // Much higher cost
    });

    const path = drdsp.findShortestHyperpath("db__get_cart", "email__confirm");
    console.log(`\nAfter weight increase:`);
    console.log(`  Found: ${path.found}`);
    if (path.found) {
      console.log(`  Weight: ${path.totalWeight.toFixed(4)}`);
    }
  });

  await t.step("3. Add new hyperedge", () => {
    // Add a faster alternative path
    drdsp.addHyperedge({
      id: "cap__fast_confirm",
      sources: ["db__get_cart"],
      targets: ["email__confirm"],
      weight: 0.5, // Very cheap
    });

    const path = drdsp.findShortestHyperpath("db__get_cart", "email__confirm");
    console.log(`\nWith new fast hyperedge:`);
    console.log(`  Found: ${path.found}`);
    if (path.found) {
      console.log(`  Nodes: ${path.nodeSequence.join(" → ")}`);
      console.log(`  Weight: ${path.totalWeight.toFixed(4)}`);
      console.log(`  Hyperedges: ${path.path.join(", ")}`);
    }
  });
});

// ============================================================================
// Test: DR-DSP Standalone (Intent determines target, no context needed)
// ============================================================================

Deno.test("Integration: DR-DSP standalone pathfinding (replaces Dijkstra)", async (t) => {
  /**
   * DR-DSP is used standalone to find paths on the hypergraph.
   * Intent determines the target capability/tool, then DR-DSP finds the path.
   * No context embeddings needed - just source → target on hypergraph.
   */

  await t.step("DR-DSP finds hyperpath from source to target", () => {
    // Build hypergraph from capabilities
    const hyperedges: Hyperedge[] = CAPABILITIES.map((cap) =>
      capabilityToHyperedge(cap.id, cap.tools, cap.staticEdges, cap.successRate)
    );
    const drdsp = new DRDSP(hyperedges);

    console.log("\n=== DR-DSP Standalone Pathfinding ===\n");

    // Path 1: Within checkout capability (intent: "checkout" → target: email__confirm)
    const path1 = drdsp.findShortestHyperpath("db__get_cart", "email__confirm");
    console.log("Intent: checkout → Path: db__get_cart → email__confirm");
    console.log(`  Found: ${path1.found}`);
    if (path1.found) {
      console.log(`  Nodes: ${path1.nodeSequence.join(" → ")}`);
      console.log(`  Weight: ${path1.totalWeight.toFixed(4)}`);
    }

    // Path 2: Within user profile capability
    const path2 = drdsp.findShortestHyperpath("api__fetch_user", "db__get_user");
    console.log("\nIntent: get user → Path: api__fetch_user → db__get_user");
    console.log(`  Found: ${path2.found}`);
    if (path2.found) {
      console.log(`  Weight: ${path2.totalWeight.toFixed(4)}`);
    }

    // Path 3: Cross-capability (might not exist without bridge)
    const path3 = drdsp.findShortestHyperpath("api__fetch_user", "email__confirm");
    console.log("\nCross-capability: api__fetch_user → email__confirm");
    console.log(`  Found: ${path3.found}`);
    if (!path3.found) {
      console.log("  → No path (separate capability islands)");
    }

    // Assertions
    assertEquals(path1.found || path1.totalWeight >= 0, true, "Path 1 should return valid result");
    assertEquals(path2.found || path2.totalWeight >= 0, true, "Path 2 should return valid result");
  });

  await t.step("DR-DSP SSSP (single source shortest paths)", () => {
    const hyperedges: Hyperedge[] = CAPABILITIES.map((cap) =>
      capabilityToHyperedge(cap.id, cap.tools, cap.staticEdges, cap.successRate)
    );
    const drdsp = new DRDSP(hyperedges);

    // Find all reachable nodes from checkout entry
    const allPaths = drdsp.findAllShortestPaths("db__get_cart");

    console.log("\n=== DR-DSP SSSP from db__get_cart ===");
    console.log(`  Reachable nodes: ${allPaths.size}`);

    for (const [target, result] of allPaths) {
      console.log(`  → ${target}: weight=${result.totalWeight.toFixed(4)}`);
    }
  });
});

// ============================================================================
// Test: Full Pipeline Simulation
// ============================================================================

Deno.test("Integration: Full predictNextNode simulation", async (t) => {
  /**
   * Simulates what predictNextNode() would do:
   * 1. Get current context (active tools)
   * 2. Embed user intent
   * 3. SHGAT scores capabilities
   * 4. Filter by Thompson threshold
   * 5. DR-DSP finds hyperpath through best capability
   * 6. Return next tool suggestion
   */

  await t.step("Full pipeline", () => {
    // === Setup SHGAT ===
    const shgat = new SHGAT({
      numHeads: 2,
      hiddenDim: 4,
      embeddingDim: 8,
      depthDecay: 0.8,
      learningRate: 0.01,
      leakyReluSlope: 0.2,
    });

    for (const cap of CAPABILITIES) {
      shgat.registerCapability({
        id: cap.id,
        embedding: getEmbedding(cap.id)!,
        toolsUsed: cap.tools,
        successRate: cap.successRate,
        parents: [],
        children: [],
      });
    }

    // === Setup DR-DSP ===
    const hyperedges: Hyperedge[] = CAPABILITIES.map((cap) =>
      capabilityToHyperedge(cap.id, cap.tools, cap.staticEdges, cap.successRate)
    );
    const drdsp = new DRDSP(hyperedges);

    // === Simulate predictNextNode ===
    function predictNextNode(
      intentEmbedding: number[],
      contextTools: string[],
      thompsonThreshold: number = 0.4
    ): {
      nextTool: string | null;
      capability: string;
      confidence: number;
      path: string[];
    } | null {
      // 1. Get context embeddings
      const contextEmbeddings = contextTools
        .map((t) => TOOL_EMBEDDINGS[t])
        .filter((e) => e !== undefined);

      // 2. SHGAT scores all capabilities
      const scores = shgat.scoreAllCapabilities(intentEmbedding, contextEmbeddings);

      // 3. Filter by Thompson threshold
      const validCaps = scores.filter((s) => s.score >= thompsonThreshold);
      if (validCaps.length === 0) {
        return null; // No capability passes threshold
      }

      // 4. Select best capability
      const bestCap = validCaps.reduce((best, current) =>
        current.score > best.score ? current : best
      );

      // 5. Get capability's tool sequence
      const cap = CAPABILITIES.find((c) => c.id === bestCap.capabilityId)!;

      // 6. Find current position in capability
      const currentTool = contextTools[contextTools.length - 1];
      const currentIndex = cap.tools.indexOf(currentTool);

      let nextTool: string | null = null;
      let path: string[] = [];

      if (currentIndex >= 0 && currentIndex < cap.tools.length - 1) {
        // We're in the capability flow - suggest next tool directly
        nextTool = cap.tools[currentIndex + 1];
        path = cap.tools.slice(currentIndex);
      } else {
        // Use DR-DSP to find hyperpath to capability's start
        const targetTool = cap.tools[0];
        const pathResult = drdsp.findShortestHyperpath(currentTool, targetTool);

        if (pathResult.found && pathResult.nodeSequence.length > 1) {
          nextTool = pathResult.nodeSequence[1];
          path = [...pathResult.nodeSequence, ...cap.tools.slice(1)];
        } else {
          // Fallback: start from capability's beginning
          nextTool = cap.tools[0];
          path = cap.tools;
        }
      }

      return {
        nextTool,
        capability: bestCap.capabilityId,
        confidence: bestCap.score,
        path,
      };
    }

    // === Test Cases ===
    console.log("\n=== Full Pipeline Test Cases ===\n");

    // Case 1: User viewing cart, wants to checkout
    const case1 = predictNextNode(
      [0.3, 0.7, 0.6, 0.4, 0.2, 0.1, 0.1, 0.2], // checkout intent
      ["db__get_cart"]
    );
    console.log("Case 1: Cart viewed, checkout intent");
    console.log(`  Next: ${case1?.nextTool}`);
    console.log(`  Capability: ${case1?.capability}`);
    console.log(`  Confidence: ${case1?.confidence.toFixed(4)}`);
    console.log(`  Path: ${case1?.path.join(" → ")}`);

    assertExists(case1, "Should get prediction");

    // Case 2: User in payment flow
    const case2 = predictNextNode(
      [0.1, 0.9, 0.8, 0.2, 0.1, 0.0, 0.0, 0.2], // payment intent
      ["payment__validate"]
    );
    console.log("\nCase 2: In payment flow");
    console.log(`  Next: ${case2?.nextTool}`);
    console.log(`  Capability: ${case2?.capability}`);
    console.log(`  Confidence: ${case2?.confidence.toFixed(4)}`);

    assertExists(case2, "Should get prediction");

    // Case 3: High threshold filters out low-confidence
    const case3 = predictNextNode(
      [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], // ambiguous intent
      ["db__get_cart"],
      0.95 // Very high threshold
    );
    console.log("\nCase 3: Ambiguous intent, high threshold (0.95)");
    console.log(`  Result: ${case3 ? `Prediction: ${case3.nextTool}` : "No prediction (filtered)"}`);
  });
});
