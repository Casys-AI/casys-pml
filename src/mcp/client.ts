/**
 * MCP Protocol Client
 *
 * Handles MCP communication via stdio transport
 *
 * @module mcp/client
 */

import * as log from "@std/log";
import { MCPServer, MCPTool, ServerDiscoveryResult } from "./types.ts";

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

  constructor(server: MCPServer, timeoutMs: number = 10000) {
    this.server = server;
    this.timeout = timeoutMs;
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
        throw new Error("Failed to initialize stdio streams");
      }
      this.writer = this.process.stdin.getWriter();
      this.reader = this.process.stdout.getReader();

      // Send initialize request
      await this.sendInitializeRequest();

      log.debug(`Connected to ${this.server.id}`);
    } catch (error) {
      log.error(`Failed to connect to ${this.server.id}: ${error}`);
      throw new Error(
        `Connection failed for ${this.server.id}: ${error}`,
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
          name: "agentcards",
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
        throw new Error(
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
      throw error;
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
