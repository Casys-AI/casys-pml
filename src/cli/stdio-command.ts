/**
 * Stdio Command
 *
 * Starts the PML MCP server in stdio mode for Claude Code integration.
 * This is the PRIMARY interface - Claude Code spawns this process.
 * Uses shared utilities from ./shared/ for common functionality.
 *
 * @module cli/stdio-command
 */

import { Command } from "@cliffy/command";
import type { PmlConfig } from "../types.ts";
import {
  getWorkspaceSourceDescription,
  isValidWorkspace,
  resolveWorkspaceWithDetails,
} from "../workspace.ts";
import { loadUserPermissions } from "../permissions/loader.ts";
import {
  getRoutingVersion,
  initializeRouting,
  isRoutingInitialized,
  resolveToolRouting,
  syncRoutingConfig,
} from "../routing/mod.ts";
import { CapabilityLoader, LockfileManager } from "../loader/mod.ts";
import { SessionClient } from "../session/mod.ts";
import { PendingWorkflowStore } from "../workflow/mod.ts";
import { TraceSyncer, type LocalExecutionTrace, type JsonValue } from "../tracing/mod.ts";
import { exists } from "@std/fs";
import { join } from "@std/path";
import { reloadEnv } from "../byok/env-loader.ts";
import { stdioLog } from "../logging.ts";

// Shared utilities
import {
  PML_CONFIG_FILE,
  PACKAGE_VERSION,
  SILENT_LOGGER,
  PML_TOOLS_FULL,
  forwardToCloud,
  extractContinueWorkflow,
  parseExecuteLocallyResponse,
  formatApprovalRequired,
  executeLocalCode,
  type AnyApprovalResult,
  type ContinueWorkflowParams,
} from "./shared/mod.ts";

/** Active session client (initialized at startup) */
let sessionClient: SessionClient | null = null;

/** Trace syncer for sending execution traces to cloud */
let traceSyncer: TraceSyncer | null = null;

/** Pending workflow store for local approval flows */
const pendingWorkflowStore = new PendingWorkflowStore();

/** Logger adapter for shared utilities */
const stdioLogger = {
  debug: (msg: string) => stdioLog.debug(msg),
};

/**
 * Send JSON-RPC response to stdout
 */
function sendResponse(response: unknown): void {
  const json = JSON.stringify(response);
  Deno.stdout.writeSync(new TextEncoder().encode(json + "\n"));
}

/**
 * Send JSON-RPC error to stdout
 */
