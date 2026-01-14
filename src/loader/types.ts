/**
 * Dynamic MCP Loader Types
 *
 * Types for capability metadata, dependencies, and loader state.
 *
 * @module loader/types
 */

// ============================================================================
// Capability Metadata Types
// ============================================================================

/**
 * MCP type discriminant.
 *
 * - "deno": Capability with TypeScript code (executed in sandbox)
 * - "stdio": External MCP server via subprocess (e.g., filesystem, shell, git)
 * - "http": Proxy to HTTP endpoint (e.g., tavily, memory cloud)
 */
export type McpType = "deno" | "stdio" | "http";

/**
 * Installation info for stdio MCP servers.
 */
export interface McpInstallInfo {
  /** Command to run (e.g., "npx", "deno") */
  command: string;
  /** Command arguments */
  args: string[];
  /** Required environment variables */
  envRequired?: string[];
}

/**
 * Capability metadata from PML registry.
 *
 * Fetched from: pml.casys.ai/mcp/{fqdn}
 *
 * Supports 3 MCP types:
 * - **deno**: Capability code (requires codeUrl)
 * - **stdio**: External MCP server via subprocess (requires install)
 * - **http**: Proxy to HTTP endpoint (uses proxyTo for server routing)
 *
 * @example deno type
 * ```json
 * {
 *   "fqdn": "casys.pml.filesystem.read_file.abc1",
 *   "type": "deno",
 *   "codeUrl": "https://pml.casys.ai/mcp/code/abc1",
 *   "routing": "client"
 * }
 * ```
 *
 * @example stdio type
 * ```json
 * {
 *   "fqdn": "pml.mcp.filesystem.read_file.7b92",
 *   "type": "stdio",
 *   "routing": "client",
 *   "install": {
 *     "command": "npx",
 *     "args": ["-y", "@anthropic-ai/mcp-server-filesystem"],
 *     "envRequired": []
 *   }
 * }
 * ```
 *
 * @example http type
 * ```json
 * {
 *   "fqdn": "pml.mcp.tavily.search.f3a2",
 *   "type": "http",
 *   "routing": "server",
 *   "proxyTo": "https://mcp.tavily.com"
 * }
 * ```
 */
export interface CapabilityMetadata {
  /** Fully qualified domain name (5-part with hash): org.project.namespace.action.hash */
  fqdn: string;
  /** MCP type: "deno" (code), "stdio" (subprocess), "http" (proxy) */
  type: McpType;
  /** URL to fetch capability code from (required for deno type) */
  codeUrl?: string;
  /** Human-readable description */
  description?: string;
  /** Exposed tool names (colon format): ["filesystem:read_file", ...] */
  tools: string[];
  /** Execution routing: "client" (local) or "server" (cloud) */
  routing: "client" | "server";
  /** Dependencies on stdio MCP servers (for deno type capabilities) */
  mcpDeps?: McpDependency[];
  /** Integrity hash for lockfile validation (sha256-...) */
  integrity?: string;
  /** Installation info for stdio type */
  install?: McpInstallInfo;
  /** Proxy URL for http type (server-side) */
  proxyTo?: string;
}

/**
 * MCP dependency that must be installed before capability execution.
 *
 * These are stdio MCP servers (npm packages) that the capability calls
 * via mcp.namespace.action() syntax.
 *
 * @example
 * ```json
 * {
 *   "name": "memory",
 *   "type": "stdio",
 *   "install": "npx @modelcontextprotocol/server-memory@1.2.3",
 *   "version": "1.2.3",
 *   "integrity": "sha256-abc123...",
 *   "envRequired": ["ANTHROPIC_API_KEY"]
 * }
 * ```
 */
export interface McpDependency {
  /** MCP namespace (e.g., "memory", "serena") */
  name: string;
  /** Transport type - always "stdio" for npm deps */
  type: "stdio";
  /** Install command (e.g., "npx @mcp/server-memory@1.2.3") */
  install: string;
  /** Pinned version */
  version: string;
  /** sha256 hash for integrity verification */
  integrity: string;
  /** Required environment variables */
  envRequired?: string[];
  /** Optional: command to run after installation */
  command?: string;
  /** Optional: command arguments */
  args?: string[];
}

// ============================================================================
// Dependency State Types
// ============================================================================

