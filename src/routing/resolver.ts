/**
 * PML Routing Resolver
 *
 * Determines where tools should execute: client (user's machine) or server (pml.casys.ai).
 * Uses cached routing config from cloud sync.
 *
 * Security principle: Default to CLIENT. Unknown tools run on user's machine.
 *
 * @module routing/resolver
 */

import type { RoutingConfig, ToolRouting } from "../types.ts";

/**
 * In-memory routing config for fast lookups.
 * Set by initializeRouting() at startup.
 */
let activeConfig: RoutingConfig | null = null;
let clientToolsSet: Set<string> | null = null;
let serverToolsSet: Set<string> | null = null;

/**
 * Initialize routing resolver with config.
 * Call this at startup after syncing with cloud.
 *
 * @param config Routing configuration from sync
 */
export function initializeRouting(config: RoutingConfig): void {
  activeConfig = config;
  clientToolsSet = new Set(config.clientTools);
  serverToolsSet = new Set(config.serverTools);
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
 * Priority:
 * 1. If explicitly in clientTools → "client"
 * 2. If explicitly in serverTools → "server"
 * 3. Otherwise → defaultRouting (usually "client" for safety)
 *
 * @param tool Tool ID (e.g., "filesystem:read_file", "tavily:search")
 * @returns "client" or "server"
 * @throws Error if routing not initialized
 *
 * @example
 * ```ts
 * resolveToolRouting("filesystem:read_file")  // "client" (dangerous, local)
 * resolveToolRouting("tavily:search")         // "server" (safe, pml.casys.ai)
 * resolveToolRouting("unknown:tool")          // "client" (safe default)
 * ```
 */
export function resolveToolRouting(tool: string): ToolRouting {
  if (!activeConfig || !clientToolsSet || !serverToolsSet) {
    throw new Error("Routing not initialized. Call initializeRouting() first.");
  }

  const namespace = extractNamespace(tool);

  // Explicit client tools run on user's machine
  if (clientToolsSet.has(namespace)) {
    return "client";
  }

  // Explicit server tools route to pml.casys.ai
  if (serverToolsSet.has(namespace)) {
    return "server";
  }

  // Default routing for unknown tools
  return activeConfig.defaultRouting;
}

/**
 * Check if a tool executes on user's machine.
 *
 * @param tool Tool ID
 * @returns true if the tool runs on user's machine
 */
export function isClientTool(tool: string): boolean {
  return resolveToolRouting(tool) === "client";
}

/**
 * Check if a tool executes on the server.
 *
 * @param tool Tool ID
 * @returns true if the tool routes to pml.casys.ai
 */
export function isServerTool(tool: string): boolean {
  return resolveToolRouting(tool) === "server";
}

/**
 * Get the list of client tool namespaces.
 *
 * @returns Array of client tool namespaces or empty if not initialized
 */
export function getClientTools(): string[] {
  return activeConfig?.clientTools ?? [];
}

/**
 * Get the list of server tool namespaces.
 *
 * @returns Array of server tool namespaces or empty if not initialized
 */
export function getServerTools(): string[] {
  return activeConfig?.serverTools ?? [];
}

/**
 * Reset routing (for testing).
 */
export function resetRouting(): void {
  activeConfig = null;
  clientToolsSet = null;
  serverToolsSet = null;
}
