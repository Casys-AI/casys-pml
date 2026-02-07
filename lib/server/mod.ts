/**
 * MCP Concurrent Server Framework
 *
 * Production-ready MCP server framework with built-in concurrency control,
 * backpressure strategies, and optional sampling support.
 *
 * Built on top of the official @modelcontextprotocol/sdk with added
 * production features for reliability and performance.
 *
 * @example
 * ```typescript
 * import { ConcurrentMCPServer } from "@casys/mcp-server";
 *
 * const server = new ConcurrentMCPServer({
 *   name: "my-server",
 *   version: "1.0.0",
 *   maxConcurrent: 10,
 *   backpressureStrategy: 'queue'
 * });
 *
 * const tools = [
 *   {
 *     name: "my_tool",
 *     description: "My custom tool",
 *     inputSchema: { type: "object", properties: {} }
 *   }
 * ];
 *
 * const handlers = new Map([
 *   ["my_tool", async (args) => { return "result"; }]
 * ]);
 *
 * server.registerTools(tools, handlers);
 * await server.start();
 * ```
 *
 * @module @casys/mcp-server
 */

// Main server class
export { ConcurrentMCPServer } from "./src/concurrent-server.ts";

// Concurrency primitives
export { RequestQueue } from "./src/request-queue.ts";

// Rate limiting
export { RateLimiter } from "./src/rate-limiter.ts";

// Schema validation
export { SchemaValidator } from "./src/schema-validator.ts";
export type { ValidationError, ValidationResult } from "./src/schema-validator.ts";

// Sampling support
export { SamplingBridge } from "./src/sampling-bridge.ts";

// Type exports
export type {
  ConcurrentServerOptions,
  MCPTool,
  ToolHandler,
  SamplingClient,
  SamplingParams,
  SamplingResult,
  QueueMetrics,
  PromiseResolver,
  QueueOptions,
  RateLimitOptions,
  RateLimitContext,
  // MCP Apps types (SEP-1865)
  MCPResource,
  ResourceHandler,
  ResourceContent,
  McpUiToolMeta,
  MCPToolMeta,
  // HTTP Server types
  HttpServerOptions,
  HttpServerInstance,
} from "./src/types.ts";

// MCP Apps constants
export { MCP_APP_MIME_TYPE, MCP_APP_URI_SCHEME } from "./src/types.ts";

// Middleware pipeline
export type {
  Middleware,
  MiddlewareContext,
  MiddlewareResult,
  NextFunction,
} from "./src/middleware/mod.ts";
export { createMiddlewareRunner } from "./src/middleware/mod.ts";

// Auth - Core
export { AuthProvider } from "./src/auth/mod.ts";
export {
  AuthError,
  extractBearerToken,
  createUnauthorizedResponse,
  createForbiddenResponse,
  createAuthMiddleware,
} from "./src/auth/mod.ts";
export { createScopeMiddleware } from "./src/auth/mod.ts";
export type {
  AuthInfo,
  AuthOptions,
  ProtectedResourceMetadata,
} from "./src/auth/mod.ts";

// Auth - JWT Provider + Presets
export { JwtAuthProvider } from "./src/auth/mod.ts";
export type { JwtAuthProviderOptions } from "./src/auth/mod.ts";
export {
  createGitHubAuthProvider,
  createGoogleAuthProvider,
  createAuth0AuthProvider,
  createOIDCAuthProvider,
} from "./src/auth/mod.ts";
export type { PresetOptions } from "./src/auth/mod.ts";

// Auth - Config (YAML + env)
export { loadAuthConfig, createAuthProviderFromConfig } from "./src/auth/mod.ts";
export type { AuthConfig, AuthProviderName } from "./src/auth/mod.ts";
