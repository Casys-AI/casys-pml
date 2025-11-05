/**
 * MCP Protocol and Server Types
 *
 * @module mcp/types
 */

/**
 * MCP Server configuration
 */
export interface MCPServer {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  protocol: "stdio" | "sse";
}

/**
 * Tool schema from MCP list_tools response
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/**
 * Result of server discovery and schema extraction
 */
export interface ServerDiscoveryResult {
  serverId: string;
  serverName: string;
  status: "success" | "failed" | "timeout";
  toolsExtracted: number;
  tools?: MCPTool[];
  error?: string;
  connectionDuration?: number;
}

/**
 * Configuration loaded from config file
 */
export interface MCPConfig {
  servers: MCPServer[];
}

/**
 * Discovery statistics
 */
export interface DiscoveryStats {
  totalServers: number;
  successfulServers: number;
  failedServers: number;
  totalToolsExtracted: number;
  failures: Map<string, string>;
  duration: number;
}
