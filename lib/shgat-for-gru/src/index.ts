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
 * const { toolEmbeddings } = adapter.enrichEmbeddings();
 * model.setToolVocabulary(toolEmbeddings, toolCapMap, higherLevelNodes);
 *
 * const { topK } = adapter.scoreTools(intentEmbedding, 5);
 * const firstTool = topK[0].toolId;
 * ```
 *
 * @module shgat-for-gru
 */

export { SHGATAdapter } from "./adapter.ts";
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
  ToolScore,
  CooccurrenceEntry,
  VertexToVertexConfig,
} from "./types.ts";
