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
 * Parse execute_locally response from server.
 *
 * @param content - Text content from MCP response
 * @returns Parsed execute_locally data or null if not execute_locally
 */
export function parseExecuteLocallyResponse(
  content: string,
): ExecuteLocallyResponse | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed.status === "execute_locally" && parsed.code) {
      // DEBUG: Log dag info
      console.error(`[DEBUG parseExecuteLocallyResponse] dag present: ${!!parsed.dag}, tasks: ${parsed.dag?.tasks?.length ?? 0}`);
      if (parsed.dag?.tasks?.[0]) {
        console.error(`[DEBUG] first task layerIndex: ${parsed.dag.tasks[0].layerIndex}`);
      }
      return {
        status: parsed.status,
        code: parsed.code,
        client_tools: parsed.client_tools ?? parsed.clientTools ?? [],
        tools_used: parsed.tools_used ?? [],
        workflowId: parsed.workflowId ?? parsed.workflow_id,
        // Story 11.4: Include DAG with layerIndex for TraceTimeline
        dag: parsed.dag,
      };
    }
    return null;
  } catch {
    return null;
  }
}
