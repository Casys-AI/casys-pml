/**
 * Worker Bridge Factory Adapter
 *
 * Adapts createToolExecutorViaWorker and cleanupWorkerBridgeExecutor
 * to IWorkerBridgeFactory interface.
 *
 * Phase 3.1: Execute Handler → Use Cases refactoring
 *
 * @module infrastructure/di/adapters/execute/worker-bridge-factory-adapter
 */

import type { MCPClientBase } from "../../../../mcp/types.ts";
import type { CapabilityStore } from "../../../../capabilities/capability-store.ts";
import type { CapabilityRegistry } from "../../../../capabilities/capability-registry.ts";
import type { GraphRAGEngine } from "../../../../graphrag/graph-engine.ts";
import {
  createToolExecutorViaWorker,
  cleanupWorkerBridgeExecutor,
  type ExecutorContext,
} from "../../../../dag/execution/workerbridge-executor.ts";
import type { ControlledExecutor } from "../../../../dag/controlled-executor.ts";

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
  create(config: { toolDefinitions?: unknown[] }): [IDAGExecutor, WorkerBridgeContext];
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
  /** Factory to create ControlledExecutor instances */
  createExecutor?: () => ControlledExecutor;
  /** Execution timeout in ms (default: 30000) */
  timeout?: number;
}

/**
 * Adapts WorkerBridge factory functions to IWorkerBridgeFactory interface
 */
export class WorkerBridgeFactoryAdapter implements IWorkerBridgeFactory {
  constructor(private readonly deps: WorkerBridgeFactoryAdapterDeps) {}

  /**
   * Create a DAG executor with worker bridge
   */
  create(config: { toolDefinitions?: unknown[] }): [IDAGExecutor, WorkerBridgeContext] {
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
      timeout: this.deps.timeout ?? 30000,
    });

    // Create or get executor instance
    const executor = this.createExecutorInstance(toolExecutor, executorContext);

    return [
      executor,
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

  /**
   * Create executor instance with tool executor
   */
  private createExecutorInstance(
    toolExecutor: (tool: string, args: Record<string, unknown>) => Promise<unknown>,
    context: ExecutorContext,
  ): IDAGExecutor {
    // If custom factory provided, use it
    if (this.deps.createExecutor) {
      const executor = this.deps.createExecutor();
      executor.setWorkerBridge?.(context.bridge);
      return executor as unknown as IDAGExecutor;
    }

    // Create a simple executor wrapper
    return new SimpleDAGExecutor(toolExecutor, context);
  }
}

/**
 * Simple DAG executor that wraps a tool executor
 *
 * Executes tasks sequentially for simplicity. For parallel execution,
 * use ControlledExecutor via createExecutor factory.
 */
class SimpleDAGExecutor implements IDAGExecutor {
  constructor(
    private readonly toolExecutor: (tool: string, args: Record<string, unknown>) => Promise<unknown>,
    _context: ExecutorContext, // Keep reference for potential future use
  ) {}

  async execute(dag: { tasks: unknown[] }): Promise<{
    results: Array<{
      taskId: string;
      status: string;
      output?: unknown;
      error?: string;
      executionTimeMs?: number;
    }>;
    successfulTasks: number;
    failedTasks: number;
    errors: Array<{ taskId: string; error: string }>;
    parallelizationLayers: number;
  }> {
    const results: Array<{
      taskId: string;
      status: string;
      output?: unknown;
      error?: string;
      executionTimeMs?: number;
    }> = [];
    const errors: Array<{ taskId: string; error: string }> = [];
    let failedTasks = 0;
    let successfulTasks = 0;

    const tasks = dag.tasks as Array<{
      id: string;
      tool?: string;
      arguments?: Record<string, unknown>;
    }>;

    // Execute tasks sequentially (respecting dependencies handled externally)
    for (const task of tasks) {
      const startTime = performance.now();

      try {
        if (!task.tool) {
          results.push({
            taskId: task.id,
            status: "skipped",
            executionTimeMs: 0,
          });
          continue;
        }

        const output = await this.toolExecutor(task.tool, task.arguments ?? {});
        successfulTasks++;
        results.push({
          taskId: task.id,
          status: "success",
          output,
          executionTimeMs: performance.now() - startTime,
        });
      } catch (error) {
        failedTasks++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push({ taskId: task.id, error: errorMsg });
        results.push({
          taskId: task.id,
          status: "error",
          error: errorMsg,
          executionTimeMs: performance.now() - startTime,
        });
      }
    }

    return {
      results,
      successfulTasks,
      failedTasks,
      errors,
      parallelizationLayers: 1, // Sequential execution = 1 layer
    };
  }

  setWorkerBridge(bridge: unknown): void {
    // Bridge is set via constructor
    void bridge;
  }

  setToolDefinitions(defs: unknown[]): void {
    // Tool definitions handled by WorkerBridge
    void defs;
  }

  setCheckpointManager(_db: unknown, _enabled: boolean): void {
    // Not implemented in simple executor
  }

  setLearningDependencies(_capabilityStore: unknown, _graphEngine: unknown): void {
    // Not implemented in simple executor
  }

  calculateSpeedup(_results: unknown): number {
    return 1; // No parallelization in simple executor
  }
}
