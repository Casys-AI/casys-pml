/**
 * Transport Module
 *
 * MessageTransport abstractions for RPC communication.
 * Supports both Deno Workers and browser iframes.
 *
 * @module sandbox/transport
 */

// Types
export type { MessageTransport, ProtocolAdapter } from "./types.ts";

// Base class
export { BaseTransport } from "./base-transport.ts";

// Implementations
export { DenoWorkerTransport } from "./deno-worker-transport.ts";
export { IframeTransport } from "./iframe-transport.ts";
export { McpAppsProtocolAdapter } from "./mcp-apps-adapter.ts";
