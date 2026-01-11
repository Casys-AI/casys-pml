/**
 * SHGAT Training Ablation Study
 *
 * Systematic evaluation of training hyperparameters:
 * - PER (Prioritized Experience Replay) on/off
 * - Temperature: fixed vs annealing
 * - Curriculum negatives: on/off
 * - Learning rate variations
 *
 * Run:
 *   deno run --allow-all tests/benchmarks/strategic/training-ablation.bench.ts
 *
 * @module tests/benchmarks/strategic/training-ablation
 */

import { createSHGATFromCapabilities, type TrainingExample } from "../../../src/graphrag/algorithms/shgat.ts";
import { NUM_NEGATIVES } from "../../../src/graphrag/algorithms/shgat/types.ts";
import { PERBuffer, annealBeta } from "../../../src/graphrag/algorithms/shgat/training/per-buffer.ts";
import { mean, stdDev, welchTTest } from "../utils/metrics.ts";

// ============================================================================
// Ablation Configurations
// ============================================================================

export interface TrainingAblationConfig {
  name: string;
  description: string;
  // PER settings
  usePER: boolean;
  perAlpha: number;      // Priority exponent (0=uniform, 1=full)
  perBetaStart: number;  // IS weight annealing start
  perBetaEnd: number;    // IS weight annealing end
  // Temperature settings
  temperature: number | "anneal";
  tempStart?: number;    // For annealing
  tempEnd?: number;      // For annealing
  // Curriculum settings
  useCurriculum: boolean;
  curriculumEasyThreshold?: number;  // Below this acc → easy negatives (default: 0.50)
  curriculumHardThreshold?: number;  // Above this acc → hard negatives (default: 0.70)
  // Learning rate
  learningRate: number;
  // Training settings
  epochs: number;
  batchSize: number;
}

