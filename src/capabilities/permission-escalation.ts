/**
 * Permission Escalation Module (Story 7.7c - HIL Permission Escalation)
 *
 * Parses Deno PermissionDenied errors and suggests appropriate permission
 * escalations for human approval.
 *
 * Security-critical permissions (run, ffi) are NEVER allowed for escalation.
 * These are hardcoded rejections with no HIL override possible.
 *
 * @module capabilities/permission-escalation
 */

import type { PermissionEscalationRequest, PermissionSet } from "./types.ts";
import { getLogger } from "../telemetry/logger.ts";

const logger = getLogger("default");

/**
 * Regex patterns for parsing Deno PermissionDenied error messages
 *
 * Deno error format:
 * "PermissionDenied: Requires {permission} access to {resource}, run again with --allow-{permission}"
 */
const PERMISSION_PATTERNS = {
  read: /Requires read access to ([^\s,]+)/i,
  write: /Requires write access to ([^\s,]+)/i,
  net: /Requires net access to ([^\s,]+)/i,
  env: /Requires env access to "?([^"\s,]+)"?/i,
  run: /Requires run access to ([^\s,]+)/i,
  ffi: /Requires ffi access/i,
};

/**
 * Security-critical permissions that cannot be escalated
 * These could allow sandbox escape and are hardcoded rejections
 */
const SECURITY_CRITICAL_PERMISSIONS = new Set(["run", "ffi"]);

/**
 * Valid escalation paths between permission sets
 *
 * Key: current set -> Value: allowed escalation targets
 * Note: "trusted" is not allowed via escalation (manual override only)
 */
const ESCALATION_PATHS: Record<PermissionSet, PermissionSet[]> = {
  minimal: ["readonly", "filesystem", "network-api", "mcp-standard"],
  readonly: ["filesystem", "mcp-standard"],
  filesystem: ["mcp-standard"],
  "network-api": ["mcp-standard"],
  "mcp-standard": [], // Cannot escalate from mcp-standard (already highest auto-escalatable)
  trusted: [], // trusted is manual-only, no escalation
};

/**
 * Maps detected operations to suggested permission sets
 */
const OPERATION_TO_PERMISSION: Record<string, PermissionSet> = {
  read: "readonly",
  write: "filesystem",
  net: "network-api",
  env: "mcp-standard",
};

/**
 * Suggests an appropriate permission escalation for a Deno PermissionDenied error
 *
 * @param error - Error message from Deno sandbox (e.g., "PermissionDenied: Requires read access to /etc/passwd")
 * @param capabilityId - UUID of the capability that failed
 * @param currentSet - Current permission set of the capability
 * @returns PermissionEscalationRequest if escalation is possible, null otherwise
 *
 * @example
 * ```typescript
 * const suggestion = suggestEscalation(
 *   "PermissionDenied: Requires net access to api.example.com:443",
 *   "cap-uuid",
 *   "minimal"
 * );
 * // Returns: { requestedSet: "network-api", detectedOperation: "net", confidence: 0.9, ... }
 *
 * // Security-critical permissions return null
 * const blocked = suggestEscalation(
 *   "PermissionDenied: Requires run access to /bin/sh",
 *   "cap-uuid",
 *   "minimal"
 * );
 * // Returns: null (run is security-critical)
 * ```
 */
export function suggestEscalation(
  error: string,
  capabilityId: string,
  currentSet: PermissionSet,
): PermissionEscalationRequest | null {
  // Check if this is a permission error at all
  if (!error.includes("PermissionDenied") && !error.includes("Requires")) {
    logger.debug("Not a permission error, skipping escalation suggestion", {
      error: error.substring(0, 100),
    });
    return null;
  }

  // Try to match each permission pattern
  let detectedOperation: string | null = null;
  let resource: string | null = null;

  for (const [permission, pattern] of Object.entries(PERMISSION_PATTERNS)) {
    const match = error.match(pattern);
    if (match) {
      detectedOperation = permission;
      resource = match[1] || null;
      break;
    }
  }

  if (!detectedOperation) {
    logger.debug("Could not parse permission type from error", {
      error: error.substring(0, 100),
    });
    return null;
  }

  // SECURITY: Reject security-critical permissions immediately
  if (SECURITY_CRITICAL_PERMISSIONS.has(detectedOperation)) {
    logger.warn("Security-critical permission escalation blocked", {
      capabilityId,
      detectedOperation,
      error: error.substring(0, 100),
    });
    return null;
  }

  // Determine suggested permission set
  const suggestedSet = OPERATION_TO_PERMISSION[detectedOperation];
  if (!suggestedSet) {
    logger.debug("No permission set mapping for operation", {
      detectedOperation,
    });
    return null;
  }

  // Check if escalation path is valid
  const allowedTargets = ESCALATION_PATHS[currentSet];
  if (!allowedTargets.includes(suggestedSet)) {
    // Try to find the minimal valid escalation that includes this capability
    const validEscalation = findValidEscalation(currentSet, detectedOperation);
    if (!validEscalation) {
      logger.debug("No valid escalation path found", {
        currentSet,
        suggestedSet,
        detectedOperation,
      });
      return null;
    }

    // Use the valid escalation target
    const request: PermissionEscalationRequest = {
      capabilityId,
      currentSet,
      requestedSet: validEscalation,
      reason: error,
      detectedOperation,
      confidence: calculateConfidence(detectedOperation, resource),
    };

    logger.info("Permission escalation suggested (via valid path)", {
      capabilityId,
      currentSet,
      requestedSet: validEscalation,
      detectedOperation,
      confidence: request.confidence,
    });

    return request;
  }

  // Build escalation request
  const request: PermissionEscalationRequest = {
    capabilityId,
    currentSet,
    requestedSet: suggestedSet,
    reason: error,
    detectedOperation,
    confidence: calculateConfidence(detectedOperation, resource),
  };

  logger.info("Permission escalation suggested", {
    capabilityId,
    currentSet,
    requestedSet: suggestedSet,
    detectedOperation,
    confidence: request.confidence,
  });

  return request;
}

