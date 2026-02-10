/**
 * TD Error Unit Tests
 *
 * Tests for TD error calculation and priority computation.
 * Run with: npx tsx --test src/training/__tests__/td-error.test.ts
 *
 * Note: calculateTDError and calculateBatchTDErrors require a full
 * CompactInformedGRU model — those are integration tests.
 * This file covers the pure function tdErrorFromProbability and constants.
 *
 * @module gru/training/__tests__/td-error
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  tdErrorFromProbability,
  COLD_START_PRIORITY,
  MIN_PRIORITY,
  MAX_PRIORITY,
} from "../td-error.ts";

/** Assert two numbers are approximately equal within tolerance. */
function assertAlmostEquals(actual: number, expected: number, tolerance: number) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

describe("TD Error constants", () => {
  it("COLD_START_PRIORITY is 0.5", () => {
    assert.equal(COLD_START_PRIORITY, 0.5);
  });

  it("MIN_PRIORITY < MAX_PRIORITY", () => {
    assert.ok(MIN_PRIORITY < MAX_PRIORITY);
  });

  it("MIN_PRIORITY is positive", () => {
    assert.ok(MIN_PRIORITY > 0);
  });
});

describe("tdErrorFromProbability", () => {
  it("high predicted probability yields low TD error", () => {
    const result = tdErrorFromProbability(0.8);
    assertAlmostEquals(result.tdError, 0.2, 1e-6);
    assertAlmostEquals(result.priority, 0.2, 1e-6);
    assert.equal(result.predicted, 0.8);
    assert.equal(result.actual, 1.0);
  });

  it("zero predicted probability yields max TD error", () => {
    const result = tdErrorFromProbability(0.0);
    assertAlmostEquals(result.tdError, 1.0, 1e-6);
    assertAlmostEquals(result.priority, 1.0, 1e-6);
  });

  it("perfect prediction yields minimal priority", () => {
    const result = tdErrorFromProbability(1.0);
    assertAlmostEquals(result.tdError, 0.0, 1e-6);
    // priority = max(MIN_PRIORITY, |0|) = MIN_PRIORITY
    assert.equal(result.priority, MIN_PRIORITY);
  });

  it("custom actual value (0.0 = incorrect prediction)", () => {
    const result = tdErrorFromProbability(0.8, 0.0);
    // tdError = 0.0 - 0.8 = -0.8
    assertAlmostEquals(result.tdError, -0.8, 1e-6);
    // priority = |tdError| = 0.8
    assertAlmostEquals(result.priority, 0.8, 1e-6);
    assert.equal(result.actual, 0.0);
  });

  it("priority is clamped to [MIN_PRIORITY, MAX_PRIORITY]", () => {
    // Very close to actual: |1.0 - 0.999| = 0.001 < MIN_PRIORITY
    const result = tdErrorFromProbability(0.999);
    assert.equal(result.priority, MIN_PRIORITY);

    // Exactly wrong: |1.0 - 0.0| = 1.0 = MAX_PRIORITY
    const result2 = tdErrorFromProbability(0.0);
    assert.equal(result2.priority, MAX_PRIORITY);
  });

  it("moderate prediction yields moderate priority", () => {
    const result = tdErrorFromProbability(0.5);
    assertAlmostEquals(result.tdError, 0.5, 1e-6);
    assertAlmostEquals(result.priority, 0.5, 1e-6);
  });

  it("result structure has all required fields", () => {
    const result = tdErrorFromProbability(0.3);
    assert.ok("tdError" in result);
    assert.ok("priority" in result);
    assert.ok("predicted" in result);
    assert.ok("actual" in result);
  });

  it("priority is always positive", () => {
    for (let p = 0; p <= 1.0; p += 0.1) {
      const result = tdErrorFromProbability(p);
      assert.ok(result.priority > 0, `Priority should be > 0 for predicted=${p}`);
      assert.ok(result.priority <= MAX_PRIORITY, `Priority should be <= ${MAX_PRIORITY}`);
    }
  });
});
