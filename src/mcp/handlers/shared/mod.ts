/**
 * Shared Handler Utilities Module
 *
 * Exports common utilities used across MCP handlers.
 *
 * @module mcp/handlers/shared
 */

export {
  addHandlerBreadcrumb,
  createHandlerContext,
  formatErrorResponse,
  formatSuccessResponse,
  handleError,
  type HandlerContext,
  type TransactionContext,
  validateRequiredParams,
} from "./handler-utils.ts";

export {
  buildToolDefinitionsFromDAG,
  buildToolDefinitionsFromStaticStructure,
  type DAGWithTasks,
  type StaticStructureWithNodes,
  type ToolDefinitionDeps,
} from "./tool-definitions.ts";

export {
  createTracingExecutor,
  type WorkerBridgeExecutorDeps,
  type WorkerBridgeExecutorResult,
} from "./executor-factory.ts";
