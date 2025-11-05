/**
 * Vector Embeddings Module
 *
 * Provides embedding generation and semantic search capabilities
 * using BGE-Large-EN-v1.5 model and PGlite with pgvector.
 *
 * @module vector
 */

export {
  EmbeddingModel,
  generateEmbeddings,
  generateEmbeddingForTool,
  schemaToText,
} from "./embeddings.ts";

export type {
  ToolSchema,
  ToolEmbeddingInput,
  EmbeddingGenerationResult,
  EmbeddingStats,
} from "./embeddings.ts";

export { VectorSearch } from "./search.ts";

export type { SearchResult } from "./search.ts";
