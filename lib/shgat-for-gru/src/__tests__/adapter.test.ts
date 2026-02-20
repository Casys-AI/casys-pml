/**
 * Unit tests for SHGATAdapter.
 *
 * Uses tiny synthetic data (8D embeddings, 2 heads, 4D head dim) to verify:
 * - setParams / loadParams
 * - buildGraph connectivity
 * - enrichEmbeddings (MP forward changes embeddings)
 * - scoreNodes (K-head scoring, sorted output, with K cache)
 * - scoreNodeIds (sparse scoring subset)
 * - Error handling (no params, no graph)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SHGATAdapter } from "../adapter.ts";
import type { OBTrainedParams, GraphNode, HeadParams, LevelParams } from "../types.ts";

// ==========================================================================
// Helpers: build tiny synthetic params & graph
// ==========================================================================

const EMB_DIM = 8;
const NUM_HEADS = 2;
const HEAD_DIM = 4; // numHeads * headDim = embDim

/** Deterministic pseudo-random (mulberry32) */
function seededRng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeMatrix(rows: number, cols: number, rng: () => number): number[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (rng() - 0.5) * 0.1),
  );
}

function makeVector(len: number, rng: () => number): number[] {
  return Array.from({ length: len }, () => (rng() - 0.5) * 0.1);
}

function makeTinyHeadParams(rng: () => number): HeadParams {
  return {
    W_q: makeMatrix(HEAD_DIM, EMB_DIM, rng),
    W_k: makeMatrix(HEAD_DIM, EMB_DIM, rng),
    W_v: makeMatrix(HEAD_DIM, EMB_DIM, rng),
    a: makeVector(2 * HEAD_DIM, rng),
  };
}

function makeTinyLevelParams(rng: () => number): LevelParams {
  return {
    W_child: Array.from({ length: NUM_HEADS }, () => makeMatrix(HEAD_DIM, EMB_DIM, rng)),
    W_parent: Array.from({ length: NUM_HEADS }, () => makeMatrix(HEAD_DIM, EMB_DIM, rng)),
    a_upward: Array.from({ length: NUM_HEADS }, () => makeVector(2 * HEAD_DIM, rng)),
    a_downward: Array.from({ length: NUM_HEADS }, () => makeVector(2 * HEAD_DIM, rng)),
  };
}

function makeTinyParams(rng: () => number): OBTrainedParams {
  return {
    headParams: [makeTinyHeadParams(rng), makeTinyHeadParams(rng)],
    W_intent: makeMatrix(EMB_DIM, EMB_DIM, rng),
    levelParams: {
      "0": makeTinyLevelParams(rng),
    },
    config: {
      numHeads: NUM_HEADS,
      headDim: HEAD_DIM,
      embeddingDim: EMB_DIM,
      preserveDim: true,
      maxLevel: 0,
    },
  };
}

/**
 * Build a tiny graph:
 *   cap_A (L0) -> [tool_1, tool_2]
 *   cap_B (L0) -> [tool_2, tool_3]
 *   tool_1, tool_2, tool_3 are leaf tools
 */
function makeTinyGraph(rng: () => number): GraphNode[] {
  return [
    { id: "tool_1", embedding: makeVector(EMB_DIM, rng), children: [], level: 0 },
    { id: "tool_2", embedding: makeVector(EMB_DIM, rng), children: [], level: 0 },
    { id: "tool_3", embedding: makeVector(EMB_DIM, rng), children: [], level: 0 },
    { id: "cap_A", embedding: makeVector(EMB_DIM, rng), children: ["tool_1", "tool_2"], level: 0 },
    { id: "cap_B", embedding: makeVector(EMB_DIM, rng), children: ["tool_2", "tool_3"], level: 0 },
  ];
}

// ==========================================================================
// Tests
// ==========================================================================

