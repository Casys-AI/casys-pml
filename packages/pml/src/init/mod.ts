/**
 * Init Module
 *
 * Handles project initialization and config file generation.
 *
 * @module init
 */

import { exists } from "@std/fs";
import { join } from "@std/path";
import * as colors from "@std/fmt/colors";
import type { InitOptions, InitResult, McpConfig, PmlConfig } from "../types.ts";

const VERSION = "0.1.0";
const MCP_CONFIG_FILE = ".mcp.json";
const PML_CONFIG_FILE = ".pml.json";

/**
 * Default BYOK environment variable placeholders
 */
const DEFAULT_ENV_VARS: Record<string, string> = {
  PML_API_KEY: "${PML_API_KEY}",
  TAVILY_API_KEY: "${TAVILY_API_KEY}",
  AIRTABLE_API_KEY: "${AIRTABLE_API_KEY}",
  EXA_API_KEY: "${EXA_API_KEY}",
};

/**
 * Initialize PML in the current directory
 *
 * Creates .mcp.json and .pml.json configuration files.
 * Backs up existing .mcp.json if present.
 */
export async function initProject(options: InitOptions = {}): Promise<InitResult> {
  const cwd = Deno.cwd();
  const mcpConfigPath = join(cwd, MCP_CONFIG_FILE);
  const pmlConfigPath = join(cwd, PML_CONFIG_FILE);

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
    await Deno.writeTextFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2) + "\n");
    console.log(`  ${colors.green("✓")} Created ${MCP_CONFIG_FILE}`);

    // Generate .pml.json
    const pmlConfig = generatePmlConfig(cwd, port, cloudUrl);
    await Deno.writeTextFile(pmlConfigPath, JSON.stringify(pmlConfig, null, 2) + "\n");
    console.log(`  ${colors.green("✓")} Created ${PML_CONFIG_FILE}`);

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
  const response = prompt("  [b]ackup and continue, [o]verwrite, or [a]bort? (b/o/a)");

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
 */
function generateMcpConfig(port: number, apiKey?: string): McpConfig {
  const env = { ...DEFAULT_ENV_VARS };

  // If API key provided, set it directly
  if (apiKey) {
    env.PML_API_KEY = apiKey;
  }

  return {
    pml: {
      type: "http",
      url: `http://localhost:${port}/mcp`,
      env,
    },
  };
}

/**
 * Default safe tools (pure computation, no I/O)
 */
const DEFAULT_ALLOW_TOOLS = [
  "json:*",
  "math:*",
  "datetime:*",
  "crypto:*",
  "collections:*",
  "validation:*",
  "format:*",
  "transform:*",
  "string:*",
  "path:*",
  "color:*",
  "geo:*",
  "algo:*",
  "faker:*",
];

/**
 * Default tools requiring confirmation (I/O, network, system)
 */
const DEFAULT_ASK_TOOLS = [
  "filesystem:*",
  "github:*",
  "docker:*",
  "database:*",
  "ssh:*",
  "process:*",
  "cloud:*",
  "network:*",
  "kubernetes:*",
];

/**
 * Generate .pml.json configuration
 */
function generatePmlConfig(workspace: string, port: number, cloudUrl: string): PmlConfig {
  return {
    version: VERSION,
    workspace,
    cloud: {
      url: cloudUrl,
      apiKey: "${PML_API_KEY}",
    },
    server: {
      port,
    },
    permissions: {
      allow: DEFAULT_ALLOW_TOOLS,
      deny: [],
      ask: DEFAULT_ASK_TOOLS,
    },
  };
}
