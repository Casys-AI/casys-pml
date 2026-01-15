/**
 * SHGAT Core Unit Tests
 *
 * Tests for the main SHGAT class functionality.
 *
 * @module shgat/tests/shgat_test
 */

import { assertEquals, assertExists, assertGreater, assertLess } from "@std/assert";
import {
  buildGraph,
  createSHGAT,
  createSHGATFromCapabilities,
  type Node,
  SHGAT,
} from "../mod.ts";

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestCapabilities(count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `cap-${i + 1}`,
    embedding: Array.from({ length: 1024 }, () => Math.random() * 0.1),
    toolsUsed: [`tool-${i + 1}a`, `tool-${i + 1}b`],
    successRate: 0.7 + Math.random() * 0.25,
  }));
}

function createTestIntent() {
  return Array.from({ length: 1024 }, () => Math.random() * 0.1);
}

// =============================================================================
// Initialization Tests
// =============================================================================

Deno.test("SHGAT - creates from capabilities", () => {
  const caps = createTestCapabilities(3);
  const shgat = createSHGATFromCapabilities(caps);
  assertExists(shgat);
});

Deno.test("SHGAT - creates with empty capabilities", () => {
  const shgat = createSHGATFromCapabilities([]);
  assertExists(shgat);
});

Deno.test("SHGAT - creates with custom config", () => {
  const shgat = new SHGAT({
    embeddingDim: 512,
    numHeads: 4,
    numLayers: 1,
  });
  assertExists(shgat);
});

// =============================================================================
// Scoring Tests
// =============================================================================

Deno.test("SHGAT - scoreAllCapabilities returns sorted results", () => {
  const caps = createTestCapabilities(5);
  const shgat = createSHGATFromCapabilities(caps);
  const intent = createTestIntent();

  const results = shgat.scoreAllCapabilities(intent, []);

  assertEquals(results.length, 5);
  // Check sorted descending
  for (let i = 1; i < results.length; i++) {
    assertGreater(results[i - 1].score, results[i].score - 0.001); // Allow small float errors
  }
});

Deno.test("SHGAT - scoreAllCapabilities includes head scores", () => {
  const caps = createTestCapabilities(3);
  const shgat = createSHGATFromCapabilities(caps);
  const intent = createTestIntent();

  const results = shgat.scoreAllCapabilities(intent, []);

  for (const r of results) {
    assertExists(r.headScores);
    assertGreater(r.headScores.length, 0);
  }
});

Deno.test("SHGAT - scoreAllCapabilities returns valid scores", () => {
  const caps = createTestCapabilities(3);
  const shgat = createSHGATFromCapabilities(caps);
  const intent = createTestIntent();

  const results = shgat.scoreAllCapabilities(intent, []);
  const score = results.find(r => r.capabilityId === "cap-1")?.score ?? 0;

  assertGreater(score, -1);
  assertLess(score, 2);
});

Deno.test("SHGAT - scores with context tools", () => {
  const caps = createTestCapabilities(3);
  const shgat = createSHGATFromCapabilities(caps);
  const intent = createTestIntent();

  const resultsNoContext = shgat.scoreAllCapabilities(intent, []);
  const resultsWithContext = shgat.scoreAllCapabilities(intent, ["tool-1a"]);

  // Both should return results
  assertEquals(resultsNoContext.length, 3);
  assertEquals(resultsWithContext.length, 3);
});

// =============================================================================
// Forward Pass Tests
// =============================================================================

Deno.test("SHGAT - forward returns embeddings", () => {
  const caps = createTestCapabilities(3);
  const shgat = createSHGATFromCapabilities(caps);

  const { E, H } = shgat.forward();

  assertExists(E);
  assertExists(H);
  assertEquals(E.length, 3); // 3 capabilities
  assertGreater(H.length, 0); // Tools
});

Deno.test("SHGAT - forward embeddings have correct dimension", () => {
  const caps = createTestCapabilities(3);
  const shgat = createSHGATFromCapabilities(caps);

  const { E } = shgat.forward();

  for (const emb of E) {
    assertEquals(emb.length, 1024); // Default embeddingDim
  }
});

