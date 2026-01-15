/**
 * Head Dimension Comparison Benchmark
 *
 * Compares two K-head attention architectures:
 * - WIDE: W_q/W_k/W_v = [1024, 1024] per head (current)
 * - STANDARD: W_q/W_k/W_v = [64, 1024] per head (Transformer-style)
 *
 * Metrics:
 * - Parameter count
 * - Training accuracy
 * - Test accuracy
 * - Memory usage
 * - Serialization size
 *
 * @module benchmarks/strategic/head-dim-comparison
 */

import { initBlasAcceleration } from "../../../src/graphrag/algorithms/shgat/utils/math.ts";
import { createSHGATFromCapabilities } from "../../../src/graphrag/algorithms/shgat.ts";
import type { TrainingExample } from "../../../src/graphrag/algorithms/shgat/types.ts";
import { encode as msgpackEncode } from "npm:@msgpack/msgpack@3.0.0-beta2";

// =============================================================================
// Configuration
// =============================================================================

const NUM_EPOCHS = 5;
const BATCH_SIZE = 32;
const NUM_RUNS = 3;

interface BenchmarkResult {
  architecture: "wide" | "standard";
  paramCount: number;
  paramSizeMB: number;
  trainAccuracy: number;
  testAccuracy: number;
  trainingTimeMs: number;
  serializationTimeMs: number;
}

// =============================================================================
// Data Loading (from production-traces fixture)
// =============================================================================

async function loadProductionData(): Promise<{
  capabilities: Array<{ id: string; embedding: number[]; toolsUsed: string[]; successRate: number }>;
  trainExamples: TrainingExample[];
  testExamples: TrainingExample[];
}> {
  const data = JSON.parse(
    await Deno.readTextFile("tests/benchmarks/fixtures/scenarios/production-traces.json")
  );

  const capabilities = data.nodes.capabilities.map((c: {
    id: string;
    embedding: number[];
    toolsUsed: string[];
    successRate: number;
  }) => ({
    id: c.id,
    embedding: c.embedding,
    toolsUsed: c.toolsUsed,
    successRate: c.successRate,
  }));

  // Build training examples from episodic events
  const allExamples: TrainingExample[] = data.episodicEvents.map((ev: {
    intentEmbedding: number[];
    contextTools: string[];
    selectedCapability: string;
    outcome: string;
  }) => {
    const selectedCap = capabilities.find((c: { id: string }) => c.id === ev.selectedCapability);

    // Sort negatives by similarity for curriculum
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
      negativeCapIds: allNegativesSorted.slice(0, 5),
      allNegativesSorted,
    };
  });

  // Split 80/20
  const shuffled = [...allExamples].sort(() => Math.random() - 0.5);
  const testSize = Math.floor(shuffled.length * 0.2);
  const testExamples = shuffled.slice(0, testSize);
  const trainExamples = shuffled.slice(testSize);

  return { capabilities, trainExamples, testExamples };
}

// =============================================================================
// Modified SHGAT Creation with Architecture Choice
// =============================================================================

function createSHGATWithArchitecture(
  capabilities: Array<{ id: string; embedding: number[]; toolsUsed: string[]; successRate: number }>,
  architecture: "wide" | "standard"
): ReturnType<typeof createSHGATFromCapabilities> {
  // Create standard SHGAT
  const shgat = createSHGATFromCapabilities(capabilities);

  if (architecture === "standard") {
    // Reinitialize headParams with correct dimensions
    const params = shgat.exportParams();
    const numHeads = 16;
    const embeddingDim = 1024;
    const headDim = 64; // Standard: 1024 / 16 = 64

    // Create new headParams with [64, 1024] matrices instead of [1024, 1024]
    const newHeadParams = [];
    for (let h = 0; h < numHeads; h++) {
      const W_shared = initMatrixScaled(headDim, embeddingDim, 10);
      newHeadParams.push({
        W_q: W_shared,
        W_k: W_shared,
        W_v: initMatrix(headDim, embeddingDim),
        a: initVector(2 * headDim),
      });
    }

    // Import modified params
    shgat.importParams({
      ...params,
      headParams: newHeadParams,
    });
  }

  return shgat;
}

