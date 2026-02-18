/**
 * Onshape Tool Interface
 *
 * Defines the shape of a single MCP tool in the Onshape library,
 * following the same pattern as lib/erpnext/tools/types.ts.
 *
 * @module lib/onshape/tools/types
 */

import type { OnshapeClient } from "../api/onshape-client.ts";

/** Available tool categories */
export type OnshapeToolCategory =
  | "documents"
  | "versions"
  | "partstudios"
  | "parts"
  | "assemblies"
  | "drawings"
  | "export"
  | "configurations"
  | "metadata"
  | "releases"
  | "thumbnails"
  | "comments"
  | "users"
  | "webhooks";

/** JSON Schema for tool inputs (MCP wire format) */
export type JSONSchema = {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  enum?: unknown[];
  items?: JSONSchema;
  [key: string]: unknown;
};

/** Context passed to every tool handler */
export interface OnshapeToolContext {
  client: OnshapeClient;
}

/**
 * A single Onshape MCP tool.
 * Each tool maps to one or more Onshape REST API calls.
 */
export interface OnshapeTool {
  /** Unique tool name, snake_case, prefixed with onshape_ */
  name: string;
  /** Human-readable description for the LLM */
  description: string;
  /** Category for grouping/filtering */
  category: OnshapeToolCategory;
  /** JSON Schema for tool input parameters */
  inputSchema: JSONSchema;
  /** MCP Apps UI metadata (optional) */
  _meta?: { ui: { resourceUri: string } };
  /** Execute the tool and return a JSON-serializable result */
  handler: (
    input: Record<string, unknown>,
    ctx: OnshapeToolContext,
  ) => Promise<unknown>;
}

/** MCP wire-format tool (for ConcurrentMCPServer registration) */
export interface MCPToolWireFormat {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  _meta?: { ui: { resourceUri: string } };
}

/** Convert an OnshapeTool to MCP wire format */
export function toMCPWireFormat(tool: OnshapeTool): MCPToolWireFormat {
  const wire: MCPToolWireFormat = {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
  if (tool._meta) wire._meta = tool._meta;
  return wire;
}
