/**
 * Context Usage Metrics Module
 *
 * Provides utilities for measuring and comparing context window usage,
 * token estimation, and performance tracking.
 *
 * @module context/metrics
 */

import * as log from "@std/log";
import type { DbClient } from "../db/types.ts";
import type { MCPTool } from "../mcp/types.ts";

/**
 * Metric entry from database
 */
export interface MetricEntry {
  value: number;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

/**
 * Claude model context window sizes (in tokens)
 * Need to change to 4.5
 */
export const CONTEXT_WINDOWS = {
  "claude-3-opus": 200_000,
  "claude-3-sonnet": 200_000,
  "claude-3-haiku": 200_000,
  "claude-3.5-sonnet": 200_000,
  "default": 200_000,
} as const;

/**
 * Estimated tokens per tool schema
 * Based on typical MCP tool definitions (name + description + parameters)
 */
export const TOKENS_PER_SCHEMA = 500;

/**
 * Context usage measurement result
 */
export interface ContextUsage {
  schemaCount: number;
  estimatedTokens: number;
  contextWindowSize: number;
  usagePercent: number;
}

/**
 * Before/After comparison for context optimization
 */
export interface ContextComparison {
  before: ContextUsage;
  after: ContextUsage;
  savingsPercent: number;
  savingsTokens: number;
}

/**
 * Estimate token count for tool schemas
 *
 * Uses a rough heuristic of ~500 tokens per schema.
 * More accurate estimation would require actual tokenization with tiktoken,
 * but this provides sufficient accuracy for context planning.
 *
 * @param schemas Array of tool schemas
 * @returns Estimated token count
 */
export function estimateTokens(schemas: MCPTool[]): number {
  return schemas.length * TOKENS_PER_SCHEMA;
}

/**
 * Calculate context window usage percentage
 *
 * @param schemas Array of tool schemas
 * @param contextWindow Total context window size in tokens (default: Claude's 200k)
 * @returns Usage as percentage (0-100)
 */
export function calculateUsagePercent(
  schemas: MCPTool[],
  contextWindow: number = CONTEXT_WINDOWS.default,
): number {
  const tokens = estimateTokens(schemas);
  return (tokens / contextWindow) * 100;
}

/**
 * Measure context usage for a set of schemas
 *
 * @param schemas Array of tool schemas
 * @param contextWindow Context window size (default: 200k)
 * @returns Context usage metrics
 */
export function measureContextUsage(
  schemas: MCPTool[],
  contextWindow: number = CONTEXT_WINDOWS.default,
): ContextUsage {
  const estimatedTokens = estimateTokens(schemas);
  const usagePercent = (estimatedTokens / contextWindow) * 100;

  return {
    schemaCount: schemas.length,
    estimatedTokens,
    contextWindowSize: contextWindow,
    usagePercent,
  };
}

/**
 * Compare context usage before and after optimization
 *
 * @param allSchemas All available schemas (before optimization)
 * @param relevantSchemas Filtered schemas (after optimization)
 * @param contextWindow Context window size (default: 200k)
 * @returns Comparison metrics
 */
export function compareContextUsage(
  allSchemas: MCPTool[],
  relevantSchemas: MCPTool[],
  contextWindow: number = CONTEXT_WINDOWS.default,
): ContextComparison {
  const before = measureContextUsage(allSchemas, contextWindow);
  const after = measureContextUsage(relevantSchemas, contextWindow);

  const savingsTokens = before.estimatedTokens - after.estimatedTokens;
  const savingsPercent = before.usagePercent - after.usagePercent;

  return {
    before,
    after,
    savingsPercent,
    savingsTokens,
  };
}

/**
 * Display context usage comparison in console
 *
 * Shows before/after metrics in a formatted table
 *
 * @param comparison Comparison metrics
 */
export function displayContextComparison(comparison: ContextComparison): void {
  const { before, after, savingsPercent, savingsTokens } = comparison;

  console.log(`
📊 Context Usage Comparison:
   ┌──────────┬─────────────┬────────────┬──────────┐
   │ Phase    │ Tool Count  │ Tokens     │ Usage    │
   ├──────────┼─────────────┼────────────┼──────────┤
   │ BEFORE   │ ${String(before.schemaCount).padEnd(11)}│ ${
    String(before.estimatedTokens).padEnd(10)
  }│ ${before.usagePercent.toFixed(2).padEnd(8)}%│
   │ AFTER    │ ${String(after.schemaCount).padEnd(11)}│ ${
    String(after.estimatedTokens).padEnd(10)
  }│ ${after.usagePercent.toFixed(2).padEnd(8)}%│
   ├──────────┼─────────────┼────────────┼──────────┤
   │ SAVINGS  │ ${String(before.schemaCount - after.schemaCount).padEnd(11)}│ ${
    String(savingsTokens).padEnd(10)
  }│ ${savingsPercent.toFixed(2).padEnd(8)}%│
   └──────────┴─────────────┴────────────┴──────────┘
  `);

  // Log interpretation
  if (after.usagePercent < 5) {
    log.info("✓ Context usage target achieved (<5%)");
  } else {
    log.warn(`⚠ Context usage above target: ${after.usagePercent.toFixed(2)}% (target: <5%)`);
  }
}

/**
 * Log context usage metric to database
 *
 * Stores metric for historical tracking and analysis
 *
 * @param db Database client
 * @param usage Context usage metrics
 * @param metadata Optional additional context
 */
export async function logContextUsage(
  db: DbClient,
  usage: ContextUsage,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO metrics (metric_name, value, metadata, timestamp)
       VALUES ($1, $2, $3::jsonb, NOW())`,
      [
        "context_usage_pct",
        usage.usagePercent,
        { // postgres.js/pglite auto-serializes to JSONB
          schema_count: usage.schemaCount,
          estimated_tokens: usage.estimatedTokens,
          context_window: usage.contextWindowSize,
          ...metadata,
        },
      ],
    );

    log.debug(`Logged context usage: ${usage.usagePercent.toFixed(2)}%`);
  } catch (error) {
    log.error(`Failed to log context usage metric: ${error}`);
    // Don't throw - metric logging failure shouldn't break the workflow
  }
}

/**
 * Log query latency metric to database
 *
 * @param db Database client
 * @param latencyMs Latency in milliseconds
 * @param metadata Optional additional context (e.g., query text, tool count)
 */
export async function logQueryLatency(
  db: DbClient,
  latencyMs: number,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO metrics (metric_name, value, metadata, timestamp)
       VALUES ($1, $2, $3::jsonb, NOW())`,
      ["query_latency_ms", latencyMs, metadata || {}], // postgres.js/pglite auto-serializes to JSONB
    );

