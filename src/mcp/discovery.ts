/**
 * MCP Server Discovery and Configuration
 *
 * Discovers MCP servers from configuration file and manages connections
 *
 * @module mcp/discovery
 */

import { parse } from "@std/yaml";
import * as log from "@std/log";
import {
  MCPServer,
  MCPConfig,
} from "./types.ts";

/**
 * MCP Server Discovery Engine
 *
 * Responsible for:
 * - Loading and parsing MCP server configurations
 * - Discovering servers from config files
 * - Establishing connections to stdio and SSE servers
 * - Extracting tool schemas via MCP list_tools protocol
 */
export class MCPServerDiscovery {
  private config: MCPConfig | null = null;
  private configPath: string;

  constructor(configPath: string) {
    this.configPath = configPath;
  }

  /**
   * Load and parse MCP configuration from YAML file
   *
   * Supports both ~/.agentcards/config.yaml and Claude Code mcp.json
   */
  async loadConfig(): Promise<MCPConfig> {
    try {
      log.debug(`Loading MCP configuration from ${this.configPath}`);

      // Read config file
      const fileContent = await Deno.readTextFile(this.configPath);

      // Parse YAML or JSON based on file extension
      let parsed: unknown;

      if (this.configPath.endsWith(".json")) {
        parsed = JSON.parse(fileContent);
      } else {
        parsed = parse(fileContent) as Record<string, unknown>;
      }

      // Normalize to MCPConfig format
      const config = this.normalizeConfig(parsed);

      // Validate configuration
      this.validateConfig(config);

      this.config = config;
      log.info(`Configuration loaded: ${config.servers.length} servers found`);

      return config;
    } catch (error) {
      log.error(`Failed to load configuration: ${error}`);
      throw new Error(`Cannot load MCP configuration: ${error}`);
    }
  }

  /**
   * Normalize various config formats to MCPConfig
   */
  private normalizeConfig(raw: unknown): MCPConfig {
    // Handle Claude Code mcp.json format: { mcpServers: { "name": { command, args, ... } } }
    if (
      typeof raw === "object" && raw !== null && "mcpServers" in raw
    ) {
      const mcpServers = (raw as Record<string, unknown>).mcpServers as
        | Record<string, unknown>
        | undefined;

      if (!mcpServers || typeof mcpServers !== "object") {
        return { servers: [] };
      }

      const servers: MCPServer[] = [];
      for (const [id, config] of Object.entries(mcpServers)) {
        if (typeof config === "object" && config !== null) {
          const cfg = config as Record<string, unknown>;
          servers.push({
            id,
            name: id,
            command: String(cfg.command || ""),
            args: Array.isArray(cfg.args) ? cfg.args.map(String) : undefined,
            env: typeof cfg.env === "object" ? cfg.env as Record<string, string> : undefined,
            protocol: String(cfg.protocol || "stdio") as "stdio" | "sse",
          });
        }
      }
      return { servers };
    }

    // Handle AgentCards config.yaml format: { servers: [...] }
    if (typeof raw === "object" && raw !== null && "servers" in raw) {
      const servers = (raw as Record<string, unknown>).servers;
      if (Array.isArray(servers)) {
        return {
          servers: servers.map((s) => {
            const srv = s as Record<string, unknown>;
            return {
              id: String(srv.id || srv.name || "unknown"),
              name: String(srv.name || srv.id || "unknown"),
              command: String(srv.command || ""),
              args: Array.isArray(srv.args) ? srv.args.map(String) : undefined,
              env: typeof srv.env === "object" ? srv.env as Record<string, string> : undefined,
              protocol: String(srv.protocol || "stdio") as "stdio" | "sse",
            };
          }),
        };
      }
    }

    return { servers: [] };
  }

  /**
   * Validate MCP configuration
   */
  private validateConfig(config: MCPConfig): void {
    if (!Array.isArray(config.servers)) {
      throw new Error("Invalid config: servers must be an array");
    }

    for (const server of config.servers) {
      if (!server.id || !server.name || !server.command) {
        throw new Error(
          `Invalid server config: missing id, name, or command`,
        );
      }

      if (server.protocol && !["stdio", "sse"].includes(server.protocol)) {
        throw new Error(
          `Invalid protocol for ${server.id}: must be "stdio" or "sse"`,
        );
      }
    }
  }

  /**
   * Discover all MCP servers from configuration
   *
   * Returns list of servers that can be connected to
   */
  async discoverServers(): Promise<MCPServer[]> {
    if (!this.config) {
      await this.loadConfig();
    }

    if (!this.config) {
      throw new Error("No servers configured");
    }

    log.info(`Discovered ${this.config.servers.length} MCP servers`);
    return this.config.servers;
  }

  /**
   * Get a specific server by ID
   */
  getServer(serverId: string): MCPServer | undefined {
    return this.config?.servers.find((s) => s.id === serverId);
  }

  /**
   * Get all servers with a specific protocol
   */
  getServersByProtocol(protocol: "stdio" | "sse"): MCPServer[] {
    return this.config?.servers.filter((s) => s.protocol === protocol) || [];
  }

  /**
   * Get configuration
   */
  getConfig(): MCPConfig | null {
    return this.config;
  }
}

/**
 * Create a discovery engine for the default config location
 */
export function createDefaultDiscovery(): MCPServerDiscovery {
  const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || ".";
  const configPath = `${homeDir}/.agentcards/config.yaml`;
  return new MCPServerDiscovery(configPath);
}
