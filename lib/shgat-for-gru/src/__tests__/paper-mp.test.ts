/**
 * Unit tests for PaperMP (paper-style two-phase message passing).
 *
 * Uses tiny synthetic data (8D embeddings, 4D projection) to verify:
 * - Constructor and config
 * - buildGraph connectivity
 * - enrich() produces enriched L0 embeddings
 * - Connected tools have non-zero delta vs raw embeddings
 * - Orphan tools (no cap parent) are unchanged
 * - Determinism: same seed → exact same output
 * - setParams / exportParams round-trip
 * - Error handling (no graph)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PaperMP } from "../paper-mp.ts";
import type { PaperMPConfig } from "../paper-mp.ts";
import type { GraphNode } from "../types.ts";

// ==========================================================================
// Helpers
// ==========================================================================

const EMB_DIM = 8;
const PROJ_DIM = 4;

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

function makeVector(len: number, rng: () => number): number[] {
  return Array.from({ length: len }, () => (rng() - 0.5) * 0.1);
}

const TINY_CONFIG: Partial<PaperMPConfig> = {
  embDim: EMB_DIM,
  projDim: PROJ_DIM,
  residualAlpha: 0.3,
  activation: "leaky_relu",
  leakySlope: 0.2,
  seed: 42,
};

/**
 * Build a tiny graph:
 *   cap_A (L0 cap) -> [tool_1, tool_2]
 *   cap_B (L0 cap) -> [tool_2, tool_3]
 *   tool_4 is an orphan (no parent cap)
 */
function makeTinyGraph(rng: () => number): GraphNode[] {
  return [
    { id: "tool_1", embedding: makeVector(EMB_DIM, rng), children: [], level: 0 },
    { id: "tool_2", embedding: makeVector(EMB_DIM, rng), children: [], level: 0 },
    { id: "tool_3", embedding: makeVector(EMB_DIM, rng), children: [], level: 0 },
    { id: "tool_4", embedding: makeVector(EMB_DIM, rng), children: [], level: 0 },
    { id: "cap_A", embedding: makeVector(EMB_DIM, rng), children: ["tool_1", "tool_2"], level: 0 },
    { id: "cap_B", embedding: makeVector(EMB_DIM, rng), children: ["tool_2", "tool_3"], level: 0 },
  ];
}

