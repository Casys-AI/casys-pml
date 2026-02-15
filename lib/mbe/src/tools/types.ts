/**
 * Types for MBE (Model-Based Engineering) MCP Tools
 *
 * @module lib/mbe/types
 */

import type { MCPToolMeta } from "@casys/mcp-server";

/** MCP Tool definition */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
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

/** MBE tool category identifier */
export type MbeToolCategory =
  | "geometry"
  | "tolerance"
  | "material"
  | "model"
  // Agent tools (MCP Sampling) — Phase 3
  | "agent";

/** MBE tool handler function type */
export type MbeToolHandler = (args: Record<string, unknown>) => Promise<unknown> | unknown;

/** MBE tool definition with handler */
export interface MbeTool {
  name: string;
  description: string;
  category: MbeToolCategory;
  inputSchema: Record<string, unknown>;
  handler: MbeToolHandler;
  _meta?: MCPToolMeta;
}

/** Helper to create a tool with type safety */
export function defineTool(
  name: string,
  description: string,
  category: MbeToolCategory,
  inputSchema: Record<string, unknown>,
  handler: (args: Record<string, unknown>) => Promise<unknown> | unknown,
  meta?: MCPToolMeta,
): MbeTool {
  const tool: MbeTool = { name, description, category, inputSchema, handler };
  if (meta) {
    tool._meta = meta;
  }
  return tool;
}
