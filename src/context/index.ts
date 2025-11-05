/**
 * Context Optimization Module
 *
 * Provides on-demand schema loading and context window optimization
 * for AgentCards MCP tool discovery system.
 *
 * @module context
 */

export { ContextOptimizer } from "./optimizer.ts";
export type { RelevantSchemasResult } from "./optimizer.ts";

export { SchemaCache } from "./cache.ts";

export {
  CONTEXT_WINDOWS,
  TOKENS_PER_SCHEMA,
  calculateP95Latency,
  calculateUsagePercent,
  compareContextUsage,
  displayContextComparison,
  estimateTokens,
  getRecentMetrics,
  logCacheHitRate,
  logContextUsage,
  logQueryLatency,
  measureContextUsage,
} from "./metrics.ts";

export type {
  ContextComparison,
  ContextUsage,
} from "./metrics.ts";
