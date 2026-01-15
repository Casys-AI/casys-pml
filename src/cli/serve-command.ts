/**
 * Serve Command
 *
 * Starts the PML MCP HTTP server for debugging and testing.
 * Uses shared utilities from ./shared/ for common functionality.
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
import { CapabilityLoader, LockfileManager } from "../loader/mod.ts";
import { SessionClient } from "../session/mod.ts";
import { PendingWorkflowStore } from "../workflow/mod.ts";
import { TraceSyncer, type LocalExecutionTrace, type JsonValue } from "../tracing/mod.ts";
import { reloadEnv } from "../byok/env-loader.ts";

// Shared utilities
import {
  PML_CONFIG_FILE,
  PACKAGE_VERSION,
  SILENT_LOGGER,
  PML_TOOLS,
  forwardToCloud,
  extractContinueWorkflow,
  parseExecuteLocallyResponse,
  formatApprovalRequired,
  executeLocalCode,
  type AnyApprovalResult,
} from "./shared/mod.ts";

// Serve mode = debug mode - always enable logs
Deno.env.set("PML_DEBUG", "1");

/** Active session client */
let sessionClient: SessionClient | null = null;

/** Trace syncer for sending execution traces to cloud */
let traceSyncer: TraceSyncer | null = null;

/** Pending workflow store for HIL flows */
const pendingWorkflowStore = new PendingWorkflowStore();

/** HTTP-specific colored logger */
function log(message: string): void {
  console.log(`${colors.dim(new Date().toISOString())} ${message}`);
}

/** Logger adapter for shared utilities */
const httpLogger = {
  debug: (msg: string) => log(msg),
};

// deno-lint-ignore no-explicit-any
export function createServeCommand(): Command<any> {
  return new Command()
    .name("serve")
    .description("Start the PML MCP HTTP server (for debugging)")
    .option("-p, --port <port:number>", "Server port", { default: 3004 })
    .action(async (options) => {
      const workspaceResult = resolveWorkspaceWithDetails(SILENT_LOGGER);
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
        version: PACKAGE_VERSION,
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
      const { permissions } = await loadUserPermissions(workspace, SILENT_LOGGER);

      // Sync routing
      const cloudUrl = Deno.env.get("PML_CLOUD_URL") ?? config.cloud?.url ?? "https://pml.casys.ai";
      const { config: routingConfig } = await syncRoutingConfig(cloudUrl, SILENT_LOGGER);
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

      // Initialize TraceSyncer for capability creation after local execution
      traceSyncer = new TraceSyncer({
        cloudUrl,
        apiKey,
        batchSize: 10,
        flushIntervalMs: 5000,
        maxRetries: 3,
      });
      log(`${colors.green("✓")} TraceSyncer ready`);

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

      // CORS middleware
      app.use("*", cors({
        origin: "*",
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Accept", "mcp-protocol-version"],
        exposeHeaders: ["Content-Length"],
        maxAge: 600,
      }));

      // Health check
      app.get("/health", (c) => c.json({ status: "ok" }));

      // MCP endpoint - GET returns 405 (Streamable HTTP spec)
      app.get("/mcp", (c) => c.text("", 405));
      app.get("/", (c) => c.text("", 405));

      // MCP endpoint - POST handles JSON-RPC
      // deno-lint-ignore no-explicit-any
      const handleMcpPost = async (c: any) => {
        try {
          const body = await c.req.json();
          const { id, method, params } = body;

          // Log non-tools/call methods
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
              result: { tools: PML_TOOLS },
            });
          }

          // Tools call
          if (method === "tools/call" && params?.name) {
            const reqId = Math.random().toString(36).slice(2, 8);
            log(`← tools/call ${params.name} [${reqId}]`);

            const { name, arguments: args } = params;
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
                const result = await executeLocalCode(
                  pending.code,
                  loader,
                  cloudUrl,
                  fqdnMap,
                  { approved: true, workflowId: continueWorkflow.workflowId },
                  httpLogger,
                );
                pendingWorkflowStore.delete(continueWorkflow.workflowId);

                if (result.status === "approval_required") {
                  return c.json({
                    jsonrpc: "2.0",
                    id,
                    result: formatApprovalRequired(
                      result.toolId,
                      result.approval as AnyApprovalResult,
                      pendingWorkflowStore,
                      pending.code,
                      pending.fqdnMap,
                    ),
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
            const cloudResult = await forwardToCloud(id, name, cleanArgs, cloudUrl, sessionClient);
            log(`  ← cloud responded in ${Date.now() - t0}ms`);

            if (!cloudResult.ok) {
              return c.json({ jsonrpc: "2.0", id, error: { code: -32603, message: cloudResult.error } });
            }

            // Check for execute_locally
            const response = cloudResult.response as { result?: { content?: Array<{ text: string }> } };
            const content = response?.result?.content?.[0]?.text;
            if (content) {
              const execLocally = parseExecuteLocallyResponse(content);
              if (execLocally) {
                log(`  execute_locally: ${execLocally.client_tools.join(", ")}`);

                const fqdnMap = new Map(execLocally.tools_used.map(t => [t.id, t.fqdn]));
                const result = await executeLocalCode(
                  execLocally.code,
                  loader,
                  cloudUrl,
                  fqdnMap,
                  continueWorkflow,
                  httpLogger,
                );

                if (result.status === "approval_required") {
                  log(`  ${colors.yellow("⏸")} approval_required: ${result.toolId}`);
                  return c.json({
                    jsonrpc: "2.0",
                    id,
                    result: formatApprovalRequired(
                      result.toolId,
                      result.approval as AnyApprovalResult,
                      pendingWorkflowStore,
                      execLocally.code,
                      Object.fromEntries(fqdnMap),
                    ),
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
                // Send trace to finalize capability creation if workflowId present
                if (execLocally.workflowId && traceSyncer) {
                  const trace: LocalExecutionTrace = {
                    workflowId: execLocally.workflowId,
                    capabilityId: "",
                    success: true,
                    durationMs: result.durationMs,
                    taskResults: result.toolCallRecords.map((record, i) => ({
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
                  log(`  Trace queued: ${execLocally.workflowId.slice(0, 8)}`);
                }

                log(`  ${colors.green("✓")} success (${result.durationMs}ms)`);
                return c.json({
                  jsonrpc: "2.0",
                  id,
                  result: { content: [{ type: "text", text: JSON.stringify({ status: "success", result: result.result, executed_locally: true }) }] },
                });
              }
            }

            // Return cloud response as-is
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

        if (loader) {
          await loader.shutdown();
          log(`${colors.dim("✓")} CapabilityLoader shutdown`);
        }

        if (traceSyncer) {
          await traceSyncer.shutdown();
          log(`${colors.dim("✓")} TraceSyncer shutdown`);
        }

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
