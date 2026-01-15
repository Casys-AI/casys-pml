/**
 * Unified Capability Loader
 *
 * Orchestrates the full capability loading flow:
 * 1. Fetch metadata from registry
 * 2. Check and install mcp_deps (with HIL)
 * 3. Dynamic import capability code
 * 4. Create mcp.* proxy for tool routing
 *
 * @module loader/capability-loader
 */

import type {
  CapabilityMetadata,
  CapabilityModule,
  ContinueWorkflowParams,
  ExecutionContext,
  LoadedCapability,
  McpDependency,
  McpProxy,
  ToolPermissionApprovalRequired,
} from "./types.ts";
import type { ApprovalRequiredResult } from "./types.ts";
import { LoaderError } from "./types.ts";
import { checkPermission } from "../permissions/loader.ts";
import type { PmlPermissions } from "../types.ts";
import { RegistryClient } from "./registry-client.ts";
import { loadCapabilityModule } from "./deno-loader.ts";
import { fetchCapabilityCode } from "./code-fetcher.ts";
import { createDepState, DepState } from "./dep-state.ts";
import { DepInstaller } from "./dep-installer.ts";
import { StdioManager } from "./stdio-manager.ts";
import { resolveToolRouting } from "../routing/mod.ts";
import { SandboxWorker } from "../sandbox/mod.ts";
import type { SandboxResult } from "../sandbox/mod.ts";
import { TraceCollector, TraceSyncer } from "../tracing/mod.ts";
import type { TraceSyncConfig } from "../tracing/mod.ts";
import { sanitize } from "../byok/sanitizer.ts";
import {
  checkKeys,
  pauseForMissingKeys,
  reloadEnv,
} from "../byok/mod.ts";
// Note: getRequiredKeys removed - now using metadata.install.envRequired from registry
import { LockfileManager } from "../lockfile/mod.ts";
import type { IntegrityApprovalRequired } from "../lockfile/types.ts";
import { loaderLog } from "../logging.ts";

/**
 * Log debug message for loader operations.
 * Automatically sanitizes messages to prevent API key exposure.
 */
function logDebug(message: string): void {
  loaderLog.debug(sanitize(message));
}

/**
 * Default permissions: ask for everything (safe defaults).
 */
const DEFAULT_PERMISSIONS: PmlPermissions = {
  allow: [],
  deny: [],
  ask: ["*"],
};

/**
 * Options for creating a capability loader.
 */
export interface CapabilityLoaderOptions {
  /** Cloud URL for registry */
  cloudUrl: string;
  /** Workspace root path */
  workspace: string;
  /** User permissions (loaded from .pml.json) */
  permissions?: PmlPermissions;
  /** Custom dep state path */
  depStatePath?: string;
  /** Idle timeout for stdio processes (ms) */
  stdioIdleTimeoutMs?: number;
  /**
   * Enable sandboxed execution for capability code.
   * When true, capability code from registry runs in isolated Worker.
   * Default: true (secure by default)
   */
  sandboxEnabled?: boolean;
  /**
   * Enable execution tracing for SHGAT learning (Story 14.5b).
   * When true, traces mcp.* calls and syncs to cloud.
   * Default: true
   */
  tracingEnabled?: boolean;
  /**
   * Custom tracing sync config (overrides defaults).
   * If not provided, uses cloudUrl for sync.
   */
  tracingConfig?: Partial<TraceSyncConfig>;
  /**
   * Lockfile manager for integrity validation (Story 14.7).
   * When provided, validates fetched capabilities against lockfile.
   * If not provided, skips integrity validation.
   */
  lockfileManager?: LockfileManager;
}

/**
 * Unified capability loader.
 *
 * Handles the complete flow from tool request to execution.
 */
export class CapabilityLoader {
  private readonly registryClient: RegistryClient;
  private readonly depState: DepState;
  private readonly installer: DepInstaller;
  private readonly stdioManager: StdioManager;
  private readonly permissions: PmlPermissions;
  private readonly cloudUrl: string;
  private readonly workspace: string;
  private readonly sandboxEnabled: boolean;
  private readonly tracingEnabled: boolean;
  private readonly traceSyncer: TraceSyncer;
  private readonly lockfileManager?: LockfileManager;

  /** Cache of loaded capabilities */
  private readonly loadedCapabilities = new Map<string, LoadedCapability>();

  /** Cache of capability code for sandboxed execution */
  private readonly codeCache = new Map<string, string>();

  /**
   * Tools approved for this session (permission "ask" granted by user).
   * Key format: "namespace:action" (e.g., "memory:create_entities")
   * Approval is per-tool, not per-namespace.
   */
  private readonly approvedTools = new Set<string>();

  /** Whether initialization is complete */
  private initialized = false;