/**
 * Installed dependency record.
 *
 * Persisted in ~/.pml/deps.json
 */
export interface InstalledDep {
  /** Dependency name */
  name: string;
  /** Installed version */
  version: string;
  /** Verified integrity hash */
  integrity: string;
  /** Installation timestamp (ISO string) */
  installedAt: string;
  /** Install command used */
  installCommand: string;
  /** Path to installed package (if applicable) */
  installPath?: string;
}

/**
 * Dependency state file structure.
 *
 * Persisted at ~/.pml/deps.json
 */
export interface DepStateFile {
  /** Schema version for migrations */
  version: 1;
  /** Map of installed dependencies by name */
  installed: Record<string, InstalledDep>;
}

// ============================================================================
// Integrity Verification Types
// ============================================================================

/**
 * Result of integrity verification.
 */
export interface IntegrityResult {
  /** Whether the integrity check passed */
  valid: boolean;
  /** Actual computed hash */
  actual: string;
  /** Expected hash from metadata */
  expected: string;
}

/**
 * Integrity verification error.
 */
export class IntegrityError extends Error {
  constructor(
    public readonly dep: McpDependency,
    public readonly result: IntegrityResult,
  ) {
    super(
      `Integrity check failed for ${dep.name}@${dep.version}\n` +
        `  Expected: ${result.expected}\n` +
        `  Got: ${result.actual}`,
    );
    this.name = "IntegrityError";
  }
}

// ============================================================================
// Installation Types
// ============================================================================

/**
 * Result of dependency installation.
 */
export interface InstallResult {
  /** Whether installation succeeded */
  success: boolean;
  /** Installed dependency info */
  dep: McpDependency;
  /** Installation timestamp */
  installedAt: string;
  /** Verified integrity hash */
  integrity: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Installation error.
 */
export class InstallError extends Error {
  public readonly dep: McpDependency;
  public readonly reason: string;

