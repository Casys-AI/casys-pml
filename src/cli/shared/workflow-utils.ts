/**
 * Workflow Utilities - Shared workflow helpers
 *
 * @module cli/shared/workflow-utils
 */

import type { ContinueWorkflowParams, ExecuteLocallyResponse } from "./types.ts";

/**
 * Extract continue_workflow from args if present.
 *
 * Used to extract HIL approval flow parameters from tool arguments.
 *
 * @param args - Tool arguments that may contain continue_workflow
 * @returns Parsed continue workflow params and cleaned args
 */
export function extractContinueWorkflow(
  args: Record<string, unknown> | undefined,
): {
  continueWorkflow: ContinueWorkflowParams | undefined;
  cleanArgs: Record<string, unknown>;
} {
  if (!args) {
    return { continueWorkflow: undefined, cleanArgs: {} };
  }

  const { continue_workflow, ...cleanArgs } = args;

  if (
    continue_workflow &&
    typeof continue_workflow === "object" &&
    "approved" in continue_workflow
  ) {
    return {
      continueWorkflow: {
        approved: Boolean(
          (continue_workflow as { approved: unknown }).approved,
        ),
        workflowId: (continue_workflow as { workflow_id?: string }).workflow_id,
      },
      cleanArgs,
    };
  }

  return { continueWorkflow: undefined, cleanArgs: args };
}

/**
 * Type guard to check if parsed JSON is a valid execute_locally response.
 */
function isExecuteLocallyResponse(
  parsed: unknown,
): parsed is { status: string; code: string; [key: string]: unknown } {
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    "status" in parsed &&
    (parsed as Record<string, unknown>).status === "execute_locally" &&
    "code" in parsed &&
    typeof (parsed as Record<string, unknown>).code === "string"
  );
}

/**
 * Parse execute_locally response from server.
 *
 * @param content - Text content from MCP response
 * @returns Parsed execute_locally data or null if not execute_locally
 */
export function parseExecuteLocallyResponse(
  content: string,
): ExecuteLocallyResponse | null {
  try {
    const parsed: unknown = JSON.parse(content);

    if (!isExecuteLocallyResponse(parsed)) {
      return null;
    }

    return {
      status: parsed.status,
      code: parsed.code,
      client_tools: (parsed.client_tools ?? parsed.clientTools ?? []) as string[],
      tools_used: (parsed.tools_used ?? []) as ExecuteLocallyResponse["tools_used"],
      workflowId: (parsed.workflowId ?? parsed.workflow_id) as string | undefined,
      dag: parsed.dag as ExecuteLocallyResponse["dag"],
      ui_orchestration: parsed.ui_orchestration as ExecuteLocallyResponse["ui_orchestration"],
    };
  } catch {
    return null;
  }
}
