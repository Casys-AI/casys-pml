/**
 * SHGAT vs GNN Baselines - FAIR COMPARISON
 *
 * Addresses adversarial critiques:
 * 1. HARDER QUERIES - Perturbed embeddings so cosine ≠ 100%
 * 2. MULTIPLE RUNS - Statistics with different seeds (mean ± std)
 * 3. FAIR INIT - All models use learned projections
 * 4. ALIGNED HYPERPARAMS - Same hiddenDim, numHeads, loss, lr, temperature
 *
 * Models:
 * - Cosine Similarity - No learning baseline
 * - GCN (Kipf & Welling 2017) - Spectral convolution
 * - GAT (Veličković 2018) - 16-head attention
 * - GraphSAGE (Hamilton 2017) - Sample & aggregate
 * - SHGAT - Our SuperHyperGraph Attention Network
 *
 * Run: deno bench --allow-all tests/benchmarks/strategic/shgat-vs-baselines.bench.ts
 *
 * @module tests/benchmarks/strategic/shgat-vs-baselines
 */

import {
  createSHGATFromCapabilities,
  seedRng,
  type TrainingExample,
} from "../../../lib/shgat/mod.ts";

import { loadScenario } from "../fixtures/scenario-loader.ts";

// ============================================================================
// Config - FAIR COMPARISON SETTINGS
// ============================================================================

const EPOCHS = 10;
const BATCH_SIZE = 32;
const TEMPERATURE = 0.07;
const NUM_RUNS = 5; // Multiple runs for statistics
const NOISE_LEVELS = [0, 0.1, 0.2, 0.3]; // Difficulty levels

console.log("=".repeat(70));
console.log("SHGAT vs GNN BASELINES - FAIR COMPARISON");
console.log("=".repeat(70));
console.log(`Config: ${EPOCHS} epochs, ${NUM_RUNS} runs, noise levels: ${NOISE_LEVELS.join(", ")}`);

// ============================================================================
// Load Data
// ============================================================================

console.log("\n📦 Loading production-traces scenario...");
const scenario = await loadScenario("production-traces");

type CapWithEmb = {
  id: string;
  embedding: number[];
  toolsUsed: string[];
  successRate: number;
};
type ToolWithEmb = { id: string; embedding: number[] };
type EventWithEmb = {
  intentEmbedding: number[];
  contextTools: string[];
  selectedCapability: string;
  outcome: string;
};
type QueryWithEmb = {
  intentEmbedding: number[];
  expectedCapability: string;
};

const rawCaps = scenario.nodes.capabilities as CapWithEmb[];
const rawTools = scenario.nodes.tools as unknown as ToolWithEmb[];
const rawEvents = (scenario as { episodicEvents?: EventWithEmb[] }).episodicEvents || [];
const rawQueries = (scenario as { testQueries?: QueryWithEmb[] }).testQueries || [];

const capabilities = rawCaps.map((c) => ({
  id: c.id,
  embedding: c.embedding,
  toolsUsed: c.toolsUsed,
  successRate: c.successRate,
  parents: [] as string[],
  children: [] as string[],
}));

const toolEmbeddings = new Map<string, number[]>();
for (const t of rawTools) {
  if (t.embedding) toolEmbeddings.set(t.id, t.embedding);
}

const trainingExamples: TrainingExample[] = rawEvents.map((e) => ({
  intentEmbedding: e.intentEmbedding,
  contextTools: e.contextTools,
  candidateId: e.selectedCapability,
  outcome: e.outcome === "success" ? 1 : 0,
}));

console.log(`📊 Data: ${capabilities.length} caps, ${toolEmbeddings.size} tools, ${trainingExamples.length} train, ${rawQueries.length} test`);

// ============================================================================
// Noise Perturbation - Create harder queries
// ============================================================================

let rngState = 12345;
function seededRandom(): number {
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
  return rngState / 0x7fffffff;
}

function gaussianNoise(): number {
  // Box-Muller transform
  const u1 = seededRandom();
  const u2 = seededRandom();
  return Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
}

function perturbEmbedding(emb: number[], noiseLevel: number): number[] {
  if (noiseLevel === 0) return emb;
  const perturbed = emb.map(v => v + gaussianNoise() * noiseLevel);
  // L2 normalize after perturbation
  const n = Math.sqrt(perturbed.reduce((a, b) => a + b * b, 0));
  return n > 0 ? perturbed.map(v => v / n) : perturbed;
}

