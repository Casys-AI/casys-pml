/**
 * Routing Module
 *
 * Platform-defined routing for MCP tools.
 * Determines client (user's machine) vs server (pml.casys.ai) execution.
 *
 * @module routing
 */

// Cache management
export {
  createCacheEntry,
  DEFAULT_ROUTING_CONFIG,
  getCachePath,
  isCacheStale,
  loadRoutingCache,
  saveRoutingCache,
} from "./cache.ts";

// Cloud sync
export { getRoutingConfig, syncRoutingConfig } from "./sync.ts";
export type { SyncLogger } from "./sync.ts";

// Routing resolver
export {
  extractNamespace,
  getClientTools,
  getRoutingVersion,
  getServerTools,
  initializeRouting,
  isClientTool,
  isRoutingInitialized,
  isServerTool,
  resetRouting,
  resolveToolRouting,
} from "./resolver.ts";
