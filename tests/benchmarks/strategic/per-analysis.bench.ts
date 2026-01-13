/**
 * PER (Prioritized Experience Replay) Analysis Benchmark
 *
 * Analyzes why PER hurts vs uniform sampling on production data.
 * Examines:
 * - Priority distribution skewness
 * - Per-capability sampling frequency
 * - Learning curves per capability
 * - Diversity metrics
 *
 * Run:
 *   deno run --allow-all tests/benchmarks/strategic/per-analysis.bench.ts
 *
 * @module tests/benchmarks/strategic/per-analysis
 */

import { createSHGATFromCapabilities, type TrainingExample } from "../../../src/graphrag/algorithms/shgat.ts";
import { NUM_NEGATIVES } from "../../../src/graphrag/algorithms/shgat/types.ts";
import { PERBuffer, annealBeta } from "../../../src/graphrag/algorithms/shgat/training/per-buffer.ts";
import { mean, stdDev } from "../utils/metrics.ts";

// ============================================================================
// Load Production Data
// ============================================================================

interface ProductionData {
  metadata: {
    stats: {
      totalTraces: number;
      capabilities: number;
      tools: number;
      trainingExamples: number;
      testQueries: number;
    };
  };
  nodes: {
    capabilities: Array<{
      id: string;
      embedding: number[];
      toolsUsed: string[];
      successRate: number;
      description?: string;
    }>;
    tools: Array<{
      id: string;
      embedding: number[];
    }>;
  };
  episodicEvents: Array<{
    intent: string;
    intentEmbedding: number[];
    contextTools: string[];
    selectedCapability: string;
    outcome: "success" | "failure";
  }>;
  testQueries: Array<{
    intent: string;
    intentEmbedding: number[];
    expectedCapability: string;
    difficulty: string;
  }>;
}

async function loadProductionData(): Promise<ProductionData> {
  const path = "tests/benchmarks/fixtures/scenarios/production-traces.json";
  const text = await Deno.readTextFile(path);
  return JSON.parse(text);
}

// ============================================================================
// Analysis Functions
// ============================================================================

interface PriorityStats {
  min: number;
  max: number;
  mean: number;
  std: number;
}

function getPriorityStats(perBuffer: PERBuffer<TrainingExample>): PriorityStats {
  return perBuffer.getStats();
}

interface SamplingAnalysis {
  totalSamples: number;
  uniqueExamplesSeen: number;
  coverageRatio: number;  // uniqueExamplesSeen / totalExamples
  perCapabilitySamples: Map<string, number>;
  samplingGini: number;  // Inequality in how often caps are sampled
  mostSampledCap: { id: string; count: number };
  leastSampledCap: { id: string; count: number };
}

function analyzeSampling(
  examples: TrainingExample[],
  perBuffer: PERBuffer | null,
  numSamples: number,
): SamplingAnalysis {
  const sampleCounts = new Map<number, number>();
  const capSampleCounts = new Map<string, number>();

  for (let i = 0; i < numSamples; i++) {
    let idx: number;
    if (perBuffer) {
      const batch = perBuffer.sample(1);
      idx = batch.indices[0];
    } else {
      idx = Math.floor(Math.random() * examples.length);
    }

    sampleCounts.set(idx, (sampleCounts.get(idx) || 0) + 1);

    const capId = examples[idx].candidateId;
    capSampleCounts.set(capId, (capSampleCounts.get(capId) || 0) + 1);
  }

  // Coverage
  const uniqueExamplesSeen = sampleCounts.size;
  const coverageRatio = uniqueExamplesSeen / examples.length;

  // Sampling Gini
  const capCounts = Array.from(capSampleCounts.values()).sort((a, b) => a - b);
  const n = capCounts.length;
  const meanCount = numSamples / n;
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      giniSum += Math.abs(capCounts[i] - capCounts[j]);
    }
  }
  const samplingGini = giniSum / (2 * n * n * meanCount);

  // Most/least sampled
  let mostSampled = { id: "", count: 0 };
  let leastSampled = { id: "", count: Infinity };
  for (const [capId, count] of capSampleCounts) {
    if (count > mostSampled.count) mostSampled = { id: capId, count };
    if (count < leastSampled.count) leastSampled = { id: capId, count };
  }

  return {
    totalSamples: numSamples,
    uniqueExamplesSeen,
    coverageRatio,
    perCapabilitySamples: capSampleCounts,
    samplingGini,
    mostSampledCap: mostSampled,
    leastSampledCap: leastSampled,
  };
}

