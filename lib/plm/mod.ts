/**
 * MCP PLM (Product Lifecycle Management) Library
 *
 * MCP tools for BOM management, cost analysis, change tracking, and quality control.
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

// Re-export sampling client injection
export { setSamplingClient } from "./src/tools/agent.ts";

// Re-export individual tool arrays
export {
  bomTools,
  agentTools,
} from "./src/tools/mod.ts";
