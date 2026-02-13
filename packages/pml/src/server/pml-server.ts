/**
 * PML Server
 *
 * Composes ConcurrentMCPServer to provide PML-specific MCP server.
 * Handles tool registration, routing, and exposed capabilities.
 * Used by both serve-command (HTTP) and stdio-command (stdio).
 *
 * @module server/pml-server
 */

import { ConcurrentMCPServer } from "@casys/mcp-server";
import type { PmlContext } from "./pml-context.ts";
import { PendingWorkflowStore } from "../workflow/mod.ts";
import { reloadEnv } from "../byok/env-loader.ts";
import type { Logger } from "../cli/shared/types.ts";
import {
  PML_TOOLS,
  PML_TOOLS_FULL,
  PACKAGE_VERSION,
  forwardToCloud,
  extractContinueWorkflow,
  parseExecuteLocallyResponse,
  executeLocalCode,
  buildMcpLocalResult,
  buildExposedToolDefinitions,
  handleExposedCall,
} from "../cli/shared/mod.ts";

/**
 * Configuration for PmlServer.
 */
export interface PmlServerConfig {
  /** Use full tool descriptions (stdio mode) vs compact (serve mode) */
  useFullDescriptions: boolean;
  /** Logger for server operations */
  logger: Logger;
}

/**
 * PmlServer composes ConcurrentMCPServer with PML business logic.
 *
 * Handles:
 * - PML meta-tools (discover, execute, admin, abort, replan)
 * - Exposed capability tools (--expose flag)
 * - MCP Apps resources
 * - Hybrid routing (cloud + local execution)
 * - HIL approval workflows
 */
export class PmlServer {
  private server: ConcurrentMCPServer;
  private pendingWorkflowStore = new PendingWorkflowStore();
  private context: PmlContext;
  private config: PmlServerConfig;

  constructor(config: PmlServerConfig, context: PmlContext) {
    this.config = config;
    this.context = context;

    this.server = new ConcurrentMCPServer({
      name: "pml",
      version: PACKAGE_VERSION,
      maxConcurrent: 10,
      backpressureStrategy: "queue",
      logger: (msg) => config.logger.debug(`[server] ${msg}`),
    });

    this.registerTools();
  }

  /**
   * Get the pending workflow store (for external access if needed).
   */
  getPendingWorkflowStore(): PendingWorkflowStore {
    return this.pendingWorkflowStore;
  }

  /**
   * Register all PML tools and exposed capabilities with ConcurrentMCPServer.
   */
  private registerTools(): void {
    const toolDefs = this.config.useFullDescriptions ? PML_TOOLS_FULL : PML_TOOLS;

    // Register PML meta-tools (skip in --only mode)
    for (const tool of toolDefs) {
      if (this.context.onlyMode) continue;
      this.server.registerTool(tool, (args) => this.handleTool(tool.name, args));
    }

    // Register exposed capability tools (--expose flag)
    if (this.context.exposedCapabilities.length > 0) {
      const exposedTools = buildExposedToolDefinitions(this.context.exposedCapabilities);
      for (const tool of exposedTools) {
        this.server.registerTool(tool, (args) => this.handleExposed(tool.name, args));
      }
    }
  }

  /**
   * Handle a PML meta-tool call.
   * Returns pre-formatted MCP result (content[] + optional _meta).
   */
  private async handleTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // discover, admin, abort, replan → always forward to cloud
    if (name === "discover" || name === "admin" || name === "abort" || name === "replan") {
      return this.forwardToolToCloud(name, args);
    }

    // execute → hybrid routing
    if (name === "execute") {
      return this.handleExecute(args);
    }