// ============================================================================
// Training with Detailed Tracking
// ============================================================================

interface DetailedTrainingResult {
  config: string;
  epochs: number;
  finalLoss: number;
  finalTrainAcc: number;
  finalTestAcc: number;
  perCapabilityAcc: Map<string, number>;
  epochHistory: Array<{
    epoch: number;
    loss: number;
    trainAcc: number;
    testAcc: number;
  }>;
  samplingAnalysis: SamplingAnalysis;
  trainingTimeMs: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function annealTemperature(epoch: number, totalEpochs: number, start: number, end: number): number {
  const progress = Math.min(epoch / Math.max(totalEpochs - 1, 1), 1.0);
  return start - (start - end) * progress;
}

function runDetailedTraining(
  configName: string,
  usePER: boolean,
  perAlpha: number,
  capabilities: Array<{ id: string; embedding: number[]; toolsUsed: string[] }>,
  trainExamples: TrainingExample[],
  testExamples: TrainingExample[],
  epochs: number = 10,
  batchSize: number = 16,
): DetailedTrainingResult {
  const startTime = performance.now();

  // Create SHGAT
  const shgat = createSHGATFromCapabilities(capabilities);

  // Initialize PER buffer if enabled
  const perBuffer = usePER
    ? new PERBuffer(trainExamples, {
        alpha: perAlpha,
        beta: 0.4,
        epsilon: 0.01,
        maxPriority: 25,
      })
    : null;

  const epochHistory: Array<{ epoch: number; loss: number; trainAcc: number; testAcc: number }> = [];
  let totalSampledIndices: number[] = [];

  for (let epoch = 0; epoch < epochs; epoch++) {
    const beta = usePER ? annealBeta(epoch, epochs, 0.4) : 1.0;
    const temperature = annealTemperature(epoch, epochs, 0.10, 0.06);

    let epochLoss = 0;
    let epochAcc = 0;
    let epochBatches = 0;

    const numBatches = Math.ceil(trainExamples.length / batchSize);

    for (let b = 0; b < numBatches; b++) {
      let batch: TrainingExample[];
      let batchWeights: number[];
      let sampleIndices: number[] = [];

      if (perBuffer) {
        const sampled = perBuffer.sample(batchSize, beta);
        batch = sampled.items;
        batchWeights = sampled.weights;
        sampleIndices = sampled.indices;
      } else {
        // Uniform sampling
        sampleIndices = [];
        for (let i = 0; i < batchSize; i++) {
          sampleIndices.push(Math.floor(Math.random() * trainExamples.length));
        }
        batch = sampleIndices.map(i => trainExamples[i]);
        batchWeights = new Array(batchSize).fill(1.0);
      }

      totalSampledIndices.push(...sampleIndices);

      // Train batch using SHGAT's built-in method
      const result = shgat.trainBatchV1KHeadBatched(batch, batchWeights, false, temperature);
      epochLoss += result.loss;
      epochAcc += result.accuracy;
      epochBatches++;

      // Update PER priorities using TD errors
      if (perBuffer && result.tdErrors) {
        perBuffer.updatePriorities(sampleIndices, result.tdErrors);
      }
    }

    // Evaluate on test set
    const testResult = shgat.trainBatchV1KHeadBatched(testExamples, testExamples.map(() => 1.0), true, temperature);

    epochHistory.push({
      epoch,
      loss: epochLoss / epochBatches,
      trainAcc: epochAcc / epochBatches,
      testAcc: testResult.accuracy,
    });
  }

  // Final metrics
  const finalMetrics = epochHistory[epochHistory.length - 1];

  // Per-capability accuracy (simplified - just use overall test acc per cap from last batch)
  const perCapAccFinal = new Map<string, number>();

  // Sampling analysis
  const samplingAnalysis = analyzeSampling(
    trainExamples,
    perBuffer,
    totalSampledIndices.length,
  );

  return {
    config: configName,
    epochs,
    finalLoss: finalMetrics.loss,
    finalTrainAcc: finalMetrics.trainAcc,
    finalTestAcc: finalMetrics.testAcc,
    perCapabilityAcc: perCapAccFinal,
    epochHistory,
    samplingAnalysis,
    trainingTimeMs: performance.now() - startTime,
  };
}

// ============================================================================
// Main Benchmark
// ============================================================================

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════════════════════╗");
  console.log("║           PER ANALYSIS BENCHMARK (Production Data)                             ║");
  console.log("╚════════════════════════════════════════════════════════════════════════════════╝\n");