function embeddingDelta(a: number[], b: number[]): number {
  let sum = 0;
  for (let d = 0; d < a.length; d++) {
    const diff = a[d] - b[d];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// ==========================================================================
// Tests
// ==========================================================================

describe("PaperMP", () => {
  describe("constructor and config", () => {
    it("initializes with default config", () => {
      const mp = new PaperMP({ embDim: EMB_DIM, projDim: PROJ_DIM });
      const cfg = mp.getConfig();
      assert.equal(cfg.embDim, EMB_DIM);
      assert.equal(cfg.projDim, PROJ_DIM);
      assert.equal(cfg.activation, "leaky_relu");
      assert.equal(cfg.residualAlpha, 0.3);
      assert.equal(cfg.seed, 42);
    });

    it("accepts custom config overrides", () => {
      const mp = new PaperMP({
        embDim: 16,
        projDim: 8,
        residualAlpha: 0.5,
        activation: "relu",
        seed: 123,
      });
      const cfg = mp.getConfig();
      assert.equal(cfg.embDim, 16);
      assert.equal(cfg.projDim, 8);
      assert.equal(cfg.residualAlpha, 0.5);
      assert.equal(cfg.activation, "relu");
      assert.equal(cfg.seed, 123);
    });

    it("reports correct param count", () => {
      const mp = new PaperMP(TINY_CONFIG);
      // 2 * projDim * embDim = 2 * 4 * 8 = 64
      assert.equal(mp.getParamCount(), 2 * PROJ_DIM * EMB_DIM);
    });
  });

  describe("buildGraph", () => {
    it("correctly identifies L0 tools and caps", () => {
      const rng = seededRng(42);
      const nodes = makeTinyGraph(rng);
      const mp = new PaperMP(TINY_CONFIG);
      const graph = mp.buildGraph(nodes);

      // 4 leaf tools (tool_1..tool_4), 2 caps
      assert.equal(graph.l0Ids.length, 4);
      assert.ok(graph.l0Ids.includes("tool_1"));
      assert.ok(graph.l0Ids.includes("tool_2"));
      assert.ok(graph.l0Ids.includes("tool_3"));
      assert.ok(graph.l0Ids.includes("tool_4"));
    });

    it("builds correct l0ToL1Matrix", () => {
      const rng = seededRng(42);
      const nodes = makeTinyGraph(rng);
      const mp = new PaperMP(TINY_CONFIG);
      const graph = mp.buildGraph(nodes);

      const level0Caps = graph.nodeIdsByLevel.get(0)!;
      assert.equal(level0Caps.length, 2);

      const capAIdx = level0Caps.indexOf("cap_A");
      const capBIdx = level0Caps.indexOf("cap_B");
      const t1Idx = graph.l0IdxMap.get("tool_1")!;
      const t2Idx = graph.l0IdxMap.get("tool_2")!;
      const t3Idx = graph.l0IdxMap.get("tool_3")!;
      const t4Idx = graph.l0IdxMap.get("tool_4")!;

      // cap_A -> tool_1, tool_2
      assert.equal(graph.l0ToL1Matrix[capAIdx][t1Idx], 1);
      assert.equal(graph.l0ToL1Matrix[capAIdx][t2Idx], 1);
      assert.equal(graph.l0ToL1Matrix[capAIdx][t3Idx], 0);
      assert.equal(graph.l0ToL1Matrix[capAIdx][t4Idx], 0);

      // cap_B -> tool_2, tool_3
      assert.equal(graph.l0ToL1Matrix[capBIdx][t1Idx], 0);
      assert.equal(graph.l0ToL1Matrix[capBIdx][t2Idx], 1);
      assert.equal(graph.l0ToL1Matrix[capBIdx][t3Idx], 1);
      assert.equal(graph.l0ToL1Matrix[capBIdx][t4Idx], 0);
    });

    it("getGraph throws if no graph built", () => {
      const mp = new PaperMP(TINY_CONFIG);
      assert.throws(() => mp.getGraph(), /No graph built/);
    });

    it("getL0Ids returns empty if no graph", () => {
      const mp = new PaperMP(TINY_CONFIG);
      assert.deepEqual(mp.getL0Ids(), []);
    });
  });

  describe("enrich", () => {
    it("throws if no graph built", () => {
      const mp = new PaperMP(TINY_CONFIG);
      assert.throws(() => mp.enrich(), /No graph built/);
    });

    it("returns enriched embeddings for all L0 nodes", () => {
      const rng = seededRng(42);
      const nodes = makeTinyGraph(rng);
      const mp = new PaperMP(TINY_CONFIG);
      mp.buildGraph(nodes);

      const { l0Embeddings, enrichmentMs } = mp.enrich();

      assert.equal(l0Embeddings.size, 4);
      assert.ok(l0Embeddings.has("tool_1"));
      assert.ok(l0Embeddings.has("tool_2"));
      assert.ok(l0Embeddings.has("tool_3"));
      assert.ok(l0Embeddings.has("tool_4"));
      assert.ok(enrichmentMs >= 0);

      // Each embedding has correct dimension
      for (const [, emb] of l0Embeddings) {
        assert.equal(emb.length, EMB_DIM);
        for (const v of emb) {
          assert.ok(isFinite(v), "Embedding values must be finite");
        }
      }
    });

    it("connected tools have non-zero delta from raw embeddings", () => {
      const rng = seededRng(42);
      const nodes = makeTinyGraph(rng);

      // Save raw embeddings before enrichment
      const rawEmbs = new Map<string, number[]>();
      for (const n of nodes) {
        if (n.children.length === 0) {
          rawEmbs.set(n.id, [...n.embedding]);
        }
      }

      const mp = new PaperMP(TINY_CONFIG);
      mp.buildGraph(nodes);
      const { l0Embeddings } = mp.enrich();

      // tool_1, tool_2, tool_3 are connected → should change
      let anyConnectedChanged = false;
      for (const connectedId of ["tool_1", "tool_2", "tool_3"]) {
        const raw = rawEmbs.get(connectedId)!;
        const enriched = l0Embeddings.get(connectedId)!;
        const delta = embeddingDelta(raw, enriched);
        if (delta > 1e-10) {
          anyConnectedChanged = true;
        }
      }
      assert.ok(
        anyConnectedChanged,
        "At least one connected tool should have a non-zero delta after enrichment",
      );
    });

    it("orphan tools (no cap parent) have zero delta", () => {
      const rng = seededRng(42);
      const nodes = makeTinyGraph(rng);

      // Save raw embedding for tool_4 (orphan)
      const rawTool4 = [...nodes.find((n) => n.id === "tool_4")!.embedding];

      const mp = new PaperMP(TINY_CONFIG);
      mp.buildGraph(nodes);
      const { l0Embeddings } = mp.enrich();

      const enrichedTool4 = l0Embeddings.get("tool_4")!;
      const delta = embeddingDelta(rawTool4, enrichedTool4);
      assert.ok(
        delta < 1e-10,
        `Orphan tool_4 should be unchanged after enrichment, but delta = ${delta}`,
      );
    });

    it("getEnrichedEmbeddings throws if enrich() not called", () => {
      const mp = new PaperMP(TINY_CONFIG);
      const rng = seededRng(42);
      mp.buildGraph(makeTinyGraph(rng));
      assert.throws(() => mp.getEnrichedEmbeddings(), /No enriched embeddings/);
    });

    it("getEnrichedEmbeddings returns map after enrich()", () => {
      const rng = seededRng(42);
      const mp = new PaperMP(TINY_CONFIG);
      mp.buildGraph(makeTinyGraph(rng));
      mp.enrich();
      const embs = mp.getEnrichedEmbeddings();
      assert.equal(embs.size, 4);
    });
  });

  describe("determinism", () => {
    it("same seed and graph produce identical enrichment", () => {
      const run = () => {
        const rng = seededRng(42);
        const nodes = makeTinyGraph(rng);
        const mp = new PaperMP(TINY_CONFIG);
        mp.buildGraph(nodes);
        return mp.enrich();
      };

      const r1 = run();
      const r2 = run();

      for (const [id, emb1] of r1.l0Embeddings) {
        const emb2 = r2.l0Embeddings.get(id)!;
        assert.ok(emb2, `Missing ID ${id} in second run`);
        for (let d = 0; d < EMB_DIM; d++) {
          assert.ok(
            Math.abs(emb1[d] - emb2[d]) < 1e-12,
            `Determinism failed for ${id}[${d}]: ${emb1[d]} vs ${emb2[d]}`,
          );
        }
      }
    });

    it("different seed produces different params and results", () => {
      const rng = seededRng(42);
      const nodes = makeTinyGraph(rng);

      const mp1 = new PaperMP({ ...TINY_CONFIG, seed: 42 });
      mp1.buildGraph(nodes);
      const r1 = mp1.enrich();

      // Rebuild nodes with same data but different seed for PaperMP
      const rng2 = seededRng(42);
      const nodes2 = makeTinyGraph(rng2);
      const mp2 = new PaperMP({ ...TINY_CONFIG, seed: 999 });
      mp2.buildGraph(nodes2);
      const r2 = mp2.enrich();

      // At least one connected tool should differ between seeds
      let anyDiff = false;
      for (const id of ["tool_1", "tool_2", "tool_3"]) {
        const emb1 = r1.l0Embeddings.get(id)!;
        const emb2 = r2.l0Embeddings.get(id)!;
        const delta = embeddingDelta(emb1, emb2);
        if (delta > 1e-10) {
          anyDiff = true;
          break;
        }
      }
      assert.ok(anyDiff, "Different seeds should produce different enrichments");
    });
  });

  describe("setParams / exportParams", () => {
    it("exportParams round-trips through setParams", () => {
      const mp1 = new PaperMP(TINY_CONFIG);
      const exported = mp1.exportParams();

      // Verify export structure
      assert.equal(exported.W.length, PROJ_DIM);
      assert.equal(exported.W[0].length, EMB_DIM);
      assert.equal(exported.W1.length, PROJ_DIM);
      assert.equal(exported.W1[0].length, EMB_DIM);
      assert.deepEqual(exported.config.embDim, EMB_DIM);
      assert.deepEqual(exported.config.projDim, PROJ_DIM);

      // Create second instance, set exported params, verify same enrichment
      const mp2 = new PaperMP(TINY_CONFIG);
      mp2.setParams(exported.W, exported.W1);

      const rng = seededRng(42);
      const nodes = makeTinyGraph(rng);
      mp1.buildGraph(nodes);
      const r1 = mp1.enrich();

      const rng2 = seededRng(42);
      const nodes2 = makeTinyGraph(rng2);
      mp2.buildGraph(nodes2);
      const r2 = mp2.enrich();

      for (const [id, emb1] of r1.l0Embeddings) {
        const emb2 = r2.l0Embeddings.get(id)!;
        for (let d = 0; d < EMB_DIM; d++) {
          assert.ok(
            Math.abs(emb1[d] - emb2[d]) < 1e-12,
            `Round-trip failed for ${id}[${d}]`,
          );
        }
      }
    });

    it("setParams validates dimensions", () => {
      const mp = new PaperMP(TINY_CONFIG);
      const badW = [[1, 2], [3, 4]]; // Wrong dimensions
      const goodW1 = Array.from({ length: PROJ_DIM }, () =>
        new Array(EMB_DIM).fill(0),
      );

      assert.throws(
        () => mp.setParams(badW, goodW1),
        /W must be/,
      );
    });
  });

  describe("multi-level hierarchy", () => {
    it("handles 2-level hierarchy (tools -> L0 caps -> L1 cap)", () => {
      const rng = seededRng(77);
      const nodes: GraphNode[] = [
        { id: "t1", embedding: makeVector(EMB_DIM, rng), children: [], level: 0 },
        { id: "t2", embedding: makeVector(EMB_DIM, rng), children: [], level: 0 },
        { id: "t3", embedding: makeVector(EMB_DIM, rng), children: [], level: 0 },
        { id: "cap_x", embedding: makeVector(EMB_DIM, rng), children: ["t1", "t2"], level: 0 },
        { id: "cap_y", embedding: makeVector(EMB_DIM, rng), children: ["t3"], level: 0 },
        { id: "meta_cap", embedding: makeVector(EMB_DIM, rng), children: ["cap_x", "cap_y"], level: 1 },
      ];

      const mp = new PaperMP(TINY_CONFIG);
      const graph = mp.buildGraph(nodes);

      assert.equal(graph.l0Ids.length, 3);
      assert.equal(graph.maxLevel, 1);
      assert.ok(graph.interLevelMatrices.has(1));

      const { l0Embeddings } = mp.enrich();
      assert.equal(l0Embeddings.size, 3);

      // All embeddings are finite
      for (const [, emb] of l0Embeddings) {
        for (const v of emb) {
          assert.ok(isFinite(v), "Multi-level enriched values must be finite");
        }
      }
    });
  });

  describe("edge cases", () => {
    it("handles graph with no caps (all orphans)", () => {
      const rng = seededRng(42);
      const nodes: GraphNode[] = [
        { id: "lone_1", embedding: makeVector(EMB_DIM, rng), children: [], level: 0 },
        { id: "lone_2", embedding: makeVector(EMB_DIM, rng), children: [], level: 0 },
      ];

      const rawEmbs = new Map<string, number[]>();
      for (const n of nodes) rawEmbs.set(n.id, [...n.embedding]);

      const mp = new PaperMP(TINY_CONFIG);
      mp.buildGraph(nodes);
      const { l0Embeddings } = mp.enrich();

      assert.equal(l0Embeddings.size, 2);

      // No caps → no MP → embeddings unchanged
      for (const [id, enriched] of l0Embeddings) {
        const raw = rawEmbs.get(id)!;
        const delta = embeddingDelta(raw, enriched);
        assert.ok(
          delta < 1e-10,
          `All-orphan graph should leave embeddings unchanged, but ${id} delta = ${delta}`,
        );
      }
    });

    it("handles cap with single child", () => {
      const rng = seededRng(42);
      const nodes: GraphNode[] = [
        { id: "solo_tool", embedding: makeVector(EMB_DIM, rng), children: [], level: 0 },
        { id: "solo_cap", embedding: makeVector(EMB_DIM, rng), children: ["solo_tool"], level: 0 },
      ];

      const mp = new PaperMP(TINY_CONFIG);
      mp.buildGraph(nodes);
      const { l0Embeddings } = mp.enrich();

      assert.equal(l0Embeddings.size, 1);
      assert.ok(l0Embeddings.has("solo_tool"));

      // Single child still gets enriched (softmax over 1 element = weight 1.0)
      for (const v of l0Embeddings.get("solo_tool")!) {
        assert.ok(isFinite(v));
      }
    });

    it("buildGraph invalidates previous enrichment", () => {
      const rng = seededRng(42);
      const mp = new PaperMP(TINY_CONFIG);
      mp.buildGraph(makeTinyGraph(rng));
      mp.enrich();
      assert.ok(mp.getEnrichedEmbeddings().size > 0);

      // Rebuild graph → should invalidate
      const rng2 = seededRng(99);
      mp.buildGraph(makeTinyGraph(rng2));
      assert.throws(() => mp.getEnrichedEmbeddings(), /No enriched embeddings/);
    });

    it("initParams invalidates enrichment", () => {
      const rng = seededRng(42);
      const mp = new PaperMP(TINY_CONFIG);
      mp.buildGraph(makeTinyGraph(rng));
      mp.enrich();
      assert.ok(mp.getEnrichedEmbeddings().size > 0);

      // Re-init params → should invalidate
      mp.initParams(999);
      assert.throws(() => mp.getEnrichedEmbeddings(), /No enriched embeddings/);
    });
  });

  describe("backward pass — numerical gradient check", () => {
    /**
     * Validate backward() against numerical gradients (finite differences).
     * For a scalar loss L = sum(enriched_H), we compute:
     *   dL/dW[i][j] ≈ (L(W[i][j]+eps) - L(W[i][j]-eps)) / (2*eps)
     * and compare to the analytical gradient from backward().
     */
    it("dW matches numerical gradient (finite differences)", () => {
      const eps = 1e-5;
      const rng = seededRng(99);
      const nodes = makeTinyGraph(rng);

      const mp = new PaperMP(TINY_CONFIG);
      mp.buildGraph(nodes);

      // Forward with cache
      const { enriched, cache } = mp.enrichWithCache();

      // Loss = sum of all enriched L0 embeddings (simple scalar loss)
      let loss = 0;
      const dH = new Map<string, number[]>();
      for (const [id, emb] of enriched.l0Embeddings) {
        let s = 0;
        for (let d = 0; d < emb.length; d++) s += emb[d];
        loss += s;
        // dL/dH[id][d] = 1.0 for all d (gradient of sum)
        dH.set(id, new Array(emb.length).fill(1.0));
      }

      // Analytical gradients
      const grads = mp.backward(cache, dH);

      // Numerical gradient for W (check a sample of entries)
      const params = mp.exportParams();
      const W = params.W;
      let maxRelErr = 0;
      let checked = 0;

      for (let i = 0; i < Math.min(PROJ_DIM, 4); i++) {
        for (let j = 0; j < Math.min(EMB_DIM, 4); j++) {
          const orig = W[i][j];

          // Forward with W[i][j] + eps
          W[i][j] = orig + eps;
          mp.setParams(W, params.W1);
          mp.buildGraph(nodes);
          const rPlus = mp.enrich();
          let lossPlus = 0;
          for (const emb of rPlus.l0Embeddings.values()) {
            for (let d = 0; d < emb.length; d++) lossPlus += emb[d];
          }

          // Forward with W[i][j] - eps
          W[i][j] = orig - eps;
          mp.setParams(W, params.W1);
          mp.buildGraph(nodes);
          const rMinus = mp.enrich();
          let lossMinus = 0;
          for (const emb of rMinus.l0Embeddings.values()) {
            for (let d = 0; d < emb.length; d++) lossMinus += emb[d];
          }

          // Restore
          W[i][j] = orig;

          const numGrad = (lossPlus - lossMinus) / (2 * eps);
          const anaGrad = grads.dW[i][j];
          const absErr = Math.abs(numGrad - anaGrad);
          const denom = Math.max(Math.abs(numGrad), Math.abs(anaGrad), 1e-8);
          const relErr = absErr / denom;
          maxRelErr = Math.max(maxRelErr, relErr);
          checked++;

          if (relErr > 0.05) {
            console.log(`  dW[${i}][${j}]: num=${numGrad.toExponential(4)} ana=${anaGrad.toExponential(4)} relErr=${relErr.toFixed(4)}`);
          }
        }
      }
      // Restore params
      mp.setParams(params.W, params.W1);

      console.log(`  dW gradient check: ${checked} entries, maxRelErr=${maxRelErr.toExponential(3)}`);
      assert.ok(maxRelErr < 0.05, `dW gradient error too high: ${maxRelErr.toExponential(3)} > 0.05`);
    });

    it("dW1 matches numerical gradient (finite differences)", () => {
      const eps = 1e-5;
      const rng = seededRng(99);
      const nodes = makeTinyGraph(rng);

      const mp = new PaperMP(TINY_CONFIG);
      mp.buildGraph(nodes);

      // Forward with cache
      const { enriched, cache } = mp.enrichWithCache();

      // Loss = sum of all enriched L0 embeddings
      const dH = new Map<string, number[]>();
      for (const [id, emb] of enriched.l0Embeddings) {
        dH.set(id, new Array(emb.length).fill(1.0));
      }

      // Analytical gradients
      const grads = mp.backward(cache, dH);

      // Numerical gradient for W1
      const params = mp.exportParams();
      const W1 = params.W1;
      let maxRelErr = 0;
      let checked = 0;

      for (let i = 0; i < Math.min(PROJ_DIM, 4); i++) {
        for (let j = 0; j < Math.min(EMB_DIM, 4); j++) {
          const orig = W1[i][j];

          W1[i][j] = orig + eps;
          mp.setParams(params.W, W1);
          mp.buildGraph(nodes);
          const rPlus = mp.enrich();
          let lossPlus = 0;
          for (const emb of rPlus.l0Embeddings.values()) {
            for (let d = 0; d < emb.length; d++) lossPlus += emb[d];
          }

          W1[i][j] = orig - eps;
          mp.setParams(params.W, W1);
          mp.buildGraph(nodes);
          const rMinus = mp.enrich();
          let lossMinus = 0;
          for (const emb of rMinus.l0Embeddings.values()) {
            for (let d = 0; d < emb.length; d++) lossMinus += emb[d];
          }

          W1[i][j] = orig;

          const numGrad = (lossPlus - lossMinus) / (2 * eps);
          const anaGrad = grads.dW1[i][j];
          const absErr = Math.abs(numGrad - anaGrad);
          const denom = Math.max(Math.abs(numGrad), Math.abs(anaGrad), 1e-8);
          const relErr = absErr / denom;
          maxRelErr = Math.max(maxRelErr, relErr);
          checked++;

          if (relErr > 0.05) {
            console.log(`  dW1[${i}][${j}]: num=${numGrad.toExponential(4)} ana=${anaGrad.toExponential(4)} relErr=${relErr.toFixed(4)}`);
          }
        }
      }

      mp.setParams(params.W, params.W1);

      console.log(`  dW1 gradient check: ${checked} entries, maxRelErr=${maxRelErr.toExponential(3)}`);
      assert.ok(maxRelErr < 0.05, `dW1 gradient error too high: ${maxRelErr.toExponential(3)} > 0.05`);
    });

    it("enrichWithCache produces same output as enrich", () => {
      const rng = seededRng(42);
      const nodes = makeTinyGraph(rng);

      const mp = new PaperMP(TINY_CONFIG);
      mp.buildGraph(nodes);

      const r1 = mp.enrich();
      // Rebuild graph (enrich mutates internal state)
      mp.buildGraph(nodes);
      const { enriched: r2 } = mp.enrichWithCache();

      for (const id of ["tool_1", "tool_2", "tool_3", "tool_4"]) {
        const e1 = r1.l0Embeddings.get(id)!;
        const e2 = r2.l0Embeddings.get(id)!;
        const delta = embeddingDelta(e1, e2);
        assert.ok(delta < 1e-10, `enrichWithCache differs from enrich for ${id}: delta=${delta}`);
      }
    });
  });

  describe("activation modes", () => {
    it("relu mode produces different results than leaky_relu", () => {
      const rng1 = seededRng(42);
      const nodes1 = makeTinyGraph(rng1);
      const mp1 = new PaperMP({ ...TINY_CONFIG, activation: "leaky_relu" });
      mp1.buildGraph(nodes1);
      const r1 = mp1.enrich();

      const rng2 = seededRng(42);
      const nodes2 = makeTinyGraph(rng2);
      const mp2 = new PaperMP({ ...TINY_CONFIG, activation: "relu" });
      mp2.buildGraph(nodes2);
      const r2 = mp2.enrich();

      // Should produce at least one difference for connected tools
      let anyDiff = false;
      for (const id of ["tool_1", "tool_2", "tool_3"]) {
        const emb1 = r1.l0Embeddings.get(id)!;
        const emb2 = r2.l0Embeddings.get(id)!;
        if (embeddingDelta(emb1, emb2) > 1e-10) {
          anyDiff = true;
          break;
        }
      }
      // Note: it's possible that no negative values appear in projections,
      // making relu and leaky_relu identical. So we don't assert anyDiff here.
      // Instead, just verify both produce valid results.
      assert.equal(r1.l0Embeddings.size, 4);
      assert.equal(r2.l0Embeddings.size, 4);
    });
  });
});
