/**
 * Local Executor - Execute code locally via SandboxExecutor
 *
 * @module cli/shared/local-executor
 */

import type { LocalExecutionResult, ContinueWorkflowParams, Logger, PendingApprovalState } from "./types.ts";
import { SandboxExecutor } from "../../execution/mod.ts";
import { CapabilityLoader } from "../../loader/mod.ts";

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
 * @returns Execution result, error, or approval_required for HIL
 */
export async function executeLocalCode(
  code: string,
  loader: CapabilityLoader | null,
  cloudUrl: string,
  fqdnMap: Map<string, string>,
  continueWorkflow?: ContinueWorkflowParams,
  logger?: Logger,
): Promise<LocalExecutionResult> {
  const apiKey = Deno.env.get("PML_API_KEY");

  const executor = new SandboxExecutor({
    cloudUrl,
    apiKey,
  });

  // Track if we hit an approval_required during execution
  const state: { pendingApproval: PendingApprovalState | null } = { pendingApproval: null };

  try {
    const result = await executor.execute(
      code,
      {},
      // Client tool handler - routes through CapabilityLoader
      async (toolId: string, args: unknown) => {
        if (!loader) {
          throw new Error("Capability loader not initialized for client tools");
        }

        // Use server-resolved FQDN (multi-tenant support)
        const fqdn = fqdnMap.get(toolId);
        if (!fqdn) {
          throw new Error(`No FQDN resolved for tool ${toolId} - server should have provided it`);
        }

        logger?.debug(`Local tool call: ${toolId} → ${fqdn}${continueWorkflow ? " (with continue_workflow)" : ""}`);

        const callResult = await loader.callWithFqdn(fqdn, args, continueWorkflow);

        // Check if it's an approval_required response (HIL pause)
        if (CapabilityLoader.isApprovalRequired(callResult)) {
          logger?.debug(`Tool ${toolId} requires approval - pausing for HIL`);
          state.pendingApproval = { approval: callResult, toolId };
          throw new Error(`__APPROVAL_REQUIRED__:${toolId}`);
        }

        return callResult;
      },
    );

    if (!result.success) {
      // Check if the error was our approval marker
      if (state.pendingApproval && result.error?.message?.startsWith("__APPROVAL_REQUIRED__:")) {
        return {
          status: "approval_required",
          approval: state.pendingApproval.approval,
          toolId: state.pendingApproval.toolId,
        };
      }

      return {
        status: "error",
        error: result.error?.message ?? "Sandbox execution failed",
      };
    }

    return {
      status: "success",
      result: result.value,
      durationMs: result.durationMs,
      toolCallRecords: result.toolCallRecords ?? [],
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
