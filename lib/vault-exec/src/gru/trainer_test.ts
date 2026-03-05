// gru/trainer_test.ts
import { assertEquals } from "jsr:@std/assert";
import { focalLoss, softLabelLoss, trainEpoch, clipGradients } from "./trainer.ts";
import type { TrainingExample } from "./trainer.ts";
import { initWeights } from "./cell.ts";
import type { GRUConfig, GRUVocabulary, VocabNode } from "./types.ts";

Deno.test("focalLoss - higher loss for uncertain predictions", () => {
  const confidentLoss = focalLoss(0.9, 2.0); // high confidence
  const uncertainLoss = focalLoss(0.3, 2.0); // low confidence
  assertEquals(uncertainLoss > confidentLoss, true);
});

Deno.test("focalLoss - gamma=0 is standard CE", () => {
  const focal = focalLoss(0.5, 0);
  const ce = -Math.log(0.5);
  assertEquals(Math.abs(focal - ce) < 1e-6, true);
});

Deno.test("softLabelLoss - adds parent/children credit", () => {
  // Mock: target=1 (index), parent=2, child=0
  const probs = [0.1, 0.7, 0.2]; // target has highest prob
  const targetIdx = 1;
  const parentIdx = 2;
  const childIdx = 0;
  const alphaUp = 0.2;
  const alphaDown = 0.1;

  const loss = softLabelLoss(probs, targetIdx, parentIdx, childIdx, alphaUp, alphaDown);
  assertEquals(typeof loss, "number");
  assertEquals(loss > 0, true);
});

// --- Helpers for backprop tests ---

/** Tiny config to keep numerical gradient tractable (< 500 params) */
const TINY_CONFIG: GRUConfig = {
  inputDim: 8,
  hiddenDim: 4,
  projectionDim: 4,
  intentDim: 4,
  fusionDim: 4,
  outputDim: 8,
};

function makeTinyVocab(names: string[]): GRUVocabulary {
  const nodes: VocabNode[] = names.map((name, i) => ({
    name,
    level: 0,
    embedding: Array.from(
      { length: TINY_CONFIG.inputDim },
      (_, j) => Math.sin((i + 1) * 37 + j * 7) * 0.5,
    ),
  }));
  return {
    nodes,
    nameToIndex: new Map(names.map((n, i) => [n, i])),
    indexToName: names,
  };
}

function makeTinyExamples(vocab: GRUVocabulary): TrainingExample[] {
  const names = vocab.indexToName;
  return [
    {
      intentEmb: Array.from({ length: TINY_CONFIG.inputDim }, (_, i) => Math.cos(i) * 0.3),
      path: [names[0], names[1]],
      targetIdx: 1,
      parentIdx: null,
      childIdx: null,
    },
    {
      intentEmb: Array.from({ length: TINY_CONFIG.inputDim }, (_, i) => Math.sin(i) * 0.3),
      path: [names[1], names[2]],
      targetIdx: 2,
      parentIdx: null,
      childIdx: null,
    },
    {
      intentEmb: Array.from({ length: TINY_CONFIG.inputDim }, (_, i) => Math.cos(i + 1) * 0.3),
      path: [names[0], names[2]],
      targetIdx: 2,
      parentIdx: null,
      childIdx: null,
    },
  ];
}

// --- Backprop tests ---

Deno.test("trainEpoch reduces loss over multiple epochs", () => {
  const vocab = makeTinyVocab(["A", "B", "C"]);
  const weights = initWeights(TINY_CONFIG);
  const examples = makeTinyExamples(vocab);
  const lr = 0.01;

  const numEpochs = 10;
  const losses: number[] = [];
  for (let epoch = 0; epoch < numEpochs; epoch++) {
    const { avgLoss } = trainEpoch(
      examples, weights, vocab, TINY_CONFIG, lr, 2.0,
    );
    losses.push(avgLoss);
  }

  // Check that the minimum loss in the last 5 epochs is lower than the first.
  // This is more robust than comparing epoch 0 vs last epoch, because
  // Adam with random init can have non-monotonic loss trajectories.
  const lastHalf = losses.slice(numEpochs / 2);
  const minLastHalf = Math.min(...lastHalf);
  assertEquals(
    minLastHalf < losses[0],
    true,
    `Expected loss to decrease: epoch0=${losses[0].toFixed(4)}, minLast5=${minLastHalf.toFixed(4)}, all=[${losses.map(l => l.toFixed(4)).join(", ")}]`,
  );
});

Deno.test("gradient clipping limits update magnitude", () => {
  // Gradient vector with norm > 1.0
  const grads = [3.0, 4.0]; // norm = 5.0
  const clipped = clipGradients(grads, 1.0);

  // After clipping, norm should be exactly 1.0
  const clippedNorm = Math.sqrt(clipped[0] ** 2 + clipped[1] ** 2);
  assertEquals(Math.abs(clippedNorm - 1.0) < 1e-6, true,
    `Expected clipped norm ~1.0, got ${clippedNorm}`);

  // Direction should be preserved (ratio stays the same)
  assertEquals(Math.abs(clipped[0] / clipped[1] - 3.0 / 4.0) < 1e-6, true,
    "Gradient direction should be preserved after clipping");
});

Deno.test("gradient clipping is no-op for small gradients", () => {
  const grads = [0.1, 0.2, 0.3]; // norm = 0.374...
  const clipped = clipGradients(grads, 1.0);

  // Should be unchanged
  for (let i = 0; i < grads.length; i++) {
    assertEquals(clipped[i], grads[i],
      `Gradient ${i} should be unchanged when norm < maxNorm`);
  }
});

Deno.test("trainEpoch with empty examples returns zeros", () => {
  const vocab = makeTinyVocab(["X"]);
  const weights = initWeights(TINY_CONFIG);
  const { avgLoss, accuracy } = trainEpoch(
    [], weights, vocab, TINY_CONFIG, 0.1,
  );
  assertEquals(avgLoss, 0);
  assertEquals(accuracy, 0);
});
