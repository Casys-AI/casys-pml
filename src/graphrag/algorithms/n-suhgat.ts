/**
 * n-SuHGAT (n-SuperHyperGraph Attention Networks)
 *
 * Proper implementation based on "SuperHyperGraph Attention Networks" paper.
 * Key differences from simple GAT:
 * - Two-phase message passing: Vertex→Hyperedge, Hyperedge→Vertex
 * - Incidence matrix A where A[v][e] = 1 if vertex v is in hyperedge e
 * - Proper backpropagation through both phases
 *
 * Architecture:
 * - Vertices (H): Tools and atomic capabilities
 * - Hyperedges (E): Capabilities (contain multiple tools)
 * - Incidence matrix: Maps vertices to hyperedges they belong to
 *
 * @module graphrag/algorithms/n-suhgat
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for n-SuHGAT
 */
export interface NSuHGATConfig {
  /** Input embedding dimension (BGE-M3 = 1024) */
  inputDim: number;
  /** Hidden dimension for transformations */
  hiddenDim: number;
  /** Number of attention layers */
  numLayers: number;
  /** Number of attention heads per layer */
  numHeads: number;
  /** LeakyReLU negative slope */
  leakyReluAlpha: number;
  /** Dropout rate (0 = no dropout) */
  dropout: number;
  /** Learning rate for training */
  learningRate: number;
  /** L2 regularization weight */
  l2Lambda: number;
}

export const DEFAULT_NSUHGAT_CONFIG: NSuHGATConfig = {
  inputDim: 1024,
  hiddenDim: 128,
  numLayers: 2,
  numHeads: 4,
  leakyReluAlpha: 0.2,
  dropout: 0.1,
  learningRate: 0.001,
  l2Lambda: 0.0001,
};

/**
 * Vertex in the hypergraph (tool or atomic capability)
 */
export interface HypergraphVertex {
  id: string;
  embedding: number[];
  /** Type: tool (atomic) or capability (composite) */
  type: "tool" | "capability";
}

/**
 * Hyperedge in the hypergraph (capability containing vertices)
 */
export interface HypergraphEdge {
  id: string;
  /** Vertex IDs that belong to this hyperedge */
  vertexIds: string[];
  /** Learned embedding (initialized from description) */
  embedding: number[];
  /** Additional features */
  features: {
    successRate: number;
    recency: number;
    cooccurrence: number;
  };
}

/**
 * Training example for supervised learning
 */
export interface TrainingSample {
  /** Intent embedding (query) */
  intentEmbedding: number[];
  /** Context vertex IDs (recently used tools) */
  contextVertexIds: string[];
  /** Target hyperedge (capability) ID */
  targetEdgeId: string;
  /** Label: 1 = success, 0 = failure */
  label: number;
}

/**
 * Cached activations for backpropagation
 */
interface ForwardCache {
  /** Vertex embeddings at each layer [layer][vertex] */
  H: number[][][];
  /** Hyperedge embeddings at each layer [layer][edge] */
  E: number[][][];
  /** Attention weights vertex→edge [layer][head][vertex][edge] */
  attentionVE: number[][][][];
  /** Attention weights edge→vertex [layer][head][edge][vertex] */
  attentionEV: number[][][][];
  /** Pre-activation values for backward pass */
  preActivations: {
    H: number[][][];
    E: number[][][];
  };
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * n-SuperHyperGraph Attention Network
 *
 * Implements two-phase message passing:
 * 1. Vertex → Hyperedge: Aggregate vertex features to hyperedges
 * 2. Hyperedge → Vertex: Propagate hyperedge features back to vertices
 */
export class NSuHGAT {
  private config: NSuHGATConfig;

  // Vertices and hyperedges
  private vertices: Map<string, HypergraphVertex> = new Map();
  private edges: Map<string, HypergraphEdge> = new Map();
  private vertexIndex: Map<string, number> = new Map();
  private edgeIndex: Map<string, number> = new Map();

  // Incidence matrix: A[v][e] = 1 if vertex v is in hyperedge e
  private incidenceMatrix: number[][] = [];

  // Learnable parameters per layer per head
  private params: Array<{
    // Vertex→Edge phase
    W_v: number[][][]; // [head][hiddenDim][inputDim] - vertex projection
    W_e: number[][][]; // [head][hiddenDim][inputDim] - edge projection for attention
    a_ve: number[][]; // [head][2*hiddenDim] - attention vector

    // Edge→Vertex phase
    W_e2: number[][][]; // [head][hiddenDim][hiddenDim] - edge projection
    W_v2: number[][][]; // [head][hiddenDim][hiddenDim] - vertex projection for attention
    a_ev: number[][]; // [head][2*hiddenDim] - attention vector
  }>;

