/**
 * Serve Command
 *
 * Starts the PML MCP HTTP server for debugging and testing.
 * Same logic as stdio-command but with HTTP instead of stdin/stdout.
 *
 * @module cli/serve-command
 */

import { Command } from "@cliffy/command";
import * as colors from "@std/fmt/colors";
import { exists } from "@std/fs";
import { join } from "@std/path";
import { Hono } from "hono";
import { cors } from "hono/cors";
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
  syncRoutingConfig,
} from "../routing/mod.ts";
import {
  type ApprovalRequiredResult,
  CapabilityLoader,
  type ContinueWorkflowParams,
  type IntegrityApprovalRequired,
  type ToolPermissionApprovalRequired,
  LockfileManager,
} from "../loader/mod.ts";
import { SandboxExecutor } from "../execution/mod.ts";
import { SessionClient } from "../session/mod.ts";
import { PendingWorkflowStore } from "../workflow/mod.ts";
import type { ToolCallRecord } from "../execution/types.ts";
import { reloadEnv } from "../byok/env-loader.ts";

const PML_CONFIG_FILE = ".pml.json";
const PACKAGE_VERSION = "0.2.0";

// Serve mode = debug mode - always enable logs
Deno.env.set("PML_DEBUG", "1");

/** Active session client */
let sessionClient: SessionClient | null = null;

/** Pending workflow store for HIL flows */
const pendingWorkflowStore = new PendingWorkflowStore();

const silentLogger = { info: () => {}, warn: () => {} };

function log(message: string): void {
  console.log(`${colors.dim(new Date().toISOString())} ${message}`);
}

/**
 * Format approval_required response (same as stdio-command.ts)
 */
function formatApprovalRequired(
  toolName: string,
  approvalResult: ApprovalRequiredResult | IntegrityApprovalRequired | ToolPermissionApprovalRequired,
  originalCode?: string,
  fqdnMap?: Record<string, string>,
): { content: Array<{ type: string; text: string }> } {
  // Handle tool permission approval
  if (approvalResult.approvalType === "tool_permission") {
    const workflowId = approvalResult.workflowId;
    if (originalCode) {
      pendingWorkflowStore.setWithId(workflowId, originalCode, approvalResult.toolId, "tool_permission", {
        namespace: approvalResult.namespace,
        needsInstallation: approvalResult.needsInstallation,
        dependency: approvalResult.dependency,
        fqdnMap,
      });
    }
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "approval_required",
          approval_type: "tool_permission",
          workflow_id: workflowId,
          description: approvalResult.description,
          context: {
            tool: toolName,
            tool_id: approvalResult.toolId,
            namespace: approvalResult.namespace,
            needs_installation: approvalResult.needsInstallation,
            dependency: approvalResult.dependency ? {
              name: approvalResult.dependency.name,
              version: approvalResult.dependency.version,
              install: approvalResult.dependency.install,
            } : undefined,
          },
          options: ["continue", "abort"],
        }, null, 2),
      }],
    };
  }

  // Handle API key approval
  if (approvalResult.approvalType === "api_key_required") {
    const workflowId = approvalResult.workflowId;
    if (originalCode) {
      pendingWorkflowStore.setWithId(workflowId, originalCode, toolName, "api_key_required", {
        missingKeys: approvalResult.missingKeys,
        fqdnMap,
      });
    }
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "approval_required",
          approval_type: "api_key_required",
          workflow_id: workflowId,
          context: {
            tool: toolName,
            missing_keys: approvalResult.missingKeys,
            instruction: approvalResult.instruction,
          },
          options: ["continue", "abort"],
        }, null, 2),
      }],
    };
  }

  // Handle integrity approval
  if (approvalResult.approvalType === "integrity") {
    const workflowId = approvalResult.workflowId;
    if (originalCode) {
      pendingWorkflowStore.setWithId(workflowId, originalCode, toolName, "integrity", {
        integrityInfo: {
          fqdnBase: approvalResult.fqdnBase,
          newHash: approvalResult.newHash,
          oldHash: approvalResult.oldHash,
        },
        fqdnMap,
      });
    }
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "approval_required",
          approval_type: "integrity",
          workflow_id: workflowId,
          description: approvalResult.description,
          context: {
            tool: toolName,
            fqdn_base: approvalResult.fqdnBase,
            old_hash: approvalResult.oldHash,
            new_hash: approvalResult.newHash,
          },
          options: ["continue", "abort"],
        }, null, 2),
      }],
    };
  }

  // Handle dependency approval (legacy)
  const workflowId = approvalResult.workflowId;
  if (originalCode) {
    pendingWorkflowStore.setWithId(workflowId, originalCode, toolName, "dependency", {
      dependency: approvalResult.dependency,
      fqdnMap,
    });
  }
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        status: "approval_required",
        approval_type: "dependency",
        workflow_id: workflowId,
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
      }, null, 2),
    }],
  };
}

