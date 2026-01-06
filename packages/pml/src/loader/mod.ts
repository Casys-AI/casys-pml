/**
 * Dynamic MCP Loader Module
 *
 * Exports all loader components for capability loading and dependency management.
 *
 * @module loader
 */

// Types
export type {
  CapabilityMetadata,
  CapabilityModule,
  DepStateFile,
  ExecutionContext,
  HilCallback,
  InstallResult,
  InstalledDep,
  IntegrityResult,
  LoadedCapability,
  LoaderErrorCode,
  McpDependency,
  McpProxy,
  PendingRequest,
  RegistryClientOptions,
  RegistryFetchResult,
  StdioProcess,
} from "./types.ts";

export { InstallError, IntegrityError, LoaderError } from "./types.ts";

// Registry Client
export { RegistryClient, toolNameToFqdn } from "./registry-client.ts";

// Deno Loader
export {
  clearModuleCache,
  getCachedModule,
  getCachedUrls,
  isModuleCached,
  loadCapabilityModule,
  type CacheStatus,
  type LoadResult,
} from "./deno-loader.ts";

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
  JsonRpcErrorCodes,
  parseResponse,
  serializeMessage,
  type JsonRpcError,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "./stdio-rpc.ts";

// Stdio Manager
export { StdioManager } from "./stdio-manager.ts";

// Environment Checker
export {
  checkEnvVars,
  CommonEnvVars,
  formatMissingEnvError,
  getEnvStatus,
  validateEnvForDep,
  type EnvCheckResult,
} from "./env-checker.ts";

// Capability Loader (main entry point)
export {
  CapabilityLoader,
  type CapabilityLoaderOptions,
} from "./capability-loader.ts";
