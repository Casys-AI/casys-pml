import { describe, it, expect } from "vitest";
import { buildCooccurrenceFromWorkflows, v2vEnrich } from "../v2v.ts";
import type { CooccurrenceEntry } from "../types.ts";

// ==========================================================================
// buildCooccurrenceFromWorkflows
// ==========================================================================

describe("buildCooccurrenceFromWorkflows", () => {
  it("builds bidirectional entries for a single workflow", () => {
    const toolIndex = new Map([
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ]);
    const entries = buildCooccurrenceFromWorkflows([["a", "b", "c"]], toolIndex);

    // 3 tools → 3 pairs × 2 directions = 6 entries
    expect(entries.length).toBe(6);

    // All weights = log2(1+1) = 1.0
    for (const e of entries) {
      expect(e.weight).toBeCloseTo(1.0, 5);
    }

    // Check bidirectionality: for each (a→b), there's a (b→a)
    const pairs = new Set(entries.map((e) => `${e.from}:${e.to}`));
    expect(pairs.has("0:1")).toBe(true);
    expect(pairs.has("1:0")).toBe(true);
    expect(pairs.has("0:2")).toBe(true);
    expect(pairs.has("2:0")).toBe(true);
    expect(pairs.has("1:2")).toBe(true);
    expect(pairs.has("2:1")).toBe(true);
  });

  it("accumulates weight over multiple workflows", () => {
    const toolIndex = new Map([
      ["a", 0],
      ["b", 1],
    ]);
    // a and b co-occur in 3 workflows
    const entries = buildCooccurrenceFromWorkflows(
      [["a", "b"], ["a", "b"], ["a", "b"]],
      toolIndex,
    );

    expect(entries.length).toBe(2); // 1 pair × 2 directions
    // weight = log2(1+3) = log2(4) = 2.0
    expect(entries[0].weight).toBeCloseTo(2.0, 5);
  });

  it("skips unknown tools", () => {
    const toolIndex = new Map([["a", 0], ["b", 1]]);
    const entries = buildCooccurrenceFromWorkflows(
      [["a", "UNKNOWN", "b"]],
      toolIndex,
    );

    // Only a-b pair, UNKNOWN is skipped
    expect(entries.length).toBe(2);
    expect(entries[0].from + entries[0].to).toBe(1); // 0+1
  });

  it("returns empty for no workflows", () => {
    const toolIndex = new Map([["a", 0]]);
    expect(buildCooccurrenceFromWorkflows([], toolIndex)).toHaveLength(0);
  });

  it("returns empty for single-tool workflows", () => {
    const toolIndex = new Map([["a", 0], ["b", 1]]);
    // No pairs possible with single-element workflows
    const entries = buildCooccurrenceFromWorkflows(
      [["a"], ["b"]],
      toolIndex,
    );
    expect(entries).toHaveLength(0);
  });
});

// ==========================================================================
// v2vEnrich
// ==========================================================================

/** Create a simple unit vector in a given dimension */
function unitVec(dim: number, idx: number): number[] {
  const v = Array(dim).fill(0);
  v[idx] = 1.0;
  return v;
}

/** L2 norm of a vector */
function l2norm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