  constructor(dep: McpDependency, reason: string) {
    super(`Failed to install ${dep.name}@${dep.version}: ${reason}`);
    this.name = "InstallError";
    this.dep = dep;
    this.reason = reason;
  }
}

// ============================================================================
// Stdio Process Types
// ============================================================================

/**
 * Stdio MCP process state.
 */
export interface StdioProcess {
  /** Dependency this process serves */
  dep: McpDependency;
  /** Deno subprocess handle */
  process: Deno.ChildProcess;
  /** Stdin writer */
  writer: WritableStreamDefaultWriter<Uint8Array>;
  /** Stdout reader */
  reader: ReadableStreamDefaultReader<Uint8Array>;
  /** Process spawn timestamp */
  spawnedAt: Date;
  /** Last activity timestamp (for idle timeout) */
  lastActivity: Date;
  /** Pending request promises (by request ID) */
  pendingRequests: Map<string | number, PendingRequest>;
  /** Request ID counter */
  nextRequestId: number;
  /** Buffered stdout data for partial message handling */
  buffer: string;
}

/**
 * Pending JSON-RPC request.
 */
export interface PendingRequest {
  /** Promise resolve function */
  resolve: (result: unknown) => void;
  /** Promise reject function */
  reject: (error: Error) => void;
  /** Request method */
  method: string;
  /** Request timestamp */
  sentAt: Date;
}

// ============================================================================
// Loader Types
// ============================================================================

/**
 * Loaded capability with execution context.
 */
export interface LoadedCapability {
  /** Capability metadata */
  meta: CapabilityMetadata;
  /** Loaded module */
  module: unknown;
  /** Execute a method with mcp.* routing */
  call: (method: string, args: unknown) => Promise<unknown>;
}

/**
 * Loader error codes.
 */
export type LoaderErrorCode =
  | "METADATA_FETCH_FAILED"
  | "METADATA_PARSE_ERROR"
  | "DEPENDENCY_NOT_APPROVED"
  | "DEPENDENCY_INSTALL_FAILED"
  | "DEPENDENCY_INTEGRITY_FAILED"
  | "ENV_VAR_MISSING"
  | "API_KEY_NOT_CONFIGURED" // Story 14.6: User aborted key configuration
  | "MODULE_IMPORT_FAILED"
  | "METHOD_NOT_FOUND"
  | "INVALID_FQDN" // Invalid FQDN format (expected org.project.namespace.action)
  | "SUBPROCESS_SPAWN_FAILED"
  | "SUBPROCESS_CALL_FAILED"
  | "SUBPROCESS_TIMEOUT";

/**
 * Loader error with code and context.
 */
export class LoaderError extends Error {
  constructor(
    public readonly code: LoaderErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "LoaderError";
  }
}

// ============================================================================
// Registry Types
// ============================================================================

/**
 * Registry client options.
 */
export interface RegistryClientOptions {
  /** Cloud URL (e.g., https://pml.casys.ai) */
  cloudUrl: string;
  /** Optional timeout in ms (default: 10000) */
  timeout?: number;
  /** API key for authentication */
  apiKey?: string;
}

/**
 * Registry fetch result.
 */
export interface RegistryFetchResult {
  /** Fetched metadata */
  metadata: CapabilityMetadata;
  /** Whether result came from cache */
  fromCache: boolean;
  /** Fetch timestamp */
  fetchedAt: Date;
}

// ============================================================================
// MCP Proxy Types
// ============================================================================

/**
 * MCP proxy for mcp.namespace.action() calls.
 *
 * Routes calls to appropriate handler (stdio subprocess, cloud, or local).
 */
export type McpProxy = {
  [namespace: string]: {
    [action: string]: (args: unknown) => Promise<unknown>;
  };
};

/**
 * Execution context passed to capability functions.
 */
export interface ExecutionContext {
  /** MCP proxy for tool calls */
  mcp: McpProxy;
  /** Workspace root path */
  workspace: string;
  /** Logger for debugging */
  log: (message: string) => void;
}

// ============================================================================
// Approval Flow Types (Story 14.3b, Story 14.6)
// ============================================================================

/**
 * Approval type discriminant for different HIL flows.
 *
 * - "dependency": MCP dependency needs user approval to install
 * - "api_key_required": API key missing, user needs to configure .env
 * - "integrity": Integrity hash changed, user needs to approve update (Story 14.7)
 */
export type ApprovalType = "dependency" | "api_key_required" | "integrity";

/**
 * Result of dependency check that may require approval.
 *
 * Used by CapabilityLoader to signal that HIL approval is needed
 * instead of blocking on stdin (which breaks stdio mode).
 */
export interface DependencyApprovalRequired {
  /** True when approval is required */
  approvalRequired: true;
  /** Discriminant for approval type */
  approvalType: "dependency";
  /** Workflow ID for continuation tracking */
  workflowId: string;
  /** The dependency needing approval */
  dependency: McpDependency;
  /** Description for the user */
  description: string;
}

/**
 * Result of API key check that requires user action.
 *
 * User must add the missing keys to .env and click Continue.
 * Story 14.6: BYOK API Key Management
 */
export interface ApiKeyApprovalRequired {
  /** True when approval is required */
  approvalRequired: true;
  /** Discriminant for approval type */
  approvalType: "api_key_required";
  /** Workflow ID for continuation tracking */
  workflowId: string;
  /** Missing or invalid key names (combined list) */
  missingKeys: string[];
  /** Human-readable instruction */
  instruction: string;
}

/**
 * Union of all approval-required results.
 *
 * @deprecated Use DependencyApprovalRequired or ApiKeyApprovalRequired directly.
 * Kept for backwards compatibility.
 */
export type ApprovalRequiredResult =
  | DependencyApprovalRequired
  | ApiKeyApprovalRequired;

/**
 * Successful load result with capability.
 */
export interface LoadSuccessResult {
  /** False when no approval is required */
  approvalRequired: false;
  /** The loaded capability */
  capability: LoadedCapability;
}

/**
 * Union type for capability load results.
 *
 * Either requires approval (stateless flow) or succeeds with capability.
 */
export type CapabilityLoadResult = ApprovalRequiredResult | LoadSuccessResult;

/**
 * Parameters for continuing a workflow after approval.
 */
export interface ContinueWorkflowParams {
  /** Whether the user approved */
  approved: boolean;
  /** Optional workflow ID for tracking */
  workflowId?: string;
}

// ============================================================================
// Capability Module Types
// ============================================================================

/**
 * Capability module interface.
 *
 * Exported functions from dynamically imported capability code.
 */
export interface CapabilityModule {
  /** Execute the capability's main function */
  [method: string]: (args: unknown, ctx: ExecutionContext) => Promise<unknown>;
}