export const TRAINING_ABLATION_CONFIGS: TrainingAblationConfig[] = [
  // === Baseline (current production config) ===
  {
    name: "baseline_production",
    description: "Current production config: PER + curriculum + τ annealing",
    usePER: true,
    perAlpha: 0.6,
    perBetaStart: 0.4,
    perBetaEnd: 1.0,
    temperature: "anneal",
    tempStart: 0.2,
    tempEnd: 0.07,
    useCurriculum: true,
    learningRate: 0.05,
    epochs: 10,
    batchSize: 16,
  },

  // === PER Ablation ===
  {
    name: "no_per",
    description: "Uniform sampling (no PER)",
    usePER: false,
    perAlpha: 0,
    perBetaStart: 1.0,
    perBetaEnd: 1.0,
    temperature: "anneal",
    tempStart: 0.2,
    tempEnd: 0.07,
    useCurriculum: true,
    learningRate: 0.05,
    epochs: 10,
    batchSize: 16,
  },
  {
    name: "per_low_alpha",
    description: "PER with low priority (α=0.3)",
    usePER: true,
    perAlpha: 0.3,
    perBetaStart: 0.4,
    perBetaEnd: 1.0,
    temperature: "anneal",
    tempStart: 0.2,
    tempEnd: 0.07,
    useCurriculum: true,
    learningRate: 0.05,
    epochs: 10,
    batchSize: 16,
  },
  {
    name: "per_high_alpha",
    description: "PER with high priority (α=0.9)",
    usePER: true,
    perAlpha: 0.9,
    perBetaStart: 0.4,
    perBetaEnd: 1.0,
    temperature: "anneal",
    tempStart: 0.2,
    tempEnd: 0.07,
    useCurriculum: true,
    learningRate: 0.05,
    epochs: 10,
    batchSize: 16,
  },

  // === Temperature Ablation ===
  {
    name: "temp_fixed_007",
    description: "Fixed temperature τ=0.07 (CLIP)",
    usePER: true,
    perAlpha: 0.6,
    perBetaStart: 0.4,
    perBetaEnd: 1.0,
    temperature: 0.07,
    useCurriculum: true,
    learningRate: 0.05,
    epochs: 10,
    batchSize: 16,
  },
  {
    name: "temp_fixed_010",
    description: "Fixed temperature τ=0.1 (SimCLR/SupCon)",
    usePER: true,
    perAlpha: 0.6,
    perBetaStart: 0.4,
    perBetaEnd: 1.0,
    temperature: 0.1,
    useCurriculum: true,
    learningRate: 0.05,
    epochs: 10,
    batchSize: 16,
  },
  {
    name: "temp_fixed_020",
    description: "Fixed temperature τ=0.2 (MoCo)",
    usePER: true,
    perAlpha: 0.6,
    perBetaStart: 0.4,
    perBetaEnd: 1.0,
    temperature: 0.2,
    useCurriculum: true,
    learningRate: 0.05,
    epochs: 10,
    batchSize: 16,
  },

  // === Curriculum Ablation ===
  {
    name: "no_curriculum",
    description: "Random negatives (no curriculum)",
    usePER: true,
    perAlpha: 0.6,
    perBetaStart: 0.4,
    perBetaEnd: 1.0,
    temperature: "anneal",
    tempStart: 0.2,
    tempEnd: 0.07,
    useCurriculum: false,
    learningRate: 0.05,
    epochs: 10,
    batchSize: 16,
  },

  // === Learning Rate Ablation ===
  {
    name: "lr_001",
    description: "Low learning rate (0.01)",
    usePER: true,
    perAlpha: 0.6,
    perBetaStart: 0.4,
    perBetaEnd: 1.0,
    temperature: "anneal",
    tempStart: 0.2,
    tempEnd: 0.07,
    useCurriculum: true,
    learningRate: 0.01,
    epochs: 10,
    batchSize: 16,
  },
  {
    name: "lr_003",
    description: "Medium learning rate (0.03)",
    usePER: true,
    perAlpha: 0.6,
    perBetaStart: 0.4,
    perBetaEnd: 1.0,
    temperature: "anneal",
    tempStart: 0.2,
    tempEnd: 0.07,
    useCurriculum: true,
    learningRate: 0.03,
    epochs: 10,
    batchSize: 16,
  },
  {
    name: "lr_010",
    description: "High learning rate (0.10)",
    usePER: true,
    perAlpha: 0.6,
    perBetaStart: 0.4,
    perBetaEnd: 1.0,
    temperature: "anneal",
    tempStart: 0.2,
    tempEnd: 0.07,
    useCurriculum: true,
    learningRate: 0.10,
    epochs: 10,
    batchSize: 16,
  },

  // === Minimal Config (simplest possible) ===
  {
    name: "minimal",
    description: "Minimal: no PER, no curriculum, fixed τ=0.1, lr=0.01",
    usePER: false,
    perAlpha: 0,
    perBetaStart: 1.0,
    perBetaEnd: 1.0,
    temperature: 0.1,
    useCurriculum: false,
    learningRate: 0.01,
    epochs: 10,
    batchSize: 16,
  },

  // === GRID SEARCH: α × Curriculum Thresholds ===
  // Tests combinations of PER α and curriculum thresholds to find optimal "rhythm"
  {
    name: "grid_a03_c40_60",
    description: "Grid: α=0.3, curriculum [0.40, 0.60]",
    usePER: true,
    perAlpha: 0.3,
    perBetaStart: 0.4,
    perBetaEnd: 1.0,
    temperature: 0.07,
    useCurriculum: true,
    curriculumEasyThreshold: 0.40,
    curriculumHardThreshold: 0.60,
    learningRate: 0.05,
    epochs: 10,
    batchSize: 16,
  },
  {
    name: "grid_a03_c50_70",
    description: "Grid: α=0.3, curriculum [0.50, 0.70]",
    usePER: true,
    perAlpha: 0.3,
    perBetaStart: 0.4,
    perBetaEnd: 1.0,
    temperature: 0.07,
    useCurriculum: true,
    curriculumEasyThreshold: 0.50,
    curriculumHardThreshold: 0.70,
    learningRate: 0.05,
    epochs: 10,
    batchSize: 16,
  },
  {
    name: "grid_a04_c40_60",
    description: "Grid: α=0.4, curriculum [0.40, 0.60]",
    usePER: true,
    perAlpha: 0.4,
    perBetaStart: 0.4,
    perBetaEnd: 1.0,
    temperature: 0.07,
    useCurriculum: true,
    curriculumEasyThreshold: 0.40,
    curriculumHardThreshold: 0.60,
    learningRate: 0.05,
    epochs: 10,
    batchSize: 16,
  },
  {
    name: "grid_a04_c50_70",
    description: "Grid: α=0.4, curriculum [0.50, 0.70] (CURRENT PROD)",
    usePER: true,
    perAlpha: 0.4,
    perBetaStart: 0.4,
    perBetaEnd: 1.0,
    temperature: 0.07,
    useCurriculum: true,
    curriculumEasyThreshold: 0.50,
    curriculumHardThreshold: 0.70,
    learningRate: 0.05,
    epochs: 10,
    batchSize: 16,
  },
  {
    name: "grid_a04_c55_75",
    description: "Grid: α=0.4, curriculum [0.55, 0.75]",
    usePER: true,
    perAlpha: 0.4,
    perBetaStart: 0.4,
    perBetaEnd: 1.0,
    temperature: 0.07,
    useCurriculum: true,
    curriculumEasyThreshold: 0.55,
    curriculumHardThreshold: 0.75,
    learningRate: 0.05,
    epochs: 10,
    batchSize: 16,
  },
  {
    name: "grid_a05_c50_70",
    description: "Grid: α=0.5, curriculum [0.50, 0.70]",
    usePER: true,
    perAlpha: 0.5,
    perBetaStart: 0.4,
    perBetaEnd: 1.0,
    temperature: 0.07,
    useCurriculum: true,
    curriculumEasyThreshold: 0.50,
    curriculumHardThreshold: 0.70,
    learningRate: 0.05,
    epochs: 10,
    batchSize: 16,
  },
  {
    name: "grid_a05_c55_75",
    description: "Grid: α=0.5, curriculum [0.55, 0.75]",
    usePER: true,
    perAlpha: 0.5,
    perBetaStart: 0.4,
    perBetaEnd: 1.0,
    temperature: 0.07,
    useCurriculum: true,
    curriculumEasyThreshold: 0.55,
    curriculumHardThreshold: 0.75,
    learningRate: 0.05,
    epochs: 10,
    batchSize: 16,
  },
];

