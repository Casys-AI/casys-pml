/**
 * Embedding Generation Module
 *
 * Generates 1024-dimensional embeddings for tool schemas using BGE-M3
 * via @huggingface/transformers. Includes caching and progress tracking.
 *
 * @module vector/embeddings
 */

import { pipeline } from "@huggingface/transformers";
import * as log from "@std/log";
import type { DbClient, Transaction } from "../db/types.ts";
import type { MCPTool } from "../mcp/types.ts";

/**
 * Tool schema from database
 */
export interface ToolSchema {
  tool_id: string;
  server_id: string;
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  cached_at?: Date;
}

/**
 * Input for embedding generation
 */
export interface ToolEmbeddingInput {
  toolId: string;
  text: string;
  serverId: string;
  toolName: string;
}

/**
 * Result of embedding generation
 */
export interface EmbeddingGenerationResult {
  toolId: string;
  embedding: number[];
  generatedAt: Date;
  cachedFromPrevious: boolean;
}

/**
 * Statistics from batch embedding generation
 */
export interface EmbeddingStats {
  totalTools: number;
  newlyGenerated: number;
  cachedCount: number;
  duration: number;
}

/**
 * Interface for embedding models
 * Allows mocking in tests while maintaining type safety
 */
export interface EmbeddingModelInterface {
  load(): Promise<void>;
  encode(text: string): Promise<number[]>;
  isLoaded(): boolean;
  dispose(): Promise<void>;
}

/**
 * Metadata stored with embeddings for cache validation
 */
interface EmbeddingMetadata {
  description?: string;
  schema?: {
    inputSchema?: unknown;
    outputSchema?: unknown;
  };
  generated_at?: string;
}

/**
 * Database row for tool schema query results
 */
interface ToolSchemaRow {
  tool_id: string;
  server_id: string;
  name: string;
  description: string | null;
  input_schema: string | Record<string, unknown>;
  output_schema?: string | Record<string, unknown> | null;
}

/** Batch size for embedding generation transactions */
const EMBEDDING_BATCH_SIZE = 20;

/**
 * BGE-M3 Embedding Model
 *
 * Lazy-loads the model on first use and provides encoding functionality
 * for generating 1024-dimensional embeddings.
 */
export class EmbeddingModel {
  // deno-lint-ignore no-explicit-any
  private model: any = null;
  private loading: Promise<void> | null = null;

  /**
   * Load the BGE-M3 model
   * Downloads model weights (~400MB) on first run from HuggingFace Hub
   */
  async load(): Promise<void> {
    if (this.model) {
      return; // Already loaded
    }

    if (this.loading) {
      return this.loading; // Wait for ongoing load
    }

    this.loading = (async () => {
      try {
        log.info("🔄 Loading BGE-M3 model...");
        log.info("   This may take 60-90 seconds on first run (downloading model)");

        const startTime = performance.now();

        this.model = await pipeline(
          "feature-extraction",
          "Xenova/bge-m3",
        );

        const duration = ((performance.now() - startTime) / 1000).toFixed(1);
        log.info(`✓ Model loaded successfully in ${duration}s`);
      } catch (error) {
        log.error(`✗ Failed to load BGE model: ${error}`);
        throw new Error(`Model loading failed: ${error}`);
      }
    })();

    await this.loading;
    this.loading = null;
  }

  /**
   * Generate 1024-dimensional embedding for text
   *
   * @param text Input text (will be truncated to 512 tokens by BGE)
   * @returns 1024-dimensional normalized embedding vector
   */
  async encode(text: string): Promise<number[]> {
    if (!this.model) {
      await this.load();
    }

    if (!this.model) {
      throw new Error("Model not loaded");
    }

    try {
      const output = await this.model(text, {
        pooling: "mean",
        normalize: true,
      });

      // Convert to array and ensure it's 1024 dimensions
      const embedding = Array.from(output.data as Float32Array);

      if (embedding.length !== 1024) {
        throw new Error(
          `Expected 1024 dimensions, got ${embedding.length}`,
        );
      }

      return embedding;
    } catch (error) {
      log.error(`✗ Encoding failed for text: ${text.substring(0, 100)}...`);
      throw error;
    }
  }

