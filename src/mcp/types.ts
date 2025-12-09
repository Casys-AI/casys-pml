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

/**
 * Code execution request (cai:execute_code tool)
 */
export interface CodeExecutionRequest {
  /**
   * TypeScript code to execute in sandbox
   */
  code: string;

  /**
   * Natural language description of task (optional, triggers tool discovery)
   */
  intent?: string;

  /**
   * Custom context/data to inject into sandbox (optional)
   */
  context?: Record<string, unknown>;

  /**
   * Sandbox configuration (timeout, memory, etc.)
   */
  sandbox_config?: {
    timeout?: number;
    memoryLimit?: number;
    allowedReadPaths?: string[];
  };
}

/**
 * Code execution response
 */
export interface CodeExecutionResponse {
  /**
   * Execution result (JSON-serializable)
   */
  result: unknown;

  /**
   * Console logs from code execution
   */
  logs: string[];

  /**
   * Execution metrics
   */
  metrics: {
    executionTimeMs: number;
    inputSizeBytes: number;
    outputSizeBytes: number;
  };

  /**
   * Optional state for checkpoint persistence
   */
  state?: Record<string, unknown>;
}