  // Load production data
  console.log("Loading production data...");
  const data = await loadProductionData();

  console.log(`  Traces: ${data.metadata.stats.trainingExamples}`);
  console.log(`  Capabilities: ${data.metadata.stats.capabilities}`);
  console.log(`  Tools: ${data.metadata.stats.tools}`);
  console.log(`  Test queries: ${data.metadata.stats.testQueries}\n`);

  // Prepare capabilities
  const capabilities = data.nodes.capabilities.map(c => ({
    id: c.id,
    embedding: c.embedding,
    toolsUsed: c.toolsUsed,
    successRate: c.successRate,
  }));

  // Prepare training examples
  const allCapIds = new Set(capabilities.map(c => c.id));
  const trainExamples: TrainingExample[] = data.episodicEvents.map((ev, i) => {
    // Get all negatives sorted by similarity to selected cap
    const selectedCap = capabilities.find(c => c.id === ev.selectedCapability);
    const allNegativesSorted = capabilities
      .filter(c => c.id !== ev.selectedCapability)
      .map(c => ({
        id: c.id,
        sim: selectedCap ? cosineSimilarity(selectedCap.embedding, c.embedding) : 0,
      }))
      .sort((a, b) => b.sim - a.sim)
      .map(c => c.id);

    const negativeCapIds = shuffle(allNegativesSorted).slice(0, NUM_NEGATIVES);

    return {
      intentEmbedding: ev.intentEmbedding,
      contextTools: ev.contextTools,
      candidateId: ev.selectedCapability,
      outcome: ev.outcome === "success" ? 1 : 0,
      negativeCapIds,
      allNegativesSorted,
    };
  });

  // Split train/test (80/20)
  const splitIdx = Math.floor(trainExamples.length * 0.8);
  const train = trainExamples.slice(0, splitIdx);
  const test = trainExamples.slice(splitIdx);

  console.log(`Train examples: ${train.length}`);
  console.log(`Test examples: ${test.length}\n`);

  // ============================================================================
  // Part 1: Priority Distribution Analysis
  // ============================================================================

  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("PART 1: Priority Distribution Analysis");
  console.log("═══════════════════════════════════════════════════════════════════════\n");

  // Create PER buffer and initialize priorities
  const perBuffer = new PERBuffer(train, { alpha: 0.4, beta: 0.4, epsilon: 0.01, maxPriority: 25 });

  // Simulate one epoch to get TD errors using trainBatchV1KHeadBatched
  const shgat = createSHGATFromCapabilities(capabilities);
  const batchSize = 16;
  for (let i = 0; i < train.length; i += batchSize) {
    const batch = train.slice(i, i + batchSize);
    const weights = batch.map(() => 1.0);
    const result = shgat.trainBatchV1KHeadBatched(batch, weights, false, 0.07);

    // Update priorities with TD errors
    if (result.tdErrors) {
      const indices = [];
      for (let j = 0; j < batch.length; j++) {
        indices.push(i + j);
      }
      perBuffer.updatePriorities(indices, result.tdErrors);
    }
  }

