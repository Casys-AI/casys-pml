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
} from "../loader/mod.ts";
import { exists } from "@std/fs";
import { join } from "@std/path";

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
 * Handle MCP tools/list request
 */
function handleToolsList(id: string | number): void {
  // For now, return an empty list - tools will be dynamically discovered
  // Future: Could fetch available tools from registry
  sendResponse({
    jsonrpc: "2.0",
    id,
    result: {
      tools: [],
    },
  });
}

/**
 * Format approval_required MCP response.
 *
 * Uses the same pattern as main codebase (src/mcp/server/responses.ts).
 * Stateless: No workflow state stored - capability metadata contains all info.
 *
 * Story 14.6: Supports both dependency and API key approval types.
 */
function formatApprovalRequired(
  toolName: string,
  approvalResult: ApprovalRequiredResult,
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
 * Handle MCP tools/call request with capability loader
 */
async function handleToolsCall(
  id: string | number,
  params: { name: string; arguments?: Record<string, unknown> },
  loader: CapabilityLoader | null,
  cloudUrl: string,
): Promise<void> {
  const { name, arguments: args } = params;

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
        // Story 14.6: Handle both dependency and API key approvals
        if (result.approvalType === "api_key_required") {
          logDebug(
            `Tool ${name} requires API keys: ${result.missingKeys.join(", ")}`,
          );
        } else {
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

    const response = await fetch(`${cloudUrl}/mcp/tools/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
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
      // Step 0: Verify PML_API_KEY is set (required for all operations)
      const apiKey = Deno.env.get("PML_API_KEY");
      if (!apiKey) {
        console.error(
          "[pml] ERROR: PML_API_KEY environment variable is required",
        );
        console.error("[pml] Set it with: export PML_API_KEY=your_key");
        Deno.exit(1);
      }

      // Step 1: Resolve workspace
      const workspaceResult = resolveWorkspaceWithDetails(silentLogger);
      const workspace = workspaceResult.path;

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
      const cloudUrl = config.cloud?.url ?? "https://pml.casys.ai";
      const { config: routingConfig } = await syncRoutingConfig(
        cloudUrl,
        silentLogger,
      );
      initializeRouting(routingConfig);

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
        loader = await CapabilityLoader.create({
          cloudUrl,
          workspace,
          permissions,
        });
        logDebug(`CapabilityLoader initialized with permissions`);
      } catch (error) {
        logDebug(`Failed to initialize CapabilityLoader: ${error}`);
        // Continue without loader - server-side calls will still work
      }

      // Step 6: Start stdio loop
      try {
        await runStdioLoop(loader, cloudUrl);
      } finally {
        // Cleanup on exit
        loader?.shutdown();
      }
    });
}
