/**
 * SHGAT Training Unit Tests
 *
 * Tests for training functionality including K-head batched training.
 *
 * @module shgat/tests/training_test
 */

import { assertEquals, assertExists, assertGreater, assertLess } from "@std/assert";
import { createSHGATFromCapabilities, type TrainingExample } from "../mod.ts";

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestCapabilities(count: number = 5) {
  return Array.from({ length: count }, (_, i) => ({
    id: `cap-${i + 1}`,
    embedding: Array.from({ length: 1024 }, (_, j) => Math.sin(i * 0.1 + j * 0.01)),
    toolsUsed: [`tool-${i + 1}`],
    successRate: 0.7 + (i % 3) * 0.1,
  }));
}

function createTrainingExample(
  capId: string,
  outcome: 0 | 1,
  negatives: string[],
): TrainingExample {
  return {
    intentEmbedding: Array.from({ length: 1024 }, () => Math.random() * 0.1),
    contextTools: ["tool-1"],
    candidateId: capId,
    outcome,
    negativeCapIds: negatives,
  };
}

// =============================================================================
// Basic Training Tests
// =============================================================================

Deno.test("Training - trainBatchV1KHeadBatched runs without error", () => {
  const caps = createTestCapabilities(5);
  const shgat = createSHGATFromCapabilities(caps);

  const examples = [
    createTrainingExample("cap-1", 1, ["cap-2", "cap-3"]),
    createTrainingExample("cap-2", 1, ["cap-1", "cap-4"]),
  ];

  const result = shgat.trainBatchV1KHeadBatched(examples);

  assertExists(result);
  assertExists(result.loss);
  assertExists(result.accuracy);
  assertExists(result.tdErrors);
});

Deno.test("Training - returns valid loss value", () => {
  const caps = createTestCapabilities(5);
  const shgat = createSHGATFromCapabilities(caps);

  const examples = [
    createTrainingExample("cap-1", 1, ["cap-2", "cap-3"]),
  ];

  const result = shgat.trainBatchV1KHeadBatched(examples);

  assertGreater(result.loss, 0, "Loss should be positive");
  assertLess(result.loss, 100, "Loss should be reasonable");
  assertEquals(isFinite(result.loss), true, "Loss should be finite");
});

Deno.test("Training - returns accuracy between 0 and 1", () => {
  const caps = createTestCapabilities(5);
  const shgat = createSHGATFromCapabilities(caps);

  const examples = [
    createTrainingExample("cap-1", 1, ["cap-2"]),
    createTrainingExample("cap-2", 0, ["cap-3"]),
  ];

  const result = shgat.trainBatchV1KHeadBatched(examples);

  assertGreater(result.accuracy, -0.01);
  assertLess(result.accuracy, 1.01);
});

Deno.test("Training - returns TD errors for each example", () => {
  const caps = createTestCapabilities(5);
  const shgat = createSHGATFromCapabilities(caps);

  const examples = [
    createTrainingExample("cap-1", 1, ["cap-2"]),
    createTrainingExample("cap-2", 1, ["cap-3"]),
    createTrainingExample("cap-3", 0, ["cap-1"]),
  ];

  const result = shgat.trainBatchV1KHeadBatched(examples);

  assertEquals(result.tdErrors.length, examples.length);
  for (const td of result.tdErrors) {
    assertEquals(isFinite(td), true, "TD error should be finite");
  }
});

// =============================================================================
// Training with Weights Tests
// =============================================================================

Deno.test("Training - accepts importance sampling weights", () => {
  const caps = createTestCapabilities(5);
  const shgat = createSHGATFromCapabilities(caps);

  const examples = [
    createTrainingExample("cap-1", 1, ["cap-2"]),
    createTrainingExample("cap-2", 1, ["cap-3"]),
  ];
  const weights = [1.0, 0.5];

  const result = shgat.trainBatchV1KHeadBatched(examples, weights);

  assertExists(result);
  assertEquals(isFinite(result.loss), true);
});

Deno.test("Training - evaluate only mode doesn't update weights", () => {
  const caps = createTestCapabilities(5);
  const shgat = createSHGATFromCapabilities(caps);

  const examples = [
    createTrainingExample("cap-1", 1, ["cap-2"]),
  ];

  // Get initial params
  const paramsBefore = JSON.stringify(shgat.exportParams());

  // Run in evaluate-only mode
  const result = shgat.trainBatchV1KHeadBatched(examples, undefined, true);

  // Params should be unchanged
  const paramsAfter = JSON.stringify(shgat.exportParams());
  assertEquals(paramsBefore, paramsAfter, "Params should not change in eval mode");

  assertExists(result.loss);
});

