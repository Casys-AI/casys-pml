/**
 * Concurrent MCP Server Framework
 *
 * High-performance MCP server with built-in concurrency control,
 * backpressure, and optional sampling support.
 *
 * Wraps the official @modelcontextprotocol/sdk with production-ready
 * concurrency features.
 *
 * @module lib/server/concurrent-server
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Hono } from "hono";
import { cors } from "jsr:@hono/hono@^4/cors";
import { RequestQueue } from "./request-queue.ts";
import { SamplingBridge } from "./sampling-bridge.ts";
import { RateLimiter } from "./rate-limiter.ts";
import { SchemaValidator } from "./schema-validator.ts";
import type {
  ConcurrentServerOptions,
  MCPTool,
  ToolHandler,
  QueueMetrics,
  RateLimitContext,
  MCPResource,
  ResourceHandler,
  HttpServerOptions,
} from "./types.ts";
import { MCP_APP_MIME_TYPE, MCP_APP_URI_SCHEME } from "./types.ts";

/**
 * Tool definition with handler
 */
interface ToolWithHandler extends MCPTool {
  handler: ToolHandler;
}

/**
 * Internal tracking of registered resources
 */
interface RegisteredResourceInfo {
  resource: MCPResource;
  handler: ResourceHandler;
}

/**
 * SSE client connection for Streamable HTTP
 */
interface SSEClient {
  sessionId: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  createdAt: number;
  lastEventId: number;
}

/**
 * Generate a cryptographically secure session ID
 */
function generateSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * ConcurrentMCPServer provides a high-performance MCP server
 *
 * Features:
 * - Wraps official @modelcontextprotocol/sdk
 * - Concurrency limiting (default: 10 max concurrent)
 * - Multiple backpressure strategies (sleep/queue/reject)
 * - Optional bidirectional sampling support
 * - Metrics for monitoring
 * - Graceful shutdown
 *
 * @example
 * ```typescript
 * const server = new ConcurrentMCPServer({
 *   name: "my-server",
 *   version: "1.0.0",
 *   maxConcurrent: 5,
 *   backpressureStrategy: 'queue'
 * });
 *
 * server.registerTools(myTools, myHandlers);
 * await server.start();
 * ```
 */
export class ConcurrentMCPServer {
  private mcpServer: McpServer;
  private requestQueue: RequestQueue;
  private rateLimiter: RateLimiter | null = null;
  private schemaValidator: SchemaValidator | null = null;
  private samplingBridge: SamplingBridge | null = null;
  private tools = new Map<string, ToolWithHandler>();
  private resources = new Map<string, RegisteredResourceInfo>();
  private options: ConcurrentServerOptions;
  private started = false;

  // Streamable HTTP session management
  private sessions = new Map<string, { createdAt: number; lastActivity: number }>();
  private sseClients = new Map<string, SSEClient[]>(); // sessionId -> clients

