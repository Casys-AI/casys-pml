/**
 * MCPClientRegistry Adapter
 *
 * Wraps a Map<string, MCPClientBase> to implement the DI MCPClientRegistry token.
 * This allows the existing client map pattern to be used with DI.
 *
 * @module infrastructure/di/adapters/mcp-client-registry-adapter
 */

import { MCPClientRegistry, type MCPClientBase } from "../container.ts";
import type { MCPTool } from "../../../mcp/types.ts";

/**
 * Adapter that wraps the MCP clients Map for DI registration.
 *
 * Note: getAllTools() requires tools to be fetched asynchronously first.
 * Call refreshTools() after clients are connected to populate the cache.
 */
export class MCPClientRegistryAdapter extends MCPClientRegistry {
  private toolsCache: MCPTool[] = [];

  constructor(private readonly clients: Map<string, MCPClientBase>) {
    super();
  }

  getClient = (id: string) => this.clients.get(id);

  getAllClients = () => Array.from(this.clients.values());

  getConnectedClientIds = () => Array.from(this.clients.keys());

  register = (id: string, client: MCPClientBase) => {
    this.clients.set(id, client);
  };

  unregister = (id: string) => {
    this.clients.delete(id);
  };

  has = (id: string) => this.clients.has(id);

  size = () => this.clients.size;

  /**
   * Get all tools from cache.
   * Call refreshTools() to update the cache after clients connect.
   */
  getAllTools = (): MCPTool[] => {
    return this.toolsCache;
  };

  /**
   * Refresh the tools cache from all connected clients.
   * Should be called after clients are connected.
   */
  async refreshTools(): Promise<void> {
    const tools: MCPTool[] = [];

    const refreshPromises = Array.from(this.clients.entries()).map(
      async ([serverId, client]) => {
        try {
          const clientTools = await client.listTools();
          return clientTools.map((tool) => ({
            ...tool,
            name: `${serverId}:${tool.name}`,
          }));
        } catch {
          return [];
        }
      },
    );

    const results = await Promise.all(refreshPromises);
    for (const clientTools of results) {
      tools.push(...clientTools);
    }

    this.toolsCache = tools;
  }

  findToolProvider = (toolName: string) => {
    // toolName format: "serverId:actualToolName"
    const [serverId] = toolName.split(":");
    return this.clients.get(serverId);
  };

  callTool = async (toolName: string, args: Record<string, unknown>) => {
    const [serverId, ...toolNameParts] = toolName.split(":");
    const actualToolName = toolNameParts.join(":");

    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`No MCP client for server: ${serverId}`);
    }

    return await client.callTool(actualToolName, args);
  };

  /** Access underlying map for direct manipulation */
  get underlying(): Map<string, MCPClientBase> {
    return this.clients;
  }
}