// Matrix initialization helpers (copied from parameters.ts)
function initMatrixScaled(rows: number, cols: number, scaleFactor: number = 10): number[][] {
  const scale = Math.sqrt(2.0 / (rows + cols)) * scaleFactor;
  const result = new Array(rows);
  for (let i = 0; i < rows; i++) {
    result[i] = new Array(cols);
    for (let j = 0; j < cols; j++) {
      result[i][j] = (Math.random() - 0.5) * 2 * scale;
    }
  }
  return result;
}

function initMatrix(rows: number, cols: number): number[][] {
  const scale = Math.sqrt(2.0 / (rows + cols));
  const result = new Array(rows);
  for (let i = 0; i < rows; i++) {
    result[i] = new Array(cols);
    for (let j = 0; j < cols; j++) {
      result[i][j] = (Math.random() - 0.5) * 2 * scale;
    }
  }
  return result;
}

function initVector(size: number): number[] {
  const scale = Math.sqrt(1.0 / size);
  return Array.from({ length: size }, () => (Math.random() - 0.5) * 2 * scale);
}

// =============================================================================
// Training Loop
// =============================================================================

async function runTraining(
  shgat: ReturnType<typeof createSHGATFromCapabilities>,
  trainExamples: TrainingExample[],
  testExamples: TrainingExample[],
  epochs: number,
  batchSize: number,
): Promise<{ trainAcc: number; testAcc: number; timeMs: number }> {
  const startTime = Date.now();

  // Deep copy examples to avoid mutation
  const examples = trainExamples.map(ex => ({
    ...ex,
    negativeCapIds: [...ex.negativeCapIds],
    allNegativesSorted: ex.allNegativesSorted ? [...ex.allNegativesSorted] : undefined,
  }));

  let finalTrainAcc = 0;
  let finalTestAcc = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    // Shuffle examples
    const shuffled = [...examples].sort(() => Math.random() - 0.5);

    // Train batches
    for (let i = 0; i < shuffled.length; i += batchSize) {
      const batch = shuffled.slice(i, i + batchSize);
      const weights = batch.map(() => 1.0);
      const temperature = 0.07;

      const result = shgat.trainBatchV1KHeadBatched(batch, weights, false, temperature);
      finalTrainAcc = result.accuracy;
    }

    // Evaluate on test set
    if (testExamples.length > 0) {
      const testResult = shgat.trainBatchV1KHeadBatched(testExamples, testExamples.map(() => 1.0), true, 0.07);
      finalTestAcc = testResult.accuracy;
    }
  }

  return {
    trainAcc: finalTrainAcc,
    testAcc: finalTestAcc,
    timeMs: Date.now() - startTime,
  };
}

// =============================================================================
// Benchmark Runner
// =============================================================================

async function runBenchmark(
  architecture: "wide" | "standard",
  capabilities: Array<{ id: string; embedding: number[]; toolsUsed: string[]; successRate: number }>,
  trainExamples: TrainingExample[],
  testExamples: TrainingExample[],
): Promise<BenchmarkResult> {
  console.log(`\n  Running ${architecture.toUpperCase()} architecture...`);

  // Create SHGAT with chosen architecture
  const shgat = createSHGATWithArchitecture(capabilities, architecture);

  // Get param size
  const params = shgat.exportParams();
  const serializeStart = Date.now();
  const encoded = msgpackEncode(params);
  const serializeTime = Date.now() - serializeStart;
  const paramSizeMB = encoded.length / 1024 / 1024;

  // Count params
  const headParams = params.headParams as Array<{ W_q: number[][]; W_k: number[][]; W_v: number[][]; a: number[] }>;
  let paramCount = 0;
  for (const hp of headParams) {
    paramCount += hp.W_q.length * hp.W_q[0].length; // W_q
    paramCount += hp.W_v.length * hp.W_v[0].length; // W_v (W_k = W_q shared)
    paramCount += hp.a.length;
  }

  console.log(`    Params: ${(paramCount / 1e6).toFixed(2)}M (${paramSizeMB.toFixed(1)} MB)`);

  // Run training
  const results: { trainAcc: number; testAcc: number }[] = [];

  for (let run = 0; run < NUM_RUNS; run++) {
    // Reset params for each run
    const freshShgat = createSHGATWithArchitecture(capabilities, architecture);

    const result = await runTraining(
      freshShgat,
      trainExamples,
      testExamples,
      NUM_EPOCHS,
      BATCH_SIZE,
    );

    results.push({ trainAcc: result.trainAcc, testAcc: result.testAcc });
    console.log(`    Run ${run + 1}/${NUM_RUNS}: train=${(result.trainAcc * 100).toFixed(1)}%, test=${(result.testAcc * 100).toFixed(1)}%`);
  }

  // Average results
  const avgTrainAcc = results.reduce((a, b) => a + b.trainAcc, 0) / results.length;
  const avgTestAcc = results.reduce((a, b) => a + b.testAcc, 0) / results.length;

  return {
    architecture,
    paramCount,
    paramSizeMB,
    trainAccuracy: avgTrainAcc,
    testAccuracy: avgTestAcc,
    trainingTimeMs: 0, // Not measured per-run
    serializationTimeMs: serializeTime,
  };
}

