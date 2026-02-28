/**
 * Shared discovery types — tool info contract.
 *
 * @module @casys/pml-types/discovery
 */

import type { ToolUiMeta } from "../ui/types.ts";

/**
 * Minimal tool info discovered from an MCP server.
 *
 * Used during MCP server connection to describe available tools.
 * Previously named `DiscoveredTool` in packages/pml — renamed to avoid
 * collision with the richer `DiscoveredTool` search result in src/.
 */
export interface McpToolInfo {
  /** Tool name */
  name: string;

  /** Optional description */
  description?: string;

  /** JSON Schema for input parameters */
  inputSchema?: Record<string, unknown>;

  /** MCP Apps UI metadata */
  uiMeta?: ToolUiMeta;
}
