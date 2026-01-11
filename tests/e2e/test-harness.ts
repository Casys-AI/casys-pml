/**
 * E2E Test Harness
 *
 * Provides test infrastructure for end-to-end testing of PML package.
 * Creates isolated test environments with temp workspaces.
 *
 * Story 14.8: E2E Integration Testing
 *
 * @module tests/e2e/test-harness
 */

import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import type { PmlConfig, PmlPermissions } from "../../src/types.ts";

/**
 * E2E test context with all necessary paths and config.
 */
export interface E2ETestContext {
  /** Temporary workspace directory */
  workspace: string;
  /** Path to .pml.json config file */
  configPath: string;
  /** Path to .mcp.json file (MCP servers config) */
  mcpJsonPath: string;
  /** Path to .env file */
  envPath: string;
  /** Environment variables for tests */
  envVars: Record<string, string>;
  /** Mock cloud server instance (if started) */
  mockServer?: MockServerHandle;
  /** Created files to track for cleanup */
  createdFiles: string[];
}

/**
 * Handle for mock server control.
 */
export interface MockServerHandle {
  /** Server port */
  port: number;
  /** Server URL */
  url: string;
  /** Shutdown function */
  shutdown: () => void;
}

/**
 * Options for setting up E2E test context.
 */
export interface SetupOptions {
  /** Custom permissions for .pml.json */
  permissions?: Partial<PmlPermissions>;
  /** Environment variables to set */
  envVars?: Record<string, string>;
  /** Additional .env file content */
  envFileContent?: string;
  /** Enable mock cloud server */
  useMockServer?: boolean;
  /** Mock server port (default: 3099) */
  mockServerPort?: number;
  /** Custom .mcp.json content */
  mcpJsonContent?: Record<string, unknown>;
  /** Skip project markers (.git, deno.json) */
  skipProjectMarkers?: boolean;
}

/**
 * Default permissions for test context.
 */
const DEFAULT_TEST_PERMISSIONS: PmlPermissions = {
  allow: ["filesystem:*", "json:*"],
  deny: [],
  ask: ["*"],
};

/**
 * Set up an E2E test context with isolated workspace.
 *
 * Creates:
 * - Temp workspace directory
 * - .pml.json config file
 * - .env file (if envFileContent provided)
 * - Project markers (.git, deno.json)
 * - Optional mock cloud server
 */
export async function setupE2EContext(
  options: SetupOptions = {},
): Promise<E2ETestContext> {
  // Create temp workspace
  const workspace = await Deno.makeTempDir({ prefix: "pml_e2e_" });

  const configPath = join(workspace, ".pml.json");
  const mcpJsonPath = join(workspace, ".mcp.json");
  const envPath = join(workspace, ".env");
  const createdFiles: string[] = [];

  // Create project markers for workspace detection (unless skipped)
  if (!options.skipProjectMarkers) {
    // Create .git directory (workspace marker)
    const gitDir = join(workspace, ".git");
    await ensureDir(gitDir);
    createdFiles.push(gitDir);

    // Create deno.json (project marker)
    const denoJsonPath = join(workspace, "deno.json");
    await Deno.writeTextFile(
      denoJsonPath,
      JSON.stringify({
        name: "pml-e2e-test",
        version: "0.0.0",
        tasks: {},
      }, null, 2),
    );
    createdFiles.push(denoJsonPath);
  }

  // Merge permissions
  const permissions: PmlPermissions = {
    ...DEFAULT_TEST_PERMISSIONS,
    ...options.permissions,
  };

  // Create .pml.json config
  const config: PmlConfig = {
    version: "0.1.0",
    workspace,
    cloud: {
      url: options.useMockServer
        ? `http://localhost:${options.mockServerPort ?? 3099}`
        : "https://pml.casys.ai",
      apiKey: "${PML_API_KEY}",
    },
    server: { port: 3003 },
    permissions,
  };

  await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2));
  createdFiles.push(configPath);

  // Create .mcp.json if content provided
  if (options.mcpJsonContent) {
    await Deno.writeTextFile(
      mcpJsonPath,
      JSON.stringify(options.mcpJsonContent, null, 2),
    );
    createdFiles.push(mcpJsonPath);
  }

  // Create .env file if content provided
  if (options.envFileContent) {
    await Deno.writeTextFile(envPath, options.envFileContent);
    createdFiles.push(envPath);
  }

  // Build environment variables
  const envVars: Record<string, string> = {
    PML_WORKSPACE: workspace,
    PML_API_KEY: "test-api-key-e2e",
    ...options.envVars,
  };

  // Set environment variables
  for (const [key, value] of Object.entries(envVars)) {
    Deno.env.set(key, value);
  }

  const ctx: E2ETestContext = {
    workspace,
    configPath,
    mcpJsonPath,
    envPath,
    envVars,
    createdFiles,
  };

  return ctx;
}