  private constructor(
    options: CapabilityLoaderOptions,
    depState: DepState,
  ) {
    this.cloudUrl = options.cloudUrl;
    this.workspace = options.workspace;
    this.permissions = options.permissions ?? DEFAULT_PERMISSIONS;
    this.sandboxEnabled = options.sandboxEnabled ?? true; // Secure by default
    this.tracingEnabled = options.tracingEnabled ?? true; // Enable tracing by default

    this.registryClient = new RegistryClient({ cloudUrl: options.cloudUrl });
    this.depState = depState;
    this.installer = new DepInstaller(depState);
    this.stdioManager = new StdioManager(options.stdioIdleTimeoutMs);

    // Initialize trace syncer (Story 14.5b)
    this.traceSyncer = new TraceSyncer({
      cloudUrl: options.tracingConfig?.cloudUrl ?? options.cloudUrl,
      apiKey: options.tracingConfig?.apiKey,
      ...options.tracingConfig,
    });

    // Initialize lockfile manager (Story 14.7)
    this.lockfileManager = options.lockfileManager;

    this.initialized = true;
  }

  /**
   * Create and initialize a capability loader.
   *
   * Story 14.6: Loads .env file from workspace at initialization.
   */
  static async create(
    options: CapabilityLoaderOptions,
  ): Promise<CapabilityLoader> {
    // Story 14.6: Load .env file from workspace at startup
    try {
      await reloadEnv(options.workspace);
      logDebug(`Loaded .env from ${options.workspace}`);
    } catch (_error) {
      // .env file may not exist - this is OK
      logDebug(`No .env file found in ${options.workspace}`);
    }

    // Use per-project deps.json (in workspace/.pml/)
    const depState = await createDepState(
      options.depStatePath
        ? { statePath: options.depStatePath }
        : { workspace: options.workspace },
    );
    return new CapabilityLoader(options, depState);
  }

