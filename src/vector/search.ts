/**
 * Vector Search Module
 *
 * Provides semantic search capabilities using BGE-M3 embeddings
 * and pgvector cosine similarity search with graceful degradation to keyword search.
 *
 * @module vector/search
 */

import * as log from "@std/log";
import type { DbClient } from "../db/types.ts";
import type { EmbeddingModelInterface } from "./embeddings.ts";
import type { MCPTool } from "../mcp/types.ts";
import { VectorSearchError } from "../errors/error-types.ts";
import { eventBus } from "../events/mod.ts";
import { uuidv7 } from "../utils/uuid.ts";

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
 * Database row from search query
 */
interface SearchRow {
  tool_id: string;
  server_id: string;
  tool_name: string;
  schema_json: string | MCPTool;
  score?: string | number;
}

/**
 * Validated search parameters
 */
interface SearchParams {
  query: string;
  topK: number;
  minScore: number;
}

/** Default number of results to return */
const DEFAULT_TOP_K = 5;

/** Default minimum similarity score */
const DEFAULT_MIN_SCORE = 0.7;

/** Fixed score for keyword search matches */
const KEYWORD_MATCH_SCORE = 0.5;

/** SQL for vector similarity search */
const VECTOR_SEARCH_SQL = `
  SELECT
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
  LIMIT $3`;

/** SQL for keyword fallback search */
const KEYWORD_SEARCH_SQL = `
  SELECT
    te.tool_id,
    te.server_id,
    te.tool_name,
    json_build_object(
      'name', ts.name,
      'description', ts.description,
      'inputSchema', ts.input_schema
    ) AS schema_json
  FROM tool_embedding te
  JOIN tool_schema ts ON te.tool_id = ts.tool_id
  WHERE te.tool_name ILIKE $1
     OR ts.description ILIKE $1
  LIMIT $2`;

/**
 * Parse a schema JSON field, handling both string and object formats
 */
function parseSchemaJson(value: string | MCPTool): MCPTool {
  if (typeof value === "string") {
    return JSON.parse(value) as MCPTool;
  }
  return value;
}

/**
 * Convert a database row to a SearchResult
 */
function rowToSearchResult(row: SearchRow, defaultScore?: number): SearchResult {
  const score = row.score !== undefined ? parseFloat(String(row.score)) : (defaultScore ?? 0);

  return {
    toolId: row.tool_id,
    serverId: row.server_id,
    toolName: row.tool_name,
    score,
    schema: parseSchemaJson(row.schema_json),
  };
}

/**
 * Validate and normalize search parameters
 */
function validateSearchParams(query: string, topK: number, minScore: number): SearchParams | null {
  if (!query || query.trim().length === 0) {
    log.warn("Empty query provided to searchTools");
    return null;
  }

  let validatedTopK = topK;
  if (topK <= 0) {
    log.warn(`Invalid topK value: ${topK}. Using default: ${DEFAULT_TOP_K}`);
    validatedTopK = DEFAULT_TOP_K;
  }

  let validatedMinScore = minScore;
  if (minScore < 0 || minScore > 1) {
    log.warn(
      `Invalid minScore value: ${minScore}. Must be between 0 and 1. Using default: ${DEFAULT_MIN_SCORE}`,
    );
    validatedMinScore = DEFAULT_MIN_SCORE;
  }

  return {
    query,
    topK: validatedTopK,
    minScore: validatedMinScore,
  };
}

/**
 * Vector Search Engine
 *
 * Performs semantic search over tool embeddings using natural language queries.
 * Uses BGE-M3 for query encoding and pgvector HNSW index for fast
 * cosine similarity search.
 */
export class VectorSearch {
  constructor(
    private db: DbClient,
    private embeddingModel: EmbeddingModelInterface,
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
    topK: number = DEFAULT_TOP_K,
    minScore: number = DEFAULT_MIN_SCORE,
  ): Promise<SearchResult[]> {
    const params = validateSearchParams(query, topK, minScore);
    if (!params) {
      return [];
    }

    const searchId = uuidv7().slice(0, 8);
    this.emitSearchStarted(searchId, params);

    try {
      return await this.performVectorSearch(searchId, params);
    } catch (error) {
      log.warn(`Vector search failed, falling back to keyword search: ${error}`);

      try {
        return await this.keywordSearchFallback(params.query, params.topK);
      } catch (_fallbackError) {
        throw new VectorSearchError(
          `Both vector and keyword search failed: ${error}`,
          params.query,
        );
      }
    }
  }

  /**
   * Perform the vector similarity search
   */
  private async performVectorSearch(
    searchId: string,
    params: SearchParams,
  ): Promise<SearchResult[]> {
    const { query, topK, minScore } = params;

    log.info(`Searching for tools with query: "${query}" (topK=${topK}, minScore=${minScore})`);

    const startEmbedding = performance.now();
    const queryEmbedding = await this.embeddingModel.encode(query);
    const embeddingTime = performance.now() - startEmbedding;
    log.debug(`Query embedding generated in ${embeddingTime.toFixed(2)}ms`);

    this.emitEmbeddingGenerated(searchId, queryEmbedding.length, embeddingTime);

    const startSearch = performance.now();
    const vectorLiteral = `[${queryEmbedding.join(",")}]`;

    const results = await this.db.query(VECTOR_SEARCH_SQL, [vectorLiteral, minScore, topK]);

    const searchTime = performance.now() - startSearch;
    log.info(
      `Found ${results.length} results in ${searchTime.toFixed(2)}ms ` +
        `(embedding: ${embeddingTime.toFixed(2)}ms, search: ${(searchTime - embeddingTime).toFixed(2)}ms)`,
    );

    const searchResults = results.map((row) => rowToSearchResult(row as unknown as SearchRow));

    this.emitSearchCompleted(searchId, searchResults, searchTime);

    return searchResults;
  }

  /**
   * Keyword search fallback when vector search fails
   *
   * Performs simple keyword matching against tool names and descriptions
   * using PostgreSQL's ILIKE (case-insensitive LIKE) operator.
   */
  private async keywordSearchFallback(query: string, topK: number): Promise<SearchResult[]> {
    log.info(`Performing keyword search fallback for: "${query}"`);

    const pattern = `%${query}%`;
    const results = await this.db.query(KEYWORD_SEARCH_SQL, [pattern, topK]);

    log.info(`Keyword search found ${results.length} results`);

    return results.map((row) => rowToSearchResult(row as unknown as SearchRow, KEYWORD_MATCH_SCORE));
  }

  /**
   * Emit search started event
   */
  private emitSearchStarted(searchId: string, params: SearchParams): void {
    eventBus.emit({
      type: "vector.search.started",
      source: "vector-search",
      payload: {
        searchId,
        query: params.query.slice(0, 100),
        topK: params.topK,
        minScore: params.minScore,
      },
    });
  }

  /**
   * Emit embedding generated event
   */
  private emitEmbeddingGenerated(searchId: string, dimensions: number, durationMs: number): void {
    eventBus.emit({
      type: "vector.embedding.generated",
      source: "vector-search",
      payload: {
        searchId,
        dimensions,
        durationMs,
      },
    });
  }

  /**
   * Emit search completed event
   */
  private emitSearchCompleted(
    searchId: string,
    results: SearchResult[],
    durationMs: number,
  ): void {
    eventBus.emit({
      type: "vector.search.completed",
      source: "vector-search",
      payload: {
        searchId,
        resultCount: results.length,
        topScore: results[0]?.score ?? 0,
        durationMs,
      },
    });
  }
}