    // Unknown tool — forward to cloud as fallback
    return this.forwardToolToCloud(name, args);
  }

  /**
   * Forward a tool call to cloud and return pre-formatted MCP result.
   */
  private async forwardToolToCloud(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { cloudUrl, sessionClient } = this.context;
    const cloudResult = await forwardToCloud(0, name, args, cloudUrl, sessionClient);

    if (!cloudResult.ok) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: cloudResult.error ?? "Cloud call failed" }) }],
      };
    }

    // Extract the result from cloud response
    const response = cloudResult.response as { result?: Record<string, unknown> };
    if (response?.result) {
      return response.result;
    }

    return {
      content: [{ type: "text", text: JSON.stringify(cloudResult.response) }],
    };
  }

  /**
   * Handle the execute tool with hybrid routing.
   *
   * Flow:
   * 1. Extract continue_workflow from args
   * 2. If continue_workflow → check pendingWorkflowStore → re-execute locally
   * 3. Forward to cloud
   * 4. Check for execute_locally response
   * 5. If execute_locally → run code locally
   * 6. Otherwise return cloud response
   */
  private async handleExecute(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { cloudUrl, sessionClient, loader } = this.context;
    const { continueWorkflow, cleanArgs } = extractContinueWorkflow(args);
    const logger = this.config.logger;

    // Handle continue_workflow for local pending workflows
    if (continueWorkflow?.workflowId) {
      const pending = this.pendingWorkflowStore.get(continueWorkflow.workflowId);

      if (pending) {
        logger.debug(`Continuing workflow: ${continueWorkflow.workflowId.slice(0, 8)} (type=${pending.approvalType})`);

        if (!continueWorkflow.approved) {
          this.pendingWorkflowStore.delete(continueWorkflow.workflowId);
          return {
            content: [{ type: "text", text: JSON.stringify({ status: "aborted", reason: "User rejected approval" }) }],
          };
        }

        // Pre-continuation actions based on approval type
        await this.handlePreContinuationAction(pending);

        const fqdnMap = new Map(Object.entries(pending.fqdnMap ?? {}));
        const result = await executeLocalCode(
          pending.code,
          loader,
          cloudUrl,
          fqdnMap,
          { approved: true, workflowId: continueWorkflow.workflowId },
          logger,
          undefined,
          pending.dagTasks,
        );
        this.pendingWorkflowStore.delete(continueWorkflow.workflowId);

        return buildMcpLocalResult(result, {
          code: pending.code,
          fqdnMap: pending.fqdnMap ?? {},
          pendingWorkflowStore: this.pendingWorkflowStore,
          dagTasks: pending.dagTasks,
        }, true, undefined, continueWorkflow.workflowId);
      }
    }

    // Forward to cloud
    const cloudResult = await forwardToCloud(0, "execute", cleanArgs || {}, cloudUrl, sessionClient);

    if (!cloudResult.ok) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: cloudResult.error ?? "Cloud call failed" }) }],
      };
    }

    // Check for execute_locally response
    const response = cloudResult.response as { result?: { content?: Array<{ type: string; text: string }> } };
    const content = response?.result?.content?.[0]?.text;

    if (content) {
      const execLocally = parseExecuteLocallyResponse(content);

      if (execLocally) {
        logger.debug(`execute_locally received - client tools: ${execLocally.client_tools.join(", ")}`);

        const fqdnMap = new Map(execLocally.tools_used.map((t) => [t.id, t.fqdn]));

        const localResult = await executeLocalCode(
          execLocally.code,
          loader,
          cloudUrl,
          fqdnMap,
          continueWorkflow,
          logger,
          execLocally.workflowId,
          execLocally.dag?.tasks,
        );

        return buildMcpLocalResult(localResult, {
          code: execLocally.code,
          fqdnMap: Object.fromEntries(fqdnMap),
          pendingWorkflowStore: this.pendingWorkflowStore,
          dagTasks: execLocally.dag?.tasks,
        }, true, execLocally.ui_orchestration, execLocally.workflowId);
      }
    }

    // Return cloud response as-is
    if (response?.result) {
      return response.result;
    }

    return {
      content: [{ type: "text", text: JSON.stringify(cloudResult.response) }],
    };
  }

  /**
   * Handle pre-continuation actions based on approval type.
   */
  // deno-lint-ignore no-explicit-any
  private async handlePreContinuationAction(pending: any): Promise<void> {
    const { loader, workspace } = this.context;

    switch (pending.approvalType) {
      case "tool_permission":
        if (loader && pending.toolId) {
          loader.approveToolForSession(pending.toolId);
        }
        break;
      case "api_key_required":
        await reloadEnv(workspace);
        break;
      case "integrity":
        if (loader) {
          const integrityTarget = pending.integrityInfo?.fqdnBase ?? pending.toolId;
          await loader.approveIntegrityForSession(integrityTarget);
        }
        break;
      case "oauth_connect":
        // User completed OAuth flow externally, reload .env for new tokens
        await reloadEnv(workspace);
        break;
      case "dependency":
        // Proceed with dependency installation
        break;
    }
  }

  /**
   * Handle an exposed capability tool call.
   */
  private async handleExposed(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const result = await handleExposedCall(name, {
      id: 0,
      args,
      exposedCapabilities: this.context.exposedCapabilities,
      loader: this.context.loader,
      cloudUrl: this.context.cloudUrl,
      sessionClient: this.context.sessionClient,
      pendingWorkflowStore: this.pendingWorkflowStore,
      logger: this.config.logger,
    });

    if (result.handled && result.response) {
      // Extract the result from the JSON-RPC response
      const rpcResponse = result.response as { result?: Record<string, unknown> };
      if (rpcResponse.result) {
        return rpcResponse.result;
      }
    }

    return {
      content: [{ type: "text", text: JSON.stringify({ error: "Exposed capability call failed" }) }],
    };
  }

  /**
   * Start the server in stdio mode.
   * Reads JSON-RPC from stdin, writes to stdout.
   */
  async start(): Promise<void> {
    await this.server.start();
  }

  /**
   * Start the server in HTTP mode.
   */
  async startHttp(port: number): Promise<{ shutdown: () => Promise<void> }> {
    const result = await this.server.startHttp({
      port,
      cors: true,
      corsOrigins: "*",
    });
    return { shutdown: result.shutdown };
  }

  /**
   * Send a notification to the connected client.
   * For stdio: writes to stdout. For HTTP: broadcasts via SSE.
   */
  sendNotification(level: "debug" | "info" | "warning" | "error", message: string): void {
    this.server.sendNotification("notifications/message", {
      level,
      logger: "pml",
      data: message,
    });
  }

  /**
   * Register a UI resource fetched during discovery.
   *
   * Called after MCP discovery to populate resources/read with Tool UI HTML.
   * The composite generator references these via ui:// URIs in iframe src.
   *
   * @param resourceUri - UI resource URI (e.g., "ui://mcp-std/chart-viewer")
   * @param htmlContent - The HTML content to serve
   * @param mimeType - MIME type (default: "text/html")
   */
  registerUiResource(resourceUri: string, htmlContent: string, mimeType = "text/html"): void {
    try {
      // Extract a human-readable name from the URI (e.g., "chart-viewer" from "ui://mcp-std/chart-viewer")
      const name = resourceUri.split("/").pop() ?? resourceUri;

      this.server.registerResource(
        { uri: resourceUri, name, description: `Tool UI: ${name}` },
        () => ({
          uri: resourceUri,
          mimeType,
          text: htmlContent,
        }),
      );
    } catch (error) {
      // Duplicate URI — already registered (e.g., multiple servers expose same UI)
      this.config.logger.debug?.(
        `[pml-server] UI resource already registered: ${resourceUri}`,
      );
    }
  }

  /**
   * Register callback for "initialized" notification (post-handshake).
   */
  onInitialized(callback: () => void): void {
    this.server.onInitialized(callback);
  }

  /**
   * Shutdown the server and all services.
   */
  async shutdown(): Promise<void> {
    await this.server.stop();
  }
}