  /**
   * Load a capability by namespace.
   *
   * May return ApprovalRequiredResult if dependencies need user approval.
   * Use loadWithApproval() to handle the stateless approval flow.
   *
   * @deprecated Use loadByFqdn() instead. In normal flow, server resolves FQDN
   * via pml:execute and returns it in execute_locally response. This method
   * does client-side resolution which bypasses server's multi-tenant support.
   * Kept for backwards compatibility and testing.
   *
   * @param namespace - Tool namespace (e.g., "filesystem:read_file")
   * @param continueWorkflow - Optional: approval from previous call
   * @returns Loaded capability or approval required result
   */
  async load(
    namespace: string,
    continueWorkflow?: ContinueWorkflowParams,
  ): Promise<LoadedCapability | ApprovalRequiredResult | IntegrityApprovalRequired> {
    // Check cache
    const cached = this.loadedCapabilities.get(namespace);
    if (cached) {
      logDebug(`Capability cache hit: ${namespace}`);
      return cached;
    }

    logDebug(`Loading capability: ${namespace}`);

    // 1. Fetch metadata from registry (with integrity validation if lockfile available)
    let metadata: CapabilityMetadata;

    if (this.lockfileManager) {
      // Story 14.7: Use fetchWithIntegrity for lockfile validation
      const fetchResult = await this.registryClient.fetchWithIntegrity(
        namespace,
        this.lockfileManager,
      );

      // Check if integrity approval is required
      if ("approvalRequired" in fetchResult && fetchResult.approvalRequired) {
        const integrityApproval = fetchResult as IntegrityApprovalRequired;

        // Handle continueWorkflow for integrity approval
        if (continueWorkflow?.approved === true) {
          // User approved - continue fetch with approval
          const approvedResult = await this.registryClient.continueFetchWithApproval(
            namespace,
            this.lockfileManager,
            true,
          );
          metadata = approvedResult.metadata;
        } else if (continueWorkflow?.approved === false) {
          // User rejected - throw error
          throw new LoaderError(
            "DEPENDENCY_INTEGRITY_FAILED",
            `User rejected integrity change for ${integrityApproval.fqdnBase}`,
            {
              fqdnBase: integrityApproval.fqdnBase,
              oldHash: integrityApproval.oldHash,
              newHash: integrityApproval.newHash,
            },
          );
        } else {
          // Return approval request (HIL pause)
          return integrityApproval;
        }
      } else {
        // No approval needed - extract metadata
        metadata = (fetchResult as { metadata: CapabilityMetadata }).metadata;
      }
    } else {
      // No lockfile manager - use simple fetch
      const { metadata: fetchedMetadata } = await this.registryClient.fetch(namespace);
      metadata = fetchedMetadata;
    }

    // 2. Check and install dependencies
    // If continueWorkflow.approved is true, force install (user approved)
    const forceInstall = continueWorkflow?.approved === true;
    const approvalResult = await this.ensureDependencies(
      metadata,
      forceInstall,
    );

    // If approval is required and not yet approved, return the approval request
    if (approvalResult) {
      if (continueWorkflow?.approved === false) {
        // Handle denial based on approval type
        if (approvalResult.approvalType === "tool_permission") {
          throw new LoaderError(
            "PERMISSION_DENIED",
            `Tool ${approvalResult.toolId} was not approved by user`,
            { toolId: approvalResult.toolId },
          );
        } else if (approvalResult.approvalType === "api_key_required") {
          throw new LoaderError(
            "API_KEY_NOT_CONFIGURED",
            `Required API keys were not configured: ${approvalResult.missingKeys.join(", ")}`,
            { missingKeys: approvalResult.missingKeys },
          );
        }
      }
      return approvalResult;
    }

    // 3. Load capability code (only for deno type - stdio/http don't have code)
    let module: CapabilityModule | null = null;
    let code: string | null = null;

    if (metadata.type === "deno") {
      // Deno capabilities have code to fetch
      if (!metadata.codeUrl) {
        throw new LoaderError(
          "MODULE_IMPORT_FAILED",
          `Deno capability ${namespace} missing codeUrl`,
          { namespace },
        );
      }

      if (this.sandboxEnabled) {
        // Fetch raw code for sandboxed execution
        const { code: fetchedCode } = await fetchCapabilityCode(metadata.codeUrl);
        code = fetchedCode;
        this.codeCache.set(namespace, code);
        logDebug(`Capability code cached for sandbox: ${namespace}`);
      } else {
        // Legacy: direct import (not sandboxed)
        const { module: loadedModule } = await loadCapabilityModule(metadata.codeUrl);
        module = loadedModule;
      }
    } else if (metadata.type === "stdio") {
      // Stdio types are executed via subprocess - no code to load
      logDebug(`Stdio capability registered: ${namespace} (subprocess)`);
    } else {
      // http types should never reach here (server-routed)
      logDebug(`HTTP capability registered: ${namespace} (should be server-routed)`);
    }

    // 4. For client-routed stdio types, build the dependency object for approval/install checks
    // All client-routed tools need local installation. For stdio, the MCP itself must be installed.
    // For deno, mcpDeps are already checked via ensureDependencies() above.
    // Special case: "std" uses binary distribution - no install approval needed
    let stdioDep: McpDependency | null = null;
    const serverName = namespace.split(":")[0];

    if (metadata.routing === "client" && metadata.type === "stdio") {
      if (serverName === "std") {
        // std uses binary distribution - binary-resolver will download automatically
        stdioDep = {
          name: "std",
          type: "stdio" as const,
          install: "binary", // Marker for binary distribution
          version: "latest",
          integrity: metadata.integrity ?? "",
        };

        // std still needs tool_permission approval before first use
        const toolIdForPermission = `${serverName}:*`;
        if (!continueWorkflow?.approved) {
          const stdApproval = await this.ensureDependency(stdioDep, false, toolIdForPermission);
          if (stdApproval) {
            logDebug(`std binary requires approval before download`);
            return stdApproval;
          }
        } else {
          // User approved - ensure it's installed
          await this.ensureDependency(stdioDep, true, toolIdForPermission);
        }
      } else if (metadata.install) {
        // Other stdio servers use standard install flow
        stdioDep = {
          name: serverName,
          type: "stdio" as const,
          install: `${metadata.install.command} ${metadata.install.args.join(" ")}`,
          version: "latest",
          integrity: metadata.integrity ?? "",
          command: metadata.install.command,
          args: metadata.install.args,
          // Story 14.6: envRequired from registry metadata (dynamic key detection)
          envRequired: metadata.install.envRequired,
        };

        // Check if this stdio MCP needs approval to install
        // Skip if continueWorkflow.approved (user already approved)
        // Use serverName:* as toolId for permission matching (not FQDN namespace)
        const toolIdForPermission = `${serverName}:*`;
        if (!continueWorkflow?.approved) {
          const stdioApproval = await this.ensureDependency(stdioDep, false, toolIdForPermission);
          if (stdioApproval) {
            logDebug(`Stdio MCP ${namespace} requires approval to install`);
            return stdioApproval;
          }
        } else {
          // User approved - ensure it's installed
          await this.ensureDependency(stdioDep, true, toolIdForPermission);
        }
      }
    }

    // 5. Create loaded capability with mcp.* routing
    const loaded: LoadedCapability = {
      meta: metadata,
      module: module ?? {}, // Empty module for sandboxed/stdio - code runs elsewhere
      call: async (method: string, args: unknown) => {
        if (metadata.type === "stdio") {
          if (!stdioDep) {
            throw new LoaderError(
              "SUBPROCESS_SPAWN_FAILED",
              `Stdio capability ${namespace} missing install info`,
              { namespace },
            );
          }

          return this.callStdio(stdioDep, namespace.split(":")[0], method, args);
        } else if (this.sandboxEnabled && code) {
          return this.executeInSandbox(metadata, code, method, args);
        } else if (module) {
          return this.executeWithMcpRouting(metadata, module, method, args);
        } else {
          throw new LoaderError(
            "METHOD_NOT_FOUND",
            `No code or module available for ${namespace}`,
            { namespace },
          );
        }
      },
    };

    // Cache it
    this.loadedCapabilities.set(namespace, loaded);

    logDebug(`Capability loaded: ${namespace}`);

    return loaded;
  }

