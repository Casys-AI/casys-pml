import { assertEquals } from "jsr:@std/assert";
import { convexGatedResidual, additiveSkipResidual, residualGamma } from "./residual.ts";

Deno.test("residualGamma - sigmoid gate with default init", () => {
  // γ(n) = sigmoid(a*log(n+1) + b), a=-1.0, b=0.5
  const gamma1 = residualGamma(1, -1.0, 0.5);  // 1 child
  const gamma5 = residualGamma(5, -1.0, 0.5);  // 5 children
  // More children → lower gamma → less original retained
  assertEquals(gamma1 > gamma5, true);
  assertEquals(gamma1 > 0, true);
  assertEquals(gamma1 < 1, true);
});

Deno.test("convexGatedResidual - blends MP and original", () => {
  const original = [1.0, 0.0, 0.0];
  const mp = [0.0, 1.0, 0.0];
  const gamma = 0.3;
  const result = convexGatedResidual(mp, original, gamma);
  // E = (1-γ)*MP + γ*orig = 0.7*[0,1,0] + 0.3*[1,0,0] = [0.3, 0.7, 0.0]
  assertEquals(Math.abs(result[0] - 0.3) < 1e-6, true);
  assertEquals(Math.abs(result[1] - 0.7) < 1e-6, true);
  assertEquals(Math.abs(result[2] - 0.0) < 1e-6, true);
});

Deno.test("additiveSkipResidual - simple addition", () => {
  const original = [1.0, 2.0];
  const mp = [0.5, 0.3];
  const result = additiveSkipResidual(mp, original);
  assertEquals(Math.abs(result[0] - 1.5) < 1e-6, true);
  assertEquals(Math.abs(result[1] - 2.3) < 1e-6, true);
});
