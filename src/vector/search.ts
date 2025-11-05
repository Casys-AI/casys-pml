/**
 * Vector Search Module
 *
 * Provides semantic search capabilities using BGE-Large-EN-v1.5 embeddings
 * and pgvector cosine similarity search.
 *
 * @module vector/search
 */

import * as log from "@std/log";
import type { PGliteClient } from "../db/client.ts";
import type { EmbeddingModel } from "./embeddings.ts";
import type { MCPTool } from "../mcp/types.ts";

/**
 * Search result from semantic vector search
 */
export interface SearchResult {
  toolId: string;
  serverId: string;
  toolName: string;
  score: number;
  schema: MCPTool;
}

/**
 * Vector Search Engine
 *
 * Performs semantic search over tool embeddings using natural language queries.
 * Uses BGE-Large-EN-v1.5 for query encoding and pgvector HNSW index for fast
 * cosine similarity search.
 */
export class VectorSearch {
  constructor(
    private db: PGliteClient,
    private embeddingModel: EmbeddingModel,
  ) {}

  /**
   * Search for tools using natural language query
   *
   * @param query - Natural language search query
   * @param topK - Number of top results to return (default: 5)
   * @param minScore - Minimum similarity score threshold (default: 0.7)
   * @returns Array of search results sorted by relevance (descending)
   *
   * @example
   * ```typescript
   * const results = await vectorSearch.searchTools("read a file", 5, 0.7);
   * // Returns top 5 file-related tools with similarity >= 0.7
   * ```
   */
  async searchTools(
    query: string,
    topK: number = 5,
    minScore: number = 0.7,
  ): Promise<SearchResult[]> {
    // Validate inputs
    if (!query || query.trim().length === 0) {
      log.warn("Empty query provided to searchTools");
      return [];
    }

    if (topK <= 0) {
      log.warn(`Invalid topK value: ${topK}. Using default: 5`);
      topK = 5;
    }

    if (minScore < 0 || minScore > 1) {
      log.warn(
        `Invalid minScore value: ${minScore}. Must be between 0 and 1. Using default: 0.7`,
      );
      minScore = 0.7;
    }

    try {
      log.info(`Searching for tools with query: "${query}" (topK=${topK}, minScore=${minScore})`);

      // AC1: Generate query embedding using BGE-Large-EN-v1.5
      const startEmbedding = performance.now();
      const queryEmbedding = await this.embeddingModel.encode(query);
      const embeddingTime = performance.now() - startEmbedding;
      log.debug(`Query embedding generated in ${embeddingTime.toFixed(2)}ms`);

      // AC2: Perform cosine similarity search with pgvector
      // AC4: Results sorted by relevance score (ORDER BY distance ASC = highest similarity first)
      // AC5: Configurable similarity threshold (WHERE clause)
      const startSearch = performance.now();

      // Format embedding as PostgreSQL vector literal
      const vectorLiteral = `[${queryEmbedding.join(",")}]`;

      // SQL Query using pgvector cosine distance operator (<=>)
      // Note: <=> returns distance (0 = identical, 2 = opposite)
      // We convert to similarity score: 1 - distance (1 = perfect match, 0 = no match)
      const results = await this.db.query(
        `SELECT
          te.tool_id,
          te.server_id,
          te.tool_name,
          json_build_object(
            'name', ts.name,
            'description', ts.description,
            'inputSchema', ts.input_schema
          ) AS schema_json,
          1 - (te.embedding <=> $1::vector) AS score
        FROM tool_embedding te
        JOIN tool_schema ts ON te.tool_id = ts.tool_id
        WHERE 1 - (te.embedding <=> $1::vector) >= $2
        ORDER BY te.embedding <=> $1::vector
        LIMIT $3`,
        [vectorLiteral, minScore, topK],
      );

      const searchTime = performance.now() - startSearch;
      log.info(
        `Found ${results.length} results in ${searchTime.toFixed(2)}ms (embedding: ${embeddingTime.toFixed(2)}ms, search: ${(searchTime - embeddingTime).toFixed(2)}ms)`,
      );

      // AC3: Parse and return results with tool_ids + scores
      const searchResults: SearchResult[] = results.map((row) => ({
        toolId: row.tool_id as string,
        serverId: row.server_id as string,
        toolName: row.tool_name as string,
        score: parseFloat(row.score as string),
        schema: (typeof row.schema_json === 'string'
          ? JSON.parse(row.schema_json)
          : row.schema_json) as MCPTool,
      }));

      return searchResults;
    } catch (error) {
      log.error(`Vector search failed for query "${query}": ${error}`);
      throw new Error(`Vector search failed: ${error}`);
    }
  }
}