/**
 * Extract continue_workflow from args
 */
function extractContinueWorkflow(args: Record<string, unknown> | undefined): {
  continueWorkflow: ContinueWorkflowParams | undefined;
  cleanArgs: Record<string, unknown>;
} {
  if (!args) return { continueWorkflow: undefined, cleanArgs: {} };
  const { continue_workflow, ...cleanArgs } = args;
  if (continue_workflow && typeof continue_workflow === "object" && "approved" in continue_workflow) {
    return {
      continueWorkflow: {
        approved: Boolean((continue_workflow as { approved: unknown }).approved),
        workflowId: (continue_workflow as { workflow_id?: string }).workflow_id,
      },
      cleanArgs,
    };
  }
  return { continueWorkflow: undefined, cleanArgs: args };
}

/**
 * Forward to cloud server
 */
async function forwardToCloud(
  id: string | number,
  toolName: string,
  args: Record<string, unknown>,
  cloudUrl: string,
): Promise<{ ok: boolean; response?: unknown; error?: string }> {
  const apiKey = Deno.env.get("PML_API_KEY");
  if (!apiKey) return { ok: false, error: "PML_API_KEY required" };

  const headers: Record<string, string> = sessionClient?.isRegistered
    ? sessionClient.getHeaders()
    : { "Content-Type": "application/json", "x-api-key": apiKey };

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
      return { ok: false, error: `Cloud error: ${response.status}` };
    }
    return { ok: true, response: await response.json() };
  } catch (error) {
    return { ok: false, error: `Cloud unreachable: ${error}` };
  }
}

/**
 * Execute code locally
 */
type LocalExecutionResult =
  | { status: "success"; result: unknown; durationMs: number; toolCallRecords: ToolCallRecord[] }
  | { status: "error"; error: string }
  | { status: "approval_required"; approval: ApprovalRequiredResult | IntegrityApprovalRequired; toolId: string };

