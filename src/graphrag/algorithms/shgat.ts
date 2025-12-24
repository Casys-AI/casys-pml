/**
 * SHGAT (SuperHyperGraph Attention Networks)
 *
 * Implementation based on "SuperHyperGraph Attention Networks" research paper.
 * Key architecture:
 * - Two-phase message passing: Vertex→Hyperedge, Hyperedge→Vertex
 * - Incidence matrix A where A[v][e] = 1 if vertex v is in hyperedge e
 * - Multi-head attention with specialized heads:
 *   - Heads 0-1: Semantic (embedding-based)
 *   - Head 2: Structure (spectral cluster, hypergraph pagerank)
 *   - Head 3: Temporal (co-occurrence, recency)
 *
 * Training:
 * - Online: trainOnExample() after each execution (via updateSHGAT in execute-handler)
 * - Batch: trainBatch() with PER sampling from execution_trace (Story 11.6)
 * - Proper backpropagation through both phases
 *
 * @module graphrag/algorithms/shgat
 */

import { getLogger } from "../../telemetry/logger.ts";

const log = getLogger("default");

// ============================================================================
// Types
// ============================================================================

/**
 * Head-specific weight configuration for tuning (6-head architecture)
 *
 * Head assignments:
 * - Head 0-1: Semantic (cosine similarity with intent)
 * - Head 2: Structure - PageRank
 * - Head 3: Structure - Spectral/AdamicAdar
 * - Head 4: Temporal - Cooccurrence + Recency
 * - Head 5: Temporal - HeatDiffusion
 */
export interface HeadWeightConfig {
  /**
   * Weights for structure heads (Heads 2-3)
   */
  structure: {
    pageRank: number;
    spectral: number;
    adamicAdar: number;
  };
  /**
   * Weights for temporal heads (Heads 4-5)
   */
  temporal: {
    cooccurrence: number;
    recency: number;
    heatDiffusion: number;
  };
}

/**
 * Default head weight configuration
 */
export const DEFAULT_HEAD_WEIGHTS: HeadWeightConfig = {
  structure: {
    pageRank: 1.0, // Head 2 is dedicated to PageRank
    spectral: 0.5, // Head 3 combines spectral + AdamicAdar
    adamicAdar: 0.5,
  },
  temporal: {
    cooccurrence: 0.5, // Head 4 combines cooccurrence + recency
    recency: 0.5,
    heatDiffusion: 1.0, // Head 5 is dedicated to HeatDiffusion
  },
};

/**
 * Learnable fusion weights configuration
 *
 * Maps head groups to learnable parameters for attention fusion.
 * During training, these weights are updated via backpropagation.
 */
export interface FusionWeights {
  /** Semantic heads (0-1) weight - raw logit before softmax */
  semantic: number;
  /** Structure heads (2-3) weight - raw logit before softmax */
  structure: number;
  /** Temporal heads (4-5) weight - raw logit before softmax */
  temporal: number;
}

/**
 * Default fusion weights (before softmax normalization)
 * Results in approximately: semantic=50%, structure=25%, temporal=25%
 */
export const DEFAULT_FUSION_WEIGHTS: FusionWeights = {
  semantic: 1.0, // Higher weight for semantic similarity
  structure: 0.5,
  temporal: 0.5,
};

/**
 * Configuration for SHGAT
 */
export interface SHGATConfig {
  /** Number of attention heads */
  numHeads: number;
  /** Hidden dimension for projections */
  hiddenDim: number;
  /** Embedding dimension (should match BGE-M3: 1024) */
  embeddingDim: number;
  /** Number of message passing layers */
  numLayers: number;
  /** Decay factor for recursive depth */
  depthDecay: number;
  /** Learning rate for training */
  learningRate: number;
  /** LeakyReLU negative slope */
  leakyReluSlope: number;
  /** L2 regularization weight */
  l2Lambda: number;
  /** Dropout rate (0 = no dropout) */
  dropout: number;

  // =========================================================================
  // Head Tuning Parameters (for ablation studies and domain adaptation)
  // =========================================================================

  /**
   * Which heads are active for scoring. Default: [0,1,2,3] (all heads)
   *
   * Head assignments:
   * - 0: Semantic (cosine similarity with intent)
   * - 1: Semantic (duplicate for weight balance)
   * - 2: Structure (pageRank + spectralCluster + adamicAdar)
   * - 3: Temporal (cooccurrence + recency + heatDiffusion)
   *
   * Examples:
   * - [0,1]: Semantic only (cosine baseline)
   * - [2]: Structure only
   * - [3]: Temporal only
   * - [0,1,2]: No temporal
   * - [0,1,3]: No structure
   */
  activeHeads?: number[];

  /**
   * Fixed weights for head fusion. If provided, uses these instead of softmax.
   * Must sum to 1.0 and have length = numHeads.
   *
   * Default: undefined (use softmax of head scores)
   *
   * Example: [0.4, 0.4, 0.1, 0.1] = 80% semantic, 10% structure, 10% temporal
   */
  headFusionWeights?: number[];

  /**
   * Per-feature weights within each head.
   * Allows fine-tuning the contribution of individual features.
   */
  headWeights?: Partial<HeadWeightConfig>;
}

/**
 * Default configuration (6-head architecture)
 */
export const DEFAULT_SHGAT_CONFIG: SHGATConfig = {
  numHeads: 6, // 6-head architecture: 2 semantic + 2 structure + 2 temporal
  hiddenDim: 64,
  embeddingDim: 1024,
  numLayers: 2,
  depthDecay: 0.8,
  learningRate: 0.001,
  leakyReluSlope: 0.2,
  l2Lambda: 0.0001,
  dropout: 0.1,
};

/**
 * Training example from episodic events
 */
export interface TrainingExample {
  /** Intent embedding (1024-dim) */
  intentEmbedding: number[];
  /** Context tool IDs that were active */
  contextTools: string[];
  /** Candidate capability ID */
  candidateId: string;
  /** Outcome: 1 = success, 0 = failure */
  outcome: number;
}

/**
 * Hypergraph features for SHGAT multi-head attention (CAPABILITIES)
 *
 * These features are computed by support algorithms and fed to SHGAT heads:
 * - Heads 0-1 (semantic): uses embedding
 * - Head 2 (structure): uses spectralCluster, hypergraphPageRank, adamicAdar
 * - Head 3 (temporal): uses cooccurrence, recency, heatDiffusion
 *
 * NOTE: For capabilities (hyperedges), these use HYPERGRAPH algorithms.
 * For tools, use ToolGraphFeatures instead (simple graph algorithms).
 */
export interface HypergraphFeatures {
  /** Spectral cluster ID on the hypergraph (0-based) */
  spectralCluster: number;
  /** Hypergraph PageRank score (0-1) */
  hypergraphPageRank: number;
  /** Co-occurrence frequency from episodic traces (0-1) */
  cooccurrence: number;
  /** Recency score - how recently used (0-1, 1 = very recent) */
  recency: number;
  /**
   * Adamic-Adar similarity with neighboring capabilities (0-1)
   *
   * TODO: Integrate with existing computeAdamicAdar() implementation
   *   - See: src/graphrag/algorithms/adamic-adar.ts
   *   - Pre-compute for each capability based on shared tools/neighbors
   *   - Currently: placeholder value, set manually or defaults to 0
   */
  adamicAdar?: number;
  /**
   * Heat diffusion score (0-1)
   *
   * TODO: Implement real heat diffusion computation. Options:
   *
   * Option 1: Static topology heat (context-free)
   *   - Extract computeLocalHeat() from LocalAlphaCalculator
   *   - Based on node degree + neighbor propagation
   *   - See: src/graphrag/local-alpha.ts:649
   *
   * Option 2: Pre-computed from episodic traces
   *   - Compute heat scores from episodic_events history
   *   - Which capabilities are frequently "hot" together
   *   - Use computeHierarchicalHeat() for Tool→Cap→Meta propagation
   *   - See: src/graphrag/local-alpha.ts:756
   *
   * Currently: placeholder value, set manually or defaults to 0
   */
  heatDiffusion?: number;
}

/**
 * Default hypergraph features (cold start)
 */
export const DEFAULT_HYPERGRAPH_FEATURES: HypergraphFeatures = {
  spectralCluster: 0,
  hypergraphPageRank: 0.01,
  cooccurrence: 0,
  recency: 0,
  adamicAdar: 0,
  heatDiffusion: 0,
};