function createPerturbedQueries(queries: QueryWithEmb[], noiseLevel: number): QueryWithEmb[] {
  rngState = 12345; // Reset for reproducibility
  return queries.map(q => ({
    ...q,
    intentEmbedding: perturbEmbedding(q.intentEmbedding, noiseLevel),
  }));
}

// ============================================================================
// Math Utilities
// ============================================================================

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function norm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

function cosine(a: number[], b: number[]): number {
  const na = norm(a), nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

function softmax(arr: number[]): number[] {
  const max = Math.max(...arr);
  const exp = arr.map(x => Math.exp(x - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map(x => x / sum);
}

function leakyRelu(x: number, alpha = 0.2): number {
  return x > 0 ? x : alpha * x;
}

function matmul(A: number[][], x: number[]): number[] {
  return A.map(row => dot(row, x));
}

function addVec(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + b[i]);
}

function scaleVec(a: number[], s: number): number[] {
  return a.map(v => v * s);
}

// ============================================================================
// Graph Structure Builder
// ============================================================================

interface GraphNode {
  id: string;
  type: "capability" | "tool";
  embedding: number[];
  neighbors: string[];
}

function buildGraph(
  caps: typeof capabilities,
  toolEmbs: Map<string, number[]>
): { nodes: Map<string, GraphNode>; capIds: string[] } {
  const nodes = new Map<string, GraphNode>();
  const capIds: string[] = [];

  // Add capability nodes
  for (const c of caps) {
    capIds.push(c.id);
    nodes.set(c.id, {
      id: c.id,
      type: "capability",
      embedding: c.embedding,
      neighbors: c.toolsUsed.filter(t => toolEmbs.has(t)),
    });
  }

  // Add tool nodes with reverse edges
  for (const [toolId, emb] of toolEmbs) {
    const capsUsingTool = caps.filter(c => c.toolsUsed.includes(toolId)).map(c => c.id);
    nodes.set(toolId, {
      id: toolId,
      type: "tool",
      embedding: emb,
      neighbors: capsUsingTool,
    });
  }

  return { nodes, capIds };
}

// ============================================================================
// Baseline 1: Cosine Similarity (No Learning)
// ============================================================================

class CosineBaseline {
  private capEmbeddings: Map<string, number[]>;

  constructor(caps: typeof capabilities) {
    this.capEmbeddings = new Map(caps.map(c => [c.id, c.embedding]));
  }

  score(intent: number[]): Array<{ capabilityId: string; score: number }> {
    const results: Array<{ capabilityId: string; score: number }> = [];
    for (const [id, emb] of this.capEmbeddings) {
      results.push({ capabilityId: id, score: cosine(intent, emb) });
    }
    return results.sort((a, b) => b.score - a.score);
  }

  // No training needed
  train(_examples: TrainingExample[]): void {}
}

// ============================================================================
// GCN - Graph Convolutional Network (Kipf & Welling 2017)
// ALIGNED: hiddenDim=1024, InfoNCE contrastive loss
// ============================================================================

class GCNBaseline {
  private graph: { nodes: Map<string, GraphNode>; capIds: string[] };
  private W: number[][]; // [hiddenDim][embDim] - GCN layer weights
  private W_q: number[][]; // [hiddenDim][embDim] - Query projection
  private nodeEmbeddings: Map<string, number[]>;
  private transformedEmbs: Map<string, number[]>;
  private readonly hiddenDim = 1024; // ALIGNED with SHGAT
  private readonly embDim: number;
  private readonly lr = 0.05; // Same as SHGAT
  private readonly temperature = 0.07; // Same as SHGAT

  constructor(caps: typeof capabilities, toolEmbs: Map<string, number[]>) {
    this.graph = buildGraph(caps, toolEmbs);
    this.embDim = caps[0]?.embedding.length || 1024;

    // Initialize node embeddings (fixed input features)
    this.nodeEmbeddings = new Map();
    for (const [id, node] of this.graph.nodes) {
      this.nodeEmbeddings.set(id, [...node.embedding]);
    }
    this.transformedEmbs = new Map(this.nodeEmbeddings);

    // Xavier init for GCN weight matrix
    const scale = Math.sqrt(2 / (this.embDim + this.hiddenDim));
    this.W = Array.from({ length: this.hiddenDim }, () =>
      Array.from({ length: this.embDim }, () => (Math.random() - 0.5) * 2 * scale)
    );

    // Query projection matrix
    this.W_q = Array.from({ length: this.hiddenDim }, () =>
      Array.from({ length: this.embDim }, () => (Math.random() - 0.5) * 2 * scale)
    );
  }

  private propagate(): Map<string, { input: number[]; output: number[] }> {
    const cache = new Map<string, { input: number[]; output: number[] }>();

    for (const [id, node] of this.graph.nodes) {
      const neighbors = node.neighbors;
      const degree = Math.max(1, neighbors.length);

      // Aggregate: mean of neighbor embeddings (normalized)
      let agg = new Array(this.embDim).fill(0);
      for (const nid of neighbors) {
        const nEmb = this.nodeEmbeddings.get(nid);
        if (nEmb) {
          const nDegree = Math.max(1, this.graph.nodes.get(nid)?.neighbors.length || 1);
          const normFactor = 1 / Math.sqrt(degree * nDegree);
          agg = addVec(agg, scaleVec(nEmb, normFactor));
        }
      }
      // Add self-loop
      agg = addVec(agg, scaleVec(this.nodeEmbeddings.get(id)!, 1 / degree));

      // Transform: W @ agg with ReLU
      const transformed = matmul(this.W, agg).map(x => Math.max(0, x));
      cache.set(id, { input: agg, output: transformed });

      // Store for scoring
      this.transformedEmbs.set(id, transformed);
    }
    return cache;
  }

  private l2Normalize(v: number[]): number[] {
    const n = norm(v);
    return n > 0 ? scaleVec(v, 1 / n) : v;
  }

  score(intent: number[]): Array<{ capabilityId: string; score: number }> {
    const q = this.l2Normalize(matmul(this.W_q, intent));
    const results: Array<{ capabilityId: string; score: number }> = [];
    for (const capId of this.graph.capIds) {
      const emb = this.transformedEmbs.get(capId);
      if (emb) {
        const h = this.l2Normalize(emb);
        const score = dot(q, h) / this.temperature;
        results.push({ capabilityId: capId, score });
      }
    }
    return results.sort((a, b) => b.score - a.score);
  }

  train(examples: TrainingExample[]): void {
    // Forward: propagate through GCN
    const cache = this.propagate();

    // InfoNCE contrastive loss per batch
    const positives = examples.filter(e => e.outcome === 1);
    if (positives.length === 0) return;

    for (const ex of positives) {
      const capId = ex.candidateId;
      const capCache = cache.get(capId);
      if (!capCache) continue;

      // Forward pass with L2 norm
      const q = this.l2Normalize(matmul(this.W_q, ex.intentEmbedding));
      const hPos = this.l2Normalize(capCache.output);

      // Compute scores for all capabilities (contrastive)
      const scores: number[] = [];
      const allH: number[][] = [];
      for (const cid of this.graph.capIds) {
        const emb = this.transformedEmbs.get(cid);
        if (emb) {
          const h = this.l2Normalize(emb);
          scores.push(Math.exp(dot(q, h) / this.temperature));
          allH.push(h);
        }
      }

      const sumExp = scores.reduce((a, b) => a + b, 1e-8);
      const posIdx = this.graph.capIds.indexOf(capId);
      const posScore = scores[posIdx] || 1e-8;

      // InfoNCE gradient: d/dq = (1/τ) * (Σ p_i * h_i - h_pos)
      // where p_i = exp(q·h_i/τ) / Σ exp(q·h_j/τ)
      let dQ = new Array(this.hiddenDim).fill(0);
      for (let i = 0; i < allH.length; i++) {
        const p = scores[i] / sumExp;
        dQ = addVec(dQ, scaleVec(allH[i], p / this.temperature));
      }
      dQ = addVec(dQ, scaleVec(hPos, -1 / this.temperature));

      // Update W_q
      for (let i = 0; i < this.hiddenDim; i++) {
        for (let j = 0; j < this.embDim; j++) {
          this.W_q[i][j] -= this.lr * dQ[i] * ex.intentEmbedding[j];
        }
      }

      // Update W (simplified - through positive example)
      const agg = capCache.input;
      const dH = scaleVec(q, (posScore / sumExp - 1) / this.temperature);
      for (let i = 0; i < this.hiddenDim; i++) {
        if (capCache.output[i] > 0) { // ReLU gradient
          for (let j = 0; j < this.embDim; j++) {
            this.W[i][j] -= this.lr * dH[i] * agg[j];
          }
        }
      }
    }
  }
}

// ============================================================================
// GAT - Graph Attention Network (Veličković et al. 2018)
// ALIGNED: 16 heads, hiddenDim=1024, InfoNCE contrastive loss
// ============================================================================

class GATBaseline {
  private graph: { nodes: Map<string, GraphNode>; capIds: string[] };
  private W: number[][][]; // [numHeads][headDim][embDim] - Per-head transforms
  private W_q: number[][]; // [hiddenDim][embDim] - Query projection
  private a: number[][]; // [numHeads][2 * headDim] - Per-head attention vectors
  private nodeEmbeddings: Map<string, number[]>;
  private transformedEmbs: Map<string, number[]>;
  private readonly numHeads = 16; // ALIGNED with SHGAT
  private readonly headDim = 64;
  private readonly hiddenDim = 1024; // = numHeads * headDim
  private readonly embDim: number;
  private readonly lr = 0.05;
  private readonly temperature = 0.07;

  constructor(caps: typeof capabilities, toolEmbs: Map<string, number[]>) {
    this.graph = buildGraph(caps, toolEmbs);
    this.embDim = caps[0]?.embedding.length || 1024;

    // Initialize node embeddings (fixed)
    this.nodeEmbeddings = new Map();
    for (const [id, node] of this.graph.nodes) {
      this.nodeEmbeddings.set(id, [...node.embedding]);
    }
    this.transformedEmbs = new Map();

    // Xavier init - per head transforms
    const scale = Math.sqrt(2 / (this.embDim + this.headDim));
    this.W = Array.from({ length: this.numHeads }, () =>
      Array.from({ length: this.headDim }, () =>
        Array.from({ length: this.embDim }, () => (Math.random() - 0.5) * 2 * scale)
      )
    );

    // Query projection
    this.W_q = Array.from({ length: this.hiddenDim }, () =>
      Array.from({ length: this.embDim }, () => (Math.random() - 0.5) * 2 * scale)
    );

    // Per-head attention vectors
    const scaleA = Math.sqrt(1 / this.headDim);
    this.a = Array.from({ length: this.numHeads }, () =>
      Array.from({ length: 2 * this.headDim }, () => (Math.random() - 0.5) * 2 * scaleA)
    );

    // Initial propagation
    this.propagate();
  }

  private attentionHead(hi: number[], hj: number[], head: number): number {
    const concat = [...hi, ...hj];
    let score = 0;
    for (let i = 0; i < concat.length && i < this.a[head].length; i++) {
      score += this.a[head][i] * concat[i];
    }
    return leakyRelu(score);
  }

  private propagate(): void {
    for (const [id, node] of this.graph.nodes) {
      const nodeEmb = this.nodeEmbeddings.get(id)!;
      const neighbors = node.neighbors;

      // Multi-head attention
      const headOutputs: number[][] = [];
      for (let head = 0; head < this.numHeads; head++) {
        const hi = matmul(this.W[head], nodeEmb);

        if (neighbors.length === 0) {
          headOutputs.push(hi);
          continue;
        }

        // Compute attention scores for this head
        const scores: number[] = [];
        const neighborHs: number[][] = [];
        for (const nid of neighbors) {
          const nEmb = this.nodeEmbeddings.get(nid);
          if (nEmb) {
            const hj = matmul(this.W[head], nEmb);
            scores.push(this.attentionHead(hi, hj, head));
            neighborHs.push(hj);
          }
        }

        if (neighborHs.length === 0) {
          headOutputs.push(hi);
          continue;
        }

        const alphas = softmax(scores);

        // Weighted sum
        let agg = new Array(this.headDim).fill(0);
        for (let i = 0; i < neighborHs.length; i++) {
          agg = addVec(agg, scaleVec(neighborHs[i], alphas[i]));
        }

        // ELU activation
        headOutputs.push(agg.map(x => x > 0 ? x : Math.exp(x) - 1));
      }

      // Concatenate all heads
      const output = headOutputs.flat();
      this.transformedEmbs.set(id, output);
    }
  }

  private l2Normalize(v: number[]): number[] {
    const n = norm(v);
    return n > 0 ? scaleVec(v, 1 / n) : v;
  }

  score(intent: number[]): Array<{ capabilityId: string; score: number }> {
    const q = this.l2Normalize(matmul(this.W_q, intent));
    const results: Array<{ capabilityId: string; score: number }> = [];
    for (const capId of this.graph.capIds) {
      const emb = this.transformedEmbs.get(capId);
      if (emb) {
        const h = this.l2Normalize(emb);
        const score = dot(q, h) / this.temperature;
        results.push({ capabilityId: capId, score });
      }
    }
    return results.sort((a, b) => b.score - a.score);
  }

  train(examples: TrainingExample[]): void {
    this.propagate();

    // InfoNCE contrastive loss
    const positives = examples.filter(e => e.outcome === 1);
    if (positives.length === 0) return;

    for (const ex of positives) {
      const capId = ex.candidateId;
      const capEmb = this.transformedEmbs.get(capId);
      if (!capEmb) continue;

      const q = this.l2Normalize(matmul(this.W_q, ex.intentEmbedding));
      const hPos = this.l2Normalize(capEmb);

      // Compute scores for all capabilities
      const scores: number[] = [];
      const allH: number[][] = [];
      for (const cid of this.graph.capIds) {
        const emb = this.transformedEmbs.get(cid);
        if (emb) {
          const h = this.l2Normalize(emb);
          scores.push(Math.exp(dot(q, h) / this.temperature));
          allH.push(h);
        }
      }

      const sumExp = scores.reduce((a, b) => a + b, 1e-8);

      // InfoNCE gradient for W_q
      let dQ = new Array(this.hiddenDim).fill(0);
      for (let i = 0; i < allH.length; i++) {
        const p = scores[i] / sumExp;
        dQ = addVec(dQ, scaleVec(allH[i], p / this.temperature));
      }
      dQ = addVec(dQ, scaleVec(hPos, -1 / this.temperature));

      // Update W_q
      for (let i = 0; i < this.hiddenDim; i++) {
        for (let j = 0; j < this.embDim; j++) {
          this.W_q[i][j] -= this.lr * dQ[i] * ex.intentEmbedding[j];
        }
      }

      // Update attention vectors (simplified)
      const posIdx = this.graph.capIds.indexOf(capId);
      const posScore = scores[posIdx] || 1e-8;
      const dLoss = (posScore / sumExp - 1) / this.temperature;
      for (let head = 0; head < this.numHeads; head++) {
        for (let i = 0; i < 2 * this.headDim; i++) {
          this.a[head][i] -= this.lr * dLoss * 0.01; // Small update
        }
      }
    }
  }
}

// ============================================================================
// GraphSAGE - Sample and Aggregate (Hamilton et al. 2017)
// ALIGNED: hiddenDim=1024, InfoNCE contrastive loss
// ============================================================================

class GraphSAGEBaseline {
  private graph: { nodes: Map<string, GraphNode>; capIds: string[] };
  private W: number[][]; // [hiddenDim][2 * embDim] for concat
  private W_q: number[][]; // [hiddenDim][embDim] - Query projection
  private nodeEmbeddings: Map<string, number[]>;
  private transformedEmbs: Map<string, number[]>;
  private readonly hiddenDim = 1024; // ALIGNED with SHGAT
  private readonly embDim: number;
  private readonly lr = 0.05; // Same as SHGAT
  private readonly temperature = 0.07; // Same as SHGAT

  constructor(caps: typeof capabilities, toolEmbs: Map<string, number[]>) {
    this.graph = buildGraph(caps, toolEmbs);
    this.embDim = caps[0]?.embedding.length || 1024;

    // Initialize node embeddings (fixed)
    this.nodeEmbeddings = new Map();
    for (const [id, node] of this.graph.nodes) {
      this.nodeEmbeddings.set(id, [...node.embedding]);
    }
    this.transformedEmbs = new Map();

    // Xavier init for CONCAT aggregation
    const scale = Math.sqrt(2 / (2 * this.embDim + this.hiddenDim));
    this.W = Array.from({ length: this.hiddenDim }, () =>
      Array.from({ length: 2 * this.embDim }, () => (Math.random() - 0.5) * 2 * scale)
    );

    // Query projection
    const scaleQ = Math.sqrt(2 / (this.embDim + this.hiddenDim));
    this.W_q = Array.from({ length: this.hiddenDim }, () =>
      Array.from({ length: this.embDim }, () => (Math.random() - 0.5) * 2 * scaleQ)
    );

    // Initial propagation
    this.propagate();
  }

  private propagate(): Map<string, { concat: number[]; output: number[] }> {
    const cache = new Map<string, { concat: number[]; output: number[] }>();

    for (const [id, node] of this.graph.nodes) {
      const selfEmb = this.nodeEmbeddings.get(id)!;
      const neighbors = node.neighbors;

      // Mean aggregation of neighbors
      let aggNeighbor = new Array(this.embDim).fill(0);
      if (neighbors.length > 0) {
        for (const nid of neighbors) {
          const nEmb = this.nodeEmbeddings.get(nid);
          if (nEmb) {
            aggNeighbor = addVec(aggNeighbor, nEmb);
          }
        }
        aggNeighbor = scaleVec(aggNeighbor, 1 / neighbors.length);
      } else {
        aggNeighbor = [...selfEmb];
      }

      // CONCAT(h_v, AGG(neighbors))
      const concat = [...selfEmb, ...aggNeighbor];

      // W @ concat with ReLU
      const transformed = matmul(this.W, concat).map(x => Math.max(0, x));

      this.transformedEmbs.set(id, transformed);
      cache.set(id, { concat, output: transformed });
    }
    return cache;
  }

  private l2Normalize(v: number[]): number[] {
    const n = norm(v);
    return n > 0 ? scaleVec(v, 1 / n) : v;
  }

  score(intent: number[]): Array<{ capabilityId: string; score: number }> {
    const q = this.l2Normalize(matmul(this.W_q, intent));
    const results: Array<{ capabilityId: string; score: number }> = [];
    for (const capId of this.graph.capIds) {
      const emb = this.transformedEmbs.get(capId);
      if (emb) {
        const h = this.l2Normalize(emb);
        const score = dot(q, h) / this.temperature;
        results.push({ capabilityId: capId, score });
      }
    }
    return results.sort((a, b) => b.score - a.score);
  }

  train(examples: TrainingExample[]): void {
    const cache = this.propagate();

    // InfoNCE contrastive loss
    const positives = examples.filter(e => e.outcome === 1);
    if (positives.length === 0) return;

    for (const ex of positives) {
      const capId = ex.candidateId;
      const capCache = cache.get(capId);
      if (!capCache) continue;

      const q = this.l2Normalize(matmul(this.W_q, ex.intentEmbedding));
      const hPos = this.l2Normalize(capCache.output);

      // Compute scores for all capabilities
      const scores: number[] = [];
      const allH: number[][] = [];
      for (const cid of this.graph.capIds) {
        const emb = this.transformedEmbs.get(cid);
        if (emb) {
          const h = this.l2Normalize(emb);
          scores.push(Math.exp(dot(q, h) / this.temperature));
          allH.push(h);
        }
      }

      const sumExp = scores.reduce((a, b) => a + b, 1e-8);
      const posIdx = this.graph.capIds.indexOf(capId);
      const posScore = scores[posIdx] || 1e-8;

      // InfoNCE gradient
      let dQ = new Array(this.hiddenDim).fill(0);
      for (let i = 0; i < allH.length; i++) {
        const p = scores[i] / sumExp;
        dQ = addVec(dQ, scaleVec(allH[i], p / this.temperature));
      }
      dQ = addVec(dQ, scaleVec(hPos, -1 / this.temperature));

      // Update W_q
      for (let i = 0; i < this.hiddenDim; i++) {
        for (let j = 0; j < this.embDim; j++) {
          this.W_q[i][j] -= this.lr * dQ[i] * ex.intentEmbedding[j];
        }
      }

      // Update W (through ReLU)
      const concat = capCache.concat;
      const dH = scaleVec(q, (posScore / sumExp - 1) / this.temperature);
      for (let i = 0; i < this.hiddenDim; i++) {
        if (capCache.output[i] > 0) {
          for (let j = 0; j < 2 * this.embDim; j++) {
            this.W[i][j] -= this.lr * dH[i] * concat[j];
          }
        }
      }
    }
  }
}

// ============================================================================
// Evaluation Function
// ============================================================================

interface EvalResult {
  mrr: number;
  hit1: number;
  hit3: number;
  avgLatencyMs: number;
}

function evaluate(
  model: { score: (intent: number[]) => Array<{ capabilityId: string; score: number }> },
  queries: QueryWithEmb[],
): EvalResult {
  let mrr = 0, hit1 = 0, hit3 = 0;
  const start = performance.now();

  for (const q of queries) {
    const results = model.score(q.intentEmbedding);
    const rank = results.findIndex(r => r.capabilityId === q.expectedCapability) + 1;
    if (rank === 1) hit1++;
    if (rank <= 3) hit3++;
    if (rank > 0) mrr += 1 / rank;
  }

  const elapsed = performance.now() - start;
  const n = queries.length || 1;

  return {
    mrr: mrr / n,
    hit1: hit1 / n,
    hit3: hit3 / n,
    avgLatencyMs: elapsed / n,
  };
}

// Statistics helpers
function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[]): number {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}

// ============================================================================
// Run Single Experiment
// ============================================================================

function runExperiment(seed: number, noiseLevel: number): Record<string, EvalResult> {
  // Create perturbed queries
  const testQueries = createPerturbedQueries(rawQueries, noiseLevel);

  // Initialize fresh models with this seed
  seedRng(seed);
  const cosine_model = new CosineBaseline(capabilities);
  const gcn_model = new GCNBaseline(capabilities, toolEmbeddings);
  const gat_model = new GATBaseline(capabilities, toolEmbeddings);
  const sage_model = new GraphSAGEBaseline(capabilities, toolEmbeddings);
  const shgat = createSHGATFromCapabilities(capabilities, toolEmbeddings);

  // Train all models
  for (let e = 0; e < EPOCHS; e++) {
    gcn_model.train(trainingExamples);
    gat_model.train(trainingExamples);
    sage_model.train(trainingExamples);

    const numBatches = Math.ceil(trainingExamples.length / BATCH_SIZE);
    for (let b = 0; b < numBatches; b++) {
      const batch = trainingExamples.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
      if (batch.length > 0) {
        shgat.trainBatchV1KHeadBatched(batch, batch.map(() => 1.0), false, TEMPERATURE);
      }
    }
  }

  // Evaluate
  return {
    cosine: evaluate(cosine_model, testQueries),
    gcn: evaluate(gcn_model, testQueries),
    gat: evaluate(gat_model, testQueries),
    graphsage: evaluate(sage_model, testQueries),
    shgat: evaluate({ score: (i) => shgat.scoreAllCapabilities(i) }, testQueries),
  };
}

// ============================================================================
// Run Multi-Seed, Multi-Noise Experiment
// ============================================================================

console.log("\n" + "=".repeat(70));
console.log("RUNNING FAIR COMPARISON EXPERIMENTS");
console.log("=".repeat(70));

const allResults: Record<string, Record<number, number[]>> = {
  cosine: {},
  gcn: {},
  gat: {},
  graphsage: {},
  shgat: {},
};

// Initialize storage
for (const model of Object.keys(allResults)) {
  for (const noise of NOISE_LEVELS) {
    allResults[model][noise] = [];
  }
}

// Run experiments
for (const noiseLevel of NOISE_LEVELS) {
  console.log(`\n📊 Testing with noise level = ${noiseLevel}`);

  for (let run = 0; run < NUM_RUNS; run++) {
    const seed = 42 + run * 1000;
    const encoder = new TextEncoder();
    Deno.stdout.writeSync(encoder.encode(`  Run ${run + 1}/${NUM_RUNS} (seed=${seed})...`));

    const results = runExperiment(seed, noiseLevel);

    for (const [model, result] of Object.entries(results)) {
      allResults[model][noiseLevel].push(result.mrr);
    }

    console.log(` SHGAT=${results.shgat.mrr.toFixed(3)}, GAT=${results.gat.mrr.toFixed(3)}`);
  }
}

// ============================================================================
// Results Summary with Statistics
// ============================================================================

console.log("\n" + "=".repeat(70));
console.log("RESULTS: MRR (mean ± std) across " + NUM_RUNS + " runs");
console.log("=".repeat(70));

console.log("\n" + "Model".padEnd(15) + NOISE_LEVELS.map(n => `noise=${n}`.padEnd(18)).join(""));
console.log("-".repeat(15 + NOISE_LEVELS.length * 18));

for (const model of ["cosine", "gcn", "gat", "graphsage", "shgat"]) {
  let row = model.padEnd(15);
  for (const noise of NOISE_LEVELS) {
    const mrrs = allResults[model][noise];
    const m = mean(mrrs);
    const s = std(mrrs);
    row += `${m.toFixed(3)} ± ${s.toFixed(3)}`.padEnd(18);
  }
  console.log(row);
}

// Final summary for hardest noise level
const hardestNoise = NOISE_LEVELS[NOISE_LEVELS.length - 1];
console.log("\n" + "=".repeat(70));
console.log(`FINAL RANKING (noise=${hardestNoise}, hardest queries)`);
console.log("=".repeat(70));

const finalRanking = Object.entries(allResults)
  .map(([model, noiseResults]) => ({
    model,
    mrr: mean(noiseResults[hardestNoise]),
    std: std(noiseResults[hardestNoise]),
  }))
  .sort((a, b) => b.mrr - a.mrr);

for (let i = 0; i < finalRanking.length; i++) {
  const { model, mrr, std: s } = finalRanking[i];
  const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
  console.log(`${medal} ${(i + 1)}. ${model.padEnd(12)} MRR: ${mrr.toFixed(3)} ± ${s.toFixed(3)}`);
}

// SHGAT vs GAT comparison
const shgatMrr = mean(allResults.shgat[hardestNoise]);
const gatMrr = mean(allResults.gat[hardestNoise]);
const improvement = ((shgatMrr - gatMrr) / gatMrr * 100).toFixed(1);
console.log(`\n📈 SHGAT vs GAT: +${improvement}% MRR improvement`);

console.log("=".repeat(70) + "\n");

// ============================================================================
// Deno Benchmarks (Latency) - Using final trained models
// ============================================================================

// Create models for latency benchmarking
seedRng(42);
const bench_cosine = new CosineBaseline(capabilities);
const bench_gcn = new GCNBaseline(capabilities, toolEmbeddings);
const bench_gat = new GATBaseline(capabilities, toolEmbeddings);
const bench_sage = new GraphSAGEBaseline(capabilities, toolEmbeddings);
const bench_shgat = createSHGATFromCapabilities(capabilities, toolEmbeddings);

// Train them
for (let e = 0; e < EPOCHS; e++) {
  bench_gcn.train(trainingExamples);
  bench_gat.train(trainingExamples);
  bench_sage.train(trainingExamples);
  const numBatches = Math.ceil(trainingExamples.length / BATCH_SIZE);
  for (let b = 0; b < numBatches; b++) {
    const batch = trainingExamples.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    if (batch.length > 0) {
      bench_shgat.trainBatchV1KHeadBatched(batch, batch.map(() => 1.0), false, TEMPERATURE);
    }
  }
}

const testIntent = rawQueries[0]?.intentEmbedding || new Array(1024).fill(0.1);

Deno.bench({
  name: "Cosine Similarity (baseline)",
  group: "gnn-comparison",
  baseline: true,
  fn: () => {
    bench_cosine.score(testIntent);
  },
});

Deno.bench({
  name: "GCN (Kipf 2017)",
  group: "gnn-comparison",
  fn: () => {
    bench_gcn.score(testIntent);
  },
});

Deno.bench({
  name: "GAT (Veličković 2018, 16 heads)",
  group: "gnn-comparison",
  fn: () => {
    bench_gat.score(testIntent);
  },
});

Deno.bench({
  name: "GraphSAGE (Hamilton 2017)",
  group: "gnn-comparison",
  fn: () => {
    bench_sage.score(testIntent);
  },
});

Deno.bench({
  name: "SHGAT (16 heads, InfoNCE)",
  group: "gnn-comparison",
  fn: () => {
    bench_shgat.scoreAllCapabilities(testIntent);
  },
});
