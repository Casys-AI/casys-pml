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
import { cors } from "hono/cors";
import { RequestQueue } from "./request-queue.ts";
import { SamplingBridge } from "./sampling-bridge.ts";
import { RateLimiter } from "./rate-limiter.ts";
import { SchemaValidator } from "./schema-validator.ts";
import { createMiddlewareRunner } from "./middleware/runner.ts";
import { createRateLimitMiddleware } from "./middleware/rate-limit.ts";
import { createValidationMiddleware } from "./middleware/validation.ts";
import { createBackpressureMiddleware } from "./middleware/backpressure.ts";
import type { Middleware, MiddlewareContext, MiddlewareResult } from "./middleware/types.ts";
import { serve, unrefTimer, type ServeHandle } from "./runtime.ts";
import { createAuthMiddleware, AuthError, extractBearerToken, createUnauthorizedResponse, createForbiddenResponse } from "./auth/middleware.ts";
import { createScopeMiddleware } from "./auth/scope-middleware.ts";
import { loadAuthConfig, createAuthProviderFromConfig } from "./auth/config.ts";
import type { AuthProvider } from "./auth/provider.ts";
import type {
  ConcurrentServerOptions,
  MCPTool,
  ToolHandler,
  QueueMetrics,
  MCPResource,
  ResourceHandler,
  HttpServerOptions,
} from "./types.ts";
import { MCP_APP_MIME_TYPE, MCP_APP_URI_SCHEME } from "./types.ts";
import { ServerMetrics } from "./observability/metrics.ts";
import { startToolCallSpan, endToolCallSpan } from "./observability/otel.ts";

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

  // Middleware pipeline
  private customMiddlewares: Middleware[] = [];
  private middlewareRunner: ((ctx: MiddlewareContext) => Promise<MiddlewareResult>) | null = null;

  // Auth provider (set from options.auth or auto-configured from env)
  private authProvider: AuthProvider | null = null;

  // Observability
  private serverMetrics = new ServerMetrics();

  // Streamable HTTP session management
  private sessions = new Map<string, { createdAt: number; lastActivity: number }>();
  private sseClients = new Map<string, SSEClient[]>(); // sessionId -> clients
  private sessionCleanupTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
  private static readonly SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly SESSION_GRACE_PERIOD_MS = 60 * 1000; // 60s grace for in-flight requests
  private static readonly MAX_SESSIONS = 10_000;

  // Per-IP rate limiter for initialize requests (anti-session-exhaustion)
  private initRateLimiter = new RateLimiter({ maxRequests: 10, windowMs: 60_000 });

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

    // tools/call handler (delegates to middleware pipeline)
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const args = request.params.arguments || {};

      try {
        const result = await this.executeToolCall(toolName, args);

        // Format response according to MCP protocol
        const tool = this.tools.get(toolName);
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
        if (tool?._meta) {
          response._meta = tool._meta as Record<string, unknown>;
        }
        return response;
      } catch (error) {
        this.log(
          `Error executing tool ${request.params.name}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        throw error;
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
    if (this.started) {
      throw new Error(
        "[ConcurrentMCPServer] Cannot register tools after server started. " +
        "Call registerTools() before start() or startHttp().",
      );
    }
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
    if (this.started) {
      throw new Error(
        "[ConcurrentMCPServer] Cannot register tools after server started. " +
        "Call registerTool() before start() or startHttp().",
      );
    }
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
  // Middleware Pipeline
  // ============================================

  /**
   * Add a custom middleware to the pipeline.
   * Must be called before start()/startHttp().
   *
   * Custom middlewares execute between rate-limit and validation:
   * rate-limit → **custom middlewares** → validation → backpressure → handler
   *
   * @param middleware - Middleware function
   * @returns this (for chaining)
   *
   * @example
   * ```typescript
   * server.use(async (ctx, next) => {
   *   console.log(`Calling ${ctx.toolName}`);
   *   const result = await next();
   *   console.log(`Done ${ctx.toolName}`);
   *   return result;
   * });
   * ```
   */
  use(middleware: Middleware): this {
    if (this.started) {
      throw new Error(
        "[ConcurrentMCPServer] Cannot add middleware after server started. " +
        "Call use() before start() or startHttp().",
      );
    }
    this.customMiddlewares.push(middleware);
    this.middlewareRunner = null; // Invalidate cached runner
    return this;
  }

  /**
   * Build the middleware pipeline from config + custom middlewares.
   * Called once at start()/startHttp() time.
   *
   * Pipeline order:
   * rate-limit → auth → custom middlewares → scope-check → validation → backpressure → handler
   */
  private buildPipeline(): void {
    const pipeline: Middleware[] = [];

    // 1. Rate limiting (if configured)
    if (this.rateLimiter && this.options.rateLimit) {
      pipeline.push(createRateLimitMiddleware(this.rateLimiter, this.options.rateLimit));
    }

    // 2. Auth middleware (if auth provider is set)
    if (this.authProvider) {
      pipeline.push(createAuthMiddleware(this.authProvider));
    }

    // 3. Custom middlewares (logging, tracing, etc.)
    pipeline.push(...this.customMiddlewares);

    // 4. Scope enforcement (if any tool has requiredScopes)
    const toolScopes = new Map<string, string[]>();
    for (const [name, tool] of this.tools) {
      if (tool.requiredScopes?.length) {
        toolScopes.set(name, tool.requiredScopes);
      }
    }
    if (toolScopes.size > 0) {
      pipeline.push(createScopeMiddleware(toolScopes));
    }

    // 5. Schema validation (if enabled)
    if (this.schemaValidator) {
      pipeline.push(createValidationMiddleware(this.schemaValidator));
    }

    // 6. Backpressure (always)
    pipeline.push(createBackpressureMiddleware(this.requestQueue));

    this.middlewareRunner = createMiddlewareRunner(pipeline, async (ctx) => {
      const tool = this.tools.get(ctx.toolName);
      if (!tool) {
        throw new Error(`Unknown tool: ${ctx.toolName}`);
      }
      return tool.handler(ctx.args);
    });
  }

  /**
   * Execute a tool call through the middleware pipeline.
   * Unified entry point for both STDIO and HTTP transports.
   *
   * @param toolName - Name of the tool to call
   * @param args - Tool arguments
   * @param request - HTTP request (undefined for STDIO)
   * @param sessionId - HTTP session ID (undefined for STDIO)
   * @returns Tool execution result
   */
  private async executeToolCall(
    toolName: string,
    args: Record<string, unknown>,
    request?: Request,
    sessionId?: string,
  ): Promise<MiddlewareResult> {
    if (!this.middlewareRunner) {
      throw new Error("[ConcurrentMCPServer] Pipeline not built. Call start() or startHttp() first.");
    }

    const ctx: MiddlewareContext = {
      toolName,
      args,
      request,
      sessionId,
    };

    // OTel span + metrics
    const span = startToolCallSpan(toolName, {
      "mcp.tool.name": toolName,
      "mcp.server.name": this.options.name,
      "mcp.transport": request ? "http" : "stdio",
      "mcp.session.id": sessionId,
    });

    // Update gauges before execution
    const queueMetrics = this.requestQueue.getMetrics();
    this.serverMetrics.setGauges({
      activeRequests: queueMetrics.inFlight,
      queuedRequests: queueMetrics.queued,
      activeSessions: this.sessions.size,
      sseClients: this.getSSEClientCount(),
      rateLimiterKeys: this.rateLimiter?.getMetrics().keys ?? 0,
    });

    const start = performance.now();
    try {
      const result = await this.middlewareRunner(ctx);
      const durationMs = performance.now() - start;
      this.serverMetrics.recordToolCall(toolName, true, durationMs);
      endToolCallSpan(span, true, durationMs);
      return result;
    } catch (error) {
      const durationMs = performance.now() - start;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.serverMetrics.recordToolCall(toolName, false, durationMs);
      endToolCallSpan(span, false, durationMs, errorMsg);
      throw error;
    }
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

    // Build middleware pipeline before connecting transport
    this.buildPipeline();

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
   * Clean up expired sessions to prevent memory leaks.
   * Removes sessions that haven't had activity within SESSION_TTL_MS.
   */
  private cleanupSessions(): void {
    const now = Date.now();
    const ttlWithGrace = ConcurrentMCPServer.SESSION_TTL_MS + ConcurrentMCPServer.SESSION_GRACE_PERIOD_MS;
    let cleaned = 0;
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity > ttlWithGrace) {
        this.sessions.delete(sessionId);
        // Also clean up SSE clients for this session
        const clients = this.sseClients.get(sessionId);
        if (clients) {
          for (const client of clients) {
            try { client.controller.close(); } catch { /* already closed */ }
          }
          this.sseClients.delete(sessionId);
        }
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.serverMetrics.recordSessionExpired(cleaned);
      this.log(`Session cleanup: removed ${cleaned} expired sessions (${this.sessions.size} remaining)`);
    }
  }

  /**
   * Stop the server gracefully
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    // Stop session cleanup timer
    if (this.sessionCleanupTimer) {
      clearInterval(this.sessionCleanupTimer);
      this.sessionCleanupTimer = null;
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

  private httpServer: ServeHandle | null = null;

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

    // Configure auth provider:
    // 1. Programmatic (options.auth.provider) takes priority
    // 2. Otherwise, auto-load from YAML + env vars
    if (this.options.auth?.provider) {
      this.authProvider = this.options.auth.provider;
      this.log(`Auth configured: provider=${this.authProvider.constructor.name}`);
    } else {
      const authConfig = await loadAuthConfig();
      if (authConfig) {
        this.authProvider = createAuthProviderFromConfig(authConfig);
        this.log(`Auth auto-configured from config: provider=${authConfig.provider}`);
      }
    }

    // Build middleware pipeline (includes auth if configured)
    this.buildPipeline();

    const hostname = options.hostname ?? "0.0.0.0";
    const enableCors = options.cors ?? true;

    // Create Hono app
    const app = new Hono();

    // CORS middleware
    if (enableCors) {
      app.use("*", cors({
        origin: "*",
        allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Accept", "Authorization", "mcp-session-id", "last-event-id"],
        exposeHeaders: ["Content-Length", "mcp-session-id"],
        maxAge: 600,
      }));
    }

    // Health check endpoint
    app.get("/health", (c) => c.json({ status: "ok", server: this.options.name, version: this.options.version }));

    // Prometheus metrics endpoint
    app.get("/metrics", (_c) => {
      // Update gauges before serving
      const qm = this.requestQueue.getMetrics();
      this.serverMetrics.setGauges({
        activeRequests: qm.inFlight,
        queuedRequests: qm.queued,
        activeSessions: this.sessions.size,
        sseClients: this.getSSEClientCount(),
        rateLimiterKeys: this.rateLimiter?.getMetrics().keys ?? 0,
      });
      return new Response(this.serverMetrics.toPrometheusFormat(), {
        headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
      });
    });

    // RFC 9728 Protected Resource Metadata endpoint
    // deno-lint-ignore no-explicit-any
    app.get("/.well-known/oauth-protected-resource", ((c: any) => {
      if (!this.authProvider) {
        return c.text("Not Found", 404);
      }
      return c.json(this.authProvider.getResourceMetadata());
    }) as any);

    // Helper: build resource metadata URL safely (avoid double slash)
    const buildMetadataUrl = (resource: string): string => {
      const base = resource.endsWith("/") ? resource.slice(0, -1) : resource;
      return `${base}/.well-known/oauth-protected-resource`;
    };

    // Auth verification helper for HTTP endpoints.
    // Returns an error Response if auth is required but token is missing/invalid.
    // Returns null if auth passes or is not configured.
    const verifyHttpAuth = async (request: Request): Promise<Response | null> => {
      if (!this.authProvider) return null;

      const token = extractBearerToken(request);
      if (!token) {
        const metadata = this.authProvider.getResourceMetadata();
        return createUnauthorizedResponse(
          buildMetadataUrl(metadata.resource),
          "missing_token",
          "Authorization header with Bearer token required",
        );
      }

      const authInfo = await this.authProvider.verifyToken(token);
      if (!authInfo) {
        const metadata = this.authProvider.getResourceMetadata();
        return createUnauthorizedResponse(
          buildMetadataUrl(metadata.resource),
          "invalid_token",
          "Invalid or expired token",
        );
      }

      return null;
    };

    // MCP endpoint - GET opens SSE stream for server→client messages (Streamable HTTP spec)
    // deno-lint-ignore no-explicit-any
    const handleMcpGet = async (c: any) => {
      const accept = c.req.header("accept") ?? "";
      const sessionId = c.req.header("mcp-session-id");
      const lastEventId = c.req.header("last-event-id");

      // Check if client accepts SSE
      if (!accept.includes("text/event-stream")) {
        return c.text("Method Not Allowed", 405);
      }

      // Auth gate: SSE connections require valid token when auth is configured
      const authDeniedSse = await verifyHttpAuth(c.req.raw);
      if (authDeniedSse) return authDeniedSse;

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
          const parsedEventId = lastEventId ? parseInt(lastEventId, 10) : 0;
          sseClient = {
            sessionId: clientSessionId,
            controller,
            createdAt: Date.now(),
            lastEventId: Number.isNaN(parsedEventId) ? 0 : parsedEventId,
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
    const handleMcpPost = async (c: { req: { json: () => Promise<unknown>; raw: Request; header: (name: string) => string | undefined }; json: (data: unknown, status?: number) => Response }) => {
      let requestId: string | number | null = null;
      try {
        const body = await c.req.json() as { id?: string | number; method?: string; params?: Record<string, unknown> };
        const { id, method, params } = body;
        requestId = id ?? null;

        // Initialize - create session and return session ID
        // Note: initialize is NOT auth-gated (client needs to discover capabilities first)
        if (method === "initialize") {
          // Per-IP rate limit on initialize to prevent session exhaustion attacks
          const clientIp = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
            ?? c.req.header("x-real-ip")
            ?? "unknown";
          if (!this.initRateLimiter.checkLimit(clientIp)) {
            return c.json({
              jsonrpc: "2.0",
              id,
              error: { code: -32000, message: "Too many initialize requests. Try again later." },
            }, 429);
          }

          // Guard against session exhaustion
          if (this.sessions.size >= ConcurrentMCPServer.MAX_SESSIONS) {
            this.cleanupSessions();
            if (this.sessions.size >= ConcurrentMCPServer.MAX_SESSIONS) {
              return c.json({
                jsonrpc: "2.0",
                id,
                error: { code: -32000, message: "Too many active sessions" },
              }, 503);
            }
          }
          const sessionId = generateSessionId();
          const now = Date.now();
          this.sessions.set(sessionId, { createdAt: now, lastActivity: now });
          this.serverMetrics.recordSessionCreated();

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

        // Session validation: all methods after initialize must provide a valid session
        const reqSessionId = c.req.header("mcp-session-id");
        if (reqSessionId) {
          const session = this.sessions.get(reqSessionId);
          if (!session) {
            return c.json({
              jsonrpc: "2.0",
              id,
              error: { code: -32001, message: "Session not found or expired" },
            }, 404);
          }
          // Update last activity to prevent premature cleanup
          session.lastActivity = Date.now();
        }

        // Tools call (delegates to middleware pipeline, which handles auth internally)
        if (method === "tools/call" && params?.name) {
          const toolName = params.name as string;
          const args = (params.arguments as Record<string, unknown>) || {};

          try {
            const result = await this.executeToolCall(toolName, args, c.req.raw, undefined);
            const tool = this.tools.get(toolName);
            return c.json({
              jsonrpc: "2.0",
              id,
              result: {
                content: [{
                  type: "text",
                  text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
                }],
                ...(tool?._meta && { _meta: tool._meta }),
              },
            });
          } catch (error) {
            // Handle AuthError with proper HTTP status codes
            if (error instanceof AuthError) {
              if (error.code === "missing_token" || error.code === "invalid_token") {
                return createUnauthorizedResponse(
                  error.resourceMetadataUrl,
                  error.code,
                  error.message,
                );
              }
              if (error.code === "insufficient_scope") {
                return createForbiddenResponse(error.requiredScopes ?? []);
              }
            }

            this.log(`Error executing tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`);
            const errorMessage = error instanceof Error ? error.message : "Tool execution failed";
            const errorCode = errorMessage.startsWith("Unknown tool") ? -32602
              : errorMessage.startsWith("Rate limit") ? -32000
              : -32603;
            return c.json({
              jsonrpc: "2.0",
              id,
              error: { code: errorCode, message: errorMessage },
            });
          }
        }

        // Auth gate: all other methods after initialize require valid token (if auth configured)
        // (tools/call is handled above via the middleware pipeline which includes auth)
        const authDenied = await verifyHttpAuth(c.req.raw);
        if (authDenied) return authDenied;

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

        // Handle notifications: must have a method and no id (JSON-RPC 2.0 notification)
        if (method && !id) {
          return new Response(null, { status: 202 });
        }

        // Malformed request: no method at all
        if (!method) {
          return c.json({
            jsonrpc: "2.0",
            id: id ?? null,
            error: { code: -32600, message: "Invalid Request: missing 'method' field" },
          });
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
          id: requestId,
          error: { code: -32700, message: "Parse error" },
        });
      }
    };

    // deno-lint-ignore no-explicit-any
    app.post("/mcp", handleMcpPost as any);
    // deno-lint-ignore no-explicit-any
    app.post("/", handleMcpPost as any);

    // Start server
    this.httpServer = serve(
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

    // Start session cleanup timer (prevents unbounded memory growth)
    this.sessionCleanupTimer = setInterval(
      () => this.cleanupSessions(),
      ConcurrentMCPServer.SESSION_CLEANUP_INTERVAL_MS,
    );
    // Don't block Deno from exiting because of cleanup timer
    unrefTimer(this.sessionCleanupTimer as unknown as number);

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

    // Iterate in reverse so splice doesn't shift indices
    for (let i = clients.length - 1; i >= 0; i--) {
      const client = clients[i];
      try {
        client.controller.enqueue(encoder.encode(data));
        client.lastEventId = eventId;
      } catch {
        // Stream is closed/broken — remove zombie client to prevent memory leak
        clients.splice(i, 1);
        this.log(`Removed dead SSE client from session: ${sessionId}`);
      }
    }

    // Clean up empty session entry
    if (clients.length === 0) {
      this.sseClients.delete(sessionId);
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
   * Get full server metrics (counters, histograms, gauges)
   */
  getServerMetrics(): import("./observability/metrics.ts").ServerMetricsSnapshot {
    const qm = this.requestQueue.getMetrics();
    this.serverMetrics.setGauges({
      activeRequests: qm.inFlight,
      queuedRequests: qm.queued,
      activeSessions: this.sessions.size,
      sseClients: this.getSSEClientCount(),
      rateLimiterKeys: this.rateLimiter?.getMetrics().keys ?? 0,
    });
    return this.serverMetrics.getSnapshot();
  }

  /**
   * Get Prometheus text format metrics
   */
  getPrometheusMetrics(): string {
    return this.serverMetrics.toPrometheusFormat();
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
