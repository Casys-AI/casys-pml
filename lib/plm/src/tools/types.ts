/**
 * Types for PLM MCP Tools
 *
 * @module lib/plm/tools/types
 */

import type { MCPToolMeta } from "@casys/mcp-server";

/** MCP Tool definition */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  _meta?: MCPToolMeta;
}

/** MCP Tool in wire format */
export interface MCPToolWireFormat {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  _meta?: {
    ui?: {
      resourceUri: string;
      visibility?: Array<"model" | "app">;
      emits?: string[];
      accepts?: string[];
    };
  };
}

/** PLM tool category identifier */
export type PlmToolCategory = "bom" | "change" | "quality" | "planning";

/** PLM tool handler function type */
export type PlmToolHandler = (args: Record<string, unknown>) => Promise<unknown> | unknown;

/** PLM tool definition with handler */
export interface PlmTool {
  name: string;
  description: string;
  category: PlmToolCategory;
  inputSchema: Record<string, unknown>;
  handler: PlmToolHandler;
  _meta?: MCPToolMeta;
}

/** MCP Client interface */
export interface MCPClientBase {
  readonly serverId: string;
  readonly serverName: string;
  connect(): Promise<void>;
  listTools(): Promise<MCPTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  disconnect(): Promise<void>;
}

/** Helper to create a tool with type safety */
export function defineTool(
  name: string,
  description: string,
  category: PlmToolCategory,
  inputSchema: Record<string, unknown>,
  handler: (args: Record<string, unknown>) => Promise<unknown> | unknown,
  meta?: MCPToolMeta,
): PlmTool {
  const tool: PlmTool = { name, description, category, inputSchema, handler };
  if (meta) {
    tool._meta = meta;
  }
  return tool;
}
