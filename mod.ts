/**
 * AgentCards - Public API Exports
 *
 * This module exports the public API for AgentCards.
 *
 * Note: The CLI entry point (main) is not exported here.
 * Use `deno run --allow-all jsr:@casys/mcp-gateway` to run the CLI.
 *
 * @module mod
 */

// MCP Gateway Server
export { AgentCardsGatewayServer } from "./src/mcp/gateway-server.ts";
export type { GatewayServerConfig } from "./src/mcp/gateway-server.ts";
export { MCPClient } from "./src/mcp/client.ts";
export { MCPServerDiscovery } from "./src/mcp/discovery.ts";
export type {
  MCPServer,
  MCPTool,
  MCPConfig,
  CodeExecutionRequest,
  CodeExecutionResponse
} from "./src/mcp/types.ts";

// Sandbox executor for secure code execution
export { DenoSandboxExecutor } from "./src/sandbox/executor.ts";
export type {
  SandboxConfig,
  ExecutionResult,
  StructuredError,
  ErrorType,
} from "./src/sandbox/types.ts";

// PII Detection & Tokenization (Story 3.6)
export {
  PIIDetector,
  TokenizationManager,
  detectAndTokenize,
} from "./src/sandbox/pii-detector.ts";
export type {
  PIIType,
  PIIMatch,
  PIIConfig,
} from "./src/sandbox/pii-detector.ts";

// Code Execution Cache (Story 3.7)
export {
  CodeExecutionCache,
  generateCacheKey,
} from "./src/sandbox/cache.ts";
export type {
  CacheConfig,
  CacheEntry,
  CacheStats,
} from "./src/sandbox/cache.ts";

// Tool context builder for MCP tool injection
export {
  ContextBuilder,
  wrapMCPClient,
  MCPToolError,
  InvalidToolNameError,
} from "./src/sandbox/context-builder.ts";
export type { ToolContext, ToolFunction } from "./src/sandbox/context-builder.ts";

// DAG Execution with Adaptive Feedback Loops (Epic 2.5)
export { ParallelExecutor } from "./src/dag/executor.ts";
export { ControlledExecutor } from "./src/dag/controlled-executor.ts";
export { CheckpointManager } from "./src/dag/checkpoint-manager.ts";
export type {
  DAGExecutionResult,
  ExecutorConfig,
  TaskError,
  TaskResult,
  ToolExecutor,
  ExecutionEvent,
  Command,
  Checkpoint,
} from "./src/dag/types.ts";
export {
  createInitialState,
  getStateSnapshot,
  updateState,
  validateStateInvariants,
  messagesReducer,
  tasksReducer,
  decisionsReducer,
  contextReducer,
} from "./src/dag/state.ts";
export type {
  WorkflowState,
  StateUpdate,
  Message,
  Decision,
} from "./src/dag/state.ts";
export { EventStream } from "./src/dag/event-stream.ts";
export type { EventStreamStats } from "./src/dag/event-stream.ts";
export { CommandQueue, AsyncQueue, isValidCommand } from "./src/dag/command-queue.ts";

// Database components
export { createDefaultClient } from "./src/db/client.ts";
export { MigrationRunner, getAllMigrations } from "./src/db/migrations.ts";

// Vector search and embeddings
export { EmbeddingModel } from "./src/vector/embeddings.ts";
export { VectorSearch } from "./src/vector/search.ts";

// GraphRAG engine
export { GraphRAGEngine } from "./src/graphrag/graph-engine.ts";
export { DAGSuggester } from "./src/graphrag/dag-suggester.ts";
export type {
  Task,
  DAGStructure,
  WorkflowIntent,
  SuggestedDAG,
  GraphStats
} from "./src/graphrag/types.ts";
