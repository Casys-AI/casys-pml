/**
 * PLM Tools Client
 *
 * Client for executing PLM (Product Lifecycle Management) tools with MCP interface support.
 *
 * @module lib/plm/src/client
 */

import {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
} from "./tools/mod.ts";
import type { MCPClientBase, MCPTool, MCPToolWireFormat, PlmTool } from "./tools/types.ts";

// Re-export from tools
export {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
};

// Re-export sampling client injection
export { setSamplingClient } from "./tools/agent.ts";
export type { PlmTool };
export type {
  MCPClientBase,
  MCPTool,
  MCPToolWireFormat,
  PlmToolCategory,
  PlmToolHandler,
} from "./tools/types.ts";

// ============================================================================
// PlmToolsClient Class
// ============================================================================

export interface PlmToolsClientOptions {
  categories?: string[];
}

/**
 * Client for executing PLM tools
 */
export class PlmToolsClient {
  private tools: PlmTool[];

  constructor(options?: PlmToolsClientOptions) {
    if (options?.categories) {
      this.tools = options.categories.flatMap((cat) => getToolsByCategory(cat));
    } else {
      this.tools = allTools;
    }
  }

  /** List available tools */
  listTools(): PlmTool[] {
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
export const defaultClient: PlmToolsClient = new PlmToolsClient();

// ============================================================================
// MCP Client Implementation
// ============================================================================

/**
 * PLM Tools MCP Client - Implements MCPClientBase interface
 */
export class PlmToolsMCP implements MCPClientBase {
  readonly serverId = "mcp-plm";
  readonly serverName = "PLM Tools";

  private client: PlmToolsClient;
  private connected = false;

  constructor() {
    this.client = new PlmToolsClient();
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

  getClient(): PlmToolsClient {
    return this.client;
  }
}

/** Default PlmToolsMCP instance */
export const plmToolsMCP: PlmToolsMCP = new PlmToolsMCP();
