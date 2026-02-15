/**
 * MBE Tools Client
 *
 * Client for executing MBE (Model-Based Engineering) tools with MCP interface support.
 *
 * @module lib/mbe/src/client
 */

import {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
} from "./tools/mod.ts";
import type { MCPClientBase, MCPTool, MCPToolWireFormat, MbeTool } from "./tools/types.ts";

// Re-export from tools
export {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
};
export type { MbeTool };
export type {
  MCPClientBase,
  MCPTool,
  MCPToolWireFormat,
  MbeToolCategory,
  MbeToolHandler,
} from "./tools/types.ts";

// ============================================================================
// MbeToolsClient Class
// ============================================================================

export interface MbeToolsClientOptions {
  categories?: string[];
}

/**
 * Client for executing MBE tools
 */
export class MbeToolsClient {
  private tools: MbeTool[];

  constructor(options?: MbeToolsClientOptions) {
    if (options?.categories) {
      this.tools = options.categories.flatMap((cat) => getToolsByCategory(cat));
    } else {
      this.tools = allTools;
    }
  }

  /** List available tools */
  listTools(): MbeTool[] {
    return this.tools;
  }

  /** Convert tools to MCP format */
  toMCPFormat(): MCPToolWireFormat[] {
    return this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      ...(t._meta && { _meta: t._meta }),
    }));
  }

  /** Execute a tool by name */
  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return await tool.handler(args);
  }

  /** Get tool count */
  get count(): number {
    return this.tools.length;
  }
}

/** Default client instance with all tools */
export const defaultClient: MbeToolsClient = new MbeToolsClient();

// ============================================================================
// MCP Client Implementation
// ============================================================================

/**
 * MBE Tools MCP Client - Implements MCPClientBase interface
 */
export class MbeToolsMCP implements MCPClientBase {
  readonly serverId = "mcp-mbe";
  readonly serverName = "MBE Tools";

  private client: MbeToolsClient;
  private connected = false;

  constructor() {
    this.client = new MbeToolsClient();
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async listTools(): Promise<MCPTool[]> {
    return this.client.toMCPFormat();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) {
      throw new Error("Client not connected");
    }
    return this.client.execute(name, args);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  getClient(): MbeToolsClient {
    return this.client;
  }
}

/** Default MbeToolsMCP instance */
export const mbeToolsMCP: MbeToolsMCP = new MbeToolsMCP();
