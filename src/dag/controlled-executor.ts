/**
 * ControlledExecutor - DAG Executor with Adaptive Feedback Loops
 *
 * Extends ParallelExecutor with:
 * - Event stream for real-time observability
 * - Command queue for dynamic control
 * - WorkflowState management with reducers
 * - Zero breaking changes to Epic 2 code
 *
 * @module dag/controlled-executor
 */

import { ParallelExecutor } from "./executor.ts";
import type { DAGStructure, Task } from "../graphrag/types.ts";
import type { ExecutorConfig, ExecutionEvent, ToolExecutor, TaskResult } from "./types.ts";
import { EventStream, type EventStreamStats } from "./event-stream.ts";
import { CommandQueue, type CommandQueueStats } from "./command-queue.ts";
import {
  createInitialState,
  getStateSnapshot,
  updateState,
  type WorkflowState,
  type StateUpdate,
} from "./state.ts";
import { CheckpointManager } from "./checkpoint-manager.ts";
import type { PGliteClient } from "../db/client.ts";
import { getLogger } from "../telemetry/logger.ts";
import type { DAGSuggester } from "../graphrag/dag-suggester.ts";
import { DenoSandboxExecutor } from "../sandbox/executor.ts";
import { ContextBuilder } from "../sandbox/context-builder.ts";
import type { VectorSearch } from "../vector/search.ts";
import type { MCPClient } from "../mcp/client.ts";

const log = getLogger("controlled-executor");

/**
 * Determines if a task is safe-to-fail (Story 3.5)
 *
 * Safe-to-fail tasks:
 * - Are code_execution type (NOT MCP tools)
 * - Have NO side effects (idempotent, isolated)
 *
 * These tasks can fail without halting the workflow.
 *
 * @param task - Task to check
 * @returns true if task can fail safely
 */
function isSafeToFail(task: Task): boolean {
  return !task.side_effects && task.type === "code_execution";
}

/**
 * ControlledExecutor extends ParallelExecutor with adaptive feedback loops
 *
 * Features:
 * - executeStream() async generator yields events in real-time
 * - Event stream for observability (<5ms emission overhead)
 * - Command queue for dynamic control (<10ms injection latency)
 * - WorkflowState with MessagesState-inspired reducers
 * - Backward compatible (ParallelExecutor.execute() still works)
 * - Preserves 5x speedup from parallel execution
 */
export class ControlledExecutor extends ParallelExecutor {
  private state: WorkflowState | null = null;
  private eventStream: EventStream;
  private commandQueue: CommandQueue;
  private checkpointManager: CheckpointManager | null = null;
  private dagSuggester: DAGSuggester | null = null;
  private replanCount: number = 0; // Rate limiting for replans (Story 2.5-3 Task 3)
  private readonly MAX_REPLANS = 3; // Maximum replans per workflow
  private vectorSearch: VectorSearch | null = null; // Story 3.4
  private contextBuilder: ContextBuilder | null = null; // Story 3.4

  /**
   * Create a new controlled executor
   *
   * @param toolExecutor - Function to execute individual tools
   * @param config - Executor configuration
   */
  constructor(toolExecutor: ToolExecutor, config: ExecutorConfig = {}) {
    super(toolExecutor, config);
    this.eventStream = new EventStream();
    this.commandQueue = new CommandQueue();
  }

  /**
   * Set checkpoint manager for fault-tolerant execution
   *
   * Story 2.5-2: Enables checkpoint/resume functionality.
   * Call this before executeStream() to enable checkpointing.
   *
   * @param db - PGlite database client
   * @param autoPrune - Enable automatic pruning (default: true for production)
   */
  setCheckpointManager(db: PGliteClient, autoPrune: boolean = true): void {
    this.checkpointManager = new CheckpointManager(db, autoPrune);
  }

  /**
   * Set DAG suggester for replanning capability (Story 2.5-3)
   *
   * Required for AIL replan_dag commands.
   * Call this before executeStream() to enable dynamic replanning.
   *
   * @param dagSuggester - DAGSuggester instance with GraphRAG access
   */
  setDAGSuggester(dagSuggester: DAGSuggester): void {
    this.dagSuggester = dagSuggester;
  }

  /**
   * Set code execution support (Story 3.4)
   *
   * Required for executing code_execution tasks.
   * Call this before executeStream() to enable code execution in DAG.
   *
   * @param vectorSearch - VectorSearch instance for intent-based tool discovery
   * @param mcpClients - Map of MCP clients for tool injection
   */
  setCodeExecutionSupport(
    vectorSearch: VectorSearch,
    mcpClients: Map<string, MCPClient>,
  ): void {
    this.vectorSearch = vectorSearch;
    this.contextBuilder = new ContextBuilder(vectorSearch, mcpClients);
    log.debug("Code execution support enabled");
  }