  // Output layer for scoring
  private W_out: number[][]; // [1][hiddenDim * numHeads]
  private b_out: number; // bias

  // Training state
  private trainingMode = false;
  private lastCache: ForwardCache | null = null;

  constructor(config: Partial<NSuHGATConfig> = {}) {
    this.config = { ...DEFAULT_NSUHGAT_CONFIG, ...config };
    this.initializeParameters();
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  private initializeParameters(): void {
    const { numLayers, numHeads, hiddenDim, inputDim } = this.config;
    this.params = [];

    for (let l = 0; l < numLayers; l++) {
      const layerInputDim = l === 0 ? inputDim : hiddenDim * numHeads;

      this.params.push({
        W_v: this.initTensor3D(numHeads, hiddenDim, layerInputDim),
        W_e: this.initTensor3D(numHeads, hiddenDim, layerInputDim),
        a_ve: this.initMatrix(numHeads, 2 * hiddenDim),

        W_e2: this.initTensor3D(numHeads, hiddenDim, hiddenDim),
        W_v2: this.initTensor3D(numHeads, hiddenDim, hiddenDim),
        a_ev: this.initMatrix(numHeads, 2 * hiddenDim),
      });
    }

    // Output layer
    this.W_out = this.initMatrix(1, hiddenDim * numHeads);
    this.b_out = 0;
  }

  private initTensor3D(d1: number, d2: number, d3: number): number[][][] {
    const scale = Math.sqrt(2.0 / (d2 + d3));
    return Array.from({ length: d1 }, () =>
      Array.from({ length: d2 }, () =>
        Array.from({ length: d3 }, () => (Math.random() - 0.5) * 2 * scale)
      )
    );
  }

  private initMatrix(rows: number, cols: number): number[][] {
    const scale = Math.sqrt(2.0 / (rows + cols));
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => (Math.random() - 0.5) * 2 * scale)
    );
  }

  // ==========================================================================
  // Graph Construction
  // ==========================================================================

  /**
   * Add a vertex to the hypergraph
   */
  addVertex(vertex: HypergraphVertex): void {
    this.vertices.set(vertex.id, vertex);
    this.rebuildIndices();
  }

  /**
   * Add a hyperedge to the hypergraph
   */
  addEdge(edge: HypergraphEdge): void {
    this.edges.set(edge.id, edge);
    this.rebuildIndices();
  }

  /**
   * Build hypergraph from capability definitions
   */
  buildFromCapabilities(
    tools: Array<{ id: string; embedding: number[] }>,
    capabilities: Array<{
      id: string;
      embedding: number[];
      toolIds: string[];
      successRate: number;
    }>,
  ): void {
    // Clear existing
    this.vertices.clear();
    this.edges.clear();

    // Add tools as vertices
    for (const tool of tools) {
      this.vertices.set(tool.id, {
        id: tool.id,
        embedding: tool.embedding,
        type: "tool",
      });
    }

    // Add capabilities as hyperedges
    for (const cap of capabilities) {
      this.edges.set(cap.id, {
        id: cap.id,
        vertexIds: cap.toolIds,
        embedding: cap.embedding,
        features: {
          successRate: cap.successRate,
          recency: 0,
          cooccurrence: 0,
        },
      });
    }

    this.rebuildIndices();
  }

  /**
   * Rebuild vertex/edge indices and incidence matrix
   */
  private rebuildIndices(): void {
    // Build index maps
    this.vertexIndex.clear();
    this.edgeIndex.clear();

    let vIdx = 0;
    for (const vId of this.vertices.keys()) {
      this.vertexIndex.set(vId, vIdx++);
    }

    let eIdx = 0;
    for (const eId of this.edges.keys()) {
      this.edgeIndex.set(eId, eIdx++);
    }

    // Build incidence matrix A[v][e]
    const numVertices = this.vertices.size;
    const numEdges = this.edges.size;

    this.incidenceMatrix = Array.from({ length: numVertices }, () =>
      Array(numEdges).fill(0)
    );

    for (const [edgeId, edge] of this.edges) {
      const eIdx = this.edgeIndex.get(edgeId)!;
      for (const vertexId of edge.vertexIds) {
        const vIdx = this.vertexIndex.get(vertexId);
        if (vIdx !== undefined) {
          this.incidenceMatrix[vIdx][eIdx] = 1;
        }
      }
    }
  }

  // ==========================================================================
  // Forward Pass
  // ==========================================================================

