/**
 * PML Configuration Types
 *
 * @module types
 */

/**
 * PML Cloud configuration
 */
export interface PmlCloudConfig {
  /** PML Cloud URL */
  url: string;
  /** API key (env var placeholder or actual key) */
  apiKey: string;
}

/**
 * PML Server configuration
 */
export interface PmlServerConfig {
  /** Local server port */
  port: number;
}

/**
 * PML Permissions configuration (Claude Code style)
 */
export interface PmlPermissions {
  /** Auto-approved tools (no prompt) */
  allow: string[];
  /** Always refused tools */
  deny: string[];
  /** Tools requiring user confirmation */
  ask: string[];
}

/**
 * PML configuration file (.pml.json)
 */
export interface PmlConfig {
  /** Package version */
  version: string;
  /**
   * Workspace root path.
   * Use "." to indicate dynamic detection via resolveWorkspace().
   * Absolute paths are supported but not recommended (breaks on clone/move).
   */
  workspace?: string;
  /** Cloud configuration */
  cloud?: PmlCloudConfig;
  /** Server configuration */
  server?: PmlServerConfig;
  /** Tool permissions (Claude Code style: allow/deny/ask) */
  permissions?: PmlPermissions;
  /**
   * Environment variables for BYOK (Bring Your Own Key).
   * Incrementally populated as capabilities request API keys.
   * Keys are saved after HIL approval for future use.
   */
  env?: Record<string, string>;
}

/**
 * MCP server configuration
 */
export interface McpServerConfig {
  /** Transport type */
  type: "http" | "stdio";
  /** Server URL (for http type) */
  url?: string;
  /** Command to run (for stdio type) */
  command?: string;
  /** Command arguments (for stdio type) */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * MCP configuration file (.mcp.json)
 *
 * Claude Code expects: { "mcpServers": { "server-name": {...} } }
 */
export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

/**
 * Init options
 */
export interface InitOptions {
  /** PML API key (optional, for cloud features) */
  apiKey?: string;
  /** Server port */
  port?: number;
  /** Cloud URL */
  cloudUrl?: string;
  /** Skip prompts, use defaults */
  yes?: boolean;
  /** Skip backup confirmation */
  force?: boolean;
}

/**
 * Init result
 */
export interface InitResult {
  success: boolean;
  mcpConfigPath: string;
  pmlConfigPath: string;
  backedUp?: string;
  error?: string;
}

// ============================================================================
// Workspace Types (Story 14.2)
// ============================================================================

/**
 * Workspace configuration
 */
export interface WorkspaceConfig {
  /** Resolved workspace root path */
  root: string;
  /** How the workspace was resolved */
  source: WorkspaceSource;
  /** Project marker that was found (if source is "detected") */
  marker?: string;
}

/**
 * How the workspace was resolved
 */
export type WorkspaceSource = "env" | "detected" | "fallback";

// ============================================================================
// Path Validation Types (Story 14.2)
// ============================================================================

/**
 * Error codes for path validation failures
 */
export type PathValidationErrorCode =
  | "PATH_OUTSIDE_WORKSPACE"
  | "PATH_TRAVERSAL_ATTACK"
  | "PATH_NOT_FOUND"
  | "PATH_INVALID"
  | "WORKSPACE_INVALID";

/**
 * Path validation error details
 */
export interface PathValidationError {
  /** Error code for programmatic handling */
  code: PathValidationErrorCode;
  /** Human-readable error message */
  message: string;
  /** Original path that was validated */
  path: string;
  /** Workspace path used for validation */
  workspace: string;
}

/**
 * Path validation result
 */
export interface PathValidationResult {
  /** Whether the path is valid and within workspace */
  valid: boolean;
  /** Normalized absolute path (if valid) */
  normalizedPath?: string;
  /** Error details (if invalid) */
  error?: PathValidationError;
}

// ============================================================================
// Permission Types (Story 14.2)
// ============================================================================

/**
 * Permission check result
 */
export type PermissionCheckResult = "allowed" | "denied" | "ask";

/**
 * Permission loader result
 */
export interface PermissionLoadResult {
  /** Loaded permissions */
  permissions: PmlPermissions;
  /** Source of permissions */
  source: "config" | "defaults";
  /** Config file path (if loaded from config) */
  configPath?: string;
}

// ============================================================================
// Capability Permission Types (Story 14.3)
// ============================================================================

/**
 * Approval mode for capability execution.
 *
 * This is computed at RUNTIME, not stored in DB, because:
 * - Each user has their own permissions in .pml.json
 * - Users can change permissions at any time
 * - Same capability may be "auto" for one user and "hil" for another
 *
 * @example
 * ```ts
 * if (approvalMode === "hil") {
 *   // Trigger Human-in-the-Loop flow
 * } else {
 *   // Execute automatically
 * }
 * ```
 */
export type ApprovalMode = "hil" | "auto";

/**
 * Tool routing destination.
 *
 * Platform-defined (not user-configurable):
 * - "client": Execute on user's machine (filesystem, shell, docker, etc.)
 * - "server": Forward to pml.casys.ai (stateless computation, external APIs)
 */
export type ToolRouting = "client" | "server";

/**
 * Routing configuration from cloud.
 * Cached locally for fast lookup, synced at startup.
 */
export interface RoutingConfig {
  /** Config version for change detection */
  version: string;
  /** Client-side tool namespaces (run on user's machine) */
  clientTools: string[];
  /** Server-side tool namespaces (run on pml.casys.ai) */
  serverTools: string[];
  /** Default routing for unknown tools */
  defaultRouting: ToolRouting;
}

/**
 * Cached routing with metadata.
 */
export interface RoutingCache {
  /** Routing configuration */
  config: RoutingConfig;
  /** Last sync timestamp (ISO string) */
  lastSync: string;
  /** Cloud endpoint used for sync */
  cloudUrl: string;
}

/**
 * Result of syncing routing config with cloud.
 */
export interface RoutingSyncResult {
  /** Whether sync was successful */
  success: boolean;
  /** Whether config was updated */
  updated: boolean;
  /** Current config version */
  version: string;
  /** Error message if sync failed */
  error?: string;
  /** Whether running from cache (offline mode) */
  fromCache: boolean;
}

/**
 * Result of checking capability permissions against user's allow/deny/ask lists.
 */
export interface CapabilityPermissionResult {
  /** Whether the capability can execute (false if any tool is denied) */
  canExecute: boolean;
  /** Required approval mode (hil if any tool requires ask) */
  approvalMode: ApprovalMode;
  /** Tool that blocked execution (if canExecute is false) */
  blockedTool?: string;
  /** Human-readable reason (if blocked) */
  reason?: string;
}

// ============================================================================
// Re-export Loader Types (Story 14.4)
// ============================================================================

export type {
  ApiKeyApprovalRequired,
  ApprovalRequiredResult,
  ApprovalType,
  CapabilityLoadResult,
  CapabilityMetadata,
  CapabilityModule,
  ContinueWorkflowParams,
  DependencyApprovalRequired,
  DepStateFile,
  ExecutionContext,
  InstallResult,
  InstalledDep,
  IntegrityResult,
  LoadedCapability,
  LoaderErrorCode,
  LoadSuccessResult,
  McpDependency,
  McpProxy,
  PendingRequest,
  RegistryClientOptions,
  RegistryFetchResult,
  StdioProcess,
} from "./loader/types.ts";

export {
  InstallError,
  IntegrityError,
  LoaderError,
} from "./loader/types.ts";