  constructor(options: ConcurrentServerOptions) {
    this.options = options;

    // Create SDK MCP server
    this.mcpServer = new McpServer(
      {
        name: options.name,
        version: options.version,
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    // Create request queue with concurrency control
    this.requestQueue = new RequestQueue({
      maxConcurrent: options.maxConcurrent ?? 10,
      strategy: options.backpressureStrategy ?? "sleep",
      sleepMs: options.backpressureSleepMs ?? 10,
    });

    // Optional rate limiting
    if (options.rateLimit) {
      this.rateLimiter = new RateLimiter({
        maxRequests: options.rateLimit.maxRequests,
        windowMs: options.rateLimit.windowMs,
      });
    }

    // Optional schema validation
    if (options.validateSchema) {
      this.schemaValidator = new SchemaValidator();
    }

    // Optional sampling support
    if (options.enableSampling && options.samplingClient) {
      this.samplingBridge = new SamplingBridge(options.samplingClient);
    }

    // Setup MCP protocol handlers
    this.setupHandlers();
  }

  /**
   * Setup MCP protocol request handlers
   */
  private setupHandlers(): void {
    const server = this.mcpServer.server;

    // tools/list handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: Array.from(this.tools.values()).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          _meta: t._meta, // Always include, even if undefined (MCP Apps discovery)
        })),
      };
    });

    // tools/call handler (with concurrency control and rate limiting)
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const args = request.params.arguments || {};

      // Apply rate limiting if configured
      if (this.rateLimiter && this.options.rateLimit) {
        const context: RateLimitContext = { toolName, args };
        const key = this.options.rateLimit.keyExtractor?.(context) ?? "default";

        if (this.options.rateLimit.onLimitExceeded === "reject") {
          // Reject immediately if rate limited
          if (!this.rateLimiter.checkLimit(key)) {
            const waitTime = this.rateLimiter.getTimeUntilSlot(key);
            throw new Error(
              `Rate limit exceeded. Retry after ${Math.ceil(waitTime / 1000)}s`
            );
          }
        } else {
          // Wait for slot (default behavior)
          await this.rateLimiter.waitForSlot(key);
        }
      }

      // Validate arguments if schema validation is enabled
      if (this.schemaValidator) {
        this.schemaValidator.validateOrThrow(toolName, args);
      }

      // Apply backpressure before execution
      await this.requestQueue.acquire();

      try {
        const tool = this.tools.get(toolName);

        if (!tool) {
          throw new Error(`Unknown tool: ${toolName}`);
        }

        // Execute tool handler
        const result = await tool.handler(args);

        // Format response according to MCP protocol
        // Include _meta from tool definition for MCP Apps UI support
        const response: { content: Array<{ type: "text"; text: string }>; _meta?: Record<string, unknown> } = {
          content: [
            {
              type: "text",
              text: typeof result === "string"
                ? result
                : JSON.stringify(result, null, 2),
            },
          ],
        };
        if (tool._meta) {
          response._meta = tool._meta as Record<string, unknown>;
        }
        return response;
      } catch (error) {
        // Log error and re-throw for MCP error response
        this.log(
          `Error executing tool ${request.params.name}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        throw error;
      } finally {
        // Always release slot
        this.requestQueue.release();
      }
    });
  }

  /**
   * Register tools with their handlers
   *
   * @param tools - Array of tool definitions (MCP format)
   * @param handlers - Map of tool name to handler function
   */
  registerTools(
    tools: MCPTool[],
    handlers: Map<string, ToolHandler>,
  ): void {
    for (const tool of tools) {
      const handler = handlers.get(tool.name);
      if (!handler) {
        throw new Error(`No handler provided for tool: ${tool.name}`);
      }

      this.tools.set(tool.name, {
        ...tool,
        handler,
      });

      // Register schema for validation if enabled
      if (this.schemaValidator) {
        this.schemaValidator.addSchema(tool.name, tool.inputSchema);
      }
    }

    this.log(`Registered ${tools.length} tools`);
  }

  /**
   * Register a single tool
   *
   * @param tool - Tool definition
   * @param handler - Tool handler function
   */
  registerTool(tool: MCPTool, handler: ToolHandler): void {
    this.tools.set(tool.name, {
      ...tool,
      handler,
    });

    // Register schema for validation if enabled
    if (this.schemaValidator) {
      this.schemaValidator.addSchema(tool.name, tool.inputSchema);
    }

    this.log(`Registered tool: ${tool.name}`);
  }

  // ============================================
  // Resource Registration (MCP Apps SEP-1865)
  // ============================================

  /**
   * Validate resource URI scheme
   * Logs warning if not using ui:// scheme (MCP Apps standard)
   */
  private validateResourceUri(uri: string): void {
    if (!uri.startsWith(MCP_APP_URI_SCHEME)) {
      this.log(
        `[WARN] Resource URI "${uri}" does not use ${MCP_APP_URI_SCHEME} scheme. ` +
          `MCP Apps standard requires ui:// URIs.`,
      );
    }
  }

  /**
   * Register a single resource
   *
   * @param resource - Resource definition with uri, name, description
   * @param handler - Callback that returns ResourceContent when resource is read
   * @throws Error if resource with same URI already registered
   *
   * @example
   * ```typescript
   * server.registerResource(
   *   { uri: "ui://my-server/viewer", name: "Viewer", description: "Data viewer" },
   *   async (uri) => ({
   *     uri: uri.toString(),
   *     mimeType: MCP_APP_MIME_TYPE,
   *     text: "<html>...</html>"
   *   })
   * );
   * ```
   */
  registerResource(resource: MCPResource, handler: ResourceHandler): void {
    // Validate URI scheme
    this.validateResourceUri(resource.uri);

    // Check for duplicate
    if (this.resources.has(resource.uri)) {
      throw new Error(
        `[ConcurrentMCPServer] Resource already registered: ${resource.uri}`,
      );
    }

    // Register with SDK - wraps our handler to SDK format
    // SDK expects: { contents: ResourceContent[] }
    // Our handler returns: ResourceContent
    this.mcpServer.registerResource(
      resource.name,
      resource.uri,
      {
        description: resource.description,
        mimeType: resource.mimeType ?? MCP_APP_MIME_TYPE,
      },
      async (uri: URL) => {
        try {
          const content = await handler(uri);
          return { contents: [content] };
        } catch (error) {
          this.log(
            `[ERROR] Resource handler failed for ${uri}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          throw error;
        }
      },
    );

    // Track in our registry
    this.resources.set(resource.uri, { resource, handler });

    this.log(`Registered resource: ${resource.name} (${resource.uri})`);
  }

  /**
   * Register multiple resources
   *
   * @param resources - Array of resource definitions
   * @param handlers - Map of URI to handler function
   * @throws Error if any resource is missing a handler (fail-fast)
   */
  registerResources(
    resources: MCPResource[],
    handlers: Map<string, ResourceHandler>,
  ): void {
    // Validate all handlers exist BEFORE registering any (fail-fast)
    const missingHandlers: string[] = [];
    for (const resource of resources) {
      if (!handlers.has(resource.uri)) {
        missingHandlers.push(resource.uri);
      }
    }

    if (missingHandlers.length > 0) {
      throw new Error(
        `[ConcurrentMCPServer] Missing handlers for resources:\n` +
          missingHandlers.map((uri) => `  - ${uri}`).join("\n"),
      );
    }

    // Validate no duplicates exist BEFORE registering any (atomic behavior)
    const duplicateUris: string[] = [];
    for (const resource of resources) {
      if (this.resources.has(resource.uri)) {
        duplicateUris.push(resource.uri);
      }
    }

    if (duplicateUris.length > 0) {
      throw new Error(
        `[ConcurrentMCPServer] Resources already registered:\n` +
          duplicateUris.map((uri) => `  - ${uri}`).join("\n"),
      );
    }

    // All validations passed, register resources
    for (const resource of resources) {
      const handler = handlers.get(resource.uri);
      if (!handler) {
        // Should never happen after validation, but defensive check
        throw new Error(
          `[ConcurrentMCPServer] Handler disappeared for ${resource.uri}`,
        );
      }
      this.registerResource(resource, handler);
    }

    this.log(`Registered ${resources.length} resources`);
  }

  /**
   * Start the MCP server with stdio transport
   */
  async start(): Promise<void> {
    if (this.started) {
      throw new Error("Server already started");
    }

    const transport = new StdioServerTransport();
    await this.mcpServer.server.connect(transport);

    this.started = true;

    const rateLimitInfo = this.options.rateLimit
      ? `, rate limit: ${this.options.rateLimit.maxRequests}/${this.options.rateLimit.windowMs}ms`
      : "";
    const validationInfo = this.options.validateSchema ? ", schema validation: on" : "";

    this.log(
      `Server started (max concurrent: ${
        this.options.maxConcurrent ?? 10
      }, strategy: ${this.options.backpressureStrategy ?? "sleep"}${rateLimitInfo}${validationInfo})`,
    );
    this.log(`Tools available: ${this.tools.size}`);
  }

  /**
   * Stop the server gracefully
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    // Cancel pending sampling requests
    if (this.samplingBridge) {
      this.samplingBridge.cancelAll();
    }

    // Stop HTTP server if running
    if (this.httpServer) {
      await this.httpServer.shutdown();
      this.httpServer = null;
    }

    await this.mcpServer.server.close();
    this.started = false;

    this.log("Server stopped");
  }

  // ============================================
  // HTTP Server Support
  // ============================================

  private httpServer: Deno.HttpServer | null = null;

  /**
   * Start the MCP server with HTTP transport (Streamable HTTP compatible)
   *
   * This creates an HTTP server that handles MCP JSON-RPC requests.
   * Supports tools/list, tools/call, resources/list, resources/read.
   *
   * @param options - HTTP server options
   * @returns Server instance with shutdown method
   *
   * @example
   * ```typescript
   * const server = new ConcurrentMCPServer({ name: "my-server", version: "1.0.0" });
   * server.registerTools(tools, handlers);
   * server.registerResource(resource, handler);
   *
   * const http = await server.startHttp({ port: 3000 });
   * // Server running on http://localhost:3000
   *
   * // Later: await http.shutdown();
   * ```
   */
  async startHttp(options: HttpServerOptions): Promise<{ shutdown: () => Promise<void>; addr: { hostname: string; port: number } }> {
    if (this.started) {
      throw new Error("Server already started");
    }

    const hostname = options.hostname ?? "0.0.0.0";
    const enableCors = options.cors ?? true;

    // Create Hono app
    const app = new Hono();

    // CORS middleware
    if (enableCors) {
      app.use("*", cors({
        origin: "*",
        allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Accept", "mcp-session-id", "last-event-id"],
        exposeHeaders: ["Content-Length", "mcp-session-id"],
        maxAge: 600,
      }));
    }

    // Health check endpoint
    app.get("/health", (c) => c.json({ status: "ok", server: this.options.name, version: this.options.version }));

    // MCP endpoint - GET opens SSE stream for server→client messages (Streamable HTTP spec)
    // deno-lint-ignore no-explicit-any
    const handleMcpGet = (c: any) => {
      const accept = c.req.header("Accept") ?? c.req.header("accept") ?? "";
      const sessionId = c.req.header("Mcp-Session-Id") ?? c.req.header("mcp-session-id");
      const lastEventId = c.req.header("Last-Event-Id") ?? c.req.header("last-event-id");

      // Check if client accepts SSE
      if (!accept.includes("text/event-stream")) {
        return c.text("Method Not Allowed", 405);
      }

      // Validate session if provided
      if (sessionId && !this.sessions.has(sessionId)) {
        return c.text("Session not found", 404);
      }

      // Create SSE stream
      const encoder = new TextEncoder();
      let sseClient: SSEClient | null = null;

      const stream = new ReadableStream<Uint8Array>({
        start: (controller) => {
          const clientSessionId = sessionId ?? "anonymous";
          sseClient = {
            sessionId: clientSessionId,
            controller,
            createdAt: Date.now(),
            lastEventId: lastEventId ? parseInt(lastEventId, 10) : 0,
          };

          // Register client
          if (!this.sseClients.has(clientSessionId)) {
            this.sseClients.set(clientSessionId, []);
          }
          this.sseClients.get(clientSessionId)!.push(sseClient);

          this.log(`SSE client connected (session: ${clientSessionId})`);

          // Send initial comment to establish connection
          controller.enqueue(encoder.encode(": connected\n\n"));
        },
        cancel: () => {
          // Remove client on disconnect
          if (sseClient) {
            const clients = this.sseClients.get(sseClient.sessionId);
            if (clients) {
              const idx = clients.indexOf(sseClient);
              if (idx !== -1) clients.splice(idx, 1);
              if (clients.length === 0) this.sseClients.delete(sseClient.sessionId);
            }
            this.log(`SSE client disconnected (session: ${sseClient.sessionId})`);
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
        },
      });
    };

    // deno-lint-ignore no-explicit-any
    app.get("/mcp", handleMcpGet as any);
    // deno-lint-ignore no-explicit-any
    app.get("/", handleMcpGet as any);

    // MCP endpoint - POST handles JSON-RPC
    const handleMcpPost = async (c: { req: { json: () => Promise<unknown> }; json: (data: unknown, status?: number) => Response }) => {
      try {
        const body = await c.req.json() as { id?: string | number; method?: string; params?: Record<string, unknown> };
        const { id, method, params } = body;

        // Initialize - create session and return session ID
        if (method === "initialize") {
          const sessionId = generateSessionId();
          const now = Date.now();
          this.sessions.set(sessionId, { createdAt: now, lastActivity: now });

          this.log(`New session created: ${sessionId}`);

          return new Response(JSON.stringify({
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: "2025-03-26",
              capabilities: {
                tools: {},
                resources: this.resources.size > 0 ? {} : undefined,
              },
              serverInfo: {
                name: this.options.name,
                version: this.options.version,
              },
            },
          }), {
            headers: {
              "Content-Type": "application/json",
              "Mcp-Session-Id": sessionId,
            },
          });
        }

        // Tools list
        if (method === "tools/list") {
          return c.json({
            jsonrpc: "2.0",
            id,
            result: {
              tools: Array.from(this.tools.values()).map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
                _meta: t._meta,
              })),
            },
          });
        }

        // Tools call
        if (method === "tools/call" && params?.name) {
          const toolName = params.name as string;
          const args = (params.arguments as Record<string, unknown>) || {};

          const tool = this.tools.get(toolName);
          if (!tool) {
            return c.json({
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: `Unknown tool: ${toolName}` },
            });
          }

          // Apply rate limiting if configured
          if (this.rateLimiter && this.options.rateLimit) {
            const context: RateLimitContext = { toolName, args };
            const key = this.options.rateLimit.keyExtractor?.(context) ?? "default";

            if (this.options.rateLimit.onLimitExceeded === "reject") {
              if (!this.rateLimiter.checkLimit(key)) {
                const waitTime = this.rateLimiter.getTimeUntilSlot(key);
                return c.json({
                  jsonrpc: "2.0",
                  id,
                  error: { code: -32000, message: `Rate limit exceeded. Retry after ${Math.ceil(waitTime / 1000)}s` },
                });
              }
            } else {
              await this.rateLimiter.waitForSlot(key);
            }
          }

          // Validate arguments if schema validation is enabled
          if (this.schemaValidator) {
            try {
              this.schemaValidator.validateOrThrow(toolName, args);
            } catch (error) {
              return c.json({
                jsonrpc: "2.0",
                id,
                error: { code: -32602, message: error instanceof Error ? error.message : "Validation failed" },
              });
            }
          }

          // Apply backpressure
          await this.requestQueue.acquire();

          try {
            const result = await tool.handler(args);
            return c.json({
              jsonrpc: "2.0",
              id,
              result: {
                content: [{
                  type: "text",
                  text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
                }],
                ...(tool._meta && { _meta: tool._meta }),
              },
            });
          } catch (error) {
            this.log(`Error executing tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`);
            return c.json({
              jsonrpc: "2.0",
              id,
              error: { code: -32603, message: error instanceof Error ? error.message : "Tool execution failed" },
            });
          } finally {
            this.requestQueue.release();
          }
        }

        // Resources list
        if (method === "resources/list") {
          return c.json({
            jsonrpc: "2.0",
            id,
            result: {
              resources: Array.from(this.resources.values()).map((r) => ({
                uri: r.resource.uri,
                name: r.resource.name,
                description: r.resource.description,
                mimeType: r.resource.mimeType ?? MCP_APP_MIME_TYPE,
              })),
            },
          });
        }

        // Resources read
        if (method === "resources/read" && params?.uri) {
          const uri = params.uri as string;
          const resourceInfo = this.resources.get(uri);

          if (!resourceInfo) {
            return c.json({
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: `Resource not found: ${uri}` },
            });
          }

          try {
            const content = await resourceInfo.handler(new URL(uri));
            return c.json({
              jsonrpc: "2.0",
              id,
              result: { contents: [content] },
            });
          } catch (error) {
            this.log(`Error reading resource ${uri}: ${error instanceof Error ? error.message : String(error)}`);
            return c.json({
              jsonrpc: "2.0",
              id,
              error: { code: -32603, message: error instanceof Error ? error.message : "Resource read failed" },
            });
          }
        }

        // Handle notifications (no id, no response expected)
        // Per Streamable HTTP spec: notifications return 202 Accepted with no body
        if (method?.startsWith("notifications/") || !id) {
          return new Response(null, { status: 202 });
        }

        // Method not found
        return c.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
      } catch (error) {
        this.log(`HTTP request error: ${error instanceof Error ? error.message : String(error)}`);
        return c.json({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        });
      }
    };

    // deno-lint-ignore no-explicit-any
    app.post("/mcp", handleMcpPost as any);
    // deno-lint-ignore no-explicit-any
    app.post("/", handleMcpPost as any);

    // Start server
    this.httpServer = Deno.serve(
      {
        port: options.port,
        hostname,
        onListen: options.onListen ?? ((info) => {
          this.log(`HTTP server started on http://${info.hostname}:${info.port}`);
        }),
      },
      app.fetch,
    );

    this.started = true;

    const rateLimitInfo = this.options.rateLimit
      ? `, rate limit: ${this.options.rateLimit.maxRequests}/${this.options.rateLimit.windowMs}ms`
      : "";
    const validationInfo = this.options.validateSchema ? ", schema validation: on" : "";

    this.log(
      `Server started HTTP mode (max concurrent: ${
        this.options.maxConcurrent ?? 10
      }, strategy: ${this.options.backpressureStrategy ?? "sleep"}${rateLimitInfo}${validationInfo})`,
    );
    this.log(`Tools available: ${this.tools.size}, Resources: ${this.resources.size}`);

    return {
      shutdown: async () => {
        await this.stop();
      },
      addr: { hostname, port: options.port },
    };
  }

  /**
   * Send a JSON-RPC message to all SSE clients in a session
   * Used for server-initiated notifications and requests
   *
   * @param sessionId - Session ID (or "anonymous" for clients without session)
   * @param message - JSON-RPC message to send
   */
  sendToSession(sessionId: string, message: Record<string, unknown>): void {
    const clients = this.sseClients.get(sessionId);
    if (!clients || clients.length === 0) {
      this.log(`No SSE clients for session: ${sessionId}`);
      return;
    }

    const encoder = new TextEncoder();
    const eventId = Date.now();
    const data = `id: ${eventId}\ndata: ${JSON.stringify(message)}\n\n`;

    for (const client of clients) {
      try {
        client.controller.enqueue(encoder.encode(data));
        client.lastEventId = eventId;
      } catch {
        this.log(`Failed to send to SSE client in session: ${sessionId}`);
      }
    }
  }

  /**
   * Send a notification to all connected SSE clients
   *
   * @param method - Notification method name
   * @param params - Notification parameters
   */
  broadcastNotification(method: string, params?: Record<string, unknown>): void {
    const message = {
      jsonrpc: "2.0",
      method,
      params,
    };

    for (const sessionId of this.sseClients.keys()) {
      this.sendToSession(sessionId, message);
    }
  }

  /**
   * Get number of active SSE connections
   */
  getSSEClientCount(): number {
    let count = 0;
    for (const clients of this.sseClients.values()) {
      count += clients.length;
    }
    return count;
  }

  /**
   * Get sampling bridge (if enabled)
   */
  getSamplingBridge(): SamplingBridge | null {
    return this.samplingBridge;
  }

  /**
   * Get queue metrics for monitoring
   */
  getMetrics(): QueueMetrics {
    return this.requestQueue.getMetrics();
  }

  /**
   * Get rate limiter metrics (if rate limiting is enabled)
   */
  getRateLimitMetrics(): { keys: number; totalRequests: number } | null {
    return this.rateLimiter?.getMetrics() ?? null;
  }

  /**
   * Get rate limiter instance (for advanced use cases)
   */
  getRateLimiter(): RateLimiter | null {
    return this.rateLimiter;
  }

  /**
   * Get schema validator instance (for advanced use cases)
   */
  getSchemaValidator(): SchemaValidator | null {
    return this.schemaValidator;
  }

  /**
   * Check if server is started
   */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * Get number of registered tools
   */
  getToolCount(): number {
    return this.tools.size;
  }

  /**
   * Get tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  // ============================================
  // Resource Introspection (MCP Apps)
  // ============================================

  /**
   * Get number of registered resources
   */
  getResourceCount(): number {
    return this.resources.size;
  }

  /**
   * Get registered resource URIs
   */
  getResourceUris(): string[] {
    return Array.from(this.resources.keys());
  }

  /**
   * Check if a resource is registered
   */
  hasResource(uri: string): boolean {
    return this.resources.has(uri);
  }

  /**
   * Get resource info by URI (for testing/debugging)
   */
  getResourceInfo(uri: string): MCPResource | undefined {
    return this.resources.get(uri)?.resource;
  }

  /**
   * Log message using custom logger or stderr
   */
  private log(msg: string): void {
    if (this.options.logger) {
      this.options.logger(msg);
    } else {
      console.error(`[${this.options.name}] ${msg}`);
    }
  }
}
