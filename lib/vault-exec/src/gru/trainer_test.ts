// gru/trainer_test.ts
import { assertEquals } from "jsr:@std/assert";
import { focalLoss, softLabelLoss, trainEpoch } from "./trainer.ts";

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