/**
 * Tear down E2E test context.
 *
 * Cleans up:
 * - Temp workspace directory
 * - Mock server (if running)
 * - Environment variables
 */
export async function teardownE2EContext(ctx: E2ETestContext): Promise<void> {
  // Shutdown mock server if running
  if (ctx.mockServer) {
    ctx.mockServer.shutdown();
  }

  // Clean up environment variables
  for (const key of Object.keys(ctx.envVars)) {
    Deno.env.delete(key);
  }

  // Remove workspace directory
  try {
    await Deno.remove(ctx.workspace, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Create a test file in the workspace.
 */
export async function createTestFile(
  ctx: E2ETestContext,
  relativePath: string,
  content: string,
): Promise<string> {
  const fullPath = join(ctx.workspace, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));

  if (dir !== ctx.workspace) {
    await ensureDir(dir);
  }

  await Deno.writeTextFile(fullPath, content);
  ctx.createdFiles.push(fullPath);

  return fullPath;
}

/**
 * Update .pml.json permissions in test context.
 */
export async function updatePermissions(
  ctx: E2ETestContext,
  permissions: Partial<PmlPermissions>,
): Promise<void> {
  const configContent = await Deno.readTextFile(ctx.configPath);
  const config = JSON.parse(configContent) as PmlConfig;

  const existingPermissions = config.permissions ?? DEFAULT_TEST_PERMISSIONS;
  config.permissions = {
    allow: permissions.allow ?? existingPermissions.allow,
    deny: permissions.deny ?? existingPermissions.deny,
    ask: permissions.ask ?? existingPermissions.ask,
  };

  await Deno.writeTextFile(ctx.configPath, JSON.stringify(config, null, 2));
}

/**
 * Append to .env file in test context.
 */
export async function appendEnvVar(
  ctx: E2ETestContext,
  key: string,
  value: string,
): Promise<void> {
  let content = "";

  if (await exists(ctx.envPath)) {
    content = await Deno.readTextFile(ctx.envPath);
    if (!content.endsWith("\n")) {
      content += "\n";
    }
  }

  content += `${key}=${value}\n`;
  await Deno.writeTextFile(ctx.envPath, content);

  // Also update ctx.envVars for tracking
  ctx.envVars[key] = value;
}

/**
 * Wait for a condition with timeout.
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
  intervalMs: number = 100,
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

/**
 * Assert that a file exists in workspace.
 */
export async function assertFileExists(
  ctx: E2ETestContext,
  relativePath: string,
): Promise<void> {
  const fullPath = join(ctx.workspace, relativePath);
  if (!(await exists(fullPath))) {
    throw new Error(`Expected file to exist: ${fullPath}`);
  }
}

/**
 * Assert that a file contains expected content.
 */
export async function assertFileContains(
  ctx: E2ETestContext,
  relativePath: string,
  expected: string,
): Promise<void> {
  const fullPath = join(ctx.workspace, relativePath);
  const content = await Deno.readTextFile(fullPath);
  if (!content.includes(expected)) {
    throw new Error(
      `Expected file ${relativePath} to contain "${expected}", got: ${content.slice(0, 200)}...`,
    );
  }
}

/**
 * Get file content from workspace.
 */
export async function readTestFile(
  ctx: E2ETestContext,
  relativePath: string,
): Promise<string> {
  const fullPath = join(ctx.workspace, relativePath);
  return await Deno.readTextFile(fullPath);
}