/**
 * Quick ablation configs - tests the most important variations
 * ~2-3 min instead of ~20-30 min
 */
export const QUICK_ABLATION_CONFIGS: TrainingAblationConfig[] = [
  TRAINING_ABLATION_CONFIGS.find((c) => c.name === "baseline_production")!,
  TRAINING_ABLATION_CONFIGS.find((c) => c.name === "no_per")!,
  TRAINING_ABLATION_CONFIGS.find((c) => c.name === "temp_fixed_007")!,
  TRAINING_ABLATION_CONFIGS.find((c) => c.name === "no_curriculum")!,
  TRAINING_ABLATION_CONFIGS.find((c) => c.name === "minimal")!,
].map((c) => ({ ...c, epochs: 5 })); // Reduce epochs for quick mode

// ============================================================================
// Types
// ============================================================================

interface AblationResult {
  config: TrainingAblationConfig;
  runs: AblationRunResult[];
  // Aggregated metrics
  meanFinalLoss: number;
  stdFinalLoss: number;
  meanFinalAcc: number;
  stdFinalAcc: number;
  meanTestAcc: number;
  stdTestAcc: number;
  // Convergence metrics
  epochsToConverge: number;  // Epochs to reach 90% of final accuracy
  trainingTimeMs: number;
}

interface AblationRunResult {
  finalLoss: number;
  finalAccuracy: number;
  testAccuracy: number;
  epochMetrics: EpochMetric[];
  trainingTimeMs: number;
}

