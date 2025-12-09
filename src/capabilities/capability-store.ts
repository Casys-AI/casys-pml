/**
 * Capability Store (Epic 7 - Story 7.2a)
 *
 * Persists learned capabilities with eager learning strategy:
 * - Store on 1st successful execution (no waiting for patterns)
 * - ON CONFLICT: update usage_count++, recalculate success_rate
 * - Storage is cheap (~2KB/capability), filter at suggestion time
 *
 * @module capabilities/capability-store
 */

import type { PGliteClient } from "../db/client.ts";
import type { EmbeddingModel } from "../vector/embeddings.ts";
import type { Row } from "../db/client.ts";
import type { CacheConfig, Capability, SaveCapabilityInput } from "./types.ts";
import { hashCode } from "./hash.ts";
import { getLogger } from "../telemetry/logger.ts";
import type { SchemaInferrer } from "./schema-inferrer.ts";
// Story 6.5: EventBus integration (ADR-036)
import { eventBus } from "../events/mod.ts";

const logger = getLogger("default");

/**
 * Default cache configuration for new capabilities
 */
const DEFAULT_CACHE_CONFIG: CacheConfig = {
  ttl_ms: 3600000, // 1 hour
  cacheable: true,
};

/**
 * CapabilityStore - Persistence layer for learned capabilities
 *
 * Implements eager learning: capabilities are stored on first successful
 * execution rather than waiting for repeated patterns.
 *
 * @example
 * ```typescript
 * const store = new CapabilityStore(db, embeddingModel);
 *
 * // Save after successful execution
 * const capability = await store.saveCapability({
 *   code: "const result = await tools.search({query: 'test'});",
 *   intent: "Search for test data",
 *   durationMs: 150,
 * });
 *
 * // Second execution updates stats
 * await store.updateUsage(capability.codeHash, true, 120);
 * ```
 */
export class CapabilityStore {
  constructor(
    private db: PGliteClient,
    private embeddingModel: EmbeddingModel,
    private schemaInferrer?: SchemaInferrer,
  ) {
    logger.debug("CapabilityStore initialized", {
      schemaInferrerEnabled: !!schemaInferrer,
    });
  }