  const priorityStats = getPriorityStats(perBuffer);

  console.log("Priority Distribution (after 1 epoch warmup):");
  console.log(`  Min: ${priorityStats.min.toFixed(4)}`);
  console.log(`  Max: ${priorityStats.max.toFixed(4)}`);
  console.log(`  Mean: ${priorityStats.mean.toFixed(4)}`);
  console.log(`  Std: ${priorityStats.std.toFixed(4)}`);
  console.log(`  Range ratio (max/min): ${(priorityStats.max / priorityStats.min).toFixed(1)}x`);
  console.log(`  CV (std/mean): ${(priorityStats.std / priorityStats.mean).toFixed(3)}`);

  // ============================================================================
  // Part 2: Sampling Analysis
  // ============================================================================

  console.log("\n═══════════════════════════════════════════════════════════════════════");
  console.log("PART 2: Sampling Analysis (10 epochs simulation)");
  console.log("═══════════════════════════════════════════════════════════════════════\n");

  const numSamples = train.length * 10; // 10 epochs worth

  const perSampling = analyzeSampling(train, perBuffer, numSamples);
  const uniformSampling = analyzeSampling(train, null, numSamples);

  console.log("PER Sampling (α=0.4):");
  console.log(`  Coverage: ${(perSampling.coverageRatio * 100).toFixed(1)}% of examples seen`);
  console.log(`  Sampling Gini: ${perSampling.samplingGini.toFixed(4)}`);
  console.log(`  Most sampled: ${perSampling.mostSampledCap.id.slice(0, 40)} (${perSampling.mostSampledCap.count}x)`);
  console.log(`  Least sampled: ${perSampling.leastSampledCap.id.slice(0, 40)} (${perSampling.leastSampledCap.count}x)`);

  console.log("\nUniform Sampling:");
  console.log(`  Coverage: ${(uniformSampling.coverageRatio * 100).toFixed(1)}% of examples seen`);
  console.log(`  Sampling Gini: ${uniformSampling.samplingGini.toFixed(4)}`);
  console.log(`  Most sampled: ${uniformSampling.mostSampledCap.id.slice(0, 40)} (${uniformSampling.mostSampledCap.count}x)`);
  console.log(`  Least sampled: ${uniformSampling.leastSampledCap.id.slice(0, 40)} (${uniformSampling.leastSampledCap.count}x)`);

  // ============================================================================
  // Part 3: Training Comparison
  // ============================================================================

  console.log("\n═══════════════════════════════════════════════════════════════════════");
  console.log("PART 3: Training Comparison (3 runs each)");
  console.log("═══════════════════════════════════════════════════════════════════════\n");

  const configs = [
    { name: "uniform", usePER: false, alpha: 0 },
    { name: "per_α=0.3", usePER: true, alpha: 0.3 },
    { name: "per_α=0.4", usePER: true, alpha: 0.4 },
    { name: "per_α=0.6", usePER: true, alpha: 0.6 },
    { name: "per_α=0.8", usePER: true, alpha: 0.8 },
  ];

  const results: Array<{ name: string; testAccs: number[]; meanTestAcc: number; stdTestAcc: number }> = [];

  for (const cfg of configs) {
    console.log(`Running: ${cfg.name}...`);
    const testAccs: number[] = [];

    for (let run = 0; run < 3; run++) {
      const result = runDetailedTraining(
        cfg.name,
        cfg.usePER,
        cfg.alpha,
        capabilities,
        train,
        test,
        10,
        16,
      );
      testAccs.push(result.finalTestAcc);
      console.log(`  Run ${run + 1}/3: testAcc=${(result.finalTestAcc * 100).toFixed(1)}%`);
    }

    results.push({
      name: cfg.name,
      testAccs,
      meanTestAcc: mean(testAccs),
      stdTestAcc: stdDev(testAccs),
    });
  }

  // ============================================================================
  // Summary
  // ============================================================================

