/**
 * MCP Gateway Handler with Speculative Execution
 *
 * Orchestrates workflow execution with three modes:
 * 1. explicit_required: Low confidence, ask user
 * 2. suggestion: Medium confidence, show DAG suggestion
 * 3. speculative_execution: High confidence, execute and present results
 *
 * @module mcp/gateway-handler
 */

import * as log from "@std/log";
import type { DAGSuggester } from "../graphrag/dag-suggester.ts";
import type { GraphRAGEngine } from "../graphrag/graph-engine.ts";
import type {
  ExecutionMode,
  ExecutionResult,
  WorkflowIntent,
  DAGStructure,
  Task,
} from "../graphrag/types.ts";
import { AdaptiveThresholdManager } from "./adaptive-threshold.ts";

/**
 * Safety check configuration
 */
interface SafetyCheck {
  toolPattern: RegExp;
  requiresConfirmation: boolean;
  reason: string;
}

/**
 * Gateway configuration
 */
interface GatewayConfig {
  explicitThreshold: number; // Below this: explicit_required
  suggestionThreshold: number; // Below this: suggestion, above: speculative
  enableSpeculative: boolean;
  safetyChecks: SafetyCheck[];
}

/**
 * Default safety checks for dangerous operations
 */
const DEFAULT_SAFETY_CHECKS: SafetyCheck[] = [
  {
    toolPattern: /delete|remove|drop|truncate/i,
    requiresConfirmation: true,
    reason: "Destructive operation detected",
  },
  {
    toolPattern: /exec|execute|shell|command/i,
    requiresConfirmation: true,
    reason: "Shell execution detected",
  },
];

/**
 * MCP Gateway Handler
 *
 * Intelligent gateway that decides execution mode based on confidence,
 * implements safety checks, and supports speculative execution.
 */
export class GatewayHandler {
  private config: GatewayConfig;
  private adaptiveManager: AdaptiveThresholdManager;

  constructor(
    private graphEngine: GraphRAGEngine,
    private dagSuggester: DAGSuggester,
    config?: Partial<GatewayConfig>,
  ) {
    this.config = {
      explicitThreshold: 0.50,
      suggestionThreshold: 0.70,
      enableSpeculative: true,
      safetyChecks: DEFAULT_SAFETY_CHECKS,
      ...config,
    };

    this.adaptiveManager = new AdaptiveThresholdManager();
  }

  /**
   * Process workflow intent and decide execution mode
   *
   * @param intent - Workflow intent with natural language description
   * @returns Execution mode with appropriate response
   */
  async processIntent(intent: WorkflowIntent): Promise<ExecutionMode> {
    const startTime = performance.now();

    try {
      // 1. Get DAG suggestion
      const suggestion = await this.dagSuggester.suggestDAG(intent);

      if (!suggestion) {
        return {
          mode: "explicit_required",
          confidence: 0,
          explanation: "Unable to understand intent. Please be more specific or provide tool names explicitly.",
        };
      }

      // 2. Get adaptive thresholds
      const adaptiveThresholds = this.adaptiveManager.getThresholds();
      const explicitThreshold = adaptiveThresholds.explicitThreshold ?? this.config.explicitThreshold;
      const suggestionThreshold = adaptiveThresholds.suggestionThreshold ?? this.config.suggestionThreshold;

      // 3. Apply safety checks
      const safetyResult = this.applySafetyChecks(suggestion.dagStructure);
      if (!safetyResult.safe) {
        return {
          mode: "explicit_required",
          confidence: suggestion.confidence,
          dagStructure: suggestion.dagStructure,
          warning: safetyResult.reason,
          explanation: `Safety check failed: ${safetyResult.reason}. Please confirm this operation.`,
        };
      }

      // 4. Decide mode based on confidence
      if (suggestion.confidence < explicitThreshold) {
        // Low confidence: Ask user
        return {
          mode: "explicit_required",
          confidence: suggestion.confidence,
          dagStructure: suggestion.dagStructure,
          explanation: `Low confidence (${(suggestion.confidence * 100).toFixed(0)}%). ${suggestion.rationale}`,
          note: "Please review and confirm the suggested tools.",
        };
      } else if (suggestion.confidence < suggestionThreshold) {
        // Medium confidence: Show suggestion
        return {
          mode: "suggestion",
          confidence: suggestion.confidence,
          dagStructure: suggestion.dagStructure,
          explanation: suggestion.rationale,
          dependency_paths: suggestion.dependencyPaths,
          note: "Review the suggested DAG and approve to execute.",
        };
      } else if (this.config.enableSpeculative) {
        // High confidence: Speculative execution
        log.info(`Speculative execution triggered (confidence: ${suggestion.confidence.toFixed(2)})`);

        const results = await this.executeDAG(suggestion.dagStructure);
        const executionTime = performance.now() - startTime;

        // Record execution for adaptive learning
        const success = results.every((r) => r.success);
        this.adaptiveManager.recordExecution({
          confidence: suggestion.confidence,
          mode: "speculative",
          success,
          executionTime,
          timestamp: Date.now(),
        });

        return {
          mode: "speculative_execution",
          confidence: suggestion.confidence,
          dagStructure: suggestion.dagStructure,
          results,
          explanation: suggestion.rationale,
          execution_time_ms: executionTime,
          dag_used: suggestion.dagStructure,
        };
      } else {
        // Speculative disabled: fallback to suggestion
        return {
          mode: "suggestion",
          confidence: suggestion.confidence,
          dagStructure: suggestion.dagStructure,
          explanation: suggestion.rationale,
          note: "Speculative execution is disabled. Review and approve to execute.",
        };
      }
    } catch (error) {
      log.error(`Gateway processing failed: ${error}`);
      return {
        mode: "explicit_required",
        confidence: 0,
        error: `Internal error: ${error}`,
      };
    }
  }

