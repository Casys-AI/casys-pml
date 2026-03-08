import { assertEquals } from "jsr:@std/assert";

import { trainGruDataset } from "./training-session.ts";
import type { GRUConfig, GRUVocabulary } from "./types.ts";

const TEST_CONFIG: GRUConfig = {
  inputDim: 8,
  hiddenDim: 4,
  projectionDim: 4,
  intentDim: 4,
  fusionDim: 4,
  outputDim: 8,
};

const TEST_VOCAB: GRUVocabulary = {
  nodes: [
    { name: "tool.exec.git_vcs", level: 2, embedding: new Array(8).fill(0.1) },
    { name: "tool.read.relative_path", level: 2, embedding: new Array(8).fill(0.2) },
  ],
  nameToIndex: new Map([
    ["tool.exec.git_vcs", 0],
    ["tool.read.relative_path", 1],
  ]),
  indexToName: ["tool.exec.git_vcs", "tool.read.relative_path"],
};

Deno.test("trainGruDataset treats empty example sets as a defined no-op", async () => {
  const result = await trainGruDataset({
    vocab: TEST_VOCAB,
    examples: [],
    config: TEST_CONFIG,
    maxEpochs: 1,
  });

  assertEquals(result.exampleCount, 0);
  assertEquals(result.vocabSize, 2);
  assertEquals(result.epochs, 0);
  assertEquals(result.avgLoss, 0);
  assertEquals(result.accuracy, 0);
  assertEquals(result.history, []);
  assertEquals(result.weightsBlob.length > 0, true);
});
