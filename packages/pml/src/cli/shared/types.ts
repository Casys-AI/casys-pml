/**
 * Shared Types for CLI Commands
 *
 * Common types used by both serve-command and stdio-command.
 *
 * @module cli/shared/types
 */

import type { ToolCallRecord } from "../../execution/types.ts";
import type {
  ApprovalRequiredResult,
  IntegrityApprovalRequired,
  ToolPermissionApprovalRequired,
} from "../../loader/mod.ts";

/**
 * Result of local code execution.
 *
 * Can be:
 * - Success with result
 * - Error with message
 * - Approval required (HIL pause for dependency/API key/integrity)
 */
export type LocalExecutionResult =
  | { status: "success"; result: unknown; durationMs: number; toolCallRecords: ToolCallRecord[] }
  | { status: "error"; error: string }
  | { status: "approval_required"; approval: ApprovalRequiredResult | IntegrityApprovalRequired; toolId: string };

/**
 * Pending approval state during execution.
 */
export type PendingApprovalState = {
  approval: ApprovalRequiredResult | IntegrityApprovalRequired;
  toolId: string;
};

/**
 * Resolved tool from server (id + FQDN).
 */
export interface ResolvedTool {
  /** Tool call name (e.g., "fs:listDirectory") */
  id: string;
  /** Fully qualified domain name (e.g., "alice.default.fs.listDirectory.a1b2") */
  fqdn: string;
}

/**
 * Parsed execute_locally response from server.
 */
export interface ExecuteLocallyResponse {
  status: string;
  code: string;
  client_tools: string[];
  /** Resolved tools with FQDNs from server (multi-tenant) */
  tools_used: ResolvedTool[];
  workflowId?: string;
}

/**
 * Continue workflow parameters for HIL approval flow.
 */
export interface ContinueWorkflowParams {
  approved: boolean;
  workflowId?: string;
}

/**
 * Result from cloud forwarding.
 */
export interface CloudForwardResult {
  ok: boolean;
  response?: unknown;
  error?: string;
}

/**
 * Logger interface for shared utilities.
 * Allows different logging implementations (stdio vs HTTP).
 */
export interface Logger {
  debug: (message: string) => void;
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
}

/**
 * Union type for all approval types.
 */
export type AnyApprovalResult =
  | ApprovalRequiredResult
  | IntegrityApprovalRequired
  | ToolPermissionApprovalRequired;
