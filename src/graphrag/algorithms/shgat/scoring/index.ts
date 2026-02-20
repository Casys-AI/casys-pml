/**
 * SHGAT Scoring Module
 *
 * Active scoring architectures:
 * - v1: K-head attention (semantic/structure/temporal)
 * - Multi-level: n-SuperHyperGraph with hierarchical message passing
 *
 * @module graphrag/algorithms/shgat/scoring
 */

export { V1Scorer } from "./v1-scorer.ts";
export {
  type MultiLevelForwardResult,
  MultiLevelScorer,
  type MultiLevelScorerDependencies,
} from "./multi-level-scorer.ts";

// Re-export types from shgat-types for convenience
export type {
  AttentionResult,
  CapabilityNode,
  FeatureWeights,
  FusionWeights,
  HypergraphFeatures,
  SHGATConfig,
  ToolGraphFeatures,
  ToolNode,
  TraceFeatures,
  TraceStats,
} from "../types.ts";

export {
  DEFAULT_FEATURE_WEIGHTS,
  DEFAULT_FUSION_WEIGHTS,
  DEFAULT_HYPERGRAPH_FEATURES,
  DEFAULT_SHGAT_CONFIG,
  DEFAULT_TOOL_GRAPH_FEATURES,
  DEFAULT_TRACE_STATS,
  NUM_TRACE_STATS,
} from "../types.ts";
