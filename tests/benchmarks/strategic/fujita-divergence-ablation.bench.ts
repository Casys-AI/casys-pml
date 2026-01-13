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
 *    - Fujita: σ (generic, likely ReLU or none)
 *    - Ours: ELU
 *
 * 3. AGGREGATION TARGET:
 *    - Fujita: aggregates unprojected H: E^new = σ(A^T · H)
 *    - Ours: aggregates projected H': E^new = ELU(A^T · H·W)
 *
 * Run: deno run --allow-all tests/benchmarks/strategic/fujita-divergence-ablation.bench.ts
 *
 * @module tests/benchmarks/strategic/fujita-divergence-ablation
 */

import { loadScenario } from "../fixtures/scenario-loader.ts";

// ============================================================================
// Types
// ============================================================================

interface CapabilityData {
  id: string;
  embedding: number[];
  toolsUsed: string[];
  successRate: number;
}

interface TrainingExample {
  intentEmbedding: number[];
  contextTools: string[];
  candidateId: string;
  outcome: number;
  negativeCapIds: string[];
}

interface AblationConfig {
  name: string;
  attentionType: "gat_concat" | "dot_product";
  activation: "elu" | "relu" | "none";
  aggregateProjected: boolean;
  numHeads: number;
  headDim: number;
}

interface AblationResult {
  config: string;
  trainAccuracy: number;
  testAccuracy: number;
  loss: number;
  mrr: number;
  convergenceEpoch: number;
  timeMs: number;
}

// ============================================================================
// Math Utilities
// ============================================================================

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

function matmul(A: number[][], B: number[][]): number[][] {
  const m = A.length;
  const n = B[0].length;
  const k = B.length;
  const C: number[][] = Array.from({ length: m }, () => Array(n).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      for (let l = 0; l < k; l++) {
        C[i][j] += A[i][l] * B[l][j];
      }
    }
  }
  return C;
}

function transpose(A: number[][]): number[][] {
  const m = A.length;
  const n = A[0]?.length ?? 0;
  return Array.from({ length: n }, (_, j) =>
    Array.from({ length: m }, (_, i) => A[i][j])
  );
}

function softmax(x: number[]): number[] {
  const max = Math.max(...x);
  const exp = x.map((v) => Math.exp(v - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map((v) => v / sum);
}

function leakyRelu(x: number, alpha: number = 0.2): number {
  return x > 0 ? x : alpha * x;
}

function elu(x: number, alpha: number = 1.0): number {
  return x >= 0 ? x : alpha * (Math.exp(x) - 1);
}

function relu(x: number): number {
  return Math.max(0, x);
}

function applyActivation(x: number, type: "elu" | "relu" | "none"): number {
  switch (type) {
    case "elu":
      return elu(x);
    case "relu":
      return relu(x);
    case "none":
      return x;
  }
}

function initMatrix(rows: number, cols: number, scale: number = 0.1): number[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (Math.random() - 0.5) * scale)
  );
}

function initVector(size: number, scale: number = 0.1): number[] {
  return Array.from({ length: size }, () => (Math.random() - 0.5) * scale);
}

// ============================================================================
// Attention Implementations
// ============================================================================

/**
 * GAT-style attention (our implementation)
 * score(i,j) = a^T · LeakyReLU([H_i·W || E_j·W])
 */
function gatAttention(
  H_proj: number[][],
  E_proj: number[][],
  a: number[],
  connectivity: number[][],
): number[][] {
  const numH = H_proj.length;
  const numE = E_proj.length;
  const headDim = H_proj[0].length;
  const attention: number[][] = Array.from({ length: numH }, () => Array(numE).fill(0));

  for (let i = 0; i < numH; i++) {
    for (let j = 0; j < numE; j++) {
      if (connectivity[i][j] === 1) {
        // Concatenate and apply LeakyReLU
        const concat = [...H_proj[i], ...E_proj[j]];
        const activated = concat.map((x) => leakyRelu(x));
        attention[i][j] = dot(a, activated);
      } else {
        attention[i][j] = -Infinity;
      }
    }
  }

  // Softmax per column (per edge)
  for (let j = 0; j < numE; j++) {
    const colIndices: number[] = [];
    const colValues: number[] = [];
    for (let i = 0; i < numH; i++) {
      if (connectivity[i][j] === 1) {
        colIndices.push(i);
        colValues.push(attention[i][j]);
      }
    }
    if (colIndices.length > 0) {
      const softmaxed = softmax(colValues);
      for (let k = 0; k < colIndices.length; k++) {
        attention[colIndices[k]][j] = softmaxed[k];
      }
    }
  }

  return attention;
}

