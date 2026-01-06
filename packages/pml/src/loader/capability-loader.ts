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
  ApprovalRequiredResult,
  CapabilityMetadata,
  CapabilityModule,
  ContinueWorkflowParams,
  ExecutionContext,
  LoadedCapability,
  McpDependency,
  McpProxy,
} from "./types.ts";
import { LoaderError } from "./types.ts";
import { checkPermission } from "../permissions/loader.ts";
import type { PmlPermissions } from "../types.ts";
import { RegistryClient } from "./registry-client.ts";
import { loadCapabilityModule } from "./deno-loader.ts";
import { createDepState, DepState } from "./dep-state.ts";
import { DepInstaller } from "./dep-installer.ts";
import { StdioManager } from "./stdio-manager.ts";
import { validateEnvForDep } from "./env-checker.ts";
import { resolveToolRouting } from "../routing/mod.ts";
import * as log from "@std/log";

/**
 * Log debug message for loader operations.
 */
function logDebug(message: string): void {
  log.debug(`[pml:loader] ${message}`);
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

  /** Cache of loaded capabilities */
  private readonly loadedCapabilities = new Map<string, LoadedCapability>();

  /** Whether initialization is complete */
  private initialized = false;

  private constructor(
    options: CapabilityLoaderOptions,
    depState: DepState,
  ) {
    this.cloudUrl = options.cloudUrl;
    this.workspace = options.workspace;
    this.permissions = options.permissions ?? DEFAULT_PERMISSIONS;

    this.registryClient = new RegistryClient({ cloudUrl: options.cloudUrl });
    this.depState = depState;
    this.installer = new DepInstaller(depState);
    this.stdioManager = new StdioManager(options.stdioIdleTimeoutMs);

    this.initialized = true;
  }

  /**
   * Create and initialize a capability loader.
   */
  static async create(
    options: CapabilityLoaderOptions,
  ): Promise<CapabilityLoader> {
    const depState = await createDepState(options.depStatePath);
    return new CapabilityLoader(options, depState);
  }

  /**
   * Load a capability by namespace.
   *
   * May return ApprovalRequiredResult if dependencies need user approval.
   * Use loadWithApproval() to handle the stateless approval flow.
   *
   * @param namespace - Tool namespace (e.g., "filesystem:read_file")
   * @param continueWorkflow - Optional: approval from previous call
   * @returns Loaded capability or approval required result
   */
  async load(
    namespace: string,
    continueWorkflow?: ContinueWorkflowParams,
  ): Promise<LoadedCapability | ApprovalRequiredResult> {
    // Check cache
    const cached = this.loadedCapabilities.get(namespace);
    if (cached) {
      logDebug(`Capability cache hit: ${namespace}`);
      return cached;
    }

    logDebug(`Loading capability: ${namespace}`);

    // 1. Fetch metadata from registry
    const { metadata } = await this.registryClient.fetch(namespace);

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
        throw new LoaderError(
          "DEPENDENCY_NOT_APPROVED",
          `Dependency ${approvalResult.dependency.name} was not approved by user`,
          {
            dep: approvalResult.dependency.name,
            version: approvalResult.dependency.version,
          },
        );
      }
      return approvalResult;
    }

    // 3. Dynamic import capability code
    const { module } = await loadCapabilityModule(metadata.codeUrl);

    // 4. Create loaded capability with mcp.* routing
    const loaded: LoadedCapability = {
      meta: metadata,
      module,
      call: async (method: string, args: unknown) => {
        return this.executeWithMcpRouting(metadata, module, method, args);
      },
    };

    // Cache it
    this.loadedCapabilities.set(namespace, loaded);

    logDebug(`Capability loaded: ${namespace}`);

    return loaded;
  }

  /**
   * Check if result is an approval required response.
   */
  static isApprovalRequired(result: unknown): result is ApprovalRequiredResult {
    return (
      typeof result === "object" &&
      result !== null &&
      "approvalRequired" in result &&
      (result as ApprovalRequiredResult).approvalRequired === true
    );
  }

  /**
   * Call a tool directly without pre-loading.
   *
   * Convenience method that combines load() + call().
   * May return ApprovalRequiredResult if dependencies need user approval.
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
  ): Promise<unknown | ApprovalRequiredResult> {
    // Parse tool ID into namespace:action
    const parts = toolId.includes(":")
      ? toolId.split(":", 2)
      : [toolId, "default"];
    const action = parts[1];

    // Load capability (may return ApprovalRequiredResult)
    const loadResult = await this.load(toolId, continueWorkflow);

    // If approval is required, return the approval request
    if (CapabilityLoader.isApprovalRequired(loadResult)) {
      return loadResult;
    }

    // Call the action
    return loadResult.call(action, args);
  }

  /**
   * Ensure all dependencies are installed.
   *
   * Returns ApprovalRequiredResult if any dependency needs user approval.
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
      const result = await this.ensureDependency(dep, forceInstall);
      if (result) {
        return result;
      }
    }
    return null;
  }

  /**
   * Ensure a single dependency is installed.
   *
   * Uses permission-based approval:
   * - "allowed" (in allow list) → auto-install, no approval needed
   * - "denied" (in deny list) → error
   * - "ask" (default) → return ApprovalRequiredResult
   *
   * @param dep - The dependency to check/install
   * @param forceInstall - If true, skip approval check and install
   * @returns ApprovalRequiredResult if approval needed, null if installed
   */
  private async ensureDependency(
    dep: McpDependency,
    forceInstall = false,
  ): Promise<ApprovalRequiredResult | null> {
    // Check if already installed with correct version
    if (this.depState.isInstalled(dep.name, dep.version)) {
      logDebug(`Dependency ${dep.name}@${dep.version} already installed`);
      return null;
    }

    logDebug(`Dependency ${dep.name}@${dep.version} needs installation`);

    // Check environment variables first
    if (dep.envRequired && dep.envRequired.length > 0) {
      try {
        validateEnvForDep(dep.name, dep.envRequired);
      } catch (error) {
        throw new LoaderError(
          "ENV_VAR_MISSING",
          error instanceof Error ? error.message : String(error),
          { dep: dep.name, required: dep.envRequired },
        );
      }
    }

    // Check permission for this dependency
    const permission = checkPermission(dep.name, this.permissions);

    if (permission === "denied") {
      throw new LoaderError(
        "DEPENDENCY_NOT_APPROVED",
        `Dependency ${dep.name} is in deny list`,
        { dep: dep.name, version: dep.version },
      );
    }

    // Auto-install if in allow list
    if (permission === "allowed" || forceInstall) {
      try {
        await this.installer.install(dep);
        logDebug(
          `Dependency ${dep.name}@${dep.version} installed (auto-approved)`,
        );
        return null;
      } catch (error) {
        throw new LoaderError(
          "DEPENDENCY_INSTALL_FAILED",
          error instanceof Error ? error.message : String(error),
          { dep: dep.name, version: dep.version },
        );
      }
    }

    // Permission is "ask" - return approval_required (stateless HIL)
    logDebug(`Dependency ${dep.name}@${dep.version} requires approval`);
    return {
      approvalRequired: true,
      dependency: dep,
      description:
        `Install ${dep.name}@${dep.version} to execute this capability`,
    };
  }

  /**
   * Execute a capability method with mcp.* routing.
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
   */
  private async routeMcpCall(
    meta: CapabilityMetadata,
    namespace: string,
    action: string,
    args: unknown,
  ): Promise<unknown> {
    const toolId = `${namespace}:${action}`;

    logDebug(`Routing mcp.${namespace}.${action}()`);

    // Check if it's a declared stdio dependency
    const dep = meta.mcpDeps?.find((d) => d.name === namespace);
    if (dep && dep.type === "stdio") {
      // Route to stdio subprocess
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
  shutdown(): void {
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
