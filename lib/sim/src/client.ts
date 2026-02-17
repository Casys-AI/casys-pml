/**
 * Sim tools client — provides programmatic and MCP access
 *
 * Same pattern as lib/plm PlmToolsClient.
 *
 * @module lib/sim/client
 */

import type { SimTool } from "./tools/types.ts";
import {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
} from "./tools/mod.ts";

// ============================================================================
// Client options
// ============================================================================

export interface SimToolsClientOptions {
  /** Filter by categories (default: all) */
  categories?: string[];
}

// ============================================================================
// Client
// ============================================================================

export class SimToolsClient {
  private tools: SimTool[];

  constructor(options?: SimToolsClientOptions) {
    if (options?.categories) {
      this.tools = options.categories.flatMap((cat) => getToolsByCategory(cat));
    } else {
      this.tools = allTools;
    }
  }

  listTools(): SimTool[] {
    return this.tools;
  }

  toMCPFormat(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    _meta?: SimTool["_meta"];
  }> {
    return this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      ...(t._meta && { _meta: t._meta }),
    }));
  }

  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(`[lib/sim] Tool not found: ${name}`);
    }
    return await tool.handler(args);
  }

  get count(): number {
    return this.tools.length;
  }
}

/** Default client instance with all tools */
export const defaultClient: SimToolsClient = new SimToolsClient();

// ============================================================================
// MCP interface
// ============================================================================

export interface MCPClientBase {
  readonly serverId: string;
  readonly serverName: string;
  connect(): Promise<void>;
  listTools(): Promise<Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  disconnect(): Promise<void>;
}

export class SimToolsMCP implements MCPClientBase {
  readonly serverId = "mcp-sim";
  readonly serverName = "Simulation & Constraint Checking";

  private client: SimToolsClient;
  private connected = false;

  constructor() {
    this.client = new SimToolsClient();
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async listTools() {
    return this.client.toMCPFormat();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) {
      throw new Error("[lib/sim] Client not connected");
    }
    return this.client.execute(name, args);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }
}

export const simToolsMCP: SimToolsMCP = new SimToolsMCP();

// Re-export for convenience
export {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
};
