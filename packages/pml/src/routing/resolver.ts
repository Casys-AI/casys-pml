/**
 * PML Routing Resolver
 *
 * Determines where tools should execute: locally or via cloud.
 * Platform-defined (not user-configurable).
 *
 * Security principle: Default to LOCAL. Only explicit cloud servers route to cloud.
 *
 * @module routing/resolver
 */

import type { ToolRouting } from "../types.ts";

/**
 * Cloud servers - matches config/mcp-routing.json
 *
 * These servers execute remotely via pml.casys.ai because they:
 * - Don't need local filesystem access
 * - Are safe API services (no side effects on user's machine)
 * - Benefit from cloud infrastructure (caching, rate limiting)
 *
 * Everything else defaults to LOCAL for security.
 */
const CLOUD_SERVERS = new Set([
  // Memory & Knowledge
  "memory",
  // Search services
  "tavily",
  "brave_search",
  "exa",
  // External APIs
  "github",
  "slack",
  "api",
  "http",
  "fetch",
  // AI services
  "sequential-thinking",
  "context7",
  "magic",
  // Utility modules (pure functions, no side effects)
  "json",
  "math",
  "datetime",
  "crypto",
  "collections",
  "validation",
  "format",
  "transform",
  "algo",
  "string",
  "color",
  "geo",
  "resilience",
  "schema",
  "diff",
  "state",
  "plots",
  // PML meta-tools
  "pml",
]);

/**
 * Extract namespace from tool ID.
 *
 * Supports multiple formats:
 * - "namespace:tool_name" → "namespace"
 * - "mcp__namespace__tool_name" → "namespace"
 * - "tool_name" → "tool_name" (tool as namespace)
 *
 * @param toolId Full tool identifier
 * @returns Namespace portion
 *
 * @example
 * ```ts
 * extractNamespace("filesystem:read_file")  // "filesystem"
 * extractNamespace("mcp__tavily__search")   // "tavily"
 * extractNamespace("json_parse")            // "json_parse"
 * ```
 */
export function extractNamespace(toolId: string): string {
  if (!toolId) return "";

  // Handle MCP SDK format: mcp__server__tool
  if (toolId.startsWith("mcp__")) {
    const parts = toolId.split("__");
    return parts[1] || "";
  }

  // Handle standard format: namespace:tool
  const colonIndex = toolId.indexOf(":");
  return colonIndex > 0 ? toolId.slice(0, colonIndex) : toolId;
}

/**
 * Resolve routing for a tool.
 *
 * DEFAULT IS LOCAL - only explicit cloud servers route to cloud.
 * This is a security-first approach: unknown tools stay local.
 *
 * @param tool Tool ID (e.g., "filesystem:read_file", "tavily:search")
 * @returns "local" or "cloud"
 *
 * @example
 * ```ts
 * resolveToolRouting("filesystem:read_file")  // "local"
 * resolveToolRouting("tavily:search")         // "cloud"
 * resolveToolRouting("unknown:tool")          // "local" (safe default)
 * ```
 */
export function resolveToolRouting(tool: string): ToolRouting {
  const namespace = extractNamespace(tool);
  return CLOUD_SERVERS.has(namespace) ? "cloud" : "local";
}

/**
 * Check if a tool executes locally.
 *
 * @param tool Tool ID
 * @returns true if the tool runs in user's local sandbox
 */
export function isLocalTool(tool: string): boolean {
  return resolveToolRouting(tool) === "local";
}

/**
 * Check if a tool executes in the cloud.
 *
 * @param tool Tool ID
 * @returns true if the tool routes to pml.casys.ai
 */
export function isCloudTool(tool: string): boolean {
  return resolveToolRouting(tool) === "cloud";
}

/**
 * Get the list of cloud server namespaces.
 *
 * Useful for debugging and display purposes.
 *
 * @returns Array of cloud server namespaces
 */
export function getCloudServers(): string[] {
  return [...CLOUD_SERVERS];
}