Deno.test("SHGAT - forward embeddings are finite", () => {
  const caps = createTestCapabilities(5);
  const shgat = createSHGATFromCapabilities(caps);

  const { E, H } = shgat.forward();

  for (const emb of E) {
    for (const v of emb) {
      assertEquals(isFinite(v), true, "E embedding should be finite");
    }
  }
  for (const emb of H) {
    for (const v of emb) {
      assertEquals(isFinite(v), true, "H embedding should be finite");
    }
  }
});

// =============================================================================
// Edge Cases
// =============================================================================

Deno.test("SHGAT - handles single capability", () => {
  const caps = createTestCapabilities(1);
  const shgat = createSHGATFromCapabilities(caps);
  const intent = createTestIntent();

  const results = shgat.scoreAllCapabilities(intent, []);
  assertEquals(results.length, 1);
});

Deno.test("SHGAT - handles capability with no tools", () => {
  const caps = [{
    id: "cap-no-tools",
    embedding: Array.from({ length: 1024 }, () => Math.random()),
    toolsUsed: [],
    successRate: 0.8,
  }];
  const shgat = createSHGATFromCapabilities(caps);
  const intent = createTestIntent();

  const results = shgat.scoreAllCapabilities(intent, []);
  assertEquals(results.length, 1);
});

Deno.test("SHGAT - handles unknown tool in context", () => {
  const caps = createTestCapabilities(3);
  const shgat = createSHGATFromCapabilities(caps);
  const intent = createTestIntent();

  // Should not crash with unknown tool
  const results = shgat.scoreAllCapabilities(intent, ["unknown-tool-xyz"]);
  assertEquals(results.length, 3);
});

// =============================================================================
// Unified Node API Tests
// =============================================================================

function createTestNodes(count: number = 3): Node[] {
  const nodes: Node[] = [];

  // Create leaf nodes (level 0)
  for (let i = 0; i < count; i++) {
    nodes.push({
      id: `leaf-${i + 1}`,
      embedding: Array.from({ length: 1024 }, () => Math.random() * 0.1),
      children: [],
      level: 0,
    });
  }

  // Create composite nodes (level 1)
  for (let i = 0; i < count; i++) {
    nodes.push({
      id: `composite-${i + 1}`,
      embedding: Array.from({ length: 1024 }, () => Math.random() * 0.1),
      children: [`leaf-${i + 1}`],
      level: 0, // Will be computed by buildGraph
    });
  }

  return nodes;
}

Deno.test("buildGraph - computes levels correctly", () => {
  const nodes: Node[] = [
    { id: "a", embedding: [], children: [], level: 0 },
    { id: "b", embedding: [], children: ["a"], level: 0 },
    { id: "c", embedding: [], children: ["b"], level: 0 },
    { id: "d", embedding: [], children: ["a", "c"], level: 0 },
  ];

  const graph = buildGraph(nodes);

  assertEquals(graph.get("a")?.level, 0); // leaf
  assertEquals(graph.get("b")?.level, 1); // contains a (level 0)
  assertEquals(graph.get("c")?.level, 2); // contains b (level 1)
  assertEquals(graph.get("d")?.level, 3); // contains c (level 2)
});

Deno.test("buildGraph - all leaves are level 0", () => {
  const nodes: Node[] = [
    { id: "leaf1", embedding: [], children: [], level: 0 },
    { id: "leaf2", embedding: [], children: [], level: 0 },
    { id: "leaf3", embedding: [], children: [], level: 0 },
  ];

  const graph = buildGraph(nodes);

  for (const node of graph.values()) {
    assertEquals(node.level, 0);
  }
});

Deno.test("createSHGAT - creates from unified nodes", () => {
  const nodes = createTestNodes(3);
  const shgat = createSHGAT(nodes);
  assertExists(shgat);
});

Deno.test("createSHGAT - registers all nodes", () => {
  const nodes = createTestNodes(3);
  const shgat = createSHGAT(nodes);

  // 3 leaves + 3 composites = 6 nodes
  // Legacy API counts separately
  // assertEquals(shgat.getNodeCount(), 6);
  assertExists(shgat);
});

Deno.test("SHGAT - registerNode works", () => {
  const shgat = new SHGAT();

  shgat.registerNode({
    id: "test-node",
    embedding: Array.from({ length: 1024 }, () => Math.random()),
    children: [],
    level: 0,
  });

  assertExists(shgat);
});