async function executeLocalCode(
  code: string,
  loader: CapabilityLoader | null,
  cloudUrl: string,
  fqdnMap: Map<string, string>,
  continueWorkflow?: ContinueWorkflowParams,
): Promise<LocalExecutionResult> {
  const apiKey = Deno.env.get("PML_API_KEY");
  const executor = new SandboxExecutor({ cloudUrl, apiKey });

  type PendingApprovalType = { approval: ApprovalRequiredResult | IntegrityApprovalRequired; toolId: string };
  const state: { pendingApproval: PendingApprovalType | null } = { pendingApproval: null };

  try {
    const result = await executor.execute(
      code,
      {},
      async (toolId: string, args: unknown) => {
        if (!loader) throw new Error("Capability loader not initialized");
        const fqdn = fqdnMap.get(toolId);
        if (!fqdn) throw new Error(`No FQDN for ${toolId}`);

        log(`  → ${toolId} (${fqdn})`);
        const callResult = await loader.callWithFqdn(fqdn, args, continueWorkflow);

        if (CapabilityLoader.isApprovalRequired(callResult)) {
          state.pendingApproval = { approval: callResult, toolId };
          throw new Error(`__APPROVAL_REQUIRED__:${toolId}`);
        }
        return callResult;
      },
    );

    if (!result.success) {
      if (state.pendingApproval && result.error?.message?.startsWith("__APPROVAL_REQUIRED__:")) {
        return { status: "approval_required", approval: state.pendingApproval.approval, toolId: state.pendingApproval.toolId };
      }
      return { status: "error", error: result.error?.message ?? "Execution failed" };
    }
    return { status: "success", result: result.value, durationMs: result.durationMs, toolCallRecords: result.toolCallRecords ?? [] };
  } catch (error) {
    if (state.pendingApproval) {
      return { status: "approval_required", approval: state.pendingApproval.approval, toolId: state.pendingApproval.toolId };
    }
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Parse execute_locally response
 */
function parseExecuteLocallyResponse(content: string): {
  status: string;
  code: string;
  client_tools: string[];
  tools_used: Array<{ id: string; fqdn: string }>;
  workflowId?: string;
} | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed.status === "execute_locally" && parsed.code) {
      return {
        status: parsed.status,
        code: parsed.code,
        client_tools: parsed.client_tools ?? [],
        tools_used: parsed.tools_used ?? [],
        workflowId: parsed.workflowId ?? parsed.workflow_id,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// deno-lint-ignore no-explicit-any
export function createServeCommand(): Command<any> {
  return new Command()
    .name("serve")
    .description("Start the PML MCP HTTP server (for debugging)")
    .option("-p, --port <port:number>", "Server port", { default: 3004 })
    .action(async (options) => {
      const workspaceResult = resolveWorkspaceWithDetails(silentLogger);
      const workspace = workspaceResult.path;

      // Load .env
      if (!Deno.env.get("PML_API_KEY")) {
        try {
          await reloadEnv(workspace);
        } catch { /* ignore */ }
      }

      const apiKey = Deno.env.get("PML_API_KEY");
      if (!apiKey) {
        console.error(colors.red("ERROR: PML_API_KEY required"));
        Deno.exit(1);
      }

      if (!isValidWorkspace(workspace)) {
        console.error(colors.red(`Invalid workspace: ${workspace}`));
        Deno.exit(1);
      }

      // Load config
      const configPath = join(workspace, PML_CONFIG_FILE);
      let config: PmlConfig = {
        version: "0.1.0",
        workspace,
        cloud: { url: "https://pml.casys.ai" },
        permissions: { allow: [], deny: [], ask: ["*"] },
      };
      if (await exists(configPath)) {
        try {
          config = { ...config, ...JSON.parse(await Deno.readTextFile(configPath)) };
        } catch { /* ignore */ }
      }

      // Load permissions
      const { permissions } = await loadUserPermissions(workspace, silentLogger);

      // Sync routing
      const cloudUrl = Deno.env.get("PML_CLOUD_URL") ?? config.cloud?.url ?? "https://pml.casys.ai";
      const { config: routingConfig } = await syncRoutingConfig(cloudUrl, silentLogger);
      initializeRouting(routingConfig);

      // Register session
      try {
        sessionClient = new SessionClient({ cloudUrl, apiKey, version: PACKAGE_VERSION, workspace });
        await sessionClient.register();
        log(`${colors.green("✓")} Session registered: ${sessionClient.sessionId?.slice(0, 8)}`);
      } catch (error) {
        log(`${colors.yellow("⚠")} Session registration failed: ${error}`);
        sessionClient = null;
      }

      // Initialize loader
      let loader: CapabilityLoader | null = null;
      let lockfileManager: LockfileManager | null = null;
      try {
        lockfileManager = new LockfileManager({ workspace });
        await lockfileManager.load();
        loader = await CapabilityLoader.create({ cloudUrl, workspace, permissions, lockfileManager });
        log(`${colors.green("✓")} CapabilityLoader ready`);
      } catch (error) {
        log(`${colors.yellow("⚠")} CapabilityLoader failed: ${error}`);
      }

      const port = options.port;

      console.log(colors.bold(colors.cyan("\n🚀 PML HTTP Server\n")));
      console.log(`  ${colors.dim("Port:")} ${port}`);
      console.log(`  ${colors.dim("Workspace:")} ${workspace}`);
      console.log(`  ${colors.dim("Cloud:")} ${cloudUrl}`);
      console.log(`  ${colors.dim("Routing:")} v${getRoutingVersion()} (${isRoutingInitialized() ? "ready" : "failed"})`);
      console.log(`  ${colors.dim("Session:")} ${sessionClient?.sessionId?.slice(0, 8) ?? "none"}`);
      console.log();

      // Create Hono app
      const app = new Hono();

      // CORS middleware (same as main server)
      app.use("*", cors({
        origin: "*",
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Accept", "mcp-protocol-version"],
        exposeHeaders: ["Content-Length"],
        maxAge: 600,
      }));

      // Health check
      app.get("/health", (c) => c.json({ status: "ok" }));

      // MCP endpoint - GET returns 405 (Streamable HTTP spec: server doesn't support inbound streams)
      app.get("/mcp", (c) => c.text("", 405));
      app.get("/", (c) => c.text("", 405));

      // MCP endpoint - POST handles JSON-RPC
      // deno-lint-ignore no-explicit-any
      const handleMcpPost = async (c: any) => {
          try {
            const body = await c.req.json();
            const { id, method, params } = body;

            // Log non-tools/call methods only (tools/call logged below with reqId)
            if (method !== "tools/call") {
              log(`← ${method} ${params?.name ?? ""}`);
            }

            // Initialize
            if (method === "initialize") {
              return c.json({
                jsonrpc: "2.0",
                id,
                result: {
                  protocolVersion: "2024-11-05",
                  capabilities: { tools: {} },
                  serverInfo: { name: "pml", version: PACKAGE_VERSION },
                },
              });
            }

            // Tools list
            if (method === "tools/list") {
              return c.json({
                jsonrpc: "2.0",
                id,
                result: {
                  tools: [
                    { name: "pml:discover", description: "Search tools", inputSchema: { type: "object", properties: { intent: { type: "string" } }, required: ["intent"] } },
                    { name: "pml:execute", description: "Execute code", inputSchema: { type: "object", properties: { intent: { type: "string" }, code: { type: "string" }, continue_workflow: { type: "object", properties: { approved: { type: "boolean" }, workflow_id: { type: "string" } } } } } },
                    { name: "pml:test", description: "Test instant response", inputSchema: { type: "object", properties: { delay: { type: "number", description: "Delay in ms" } } } },
                  ],
                },
              });
            }

            // Tools call
            if (method === "tools/call" && params?.name) {
              const reqId = Math.random().toString(36).slice(2, 8);
              log(`← tools/call ${params.name} [${reqId}]`);

              const { name, arguments: args } = params;

              // DEBUG: Test response with configurable delay
              if (name === "pml:test") {
                const delayMs = (args as { delay?: number })?.delay ?? 0;
                log(`  → test response (delay=${delayMs}ms)`);
                if (delayMs > 0) {
                  await new Promise(r => setTimeout(r, delayMs));
                }
                log(`  → sending test response`);
                return c.json({
                  jsonrpc: "2.0",
                  id,
                  result: { content: [{ type: "text", text: JSON.stringify({ test: "ok", time: Date.now(), delay: delayMs }) }] },
                });
              }
              const { continueWorkflow, cleanArgs } = extractContinueWorkflow(args);

              // Handle continue_workflow for local pending workflows
              if (continueWorkflow?.workflowId) {
                const pending = pendingWorkflowStore.get(continueWorkflow.workflowId);
                if (pending) {
                  log(`  Continuing workflow: ${continueWorkflow.workflowId.slice(0, 8)}`);

                  if (!continueWorkflow.approved) {
                    pendingWorkflowStore.delete(continueWorkflow.workflowId);
                    return c.json({
                      jsonrpc: "2.0",
                      id,
                      result: { content: [{ type: "text", text: JSON.stringify({ status: "aborted" }) }] },
                    });
                  }

                  // Pre-continuation actions
                  if (pending.approvalType === "tool_permission" && loader && pending.toolId) {
                    loader.approveToolForSession(pending.toolId);
                  } else if (pending.approvalType === "api_key_required") {
                    await reloadEnv(workspace);
                  }

                  const fqdnMap = new Map(Object.entries(pending.fqdnMap ?? {}));
                  const result = await executeLocalCode(pending.code, loader, cloudUrl, fqdnMap, { approved: true, workflowId: continueWorkflow.workflowId });
                  pendingWorkflowStore.delete(continueWorkflow.workflowId);

                  if (result.status === "approval_required") {
                    return c.json({
                      jsonrpc: "2.0",
                      id,
                      result: formatApprovalRequired(result.toolId, result.approval, pending.code, pending.fqdnMap),
                    });
                  }
                  if (result.status === "error") {
                    return c.json({
                      jsonrpc: "2.0",
                      id,
                      result: { content: [{ type: "text", text: JSON.stringify({ status: "error", error: result.error }) }] },
                    });
                  }
                  return c.json({
                    jsonrpc: "2.0",
                    id,
                    result: { content: [{ type: "text", text: JSON.stringify({ status: "success", result: result.result }) }] },
                  });
                }
              }

              // Forward to cloud
              log(`  → forwarding to cloud...`);
              const t0 = Date.now();
              const cloudResult = await forwardToCloud(id, name, cleanArgs, cloudUrl);
              log(`  ← cloud responded in ${Date.now() - t0}ms`);
              if (!cloudResult.ok) {
                return c.json({ jsonrpc: "2.0", id, error: { code: -32603, message: cloudResult.error } });
              }

              // Check for execute_locally
              const response = cloudResult.response as { result?: { content?: Array<{ text: string }> } };
              const content = response?.result?.content?.[0]?.text;
              if (content) {
                const executeLocally = parseExecuteLocallyResponse(content);
                if (executeLocally) {
                  log(`  execute_locally: ${executeLocally.client_tools.join(", ")}`);

                  const fqdnMap = new Map(executeLocally.tools_used.map(t => [t.id, t.fqdn]));
                  const result = await executeLocalCode(executeLocally.code, loader, cloudUrl, fqdnMap, continueWorkflow);

                  if (result.status === "approval_required") {
                    log(`  ${colors.yellow("⏸")} approval_required: ${result.toolId}`);
                    return c.json({
                      jsonrpc: "2.0",
                      id,
                      result: formatApprovalRequired(result.toolId, result.approval, executeLocally.code, Object.fromEntries(fqdnMap)),
                    });
                  }
                  if (result.status === "error") {
                    log(`  ${colors.red("✗")} error: ${result.error}`);
                    return c.json({
                      jsonrpc: "2.0",
                      id,
                      result: { content: [{ type: "text", text: JSON.stringify({ status: "error", error: result.error, executed_locally: true }) }] },
                    });
                  }
                  log(`  ${colors.green("✓")} success (${result.durationMs}ms)`);
                  return c.json({
                    jsonrpc: "2.0",
                    id,
                    result: { content: [{ type: "text", text: JSON.stringify({ status: "success", result: result.result, executed_locally: true }) }] },
                  });
                }
              }

              // Return cloud response as-is using Hono
              log(`  → returning cloud response`);
              return c.json(cloudResult.response);
            }

            return c.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
          } catch (error) {
            log(`${colors.red("✗")} Error: ${error}`);
            return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
          }
      };

      // Register POST routes for MCP
      app.post("/mcp", handleMcpPost);
      app.post("/", handleMcpPost);

      // Graceful shutdown handler
      const shutdown = async () => {
        log(`${colors.yellow("⚠")} Shutting down...`);

        // Shutdown loader (kills spawned mcp-std processes)
        if (loader) {
          await loader.shutdown();
          log(`${colors.dim("✓")} CapabilityLoader shutdown`);
        }

        // Shutdown session
        if (sessionClient) {
          await sessionClient.shutdown();
          log(`${colors.dim("✓")} Session unregistered`);
        }

        log(`${colors.green("✓")} Cleanup complete`);
        Deno.exit(0);
      };

      // Register signal handlers
      Deno.addSignalListener("SIGTERM", shutdown);
      Deno.addSignalListener("SIGINT", shutdown);

      Deno.serve({ port }, app.fetch);
    });
}
