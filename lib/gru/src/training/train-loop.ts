/**
 * GRU Training Loop — extracted from benchmark-e2e.ts
 *
 * Reusable training function for CompactInformedGRU with:
 * - Mixed training (prod oversampled + n8n)
 * - Per-epoch test evaluation (Hit@1/3/5, MRR, termAcc)
 * - Intra-epoch batch progress logging
 * - ETA, RSS tracking
 *
 * Used by both benchmark-e2e.ts (main training + k-fold) and any
 * standalone GRU training script.
 *
 * @module gru/training/train-loop
 */

import type { CompactInformedGRU } from "../transition/gru-model.ts";
import type { TransitionExample } from "../transition/types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GRUTrainingConfig {
  epochs: number;
  batchSize: number;
  prodOversample: number;
}

export interface GRUTrainingData {
  prodTrain: TransitionExample[];
  prodTest: TransitionExample[];
  n8nTrain: TransitionExample[];
}

export interface GRUEpochLog {
  epoch: number;
  loss: number;
  trainNext: number;
  trainTerm: number;
  testNext: number;
  testTerm: number;
  hit1: number;
  hit3: number;
  hit5: number;
  mrr: number;
  time: number;
  rssMB: number;
}

export interface GRUTrainingResult {
  bestTestHit1: number;
  bestMRR: number;
  bestEpoch: number;
  finalHit1: number;
  finalHit3: number;
  finalHit5: number;
  finalMRR: number;
  epochLog: GRUEpochLog[];
  trainTimeSec: number;
}

// ---------------------------------------------------------------------------
// Test evaluation helper
// ---------------------------------------------------------------------------

export interface TestEvalResult {
  testNextAcc: number;
  testTermAcc: number;
  hit1: number;
  hit3: number;
  hit5: number;
  mrr: number;
}

/**
 * Evaluate a trained GRU model on a test set.
 * Returns Hit@1/3/5, MRR, nextAcc, termAcc (all as percentages except MRR).
 */
export function evaluateGRU(
  model: CompactInformedGRU,
  testSet: TransitionExample[],
): TestEvalResult {
  let correctNext = 0;
  let correctTerm = 0;
  let h1 = 0, h3 = 0, h5 = 0, mrrSum = 0;
  let nextTotal = 0;

  for (const ex of testSet) {
    const { ranked, shouldTerminate } = model.predictNextTopK(
      ex.intentEmbedding,
      ex.contextToolIds,
      10,
    );
    if (!ex.isSingleTool) {
      nextTotal++;
      const rank = ranked.findIndex((r) => r.toolId === ex.targetToolId);
      if (rank === 0) { h1++; correctNext++; }
      if (rank >= 0 && rank < 3) h3++;
      if (rank >= 0 && rank < 5) h5++;
      if (rank >= 0) mrrSum += 1 / (rank + 1);
    }
    if ((shouldTerminate ? 1 : 0) === ex.isTerminal) correctTerm++;
  }

  return {
    testNextAcc: nextTotal > 0 ? (correctNext / nextTotal) * 100 : 0,
    testTermAcc: (correctTerm / testSet.length) * 100,
    hit1: nextTotal > 0 ? (h1 / nextTotal) * 100 : 0,
    hit3: nextTotal > 0 ? (h3 / nextTotal) * 100 : 0,
    hit5: nextTotal > 0 ? (h5 / nextTotal) * 100 : 0,
    mrr: nextTotal > 0 ? mrrSum / nextTotal : 0,
  };
}

// ---------------------------------------------------------------------------
// Core training loop
// ---------------------------------------------------------------------------

/**
 * Train a CompactInformedGRU model with full metrics tracking.
 *
 * @param model      An already-configured CompactInformedGRU (vocab + bias set)
 * @param data       Train/test splits (prod + n8n)
 * @param config     Epochs, batch size, prod oversample factor
 * @param shuffleFn  Seeded shuffle function for reproducibility
 * @param verbose    If true (default), log per-epoch metrics to stdout
 */