function sendError(
  id: string | number | null,
  code: number,
  message: string,
): void {
  sendResponse({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
}

/**
 * Handle MCP initialize request
 */
function handleInitialize(id: string | number): void {
  sendResponse({
    jsonrpc: "2.0",
    id,
    result: {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "pml", version: PACKAGE_VERSION },
    },
  });
}

/**
 * Handle MCP tools/list request
 */
function handleToolsList(id: string | number): void {
  sendResponse({
    jsonrpc: "2.0",
    id,
    result: { tools: PML_TOOLS_FULL },
  });
}

/**
 * Handle MCP tools/call request
 */
async function handleToolsCall(
  id: string | number,
  params: { name: string; arguments?: Record<string, unknown> },
  loader: CapabilityLoader | null,
  cloudUrl: string,
  workspace: string,
  lockfileManager: LockfileManager | null,
): Promise<void> {
  const { name, arguments: args } = params;

  // Handle pml:discover - always forward to cloud
  if (name === "pml:discover") {
    const cloudResult = await forwardToCloud(id, name, args || {}, cloudUrl, sessionClient);
    if (!cloudResult.ok) {
      sendError(id, -32603, cloudResult.error ?? "Cloud call failed");
      return;
    }
    sendResponse(cloudResult.response);
    return;
  }

  // Handle pml:execute with hybrid routing support
  if (name === "pml:execute") {
    const { continueWorkflow, cleanArgs } = extractContinueWorkflow(args);

    if (continueWorkflow) {
      stdioLog.debug(`pml:execute with continue_workflow: approved=${continueWorkflow.approved}`);

      // Check if this is a LOCAL workflow (stored in our pending store)
      const pendingWorkflow = continueWorkflow.workflowId
        ? pendingWorkflowStore.get(continueWorkflow.workflowId)
        : null;

      if (pendingWorkflow) {
        stdioLog.debug(`Found local pending workflow: ${continueWorkflow.workflowId}`);

        if (!continueWorkflow.approved) {
          pendingWorkflowStore.delete(continueWorkflow.workflowId!);
          sendResponse({
            jsonrpc: "2.0",
            id,
            result: {
              content: [{
                type: "text",
                text: JSON.stringify({ status: "aborted", reason: "User rejected approval" }, null, 2),
              }],
            },
          });
          return;
        }

        // Pre-continuation actions based on approval type
        stdioLog.debug(`Re-executing code after approval for: ${pendingWorkflow.approvalType}`);

        switch (pendingWorkflow.approvalType) {
          case "tool_permission":
            if (loader && pendingWorkflow.toolId) {
              stdioLog.debug(`Approving tool for session: ${pendingWorkflow.toolId}`);
              loader.approveToolForSession(pendingWorkflow.toolId);
            }
            break;
          case "api_key_required":
            stdioLog.debug(`Reloading environment for API key approval`);
            await reloadEnv(workspace);
            break;
          case "integrity":
            if (lockfileManager && pendingWorkflow.integrityInfo) {
              stdioLog.debug(`Approving integrity update: ${pendingWorkflow.integrityInfo.fqdnBase}`);
            }
            break;
          case "dependency":
            stdioLog.debug(`Proceeding with dependency installation`);
            break;
        }

        // Re-execute with stored FQDN map
        const storedFqdnMap = new Map<string, string>(Object.entries(pendingWorkflow.fqdnMap ?? {}));
        const localResult = await executeLocalCode(
          pendingWorkflow.code,
          loader,
          cloudUrl,
          storedFqdnMap,
          { approved: true, workflowId: continueWorkflow.workflowId },
          stdioLogger,
        );

        pendingWorkflowStore.delete(continueWorkflow.workflowId!);

        if (localResult.status === "approval_required") {
          sendResponse({
            jsonrpc: "2.0",
            id,
            result: formatApprovalRequired(
              localResult.toolId,
              localResult.approval as AnyApprovalResult,
              pendingWorkflowStore,
              pendingWorkflow.code,
              pendingWorkflow.fqdnMap,
            ),
          });
          return;
        }

        if (localResult.status === "error") {
          sendResponse({
            jsonrpc: "2.0",
            id,
            result: {
              content: [{
                type: "text",
                text: JSON.stringify({ status: "error", error: localResult.error, executed_locally: true }, null, 2),
              }],
            },
          });
          return;
        }

        sendResponse({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{
              type: "text",
              text: JSON.stringify({ status: "success", result: localResult.result, executed_locally: true }, null, 2),
            }],
          },
        });
        return;
      }
    }

    // Forward to cloud
    const cloudResult = await forwardToCloud(id, name, cleanArgs || {}, cloudUrl, sessionClient);

    if (!cloudResult.ok) {
      sendError(id, -32603, cloudResult.error ?? "Cloud call failed");
      return;
    }

    // Check if server returned execute_locally
    const response = cloudResult.response as { result?: { content?: Array<{ type: string; text: string }> } };
    const content = response?.result?.content?.[0]?.text;

    if (content) {
      const execLocally = parseExecuteLocallyResponse(content);

      if (execLocally) {
        stdioLog.debug(`execute_locally received - client tools: ${execLocally.client_tools.join(", ")}`);

        // Create FQDN map from server-resolved tools
        const fqdnMap = new Map<string, string>();
        for (const tool of execLocally.tools_used) {
          fqdnMap.set(tool.id, tool.fqdn);
        }
        stdioLog.debug(`FQDN map: ${JSON.stringify(Object.fromEntries(fqdnMap))}`);

        const localResult = await executeLocalCode(
          execLocally.code,
          loader,
          cloudUrl,
          fqdnMap,
          continueWorkflow,
          stdioLogger,
        );

        // Handle approval_required (HIL pause)
        if (localResult.status === "approval_required") {
          stdioLog.debug(`Local execution paused - tool ${localResult.toolId} requires approval`);
          sendResponse({
            jsonrpc: "2.0",
            id,
            result: formatApprovalRequired(
              localResult.toolId,
              localResult.approval as AnyApprovalResult,
              pendingWorkflowStore,
              execLocally.code,
              Object.fromEntries(fqdnMap),
            ),
          });
          return;
        }

        // Handle error
        if (localResult.status === "error") {
          sendResponse({
            jsonrpc: "2.0",
            id,
            result: {
              content: [{
                type: "text",
                text: JSON.stringify({ status: "error", error: localResult.error, executed_locally: true }, null, 2),
              }],
            },
          });
          return;
        }

        // Send trace to finalize capability creation if workflowId present
        if (execLocally.workflowId && traceSyncer) {
          const trace: LocalExecutionTrace = {
            workflowId: execLocally.workflowId,
            capabilityId: "",
            success: true,
            durationMs: localResult.durationMs,
            taskResults: localResult.toolCallRecords.map((record, i) => ({
              taskId: `task_${i}`,
              tool: record.tool,
              args: (record.args ?? {}) as Record<string, JsonValue>,
              result: (record.result ?? null) as JsonValue,
              success: record.success,
              durationMs: record.durationMs,
              timestamp: new Date().toISOString(),
            })),
            decisions: [],
            timestamp: new Date().toISOString(),
          };
          traceSyncer.enqueue(trace);
          stdioLog.debug(`Trace queued for capability finalization: ${execLocally.workflowId}`);
        }

        // Return successful local execution result
        sendResponse({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{
              type: "text",
              text: JSON.stringify({ status: "success", result: localResult.result, executed_locally: true }, null, 2),
            }],
          },
        });
        return;
      }
    }

    // Not execute_locally - return server response as-is
    sendResponse(cloudResult.response);
    return;
  }

  // Direct tool routing (deprecated path - backwards compatibility)
  const { continueWorkflow, cleanArgs } = extractContinueWorkflow(args);
  const routing = resolveToolRouting(name);
  stdioLog.debug(`Tool ${name} → ${routing}${continueWorkflow ? ` (continue: ${continueWorkflow.approved})` : ""}`);

  if (routing === "client") {
    if (!loader) {
      sendError(id, -32603, "Capability loader not initialized");
      return;
    }

    try {
      const result = await loader.call(name, cleanArgs, continueWorkflow);

      if (CapabilityLoader.isApprovalRequired(result)) {
        sendResponse({
          jsonrpc: "2.0",
          id,
          result: formatApprovalRequired(name, result as AnyApprovalResult, pendingWorkflowStore),
        });
        return;
      }

      sendResponse({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{
            type: "text",
            text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
          }],
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stdioLog.debug(`Tool error: ${message}`);
      sendError(id, -32603, `Tool execution failed: ${message}`);
    }
    return;
  }

  // Server routing - forward to pml.casys.ai
  try {
    const apiKey = Deno.env.get("PML_API_KEY");
    if (!apiKey) {
      sendError(id, -32603, "PML_API_KEY environment variable is required");
      return;
    }

    const response = await fetch(`${cloudUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });

    if (!response.ok) {
      sendError(id, -32603, `Cloud error: ${response.status} ${response.statusText}`);
      return;
    }

    const result = await response.json();
    sendResponse(result);
  } catch (error) {
    sendError(id, -32603, `Cloud unreachable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Process a single JSON-RPC request
 */
async function processRequest(
  line: string,
  loader: CapabilityLoader | null,
  cloudUrl: string,
  workspace: string,
  lockfileManager: LockfileManager | null,
): Promise<void> {
  let request: {
    jsonrpc: string;
    id?: string | number;
    method: string;
    params?: unknown;
  };

  try {
    request = JSON.parse(line);
  } catch {
    sendError(null, -32700, "Parse error: Invalid JSON");
    return;
  }

  if (request.jsonrpc !== "2.0") {
    sendError(request.id ?? null, -32600, "Invalid Request: Not JSON-RPC 2.0");
    return;
  }

  const id = request.id ?? null;
  const method = request.method;
  const params = request.params as Record<string, unknown> | undefined;

  stdioLog.debug(`← ${method}`);

  switch (method) {
    case "initialize":
      if (id !== null) handleInitialize(id);
      break;
    case "initialized":
      // Notification, no response needed
      break;
    case "tools/list":
      if (id !== null) handleToolsList(id);
      break;
    case "tools/call":
      if (id !== null && params) {
        await handleToolsCall(
          id,
          params as { name: string; arguments?: Record<string, unknown> },
          loader,
          cloudUrl,
          workspace,
          lockfileManager,
        );
      }
      break;
    default:
      if (id !== null) {
        sendError(id, -32601, `Method not found: ${method}`);
      }
  }
}

/**
 * Main stdio loop - reads from stdin, processes, writes to stdout
 */
async function runStdioLoop(
  loader: CapabilityLoader | null,
  cloudUrl: string,
  workspace: string,
  lockfileManager: LockfileManager | null,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of Deno.stdin.readable) {
    buffer += decoder.decode(chunk);

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line) {
        await processRequest(line, loader, cloudUrl, workspace, lockfileManager);
      }
    }
  }
}

