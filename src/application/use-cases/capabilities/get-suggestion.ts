/**
 * Get Suggestion Use Case
 *
 * Generates workflow suggestions using SHGAT + DR-DSP backward pathfinding.
 * Returns suggested DAGs with call names and input schemas for agent execution.
 *
 * @module application/use-cases/capabilities/get-suggestion
 */

import * as log from "@std/log";
import type { UseCaseResult } from "../shared/types.ts";
import type {
  GetSuggestionRequest,
  GetSuggestionResult,
  SuggestedTask,
} from "./types.ts";

// ============================================================================
// Interfaces (Clean Architecture - no concrete imports)
// ============================================================================

/**
 * DR-DSP algorithm interface
 */
export interface IDRDSP {
  findShortestHyperpath(source: string, target: string): {
    path: string[];
    hyperedges: Array<{ id: string }>;
    totalWeight: number;
    nodeSequence: string[];
    found: boolean;
  };
  hasNode(id: string): boolean;
}

/** Default threshold below which we try tool composition */
const DEFAULT_COMPOSITION_THRESHOLD = 0.5;

/**
 * Capability store interface
 */
export interface ICapabilityStore {
  findById(id: string): Promise<{
    id: string;
    toolsUsed?: string[];
    parametersSchema?: unknown;
  } | null>;
}

/**
 * Graph engine interface (for tool schema lookups)
 */
export interface IGraphEngine {
  getToolNode(toolId: string): {
    name: string;
    schema?: { inputSchema?: unknown };
  } | null;
}

/**
 * Capability registry interface (for call names)
 */
export interface ICapabilityRegistry {
  getByWorkflowPatternId(patternId: string): Promise<{
    namespace: string;
    action: string;
  } | null>;
}

/**
 * Decision logger interface (for observability)
 * Re-exported from telemetry module for convenience
 */
export type { IDecisionLogger } from "../../../telemetry/decision-logger.ts";

// ============================================================================
// Use Case
// ============================================================================

/**
 * Use case for getting workflow suggestions via DR-DSP
 *
 * Flow:
 * 1. Look up the best capability from SHGAT
 * 2. Use DR-DSP to find hyperpath through capability's tools
 * 3. Enrich each node with call name and input schema
 */
export class GetSuggestionUseCase {
  constructor(
    private readonly capabilityStore: ICapabilityStore,
    private readonly graphEngine: IGraphEngine,
    private readonly drdsp?: IDRDSP,
    private readonly capabilityRegistry?: ICapabilityRegistry,
    private readonly decisionLogger?: import("../../../telemetry/decision-logger.ts").IDecisionLogger,
  ) {}

