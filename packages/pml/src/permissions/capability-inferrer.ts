/**
 * Capability Permission Inferrer
 *
 * Infers approval mode for capabilities based on their tools and user permissions.
 * This is computed at RUNTIME because permissions are user-specific and mutable.
 *
 * @module permissions/capability-inferrer
 */

import type {
  ApprovalMode,
  CapabilityPermissionResult,
  PmlPermissions,
} from "../types.ts";
import { checkPermission } from "./loader.ts";

/**
 * Error thrown when a capability uses a denied tool.
 *
 * @example
 * ```ts
 * try {
 *   inferCapabilityApprovalMode(["ssh:connect"], permissions, "my-capability");
 * } catch (e) {
 *   if (e instanceof CapabilityBlockedError) {
 *     console.error(`Capability "${e.capabilityId}" blocked by: ${e.toolId}`);
 *   }
 * }
 * ```
 */
export class CapabilityBlockedError extends Error {
  constructor(
    public readonly toolId: string,
    public readonly capabilityId?: string,
  ) {
    const capPart = capabilityId ? `Capability "${capabilityId}" blocked` : "Capability blocked";
    super(`${capPart}: tool "${toolId}" is denied by user permissions`);
    this.name = "CapabilityBlockedError";
  }
}

/**
 * Internal result from scanning tools against permissions.
 * Used to share logic between throwing and non-throwing variants.
 */
interface ToolScanResult {
  /** First denied tool found, if any */
  deniedTool: string | null;
  /** Whether any tool requires HIL */
  requiresHil: boolean;
}

/**
 * Scan tools against permissions to find denied tools and HIL requirements.
 * Shared logic for both inferCapabilityApprovalMode and checkCapabilityPermissions.
 */
function scanToolsPermissions(
  toolsUsed: string[],
  permissions: PmlPermissions,
): ToolScanResult {
  let requiresHil = false;

  for (const tool of toolsUsed) {
    const result = checkPermission(tool, permissions);

    if (result === "denied") {
      return { deniedTool: tool, requiresHil };
    }

    if (result === "ask") {
      requiresHil = true;
    }
  }

  return { deniedTool: null, requiresHil };
}

/**
 * Infer approval mode for a capability based on its tools and user permissions.
 *
 * This is computed at RUNTIME, not stored in DB, because:
 * - Each user has their own permissions in .pml.json
 * - Users can change permissions at any time
 * - Same capability may be "auto" for one user and "hil" for another
 *
 * Precedence (matches AC2):
 * 1. If ANY tool is denied → throw CapabilityBlockedError
 * 2. If ANY tool requires ask → return "hil"
 * 3. If ALL tools are allowed → return "auto"
 * 4. Unknown tools → "hil" (safe default via checkPermission)
 *
 * @param toolsUsed - Array of tool IDs used by the capability
 * @param permissions - User's loaded permissions from .pml.json
 * @param capabilityId - Optional capability identifier for better error messages
 * @returns "hil" or "auto"
 * @throws CapabilityBlockedError if any tool is denied
 *
 * @example
 * ```ts
 * const approval = inferCapabilityApprovalMode(
 *   ["filesystem:read", "tavily:search"],
 *   { allow: ["tavily:*"], deny: [], ask: ["filesystem:*"] },
 *   "my-data-fetcher"
 * );
 * // Returns "hil" because filesystem:read requires ask
 * ```
 */
export function inferCapabilityApprovalMode(
  toolsUsed: string[],
  permissions: PmlPermissions,
  capabilityId?: string,
): ApprovalMode {
  // Empty tools = pure compute = auto (safe)
  if (!toolsUsed || toolsUsed.length === 0) {
    return "auto";
  }

  const { deniedTool, requiresHil } = scanToolsPermissions(toolsUsed, permissions);

  if (deniedTool) {
    throw new CapabilityBlockedError(deniedTool, capabilityId);
  }

  return requiresHil ? "hil" : "auto";
}

/**
 * Check if a capability can execute with user's permissions.
 * Returns detailed result instead of throwing.
 *
 * Use this when you need to check without exceptions.
 *
 * @param toolsUsed - Tools used by capability
 * @param permissions - User permissions
 * @param capabilityId - Optional capability identifier for better error messages
 * @returns Object with canExecute, approvalMode, and blockedTool if any
 *
 * @example
 * ```ts
 * const result = checkCapabilityPermissions(
 *   ["ssh:connect", "json:parse"],
 *   permissions,
 *   "my-capability"
 * );
 * if (!result.canExecute) {
 *   console.error(`Blocked by: ${result.blockedTool}`);
 * }
 * ```
 */
export function checkCapabilityPermissions(
  toolsUsed: string[],
  permissions: PmlPermissions,
  capabilityId?: string,
): CapabilityPermissionResult {
  // Empty tools = pure compute = auto (safe)
  if (!toolsUsed || toolsUsed.length === 0) {
    return { canExecute: true, approvalMode: "auto" };
  }

  const { deniedTool, requiresHil } = scanToolsPermissions(toolsUsed, permissions);

  if (deniedTool) {
    const capPart = capabilityId ? `Capability "${capabilityId}" blocked` : "Capability blocked";
    return {
      canExecute: false,
      approvalMode: "hil",
      blockedTool: deniedTool,
      reason: `${capPart}: tool "${deniedTool}" is denied by user permissions`,
    };
  }

  return {
    canExecute: true,
    approvalMode: requiresHil ? "hil" : "auto",
  };
}