  /**
   * Forward pass through all layers
   *
   * Returns embeddings for vertices and hyperedges after message passing
   */
  forward(cache?: ForwardCache): {
    H: number[][];
    E: number[][];
    cache: ForwardCache;
  } {
    const numVertices = this.vertices.size;
    const numEdges = this.edges.size;

    // Initialize cache
    const fwdCache: ForwardCache = cache || {
      H: [],
      E: [],
      attentionVE: [],
      attentionEV: [],
      preActivations: { H: [], E: [] },
    };

    // Initialize vertex and edge embeddings
    let H = this.getVertexEmbeddings();
    let E = this.getEdgeEmbeddings();

    fwdCache.H.push(H);
    fwdCache.E.push(E);

    // Process each layer
    for (let l = 0; l < this.config.numLayers; l++) {
      const layerParams = this.params[l];
      const layerAttentionVE: number[][][] = [];
      const layerAttentionEV: number[][][] = [];

      // Multi-head attention
      const headsH: number[][][] = [];
      const headsE: number[][][] = [];

      for (let head = 0; head < this.config.numHeads; head++) {
        // Phase 1: Vertex → Hyperedge
        const { E_new, attentionVE } = this.vertexToEdgePhase(
          H,
          E,
          layerParams.W_v[head],
          layerParams.W_e[head],
          layerParams.a_ve[head],
        );
        layerAttentionVE.push(attentionVE);

        // Phase 2: Hyperedge → Vertex
        const { H_new, attentionEV } = this.edgeToVertexPhase(
          H,
          E_new,
          layerParams.W_e2[head],
          layerParams.W_v2[head],
          layerParams.a_ev[head],
        );
        layerAttentionEV.push(attentionEV);

        headsH.push(H_new);
        headsE.push(E_new);
      }

      // Concatenate heads
      H = this.concatHeads(headsH);
      E = this.concatHeads(headsE);

      // Apply dropout during training
      if (this.trainingMode && this.config.dropout > 0) {
        H = this.applyDropout(H);
        E = this.applyDropout(E);
      }

      fwdCache.H.push(H);
      fwdCache.E.push(E);
      fwdCache.attentionVE.push(layerAttentionVE);
      fwdCache.attentionEV.push(layerAttentionEV);
    }

    this.lastCache = fwdCache;
    return { H, E, cache: fwdCache };
  }

  /**
   * Phase 1: Vertex → Hyperedge message passing
   *
   * Formula from paper:
   * A' = A ⊙ softmax(LeakyReLU(H·W · (E·W)^T))
   * E^(l+1) = σ(A'^T · H^(l))
   */
  private vertexToEdgePhase(
    H: number[][],
    E: number[][],
    W_v: number[][],
    W_e: number[][],
    a_ve: number[],
  ): { E_new: number[][]; attentionVE: number[][] } {
    const numVertices = H.length;
    const numEdges = E.length;

    // Project vertices: H_proj = H · W_v^T
    const H_proj = this.matmulTranspose(H, W_v);
    // Project edges: E_proj = E · W_e^T
    const E_proj = this.matmulTranspose(E, W_e);

    // Compute attention scores for all vertex-edge pairs
    const attentionScores: number[][] = Array.from({ length: numVertices }, () =>
      Array(numEdges).fill(-Infinity)
    );

    for (let v = 0; v < numVertices; v++) {
      for (let e = 0; e < numEdges; e++) {
        // Only compute attention if vertex is in edge (incidence matrix)
        if (this.incidenceMatrix[v][e] === 1) {
          // Concatenate [h_v || e_e]
          const concat = [...H_proj[v], ...E_proj[e]];
          // Attention score: a^T · LeakyReLU(concat)
          const activated = concat.map((x) => this.leakyRelu(x));
          attentionScores[v][e] = this.dot(a_ve, activated);
        }
      }
    }

    // Softmax attention per edge (column-wise)
    const attentionVE: number[][] = Array.from({ length: numVertices }, () =>
      Array(numEdges).fill(0)
    );

    for (let e = 0; e < numEdges; e++) {
      // Get vertices in this edge
      const verticesInEdge: number[] = [];
      for (let v = 0; v < numVertices; v++) {
        if (this.incidenceMatrix[v][e] === 1) {
          verticesInEdge.push(v);
        }
      }

      if (verticesInEdge.length === 0) continue;

      // Softmax over vertices in edge
      const scores = verticesInEdge.map((v) => attentionScores[v][e]);
      const maxScore = Math.max(...scores);
      const exps = scores.map((s) => Math.exp(s - maxScore));
      const sumExp = exps.reduce((a, b) => a + b, 0);

      for (let i = 0; i < verticesInEdge.length; i++) {
        const v = verticesInEdge[i];
        attentionVE[v][e] = exps[i] / sumExp;
      }
    }

    // Aggregate: E_new = σ(A'^T · H)
    // A' is the masked attention (attentionVE)
    const E_new: number[][] = [];
    const hiddenDim = H_proj[0].length;

    for (let e = 0; e < numEdges; e++) {
      const aggregated = Array(hiddenDim).fill(0);

      for (let v = 0; v < numVertices; v++) {
        if (attentionVE[v][e] > 0) {
          for (let d = 0; d < hiddenDim; d++) {
            aggregated[d] += attentionVE[v][e] * H_proj[v][d];
          }
        }
      }

      // Apply activation (ELU)
      E_new.push(aggregated.map((x) => this.elu(x)));
    }

    return { E_new, attentionVE };
  }

