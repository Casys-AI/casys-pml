/**
 * PML Context Initialization
 *
 * Shared initialization logic extracted from serve-command.ts and stdio-command.ts.
 * Both commands call initializePmlContext() to set up the common PML environment.
 *
 * @module server/pml-context
 */

import { exists } from "@std/fs";
import { join } from "@std/path";
import type { PmlConfig, PmlPermissions } from "../types.ts";
import {
  isValidWorkspace,
  resolveWorkspaceWithDetails,
  type WorkspaceResult,
} from "../workspace.ts";
import { loadUserPermissions } from "../permissions/loader.ts";
import {
  initializeRouting,
  syncRoutingConfig,
} from "../routing/mod.ts";
import { CapabilityLoader, LockfileManager } from "../loader/mod.ts";
import { SessionClient } from "../session/mod.ts";
import { TraceSyncer } from "../tracing/mod.ts";
import { reloadEnv } from "../byok/env-loader.ts";
import { loadMcpServers } from "../config.ts";
import {
  PML_CONFIG_FILE,
  PACKAGE_VERSION,
  SILENT_LOGGER,
  resolveExposedCapabilities,
  type ExposedCapability,
} from "../cli/shared/mod.ts";
import type { Logger } from "../cli/shared/types.ts";

/**
 * PML context containing all initialized services.
 * Shared between serve and stdio commands.
 */
export interface PmlContext {
  /** Resolved workspace path */
  workspace: string;
  /** Workspace resolution details */
  workspaceResult: WorkspaceResult;
  /** Loaded PML config */
  config: PmlConfig;
  /** Path to config file */
  configPath: string;
  /** Cloud URL */
  cloudUrl: string;
  /** API key */
  apiKey: string;
  /** Loaded permissions */
  permissions: PmlPermissions;
  /** Session client (null if registration failed) */
  sessionClient: SessionClient | null;
  /** Capability loader (null if init failed) */
  loader: CapabilityLoader | null;
  /** Lockfile manager (null if init failed) */
  lockfileManager: LockfileManager | null;
  /** Trace syncer for execution trace upload */
  traceSyncer: TraceSyncer;
  /** Exposed capabilities from --expose flag */
  exposedCapabilities: ExposedCapability[];
  /** Whether --only mode is active */
  onlyMode: boolean;
  /** User-configured MCP servers */
  userMcpServers: Map<string, import("../types.ts").McpServerConfig>;
}

/**
 * Options for PML context initialization.
 */
export interface PmlContextOptions {
  /** Capability names to expose (--expose flag) */
  expose?: string[];
  /** Only expose specified capabilities (--only flag) */
  only?: boolean;
  /** Logger for initialization progress */
  logger: Logger;
}

/**
 * Initialize the PML context with all services.
 *
 * Performs the shared initialization flow used by both serve and stdio:
 * 1. Resolve workspace
 * 2. Load .env (reloadEnv)
 * 3. Validate PML_API_KEY
 * 4. Load config from .pml.json
 * 5. Load permissions
 * 6. Sync routing config from cloud
 * 7. Register session (SessionClient)
 * 8. Initialize CapabilityLoader + LockfileManager
 * 9. Initialize TraceSyncer
 * 10. Resolve exposed capabilities (--expose)
 *
 * @throws Exits process if PML_API_KEY is missing or workspace is invalid
 */