  /**
   * Check if result is an approval required response.
   * Includes DependencyApprovalRequired, ApiKeyApprovalRequired, and IntegrityApprovalRequired.
   */
  static isApprovalRequired(
    result: unknown,
  ): result is ApprovalRequiredResult | IntegrityApprovalRequired {
    return (
      typeof result === "object" &&
      result !== null &&
      "approvalRequired" in result &&
      (result as { approvalRequired: boolean }).approvalRequired === true
    );
  }

  /**
   * Call a tool directly without pre-loading.
   *
   * Convenience method that combines load() + call().
   * May return ApprovalRequiredResult if dependencies or API keys need user action.
   *
   * **Story 14.6:** API key requirements come from registry metadata (envRequired).
   * The hardcoded key-requirements.ts is deprecated - keys are now dynamic.
   *
   * **Note:** Continuation handling (reloadEnv, etc.) is now managed by
   * stdio-command.ts via PendingWorkflowStore for unified workflow tracking.
   *
   * @deprecated Use callWithFqdn() instead. In normal flow, server resolves FQDN
   * via pml:execute and returns it in execute_locally response. This method
   * does client-side resolution which bypasses server's multi-tenant support.
   * Kept for backwards compatibility and testing.
   *
   * @param toolId - Full tool ID (e.g., "filesystem:read_file")
   * @param args - Tool arguments
   * @param continueWorkflow - Optional: approval from previous call
   * @returns Tool result or ApprovalRequiredResult
   */
  async call(
    toolId: string,
    args: unknown,
    continueWorkflow?: ContinueWorkflowParams,
  ): Promise<unknown | ApprovalRequiredResult | IntegrityApprovalRequired> {
    // Parse tool ID into namespace:action
    const parts = toolId.includes(":")
      ? toolId.split(":", 2)
      : [toolId, "default"];
    const action = parts[1];

    // Story 14.6: API keys are now checked in load() via metadata.install.envRequired
    // This allows dynamic key detection from registry instead of hardcoded mapping.
    // The check happens in ensureDependency() when processing stdio MCP install.

    // Load capability (may return ApprovalRequiredResult for dependencies or API keys)
    const loadResult = await this.load(toolId, continueWorkflow);

    // If approval is required, return the approval request
    if (CapabilityLoader.isApprovalRequired(loadResult)) {
      return loadResult;
    }

    // Call the action
    return loadResult.call(action, args);
  }

  /**
   * Call a capability using its fully-qualified domain name.
   *
   * Use this when the server has resolved the FQDN (e.g., from execute_locally response).
   * Skips local FQDN construction - uses server-provided FQDN directly.
   *
   * @param fqdn - Full FQDN (e.g., "alice.default.fs.listDirectory")
   * @param args - Tool arguments
   * @param continueWorkflow - Optional: approval from previous call
   * @returns Tool result or ApprovalRequiredResult
   */
  async callWithFqdn(
    fqdn: string,
    args: unknown,
    continueWorkflow?: ContinueWorkflowParams,
  ): Promise<unknown | ApprovalRequiredResult | IntegrityApprovalRequired> {
    // Extract action from FQDN: org.project.namespace.action[.hash]
    const parts = fqdn.split(".");
    if (parts.length < 4) {
      throw new LoaderError(
        "INVALID_FQDN",
        `Invalid FQDN format: ${fqdn} (expected org.project.namespace.action)`,
        { fqdn },
      );
    }
    const action = parts[3]; // 4th segment is the action

    // Load capability by FQDN
    const loadResult = await this.loadByFqdn(fqdn, continueWorkflow);

    if (CapabilityLoader.isApprovalRequired(loadResult)) {
      return loadResult;
    }

    return loadResult.call(action, args);
  }

