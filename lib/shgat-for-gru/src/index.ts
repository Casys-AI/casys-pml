/**
 * @casys/shgat-for-gru — SHGAT adapter for GRU
 *
 * Replaces the SHGAT glue code in benchmark-e2e.ts with a reusable module.
 * No TF.js dependency — pure JS + optional BLAS.
 *
 * @example
 * ```typescript
 * import { SHGATAdapter } from "@casys/shgat-for-gru";
 *
 * const adapter = new SHGATAdapter();
 * adapter.loadParams("path/to/shgat-params-ob.json");
 * adapter.buildGraph(nodes);
 *
 * const { l0Embeddings } = adapter.enrichEmbeddings();
 * model.setToolVocabulary(l0Embeddings, toolCapMap, higherLevelNodes);
 *
 * const { topK } = adapter.scoreNodes(intentEmbedding, 5);
 * const firstNode = topK[0].nodeId;
 * ```
 *
 * @module shgat-for-gru
 */

export { SHGATAdapter } from "./adapter.ts";
export { PaperMP } from "./paper-mp.ts";
export type { PaperMPConfig } from "./paper-mp.ts";
export { buildCooccurrenceFromWorkflows, v2vEnrich } from "./v2v.ts";
export type {
  OBTrainedParams,
  HeadParams,
  LevelParams,
  SHGATExportConfig,
  GraphNode,
  GraphStructure,
  EnrichedEmbeddings,
  ScoringResult,
  NodeScore,
  ToolScore,
  CooccurrenceEntry,
  VertexToVertexConfig,
} from "./types.ts";
