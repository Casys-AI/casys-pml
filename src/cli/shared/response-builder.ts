/**
 * MCP Response Builder
 *
 * Builds MCP JSON-RPC responses from LocalExecutionResult.
 * Single point of logic for converting execution results to MCP format.
 * Used by both serve-command and stdio-command (no duplication).
 *
 * Story 16.3: Propagate collected UIs into MCP tools/call responses.
 * Story 16.4: Generate composite HTML for multi-UI capabilities.
 *
 * @module cli/shared/response-builder
 */

import type { CollectedUiResource, UiOrchestration } from "../../types/ui-orchestration.ts";
import type { LocalExecutionResult, AnyApprovalResult, DAGTask } from "./types.ts";
import type { PendingWorkflowStore } from "../../workflow/mod.ts";
import { formatApprovalRequired } from "./approval-formatter.ts";
import { buildCompositeUi, generateCompositeHtml } from "../../ui/composite-generator.ts";

/**
 * Build the MCP result payload for a successful local execution.
 *
 * When the execution collected UI resources from tool responses,
 * includes `_meta.ui` in the MCP result following SEP-1865.
 *
 * - 0 UIs: no `_meta` field
 * - 1 UI: pass-through `_meta.ui` with resourceUri + context
 * - 2+ UIs: generate composite HTML via buildCompositeUi() + generateCompositeHtml()
 *
 * @param resultPayload - The JSON payload to embed in content[0].text
 * @param collectedUi - Optional collected UI resources from sandbox execution
 * @param orchestration - Optional UI orchestration config (from capability DB).
 *   When absent, defaults to { layout: "stack", sync: [] } inside buildCompositeUi().
 * @returns MCP result object with content[] and optional _meta.ui
 */
export function buildMcpSuccessResult(
  resultPayload: Record<string, unknown>,
  collectedUi?: CollectedUiResource[],
  orchestration?: UiOrchestration,
): Record<string, unknown> {
  const mcpResult: Record<string, unknown> = {
    content: [{ type: "text", text: JSON.stringify(resultPayload) }],
  };

  if (!collectedUi || collectedUi.length === 0) {
    return mcpResult;
  }

  if (collectedUi.length === 1) {
    // Story 16.3: Single UI pass-through
    const primary = collectedUi[0];
    mcpResult._meta = {
      ui: {
        resourceUri: primary.resourceUri,
        ...(primary.context ? { context: primary.context } : {}),
      },
    };
    return mcpResult;
  }

  // Story 16.4: Multi-UI — generate composite HTML
  // The composite HTML is REGENERATED per execution (ephemeral, not stored).
  // It combines persistent Tool UI HTML (served via resources/read) with
  // dynamic context from this execution's CollectedUiResource[].
  const descriptor = buildCompositeUi(collectedUi, orchestration);
  const compositeHtml = generateCompositeHtml(descriptor);

  // HIL note: When a mid-execution approval checkpoint pauses execution,
  // the continuation re-runs the code from scratch (see stdio-command.ts:329).
  // The full set of collectedUi[] is therefore always available at completion —
  // no partial composite issue.
  mcpResult._meta = {
    ui: {
      resourceUri: descriptor.resourceUri,
      html: compositeHtml,
    },
  };

  return mcpResult;
}

/**
 * Context needed to format approval_required responses.
 * Carries the code/fqdnMap/dagTasks from the execution that was interrupted.
 */
export interface ApprovalContext {
  code: string;
  fqdnMap: Record<string, string>;
  pendingWorkflowStore: PendingWorkflowStore;
  dagTasks?: DAGTask[];
}

/**
 * Build MCP result from a LocalExecutionResult.
 *
 * Handles all 3 result statuses (approval_required, error, success)
 * in one place. Both serve-command and stdio-command use this
 * instead of duplicating the if/else chain.
 *
 * @param result - Result from executeLocalCode()
 * @param approvalCtx - Context for formatting approval responses
 * @param executedLocally - Whether to include executed_locally flag in payload
 * @returns MCP result object ready to wrap in {jsonrpc, id, result}
 */
export function buildMcpLocalResult(
  result: LocalExecutionResult,
  approvalCtx: ApprovalContext,
  executedLocally = true,
  orchestration?: UiOrchestration,
  workflowId?: string,
): Record<string, unknown> {
  if (result.status === "approval_required") {
    return formatApprovalRequired(
      result.toolId,
      result.approval as AnyApprovalResult,
      approvalCtx.pendingWorkflowStore,
      approvalCtx.code,
      approvalCtx.fqdnMap,
      approvalCtx.dagTasks,
    );
  }

  if (result.status === "error") {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "error",
          error: result.error,
          ...(executedLocally ? { executed_locally: true } : {}),
          ...(workflowId ? { workflow_id: workflowId } : {}),
        }),
      }],
    };
  }

  // Success
  return buildMcpSuccessResult(
    {
      status: "success",
      result: result.result,
      ...(executedLocally ? { executed_locally: true } : {}),
      ...(workflowId ? { workflow_id: workflowId } : {}),
    },
    result.collectedUi,
    orchestration,
  );
}
