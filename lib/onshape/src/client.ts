/**
 * Onshape Tools Client
 *
 * Client for executing Onshape tools with MCP interface support.
 * Follows the same pattern as lib/erpnext/src/client.ts.
 *
 * @module lib/onshape/src/client
 */

import {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
} from "./tools/mod.ts";
import type { OnshapeTool, OnshapeToolCategory } from "./tools/types.ts";
import { getOnshapeClient } from "./api/onshape-client.ts";

// Re-export from tools
export {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
};

export type { OnshapeTool, OnshapeToolCategory };

// ============================================================================
// Wire format types (MCP protocol)
// ============================================================================

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  [key: string]: unknown;
}

export interface MCPToolWireFormat {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  _meta?: { ui: { resourceUri: string } };
}

// ============================================================================
// OnshapeToolsClient Class
// ============================================================================

export interface OnshapeToolsClientOptions {
  categories?: string[];
}

/**
 * Client for executing Onshape tools.
 * Lazily initializes the Onshape HTTP client on first tool execution.
 */
export class OnshapeToolsClient {
  private tools: OnshapeTool[];

  constructor(options?: OnshapeToolsClientOptions) {
    if (options?.categories) {
      this.tools = options.categories.flatMap((cat) => getToolsByCategory(cat));
    } else {
      this.tools = allTools;
    }
  }

  /** List available tools (with handler attached) */
  listTools(): OnshapeTool[] {
    return this.tools;
  }

  /** Convert tools to MCP wire format (for server registration) */
  toMCPFormat(): MCPToolWireFormat[] {
    return this.tools.map((t) => {
      const wire: MCPToolWireFormat = {
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as JSONSchema,
      };
      if (t._meta) wire._meta = t._meta;
      return wire;
    });
  }

  /**
   * Build a handlers Map for ConcurrentMCPServer.registerTools().
   * Each handler wraps the tool to inject the OnshapeClient context.
   */
  buildHandlersMap(): Map<string, (args: Record<string, unknown>) => Promise<unknown>> {
    const handlers = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();
    for (const tool of this.tools) {
      handlers.set(tool.name, (args: Record<string, unknown>) => {
        const client = getOnshapeClient();
        return tool.handler(args, { client });
      });
    }
    return handlers;
  }

  /** Execute a tool by name */
  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(
        `[OnshapeToolsClient] Unknown tool: "${name}". ` +
          `Available: ${this.tools.map((t) => t.name).join(", ")}`,
      );
    }
    const client = getOnshapeClient();
    return await tool.handler(args, { client });
  }

  /** Get tool count */
  get count(): number {
    return this.tools.length;
  }
}

/** Default singleton client (all categories) */
export const defaultClient: OnshapeToolsClient = new OnshapeToolsClient();
