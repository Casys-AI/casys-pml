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

  let backedUp: string | undefined;

  try {
    // Check for existing .mcp.json
    if (await exists(mcpConfigPath)) {
      const shouldBackup = await handleExistingConfig(mcpConfigPath, options);
      if (shouldBackup === "abort") {
        return {
          success: false,
          mcpConfigPath,
          pmlConfigPath,
          error: "Aborted by user",
        };
      }
      if (shouldBackup === "backup") {
        backedUp = await backupConfig(mcpConfigPath);
      }
    }

    // Generate .mcp.json
    const mcpConfig = generateMcpConfig(port, options.apiKey);
    await Deno.writeTextFile(
      mcpConfigPath,
      JSON.stringify(mcpConfig, null, 2) + "\n",
    );
    console.log(`  ${colors.green("✓")} Created ${MCP_CONFIG_FILE}`);

    // Generate .pml.json
    const pmlConfig = generatePmlConfig(workspace, port, cloudUrl);
    await Deno.writeTextFile(
      pmlConfigPath,
      JSON.stringify(pmlConfig, null, 2) + "\n",
    );
    console.log(`  ${colors.green("✓")} Created ${PML_CONFIG_FILE}`);

    // Update .gitignore with PML entries
    await updateGitignore(workspace);

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
  options: InitOptions,
): Promise<"backup" | "overwrite" | "abort"> {
  if (options.force) {
    return "overwrite";
  }

  if (options.yes) {
    return "backup";
  }

  console.log(colors.yellow(`\n⚠ Existing ${MCP_CONFIG_FILE} found.\n`));

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
async function backupConfig(configPath: string): Promise<string> {
  const backupPath = `${configPath}.backup`;
  await Deno.copyFile(configPath, backupPath);
  console.log(`  ${colors.green("✓")} Backed up to ${MCP_CONFIG_FILE}.backup`);
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
): PmlConfig {
  return {
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
  };
}
