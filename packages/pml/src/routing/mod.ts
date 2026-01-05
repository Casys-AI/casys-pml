/**
 * Routing Module
 *
 * Platform-defined routing for MCP tools.
 * Determines local vs cloud execution based on synced config.
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
  getCloudServers,
  getRoutingVersion,
  initializeRouting,
  isCloudTool,
  isLocalTool,
  isRoutingInitialized,
  resetRouting,
  resolveToolRouting,
} from "./resolver.ts";
