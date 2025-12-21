/**
 * Graph Algorithms Module
 *
 * Exports all graph algorithms for centrality, community detection,
 * path finding, and similarity computation.
 *
 * @module graphrag/algorithms
 */

// PageRank centrality
export {
  computePageRank,
  getPageRankScore,
  getTopPageRankNodes,
  getAveragePageRank,
  type PageRankOptions,
  type PageRankResult,
} from "./pagerank.ts";

// Louvain community detection
export {
  detectCommunities,
  getNodeCommunity,
  findCommunityMembers,
  getCommunityCount,
  getCommunityDistribution,
  areInSameCommunity,
  type LouvainOptions,
  type LouvainResult,
} from "./louvain.ts";

// Path finding (Dijkstra)
export {
  findShortestPath,
  findAllPaths,
  calculatePathWeight,
  calculateAveragePathWeight,
  hasPathWithinHops,
  getPathLength,
} from "./pathfinding.ts";

// Adamic-Adar similarity
export {
  computeAdamicAdar,
  adamicAdarBetween,
  computeGraphRelatedness,
  getNeighbors,
  findSimilarNodes,
  type AdamicAdarResult,
} from "./adamic-adar.ts";

// Edge weights (ADR-041)
export {
  getEdgeWeight,
  determineEdgeSource,
  calculateInitialWeight,
  EDGE_TYPE_WEIGHTS,
  EDGE_SOURCE_MODIFIERS,
  OBSERVED_THRESHOLD,
  type EdgeType,
  type EdgeSource,
} from "./edge-weights.ts";

// DR-DSP (Hypergraph shortest path)
export {
  DRDSP,
  capabilityToHyperedge,
  buildDRDSPFromCapabilities,
  type Hyperedge,
  type HyperpathResult,
  type DynamicUpdate,
} from "./dr-dsp.ts";

// SHGAT (SuperHyperGraph Attention Networks)
export {
  SHGAT,
  createSHGATFromCapabilities,
  trainSHGATOnEpisodes,
  DEFAULT_SHGAT_CONFIG,
  type SHGATConfig,
  type TrainingExample,
  type CapabilityNode,
  type AttentionResult,
} from "./shgat.ts";
