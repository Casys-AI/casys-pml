/**
 * Init Module
 *
 * Handles project initialization and config file generation.
 * Uses workspace resolution to detect project root.
 *
 * @module init
 */

import { exists } from "@std/fs";
import { join } from "@std/path";
import * as colors from "@std/fmt/colors";
import type {
  InitOptions,
  InitResult,
  McpConfig,
  McpServerConfig,
  PmlConfig,
} from "../types.ts";
import {
  getWorkspaceSourceDescription,
  resolveWorkspaceWithDetails,
} from "../workspace.ts";
import { PACKAGE_VERSION } from "../cli/shared/constants.ts";

const MCP_CONFIG_FILE = ".mcp.json";
const PML_CONFIG_FILE = ".pml.json";

// Note: PML_API_KEY is no longer passed via .mcp.json env
// The pml stdio command auto-loads it from .env in the workspace

/**
 * Detect existing MCP servers from .mcp.json.
 * Excludes "pml" since that's managed separately.
 *
 * @param mcpConfigPath - Path to .mcp.json
 * @returns Record of server configs or null if none found
 */
async function detectExistingServers(
  mcpConfigPath: string,
): Promise<Record<string, McpServerConfig> | null> {
  try {
    const content = await Deno.readTextFile(mcpConfigPath);
    const config = JSON.parse(content) as McpConfig;

    if (!config.mcpServers) {
      return null;
    }

    // Exclude "pml" - we manage that separately
    const otherServers: Record<string, McpServerConfig> = {};
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      if (name !== "pml") {
        otherServers[name] = serverConfig;
      }
    }

    return Object.keys(otherServers).length > 0 ? otherServers : null;
  } catch {
    return null;
  }
}

/**
 * Prompt user to migrate existing servers to .pml.json
 *
 * @param existingServers - Servers detected from .mcp.json
 * @param options - Init options
 * @returns Servers to migrate or undefined
 */
async function promptMigration(
  existingServers: Record<string, McpServerConfig>,
  options: InitOptions,
): Promise<Record<string, McpServerConfig> | undefined> {
  const serverCount = Object.keys(existingServers).length;
  const serverNames = Object.keys(existingServers).join(", ");

  if (options.yes) {
    // Auto-migrate in non-interactive mode
    console.log(`  ${colors.green("+")} Auto-migrating ${serverCount} MCP server(s): ${serverNames}`);
    return existingServers;
  }

  console.log(
    colors.cyan(`\n  Found ${serverCount} MCP server(s) in existing config: ${serverNames}`),
  );
  console.log(
    colors.dim("  Migrating enables tool discovery for config-aware suggestions."),
  );

  const response = prompt("  Copy them to .pml.json? (y/n)");

  if (response?.toLowerCase() === "y" || response?.toLowerCase() === "yes") {
    console.log(`  ${colors.green("+")} Migrating ${serverCount} MCP server(s)`);
    return existingServers;
  }

  console.log(`  ${colors.dim("-")} Skipping MCP server migration`);
  return undefined;
}

/**
 * Silent logger for init (we display our own messages)
 */
const silentLogger = {
  info: () => {},
  warn: () => {},
};

/**
 * Initialize PML in the detected workspace
 *
 * Creates .mcp.json and .pml.json configuration files.
 * Backs up existing .mcp.json if present.
 *
 * Uses workspace resolution:
 * 1. PML_WORKSPACE env var
 * 2. Project root detection (markers)
 * 3. Current directory fallback
 */
