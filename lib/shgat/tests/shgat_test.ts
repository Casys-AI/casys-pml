/**
 * SHGAT Core Unit Tests
 *
 * Tests for the main SHGAT class functionality.
 *
 * @module shgat/tests/shgat_test
 */

import { assertEquals, assertExists, assertGreater, assertLess } from "@std/assert";
import { createSHGATFromCapabilities, SHGAT } from "../mod.ts";

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