/**
 * Finds a valid escalation target given current set and required operation
 *
 * Example: if current="readonly" and we need "net", we escalate to "mcp-standard"
 * which includes both filesystem (from readonly) and network capabilities.
 */
function findValidEscalation(
  currentSet: PermissionSet,
  detectedOperation: string,
): PermissionSet | null {
  const requiredSet = OPERATION_TO_PERMISSION[detectedOperation];
  if (!requiredSet) return null;

  const allowedTargets = ESCALATION_PATHS[currentSet];

  // First try direct escalation
  if (allowedTargets.includes(requiredSet)) {
    return requiredSet;
  }

  // If direct escalation not available, find a set that includes the capability
  // Priority: prefer minimal escalation that includes the required capability
  const escalationOrder: PermissionSet[] = [
    "readonly",
    "filesystem",
    "network-api",
    "mcp-standard",
  ];

  for (const target of escalationOrder) {
    if (!allowedTargets.includes(target)) continue;

    // Check if this target provides the required capability
    if (targetProvidesCapability(target, detectedOperation)) {
      return target;
    }
  }

  return null;
}

/**
 * Checks if a permission set provides a specific capability
 */
function targetProvidesCapability(
  target: PermissionSet,
  operation: string,
): boolean {
  switch (operation) {
    case "read":
      return ["readonly", "filesystem", "mcp-standard", "trusted"].includes(target);
    case "write":
      return ["filesystem", "mcp-standard", "trusted"].includes(target);
    case "net":
      return ["network-api", "mcp-standard", "trusted"].includes(target);
    case "env":
      return ["mcp-standard", "trusted"].includes(target);
    default:
      return false;
  }
}

/**
 * Calculates confidence score for an escalation suggestion
 *
 * Higher confidence when:
 * - Specific resource path is provided (vs general)
 * - Common operation patterns are detected
 *
 * @param operation - Detected operation type
 * @param resource - Resource path/URL (if available)
 * @returns Confidence score (0-1)
 */
function calculateConfidence(
  operation: string,
  resource: string | null,
): number {
  let confidence = 0.7; // Base confidence

  // Boost confidence for specific resource paths
  if (resource) {
    confidence += 0.15;

    // Further boost for well-known patterns
    if (operation === "net") {
      // Common API patterns
      if (resource.includes("api.") || resource.includes(":443") || resource.includes("https")) {
        confidence += 0.1;
      }
    } else if (operation === "read" || operation === "write") {
      // Specific file paths are more trustworthy
      if (resource.startsWith("/") || resource.includes(".")) {
        confidence += 0.05;
      }
    }
  }

  // Cap at 0.95 (never 100% confident)
  return Math.min(confidence, 0.95);
}

/**
 * Checks if an escalation from one permission set to another is valid
 *
 * @param from - Current permission set
 * @param to - Target permission set
 * @returns true if escalation is allowed
 */
export function isValidEscalation(from: PermissionSet, to: PermissionSet): boolean {
  return ESCALATION_PATHS[from]?.includes(to) ?? false;
}

/**
 * Gets all valid escalation targets for a permission set
 *
 * @param currentSet - Current permission set
 * @returns Array of valid target permission sets
 */
export function getValidEscalationTargets(currentSet: PermissionSet): PermissionSet[] {
  return [...(ESCALATION_PATHS[currentSet] || [])];
}

/**
 * Checks if an operation type is security-critical (cannot be escalated)
 *
 * @param operation - Operation type (e.g., "run", "ffi")
 * @returns true if operation is security-critical
 */
export function isSecurityCritical(operation: string): boolean {
  return SECURITY_CRITICAL_PERMISSIONS.has(operation);
}
