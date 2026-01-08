/**
 * Stdio Simulator
 *
 * Simulates Claude Code interaction with PML via stdio.
 * Spawns `pml stdio` as subprocess and communicates via JSON-RPC.
 *
 * Story 14.8: E2E Integration Testing
 *
 * @module tests/e2e/stdio-simulator
 */

import type { E2ETestContext } from "./test-harness.ts";

/**
 * JSON-RPC request structure.
 */
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

/**
 * JSON-RPC response structure.
 */
interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Tool call result from MCP.
 */
export interface ToolCallResult {
  /** Whether the call succeeded */
  success: boolean;
  /** Result content (if success) */
  content?: string;
  /** Parsed JSON content (if applicable) */
  data?: unknown;
  /** Error message (if failed) */
  error?: string;
  /** Error code (if failed) */
  errorCode?: number;
  /** Whether approval is required */
  approvalRequired?: boolean;
  /** Approval type (dependency, api_key_required, integrity) */
  approvalType?: string;
  /** Workflow ID for continue_workflow */
  workflowId?: string;
  /** Raw response for debugging */
  raw?: JsonRpcResponse;
}

/**
 * Continue workflow parameters.
 */
export interface ContinueWorkflowParams {
  workflowId: string;
  approved: boolean;
  always?: boolean;
}

/**
 * Metrics from stdio simulator.
 */
export interface StdioMetrics {
  /** Number of requests sent */
  requestsSent: number;
  /** Number of responses received */
  responsesReceived: number;
  /** Number of errors */
  errors: number;
  /** Whether process is running */
  running: boolean;
}

/**
 * Options for StdioSimulator.
 */
export interface StdioSimulatorOptions {
  /** Timeout for responses (ms) */
  responseTimeoutMs?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Path to pml binary (default: uses deno task) */
  pmlPath?: string;
  /** Additional environment variables */
  envVars?: Record<string, string>;
}

/**
 * Stdio simulator for E2E tests.
 *
 * Spawns pml stdio subprocess and provides methods to send
 * JSON-RPC requests and receive responses.
 */
export class StdioSimulator {
  private readonly ctx: E2ETestContext;
  private readonly options: Required<StdioSimulatorOptions>;
  private process: Deno.ChildProcess | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private requestId = 0;
  private readonly pendingRequests = new Map<
    string | number,
    {
      resolve: (response: JsonRpcResponse) => void;
      reject: (error: Error) => void;
      timeout: number;
    }
  >();
  private responseBuffer = "";
  private running = false;
  private readonly metrics: StdioMetrics = {
    requestsSent: 0,
    responsesReceived: 0,
    errors: 0,
    running: false,
  };

  constructor(ctx: E2ETestContext, options: StdioSimulatorOptions = {}) {
    this.ctx = ctx;
    this.options = {
      responseTimeoutMs: options.responseTimeoutMs ?? 10000,
      debug: options.debug ?? false,
      pmlPath: options.pmlPath ?? "",
      envVars: options.envVars ?? {},
    };
  }

