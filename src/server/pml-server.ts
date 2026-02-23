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
import type { CollectedUiResource } from "../types/ui-orchestration.ts";
import { buildCompositeUi, generateCompositeHtml } from "../ui/composite-generator.ts";

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
  private feedClients = new Set<ReadableStreamDefaultController>();

  constructor(config: PmlServerConfig, context: PmlContext) {
    this.config = config;
    this.context = context;

    this.server = new ConcurrentMCPServer({
      name: "pml",
      version: PACKAGE_VERSION,
      maxConcurrent: 10,
      backpressureStrategy: "queue",
      expectResources: true,
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
   * Create an onUiCollected callback that buffers events during execution.
   * After execution, call flushUiEvents() to emit either individual cards
   * or a single composite — never both.
   */
  private createUiCollector(): {
    onUiCollected: (ui: CollectedUiResource, parsedResult: unknown) => void;
    toolResults: Map<string, unknown>;
    bufferedEvents: Array<{ ui: CollectedUiResource; parsedResult: unknown }>;
  } {
    const toolResults = new Map<string, unknown>();
    const bufferedEvents: Array<{ ui: CollectedUiResource; parsedResult: unknown }> = [];
    const onUiCollected = (ui: CollectedUiResource, parsedResult: unknown) => {
      toolResults.set(ui.source, parsedResult);
      bufferedEvents.push({ ui, parsedResult });
    };
    return { onUiCollected, toolResults, bufferedEvents };
  }

  /**
   * After execution, emit either a composite (2+ UIs) or individual cards (0-1 UI).
   * Never emits both — no duplicate cards on the feed.
   */
  private flushUiEvents(
    collectedUi: CollectedUiResource[] | undefined,
    toolResults: Map<string, unknown>,
    bufferedEvents: Array<{ ui: CollectedUiResource; parsedResult: unknown }>,
    orchestration?: { layout?: string; sync?: unknown[] },
  ): void {
    if (collectedUi && collectedUi.length >= 2 && toolResults.size >= 2) {
      // Composite — single orchestrated card, no individual cards
      this.broadcastCompositeEvent(collectedUi, toolResults, orchestration);
    } else {
      // 0-1 UI — flush individual events
      for (const { ui, parsedResult } of bufferedEvents) {
        this.broadcastUiEvent(ui, parsedResult);
      }
    }
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

        const { onUiCollected, toolResults, bufferedEvents } = this.createUiCollector();
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
          onUiCollected,
        );
        this.pendingWorkflowStore.delete(continueWorkflow.workflowId);

        const mcpResult = buildMcpLocalResult(result, {
          code: pending.code,
          fqdnMap: pending.fqdnMap ?? {},
          pendingWorkflowStore: this.pendingWorkflowStore,
          dagTasks: pending.dagTasks,
        }, true, undefined, continueWorkflow.workflowId);

        if (result.status === "success") {
          this.flushUiEvents(result.collectedUi, toolResults, bufferedEvents);
        }
        return mcpResult;
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

        const { onUiCollected, toolResults, bufferedEvents } = this.createUiCollector();
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
          onUiCollected,
        );

        const mcpResult = buildMcpLocalResult(localResult, {
          code: execLocally.code,
          fqdnMap: Object.fromEntries(fqdnMap),
          pendingWorkflowStore: this.pendingWorkflowStore,
          dagTasks: execLocally.dag?.tasks,
        }, true, execLocally.ui_orchestration, execLocally.workflowId);

        if (localResult.status === "success") {
          this.flushUiEvents(localResult.collectedUi, toolResults, bufferedEvents, execLocally.ui_orchestration);
        }
        return mcpResult;
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
   * Broadcast a UI event to all connected SSE feed clients.
   * Called via onUiCollected callback when a tool returns _meta.ui.
   */
  private static encoder = new TextEncoder();

  private broadcastUiEvent(ui: CollectedUiResource, parsedResult: unknown): void {
    const event = {
      toolName: ui.source,
      result: parsedResult,
      resourceUri: ui.resourceUri,
      timestamp: new Date().toISOString(),
    };
    let msg: string;
    try {
      msg = `data: ${JSON.stringify(event)}\n\n`;
    } catch {
      msg = `data: ${JSON.stringify({ ...event, result: "[non-serializable]" })}\n\n`;
    }
    const encoded = PmlServer.encoder.encode(msg);
    for (const ctrl of this.feedClients) {
      try {
        ctrl.enqueue(encoded);
      } catch {
        this.feedClients.delete(ctrl);
      }
    }
  }

  /**
   * Regenerate a composite UI with grid layout for the feed, register it
   * as a temporary resource, and broadcast an SSE event.
   *
   * Regenerates (instead of reusing MCP result HTML) because:
   * - Feed needs grid layout (MCP protocol default is stack)
   * - iframe src must be /ui/ HTTP paths, not ui:// protocol URIs
   * - Child viewers need tool-result injection (MCP hosts do this, feed doesn't)
   */
  private broadcastCompositeEvent(
    collectedUi: CollectedUiResource[],
    toolResults: Map<string, unknown>,
    orchestration?: { layout?: string; sync?: unknown[] },
  ): void {
    // Regenerate composite — use capability orchestration if set, pick smart default
    const defaultLayout = collectedUi.length <= 2 ? "split" : "grid";
    const descriptor = buildCompositeUi(collectedUi, {
      layout: (orchestration?.layout as "split" | "tabs" | "grid" | "stack") ?? defaultLayout,
      sync: (orchestration?.sync ?? []) as { from: string; event: string; to: string; action: string }[],
    });
    let html = generateCompositeHtml(descriptor);

    // Rewrite ui:// protocol URIs to HTTP paths for browser iframe loading
    html = html.replace(/src="ui:\/\//g, 'src="/ui/');

    // Inject per-tool results so child viewers get their data on initialization.
    // The composite event bus defines getSlotBySource(), iframes, sendToolResult()
    // at script top-level — accessible from subsequent <script> tags.
    const resultsJson = JSON.stringify(Object.fromEntries(toolResults));
    const injectionScript = `<script>
(function() {
  const __results = ${resultsJson};
  const __done = new Set();
  window.addEventListener('message', function(ev) {
    var msg = ev.data;
    if (!msg || msg.jsonrpc !== '2.0') return;
    if (msg.method === 'ui/notifications/initialized') {
      var slot = getSlotBySource(ev.source);
      if (slot >= 0 && !__done.has(slot)) {
        __done.add(slot);
        var iframe = iframes.get(slot);
        if (iframe) {
          var src = iframe.dataset.source;
          if (src && __results[src] !== undefined) {
            sendToolResult(iframe, __results[src]);
          }
        }
      }
    }
  });
})();
<\/script>`;

    html = html.replace('</body>', injectionScript + '\n</body>');

    // Register as temporary resource (served via /ui/* route)
    const resourceUri = descriptor.resourceUri;
    try {
      this.registerUiResource(resourceUri, html);
    } catch {
      // Duplicate URI (re-execution) — ignore
    }

    // Broadcast composite event to SSE feed
    this.broadcastUiEvent(
      { source: "composite", resourceUri, slot: -1 },
      { type: "composite", toolCount: toolResults.size },
    );
  }

  /**
   * Start the server in HTTP mode with /feed SSE, /feed/live UI, and /ui/* viewer routes.
   */
  async startHttp(port: number): Promise<{ shutdown: () => Promise<void> }> {
    const result = await this.server.startHttp({
      port,
      cors: true,
      corsOrigins: "*",
      customRoutes: [
        // SSE event stream
        {
          method: "get",
          path: "/feed",
          handler: () => {
            const feedClients = this.feedClients;
            let controller: ReadableStreamDefaultController;
            const stream = new ReadableStream({
              start(ctrl) {
                controller = ctrl;
                feedClients.add(ctrl);
                ctrl.enqueue(PmlServer.encoder.encode(": connected\n\n"));
              },
              cancel() {
                feedClients.delete(controller);
              },
            });
            return new Response(stream, {
              headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
              },
            });
          },
        },
        // Live feed page with MCP Apps viewers
        {
          method: "get",
          path: "/",
          handler: () => new Response(FEED_LIVE_HTML, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }),
        },
        // Serve viewer HTML from registered MCP resources
        // URL: /ui/mcp-plm/table-viewer → resource uri: ui://mcp-plm/table-viewer
        {
          method: "get",
          path: "/ui/*",
          handler: async (req: Request) => {
            const url = new URL(req.url);
            const path = url.pathname.replace(/^\/ui\//, "");
            if (!path) {
              return new Response("Not found", { status: 404 });
            }
            const resourceUri = `ui://${path}`;
            const content = await this.server.readResourceContent(resourceUri);
            if (!content) {
              return new Response(`UI resource not found: ${resourceUri}`, { status: 404 });
            }
            return new Response(content.text, {
              headers: {
                "Content-Type": content.mimeType || "text/html",
                "Cache-Control": "no-cache",
              },
            });
          },
        },
      ],
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
    // Extract a human-readable name from the URI (e.g., "chart-viewer" from "ui://mcp-std/chart-viewer")
    const name = resourceUri.split("/").pop() ?? resourceUri;

    try {
      this.server.registerResource(
        { uri: resourceUri, name, description: `Tool UI: ${name}` },
        () => ({
          uri: resourceUri,
          mimeType,
          text: htmlContent,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Duplicate URI is expected (multiple servers may expose same UI)
      if (message.includes("already registered")) {
        this.config.logger.debug?.(
          `[pml-server] UI resource already registered (skipped): ${resourceUri}`,
        );
        return;
      }

      // Any other error is unexpected — fail-fast per no-silent-fallbacks policy
      throw new Error(
        `[pml-server] Failed to register UI resource ${resourceUri}: ${message}`,
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
   * Closes feed SSE clients first to unblock HTTP server drain.
   */
  async shutdown(): Promise<void> {
    for (const ctrl of this.feedClients) {
      try { ctrl.close(); } catch { /* already closed */ }
    }
    this.feedClients.clear();
    await this.server.stop();
  }
}

// =============================================================================
// Feed Live Page HTML
// =============================================================================

const FEED_LIVE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PML Live Feed</title>
<style>
  :root {
    --bg: #08080a;
    --surface: #131316;
    --surface2: #1a1a1f;
    --border: #27272e;
    --text: #e4e4e8;
    --muted: #717179;
    --accent: #FFB86F;
    --green: #4ade80;
    --red: #f87171;
    --blue: #60a5fa;
    --timeline-h: 68px;
    --track-y: 22px;
    --teal: #4ECDC4;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: -apple-system, 'Inter', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    height: 100vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* ── Header: absolute overlay, top-right ── */
  .top-bar {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    pointer-events: none;
  }
  .top-bar > * { pointer-events: auto; }
  .top-bar .logo {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.08em;
    user-select: none;
  }
  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--red);
    flex-shrink: 0;
    transition: background 0.3s;
  }
  .status-dot.connected { background: var(--green); }

  /* ── Main viewer area ── */
  .viewer-area {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .viewer-area iframe,
  .viewer-area .json-fullscreen {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: none;
    background: var(--bg);
    display: none;
  }
  .viewer-area iframe.active,
  .viewer-area .json-fullscreen.active {
    display: block;
  }

  .json-fullscreen {
    overflow: auto;
    padding: 2rem;
  }
  .json-fullscreen pre {
    font-family: 'SF Mono', monospace;
    font-size: 0.8rem;
    color: var(--muted);
    white-space: pre-wrap;
    word-break: break-all;
    line-height: 1.6;
  }

  /* ── Empty state ── */
  .empty-state {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--muted);
    gap: 12px;
    transition: opacity 0.3s;
  }
  .empty-state.hidden { opacity: 0; pointer-events: none; }
  .empty-state .glyph {
    font-size: 2.2rem;
    opacity: 0.3;
    font-weight: 300;
  }
  .empty-state p {
    font-size: 0.82rem;
    max-width: 340px;
    text-align: center;
    line-height: 1.5;
  }

  /* ── Timeline bar ── */
  .timeline {
    height: var(--timeline-h);
    background: var(--surface);
    border-top: 1px solid var(--border);
    position: relative;
    flex-shrink: 0;
    user-select: none;
    display: flex;
    align-items: stretch;
  }

  /* Prev / Next nav buttons */
  .tl-nav {
    width: 36px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--muted);
    cursor: pointer;
    font-size: 1rem;
    padding: 0;
    transition: color 0.15s, background 0.15s;
  }
  .tl-nav:hover { color: var(--text); background: var(--surface2); }
  .tl-nav:active { color: var(--accent); }
  .tl-nav:disabled { opacity: 0.25; pointer-events: none; }
  .tl-nav svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

  /* Center track area */
  .tl-center {
    flex: 1;
    position: relative;
    min-width: 0;
  }

  .timeline-track {
    position: absolute;
    left: 0;
    right: 0;
    top: var(--track-y);
    height: 4px;
    background: var(--border);
    border-radius: 2px;
  }

  .timeline-progress {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    background: var(--accent);
    border-radius: 2px;
    transition: width 0.25s ease;
    opacity: 0.5;
  }

  .timeline-markers {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
  }

  /* Counter chip: "2 / 5" */
  .tl-counter {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 0.6rem;
    font-family: 'SF Mono', monospace;
    color: var(--muted);
    letter-spacing: 0.03em;
    pointer-events: none;
    z-index: 4;
    line-height: 1;
  }

  /* ── Marker (dot + label column) ── */
  .marker-group {
    position: absolute;
    top: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    transform: translateX(-50%);
    cursor: pointer;
    z-index: 2;
  }
  .marker-group.active { z-index: 3; }

  .marker {
    position: relative;
    top: calc(var(--track-y) - 6px);
    width: 14px;
    height: 14px;
    border-radius: 50%;
    flex-shrink: 0;
    border: 2px solid var(--border);
    background: var(--surface2);
    transition: transform 0.15s, border-color 0.15s, background 0.15s, box-shadow 0.15s;
  }
  /* Type-colored borders */
  .marker.t-composite { border-color: var(--accent); }
  .marker.t-mcp-app   { border-color: #4ECDC4; }
  .marker.t-json       { border-color: var(--muted); }

  .marker-group:hover .marker {
    transform: scale(1.2);
    background: var(--surface2);
  }

  /* Active marker: filled + glow ring */
  .marker-group.active .marker {
    transform: scale(1.3);
  }
  .marker-group.active .marker.t-composite {
    background: var(--accent);
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(255,184,111,0.25), 0 0 8px rgba(255,184,111,0.15);
  }
  .marker-group.active .marker.t-mcp-app {
    background: #4ECDC4;
    border-color: #4ECDC4;
    box-shadow: 0 0 0 3px rgba(78,205,196,0.25), 0 0 8px rgba(78,205,196,0.15);
  }
  .marker-group.active .marker.t-json {
    background: var(--muted);
    border-color: var(--muted);
    box-shadow: 0 0 0 3px rgba(113,113,121,0.25), 0 0 8px rgba(113,113,121,0.15);
  }

  /* Always-visible label below dot */
  .marker-label {
    position: relative;
    top: calc(var(--track-y) - 2px);
    font-size: 0.58rem;
    font-family: 'SF Mono', monospace;
    color: var(--muted);
    white-space: nowrap;
    max-width: 72px;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
    line-height: 1;
    transition: color 0.15s;
    pointer-events: none;
  }
  .marker-group.active .marker-label { color: var(--text); }
  .marker-group:hover .marker-label { color: var(--text); }

  /* Crowded mode: when 10+ markers, shrink everything */
  .tl-center.crowded .marker {
    width: 10px;
    height: 10px;
    top: calc(var(--track-y) - 4px);
  }
  .tl-center.crowded .marker-label {
    font-size: 0.5rem;
    max-width: 48px;
    top: calc(var(--track-y) - 1px);
  }
  /* Very crowded: hide labels entirely, rely on tooltip */
  .tl-center.very-crowded .marker-label {
    display: none;
  }
  .tl-center.very-crowded .marker {
    width: 8px;
    height: 8px;
    top: calc(var(--track-y) - 3px);
  }

  /* ── Tooltip ── */
  .tooltip {
    position: fixed;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px 14px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.12s;
    z-index: 200;
    min-width: 170px;
    max-width: 280px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.55);
  }
  .tooltip.visible { opacity: 1; }
  .tooltip .tt-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .tooltip .tt-name {
    font-size: 0.75rem;
    font-weight: 600;
    font-family: 'SF Mono', monospace;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 190px;
  }
  .tooltip .tt-badge {
    display: inline-block;
    font-size: 0.55rem;
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 600;
    letter-spacing: 0.02em;
    flex-shrink: 0;
  }
  .tt-badge.mcp-app { background: rgba(78,205,196,0.15); color: #4ECDC4; }
  .tt-badge.composite { background: rgba(255,184,111,0.15); color: var(--accent); }
  .tt-badge.json { background: rgba(113,113,121,0.15); color: var(--muted); }
  .tooltip .tt-meta {
    font-size: 0.62rem;
    color: var(--muted);
    line-height: 1.4;
  }
  .tooltip .tt-meta span { display: block; }

  /* ── Keyboard hint (shown in counter area when hovered) ── */
  .tl-hint {
    position: absolute;
    bottom: 4px;
    right: 4px;
    font-size: 0.5rem;
    color: var(--muted);
    opacity: 0;
    transition: opacity 0.2s;
    pointer-events: none;
    white-space: nowrap;
  }
  .timeline:hover .tl-hint { opacity: 0.5; }
</style>
</head>
<body>

<!-- Header -->
<div class="top-bar">
  <span class="logo">PML</span>
  <span id="statusDot" class="status-dot"></span>
</div>

<!-- Main viewer -->
<div class="viewer-area" id="viewerArea">
  <div class="empty-state" id="emptyState">
    <div class="glyph">~</div>
    <p>Execute a tool with a UI viewer and the result will appear here.</p>
  </div>
</div>

<!-- Timeline -->
<div class="timeline" id="timeline">
  <button class="tl-nav" id="tlPrev" disabled aria-label="Previous step">
    <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
  </button>
  <div class="tl-center" id="tlCenter">
    <div class="timeline-track">
      <div class="timeline-progress" id="timelineProgress"></div>
    </div>
    <div class="timeline-markers" id="timelineMarkers"></div>
    <div class="tl-counter" id="tlCounter"></div>
    <div class="tl-hint">← → to navigate</div>
  </div>
  <button class="tl-nav" id="tlNext" disabled aria-label="Next step">
    <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
  </button>
</div>

<!-- Tooltip (positioned via JS) -->
<div class="tooltip" id="tooltip">
  <div class="tt-row">
    <div class="tt-name" id="ttName"></div>
    <span class="tt-badge" id="ttBadge"></span>
  </div>
  <div class="tt-meta" id="ttMeta"></div>
</div>

<script>
// ═══════════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════════
var events = [];      // Array of { toolName, result, resourceUri, timestamp, viewerEl, type }
var activeIdx = -1;   // Currently displayed frame index
var autoFollow = true; // Auto-advance to newest frame

// DOM refs
var viewerArea = document.getElementById('viewerArea');
var emptyState = document.getElementById('emptyState');
var markers = document.getElementById('timelineMarkers');
var progress = document.getElementById('timelineProgress');
var tooltip = document.getElementById('tooltip');
var ttName = document.getElementById('ttName');
var ttMeta = document.getElementById('ttMeta');
var ttBadge = document.getElementById('ttBadge');
var tlCenter = document.getElementById('tlCenter');
var tlCounter = document.getElementById('tlCounter');
var tlPrev = document.getElementById('tlPrev');
var tlNext = document.getElementById('tlNext');

// Prev/Next button handlers
tlPrev.addEventListener('click', function() {
  if (activeIdx > 0) { autoFollow = false; showFrame(activeIdx - 1); }
});
tlNext.addEventListener('click', function() {
  if (activeIdx < events.length - 1) { autoFollow = false; showFrame(activeIdx + 1); }
});

// ═══════════════════════════════════════════════════════════════════
// MCP Apps Host Protocol
// ═══════════════════════════════════════════════════════════════════
function embedViewer(iframe, data) {
  var initialized = false;
  function onMessage(ev) {
    if (ev.source !== iframe.contentWindow) return;
    var msg = ev.data;
    if (!msg || msg.jsonrpc !== '2.0') return;
    if (msg.method === 'ui/initialize') {
      iframe.contentWindow.postMessage({
        jsonrpc: '2.0', id: msg.id,
        result: {
          protocolVersion: '2026-01-26',
          hostInfo: { name: 'PML Live Feed', version: '1.0.0' },
          hostCapabilities: { openLinks: {}, logging: {} },
          hostContext: { theme: 'dark', displayMode: 'inline' },
        },
      }, '*');
      return;
    }
    if (msg.method === 'ui/notifications/initialized' && !initialized) {
      initialized = true;
      iframe.contentWindow.postMessage({
        jsonrpc: '2.0', method: 'ui/notifications/tool-input',
        params: { arguments: {} },
      }, '*');
      iframe.contentWindow.postMessage({
        jsonrpc: '2.0', method: 'ui/notifications/tool-result',
        params: { content: [{ type: 'text', text: JSON.stringify(data) }], isError: false },
      }, '*');
      return;
    }
    if (msg.method === 'ui/notifications/size-changed') {
      // Ignore in fullscreen mode
      return;
    }
    if (msg.method === 'ui/open-link' && msg.id != null) {
      var url = msg.params?.url;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      iframe.contentWindow.postMessage({ jsonrpc: '2.0', id: msg.id, result: {} }, '*');
      return;
    }
    if (msg.method === 'ui/update-model-context' && msg.id != null) {
      iframe.contentWindow.postMessage({ jsonrpc: '2.0', id: msg.id, result: {} }, '*');
      return;
    }
    if (msg.method === 'ui/call-tool' && msg.id != null) {
      fetch('/call-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: msg.params?.name, arguments: msg.params?.arguments ?? {} }),
      })
        .then(function(r) { return r.json(); })
        .then(function(result) {
          iframe.contentWindow.postMessage({ jsonrpc: '2.0', id: msg.id, result: result }, '*');
        })
        .catch(function(err) {
          iframe.contentWindow.postMessage({
            jsonrpc: '2.0', id: msg.id,
            error: { code: -32000, message: String(err) },
          }, '*');
        });
      return;
    }
  }
  window.addEventListener('message', onMessage);
  var observer = new MutationObserver(function() {
    if (!document.contains(iframe)) {
      window.removeEventListener('message', onMessage);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ═══════════════════════════════════════════════════════════════════
// Viewer management
// ═══════════════════════════════════════════════════════════════════
function createViewerElement(event) {
  var viewerPath = event.resourceUri ? '/ui/' + event.resourceUri.replace('ui://', '') : null;
  var isComposite = event.result && event.result.type === 'composite';

  var type;
  if (isComposite) type = 'composite';
  else if (viewerPath) type = 'mcp-app';
  else type = 'json';

  var el;
  if (viewerPath) {
    el = document.createElement('iframe');
    el.sandbox = isComposite ? 'allow-scripts allow-same-origin' : 'allow-scripts';
    el.src = viewerPath;
  } else {
    el = document.createElement('div');
    el.className = 'json-fullscreen';
    var pre = document.createElement('pre');
    pre.textContent = JSON.stringify(event.result, null, 2);
    el.appendChild(pre);
  }

  viewerArea.appendChild(el);

  // Attach MCP Apps protocol for non-composite viewers
  if (type === 'mcp-app') {
    embedViewer(el, event.result);
  }

  return { el: el, type: type };
}

function showFrame(idx) {
  if (idx < 0 || idx >= events.length) return;

  // Hide current
  if (activeIdx >= 0 && events[activeIdx]) {
    events[activeIdx].viewerEl.classList.remove('active');
  }

  // Show target
  activeIdx = idx;
  events[idx].viewerEl.classList.add('active');

  // Update marker highlights + progress + counter + nav
  updateMarkers();
  updateProgress();
  updateCounter();
  updateNavButtons();
}

function updateCounter() {
  if (events.length === 0) {
    tlCounter.textContent = '';
    return;
  }
  tlCounter.textContent = (activeIdx + 1) + ' / ' + events.length;
}

function updateNavButtons() {
  tlPrev.disabled = activeIdx <= 0;
  tlNext.disabled = activeIdx >= events.length - 1;
}

// ═══════════════════════════════════════════════════════════════════
// Timeline markers
// ═══════════════════════════════════════════════════════════════════
function getShortLabel(ev) {
  if (ev.type === 'composite') {
    var count = ev.result && ev.result.toolCount ? ev.result.toolCount : '?';
    return count + ' tools';
  }
  var name = ev.toolName || 'json';
  // Strip namespace prefix (std:, mcp-plm:, etc.)
  var colon = name.lastIndexOf(':');
  if (colon > 0) name = name.substring(colon + 1);
  return name;
}

function rebuildMarkers() {
  markers.innerHTML = '';
  var n = events.length;

  // Density classes
  tlCenter.classList.toggle('crowded', n >= 10 && n < 20);
  tlCenter.classList.toggle('very-crowded', n >= 20);

  for (var i = 0; i < n; i++) {
    var pct = n === 1 ? 50 : (i / (n - 1)) * 100;
    var ev = events[i];

    // Group wrapper (dot + label)
    var group = document.createElement('div');
    group.className = 'marker-group' + (i === activeIdx ? ' active' : '');
    group.style.left = pct + '%';
    group.dataset.idx = String(i);

    // Dot with type-based class
    var dot = document.createElement('div');
    dot.className = 'marker t-' + (ev.type || 'json');
    group.appendChild(dot);

    // Always-visible label
    var label = document.createElement('div');
    label.className = 'marker-label';
    label.textContent = getShortLabel(ev);
    group.appendChild(label);

    group.addEventListener('mouseenter', onMarkerEnter);
    group.addEventListener('mouseleave', onMarkerLeave);
    group.addEventListener('click', onMarkerClick);

    markers.appendChild(group);
  }
}

function updateMarkers() {
  var groups = markers.querySelectorAll('.marker-group');
  for (var i = 0; i < groups.length; i++) {
    groups[i].classList.toggle('active', i === activeIdx);
  }
}

function updateProgress() {
  if (events.length <= 1) {
    progress.style.width = events.length === 1 ? '50%' : '0%';
    return;
  }
  var pct = (activeIdx / (events.length - 1)) * 100;
  progress.style.width = pct + '%';
}

// ═══════════════════════════════════════════════════════════════════
// Tooltip
// ═══════════════════════════════════════════════════════════════════
function onMarkerEnter(e) {
  var group = e.currentTarget;
  var idx = parseInt(group.dataset.idx, 10);
  var ev = events[idx];
  if (!ev) return;

  // Name
  if (ev.type === 'composite') {
    var tc = ev.result && ev.result.toolCount ? ev.result.toolCount : '?';
    ttName.textContent = 'Orchestrated View (' + tc + ' tools)';
  } else {
    ttName.textContent = ev.toolName || 'unknown';
  }

  // Badge
  var badgeClass, badgeText;
  if (ev.type === 'composite') { badgeClass = 'composite'; badgeText = 'Composite'; }
  else if (ev.type === 'mcp-app') { badgeClass = 'mcp-app'; badgeText = 'MCP App'; }
  else { badgeClass = 'json'; badgeText = 'JSON'; }
  ttBadge.className = 'tt-badge ' + badgeClass;
  ttBadge.textContent = badgeText;

  // Meta lines: timestamp + step number
  var timeStr = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : '';
  var stepStr = 'Step ' + (idx + 1) + ' of ' + events.length;
  ttMeta.innerHTML = '<span>' + stepStr + '</span>' + (timeStr ? '<span>' + esc(timeStr) + '</span>' : '');

  // Position tooltip above the marker group, clamped to viewport
  var rect = group.getBoundingClientRect();
  var centerX = rect.left + rect.width / 2;
  var bottomY = rect.top - 8;

  tooltip.style.left = '0px';
  tooltip.style.top = '0px';
  tooltip.style.transform = 'none';
  tooltip.classList.add('visible');

  requestAnimationFrame(function() {
    var tr = tooltip.getBoundingClientRect();
    var leftPx = centerX - tr.width / 2;
    var topPx = bottomY - tr.height;
    // Clamp horizontal
    if (leftPx < 8) leftPx = 8;
    if (leftPx + tr.width > window.innerWidth - 8) leftPx = window.innerWidth - 8 - tr.width;
    // Clamp vertical (flip below if no room above)
    if (topPx < 8) topPx = rect.bottom + 8;
    tooltip.style.left = leftPx + 'px';
    tooltip.style.top = topPx + 'px';
  });
}

function onMarkerLeave() {
  tooltip.classList.remove('visible');
}

function onMarkerClick(e) {
  var group = e.currentTarget;
  var idx = parseInt(group.dataset.idx, 10);
  autoFollow = false; // User took control
  showFrame(idx);
}

// ═══════════════════════════════════════════════════════════════════
// Keyboard navigation
// ═══════════════════════════════════════════════════════════════════
document.addEventListener('keydown', function(e) {
  if (events.length === 0) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault();
    autoFollow = false;
    showFrame(Math.min(activeIdx + 1, events.length - 1));
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    autoFollow = false;
    showFrame(Math.max(activeIdx - 1, 0));
  } else if (e.key === 'Home') {
    e.preventDefault();
    autoFollow = false;
    showFrame(0);
  } else if (e.key === 'End') {
    e.preventDefault();
    autoFollow = true;
    showFrame(events.length - 1);
  }
});

// ═══════════════════════════════════════════════════════════════════
// SSE Connection
// ═══════════════════════════════════════════════════════════════════
var es = new EventSource('./feed');
var statusDot = document.getElementById('statusDot');

es.onopen = function() { statusDot.className = 'status-dot connected'; };
es.onerror = function() { statusDot.className = 'status-dot'; };

es.onmessage = function(ev) {
  try {
    var event = JSON.parse(ev.data);
    addEvent(event);
  } catch (e) { console.warn('Feed parse error:', e); }
};

function addEvent(event) {
  // First event: hide empty state
  if (events.length === 0) {
    emptyState.classList.add('hidden');
  }

  var viewer = createViewerElement(event);
  var entry = {
    toolName: event.toolName,
    result: event.result,
    resourceUri: event.resourceUri,
    timestamp: event.timestamp,
    viewerEl: viewer.el,
    type: viewer.type,
  };
  events.push(entry);
  rebuildMarkers();

  if (autoFollow) {
    showFrame(events.length - 1);
  } else {
    // Keep current frame, just update timeline + counter + nav
    updateProgress();
    updateCounter();
    updateNavButtons();
  }
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
<\/script>
</body>
</html>`;
