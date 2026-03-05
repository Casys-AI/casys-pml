import { assertEquals } from "jsr:@std/assert";
import { attentionScore, dotProduct, leakyRelu, softmax } from "./attention.ts";

Deno.test("leakyRelu - positive passthrough", () => {
  assertEquals(leakyRelu(5.0, 0.2), 5.0);
});

Deno.test("leakyRelu - negative scaled", () => {
  const result = leakyRelu(-5.0, 0.2);
  assertEquals(result, -1.0);
});

Deno.test("softmax - produces valid distribution", () => {
  const result = softmax([1.0, 2.0, 3.0]);
  const sum = result.reduce((a, b) => a + b, 0);
  assertEquals(Math.abs(sum - 1.0) < 1e-6, true);
  assertEquals(result[2] > result[1], true);
  assertEquals(result[1] > result[0], true);
});

Deno.test("softmax - handles single element", () => {
  const result = softmax([42.0]);
  assertEquals(result.length, 1);
  assertEquals(Math.abs(result[0] - 1.0) < 1e-6, true);
});

Deno.test("dotProduct - computes correctly", () => {
  const result = dotProduct([1, 2, 3], [4, 5, 6]);
  assertEquals(result, 32);
});

Deno.test("attentionScore - GAT concat attention", () => {
  const childProj = [0.5, 0.3];
  const parentProj = [0.2, 0.4];
  const a = [1.0, 1.0, 1.0, 1.0];
  const score = attentionScore(childProj, parentProj, a, 0.2);
  assertEquals(typeof score, "number");
  assertEquals(isNaN(score), false);
});