  /**
   * Save a capability after execution (eager learning)
   *
   * Uses UPSERT: INSERT ... ON CONFLICT to handle deduplication.
   * - First execution: creates capability with usage_count=1, success_rate=1.0
   * - Subsequent: increments usage_count, updates success_rate average
   *
   * @param input Capability data from execution
   * @returns The saved/updated capability
   */
  async saveCapability(input: SaveCapabilityInput): Promise<Capability> {
    const { code, intent, durationMs, success = true, name, description, toolsUsed } = input;

    // Generate code hash for deduplication
    const codeHash = await hashCode(code);

    // Generate intent embedding for semantic search
    let embedding: number[];
    try {
      embedding = await this.embeddingModel.encode(intent);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("Failed to generate embedding for capability", {
        intent: intent.substring(0, 50),
        error: errorMsg,
      });
      throw new Error(`Embedding generation failed: ${errorMsg}`);
    }
    const embeddingStr = `[${embedding.join(",")}]`;

    // Infer parameters schema from code (Story 7.2b)
    let parametersSchema: Capability["parametersSchema"] | undefined;
    if (this.schemaInferrer) {
      try {
        parametersSchema = await this.schemaInferrer.inferSchema(code);
        logger.debug("Schema inferred for capability", {
          codeHash,
          properties: Object.keys(parametersSchema.properties || {}),
        });
      } catch (error) {
        logger.warn("Schema inference failed, continuing without schema", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Build dag_structure with tools used (for graph analysis)
    const dagStructure = {
      type: "code_execution",
      tools_used: toolsUsed || [],
      intent_text: intent,
    };

    // Generate pattern_hash (required by existing schema, distinct from code_hash)
    // Use code_hash as pattern_hash to ensure uniqueness per code snippet
    const patternHash = codeHash;

    logger.debug("Saving capability", {
      codeHash,
      intent: intent.substring(0, 50),
      durationMs,
      success,
    });

    // UPSERT: Insert or update on conflict
    const result = await this.db.query(
      `INSERT INTO workflow_pattern (
        pattern_hash,
        dag_structure,
        intent_embedding,
        usage_count,
        success_count,
        last_used,
        code_snippet,
        code_hash,
        cache_config,
        name,
        description,
        success_rate,
        avg_duration_ms,
        parameters_schema,
        created_at,
        source
      ) VALUES (
        $1, $2, $3, 1, $4, NOW(), $5, $6, $7, $8, $9, $10, $11, $12, NOW(), 'emergent'
      )
      ON CONFLICT (code_hash) WHERE code_hash IS NOT NULL DO UPDATE SET
        usage_count = workflow_pattern.usage_count + 1,
        success_count = workflow_pattern.success_count + CASE WHEN $4 = 1 THEN 1 ELSE 0 END,
        last_used = NOW(),
        success_rate = (workflow_pattern.success_count + CASE WHEN $4 = 1 THEN 1 ELSE 0 END)::real
          / (workflow_pattern.usage_count + 1)::real,
        avg_duration_ms = (
          (workflow_pattern.avg_duration_ms * workflow_pattern.usage_count) + $11
        ) / (workflow_pattern.usage_count + 1),
        parameters_schema = $12
      RETURNING *`,
      [
        patternHash,
        JSON.stringify(dagStructure),
        embeddingStr,
        success ? 1 : 0,
        code,
        codeHash,
        JSON.stringify(DEFAULT_CACHE_CONFIG),
        name || this.generateName(intent),
        description || intent,
        success ? 1.0 : 0.0,
        durationMs,
        parametersSchema ? JSON.stringify(parametersSchema) : null,
      ],
    );

    if (result.length === 0) {
      throw new Error("Failed to save capability - no result returned");
    }

    const row = result[0];
    const capability = this.rowToCapability(row as Row);

    logger.info("Capability saved", {
      id: capability.id,
      codeHash: capability.codeHash,
      usageCount: capability.usageCount,
      successRate: capability.successRate,
    });

    // Story 6.5: Emit capability.learned event (ADR-036)
    eventBus.emit({
      type: "capability.learned",
      source: "capability-store",
      payload: {
        capability_id: capability.id,
        name: capability.name ?? this.generateName(intent),
        intent: intent.substring(0, 100), // Truncate for event payload
        tools_used: toolsUsed ?? [],
        is_new: capability.usageCount === 1,
        usage_count: capability.usageCount,
        success_rate: capability.successRate,
      },
    });

    return capability;
  }

  /**
   * Find a capability by its code hash
   *
   * @param codeHash SHA-256 hash of normalized code
   * @returns Capability if found, null otherwise
   */
  async findByCodeHash(codeHash: string): Promise<Capability | null> {
    const result = await this.db.query(
      `SELECT * FROM workflow_pattern WHERE code_hash = $1`,
      [codeHash],
    );

    if (result.length === 0) {
      return null;
    }

    return this.rowToCapability(result[0] as Row);
  }

  /**
   * Update usage statistics after execution
   *
   * Called when a capability is reused (matched and executed again).
   * Updates: usage_count++, success_rate, avg_duration_ms
   *
   * @param codeHash SHA-256 hash of the executed code
   * @param success Whether execution succeeded
   * @param durationMs Execution time in milliseconds
   */
  async updateUsage(
    codeHash: string,
    success: boolean,
    durationMs: number,
  ): Promise<void> {
    // Use parameterized query to prevent SQL injection
    await this.db.query(
      `UPDATE workflow_pattern SET
        usage_count = usage_count + 1,
        success_count = success_count + $1,
        last_used = NOW(),
        success_rate = (success_count + $1)::real / (usage_count + 1)::real,
        avg_duration_ms = ((avg_duration_ms * usage_count) + $2) / (usage_count + 1)
      WHERE code_hash = $3`,
      [success ? 1 : 0, durationMs, codeHash],
    );

    logger.debug("Capability usage updated", { codeHash, success, durationMs });
  }

  /**
   * Search capabilities by semantic similarity to intent
   *
   * Uses HNSW index on intent_embedding for fast vector search.
   *
   * @param intent Natural language query
   * @param limit Maximum results (default: 5)
   * @param minSemanticScore Minimum semantic score threshold (default: 0.5)
   * @returns Capabilities sorted by semanticScore (harmonized with HybridSearchResult)
   */
  async searchByIntent(
    intent: string,
    limit = 5,
    minSemanticScore = 0.5,
  ): Promise<Array<{ capability: Capability; semanticScore: number }>> {
    const embedding = await this.embeddingModel.encode(intent);
    const embeddingStr = `[${embedding.join(",")}]`;

    const result = await this.db.query(
      `SELECT *,
        1 - (intent_embedding <=> $1::vector) as semantic_score
      FROM workflow_pattern
      WHERE code_hash IS NOT NULL
        AND 1 - (intent_embedding <=> $1::vector) >= $2
      ORDER BY intent_embedding <=> $1::vector
      LIMIT $3`,
      [embeddingStr, minSemanticScore, limit],
    );

    const matches = result.map((row) => ({
      capability: this.rowToCapability(row as Row),
      semanticScore: row.semantic_score as number,
    }));

    return matches;
  }

  /**
   * Get total count of stored capabilities
   */
  async getCapabilityCount(): Promise<number> {
    const result = await this.db.queryOne(
      `SELECT COUNT(*) as count FROM workflow_pattern WHERE code_hash IS NOT NULL`,
    );
    return Number(result?.count ?? 0);
  }

  /**
   * Get capabilities statistics
   */
  async getStats(): Promise<{
    totalCapabilities: number;
    totalExecutions: number;
    avgSuccessRate: number;
    avgDurationMs: number;
  }> {
    const result = await this.db.queryOne(
      `SELECT
        COUNT(*) as total,
        COALESCE(SUM(usage_count), 0) as executions,
        COALESCE(AVG(success_rate), 0) as avg_success,
        COALESCE(AVG(avg_duration_ms), 0) as avg_duration
      FROM workflow_pattern
      WHERE code_hash IS NOT NULL`,
    );

    return {
      totalCapabilities: Number(result?.total ?? 0),
      totalExecutions: Number(result?.executions ?? 0),
      avgSuccessRate: Number(result?.avg_success ?? 0),
      avgDurationMs: Number(result?.avg_duration ?? 0),
    };
  }

  /**
   * Convert database row to Capability object
   */
  private rowToCapability(row: Row): Capability {
    // Parse embedding string to Float32Array
    const embeddingStr = row.intent_embedding as string;
    const embeddingArr = embeddingStr
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map(Number);
    const intentEmbedding = new Float32Array(embeddingArr);

    // Parse cache_config - may be object or string
    let cacheConfig: CacheConfig = DEFAULT_CACHE_CONFIG;
    if (row.cache_config) {
      cacheConfig = typeof row.cache_config === "string"
        ? JSON.parse(row.cache_config)
        : row.cache_config as CacheConfig;
    }

    // Parse parameters_schema - may be object or string
    let parametersSchema: Capability["parametersSchema"] = undefined;
    if (row.parameters_schema) {
      const schema = typeof row.parameters_schema === "string"
        ? JSON.parse(row.parameters_schema)
        : row.parameters_schema;
      if (schema && typeof schema.type === "string") {
        parametersSchema = schema as Capability["parametersSchema"];
      }
    }

    return {
      id: row.pattern_id as string,
      codeSnippet: (row.code_snippet as string) || "",
      codeHash: (row.code_hash as string) || "",
      intentEmbedding,
      parametersSchema,
      cacheConfig,
      name: (row.name as string) || undefined,
      description: (row.description as string) || undefined,
      usageCount: row.usage_count as number,
      successCount: row.success_count as number,
      successRate: (row.success_rate as number) ?? 1.0,
      avgDurationMs: (row.avg_duration_ms as number) ?? 0,
      createdAt: new Date((row.created_at as string) || Date.now()),
      lastUsed: new Date(row.last_used as string),
      source: ((row.source as string) as "emergent" | "manual") || "emergent",
    };
  }

  /**
   * Generate a short name from intent
   */
  private generateName(intent: string): string {
    // Take first 3-5 words, capitalize first letter
    const words = intent.split(/\s+/).slice(0, 5);
    const name = words.join(" ");
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
}