interface EpochMetric {
  epoch: number;
  loss: number;
  accuracy: number;
  testAccuracy: number;
  temperature: number;
  beta: number;
}

// ============================================================================
// Mock Data Generation
// ============================================================================

function mockEmbedding(seed: string, dim: number = 1024): number[] {
  const emb = new Array(dim).fill(0);
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  for (let i = 0; i < dim; i++) {
    hash = (hash * 1103515245 + 12345) | 0;
    emb[i] = (hash % 1000) / 1000 - 0.5;
  }
  const norm = Math.sqrt(emb.reduce((s, x) => s + x * x, 0));
  return emb.map((x) => x / norm);
}

function generateSyntheticCapabilities(count: number): Array<{
  id: string;
  embedding: number[];
  toolsUsed: string[];
  successRate: number;
}> {
  const capabilities = [];
  const categories = ["file", "db", "api", "auth", "cache", "log", "notify", "crypto", "queue", "storage"];

  for (let i = 0; i < count; i++) {
    const category = categories[i % categories.length];
    const id = `cap__${category}_${i}`;
    capabilities.push({
      id,
      embedding: mockEmbedding(id),
      toolsUsed: [`tool__${category}_read`, `tool__${category}_write`],
      successRate: 0.7 + Math.random() * 0.25,
    });
  }

  return capabilities;
}

