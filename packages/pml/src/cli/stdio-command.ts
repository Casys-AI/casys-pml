/**
 * Stdio Command
 *
 * Starts the PML MCP server in stdio mode for Claude Code integration.
 * This is the PRIMARY interface - Claude Code spawns this process.
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
import {
  type ApprovalRequiredResult,
  CapabilityLoader,
  type ContinueWorkflowParams,
  type IntegrityApprovalRequired,
  LockfileManager,
} from "../loader/mod.ts";
import { SandboxExecutor } from "../execution/mod.ts";
import { SessionClient } from "../session/mod.ts";
import { exists } from "@std/fs";
import { join } from "@std/path";
import { reloadEnv } from "../byok/env-loader.ts";

/** Package version for registration */
const PACKAGE_VERSION = "0.2.0";

/** Active session client (initialized at startup) */
let sessionClient: SessionClient | null = null;

const PML_CONFIG_FILE = ".pml.json";

/**
 * Silent logger for initialization (stdio must be clean for JSON-RPC)
 */
const silentLogger = {
  info: () => {},
  warn: () => {},
};

/**
 * Log to stderr (doesn't interfere with stdio JSON-RPC)
 */
function logDebug(message: string): void {
  if (Deno.env.get("PML_DEBUG") === "1") {
    console.error(`[pml] ${message}`);
  }
}

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
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: "pml",
        version: "0.1.0",
      },
    },
  });
}

/**
 * PML base tools - forwarded to cloud server.
 * Names match src/mcp/tools/definitions.ts (pml:discover, pml:execute)
 */
const PML_TOOLS = [
  {
    name: "pml:discover",
    description: "Search MCP tools and learned capabilities by intent. Returns ranked results.",
    inputSchema: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          description: "What do you want to accomplish? Natural language description.",
        },
        filter: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["tool", "capability", "all"] },
            minScore: { type: "number" },
          },
        },
        limit: {
          type: "number",
          description: "Maximum results (default: 1, max: 50)",
        },
      },
      required: ["intent"],
    },
  },
  {
    name: "pml:execute",
    description:
      "Execute intent with optional code. With code: runs and learns. Without: returns suggestions.",
    inputSchema: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          description: "Natural language description of what you want to accomplish.",
        },
        code: {
          type: "string",
          description: "TypeScript code. MCP tools via mcp.server.tool(). Triggers Direct Mode.",
        },
        options: {
          type: "object",
          properties: {
            timeout: { type: "number" },
            per_layer_validation: { type: "boolean" },
          },
        },
        accept_suggestion: {
          type: "object",
          properties: {
            callName: { type: "string" },
            args: { type: "object" },
          },
        },
        continue_workflow: {
          type: "object",
          properties: {
            workflow_id: { type: "string" },
            approved: { type: "boolean" },
          },
        },
      },
    },
  },
];

/**
 * Handle MCP tools/list request
 */
function handleToolsList(id: string | number): void {
  sendResponse({
    jsonrpc: "2.0",
    id,
    result: {
      tools: PML_TOOLS,
    },
  });
}

/**
 * Format approval_required MCP response.
 *
 * Uses the same pattern as main codebase (src/mcp/server/responses.ts).
 * Stateless: No workflow state stored - capability metadata contains all info.
 *
 * Story 14.6: Supports dependency and API key approval types.
 * Story 14.7: Supports integrity approval type.
 */