/**
 * Tool graph features for SHGAT multi-head attention (TOOLS)
 *
 * These features use SIMPLE GRAPH algorithms (not hypergraph):
 * - Heads 2-3 (structure): pageRank, louvainCommunity, adamicAdar
 * - Heads 4-5 (temporal): cooccurrence, recency, heatDiffusion (from execution_trace)
 *
 * This is separate from HypergraphFeatures because tools exist in a
 * simple directed graph (Graphology), not the superhypergraph.
 */
export interface ToolGraphFeatures {
  /** Regular PageRank score from Graphology (0-1) */
  pageRank: number;
  /** Louvain community ID (0-based integer) */
  louvainCommunity: number;
  /** Adamic-Adar similarity with neighboring tools (0-1) */
  adamicAdar: number;
  /** Co-occurrence frequency from execution_trace (0-1) */
  cooccurrence: number;
  /** Recency score - exponential decay since last use (0-1, 1 = very recent) */
  recency: number;
  /** Heat diffusion score from graph topology (0-1) */
  heatDiffusion: number;
}

/**
 * Default tool graph features (cold start)
 */
export const DEFAULT_TOOL_GRAPH_FEATURES: ToolGraphFeatures = {
  pageRank: 0.01,
  louvainCommunity: 0,
  adamicAdar: 0,
  cooccurrence: 0,
  recency: 0,
  heatDiffusion: 0,
};

/**
 * Tool node (vertex in hypergraph)
 */
export interface ToolNode {
  id: string;
  /** Embedding (from tool description) */
  embedding: number[];
  /** Tool graph features (simple graph algorithms) */
  toolFeatures?: ToolGraphFeatures;
}

/**
 * Capability node (hyperedge in hypergraph)
 */
export interface CapabilityNode {
  id: string;
  /** Embedding (from description or aggregated tools) */
  embedding: number[];
  /** Tools in this capability (vertex IDs) */
  toolsUsed: string[];
  /** Success rate from history (reliability) */
  successRate: number;
  /** Parent capabilities (via contains) */
  parents: string[];
  /** Child capabilities (via contains) */
  children: string[];
  /** Hypergraph features for multi-head attention */
  hypergraphFeatures?: HypergraphFeatures;
}

/**
 * Attention result for a capability
 */
export interface AttentionResult {
  capabilityId: string;
  /** Final attention score (0-1) */
  score: number;
  /** Per-head attention weights */
  headWeights: number[];
  /** Per-head raw scores before fusion */
  headScores: number[];
  /** Contribution from recursive parents */
  recursiveContribution: number;
  /** Feature contributions for interpretability */
  featureContributions?: {
    semantic: number;
    structure: number;
    temporal: number;
    reliability: number;
  };
  /** Attention over tools (for interpretability) */
  toolAttention?: number[];
}

/**
 * Cached activations for backpropagation
 */
interface ForwardCache {
  /** Vertex (tool) embeddings at each layer */
  H: number[][][];
  /** Hyperedge (capability) embeddings at each layer */
  E: number[][][];
  /** Attention weights vertex→edge [layer][head][vertex][edge] */
  attentionVE: number[][][][];
  /** Attention weights edge→vertex [layer][head][edge][vertex] */
  attentionEV: number[][][][];
}

// ============================================================================
// SHGAT Implementation
// ============================================================================

/**
 * SuperHyperGraph Attention Networks
 *
 * Implements proper two-phase message passing:
 * 1. Vertex → Hyperedge: Aggregate tool features to capabilities
 * 2. Hyperedge → Vertex: Propagate capability features back to tools
 */
export class SHGAT {
  private config: SHGATConfig;

  // Vertices (tools) and Hyperedges (capabilities)
  private toolNodes: Map<string, ToolNode> = new Map();
  private capabilityNodes: Map<string, CapabilityNode> = new Map();
  private toolIndex: Map<string, number> = new Map();
  private capabilityIndex: Map<string, number> = new Map();

  // Incidence matrix: A[tool][capability] = 1 if tool is in capability
  private incidenceMatrix: number[][] = [];

  // Learnable parameters per layer per head (initialized in initializeParameters)
  private layerParams!: Array<{
    // Vertex→Edge phase
    W_v: number[][][]; // [head][hiddenDim][inputDim]
    W_e: number[][][]; // [head][hiddenDim][inputDim]
    a_ve: number[][]; // [head][2*hiddenDim]

    // Edge→Vertex phase
    W_e2: number[][][]; // [head][hiddenDim][hiddenDim]
    W_v2: number[][][]; // [head][hiddenDim][hiddenDim]
    a_ev: number[][]; // [head][2*hiddenDim]
  }>;

  // Legacy per-head parameters for backward compatibility (initialized in initializeParameters)
  private headParams!: Array<{
    W_q: number[][];
    W_k: number[][];
    W_v: number[][];
    a: number[];
  }>;

  // Learnable fusion weights (3 values: semantic, structure, temporal)
  // These are raw logits that get softmax-normalized during scoring
  private fusionWeights!: FusionWeights;

  // Training state
  private trainingMode = false;
  private lastCache: ForwardCache | null = null;

  // Gradient accumulator for fusion weights
  private fusionGradients: FusionWeights = { semantic: 0, structure: 0, temporal: 0 };

  // Gradient accumulator for W_intent (reset each batch)
  private W_intent_gradients: number[][] = [];

  // Intent projection matrix: projects intent (1024) to propagated embedding space (numHeads * hiddenDim)
  // This enables using message-passed embeddings for semantic similarity
  private W_intent!: number[][];

