/**
 * Routing Module
 *
 * Platform-defined routing for MCP tools.
 * Determines local vs cloud execution.
 *
 * @module routing
 */

export {
  extractNamespace,
  getCloudServers,
  isCloudTool,
  isLocalTool,
  resolveToolRouting,
} from "./resolver.ts";