  /**
   * Execute the get suggestion use case
   */
  async execute(
    request: GetSuggestionRequest,
  ): Promise<UseCaseResult<GetSuggestionResult>> {
    const { intent, bestCapability, discoveredItems, correlationId } = request;
    const compositionThreshold = request.compositionThreshold ?? DEFAULT_COMPOSITION_THRESHOLD;

    // Check if we should try item composition instead of using single capability
    const shouldTryComposition = !bestCapability || bestCapability.score < compositionThreshold;

    if (shouldTryComposition && discoveredItems && discoveredItems.length > 1 && this.drdsp) {
      log.info(`[GetSuggestionUseCase] Trying item composition (capScore=${bestCapability?.score?.toFixed(2) ?? 'none'}, threshold=${compositionThreshold}, items=${discoveredItems.length})`);
      const composedResult = await this.composeItemsViaProvides(discoveredItems, intent, correlationId);
      if (composedResult) {
        return composedResult;
      }
      // Fall through to capability-based suggestion if composition failed
    }

    // No capability = no suggestion
    if (!bestCapability) {
      return {
        success: true,
        data: { confidence: 0 },
      };
    }

    try {
      // Look up capability
      const cap = await this.capabilityStore.findById(bestCapability.id);
      if (!cap) {
        log.warn(`GetSuggestionUseCase: capability not found: ${bestCapability.id}`);
        return {
          success: true,
          data: { confidence: bestCapability.score },
        };
      }

      // No tools = return capability itself
      if (!cap.toolsUsed || cap.toolsUsed.length === 0) {
        return await this.buildSingleCapabilitySuggestion(bestCapability);
      }

      // Single tool = return it directly
      if (cap.toolsUsed.length === 1) {
        const task = await this.buildTaskFromTool(cap.toolsUsed[0], "task_0", []);
        return {
          success: true,
          data: {
            suggestedDag: task ? { tasks: [task] } : undefined,
            confidence: bestCapability.score,
          },
        };
      }

      // No DR-DSP = fall back to simple sequence
      if (!this.drdsp) {
        return await this.buildSequenceFromTools(cap.toolsUsed, bestCapability.score);
      }

      // Multiple tools - use DR-DSP backward pathfinding
      const startTool = cap.toolsUsed[0];
      const endTool = cap.toolsUsed[cap.toolsUsed.length - 1];
      const pathResult = this.drdsp.findShortestHyperpath(startTool, endTool);

      if (!pathResult.found || pathResult.nodeSequence.length === 0) {
        // DR-DSP failed - fall back to simple sequence
        return await this.buildSequenceFromTools(cap.toolsUsed, bestCapability.score);
      }

      // Build tasks from hyperpath
      const tasks: SuggestedTask[] = [];

      for (let i = 0; i < pathResult.nodeSequence.length; i++) {
        const nodeId = pathResult.nodeSequence[i];
        const taskId = `task_${i}`;
        const dependsOn = i > 0 ? [`task_${i - 1}`] : [];

        // Check if node is a capability (hyperedge) or tool
        const hyperedge = pathResult.hyperedges[i];

        if (hyperedge) {
          // This is a capability - extract the actual capability ID from hyperedge
          // Hyperedge IDs are like "invokes:UUID" or "contains:UUID" - extract the UUID
          const capabilityId = hyperedge.targets?.[0] ?? hyperedge.id.split(":").pop();
          if (capabilityId && !capabilityId.includes(":")) {
            const task = await this.buildTaskFromCapability(capabilityId, taskId, dependsOn);
            if (task) tasks.push(task);
          }
        } else {
          // This is a tool
          const task = await this.buildTaskFromTool(nodeId, taskId, dependsOn);
          if (task) tasks.push(task);
        }
      }

      log.debug(`GetSuggestionUseCase: built suggestedDag`, {
        capabilityId: bestCapability.id,
        pathLength: pathResult.nodeSequence.length,
        tasksCount: tasks.length,
      });

      // Trace DR-DSP decision
      this.decisionLogger?.logDecision({
        algorithm: "DRDSP",
        mode: "passive_suggestion",
        targetType: "capability",
        intent,
        finalScore: 1.0 / (1 + pathResult.totalWeight),
        threshold: 0,
        decision: "accepted",
        targetId: bestCapability.id,
        targetName: bestCapability.id.split(":").pop() ?? bestCapability.id.substring(0, 12),
        correlationId,
        signals: {
          pathFound: true,
          pathLength: pathResult.nodeSequence.length,
          pathWeight: pathResult.totalWeight,
        },
        params: {
          reliabilityFactor: 1.0,
        },
      });

      return {
        success: true,
        data: {
          suggestedDag: { tasks },
          confidence: bestCapability.score,
        },
      };
    } catch (error) {
      log.error(`GetSuggestionUseCase failed: ${error}`);
      return {
        success: false,
        error: {
          code: "SUGGESTION_FAILED",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Build a single task from a tool ID
   */
  private async buildTaskFromTool(
    toolId: string,
    taskId: string,
    dependsOn: string[],
  ): Promise<SuggestedTask | null> {
    const toolNode = this.graphEngine.getToolNode(toolId);
    if (!toolNode) {
      log.warn(`GetSuggestionUseCase: tool not found: ${toolId}`);
      return null;
    }

    return {
      id: taskId,
      callName: toolId,
      type: "tool",
      inputSchema: toolNode.schema?.inputSchema,
      dependsOn,
    };
  }

  /**
   * Build a single task from a capability ID
   */
  private async buildTaskFromCapability(
    capabilityId: string,
    taskId: string,
    dependsOn: string[],
  ): Promise<SuggestedTask | null> {
    // Defensive check: reject hyperedge IDs (they contain colons like "invokes:uuid")
    if (capabilityId.includes(":") && !capabilityId.match(/^[0-9a-f]{8}-/i)) {
      log.warn(`GetSuggestionUseCase: rejecting invalid capabilityId (looks like hyperedge): ${capabilityId}`);
      return null;
    }

    const cap = await this.capabilityStore.findById(capabilityId);
    if (!cap) {
      log.warn(`GetSuggestionUseCase: capability not found: ${capabilityId}`);
      return null;
    }

    // Get call name from registry
    let callName = capabilityId.substring(0, 8); // Fallback to short ID
    if (this.capabilityRegistry) {
      const record = await this.capabilityRegistry.getByWorkflowPatternId(capabilityId);
      if (record) {
        callName = `${record.namespace}:${record.action}`;
      }
    }

    return {
      id: taskId,
      callName,
      type: "capability",
      inputSchema: cap.parametersSchema,
      dependsOn,
    };
  }

  /**
   * Build suggestion for single capability (no DR-DSP)
   */
  private async buildSingleCapabilitySuggestion(
    bestCapability: { id: string; score: number },
  ): Promise<UseCaseResult<GetSuggestionResult>> {
    const task = await this.buildTaskFromCapability(bestCapability.id, "task_0", []);

    return {
      success: true,
      data: {
        suggestedDag: task ? { tasks: [task] } : undefined,
        confidence: bestCapability.score,
      },
    };
  }

  /**
   * Build simple sequence from tools (fallback when DR-DSP fails)
   */
  private async buildSequenceFromTools(
    toolsUsed: string[],
    confidence: number,
  ): Promise<UseCaseResult<GetSuggestionResult>> {
    const tasks: SuggestedTask[] = [];

    for (let i = 0; i < toolsUsed.length; i++) {
      const task = await this.buildTaskFromTool(
        toolsUsed[i],
        `task_${i}`,
        i > 0 ? [`task_${i - 1}`] : [],
      );
      if (task) tasks.push(task);
    }

    return {
      success: true,
      data: {
        suggestedDag: { tasks },
        confidence,
      },
    };
  }

  /**
   * Compose items (tools + capabilities) via DR-DSP provides edges
   *
   * Tries to find connected paths between discovered items using
   * provides edges (output → input schema matching).
   */
  private async composeItemsViaProvides(
    items: Array<{ id: string; score: number; type: "tool" | "capability" }>,
    intent: string,
    correlationId?: string,
  ): Promise<UseCaseResult<GetSuggestionResult> | null> {
    if (!this.drdsp || items.length < 2) return null;

    // Sort items by score descending
    const sortedItems = [...items].sort((a, b) => b.score - a.score);

    // Find connected item pairs via provides edges
    const connectedPairs: Array<{ from: string; to: string; fromType: string; toType: string; weight: number }> = [];

    for (let i = 0; i < sortedItems.length; i++) {
      for (let j = 0; j < sortedItems.length; j++) {
        if (i === j) continue;

        const fromItem = sortedItems[i];
        const toItem = sortedItems[j];

        // Check if both items are registered in DR-DSP
        if (!this.drdsp.hasNode(fromItem.id) || !this.drdsp.hasNode(toItem.id)) continue;

        // Try to find path via provides edges
        const pathResult = this.drdsp.findShortestHyperpath(fromItem.id, toItem.id);
        if (pathResult.found && pathResult.totalWeight < Infinity) {
          connectedPairs.push({
            from: fromItem.id,
            to: toItem.id,
            fromType: fromItem.type,
            toType: toItem.type,
            weight: pathResult.totalWeight,
          });
        }
      }
    }

    if (connectedPairs.length === 0) {
      log.debug("[GetSuggestionUseCase] No connected item pairs found via provides edges");
      return null;
    }

    // Build DAG from connected pairs
    // Strategy: take the best scoring pair, then extend with other connected items
    connectedPairs.sort((a, b) => a.weight - b.weight); // Best path first
    const bestPair = connectedPairs[0];

    // Find the full path for the best pair
    const pathResult = this.drdsp.findShortestHyperpath(bestPair.from, bestPair.to);
    if (!pathResult.found) return null;

    // Build tasks from path - determine type from original items or hyperedges
    const tasks: SuggestedTask[] = [];
    const addedItems = new Set<string>();
    const itemTypeMap = new Map(sortedItems.map(i => [i.id, i.type]));

    // Helper to check if a node ID is a hyperedge (not a tool/capability)
    const isHyperedgeId = (id: string) =>
      id.startsWith("seq:") || id.startsWith("contains:") || id.startsWith("provides:") || id.startsWith("invokes:");

    for (let i = 0; i < pathResult.nodeSequence.length; i++) {
      const nodeId = pathResult.nodeSequence[i];

      // Skip hyperedge IDs - they're not tools or capabilities
      if (isHyperedgeId(nodeId)) continue;

      if (addedItems.has(nodeId)) continue;
      addedItems.add(nodeId);

      const taskId = `task_${tasks.length}`;
      const dependsOn = tasks.length > 0 ? [`task_${tasks.length - 1}`] : [];

      // Determine if this node is a tool or capability from our discovered items
      const itemType = itemTypeMap.get(nodeId);

      // Skip nodes not in our discovered items (they might be intermediate nodes)
      if (!itemType) {
        log.debug(`[GetSuggestionUseCase] Skipping unknown node in path: ${nodeId}`);
        continue;
      }

      let task: SuggestedTask | null = null;
      if (itemType === "capability") {
        task = await this.buildTaskFromCapability(nodeId, taskId, dependsOn);
      } else {
        task = await this.buildTaskFromTool(nodeId, taskId, dependsOn);
      }

      if (task) tasks.push(task);
    }

    if (tasks.length < 2) {
      log.debug("[GetSuggestionUseCase] Composition resulted in < 2 tasks");
      return null;
    }

    // Calculate confidence from item scores and path weight
    const avgItemScore = sortedItems.slice(0, tasks.length).reduce((sum, t) => sum + t.score, 0) / tasks.length;
    const pathPenalty = Math.exp(-pathResult.totalWeight / 10); // Penalize long paths
    const confidence = avgItemScore * pathPenalty;

    const toolCount = tasks.filter(t => t.type === "tool").length;
    const capCount = tasks.filter(t => t.type === "capability").length;

    log.info(`[GetSuggestionUseCase] Composed DAG from ${tasks.length} items (${toolCount} tools, ${capCount} caps) via provides edges`, {
      items: tasks.map(t => `${t.callName}[${t.type}]`),
      pathWeight: pathResult.totalWeight,
      confidence: confidence.toFixed(3),
    });

    // Log composition decision
    this.decisionLogger?.logDecision({
      algorithm: "DRDSP",
      mode: "passive_suggestion",
      targetType: "capability", // Mixed composition logged as capability
      intent,
      finalScore: confidence,
      threshold: DEFAULT_COMPOSITION_THRESHOLD,
      decision: "accepted",
      targetId: tasks.map(t => t.callName).join(" → "),
      targetName: `${tasks.length}-item DAG (${toolCount}T/${capCount}C)`,
      correlationId,
      signals: {
        pathFound: true,
        pathLength: tasks.length,
        pathWeight: pathResult.totalWeight,
      },
      params: {
        reliabilityFactor: pathPenalty,
      },
    });

    return {
      success: true,
      data: {
        suggestedDag: { tasks },
        confidence,
      },
    };
  }
}
