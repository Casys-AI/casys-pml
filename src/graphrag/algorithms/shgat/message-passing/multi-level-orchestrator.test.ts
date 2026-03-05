/**
 * Tests for E→V downward residual in MultiLevelOrchestrator
 *
 * Run: deno test --allow-all src/graphrag/algorithms/shgat/message-passing/multi-level-orchestrator.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/assert_almost_equals.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function gammaDown(nParents: number, A: number, B: number): number {
  return sigmoid(A * Math.log(nParents + 1) + B);
}

Deno.test("E→V residual: gamma formula produces expected values", () => {
  const A = 1.0, B = 1.5;
  const g1 = gammaDown(1, A, B);
  assert(g1 > 0.8, `γ(1 parent) = ${g1} should be > 0.8 (protect tools)`);

  const g5 = gammaDown(5, A, B);
  assert(g5 > 0.7, `γ(5 parents) = ${g5} should be > 0.7`);

  console.log(`  γ(1)=${g1.toFixed(4)}, γ(5)=${g5.toFixed(4)}, γ(10)=${gammaDown(10, A, B).toFixed(4)}`);
});

Deno.test("E→V residual: convex combination preserves embedding scale", () => {
  const gamma = 0.85;
  const H_original = [1.0, 0.5, -0.3, 0.8];
  const H_MP = [0.9, 0.6, -0.1, 0.7];

  const H_result = H_original.map((val, d) => (1 - gamma) * H_MP[d] + gamma * val);

  const distToOrig = Math.sqrt(H_result.reduce((s, v, d) => s + (v - H_original[d]) ** 2, 0));
  const distToMP = Math.sqrt(H_result.reduce((s, v, d) => s + (v - H_MP[d]) ** 2, 0));

  assert(distToOrig < distToMP,
    `With γ=${gamma}, result should be closer to original than MP`);
});

Deno.test("E→V residual: backward gradient computation", () => {
  const gamma = 0.85;
  const H_original = [1.0, 0.5];
  const H_MP = [0.8, 0.6];
  const dH = [0.1, -0.2];

  let dGamma = 0;
  for (let d = 0; d < 2; d++) {
    dGamma += (H_original[d] - H_MP[d]) * dH[d];
  }
  assertAlmostEquals(dGamma, 0.04, 1e-6);

  const sigmoidDeriv = gamma * (1 - gamma);
  const nParents = 3;
  const dA = dGamma * sigmoidDeriv * Math.log(nParents + 1);
  const dB = dGamma * sigmoidDeriv;

  assert(isFinite(dA) && isFinite(dB), `dA=${dA}, dB=${dB} should be finite`);
  console.log(`  dGamma=${dGamma.toFixed(6)}, dA=${dA.toFixed(6)}, dB=${dB.toFixed(6)}`);
});

Deno.test("E→V residual: without evResidualA/B, additive fallback", () => {
  const H_pre = [1.0, 0.5, -0.3];
  const H_concat = [0.1, 0.2, -0.1];
  const H_additive = H_pre.map((v, d) => v + H_concat[d]);

  assertAlmostEquals(H_additive[0], 1.1, 1e-6);
  assertAlmostEquals(H_additive[1], 0.7, 1e-6);
  assertAlmostEquals(H_additive[2], -0.4, 1e-6);
});

Deno.test("E→V residual: V→E vs E→V gamma direction is correct", () => {
  // V→E: more children → LOWER gamma → MP dominates
  const veA = -1.0, veB = 0.5;
  const veG1 = sigmoid(veA * Math.log(2) + veB);
  const veG10 = sigmoid(veA * Math.log(11) + veB);
  assert(veG10 < veG1, `V→E: γ should decrease with more children`);

  // E→V: more parents → HIGHER gamma → tools protected
  const evA = 1.0, evB = 1.5;
  const evG1 = sigmoid(evA * Math.log(2) + evB);
  const evG10 = sigmoid(evA * Math.log(11) + evB);
  assert(evG10 > evG1, `E→V: γ should increase with more parents`);

  console.log(`  V→E: γ(1)=${veG1.toFixed(3)}, γ(10)=${veG10.toFixed(3)}`);
  console.log(`  E→V: γ(1)=${evG1.toFixed(3)}, γ(10)=${evG10.toFixed(3)}`);
});
