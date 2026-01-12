/**
 * Live Learning Impact Benchmark
 *
 * Tests whether live learning (1 epoch incremental updates) improves or degrades
 * the model compared to batch-only training.
 *
 * Scenarios tested:
 * 1. Batch only: Train on N caps, test on N caps
 * 2. Batch + Live: Train on N-1 caps, add 1 cap with live learning, test on N caps
 * 3. Accumulate: Train on N-1 caps, accumulate K traces, then live learn, test on N caps
 *
 * Metrics:
 * - Overall testAcc on all capabilities
 * - testAcc on OLD capabilities (forgetting detection)
 * - testAcc on NEW capability (learning detection)
 *
 * @module tests/benchmarks/strategic/live-learning-impact.bench
 */

import { createSHGATFromCapabilities, trainSHGATOnEpisodesKHead, type TrainingExample } from "../../../src/graphrag/algorithms/shgat.ts";
import { createMembersFromLegacy } from "../../../src/graphrag/algorithms/shgat/types.ts";

// ============================================================================
// Types
// ============================================================================

interface CapabilityData {
  id: string;
  embedding: number[];
  toolsUsed: string[];
  successRate: number;
}

interface LiveLearningConfig {
  name: string;
  description: string;
  /** Number of traces to accumulate before live learning (1 = immediate) */
  accumulateTraces: number;
  /** Learning rate for live learning */
  liveLearningRate: number;
  /** Number of epochs for live learning */
  liveEpochs: number;
  /** Whether to use live learning at all */
  useLiveLearning: boolean;
}

interface BenchmarkResult {
  config: LiveLearningConfig;
  runs: {
    overallTestAcc: number;
    oldCapsTestAcc: number;
    newCapTestAcc: number;
    batchOnlyTestAcc: number;
    deltaFromBatchOnly: number;
  }[];
  mean: {
    overallTestAcc: number;
    oldCapsTestAcc: number;
    newCapTestAcc: number;
    batchOnlyTestAcc: number;
    deltaFromBatchOnly: number;
  };
  std: {
    overallTestAcc: number;
    oldCapsTestAcc: number;
    newCapTestAcc: number;
  };
}

// ============================================================================
// Configurations
// ============================================================================

const LIVE_LEARNING_CONFIGS: LiveLearningConfig[] = [
  {
    name: "batch_only",
    description: "Baseline: no live learning, batch training only",
    accumulateTraces: 0,
    liveLearningRate: 0,
    liveEpochs: 0,
    useLiveLearning: false,
  },
  {
    name: "live_immediate_lr03",
    description: "Live learning after each trace, LR=0.03",
    accumulateTraces: 1,
    liveLearningRate: 0.03,
    liveEpochs: 1,
    useLiveLearning: true,
  },
  {
    name: "live_immediate_lr01",
    description: "Live learning after each trace, LR=0.01 (conservative)",
    accumulateTraces: 1,
    liveLearningRate: 0.01,
    liveEpochs: 1,
    useLiveLearning: true,
  },
  {
    name: "live_immediate_lr005",
    description: "Live learning after each trace, LR=0.005 (very conservative)",
    accumulateTraces: 1,
    liveLearningRate: 0.005,
    liveEpochs: 1,
    useLiveLearning: true,
  },
  {
    name: "live_accumulate_3",
    description: "Accumulate 3 traces before live learning",
    accumulateTraces: 3,
    liveLearningRate: 0.03,
    liveEpochs: 1,
    useLiveLearning: true,
  },
  {
    name: "live_accumulate_5",
    description: "Accumulate 5 traces before live learning",
    accumulateTraces: 5,
    liveLearningRate: 0.03,
    liveEpochs: 1,
    useLiveLearning: true,
  },
  {
    name: "live_accumulate_3_2ep",
    description: "Accumulate 3 traces, 2 epochs",
    accumulateTraces: 3,
    liveLearningRate: 0.02,
    liveEpochs: 2,
    useLiveLearning: true,
  },
];

// ============================================================================
// Data Generation
// ============================================================================

function generateSyntheticCapabilities(count: number, embeddingDim: number = 128): CapabilityData[] {
  const capabilities: CapabilityData[] = [];

  for (let i = 0; i < count; i++) {
    // Generate random embedding
    const embedding = Array.from({ length: embeddingDim }, () =>
      (Math.random() - 0.5) * 2
    );
    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
    const normalizedEmbedding = embedding.map(x => x / norm);

    capabilities.push({
      id: `cap_${i}`,
      embedding: normalizedEmbedding,
      toolsUsed: [`tool_${i}_a`, `tool_${i}_b`],
      successRate: 0.8 + Math.random() * 0.2,
    });
  }

  return capabilities;
}

