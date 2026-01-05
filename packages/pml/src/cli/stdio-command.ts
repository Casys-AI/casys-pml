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
function sendError(id: string | number | null, code: number, message: string): void {
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
  // TODO: Story 14.4 will populate this from registry
  sendResponse({
    jsonrpc: "2.0",
    id,
    result: {
      tools: [],
    },
  });
}

/**
 * Handle MCP tools/call request
 */
async function handleToolsCall(
  id: string | number,
  params: { name: string; arguments?: Record<string, unknown> },
  cloudUrl: string,
  _workspace: string,
): Promise<void> {
  const { name, arguments: args } = params;

  // Check routing
  const routing = resolveToolRouting(name);
  logDebug(`Tool ${name} → ${routing}`);

  if (routing === "local") {
    // TODO: Story 14.5 - Sandboxed local execution
    sendError(id, -32601, `Local tool execution not yet implemented: ${name}`);
    return;
  }

  // Cloud routing - forward to pml.casys.ai
  try {
    const response = await fetch(`${cloudUrl}/mcp/tools/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // TODO: Add PML_API_KEY for authenticated calls
      },
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
  cloudUrl: string,
  workspace: string,
): Promise<void> {
  let request: { jsonrpc: string; id?: string | number; method: string; params?: unknown };

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
          cloudUrl,
          workspace,
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
async function runStdioLoop(cloudUrl: string, workspace: string): Promise<void> {
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
        await processRequest(line, cloudUrl, workspace);
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
      await loadUserPermissions(workspace, silentLogger);

      // Step 4: Sync routing config from cloud
      const cloudUrl = config.cloud?.url ?? "https://pml.casys.ai";
      const { config: routingConfig } = await syncRoutingConfig(cloudUrl, silentLogger);
      initializeRouting(routingConfig);

      logDebug(`Workspace: ${workspace} (${getWorkspaceSourceDescription(workspaceResult)})`);
      logDebug(`Cloud: ${cloudUrl}`);
      logDebug(`Routing: v${getRoutingVersion()} (${isRoutingInitialized() ? "ready" : "failed"})`);

      // Step 5: Start stdio loop
      await runStdioLoop(cloudUrl, workspace);
    });
}