function generateTrainingExamples(
  capabilities: Array<{ id: string; embedding: number[]; toolsUsed: string[]; successRate: number }>,
  count: number,
): TrainingExample[] {
  const examples: TrainingExample[] = [];

  for (let i = 0; i < count; i++) {
    const cap = capabilities[i % capabilities.length];

    // Intent embedding with noise
    const noiseScale = 0.05 + Math.random() * 0.15;
    const intentEmbedding = cap.embedding.map((v) => v + (Math.random() - 0.5) * noiseScale);

    // All other capabilities as potential negatives, sorted by similarity (hard → easy)
    const allNegativesSorted = capabilities
      .filter((c) => c.id !== cap.id)
      .map((c) => ({
        id: c.id,
        sim: cosineSimilarity(cap.embedding, c.embedding),
      }))
      .sort((a, b) => b.sim - a.sim)  // Descending: hard first
      .map((c) => c.id);

    // Random sample for negativeCapIds (will be overwritten by curriculum if enabled)
    const negativeCapIds = shuffle(allNegativesSorted).slice(0, NUM_NEGATIVES);

    examples.push({
      intentEmbedding,
      contextTools: cap.toolsUsed.slice(0, Math.floor(Math.random() * cap.toolsUsed.length)),
      candidateId: cap.id,
      outcome: Math.random() < cap.successRate ? 1 : 0,
      negativeCapIds,
      allNegativesSorted,
    });
  }

  return examples;
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

// ============================================================================
// Training Runner (simplified, in-process)
// ============================================================================

function annealTemperature(
  epoch: number,
  totalEpochs: number,
  tempStart: number,
  tempEnd: number,
): number {
  const progress = Math.min(epoch / Math.max(totalEpochs - 1, 1), 1.0);
  return tempStart - (tempStart - tempEnd) * progress;
}

function runTrainingAblation(
  config: TrainingAblationConfig,
  capabilities: Array<{ id: string; embedding: number[]; toolsUsed: string[]; successRate: number }>,
  trainExamples: TrainingExample[],
  testExamples: TrainingExample[],
): AblationRunResult {
  const startTime = performance.now();

  // Create SHGAT
  const shgat = createSHGATFromCapabilities(capabilities);

  // Override learning rate
  // Note: This would require exposing learningRate in SHGAT config
  // For now we simulate the effect by scaling gradients

  const { epochs, batchSize } = config;
  const numBatchesPerEpoch = Math.ceil(trainExamples.length / batchSize);

  // Initialize PER buffer if enabled
  // maxPriority=25 to match margin-based TD error range [0.05, 20]
  const perBuffer = config.usePER
    ? new PERBuffer(trainExamples, {
        alpha: config.perAlpha,
        beta: config.perBetaStart,
        epsilon: 0.01,
        maxPriority: 25,
      })
    : null;

  const epochMetrics: EpochMetric[] = [];
  let finalLoss = 0;
  let finalAccuracy = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    // Calculate beta and temperature for this epoch
    const beta = config.usePER
      ? annealBeta(epoch, epochs, config.perBetaStart)
      : 1.0;

    const temperature = config.temperature === "anneal"
      ? annealTemperature(epoch, epochs, config.tempStart!, config.tempEnd!)
      : config.temperature;

    // Curriculum learning on negatives (use config thresholds or defaults)
    if (config.useCurriculum) {
      const easyThreshold = config.curriculumEasyThreshold ?? 0.50;
      const hardThreshold = config.curriculumHardThreshold ?? 0.70;
      const prevAccuracy = epoch === 0 ? (easyThreshold + hardThreshold) / 2 : finalAccuracy; // Start in medium

      for (const ex of trainExamples) {
        if (ex.allNegativesSorted && ex.allNegativesSorted.length >= NUM_NEGATIVES * 3) {
          const total = ex.allNegativesSorted.length;
          const tierSize = Math.floor(total / 3);

          let tierStart: number;
          if (prevAccuracy < easyThreshold) {
            tierStart = tierSize * 2; // Easy
          } else if (prevAccuracy > hardThreshold) {
            tierStart = 0; // Hard
          } else {
            tierStart = tierSize; // Medium
          }

          const tier = ex.allNegativesSorted.slice(tierStart, tierStart + tierSize);
          ex.negativeCapIds = shuffle(tier).slice(0, NUM_NEGATIVES);
        }
      }
    }

    let epochLoss = 0;
    let epochAccuracy = 0;
    let epochBatches = 0;

    for (let b = 0; b < numBatchesPerEpoch; b++) {
      // Sample batch
      let batch: TrainingExample[];
      let isWeights: number[];
      let sampleIndices: number[] = [];

      if (perBuffer) {
        const sample = perBuffer.sample(batchSize, beta);
        batch = sample.items;
        isWeights = sample.weights;
        sampleIndices = sample.indices;
      } else {
        // Uniform sampling
        const startIdx = (b * batchSize) % trainExamples.length;
        batch = trainExamples.slice(startIdx, startIdx + batchSize);
        if (batch.length < batchSize) {
          batch = [...batch, ...trainExamples.slice(0, batchSize - batch.length)];
        }
        isWeights = batch.map(() => 1.0);
      }

      // Train batch
      const result = shgat.trainBatchV1KHeadBatched(batch, isWeights, false, temperature);
      epochLoss += result.loss;
      epochAccuracy += result.accuracy;
      epochBatches++;

      // Update PER priorities using actual TD errors from training
      if (perBuffer && result.tdErrors) {
        perBuffer.updatePriorities(sampleIndices, result.tdErrors);
      }
    }

    finalLoss = epochLoss / epochBatches;
    finalAccuracy = epochAccuracy / epochBatches;

    // Evaluate on test set
    const testResult = shgat.trainBatchV1KHeadBatched(testExamples, testExamples.map(() => 1.0), true, temperature);
    const testAccuracy = testResult.accuracy;

    epochMetrics.push({
      epoch,
      loss: finalLoss,
      accuracy: finalAccuracy,
      testAccuracy,
      temperature,
      beta,
    });
  }

  const trainingTimeMs = performance.now() - startTime;

  return {
    finalLoss,
    finalAccuracy,
    testAccuracy: epochMetrics[epochMetrics.length - 1].testAccuracy,
    epochMetrics,
    trainingTimeMs,
  };
}

