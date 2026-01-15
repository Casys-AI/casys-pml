/**
 * Approval Formatter - Format HIL approval responses
 *
 * @module cli/shared/approval-formatter
 */

import type { AnyApprovalResult } from "./types.ts";
import type { PendingWorkflowStore } from "../../workflow/mod.ts";

/**
 * Format approval_required MCP response.
 *
 * Uses the same pattern as main codebase (src/mcp/server/responses.ts).
 *
 * For dependency approvals, stores the workflow in pendingWorkflowStore
 * so we can retrieve the code when continue_workflow arrives.
 *
 * Supports:
 * - tool_permission: User must approve tool usage
 * - api_key_required: User must provide API keys
 * - integrity: Tool code hash changed
 * - dependency: MCP server needs installation
 *
 * @param toolName - Name of the tool requiring approval
 * @param approvalResult - Approval result from CapabilityLoader
 * @param pendingStore - Store to save pending workflow state
 * @param originalCode - Original code for re-execution after approval
 * @param fqdnMap - Server-resolved FQDNs for tools used in this code
 */
export function formatApprovalRequired(
  toolName: string,
  approvalResult: AnyApprovalResult,
  pendingStore: PendingWorkflowStore,
  originalCode?: string,
  fqdnMap?: Record<string, string>,
): { content: Array<{ type: string; text: string }> } {
  // Handle tool permission approval (Unified Permission Model)
  if (approvalResult.approvalType === "tool_permission") {
    const workflowId = approvalResult.workflowId;

    if (originalCode) {
      pendingStore.setWithId(workflowId, originalCode, approvalResult.toolId, "tool_permission", {
        namespace: approvalResult.namespace,
        needsInstallation: approvalResult.needsInstallation,
        dependency: approvalResult.dependency,
        fqdnMap,
      });
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "approval_required",
          approval_type: "tool_permission",
          workflow_id: workflowId,
          description: approvalResult.description,
          context: {
            tool: toolName,
            tool_id: approvalResult.toolId,
            namespace: approvalResult.namespace,
            needs_installation: approvalResult.needsInstallation,
            dependency: approvalResult.dependency ? {
              name: approvalResult.dependency.name,
              version: approvalResult.dependency.version,
              install: approvalResult.dependency.install,
            } : undefined,
          },
          options: ["continue", "abort"],
        }, null, 2),
      }],
    };
  }

  // Handle API key approval
  if (approvalResult.approvalType === "api_key_required") {
    const workflowId = approvalResult.workflowId;

    if (originalCode) {
      pendingStore.setWithId(workflowId, originalCode, toolName, "api_key_required", {
        missingKeys: approvalResult.missingKeys,
        fqdnMap,
      });
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "approval_required",
          approval_type: "api_key_required",
          workflow_id: workflowId,
          context: {
            tool: toolName,
            missing_keys: approvalResult.missingKeys,
            instruction: approvalResult.instruction,
          },
          options: ["continue", "abort"],
        }, null, 2),
      }],
    };
  }

  // Handle integrity approval
  if (approvalResult.approvalType === "integrity") {
    const workflowId = approvalResult.workflowId;

    if (originalCode) {
      pendingStore.setWithId(workflowId, originalCode, toolName, "integrity", {
        integrityInfo: {
          fqdnBase: approvalResult.fqdnBase,
          newHash: approvalResult.newHash,
          oldHash: approvalResult.oldHash,
        },
        fqdnMap,
      });
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "approval_required",
          approval_type: "integrity",
          workflow_id: workflowId,
          description: approvalResult.description,
          context: {
            tool: toolName,
            fqdn_base: approvalResult.fqdnBase,
            old_hash: approvalResult.oldHash,
            new_hash: approvalResult.newHash,
          },
          options: ["continue", "abort"],
        }, null, 2),
      }],
    };
  }

  // Handle dependency approval (legacy)
  const workflowId = approvalResult.workflowId;

  if (originalCode) {
    pendingStore.setWithId(workflowId, originalCode, toolName, "dependency", {
      dependency: approvalResult.dependency,
      fqdnMap,
    });
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        status: "approval_required",
        approval_type: "dependency",
        workflow_id: workflowId,
        description: approvalResult.description,
        context: {
          tool: toolName,
          dependency: {
            name: approvalResult.dependency.name,
            version: approvalResult.dependency.version,
            install: approvalResult.dependency.install,
          },
        },
        options: ["continue", "abort", "replan"],
      }, null, 2),
    }],
  };
}