export function trainGRU(
  model: CompactInformedGRU,
  data: GRUTrainingData,
  config: GRUTrainingConfig,
  shuffleFn: <T>(arr: T[]) => T[],
  verbose = true,
): GRUTrainingResult {
  const { epochs, batchSize, prodOversample } = config;

  // Build mixed training pool
  const oversampledProd: TransitionExample[] = [];
  for (let r = 0; r < prodOversample; r++) {
    oversampledProd.push(...data.prodTrain);
  }
  const mixedTrain = [...oversampledProd, ...data.n8nTrain];

  if (verbose) {
    console.log(`\n=== GRU Training: ${epochs} epochs, batch=${batchSize} ===`);
    console.log(
      `    Pool: ${mixedTrain.length} (${oversampledProd.length} prod ${prodOversample}x + ${data.n8nTrain.length} n8n)`,
    );
    console.log(`    Test: ${data.prodTest.length} prod examples\n`);
  }

  let bestTestHit1 = 0;
  let bestMRR = 0;
  let bestEpoch = 0;
  let finalHit1 = 0, finalHit3 = 0, finalHit5 = 0, finalMRR = 0;
  const epochLog: GRUEpochLog[] = [];
  const trainStart = performance.now();

  for (let epoch = 0; epoch < epochs; epoch++) {
    const epochStart = performance.now();

    model.annealTemperature(epoch, epochs);

    const shuffled = shuffleFn([...mixedTrain]);

    let epochLoss = 0;
    let epochNextAcc = 0;
    let epochTermAcc = 0;
    let batchCount = 0;

    const numBatches = Math.ceil(shuffled.length / batchSize);
    for (let i = 0; i < shuffled.length; i += batchSize) {
      const batch = shuffled.slice(i, i + batchSize);
      if (batch.length === 0) continue;

      const metrics = model.trainStep(batch);
      epochLoss += metrics.loss;
      epochNextAcc += metrics.nextToolAccuracy;
      epochTermAcc += metrics.terminationAccuracy;
      batchCount++;

      if (verbose && (batchCount % 50 === 0 || batchCount === numBatches)) {
        process.stdout.write(
          `\r      batch ${batchCount}/${numBatches} | loss=${(epochLoss / batchCount).toFixed(4)} acc=${((epochNextAcc / batchCount) * 100).toFixed(1)}%`,
        );
      }
    }
    if (verbose) process.stdout.write("\n");

    const avgLoss = epochLoss / batchCount;
    const avgNextAcc = (epochNextAcc / batchCount) * 100;
    const avgTermAcc = (epochTermAcc / batchCount) * 100;
    const epochTime = (performance.now() - epochStart) / 1000;

    // Evaluate on prod test set
    const ev = evaluateGRU(model, data.prodTest);

    if (ev.hit1 > bestTestHit1) {
      bestTestHit1 = ev.hit1;
      bestEpoch = epoch + 1;
    }
    if (ev.mrr > bestMRR) bestMRR = ev.mrr;
    finalHit1 = ev.hit1;
    finalHit3 = ev.hit3;
    finalHit5 = ev.hit5;
    finalMRR = ev.mrr;

    const rssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
    epochLog.push({
      epoch: epoch + 1,
      loss: avgLoss,
      trainNext: avgNextAcc,
      trainTerm: avgTermAcc,
      testNext: ev.testNextAcc,
      testTerm: ev.testTermAcc,
      hit1: ev.hit1,
      hit3: ev.hit3,
      hit5: ev.hit5,
      mrr: ev.mrr,
      time: epochTime,
      rssMB,
    });

    if (verbose) {
      const totalElapsed = ((performance.now() - trainStart) / 1000).toFixed(0);
      const eta = epoch > 0
        ? (((performance.now() - trainStart) / (epoch + 1)) * (epochs - epoch - 1) / 1000 / 60).toFixed(1)
        : "?";

      console.log(
        `  ┌─ Epoch ${String(epoch + 1).padStart(2)}/${epochs}  (${epochTime.toFixed(1)}s, total ${totalElapsed}s, ETA ~${eta}min)  ${rssMB}MB`,
      );
      console.log(
        `  │ Train    loss=${avgLoss.toFixed(4)}  nextAcc=${avgNextAcc.toFixed(1)}%  termAcc=${avgTermAcc.toFixed(1)}%  (${batchCount} batches)`,
      );
      console.log(
        `  │ Test     Hit@1=${ev.hit1.toFixed(1)}%  Hit@3=${ev.hit3.toFixed(1)}%  Hit@5=${ev.hit5.toFixed(1)}%  MRR=${ev.mrr.toFixed(3)}  nextAcc=${ev.testNextAcc.toFixed(1)}%  termAcc=${ev.testTermAcc.toFixed(1)}%`,
      );
      console.log(
        `  └─ Best    Hit@1=${bestTestHit1.toFixed(1)}%  MRR=${bestMRR.toFixed(3)}  (epoch ${bestEpoch})`,
      );
    }
  }

  const trainTimeSec = (performance.now() - trainStart) / 1000;

  if (verbose) {
    console.log(`\n      Training complete in ${trainTimeSec.toFixed(1)}s`);
    console.log(`      Best Hit@1: ${bestTestHit1.toFixed(1)}% (epoch ${bestEpoch}), Best MRR: ${bestMRR.toFixed(3)}`);
  }

  return {
    bestTestHit1,
    bestMRR,
    bestEpoch,
    finalHit1,
    finalHit3,
    finalHit5,
    finalMRR,
    epochLog,
    trainTimeSec,
  };
}
