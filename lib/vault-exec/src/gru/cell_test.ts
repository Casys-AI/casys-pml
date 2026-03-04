import { assertEquals } from "jsr:@std/assert";
import { gruStep, initWeights } from "./cell.ts";
import { DEFAULT_GRU_CONFIG } from "./types.ts";

Deno.test("gruStep - produces hidden state of correct dimension", () => {
  const config = DEFAULT_GRU_CONFIG;
  const weights = initWeights(config);
  const input = Array.from(
    { length: config.inputDim },
    (_, i) => Math.sin(i) * 0.1,
  );
  const hPrev = new Array(config.hiddenDim).fill(0);
  const intent = Array.from(
    { length: config.inputDim },
    (_, i) => Math.cos(i) * 0.1,
  );
  const { hNew, logits } = gruStep(input, hPrev, intent, weights, config);
  assertEquals(hNew.length, config.hiddenDim);
  assertEquals(logits.length, config.outputDim);
});

Deno.test("gruStep - different inputs produce different outputs", () => {
  const config = DEFAULT_GRU_CONFIG;
  const weights = initWeights(config);
  const hPrev = new Array(config.hiddenDim).fill(0);
  const intent = Array.from({ length: config.inputDim }, () => 0.1);
  const inputA = Array.from(
    { length: config.inputDim },
    (_, i) => Math.sin(i) * 0.1,
  );
  const inputB = Array.from(
    { length: config.inputDim },
    (_, i) => Math.cos(i) * 0.1,
  );
  const resultA = gruStep(inputA, hPrev, intent, weights, config);
  const resultB = gruStep(inputB, hPrev, intent, weights, config);
  const same = resultA.logits.every(
    (v, i) => Math.abs(v - resultB.logits[i]) < 1e-10,
  );
  assertEquals(same, false);
});

Deno.test("initWeights - creates weights with correct dimensions", () => {
  const config = DEFAULT_GRU_CONFIG;
  const weights = initWeights(config);
  assertEquals(weights.W_input.length, config.projectionDim);
  assertEquals(weights.W_input[0].length, config.inputDim);
  assertEquals(weights.W_z.length, config.hiddenDim);
  assertEquals(weights.W_z[0].length, config.projectionDim);
  assertEquals(weights.W_fusion.length, config.fusionDim);
  assertEquals(
    weights.W_fusion[0].length,
    config.hiddenDim + config.intentDim,
  );
  assertEquals(weights.W_output.length, config.outputDim);
  assertEquals(weights.W_output[0].length, config.fusionDim);
});