  /**
   * Check if AIL decision point should be triggered (Story 2.5-3)
   *
   * @param config - Executor configuration
   * @param _layerIdx - Current layer index (unused, reserved for future)
   * @param hasErrors - Whether current layer had errors
   * @returns true if decision point should trigger
   */
  private shouldTriggerAIL(
    config: ExecutorConfig,
    _layerIdx: number,
    hasErrors: boolean,
  ): boolean {
    if (!config.ail?.enabled) return false;

    const mode = config.ail.decision_points;
    if (mode === "per_layer") return true;
    if (mode === "on_error") return hasErrors;
    if (mode === "manual") return false; // Only trigger via explicit command

    return false;
  }

  /**
   * Check if HIL approval checkpoint should be triggered (Story 2.5-3)
   *
   * @param config - Executor configuration
   * @param _layerIdx - Current layer index (unused, reserved for future)
   * @param layer - Tasks in current layer
   * @returns true if approval required
   */
  private shouldRequireApproval(
    config: ExecutorConfig,
    _layerIdx: number,
    layer: any[],
  ): boolean {
    if (!config.hil?.enabled) return false;

    const mode = config.hil.approval_required;
    if (mode === "always") return true;
    if (mode === "never") return false;
    if (mode === "critical_only") {
      // Check if any task in layer has side_effects flag
      return layer.some((task) => task.side_effects === true);
    }

    return false;
  }

  /**
   * Generate summary for HIL approval (Story 2.5-3)
   *
   * Template-based summary generation (500-1000 tokens).
   * No LLM call needed for MVP.
   *
   * @param layerIdx - Completed layer index
   * @param layers - All DAG layers
   * @returns Summary string for human display
   */
  private generateHILSummary(
    layerIdx: number,
    layers: any[][],
  ): string {
    if (!this.state) return "Error: State not initialized";

    const completedTasks = this.state.tasks.filter(
      (t) => t.status === "success",
    ).length;
    const failedTasks = this.state.tasks.filter((t) => t.status === "error")
      .length;

    const nextLayer = layerIdx + 1 < layers.length
      ? layers[layerIdx + 1]
      : null;

    const summary = [
      `=== Workflow Approval Checkpoint ===\n`,
      `Layer ${layerIdx} completed\n`,
      `\nTasks executed in this layer: ${layers[layerIdx].length}`,
      `Total tasks completed: ${completedTasks}`,
      `Total tasks failed: ${failedTasks}\n`,
      `\nRecent task results:`,
      ...this.state.tasks.slice(-3).map((t) =>
        `  - ${t.taskId}: ${t.status} ${
          t.executionTimeMs ? `(${t.executionTimeMs.toFixed(0)}ms)` : ""
        }`
      ),
    ];

    if (nextLayer) {
      summary.push(
        `\n\nNext layer preview (${nextLayer.length} tasks):`,
        ...nextLayer.slice(0, 3).map((t: any) => `  - ${t.id}: ${t.tool}`),
      );
      if (nextLayer.length > 3) {
        summary.push(`  ... and ${nextLayer.length - 3} more tasks`);
      }
    } else {
      summary.push(`\n\nThis is the final layer.`);
    }

    summary.push(`\n\nApprove to continue? [Y/N]`);

    return summary.join("\n");
  }

  /**
   * Process AIL/HIL commands and wait for decision (Story 2.5-3)
   *
   * Waits for agent/human to enqueue a command via CommandQueue.
   * Timeout after 5 minutes (configurable).
   *
   * @param decisionType - "AIL" or "HIL"
   * @param timeout - Timeout in ms (default: 5 minutes)
   * @returns Command from queue or null if timeout
   */
  private async waitForDecisionCommand(
    decisionType: "AIL" | "HIL",
    timeout: number = 300000, // 5 minutes
  ): Promise<any | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const commands = await this.commandQueue.processCommandsAsync();

      if (commands.length > 0) {
        // Return first command (FIFO)
        return commands[0];
      }

