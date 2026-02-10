/**
 * ThompsonSampler Unit Tests
 *
 * Tests for Thompson Sampling with Beta distributions.
 * Run with: npx tsx --test src/training/__tests__/thompson-sampler.test.ts
 *
 * @module gru/training/__tests__/thompson-sampler
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { ThompsonSampler, DEFAULT_THOMPSON_CONFIG } from "../thompson-sampler.ts";

/** Assert two numbers are approximately equal within tolerance. */
function assertAlmostEquals(actual: number, expected: number, tolerance: number) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

describe("ThompsonSampler", () => {
  describe("constructor", () => {
    it("uses defaults when no config provided", () => {
      const sampler = new ThompsonSampler();
      assert.equal(sampler.config.priorAlpha, DEFAULT_THOMPSON_CONFIG.priorAlpha);
      assert.equal(sampler.config.priorBeta, DEFAULT_THOMPSON_CONFIG.priorBeta);
      assert.equal(sampler.config.decayFactor, DEFAULT_THOMPSON_CONFIG.decayFactor);
      assert.equal(sampler.getTotalExecutions(), 0);
      assert.equal(sampler.getToolCount(), 0);
    });

    it("accepts custom config", () => {
      const sampler = new ThompsonSampler({ priorAlpha: 2, priorBeta: 3 });
      assert.equal(sampler.config.priorAlpha, 2);
      assert.equal(sampler.config.priorBeta, 3);
    });
  });

  describe("sample", () => {
    it("returns value in [0, 1]", () => {
      const sampler = new ThompsonSampler();
      for (let i = 0; i < 100; i++) {
        const val = sampler.sample("tool_a");
        assert.ok(val >= 0 && val <= 1, `Sample ${val} out of [0, 1]`);
      }
    });

    it("new tool starts with uniform prior", () => {
      const sampler = new ThompsonSampler();
      const state = sampler.getState("new_tool");
      assert.equal(state, undefined);

      sampler.sample("new_tool");
      const stateAfter = sampler.getState("new_tool")!;
      assert.equal(stateAfter.alpha, 1);
      assert.equal(stateAfter.beta, 1);
      assert.equal(stateAfter.totalObservations, 0);
    });
  });

  describe("update", () => {
    it("increments alpha on success", () => {
      const sampler = new ThompsonSampler({ decayFactor: 1.0 });
      sampler.update("tool_a", true);

      const state = sampler.getState("tool_a")!;
      assert.equal(state.alpha, 2);
      assert.equal(state.beta, 1);
      assert.equal(state.totalObservations, 1);
      assert.equal(sampler.getTotalExecutions(), 1);
    });

    it("increments beta on failure", () => {
      const sampler = new ThompsonSampler({ decayFactor: 1.0 });
      sampler.update("tool_a", false);

      const state = sampler.getState("tool_a")!;
      assert.equal(state.alpha, 1);
      assert.equal(state.beta, 2);
      assert.equal(state.totalObservations, 1);
    });

    it("tracks multiple updates correctly", () => {
      const sampler = new ThompsonSampler({ decayFactor: 1.0 });

      for (let i = 0; i < 7; i++) sampler.update("tool_a", true);
      for (let i = 0; i < 3; i++) sampler.update("tool_a", false);

      const state = sampler.getState("tool_a")!;
      assert.equal(state.alpha, 8);
      assert.equal(state.beta, 4);
      assert.equal(state.totalObservations, 10);
      assert.equal(sampler.getTotalExecutions(), 10);
    });
  });

  describe("batch operations", () => {
    it("updateBatch processes multiple outcomes", () => {
      const sampler = new ThompsonSampler({ decayFactor: 1.0 });
      sampler.updateBatch([
        { toolId: "a", success: true },
        { toolId: "a", success: true },
        { toolId: "b", success: false },
      ]);

      assert.equal(sampler.getToolCount(), 2);
      assert.equal(sampler.getTotalExecutions(), 3);
      assert.equal(sampler.getState("a")!.alpha, 3);
      assert.equal(sampler.getState("b")!.beta, 2);
    });

    it("sampleBatch returns values for all tools", () => {
      const sampler = new ThompsonSampler();
      const toolIds = ["a", "b", "c"];
      const samples = sampler.sampleBatch(toolIds);

      assert.equal(samples.size, 3);
      for (const id of toolIds) {
        const val = samples.get(id)!;
        assert.ok(val >= 0 && val <= 1);
      }
    });
  });

  describe("statistics", () => {
    it("getMean returns alpha/(alpha+beta)", () => {
      const sampler = new ThompsonSampler({ decayFactor: 1.0 });

      assertAlmostEquals(sampler.getMean("new_tool"), 0.5, 1e-6);

      for (let i = 0; i < 9; i++) sampler.update("tool_x", true);
      sampler.update("tool_x", false);
      assertAlmostEquals(sampler.getMean("tool_x"), 10 / 12, 1e-4);
    });

    it("getVariance computes correctly", () => {
      const sampler = new ThompsonSampler({ decayFactor: 1.0 });
      // Beta(1,1): var = 1*1 / (2^2 * 3) = 1/12
      assertAlmostEquals(sampler.getVariance("new_tool"), 1 / 12, 1e-6);
    });

    it("getConfidenceInterval returns valid bounds", () => {
      const sampler = new ThompsonSampler();
      const [low, high] = sampler.getConfidenceInterval("tool_a");

      assert.ok(low >= 0);
      assert.ok(high <= 1);
      assert.ok(low <= high);
    });
  });

  describe("decay", () => {
    it("reduces alpha and beta after update", () => {
      const sampler = new ThompsonSampler({ decayFactor: 0.5 });
      sampler.update("tool_a", true);
      const state = sampler.getState("tool_a")!;

      // alpha was (prior=1)+1=2, then decayed to max(1, 2*0.5) = 1
      // beta was (prior=1), then decayed to max(1, 1*0.5) = 1
      assert.equal(state.alpha, 1);
      assert.equal(state.beta, 1);
    });
  });

  describe("serialization", () => {
    it("serialize / deserialize roundtrip", () => {
      const sampler = new ThompsonSampler({ decayFactor: 1.0 });
      sampler.update("tool_a", true);
      sampler.update("tool_a", true);
      sampler.update("tool_b", false);

      const serialized = sampler.serialize();
      assert.equal(serialized.totalExecutions, 3);
      assert.equal(serialized.states.length, 2);

      const restored = ThompsonSampler.deserialize(serialized, { decayFactor: 1.0 });
      assert.equal(restored.getTotalExecutions(), 3);
      assert.equal(restored.getToolCount(), 2);
      assert.equal(restored.getState("tool_a")!.alpha, 3);
      assert.equal(restored.getState("tool_b")!.beta, 2);
    });

    it("produces valid JSON", () => {
      const sampler = new ThompsonSampler();
      sampler.update("tool_a", true);

      const serialized = sampler.serialize();
      const json = JSON.stringify(serialized);
      const parsed = JSON.parse(json);

      assert.equal(parsed.totalExecutions, 1);
      assert.equal(parsed.states.length, 1);
      assert.equal(parsed.states[0].toolId, "tool_a");
    });
  });

  describe("reset", () => {
    it("clears all state", () => {
      const sampler = new ThompsonSampler();
      sampler.update("a", true);
      sampler.update("b", false);

      sampler.reset();
      assert.equal(sampler.getTotalExecutions(), 0);
      assert.equal(sampler.getToolCount(), 0);
      assert.equal(sampler.getState("a"), undefined);
    });
  });

  describe("statistical behavior", () => {
    it("successful tool has higher mean than failing tool", () => {
      const sampler = new ThompsonSampler({ decayFactor: 1.0 });

      for (let i = 0; i < 20; i++) sampler.update("good_tool", true);
      for (let i = 0; i < 20; i++) sampler.update("bad_tool", false);

      const goodMean = sampler.getMean("good_tool");
      const badMean = sampler.getMean("bad_tool");

      assert.ok(
        goodMean > badMean,
        `Expected good (${goodMean}) > bad (${badMean})`,
      );

      assert.ok(goodMean > 0.9);
      assert.ok(badMean < 0.1);
    });
  });
});
