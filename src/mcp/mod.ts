/**
 * MCP (Model Context Protocol) Module
 *
 * Provides MCP server/client implementation with:
 * - Gateway server for multi-server orchestration
 * - Client for connecting to MCP servers
 * - Server discovery and configuration
 * - Adaptive threshold management
 *
 * @module mcp
 */

// Gateway server
export { CasysIntelligenceGatewayServer } from "./gateway-server.ts";
// Legacy export for backward compatibility (deprecated)
export { CasysIntelligenceGatewayServer as AgentCardsGatewayServer } from "./gateway-server.ts";
export type { GatewayServerConfig } from "./gateway-server.ts";

// MCP Client
export { MCPClient } from "./client.ts";

// Server discovery
export { MCPServerDiscovery } from "./discovery.ts";

// Gateway handler (internal)
export { GatewayHandler } from "./gateway-handler.ts";

// Adaptive threshold management
export { AdaptiveThresholdManager } from "./adaptive-threshold.ts";

// Schema extraction
export { SchemaExtractor } from "./schema-extractor.ts";

// Workflow DAG storage
export {
  cleanupExpiredDAGs,
  deleteWorkflowDAG,
  extendWorkflowDAGExpiration,
  getWorkflowDAG,
  getWorkflowDAGRecord,
  saveWorkflowDAG,
  updateWorkflowDAG,
} from "./workflow-dag-store.ts";
export type { WorkflowDAGRecord } from "./workflow-dag-store.ts";

// Types
export type {
  CodeExecutionRequest,
  CodeExecutionResponse,
  MCPConfig,
  MCPServer,
  MCPTool,
} from "./types.ts";