      // Wait 100ms before checking again (non-blocking polling)
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    log.warn(`${decisionType} decision timeout after ${timeout}ms`);
    return null; // Timeout
  }

  /**
   * Execute DAG with streaming events and adaptive control
   *
   * Returns an async generator that yields ExecutionEvents in real-time.
   * Final return value is the complete WorkflowState.
   *
   * Flow:
   * 1. Emit workflow_start event
   * 2. Initialize WorkflowState
   * 3. For each layer:
   *    - Emit layer_start event
   *    - Process commands (non-blocking)
   *    - Execute layer in parallel (call super.executeLayer())
   *    - Update state via reducers
   *    - Emit state_updated event
   *    - Yield checkpoint event (placeholder for Story 2.5-2)
   * 4. Emit workflow_complete event
   * 5. Return final WorkflowState
   *
   * @param dag - DAG structure to execute
   * @param workflow_id - Unique workflow identifier (default: auto-generated)
   * @returns Async generator yielding events, returning final state
   */
  async *executeStream(
    dag: DAGStructure,
    workflow_id?: string,
  ): AsyncGenerator<ExecutionEvent, WorkflowState, void> {
    const workflowId = workflow_id ?? `workflow-${Date.now()}`;
    const startTime = performance.now();

    // 1. Initialize state
    this.state = createInitialState(workflowId);

    // 2. Topological sort (from ParallelExecutor)
    let layers = this.topologicalSort(dag);

    // 3. Emit workflow_start event
    const startEvent: ExecutionEvent = {
      type: "workflow_start",
      timestamp: Date.now(),
      workflow_id: workflowId,
      total_layers: layers.length,
    };
    await this.eventStream.emit(startEvent);
    yield startEvent;

    // 4. Execute layer by layer
    const results = new Map<string, any>();
    let successfulTasks = 0;
    let failedTasks = 0;

    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx];

      // 4a. Emit layer_start event
      const layerStartEvent: ExecutionEvent = {
        type: "layer_start",
        timestamp: Date.now(),
        workflow_id: workflowId,
        layer_index: layerIdx,
        tasks_count: layer.length,
      };
      await this.eventStream.emit(layerStartEvent);
      yield layerStartEvent;

      // 4b. Process commands (non-blocking)
      const commands = await this.commandQueue.processCommandsAsync();
      for (const cmd of commands) {
        log.info(`Processing command: ${cmd.type}`);
        // TODO: Story 2.5-3 - Implement command handlers
        // For now, just log them
        if (cmd.type === "abort") {
          log.warn(`Abort command received: ${cmd.reason}`);
          // Will implement abort logic in Story 2.5-3
        }
      }

      // 4c. Emit task_start for each task
      for (const task of layer) {
        const taskStartEvent: ExecutionEvent = {
          type: "task_start",
          timestamp: Date.now(),
          workflow_id: workflowId,
          task_id: task.id,
          tool: task.tool,
        };
        await this.eventStream.emit(taskStartEvent);
        yield taskStartEvent;
      }

      // 4d. Execute layer in parallel
      const layerResults = await Promise.allSettled(
        layer.map((task) => this.executeTask(task, results)),
      );

      // 4e. Collect results and emit task events
      const layerTaskResults = [];
      for (let i = 0; i < layer.length; i++) {
        const task = layer[i];
        const result = layerResults[i];

        if (result.status === "fulfilled") {
          successfulTasks++;
          const taskResult = {
            taskId: task.id,
            status: "success" as const,
            output: result.value.output,
            executionTimeMs: result.value.executionTimeMs,
          };
          results.set(task.id, taskResult);
          layerTaskResults.push(taskResult);

          // Emit task_complete event
          const completeEvent: ExecutionEvent = {
            type: "task_complete",
            timestamp: Date.now(),
            workflow_id: workflowId,
            task_id: task.id,
            execution_time_ms: result.value.executionTimeMs,
          };
          await this.eventStream.emit(completeEvent);
          yield completeEvent;
        } else {
          // Story 3.5: Differentiate safe-to-fail vs critical failures
          const errorMsg = result.reason?.message || String(result.reason);
          const isSafe = isSafeToFail(task);

          if (isSafe) {
            // Safe-to-fail task: Log warning, continue workflow
            log.warn(`Safe-to-fail task ${task.id} failed (continuing): ${errorMsg}`);
            const taskResult = {
              taskId: task.id,
              status: "failed_safe" as const,
              output: null,
              error: errorMsg,
            };
            results.set(task.id, taskResult);
            layerTaskResults.push(taskResult);

            // Emit task_warning event (non-critical)
            const warningEvent: ExecutionEvent = {
              type: "task_warning",
              timestamp: Date.now(),
              workflow_id: workflowId,
              task_id: task.id,
              error: errorMsg,
              message: "Safe-to-fail task failed, workflow continues",
            };
            await this.eventStream.emit(warningEvent);
            yield warningEvent;
          } else {
            // Critical failure: Halt workflow
            failedTasks++;
            const taskResult = {
              taskId: task.id,
              status: "error" as const,
              error: errorMsg,
            };
            results.set(task.id, taskResult);
            layerTaskResults.push(taskResult);

            // Emit task_error event
            const errorEvent: ExecutionEvent = {
              type: "task_error",
              timestamp: Date.now(),
              workflow_id: workflowId,
              task_id: task.id,
              error: errorMsg,
            };
            await this.eventStream.emit(errorEvent);
            yield errorEvent;
          }
        }
      }

      // 4f. Update state via reducers
      const stateUpdate: StateUpdate = {
        current_layer: layerIdx,
        tasks: layerTaskResults,
      };
      this.state = updateState(this.state, stateUpdate);

      // Emit state_updated event
      const stateEvent: ExecutionEvent = {
        type: "state_updated",
        timestamp: Date.now(),
        workflow_id: workflowId,
        updates: {
          tasks_added: layerTaskResults.length,
        },
      };
      await this.eventStream.emit(stateEvent);
      yield stateEvent;

      // 4g. Checkpoint (Story 2.5-2)
      let checkpointId = "";
      if (this.checkpointManager) {
        try {
          const checkpoint = await this.checkpointManager.saveCheckpoint(
            workflowId,
            layerIdx,
            this.state,
          );

          checkpointId = checkpoint.id;

          const checkpointEvent: ExecutionEvent = {
            type: "checkpoint",
            timestamp: Date.now(),
            workflow_id: workflowId,
            checkpoint_id: checkpoint.id,
            layer_index: layerIdx,
          };
          await this.eventStream.emit(checkpointEvent);
          yield checkpointEvent;
        } catch (error) {
          // Checkpoint save failure should not stop execution
          log.error(`Checkpoint save failed at layer ${layerIdx}: ${error}`);
          checkpointId = `failed-${layerIdx}`;
          // Emit event with placeholder ID to indicate failure
          const checkpointEvent: ExecutionEvent = {
            type: "checkpoint",
            timestamp: Date.now(),
            workflow_id: workflowId,
            checkpoint_id: checkpointId,
            layer_index: layerIdx,
          };
          await this.eventStream.emit(checkpointEvent);
          yield checkpointEvent;
        }
      }

      // 4h. AIL Decision Point (Story 2.5-3)
      const hasErrors = failedTasks > 0;
      if (this.shouldTriggerAIL(this.config, layerIdx, hasErrors)) {
        const ailEvent: ExecutionEvent = {
          type: "decision_required",
          timestamp: Date.now(),
          workflow_id: workflowId,
          decision_type: "AIL",
          description: `Layer ${layerIdx} completed. Agent decision required.`,
        };
        await this.eventStream.emit(ailEvent);
        yield ailEvent;

        // Wait for agent command (non-blocking, via CommandQueue)
        const command = await this.waitForDecisionCommand("AIL", 60000); // 1 minute timeout

        if (!command || command.type === "continue") {
          // Default action: continue
          log.info(`AIL decision: continue (${command?.reason || "default"})`);
          const decision: StateUpdate = {
            decisions: [{
              type: "AIL",
              timestamp: Date.now(),
              description: "Agent decision: continue",
              outcome: "continue",
              metadata: { reason: command?.reason || "default" },
            }],
          };
          this.state = updateState(this.state, decision);
        } else if (command.type === "abort") {
          log.warn(`AIL decision: abort (${command.reason})`);
          const decision: StateUpdate = {
            decisions: [{
              type: "AIL",
              timestamp: Date.now(),
              description: "Agent decision: abort",
              outcome: "abort",
              metadata: { reason: command.reason },
            }],
          };
          this.state = updateState(this.state, decision);
          throw new Error(`Workflow aborted by agent: ${command.reason}`);
        } else if (command.type === "replan_dag") {
          // Story 2.5-3 Task 3: Handle replan command
          log.info(`AIL decision: replan_dag`);

          // Rate limiting check
          if (this.replanCount >= this.MAX_REPLANS) {
            log.warn(
              `Replan limit reached (${this.MAX_REPLANS}), ignoring replan command`,
            );
            const decision: StateUpdate = {
              decisions: [{
                type: "AIL",
                timestamp: Date.now(),
                description: "Agent decision: replan rejected (rate limit)",
                outcome: "replan_rejected",
                metadata: { reason: "rate_limit", max_replans: this.MAX_REPLANS },
              }],
            };
            this.state = updateState(this.state, decision);
            continue; // Skip replan, continue execution
          }

          // Check if DAGSuggester is available
          if (!this.dagSuggester) {
            log.error("DAGSuggester not set - cannot replan");
            const decision: StateUpdate = {
              decisions: [{
                type: "AIL",
                timestamp: Date.now(),
                description: "Agent decision: replan failed (no DAGSuggester)",
                outcome: "replan_failed",
                metadata: { error: "DAGSuggester not set" },
              }],
            };
            this.state = updateState(this.state, decision);
            continue;
          }

          // Execute replanning
          try {
            const replanStartTime = performance.now();

            const augmentedDAG = await this.dagSuggester.replanDAG(dag, {
              completedTasks: this.state.tasks,
              newRequirement: command.new_requirement,
              availableContext: command.available_context,
            });

            const replanTime = performance.now() - replanStartTime;

            // Check if DAG actually changed
            if (augmentedDAG.tasks.length === dag.tasks.length) {
              log.info("Replanning returned same DAG (no new tools found)");
              const decision: StateUpdate = {
                decisions: [{
                  type: "AIL",
                  timestamp: Date.now(),
                  description: "Agent decision: replan (no changes)",
                  outcome: "replan_no_changes",
                  metadata: { replan_time_ms: replanTime },
                }],
              };
              this.state = updateState(this.state, decision);
              continue;
            }

            // Update DAG with augmented structure
            dag = augmentedDAG;
            layers = this.topologicalSort(dag); // Re-sort with new tasks
            this.replanCount++;

            log.info(
              `✓ DAG replanned: ${dag.tasks.length - augmentedDAG.tasks.length} new tasks added (${replanTime.toFixed(1)}ms)`,
            );

            // Log decision
            const decision: StateUpdate = {
              decisions: [{
                type: "AIL",
                timestamp: Date.now(),
                description: "Agent decision: replan successful",
                outcome: "replan_success",
                metadata: {
                  new_tasks_count: augmentedDAG.tasks.length - dag.tasks.length,
                  replan_time_ms: replanTime,
                  replan_count: this.replanCount,
                },
              }],
            };
            this.state = updateState(this.state, decision);

            // Emit dag_replanned event
            const replanEvent: ExecutionEvent = {
              type: "state_updated",
              timestamp: Date.now(),
              workflow_id: workflowId,
              updates: {
                context_keys: ["dag_replanned"],
              },
            };
            await this.eventStream.emit(replanEvent);
            yield replanEvent;
          } catch (error) {
            log.error(`Replanning failed: ${error}`);
            const decision: StateUpdate = {
              decisions: [{
                type: "AIL",
                timestamp: Date.now(),
                description: "Agent decision: replan failed",
                outcome: "replan_failed",
                metadata: { error: String(error) },
              }],
            };
            this.state = updateState(this.state, decision);
          }
        }
      }

      // 4i. HIL Approval Checkpoint (Story 2.5-3)
      if (this.shouldRequireApproval(this.config, layerIdx, layer)) {
        const summary = this.generateHILSummary(layerIdx, layers);

        const hilEvent: ExecutionEvent = {
          type: "decision_required",
          timestamp: Date.now(),
          workflow_id: workflowId,
          decision_type: "HIL",
          description: summary,
        };
        await this.eventStream.emit(hilEvent);
        yield hilEvent;

        // Wait for human approval (5 minute timeout)
        const command = await this.waitForDecisionCommand("HIL", 300000);

        if (!command) {
          // Timeout: Default to abort (safer for critical operations)
          log.error("HIL approval timeout - aborting workflow");
          const decision: StateUpdate = {
            decisions: [{
              type: "HIL",
              timestamp: Date.now(),
              description: "Human approval timeout",
              outcome: "abort",
              metadata: { reason: "timeout" },
            }],
          };
          this.state = updateState(this.state, decision);
          throw new Error("Workflow aborted: HIL approval timeout");
        }

        if (command.type === "approval_response") {
          if (command.approved) {
            log.info("HIL approval: approved");
            const decision: StateUpdate = {
              decisions: [{
                type: "HIL",
                timestamp: Date.now(),
                description: "Human approved continuation",
                outcome: "approve",
                metadata: { feedback: command.feedback, checkpoint_id: checkpointId },
              }],
            };
            this.state = updateState(this.state, decision);
          } else {
            log.warn(`HIL approval: rejected (${command.feedback})`);
            const decision: StateUpdate = {
              decisions: [{
                type: "HIL",
                timestamp: Date.now(),
                description: "Human rejected continuation",
                outcome: "reject",
                metadata: { feedback: command.feedback, checkpoint_id: checkpointId },
              }],
            };
            this.state = updateState(this.state, decision);
            throw new Error(
              `Workflow aborted by human: ${command.feedback || "no reason provided"}`,
            );
          }
        }
      }
    }

    // 5. Emit workflow_complete event
    const totalTime = performance.now() - startTime;
    const completeEvent: ExecutionEvent = {
      type: "workflow_complete",
      timestamp: Date.now(),
      workflow_id: workflowId,
      total_time_ms: totalTime,
      successful_tasks: successfulTasks,
      failed_tasks: failedTasks,
    };
    await this.eventStream.emit(completeEvent);
    yield completeEvent;

    // 6. GraphRAG Feedback Loop (Story 2.5-3 Task 4)
    // Update knowledge graph with execution patterns (fire-and-forget, async)
    if (this.dagSuggester && successfulTasks > 0) {
      try {
        const graphEngine = this.dagSuggester.getGraphEngine();

        // Build WorkflowExecution record
        const execution = {
          execution_id: workflowId,
          executed_at: new Date(),
          intent_text: "workflow-execution", // Could be extracted from initial intent
          dag_structure: dag,
          success: failedTasks === 0,
          execution_time_ms: totalTime,
          error_message: failedTasks > 0 ? `${failedTasks} tasks failed` : undefined,
        };

        // Fire-and-forget: Update GraphRAG asynchronously (don't await)
        graphEngine.updateFromExecution(execution).then(() => {
          log.info(`✓ GraphRAG updated with execution patterns from ${workflowId}`);
        }).catch((error) => {
          log.error(`GraphRAG feedback loop failed: ${error}`);
        });
      } catch (error) {
        // Non-critical: Log but don't fail workflow
        log.error(`GraphRAG feedback loop failed: ${error}`);
      }
    }

    // 7. Close event stream
    await this.eventStream.close();

    // 8. Return final state
    return this.state;
  }

  /**
   * Resume workflow execution from checkpoint
   *
   * Story 2.5-2: Enables fault-tolerant execution via checkpoint/resume.
   * Restores WorkflowState from checkpoint and continues execution from
   * the next layer after the checkpointed layer.
   *
   * Flow:
   * 1. Load checkpoint from database
   * 2. Restore WorkflowState
   * 3. Emit workflow_start event (resumed=true)
   * 4. Calculate completed layers (0 to checkpoint.layer)
   * 5. Calculate remaining layers (checkpoint.layer + 1 to end)
   * 6. Execute remaining layers (same as executeStream)
   *
   * @param dag - DAG structure (same as original execution)
   * @param checkpoint_id - UUID of checkpoint to resume from
   * @returns Async generator yielding events, returning final state
   * @throws Error if checkpoint not found or checkpoint manager not set
   */
  async *resumeFromCheckpoint(
    dag: DAGStructure,
    checkpoint_id: string,
  ): AsyncGenerator<ExecutionEvent, WorkflowState, void> {
    if (!this.checkpointManager) {
      throw new Error(
        "CheckpointManager not set - call setCheckpointManager() first",
      );
    }

    const startTime = performance.now();

    // 1. Load checkpoint
    const checkpoint = await this.checkpointManager.loadCheckpoint(checkpoint_id);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpoint_id} not found`);
    }

    log.info(
      `Resuming workflow ${checkpoint.workflow_id} from checkpoint ${checkpoint_id} (layer ${checkpoint.layer})`,
    );

    // 2. Restore WorkflowState
    this.state = checkpoint.state;
    const workflowId = checkpoint.workflow_id;

    // 3. Reset event stream and command queue for resume
    this.eventStream = new EventStream();
    this.commandQueue = new CommandQueue();

    // 4. Topological sort (from ParallelExecutor)
    const layers = this.topologicalSort(dag);

    // 4. Emit workflow_start event (resume mode)
    const startEvent: ExecutionEvent = {
      type: "workflow_start",
      timestamp: Date.now(),
      workflow_id: workflowId,
      total_layers: layers.length,
    };
    await this.eventStream.emit(startEvent);
    yield startEvent;

    // 5. Calculate completed and remaining layers
    const completedLayerCount = checkpoint.layer + 1; // Layers 0 to checkpoint.layer are done
    const remainingLayers = layers.slice(completedLayerCount);

    log.info(
      `Skipping ${completedLayerCount} completed layers, executing ${remainingLayers.length} remaining layers`,
    );

    // 6. Execute remaining layers (same logic as executeStream)
    // Restore completed task results from state into results Map
    const results = new Map<string, any>();
    for (const task of this.state.tasks) {
      results.set(task.taskId, task);
    }

    let successfulTasks = this.state.tasks.filter((t) => t.status === "success").length;
    let failedTasks = this.state.tasks.filter((t) => t.status === "error").length;

    for (let layerIdx = 0; layerIdx < remainingLayers.length; layerIdx++) {
      const layer = remainingLayers[layerIdx];
      const actualLayerIdx = completedLayerCount + layerIdx;

      // 6a. Emit layer_start event
      const layerStartEvent: ExecutionEvent = {
        type: "layer_start",
        timestamp: Date.now(),
        workflow_id: workflowId,
        layer_index: actualLayerIdx,
        tasks_count: layer.length,
      };
      await this.eventStream.emit(layerStartEvent);
      yield layerStartEvent;

      // 6b. Process commands (non-blocking)
      const commands = await this.commandQueue.processCommandsAsync();
      for (const cmd of commands) {
        log.info(`Processing command: ${cmd.type}`);
        if (cmd.type === "abort") {
          log.warn(`Abort command received: ${cmd.reason}`);
        }
      }

      // 6c. Emit task_start for each task
      for (const task of layer) {
        const taskStartEvent: ExecutionEvent = {
          type: "task_start",
          timestamp: Date.now(),
          workflow_id: workflowId,
          task_id: task.id,
          tool: task.tool,
        };
        await this.eventStream.emit(taskStartEvent);
        yield taskStartEvent;
      }

      // 6d. Execute layer in parallel
      const layerResults = await Promise.allSettled(
        layer.map((task) => this.executeTask(task, results)),
      );

      // 6e. Collect results and emit task events
      const layerTaskResults = [];
      for (let i = 0; i < layer.length; i++) {
        const task = layer[i];
        const result = layerResults[i];

        if (result.status === "fulfilled") {
          successfulTasks++;
          const taskResult = {
            taskId: task.id,
            status: "success" as const,
            output: result.value.output,
            executionTimeMs: result.value.executionTimeMs,
          };
          results.set(task.id, taskResult);
          layerTaskResults.push(taskResult);

          const completeEvent: ExecutionEvent = {
            type: "task_complete",
            timestamp: Date.now(),
            workflow_id: workflowId,
            task_id: task.id,
            execution_time_ms: result.value.executionTimeMs,
          };
          await this.eventStream.emit(completeEvent);
          yield completeEvent;
        } else {
          failedTasks++;
          const errorMsg = result.reason?.message || String(result.reason);
          const taskResult = {
            taskId: task.id,
            status: "error" as const,
            error: errorMsg,
          };
          results.set(task.id, taskResult);
          layerTaskResults.push(taskResult);

          const errorEvent: ExecutionEvent = {
            type: "task_error",
            timestamp: Date.now(),
            workflow_id: workflowId,
            task_id: task.id,
            error: errorMsg,
          };
          await this.eventStream.emit(errorEvent);
          yield errorEvent;
        }
      }

      // 6f. Update state via reducers
      const stateUpdate: StateUpdate = {
        current_layer: actualLayerIdx,
        tasks: layerTaskResults,
      };
      this.state = updateState(this.state, stateUpdate);

      const stateEvent: ExecutionEvent = {
        type: "state_updated",
        timestamp: Date.now(),
        workflow_id: workflowId,
        updates: {
          tasks_added: layerTaskResults.length,
        },
      };
      await this.eventStream.emit(stateEvent);
      yield stateEvent;

      // 6g. Checkpoint (same as executeStream)
      if (this.checkpointManager) {
        try {
          const newCheckpoint = await this.checkpointManager.saveCheckpoint(
            workflowId,
            actualLayerIdx,
            this.state,
          );

          const checkpointEvent: ExecutionEvent = {
            type: "checkpoint",
            timestamp: Date.now(),
            workflow_id: workflowId,
            checkpoint_id: newCheckpoint.id,
            layer_index: actualLayerIdx,
          };
          await this.eventStream.emit(checkpointEvent);
          yield checkpointEvent;
        } catch (error) {
          log.error(`Checkpoint save failed at layer ${actualLayerIdx}: ${error}`);
          const checkpointEvent: ExecutionEvent = {
            type: "checkpoint",
            timestamp: Date.now(),
            workflow_id: workflowId,
            checkpoint_id: `failed-${actualLayerIdx}`,
            layer_index: actualLayerIdx,
          };
          await this.eventStream.emit(checkpointEvent);
          yield checkpointEvent;
        }
      }
    }

    // 7. Emit workflow_complete event
    const totalTime = performance.now() - startTime;
    const completeEvent: ExecutionEvent = {
      type: "workflow_complete",
      timestamp: Date.now(),
      workflow_id: workflowId,
      total_time_ms: totalTime,
      successful_tasks: successfulTasks,
      failed_tasks: failedTasks,
    };
    await this.eventStream.emit(completeEvent);
    yield completeEvent;

    // 8. Close event stream
    await this.eventStream.close();

    // 9. Return final state
    return this.state;
  }

  /**
   * Enqueue a command for processing
   *
   * Commands are processed non-blocking between DAG layers.
   * FIFO ordering guaranteed.
   *
   * @param command - Command to enqueue
   */
  enqueueCommand(command: any): void {
    this.commandQueue.enqueue(command);
  }

  /**
   * Get current workflow state (readonly snapshot)
   *
   * @returns Readonly state snapshot or null if not initialized
   */
  getState(): Readonly<WorkflowState> | null {
    return this.state ? getStateSnapshot(this.state) : null;
  }

  /**
   * Update workflow state manually (for testing/debugging)
   *
   * @param update - State update
   * @throws Error if state not initialized
   */
  updateState(update: StateUpdate): void {
    if (!this.state) {
      throw new Error("State not initialized - call executeStream() first");
    }
    this.state = updateState(this.state, update);
  }

  /**
   * Get event stream statistics
   */
  getEventStreamStats(): EventStreamStats {
    return this.eventStream.getStats();
  }

  /**
   * Get command queue statistics
   */
  getCommandQueueStats(): CommandQueueStats {
    return this.commandQueue.getStats();
  }

  /**
   * Override: Execute task with support for code_execution type (Story 3.4)
   *
   * Routes tasks based on type:
   * - code_execution: Delegate to sandbox with tool injection
   * - mcp_tool (default): Delegate to parent ParallelExecutor
   *
   * @param task - Task to execute
   * @param previousResults - Results from previous tasks
   * @returns Task output and execution time
   */
  protected override async executeTask(
    task: Task,
    previousResults: Map<string, TaskResult>,
  ): Promise<{ output: unknown; executionTimeMs: number }> {
    const taskType = task.type ?? "mcp_tool";

    // Route based on task type
    if (taskType === "code_execution") {
      // Story 3.5: Add retry logic for safe-to-fail sandbox tasks
      if (isSafeToFail(task)) {
        return await this.executeWithRetry(task, previousResults);
      }
      return await this.executeCodeTask(task, previousResults);
    } else {
      // Default: MCP tool execution (delegate to parent)
      return await super.executeTask(task, previousResults);
    }
  }

  /**
   * Execute safe-to-fail task with retry logic (Story 3.5 - Task 7)
   *
   * Retry strategy:
   * - Max 3 attempts
   * - Exponential backoff: 100ms, 200ms, 400ms
   * - Only for safe-to-fail tasks (idempotent)
   *
   * @param task - Safe-to-fail task
   * @param previousResults - Results from previous tasks
   * @returns Execution result
   */
  private async executeWithRetry(
    task: Task,
    previousResults: Map<string, TaskResult>,
  ): Promise<{ output: unknown; executionTimeMs: number }> {
    const maxAttempts = 3;
    const baseDelay = 100; // ms
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        log.debug(`Executing safe-to-fail task ${task.id} (attempt ${attempt}/${maxAttempts})`);
        return await this.executeCodeTask(task, previousResults);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxAttempts) {
          // Exponential backoff: 100ms, 200ms, 400ms
          const delay = baseDelay * Math.pow(2, attempt - 1);
          log.warn(
            `Safe-to-fail task ${task.id} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms: ${lastError.message}`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          log.error(
            `Safe-to-fail task ${task.id} failed after ${maxAttempts} attempts: ${lastError.message}`
          );
        }
      }
    }

    // All retries exhausted, throw the last error
    throw lastError!;
  }

  /**
   * Execute code_execution task (Story 3.4)
   *
   * Process:
   * 1. Resolve dependencies from previousResults
   * 2. Intent-based mode: vector search → inject tools
   * 3. Execute code in sandbox with context
   * 4. Return result for checkpoint persistence
   *
   * @param task - Code execution task
   * @param previousResults - Results from previous tasks
   * @returns Execution result
   */
  private async executeCodeTask(
    task: Task,
    previousResults: Map<string, TaskResult>,
  ): Promise<{ output: unknown; executionTimeMs: number }> {
    const startTime = performance.now();

    try {
      log.debug(`Executing code task: ${task.id}`);

      // Validate task structure
      if (!task.code) {
        throw new Error(
          `Code execution task ${task.id} missing required 'code' field`,
        );
      }

      // Build execution context: merge deps + custom context
      const executionContext: Record<string, unknown> = {
        ...task.arguments, // Custom context from task
      };

      // Resolve dependencies: $OUTPUT[dep_id] → actual results
      // Story 3.5: Pass full TaskResult to enable resilient patterns
      const deps: Record<string, TaskResult> = {};
      for (const depId of task.depends_on) {
        const depResult = previousResults.get(depId);

        // Critical failures halt execution
        if (depResult?.status === "error") {
          throw new Error(`Dependency task ${depId} failed: ${depResult.error}`);
        }
        if (!depResult) {
          throw new Error(`Dependency task ${depId} not found in results`);
        }

        // Story 3.5: Store full TaskResult (status, output, error)
        // Enables user code to check: if (deps.task?.status === "success")
        deps[depId] = depResult;
      }
      executionContext.deps = deps;

      // Intent-based mode: inject tools via vector search
      if (task.intent && this.contextBuilder && this.vectorSearch) {
        log.debug(`Intent-based code execution: "${task.intent}"`);

        const toolResults = await this.vectorSearch.searchTools(task.intent, 5, 0.6);

        if (toolResults.length > 0) {
          const toolContext = await this.contextBuilder.buildContextFromSearchResults(
            toolResults,
          );
          Object.assign(executionContext, toolContext);
          log.debug(`Injected ${Object.keys(toolContext).length} tool servers`);
        }
      }

      // Configure sandbox
      const sandboxConfig = task.sandbox_config || {};
      const executor = new DenoSandboxExecutor({
        timeout: sandboxConfig.timeout ?? 30000,
        memoryLimit: sandboxConfig.memoryLimit ?? 512,
        allowedReadPaths: sandboxConfig.allowedReadPaths ?? [],
      });

      // Execute code in sandbox with injected context (deps + custom context)
      const result = await executor.execute(task.code, executionContext);

      if (!result.success) {
        const error = result.error!;
        throw new Error(`${error.type}: ${error.message}`);
      }

      const executionTimeMs = performance.now() - startTime;

      log.info(`Code task ${task.id} succeeded`, {
        executionTimeMs: executionTimeMs.toFixed(2),
        resultType: typeof result.result,
      });

      // Return result for checkpoint persistence (AC #10, #11)
      return {
        output: {
          result: result.result,
          state: executionContext, // For checkpoint compatibility
          executionTimeMs: result.executionTimeMs,
        },
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = performance.now() - startTime;
      log.error(`Code task ${task.id} failed`, {
        error: error instanceof Error ? error.message : String(error),
        executionTimeMs,
      });
      throw error;
    }
  }
}
