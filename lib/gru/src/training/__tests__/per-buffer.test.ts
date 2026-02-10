/**
 * PERBuffer Unit Tests
 *
 * Tests for Prioritized Experience Replay buffer.
 * Run with: npx tsx --test src/training/__tests__/per-buffer.test.ts
 *
 * @module gru/training/__tests__/per-buffer
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { PERBuffer, DEFAULT_PER_ALPHA, DEFAULT_MIN_PRIORITY, DEFAULT_MAX_PRIORITY } from "../per-buffer.ts";
import type { TransitionExample } from "../../transition/types.ts";

// Helper: create a minimal TransitionExample
function makeExample(targetToolId: string): TransitionExample {
  return {
    intentEmbedding: [0.1, 0.2, 0.3],
    contextToolIds: [],
    targetToolId,
    isTerminal: 0,
    isSingleTool: false,
  };
}

describe("PERBuffer", () => {
  describe("constructor", () => {
    it("uses defaults when no config provided", () => {
      const buffer = new PERBuffer();
      assert.equal(buffer.config.capacity, 10_000);
      assert.equal(buffer.config.alpha, DEFAULT_PER_ALPHA);
      assert.equal(buffer.config.minPriority, DEFAULT_MIN_PRIORITY);
      assert.equal(buffer.config.maxPriority, DEFAULT_MAX_PRIORITY);
      assert.equal(buffer.size, 0);
      assert.equal(buffer.isEmpty, true);
    });

    it("accepts custom config", () => {
      const buffer = new PERBuffer({ capacity: 100, alpha: 0.8 });
      assert.equal(buffer.config.capacity, 100);
      assert.equal(buffer.config.alpha, 0.8);
    });
  });

  describe("add / addBatch", () => {
    it("increases size on add", () => {
      const buffer = new PERBuffer({ capacity: 10 });
      assert.equal(buffer.size, 0);

      buffer.add(makeExample("tool_a"), 0.5);
      assert.equal(buffer.size, 1);
      assert.equal(buffer.isEmpty, false);

      buffer.add(makeExample("tool_b"), 0.7);
      assert.equal(buffer.size, 2);
    });

    it("addBatch adds multiple entries", () => {
      const buffer = new PERBuffer({ capacity: 100 });
      const examples = [makeExample("a"), makeExample("b"), makeExample("c")];
      buffer.addBatch(examples, 0.5);
      assert.equal(buffer.size, 3);
    });
  });

  describe("circular eviction", () => {
    it("evicts oldest when capacity reached", () => {
      const buffer = new PERBuffer({ capacity: 3 });
      buffer.add(makeExample("a"), 0.1);
      buffer.add(makeExample("b"), 0.2);
      buffer.add(makeExample("c"), 0.3);
      assert.equal(buffer.size, 3);

      buffer.add(makeExample("d"), 0.4);
      assert.equal(buffer.size, 3);

      const entries = buffer.getAllEntries();
      const ids = entries.map((e) => e.example.targetToolId).sort();
      assert.deepEqual(ids, ["b", "c", "d"]);
    });
  });

  describe("priority clamping", () => {
    it("clamps below min to minPriority", () => {
      const buffer = new PERBuffer({ capacity: 10 });
      buffer.add(makeExample("a"), 0.001);
      const entries = buffer.getAllEntries();
      assert.equal(entries[0].priority, DEFAULT_MIN_PRIORITY);
    });

    it("clamps above max to maxPriority", () => {
      const buffer = new PERBuffer({ capacity: 10 });
      buffer.add(makeExample("b"), 5.0);
      const entries = buffer.getAllEntries();
      assert.equal(entries[0].priority, DEFAULT_MAX_PRIORITY);
    });

    it("uses maxPriority when no priority given", () => {
      const buffer = new PERBuffer({ capacity: 10 });
      buffer.add(makeExample("a"));
      const entries = buffer.getAllEntries();
      assert.equal(entries[0].priority, DEFAULT_MAX_PRIORITY);
    });
  });

  describe("sample", () => {
    it("throws on empty buffer", () => {
      const buffer = new PERBuffer({ capacity: 10 });
      assert.throws(
        () => buffer.sample(5),
        { message: /Cannot sample from empty buffer/ },
      );
    });

    it("returns correct batch size", () => {
      const buffer = new PERBuffer({ capacity: 100 });
      for (let i = 0; i < 20; i++) {
        buffer.add(makeExample(`tool_${i}`), (i + 1) / 20);
      }

      const result = buffer.sample(5);
      assert.equal(result.entries.length, 5);
      assert.equal(result.weights.length, 5);
      assert.equal(result.indices.length, 5);
    });

    it("high-priority entries sampled more often (alpha=1)", () => {
      const buffer = new PERBuffer({ capacity: 100, alpha: 1.0 });

      for (let i = 0; i < 10; i++) {
        buffer.add(makeExample(`low_${i}`), 0.01);
      }
      for (let i = 0; i < 10; i++) {
        buffer.add(makeExample(`high_${i}`), 1.0);
      }

      let highCount = 0;
      const trials = 100;
      for (let t = 0; t < trials; t++) {
        const result = buffer.sample(5);
        for (const entry of result.entries) {
          if (entry.example.targetToolId.startsWith("high_")) highCount++;
        }
      }

      const highRatio = highCount / (trials * 5);
      assert.ok(highRatio > 0.8, `Expected high ratio > 0.8, got ${highRatio}`);
    });

    it("samples without replacement (no duplicates)", () => {
      const buffer = new PERBuffer({ capacity: 10 });
      for (let i = 0; i < 10; i++) {
        buffer.add(makeExample(`tool_${i}`), 0.5);
      }

      const result = buffer.sample(10);
      const indices = new Set(result.indices);
      assert.equal(indices.size, 10);
    });

    it("clamps batch size to buffer size", () => {
      const buffer = new PERBuffer({ capacity: 100 });
      buffer.add(makeExample("a"), 0.5);
      buffer.add(makeExample("b"), 0.5);

      const result = buffer.sample(10);
      assert.equal(result.entries.length, 2);
    });

    it("importance sampling weights normalized to max=1", () => {
      const buffer = new PERBuffer({ capacity: 100 });
      for (let i = 0; i < 20; i++) {
        buffer.add(makeExample(`tool_${i}`), (i + 1) / 20);
      }

      const result = buffer.sample(10, 0.6);
      const maxWeight = Math.max(...result.weights);
      assert.ok(
        Math.abs(maxWeight - 1.0) < 1e-6,
        `Expected max weight ~1.0, got ${maxWeight}`,
      );

      for (const w of result.weights) {
        assert.ok(w > 0 && w <= 1.0, `Weight ${w} out of range (0, 1]`);
      }
    });
  });

  describe("updatePriorities", () => {
    it("changes entry priorities", () => {
      const buffer = new PERBuffer({ capacity: 10 });
      buffer.add(makeExample("a"), 0.5);
      buffer.add(makeExample("b"), 0.5);

      const result = buffer.sample(2);
      buffer.updatePriorities(result.indices, [0.9, 0.1]);

      const entries = buffer.getAllEntries();
      const priorities = entries.map((e) => e.priority).sort();
      assert.equal(priorities[0], 0.1);
      assert.equal(priorities[1], 0.9);
    });
  });

  describe("annealBeta", () => {
    it("interpolates from betaStart to 1.0", () => {
      const buffer = new PERBuffer({ betaStart: 0.4 });

      assert.ok(Math.abs(buffer.annealBeta(0) - 0.4) < 1e-6);
      assert.ok(Math.abs(buffer.annealBeta(0.5) - 0.7) < 1e-6);
      assert.ok(Math.abs(buffer.annealBeta(1) - 1.0) < 1e-6);
    });

    it("clamps progress to [0, 1]", () => {
      const buffer = new PERBuffer({ betaStart: 0.4 });
      assert.ok(Math.abs(buffer.annealBeta(-1) - 0.4) < 1e-6);
      assert.ok(Math.abs(buffer.annealBeta(2) - 1.0) < 1e-6);
    });
  });

  describe("clear", () => {
    it("resets buffer to empty", () => {
      const buffer = new PERBuffer({ capacity: 10 });
      buffer.add(makeExample("a"), 0.5);
      buffer.add(makeExample("b"), 0.5);
      assert.equal(buffer.size, 2);

      buffer.clear();
      assert.equal(buffer.size, 0);
      assert.equal(buffer.isEmpty, true);
    });
  });
});
