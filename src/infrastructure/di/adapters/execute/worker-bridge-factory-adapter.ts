/**
 * Worker Bridge Factory Adapter
 *
 * Adapts createToolExecutorViaWorker and cleanupWorkerBridgeExecutor
 * to IWorkerBridgeFactory interface.
 *
 * Phase 3.1: Execute Handler → Use Cases refactoring
 *
 * @module infrastructure/di/adapters/execute/worker-bridge-factory-adapter
 *
 * NOTE: Used for server-routed MCP execution (execute_locally: false).
 * Client-routed execution uses packages/pml/src/loader/capability-loader.ts.
 */

import * as log from "@std/log";
import type { MCPClientBase } from "../../../../mcp/types.ts";
import type { CapabilityStore } from "../../../../capabilities/capability-store.ts";
import type { CapabilityRegistry } from "../../../../capabilities/capability-registry.ts";
import type { GraphRAGEngine } from "../../../../graphrag/graph-engine.ts";
import {
  createToolExecutorViaWorker,
  cleanupWorkerBridgeExecutor,
  type ExecutorContext,
} from "../../../../dag/execution/workerbridge-executor.ts";
import { ControlledExecutor } from "../../../../dag/controlled-executor.ts";
import type { WorkerBridge } from "../../../../sandbox/worker-bridge.ts";
import type { ToolDefinition } from "../../../../sandbox/types.ts";

/**
 * DAG executor interface (simplified for use case)
 */
export interface IDAGExecutor {
  execute(dag: { tasks: unknown[] }): Promise<{
    results: Array<{
      taskId: string;
      status: string;
      output?: unknown;
      error?: string;
      executionTimeMs?: number;
    }>;
    failedTasks: number;
    errors: Array<{ taskId: string; error: string }>;
    parallelizationLayers: number;
  }>;
  setWorkerBridge?(bridge: unknown): void;
  setToolDefinitions?(defs: unknown[]): void;
  setCheckpointManager?(db: unknown, enabled: boolean): void;
  setLearningDependencies?(capabilityStore: unknown, graphEngine: unknown): void;
  calculateSpeedup?(results: unknown): number;
}

/**
 * Worker bridge context for cleanup
 */
export interface WorkerBridgeContext {
  bridge: unknown;
  traces: unknown[];
}

/**
 * IWorkerBridgeFactory interface (matches ExecuteDirectUseCase dependency)
 */
export interface IWorkerBridgeFactory {
  create(config: { toolDefinitions?: unknown[]; traceId?: string; parentTraceId?: string }): [IDAGExecutor, WorkerBridgeContext];
  cleanup(context: WorkerBridgeContext): void;
}

/**
 * Dependencies for WorkerBridgeFactoryAdapter
 */
export interface WorkerBridgeFactoryAdapterDeps {
  mcpClients: Map<string, MCPClientBase>;
  capabilityStore?: CapabilityStore;
  capabilityRegistry?: CapabilityRegistry;
  graphRAG?: GraphRAGEngine;
  /** Execution timeout in ms (default: 30000) */
  timeout?: number;
  /** CapModule for cap_* tool routing */
  capModule?: import("../../../../mcp/handlers/cap-handler.ts").CapModule;
}

/**
 * Adapts WorkerBridge factory functions to IWorkerBridgeFactory interface
 *
 * Uses ControlledExecutor for proper task type routing:
 * - mcp_tool → routes to MCP server via RPC
 * - code_execution → executes JS natively via WorkerBridge
 * - capability → executes stored capability
 *
 * @see ControlledExecutor.executeTask() for routing logic
 */
export class WorkerBridgeFactoryAdapter implements IWorkerBridgeFactory {
  private capModule?: import("../../../../mcp/handlers/cap-handler.ts").CapModule;

  constructor(private readonly deps: WorkerBridgeFactoryAdapterDeps) {
    this.capModule = deps.capModule;
  }

  /**
   * Set CapModule for cap_* tool routing (late binding)
   * Called after GatewayServer creates PmlStdServer
   */
  setCapModule(capModule: import("../../../../mcp/handlers/cap-handler.ts").CapModule): void {
    this.capModule = capModule;
  }

  /**
   * Create a DAG executor with worker bridge
   */
  create(config: { toolDefinitions?: unknown[]; traceId?: string; parentTraceId?: string }): [IDAGExecutor, WorkerBridgeContext] {
    // Create tool executor and context via WorkerBridge
    const [toolExecutor, executorContext] = createToolExecutorViaWorker({
      mcpClients: this.deps.mcpClients,
      toolDefinitions: config.toolDefinitions as Array<{
        server: string;
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
      }>,
      capabilityStore: this.deps.capabilityStore,
      capabilityRegistry: this.deps.capabilityRegistry,
      graphRAG: this.deps.graphRAG,
      capModule: this.capModule,
      timeout: this.deps.timeout ?? 30000,
      traceId: config.traceId, // Pre-generated trace ID for hierarchy
      parentTraceId: config.parentTraceId, // Parent trace ID for nested execution (ADR-041)
    });

    // Create ControlledExecutor for proper task type routing
    // ControlledExecutor handles: mcp_tool, code_execution, capability
    const executor = new ControlledExecutor(toolExecutor, {
      taskTimeout: this.deps.timeout ?? 30000,
    });

    // Configure WorkerBridge for code_execution tasks
    executor.setWorkerBridge(executorContext.bridge as WorkerBridge);

    // Configure tool definitions for code that contains MCP calls
    if (config.toolDefinitions) {
      executor.setToolDefinitions(config.toolDefinitions as ToolDefinition[]);
    }

    // Configure learning dependencies if available
    if (this.deps.capabilityStore || this.deps.graphRAG) {
      executor.setLearningDependencies(this.deps.capabilityStore, this.deps.graphRAG);
    }

    log.debug("[WorkerBridgeFactoryAdapter] Created ControlledExecutor with WorkerBridge", {
      hasCapabilityStore: !!this.deps.capabilityStore,
      hasGraphRAG: !!this.deps.graphRAG,
      toolDefinitionsCount: config.toolDefinitions?.length ?? 0,
    });

    return [
      executor as unknown as IDAGExecutor,
      {
        bridge: executorContext.bridge,
        traces: executorContext.traces,
      },
    ];
  }

  /**
   * Cleanup worker bridge context
   */
  cleanup(context: WorkerBridgeContext): void {
    cleanupWorkerBridgeExecutor(context as ExecutorContext);
  }
}