  /**
   * Check if model is loaded and ready
   */
  isLoaded(): boolean {
    return this.model !== null;
  }

  /**
   * Dispose of the model and free resources
   * Call this when the model is no longer needed to prevent resource leaks
   */
  async dispose(): Promise<void> {
    if (!this.model) {
      return;
    }

    try {
      await this.tryDisposeModel();
    } catch (error) {
      log.warn(`Failed to dispose embedding model: ${error}`);
    }

    this.model = null;
    this.loading = null;
  }

  /**
   * Try various cleanup methods that might exist on the model
   */
  private async tryDisposeModel(): Promise<void> {
    const model = this.model;
    const disposeMethod = model.dispose ?? model.destroy ?? model.close;

    if (typeof disposeMethod === "function") {
      await disposeMethod.call(model);
      return;
    }

    // Some pipelines have nested model objects
    if (model.model?.dispose) {
      await model.model.dispose();
      return;
    }

    // ONNX runtime sessions have release() method
    if (model.model?.session?.release) {
      await model.model.session.release();
    }
  }
}

/** Maximum recommended text length before BGE truncation (~512 tokens) */
const MAX_RECOMMENDED_LENGTH = 2000;

/**
 * Convert tool schema to text for embedding generation
 *
 * Concatenates: name + description + parameter names + parameter descriptions
 * This provides semantic context for the embedding model.
 *
 * **Important:** BGE-M3 truncates at 512 tokens (~2000 chars).
 * Excessively long inputs will be silently truncated, potentially affecting embedding quality.
 *
 * @param schema Tool schema (from database or MCP)
 * @returns Concatenated text string
 */
export function schemaToText(schema: ToolSchema | MCPTool): string {
  const parts: string[] = [];

  const name = "name" in schema ? schema.name : undefined;
  if (name) {
    parts.push(name);
  }

  if (schema.description) {
    parts.push(schema.description);
  }

  // Schema parameters deliberately excluded (2026-03-02).
  // Intra-namespace tools (e.g. erpnext_*_list) share identical params (filters, limit, fields)
  // which drowns out the discriminating signal (name + description) in the embedding.
  // Ablation NB28: 21 neighbors >0.90 for erpnext tools → softmax dilution.
  // name + description alone provides better inter-tool discrimination.

  const text = parts.filter(Boolean).join(" | ");

  if (text.length > MAX_RECOMMENDED_LENGTH) {
    const toolName = name ?? "unknown";
    log.warn(
      `Schema text for tool "${toolName}" exceeds recommended length ` +
        `(${text.length} chars > ${MAX_RECOMMENDED_LENGTH} chars). ` +
        `BGE model will truncate to ~512 tokens, which may affect embedding quality.`,
    );
  }

  return text;
}

/**
 * Extract parameter names and descriptions from schema
 */
function extractParameterDescriptions(schema: ToolSchema | MCPTool): string[] {
  const inputSchema = "inputSchema" in schema ? schema.inputSchema : schema.input_schema;
  if (!inputSchema || typeof inputSchema !== "object") {
    return [];
  }

  const properties = (inputSchema as Record<string, unknown>).properties as
    | Record<string, unknown>
    | undefined;
  if (!properties) {
    return [];
  }

  const parts: string[] = [];
  for (const [paramName, paramDef] of Object.entries(properties)) {
    if (typeof paramDef === "object" && paramDef !== null) {
      const description = (paramDef as Record<string, unknown>).description as string || "";
      parts.push(`${paramName}: ${description}`);
    }
  }

  return parts;
}

/**
 * Simple progress tracker for console output
 */
class ProgressTracker {
  private current = 0;
  private total: number;
  private lastPercent = -1;
  private startTime = performance.now();

  constructor(total: number) {
    this.total = total;
  }

  increment(): void {
    this.current++;
    const percent = Math.floor((this.current / this.total) * 100);

    // Only update display every 5% or at completion
    if (percent !== this.lastPercent && (percent % 5 === 0 || this.current === this.total)) {
      const elapsed = ((performance.now() - this.startTime) / 1000).toFixed(1);
      const bar = "█".repeat(Math.floor(percent / 5)) + "░".repeat(20 - Math.floor(percent / 5));

      console.log(
        `  [${bar}] ${percent}% (${this.current}/${this.total}) - ${elapsed}s elapsed`,
      );

      this.lastPercent = percent;
    }
  }

