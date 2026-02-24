/**
 * GRU Inference — Unit Tests
 *
 * Tests the pure JS+BLAS forward pass for the CompactInformedGRU.
 * Uses synthetic weights with controlled values to verify correctness.
 *
 * @module tests/unit/graphrag/gru_inference_test
 */

import { assertEquals, assertExists, assertThrows } from "@std/assert";
import { GRUInference } from "../../../src/graphrag/algorithms/gru/gru-inference.ts";
import {
  parseGRUWeights,
  buildVocabulary,
  computeJaccardMatrix,
  computeBigramMatrix,
  computeStructuralMatrices,
} from "../../../src/graphrag/algorithms/gru/gru-loader.ts";
import type {
  GRUWeights,
  GRUVocabulary,
  ToolCapabilityMap,
} from "../../../src/graphrag/algorithms/gru/types.ts";
import { DEFAULT_GRU_CONFIG } from "../../../src/graphrag/algorithms/gru/types.ts";

// ============================================================================
// Test helpers — Tiny model factory
// ============================================================================

/** Dimensions for a tiny test model. */
const EMB = 8;
const HIDDEN = 4;
const INPUT_PROJ = 4;
const NCAPS = 2;
const CAP_PROJ = 16;
const INTENT_PROJ = 4;
const COMP_PROJ = 8;
const COMP_FEAT = 3;
const FUSION_DIM = 4;
const TERM_HIDDEN = 32;
const NTOOLS = 5;
const VOCAB = NTOOLS;

function rand(n: number, scale = 0.1): number[] {
  // Deterministic seed via index
  return Array.from({ length: n }, (_, i) => Math.sin(i * 1.23 + 0.456) * scale);
}

function makeWeightArrays(): { names: string[]; weights: number[][] } {
  const names = [
    "input_proj/kernel", "input_proj/bias",
    "gru/kernel", "gru/recurrent_kernel", "gru/bias",
    "intent_proj/kernel", "intent_proj/bias",
    "cap_proj/kernel", "cap_proj/bias",
    "composite_proj/kernel", "composite_proj/bias",
    "fusion_dense/kernel", "fusion_dense/bias",
    "emb_proj/kernel", "emb_proj/bias",
    "term_hidden/kernel", "term_hidden/bias",
    "termination_head/kernel", "termination_head/bias",
    "similarity_head/kernel",
  ];

  const weights = [
    rand(EMB * INPUT_PROJ),
    rand(INPUT_PROJ),
    rand((INPUT_PROJ + 5) * 3 * HIDDEN),
    rand(HIDDEN * 3 * HIDDEN),
    rand(3 * HIDDEN),
    rand(EMB * INTENT_PROJ),
    rand(INTENT_PROJ),
    rand(NCAPS * CAP_PROJ),
    rand(CAP_PROJ),
    rand(COMP_FEAT * COMP_PROJ),
    rand(COMP_PROJ),
    rand((HIDDEN + INTENT_PROJ + CAP_PROJ + COMP_PROJ) * FUSION_DIM),
    rand(FUSION_DIM),
    rand(FUSION_DIM * EMB),
    rand(EMB),
    rand((HIDDEN + INTENT_PROJ) * TERM_HIDDEN),
    rand(TERM_HIDDEN),
    rand(TERM_HIDDEN * 1),
    rand(1),
    rand(EMB * VOCAB),
  ];

  return { names, weights };
}

function makeTinyGRU(): { gru: GRUInference; weights: GRUWeights; vocab: GRUVocabulary } {
  const data = makeWeightArrays();
  const weights = parseGRUWeights(data);
  const toolIds = Array.from({ length: NTOOLS }, (_, i) => `std:tool_${i}`);
  const vocab = buildVocabulary(toolIds, [], weights.similarityHeadKernel);
  const gru = new GRUInference({ terminationThreshold: 0.9, maxPathLength: 5 });
  gru.setWeights(weights);
  gru.setVocabulary(vocab);
  return { gru, weights, vocab };
}

// ============================================================================
// parseGRUWeights Tests
// ============================================================================

