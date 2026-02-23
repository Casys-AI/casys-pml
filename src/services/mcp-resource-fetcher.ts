/**
 * MCP Resource Fetcher
 *
 * Story 16.6: Composite UI Viewer & Editor
 *
 * Implementation of ResourceFetcher for fetching UI resources via MCP protocol.
 * Uses the resources/read method to fetch HTML content from MCP servers.
 *
 * @module services/mcp-resource-fetcher
 */

import * as log from "@std/log";
import type { ResourceFetcher } from "./ui-cache-service.ts";
import type { MCPClientBase } from "../mcp/types.ts";

/**
 * MCP server registry for resource fetching
 */
export interface MCPServerRegistry {
  /**
   * Get MCP client by server ID
   */
  getClient(serverId: string): MCPClientBase | undefined;

  /**
   * Check if server is connected
   */
  isConnected(serverId: string): boolean;

  /**
   * List all connected server IDs
   */
  listConnectedServers(): string[];
}

/**
 * Extracts server ID from a UI resource URI
 *
 * @example
 * parseResourceUri("ui://postgres/table/abc123") // { serverId: "postgres", ... }
 * parseResourceUri("ui://mcp-std/json-viewer/xyz") // { serverId: "mcp-std", ... }
 */
export function parseResourceUri(
  resourceUri: string,
): { serverId: string; path: string } | null {
  // Expected format: ui://serverId/path/to/resource
  const match = resourceUri.match(/^ui:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    log.warn(`[McpResourceFetcher] Invalid resource URI format: ${resourceUri}`);
    return null;
  }

  return {
    serverId: match[1],
    path: match[2],
  };
}

/**
 * Resource Fetcher implementation using MCP protocol
 */
export class McpResourceFetcher implements ResourceFetcher {
  constructor(private registry: MCPServerRegistry) {}

  /**
   * Fetch resource content from MCP server via resources/read
   *
   * @param resourceUri The UI resource URI (e.g., "ui://postgres/table/abc123")
   * @returns Resource content and mimeType, or null if unavailable
   */
  async fetch(resourceUri: string): Promise<{ content: string; mimeType: string } | null> {
    const parsed = parseResourceUri(resourceUri);
    if (!parsed) {
      return null;
    }

    const { serverId } = parsed;
    const client = this.registry.getClient(serverId);

    if (!client) {
      log.warn(`[McpResourceFetcher] No client found for server: ${serverId}`);
      return null;
    }

    try {
      // Call resources/read via the MCP client
      // The resource URI should be passed as-is to the server
      const result = await this.callResourcesRead(client, resourceUri);

      if (!result) {
        log.warn(`[McpResourceFetcher] No resource returned for: ${resourceUri}`);
        return null;
      }

      return {
        content: result.content,
        mimeType: result.mimeType ?? "text/html;profile=mcp-app",
      };
    } catch (error) {
      log.error(
        `[McpResourceFetcher] Failed to fetch resource ${resourceUri}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * Check if an MCP server is connected
   *
   * @param serverId The server ID to check
   * @returns True if connected, false otherwise
   */
  isConnected(serverId: string): boolean {
    return this.registry.isConnected(serverId);
  }

  /**
   * Call resources/read on an MCP client
   *
   * This is a separate method to allow easy mocking in tests.
   */
  private async callResourcesRead(
    client: MCPClientBase,
    resourceUri: string,
  ): Promise<{ content: string; mimeType?: string } | null> {
    // MCPClientBase.readResource returns MCPResourceContent | null directly.
    // Check if the client supports resources/read.
    if (typeof client.readResource !== "function") {
      log.warn(
        `[McpResourceFetcher] Server ${client.serverId} doesn't support resources/read. ` +
          `UI resources from this server will NOT be available.`,
      );
      return null;
    }

    const response = await client.readResource(resourceUri);

    if (!response || !response.text) {
      return null;
    }

    return {
      content: response.text,
      mimeType: response.mimeType,
    };
  }
}

/**
 * Factory function to create McpResourceFetcher from existing MCP client registry
 *
 * @param getClientsFn Function to get client by server ID
 * @param isConnectedFn Function to check connection status
 * @param listServersFn Function to list connected servers
 */
export function createMcpResourceFetcher(
  getClientsFn: (serverId: string) => MCPClientBase | undefined,
  isConnectedFn: (serverId: string) => boolean,
  listServersFn: () => string[],
): McpResourceFetcher {
  const registry: MCPServerRegistry = {
    getClient: getClientsFn,
    isConnected: isConnectedFn,
    listConnectedServers: listServersFn,
  };

  return new McpResourceFetcher(registry);
}