function generateTrainingExamples(
  capabilities: CapabilityData[],
  examplesPerCap: number = 10,
  embeddingDim: number = 128,
): TrainingExample[] {
  const examples: TrainingExample[] = [];

  for (const cap of capabilities) {
    for (let i = 0; i < examplesPerCap; i++) {
      // Generate intent embedding similar to capability embedding (with noise)
      const noise = Array.from({ length: embeddingDim }, () =>
        (Math.random() - 0.5) * 0.3
      );
      const intentEmbedding = cap.embedding.map((x, j) => x + noise[j]);
      const norm = Math.sqrt(intentEmbedding.reduce((sum, x) => sum + x * x, 0));
      const normalizedIntent = intentEmbedding.map(x => x / norm);

      // Negatives: random other capabilities
      const otherCaps = capabilities.filter(c => c.id !== cap.id);
      const negatives = otherCaps
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(8, otherCaps.length))
        .map(c => c.id);

      examples.push({
        intentEmbedding: normalizedIntent,
        candidateId: cap.id,
        negativeCapIds: negatives,
        contextTools: cap.toolsUsed,
        outcome: 1, // Success
      });
    }
  }

  return examples;
}

// ============================================================================
// Evaluation
// ============================================================================

function evaluateModel(
  shgat: ReturnType<typeof createSHGATFromCapabilities>,
  testExamples: TrainingExample[],
  temperature: number = 0.07,
): number {
  if (testExamples.length === 0) return 0;

  const result = shgat.trainBatchV1KHeadBatched(
    testExamples,
    testExamples.map(() => 1.0),
    true, // evaluate only
    temperature,
  );

  return result.accuracy;
}

// ============================================================================
// Benchmark Runner
// ============================================================================

async function runLiveLearningBenchmark(
  config: LiveLearningConfig,
  allCapabilities: CapabilityData[],
  allExamples: TrainingExample[],
  numOldCaps: number,
): Promise<BenchmarkResult["runs"][0]> {
  const embeddingDim = allCapabilities[0].embedding.length;

  // Split capabilities: old (for batch training) and new (for live learning)
  const oldCaps = allCapabilities.slice(0, numOldCaps);
  const newCap = allCapabilities[numOldCaps];

  // Split examples
  const oldExamples = allExamples.filter(ex =>
    oldCaps.some(c => c.id === ex.candidateId)
  );
  const newExamples = allExamples.filter(ex => ex.candidateId === newCap.id);

  // Split into train/test
  const shuffledOld = [...oldExamples].sort(() => Math.random() - 0.5);
  const oldTrainSize = Math.floor(shuffledOld.length * 0.8);
  const oldTrain = shuffledOld.slice(0, oldTrainSize);
  const oldTest = shuffledOld.slice(oldTrainSize);

  const shuffledNew = [...newExamples].sort(() => Math.random() - 0.5);
  const newTrainSize = Math.floor(shuffledNew.length * 0.8);
  const newTrain = shuffledNew.slice(0, newTrainSize);
  const newTest = shuffledNew.slice(newTrainSize);

  // === Batch training on OLD capabilities ===
  const shgat = createSHGATFromCapabilities(oldCaps);

  // Register tools for new capability (will be needed later)
  for (const tool of newCap.toolsUsed) {
    if (!shgat.hasToolNode(tool)) {
      const toolEmb = Array.from({ length: embeddingDim }, () => (Math.random() - 0.5) * 0.1);
      shgat.registerTool({ id: tool, embedding: toolEmb });
    }
  }

  // Batch train on old examples
  await trainSHGATOnEpisodesKHead(shgat, oldTrain, () => null, {
    epochs: 10,
    batchSize: 16,
    learningRate: 0.05,
  });

  // Measure batch-only accuracy on old caps
  const batchOnlyOldAcc = evaluateModel(shgat, oldTest);

  // === Now add new capability and optionally do live learning ===

  // Register new capability
  shgat.registerCapability({
    id: newCap.id,
    embedding: newCap.embedding,
    members: createMembersFromLegacy(newCap.toolsUsed),
    hierarchyLevel: 0,
    toolsUsed: newCap.toolsUsed,
    successRate: newCap.successRate,
  });

  if (config.useLiveLearning && newTrain.length > 0) {
    // Simulate accumulating traces
    const tracesToUse = Math.min(config.accumulateTraces, newTrain.length);
    const liveExamples = newTrain.slice(0, tracesToUse);

    // Apply live learning
    shgat.setLearningRate(config.liveLearningRate);
    await trainSHGATOnEpisodesKHead(shgat, liveExamples, () => null, {
      epochs: config.liveEpochs,
      batchSize: Math.min(16, liveExamples.length),
      learningRate: config.liveLearningRate,
    });
  }

  // === Evaluate on all capabilities ===
  const allTest = [...oldTest, ...newTest];
  const overallTestAcc = evaluateModel(shgat, allTest);
  const oldCapsTestAcc = evaluateModel(shgat, oldTest);
  const newCapTestAcc = newTest.length > 0 ? evaluateModel(shgat, newTest) : 0;

  return {
    overallTestAcc,
    oldCapsTestAcc,
    newCapTestAcc,
    batchOnlyTestAcc: batchOnlyOldAcc,
    deltaFromBatchOnly: oldCapsTestAcc - batchOnlyOldAcc,
  };
}