export async function initializePmlContext(
  options: PmlContextOptions,
): Promise<PmlContext> {
  const { logger } = options;

  // 1. Resolve workspace
  const workspaceResult = resolveWorkspaceWithDetails(SILENT_LOGGER);
  const workspace = workspaceResult.path;

  // 2. Load .env (always — mcpServers env vars like ERPNEXT_URL need it too)
  try {
    await reloadEnv(workspace);
  } catch (e) {
    logger.debug(`Failed to load .env: ${e instanceof Error ? e.message : e}`);
  }

  // 3. Validate PML_API_KEY
  const apiKey = Deno.env.get("PML_API_KEY");
  if (!apiKey) {
    console.error("[pml] ERROR: PML_API_KEY environment variable is required");
    console.error("[pml] Set it with: export PML_API_KEY=your_key");
    console.error("[pml] Or add PML_API_KEY=your_key to .env in your project");
    Deno.exit(1);
  }

  if (!isValidWorkspace(workspace)) {
    console.error(`[pml] ERROR: Invalid workspace: ${workspace}`);
    Deno.exit(1);
  }

  // 4. Load config from .pml.json
  const configPath = join(workspace, PML_CONFIG_FILE);
  const defaultConfig: PmlConfig = {
    version: PACKAGE_VERSION,
    workspace,
    cloud: { url: "https://pml.casys.ai" },
    permissions: { allow: [], deny: [], ask: ["*"] },
  };

  let config: PmlConfig = defaultConfig;
  if (await exists(configPath)) {
    try {
      const content = await Deno.readTextFile(configPath);
      config = { ...defaultConfig, ...JSON.parse(content) };
    } catch (e) {
      logger.debug(`Failed to parse ${PML_CONFIG_FILE}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 5. Load permissions
  const { permissions } = await loadUserPermissions(workspace, SILENT_LOGGER);

  // 6. Sync routing config from cloud
  const cloudUrl = Deno.env.get("PML_CLOUD_URL") ?? config.cloud?.url ?? "https://pml.casys.ai";
  const { config: routingConfig } = await syncRoutingConfig(cloudUrl, SILENT_LOGGER);
  initializeRouting(routingConfig);

  // 7. Register session
  let sessionClient: SessionClient | null = null;
  try {
    sessionClient = new SessionClient({ cloudUrl, apiKey, version: PACKAGE_VERSION, workspace });
    await sessionClient.register();
    logger.debug(`Session registered: ${sessionClient.sessionId?.slice(0, 8)}`);
  } catch (error) {
    logger.debug(`Session registration failed (non-fatal): ${error}`);
    sessionClient = null;
  }

  // 8. Initialize CapabilityLoader + LockfileManager
  let loader: CapabilityLoader | null = null;
  let lockfileManager: LockfileManager | null = null;
  try {
    lockfileManager = new LockfileManager({ workspace });
    await lockfileManager.load();
    loader = await CapabilityLoader.create({ cloudUrl, workspace, permissions, lockfileManager });
    logger.debug("CapabilityLoader initialized");
  } catch (error) {
    logger.debug(`CapabilityLoader init failed (non-fatal): ${error}`);
  }

  // 9. Initialize TraceSyncer (ADR-065: explicit flush only, no auto-flush timer)
  const traceSyncer = new TraceSyncer({
    cloudUrl,
    apiKey,
    batchSize: 10,
    maxRetries: 3,
  });
  logger.debug("TraceSyncer initialized");

  // 10. Resolve exposed capabilities (--expose flag)
  let exposedCapabilities: ExposedCapability[] = [];
  let onlyMode = false;

  if (options.expose && options.expose.length > 0) {
    try {
      exposedCapabilities = await resolveExposedCapabilities(
        options.expose,
        cloudUrl,
        sessionClient,
      );
      onlyMode = options.only === true;
      logger.debug(
        `Exposed ${exposedCapabilities.length} capability(s): ${exposedCapabilities.map((c) => c.name).join(", ")}` +
        (onlyMode ? " (only mode)" : ""),
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[pml] ERROR: Failed to resolve exposed capabilities: ${msg}`);
      Deno.exit(1);
    }
  } else if (options.only) {
    console.error("[pml] ERROR: --only requires --expose to specify which capabilities to expose");
    Deno.exit(1);
  }

  // Load user MCP servers for discovery
  const userMcpServers = loadMcpServers(config);

  return {
    workspace,
    workspaceResult,
    config,
    configPath,
    cloudUrl,
    apiKey,
    permissions,
    sessionClient,
    loader,
    lockfileManager,
    traceSyncer,
    exposedCapabilities,
    onlyMode,
    userMcpServers,
  };
}

/**
 * Shutdown all PML context services gracefully.
 */
export async function shutdownPmlContext(ctx: PmlContext): Promise<void> {
  if (ctx.loader) {
    await ctx.loader.shutdown();
  }
  if (ctx.traceSyncer) {
    await ctx.traceSyncer.shutdown();
  }
  if (ctx.sessionClient) {
    await ctx.sessionClient.shutdown();
  }
}