export async function initProject(
  options: InitOptions = {},
): Promise<InitResult> {
  // Resolve workspace using priority system
  const workspaceResult = resolveWorkspaceWithDetails(silentLogger);
  const workspace = workspaceResult.path;

  // Display workspace info
  console.log(`  ${colors.dim("Workspace:")} ${workspace}`);
  console.log(
    `  ${colors.dim("Detected via:")} ${
      getWorkspaceSourceDescription(workspaceResult)
    }`,
  );
  console.log();

  const mcpConfigPath = join(workspace, MCP_CONFIG_FILE);
  const pmlConfigPath = join(workspace, PML_CONFIG_FILE);

  const port = options.port ?? 3003;
  const cloudUrl = options.cloudUrl ?? "https://pml.casys.ai";

  let backedUpMcp: string | undefined;
  let backedUpPml: string | undefined;

  // Detect existing MCP servers for migration (before backup)
  let migratedServers: Record<string, McpServerConfig> | undefined;

  try {
    // Check for existing .mcp.json
    if (await exists(mcpConfigPath)) {
      // Detect servers BEFORE asking about backup
      const existingServers = await detectExistingServers(mcpConfigPath);

      const shouldBackup = await handleExistingConfig(mcpConfigPath, MCP_CONFIG_FILE, options);
      if (shouldBackup === "abort") {
        return {
          success: false,
          mcpConfigPath,
          pmlConfigPath,
          error: "Aborted by user",
        };
      }
      if (shouldBackup === "backup") {
        backedUpMcp = await backupConfig(mcpConfigPath, MCP_CONFIG_FILE);
      }

      // Prompt for migration if servers found
      if (existingServers) {
        migratedServers = await promptMigration(existingServers, options);
      }
    }

    // Check for existing .pml.json (may contain user's mcpServers config)
    if (await exists(pmlConfigPath)) {
      const shouldBackup = await handleExistingConfig(pmlConfigPath, PML_CONFIG_FILE, options);
      if (shouldBackup === "abort") {
        return {
          success: false,
          mcpConfigPath,
          pmlConfigPath,
          error: "Aborted by user",
        };
      }
      if (shouldBackup === "backup") {
        backedUpPml = await backupConfig(pmlConfigPath, PML_CONFIG_FILE);
      }
    }

    // Generate .mcp.json
    const mcpConfig = generateMcpConfig(port, options.apiKey);
    await Deno.writeTextFile(
      mcpConfigPath,
      JSON.stringify(mcpConfig, null, 2) + "\n",
    );
    console.log(`  ${colors.green("✓")} Created ${MCP_CONFIG_FILE}`);

    // Generate .pml.json (with migrated servers if any)
    const pmlConfig = generatePmlConfig(workspace, port, cloudUrl, migratedServers);
    await Deno.writeTextFile(
      pmlConfigPath,
      JSON.stringify(pmlConfig, null, 2) + "\n",
    );
    console.log(`  ${colors.green("✓")} Created ${PML_CONFIG_FILE}`);

    // Update .gitignore with PML entries
    await updateGitignore(workspace);

    // Combine backup paths for result
    const backedUp = [backedUpMcp, backedUpPml].filter(Boolean).join(", ") || undefined;

    return {
      success: true,
      mcpConfigPath,
      pmlConfigPath,
      backedUp,
    };
  } catch (error) {
    return {
      success: false,
      mcpConfigPath,
      pmlConfigPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Handle existing config file
 *
 * @returns "backup" | "overwrite" | "abort"
 */
async function handleExistingConfig(
  _configPath: string,
  configName: string,
  options: InitOptions,
): Promise<"backup" | "overwrite" | "abort"> {
  if (options.force) {
    return "overwrite";
  }

  if (options.yes) {
    return "backup";
  }

  console.log(colors.yellow(`\n⚠ Existing ${configName} found.\n`));

  // Simple prompt without external dependencies
  const response = prompt(
    "  [b]ackup and continue, [o]verwrite, or [a]bort? (b/o/a)",
  );

  switch (response?.toLowerCase()) {
    case "b":
    case "backup":
      return "backup";
    case "o":
    case "overwrite":
      return "overwrite";
    case "a":
    case "abort":
    default:
      return "abort";
  }
}

/**
 * Backup existing config file
 */
async function backupConfig(configPath: string, configName: string): Promise<string> {
  const backupPath = `${configPath}.backup`;
  await Deno.copyFile(configPath, backupPath);
  console.log(`  ${colors.green("✓")} Backed up to ${configName}.backup`);
  return backupPath;
}

/**
 * Generate .mcp.json configuration
 *
 * Claude Code expects: { "mcpServers": { "pml": { ... } } }
 * Primary transport is stdio (Claude Code spawns the process).
 *
 * Note: PML_API_KEY is NOT passed via env - the pml stdio command
 * auto-loads it from .env in the workspace. This avoids the
 * "Missing environment variables" warning in Claude Code.
 */
function generateMcpConfig(_port: number, apiKey?: string): McpConfig {
  const serverConfig: McpConfig["mcpServers"]["pml"] = {
    type: "stdio",
    command: "pml",
    args: ["stdio"],
  };

  // Only add env if API key explicitly provided (e.g., for CI/CD)
  if (apiKey) {
    serverConfig.env = { PML_API_KEY: apiKey };
  }

  return {
    mcpServers: {
      pml: serverConfig,
    },
  };
}

/**
 * PML entries to add to .gitignore
 *
 * These are user-specific and should not be committed:
 * - .pml.json: User permissions and config
 * - .pml/: Per-project state (lockfile, deps, client-id)
 */
const GITIGNORE_ENTRIES = [
  "",
  "# PML (per-project config and state)",
  ".pml.json",
  ".pml/",
];

/**
 * Update .gitignore with PML entries
 *
 * Adds entries if they don't exist, creates .gitignore if missing.
 */
async function updateGitignore(workspace: string): Promise<void> {
  const gitignorePath = join(workspace, ".gitignore");

  let content = "";
  try {
    content = await Deno.readTextFile(gitignorePath);
  } catch {
    // File doesn't exist - will create it
  }

  // Check which entries are missing
  const missingEntries: string[] = [];
  for (const entry of GITIGNORE_ENTRIES) {
    // Skip empty lines and comments for checking
    if (entry === "" || entry.startsWith("#")) continue;
    if (!content.includes(entry)) {
      missingEntries.push(entry);
    }
  }

  // Add missing entries
  if (missingEntries.length > 0) {
    const toAdd = GITIGNORE_ENTRIES.join("\n");
    const newContent = content.endsWith("\n") || content === ""
      ? content + toAdd + "\n"
      : content + "\n" + toAdd + "\n";

    await Deno.writeTextFile(gitignorePath, newContent);
    console.log(`  ${colors.green("✓")} Updated .gitignore with PML entries`);
  } else {
    console.log(`  ${colors.dim("•")} .gitignore already has PML entries`);
  }
}

/**
 * Generate .pml.json configuration
 *
 * Note: workspace is stored as "." to indicate dynamic detection.
 * This makes the config portable (works after clone/move).
 *
 * Empty permissions = everything defaults to "ask".
 * User can add patterns to allow/deny/ask as needed.
 *
 * Server section omitted - only needed for local dev with `pml serve`.
 */
function generatePmlConfig(
  _workspace: string, // Unused - we store "." for portability
  _port: number, // Unused - server section omitted from template
  cloudUrl: string,
  mcpServers?: Record<string, McpServerConfig>,
): PmlConfig {
  const config: PmlConfig = {
    version: PACKAGE_VERSION,
    workspace: ".", // Dynamic detection via resolveWorkspace() - portable!
    cloud: {
      url: cloudUrl,
      // Note: PML_API_KEY is loaded from .env, not stored here
    },
    permissions: {
      allow: [], // Empty = nothing auto-approved
      deny: [], // Empty = nothing blocked
      ask: [], // Empty = implicit ask for everything
    },
    mcpServers: mcpServers ?? {},
  };

  return config;
}
