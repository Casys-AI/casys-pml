/**
 * Mock Cloud Server
 *
 * Simulates the PML cloud server for E2E testing.
 * Provides mock endpoints for:
 * - /mcp/{fqdn} - Registry endpoint (returns capability metadata + code)
 * - /mcp/tools/call - Cloud tool execution
 * - /api/routing - Routing config sync
 *
 * Story 14.8: E2E Integration Testing
 *
 * @module tests/e2e/mock-cloud-server
 */

/**
 * Mock capability metadata from registry.
 *
 * Note: The registry returns metadata directly (not wrapped in "metadata" object).
 * Expected format for RegistryClient.validateMetadata():
 * - fqdn: string (required)
 * - type: "deno" (required)
 * - codeUrl: string (required)
 * - tools: string[] (required)
 * - routing: "client" | "server" (required)
 * - description?: string (optional)
 * - mcpDeps?: array (optional)
 */
export interface MockCapabilityResponse {
  /** FQDN for the capability (e.g., "casys.pml.json.parse") */
  fqdn?: string;
  /** Type of capability (must be "deno") */
  type?: "deno";
  /** URL to fetch capability code */
  codeUrl?: string;
  /** List of tools provided */
  tools?: string[];
  /** Routing mode: client (local) or server (cloud) */
  routing?: "client" | "server";
  /** Description of the capability */
  description?: string;
  /** TypeScript code for the capability (for /code endpoint) */
  code?: string;
  /** MCP dependencies */
  mcpDeps?: Array<{
    name: string;
    version: string;
    type: "stdio";
    install: string;
    integrity: string;
    envRequired?: string[];
  }>;
  /** Integrity hash for lockfile validation */
  integrity?: string;
  /** Error to return instead of success */
  error?: { code: number; message: string };
}

/**
 * Mock tool call response.
 */
export interface MockToolResponse {
  /** Success result */
  result?: unknown;
  /** Error response */
  error?: { code: number; message: string };
  /** Delay before responding (ms) */
  delayMs?: number;
}

/**
 * Mock routing config.
 */
export interface MockRoutingConfig {
  version: string;
  routes: Record<string, "client" | "server">;
}

/**
 * Options for MockCloudServer.
 */
export interface MockCloudServerOptions {
  /** Port to listen on */
  port?: number;
  /** Default routing config */
  routingConfig?: MockRoutingConfig;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Mock cloud server for E2E tests.
 */
export class MockCloudServer {
  private controller: AbortController | null = null;
  private readonly port: number;
  private readonly debug: boolean;

  /** Mock responses for /mcp/{fqdn} */
  private readonly mcpResponses = new Map<string, MockCapabilityResponse>();

  /** Mock responses for /mcp/tools/call */
  private readonly toolResponses = new Map<string, MockToolResponse>();

  /** Default routing config */
  private routingConfig: MockRoutingConfig;

  /** Request history for assertions */
  private readonly requestHistory: Array<{
    method: string;
    path: string;
    body?: unknown;
    timestamp: number;
  }> = [];

  /** Whether server is running */
  private running = false;

  constructor(options: MockCloudServerOptions = {}) {
    this.port = options.port ?? 3099;
    this.debug = options.debug ?? false;
    this.routingConfig = options.routingConfig ?? {
      version: "1.0.0",
      routes: {
        "filesystem:*": "client",
        "json:*": "server",
        "tavily:*": "server",
        "*": "client",
      },
    };
  }

  /**
   * Start the mock server.
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.controller = new AbortController();

    Deno.serve({
      port: this.port,
      signal: this.controller.signal,
      onListen: () => {
        if (this.debug) {
          console.error(`[MockCloudServer] Listening on port ${this.port}`);
        }
      },
    }, (req) => this.handleRequest(req));

    this.running = true;

    // Give server time to start
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  /**
   * Stop the mock server.
   */
  shutdown(): void {
    if (!this.running) {
      return;
    }

    this.controller?.abort();
    this.controller = null;
    this.running = false;

    if (this.debug) {
      console.error("[MockCloudServer] Shutdown");
    }
  }

  /**
   * Check if server is running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get server URL.
   */
  getUrl(): string {
    return `http://localhost:${this.port}`;
  }

  /**
   * Set mock response for /mcp/{fqdn} endpoint.
   */
  setMcpResponse(fqdn: string, response: MockCapabilityResponse): void {
    this.mcpResponses.set(fqdn, response);
  }

  /**
   * Set mock response for /mcp/tools/call endpoint.
   */
  setToolResponse(toolName: string, response: MockToolResponse): void {
    this.toolResponses.set(toolName, response);
  }

  /**
   * Set routing config.
   */
  setRoutingConfig(config: MockRoutingConfig): void {
    this.routingConfig = config;
  }

  /**
   * Simulate hash mismatch for integrity tests.
   *
   * Sets the integrity hash to a different value than what might be in lockfile.
   */
  simulateHashMismatch(fqdn: string, newHash: string): void {
    const existing = this.mcpResponses.get(fqdn);
    if (existing) {
      existing.integrity = newHash;
    } else {
      this.mcpResponses.set(fqdn, { integrity: newHash });
    }
  }