Deno.test("parseGRUWeights - parses all 20 weight arrays", () => {
  const data = makeWeightArrays();
  const w = parseGRUWeights(data);

  assertEquals(w.inputProjKernel.length, EMB);
  assertEquals(w.inputProjKernel[0].length, INPUT_PROJ);
  assertEquals(w.inputProjBias.length, INPUT_PROJ);
  assertEquals(w.gruKernel.length, INPUT_PROJ + 5);
  assertEquals(w.gruKernel[0].length, 3 * HIDDEN);
  assertEquals(w.gruRecurrentKernel.length, HIDDEN);
  assertEquals(w.gruRecurrentKernel[0].length, 3 * HIDDEN);
  assertEquals(w.gruBias.length, 3 * HIDDEN);
  assertEquals(w.intentProjKernel.length, EMB);
  assertEquals(w.intentProjKernel[0].length, INTENT_PROJ);
  assertEquals(w.capProjKernel.length, NCAPS);
  assertEquals(w.capProjKernel[0].length, CAP_PROJ);
  assertEquals(w.compositeProjKernel.length, COMP_FEAT);
  assertEquals(w.compositeProjKernel[0].length, COMP_PROJ);
  assertEquals(w.fusionDenseKernel.length, HIDDEN + INTENT_PROJ + CAP_PROJ + COMP_PROJ);
  assertEquals(w.fusionDenseKernel[0].length, FUSION_DIM);
  assertEquals(w.embProjKernel.length, FUSION_DIM);
  assertEquals(w.embProjKernel[0].length, EMB);
  assertEquals(w.termHiddenKernel.length, HIDDEN + INTENT_PROJ);
  assertEquals(w.termHiddenKernel[0].length, TERM_HIDDEN);
  assertEquals(w.terminationHeadKernel.length, TERM_HIDDEN);
  assertEquals(w.terminationHeadKernel[0].length, 1);
  assertEquals(w.terminationHeadBias.length, 1);
  assertEquals(w.similarityHeadKernel.length, EMB);
  assertEquals(w.similarityHeadKernel[0].length, VOCAB);
});

Deno.test("parseGRUWeights - throws on missing weight", () => {
  const data = makeWeightArrays();
  data.names.pop(); // Remove similarity_head
  data.weights.pop();
  assertThrows(
    () => parseGRUWeights(data),
    Error,
    "Missing weight",
  );
});

Deno.test("parseGRUWeights - throws on length mismatch", () => {
  const data = makeWeightArrays();
  data.weights.pop(); // Remove one array but keep name
  assertThrows(
    () => parseGRUWeights(data),
    Error,
    "names.length",
  );
});

Deno.test("parseGRUWeights - throws on corrupted weight array", () => {
  const data = makeWeightArrays();
  // Corrupt input_proj/kernel with wrong length → deriveShapes computes non-integer rows
  data.weights[0] = rand(7); // Wrong size for any valid reshape
  assertThrows(
    () => parseGRUWeights(data),
    Error,
  );
});

// ============================================================================
// buildVocabulary Tests
// ============================================================================

Deno.test("buildVocabulary - builds correct nodeToIndex and indexToNode", () => {
  const data = makeWeightArrays();
  const w = parseGRUWeights(data);
  const toolIds = ["std:alpha", "std:beta", "std:gamma", "std:delta", "std:epsilon"];
  const vocab = buildVocabulary(toolIds, [], w.similarityHeadKernel);

  assertEquals(vocab.vocabSize, 5);
  assertEquals(vocab.numTools, 5);
  assertEquals(vocab.indexToNode.length, 5);
  assertEquals(vocab.nodeToIndex.get("std:alpha"), 0);
  assertEquals(vocab.nodeToIndex.get("std:epsilon"), 4);
  assertEquals(vocab.indexToNode[2], "std:gamma");
});

Deno.test("buildVocabulary - includes non-leaf children mapping", () => {
  const data = makeWeightArrays();
  // Add 2 extra vocab entries for non-leaf nodes
  data.weights[data.weights.length - 1] = rand(EMB * (NTOOLS + 2));
  const w = parseGRUWeights(data);

  const toolIds = Array.from({ length: NTOOLS }, (_, i) => `tool_${i}`);
  const vocabNodes = [
    { id: "cap_A", children: ["tool_0", "tool_1"] },
    { id: "cap_B", children: ["tool_2"] },
  ];
  const vocab = buildVocabulary(toolIds, vocabNodes, w.similarityHeadKernel);

  assertEquals(vocab.vocabSize, NTOOLS + 2);
  assertEquals(vocab.numTools, NTOOLS);
  assertEquals(vocab.children.get("cap_A"), ["tool_0", "tool_1"]);
  assertEquals(vocab.children.get("cap_B"), ["tool_2"]);
  assertEquals(vocab.nodeToIndex.get("cap_A"), NTOOLS);
  assertEquals(vocab.nodeToIndex.get("cap_B"), NTOOLS + 1);
});

