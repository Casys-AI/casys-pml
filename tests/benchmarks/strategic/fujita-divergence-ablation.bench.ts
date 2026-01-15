/**
 * Fujita Divergence Ablation Study
 *
 * Compares our implementation choices against Fujita's n-SuHGAT paper:
 *
 * 1. ATTENTION MECHANISM:
 *    - Fujita: dot-product attention: softmax((H·W) · (E·W)^T)
 *    - Ours: GAT-style concat: a^T · LeakyReLU([H·W || E·W])
 *
 * 2. ACTIVATION FUNCTION:
 *    - Fujita: none (identity)
 *    - Ours: ELU
 *
 * Uses the real SHGAT implementation with OpenBLAS acceleration.
 *
 * Run: deno run --allow-all tests/benchmarks/strategic/fujita-divergence-ablation.bench.ts
 *
 * @module tests/benchmarks/strategic/fujita-divergence-ablation
 */

import { createSHGATFromCapabilities, type TrainingExample } from "../../../src/graphrag/algorithms/shgat.ts";
import { NUM_NEGATIVES } from "../../../src/graphrag/algorithms/shgat/types.ts";
import { mean, stdDev } from "../utils/metrics.ts";

// ============================================================================
// Types
// ============================================================================

interface AblationConfig {
  name: string;
  attentionType: "gat_concat" | "dot_product";
  aggregationActivation: "elu" | "none";
  numHeads: number;
  headDim: number;
}

interface RunResult {
  trainAccuracy: number;
  testAccuracy: number;
  mrr: number;
  timeMs: number;
}

interface AggregatedResult {
  config: AblationConfig;
  runs: RunResult[];
  meanTrainAcc: number;
  meanTestAcc: number;
  stdTestAcc: number;
  meanMrr: number;
  meanTimeMs: number;
}

// ============================================================================
// Configurations
// ============================================================================

const ABLATION_CONFIGS: AblationConfig[] = [
  // =========================================================================
  // 4 HEADS (256-dim output)
  // =========================================================================
  {
    name: "OURS 4h: GAT + ELU",
    attentionType: "gat_concat",
    aggregationActivation: "elu",
    numHeads: 4,
    headDim: 64,
  },
  {
    name: "FUJITA 4h: dot + none",
    attentionType: "dot_product",
    aggregationActivation: "none",
    numHeads: 4,
    headDim: 64,
  },
  {
    name: "HYBRID 4h: GAT + none",
    attentionType: "gat_concat",
    aggregationActivation: "none",
    numHeads: 4,
    headDim: 64,
  },
  {
    name: "HYBRID 4h: dot + ELU",
    attentionType: "dot_product",
    aggregationActivation: "elu",
    numHeads: 4,
    headDim: 64,
  },

  // =========================================================================
  // 16 HEADS (1024-dim output = BGE-M3 match)
  // =========================================================================
  {
    name: "OURS 16h: GAT + ELU",
    attentionType: "gat_concat",
    aggregationActivation: "elu",
    numHeads: 16,
    headDim: 64,
  },
  {
    name: "FUJITA 16h: dot + none",
    attentionType: "dot_product",
    aggregationActivation: "none",
    numHeads: 16,
    headDim: 64,
  },
  {
    name: "HYBRID 16h: GAT + none",
    attentionType: "gat_concat",
    aggregationActivation: "none",
    numHeads: 16,
    headDim: 64,
  },
  {
    name: "HYBRID 16h: dot + ELU",
    attentionType: "dot_product",
    aggregationActivation: "elu",
    numHeads: 16,
    headDim: 64,
  },
];

// ============================================================================
// Data Loading
// ============================================================================

