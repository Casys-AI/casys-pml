/**
 * MCP Servers Configuration Loader
 *
 * Loads and validates mcpServers from .pml.json with environment variable resolution.
 *
 * @module config
 */

import type { McpServerConfig, PmlConfig } from "./types.ts";
import * as log from "@std/log";

/**
 * Resolved MCP server configuration.
 * Environment variables are expanded to their actual values.
 */
export interface ResolvedMcpServer {
  name: string;
  config: McpServerConfig;
}

/**
 * Pattern for environment variable placeholders: ${VAR_NAME}
 */
const ENV_VAR_PATTERN = /\$\{([^}]+)\}/g;

/**
 * Resolve environment variables in a string.
 * Replaces ${VAR_NAME} with Deno.env.get("VAR_NAME").
 *
 * @param value - String potentially containing ${VAR} placeholders
 * @returns Resolved string with env vars expanded
 * @throws Error if env var is referenced but not set
 */
function resolveEnvString(value: string): string {
  return value.replace(ENV_VAR_PATTERN, (_match, varName) => {
    const envValue = Deno.env.get(varName);
    if (envValue === undefined) {
      // F8 Fix: Don't leak env var names in output, use empty string
      log.warn(`[config] Environment variable not set, using empty string`);
      return "";
    }
    return envValue;
  });
}

/**
 * Resolve environment variables in an env object.
 *
 * @param env - Object with potential ${VAR} values
 * @returns Resolved env object
 */
function resolveEnvObject(env: Record<string, string>): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    resolved[key] = resolveEnvString(value);
  }
  return resolved;
}

/**
 * Resolve environment variables in MCP server config.
 *
 * @param config - MCP server config with potential ${VAR} placeholders
 * @returns Config with env vars resolved
 */
function resolveServerConfig(config: McpServerConfig): McpServerConfig {
  const resolved: McpServerConfig = { ...config };

  // Resolve env object if present
  if (config.env) {
    resolved.env = resolveEnvObject(config.env);
  }

  // Resolve command if present (might contain paths with env vars)
  if (config.command) {
    resolved.command = resolveEnvString(config.command);
  }

  // Resolve args if present
  if (config.args) {
    resolved.args = config.args.map(resolveEnvString);
  }

  // Resolve URL if present
  if (config.url) {
    resolved.url = resolveEnvString(config.url);
  }

  return resolved;
}

/**
 * Load and resolve MCP servers from PML config.
 *
 * @param pmlConfig - Loaded PML config (from .pml.json)
 * @returns Map of server name to resolved config
 */
export function loadMcpServers(pmlConfig: PmlConfig): Map<string, McpServerConfig> {
  const servers = new Map<string, McpServerConfig>();

  if (!pmlConfig.mcpServers) {
    return servers;
  }

  for (const [name, rawConfig] of Object.entries(pmlConfig.mcpServers)) {
    // Skip "pml" server - that's us
    if (name === "pml") {
      log.debug(`[config] Skipping 'pml' server (that's us)`);
      continue;
    }

    // Default type to "stdio" if not specified (matches Claude Code/Desktop behavior)
    const config: McpServerConfig = {
      ...rawConfig,
      type: rawConfig.type ?? "stdio",
    };

    // Validate required fields based on type
    if (config.type === "stdio" && !config.command) {
      log.warn(`[config] MCP server '${name}' is stdio type but missing command, skipping`);
      continue;
    }

    if (config.type === "http" && !config.url) {
      log.warn(`[config] MCP server '${name}' is http type but missing url, skipping`);
      continue;
    }

    // Resolve env vars and add to map
    const resolved = resolveServerConfig(config);
    servers.set(name, resolved);

    log.debug(`[config] Loaded MCP server: ${name} (${config.type})`);
  }

  return servers;
}

/**
 * Get list of resolved MCP servers as array.
 *
 * @param pmlConfig - Loaded PML config
 * @returns Array of resolved server configs with names
 */
export function getMcpServersList(pmlConfig: PmlConfig): ResolvedMcpServer[] {
  const servers = loadMcpServers(pmlConfig);
  return Array.from(servers.entries()).map(([name, config]) => ({
    name,
    config,
  }));
}

/**
 * Check if environment variable is set.
 * Useful for validation before attempting to spawn MCP servers.
 *
 * @param envObj - Env object from config
 * @returns Array of missing env var names
 */
export function getMissingEnvVars(envObj: Record<string, string> | undefined): string[] {
  if (!envObj) return [];

  const missing: string[] = [];
  for (const value of Object.values(envObj)) {
    const matches = value.matchAll(ENV_VAR_PATTERN);
    for (const match of matches) {
      const varName = match[1];
      if (!Deno.env.get(varName)) {
        missing.push(varName);
      }
    }
  }
  return [...new Set(missing)]; // Dedupe
}