  /**
   * Load a capability by its fully-qualified domain name.
   *
   * Unlike load(), this skips FQDN construction and integrity checking
   * (the server already resolved and validated the FQDN).
   *
   * @param fqdn - Full FQDN (e.g., "alice.default.fs.listDirectory")
   * @param continueWorkflow - Optional: approval from previous call
   * @returns Loaded capability or approval required result
   */
  private async loadByFqdn(
    fqdn: string,
    continueWorkflow?: ContinueWorkflowParams,
  ): Promise<LoadedCapability | ApprovalRequiredResult | IntegrityApprovalRequired> {
    // Check cache (using FQDN as key)
    const cached = this.loadedCapabilities.get(fqdn);
    if (cached) {
      logDebug(`Capability cache hit (FQDN): ${fqdn}`);
      return cached;
    }

    logDebug(`Loading capability by FQDN: ${fqdn}`);

    // Fetch metadata directly by FQDN (no conversion, no integrity check)
    // Server already resolved this FQDN, we trust it
    const { metadata } = await this.registryClient.fetchByFqdn(fqdn);

    // Check and install dependencies
    const forceInstall = continueWorkflow?.approved === true;
    const approvalResult = await this.ensureDependencies(metadata, forceInstall);

    if (approvalResult) {
      if (continueWorkflow?.approved === false) {
        if (approvalResult.approvalType === "tool_permission") {
          throw new LoaderError(
            "PERMISSION_DENIED",
            `Tool ${approvalResult.toolId} was not approved by user`,
            { toolId: approvalResult.toolId },
          );
        } else if (approvalResult.approvalType === "api_key_required") {
          throw new LoaderError(
            "API_KEY_NOT_CONFIGURED",
            `Required API keys were not configured: ${approvalResult.missingKeys.join(", ")}`,
            { missingKeys: approvalResult.missingKeys },
          );
        }
      }
      return approvalResult;
    }

    // Load capability code (for deno type)
    let module: CapabilityModule | null = null;
    let code: string | null = null;

    if (metadata.type === "deno") {
      if (!metadata.codeUrl) {
        throw new LoaderError(
          "MODULE_IMPORT_FAILED",
          `Deno capability ${fqdn} missing codeUrl`,
          { fqdn },
        );
      }

      if (this.sandboxEnabled) {
        const { code: fetchedCode } = await fetchCapabilityCode(metadata.codeUrl);
        code = fetchedCode;
        this.codeCache.set(fqdn, code);
        logDebug(`Capability code cached for sandbox (FQDN): ${fqdn}`);
      } else {
        const { module: loadedModule } = await loadCapabilityModule(metadata.codeUrl);
        module = loadedModule;
      }
    } else if (metadata.type === "stdio") {
      logDebug(`Stdio capability loaded (FQDN): ${fqdn}`);
    } else if (metadata.type === "http") {
      logDebug(`HTTP capability loaded (FQDN): ${fqdn}`);
    }

    // Extract namespace and action from FQDN: org.project.namespace.action[.hash]
    const fqdnParts = fqdn.split(".");
    const namespace = fqdnParts.length >= 3 ? fqdnParts[2] : fqdn;
    const action = fqdnParts.length >= 4 ? fqdnParts[3] : "default";
    const toolId = `${namespace}:${action}`;

    // Build stdioDep for stdio types (same logic as load())
    let stdioDep: McpDependency | null = null;

    // DEBUG: Log metadata for permission check
    loaderLog.info(`[loadByFqdn] ${fqdn} → routing=${metadata.routing}, type=${metadata.type}, namespace=${namespace}`);

    if (metadata.routing === "client" && metadata.type === "stdio") {
      if (namespace === "std") {
        stdioDep = {
          name: "std",
          type: "stdio" as const,
          install: "binary", // Marker for binary distribution
          version: "latest",
          integrity: metadata.integrity ?? "",
        };

        // std still needs tool_permission approval before first use (same as load())
        const toolIdForPermission = `${namespace}:*`;
        if (!continueWorkflow?.approved) {
          const stdApproval = await this.ensureDependency(stdioDep, false, toolIdForPermission);
          if (stdApproval) {
            logDebug(`std binary requires approval before download (FQDN: ${fqdn})`);
            return stdApproval;
          }
        } else {
          // User approved - ensure it's installed
          await this.ensureDependency(stdioDep, true, toolIdForPermission);
        }
      } else if (metadata.install) {
        stdioDep = {
          name: namespace,
          type: "stdio" as const,
          install: `${metadata.install.command} ${metadata.install.args.join(" ")}`,
          version: "latest",
          integrity: metadata.integrity ?? "",
          command: metadata.install.command,
          args: metadata.install.args,
          envRequired: metadata.install.envRequired,
        };

        if (!continueWorkflow?.approved) {
          const stdioApproval = await this.ensureDependency(stdioDep, false, toolId);
          if (stdioApproval) {
            logDebug(`Stdio MCP ${fqdn} requires approval to install`);
            return stdioApproval;
          }
        } else {
          await this.ensureDependency(stdioDep, true, toolId);
        }
      }
    }

    // Create loaded capability
    const loaded: LoadedCapability = {
      meta: metadata,
      module: module ?? {},
      call: async (method: string, args: unknown) => {
        if (metadata.type === "stdio") {
          if (!stdioDep) {
            throw new LoaderError(
              "SUBPROCESS_SPAWN_FAILED",
              `Stdio capability ${fqdn} missing install info`,
              { fqdn },
            );
          }
          return this.callStdio(stdioDep, namespace, method, args);
        } else if (this.sandboxEnabled && code) {
          return this.executeInSandbox(metadata, code, method, args);
        } else if (module) {
          return this.executeWithMcpRouting(metadata, module, method, args);
        } else {
          throw new LoaderError(
            "METHOD_NOT_FOUND",
            `No code or module available for ${fqdn}`,
            { fqdn },
          );
        }
      },
    };

    this.loadedCapabilities.set(fqdn, loaded);
    logDebug(`Capability loaded (FQDN): ${fqdn}`);

    return loaded;
  }

  /**
   * Ensure all dependencies are installed.
   *
   * Returns ApprovalRequiredResult if any dependency needs user approval
   * or if required env vars are missing.
   * Returns null if all dependencies are satisfied.
   *
   * @param meta - Capability metadata
   * @param forceInstall - If true, install without approval (after user approved)
   */
  private async ensureDependencies(
    meta: CapabilityMetadata,
    forceInstall = false,
  ): Promise<ApprovalRequiredResult | null> {
    if (!meta.mcpDeps || meta.mcpDeps.length === 0) {
      return null;
    }

    for (const dep of meta.mcpDeps) {
      // Construct toolId from dep name (namespace:*)
      const toolId = `${dep.name}:*`;
      const result = await this.ensureDependency(dep, forceInstall, toolId);
      if (result) {
        return result;
      }
    }
    return null;
  }