async function loadProductionData(): Promise<{
  capabilities: Array<{ id: string; embedding: number[]; toolsUsed: string[]; successRate: number }>;
  toolEmbeddings: Map<string, number[]>;
  trainExamples: TrainingExample[];
  testExamples: TrainingExample[];
}> {
  const data = JSON.parse(
    await Deno.readTextFile("tests/benchmarks/fixtures/scenarios/production-traces.json")
  );

  const capabilities = data.nodes.capabilities.map((c: { id: string; embedding: number[]; toolsUsed: string[]; successRate: number }) => ({
    id: c.id,
    embedding: c.embedding,
    toolsUsed: c.toolsUsed,
    successRate: c.successRate,
  }));

  const toolEmbeddings = new Map<string, number[]>();
  for (const t of data.nodes.tools) {
    if (t.embedding) {
      toolEmbeddings.set(t.id, t.embedding);
    }
  }

  // Build training examples
  const allExamples: TrainingExample[] = data.episodicEvents.map((ev: { intentEmbedding: number[]; contextTools: string[]; selectedCapability: string; outcome: string }) => {
    const selectedCap = capabilities.find((c: { id: string }) => c.id === ev.selectedCapability);

    // Sort negatives by similarity (hard → easy)
    const allNegativesSorted = capabilities
      .filter((c: { id: string }) => c.id !== ev.selectedCapability)
      .map((c: { id: string; embedding: number[] }) => {
        let sim = 0;
        if (selectedCap) {
          const a = selectedCap.embedding;
          const b = c.embedding;
          let dot = 0, normA = 0, normB = 0;
          for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
          }
          sim = dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
        }
        return { id: c.id, sim };
      })
      .sort((a: { sim: number }, b: { sim: number }) => b.sim - a.sim)
      .map((c: { id: string }) => c.id);

    return {
      intentEmbedding: ev.intentEmbedding,
      contextTools: ev.contextTools,
      candidateId: ev.selectedCapability,
      outcome: ev.outcome === "success" ? 1 : 0,
      negativeCapIds: allNegativesSorted.slice(0, NUM_NEGATIVES),
      allNegativesSorted,
    };
  });

  // Split 80/20
  const testSize = Math.floor(allExamples.length * 0.2);
  const testExamples = allExamples.slice(-testSize);
  const trainExamples = allExamples.slice(0, -testSize);

  return { capabilities, toolEmbeddings, trainExamples, testExamples };
}

// ============================================================================
// Ablation Runner
// ============================================================================

function runAblation(
  config: AblationConfig,
  capabilities: Array<{ id: string; embedding: number[]; toolsUsed: string[]; successRate: number }>,
  toolEmbeddings: Map<string, number[]>,
  trainExamples: TrainingExample[],
  testExamples: TrainingExample[],
  epochs: number = 10,
): RunResult {
  const startTime = performance.now();

  // Create SHGAT with config options
  const shgat = createSHGATFromCapabilities(capabilities, toolEmbeddings, {
    numHeads: config.numHeads,
    hiddenDim: config.numHeads * config.headDim,
    headDim: config.headDim,
    attentionType: config.attentionType,
    aggregationActivation: config.aggregationActivation,
  });

  // Training
  const batchSize = 32;
  const numBatches = Math.ceil(trainExamples.length / batchSize);
  const temperature = 0.07;

  let finalTrainAcc = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    let epochAcc = 0;
    let batchCount = 0;

    for (let b = 0; b < numBatches; b++) {
      const startIdx = b * batchSize;
      let batch = trainExamples.slice(startIdx, startIdx + batchSize);
      if (batch.length < batchSize && b === numBatches - 1) {
        // Pad last batch
        batch = [...batch, ...trainExamples.slice(0, batchSize - batch.length)];
      }

      const weights = batch.map(() => 1.0);
      const result = shgat.trainBatchV1KHeadBatched(batch, weights, false, temperature);
      epochAcc += result.accuracy;
      batchCount++;
    }

    finalTrainAcc = epochAcc / batchCount;
  }

  // Evaluation on test set
  const testWeights = testExamples.map(() => 1.0);
  const testResult = shgat.trainBatchV1KHeadBatched(testExamples, testWeights, true, temperature);

  // Compute MRR using scoreAllCapabilities
  let mrrSum = 0;
  for (const ex of testExamples) {
    const ranked = shgat.scoreAllCapabilities(ex.intentEmbedding, ex.contextTools);
    const rank = ranked.findIndex((r: { capabilityId: string }) => r.capabilityId === ex.candidateId) + 1;
    if (rank > 0) {
      mrrSum += 1 / rank;
    }
  }
  const mrr = mrrSum / testExamples.length;

  const timeMs = performance.now() - startTime;

  return {
    trainAccuracy: finalTrainAcc,
    testAccuracy: testResult.accuracy,
    mrr,
    timeMs,
  };
}