/**
 * Dot-product attention (Fujita's approach)
 * score(i,j) = (H_i·W) · (E_j·W)^T
 */
function dotProductAttention(
  H_proj: number[][],
  E_proj: number[][],
  connectivity: number[][],
): number[][] {
  const numH = H_proj.length;
  const numE = E_proj.length;
  const attention: number[][] = Array.from({ length: numH }, () => Array(numE).fill(0));

  for (let i = 0; i < numH; i++) {
    for (let j = 0; j < numE; j++) {
      if (connectivity[i][j] === 1) {
        attention[i][j] = dot(H_proj[i], E_proj[j]);
      } else {
        attention[i][j] = -Infinity;
      }
    }
  }

  // Softmax per column (per edge)
  for (let j = 0; j < numE; j++) {
    const colIndices: number[] = [];
    const colValues: number[] = [];
    for (let i = 0; i < numH; i++) {
      if (connectivity[i][j] === 1) {
        colIndices.push(i);
        colValues.push(attention[i][j]);
      }
    }
    if (colIndices.length > 0) {
      const softmaxed = softmax(colValues);
      for (let k = 0; k < colIndices.length; k++) {
        attention[colIndices[k]][j] = softmaxed[k];
      }
    }
  }

  return attention;
}

// ============================================================================
// Configurable Message Passing Layer
// ============================================================================

class ConfigurableMessagePassingLayer {
  private W_h: number[][];
  private W_e: number[][];
  private a: number[];
  private config: AblationConfig;
  private readonly embDim: number;
  private readonly outputDim: number; // numHeads × headDim

  constructor(embDim: number, headDim: number, config: AblationConfig) {
    this.embDim = embDim;
    // Total output dimension = numHeads × headDim
    // 4 heads × 64 = 256-dim (compression 4×)
    // 16 heads × 64 = 1024-dim (no compression)
    this.outputDim = config.numHeads * headDim;
    this.config = config;

    // Initialize weights with full output dimension
    this.W_h = initMatrix(this.outputDim, embDim);
    this.W_e = initMatrix(this.outputDim, embDim);
    this.a = initVector(2 * this.outputDim);
  }

  forward(
    H: number[][],
    E: number[][],
    connectivity: number[][],
  ): { E_new: number[][]; attention: number[][] } {
    const numE = E.length;

    // Project embeddings to outputDim
    const H_proj = H.map((h) => {
      const proj = Array(this.outputDim).fill(0);
      for (let i = 0; i < this.outputDim; i++) {
        for (let j = 0; j < this.embDim; j++) {
          proj[i] += this.W_h[i][j] * h[j];
        }
      }
      return proj;
    });

    const E_proj = E.map((e) => {
      const proj = Array(this.outputDim).fill(0);
      for (let i = 0; i < this.outputDim; i++) {
        for (let j = 0; j < this.embDim; j++) {
          proj[i] += this.W_e[i][j] * e[j];
        }
      }
      return proj;
    });

    // Compute attention based on config
    let attention: number[][];
    if (this.config.attentionType === "gat_concat") {
      attention = gatAttention(H_proj, E_proj, this.a, connectivity);
    } else {
      attention = dotProductAttention(H_proj, E_proj, connectivity);
    }

    // Aggregate based on config
    const E_new: number[][] = [];
    // If aggregating projected, use outputDim; otherwise use original embDim
    const aggregateDim = this.config.aggregateProjected ? this.outputDim : this.embDim;
    const sourceEmb = this.config.aggregateProjected ? H_proj : H;

    for (let j = 0; j < numE; j++) {
      const agg = Array(aggregateDim).fill(0);
      for (let i = 0; i < H.length; i++) {
        if (attention[i][j] > 0) {
          for (let d = 0; d < aggregateDim; d++) {
            agg[d] += attention[i][j] * sourceEmb[i][d];
          }
        }
      }
      // Apply activation
      E_new.push(agg.map((x) => applyActivation(x, this.config.activation)));
    }

    return { E_new, attention };
  }