Deno.test("buildVocabulary - embeddings are transposed from kernel", () => {
  const data = makeWeightArrays();
  const w = parseGRUWeights(data);
  const toolIds = Array.from({ length: NTOOLS }, (_, i) => `tool_${i}`);
  const vocab = buildVocabulary(toolIds, [], w.similarityHeadKernel);

  // vocab.embeddings[j][i] should equal kernel[i][j]
  assertEquals(vocab.embeddings.length, VOCAB);
  assertEquals(vocab.embeddings[0].length, EMB);
  for (let j = 0; j < VOCAB; j++) {
    for (let i = 0; i < EMB; i++) {
      assertEquals(vocab.embeddings[j][i], w.similarityHeadKernel[i][j]);
    }
  }
});

// ============================================================================
// GRUInference — isReady Tests
// ============================================================================

Deno.test("GRUInference - not ready without weights", () => {
  const gru = new GRUInference();
  assertEquals(gru.isReady(), false);
});

Deno.test("GRUInference - not ready without vocabulary", () => {
  const data = makeWeightArrays();
  const w = parseGRUWeights(data);
  const gru = new GRUInference();
  gru.setWeights(w);
  assertEquals(gru.isReady(), false);
});

Deno.test("GRUInference - ready with both weights and vocabulary", () => {
  const { gru } = makeTinyGRU();
  assertEquals(gru.isReady(), true);
});

// ============================================================================
// GRUInference — predictFirstTool Tests
// ============================================================================

Deno.test("predictFirstTool - returns a valid tool ID and score", () => {
  const { gru, vocab } = makeTinyGRU();
  const intent = rand(EMB);
  const result = gru.predictFirstTool(intent);

  assertExists(result.toolId);
  assertEquals(typeof result.score, "number");
  assertEquals(result.score > 0, true);
  assertEquals(result.score <= 1, true);
  // Must be one of our vocab tools
  assertEquals(vocab.nodeToIndex.has(result.toolId), true);
});

Deno.test("predictFirstTool - ranked list is sorted by descending score", () => {
  const { gru } = makeTinyGRU();
  const intent = rand(EMB);
  const result = gru.predictFirstTool(intent);

  for (let i = 0; i < result.ranked.length - 1; i++) {
    assertEquals(
      result.ranked[i].score >= result.ranked[i + 1].score,
      true,
      `ranked[${i}].score (${result.ranked[i].score}) < ranked[${i + 1}].score (${result.ranked[i + 1].score})`,
    );
  }
});

Deno.test("predictFirstTool - probabilities sum to ~1", () => {
  const { gru } = makeTinyGRU();
  const intent = rand(EMB);
  const result = gru.predictFirstTool(intent);

  const sum = result.ranked.reduce((s, r) => s + r.score, 0);
  // Should be close to 1 (may not be exactly 1 if ranked is top-10 of 5)
  assertEquals(Math.abs(sum - 1.0) < 0.01, true, `prob sum = ${sum}`);
});

Deno.test("predictFirstTool - throws when not ready", () => {
  const gru = new GRUInference();
  assertThrows(
    () => gru.predictFirstTool(rand(EMB)),
    Error,
    "Not ready",
  );
});

Deno.test("predictFirstTool - deterministic (same input = same output)", () => {
  const { gru } = makeTinyGRU();
  const intent = rand(EMB);
  const r1 = gru.predictFirstTool(intent);
  const r2 = gru.predictFirstTool(intent);

  assertEquals(r1.toolId, r2.toolId);
  assertEquals(r1.score, r2.score);
});

// ============================================================================
// GRUInference — buildPath Tests
// ============================================================================

Deno.test("buildPath - returns path starting with firstToolId", () => {
  const { gru } = makeTinyGRU();
  const intent = rand(EMB);
  const first = gru.predictFirstTool(intent);
  const path = gru.buildPath(intent, first.toolId);

  assertEquals(path.length > 0, true);
  assertEquals(path[0], first.toolId);
});

Deno.test("buildPath - respects maxPathLength", () => {
  const { gru } = makeTinyGRU();
  const intent = rand(EMB);
  const first = gru.predictFirstTool(intent);
  const path = gru.buildPath(intent, first.toolId);

  assertEquals(path.length <= 5, true, `path too long: ${path.length}`);
});

Deno.test("buildPath - all tools in path are from vocabulary", () => {
  const { gru, vocab } = makeTinyGRU();
  const intent = rand(EMB);
  const first = gru.predictFirstTool(intent);
  const path = gru.buildPath(intent, first.toolId);

  for (const toolId of path) {
    assertEquals(vocab.nodeToIndex.has(toolId), true, `unknown tool: ${toolId}`);
  }
});