  /**
   * Ensure a single dependency is installed.
   *
   * Unified Permission Model:
   * - "allowed" (in allow list) → auto-install, no approval needed
   * - "denied" (in deny list) → error
   * - "ask" (default) → return ToolPermissionApprovalRequired
   *
   * Story 14.6: Also checks envRequired keys from registry metadata.
   * If env vars are missing, returns ApiKeyApprovalRequired instead of error.
   *
   * @param dep - The dependency to check/install
   * @param forceInstall - If true, skip approval check and install
   * @param toolId - Optional tool ID for unified permission response
   * @returns ApprovalRequiredResult if approval needed, null if installed
   */
  private async ensureDependency(
    dep: McpDependency,
    forceInstall = false,
    toolId?: string,
  ): Promise<ApprovalRequiredResult | null> {
    // Story 14.6: ALWAYS check required env vars, even if dependency is installed
    // Keys can become invalid/missing after installation (user removes from .env)
    if (dep.envRequired && dep.envRequired.length > 0) {
      const requiredKeys = dep.envRequired.map((name) => ({
        name,
        requiredBy: dep.name,
      }));
      const keyCheck = checkKeys(requiredKeys);

      if (!keyCheck.allValid) {
        // Return HIL pause instead of throwing error
        // Note: Continuation handling is now managed by stdio-command.ts
        logDebug(`Missing env vars for ${dep.name}: ${[...keyCheck.missing, ...keyCheck.invalid].join(", ")}`);
        const approval = pauseForMissingKeys(keyCheck);
        return approval;
      }
    }

    // Check if already installed with correct version
    if (this.depState.isInstalled(dep.name, dep.version)) {
      logDebug(`Dependency ${dep.name}@${dep.version} already installed`);
      return null;
    }

    loaderLog.step(`Dependency ${dep.name}@${dep.version} needs installation`);

    // Build toolId if not provided (for backwards compatibility)
    const effectiveToolId = toolId ?? `${dep.name}:*`;

    // Check permission for this tool/dependency
    const permission = checkPermission(effectiveToolId, this.permissions);
    loaderLog.debug(`Permission check: ${effectiveToolId} → ${permission}`);

    if (permission === "denied") {
      throw new LoaderError(
        "PERMISSION_DENIED",
        `Tool ${effectiveToolId} is in deny list`,
        { toolId: effectiveToolId },
      );
    }

    // Auto-install if in allow list
    if (permission === "allowed" || forceInstall) {
      try {
        // Special case: "binary" marker means this uses binary distribution
        // Binary download happens lazily in stdioManager.getOrSpawn() via binary-resolver
        // We just mark it as installed in depState for tracking
        if (dep.install === "binary") {
          logDebug(`Binary distribution for ${dep.name}@${dep.version} - marking as installed`);
          this.depState.markInstalled(dep, dep.integrity || "binary");
          await this.depState.save();
        } else {
          await this.installer.install(dep);
        }
        logDebug(
          `Dependency ${dep.name}@${dep.version} installed (auto-approved)`,
        );
        // Add to approved tools for session
        this.approvedTools.add(effectiveToolId);
        return null;
      } catch (error) {
        throw new LoaderError(
          "DEPENDENCY_INSTALL_FAILED",
          error instanceof Error ? error.message : String(error),
          { dep: dep.name, version: dep.version },
        );
      }
    }

    // Permission is "ask" - return unified tool_permission approval
    loaderLog.info(`⏸ APPROVAL_REQUIRED: ${effectiveToolId} (install ${dep.name}@${dep.version})`);
    return {
      approvalRequired: true,
      approvalType: "tool_permission",
      workflowId: crypto.randomUUID(),
      toolId: effectiveToolId,
      namespace: dep.name,
      needsInstallation: true,
      dependency: dep,
      description: `Allow ${effectiveToolId}? (will install ${dep.name}@${dep.version})`,
    } satisfies ToolPermissionApprovalRequired;
  }

  /**
   * Execute a capability method with mcp.* routing.
   * (Legacy: non-sandboxed execution)
   */
  private async executeWithMcpRouting(
    meta: CapabilityMetadata,
    module: CapabilityModule,
    method: string,
    args: unknown,
  ): Promise<unknown> {
    // Find the method
    const fn = module[method];
    if (typeof fn !== "function") {
      throw new LoaderError(
        "METHOD_NOT_FOUND",
        `Method '${method}' not found in capability '${meta.fqdn}'`,
        { fqdn: meta.fqdn, method, availableMethods: Object.keys(module) },
      );
    }

    // Create execution context with mcp.* proxy
    const ctx: ExecutionContext = {
      mcp: this.createMcpProxy(meta),
      workspace: this.workspace,
      log: (message: string) => logDebug(`[${meta.fqdn}] ${message}`),
    };

    // Execute
    return await fn(args, ctx);
  }