  // Simple gradient update for benchmarking
  updateWeights(lr: number, dW_h: number[][], dW_e: number[][], da: number[]): void {
    for (let i = 0; i < this.outputDim; i++) {
      for (let j = 0; j < this.embDim; j++) {
        this.W_h[i][j] -= lr * dW_h[i][j];
        this.W_e[i][j] -= lr * dW_e[i][j];
      }
    }
    for (let i = 0; i < this.a.length; i++) {
      this.a[i] -= lr * da[i];
    }
  }
}

// ============================================================================
// Minimal SHGAT for Ablation
// ============================================================================

class AblationSHGAT {
  private layer: ConfigurableMessagePassingLayer;
  private W_intent: number[][];
  private readonly config: AblationConfig;
  private readonly capabilities: Map<string, { embedding: number[]; idx: number }>;
  private readonly tools: Map<string, { embedding: number[]; idx: number }>;
  private readonly connectivity: number[][];
  private readonly embDim: number;
  private readonly headDim: number;

  constructor(
    capabilities: CapabilityData[],
    toolEmbeddings: Map<string, number[]>,
    config: AblationConfig,
    embDim: number = 1024,
  ) {
    this.config = config;
    this.embDim = embDim;
    this.headDim = config.headDim; // Use headDim from config

    // Index capabilities
    this.capabilities = new Map();
    capabilities.forEach((cap, idx) => {
      this.capabilities.set(cap.id, { embedding: cap.embedding, idx });
    });

    // Index tools
    this.tools = new Map();
    let toolIdx = 0;
    for (const [id, emb] of toolEmbeddings) {
      this.tools.set(id, { embedding: emb, idx: toolIdx++ });
    }

    // Build connectivity matrix [tools][caps]
    this.connectivity = Array.from(
      { length: this.tools.size },
      () => Array(capabilities.length).fill(0),
    );
    for (const cap of capabilities) {
      const capIdx = this.capabilities.get(cap.id)!.idx;
      for (const toolId of cap.toolsUsed) {
        const tool = this.tools.get(toolId);
        if (tool) {
          this.connectivity[tool.idx][capIdx] = 1;
        }
      }
    }

    // Initialize layer - use headDim from config
    this.layer = new ConfigurableMessagePassingLayer(embDim, this.headDim, config);

    // Intent projection - output dim = numHeads × headDim for multi-head concat
    const outputDim = config.numHeads * this.headDim;
    this.W_intent = initMatrix(outputDim, embDim);
  }

