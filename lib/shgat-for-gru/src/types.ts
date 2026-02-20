/**
 * Types for SHGAT-for-GRU adapter.
 *
 * Matches the export format of `lib/shgat-tf/tools/train-ob.ts`.
 *
 * @module shgat-for-gru/types
 */

// ==========================================================================
// OB-trained params (JSON export from train-ob.ts)
// ==========================================================================

/** Per-head K-head parameters */
export interface HeadParams {
  /** Query projection [headDim × embeddingDim] */
  W_q: number[][];
  /** Key projection [headDim × embeddingDim] */
  W_k: number[][];
  /** Value projection [headDim × embeddingDim] (used by MP, not scoring) */
  W_v: number[][];
  /** Attention vector [2 * headDim] */
  a: number[];
}

/** Per-level message passing parameters */
export interface LevelParams {
  /** Child→parent projection [numHeads][headDim × embDim] */
  W_child: number[][][];
  /** Parent→child projection [numHeads][headDim × embDim] */
  W_parent: number[][][];
  /** Upward attention [numHeads][2 * headDim] */
  a_upward: number[][];
  /** Downward attention [numHeads][2 * headDim] */
  a_downward: number[][];
}

/** Config embedded in param export */
export interface SHGATExportConfig {
  numHeads: number;
  headDim: number;
  embeddingDim: number;
  preserveDim: boolean;
  maxLevel: number;
}

/** Full param export from train-ob.ts */
export interface OBTrainedParams {
  headParams: HeadParams[];
  W_intent: number[][];
  levelParams: Record<string, LevelParams>;
  config: SHGATExportConfig;
}

// ==========================================================================
// Graph structure (for MP forward)
// ==========================================================================

/** Node in the SHGAT hierarchy */
export interface GraphNode {
  id: string;
  embedding: number[];
  children: string[];
  level: number;
}

/** Connectivity matrices for MP (aligned with train-ob.ts naming) */
export interface GraphStructure {
  /** L0 leaf node IDs (tools) */
  l0Ids: string[];
  /** L0 ID → index lookup */
  l0IdxMap: Map<string, number>;
  /** Non-L0 node IDs grouped by orchestration level */
  nodeIdsByLevel: Map<number, string[]>;
  /** l0ToL1Matrix[l1Idx][l0Idx] = 1 if L0 node is child of L1 node */
  l0ToL1Matrix: number[][];
  /** interLevelMatrices[level][parentIdx][childIdx] = 1 */
  interLevelMatrices: Map<number, number[][]>;
  maxLevel: number;
}

// ==========================================================================
// Vertex → Vertex co-occurrence enrichment
// ==========================================================================

/** Sparse co-occurrence matrix entry */
export interface CooccurrenceEntry {
  /** Source L0 node index */
  from: number;
  /** Target L0 node index */
  to: number;
  /** Co-occurrence weight (frequency-based, normalized) */
  weight: number;
}

/** V→V phase configuration */
export interface VertexToVertexConfig {
  /** Residual connection weight (0 = no enrichment, 1 = full) */
  residualWeight: number;
  /** Use attention-weighted aggregation vs simple weighted sum */
  useAttention: boolean;
  /** Temperature for attention softmax (lower = sharper) */
  temperature: number;
}

// ==========================================================================
// Adapter output
// ==========================================================================

/** Result of enriching embeddings via SHGAT MP */
export interface EnrichedEmbeddings {
  /** L0 node ID → enriched embedding (1024D) */
  l0Embeddings: Map<string, number[]>;
  /** Time taken for enrichment (ms) */
  enrichmentMs: number;
}

/** K-head scoring result for a single node (L0 = tool, L1+ = capability) */
export interface NodeScore {
  nodeId: string;
  score: number;
}

/** @deprecated Use NodeScore instead */
export type ToolScore = NodeScore;

/** Result of scoring nodes for an intent */
export interface ScoringResult {
  /** Top-K nodes sorted by score descending */
  topK: NodeScore[];
  /** Time taken for scoring (ms) */
  scoringMs: number;
}
