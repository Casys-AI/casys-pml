/**
 * CLI Utilities
 *
 * Provides utility functions for CLI operations including
 * OS-specific path detection for Claude Desktop config.
 *
 * @module cli/utils
 */

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
 * Get the AgentCards config directory path
 *
 * Returns ~/.agentcards on Unix-like systems
 * Returns %USERPROFILE%\.agentcards on Windows
 */
export function getAgentCardsConfigDir(): string {
  const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE");
  if (!homeDir) {
    throw new Error("Cannot determine home directory");
  }

  const os = Deno.build.os;
  const separator = os === "windows" ? "\\" : "/";
  return `${homeDir}${separator}.agentcards`;
}

/**
 * Get the AgentCards config file path
 */
export function getAgentCardsConfigPath(): string {
  const configDir = getAgentCardsConfigDir();
  const os = Deno.build.os;
  const separator = os === "windows" ? "\\" : "/";
  return `${configDir}${separator}config.yaml`;
}

/**
 * Get the AgentCards database path
 */
export function getAgentCardsDatabasePath(): string {
  const configDir = getAgentCardsConfigDir();
  const os = Deno.build.os;
  const separator = os === "windows" ? "\\" : "/";
  return `${configDir}${separator}.agentcards.db`;
}
