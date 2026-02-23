/**
 * MCP Discovery Module
 *
 * Provides tool discovery from user-configured MCP servers.
 *
 * @module discovery
 */

export {
  discoverAllMcpTools,
  discoverAllMcpToolsWithTimeout,
  discoverMcpTools,
  summarizeDiscovery,
} from "./mcp-discovery.ts";

export type {
  DiscoveredTool,
  DiscoveryResult,
  DiscoverySummary,
} from "./mcp-discovery.ts";

export { syncDiscoveredTools, sanitizeEnvToPlaceholders } from "./tool-sync.ts";

export type { SyncResult, ObservedConfig } from "./tool-sync.ts";

export { ConfigWatcher } from "./config-watcher.ts";

export type { McpServersChangedCallback } from "./config-watcher.ts";