describe("v2vEnrich", () => {
  it("returns empty for empty input", () => {
    expect(v2vEnrich([], [])).toHaveLength(0);
  });

  it("preserves embeddings when no co-occurrence", () => {
    const H = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const result = v2vEnrich(H, []);

    // No neighbors → embeddings unchanged (but L2-normalized, which they already are)
    for (let i = 0; i < 3; i++) {
      for (let d = 0; d < 3; d++) {
        expect(result[i][d]).toBeCloseTo(H[i][d], 5);
      }
    }
  });

  it("enriches co-occurring tools", () => {
    const H = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]];
    // tool 0 ↔ tool 1
    const cooc: CooccurrenceEntry[] = [
      { from: 0, to: 1, weight: 1.0 },
      { from: 1, to: 0, weight: 1.0 },
    ];

    const result = v2vEnrich(H, cooc, { residualWeight: 0.3 });

    // Tool 0 should have some component from tool 1's direction
    expect(result[0][1]).toBeGreaterThan(0);
    // Tool 1 should have some component from tool 0's direction
    expect(result[1][0]).toBeGreaterThan(0);
    // Tool 2 has no neighbors → stays [0,0,1,0]
    expect(result[2][2]).toBeCloseTo(1.0, 3);
  });

  it("output is L2-normalized", () => {
    const H = [[1, 2, 3], [4, 5, 6]];
    const cooc: CooccurrenceEntry[] = [
      { from: 0, to: 1, weight: 1.0 },
      { from: 1, to: 0, weight: 1.0 },
    ];

    const result = v2vEnrich(H, cooc);
    for (const emb of result) {
      expect(l2norm(emb)).toBeCloseTo(1.0, 5);
    }
  });

  it("residualWeight=0 gives no enrichment", () => {
    const H = [[1, 0], [0, 1]];
    const cooc: CooccurrenceEntry[] = [
      { from: 0, to: 1, weight: 1.0 },
      { from: 1, to: 0, weight: 1.0 },
    ];

    const r0 = v2vEnrich(H, cooc, { residualWeight: 0 });
    // H' = H + 0 * agg = H → no change
    expect(r0[0][0]).toBeCloseTo(1.0, 3);
    expect(r0[0][1]).toBeCloseTo(0.0, 3);
    expect(r0[1][0]).toBeCloseTo(0.0, 3);
    expect(r0[1][1]).toBeCloseTo(1.0, 3);
  });

  it("higher residualWeight gives more enrichment", () => {
    const H = [[1, 0], [0, 1]];
    const cooc: CooccurrenceEntry[] = [
      { from: 0, to: 1, weight: 1.0 },
      { from: 1, to: 0, weight: 1.0 },
    ];

    const low = v2vEnrich(H, cooc, { residualWeight: 0.1 });
    const high = v2vEnrich(H, cooc, { residualWeight: 1.0 });

    // Tool 0 should have more of tool 1's component with higher residualWeight
    expect(high[0][1]).toBeGreaterThan(low[0][1]);
  });

  it("simple weighted sum mode (useAttention=false)", () => {
    const H = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const cooc: CooccurrenceEntry[] = [
      { from: 0, to: 1, weight: 2.0 },
      { from: 0, to: 2, weight: 1.0 },
    ];

    const result = v2vEnrich(H, cooc, {
      residualWeight: 0.3,
      useAttention: false,
      temperature: 1.0,
    });

    // Tool 0 gets aggregation weighted 2/3 * tool1 + 1/3 * tool2
    // Residual: [1,0,0] + 0.3 * [0, 2/3, 1/3] = [1, 0.2, 0.1]
    // Before L2 norm
    const rawD0 = 1.0;
    const rawD1 = 0.3 * (2 / 3);
    const rawD2 = 0.3 * (1 / 3);
    const rawNorm = Math.sqrt(rawD0 ** 2 + rawD1 ** 2 + rawD2 ** 2);

    expect(result[0][0]).toBeCloseTo(rawD0 / rawNorm, 4);
    expect(result[0][1]).toBeCloseTo(rawD1 / rawNorm, 4);
    expect(result[0][2]).toBeCloseTo(rawD2 / rawNorm, 4);
  });

  it("ignores out-of-bounds co-occurrence entries", () => {
    const H = [[1, 0], [0, 1]];
    const cooc: CooccurrenceEntry[] = [
      { from: 0, to: 99, weight: 1.0 }, // out of bounds
      { from: 99, to: 0, weight: 1.0 }, // out of bounds
    ];

    const result = v2vEnrich(H, cooc);
    // No valid neighbors → embeddings unchanged
    expect(result[0][0]).toBeCloseTo(1.0, 5);
    expect(result[1][1]).toBeCloseTo(1.0, 5);
  });

  it("is deterministic", () => {
    const H = Array.from({ length: 10 }, (_, i) => {
      const v = Array(8).fill(0);
      v[i % 8] = 1.0;
      v[(i + 1) % 8] = 0.5;
      return v;
    });
    const cooc: CooccurrenceEntry[] = [];
    for (let i = 0; i < 10; i++) {
      for (let j = i + 1; j < Math.min(i + 3, 10); j++) {
        cooc.push({ from: i, to: j, weight: 1.0 });
        cooc.push({ from: j, to: i, weight: 1.0 });
      }
    }

    const r1 = v2vEnrich(H, cooc);
    const r2 = v2vEnrich(H, cooc);

    for (let i = 0; i < 10; i++) {
      for (let d = 0; d < 8; d++) {
        expect(r1[i][d]).toBe(r2[i][d]);
      }
    }
  });
});
