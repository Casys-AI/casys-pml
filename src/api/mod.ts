/**
 * REST API Routes Module
 *
 * HTTP REST endpoints for the PML platform.
 * These routes are served by the MCP HTTP server.
 *
 * @module api
 */

// Route handlers
export { handleGraphRoutes } from "./graph.ts";
export { handleCapabilitiesRoutes } from "./capabilities.ts";
export { handleMetricsRoutes, handlePrometheusMetrics } from "./metrics.ts";
export { handleEmergenceRoutes } from "./emergence.ts";
export { handleToolsRoutes } from "./tools.ts";
export { handleHealthRoutes } from "./health.ts";
export { handleTracesRoutes } from "./traces.ts";
export { handleRoutingRoutes } from "./routing.ts";
export { handleMcpRegistryRoutes } from "./mcp-registry.ts";
export { handleUiResourcesRoutes } from "./ui-resources.ts";
export { handleCatalogRoutes } from "./catalog.ts";

// Algorithm API (core logic, called by Fresh thin wrappers)
export {
  getAlgorithmMetrics,
  getAlphaStats,
  getRecentTraces,
  isValidMode,
  isValidUserAction,
  isValidUUID,
  recordFeedback,
} from "./algorithm.ts";

// Re-export types from centralized types module
export type {
  AlgorithmMode,
  AlgorithmScore,
  AlphaStatsResult,
  FeedbackRequest,
  FeedbackResult,
  InsightItem,
  InsightsResponse,
  MetricsResult,
  RoutingResponse,
  TracesResult,
} from "./types.ts";