async function runFullBenchmark(
  configs: LiveLearningConfig[],
  numRuns: number = 3,
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  // Generate data
  console.log("Generating synthetic data...");
  const numCaps = 20;
  const examplesPerCap = 15;
  const embeddingDim = 128;

  const capabilities = generateSyntheticCapabilities(numCaps, embeddingDim);
  const examples = generateTrainingExamples(capabilities, examplesPerCap, embeddingDim);

  console.log(`  ${numCaps} capabilities, ${examples.length} examples`);
  console.log(`  Old caps: ${numCaps - 1}, New cap: 1\n`);

  for (const config of configs) {
    console.log(`Running: ${config.name} (${config.description})...`);

    const runs: BenchmarkResult["runs"] = [];

    for (let run = 0; run < numRuns; run++) {
      const result = await runLiveLearningBenchmark(
        config,
        capabilities,
        examples,
        numCaps - 1, // Use last cap as "new"
      );

      runs.push(result);
      console.log(
        `  Run ${run + 1}/${numRuns}: overall=${(result.overallTestAcc * 100).toFixed(1)}%, ` +
        `old=${(result.oldCapsTestAcc * 100).toFixed(1)}%, ` +
        `new=${(result.newCapTestAcc * 100).toFixed(1)}%, ` +
        `Δold=${(result.deltaFromBatchOnly * 100).toFixed(1)}%`
      );
    }

    // Calculate mean and std
    const mean = {
      overallTestAcc: runs.reduce((sum, r) => sum + r.overallTestAcc, 0) / runs.length,
      oldCapsTestAcc: runs.reduce((sum, r) => sum + r.oldCapsTestAcc, 0) / runs.length,
      newCapTestAcc: runs.reduce((sum, r) => sum + r.newCapTestAcc, 0) / runs.length,
      batchOnlyTestAcc: runs.reduce((sum, r) => sum + r.batchOnlyTestAcc, 0) / runs.length,
      deltaFromBatchOnly: runs.reduce((sum, r) => sum + r.deltaFromBatchOnly, 0) / runs.length,
    };

    const std = {
      overallTestAcc: Math.sqrt(runs.reduce((sum, r) => sum + Math.pow(r.overallTestAcc - mean.overallTestAcc, 2), 0) / runs.length),
      oldCapsTestAcc: Math.sqrt(runs.reduce((sum, r) => sum + Math.pow(r.oldCapsTestAcc - mean.oldCapsTestAcc, 2), 0) / runs.length),
      newCapTestAcc: Math.sqrt(runs.reduce((sum, r) => sum + Math.pow(r.newCapTestAcc - mean.newCapTestAcc, 2), 0) / runs.length),
    };

    results.push({ config, runs, mean, std });
  }

  return results;
}

// ============================================================================
// Report Generation
// ============================================================================

