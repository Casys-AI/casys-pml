/**
 * PML Routing Resolver
 *
 * Determines where tools should execute: locally or via cloud.
 * Uses cached routing config from cloud sync.
 *
 * Security principle: Default to LOCAL. Only explicit cloud servers route to cloud.
 *
 * @module routing/resolver
 */

import type { RoutingConfig, ToolRouting } from "../types.ts";

/**
 * In-memory routing config for fast lookups.
 * Set by initializeRouting() at startup.
 */
let activeConfig: RoutingConfig | null = null;
let cloudServersSet: Set<string> | null = null;

/**
 * Initialize routing resolver with config.
 * Call this at startup after syncing with cloud.
 *
 * @param config Routing configuration from sync
 */
export function initializeRouting(config: RoutingConfig): void {
  activeConfig = config;
  cloudServersSet = new Set(config.cloudServers);
}

/**
 * Check if routing is initialized.
 */
export function isRoutingInitialized(): boolean {
  return activeConfig !== null;
}

/**
 * Get current routing config version.
 */
export function getRoutingVersion(): string | null {
  return activeConfig?.version ?? null;
}

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
 * @throws Error if routing not initialized
 *
 * @example
 * ```ts
 * resolveToolRouting("filesystem:read_file")  // "local"
 * resolveToolRouting("tavily:search")         // "cloud"
 * resolveToolRouting("unknown:tool")          // "local" (safe default)
 * ```
 */
export function resolveToolRouting(tool: string): ToolRouting {
  if (!cloudServersSet) {
    throw new Error("Routing not initialized. Call initializeRouting() first.");
  }

  const namespace = extractNamespace(tool);
  return cloudServersSet.has(namespace) ? "cloud" : "local";
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
 * @returns Array of cloud server namespaces or empty if not initialized
 */
export function getCloudServers(): string[] {
  return activeConfig?.cloudServers ?? [];
}

/**
 * Reset routing (for testing).
 */
export function resetRouting(): void {
  activeConfig = null;
  cloudServersSet = null;
}