// ============================================================================
// Main
// ============================================================================

async function runFullAblation(numRuns: number = 3): Promise<AggregatedResult[]> {
  console.log("📦 Loading production data...");
  const { capabilities, toolEmbeddings, trainExamples, testExamples } = await loadProductionData();
  console.log(`  Capabilities: ${capabilities.length}`);
  console.log(`  Tools: ${toolEmbeddings.size}`);
  console.log(`  Train examples: ${trainExamples.length}`);
  console.log(`  Test examples: ${testExamples.length}\n`);

  const results: AggregatedResult[] = [];

  console.log(`Running ${ABLATION_CONFIGS.length} configurations × ${numRuns} seeds...\n`);

  console.log("┌──────────────────────────────────────────┬──────────┬──────────┬──────────┬──────────┐");
  console.log("│ Config                                   │ Seed     │ Test Acc │ MRR      │ Time     │");
  console.log("├──────────────────────────────────────────┼──────────┼──────────┼──────────┼──────────┤");

  for (const config of ABLATION_CONFIGS) {
    const runs: RunResult[] = [];

    for (let seed = 0; seed < numRuns; seed++) {
      const result = runAblation(
        config,
        capabilities,
        toolEmbeddings,
        [...trainExamples], // Copy to avoid mutation
        testExamples,
      );
      runs.push(result);

      console.log(
        `│ ${config.name.padEnd(40)} │ #${(seed + 1).toString().padEnd(7)} │ ${(result.testAccuracy * 100).toFixed(1).padStart(5)}%   │ ${result.mrr.toFixed(3).padStart(5)}    │ ${(result.timeMs / 1000).toFixed(1).padStart(5)}s   │`
      );
    }

    const aggregated: AggregatedResult = {
      config,
      runs,
      meanTrainAcc: mean(runs.map((r) => r.trainAccuracy)),
      meanTestAcc: mean(runs.map((r) => r.testAccuracy)),
      stdTestAcc: stdDev(runs.map((r) => r.testAccuracy)),
      meanMrr: mean(runs.map((r) => r.mrr)),
      meanTimeMs: mean(runs.map((r) => r.timeMs)),
    };
    results.push(aggregated);
  }

  console.log("└──────────────────────────────────────────┴──────────┴──────────┴──────────┴──────────┘");

  return results;
}