function formatApprovalRequired(
  toolName: string,
  approvalResult: ApprovalRequiredResult | IntegrityApprovalRequired,
): {
  content: Array<{ type: string; text: string }>;
} {
  // Handle API key approval (Story 14.6)
  if (approvalResult.approvalType === "api_key_required") {
    const data = {
      status: "approval_required",
      approval_type: "api_key_required",
      workflow_id: approvalResult.workflowId,
      context: {
        tool: toolName,
        missing_keys: approvalResult.missingKeys,
        instruction: approvalResult.instruction,
      },
      options: ["continue", "abort"],
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  // Handle integrity approval (Story 14.7)
  if (approvalResult.approvalType === "integrity") {
    const data = {
      status: "approval_required",
      approval_type: "integrity",
      workflow_id: approvalResult.workflowId,
      description: approvalResult.description,
      context: {
        tool: toolName,
        fqdn_base: approvalResult.fqdnBase,
        old_hash: approvalResult.oldHash,
        new_hash: approvalResult.newHash,
        old_fetched_at: approvalResult.oldFetchedAt,
      },
      options: ["continue", "abort"],
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  // Handle dependency approval
  const data = {
    status: "approval_required",
    approval_type: "dependency",
    workflow_id: crypto.randomUUID(),
    description: approvalResult.description,
    context: {
      tool: toolName,
      dependency: {
        name: approvalResult.dependency.name,
        version: approvalResult.dependency.version,
        install: approvalResult.dependency.install,
      },
    },
    options: ["continue", "abort", "replan"],
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Extract continue_workflow from args if present.
 */
function extractContinueWorkflow(
  args: Record<string, unknown> | undefined,
): {
  continueWorkflow: ContinueWorkflowParams | undefined;
  cleanArgs: Record<string, unknown>;
} {
  if (!args) {
    return { continueWorkflow: undefined, cleanArgs: {} };
  }

  const { continue_workflow, ...cleanArgs } = args;

  if (
    continue_workflow &&
    typeof continue_workflow === "object" &&
    "approved" in continue_workflow
  ) {
    return {
      continueWorkflow: {
        approved: Boolean(
          (continue_workflow as { approved: unknown }).approved,
        ),
        workflowId: (continue_workflow as { workflow_id?: string }).workflow_id,
      },
      cleanArgs,
    };
  }

  return { continueWorkflow: undefined, cleanArgs: args };
}

/**
 * Forward a PML tool call to the cloud.
 *
 * Both pml_discover and pml_execute are handled by the cloud server
 * which has SHGAT, GraphRAG, and full execution infrastructure.
 *
 * Uses session header if registered, otherwise falls back to x-api-key detection.
 *
 * Returns the parsed JSON response for further processing.
 */
async function forwardToCloud(
  id: string | number,
  toolName: string,
  args: Record<string, unknown>,
  cloudUrl: string,
): Promise<{ ok: boolean; response?: unknown; error?: string }> {
  const apiKey = Deno.env.get("PML_API_KEY");
  if (!apiKey) {
    return { ok: false, error: "PML_API_KEY required" };
  }

  // Build headers - use session header if registered
  const headers: Record<string, string> = sessionClient?.isRegistered
    ? sessionClient.getHeaders()
    : {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      };

  try {
    const response = await fetch(`${cloudUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      }),
    });

    if (!response.ok) {
      return { ok: false, error: `Cloud error: ${response.status} ${response.statusText}` };
    }

    const result = await response.json();
    return { ok: true, response: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Cloud unreachable: ${message}` };
  }
}

/**
 * Result of local code execution.
 *
 * Can be:
 * - Success with result
 * - Error with message
 * - Approval required (HIL pause for dependency/API key/integrity)
 */
type LocalExecutionResult =
  | { status: "success"; result: unknown }
  | { status: "error"; error: string }
  | { status: "approval_required"; approval: ApprovalRequiredResult | IntegrityApprovalRequired; toolId: string };

/**
 * Execute code locally via SandboxExecutor (hybrid routing).
 *
 * Called when server returns execute_locally response.
 *
 * @param code - Code to execute in sandbox
 * @param loader - CapabilityLoader for client tool routing
 * @param cloudUrl - Cloud URL for server tool routing
 * @param continueWorkflow - Optional: approval from previous HIL pause
 * @returns Execution result, error, or approval_required for HIL
 */
async function executeLocalCode(
  code: string,
  loader: CapabilityLoader | null,
  cloudUrl: string,
  continueWorkflow?: ContinueWorkflowParams,
): Promise<LocalExecutionResult> {
  const apiKey = Deno.env.get("PML_API_KEY");

  const executor = new SandboxExecutor({
    cloudUrl,
    apiKey,
  });

  // Track if we hit an approval_required during execution
  // Use object wrapper to allow mutation tracking from closure
  type PendingApprovalType = { approval: ApprovalRequiredResult | IntegrityApprovalRequired; toolId: string };
  const state: { pendingApproval: PendingApprovalType | null } = { pendingApproval: null };

  try {
    const result = await executor.execute(
      code,
      {},
      // Client tool handler - routes through CapabilityLoader
      async (toolId: string, args: unknown) => {
        if (!loader) {
          throw new Error("Capability loader not initialized for client tools");
        }
        logDebug(`Local tool call: ${toolId}${continueWorkflow ? " (with continue_workflow)" : ""}`);
        // Pass continueWorkflow to loader.call() for approval flow
        const callResult = await loader.call(toolId, args, continueWorkflow);

        // Check if it's an approval_required response (HIL pause)
        if (CapabilityLoader.isApprovalRequired(callResult)) {
          logDebug(`Tool ${toolId} requires approval - pausing for HIL`);
          // Store the approval and throw to stop sandbox execution
          state.pendingApproval = { approval: callResult, toolId };
          throw new Error(`__APPROVAL_REQUIRED__:${toolId}`);
        }

        return callResult;
      },
    );

    if (!result.success) {
      // Check if the error was our approval marker
      if (state.pendingApproval && result.error?.message?.startsWith("__APPROVAL_REQUIRED__:")) {
        return {
          status: "approval_required",
          approval: state.pendingApproval.approval,
          toolId: state.pendingApproval.toolId,
        };
      }

      return {
        status: "error",
        error: result.error?.message ?? "Sandbox execution failed",
      };
    }

    return {
      status: "success",
      result: result.value,
    };
  } catch (error) {
    // Check if this was an approval_required that bubbled up
    if (state.pendingApproval) {
      return {
        status: "approval_required",
        approval: state.pendingApproval.approval,
        toolId: state.pendingApproval.toolId,
      };
    }

    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Parse execute_locally response from server.
 *
 * @param content - Text content from MCP response
 * @returns Parsed execute_locally data or null if not execute_locally
 */
function parseExecuteLocallyResponse(
  content: string,
): { status: string; code: string; client_tools: string[] } | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed.status === "execute_locally" && parsed.code) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Handle MCP tools/call request with capability loader
 */
async function handleToolsCall(
  id: string | number,
  params: { name: string; arguments?: Record<string, unknown> },
  loader: CapabilityLoader | null,
  cloudUrl: string,
): Promise<void> {
  const { name, arguments: args } = params;

  // Handle pml:discover - always forward to cloud
  if (name === "pml:discover") {
    const cloudResult = await forwardToCloud(id, name, args || {}, cloudUrl);
    if (!cloudResult.ok) {
      sendError(id, -32603, cloudResult.error ?? "Cloud call failed");
      return;
    }
    sendResponse(cloudResult.response);
    return;
  }

  // Handle pml:execute with hybrid routing support
  if (name === "pml:execute") {
    // Extract continue_workflow for HIL approval flow
    const { continueWorkflow: execContinueWorkflow, cleanArgs: execCleanArgs } =
      extractContinueWorkflow(args);

    if (execContinueWorkflow) {
      logDebug(`pml:execute with continue_workflow: approved=${execContinueWorkflow.approved}`);
    }

    const cloudResult = await forwardToCloud(id, name, execCleanArgs || {}, cloudUrl);

    if (!cloudResult.ok) {
      sendError(id, -32603, cloudResult.error ?? "Cloud call failed");
      return;
    }

    // Check if server returned execute_locally
    const response = cloudResult.response as {
      result?: { content?: Array<{ type: string; text: string }> };
    };
    const content = response?.result?.content?.[0]?.text;

    if (content) {
      const executeLocally = parseExecuteLocallyResponse(content);

      if (executeLocally) {
        // Server says execute locally - code contains client tools
        logDebug(
          `execute_locally received - client tools: ${executeLocally.client_tools.join(", ")}`,
        );

        const localResult = await executeLocalCode(
          executeLocally.code,
          loader,
          cloudUrl,
          execContinueWorkflow, // Pass continue_workflow for HIL approval
        );

        // Handle approval_required (HIL pause for dependency/API key/integrity)
        if (localResult.status === "approval_required") {
          logDebug(
            `Local execution paused - tool ${localResult.toolId} requires approval`,
          );
          sendResponse({
            jsonrpc: "2.0",
            id,
            result: formatApprovalRequired(localResult.toolId, localResult.approval),
          });
          return;
        }

        // Handle error
        if (localResult.status === "error") {
          sendResponse({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    status: "error",
                    error: localResult.error,
                    executed_locally: true,
                  }, null, 2),
                },
              ],
            },
          });
          return;
        }

        // Return successful local execution result
        sendResponse({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "success",
                  result: localResult.result,
                  executed_locally: true,
                }, null, 2),
              },
            ],
          },
        });
        return;
      }
    }

    // Not execute_locally - return server response as-is
    sendResponse(cloudResult.response);
    return;
  }

  // Extract continue_workflow if present (for approval flow)
  const { continueWorkflow, cleanArgs } = extractContinueWorkflow(args);

  // Check routing
  const routing = resolveToolRouting(name);
  logDebug(
    `Tool ${name} → ${routing}${
      continueWorkflow ? ` (continue: ${continueWorkflow.approved})` : ""
    }`,
  );

  if (routing === "client") {
    // Client-side execution via CapabilityLoader
    if (!loader) {
      sendError(id, -32603, "Capability loader not initialized");
      return;
    }

    try {
      // Call with continue_workflow if present (for approval flow)
      const result = await loader.call(name, cleanArgs, continueWorkflow);

      // Check if result is an approval_required response
      if (CapabilityLoader.isApprovalRequired(result)) {
        // Story 14.6 + 14.7: Handle dependency, API key, and integrity approvals
        if (result.approvalType === "api_key_required") {
          logDebug(
            `Tool ${name} requires API keys: ${result.missingKeys.join(", ")}`,
          );
        } else if (result.approvalType === "integrity") {
          logDebug(
            `Tool ${name} requires integrity approval: ${result.fqdnBase} (${result.oldHash} → ${result.newHash})`,
          );
        } else {
          // dependency
          logDebug(
            `Tool ${name} requires approval for dependency: ${result.dependency.name}`,
          );
        }
        sendResponse({
          jsonrpc: "2.0",
          id,
          result: formatApprovalRequired(name, result),
        });
        return;
      }

      // Normal result
      sendResponse({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: typeof result === "string"
                ? result
                : JSON.stringify(result, null, 2),
            },
          ],
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logDebug(`Tool error: ${message}`);
      sendError(id, -32603, `Tool execution failed: ${message}`);
    }
    return;
  }

  // Server routing - forward to pml.casys.ai
  try {
    // PML_API_KEY is required for cloud calls
    const apiKey = Deno.env.get("PML_API_KEY");
    if (!apiKey) {
      sendError(
        id,
        -32603,
        "PML_API_KEY environment variable is required for cloud calls. Set it with: export PML_API_KEY=your_key",
      );
      return;
    }

    const response = await fetch(`${cloudUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });

    if (!response.ok) {
      sendError(
        id,
        -32603,
        `Cloud error: ${response.status} ${response.statusText}`,
      );
      return;
    }

    const result = await response.json();
    sendResponse(result);
  } catch (error) {
    sendError(
      id,
      -32603,
      `Cloud unreachable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Process a single JSON-RPC request
 */
async function processRequest(
  line: string,
  loader: CapabilityLoader | null,
  cloudUrl: string,
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

  logDebug(`← ${method}`);

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
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of Deno.stdin.readable) {
    buffer += decoder.decode(chunk);

    // Process complete lines
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line) {
        await processRequest(line, loader, cloudUrl);
      }
    }
  }
}