  /**
   * Phase 2: Hyperedge → Vertex message passing
   *
   * Formula from paper:
   * B = A^T ⊙ softmax(LeakyReLU(E·W_1 · (H·W_1)^T))
   * H^(l+1) = σ(B^T · E^(l))
   */
  private edgeToVertexPhase(
    H: number[][],
    E: number[][],
    W_e: number[][],
    W_v: number[][],
    a_ev: number[],
  ): { H_new: number[][]; attentionEV: number[][] } {
    const numVertices = H.length;
    const numEdges = E.length;

    // Project
    const E_proj = this.matmulTranspose(E, W_e);
    const H_proj = this.matmulTranspose(H, W_v);

    // Compute attention scores for all edge-vertex pairs
    const attentionScores: number[][] = Array.from({ length: numEdges }, () =>
      Array(numVertices).fill(-Infinity)
    );

    for (let e = 0; e < numEdges; e++) {
      for (let v = 0; v < numVertices; v++) {
        // Only compute if vertex is in edge (A^T means we check same condition)
        if (this.incidenceMatrix[v][e] === 1) {
          const concat = [...E_proj[e], ...H_proj[v]];
          const activated = concat.map((x) => this.leakyRelu(x));
          attentionScores[e][v] = this.dot(a_ev, activated);
        }
      }
    }

    // Softmax attention per vertex (column-wise in transposed view)
    const attentionEV: number[][] = Array.from({ length: numEdges }, () =>
      Array(numVertices).fill(0)
    );

    for (let v = 0; v < numVertices; v++) {
      // Get edges containing this vertex
      const edgesForVertex: number[] = [];
      for (let e = 0; e < numEdges; e++) {
        if (this.incidenceMatrix[v][e] === 1) {
          edgesForVertex.push(e);
        }
      }

      if (edgesForVertex.length === 0) continue;

      // Softmax over edges for this vertex
      const scores = edgesForVertex.map((e) => attentionScores[e][v]);
      const maxScore = Math.max(...scores);
      const exps = scores.map((s) => Math.exp(s - maxScore));
      const sumExp = exps.reduce((a, b) => a + b, 0);

      for (let i = 0; i < edgesForVertex.length; i++) {
        const e = edgesForVertex[i];
        attentionEV[e][v] = exps[i] / sumExp;
      }
    }

    // Aggregate: H_new = σ(B^T · E)
    const H_new: number[][] = [];
    const hiddenDim = E_proj[0].length;

    for (let v = 0; v < numVertices; v++) {
      const aggregated = Array(hiddenDim).fill(0);

      for (let e = 0; e < numEdges; e++) {
        if (attentionEV[e][v] > 0) {
          for (let d = 0; d < hiddenDim; d++) {
            aggregated[d] += attentionEV[e][v] * E_proj[e][d];
          }
        }
      }

      // Apply activation + residual connection
      H_new.push(aggregated.map((x) => this.elu(x)));
    }

    return { H_new, attentionEV };
  }

  // ==========================================================================
  // Scoring and Prediction
  // ==========================================================================