  /**
   * Simulate server offline (stops accepting connections).
   */
  simulateOffline(): void {
    this.shutdown();
  }

  /**
   * Get request history for assertions.
   */
  getRequestHistory(): typeof this.requestHistory {
    return [...this.requestHistory];
  }

  /**
   * Clear request history.
   */
  clearRequestHistory(): void {
    this.requestHistory.length = 0;
  }

  /**
   * Get requests to a specific path.
   */
  getRequestsTo(pathPattern: string | RegExp): typeof this.requestHistory {
    return this.requestHistory.filter((r) => {
      if (typeof pathPattern === "string") {
        return r.path.includes(pathPattern);
      }
      return pathPattern.test(r.path);
    });
  }

  /**
   * Handle incoming HTTP request.
   */
  private async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // Record request
    let body: unknown;
    if (method === "POST" || method === "PUT") {
      try {
        body = await req.clone().json();
      } catch {
        // Ignore parse errors
      }
    }

    this.requestHistory.push({
      method,
      path,
      body,
      timestamp: Date.now(),
    });

    if (this.debug) {
      console.error(`[MockCloudServer] ${method} ${path}`);
    }

    // Route to appropriate handler
    if (path.startsWith("/mcp/tools/call")) {
      return this.handleToolsCall(req);
    }

    if (path.startsWith("/mcp/")) {
      return this.handleMcpRegistry(path);
    }

    if (path.startsWith("/code/")) {
      return this.handleCodeRequest(path);
    }

    if (path === "/api/routing" || path === "/routing") {
      return this.handleRoutingConfig();
    }

    // 404 for unknown paths
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  /**
   * Handle /mcp/{fqdn} registry requests.
   *
   * Returns metadata in the format expected by RegistryClient.validateMetadata():
   * - fqdn: string
   * - type: "deno"
   * - codeUrl: string
   * - tools: string[]
   * - routing: "client" | "server"
   * - description?: string
   * - mcpDeps?: array
   */
  private handleMcpRegistry(path: string): Response {
    // Extract FQDN from path: /mcp/casys.pml.filesystem.read_file
    const fqdn = path.replace("/mcp/", "");

    // Check for mock response
    const mockResponse = this.mcpResponses.get(fqdn);

    if (mockResponse?.error) {
      return new Response(
        JSON.stringify({ error: mockResponse.error }),
        {
          status: mockResponse.error.code >= 400 ? mockResponse.error.code : 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Extract tool name from FQDN (last segment)
    const toolName = fqdn.split(".").pop() ?? fqdn;

    // Build response in the format expected by RegistryClient
    // The registry returns metadata directly at the root level
    const response = {
      fqdn: mockResponse?.fqdn ?? fqdn,
      type: mockResponse?.type ?? "deno",
      codeUrl: mockResponse?.codeUrl ?? `http://localhost:${this.port}/code/${fqdn}.ts`,
      tools: mockResponse?.tools ?? [toolName],
      routing: mockResponse?.routing ?? "client",
      description: mockResponse?.description ?? `Mock capability: ${fqdn}`,
      mcpDeps: mockResponse?.mcpDeps,
      integrity: mockResponse?.integrity,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  /**
   * Handle /code/{fqdn}.ts code requests.
   *
   * Returns raw TypeScript code for the capability.
   * Note: Sandbox expects function BODY, not ES module with export.
   */
  private handleCodeRequest(path: string): Response {
    // Extract FQDN from path: /code/casys.pml.json.parse.ts
    const fqdn = path.replace("/code/", "").replace(".ts", "");

    // Check for mock response
    const mockResponse = this.mcpResponses.get(fqdn);

    // Note: Code should be function body format (not ES module with export)
    // The sandbox wraps it with: new AsyncFunction("mcp", "args", code)
    const code = mockResponse?.code ??
      `// Mock capability code for ${fqdn}\nreturn { mock: true, fqdn: "${fqdn}", args };`;

    return new Response(code, {
      status: 200,
      headers: { "Content-Type": "text/typescript" },
    });
  }

  /**
   * Handle /mcp/tools/call requests.
   */
  private async handleToolsCall(req: Request): Promise<Response> {
    let body: {
      jsonrpc: string;
      id: string | number;
      method: string;
      params: { name: string; arguments?: unknown };
    };

    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const toolName = body.params?.name;
    const mockResponse = this.toolResponses.get(toolName);

    // Apply delay if configured
    if (mockResponse?.delayMs) {
      await new Promise((resolve) =>
        setTimeout(resolve, mockResponse.delayMs)
      );
    }

    // Check for error response
    if (mockResponse?.error) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          error: mockResponse.error,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Build success response
    const result = mockResponse?.result ?? {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            mock: true,
            tool: toolName,
            args: body.params?.arguments,
          }),
        },
      ],
    };

    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  /**
   * Handle /api/routing requests.
   */
  private handleRoutingConfig(): Response {
    return new Response(JSON.stringify(this.routingConfig), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Create and start a mock cloud server.
 *
 * Convenience function for tests.
 */
export async function createMockServer(
  options: MockCloudServerOptions = {},
): Promise<MockCloudServer> {
  const server = new MockCloudServer(options);
  await server.start();
  return server;
}