  /**
   * Execute capability code in isolated sandbox.
   *
   * Creates a Deno Worker with `permissions: "none"` and executes
   * the capability code inside it. All mcp.* calls from the sandbox
   * are routed via RPC to the main thread.
   *
   * Story 14.5b: Traces mcp.* calls for SHGAT learning when tracingEnabled.
   *
   * @param meta - Capability metadata
   * @param code - Raw capability code (fetched from registry)
   * @param method - Method to call (currently ignored - code should export result)
   * @param args - Arguments for the capability
   * @returns Execution result
   */
  private async executeInSandbox(
    meta: CapabilityMetadata,
    code: string,
    _method: string,
    args: unknown,
  ): Promise<unknown> {
    logDebug(`Executing ${meta.fqdn} in sandbox`);

    // Story 14.5b: Create trace collector if tracing is enabled
    const traceCollector = this.tracingEnabled ? new TraceCollector() : null;

    // Create sandbox with RPC handler that records mcp.* calls
    const sandbox = new SandboxWorker({
      onRpc: async (rpcMethod: string, rpcArgs: unknown) => {
        // Route mcp.* calls through existing infrastructure
        // rpcMethod format: "namespace:action"
        const [namespace, action] = rpcMethod.split(":");

        // Record call start time
        const callStart = Date.now();
        let callSuccess = true;
        let callResult: unknown;

        try {
          callResult = await this.routeMcpCall(meta, namespace, action, rpcArgs);
          return callResult;
        } catch (error) {
          callSuccess = false;
          callResult = { error: error instanceof Error ? error.message : String(error) };
          throw error;
        } finally {
          // Story 14.5b: Record the mcp.* call in trace collector
          if (traceCollector) {
            const callDuration = Date.now() - callStart;
            traceCollector.recordMcpCall(
              rpcMethod,
              rpcArgs,
              callResult,
              callDuration,
              callSuccess,
            );
          }
        }
      },
    });

    try {
      // Execute code in sandbox
      const result: SandboxResult = await sandbox.execute(code, args);

      if (!result.success) {
        // Story 14.5b: Finalize trace with failure
        if (traceCollector) {
          const trace = traceCollector.finalize(
            meta.fqdn,
            false,
            result.error?.message,
          );
          this.traceSyncer.enqueue(trace);
        }

        // Convert sandbox error to LoaderError
        const error = result.error;
        throw new LoaderError(
          "SUBPROCESS_CALL_FAILED",
          error?.message ?? "Sandbox execution failed",
          {
            fqdn: meta.fqdn,
            code: error?.code,
            durationMs: result.durationMs,
          },
        );
      }

      // Story 14.5b: Finalize trace with success and enqueue for sync
      if (traceCollector) {
        const trace = traceCollector.finalize(meta.fqdn, true);
        this.traceSyncer.enqueue(trace);
        logDebug(`Trace collected: ${meta.fqdn} - ${trace.taskResults.length} mcp.* calls`);
      }

      logDebug(`Sandbox execution completed in ${result.durationMs}ms`);
      return result.value;
    } finally {
      // Always clean up sandbox
      sandbox.shutdown();
    }
  }

  /**
   * Create mcp.* proxy for tool routing.
   *
   * Intercepts mcp.namespace.action() calls and routes them appropriately:
   * - stdio deps → subprocess
   * - cloud tools → HTTP forward
   * - local capabilities → recursive load
   */
  private createMcpProxy(meta: CapabilityMetadata): McpProxy {
    return new Proxy({} as McpProxy, {
      get: (_target, namespace: string) => {
        return new Proxy(
          {} as Record<string, (args: unknown) => Promise<unknown>>,
          {
            get: (_innerTarget, action: string) => {
              return async (args: unknown): Promise<unknown> => {
                return this.routeMcpCall(meta, namespace, action, args);
              };
            },
          },
        );
      },
    });
  }

