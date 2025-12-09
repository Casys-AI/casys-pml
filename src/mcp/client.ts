/**
 * MCP Protocol Client
 *
 * Handles MCP communication via stdio transport
 *
 * @module mcp/client
 */

import * as log from "@std/log";
import { MCPServer, MCPTool, ServerDiscoveryResult } from "./types.ts";
import { MCPServerError, TimeoutError } from "../errors/error-types.ts";
import { withTimeout } from "../utils/timeout.ts";

interface JSONRPCResponse {
  jsonrpc: string;
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

/**
 * MCP Client for stdio communication
 *
 * Implements basic MCP protocol:
 * - Initialize connection
 * - Send list_tools request
 * - Parse tool schemas
 * - Handle errors and timeouts
 */
export class MCPClient {
  private server: MCPServer;
  private process: Deno.ChildProcess | null = null;
  private requestId: number = 1;
  private timeout: number;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private stderrReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private stderrRunning: boolean = false;

  constructor(server: MCPServer, timeoutMs: number = 10000) {
    this.server = server;
    this.timeout = timeoutMs;
  }

  /**
   * Get server ID
   */
  get serverId(): string {
    return this.server.id;
  }

  /**
   * Get server name
   */
  get serverName(): string {
    return this.server.name;
  }

  /**
   * Connect to MCP server via stdio
   */
  async connect(): Promise<void> {
    try {
      log.debug(`Connecting to MCP server: ${this.server.id}`);

      // Start subprocess
      this.process = new Deno.Command(this.server.command, {
        args: this.server.args || [],
        env: this.server.env,
        stdin: "piped",
        stdout: "piped",
        stderr: "piped",
      }).spawn();

      // Initialize persistent streams
      if (!this.process.stdin || !this.process.stdout) {
        throw new MCPServerError(
          this.server.id,
          "Failed to initialize stdio streams",
        );
      }
      this.writer = this.process.stdin.getWriter();
      this.reader = this.process.stdout.getReader();

      // Start reading stderr in background (ADR-012)
      if (this.process.stderr) {
        this.stderrReader = this.process.stderr.getReader();
        this.readStderr();
      }

      // Send initialize request with timeout
      await withTimeout(
        this.sendInitializeRequest(),
        this.timeout,
        `MCP initialize for ${this.server.id}`,
      );

      log.debug(`Connected to ${this.server.id}`);
    } catch (error) {
      log.error(`Failed to connect to ${this.server.id}: ${error}`);

      if (error instanceof MCPServerError || error instanceof TimeoutError) {
        throw error; // Re-throw our custom errors
      }

      throw new MCPServerError(
        this.server.id,
        `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Send MCP initialize request
   *
   * Initializes the MCP protocol session
   */
  private async sendInitializeRequest(): Promise<void> {
    const initRequest = {
      jsonrpc: "2.0",
      id: this.requestId++,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "cai",
          version: "0.1.0",
        },
      },
    };

    const response = await this.sendRequest(initRequest);

    if (response.error) {
      throw new Error(
        `Initialize failed: ${response.error.message}`,
      );
    }

    log.debug(`Initialize response received for ${this.server.id}`);
  }

  /**
   * Read stderr from MCP server process in background (ADR-012)
   *
   * Logs stderr output from child MCP servers to our logger,
   * making them visible in Grafana/Loki.
   */
  private async readStderr(): Promise<void> {
    if (!this.stderrReader || this.stderrRunning) return;

    this.stderrRunning = true;
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (this.stderrRunning) {
        const { done, value } = await this.stderrReader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            log.info(`[${this.server.id}:stderr] ${line}`);
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        log.info(`[${this.server.id}:stderr] ${buffer}`);
      }
    } catch (error) {
      // Ignore errors when process is closing
      if (this.stderrRunning) {
        log.debug(`stderr reader error for ${this.server.id}: ${error}`);
      }
    } finally {
      this.stderrRunning = false;
    }
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<MCPTool[]> {
    try {
      const listRequest = {
        jsonrpc: "2.0",
        id: this.requestId++,
        method: "tools/list",
        params: {},
      };

      const response = await this.sendRequest(listRequest);

      if (response.error) {
        throw new MCPServerError(
          this.server.id,
          `list_tools failed: ${response.error.message}`,
        );
      }

      const tools = this.parseToolsResponse(
        response.result as Record<string, unknown> || {},
      );
      log.debug(
        `Extracted ${tools.length} tools from ${this.server.id}`,
      );

      return tools;
    } catch (error) {
      log.error(
        `Failed to list tools from ${this.server.id}: ${error}`,
      );

      if (error instanceof MCPServerError || error instanceof TimeoutError) {
        throw error;
      }

      throw new MCPServerError(
        this.server.id,
        `Failed to list tools: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Send a JSON-RPC request and wait for response
   *
   * Implements timeout and error handling
   */
  private async sendRequest(
    request: Record<string, unknown>,
  ): Promise<JSONRPCResponse> {
    if (!this.writer || !this.reader) {
      throw new Error("Streams not initialized");
    }

    return new Promise(async (resolve, reject) => {
      // Set timeout
      const timeoutId = setTimeout(() => {
        reject(new Error(`Request timeout (${this.timeout}ms)`));
      }, this.timeout);

      try {
        // Send request
        const encoder = new TextEncoder();
        const message = JSON.stringify(request) + "\n";
        log.debug(`[${this.server.id}:stdout] → ${JSON.stringify(request)}`);
        await this.writer!.write(encoder.encode(message));

        // Read response
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await this.reader!.read();

          if (done) {
            reject(new Error("Stream closed unexpectedly"));
            return;
          }

          buffer += decoder.decode(value, { stream: true });

          // Check if we have a complete JSON object
          const lines = buffer.split("\n");
          for (const line of lines.slice(0, -1)) {
            if (line.trim()) {
              try {
                const response = JSON.parse(line) as JSONRPCResponse;
                log.debug(
                  `[${this.server.id}:stdout] ← ${line.substring(0, 500)}${
                    line.length > 500 ? "..." : ""
                  }`,
                );
                clearTimeout(timeoutId);
                resolve(response);
                return;
              } catch {
                // Not valid JSON yet, continue reading
              }
            }
          }
          buffer = lines[lines.length - 1];
        }
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Parse tools/list response
   */
  private parseToolsResponse(
    result: Record<string, unknown>,
  ): MCPTool[] {
    if (!result || !Array.isArray(result.tools)) {
      return [];
    }

    return (result.tools as Array<Record<string, unknown>>).map((tool) => ({
      name: String(tool.name || ""),
      description: String(tool.description || ""),
      inputSchema: tool.inputSchema as Record<string, unknown> || {},
      outputSchema: tool.outputSchema as Record<string, unknown> | undefined,
    }));
  }

  /**
   * Call a tool on the MCP server
   *
   * @param toolName - Name of the tool to call
   * @param args - Tool arguments
   * @returns Tool execution result
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      const callRequest = {
        jsonrpc: "2.0",
        id: this.requestId++,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args,
        },
      };

      const response = await this.sendRequest(callRequest);

      if (response.error) {
        throw new MCPServerError(
          this.server.id,
          `tools/call failed for ${toolName}: ${response.error.message}`,
        );
      }

      return response.result;
    } catch (error) {
      log.error(
        `Failed to call tool ${toolName} on ${this.server.id}: ${error}`,
      );

      if (error instanceof MCPServerError || error instanceof TimeoutError) {
        throw error;
      }

      throw new MCPServerError(
        this.server.id,
        `Failed to call tool ${toolName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Alias for close() to maintain backward compatibility
   */
  async disconnect(): Promise<void> {
    await this.close();
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    // Release streams
    if (this.reader) {
      try {
        this.reader.releaseLock();
      } catch {
        // Stream already released
      }
      this.reader = null;
    }

    if (this.writer) {
      try {
        this.writer.releaseLock();
      } catch {
        // Stream already released
      }
      this.writer = null;
    }

    // Stop stderr reader (ADR-012)
    this.stderrRunning = false;
    if (this.stderrReader) {
      try {
        this.stderrReader.releaseLock();
      } catch {
        // Stream already released
      }
      this.stderrReader = null;
    }

    // Kill process
    if (this.process) {
      try {
        this.process.kill();
        await this.process.status;
      } catch {
        // Process already terminated
      }
      this.process = null;
    }

    log.debug(`Closed connection to ${this.server.id}`);
  }

  /**
   * Test connection and extract schemas
   *
   * Used by discovery workflow
   */
  async extractSchemas(
    _onProgress?: (message: string) => void,
  ): Promise<ServerDiscoveryResult> {
    const startTime = performance.now();

    try {
      await this.connect();

      const tools = await this.listTools();

      const duration = performance.now() - startTime;

      const result: ServerDiscoveryResult = {
        serverId: this.server.id,
        serverName: this.server.name,
        status: "success",
        toolsExtracted: tools.length,
        tools,
        connectionDuration: Math.round(duration),
      };

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;

      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout = errorMessage.includes("timeout") ||
        errorMessage.includes("Timeout");

      const result: ServerDiscoveryResult = {
        serverId: this.server.id,
        serverName: this.server.name,
        status: isTimeout ? "timeout" : "failed",
        toolsExtracted: 0,
        error: errorMessage,
        connectionDuration: Math.round(duration),
      };

      return result;
    } finally {
      await this.close();
    }
  }
}