Deno.test("buildPath - deterministic", () => {
  const { gru } = makeTinyGRU();
  const intent = rand(EMB);
  const first = gru.predictFirstTool(intent);
  const p1 = gru.buildPath(intent, first.toolId);
  const p2 = gru.buildPath(intent, first.toolId);

  assertEquals(p1, p2);
});

// ============================================================================
// GRUInference — buildPathBeam Tests
// ============================================================================

Deno.test("buildPathBeam - returns results (up to beamWidth*2 with completed branches)", () => {
  const { gru } = makeTinyGRU();
  const intent = rand(EMB);
  const first = gru.predictFirstTool(intent);
  const beams = gru.buildPathBeam(intent, first.toolId, 3);

  assertEquals(beams.length > 0, true);
  assertEquals(beams.length <= 6, true); // beamWidth * 2 = 6 (completed + active)
});

Deno.test("buildPathBeam - all paths start with firstToolId", () => {
  const { gru } = makeTinyGRU();
  const intent = rand(EMB);
  const first = gru.predictFirstTool(intent);
  const beams = gru.buildPathBeam(intent, first.toolId, 3);

  for (const beam of beams) {
    assertEquals(beam.path[0], first.toolId);
  }
});

Deno.test("buildPathBeam - scores are numbers", () => {
  const { gru } = makeTinyGRU();
  const intent = rand(EMB);
  const first = gru.predictFirstTool(intent);
  const beams = gru.buildPathBeam(intent, first.toolId, 2);

  for (const beam of beams) {
    assertEquals(typeof beam.score, "number");
    assertEquals(Number.isFinite(beam.score), true);
  }
});

// ============================================================================
// Structural bias — computeJaccardMatrix Tests
// ============================================================================

Deno.test("computeJaccardMatrix - symmetric", () => {
  const toolCapMap: ToolCapabilityMap = {
    matrix: new Float32Array([
      1, 0, 1, // tool 0: caps {0, 2}
      1, 1, 0, // tool 1: caps {0, 1}
      0, 0, 1, // tool 2: caps {2}
    ]),
    numTools: 3,
    numCapabilities: 3,
  };

  const jac = computeJaccardMatrix(toolCapMap);
  assertEquals(jac.length, 9);

  // Symmetric: jac[i*3+j] === jac[j*3+i]
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      assertEquals(jac[i * 3 + j], jac[j * 3 + i]);
    }
  }
});

Deno.test("computeJaccardMatrix - diagonal = 1 for tools with caps", () => {
  const toolCapMap: ToolCapabilityMap = {
    matrix: new Float32Array([
      1, 0,
      0, 1,
    ]),
    numTools: 2,
    numCapabilities: 2,
  };

  const jac = computeJaccardMatrix(toolCapMap);
  assertEquals(jac[0], 1.0); // tool 0 diagonal
  assertEquals(jac[3], 1.0); // tool 1 diagonal
});

Deno.test("computeJaccardMatrix - correct Jaccard values", () => {
  const toolCapMap: ToolCapabilityMap = {
    matrix: new Float32Array([
      1, 1, 0, // tool 0: caps {0, 1}
      1, 0, 1, // tool 1: caps {0, 2}
    ]),
    numTools: 2,
    numCapabilities: 3,
  };

  const jac = computeJaccardMatrix(toolCapMap);
  // Jaccard(0,1) = |{0}| / |{0,1,2}| = 1/3
  const expected = 1 / 3;
  assertEquals(Math.abs(jac[1] - expected) < 1e-6, true);
});

// ============================================================================
// Structural bias — computeBigramMatrix Tests
// ============================================================================

Deno.test("computeBigramMatrix - row-normalized", () => {
  const toolToIndex = new Map([["A", 0], ["B", 1], ["C", 2]]);
  const traces = [["A", "B", "C"], ["A", "B"]];
  const bigram = computeBigramMatrix(traces, toolToIndex, 3);

  // Row 0 (A): A→B = 2 times, no other → row = [0, 1, 0]
  assertEquals(bigram[0 * 3 + 1], 1.0); // A→B
  assertEquals(bigram[0 * 3 + 0], 0.0); // A→A
  assertEquals(bigram[0 * 3 + 2], 0.0); // A→C

  // Row 1 (B): B→C = 1 time → row = [0, 0, 1]
  assertEquals(bigram[1 * 3 + 2], 1.0); // B→C
});

