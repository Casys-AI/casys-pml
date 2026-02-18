/**
 * Local Executor - Execute code locally via SandboxExecutor
 *
 * @module cli/shared/local-executor
 */

import type { LocalExecutionResult, ContinueWorkflowParams, Logger, PendingApprovalState, DAGTask } from "./types.ts";
import { SandboxExecutor } from "../../execution/mod.ts";
import { CapabilityLoader } from "../../loader/mod.ts";
import type { CollectedUiResource } from "../../types/ui-orchestration.ts";

/**
 * Execute code locally via SandboxExecutor (hybrid routing).
 *
 * Called when server returns execute_locally response.
 *
 * @param code - Code to execute in sandbox
 * @param loader - CapabilityLoader for client tool routing
 * @param cloudUrl - Cloud URL for server tool routing
 * @param fqdnMap - Map of tool ID to FQDN (resolved by server for multi-tenant)
 * @param continueWorkflow - Optional: approval from previous HIL pause
 * @param logger - Optional logger for debug output
 * @param serverWorkflowId - Workflow ID from server (used as traceId per ADR-065 unified ID)
 * @param dagTasks - Story 11.4: DAG tasks with layerIndex from server
 * @returns Execution result, error, or approval_required for HIL
 */
export async function executeLocalCode(
  code: string,
  loader: CapabilityLoader | null,
  cloudUrl: string,
  fqdnMap: Map<string, string>,
  continueWorkflow?: ContinueWorkflowParams,
  logger?: Logger,
  serverWorkflowId?: string,
  dagTasks?: DAGTask[],
  onUiCollected?: (ui: CollectedUiResource, parsedResult: unknown) => void,
): Promise<LocalExecutionResult> {
  const apiKey = Deno.env.get("PML_API_KEY");

  const executor = new SandboxExecutor({
    cloudUrl,
    apiKey,
    onUiCollected,
  });

  // Track if we hit an approval_required during execution
  const state: { pendingApproval: PendingApprovalState | null } = { pendingApproval: null };

  // ADR-065: Unified workflowId/traceId
  // Priority: HIL continuation > server-provided > generate new
  const workflowId = continueWorkflow?.workflowId ?? serverWorkflowId;
  if (workflowId) {
    logger?.debug(`Using workflowId: ${workflowId}${continueWorkflow?.workflowId ? " (HIL continuation)" : " (from server)"}`);
  }

  // Issue 6 fix: Pass FQDN map to loader for trace recording
  // This allows taskResults.tool to contain FQDNs which server resolves to UUIDs
  if (loader) {
    loader.setFqdnMap(fqdnMap);
  }

  try {
    const result = await executor.execute(code, {
      context: {},
      // Client tool handler - routes through CapabilityLoader
      // ADR-041: parentTraceId passed for parent-child trace linking
      clientToolHandler: async (toolId: string, args: unknown, parentTraceId: string) => {
        if (!loader) {
          throw new Error("Capability loader not initialized for client tools");
        }

        // Use server-resolved FQDN (multi-tenant support)
        const fqdn = fqdnMap.get(toolId);
        if (!fqdn) {
          throw new Error(`No FQDN resolved for tool ${toolId} - server should have provided it`);
        }

        logger?.debug(`Local tool call: ${toolId} → ${fqdn}${continueWorkflow ? " (with continue_workflow)" : ""}`);

        // Pass workflowId (from server or continuation) for LearningContext correlation on integrity approvals
        const callResult = await loader.callWithFqdn(fqdn, args, continueWorkflow, parentTraceId, workflowId);

        // Check if it's an approval_required response (HIL pause)
        if (CapabilityLoader.isApprovalRequired(callResult)) {
          logger?.debug(`Tool ${toolId} requires approval - pausing for HIL`);
          state.pendingApproval = { approval: callResult, toolId };
          throw new Error(`__APPROVAL_REQUIRED__:${toolId}`);
        }

        return callResult;
      },
      workflowId, // ADR-065: unified workflowId/traceId
      fqdnMap, // Map short format to FQDN for layerIndex resolution
    });

    if (!result.success) {
      // Check if the error was our approval marker
      if (state.pendingApproval && result.error?.message?.startsWith("__APPROVAL_REQUIRED__:")) {
        return {
          status: "approval_required",
          approval: state.pendingApproval.approval,
          toolId: state.pendingApproval.toolId,
        };
      }

      // ADR-041: Enqueue parent trace for failed execution, then flush
      // ADR-065: Pass workflowId for capability creation (traceId = workflowId)
      // Story 11.4: Pass dagTasks for layerIndex in traces
      if (loader) {
        loader.enqueueDirectExecutionTrace(
          result.traceId,
          false,
          result.durationMs,
          result.error?.message,
          result.toolCallRecords,
          workflowId, // Server workflowId for LearningContext lookup
          dagTasks,
        );
        await loader.flushTraces();
      }

      return {
        status: "error",
        error: result.error?.message ?? "Sandbox execution failed",
      };
    }

    // ADR-041: Enqueue parent trace for successful execution, then flush
    // ADR-065: Pass workflowId for capability creation (traceId = workflowId)
    // Story 11.4: Pass dagTasks for layerIndex in traces
    if (loader) {
      loader.enqueueDirectExecutionTrace(
        result.traceId,
        true,
        result.durationMs,
        undefined,
        result.toolCallRecords,
        workflowId, // Server workflowId for LearningContext lookup
        dagTasks,
      );
      await loader.flushTraces();
    }

    return {
      status: "success",
      result: result.value,
      durationMs: result.durationMs,
      toolCallRecords: result.toolCallRecords ?? [],
      // Story 16.3: Propagate collected UIs from sandbox to MCP response layer
      ...(result.collectedUi ? { collectedUi: result.collectedUi } : {}),
    };
  } catch (error) {
    // Check if this was an approval_required that bubbled up
    if (state.pendingApproval) {
      return {
        status: "approval_required",
        approval: state.pendingApproval.approval,
        toolId: state.pendingApproval.toolId,
      };
    }

    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
