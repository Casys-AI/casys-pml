import { assertEquals, assertGreater } from "jsr:@std/assert";
import { deserializeWeights, serializeWeights } from "./weights.ts";
import type {
  GRUConfig,
  GRUVocabulary,
  GRUWeights,
  VocabNode,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWeights(
  projDim: number,
  hiddenDim: number,
  intentDim: number,
  fusionDim: number,
  inputDim: number,
  outputDim: number,
): GRUWeights {
  const zeros2d = (r: number, c: number) =>
    Array.from({ length: r }, () => new Array(c).fill(0));
  const zeros1d = (n: number) => new Array(n).fill(0);

  return {
    W_input: zeros2d(projDim, inputDim),
    b_input: zeros1d(projDim),
    W_z: zeros2d(hiddenDim, projDim),
    b_z: zeros1d(hiddenDim),
    U_z: zeros2d(hiddenDim, hiddenDim),
    W_r: zeros2d(hiddenDim, projDim),
    b_r: zeros1d(hiddenDim),
    U_r: zeros2d(hiddenDim, hiddenDim),
    W_h: zeros2d(hiddenDim, projDim),
    b_h: zeros1d(hiddenDim),
    U_h: zeros2d(hiddenDim, hiddenDim),
    W_intent: zeros2d(intentDim, inputDim),
    b_intent: zeros1d(intentDim),
    W_fusion: zeros2d(fusionDim, hiddenDim + intentDim),
    b_fusion: zeros1d(fusionDim),
    W_output: zeros2d(outputDim, fusionDim),
    b_output: zeros1d(outputDim),
    alpha_up: 0.2,
    alpha_down: 0.1,
  };
}

function makeConfig(): GRUConfig {
  return {
    inputDim: 8,
    hiddenDim: 4,
    projectionDim: 4,
    intentDim: 4,
    fusionDim: 4,
    outputDim: 8,
  };
}

function makeVocab(nodes: VocabNode[]): GRUVocabulary {
  const nameToIndex = new Map<string, number>();
  const indexToName: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    nameToIndex.set(nodes[i].name, i);
    indexToName.push(nodes[i].name);
  }
  return { nodes, nameToIndex, indexToName };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("weights round-trip: serialize then deserialize preserves data", async () => {
  const config = makeConfig();
  const weights = makeWeights(4, 4, 4, 4, 8, 8);
  // Set some non-zero values to verify fidelity
  weights.W_z[0][0] = 1.5;
  weights.b_h[2] = -0.3;
  weights.alpha_up = 0.42;

  const nodes: VocabNode[] = [
    { name: "std:psql_query", level: 0, embedding: [0.1, 0.2, 0.3] },
    { name: "std:git_status", level: 0, embedding: [0.4, 0.5, 0.6] },
    {
      name: "cap:database",
      level: 1,
      embedding: [0.7, 0.8, 0.9],
      children: ["std:psql_query"],
    },
  ];
  const vocab = makeVocab(nodes);

  const blob = await serializeWeights(weights, vocab, config);
  const result = await deserializeWeights(blob);

  // Config
  assertEquals(result.config, config);

  // Weights — spot checks
  assertEquals(result.weights.W_z[0][0], 1.5);
  assertEquals(result.weights.b_h[2], -0.3);
  assertEquals(result.weights.alpha_up, 0.42);
  assertEquals(result.weights.W_input.length, weights.W_input.length);
  assertEquals(result.weights.W_input[0].length, weights.W_input[0].length);

  // Vocab nodes
  assertEquals(result.vocab.nodes.length, 3);
  assertEquals(result.vocab.nodes[0].name, "std:psql_query");
  assertEquals(result.vocab.nodes[2].children, ["std:psql_query"]);

  // Vocab indexToName
  assertEquals(result.vocab.indexToName, [
    "std:psql_query",
    "std:git_status",
    "cap:database",
  ]);

  // Vocab nameToIndex (reconstructed Map)
  assertEquals(result.vocab.nameToIndex.size, 3);
  assertEquals(result.vocab.nameToIndex.get("std:psql_query"), 0);
  assertEquals(result.vocab.nameToIndex.get("std:git_status"), 1);
  assertEquals(result.vocab.nameToIndex.get("cap:database"), 2);

  // Embeddings preserved
  assertEquals(result.vocab.nodes[0].embedding, [0.1, 0.2, 0.3]);
});

Deno.test("weights round-trip: handles empty vocab", async () => {
  const config = makeConfig();
  const weights = makeWeights(4, 4, 4, 4, 8, 8);
  const vocab = makeVocab([]);

  const blob = await serializeWeights(weights, vocab, config);
  const result = await deserializeWeights(blob);

  assertEquals(result.vocab.nodes.length, 0);
  assertEquals(result.vocab.indexToName.length, 0);
  assertEquals(result.vocab.nameToIndex.size, 0);
});

Deno.test("compressed output is smaller than JSON", async () => {
  const config = makeConfig();
  // Use larger dimensions for meaningful compression
  const weights = makeWeights(16, 8, 8, 8, 64, 64);
  // Fill with some non-zero data (compressible pattern)
  for (let i = 0; i < weights.W_input.length; i++) {
    for (let j = 0; j < weights.W_input[i].length; j++) {
      weights.W_input[i][j] = Math.sin(i * 0.1 + j * 0.01);
    }
  }

  const nodes: VocabNode[] = Array.from({ length: 50 }, (_, i) => ({
    name: `tool:action_${i}`,
    level: 0,
    embedding: new Array(64).fill(0).map((_, j) =>
      Math.cos(i * 0.1 + j * 0.01)
    ),
  }));
  const vocab = makeVocab(nodes);

  const blob = await serializeWeights(weights, vocab, config);

  // Compute raw JSON size for comparison
  const rawJson = JSON.stringify({
    version: 1,
    weights,
    vocab: { nodes, indexToName: vocab.indexToName },
    config,
  });
  const rawSize = new TextEncoder().encode(rawJson).length;

  assertGreater(
    rawSize,
    blob.length,
    "gzipped blob should be smaller than raw JSON",
  );
});
