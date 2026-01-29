/**
 * MCP Handlers Module
 *
 * Exports all MCP tool handlers for use by the gateway server.
 *
 * @module mcp/handlers
 */

export { handleSearchCapabilities, handleSearchTools } from "./search-handler.ts";
export { type CodeExecutionDependencies, handleExecuteCode } from "./code-execution-handler.ts";

// Phase 3.1: Execute handler facade + Use Cases
export { ExecuteHandlerFacade, type ExecuteRequest } from "./execute-handler-facade.ts";

// Phase 3.2: Discover handler facade (extended with MCP Tools Consolidation)
export { DiscoverHandlerFacade, type DiscoverHandlerFacadeDeps, type DiscoverArgs } from "./discover-handler-facade.ts";

// MCP Tools Consolidation: Admin handler facade
export { AdminHandlerFacade, type AdminHandlerFacadeDeps, type AdminArgs } from "./admin-handler-facade.ts";

export {
  handleAbort,
  handleApprovalResponse,
  handleContinue,
  handleReplan,
  handleWorkflowExecution,
  processGeneratorUntilPause,
  type WorkflowHandlerDependencies,
} from "./workflow-handler.ts";

// Shared handler utilities
export {
  addHandlerBreadcrumb,
  buildToolDefinitionsFromDAG,
  buildToolDefinitionsFromStaticStructure,
  createHandlerContext,
  createTracingExecutor,
  formatErrorResponse,
  formatSuccessResponse,
  handleError,
  validateRequiredParams,
  type DAGWithTasks,
  type HandlerContext,
  type StaticStructureWithNodes,
  type ToolDefinitionDeps,
  type TransactionContext,
  type WorkerBridgeExecutorDeps,
  type WorkerBridgeExecutorResult,
} from "./shared/mod.ts";

// Story 13.5: cap:* management tools (moved from lib/std/cap.ts)
export { buildEmbeddingText, CapModule, globToSqlLike, PmlStdServer } from "./cap-handler.ts";
export type {
  CapListItem,
  CapListOptions,
  CapListResponse,
  CapLookupOptions,
  CapLookupResponse,
  CapMergeOptions,
  CapMergeResponse,
  CapRenameOptions,
  CapRenameResponse,
  CapTool,
  CapToolResult,
  CapWhoisOptions,
  CapWhoisResponse,
  OnCapabilityMerged,
} from "./cap-handler.ts";