describe("SHGATAdapter", () => {
  const rng = seededRng(42);
  const params = makeTinyParams(rng);
  const graphNodes = makeTinyGraph(rng);

  describe("setParams / loadParams", () => {
    it("setParams stores params and getConfig returns config", () => {
      const adapter = new SHGATAdapter();
      adapter.setParams(params);
      const config = adapter.getConfig();
      assert.equal(config.numHeads, NUM_HEADS);
      assert.equal(config.headDim, HEAD_DIM);
      assert.equal(config.embeddingDim, EMB_DIM);
    });

    it("loadParams reads JSON file and returns config", () => {
      const adapter = new SHGATAdapter();
      const tmpPath = join(tmpdir(), `shgat-test-params-${Date.now()}.json`);
      writeFileSync(tmpPath, JSON.stringify(params));
      try {
        const config = adapter.loadParams(tmpPath);
        assert.equal(config.numHeads, NUM_HEADS);
        assert.equal(config.embeddingDim, EMB_DIM);
      } finally {
        unlinkSync(tmpPath);
      }
    });

    it("getConfig throws if no params loaded", () => {
      const adapter = new SHGATAdapter();
      assert.throws(() => adapter.getConfig(), /No params loaded/);
    });
  });

  describe("buildGraph", () => {
    it("correctly identifies tools and capabilities", () => {
      const adapter = new SHGATAdapter();
      adapter.setParams(params);
      const graph = adapter.buildGraph(graphNodes);

      assert.equal(graph.l0Ids.length, 3);
      assert.ok(graph.l0Ids.includes("tool_1"));
      assert.ok(graph.l0Ids.includes("tool_2"));
      assert.ok(graph.l0Ids.includes("tool_3"));
    });

    it("builds correct l0ToL1Matrix", () => {
      const adapter = new SHGATAdapter();
      adapter.setParams(params);
      const graph = adapter.buildGraph(graphNodes);

      // level-0 caps: cap_A, cap_B
      const level0Caps = graph.nodeIdsByLevel.get(0)!;
      assert.equal(level0Caps.length, 2);

      // toolToCapMatrix[capIdx][toolIdx]
      const capAIdx = level0Caps.indexOf("cap_A");
      const capBIdx = level0Caps.indexOf("cap_B");
      const t1Idx = graph.l0IdxMap.get("tool_1")!;
      const t2Idx = graph.l0IdxMap.get("tool_2")!;
      const t3Idx = graph.l0IdxMap.get("tool_3")!;

      // cap_A -> tool_1, tool_2
      assert.equal(graph.l0ToL1Matrix[capAIdx][t1Idx], 1);
      assert.equal(graph.l0ToL1Matrix[capAIdx][t2Idx], 1);
      assert.equal(graph.l0ToL1Matrix[capAIdx][t3Idx], 0);

      // cap_B -> tool_2, tool_3
      assert.equal(graph.l0ToL1Matrix[capBIdx][t1Idx], 0);
      assert.equal(graph.l0ToL1Matrix[capBIdx][t2Idx], 1);
      assert.equal(graph.l0ToL1Matrix[capBIdx][t3Idx], 1);
    });

    it("getGraph throws if no graph built", () => {
      const adapter = new SHGATAdapter();
      assert.throws(() => adapter.getGraph(), /No graph built/);
    });
  });

  describe("enrichEmbeddings", () => {
    it("throws if no params loaded", () => {
      const adapter = new SHGATAdapter();
      assert.throws(() => adapter.enrichEmbeddings(), /No params loaded/);
    });

    it("throws if no graph built", () => {
      const adapter = new SHGATAdapter();
      adapter.setParams(params);
      assert.throws(() => adapter.enrichEmbeddings(), /No graph built/);
    });

    it("produces different embeddings than raw input", () => {
      const adapter = new SHGATAdapter();
      adapter.setParams(params);
      adapter.buildGraph(graphNodes);

      const rawEmbs = new Map<string, number[]>();
      for (const node of graphNodes) {
        if (node.children.length === 0) {
          rawEmbs.set(node.id, [...node.embedding]);
        }
      }

      const { l0Embeddings, enrichmentMs } = adapter.enrichEmbeddings();

      assert.equal(l0Embeddings.size, 3);
      assert.ok(enrichmentMs >= 0);

      // At least one tool embedding should have changed
      let anyChanged = false;
      for (const [id, enriched] of l0Embeddings) {
        const raw = rawEmbs.get(id)!;
        for (let d = 0; d < EMB_DIM; d++) {
          if (Math.abs(enriched[d] - raw[d]) > 1e-10) {
            anyChanged = true;
            break;
          }
        }
        if (anyChanged) break;
      }
      assert.ok(anyChanged, "Enriched embeddings should differ from raw embeddings");
    });

    it("enrichment is deterministic (same params + graph = same output)", () => {
      const a1 = new SHGATAdapter();
      a1.setParams(params);
      a1.buildGraph(graphNodes);
      const r1 = a1.enrichEmbeddings();

      const a2 = new SHGATAdapter();
      a2.setParams(params);
      a2.buildGraph(graphNodes);
      const r2 = a2.enrichEmbeddings();

      for (const [id, emb1] of r1.l0Embeddings) {
        const emb2 = r2.l0Embeddings.get(id)!;
        for (let d = 0; d < EMB_DIM; d++) {
          assert.ok(
            Math.abs(emb1[d] - emb2[d]) < 1e-12,
            `Determinism failed for ${id}[${d}]: ${emb1[d]} vs ${emb2[d]}`,
          );
        }
      }
    });
  });

  describe("scoreNodes", () => {
    it("returns sorted scores for all nodes", () => {
      const adapter = new SHGATAdapter();
      adapter.setParams(params);
      adapter.buildGraph(graphNodes);
      adapter.enrichEmbeddings();

      const intent = makeVector(EMB_DIM, seededRng(99));
      const { topK, scoringMs } = adapter.scoreNodes(intent, 3);

      assert.equal(topK.length, 3);
      assert.ok(scoringMs >= 0);

      // Verify descending sort
      for (let i = 1; i < topK.length; i++) {
        assert.ok(topK[i - 1].score >= topK[i].score, "Scores must be descending");
      }

      // Each entry has nodeId and score
      for (const entry of topK) {
        assert.ok(typeof entry.nodeId === "string");
        assert.ok(typeof entry.score === "number");
        assert.ok(!isNaN(entry.score));
      }
    });

    it("topK limits results", () => {
      const adapter = new SHGATAdapter();
      adapter.setParams(params);
      adapter.buildGraph(graphNodes);

      const intent = makeVector(EMB_DIM, seededRng(99));
      const { topK } = adapter.scoreNodes(intent, 2);
      assert.equal(topK.length, 2);
    });

    it("works without enrichment (uses raw embeddings)", () => {
      const adapter = new SHGATAdapter();
      adapter.setParams(params);
      adapter.buildGraph(graphNodes);
      // No enrichEmbeddings() call

      const intent = makeVector(EMB_DIM, seededRng(99));
      const { topK } = adapter.scoreNodes(intent, 3);
      assert.equal(topK.length, 3);

      // Scores should be finite numbers
      for (const entry of topK) {
        assert.ok(isFinite(entry.score));
      }
    });

    it("throws without params", () => {
      const adapter = new SHGATAdapter();
      const intent = makeVector(EMB_DIM, seededRng(99));
      assert.throws(() => adapter.scoreNodes(intent), /No params loaded/);
    });

    it("K cache: second call is faster than first", () => {
      const adapter = new SHGATAdapter();
      adapter.setParams(params);
      adapter.buildGraph(graphNodes);
      adapter.enrichEmbeddings();

      const intent = makeVector(EMB_DIM, seededRng(99));
      // First call builds cache
      const r1 = adapter.scoreNodes(intent, 3);
      // Second call uses cache — scores should be identical
      const r2 = adapter.scoreNodes(intent, 3);

      assert.equal(r1.topK.length, r2.topK.length);
      for (let i = 0; i < r1.topK.length; i++) {
        assert.equal(r1.topK[i].nodeId, r2.topK[i].nodeId);
        assert.ok(Math.abs(r1.topK[i].score - r2.topK[i].score) < 1e-10);
      }
    });

    it("deprecated scoreTools alias works", () => {
      const adapter = new SHGATAdapter();
      adapter.setParams(params);
      adapter.buildGraph(graphNodes);

      const intent = makeVector(EMB_DIM, seededRng(99));
      const r1 = adapter.scoreNodes(intent, 3);
      const r2 = adapter.scoreTools(intent, 3);

      assert.equal(r1.topK.length, r2.topK.length);
      for (let i = 0; i < r1.topK.length; i++) {
        assert.equal(r1.topK[i].nodeId, r2.topK[i].nodeId);
      }
    });
  });

  describe("scoreNodeIds", () => {
    it("scores only specified node IDs", () => {
      const adapter = new SHGATAdapter();
      adapter.setParams(params);
      adapter.buildGraph(graphNodes);
      adapter.enrichEmbeddings();

      const intent = makeVector(EMB_DIM, seededRng(99));
      const results = adapter.scoreNodeIds(intent, ["tool_1", "tool_3"]);

      assert.equal(results.length, 2);
      const ids = results.map((r) => r.nodeId);
      assert.ok(ids.includes("tool_1"));
      assert.ok(ids.includes("tool_3"));
      assert.ok(!ids.includes("tool_2"));
    });

    it("returns sorted descending", () => {
      const adapter = new SHGATAdapter();
      adapter.setParams(params);
      adapter.buildGraph(graphNodes);

      const intent = makeVector(EMB_DIM, seededRng(99));
      const results = adapter.scoreNodeIds(intent, ["tool_1", "tool_2", "tool_3"]);

      for (let i = 1; i < results.length; i++) {
        assert.ok(results[i - 1].score >= results[i].score);
      }
    });

    it("skips unknown node IDs silently", () => {
      const adapter = new SHGATAdapter();
      adapter.setParams(params);
      adapter.buildGraph(graphNodes);

      const intent = makeVector(EMB_DIM, seededRng(99));
      const results = adapter.scoreNodeIds(intent, ["tool_1", "unknown_node"]);

      assert.equal(results.length, 1);
      assert.equal(results[0].nodeId, "tool_1");
    });
  });

  describe("multi-level graph", () => {
    it("handles 2-level hierarchy (tools → L0 caps → L1 cap)", () => {
      const rng2 = seededRng(123);

      // 2-level graph:
      //   l1_cap (L1) -> [cap_A, cap_B]
      //   cap_A (L0) -> [tool_1, tool_2]
      //   cap_B (L0) -> [tool_3]
      const nodes: GraphNode[] = [
        { id: "tool_1", embedding: makeVector(EMB_DIM, rng2), children: [], level: 0 },
        { id: "tool_2", embedding: makeVector(EMB_DIM, rng2), children: [], level: 0 },
        { id: "tool_3", embedding: makeVector(EMB_DIM, rng2), children: [], level: 0 },
        { id: "cap_A", embedding: makeVector(EMB_DIM, rng2), children: ["tool_1", "tool_2"], level: 0 },
        { id: "cap_B", embedding: makeVector(EMB_DIM, rng2), children: ["tool_3"], level: 0 },
        { id: "l1_cap", embedding: makeVector(EMB_DIM, rng2), children: ["cap_A", "cap_B"], level: 1 },
      ];

      // Need level params for both levels
      const params2: OBTrainedParams = {
        headParams: [makeTinyHeadParams(rng2), makeTinyHeadParams(rng2)],
        W_intent: makeMatrix(EMB_DIM, EMB_DIM, rng2),
        levelParams: {
          "0": makeTinyLevelParams(rng2),
          "1": makeTinyLevelParams(rng2),
        },
        config: {
          numHeads: NUM_HEADS,
          headDim: HEAD_DIM,
          embeddingDim: EMB_DIM,
          preserveDim: true,
          maxLevel: 1,
        },
      };

      const adapter = new SHGATAdapter();
      adapter.setParams(params2);
      const graph = adapter.buildGraph(nodes);

      assert.equal(graph.l0Ids.length, 3);
      assert.equal(graph.maxLevel, 1);
      assert.equal(graph.nodeIdsByLevel.get(0)!.length, 2);
      assert.equal(graph.nodeIdsByLevel.get(1)!.length, 1);
      assert.ok(graph.interLevelMatrices.has(1));

      // Enrichment should work with 2 levels
      const { l0Embeddings } = adapter.enrichEmbeddings();
      assert.equal(l0Embeddings.size, 3);

      // Scoring should also work
      const intent = makeVector(EMB_DIM, rng2);
      const { topK } = adapter.scoreNodes(intent, 3);
      assert.equal(topK.length, 3);
    });
  });

  describe("getL0Ids", () => {
    it("returns empty array if no graph", () => {
      const adapter = new SHGATAdapter();
      assert.deepEqual(adapter.getL0Ids(), []);
    });

    it("returns tool IDs after buildGraph", () => {
      const adapter = new SHGATAdapter();
      adapter.setParams(params);
      adapter.buildGraph(graphNodes);
      const ids = adapter.getL0Ids();
      assert.equal(ids.length, 3);
    });
  });

  describe("getEnrichedEmbeddings", () => {
    it("throws if enrichEmbeddings not called", () => {
      const adapter = new SHGATAdapter();
      adapter.setParams(params);
      adapter.buildGraph(graphNodes);
      assert.throws(() => adapter.getEnrichedEmbeddings(), /No enriched embeddings/);
    });

    it("returns map after enrichment", () => {
      const adapter = new SHGATAdapter();
      adapter.setParams(params);
      adapter.buildGraph(graphNodes);
      adapter.enrichEmbeddings();
      const embs = adapter.getEnrichedEmbeddings();
      assert.equal(embs.size, 3);
    });
  });

  describe("invalidation", () => {
    it("setParams invalidates enriched embeddings", () => {
      const adapter = new SHGATAdapter();
      adapter.setParams(params);
      adapter.buildGraph(graphNodes);
      adapter.enrichEmbeddings();
      assert.ok(adapter.getEnrichedEmbeddings().size > 0);

      // Re-set params → invalidates
      adapter.setParams(params);
      assert.throws(() => adapter.getEnrichedEmbeddings(), /No enriched embeddings/);
    });

    it("buildGraph invalidates enriched embeddings", () => {
      const adapter = new SHGATAdapter();
      adapter.setParams(params);
      adapter.buildGraph(graphNodes);
      adapter.enrichEmbeddings();
      assert.ok(adapter.getEnrichedEmbeddings().size > 0);

      // Rebuild graph → invalidates
      adapter.buildGraph(graphNodes);
      assert.throws(() => adapter.getEnrichedEmbeddings(), /No enriched embeddings/);
    });
  });
});