  console.log("\n═══════════════════════════════════════════════════════════════════════");
  console.log("SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════════════\n");

  console.log("| Config     | Test Acc        | Δ vs Uniform |");
  console.log("|------------|-----------------|--------------|");

  const uniformResult = results.find(r => r.name === "uniform")!;

  for (const r of results.sort((a, b) => b.meanTestAcc - a.meanTestAcc)) {
    const delta = ((r.meanTestAcc - uniformResult.meanTestAcc) * 100).toFixed(1);
    const deltaStr = r.name === "uniform" ? "-" : `${delta}%`;
    console.log(`| ${r.name.padEnd(10)} | ${(r.meanTestAcc * 100).toFixed(1)}% ± ${(r.stdTestAcc * 100).toFixed(1)}% | ${deltaStr.padStart(12)} |`);
  }

  console.log("\n═══════════════════════════════════════════════════════════════════════");
  console.log("DIAGNOSIS: Why PER Might Hurt");
  console.log("═══════════════════════════════════════════════════════════════════════\n");

  const cv = priorityStats.std / priorityStats.mean;
  if (cv > 0.5) {
    console.log("⚠️  HIGH PRIORITY VARIANCE (CV=" + cv.toFixed(2) + ")");
    console.log("   → A few examples dominate sampling, reducing diversity");
  }

  const rangeRatio = priorityStats.max / priorityStats.min;
  if (rangeRatio > 100) {
    console.log("⚠️  EXTREME PRIORITY RANGE (" + rangeRatio.toFixed(0) + "x)");
    console.log("   → Some examples have " + rangeRatio.toFixed(0) + "x higher priority than others");
  }

  if (perSampling.coverageRatio < 0.9) {
    console.log("⚠️  LOW COVERAGE (" + (perSampling.coverageRatio * 100).toFixed(0) + "%)");
    console.log("   → PER misses " + ((1 - perSampling.coverageRatio) * 100).toFixed(0) + "% of examples, uniform sees all");
  }

  const samplingRatio = perSampling.mostSampledCap.count / perSampling.leastSampledCap.count;
  if (samplingRatio > 10) {
    console.log("⚠️  EXTREME SAMPLING IMBALANCE (" + samplingRatio.toFixed(0) + "x)");
    console.log("   → Most sampled cap gets " + samplingRatio.toFixed(0) + "x more samples than least");
  }

  // Save report
  const reportPath = `tests/benchmarks/reports/per-analysis-${new Date().toISOString().slice(0, 10)}.md`;
  const report = `# PER Analysis Report

Generated: ${new Date().toISOString()}

## Data
- Training examples: ${train.length}
- Test examples: ${test.length}
- Capabilities: ${capabilities.length}

## Priority Distribution (after warmup)
- Min: ${priorityStats.min.toFixed(4)}
- Max: ${priorityStats.max.toFixed(4)}
- Mean: ${priorityStats.mean.toFixed(4)}
- Std: ${priorityStats.std.toFixed(4)}
- Range ratio: ${(priorityStats.max / priorityStats.min).toFixed(1)}x
- CV: ${(priorityStats.std / priorityStats.mean).toFixed(3)}

## Sampling Analysis
| Metric | PER (α=0.4) | Uniform |
|--------|-------------|---------|
| Coverage | ${(perSampling.coverageRatio * 100).toFixed(1)}% | ${(uniformSampling.coverageRatio * 100).toFixed(1)}% |
| Gini | ${perSampling.samplingGini.toFixed(4)} | ${uniformSampling.samplingGini.toFixed(4)} |

## Results
${results.map(r => `- ${r.name}: ${(r.meanTestAcc * 100).toFixed(1)}% ± ${(r.stdTestAcc * 100).toFixed(1)}%`).join('\n')}

## Winner: ${results.sort((a, b) => b.meanTestAcc - a.meanTestAcc)[0].name}
`;

  await Deno.writeTextFile(reportPath, report);
  console.log(`\nReport saved to: ${reportPath}`);
}

main().catch(console.error);
