import { assertEquals } from "jsr:@std/assert";
import {
  isLiveTrainingResultForBuild,
  readLiveTrainingFailure,
  readLiveTrainingResult,
  writeLiveTrainingFailure,
  writeLiveTrainingResult,
  type LiveTrainingResult,
} from "./result.ts";

Deno.test("writeLiveTrainingResult/readLiveTrainingResult round-trip raw blobs and metrics", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "vault-live-result-" });

  try {
    const result: LiveTrainingResult = {
      buildId: "build-123",
      runId: "run-abc",
      createdAt: "2026-03-06T12:30:00.000Z",
      metrics: {
        runId: "run-abc",
        buildId: "build-123",
        startedAt: "2026-03-06T12:00:00.000Z",
        finishedAt: "2026-03-06T12:30:00.000Z",
        durationMs: 1800000,
        gruWeightsSource: "loaded",
        epochs: 4,
        exampleCount: 42,
        vocabSize: 9,
        avgLoss: 0.42,
        accuracy: 0.77,
        top3Accuracy: 0.91,
        mrr: 0.83,
        majorityNextBaseline: 0.38,
      },
      gruWeights: {
        bytes: new Uint8Array([4, 5, 6]),
        vocabSize: 9,
        epoch: 4,
        accuracy: 0.77,
      },
    };

    await writeLiveTrainingResult(tempDir, result);
    const roundTrip = await readLiveTrainingResult(tempDir);

    assertEquals(roundTrip.buildId, "build-123");
    assertEquals(roundTrip.runId, "run-abc");
    assertEquals(Array.from(roundTrip.gruWeights.bytes), [4, 5, 6]);
    assertEquals(roundTrip.gruWeights.vocabSize, 9);
    assertEquals(roundTrip.gruWeights.epoch, 4);
    assertEquals(roundTrip.metrics.top3Accuracy, 0.91);
    assertEquals(roundTrip.metrics.majorityNextBaseline, 0.38);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("isLiveTrainingResultForBuild rejects stale build ids", () => {
  const result: LiveTrainingResult = {
    buildId: "build-old",
    runId: "run-abc",
    createdAt: "2026-03-06T12:30:00.000Z",
    metrics: {
      runId: "run-abc",
      buildId: "build-old",
      startedAt: "2026-03-06T12:00:00.000Z",
      finishedAt: "2026-03-06T12:30:00.000Z",
      durationMs: 1800000,
      gruWeightsSource: "initialized",
      epochs: 1,
      exampleCount: 3,
      vocabSize: 2,
      avgLoss: 1,
      accuracy: 0.5,
      top3Accuracy: 1,
      mrr: 0.75,
      majorityNextBaseline: 0.5,
    },
    gruWeights: {
      bytes: new Uint8Array([1]),
      vocabSize: 2,
      epoch: 1,
      accuracy: 0.5,
    },
  };

  assertEquals(isLiveTrainingResultForBuild(result, "build-old"), true);
  assertEquals(isLiveTrainingResultForBuild(result, "build-new"), false);
});

Deno.test("writeLiveTrainingFailure/readLiveTrainingFailure round-trip background errors", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "vault-live-failure-" });

  try {
    await writeLiveTrainingFailure(tempDir, {
      buildId: "build-err",
      failedAt: "2026-03-06T13:00:00.000Z",
      error: "node worker exploded",
    });

    const failure = await readLiveTrainingFailure(tempDir);
    assertEquals(failure, {
      buildId: "build-err",
      failedAt: "2026-03-06T13:00:00.000Z",
      error: "node worker exploded",
    });
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
