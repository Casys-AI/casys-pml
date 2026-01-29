/**
 * Shared Executor Factory
 *
 * Creates WorkerBridge-based executors for 100% traceability.
 * Consolidates duplicated executor creation patterns from:
 * - workflow-execution-handler.ts
 * - control-commands-handler.ts
 *
 * Story 10.5 AC10: All MCP tool calls go through WorkerBridge RPC.
 *
 * @module mcp/handlers/shared/executor-factory
 */

import type { ToolDefinition } from "../../../sandbox/types.ts";
import type { ToolExecutor } from "../../../dag/types.ts";
import {
  createToolExecutorViaWorker,
  type ExecutorContext,
} from "../../../dag/execution/workerbridge-executor.ts";
import type { MCPClientBase } from "../../types.ts";
import type { CapabilityStore } from "../../../capabilities/capability-store.ts";
import type { GraphRAGEngine } from "../../../graphrag/graph-engine.ts";
import type { CapabilityRegistry } from "../../../capabilities/capability-registry.ts";
import type { CapModule } from "../cap-handler.ts";

/**
 * Dependencies for creating a WorkerBridge executor
 */
export interface WorkerBridgeExecutorDeps {
  mcpClients: Map<string, MCPClientBase>;
  capabilityStore?: CapabilityStore;
  graphEngine?: GraphRAGEngine;
  capabilityRegistry?: CapabilityRegistry;
  capModule?: CapModule;
}

/**
 * Result of creating a WorkerBridge executor
 */
export interface WorkerBridgeExecutorResult {
  executor: ToolExecutor;
  context: ExecutorContext;
}

/**
 * Create a WorkerBridge-based tool executor for 100% traceability
 *
 * All MCP tool calls go through WorkerBridge RPC, ensuring complete
 * tracing with tool_start/tool_end events.
 *
 * @param deps - Dependencies with MCP clients and optional stores
 * @param toolDefs - Tool definitions for WorkerBridge context
 * @returns Executor and context for cleanup
 */
export function createTracingExecutor(
  deps: WorkerBridgeExecutorDeps,
  toolDefs: ToolDefinition[],
): WorkerBridgeExecutorResult {
  const [executor, context] = createToolExecutorViaWorker({
    mcpClients: deps.mcpClients,
    toolDefinitions: toolDefs,
    capabilityStore: deps.capabilityStore,
    graphRAG: deps.graphEngine,
    capabilityRegistry: deps.capabilityRegistry,
    capModule: deps.capModule,
  });

  return { executor, context };
}