function formatReport(results: BenchmarkResult[]): string {
  const lines: string[] = [];

  lines.push("# Live Learning Impact Benchmark Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("This benchmark tests whether live learning (incremental 1-epoch updates) improves");
  lines.push("or degrades the model compared to batch-only training.");
  lines.push("");
  lines.push("### Key Metrics");
  lines.push("- **Old Caps Acc**: Accuracy on capabilities from batch training (detects forgetting)");
  lines.push("- **New Cap Acc**: Accuracy on the new capability (detects learning)");
  lines.push("- **Δ Old**: Change in old caps accuracy after live learning (negative = forgetting)");
  lines.push("");

  // Results table
  lines.push("## Results");
  lines.push("");
  lines.push("| Config | Old Caps | New Cap | Δ Old | Overall |");
  lines.push("|--------|----------|---------|-------|---------|");

  // Sort by overall accuracy
  const sorted = [...results].sort((a, b) => b.mean.overallTestAcc - a.mean.overallTestAcc);

  for (const r of sorted) {
    const oldAcc = `${(r.mean.oldCapsTestAcc * 100).toFixed(1)}±${(r.std.oldCapsTestAcc * 100).toFixed(1)}%`;
    const newAcc = `${(r.mean.newCapTestAcc * 100).toFixed(1)}±${(r.std.newCapTestAcc * 100).toFixed(1)}%`;
    const delta = r.mean.deltaFromBatchOnly >= 0
      ? `+${(r.mean.deltaFromBatchOnly * 100).toFixed(1)}%`
      : `${(r.mean.deltaFromBatchOnly * 100).toFixed(1)}%`;
    const overall = `${(r.mean.overallTestAcc * 100).toFixed(1)}%`;

    lines.push(`| ${r.config.name} | ${oldAcc} | ${newAcc} | ${delta} | ${overall} |`);
  }

  lines.push("");

  // Analysis
  lines.push("## Analysis");
  lines.push("");

  const baseline = results.find(r => r.config.name === "batch_only");
  if (baseline) {
    lines.push(`### Baseline (batch_only)`);
    lines.push(`- Old caps accuracy: ${(baseline.mean.oldCapsTestAcc * 100).toFixed(1)}%`);
    lines.push(`- New cap accuracy: ${(baseline.mean.newCapTestAcc * 100).toFixed(1)}% (no live learning)`);
    lines.push("");

    // Find best live learning config
    const liveConfigs = results.filter(r => r.config.useLiveLearning);
    const bestLive = liveConfigs.sort((a, b) => b.mean.overallTestAcc - a.mean.overallTestAcc)[0];
    const worstForgetting = liveConfigs.sort((a, b) => a.mean.deltaFromBatchOnly - b.mean.deltaFromBatchOnly)[0];
    const bestNewCap = liveConfigs.sort((a, b) => b.mean.newCapTestAcc - a.mean.newCapTestAcc)[0];

    if (bestLive) {
      lines.push(`### Best Overall: ${bestLive.config.name}`);
      lines.push(`- Overall: ${(bestLive.mean.overallTestAcc * 100).toFixed(1)}%`);
      lines.push(`- Δ Old: ${(bestLive.mean.deltaFromBatchOnly * 100).toFixed(1)}%`);
      lines.push("");
    }

    if (worstForgetting && worstForgetting.mean.deltaFromBatchOnly < -0.01) {
      lines.push(`### Worst Forgetting: ${worstForgetting.config.name}`);
      lines.push(`- Δ Old: ${(worstForgetting.mean.deltaFromBatchOnly * 100).toFixed(1)}% (forgetting detected)`);
      lines.push("");
    }

    if (bestNewCap) {
      lines.push(`### Best New Cap Learning: ${bestNewCap.config.name}`);
      lines.push(`- New cap accuracy: ${(bestNewCap.mean.newCapTestAcc * 100).toFixed(1)}%`);
      lines.push("");
    }
  }

  // Recommendations
  lines.push("## Recommendations");
  lines.push("");

  const liveConfigs = results.filter(r => r.config.useLiveLearning);
  const avgDelta = liveConfigs.reduce((sum, r) => sum + r.mean.deltaFromBatchOnly, 0) / liveConfigs.length;

  if (avgDelta < -0.05) {
    lines.push("⚠️ **Live learning causes significant forgetting**");
    lines.push("- Consider disabling live learning");
    lines.push("- Or use very conservative LR (0.005 or lower)");
    lines.push("- Or accumulate more traces before updating");
  } else if (avgDelta < -0.02) {
    lines.push("⚠️ **Live learning causes mild forgetting**");
    lines.push("- Consider lowering LR or accumulating more traces");
  } else if (avgDelta > 0.02) {
    lines.push("✅ **Live learning improves old capabilities**");
    lines.push("- Current config is beneficial");
  } else {
    lines.push("➖ **Live learning has neutral impact on old capabilities**");
    lines.push("- Safe to use, but benefit is marginal");
  }

  lines.push("");

  return lines.join("\n");
}

// ============================================================================
// Main
// ============================================================================

if (import.meta.main) {
  const args = Deno.args;
  const isQuick = args.includes("--quick");
  const numRuns = isQuick ? 1 : 3;

  console.log("╔════════════════════════════════════════════════════════════════════════════════╗");
  console.log("║           LIVE LEARNING IMPACT BENCHMARK                                       ║");
  console.log("╚════════════════════════════════════════════════════════════════════════════════╝\n");

  console.log(`Mode: ${isQuick ? "QUICK" : "FULL"} (${LIVE_LEARNING_CONFIGS.length} configs, ${numRuns} runs each)\n`);

  const results = await runFullBenchmark(LIVE_LEARNING_CONFIGS, numRuns);

  const report = formatReport(results);
  console.log("\n" + report);

  // Save report
  const reportPath = `tests/benchmarks/reports/live-learning-impact-${new Date().toISOString().split("T")[0]}.md`;
  try {
    await Deno.mkdir("tests/benchmarks/reports", { recursive: true });
    await Deno.writeTextFile(reportPath, report);
    console.log(`\nReport saved to: ${reportPath}`);
  } catch (e) {
    console.warn(`Could not save report: ${e}`);
  }
}