  /**
   * Score all hyperedges (capabilities) given an intent
   *
   * @param intentEmbedding - The intent/query embedding
   * @param contextVertexIds - IDs of vertices in current context
   * @returns Scored capabilities sorted by score descending
   */
  scoreCapabilities(
    intentEmbedding: number[],
    contextVertexIds: string[] = [],
  ): Array<{ edgeId: string; score: number; attention: number[] }> {
    // Forward pass to get final embeddings
    const { E } = this.forward();

    const results: Array<{ edgeId: string; score: number; attention: number[] }> = [];

    // Score each hyperedge
    for (const [edgeId, edge] of this.edges) {
      const eIdx = this.edgeIndex.get(edgeId)!;
      const edgeEmb = E[eIdx];

      // Compute similarity with intent
      const intentSim = this.cosineSimilarity(intentEmbedding, edgeEmb);

      // Compute context boost
      let contextBoost = 0;
      if (contextVertexIds.length > 0) {
        const contextOverlap = edge.vertexIds.filter((v) =>
          contextVertexIds.includes(v)
        ).length;
        contextBoost = contextOverlap / Math.max(edge.vertexIds.length, 1);
      }

      // Apply reliability
      const reliability = edge.features.successRate;
      const reliabilityMult = reliability < 0.5 ? 0.5 : reliability > 0.9 ? 1.2 : 1.0;

      // Final score
      const score = this.sigmoid(
        (0.7 * intentSim + 0.3 * contextBoost) * reliabilityMult
      );

      // Get attention weights for interpretability
      const attention = this.lastCache
        ? this.getEdgeAttention(eIdx)
        : [];

      results.push({ edgeId, score, attention });
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * Get aggregated attention weights for an edge
   */
  private getEdgeAttention(edgeIdx: number): number[] {
    if (!this.lastCache) return [];

    const attention: number[] = [];
    const lastLayerVE = this.lastCache.attentionVE[this.config.numLayers - 1];

    // Average attention across heads
    for (let v = 0; v < this.vertices.size; v++) {
      let avgAttention = 0;
      for (let h = 0; h < this.config.numHeads; h++) {
        avgAttention += lastLayerVE[h][v][edgeIdx];
      }
      attention.push(avgAttention / this.config.numHeads);
    }

    return attention;
  }

  // ==========================================================================
  // Training with Backpropagation
  // ==========================================================================

  /**
   * Train on a batch of samples
   */
  trainBatch(
    samples: TrainingSample[],
  ): { loss: number; accuracy: number } {
    this.trainingMode = true;

    let totalLoss = 0;
    let correct = 0;

    // Accumulate gradients
    const gradients = this.initGradients();

    for (const sample of samples) {
      // Forward pass
      const { E, cache } = this.forward();

      // Get target edge embedding
      const targetIdx = this.edgeIndex.get(sample.targetEdgeId);
      if (targetIdx === undefined) continue;

      const edgeEmb = E[targetIdx];

      // Compute score
      const intentSim = this.cosineSimilarity(sample.intentEmbedding, edgeEmb);
      const score = this.sigmoid(intentSim);

      // Compute loss (binary cross-entropy)
      const loss = this.binaryCrossEntropy(score, sample.label);
      totalLoss += loss;

      // Accuracy
      const predicted = score > 0.5 ? 1 : 0;
      if (predicted === sample.label) correct++;

      // Backward pass
      const dLoss = score - sample.label; // Gradient of BCE w.r.t. score
      this.backward(gradients, cache, targetIdx, sample.intentEmbedding, dLoss);
    }

    // Apply gradients
    this.applyGradients(gradients, samples.length);

    this.trainingMode = false;

    return {
      loss: totalLoss / samples.length,
      accuracy: correct / samples.length,
    };
  }

  /**
   * Initialize gradient accumulators
   */
  private initGradients(): Map<string, number[][][]> {
    const grads = new Map<string, number[][][]>();

    for (let l = 0; l < this.config.numLayers; l++) {
      const layerParams = this.params[l];

      grads.set(`W_v_${l}`, this.zerosLike3D(layerParams.W_v));
      grads.set(`W_e_${l}`, this.zerosLike3D(layerParams.W_e));
      grads.set(`a_ve_${l}`, [layerParams.a_ve.map(() => Array(layerParams.a_ve[0].length).fill(0))]);
      grads.set(`W_e2_${l}`, this.zerosLike3D(layerParams.W_e2));
      grads.set(`W_v2_${l}`, this.zerosLike3D(layerParams.W_v2));
      grads.set(`a_ev_${l}`, [layerParams.a_ev.map(() => Array(layerParams.a_ev[0].length).fill(0))]);
    }

    grads.set("W_out", [[Array(this.W_out[0].length).fill(0)]]);

    return grads;
  }

  private zerosLike3D(tensor: number[][][]): number[][][] {
    return tensor.map((m) => m.map((r) => r.map(() => 0)));
  }

  /**
   * Backward pass through the network
   */
  private backward(
    gradients: Map<string, number[][][]>,
    cache: ForwardCache,
    targetEdgeIdx: number,
    intentEmb: number[],
    dLoss: number,
  ): void {
    const { numLayers, numHeads, hiddenDim } = this.config;

    // Gradient w.r.t. edge embedding (from cosine similarity)
    const E_final = cache.E[numLayers];
    const edgeEmb = E_final[targetEdgeIdx];

    // d(cosineSim)/d(edgeEmb)
    const normIntent = Math.sqrt(intentEmb.reduce((s, x) => s + x * x, 0));
    const normEdge = Math.sqrt(edgeEmb.reduce((s, x) => s + x * x, 0));
    const dot = this.dot(intentEmb, edgeEmb);

    const dEdgeEmb = intentEmb.map((xi, i) => {
      const term1 = xi / (normIntent * normEdge);
      const term2 = (dot * edgeEmb[i]) / (normIntent * normEdge * normEdge * normEdge);
      return dLoss * (term1 - term2);
    });

    // Initialize gradient for edge embeddings
    const dE: number[][] = E_final.map((_, i) =>
      i === targetEdgeIdx ? dEdgeEmb : Array(edgeEmb.length).fill(0)
    );

    // Backpropagate through layers (reverse order)
    let dH: number[][] = cache.H[numLayers].map(() =>
      Array(cache.H[numLayers][0].length).fill(0)
    );

    for (let l = numLayers - 1; l >= 0; l--) {
      const layerGrads = this.backwardLayer(
        l,
        cache.H[l],
        cache.E[l],
        cache.H[l + 1],
        cache.E[l + 1],
        cache.attentionVE[l],
        cache.attentionEV[l],
        dH,
        dE,
      );

      // Accumulate gradients
      for (let h = 0; h < numHeads; h++) {
        const W_v_grad = gradients.get(`W_v_${l}`)!;
        const W_e_grad = gradients.get(`W_e_${l}`)!;

        for (let i = 0; i < hiddenDim; i++) {
          for (let j = 0; j < layerGrads.dW_v[h][i].length; j++) {
            W_v_grad[h][i][j] += layerGrads.dW_v[h][i][j];
          }
          for (let j = 0; j < layerGrads.dW_e[h][i].length; j++) {
            W_e_grad[h][i][j] += layerGrads.dW_e[h][i][j];
          }
        }
      }

      // Update dH and dE for next layer
      dH = layerGrads.dH_prev;
      // dE remains for loss backprop
    }
  }

  /**
   * Backward pass through a single layer
   */
  private backwardLayer(
    layerIdx: number,
    H_in: number[][],
    E_in: number[][],
    H_out: number[][],
    E_out: number[][],
    attentionVE: number[][][],
    attentionEV: number[][][],
    dH_out: number[][],
    dE_out: number[][],
  ): {
    dW_v: number[][][];
    dW_e: number[][][];
    dH_prev: number[][];
    dE_prev: number[][];
  } {
    const { numHeads, hiddenDim } = this.config;
    const layerParams = this.params[layerIdx];

    const numVertices = H_in.length;
    const numEdges = E_in.length;
    const inputDim = H_in[0].length;

    // Initialize gradients
    const dW_v = this.zerosLike3D(layerParams.W_v);
    const dW_e = this.zerosLike3D(layerParams.W_e);
    const dH_prev: number[][] = Array.from({ length: numVertices }, () =>
      Array(inputDim).fill(0)
    );
    const dE_prev: number[][] = Array.from({ length: numEdges }, () =>
      Array(inputDim).fill(0)
    );

    // Split gradients by head
    const headDim = hiddenDim;
    for (let h = 0; h < numHeads; h++) {
      const headStart = h * headDim;
      const headEnd = headStart + headDim;

      // Backprop through Edge→Vertex phase
      for (let v = 0; v < numVertices; v++) {
        const dH_v = dH_out[v].slice(headStart, headEnd);

        // d(ELU)/dx
        const H_v = H_out[v].slice(headStart, headEnd);
        const dActiv = H_v.map((x) => (x >= 0 ? 1 : this.config.leakyReluAlpha * Math.exp(x)));

        const dPreActiv = dH_v.map((d, i) => d * dActiv[i]);

        // Gradient flows through attention
        for (let e = 0; e < numEdges; e++) {
          const alpha = attentionEV[h][e][v];
          if (alpha > 0) {
            // d/d(E_proj)
            for (let d = 0; d < headDim; d++) {
              const dE_proj_d = dPreActiv[d] * alpha;
              // Accumulate W_e2 gradient
              for (let j = 0; j < E_in[e].length; j++) {
                dW_e[h][d][j] += dE_proj_d * E_in[e][j];
              }
            }
          }
        }
      }

      // Backprop through Vertex→Edge phase
      for (let e = 0; e < numEdges; e++) {
        const dE_e = dE_out[e].slice(headStart, headEnd);

        for (let v = 0; v < numVertices; v++) {
          const alpha = attentionVE[h][v][e];
          if (alpha > 0) {
            for (let d = 0; d < headDim; d++) {
              const dH_proj_d = dE_e[d] * alpha;
              // Accumulate W_v gradient
              for (let j = 0; j < H_in[v].length; j++) {
                dW_v[h][d][j] += dH_proj_d * H_in[v][j];
              }
            }
          }
        }
      }
    }

    return { dW_v, dW_e, dH_prev, dE_prev };
  }

  /**
   * Apply accumulated gradients with Adam-like update
   */
  private applyGradients(gradients: Map<string, number[][][]>, batchSize: number): void {
    const lr = this.config.learningRate / batchSize;
    const l2 = this.config.l2Lambda;

    for (let l = 0; l < this.config.numLayers; l++) {
      const layerParams = this.params[l];

      // Update W_v
      const dW_v = gradients.get(`W_v_${l}`)!;
      for (let h = 0; h < this.config.numHeads; h++) {
        for (let i = 0; i < layerParams.W_v[h].length; i++) {
          for (let j = 0; j < layerParams.W_v[h][i].length; j++) {
            const grad = dW_v[h][i][j] + l2 * layerParams.W_v[h][i][j];
            layerParams.W_v[h][i][j] -= lr * grad;
          }
        }
      }

      // Update W_e
      const dW_e = gradients.get(`W_e_${l}`)!;
      for (let h = 0; h < this.config.numHeads; h++) {
        for (let i = 0; i < layerParams.W_e[h].length; i++) {
          for (let j = 0; j < layerParams.W_e[h][i].length; j++) {
            const grad = dW_e[h][i][j] + l2 * layerParams.W_e[h][i][j];
            layerParams.W_e[h][i][j] -= lr * grad;
          }
        }
      }
    }
  }

  // ==========================================================================
  // Utility Functions
  // ==========================================================================

  private getVertexEmbeddings(): number[][] {
    const embeddings: number[][] = [];
    for (const [_, vertex] of this.vertices) {
      embeddings.push([...vertex.embedding]);
    }
    return embeddings;
  }

  private getEdgeEmbeddings(): number[][] {
    const embeddings: number[][] = [];
    for (const [_, edge] of this.edges) {
      embeddings.push([...edge.embedding]);
    }
    return embeddings;
  }

  private matmulTranspose(A: number[][], B: number[][]): number[][] {
    // A[n][m] * B^T[k][m] = C[n][k]
    return A.map((row) =>
      B.map((bRow) => row.reduce((sum, val, i) => sum + val * (bRow[i] || 0), 0))
    );
  }

  private concatHeads(heads: number[][][]): number[][] {
    // heads: [numHeads][numNodes][hiddenDim] -> [numNodes][numHeads*hiddenDim]
    const numNodes = heads[0].length;
    return Array.from({ length: numNodes }, (_, i) =>
      heads.flatMap((head) => head[i])
    );
  }

  private applyDropout(matrix: number[][]): number[][] {
    const keepProb = 1 - this.config.dropout;
    return matrix.map((row) =>
      row.map((x) => (Math.random() < keepProb ? x / keepProb : 0))
    );
  }

  private leakyRelu(x: number): number {
    return x > 0 ? x : this.config.leakyReluAlpha * x;
  }

  private elu(x: number, alpha = 1.0): number {
    return x >= 0 ? x : alpha * (Math.exp(x) - 1);
  }

  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  private dot(a: number[], b: number[]): number {
    return a.reduce((sum, val, i) => sum + val * (b[i] || 0), 0);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dot = this.dot(a, b);
    const normA = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
    const normB = Math.sqrt(b.reduce((s, x) => s + x * x, 0));
    return normA * normB > 0 ? dot / (normA * normB) : 0;
  }

  private binaryCrossEntropy(pred: number, label: number): number {
    const eps = 1e-7;
    const p = Math.max(eps, Math.min(1 - eps, pred));
    return -label * Math.log(p) - (1 - label) * Math.log(1 - p);
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  /**
   * Export model parameters
   */
  exportParams(): Record<string, unknown> {
    return {
      config: this.config,
      params: this.params,
      W_out: this.W_out,
      b_out: this.b_out,
    };
  }

  /**
   * Import model parameters
   */
  importParams(data: Record<string, unknown>): void {
    if (data.config) {
      this.config = data.config as NSuHGATConfig;
    }
    if (data.params) {
      this.params = data.params as typeof this.params;
    }
    if (data.W_out) {
      this.W_out = data.W_out as number[][];
    }
    if (data.b_out !== undefined) {
      this.b_out = data.b_out as number;
    }
  }

  /**
   * Get model statistics
   */
  getStats(): {
    numLayers: number;
    numHeads: number;
    hiddenDim: number;
    numVertices: number;
    numEdges: number;
    incidenceNonZeros: number;
    paramCount: number;
  } {
    const { numLayers, numHeads, hiddenDim, inputDim } = this.config;

    // Count parameters
    let paramCount = 0;
    for (let l = 0; l < numLayers; l++) {
      const layerInputDim = l === 0 ? inputDim : hiddenDim * numHeads;
      // W_v, W_e per head
      paramCount += numHeads * hiddenDim * layerInputDim * 2;
      // a_ve per head
      paramCount += numHeads * 2 * hiddenDim;
      // W_e2, W_v2 per head
      paramCount += numHeads * hiddenDim * hiddenDim * 2;
      // a_ev per head
      paramCount += numHeads * 2 * hiddenDim;
    }
    // Output layer
    paramCount += hiddenDim * numHeads + 1;

    // Count incidence matrix non-zeros
    let incidenceNonZeros = 0;
    for (const row of this.incidenceMatrix) {
      incidenceNonZeros += row.filter((x) => x > 0).length;
    }

    return {
      numLayers,
      numHeads,
      hiddenDim,
      numVertices: this.vertices.size,
      numEdges: this.edges.size,
      incidenceNonZeros,
      paramCount,
    };
  }

  /**
   * Update edge features (recency, cooccurrence)
   */
  updateEdgeFeatures(edgeId: string, features: Partial<HypergraphEdge["features"]>): void {
    const edge = this.edges.get(edgeId);
    if (edge) {
      edge.features = { ...edge.features, ...features };
    }
  }
}

// ============================================================================
// Training Helper
// ============================================================================

/**
 * Train n-SuHGAT on episodic samples
 */
export async function trainNSuHGAT(
  model: NSuHGAT,
  samples: TrainingSample[],
  options: {
    epochs?: number;
    batchSize?: number;
    validationSplit?: number;
    onEpoch?: (epoch: number, trainLoss: number, valLoss: number, trainAcc: number, valAcc: number) => void;
  } = {},
): Promise<{ finalLoss: number; finalAccuracy: number; history: Array<{ loss: number; accuracy: number }> }> {
  const epochs = options.epochs || 20;
  const batchSize = options.batchSize || 16;
  const valSplit = options.validationSplit || 0.1;

  // Split into train/validation
  const shuffled = [...samples].sort(() => Math.random() - 0.5);
  const valSize = Math.floor(shuffled.length * valSplit);
  const valSamples = shuffled.slice(0, valSize);
  const trainSamples = shuffled.slice(valSize);

  const history: Array<{ loss: number; accuracy: number }> = [];
  let finalLoss = 0;
  let finalAccuracy = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    // Shuffle training data
    const epochSamples = [...trainSamples].sort(() => Math.random() - 0.5);

    let epochLoss = 0;
    let epochAcc = 0;
    let batchCount = 0;

    // Train in batches
    for (let i = 0; i < epochSamples.length; i += batchSize) {
      const batch = epochSamples.slice(i, i + batchSize);
      const result = model.trainBatch(batch);

      epochLoss += result.loss;
      epochAcc += result.accuracy;
      batchCount++;
    }

    epochLoss /= batchCount;
    epochAcc /= batchCount;

    // Validation
    let valLoss = 0;
    let valAcc = 0;
    if (valSamples.length > 0) {
      // Run validation in eval mode (no training)
      let valCorrect = 0;
      for (const sample of valSamples) {
        const results = model.scoreCapabilities(sample.intentEmbedding, sample.contextVertexIds);
        const targetResult = results.find((r) => r.edgeId === sample.targetEdgeId);
        if (targetResult) {
          valLoss += model["binaryCrossEntropy"](targetResult.score, sample.label);
          if ((targetResult.score > 0.5 ? 1 : 0) === sample.label) valCorrect++;
        }
      }
      valLoss /= valSamples.length;
      valAcc = valCorrect / valSamples.length;
    }

    history.push({ loss: epochLoss, accuracy: epochAcc });
    finalLoss = epochLoss;
    finalAccuracy = epochAcc;

    if (options.onEpoch) {
      options.onEpoch(epoch, epochLoss, valLoss, epochAcc, valAcc);
    }
  }

  return { finalLoss, finalAccuracy, history };
}
