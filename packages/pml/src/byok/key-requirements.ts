/**
 * Tool-to-Key Mapping
 *
 * Defines which API keys are required for which tools.
 *
 * **MVP:** Hardcoded mapping. Future: from registry metadata (`env_required`).
 *
 * @module byok/key-requirements
 */

import type { RequiredKey } from "./types.ts";

/**
 * Mapping of tool IDs to required environment variable names.
 *
 * Tool ID format: "namespace:action" (e.g., "tavily:search")
 *
 * **MVP Implementation:**
 * - Hardcoded for common external API tools
 * - Cloud-only tools (math, json, etc.) don't need keys
 * - Future: populated from registry metadata
 */
export const TOOL_REQUIRED_KEYS: Record<string, string[]> = {
  // Tavily (search API)
  "tavily:search": ["TAVILY_API_KEY"],
  "tavily:extract": ["TAVILY_API_KEY"],

  // Exa (search API)
  "exa:search": ["EXA_API_KEY"],
  "exa:contents": ["EXA_API_KEY"],
  "exa:findSimilar": ["EXA_API_KEY"],

  // Anthropic (direct API calls)
  "anthropic:message": ["ANTHROPIC_API_KEY"],
  "anthropic:complete": ["ANTHROPIC_API_KEY"],

  // OpenAI (direct API calls)
  "openai:chat": ["OPENAI_API_KEY"],
  "openai:complete": ["OPENAI_API_KEY"],
  "openai:embedding": ["OPENAI_API_KEY"],

  // Firecrawl (web scraping)
  "firecrawl:scrape": ["FIRECRAWL_API_KEY"],
  "firecrawl:crawl": ["FIRECRAWL_API_KEY"],

  // Brave (search API)
  "brave:search": ["BRAVE_API_KEY"],
  "brave:webSearch": ["BRAVE_API_KEY"],

  // Serper (Google search API)
  "serper:search": ["SERPER_API_KEY"],
  "serper:images": ["SERPER_API_KEY"],

  // GitHub (optional but recommended for higher rate limits)
  // Not required for public repos, so we don't list it here

  // Memory MCP server (optional key for cloud sync)
  // Usually works without key for local-only mode
};

/**
 * Namespace-level key requirements.
 *
 * If a namespace is listed here, ALL tools in that namespace
 * require the specified key(s).
 */
export const NAMESPACE_REQUIRED_KEYS: Record<string, string[]> = {
  "tavily": ["TAVILY_API_KEY"],
  "exa": ["EXA_API_KEY"],
  "anthropic": ["ANTHROPIC_API_KEY"],
  "openai": ["OPENAI_API_KEY"],
  "firecrawl": ["FIRECRAWL_API_KEY"],
  "brave": ["BRAVE_API_KEY"],
  "serper": ["SERPER_API_KEY"],
};

/**
 * Get required keys for a specific tool.
 *
 * Checks both tool-specific and namespace-level requirements.
 *
 * @param toolId - Tool ID (e.g., "tavily:search")
 * @returns Array of required environment variable names
 *
 * @example
 * ```ts
 * getRequiredKeysForTool("tavily:search"); // ["TAVILY_API_KEY"]
 * getRequiredKeysForTool("math:sum"); // []
 * ```
 */
export function getRequiredKeysForTool(toolId: string): string[] {
  // Check tool-specific mapping first
  const toolKeys = TOOL_REQUIRED_KEYS[toolId];
  if (toolKeys && toolKeys.length > 0) {
    return [...toolKeys];
  }

  // Check namespace-level mapping
  const namespace = toolId.split(":")[0];
  const namespaceKeys = NAMESPACE_REQUIRED_KEYS[namespace];
  if (namespaceKeys && namespaceKeys.length > 0) {
    return [...namespaceKeys];
  }

  // No keys required
  return [];
}

/**
 * Get required keys as RequiredKey objects.
 *
 * Adds the tool ID as `requiredBy` for better error messages.
 *
 * @param toolId - Tool ID (e.g., "tavily:search")
 * @returns Array of RequiredKey objects
 *
 * @example
 * ```ts
 * getRequiredKeys("tavily:search");
 * // [{ name: "TAVILY_API_KEY", requiredBy: "tavily:search" }]
 * ```
 */
export function getRequiredKeys(toolId: string): RequiredKey[] {
  const keys = getRequiredKeysForTool(toolId);
  return keys.map((name) => ({
    name,
    requiredBy: toolId,
  }));
}

/**
 * Check if a tool requires any API keys.
 *
 * @param toolId - Tool ID (e.g., "tavily:search")
 * @returns true if the tool requires keys
 */
export function toolRequiresKeys(toolId: string): boolean {
  return getRequiredKeysForTool(toolId).length > 0;
}

/**
 * Get all unique keys required by a list of tools.
 *
 * Useful when a capability uses multiple tools and you want
 * to check all keys upfront (AC4: Multiple Keys Upfront).
 *
 * @param toolIds - Array of tool IDs
 * @returns Deduplicated array of RequiredKey objects
 *
 * @example
 * ```ts
 * getRequiredKeysForTools(["tavily:search", "exa:search"]);
 * // [
 * //   { name: "TAVILY_API_KEY", requiredBy: "tavily:search" },
 * //   { name: "EXA_API_KEY", requiredBy: "exa:search" }
 * // ]
 * ```
 */
export function getRequiredKeysForTools(toolIds: string[]): RequiredKey[] {
  const seen = new Set<string>();
  const result: RequiredKey[] = [];

  for (const toolId of toolIds) {
    const keys = getRequiredKeys(toolId);
    for (const key of keys) {
      if (!seen.has(key.name)) {
        seen.add(key.name);
        result.push(key);
      }
    }
  }

  return result;
}