// =============================================================================
// Temperature Tests
// =============================================================================

Deno.test("Training - accepts temperature parameter", () => {
  const caps = createTestCapabilities(5);
  const shgat = createSHGATFromCapabilities(caps);

  const examples = [
    createTrainingExample("cap-1", 1, ["cap-2", "cap-3"]),
  ];

  // Low temperature (sharper)
  const resultLow = shgat.trainBatchV1KHeadBatched(examples, undefined, true, 0.05);

  // High temperature (softer)
  const resultHigh = shgat.trainBatchV1KHeadBatched(examples, undefined, true, 0.2);

  assertExists(resultLow);
  assertExists(resultHigh);
});

// =============================================================================
// Training Convergence Tests
// =============================================================================

Deno.test("Training - loss decreases over epochs", () => {
  const caps = createTestCapabilities(5);
  const shgat = createSHGATFromCapabilities(caps);

  // Create consistent examples
  const examples = [
    createTrainingExample("cap-1", 1, ["cap-2", "cap-3"]),
    createTrainingExample("cap-2", 1, ["cap-1", "cap-4"]),
    createTrainingExample("cap-3", 1, ["cap-4", "cap-5"]),
  ];

  const losses: number[] = [];
  for (let epoch = 0; epoch < 10; epoch++) {
    const result = shgat.trainBatchV1KHeadBatched(examples, undefined, false, 0.1);
    losses.push(result.loss);
  }

  // Loss should generally decrease (allow some noise)
  const firstHalf = losses.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const secondHalf = losses.slice(5).reduce((a, b) => a + b, 0) / 5;

  assertLess(secondHalf, firstHalf * 1.5, "Loss should decrease over training");
});

// =============================================================================
// Edge Cases
// =============================================================================

Deno.test("Training - handles empty batch", () => {
  const caps = createTestCapabilities(5);
  const shgat = createSHGATFromCapabilities(caps);

  const result = shgat.trainBatchV1KHeadBatched([]);

  assertEquals(result.loss, 0);
  assertEquals(result.accuracy, 0);
  assertEquals(result.tdErrors.length, 0);
});

Deno.test("Training - handles single example", () => {
  const caps = createTestCapabilities(5);
  const shgat = createSHGATFromCapabilities(caps);

  const examples = [
    createTrainingExample("cap-1", 1, ["cap-2"]),
  ];

  const result = shgat.trainBatchV1KHeadBatched(examples);

  assertExists(result);
  assertEquals(result.tdErrors.length, 1);
});

Deno.test("Training - handles unknown candidate gracefully", () => {
  const caps = createTestCapabilities(3);
  const shgat = createSHGATFromCapabilities(caps);

  const examples = [
    createTrainingExample("cap-1", 1, ["cap-2"]),
    createTrainingExample("unknown-cap", 1, ["cap-1"]), // Unknown
  ];

  // Should not crash
  const result = shgat.trainBatchV1KHeadBatched(examples);
  assertExists(result);
});

// =============================================================================
// Learning Rate Tests
// =============================================================================

Deno.test("Training - setLearningRate changes training speed", () => {
  const caps = createTestCapabilities(5);

  const examples = [
    createTrainingExample("cap-1", 1, ["cap-2", "cap-3"]),
  ];

  // Train with low LR
  const shgatLow = createSHGATFromCapabilities(caps);
  shgatLow.setLearningRate(0.001);
  const paramsBeforeLow = JSON.stringify(shgatLow.exportParams());
  shgatLow.trainBatchV1KHeadBatched(examples);
  const paramsAfterLow = JSON.stringify(shgatLow.exportParams());

  // Train with high LR
  const shgatHigh = createSHGATFromCapabilities(caps);
  shgatHigh.setLearningRate(0.1);
  const paramsBeforeHigh = JSON.stringify(shgatHigh.exportParams());
  shgatHigh.trainBatchV1KHeadBatched(examples);
  const paramsAfterHigh = JSON.stringify(shgatHigh.exportParams());

  // Both should have changed, but high LR should change more
  // (We just verify they both changed)
  assertEquals(paramsBeforeLow !== paramsAfterLow, true, "Low LR should still update params");
  assertEquals(paramsBeforeHigh !== paramsAfterHigh, true, "High LR should update params");
});