    log.debug(`Logged query latency: ${latencyMs.toFixed(2)}ms`);
  } catch (error) {
    log.error(`Failed to log query latency metric: ${error}`);
  }
}

/**
 * Log cache hit rate metric to database
 *
 * @param db Database client
 * @param hitRate Hit rate as decimal (0.0 to 1.0)
 * @param metadata Optional additional context
 */
export async function logCacheHitRate(
  db: DbClient,
  hitRate: number,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO metrics (metric_name, value, metadata, timestamp)
       VALUES ($1, $2, $3::jsonb, NOW())`,
      ["cache_hit_rate", hitRate * 100, metadata || {}], // postgres.js/pglite auto-serializes to JSONB
    );

    log.debug(`Logged cache hit rate: ${(hitRate * 100).toFixed(2)}%`);
  } catch (error) {
    log.error(`Failed to log cache hit rate metric: ${error}`);
  }
}

/**
 * Parse metadata from database row (handles both string and object formats)
 */
function parseMetadata(metadata: unknown): Record<string, unknown> {
  if (typeof metadata === "string") {
    return JSON.parse(metadata || "{}");
  }
  return (metadata as Record<string, unknown>) || {};
}

/**
 * Get recent metrics from database
 *
 * @param db Database client
 * @param metricName Metric name to retrieve
 * @param limit Number of recent entries (default: 100)
 */
export async function getRecentMetrics(
  db: DbClient,
  metricName: string,
  limit: number = 100,
): Promise<MetricEntry[]> {
  try {
    const rows = await db.query(
      `SELECT value, timestamp, metadata
       FROM metrics
       WHERE metric_name = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [metricName, limit],
    );

    return rows.map((row) => ({
      value: parseFloat(row.value as string),
      timestamp: new Date(row.timestamp as string),
      metadata: parseMetadata(row.metadata),
    }));
  } catch (error) {
    log.error(`Failed to retrieve metrics: ${error}`);
    return [];
  }
}

/**
 * Calculate P95 (95th percentile) latency from recent measurements
 *
 * @param db Database client
 * @param limit Number of recent measurements to analyze (default: 100)
 * @returns P95 latency in milliseconds, or null if insufficient data
 */
export async function calculateP95Latency(
  db: DbClient,
  limit: number = 100,
): Promise<number | null> {
  try {
    const metrics = await getRecentMetrics(db, "query_latency_ms", limit);

    if (metrics.length === 0) {
      log.warn("No latency metrics found for P95 calculation");
      return null;
    }

    // Sort ascending
    const values = metrics.map((m) => m.value).sort((a, b) => a - b);

    // Calculate P95 index
    const p95Index = Math.ceil(values.length * 0.95) - 1;
    const p95Value = values[p95Index];

    log.info(`P95 latency: ${p95Value.toFixed(2)}ms (from ${values.length} samples)`);

    return p95Value;
  } catch (error) {
    log.error(`Failed to calculate P95 latency: ${error}`);
    return null;
  }
}