  scoreAllCapabilities(intentEmbedding: number[]): Array<{ capabilityId: string; score: number }> {
    // Build H (tool embeddings)
    const H: number[][] = [];
    for (const [_, { embedding }] of this.tools) {
      H.push(embedding);
    }

    // Build E (capability embeddings)
    const E: number[][] = [];
    const capIds: string[] = [];
    for (const [id, { embedding }] of this.capabilities) {
      E.push(embedding);
      capIds.push(id);
    }

    // Forward pass
    const { E_new } = this.layer.forward(H, E, this.connectivity);

    // Project intent to match output dimension
    const outputDim = this.config.numHeads * this.headDim;
    const intentProj = Array(outputDim).fill(0);
    for (let i = 0; i < outputDim; i++) {
      for (let j = 0; j < this.embDim; j++) {
        intentProj[i] += this.W_intent[i][j] * intentEmbedding[j];
      }
    }

    // Score each capability
    const results: Array<{ capabilityId: string; score: number }> = [];
    for (let i = 0; i < E_new.length; i++) {
      const score = dot(intentProj, E_new[i]) / Math.sqrt(outputDim);
      results.push({ capabilityId: capIds[i], score });
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  train(
    examples: TrainingExample[],
    epochs: number,
    lr: number = 0.01,
    temperature: number = 0.07,
  ): { losses: number[]; accuracies: number[] } {
    const losses: number[] = [];
    const accuracies: number[] = [];

    for (let epoch = 0; epoch < epochs; epoch++) {
      let epochLoss = 0;
      let epochCorrect = 0;

      for (const ex of examples) {
        const results = this.scoreAllCapabilities(ex.intentEmbedding);

        // InfoNCE loss
        const positiveScore = results.find((r) => r.capabilityId === ex.candidateId)?.score ?? 0;
        const negativeScores = ex.negativeCapIds.map(
          (id) => results.find((r) => r.capabilityId === id)?.score ?? 0,
        );

        const allScores = [positiveScore, ...negativeScores];
        const scaledScores = allScores.map((s) => s / temperature);
        const maxScore = Math.max(...scaledScores);
        const expScores = scaledScores.map((s) => Math.exp(s - maxScore));
        const sumExp = expScores.reduce((a, b) => a + b, 0);
        const loss = -Math.log(expScores[0] / sumExp + 1e-10);

        epochLoss += loss;

        // Accuracy: positive ranked first?
        if (results[0].capabilityId === ex.candidateId) {
          epochCorrect++;
        }

        // Simple weight update (gradient approximation)
        // In a real implementation, we'd compute proper gradients
        const gradScale = (1 - expScores[0] / sumExp) * lr;
        // Update W_intent towards positive embedding
        const posEmb = this.capabilities.get(ex.candidateId)?.embedding;
        if (posEmb) {
          for (let i = 0; i < this.headDim; i++) {
            for (let j = 0; j < this.embDim; j++) {
              this.W_intent[i][j] += gradScale * ex.intentEmbedding[j] * 0.001;
            }
          }
        }
      }

      losses.push(epochLoss / examples.length);
      accuracies.push(epochCorrect / examples.length);
    }

    return { losses, accuracies };
  }
}

// ============================================================================
// Ablation Runner
// ============================================================================

async function runAblation(
  config: AblationConfig,
  capabilities: CapabilityData[],
  toolEmbeddings: Map<string, number[]>,
  trainExamples: TrainingExample[],
  testExamples: TrainingExample[],
  epochs: number = 25,
): Promise<AblationResult> {
  const startTime = performance.now();

  // Create model with this config
  const model = new AblationSHGAT(capabilities, toolEmbeddings, config);

  // Train
  const { losses, accuracies } = model.train(trainExamples, epochs);

  // Find convergence epoch (first epoch where loss < 1.5 * final loss)
  const finalLoss = losses[losses.length - 1];
  const convergenceEpoch = losses.findIndex((l) => l < finalLoss * 1.5) + 1;

  // Test accuracy and MRR
  let testCorrect = 0;
  let totalReciprocal = 0;

  for (const ex of testExamples) {
    const results = model.scoreAllCapabilities(ex.intentEmbedding);
    const rank = results.findIndex((r) => r.capabilityId === ex.candidateId) + 1;

    if (rank === 1) testCorrect++;
    if (rank > 0) totalReciprocal += 1 / rank;
  }

  const endTime = performance.now();

  return {
    config: config.name,
    trainAccuracy: accuracies[accuracies.length - 1],
    testAccuracy: testCorrect / testExamples.length,
    loss: finalLoss,
    mrr: totalReciprocal / testExamples.length,
    convergenceEpoch,
    timeMs: endTime - startTime,
  };
}

// ============================================================================
// Main Experiment
// ============================================================================

if (import.meta.main) {
  console.log("╔════════════════════════════════════════════════════════════════════════════════╗");
  console.log("║              FUJITA DIVERGENCE ABLATION STUDY                                  ║");
  console.log("║                                                                                ║");
  console.log("║  Comparing our implementation choices against Fujita's n-SuHGAT paper         ║");
  console.log("╚════════════════════════════════════════════════════════════════════════════════╝\n");

  // Load data
  console.log("📦 Loading production-traces scenario...");
  const scenario = await loadScenario("production-traces");

  type RawCap = {
    id: string;
    embedding: number[];
    toolsUsed: string[];
    successRate: number;
  };
  type RawTool = { id: string; embedding: number[] };
  type RawEvent = {
    intentEmbedding: number[];
    contextTools: string[];
    selectedCapability: string;
    outcome: string;
  };

  const rawCaps = scenario.nodes.capabilities as RawCap[];
  const rawTools = scenario.nodes.tools as RawTool[];
  const rawEvents = (scenario as { episodicEvents?: RawEvent[] }).episodicEvents || [];

  const capabilities: CapabilityData[] = rawCaps.map((c) => ({
    id: c.id,
    embedding: c.embedding,
    toolsUsed: c.toolsUsed,
    successRate: c.successRate,
  }));

  const toolEmbeddings = new Map<string, number[]>();
  for (const t of rawTools) {
    toolEmbeddings.set(t.id, t.embedding);
  }

  // Create training examples with negatives
  const allCapIds = capabilities.map((c) => c.id);
  const examples: TrainingExample[] = rawEvents.map((event) => {
    const negatives = allCapIds
      .filter((id) => id !== event.selectedCapability)
      .sort(() => Math.random() - 0.5)
      .slice(0, 8);

    return {
      intentEmbedding: event.intentEmbedding,
      contextTools: event.contextTools,
      candidateId: event.selectedCapability,
      outcome: event.outcome === "success" ? 1 : 0,
      negativeCapIds: negatives,
    };
  });

  // Split train/test 80/20
  const splitIdx = Math.floor(examples.length * 0.8);
  const trainExamples = examples.slice(0, splitIdx);
  const testExamples = examples.slice(splitIdx);

  console.log(`  Capabilities: ${capabilities.length}`);
  console.log(`  Tools: ${toolEmbeddings.size}`);
  console.log(`  Train examples: ${trainExamples.length}`);
  console.log(`  Test examples: ${testExamples.length}\n`);

  // Define all configurations to test
  // 4 heads × 64 = 256-dim (compression 4×)
  // 16 heads × 64 = 1024-dim (no compression, fair comparison with Fujita)
  const configs: AblationConfig[] = [
    // =========================================================================
    // 4 HEADS (256-dim output) - Current default for small graphs
    // =========================================================================

    // Baseline: Our current implementation (4 heads)
    {
      name: "OURS 4h: GAT + ELU + proj",
      attentionType: "gat_concat",
      activation: "elu",
      aggregateProjected: true,
      numHeads: 4,
      headDim: 64,
    },

    // Fujita's approach (4 heads for comparison)
    {
      name: "FUJITA 4h: dot + none + unproj",
      attentionType: "dot_product",
      activation: "none",
      aggregateProjected: false,
      numHeads: 4,
      headDim: 64,
    },

    // =========================================================================
    // 16 HEADS (1024-dim output) - Fair comparison, no compression
    // =========================================================================

    // Our implementation with 16 heads
    {
      name: "OURS 16h: GAT + ELU + proj",
      attentionType: "gat_concat",
      activation: "elu",
      aggregateProjected: true,
      numHeads: 16,
      headDim: 64,
    },

    // Fujita's approach with 16 heads (fair comparison)
    {
      name: "FUJITA 16h: dot + none + unproj",
      attentionType: "dot_product",
      activation: "none",
      aggregateProjected: false,
      numHeads: 16,
      headDim: 64,
    },

    // =========================================================================
    // ABLATION: Attention mechanism (16 heads, isolate variable)
    // =========================================================================
    {
      name: "16h: dot + ELU + proj",
      attentionType: "dot_product",
      activation: "elu",
      aggregateProjected: true,
      numHeads: 16,
      headDim: 64,
    },

    // =========================================================================
    // ABLATION: Activation function (16 heads, isolate variable)
    // =========================================================================
    {
      name: "16h: GAT + ReLU + proj",
      attentionType: "gat_concat",
      activation: "relu",
      aggregateProjected: true,
      numHeads: 16,
      headDim: 64,
    },
    {
      name: "16h: GAT + none + proj",
      attentionType: "gat_concat",
      activation: "none",
      aggregateProjected: true,
      numHeads: 16,
      headDim: 64,
    },

    // =========================================================================
    // ABLATION: Aggregation target (16 heads, isolate variable)
    // =========================================================================
    {
      name: "16h: GAT + ELU + unproj",
      attentionType: "gat_concat",
      activation: "elu",
      aggregateProjected: false,
      numHeads: 16,
      headDim: 64,
    },

    // =========================================================================
    // HYBRID: Best of both? (16 heads)
    // =========================================================================
    {
      name: "16h: dot + ELU + unproj",
      attentionType: "dot_product",
      activation: "elu",
      aggregateProjected: false,
      numHeads: 16,
      headDim: 64,
    },
  ];

  // Run ablations with multiple seeds for statistical significance
  const NUM_SEEDS = 3;
  const EPOCHS = 25;

  console.log(`Running ${configs.length} configurations × ${NUM_SEEDS} seeds...\n`);

  const allResults: Map<string, AblationResult[]> = new Map();

  for (const config of configs) {
    const configResults: AblationResult[] = [];

    for (let seed = 0; seed < NUM_SEEDS; seed++) {
      // Reset random seed (approximation)
      Math.random();

      const result = await runAblation(
        config,
        capabilities,
        toolEmbeddings,
        trainExamples,
        testExamples,
        EPOCHS,
      );
      configResults.push(result);

      process.stdout.write(".");
    }

    allResults.set(config.name, configResults);
    console.log(` ${config.name}`);
  }

  // Compute statistics
  interface AggregatedResult {
    config: string;
    testAccMean: number;
    testAccStd: number;
    mrrMean: number;
    mrrStd: number;
    lossMean: number;
    convergenceMean: number;
    timeMean: number;
  }

  const aggregated: AggregatedResult[] = [];

  for (const [configName, results] of allResults) {
    const testAccs = results.map((r) => r.testAccuracy);
    const mrrs = results.map((r) => r.mrr);
    const losses = results.map((r) => r.loss);
    const convergences = results.map((r) => r.convergenceEpoch);
    const times = results.map((r) => r.timeMs);

    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const std = (arr: number[]) => {
      const m = mean(arr);
      return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
    };

    aggregated.push({
      config: configName,
      testAccMean: mean(testAccs),
      testAccStd: std(testAccs),
      mrrMean: mean(mrrs),
      mrrStd: std(mrrs),
      lossMean: mean(losses),
      convergenceMean: mean(convergences),
      timeMean: mean(times),
    });
  }

  // Sort by test accuracy
  aggregated.sort((a, b) => b.testAccMean - a.testAccMean);

  // Print results
  console.log("\n" + "═".repeat(100));
  console.log("RESULTS (sorted by Test Accuracy)");
  console.log("═".repeat(100));
  console.log(
    "| " +
      "Config".padEnd(40) +
      " | " +
      "Test Acc".padEnd(12) +
      " | " +
      "MRR".padEnd(12) +
      " | " +
      "Loss".padEnd(8) +
      " | " +
      "Conv".padEnd(6) +
      " |",
  );
  console.log("|" + "-".repeat(42) + "|" + "-".repeat(14) + "|" + "-".repeat(14) + "|" + "-".repeat(10) + "|" + "-".repeat(8) + "|");

  for (const r of aggregated) {
    const testAcc = `${(r.testAccMean * 100).toFixed(1)}±${(r.testAccStd * 100).toFixed(1)}%`;
    const mrr = `${r.mrrMean.toFixed(3)}±${r.mrrStd.toFixed(3)}`;
    const loss = r.lossMean.toFixed(3);
    const conv = `${r.convergenceMean.toFixed(0)} ep`;

    console.log(
      "| " +
        r.config.padEnd(40) +
        " | " +
        testAcc.padEnd(12) +
        " | " +
        mrr.padEnd(12) +
        " | " +
        loss.padEnd(8) +
        " | " +
        conv.padEnd(6) +
        " |",
    );
  }

  console.log("═".repeat(100));

  // Statistical comparison: OURS vs FUJITA
  const oursResults = allResults.get("OURS: GAT + ELU + projected") || [];
  const fujitaResults = allResults.get("FUJITA: dot-prod + none + unprojected") || [];

  if (oursResults.length > 0 && fujitaResults.length > 0) {
    const oursMean = oursResults.reduce((a, b) => a + b.testAccuracy, 0) / oursResults.length;
    const fujitaMean = fujitaResults.reduce((a, b) => a + b.testAccuracy, 0) / fujitaResults.length;
    const diff = oursMean - fujitaMean;

    // Simple t-test approximation
    const oursVar =
      oursResults.reduce((a, b) => a + (b.testAccuracy - oursMean) ** 2, 0) / oursResults.length;
    const fujitaVar =
      fujitaResults.reduce((a, b) => a + (b.testAccuracy - fujitaMean) ** 2, 0) /
      fujitaResults.length;
    const pooledSE = Math.sqrt(oursVar / oursResults.length + fujitaVar / fujitaResults.length);
    const tStat = diff / (pooledSE + 1e-10);

    console.log("\n" + "═".repeat(100));
    console.log("STATISTICAL COMPARISON: OURS vs FUJITA");
    console.log("═".repeat(100));
    console.log(`  OURS (GAT + ELU + projected):     ${(oursMean * 100).toFixed(1)}%`);
    console.log(`  FUJITA (dot-prod + none + unproj): ${(fujitaMean * 100).toFixed(1)}%`);
    console.log(`  Difference: ${diff > 0 ? "+" : ""}${(diff * 100).toFixed(1)}%`);
    console.log(`  t-statistic: ${tStat.toFixed(2)}`);
    console.log(`  Significant (|t| > 2): ${Math.abs(tStat) > 2 ? "YES" : "NO"}`);
    console.log("═".repeat(100));

    // Ablation insights
    console.log("\n" + "═".repeat(100));
    console.log("ABLATION INSIGHTS");
    console.log("═".repeat(100));

    // Attention impact
    const gatConfigs = aggregated.filter((r) => r.config.includes("GAT"));
    const dotConfigs = aggregated.filter((r) => r.config.includes("dot-prod"));
    const gatMean = gatConfigs.reduce((a, b) => a + b.testAccMean, 0) / gatConfigs.length;
    const dotMean = dotConfigs.reduce((a, b) => a + b.testAccMean, 0) / dotConfigs.length;
    console.log(
      `  ATTENTION: GAT-style avg=${(gatMean * 100).toFixed(1)}%, dot-product avg=${(dotMean * 100).toFixed(1)}% → ${gatMean > dotMean ? "GAT WINS" : "DOT-PROD WINS"} (Δ=${((gatMean - dotMean) * 100).toFixed(1)}%)`,
    );

    // Activation impact
    const eluConfigs = aggregated.filter((r) => r.config.includes("ELU"));
    const reluConfigs = aggregated.filter((r) => r.config.includes("ReLU"));
    const noneConfigs = aggregated.filter((r) => r.config.includes("none"));
    const eluMean = eluConfigs.reduce((a, b) => a + b.testAccMean, 0) / eluConfigs.length;
    const reluMean =
      reluConfigs.length > 0
        ? reluConfigs.reduce((a, b) => a + b.testAccMean, 0) / reluConfigs.length
        : 0;
    const noneMean =
      noneConfigs.length > 0
        ? noneConfigs.reduce((a, b) => a + b.testAccMean, 0) / noneConfigs.length
        : 0;
    console.log(
      `  ACTIVATION: ELU avg=${(eluMean * 100).toFixed(1)}%, ReLU avg=${(reluMean * 100).toFixed(1)}%, none avg=${(noneMean * 100).toFixed(1)}%`,
    );

    // Aggregation impact
    const projConfigs = aggregated.filter((r) => r.config.includes("projected") && !r.config.includes("unprojected"));
    const unprojConfigs = aggregated.filter((r) => r.config.includes("unprojected"));
    const projMean = projConfigs.reduce((a, b) => a + b.testAccMean, 0) / projConfigs.length;
    const unprojMean = unprojConfigs.reduce((a, b) => a + b.testAccMean, 0) / unprojConfigs.length;
    console.log(
      `  AGGREGATION: projected avg=${(projMean * 100).toFixed(1)}%, unprojected avg=${(unprojMean * 100).toFixed(1)}% → ${projMean > unprojMean ? "PROJECTED WINS" : "UNPROJECTED WINS"} (Δ=${((projMean - unprojMean) * 100).toFixed(1)}%)`,
    );

    console.log("═".repeat(100));
  }

  // Save report
  const reportPath = `tests/benchmarks/reports/fujita-divergence-${new Date().toISOString().split("T")[0]}.md`;
  const report = `# Fujita Divergence Ablation Study

Generated: ${new Date().toISOString()}

## Summary

| Config | Test Acc | MRR | Loss |
|--------|----------|-----|------|
${aggregated.map((r) => `| ${r.config} | ${(r.testAccMean * 100).toFixed(1)}±${(r.testAccStd * 100).toFixed(1)}% | ${r.mrrMean.toFixed(3)} | ${r.lossMean.toFixed(3)} |`).join("\n")}

## Key Findings

- **Attention**: GAT-style (concat) vs dot-product: ${gatMean > dotMean ? "GAT wins" : "dot-product wins"} by ${((gatMean - dotMean) * 100).toFixed(1)}%
- **Activation**: ELU=${(eluMean * 100).toFixed(1)}%, ReLU=${(reluMean * 100).toFixed(1)}%, none=${(noneMean * 100).toFixed(1)}%
- **Aggregation**: projected=${(projMean * 100).toFixed(1)}% vs unprojected=${(unprojMean * 100).toFixed(1)}%
`;

  await Deno.writeTextFile(reportPath, report);
  console.log(`\n📄 Report saved to: ${reportPath}`);
}