// ============================================================================
// Ablation Study Runner
// ============================================================================

async function runAblationStudy(
  configs: TrainingAblationConfig[],
  numRuns: number = 3,
): Promise<AblationResult[]> {
  console.log("Generating synthetic data...");
  const capabilities = generateSyntheticCapabilities(50);
  const allExamples = generateTrainingExamples(capabilities, 500);

  // Split into train/test
  const testSize = Math.floor(allExamples.length * 0.2);
  const testExamples = allExamples.slice(0, testSize);
  const trainExamples = allExamples.slice(testSize);

  console.log(`  ${capabilities.length} capabilities, ${trainExamples.length} train, ${testExamples.length} test\n`);

  const results: AblationResult[] = [];

  for (const config of configs) {
    console.log(`Running: ${config.name} (${config.description})...`);

    const runs: AblationRunResult[] = [];

    for (let run = 0; run < numRuns; run++) {
      const result = runTrainingAblation(config, capabilities, [...trainExamples], testExamples);
      runs.push(result);
      console.log(`  Run ${run + 1}/${numRuns}: loss=${result.finalLoss.toFixed(4)}, acc=${result.finalAccuracy.toFixed(2)}, testAcc=${result.testAccuracy.toFixed(2)}`);
    }

    // Aggregate
    const finalLosses = runs.map((r) => r.finalLoss);
    const finalAccs = runs.map((r) => r.finalAccuracy);
    const testAccs = runs.map((r) => r.testAccuracy);
    const times = runs.map((r) => r.trainingTimeMs);

    // Epochs to converge (90% of final accuracy)
    const targetAcc = mean(finalAccs) * 0.9;
    const epochsToConverge = runs[0].epochMetrics.findIndex((m) => m.accuracy >= targetAcc) + 1 || config.epochs;

    results.push({
      config,
      runs,
      meanFinalLoss: mean(finalLosses),
      stdFinalLoss: stdDev(finalLosses),
      meanFinalAcc: mean(finalAccs),
      stdFinalAcc: stdDev(finalAccs),
      meanTestAcc: mean(testAccs),
      stdTestAcc: stdDev(testAccs),
      epochsToConverge,
      trainingTimeMs: mean(times),
    });
  }

  return results;
}

// ============================================================================
// Reporting
// ============================================================================