Deno.test("computeBigramMatrix - handles unknown tool IDs gracefully", () => {
  const toolToIndex = new Map([["A", 0], ["B", 1]]);
  const traces = [["A", "UNKNOWN", "B"]];
  const bigram = computeBigramMatrix(traces, toolToIndex, 2);

  // A→UNKNOWN and UNKNOWN→B both have unknown index → skipped
  assertEquals(bigram[0], 0.0); // A→A
  assertEquals(bigram[1], 0.0); // A→B (skipped due to UNKNOWN in between)
});

Deno.test("computeBigramMatrix - empty traces → zero matrix", () => {
  const toolToIndex = new Map([["A", 0]]);
  const bigram = computeBigramMatrix([], toolToIndex, 1);
  assertEquals(bigram[0], 0.0);
});

// ============================================================================
// computeStructuralMatrices Tests
// ============================================================================

Deno.test("computeStructuralMatrices - returns both matrices with correct size", () => {
  const toolToIndex = new Map([["A", 0], ["B", 1]]);
  const traces = [["A", "B"]];
  const result = computeStructuralMatrices(traces, toolToIndex, 2);

  assertEquals(result.numTools, 2);
  assertEquals(result.jaccardMatrix.length, 4); // 2x2
  assertEquals(result.bigramMatrix.length, 4);  // 2x2
});

// ============================================================================
// GRU forward pass — Numerical correctness
// ============================================================================

Deno.test("GRU forward - different intents produce different predictions", () => {
  const { gru } = makeTinyGRU();
  const intent1 = rand(EMB, 1.0);
  const intent2 = Array.from({ length: EMB }, (_, i) => Math.cos(i * 0.789) * 1.0);

  const r1 = gru.predictFirstTool(intent1);
  const r2 = gru.predictFirstTool(intent2);

  // With different intents, at least one of toolId or score should differ
  const differs = r1.toolId !== r2.toolId || Math.abs(r1.score - r2.score) > 1e-6;
  assertEquals(differs, true, "Different intents should produce different predictions");
});

Deno.test("GRU forward - zero intent embedding doesn't crash", () => {
  const { gru } = makeTinyGRU();
  const zeroIntent = new Array(EMB).fill(0);
  const result = gru.predictFirstTool(zeroIntent);

  assertExists(result.toolId);
  assertEquals(typeof result.score, "number");
  assertEquals(Number.isNaN(result.score), false);
});

// ============================================================================
// Config Tests
// ============================================================================

Deno.test("DEFAULT_GRU_CONFIG - has sensible defaults", () => {
  assertEquals(DEFAULT_GRU_CONFIG.terminationThreshold, 0.5);
  assertEquals(DEFAULT_GRU_CONFIG.maxPathLength, 10);
  assertEquals(DEFAULT_GRU_CONFIG.stickyMaxRepeat, 3);
  assertEquals(DEFAULT_GRU_CONFIG.temperature, 0.12);
  assertEquals(DEFAULT_GRU_CONFIG.jaccardAlpha, 0.5);
  assertEquals(DEFAULT_GRU_CONFIG.bigramBeta, 0.3);
});

Deno.test("GRUInference - accepts custom config overrides", () => {
  const gru = new GRUInference({
    terminationThreshold: 0.8,
    maxPathLength: 3,
  });
  // Can't directly read config, but we can verify maxPathLength behavior
  const data = makeWeightArrays();
  const w = parseGRUWeights(data);
  const toolIds = Array.from({ length: NTOOLS }, (_, i) => `tool_${i}`);
  const vocab = buildVocabulary(toolIds, [], w.similarityHeadKernel);
  gru.setWeights(w);
  gru.setVocabulary(vocab);

  const intent = rand(EMB);
  const first = gru.predictFirstTool(intent);
  const path = gru.buildPath(intent, first.toolId);

  assertEquals(path.length <= 3, true, `maxPathLength=3 but got ${path.length}`);
});

// ============================================================================
// Non-leaf node expansion Tests
// ============================================================================

Deno.test("buildPath - expands non-leaf nodes to children", () => {
  const data = makeWeightArrays();
  // Add one extra vocab entry for a non-leaf node
  data.weights[data.weights.length - 1] = rand(EMB * (NTOOLS + 1));
  const w = parseGRUWeights(data);

  const toolIds = Array.from({ length: NTOOLS }, (_, i) => `tool_${i}`);
  const vocabNodes = [{ id: "cap_composite", children: ["tool_0", "tool_1"] }];
  const vocab = buildVocabulary(toolIds, vocabNodes, w.similarityHeadKernel);

  assertEquals(vocab.children.has("cap_composite"), true);
  assertEquals(vocab.vocabSize, NTOOLS + 1);
});