function printSummary(results: AggregatedResult[]): void {
  console.log("\n");
  console.log("╔═══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║              FUJITA DIVERGENCE ABLATION SUMMARY                               ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════════════╝\n");

  console.log(`Generated: ${new Date().toISOString()}\n`);

  // Sort by test accuracy
  const sorted = [...results].sort((a, b) => b.meanTestAcc - a.meanTestAcc);

  console.log("## Results (sorted by Test Accuracy)\n");
  console.log("| Config | Train Acc | Test Acc | MRR | Time |");
  console.log("|--------|-----------|----------|-----|------|");

  for (const r of sorted) {
    const trainAcc = `${(r.meanTrainAcc * 100).toFixed(1)}%`;
    const testAcc = `${(r.meanTestAcc * 100).toFixed(1)}±${(r.stdTestAcc * 100).toFixed(1)}%`;
    const mrr = r.meanMrr.toFixed(3);
    const time = `${(r.meanTimeMs / 1000).toFixed(1)}s`;
    console.log(`| ${r.config.name.padEnd(25)} | ${trainAcc.padEnd(9)} | ${testAcc.padEnd(8)} | ${mrr} | ${time} |`);
  }

  console.log("\n## Key Findings\n");

  // Compare OURS vs FUJITA for each head config
  for (const heads of [4, 16]) {
    const ours = results.find((r) => r.config.name.includes(`OURS ${heads}h`));
    const fujita = results.find((r) => r.config.name.includes(`FUJITA ${heads}h`));

    if (ours && fujita) {
      const delta = (ours.meanTestAcc - fujita.meanTestAcc) * 100;
      const winner = delta > 0 ? "OURS" : "FUJITA";
      console.log(`- **${heads} heads**: ${winner} wins by ${Math.abs(delta).toFixed(1)}%`);
      console.log(`  - OURS (GAT+ELU): ${(ours.meanTestAcc * 100).toFixed(1)}%`);
      console.log(`  - FUJITA (dot+none): ${(fujita.meanTestAcc * 100).toFixed(1)}%`);
    }
  }

  // Attention type impact
  const gatConfigs = results.filter((r) => r.config.attentionType === "gat_concat");
  const dotConfigs = results.filter((r) => r.config.attentionType === "dot_product");
  if (gatConfigs.length > 0 && dotConfigs.length > 0) {
    const gatAvg = mean(gatConfigs.map((r) => r.meanTestAcc));
    const dotAvg = mean(dotConfigs.map((r) => r.meanTestAcc));
    console.log(`\n- **Attention type impact**: GAT concat ${gatAvg > dotAvg ? ">" : "<"} dot product by ${Math.abs((gatAvg - dotAvg) * 100).toFixed(1)}%`);
  }

  // Activation impact
  const eluConfigs = results.filter((r) => r.config.aggregationActivation === "elu");
  const noneConfigs = results.filter((r) => r.config.aggregationActivation === "none");
  if (eluConfigs.length > 0 && noneConfigs.length > 0) {
    const eluAvg = mean(eluConfigs.map((r) => r.meanTestAcc));
    const noneAvg = mean(noneConfigs.map((r) => r.meanTestAcc));
    console.log(`- **Activation impact**: ELU ${eluAvg > noneAvg ? ">" : "<"} none by ${Math.abs((eluAvg - noneAvg) * 100).toFixed(1)}%`);
  }

  console.log("");
}

if (import.meta.main) {
  const numRuns = parseInt(Deno.env.get("FUJITA_RUNS") || "3");

  console.log("╔═══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║              FUJITA DIVERGENCE ABLATION STUDY                                 ║");
  console.log("║  Comparing our implementation choices against Fujita's n-SuHGAT paper        ║");
  console.log("║                                                                               ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════════════╝\n");

  const results = await runFullAblation(numRuns);
  printSummary(results);

  // Save report
  const reportPath = `tests/benchmarks/reports/fujita-ablation-${new Date().toISOString().split("T")[0]}.md`;
  try {
    await Deno.mkdir("tests/benchmarks/reports", { recursive: true });

    let report = "# Fujita Divergence Ablation Study\n\n";
    report += `Generated: ${new Date().toISOString()}\n\n`;
    report += "## Results\n\n";
    report += "| Config | Train Acc | Test Acc | MRR | Time |\n";
    report += "|--------|-----------|----------|-----|------|\n";

    const sorted = [...results].sort((a, b) => b.meanTestAcc - a.meanTestAcc);
    for (const r of sorted) {
      const trainAcc = `${(r.meanTrainAcc * 100).toFixed(1)}%`;
      const testAcc = `${(r.meanTestAcc * 100).toFixed(1)}±${(r.stdTestAcc * 100).toFixed(1)}%`;
      const mrr = r.meanMrr.toFixed(3);
      const time = `${(r.meanTimeMs / 1000).toFixed(1)}s`;
      report += `| ${r.config.name} | ${trainAcc} | ${testAcc} | ${mrr} | ${time} |\n`;
    }

    await Deno.writeTextFile(reportPath, report);
    console.log(`Report saved to: ${reportPath}`);
  } catch (e) {
    console.warn(`Could not save report: ${e}`);
  }
}
