/**
 * Tool ID Utilities
 *
 * Parse tool IDs from various formats to extract namespace and action.
 * Handles legacy colon format, MCP dot notation, and FQDNs.
 */

/**
 * Parse tool ID from any format to { namespace, action }
 *
 * Supported formats:
 * - FQDN: "pml.mcp.std.psql_query.3cd9" → { namespace: "std", action: "psql_query" }
 * - Colon: "std:psql_query" → { namespace: "std", action: "psql_query" }
 * - MCP dot: "mcp.std.psql_query" → { namespace: "std", action: "psql_query" }
 */
export function parseToolId(toolId: string): { namespace: string; action: string } {
  if (!toolId || typeof toolId !== "string") {
    return { namespace: "unknown", action: toolId || "" };
  }

  // FQDN: org.project.namespace.action[.hash] (4-5 parts, not starting with mcp.)
  const dotParts = toolId.split(".");
  if (dotParts.length >= 4 && !toolId.startsWith("mcp.")) {
    return { namespace: dotParts[2], action: dotParts[3] };
  }

  // MCP dot notation: mcp.namespace.action
  if (toolId.startsWith("mcp.") && dotParts.length >= 3) {
    return { namespace: dotParts[1], action: dotParts.slice(2).join("_") };
  }

  // Colon format: namespace:action
  const colonIdx = toolId.indexOf(":");
  if (colonIdx > 0) {
    return { namespace: toolId.slice(0, colonIdx), action: toolId.slice(colonIdx + 1) };
  }

  // Fallback: treat as action only
  return { namespace: "misc", action: toolId };
}

/**
 * Get display name from any tool ID format
 * @returns "namespace:action"
 */
export function getToolDisplayName(toolId: string): string {
  const { namespace, action } = parseToolId(toolId);
  return `${namespace}:${action}`;
}

/**
 * Get short display name for UI contexts with limited space
 * @returns action name only, truncated if needed
 */
export function getToolShortName(toolId: string, maxLength = 20): string {
  const { action } = parseToolId(toolId);
  if (action.length <= maxLength) return action;
  return action.slice(0, maxLength - 2) + "..";
}