/**
 * Create stdio command
 */
// deno-lint-ignore no-explicit-any
export function createStdioCommand(): Command<any> {
  return new Command()
    .name("stdio")
    .description("Start the PML MCP server in stdio mode (for Claude Code)")
    .action(async () => {
      // Resolve workspace
      const workspaceResult = resolveWorkspaceWithDetails(SILENT_LOGGER);
      const workspace = workspaceResult.path;

      // Auto-load .env from workspace
      if (!Deno.env.get("PML_API_KEY")) {
        try {
          await reloadEnv(workspace);
          if (Deno.env.get("PML_API_KEY")) {
            stdioLog.debug(`Loaded PML_API_KEY from workspace .env`);
          }
        } catch (error) {
          stdioLog.debug(`Failed to load .env: ${error}`);
        }
      }

      // Verify PML_API_KEY
      const apiKey = Deno.env.get("PML_API_KEY");
      if (!apiKey) {
        console.error("[pml] ERROR: PML_API_KEY environment variable is required");
        console.error("[pml] Set it with: export PML_API_KEY=your_key");
        console.error("[pml] Or add PML_API_KEY=your_key to .env in your project");
        Deno.exit(1);
      }

      if (!isValidWorkspace(workspace)) {
        stdioLog.debug(`Invalid workspace: ${workspace}`);
        Deno.exit(1);
      }

      // Load config
      const configPath = join(workspace, PML_CONFIG_FILE);
      const defaultConfig: PmlConfig = {
        version: "0.1.0",
        workspace,
        cloud: { url: "https://pml.casys.ai" },
        server: { port: 3003 },
        permissions: { allow: [], deny: [], ask: ["*"] },
      };

      let config: PmlConfig = defaultConfig;
      if (await exists(configPath)) {
        try {
          const content = await Deno.readTextFile(configPath);
          config = { ...defaultConfig, ...JSON.parse(content) };
        } catch (error) {
          stdioLog.debug(`Failed to load config: ${error}`);
        }
      }

      // Load permissions
      const { permissions } = await loadUserPermissions(workspace, SILENT_LOGGER);

      // Sync routing config from cloud
      const cloudUrl = Deno.env.get("PML_CLOUD_URL") ?? config.cloud?.url ?? "https://pml.casys.ai";
      const { config: routingConfig } = await syncRoutingConfig(cloudUrl, SILENT_LOGGER);
      initializeRouting(routingConfig);

      // Register session with server
      try {
        sessionClient = new SessionClient({ cloudUrl, apiKey, version: PACKAGE_VERSION, workspace });
        await sessionClient.register();
        stdioLog.debug(`Session registered: ${sessionClient.sessionId?.slice(0, 8)}`);
      } catch (error) {
        stdioLog.debug(`Session registration failed (non-fatal): ${error}`);
        sessionClient = null;
      }

      stdioLog.debug(`Workspace: ${workspace} (${getWorkspaceSourceDescription(workspaceResult)})`);
      stdioLog.debug(`Cloud: ${cloudUrl}`);
      stdioLog.debug(`Routing: v${getRoutingVersion()} (${isRoutingInitialized() ? "ready" : "failed"})`);

      // Initialize CapabilityLoader
      let loader: CapabilityLoader | null = null;
      let lockfileManager: LockfileManager | null = null;
      try {
        lockfileManager = new LockfileManager({ workspace });
        await lockfileManager.load();
        loader = await CapabilityLoader.create({ cloudUrl, workspace, permissions, lockfileManager });
        stdioLog.debug(`CapabilityLoader initialized with permissions + lockfile`);
      } catch (error) {
        stdioLog.debug(`Failed to initialize CapabilityLoader: ${error}`);
      }

      // Initialize TraceSyncer
      traceSyncer = new TraceSyncer({
        cloudUrl,
        apiKey,
        batchSize: 10,
        flushIntervalMs: 5000,
        maxRetries: 3,
      });
      stdioLog.debug(`TraceSyncer initialized`);

      // Start stdio loop
      try {
        await runStdioLoop(loader, cloudUrl, workspace, lockfileManager);
      } finally {
        loader?.shutdown();
        if (traceSyncer) {
          await traceSyncer.shutdown();
          stdioLog.debug("TraceSyncer shutdown");
        }
        if (sessionClient) {
          await sessionClient.shutdown();
          stdioLog.debug("Session unregistered");
        }
      }
    });
}