  /**
   * Start the pml stdio subprocess.
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    // Build environment
    const env: Record<string, string> = {
      ...Deno.env.toObject(),
      PML_WORKSPACE: this.ctx.workspace,
      ...this.ctx.envVars,
      ...this.options.envVars,
    };

    // Spawn pml stdio process
    // Use deno task if no custom path
    const command = new Deno.Command("deno", {
      args: [
        "run",
        "--allow-all",
        "--unstable-worker-options",
        "--unstable-broadcast-channel",
        "packages/pml/src/cli/main.ts",
        "stdio",
      ],
      cwd: this.findProjectRoot(),
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
      env,
    });

    this.process = command.spawn();
    this.writer = this.process.stdin.getWriter();
    this.reader = this.process.stdout.getReader();
    this.running = true;
    this.metrics.running = true;

    // Start reading responses
    this.readResponses();

    // Read stderr for debugging
    if (this.options.debug) {
      this.readStderr();
    }

    // Wait for process to be ready
    await this.waitForReady();

    this.log("Started pml stdio subprocess");
  }

  /**
   * Stop the subprocess.
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;
    this.metrics.running = false;

    // Cancel pending requests
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error("Simulator stopped"));
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(id);
    }

    // Close streams
    try {
      await this.writer?.close();
    } catch {
      // Ignore close errors
    }

    try {
      this.reader?.cancel();
    } catch {
      // Ignore cancel errors
    }

    // Kill process
    try {
      this.process?.kill("SIGTERM");
    } catch {
      // Process may already be dead
    }

    this.process = null;
    this.writer = null;
    this.reader = null;

    this.log("Stopped pml stdio subprocess");
  }

  /**
   * Send initialize request.
   */
  async initialize(): Promise<JsonRpcResponse> {
    return this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "e2e-test", version: "0.1.0" },
    });
  }

  /**
   * Send initialized notification.
   */
  async sendInitialized(): Promise<void> {
    await this.sendNotification("initialized", {});
  }

  /**
   * Call a tool via MCP.
   */
  async callTool(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<ToolCallResult> {
    const response = await this.sendRequest("tools/call", {
      name,
      arguments: args ?? {},
    });

    return this.parseToolResponse(response);
  }

  /**
   * Call a tool with continue_workflow for approval flow.
   */
  async continueWorkflow(
    params: ContinueWorkflowParams,
    toolName: string,
    toolArgs?: Record<string, unknown>,
  ): Promise<ToolCallResult> {
    const response = await this.sendRequest("tools/call", {
      name: toolName,
      arguments: {
        ...toolArgs,
        continue_workflow: {
          workflow_id: params.workflowId,
          approved: params.approved,
          always: params.always,
        },
      },
    });

    return this.parseToolResponse(response);
  }

  /**
   * List available tools.
   */
  async listTools(): Promise<unknown[]> {
    const response = await this.sendRequest("tools/list", {});
    return (response.result as { tools?: unknown[] })?.tools ?? [];
  }

  /**
   * Get current metrics.
   */
  getMetrics(): StdioMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if simulator is running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Send a JSON-RPC request and wait for response.
   */
  private async sendRequest(
    method: string,
    params: unknown,
  ): Promise<JsonRpcResponse> {
    if (!this.running || !this.writer) {
      throw new Error("Simulator not running");
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    // Create promise for response
    const responsePromise = new Promise<JsonRpcResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        this.metrics.errors++;
        reject(new Error(`Request timeout: ${method} (id: ${id})`));
      }, this.options.responseTimeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timeout });
    });

    // Send request
    const json = JSON.stringify(request) + "\n";
    await this.writer.write(new TextEncoder().encode(json));
    this.metrics.requestsSent++;

    this.log(`→ ${method} (id: ${id})`);

    return responsePromise;
  }

  /**
   * Send a JSON-RPC notification (no response expected).
   */
  private async sendNotification(method: string, params: unknown): Promise<void> {
    if (!this.running || !this.writer) {
      throw new Error("Simulator not running");
    }

    const notification = {
      jsonrpc: "2.0",
      method,
      params,
    };

    const json = JSON.stringify(notification) + "\n";
    await this.writer.write(new TextEncoder().encode(json));
    this.metrics.requestsSent++;

    this.log(`→ ${method} (notification)`);
  }

  /**
   * Read responses from stdout.
   */
  private async readResponses(): Promise<void> {
    if (!this.reader) return;

    const decoder = new TextDecoder();

    try {
      while (this.running) {
        const { value, done } = await this.reader.read();
        if (done) break;

        this.responseBuffer += decoder.decode(value);

        // Process complete lines
        let newlineIndex: number;
        while ((newlineIndex = this.responseBuffer.indexOf("\n")) !== -1) {
          const line = this.responseBuffer.slice(0, newlineIndex).trim();
          this.responseBuffer = this.responseBuffer.slice(newlineIndex + 1);

          if (line) {
            this.handleResponse(line);
          }
        }
      }
    } catch (error) {
      if (this.running) {
        this.log(`Read error: ${error}`);
        this.metrics.errors++;
      }
    }
  }

  /**
   * Handle a response line.
   */
  private handleResponse(line: string): void {
    try {
      const response = JSON.parse(line) as JsonRpcResponse;
      this.metrics.responsesReceived++;

      this.log(`← response (id: ${response.id})`);

      const pending = this.pendingRequests.get(response.id!);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(response.id!);
        pending.resolve(response);
      }
    } catch (error) {
      this.log(`Parse error: ${error}`);
      this.metrics.errors++;
    }
  }

  /**
   * Read stderr for debugging.
   */
  private async readStderr(): Promise<void> {
    if (!this.process) return;

    const decoder = new TextDecoder();
    const reader = this.process.stderr.getReader();

    try {
      while (this.running) {
        const { value, done } = await reader.read();
        if (done) break;
        console.error(`[pml stderr] ${decoder.decode(value)}`);
      }
    } catch {
      // Ignore read errors on shutdown
    }
  }

  /**
   * Wait for process to be ready.
   */
  private async waitForReady(): Promise<void> {
    // Send initialize and wait for response
    const response = await this.initialize();

    if (response.error) {
      throw new Error(`Initialize failed: ${response.error.message}`);
    }

    // Send initialized notification
    await this.sendInitialized();

    // Small delay to ensure process is fully ready
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  /**
   * Parse tool response into ToolCallResult.
   */
  private parseToolResponse(response: JsonRpcResponse): ToolCallResult {
    if (response.error) {
      return {
        success: false,
        error: response.error.message,
        errorCode: response.error.code,
        raw: response,
      };
    }

    const result = response.result as {
      content?: Array<{ type: string; text: string }>;
    };
    const contentText = result?.content?.[0]?.text ?? "";

    // Try to parse as JSON
    let data: unknown;
    try {
      data = JSON.parse(contentText);
    } catch {
      data = contentText;
    }

    // Check for approval_required
    if (
      typeof data === "object" &&
      data !== null &&
      "status" in data &&
      (data as Record<string, unknown>).status === "approval_required"
    ) {
      const approvalData = data as {
        approval_type: string;
        workflow_id: string;
        context?: unknown;
        description?: string;
      };

      return {
        success: false,
        approvalRequired: true,
        approvalType: approvalData.approval_type,
        workflowId: approvalData.workflow_id,
        data: approvalData,
        raw: response,
      };
    }

    return {
      success: true,
      content: contentText,
      data,
      raw: response,
    };
  }

  /**
   * Find project root directory.
   */
  private findProjectRoot(): string {
    // Walk up from current directory to find deno.json
    let dir = Deno.cwd();
    while (dir !== "/") {
      try {
        Deno.statSync(`${dir}/deno.json`);
        // Check if packages/pml exists
        Deno.statSync(`${dir}/packages/pml`);
        return dir;
      } catch {
        dir = dir.substring(0, dir.lastIndexOf("/"));
      }
    }
    return Deno.cwd();
  }

  /**
   * Log debug message.
   */
  private log(message: string): void {
    if (this.options.debug) {
      console.error(`[StdioSimulator] ${message}`);
    }
  }
}