  finish(): number {
    return (performance.now() - this.startTime) / 1000;
  }
}

/**
 * Parse a JSON schema field, handling both string and object formats
 */
function parseJsonField<T>(value: string | T | null | undefined): T | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return JSON.parse(value) as T;
  return value;
}

/**
 * Convert a database row to a ToolSchema object
 */
function rowToToolSchema(row: ToolSchemaRow): ToolSchema {
  return {
    tool_id: row.tool_id,
    server_id: row.server_id,
    name: row.name,
    description: row.description || "",
    input_schema: parseJsonField<Record<string, unknown>>(row.input_schema) ?? {},
    output_schema: parseJsonField<Record<string, unknown>>(row.output_schema),
  };
}

/**
 * Check if an existing embedding is still valid (schema unchanged)
 */
function isEmbeddingCacheValid(
  schema: ToolSchema,
  existingMeta: EmbeddingMetadata | null,
): boolean {
  if (!existingMeta) return false;

  const descriptionMatches = schema.description === (existingMeta.description || "");
  const schemaMatches =
    JSON.stringify(schema.input_schema) ===
    JSON.stringify(existingMeta.schema?.inputSchema || {});

  return descriptionMatches && schemaMatches;
}

/**
 * Split an array into batches of a specified size
 */
function splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

/** SQL for fetching tool schemas */
const FETCH_SCHEMAS_SQL = `
  SELECT tool_id, server_id, name, description, input_schema, output_schema, cached_at
  FROM tool_schema
  ORDER BY server_id, name`;

/** SQL for checking existing embedding */
const CHECK_EMBEDDING_SQL = "SELECT tool_id, metadata FROM tool_embedding WHERE tool_id = $1";

/** SQL for upserting embedding */
const UPSERT_EMBEDDING_SQL = `
  INSERT INTO tool_embedding (tool_id, server_id, tool_name, embedding, metadata, created_at)
  VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
  ON CONFLICT (tool_id) DO UPDATE
  SET embedding = EXCLUDED.embedding,
      metadata = EXCLUDED.metadata,
      created_at = NOW()`;

/** SQL for tracking embedding metric */
const TRACK_METRIC_SQL = `
  INSERT INTO metrics (metric_name, value, metadata, timestamp)
  VALUES ('tool_embedded', 1, $1::jsonb, NOW())`;

/**
 * Generate embeddings for all tool schemas in the database
 *
 * Features:
 * - Lazy model loading
 * - Caching (skips if embedding exists)
 * - Progress bar during generation
 * - Batch transaction for performance
 *
 * @param db PGlite database client
 * @param model Embedding model (will be loaded if needed)
 * @returns Statistics about generation
 */
export async function generateEmbeddings(
  db: DbClient,
  model: EmbeddingModelInterface,
): Promise<EmbeddingStats> {
  log.info("Starting embedding generation...");

  const startTime = performance.now();
  const stats = { newlyGenerated: 0, cachedCount: 0, totalTools: 0 };

  try {
    await model.load();

    const schemasResult = await db.query(FETCH_SCHEMAS_SQL);
    if (schemasResult.length === 0) {
      log.warn("No tool schemas found in database");
      return { ...stats, duration: 0 };
    }

    stats.totalTools = schemasResult.length;
    log.info(`Found ${stats.totalTools} tool schemas to process`);

    const progress = new ProgressTracker(stats.totalTools);
    const batches = splitIntoBatches(schemasResult, EMBEDDING_BATCH_SIZE);
    log.info(`Processing ${batches.length} batches of up to ${EMBEDDING_BATCH_SIZE} tools each`);

    for (const batch of batches) {
      await processBatch(db, model, batch as unknown as ToolSchemaRow[], stats, progress);
    }

    const duration = progress.finish();
    logCompletionStats(stats, duration);

    return { ...stats, duration };
  } catch (error) {
    const duration = (performance.now() - startTime) / 1000;
    log.error(`Embedding generation failed after ${duration.toFixed(1)}s: ${error}`);
    log.error(`  - Partial results: ${stats.newlyGenerated} generated, ${stats.cachedCount} cached`);
    return { ...stats, duration };
  }
}

