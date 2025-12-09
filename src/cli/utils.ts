/**
 * CLI Utilities
 *
 * Provides utility functions for CLI operations including
 * OS-specific path detection for Claude Desktop config.
 *
 * @module cli/utils
 */

import { resolvePath } from "../lib/paths.ts";

/**
 * Detect the default MCP configuration path for Claude Desktop
 *
 * Returns OS-specific path:
 * - macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
 * - Linux: ~/.config/Claude/claude_desktop_config.json
 * - Windows: %APPDATA%\Claude\claude_desktop_config.json
 *
 * @throws {Error} If OS is unsupported
 */
export function detectMCPConfigPath(): string {
  const os = Deno.build.os;
  const homeDir = Deno.env.get("HOME");
  const appData = Deno.env.get("APPDATA");

  switch (os) {
    case "darwin": // macOS
      if (!homeDir) {
        throw new Error("HOME environment variable not set");
      }
      return `${homeDir}/Library/Application Support/Claude/claude_desktop_config.json`;

    case "linux":
      if (!homeDir) {
        throw new Error("HOME environment variable not set");
      }
      return `${homeDir}/.config/Claude/claude_desktop_config.json`;

    case "windows":
      if (!appData) {
        throw new Error("APPDATA environment variable not set");
      }
      return `${appData}\\Claude\\claude_desktop_config.json`;

    default:
      throw new Error(`Unsupported operating system: ${os}`);
  }
}

/**
 * Get the Casys Intelligence config directory path
 *
 * Returns ~/.cai on Unix-like systems
 * Returns %USERPROFILE%\.cai on Windows
 */
export function getAgentCardsConfigDir(): string {
  const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE");
  if (!homeDir) {
    throw new Error("Cannot determine home directory");
  }

  const os = Deno.build.os;
  const separator = os === "windows" ? "\\" : "/";
  return `${homeDir}${separator}.cai`;
}

/**
 * Get the Casys Intelligence config file path (JSON format)
 *
 * NOTE: Changed from config.yaml to config.json per ADR-009
 * for MCP ecosystem alignment
 */
export function getAgentCardsConfigPath(): string {
  const configDir = getAgentCardsConfigDir();
  const os = Deno.build.os;
  const separator = os === "windows" ? "\\" : "/";
  return `${configDir}${separator}config.json`;
}

/**
 * Get the legacy YAML config path (deprecated)
 *
 * @deprecated Use getAgentCardsConfigPath() instead
 */
export function getLegacyConfigPath(): string {
  const configDir = getAgentCardsConfigDir();
  const os = Deno.build.os;
  const separator = os === "windows" ? "\\" : "/";
  return `${configDir}${separator}config.yaml`;
}

/**
 * Find config file (JSON or YAML) with auto-detection
 *
 * Prefers JSON, fallback to YAML with deprecation warning
 */
export async function findConfigFile(): Promise<{ path: string; format: "json" | "yaml" }> {
  const jsonPath = getAgentCardsConfigPath();
  const yamlPath = getLegacyConfigPath();

  // Prefer JSON
  try {
    await Deno.stat(jsonPath);
    return { path: jsonPath, format: "json" };
  } catch {
    // Fallback to YAML
    try {
      await Deno.stat(yamlPath);
      console.warn("⚠️  YAML config detected. JSON is now recommended for MCP compatibility.");
      console.warn("    Migrate with: ./cai migrate-config");
      return { path: yamlPath, format: "yaml" };
    } catch {
      // Neither exists - will use JSON for new config
      return { path: jsonPath, format: "json" };
    }
  }
}

/**
 * Get the Casys Intelligence database path
 *
 * Supports custom path via AGENTCARDS_DB_PATH environment variable.
 * This is useful for:
 * - Codespace environments where ~/.cai/ is not persisted
 * - Testing with isolated databases
 * - Custom deployment scenarios
 *
 * @returns Database path (custom or default ~/.cai/.cai.db)
 *
 * @example
 * // Use default path
 * getAgentCardsDatabasePath() // ~/.cai/.cai.db
 *
 * @example
 * // Use custom path in Codespace
 * AGENTCARDS_DB_PATH=/workspaces/AgentCards/.cai.db
 * getAgentCardsDatabasePath() // /workspaces/AgentCards/.cai.db
 */
export function getAgentCardsDatabasePath(): string {
  // Allow custom DB path via environment variable (ADR-021)
  // Support both new CAI_DB_PATH and legacy AGENTCARDS_DB_PATH
  const customPath = Deno.env.get("CAI_DB_PATH") ?? Deno.env.get("AGENTCARDS_DB_PATH");
  if (customPath) {
    // Warn about deprecated env var
    if (Deno.env.get("AGENTCARDS_DB_PATH") && !Deno.env.get("CAI_DB_PATH")) {
      console.warn("⚠️  AGENTCARDS_DB_PATH is deprecated. Use CAI_DB_PATH instead.");
    }
    return resolvePath(customPath);
  }

  // Default: ~/.cai/.cai.db
  const configDir = getAgentCardsConfigDir();
  const os = Deno.build.os;
  const separator = os === "windows" ? "\\" : "/";
  return `${configDir}${separator}.cai.db`;
}

/**
 * Get the workflow templates file path
 *
 * Respects AGENTCARDS_WORKFLOW_PATH environment variable for custom paths.
 * Defaults to ./config/workflow-templates.yaml (relative to current working directory)
 *
 * @returns Absolute or relative path to workflow templates YAML file
 *
 * @example
 * // Use default path
 * getWorkflowTemplatesPath() // ./config/workflow-templates.yaml
 *
 * @example
 * // Use custom path for playground
 * AGENTCARDS_WORKFLOW_PATH=playground/config/workflow-templates.yaml
 * getWorkflowTemplatesPath() // playground/config/workflow-templates.yaml
 */
export function getWorkflowTemplatesPath(): string {
  // Allow custom workflow path via environment variable
  // Support both new CAI_WORKFLOW_PATH and legacy AGENTCARDS_WORKFLOW_PATH
  const customPath = Deno.env.get("CAI_WORKFLOW_PATH") ?? Deno.env.get("AGENTCARDS_WORKFLOW_PATH");
  if (customPath) {
    // Warn about deprecated env var
    if (Deno.env.get("AGENTCARDS_WORKFLOW_PATH") && !Deno.env.get("CAI_WORKFLOW_PATH")) {
      console.warn("⚠️  AGENTCARDS_WORKFLOW_PATH is deprecated. Use CAI_WORKFLOW_PATH instead.");
    }
    return customPath;
  }

  // Default: ./config/workflow-templates.yaml (relative to cwd)
  return "./config/workflow-templates.yaml";
}

/**
 * Calculate SHA-256 hash of a file
 *
 * Used for detecting config changes to trigger auto-init.
 *
 * @param filePath - Path to file to hash
 * @returns Hex-encoded SHA-256 hash string
 */
export async function hashFile(filePath: string): Promise<string> {
  const content = await Deno.readFile(filePath);
  const hashBuffer = await crypto.subtle.digest("SHA-256", content);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Config key for storing MCP servers config hash
 */
export const MCP_CONFIG_HASH_KEY = "mcp_servers_config_hash";
