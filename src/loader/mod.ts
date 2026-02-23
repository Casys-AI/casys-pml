/**
 * Dynamic MCP Loader Module
 *
 * Exports all loader components for capability loading and dependency management.
 *
 * @module loader
 */

// Types
export type {
  ApprovalRequiredResult,
  CapabilityLoadResult,
  CapabilityMetadata,
  CapabilityModule,
  ContinueWorkflowParams,
  DepStateFile,
  ExecutionContext,
  InstalledDep,
  InstallResult,
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
  ToolPermissionApprovalRequired,
} from "./types.ts";

export { InstallError, IntegrityError, LoaderError } from "./types.ts";

// Registry Client
export { RegistryClient, toolNameToFqdn } from "./registry-client.ts";

// Deno Loader
export {
  type CacheStatus,
  clearModuleCache,
  getCachedModule,
  getCachedUrls,
  isModuleCached,
  loadCapabilityModule,
  type LoadResult,
} from "./deno-loader.ts";

// Code Fetcher (for sandboxed execution)
export {
  clearCodeCache,
  type CodeFetchResult,
  fetchCapabilityCode,
  getCachedCode,
  isCodeCached,
} from "./code-fetcher.ts";

// Dependency State
export { createDepState, DepState } from "./dep-state.ts";

// Integrity Verification
export {
  computeFileHash,
  computePackageHash,
  computeStringHash,
  createMockIntegrity,
  isValidIntegrityFormat,
  parseIntegrity,
  verifyDataIntegrity,
  verifyIntegrity,
} from "./integrity.ts";

// Dependency Installer
export { createDepInstaller, DepInstaller } from "./dep-installer.ts";

// Stdio RPC
export {
  createErrorResponse,
  createNotification,
  createRequest,
  extractResult,
  isErrorResponse,
  type JsonRpcError,
  JsonRpcErrorCodes,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
  parseResponse,
  serializeMessage,
} from "./stdio-rpc.ts";

// Stdio Manager
export { StdioManager } from "./stdio-manager.ts";

// Binary Resolver (for mcp-std)
export {
  type BinaryConfig,
  BinaryResolver,
  createStdBinaryResolver,
  getBinaryAssetName,
  getCachePath,
  getOsArch,
} from "./binary-resolver.ts";

// Environment Checker
export {
  checkEnvVars,
  CommonEnvVars,
  type EnvCheckResult,
  formatMissingEnvError,
  getEnvStatus,
  validateEnvForDep,
} from "./env-checker.ts";

// Capability Loader (main entry point)
export {
  CapabilityLoader,
  type CapabilityLoaderOptions,
} from "./capability-loader.ts";

// Lockfile Types (Story 14.7 - re-export for convenience)
export type { IntegrityApprovalRequired } from "../lockfile/types.ts";
export { LockfileManager } from "../lockfile/mod.ts";

// UI Orchestration Types (Epic 16 - re-export for convenience)
export type {
  CollectedUiResource,
  CompositeUiDescriptor,
  McpUiCsp,
  McpUiPermissions,
  McpUiResourceMeta,
  McpUiToolMeta,
  ResolvedSyncRule,
  UiLayout,
  UiOrchestration,
  UiSyncRule,
} from "../types/mod.ts";
