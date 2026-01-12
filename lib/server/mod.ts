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
 * import { ConcurrentMCPServer } from "@casys/mcp-std/framework";
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
 * @module lib/server
 */

// Main server class
export { ConcurrentMCPServer } from "./concurrent-server.ts";

// Concurrency primitives
export { RequestQueue } from "./request-queue.ts";

// Sampling support
export { SamplingBridge } from "./sampling-bridge.ts";

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
} from "./types.ts";
