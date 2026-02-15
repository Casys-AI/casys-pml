/**
 * MCP PLM (Product Lifecycle Management) Library
 *
 * MCP tools for BOM, change management, quality, and manufacturing planning.
 *
 * @module lib/plm
 */

// Re-export client and tools
export {
  defaultClient,
  PlmToolsClient,
  PlmToolsMCP,
  plmToolsMCP,
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
} from "./src/client.ts";

// Re-export client types
export type {
  MCPClientBase,
  MCPTool,
  PlmToolsClientOptions,
} from "./src/client.ts";

// Re-export types
export type {
  PlmTool,
  PlmToolCategory,
  PlmToolHandler,
} from "./src/client.ts";

// Re-export individual tool arrays
export {
  bomTools,
  changeTools,
  qualityTools,
  planningTools,
  runCommand,
} from "./src/tools/mod.ts";