  /**
   * Route an mcp.namespace.action() call.
   *
   * Unified permission model:
   * 1. Check if tool is already approved in this session
   * 2. If not, check permission (allow/deny/ask)
   * 3. If "ask", return approval_required (includes installation info if needed)
   * 4. After approval, installation happens automatically
   * 5. Tool is added to approvedTools for session (per-tool, not per-namespace)
   */
  private async routeMcpCall(
    meta: CapabilityMetadata,
    namespace: string,
    action: string,
    args: unknown,
  ): Promise<unknown | ToolPermissionApprovalRequired> {
    const toolId = `${namespace}:${action}`;

    logDebug(`Routing mcp.${namespace}.${action}()`);

    // Check if it's a declared stdio dependency (for installation info)
    const dep = meta.mcpDeps?.find((d) => d.name === namespace);

    // Check if already approved in this session (per-tool)
    if (!this.approvedTools.has(toolId)) {
      const permission = checkPermission(toolId, this.permissions);

      if (permission === "denied") {
        throw new LoaderError(
          "PERMISSION_DENIED",
          `Tool ${toolId} is in deny list`,
          { toolId },
        );
      }

      if (permission === "ask") {
        // Check if installation is needed
        const needsInstallation = dep?.type === "stdio" &&
          !this.depState.isInstalled(dep.name, dep.version);

        logDebug(`Tool ${toolId} requires approval (needsInstallation: ${needsInstallation})`);

        return {
          approvalRequired: true,
          approvalType: "tool_permission",
          workflowId: crypto.randomUUID(),
          toolId,
          namespace,
          needsInstallation,
          dependency: needsInstallation ? dep : undefined,
          description: needsInstallation
            ? `Allow ${toolId}? (will install ${dep?.name}@${dep?.version})`
            : `Allow ${toolId}?`,
        } satisfies ToolPermissionApprovalRequired;
      }

      // Permission is "allowed" - add to approved set
      this.approvedTools.add(toolId);
      logDebug(`Tool ${toolId} auto-approved (in allow list)`);
    }

    // Execute the tool
    if (dep && dep.type === "stdio") {
      // Ensure installed before calling (silent install after approval)
      if (!this.depState.isInstalled(dep.name, dep.version)) {
        logDebug(`Installing ${dep.name}@${dep.version} after approval`);
        await this.installer.install(dep);
      }
      return this.callStdio(dep, namespace, action, args);
    }

    // Check routing configuration
    const routing = resolveToolRouting(toolId);

    if (routing === "server") {
      // Forward to cloud
      return this.callCloud(toolId, args);
    }

    // Local execution - recursive load
    // This handles capabilities calling other capabilities
    return this.call(toolId, args);
  }

  /**
   * Approve a specific tool for this session.
   * Called after user approves via continue_workflow.
   *
   * @param toolId - Full tool ID (e.g., "memory:create_entities")
   */
  approveToolForSession(toolId: string): void {
    this.approvedTools.add(toolId);
    logDebug(`Approved ${toolId} for session`);
  }

  /**
   * Call a stdio subprocess.
   *
   * Note: MCP servers expose tools by their simple name (e.g., "create_entities"),
   * not with namespace prefix. The namespace is only used by PML to route
   * to the correct subprocess.
   */
  private async callStdio(
    dep: McpDependency,
    namespace: string,
    action: string,
    args: unknown,
  ): Promise<unknown> {
    // Ensure process is running
    await this.stdioManager.getOrSpawn(dep);

    // Make the call - use action only, not namespace:action
    // MCP servers expose tools by simple name (e.g., "create_entities")
    const result = await this.stdioManager.call(namespace, "tools/call", {
      name: action,
      arguments: args,
    });

    return result;
  }

  /**
   * Forward call to cloud.
   */
  private async callCloud(
    toolId: string,
    args: unknown,
  ): Promise<unknown> {
    logDebug(`Cloud call: ${toolId}`);

    // PML_API_KEY is required for cloud calls
    const apiKey = Deno.env.get("PML_API_KEY");
    if (!apiKey) {
      throw new LoaderError(
        "ENV_VAR_MISSING",
        "PML_API_KEY environment variable is required for cloud calls",
        { required: ["PML_API_KEY"] },
      );
    }

    const response = await fetch(`${this.cloudUrl}/mcp/tools/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: toolId,
          arguments: args,
        },
      }),
    });

    if (!response.ok) {
      throw new LoaderError(
        "SUBPROCESS_CALL_FAILED",
        `Cloud error: ${response.status} ${response.statusText}`,
        { toolId, status: response.status },
      );
    }

    const data = await response.json();

    if (data.error) {
      throw new LoaderError(
        "SUBPROCESS_CALL_FAILED",
        `Cloud RPC error: ${data.error.message}`,
        { toolId, error: data.error },
      );
    }

    return data.result;
  }

  /**
   * Check if a capability is loaded.
   */
  isLoaded(namespace: string): boolean {
    return this.loadedCapabilities.has(namespace);
  }

  /**
   * Get all loaded capability namespaces.
   */
  getLoadedCapabilities(): string[] {
    return Array.from(this.loadedCapabilities.keys());
  }

  /**
   * Clear capability cache.
   */
  clearCache(): void {
    this.loadedCapabilities.clear();
    this.registryClient.clearCache();
  }

  /**
   * Shutdown all resources.
   */
  async shutdown(): Promise<void> {
    // Shutdown trace syncer first (flushes pending traces)
    await this.traceSyncer.shutdown();

    this.stdioManager.shutdownAll();
    this.loadedCapabilities.clear();
  }

  /**
   * Get loader status for debugging.
   */
  getStatus(): {
    initialized: boolean;
    loadedCapabilities: number;
    runningProcesses: string[];
    cloudUrl: string;
  } {
    return {
      initialized: this.initialized,
      loadedCapabilities: this.loadedCapabilities.size,
      runningProcesses: this.stdioManager.getRunningProcesses(),
      cloudUrl: this.cloudUrl,
    };
  }
}