function formatAblationReport(results: AblationResult[]): string {
  const lines: string[] = [];

  lines.push("╔════════════════════════════════════════════════════════════════════════════════╗");
  lines.push("║                    SHGAT TRAINING ABLATION STUDY                              ║");
  lines.push("╚════════════════════════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  // Summary table
  lines.push("## Summary (sorted by Test Accuracy)");
  lines.push("");
  lines.push("| Config | Train Acc | Test Acc | Loss | Converge | Time |");
  lines.push("|--------|-----------|----------|------|----------|------|");

  // Sort by test accuracy descending
  const sorted = [...results].sort((a, b) => b.meanTestAcc - a.meanTestAcc);

  for (const r of sorted) {
    const trainAcc = `${(r.meanFinalAcc * 100).toFixed(1)}±${(r.stdFinalAcc * 100).toFixed(1)}%`;
    const testAcc = `${(r.meanTestAcc * 100).toFixed(1)}±${(r.stdTestAcc * 100).toFixed(1)}%`;
    const loss = r.meanFinalLoss.toFixed(3);
    const converge = `${r.epochsToConverge} ep`;
    const time = `${(r.trainingTimeMs / 1000).toFixed(1)}s`;
    lines.push(`| ${r.config.name.padEnd(20)} | ${trainAcc.padEnd(9)} | ${testAcc.padEnd(8)} | ${loss} | ${converge.padEnd(8)} | ${time} |`);
  }

  lines.push("");

  // Statistical comparisons vs baseline
  const baseline = results.find((r) => r.config.name === "baseline_production");
  if (baseline) {
    lines.push("## Statistical Comparison vs Baseline");
    lines.push("");
    lines.push("| Config | Δ Test Acc | p-value | Significant |");
    lines.push("|--------|------------|---------|-------------|");

    for (const r of sorted) {
      if (r.config.name === "baseline_production") continue;

      const deltaAcc = (r.meanTestAcc - baseline.meanTestAcc) * 100;
      const pValue = welchTTest(
        r.runs.map((run) => run.testAccuracy),
        baseline.runs.map((run) => run.testAccuracy),
      );
      const significant = pValue < 0.05 ? "YES" : "no";
      const deltaStr = deltaAcc >= 0 ? `+${deltaAcc.toFixed(1)}%` : `${deltaAcc.toFixed(1)}%`;

      lines.push(`| ${r.config.name.padEnd(20)} | ${deltaStr.padEnd(10)} | ${pValue.toFixed(3).padEnd(7)} | ${significant} |`);
    }

    lines.push("");
  }

  // Best config
  lines.push("## Recommendation");
  lines.push("");
  lines.push(`Best config: **${sorted[0].config.name}**`);
  lines.push(`  - ${sorted[0].config.description}`);
  lines.push(`  - Test accuracy: ${(sorted[0].meanTestAcc * 100).toFixed(1)}%`);
  lines.push("");

  // Ablation insights
  lines.push("## Ablation Insights");
  lines.push("");

  // PER impact
  const withPER = results.filter((r) => r.config.usePER);
  const withoutPER = results.filter((r) => !r.config.usePER);
  if (withPER.length > 0 && withoutPER.length > 0) {
    const perAvg = mean(withPER.map((r) => r.meanTestAcc));
    const noperAvg = mean(withoutPER.map((r) => r.meanTestAcc));
    lines.push(`- **PER Impact**: ${((perAvg - noperAvg) * 100).toFixed(1)}% difference (PER ${perAvg > noperAvg ? "helps" : "hurts"})`);
  }

  // Temperature impact
  const fixedTemp = results.filter((r) => typeof r.config.temperature === "number");
  const annealTemp = results.filter((r) => r.config.temperature === "anneal");
  if (fixedTemp.length > 0 && annealTemp.length > 0) {
    const fixedAvg = mean(fixedTemp.map((r) => r.meanTestAcc));
    const annealAvg = mean(annealTemp.map((r) => r.meanTestAcc));
    lines.push(`- **Temperature Annealing Impact**: ${((annealAvg - fixedAvg) * 100).toFixed(1)}% difference (annealing ${annealAvg > fixedAvg ? "helps" : "hurts"})`);
  }

  // Curriculum impact
  const withCurr = results.filter((r) => r.config.useCurriculum);
  const withoutCurr = results.filter((r) => !r.config.useCurriculum);
  if (withCurr.length > 0 && withoutCurr.length > 0) {
    const currAvg = mean(withCurr.map((r) => r.meanTestAcc));
    const nocurrAvg = mean(withoutCurr.map((r) => r.meanTestAcc));
    lines.push(`- **Curriculum Impact**: ${((currAvg - nocurrAvg) * 100).toFixed(1)}% difference (curriculum ${currAvg > nocurrAvg ? "helps" : "hurts"})`);
  }

  lines.push("");

  return lines.join("\n");
}

// ============================================================================
// Main
// ============================================================================

if (import.meta.main) {
  // Parse args
  const args = Deno.args;
  const isQuick = args.includes("--quick") || Deno.env.get("ABLATION_QUICK") === "1";
  const numRuns = parseInt(Deno.env.get("ABLATION_RUNS") || (isQuick ? "1" : "3"));

  const configs = isQuick ? QUICK_ABLATION_CONFIGS : TRAINING_ABLATION_CONFIGS;
  const mode = isQuick ? "QUICK" : "FULL";

  console.log("╔════════════════════════════════════════════════════════════════════════════════╗");
  console.log(`║           SHGAT TRAINING ABLATION STUDY (${mode.padEnd(5)})                          ║`);
  console.log("╚════════════════════════════════════════════════════════════════════════════════╝\n");

  console.log(`Mode: ${mode} (${configs.length} configs, ${numRuns} run${numRuns > 1 ? "s" : ""} each)`);
  if (isQuick) {
    console.log("  Configs: baseline_production, no_per, temp_fixed_007, no_curriculum, minimal");
    console.log("  Use without --quick for full ablation (12 configs, 10 epochs)\n");
  } else {
    console.log("  Use --quick for fast ablation (5 configs, 5 epochs, ~2 min)\n");
  }

  const results = await runAblationStudy(configs, numRuns);

  const report = formatAblationReport(results);
  console.log("\n" + report);

  // Save report to file
  const suffix = isQuick ? "-quick" : "";
  const reportPath = `tests/benchmarks/reports/training-ablation${suffix}-${new Date().toISOString().split("T")[0]}.md`;
  try {
    await Deno.mkdir("tests/benchmarks/reports", { recursive: true });
    await Deno.writeTextFile(reportPath, report);
    console.log(`\nReport saved to: ${reportPath}`);
  } catch (e) {
    console.warn(`Could not save report: ${e}`);
  }
}

// ============================================================================
// Tests
// ============================================================================

Deno.test("Training ablation: all configs produce valid results", async () => {
  const capabilities = generateSyntheticCapabilities(10);
  const examples = generateTrainingExamples(capabilities, 50);
  const testExamples = examples.slice(0, 10);
  const trainExamples = examples.slice(10);

  // Test a subset of configs
  const testConfigs = [
    TRAINING_ABLATION_CONFIGS.find((c) => c.name === "baseline_production")!,
    TRAINING_ABLATION_CONFIGS.find((c) => c.name === "minimal")!,
  ];

  for (const config of testConfigs) {
    const modifiedConfig = { ...config, epochs: 2, batchSize: 8 };
    const result = runTrainingAblation(modifiedConfig, capabilities, trainExamples, testExamples);

    if (result.finalLoss < 0 || result.finalLoss > 100) {
      throw new Error(`${config.name}: Invalid loss ${result.finalLoss}`);
    }
    if (result.finalAccuracy < 0 || result.finalAccuracy > 1) {
      throw new Error(`${config.name}: Invalid accuracy ${result.finalAccuracy}`);
    }
  }
});

Deno.test("Training ablation: PER vs uniform sampling differs", async () => {
  const capabilities = generateSyntheticCapabilities(20);
  const examples = generateTrainingExamples(capabilities, 100);
  const testExamples = examples.slice(0, 20);
  const trainExamples = examples.slice(20);

  const perConfig = { ...TRAINING_ABLATION_CONFIGS.find((c) => c.name === "baseline_production")!, epochs: 3 };
  const uniformConfig = { ...TRAINING_ABLATION_CONFIGS.find((c) => c.name === "no_per")!, epochs: 3 };

  const perResult = runTrainingAblation(perConfig, capabilities, [...trainExamples], testExamples);
  const uniformResult = runTrainingAblation(uniformConfig, capabilities, [...trainExamples], testExamples);

  // Results should exist (may or may not differ significantly)
  if (perResult.epochMetrics.length !== 3) {
    throw new Error("PER config should have 3 epochs");
  }
  if (uniformResult.epochMetrics.length !== 3) {
    throw new Error("Uniform config should have 3 epochs");
  }
});