  constructor(config: Partial<SHGATConfig> = {}) {
    this.config = { ...DEFAULT_SHGAT_CONFIG, ...config };
    this.initializeParameters();
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  private initializeParameters(): void {
    const { numLayers, numHeads, hiddenDim, embeddingDim } = this.config;
    this.layerParams = [];

    for (let l = 0; l < numLayers; l++) {
      const layerInputDim = l === 0 ? embeddingDim : hiddenDim * numHeads;

      this.layerParams.push({
        W_v: this.initTensor3D(numHeads, hiddenDim, layerInputDim),
        W_e: this.initTensor3D(numHeads, hiddenDim, layerInputDim),
        a_ve: this.initMatrix(numHeads, 2 * hiddenDim),

        W_e2: this.initTensor3D(numHeads, hiddenDim, hiddenDim),
        W_v2: this.initTensor3D(numHeads, hiddenDim, hiddenDim),
        a_ev: this.initMatrix(numHeads, 2 * hiddenDim),
      });
    }

    // Legacy head params for backward compatibility
    this.headParams = [];
    for (let h = 0; h < numHeads; h++) {
      this.headParams.push({
        W_q: this.initMatrix(hiddenDim, embeddingDim),
        W_k: this.initMatrix(hiddenDim, embeddingDim),
        W_v: this.initMatrix(hiddenDim, embeddingDim),
        a: this.initVector(2 * hiddenDim),
      });
    }

    // Initialize learnable fusion weights
    this.fusionWeights = { ...DEFAULT_FUSION_WEIGHTS };

    // Initialize intent projection matrix: maps intent (1024) → propagated space (numHeads * hiddenDim)
    // This enables semantic comparison in the message-passed embedding space
    const propagatedDim = numHeads * hiddenDim;
    this.W_intent = this.initMatrix(propagatedDim, embeddingDim);
  }

  private initTensor3D(d1: number, d2: number, d3: number): number[][][] {
    const scale = Math.sqrt(2.0 / (d2 + d3));
    return Array.from(
      { length: d1 },
      () =>
        Array.from(
          { length: d2 },
          () => Array.from({ length: d3 }, () => (Math.random() - 0.5) * 2 * scale),
        ),
    );
  }

  private initMatrix(rows: number, cols: number): number[][] {
    const scale = Math.sqrt(2.0 / (rows + cols));
    return Array.from(
      { length: rows },
      () => Array.from({ length: cols }, () => (Math.random() - 0.5) * 2 * scale),
    );
  }

  private initVector(size: number): number[] {
    const scale = Math.sqrt(1.0 / size);
    return Array.from({ length: size }, () => (Math.random() - 0.5) * 2 * scale);
  }

  /**
   * Project intent embedding to propagated embedding space
   *
   * Maps the 1024-dim intent (BGE-M3) to the numHeads*hiddenDim space
   * so it can be compared with message-passed capability embeddings.
   *
   * @param intentEmbedding - Original intent embedding (1024-dim)
   * @returns Projected intent in propagated space (numHeads*hiddenDim dim)
   */
  private projectIntent(intentEmbedding: number[]): number[] {
    // W_intent: [propagatedDim][embeddingDim]
    // result = W_intent @ intentEmbedding
    const propagatedDim = this.W_intent.length;
    const result = new Array(propagatedDim).fill(0);

    for (let i = 0; i < propagatedDim; i++) {
      for (let j = 0; j < intentEmbedding.length; j++) {
        result[i] += this.W_intent[i][j] * intentEmbedding[j];
      }
    }

    return result;
  }

  // ==========================================================================
  // Graph Construction
  // ==========================================================================

  /**
   * Register a tool (vertex)
   */
  registerTool(node: ToolNode): void {
    this.toolNodes.set(node.id, node);
    this.rebuildIndices();
  }

  /**
   * Register a capability (hyperedge)
   */
  registerCapability(node: CapabilityNode): void {
    this.capabilityNodes.set(node.id, node);
    this.rebuildIndices();
  }

  /**
   * Check if a tool node exists
   */
  hasToolNode(toolId: string): boolean {
    return this.toolNodes.has(toolId);
  }

  /**
   * Check if a capability node exists
   */
  hasCapabilityNode(capabilityId: string): boolean {
    return this.capabilityNodes.has(capabilityId);
  }

  /**
   * Get the number of registered tools (Story 11.3 - cold start detection)
   */
  getToolCount(): number {
    return this.toolNodes.size;
  }

  /**
   * Get the number of registered capabilities (Story 11.3 - cold start detection)
   */
  getCapabilityCount(): number {
    return this.capabilityNodes.size;
  }

  /**
   * Build hypergraph from tools and capabilities
   */
  buildFromData(
    tools: Array<{ id: string; embedding: number[] }>,
    capabilities: Array<{
      id: string;
      embedding: number[];
      toolsUsed: string[];
      successRate: number;
      parents?: string[];
      children?: string[];
    }>,
  ): void {
    this.toolNodes.clear();
    this.capabilityNodes.clear();

    for (const tool of tools) {
      this.toolNodes.set(tool.id, {
        id: tool.id,
        embedding: tool.embedding,
      });
    }

    for (const cap of capabilities) {
      this.capabilityNodes.set(cap.id, {
        id: cap.id,
        embedding: cap.embedding,
        toolsUsed: cap.toolsUsed,
        successRate: cap.successRate,
        parents: cap.parents || [],
        children: cap.children || [],
      });
    }

    this.rebuildIndices();
  }

  /**
   * Recursively collect all tools from a capability and its children (transitive closure)
   *
   * This enables hierarchical capabilities (meta-meta-capabilities → meta-capabilities → capabilities)
   * to inherit all tools from their descendants in the incidence matrix.
   *
   * Example:
   *   release-cycle (meta-meta) contains [deploy-full, rollback-plan]
   *   deploy-full (meta) contains [build, test]
   *   build (capability) has tools [compiler, linker]
   *   test (capability) has tools [pytest]
   *
   *   collectTransitiveTools("release-cycle") returns [compiler, linker, pytest, ...]
   *
   * @param capId - The capability ID to collect tools from
   * @param visited - Set of already visited capability IDs (cycle detection)
   * @returns Set of all tool IDs transitively reachable from this capability
   */
  private collectTransitiveTools(capId: string, visited: Set<string> = new Set()): Set<string> {
    // Cycle detection - prevent infinite recursion
    if (visited.has(capId)) {
      return new Set();
    }
    visited.add(capId);

    const cap = this.capabilityNodes.get(capId);
    if (!cap) {
      return new Set();
    }

    // Start with direct tools
    const tools = new Set<string>(cap.toolsUsed);

    // Recursively collect from children (contained capabilities)
    for (const childId of cap.children) {
      const childTools = this.collectTransitiveTools(childId, visited);
      for (const tool of childTools) {
        tools.add(tool);
      }
    }

    return tools;
  }

  /**
   * Rebuild indices and incidence matrix
   */
  private rebuildIndices(): void {
    this.toolIndex.clear();
    this.capabilityIndex.clear();

    let tIdx = 0;
    for (const tId of this.toolNodes.keys()) {
      this.toolIndex.set(tId, tIdx++);
    }

    let cIdx = 0;
    for (const cId of this.capabilityNodes.keys()) {
      this.capabilityIndex.set(cId, cIdx++);
    }

    // Build incidence matrix A[tool][capability] with transitive closure
    // Meta-capabilities inherit all tools from their child capabilities
    // This enables infinite hierarchical nesting (meta-meta-meta... → meta → capability)
    const numTools = this.toolNodes.size;
    const numCaps = this.capabilityNodes.size;

    this.incidenceMatrix = Array.from({ length: numTools }, () => Array(numCaps).fill(0));

    for (const [capId] of this.capabilityNodes) {
      const cIdx = this.capabilityIndex.get(capId)!;
      // Use transitive collection to get all tools from this capability
      // and all its descendants (children, grandchildren, etc.)
      const transitiveTools = this.collectTransitiveTools(capId);
      for (const toolId of transitiveTools) {
        const tIdx = this.toolIndex.get(toolId);
        if (tIdx !== undefined) {
          this.incidenceMatrix[tIdx][cIdx] = 1;
        }
      }
    }
  }

  // ==========================================================================
  // Two-Phase Message Passing
  // ==========================================================================

  /**
   * Forward pass through all layers with two-phase message passing
   *
   * Phase 1 (Vertex→Hyperedge):
   *   A' = A ⊙ softmax(LeakyReLU(H·W · (E·W)^T))
   *   E^(l+1) = σ(A'^T · H^(l))
   *
   * Phase 2 (Hyperedge→Vertex):
   *   B = A^T ⊙ softmax(LeakyReLU(E·W_1 · (H·W_1)^T))
   *   H^(l+1) = σ(B^T · E^(l))
   */
  forward(): { H: number[][]; E: number[][]; cache: ForwardCache } {
    const cache: ForwardCache = {
      H: [],
      E: [],
      attentionVE: [],
      attentionEV: [],
    };

    // Initialize embeddings
    let H = this.getToolEmbeddings();
    let E = this.getCapabilityEmbeddings();

    cache.H.push(H);
    cache.E.push(E);

    // Process each layer
    for (let l = 0; l < this.config.numLayers; l++) {
      const params = this.layerParams[l];
      const layerAttentionVE: number[][][] = [];
      const layerAttentionEV: number[][][] = [];

      const headsH: number[][][] = [];
      const headsE: number[][][] = [];

      for (let head = 0; head < this.config.numHeads; head++) {
        // Phase 1: Vertex → Hyperedge
        const { E_new, attentionVE } = this.vertexToEdgePhase(
          H,
          E,
          params.W_v[head],
          params.W_e[head],
          params.a_ve[head],
          head,
        );
        layerAttentionVE.push(attentionVE);

        // Phase 2: Hyperedge → Vertex
        const { H_new, attentionEV } = this.edgeToVertexPhase(
          H,
          E_new,
          params.W_e2[head],
          params.W_v2[head],
          params.a_ev[head],
          head,
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

      cache.H.push(H);
      cache.E.push(E);
      cache.attentionVE.push(layerAttentionVE);
      cache.attentionEV.push(layerAttentionEV);
    }

    this.lastCache = cache;
    return { H, E, cache };
  }

  /**
   * Phase 1: Vertex → Hyperedge message passing
   */
  private vertexToEdgePhase(
    H: number[][],
    E: number[][],
    W_v: number[][],
    W_e: number[][],
    a_ve: number[],
    headIdx: number,
  ): { E_new: number[][]; attentionVE: number[][] } {
    const numTools = H.length;
    const numCaps = E.length;

    // Project
    const H_proj = this.matmulTranspose(H, W_v);
    const E_proj = this.matmulTranspose(E, W_e);

    // Compute attention scores (masked by incidence matrix)
    const attentionScores: number[][] = Array.from(
      { length: numTools },
      () => Array(numCaps).fill(-Infinity),
    );

    for (let t = 0; t < numTools; t++) {
      for (let c = 0; c < numCaps; c++) {
        if (this.incidenceMatrix[t][c] === 1) {
          const concat = [...H_proj[t], ...E_proj[c]];
          const activated = concat.map((x) => this.leakyRelu(x));
          attentionScores[t][c] = this.dot(a_ve, activated);
        }
      }
    }

    // Apply head-specific feature modulation
    this.applyHeadFeatures(attentionScores, headIdx, "vertex");

    // Softmax per capability (column-wise)
    const attentionVE: number[][] = Array.from({ length: numTools }, () => Array(numCaps).fill(0));

    for (let c = 0; c < numCaps; c++) {
      const toolsInCap: number[] = [];
      for (let t = 0; t < numTools; t++) {
        if (this.incidenceMatrix[t][c] === 1) {
          toolsInCap.push(t);
        }
      }

      if (toolsInCap.length === 0) continue;

      const scores = toolsInCap.map((t) => attentionScores[t][c]);
      const softmaxed = this.softmax(scores);

      for (let i = 0; i < toolsInCap.length; i++) {
        attentionVE[toolsInCap[i]][c] = softmaxed[i];
      }
    }

    // Aggregate: E_new = σ(A'^T · H_proj)
    const E_new: number[][] = [];
    const hiddenDim = H_proj[0].length;

    for (let c = 0; c < numCaps; c++) {
      const aggregated = Array(hiddenDim).fill(0);

      for (let t = 0; t < numTools; t++) {
        if (attentionVE[t][c] > 0) {
          for (let d = 0; d < hiddenDim; d++) {
            aggregated[d] += attentionVE[t][c] * H_proj[t][d];
          }
        }
      }

      E_new.push(aggregated.map((x) => this.elu(x)));
    }

    return { E_new, attentionVE };
  }

  /**
   * Phase 2: Hyperedge → Vertex message passing
   */
  private edgeToVertexPhase(
    H: number[][],
    E: number[][],
    W_e: number[][],
    W_v: number[][],
    a_ev: number[],
    headIdx: number,
  ): { H_new: number[][]; attentionEV: number[][] } {
    const numTools = H.length;
    const numCaps = E.length;

    const E_proj = this.matmulTranspose(E, W_e);
    const H_proj = this.matmulTranspose(H, W_v);

    // Compute attention scores
    const attentionScores: number[][] = Array.from(
      { length: numCaps },
      () => Array(numTools).fill(-Infinity),
    );

    for (let c = 0; c < numCaps; c++) {
      for (let t = 0; t < numTools; t++) {
        if (this.incidenceMatrix[t][c] === 1) {
          const concat = [...E_proj[c], ...H_proj[t]];
          const activated = concat.map((x) => this.leakyRelu(x));
          attentionScores[c][t] = this.dot(a_ev, activated);
        }
      }
    }

    // Apply head-specific feature modulation
    this.applyHeadFeatures(attentionScores, headIdx, "edge");

    // Softmax per tool (column-wise in transposed view)
    const attentionEV: number[][] = Array.from({ length: numCaps }, () => Array(numTools).fill(0));

    for (let t = 0; t < numTools; t++) {
      const capsForTool: number[] = [];
      for (let c = 0; c < numCaps; c++) {
        if (this.incidenceMatrix[t][c] === 1) {
          capsForTool.push(c);
        }
      }

      if (capsForTool.length === 0) continue;

      const scores = capsForTool.map((c) => attentionScores[c][t]);
      const softmaxed = this.softmax(scores);

      for (let i = 0; i < capsForTool.length; i++) {
        attentionEV[capsForTool[i]][t] = softmaxed[i];
      }
    }

    // Aggregate: H_new = σ(B^T · E_proj)
    const H_new: number[][] = [];
    const hiddenDim = E_proj[0].length;

    for (let t = 0; t < numTools; t++) {
      const aggregated = Array(hiddenDim).fill(0);

      for (let c = 0; c < numCaps; c++) {
        if (attentionEV[c][t] > 0) {
          for (let d = 0; d < hiddenDim; d++) {
            aggregated[d] += attentionEV[c][t] * E_proj[c][d];
          }
        }
      }

      H_new.push(aggregated.map((x) => this.elu(x)));
    }

    return { H_new, attentionEV };
  }

  /**
   * Apply head-specific feature modulation based on HypergraphFeatures
   */
  private applyHeadFeatures(
    scores: number[][],
    headIdx: number,
    phase: "vertex" | "edge",
  ): void {
    if (headIdx === 2) {
      // Head 2: Structure (spectral cluster, pagerank)
      for (const [capId, cap] of this.capabilityNodes) {
        const cIdx = this.capabilityIndex.get(capId)!;
        const features = cap.hypergraphFeatures || DEFAULT_HYPERGRAPH_FEATURES;
        const boost = features.hypergraphPageRank * 2; // PageRank boost

        if (phase === "vertex") {
          for (let t = 0; t < scores.length; t++) {
            if (scores[t][cIdx] > -Infinity) {
              scores[t][cIdx] += boost;
            }
          }
        } else {
          for (let t = 0; t < scores[cIdx].length; t++) {
            if (scores[cIdx][t] > -Infinity) {
              scores[cIdx][t] += boost;
            }
          }
        }
      }
    } else if (headIdx === 3) {
      // Head 3: Temporal (co-occurrence, recency)
      for (const [capId, cap] of this.capabilityNodes) {
        const cIdx = this.capabilityIndex.get(capId)!;
        const features = cap.hypergraphFeatures || DEFAULT_HYPERGRAPH_FEATURES;
        const boost = 0.6 * features.cooccurrence + 0.4 * features.recency;

        if (phase === "vertex") {
          for (let t = 0; t < scores.length; t++) {
            if (scores[t][cIdx] > -Infinity) {
              scores[t][cIdx] += boost;
            }
          }
        } else {
          for (let t = 0; t < scores[cIdx].length; t++) {
            if (scores[cIdx][t] > -Infinity) {
              scores[cIdx][t] += boost;
            }
          }
        }
      }
    }
    // Heads 0-1: Semantic (no modification, pure embedding attention)
  }

  // ==========================================================================
  // Scoring API
  // ==========================================================================

  /**
   * Score all capabilities given intent embedding
   *
   * SHGAT scoring is context-free per the original paper.
   * Context (current position) is handled by DR-DSP pathfinding, not here.
   *
   * 6-Head Multi-head attention architecture:
   * - Heads 0-1: Semantic (intent × capability embedding)
   * - Head 2: Structure - PageRank
   * - Head 3: Structure - Spectral + AdamicAdar
   * - Head 4: Temporal - Cooccurrence + Recency
   * - Head 5: Temporal - HeatDiffusion
   *
   * Learnable fusion: semantic/structure/temporal groups weighted by learned params
   */
  scoreAllCapabilities(
    intentEmbedding: number[],
    _contextToolEmbeddings?: number[][], // DEPRECATED - kept for API compat, ignored
    _contextCapabilityIds?: string[], // DEPRECATED - kept for API compat, ignored
  ): AttentionResult[] {
    // Run forward pass to get propagated embeddings via V→E→V message passing
    // E contains capability embeddings enriched with tool information
    const { E } = this.forward();

    const results: AttentionResult[] = [];

    // Compute normalized fusion weights from learnable params
    const groupWeights = this.computeFusionWeights();

    // Project intent to propagated space (numHeads * hiddenDim) for semantic comparison
    const intentProjected = this.projectIntent(intentEmbedding);

    for (const [capId, cap] of this.capabilityNodes) {
      const cIdx = this.capabilityIndex.get(capId)!;

      // Use PROPAGATED embedding from message passing for semantic similarity
      // E[cIdx] contains tool-enriched capability representation
      const capPropagatedEmb = E[cIdx];
      const intentSim = this.cosineSimilarity(intentProjected, capPropagatedEmb);

      // Reliability multiplier
      const reliability = cap.successRate;
      const reliabilityMult = reliability < 0.5 ? 0.5 : (reliability > 0.9 ? 1.2 : 1.0);

      // Get hypergraph features
      const features = cap.hypergraphFeatures || DEFAULT_HYPERGRAPH_FEATURES;
      const adamicAdar = features.adamicAdar ?? 0;
      const heatDiffusion = features.heatDiffusion ?? 0;

      // === 6-HEAD SCORES ===
      // Heads 0-1: Semantic (cosine similarity)
      const head0 = intentSim;
      const head1 = intentSim;

      // Head 2: Structure - PageRank (dedicated)
      const head2 = features.hypergraphPageRank;

      // Head 3: Structure - Spectral + AdamicAdar
      const spectralBonus = 1 / (1 + features.spectralCluster);
      const head3 = 0.5 * spectralBonus + 0.5 * adamicAdar;

      // Head 4: Temporal - Cooccurrence + Recency
      const head4 = 0.5 * features.cooccurrence + 0.5 * features.recency;

      // Head 5: Temporal - HeatDiffusion (dedicated)
      const head5 = heatDiffusion;

      const allHeadScores = [head0, head1, head2, head3, head4, head5];

      // === LEARNABLE FUSION ===
      // Group scores: average of heads in each group
      const semanticScore = (head0 + head1) / 2;
      const structureScore = (head2 + head3) / 2;
      const temporalScore = (head4 + head5) / 2;

      // Apply learned fusion weights
      const baseScore = groupWeights.semantic * semanticScore +
        groupWeights.structure * structureScore +
        groupWeights.temporal * temporalScore;

      // Apply activeHeads filter for ablation studies (optional)
      const activeHeads = this.config.activeHeads ?? [0, 1, 2, 3, 4, 5];

      // Compute per-head weights for interpretability
      const fullHeadWeights = [0, 0, 0, 0, 0, 0];
      // Distribute group weight to individual heads
      if (activeHeads.includes(0)) fullHeadWeights[0] = groupWeights.semantic / 2;
      if (activeHeads.includes(1)) fullHeadWeights[1] = groupWeights.semantic / 2;
      if (activeHeads.includes(2)) fullHeadWeights[2] = groupWeights.structure / 2;
      if (activeHeads.includes(3)) fullHeadWeights[3] = groupWeights.structure / 2;
      if (activeHeads.includes(4)) fullHeadWeights[4] = groupWeights.temporal / 2;
      if (activeHeads.includes(5)) fullHeadWeights[5] = groupWeights.temporal / 2;

      const score = this.sigmoid(baseScore * reliabilityMult);

      // Get tool attention for interpretability
      const toolAttention = this.getCapabilityToolAttention(cIdx);

      results.push({
        capabilityId: capId,
        score,
        headWeights: fullHeadWeights,
        headScores: allHeadScores,
        recursiveContribution: 0,
        featureContributions: {
          semantic: semanticScore,
          structure: structureScore,
          temporal: temporalScore,
          reliability: reliabilityMult,
        },
        toolAttention,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * Compute normalized fusion weights from learnable parameters
   * Uses softmax to ensure weights sum to 1
   */
  private computeFusionWeights(): { semantic: number; structure: number; temporal: number } {
    const raw = [this.fusionWeights.semantic, this.fusionWeights.structure, this.fusionWeights.temporal];
    const softmaxed = this.softmax(raw);
    return {
      semantic: softmaxed[0],
      structure: softmaxed[1],
      temporal: softmaxed[2],
    };
  }

  /**
   * Score all tools given intent embedding
   *
   * 6-Head Multi-head attention scoring for tools (simple graph algorithms):
   * - Heads 0-1 (Semantic): Cosine similarity with intent embedding
   * - Head 2 (Structure): PageRank (dedicated)
   * - Head 3 (Structure): Louvain community + AdamicAdar
   * - Head 4 (Temporal): Cooccurrence + Recency
   * - Head 5 (Temporal): HeatDiffusion (dedicated)
   *
   * Note: Tools use ToolGraphFeatures (simple graph algorithms),
   * while capabilities use HypergraphFeatures (spectral clustering, heat diffusion).
   *
   * @param intentEmbedding - The intent embedding (1024-dim BGE-M3)
   * @returns Array of tool scores sorted by score descending
   */
  scoreAllTools(
    intentEmbedding: number[],
  ): Array<{ toolId: string; score: number; headWeights?: number[] }> {
    // Run forward pass to get propagated embeddings via V→E→V message passing
    // H contains tool embeddings enriched with capability information
    const { H } = this.forward();

    const results: Array<{ toolId: string; score: number; headWeights?: number[] }> = [];

    // Compute normalized fusion weights from learnable params
    const groupWeights = this.computeFusionWeights();

    // Project intent to propagated space for semantic comparison
    const intentProjected = this.projectIntent(intentEmbedding);

    for (const [toolId, tool] of this.toolNodes) {
      const tIdx = this.toolIndex.get(toolId)!;

      // === HEAD 0-1: SEMANTIC ===
      // Use PROPAGATED embedding from message passing
      const toolPropagatedEmb = H[tIdx];
      const intentSim = this.cosineSimilarity(intentProjected, toolPropagatedEmb);

      // Get tool features (may be undefined for tools without features)
      const features = tool.toolFeatures;

      if (!features) {
        // Fallback: pure semantic similarity if no features
        results.push({
          toolId,
          score: Math.max(0, Math.min(intentSim, 0.95)),
        });
        continue;
      }

      // === 6-HEAD SCORES ===
      // Heads 0-1: Semantic (cosine similarity)
      const head0 = intentSim;
      const head1 = intentSim;

      // Head 2: Structure - PageRank (dedicated)
      const head2 = features.pageRank;

      // Head 3: Structure - Louvain + AdamicAdar
      const louvainBonus = 1 / (1 + features.louvainCommunity);
      const head3 = 0.5 * louvainBonus + 0.5 * features.adamicAdar;

      // Head 4: Temporal - Cooccurrence + Recency
      const head4 = 0.5 * features.cooccurrence + 0.5 * features.recency;

      // Head 5: Temporal - HeatDiffusion (dedicated)
      const head5 = features.heatDiffusion;

      const allHeadScores = [head0, head1, head2, head3, head4, head5];

      // === LEARNABLE FUSION ===
      // Group scores: average of heads in each group
      const semanticScore = (head0 + head1) / 2;
      const structureScore = (head2 + head3) / 2;
      const temporalScore = (head4 + head5) / 2;

      // Apply learned fusion weights
      const baseScore = groupWeights.semantic * semanticScore +
        groupWeights.structure * structureScore +
        groupWeights.temporal * temporalScore;

      // Apply activeHeads filter for ablation studies (optional)
      const activeHeads = this.config.activeHeads ?? [0, 1, 2, 3, 4, 5];

      // Compute per-head weights for interpretability
      const fullHeadWeights = [0, 0, 0, 0, 0, 0];
      if (activeHeads.includes(0)) fullHeadWeights[0] = groupWeights.semantic / 2;
      if (activeHeads.includes(1)) fullHeadWeights[1] = groupWeights.semantic / 2;
      if (activeHeads.includes(2)) fullHeadWeights[2] = groupWeights.structure / 2;
      if (activeHeads.includes(3)) fullHeadWeights[3] = groupWeights.structure / 2;
      if (activeHeads.includes(4)) fullHeadWeights[4] = groupWeights.temporal / 2;
      if (activeHeads.includes(5)) fullHeadWeights[5] = groupWeights.temporal / 2;

      const score = this.sigmoid(baseScore);

      results.push({
        toolId,
        score: Math.max(0, Math.min(score, 0.95)), // Clamp to [0, 0.95]
        headWeights: fullHeadWeights,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * Predict the success probability of an executed path (Story 11.3 - TD Learning)
   *
   * Uses the same multi-head architecture as scoreAllTools/scoreAllCapabilities
   * to predict whether a path of tools/capabilities will succeed.
   *
   * Used for TD Error calculation: tdError = actual - predicted
   * Where priority = |tdError| for PER sampling.
   *
   * @param intentEmbedding - The intent embedding (1024-dim BGE-M3)
   * @param path - Array of tool/capability IDs that were executed
   * @returns Probability of success [0, 1]
   */
  predictPathSuccess(intentEmbedding: number[], path: string[]): number {
    // Cold start: no nodes registered yet
    if (this.capabilityNodes.size === 0 && this.toolNodes.size === 0) {
      return 0.5;
    }

    // Empty path: neutral prediction
    if (!path || path.length === 0) {
      return 0.5;
    }

    // Collect scores for each node in the path
    const nodeScores: number[] = [];

    // Cache the full scoring results (avoid recomputing for each node)
    const toolScoresMap = new Map<string, number>();
    const capScoresMap = new Map<string, number>();

    // Only compute if we have nodes of that type in the path
    const hasTools = path.some((id) => this.toolNodes.has(id));
    const hasCaps = path.some((id) => this.capabilityNodes.has(id));

    if (hasTools) {
      const toolResults = this.scoreAllTools(intentEmbedding);
      for (const r of toolResults) {
        toolScoresMap.set(r.toolId, r.score);
      }
    }

    if (hasCaps) {
      const capResults = this.scoreAllCapabilities(intentEmbedding);
      for (const r of capResults) {
        capScoresMap.set(r.capabilityId, r.score);
      }
    }

    // Get score for each node in path
    for (const nodeId of path) {
      if (toolScoresMap.has(nodeId)) {
        nodeScores.push(toolScoresMap.get(nodeId)!);
      } else if (capScoresMap.has(nodeId)) {
        nodeScores.push(capScoresMap.get(nodeId)!);
      } else {
        // Unknown node: neutral score
        nodeScores.push(0.5);
      }
    }

    // Weighted average: later nodes in path are more critical for success
    // Weight increases linearly: 1.0, 1.5, 2.0, 2.5, ...
    let weightedSum = 0;
    let weightTotal = 0;

    for (let i = 0; i < nodeScores.length; i++) {
      const weight = 1 + i * 0.5;
      weightedSum += nodeScores[i] * weight;
      weightTotal += weight;
    }

    const pathScore = weightedSum / weightTotal;

    log.debug("[SHGAT] predictPathSuccess", {
      pathLength: path.length,
      nodeScores,
      pathScore,
    });

    return pathScore;
  }

  /**
   * Compute attention for a single capability
   */
  computeAttention(
    intentEmbedding: number[],
    _contextToolEmbeddings: number[][], // DEPRECATED - ignored
    capabilityId: string,
    _contextCapabilityIds?: string[], // DEPRECATED - ignored
  ): AttentionResult {
    const results = this.scoreAllCapabilities(intentEmbedding);

    return results.find((r) => r.capabilityId === capabilityId) || {
      capabilityId,
      score: 0,
      headWeights: new Array(this.config.numHeads).fill(0),
      headScores: new Array(this.config.numHeads).fill(0),
      recursiveContribution: 0,
    };
  }

  /**
   * Get tool attention weights for a capability
   */
  private getCapabilityToolAttention(capIdx: number): number[] {
    if (!this.lastCache || this.lastCache.attentionVE.length === 0) {
      return [];
    }

    const lastLayerVE = this.lastCache.attentionVE[this.config.numLayers - 1];
    const attention: number[] = [];

    for (let t = 0; t < this.toolNodes.size; t++) {
      let avgAttention = 0;
      for (let h = 0; h < this.config.numHeads; h++) {
        avgAttention += lastLayerVE[h][t][capIdx];
      }
      attention.push(avgAttention / this.config.numHeads);
    }

    return attention;
  }

  // ==========================================================================
  // Feature Updates
  // ==========================================================================

  /**
   * Update hypergraph features for a capability
   */
  updateHypergraphFeatures(capabilityId: string, features: Partial<HypergraphFeatures>): void {
    const node = this.capabilityNodes.get(capabilityId);
    if (node) {
      node.hypergraphFeatures = {
        ...(node.hypergraphFeatures || DEFAULT_HYPERGRAPH_FEATURES),
        ...features,
      };
    }
  }

  /**
   * Update hypergraph features for a tool (multi-head attention)
   */
  updateToolFeatures(toolId: string, features: Partial<ToolGraphFeatures>): void {
    const node = this.toolNodes.get(toolId);
    if (node) {
      node.toolFeatures = {
        ...(node.toolFeatures || DEFAULT_TOOL_GRAPH_FEATURES),
        ...features,
      };
    }
  }

  /**
   * Batch update hypergraph features for capabilities
   */
  batchUpdateFeatures(updates: Map<string, Partial<HypergraphFeatures>>): void {
    for (const [capId, features] of updates) {
      this.updateHypergraphFeatures(capId, features);
    }

    log.debug("[SHGAT] Updated hypergraph features", {
      updatedCount: updates.size,
    });
  }

  /**
   * Batch update hypergraph features for tools (multi-head attention)
   */
  batchUpdateToolFeatures(updates: Map<string, Partial<ToolGraphFeatures>>): void {
    for (const [toolId, features] of updates) {
      this.updateToolFeatures(toolId, features);
    }

    log.debug("[SHGAT] Updated tool features for multi-head attention", {
      updatedCount: updates.size,
    });
  }

  // ==========================================================================
  // Training with Backpropagation
  // ==========================================================================

  /**
   * Train on a single example (online learning)
   *
   * Used for incremental learning after each execution trace.
   * Less efficient than batch training but enables real-time learning.
   */
  trainOnExample(example: TrainingExample): { loss: number; accuracy: number } {
    return this.trainBatch([example]);
  }

  /**
   * Train on a batch of examples
   *
   * Uses 6-head architecture and learns fusion weights via backpropagation.
   */
  trainBatch(
    examples: TrainingExample[],
    _getEmbedding?: (id: string) => number[] | null, // DEPRECATED - kept for API compat
  ): { loss: number; accuracy: number } {
    this.trainingMode = true;

    let totalLoss = 0;
    let correct = 0;

    const gradients = this.initGradients();

    // Reset fusion gradients for this batch
    this.fusionGradients = { semantic: 0, structure: 0, temporal: 0 };

    // Reset W_intent gradients for this batch
    const propagatedDim = this.config.numHeads * this.config.hiddenDim;
    this.W_intent_gradients = Array.from({ length: propagatedDim }, () =>
      Array(this.config.embeddingDim).fill(0)
    );

    for (const example of examples) {
      // Forward pass to get propagated embeddings via V→E→V message passing
      const { E, cache } = this.forward();

      const capIdx = this.capabilityIndex.get(example.candidateId);
      if (capIdx === undefined) continue;

      // Get capability node and propagated embedding
      const capNode = this.capabilityNodes.get(example.candidateId)!;
      const capPropagatedEmb = E[capIdx]; // Use propagated embedding
      const features = capNode.hypergraphFeatures || DEFAULT_HYPERGRAPH_FEATURES;

      // Project intent to propagated space for semantic comparison
      const intentProjected = this.projectIntent(example.intentEmbedding);

      // === COMPUTE 6-HEAD SCORES (same as scoreAllCapabilities) ===
      const intentSim = this.cosineSimilarity(intentProjected, capPropagatedEmb);
      const adamicAdar = features.adamicAdar ?? 0;
      const heatDiffusion = features.heatDiffusion ?? 0;

      const head0 = intentSim;
      const head1 = intentSim;
      const head2 = features.hypergraphPageRank;
      const spectralBonus = 1 / (1 + features.spectralCluster);
      const head3 = 0.5 * spectralBonus + 0.5 * adamicAdar;
      const head4 = 0.5 * features.cooccurrence + 0.5 * features.recency;
      const head5 = heatDiffusion;

      // Group scores
      const semanticScore = (head0 + head1) / 2;
      const structureScore = (head2 + head3) / 2;
      const temporalScore = (head4 + head5) / 2;

      // Compute fusion weights
      const groupWeights = this.computeFusionWeights();

      // Reliability
      const reliability = capNode.successRate;
      const reliabilityMult = reliability < 0.5 ? 0.5 : (reliability > 0.9 ? 1.2 : 1.0);

      // Final score
      const baseScore = groupWeights.semantic * semanticScore +
        groupWeights.structure * structureScore +
        groupWeights.temporal * temporalScore;

      const score = this.sigmoid(baseScore * reliabilityMult);

      // Loss
      const loss = this.binaryCrossEntropy(score, example.outcome);
      totalLoss += loss;

      // Accuracy
      if ((score > 0.5 ? 1 : 0) === example.outcome) correct++;

      // === BACKWARD PASS ===
      const dLoss = score - example.outcome;

      // Gradient for fusion weights (softmax + weighted sum)
      // d(loss)/d(w_i) = dLoss * sigmoid'(baseScore) * reliabilityMult * score_i
      // where sigmoid'(x) = sigmoid(x) * (1 - sigmoid(x))
      const sigmoidGrad = score * (1 - score) * reliabilityMult;

      // Softmax gradient: d(softmax_i)/d(raw_j) = softmax_i * (delta_ij - softmax_j)
      // For our 3-class softmax, we accumulate gradients
      const ws = groupWeights.semantic;
      const wst = groupWeights.structure;
      const wt = groupWeights.temporal;

      // Gradient of baseScore w.r.t. raw fusion weights (through softmax)
      // Using chain rule: dL/d_raw_sem = dLoss * sigmoidGrad * (ws*(1-ws)*sem - ws*wst*struct - ws*wt*temp)
      this.fusionGradients.semantic += dLoss * sigmoidGrad * (
        ws * (1 - ws) * semanticScore -
        ws * wst * structureScore -
        ws * wt * temporalScore
      );

      this.fusionGradients.structure += dLoss * sigmoidGrad * (
        wst * (1 - wst) * structureScore -
        wst * ws * semanticScore -
        wst * wt * temporalScore
      );

      this.fusionGradients.temporal += dLoss * sigmoidGrad * (
        wt * (1 - wt) * temporalScore -
        wt * ws * semanticScore -
        wt * wst * structureScore
      );

      // Backward for layer params and W_intent
      // Pass projected intent so gradient computation is in the same space
      this.backward(gradients, cache, capIdx, intentProjected, dLoss);

      // Accumulate W_intent gradients
      // d(loss)/d(W_intent[i][j]) = d(loss)/d(intentProjected[i]) * intent[j]
      // where d(loss)/d(intentProjected) comes from cosine similarity gradient
      this.accumulateW_intentGradients(
        example.intentEmbedding,
        intentProjected,
        capPropagatedEmb,
        dLoss
      );
    }

    // Apply all gradients
    this.applyGradients(gradients, examples.length);
    this.applyFusionGradients(examples.length);
    this.applyW_intentGradients(examples.length);
    this.trainingMode = false;

    return {
      loss: totalLoss / examples.length,
      accuracy: correct / examples.length,
    };
  }

  /**
   * Apply accumulated fusion weight gradients
   */
  private applyFusionGradients(batchSize: number): void {
    const lr = this.config.learningRate / batchSize;
    const l2 = this.config.l2Lambda;

    // Update fusion weights with L2 regularization
    this.fusionWeights.semantic -= lr * (this.fusionGradients.semantic + l2 * this.fusionWeights.semantic);
    this.fusionWeights.structure -= lr * (this.fusionGradients.structure + l2 * this.fusionWeights.structure);
    this.fusionWeights.temporal -= lr * (this.fusionGradients.temporal + l2 * this.fusionWeights.temporal);

    log.debug("[SHGAT] Updated fusion weights", {
      semantic: this.fusionWeights.semantic.toFixed(4),
      structure: this.fusionWeights.structure.toFixed(4),
      temporal: this.fusionWeights.temporal.toFixed(4),
    });
  }

  /**
   * Accumulate gradients for W_intent from cosine similarity
   *
   * Chain rule: d(loss)/d(W_intent[i][j]) = d(loss)/d(intentProj[i]) * intent[j]
   */
  private accumulateW_intentGradients(
    intentOriginal: number[],
    intentProjected: number[],
    capEmb: number[],
    dLoss: number
  ): void {
    const propagatedDim = intentProjected.length;

    // Compute gradient of cosine similarity w.r.t. intentProjected
    const normIntent = Math.sqrt(intentProjected.reduce((s, x) => s + x * x, 0)) + 1e-8;
    const normCap = Math.sqrt(capEmb.reduce((s, x) => s + x * x, 0)) + 1e-8;
    const dot = this.dot(intentProjected, capEmb);

    // d(cos)/d(intentProj[i]) = capEmb[i]/(normIntent*normCap) - dot*intentProj[i]/(normIntent^3*normCap)
    const dIntentProj: number[] = new Array(propagatedDim);
    for (let i = 0; i < propagatedDim; i++) {
      const term1 = capEmb[i] / (normIntent * normCap);
      const term2 = (dot * intentProjected[i]) / (normIntent * normIntent * normIntent * normCap);
      dIntentProj[i] = dLoss * (term1 - term2);
    }

    // Accumulate gradients for W_intent
    // W_intent[i][j] affects intentProj[i] via: intentProj[i] = sum_j(W_intent[i][j] * intent[j])
    // So d(loss)/d(W_intent[i][j]) = dIntentProj[i] * intent[j]
    for (let i = 0; i < propagatedDim; i++) {
      for (let j = 0; j < intentOriginal.length; j++) {
        this.W_intent_gradients[i][j] += dIntentProj[i] * intentOriginal[j];
      }
    }
  }

  /**
   * Apply accumulated W_intent gradients with L2 regularization
   */
  private applyW_intentGradients(batchSize: number): void {
    const lr = this.config.learningRate / batchSize;
    const l2 = this.config.l2Lambda;

    for (let i = 0; i < this.W_intent.length; i++) {
      for (let j = 0; j < this.W_intent[i].length; j++) {
        const grad = this.W_intent_gradients[i][j] + l2 * this.W_intent[i][j];
        this.W_intent[i][j] -= lr * grad;
      }
    }

    log.debug("[SHGAT] Updated W_intent (sample weights)", {
      w00: this.W_intent[0]?.[0]?.toFixed(6) ?? "N/A",
      w01: this.W_intent[0]?.[1]?.toFixed(6) ?? "N/A",
    });
  }

  private initGradients(): Map<string, number[][][]> {
    const grads = new Map<string, number[][][]>();

    for (let l = 0; l < this.config.numLayers; l++) {
      const params = this.layerParams[l];
      grads.set(`W_v_${l}`, this.zerosLike3D(params.W_v));
      grads.set(`W_e_${l}`, this.zerosLike3D(params.W_e));
    }

    return grads;
  }

  private zerosLike3D(tensor: number[][][]): number[][][] {
    return tensor.map((m) => m.map((r) => r.map(() => 0)));
  }

  private backward(
    gradients: Map<string, number[][][]>,
    cache: ForwardCache,
    targetCapIdx: number,
    intentEmb: number[],
    dLoss: number,
  ): void {
    const { numLayers, numHeads, hiddenDim } = this.config;

    const E_final = cache.E[numLayers];
    const capEmb = E_final[targetCapIdx];

    // Gradient of cosine similarity
    const normIntent = Math.sqrt(intentEmb.reduce((s, x) => s + x * x, 0));
    const normCap = Math.sqrt(capEmb.reduce((s, x) => s + x * x, 0));
    const dot = this.dot(intentEmb, capEmb);

    const dCapEmb = intentEmb.map((xi, i) => {
      const term1 = xi / (normIntent * normCap);
      const term2 = (dot * capEmb[i]) / (normIntent * normCap * normCap * normCap);
      return dLoss * (term1 - term2);
    });

    // Backprop through layers
    for (let l = numLayers - 1; l >= 0; l--) {
      const H_in = cache.H[l];
      const attentionVE = cache.attentionVE[l];

      for (let h = 0; h < numHeads; h++) {
        const dW_v = gradients.get(`W_v_${l}`)!;

        for (let t = 0; t < H_in.length; t++) {
          const alpha = attentionVE[h][t][targetCapIdx];
          if (alpha > 0) {
            const headDim = hiddenDim;
            const headStart = h * headDim;
            const headEnd = headStart + headDim;
            const dE_head = dCapEmb.slice(headStart, headEnd);

            for (let d = 0; d < headDim; d++) {
              for (let j = 0; j < H_in[t].length; j++) {
                dW_v[h][d][j] += dE_head[d] * alpha * H_in[t][j];
              }
            }
          }
        }
      }
    }
  }

  private applyGradients(gradients: Map<string, number[][][]>, batchSize: number): void {
    const lr = this.config.learningRate / batchSize;
    const l2 = this.config.l2Lambda;

    for (let l = 0; l < this.config.numLayers; l++) {
      const params = this.layerParams[l];
      const dW_v = gradients.get(`W_v_${l}`)!;

      for (let h = 0; h < this.config.numHeads; h++) {
        for (let i = 0; i < params.W_v[h].length; i++) {
          for (let j = 0; j < params.W_v[h][i].length; j++) {
            const grad = dW_v[h][i][j] + l2 * params.W_v[h][i][j];
            params.W_v[h][i][j] -= lr * grad;
          }
        }
      }
    }
  }

  // ==========================================================================
  // Utility Functions
  // ==========================================================================

  private getToolEmbeddings(): number[][] {
    const embeddings: number[][] = [];
    for (const [_, tool] of this.toolNodes) {
      embeddings.push([...tool.embedding]);
    }
    return embeddings;
  }

  private getCapabilityEmbeddings(): number[][] {
    const embeddings: number[][] = [];
    for (const [_, cap] of this.capabilityNodes) {
      embeddings.push([...cap.embedding]);
    }
    return embeddings;
  }

  private matmulTranspose(A: number[][], B: number[][]): number[][] {
    return A.map((row) =>
      B.map((bRow) => row.reduce((sum, val, i) => sum + val * (bRow[i] || 0), 0))
    );
  }

  private concatHeads(heads: number[][][]): number[][] {
    const numNodes = heads[0].length;
    return Array.from({ length: numNodes }, (_, i) => heads.flatMap((head) => head[i]));
  }

  private applyDropout(matrix: number[][]): number[][] {
    const keepProb = 1 - this.config.dropout;
    return matrix.map((row) => row.map((x) => (Math.random() < keepProb ? x / keepProb : 0)));
  }

  private leakyRelu(x: number): number {
    return x > 0 ? x : this.config.leakyReluSlope * x;
  }

  private elu(x: number, alpha = 1.0): number {
    return x >= 0 ? x : alpha * (Math.exp(x) - 1);
  }

  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  private softmax(values: number[]): number[] {
    const maxVal = Math.max(...values);
    const exps = values.map((v) => Math.exp(v - maxVal));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / sum);
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

  exportParams(): Record<string, unknown> {
    return {
      config: this.config,
      layerParams: this.layerParams,
      headParams: this.headParams,
      fusionWeights: this.fusionWeights,
      W_intent: this.W_intent,
    };
  }

  importParams(params: Record<string, unknown>): void {
    if (params.config) {
      this.config = params.config as SHGATConfig;
    }
    if (params.layerParams) {
      this.layerParams = params.layerParams as typeof this.layerParams;
    }
    if (params.headParams) {
      this.headParams = params.headParams as typeof this.headParams;
    }
    if (params.fusionWeights) {
      this.fusionWeights = params.fusionWeights as FusionWeights;
    }
    if (params.W_intent) {
      this.W_intent = params.W_intent as number[][];
    }
  }

  /**
   * Get current fusion weights (normalized via softmax)
   */
  getFusionWeights(): { semantic: number; structure: number; temporal: number } {
    return this.computeFusionWeights();
  }

  /**
   * Set raw fusion weights (before softmax normalization)
   */
  setFusionWeights(weights: Partial<FusionWeights>): void {
    if (weights.semantic !== undefined) this.fusionWeights.semantic = weights.semantic;
    if (weights.structure !== undefined) this.fusionWeights.structure = weights.structure;
    if (weights.temporal !== undefined) this.fusionWeights.temporal = weights.temporal;
  }

  /**
   * Get all registered tool IDs (for feature population)
   */
  getRegisteredToolIds(): string[] {
    return Array.from(this.toolNodes.keys());
  }

  /**
   * Get all registered capability IDs
   */
  getRegisteredCapabilityIds(): string[] {
    return Array.from(this.capabilityNodes.keys());
  }

  getStats(): {
    numHeads: number;
    hiddenDim: number;
    numLayers: number;
    paramCount: number;
    registeredCapabilities: number;
    registeredTools: number;
    incidenceNonZeros: number;
    fusionWeights: { semantic: number; structure: number; temporal: number };
  } {
    const { numHeads, hiddenDim, embeddingDim, numLayers } = this.config;

    let paramCount = 0;
    for (let l = 0; l < numLayers; l++) {
      const layerInputDim = l === 0 ? embeddingDim : hiddenDim * numHeads;
      paramCount += numHeads * hiddenDim * layerInputDim * 2; // W_v, W_e
      paramCount += numHeads * 2 * hiddenDim; // a_ve
      paramCount += numHeads * hiddenDim * hiddenDim * 2; // W_e2, W_v2
      paramCount += numHeads * 2 * hiddenDim; // a_ev
    }
    // Add fusion weight params (3 values)
    paramCount += 3;

    let incidenceNonZeros = 0;
    for (const row of this.incidenceMatrix) {
      incidenceNonZeros += row.filter((x) => x > 0).length;
    }

    return {
      numHeads,
      hiddenDim,
      numLayers,
      paramCount,
      registeredCapabilities: this.capabilityNodes.size,
      registeredTools: this.toolNodes.size,
      incidenceNonZeros,
      fusionWeights: this.computeFusionWeights(),
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create SHGAT from capability store
 */
export function createSHGATFromCapabilities(
  capabilities: Array<{
    id: string;
    embedding: number[];
    toolsUsed: string[];
    successRate: number;
    parents?: string[];
    children?: string[];
    hypergraphFeatures?: HypergraphFeatures;
  }>,
  configOrToolEmbeddings?: Partial<SHGATConfig> | Map<string, number[]>,
  config?: Partial<SHGATConfig>,
): SHGAT {
  // Handle overloaded parameters
  let toolEmbeddings: Map<string, number[]> | undefined;
  let actualConfig: Partial<SHGATConfig> | undefined;

  if (configOrToolEmbeddings instanceof Map) {
    toolEmbeddings = configOrToolEmbeddings;
    actualConfig = config;
  } else {
    actualConfig = configOrToolEmbeddings;
  }

  const shgat = new SHGAT(actualConfig);

  // Extract all unique tools from capabilities
  const allTools = new Set<string>();
  for (const cap of capabilities) {
    for (const toolId of cap.toolsUsed) {
      allTools.add(toolId);
    }
  }

  // Determine embedding dimension from first capability
  const embeddingDim = capabilities[0]?.embedding.length || 1024;

  // Register tools with embeddings (provided or generated)
  for (const toolId of allTools) {
    const embedding = toolEmbeddings?.get(toolId) ||
      generateDefaultToolEmbedding(toolId, embeddingDim);
    shgat.registerTool({ id: toolId, embedding });
  }

  // Register capabilities
  for (const cap of capabilities) {
    shgat.registerCapability({
      id: cap.id,
      embedding: cap.embedding,
      toolsUsed: cap.toolsUsed,
      successRate: cap.successRate,
      parents: cap.parents || [],
      children: cap.children || [],
    });

    // Update hypergraph features if provided
    if (cap.hypergraphFeatures) {
      shgat.updateHypergraphFeatures(cap.id, cap.hypergraphFeatures);
    }
  }

  return shgat;
}

/**
 * Generate a deterministic default embedding for a tool based on its ID
 */
function generateDefaultToolEmbedding(toolId: string, dim: number): number[] {
  const embedding: number[] = [];
  // Use hash-like seed from tool ID for deterministic pseudo-random values
  let seed = 0;
  for (let i = 0; i < toolId.length; i++) {
    seed = ((seed << 5) - seed + toolId.charCodeAt(i)) | 0;
  }
  for (let i = 0; i < dim; i++) {
    // Deterministic pseudo-random based on seed and index
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    embedding.push((seed / 0x7fffffff - 0.5) * 0.1);
  }
  return embedding;
}

/**
 * Train SHGAT on episodic events
 */
export async function trainSHGATOnEpisodes(
  shgat: SHGAT,
  episodes: TrainingExample[],
  getEmbedding: (id: string) => number[] | null,
  options: {
    epochs?: number;
    batchSize?: number;
    onEpoch?: (epoch: number, loss: number, accuracy: number) => void;
  } = {},
): Promise<{ finalLoss: number; finalAccuracy: number }> {
  // Yield to event loop for UI responsiveness during long training
  await Promise.resolve();

  const epochs = options.epochs || 10;
  const batchSize = options.batchSize || 32;

  let finalLoss = 0;
  let finalAccuracy = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const shuffled = [...episodes].sort(() => Math.random() - 0.5);

    let epochLoss = 0;
    let epochAccuracy = 0;
    let batchCount = 0;

    for (let i = 0; i < shuffled.length; i += batchSize) {
      const batch = shuffled.slice(i, i + batchSize);
      const result = shgat.trainBatch(batch, getEmbedding);

      epochLoss += result.loss;
      epochAccuracy += result.accuracy;
      batchCount++;
    }

    epochLoss /= batchCount;
    epochAccuracy /= batchCount;

    finalLoss = epochLoss;
    finalAccuracy = epochAccuracy;

    if (options.onEpoch) {
      options.onEpoch(epoch, epochLoss, epochAccuracy);
    }
  }

  return { finalLoss, finalAccuracy };
}
