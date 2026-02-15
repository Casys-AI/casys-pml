/**
 * MCP MBE (Model-Based Engineering) Library
 *
 * MCP tools for CAD geometry, GD&T tolerances, materials, and PMI.
 *
 * @module lib/mbe
 */

// Re-export client and tools
export {
  defaultClient,
  MbeToolsClient,
  MbeToolsMCP,
  mbeToolsMCP,
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
  MbeToolsClientOptions,
} from "./src/client.ts";

// Re-export types
export type {
  MbeTool,
  MbeToolCategory,
  MbeToolHandler,
} from "./src/client.ts";

// Re-export individual tool arrays
export {
  geometryTools,
  toleranceTools,
  materialTools,
  modelTools,
  runCommand,
} from "./src/tools/mod.ts";
