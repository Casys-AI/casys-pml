/**
 * Graph API Data Mappers
 *
 * Transforms internal graph data structures to snake_case external API format.
 *
 * @module api/graph-mappers
 */

import type {
  CapabilityNode,
  GraphEdge,
  GraphNode,
  SequenceEdge,
  ToolInvocationNode,
} from "../capabilities/types.ts";
import { toolsByCategory } from "../../lib/std/mod.ts";

// Build lookup: tool name -> category (module) for std tools
const stdToolCategoryMap = new Map<string, string>();
for (const [category, tools] of Object.entries(toolsByCategory)) {
  for (const tool of tools) {
    stdToolCategoryMap.set(tool.name, category);
  }
}

/**
 * UUID v4 regex pattern for detecting capability UUIDs in executedPath
 * Issue 6 fix: executedPath now contains UUIDs for capabilities, names for tools
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resolve executedPath entries to display names.
 * - Tool names (e.g., "std:psql_query") → kept as-is
 * - Capability UUIDs → resolved via capabilityNameMap, fallback to short UUID
 *
 * @param executedPath - Array of tool names and capability UUIDs
 * @param capabilityNameMap - Map of UUID → display name (namespace:action)
 */
export function resolveExecutedPathForDisplay(
  executedPath: string[] | undefined,
  capabilityNameMap?: Map<string, string>,
): string[] | undefined {
  if (!executedPath) return undefined;

  return executedPath.map((entry) => {
    // If it's a UUID, resolve to name
    if (UUID_REGEX.test(entry)) {
      const name = capabilityNameMap?.get(entry);
      if (name) return name;
      // Fallback: show short UUID prefix for unresolved
      return `cap:${entry.slice(0, 8)}`;
    }
    // Tool names pass through unchanged
    return entry;
  });
}

/**
 * Map node data to snake_case for external API
 *
 * @param node - Graph node to map
 * @param capabilityNameMap - Optional map of UUID → display name for resolving executedPath
 */
export function mapNodeData(
  node: GraphNode,
  capabilityNameMap?: Map<string, string>,
): Record<string, unknown> {
  if (node.data.type === "capability") {
    const capNode = node as CapabilityNode;
    return {
      data: {
        id: node.data.id,
        type: node.data.type,
        label: node.data.label,
        description: capNode.data.description,
        parent: node.data.parent,
        code_snippet: node.data.codeSnippet,
        success_rate: node.data.successRate,
        usage_count: node.data.usageCount,
        tools_count: node.data.toolsCount,
        pagerank: capNode.data.pagerank,
        community_id: capNode.data.communityId,
        fqdn: capNode.data.fqdn,
        tools_used: capNode.data.toolsUsed,
        hierarchy_level: capNode.data.hierarchyLevel ?? 0,
        tool_invocations: capNode.data.toolInvocations?.map((inv) => ({
          id: inv.id,
          tool: inv.tool,
          ts: inv.ts,
          duration_ms: inv.durationMs,
          sequence_index: inv.sequenceIndex,
        })),
        traces: capNode.data.traces?.map((trace) => ({
          id: trace.id,
          capability_id: trace.capabilityId,
          executed_at: trace.executedAt instanceof Date
            ? trace.executedAt.toISOString()
            : trace.executedAt,
          success: trace.success,
          duration_ms: trace.durationMs,
          error_message: trace.errorMessage,
          priority: trace.priority,
          // Two-level DAG: All logical operations (includes non-executable ops for display)
          // Issue 6 fix: resolve capability UUIDs to display names
          executed_path: resolveExecutedPathForDisplay(trace.executedPath, capabilityNameMap),
          task_results: trace.taskResults.map((r) => ({
            task_id: r.taskId,
            tool: r.tool,
            resolved_tool: r.resolvedTool,
            args: r.args,
            result: r.result,
            success: r.success,
            duration_ms: r.durationMs,
            layer_index: r.layerIndex,
            // Phase 2a: Fusion metadata for two-level DAG
            is_fused: r.isFused,
            logical_operations: r.logicalOperations?.map((op) => ({
              tool_id: op.toolId,
              duration_ms: op.durationMs,
            })),
            // Loop Abstraction metadata
            loop_id: r.loopId,
            loop_type: r.loopType,
            loop_condition: r.loopCondition,
            body_tools: r.bodyTools,
            is_capability_call: r.isCapabilityCall,
            nested_tools: r.nestedTools,
          })),
        })),
      },
    };
  } else if (node.data.type === "tool_invocation") {
    const invNode = node as ToolInvocationNode;
    return {
      data: {
        id: invNode.data.id,
        parent: invNode.data.parent,
        type: invNode.data.type,
        tool: invNode.data.tool,
        server: invNode.data.server,
        label: invNode.data.label,
        ts: invNode.data.ts,
        duration_ms: invNode.data.durationMs,
        sequence_index: invNode.data.sequenceIndex,
      },
    };
  } else {
    // Tool node - add module for std tools
    const toolName = node.data.label;
    const module = node.data.server === "std" ? stdToolCategoryMap.get(toolName) : undefined;

    return {
      data: {
        id: node.data.id,
        parent: node.data.parent,
        parents: node.data.parents,
        type: node.data.type,
        server: node.data.server,
        module,
        label: node.data.label,
        pagerank: node.data.pagerank,
        degree: node.data.degree,
        community_id: node.data.communityId,
      },
    };
  }
}

/**
 * Map edge data to snake_case for external API
 */
export function mapEdgeData(edge: GraphEdge): Record<string, unknown> {
  if (edge.data.edgeType === "capability_link") {
    return {
      data: {
        id: edge.data.id,
        source: edge.data.source,
        target: edge.data.target,
        shared_tools: edge.data.sharedTools,
        edge_type: edge.data.edgeType,
        edge_source: edge.data.edgeSource,
      },
    };
  } else if (edge.data.edgeType === "sequence") {
    const seqEdge = edge as SequenceEdge;
    return {
      data: {
        id: seqEdge.data.id,
        source: seqEdge.data.source,
        target: seqEdge.data.target,
        edge_type: seqEdge.data.edgeType,
        time_delta_ms: seqEdge.data.timeDeltaMs,
        is_parallel: seqEdge.data.isParallel,
      },
    };
  } else {
    return {
      data: {
        id: edge.data.id,
        source: edge.data.source,
        target: edge.data.target,
        edge_type: edge.data.edgeType,
        edge_source: edge.data.edgeSource,
        observed_count: edge.data.observedCount,
      },
    };
  }
}