// =============================================================================
// Main
// =============================================================================

console.log("╔════════════════════════════════════════════════════════════════════════════════╗");
console.log("║           HEAD DIMENSION COMPARISON BENCHMARK                                  ║");
console.log("╚════════════════════════════════════════════════════════════════════════════════╝");
console.log();
console.log(`Config: ${NUM_EPOCHS} epochs, ${BATCH_SIZE} batch size, ${NUM_RUNS} runs per architecture`);
console.log();

// Initialize BLAS
const blasEnabled = await initBlasAcceleration();
console.log(`BLAS: ${blasEnabled ? "enabled (OpenBLAS)" : "disabled"}`);

// Load data
console.log("\nLoading production data...");
const { capabilities, trainExamples, testExamples } = await loadProductionData();
console.log(`  ${capabilities.length} capabilities, ${trainExamples.length} train, ${testExamples.length} test examples`);

// Run benchmarks
const results: BenchmarkResult[] = [];

// Wide architecture (current)
results.push(await runBenchmark("wide", capabilities, trainExamples, testExamples));

// Standard architecture (Transformer-style)
results.push(await runBenchmark("standard", capabilities, trainExamples, testExamples));

// =============================================================================
// Results Summary
// =============================================================================

console.log("\n");
console.log("╔════════════════════════════════════════════════════════════════════════════════╗");
console.log("║                              RESULTS SUMMARY                                   ║");
console.log("╠════════════════════════════════════════════════════════════════════════════════╣");
console.log("║  Architecture  │  Params (M)  │  Size (MB)  │  Train Acc  │  Test Acc        ║");
console.log("╠════════════════════════════════════════════════════════════════════════════════╣");

for (const r of results) {
  const arch = r.architecture.toUpperCase().padEnd(12);
  const params = (r.paramCount / 1e6).toFixed(2).padStart(10);
  const size = r.paramSizeMB.toFixed(1).padStart(9);
  const trainAcc = (r.trainAccuracy * 100).toFixed(1).padStart(9) + "%";
  const testAcc = (r.testAccuracy * 100).toFixed(1).padStart(8) + "%";

  console.log(`║  ${arch}  │ ${params}   │ ${size}   │ ${trainAcc}   │ ${testAcc}         ║`);
}

console.log("╚════════════════════════════════════════════════════════════════════════════════╝");

// Comparison
const wide = results.find(r => r.architecture === "wide")!;
const standard = results.find(r => r.architecture === "standard")!;

console.log("\n📊 Comparison:");
console.log(`   Parameter reduction: ${((1 - standard.paramCount / wide.paramCount) * 100).toFixed(1)}%`);
console.log(`   Size reduction: ${((1 - standard.paramSizeMB / wide.paramSizeMB) * 100).toFixed(1)}%`);
console.log(`   Train accuracy delta: ${((standard.trainAccuracy - wide.trainAccuracy) * 100).toFixed(1)}%`);
console.log(`   Test accuracy delta: ${((standard.testAccuracy - wide.testAccuracy) * 100).toFixed(1)}%`);

if (standard.testAccuracy >= wide.testAccuracy * 0.95) {
  console.log("\n✅ STANDARD architecture is recommended (similar accuracy, 16x smaller)");
} else {
  console.log("\n⚠️  WIDE architecture performs better but storage is problematic");
}