/**
 * Create stdio command
 *
 * Usage:
 *   pml stdio                   # Start stdio server (for Claude Code)
 */
// deno-lint-ignore no-explicit-any
export function createStdioCommand(): Command<any> {
  return new Command()
    .name("stdio")
    .description("Start the PML MCP server in stdio mode (for Claude Code)")
    .action(async () => {
      // Step 1: Resolve workspace FIRST (needed for .env lookup)
      const workspaceResult = resolveWorkspaceWithDetails(silentLogger);
      const workspace = workspaceResult.path;

      // Step 2: Auto-load .env from workspace if PML_API_KEY not already set
      if (!Deno.env.get("PML_API_KEY")) {
        try {
          await reloadEnv(workspace);
          if (Deno.env.get("PML_API_KEY")) {
            logDebug(`Loaded PML_API_KEY from workspace .env`);
          }
        } catch (error) {
          logDebug(`Failed to load .env: ${error}`);
        }
      }

      // Step 3: Verify PML_API_KEY is set (required for all operations)
      const apiKey = Deno.env.get("PML_API_KEY");
      if (!apiKey) {
        console.error(
          "[pml] ERROR: PML_API_KEY environment variable is required",
        );
        console.error("[pml] Set it with: export PML_API_KEY=your_key");
        console.error("[pml] Or add PML_API_KEY=your_key to .env in your project");
        Deno.exit(1);
      }

      if (!isValidWorkspace(workspace)) {
        logDebug(`Invalid workspace: ${workspace}`);
        Deno.exit(1);
      }

      const configPath = join(workspace, PML_CONFIG_FILE);

      // Step 2: Load config
      const defaultConfig: PmlConfig = {
        version: "0.1.0",
        workspace,
        cloud: { url: "https://pml.casys.ai", apiKey: "${PML_API_KEY}" },
        server: { port: 3003 },
        permissions: { allow: [], deny: [], ask: ["*"] },
      };

      let config: PmlConfig = defaultConfig;
      if (await exists(configPath)) {
        try {
          const content = await Deno.readTextFile(configPath);
          config = { ...defaultConfig, ...JSON.parse(content) };
        } catch (error) {
          logDebug(`Failed to load config: ${error}`);
        }
      }

      // Step 3: Load permissions
      const { permissions } = await loadUserPermissions(
        workspace,
        silentLogger,
      );

      // Step 4: Sync routing config from cloud
      // Env var override for testing/development
      const cloudUrl = Deno.env.get("PML_CLOUD_URL") ?? config.cloud?.url ?? "https://pml.casys.ai";
      const { config: routingConfig } = await syncRoutingConfig(
        cloudUrl,
        silentLogger,
      );
      initializeRouting(routingConfig);

      // Step 5: Register session with server (handshake)
      try {
        sessionClient = new SessionClient({
          cloudUrl,
          apiKey,
          version: PACKAGE_VERSION,
          workspace,
        });
        await sessionClient.register();
        logDebug(`Session registered: ${sessionClient.sessionId?.slice(0, 8)}`);
      } catch (error) {
        // Registration failure is not fatal - fallback to x-api-key detection
        logDebug(`Session registration failed (non-fatal): ${error}`);
        sessionClient = null;
      }

      logDebug(
        `Workspace: ${workspace} (${
          getWorkspaceSourceDescription(workspaceResult)
        })`,
      );
      logDebug(`Cloud: ${cloudUrl}`);
      logDebug(
        `Routing: v${getRoutingVersion()} (${
          isRoutingInitialized() ? "ready" : "failed"
        })`,
      );

      // Step 5: Initialize CapabilityLoader
      // Note: HIL (approval_required) is handled via MCP response, not callback
      let loader: CapabilityLoader | null = null;
      try {
        // Story 14.7: Initialize lockfile manager for integrity validation (per-project)
        const lockfileManager = new LockfileManager({ workspace });
        await lockfileManager.load(); // Create/load lockfile

        loader = await CapabilityLoader.create({
          cloudUrl,
          workspace,
          permissions,
          lockfileManager, // Story 14.7: Enable integrity validation
        });
        logDebug(`CapabilityLoader initialized with permissions + lockfile`);
      } catch (error) {
        logDebug(`Failed to initialize CapabilityLoader: ${error}`);
        // Continue without loader - server-side calls will still work
      }

      // Step 7: Start stdio loop
      try {
        await runStdioLoop(loader, cloudUrl);
      } finally {
        // Cleanup on exit
        loader?.shutdown();
        // Graceful session unregister
        if (sessionClient) {
          await sessionClient.shutdown();
          logDebug("Session unregistered");
        }
      }
    });
}
