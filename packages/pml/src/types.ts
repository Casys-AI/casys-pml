/**
 * PML Configuration Types
 *
 * @module types
 */

/**
 * PML Cloud configuration
 */
export interface PmlCloudConfig {
  /** PML Cloud URL */
  url: string;
  /** API key (env var placeholder or actual key) */
  apiKey: string;
}

/**
 * PML Server configuration
 */
export interface PmlServerConfig {
  /** Local server port */
  port: number;
}

/**
 * PML Permissions configuration (Claude Code style)
 */
export interface PmlPermissions {
  /** Auto-approved tools (no prompt) */
  allow: string[];
  /** Always refused tools */
  deny: string[];
  /** Tools requiring user confirmation */
  ask: string[];
}

/**
 * PML configuration file (.pml.json)
 */
export interface PmlConfig {
  /** Package version */
  version: string;
  /** Workspace root path */
  workspace: string;
  /** Cloud configuration */
  cloud: PmlCloudConfig;
  /** Server configuration */
  server: PmlServerConfig;
  /** Tool permissions (Claude Code style: allow/deny/ask) */
  permissions: PmlPermissions;
}

/**
 * MCP server configuration
 */
export interface McpServerConfig {
  /** Transport type */
  type: "http" | "stdio";
  /** Server URL (for http type) */
  url?: string;
  /** Command to run (for stdio type) */
  command?: string;
  /** Command arguments (for stdio type) */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * MCP configuration file (.mcp.json)
 */
export interface McpConfig {
  [serverName: string]: McpServerConfig;
}

/**
 * Init options
 */
export interface InitOptions {
  /** PML API key (optional, for cloud features) */
  apiKey?: string;
  /** Server port */
  port?: number;
  /** Cloud URL */
  cloudUrl?: string;
  /** Skip prompts, use defaults */
  yes?: boolean;
  /** Skip backup confirmation */
  force?: boolean;
}

/**
 * Init result
 */
export interface InitResult {
  success: boolean;
  mcpConfigPath: string;
  pmlConfigPath: string;
  backedUp?: string;
  error?: string;
}