  /**
   * Apply safety checks to DAG structure
   *
   * @param dag - DAG structure to check
   * @returns Safety check result
   */
  private applySafetyChecks(dag: DAGStructure): { safe: boolean; reason?: string } {
    for (const task of dag.tasks) {
      for (const check of this.config.safetyChecks) {
        if (check.toolPattern.test(task.tool) && check.requiresConfirmation) {
          return {
            safe: false,
            reason: `${check.reason}: ${task.tool}`,
          };
        }
      }
    }

    return { safe: true };
  }

  /**
   * Execute DAG speculatively
   *
   * Simulates execution for now. In production, this would call the MCP server.
   *
   * @param dag - DAG structure to execute
   * @returns Array of execution results
   */
  private async executeDAG(dag: DAGStructure): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    // Execute tasks in dependency order
    const executedTasks = new Set<string>();

    for (const task of dag.tasks) {
      // Wait for dependencies
      const depsReady = task.depends_on.every((dep) => executedTasks.has(dep));
      if (!depsReady) {
        results.push({
          taskId: task.id,
          tool: task.tool,
          success: false,
          error: "Dependency not ready",
          executionTime: 0,
        });
        continue;
      }

      // Simulate execution
      const startTime = performance.now();
      try {
        // TODO: Call actual MCP tool execution
        const result = await this.simulateToolExecution(task);
        const executionTime = performance.now() - startTime;

        results.push({
          taskId: task.id,
          tool: task.tool,
          success: true,
          result,
          executionTime,
        });

        executedTasks.add(task.id);
      } catch (error) {
        results.push({
          taskId: task.id,
          tool: task.tool,
          success: false,
          error: String(error),
          executionTime: performance.now() - startTime,
        });
      }
    }

    return results;
  }

  /**
   * Simulate tool execution (placeholder)
   *
   * @param task - Task to execute
   * @returns Simulated result
   */
  private async simulateToolExecution(task: Task): Promise<unknown> {
    // Simulate async execution
    await new Promise((resolve) => setTimeout(resolve, 10));
    return {
      taskId: task.id,
      tool: task.tool,
      status: "completed",
      output: `Simulated execution of ${task.tool}`,
    };
  }

  /**
   * Record user feedback on suggestion
   *
   * @param confidence - Confidence of the suggestion
   * @param accepted - Whether user accepted the suggestion
   */
  recordUserFeedback(confidence: number, accepted: boolean): void {
    this.adaptiveManager.recordExecution({
      confidence,
      mode: "suggestion",
      success: true,
      userAccepted: accepted,
      timestamp: Date.now(),
    });
  }

  /**
   * Get current adaptive thresholds
   *
   * @returns Current thresholds
   */
  getAdaptiveThresholds(): { explicitThreshold: number; suggestionThreshold: number } {
    const thresholds = this.adaptiveManager.getThresholds();
    return {
      explicitThreshold: thresholds.explicitThreshold ?? this.config.explicitThreshold,
      suggestionThreshold: thresholds.suggestionThreshold ?? this.config.suggestionThreshold,
    };
  }

  /**
   * Get speculative execution metrics
   *
   * @returns Metrics
   */
  getMetrics() {
    return this.adaptiveManager.getMetrics();
  }

  /**
   * Get graph statistics
   *
   * @returns Current graph statistics
   */
  getGraphStats() {
    return this.graphEngine.getStats();
  }
}
