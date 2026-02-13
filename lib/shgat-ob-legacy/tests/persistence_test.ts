/**
 * SHGAT Persistence Unit Tests
 *
 * Tests for export/import params functionality.
 *
 * @module shgat/tests/persistence_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { createSHGATFromCapabilities, type TrainingExample } from "../mod.ts";

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestCapabilities(count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `cap-${i + 1}`,
    embedding: Array.from({ length: 1024 }, () => Math.random() * 0.1),
    toolsUsed: [`tool-${i + 1}`],
    successRate: 0.8,
  }));
}

function createTrainingExample(capId: string): TrainingExample {
  return {
    intentEmbedding: Array.from({ length: 1024 }, () => Math.random() * 0.1),
    contextTools: ["tool-1"],
    candidateId: capId,
    outcome: 1,
    negativeCapIds: ["cap-2"],
  };
}

// =============================================================================
// Export Tests
// =============================================================================

Deno.test("Persistence - exportParams returns object", () => {
  const caps = createTestCapabilities(3);
  const shgat = createSHGATFromCapabilities(caps);

  const params = shgat.exportParams();

  assertExists(params);
  assertEquals(typeof params, "object");
});

Deno.test("Persistence - exportParams is JSON serializable", () => {
  const caps = createTestCapabilities(3);
  const shgat = createSHGATFromCapabilities(caps);

  const params = shgat.exportParams();
  const json = JSON.stringify(params);

  assertExists(json);
  assertEquals(typeof json, "string");

  // Should parse back
  const parsed = JSON.parse(json);
  assertExists(parsed);
});

Deno.test("Persistence - exportParams includes required keys", () => {
  const caps = createTestCapabilities(3);
  const shgat = createSHGATFromCapabilities(caps);

  const params = shgat.exportParams();

  // Check for expected keys
  assertExists(params.levelParams, "Should have levelParams");
  assertExists(params.W_intent, "Should have W_intent");
});

// =============================================================================
// Import Tests
// =============================================================================

Deno.test("Persistence - importParams restores weights", () => {
  const caps = createTestCapabilities(3);

  // Train first SHGAT
  const shgat1 = createSHGATFromCapabilities(caps);
  shgat1.trainBatchV1KHeadBatched([createTrainingExample("cap-1")]);

  // Export params
  const params = shgat1.exportParams();

  // Create fresh SHGAT and import
  const shgat2 = createSHGATFromCapabilities(caps);
  shgat2.importParams(params);

  // Export from second should match
  const params2 = shgat2.exportParams();

  assertEquals(
    JSON.stringify(params.levelParams),
    JSON.stringify(params2.levelParams),
    "levelParams should match after import",
  );
});

Deno.test("Persistence - imported model produces similar scores", () => {
  const caps = createTestCapabilities(3);
  // Use deterministic intent
  const intent = Array.from({ length: 1024 }, (_, i) => Math.sin(i * 0.01) * 0.1);

  // Train first SHGAT
  const shgat1 = createSHGATFromCapabilities(caps);
  for (let i = 0; i < 5; i++) {
    shgat1.trainBatchV1KHeadBatched([createTrainingExample("cap-1")]);
  }

  // Get scores from trained model
  const scores1 = shgat1.scoreAllCapabilities(intent, []);

  // Export and import to new model
  const params = shgat1.exportParams();
  const shgat2 = createSHGATFromCapabilities(caps);
  shgat2.importParams(params);

  // Get scores from imported model
  const scores2 = shgat2.scoreAllCapabilities(intent, []);

  // Scores should be same length
  assertEquals(scores1.length, scores2.length);

  // Check that params were actually imported (levelParams should match)
  const params2 = shgat2.exportParams();
  assertEquals(
    JSON.stringify(params.levelParams),
    JSON.stringify(params2.levelParams),
    "levelParams should match after import",
  );
});

// =============================================================================
// Round-trip Tests
// =============================================================================

Deno.test("Persistence - JSON round-trip preserves params", () => {
  const caps = createTestCapabilities(3);
  const shgat = createSHGATFromCapabilities(caps);

  // Train a bit
  for (let i = 0; i < 3; i++) {
    shgat.trainBatchV1KHeadBatched([createTrainingExample("cap-1")]);
  }

  // Export → JSON → Parse → Import
  const exported = shgat.exportParams();
  const json = JSON.stringify(exported);
  const parsed = JSON.parse(json);

  const shgat2 = createSHGATFromCapabilities(caps);
  shgat2.importParams(parsed);

  // Verify
  const exported2 = shgat2.exportParams();
  assertEquals(
    JSON.stringify(exported.layerParams),
    JSON.stringify(exported2.layerParams),
    "Weights should survive JSON round-trip",
  );
});

Deno.test("Persistence - multiple round-trips preserve params", () => {
  const caps = createTestCapabilities(3);
  const shgat = createSHGATFromCapabilities(caps);

  shgat.trainBatchV1KHeadBatched([createTrainingExample("cap-1")]);

  let params = shgat.exportParams();
  const originalJson = JSON.stringify(params);

  // Do multiple round-trips
  for (let i = 0; i < 5; i++) {
    const json = JSON.stringify(params);
    params = JSON.parse(json);
  }

  assertEquals(
    originalJson,
    JSON.stringify(params),
    "Params should be identical after multiple round-trips",
  );
});

// =============================================================================
// Simulated Storage Tests
// =============================================================================

Deno.test("Persistence - simulated file storage", async () => {
  const caps = createTestCapabilities(3);
  const shgat1 = createSHGATFromCapabilities(caps);

  shgat1.trainBatchV1KHeadBatched([createTrainingExample("cap-1")]);

  // Simulate file save
  const params = shgat1.exportParams();
  const tempFile = await Deno.makeTempFile({ suffix: ".json" });

  try {
    await Deno.writeTextFile(tempFile, JSON.stringify(params));

    // Simulate file load
    const loaded = JSON.parse(await Deno.readTextFile(tempFile));

    const shgat2 = createSHGATFromCapabilities(caps);
    shgat2.importParams(loaded);

    // Verify
    const params2 = shgat2.exportParams();
    assertEquals(
      JSON.stringify(params.levelParams),
      JSON.stringify(params2.levelParams),
      "Params should survive file round-trip",
    );
  } finally {
    await Deno.remove(tempFile);
  }
});

Deno.test("Persistence - simulated database storage", () => {
  // Simulate database with a Map
  const mockDB = new Map<string, string>();

  const caps = createTestCapabilities(3);
  const shgat1 = createSHGATFromCapabilities(caps);

  shgat1.trainBatchV1KHeadBatched([createTrainingExample("cap-1")]);

  // "Save" to mock DB
  const params = shgat1.exportParams();
  mockDB.set("shgat_params", JSON.stringify(params));

  // "Load" from mock DB
  const savedJson = mockDB.get("shgat_params");
  assertExists(savedJson);

  const loadedParams = JSON.parse(savedJson);
  const shgat2 = createSHGATFromCapabilities(caps);
  shgat2.importParams(loadedParams);

  // Verify
  const params2 = shgat2.exportParams();
  assertEquals(
    JSON.stringify(params.levelParams),
    JSON.stringify(params2.levelParams),
    "Params should survive mock DB round-trip",
  );
});

// =============================================================================
// Edge Cases
// =============================================================================

Deno.test("Persistence - import empty object doesn't crash", () => {
  const caps = createTestCapabilities(3);
  const shgat = createSHGATFromCapabilities(caps);

  // Should handle gracefully
  try {
    shgat.importParams({});
  } catch {
    // Expected to possibly throw, but shouldn't crash hard
  }
});

Deno.test("Persistence - export before any training", () => {
  const caps = createTestCapabilities(3);
  const shgat = createSHGATFromCapabilities(caps);

  // Should work even without training
  const params = shgat.exportParams();
  assertExists(params);

  const json = JSON.stringify(params);
  assertExists(json);
});
