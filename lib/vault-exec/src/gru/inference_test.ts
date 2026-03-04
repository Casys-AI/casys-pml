import { assertEquals } from "jsr:@std/assert";
import { GRUInference } from "./inference.ts";
import { initWeights } from "./cell.ts";
import { DEFAULT_GRU_CONFIG } from "./types.ts";
import type { GRUVocabulary, VocabNode } from "./types.ts";

function makeVocab(names: string[]): GRUVocabulary {
  const nodes: VocabNode[] = names.map((name, i) => ({
    name,
    level: i === 0 ? 0 : 1,
    embedding: Array.from(
      { length: 1024 },
      (_, j) => Math.sin(i * 100 + j) * 0.1,
    ),
  }));
  return {
    nodes,
    nameToIndex: new Map(names.map((n, i) => [n, i])),
    indexToName: names,
  };
}

Deno.test("GRUInference - predictNext returns valid node name", () => {
  const config = DEFAULT_GRU_CONFIG;
  const weights = initWeights(config);
  const vocab = makeVocab(["A", "B", "C"]);
  const gru = new GRUInference(weights, vocab, config);
  const intent = Array.from(
    { length: 1024 },
    (_, i) => Math.cos(i) * 0.1,
  );
  const result = gru.predictNext(intent, []);
  assertEquals(vocab.nameToIndex.has(result.name), true);
  assertEquals(typeof result.score, "number");
});

Deno.test("GRUInference - buildPath returns sequence ending within maxLen", () => {
  const config = DEFAULT_GRU_CONFIG;
  const weights = initWeights(config);
  const vocab = makeVocab(["Leaf", "Mid", "Top"]);
  const gru = new GRUInference(weights, vocab, config);
  const intent = Array.from(
    { length: 1024 },
    (_, i) => Math.sin(i) * 0.1,
  );
  const path = gru.buildPath(intent, 5);
  assertEquals(path.length > 0, true);
  assertEquals(path.length <= 5, true);
  for (const step of path) {
    assertEquals(vocab.nameToIndex.has(step), true);
  }
});

Deno.test("GRUInference - buildPathBeam returns multiple candidates", () => {
  const config = DEFAULT_GRU_CONFIG;
  const weights = initWeights(config);
  const vocab = makeVocab(["A", "B", "C", "D"]);
  const gru = new GRUInference(weights, vocab, config);
  const intent = Array.from({ length: 1024 }, () => 0.1);
  const beams = gru.buildPathBeam(intent, 3, 5);
  assertEquals(beams.length > 0, true);
  for (const beam of beams) {
    assertEquals(beam.path.length > 0, true);
    assertEquals(typeof beam.score, "number");
  }
});