/**
 * Process a batch of tool schemas in a single transaction
 */
async function processBatch(
  db: DbClient,
  model: EmbeddingModelInterface,
  batch: ToolSchemaRow[],
  stats: { newlyGenerated: number; cachedCount: number },
  progress: ProgressTracker,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      for (const row of batch) {
        await processToolSchema(tx, model, row, stats, progress);
      }
    });
  } catch (error) {
    log.error(`Failed to process batch: ${error}`);
  }
}

/**
 * Process a single tool schema: check cache, generate embedding, store
 */
async function processToolSchema(
  tx: Transaction,
  model: EmbeddingModelInterface,
  row: ToolSchemaRow,
  stats: { newlyGenerated: number; cachedCount: number },
  progress: ProgressTracker,
): Promise<void> {
  try {
    const schema = rowToToolSchema(row);

    const existing = await tx.query(CHECK_EMBEDDING_SQL, [schema.tool_id]);
    if (existing.length > 0) {
      const existingMeta = existing[0].metadata as EmbeddingMetadata | null;
      if (isEmbeddingCacheValid(schema, existingMeta)) {
        stats.cachedCount++;
        progress.increment();
        return;
      }
      log.debug(`Tool ${schema.tool_id} changed, regenerating embedding`);
    }

    const text = schemaToText(schema);
    const embedding = await model.encode(text);

    const metadata: EmbeddingMetadata = {
      description: schema.description,
      schema: {
        inputSchema: schema.input_schema,
        outputSchema: schema.output_schema,
      },
      generated_at: new Date().toISOString(),
    };

    await tx.query(UPSERT_EMBEDDING_SQL, [
      schema.tool_id,
      schema.server_id,
      schema.name,
      `[${embedding.join(",")}]`,
      metadata,
    ]);

    await tx.query(TRACK_METRIC_SQL, [{ tool_id: schema.tool_id }]);

    stats.newlyGenerated++;
    progress.increment();
  } catch (error) {
    log.error(`Failed to process tool ${row.tool_id}: ${error}`);
    progress.increment();
  }
}

/**
 * Log completion statistics
 */
function logCompletionStats(
  stats: { totalTools: number; newlyGenerated: number; cachedCount: number },
  duration: number,
): void {
  log.info(`Embedding generation complete in ${duration.toFixed(1)}s`);
  log.info(`  - New embeddings: ${stats.newlyGenerated}`);
  log.info(`  - Cached: ${stats.cachedCount}`);
  log.info(`  - Total: ${stats.totalTools}`);
}

/** SQL for fetching a single tool schema */
const FETCH_SINGLE_SCHEMA_SQL =
  "SELECT tool_id, server_id, name, description, input_schema FROM tool_schema WHERE tool_id = $1";

/**
 * Generate embedding for a single tool (useful for incremental updates)
 *
 * @param db Database client
 * @param model Embedding model
 * @param toolId Tool ID to generate embedding for
 * @returns Generation result
 */
export async function generateEmbeddingForTool(
  db: DbClient,
  model: EmbeddingModel,
  toolId: string,
): Promise<EmbeddingGenerationResult> {
  await model.load();

  const row = await db.queryOne(FETCH_SINGLE_SCHEMA_SQL, [toolId]);
  if (!row) {
    throw new Error(`Tool schema not found: ${toolId}`);
  }

  const schema = rowToToolSchema(row as unknown as ToolSchemaRow);
  const text = schemaToText(schema);
  const embedding = await model.encode(text);

  await db.query(UPSERT_EMBEDDING_SQL, [
    schema.tool_id,
    schema.server_id,
    schema.name,
    `[${embedding.join(",")}]`,
    {
      schema_hash: text.substring(0, 100),
      generated_at: new Date().toISOString(),
    },
  ]);

  return {
    toolId: schema.tool_id,
    embedding,
    generatedAt: new Date(),
    cachedFromPrevious: false,
  };
}
