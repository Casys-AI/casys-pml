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
import { cors } from "jsr:@hono/hono@^4/cors";
import type { PmlConfig } from "../types.ts";
import type { MCPResource, ResourceContent } from "@casys/mcp-server";
import { MCP_APP_MIME_TYPE } from "@casys/mcp-server";
import {
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
import { CapabilityLoader, LockfileManager, StdioManager } from "../loader/mod.ts";
import { loadMcpServers } from "../config.ts";
import { discoverAllMcpToolsWithTimeout, summarizeDiscovery, syncDiscoveredTools } from "../discovery/mod.ts";
import { ConfigWatcher } from "../discovery/config-watcher.ts";
import { SessionClient } from "../session/mod.ts";
import { PendingWorkflowStore } from "../workflow/mod.ts";
import { TraceSyncer } from "../tracing/mod.ts";
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

/** Config watcher for hot-reload of mcpServers */
let configWatcher: ConfigWatcher | null = null;

/** Pending workflow store for HIL flows */
const pendingWorkflowStore = new PendingWorkflowStore();

/** Resource store for MCP Apps (Story 16.2) */
type ResourceHandler = (uri: URL) => Promise<ResourceContent> | ResourceContent;
const resourceStore = new Map<string, { resource: MCPResource; handler: ResourceHandler }>();

/**
 * Register a resource for MCP Apps
 * @public - Will be used by Story 16.3 (UI Collection)
 */
export function registerResource(resource: MCPResource, handler: ResourceHandler): void {
  resourceStore.set(resource.uri, { resource, handler });
}

/**
 * Get all registered resources
 */
function getResources(): MCPResource[] {
  return Array.from(resourceStore.values()).map(r => ({
    ...r.resource,
    mimeType: r.resource.mimeType ?? MCP_APP_MIME_TYPE,
  }));
}

/**
 * Read a resource by URI
 */
async function readResource(uri: string): Promise<ResourceContent | null> {
  const entry = resourceStore.get(uri);
  if (!entry) return null;
  return await entry.handler(new URL(uri));
}

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
        } catch (e) {
          // .env loading failure is non-fatal - API key check below will catch missing key
          console.warn(colors.yellow(`Warning: Failed to load .env: ${e instanceof Error ? e.message : e}`));
        }
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
        } catch (e) {
          console.warn(colors.yellow(`Warning: Failed to parse ${PML_CONFIG_FILE}: ${e instanceof Error ? e.message : e}`));
          console.warn(colors.yellow("Using default configuration."));
        }
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
      // ADR-065: explicit flush only, no auto-flush timer
      traceSyncer = new TraceSyncer({
        cloudUrl,
        apiKey,
        batchSize: 10,
        maxRetries: 3,
      });
      log(`${colors.green("✓")} TraceSyncer ready`);

      // Discover tools from user-configured MCP servers
      const userMcpServers = loadMcpServers(config);
      log(`${colors.dim("mcpServers in config:")} ${config.mcpServers ? Object.keys(config.mcpServers).length : 0}`);
      log(`${colors.dim("userMcpServers loaded:")} ${userMcpServers.size}`);
      if (userMcpServers.size > 0) {
        log(`${colors.dim("⟳")} Discovering tools from ${userMcpServers.size} MCP server(s)...`);

        // Run discovery in background (don't block server startup)
        (async () => {
          const discoveryManager = new StdioManager(60_000); // 1min idle timeout

          try {
            const discoveryResults = await discoverAllMcpToolsWithTimeout(
              userMcpServers,
              discoveryManager,
              10_000,  // 10s per server
              60_000,  // 60s global timeout
              5,       // 5 parallel
            );

            const summary = summarizeDiscovery(discoveryResults);
            log(
              `${colors.green("✓")} MCP Discovery: ${summary.successfulServers}/${summary.totalServers} servers, ` +
              `${summary.totalTools} tools found`
            );

            if (summary.failures.length > 0) {
              for (const failure of summary.failures) {
                log(`${colors.yellow("⚠")} ${failure.server}: ${failure.error}`);
              }
            }

            // Sync discovered tools to cloud
            if (summary.totalTools > 0) {
              const syncResult = await syncDiscoveredTools(cloudUrl, apiKey, discoveryResults);
              if (syncResult.success) {
                log(`${colors.green("✓")} MCP Sync: ${syncResult.synced} tools synced to cloud`);
              } else {
                log(`${colors.yellow("⚠")} MCP Sync failed: ${syncResult.error}`);
              }
            }
          } catch (error) {
            log(`${colors.yellow("⚠")} MCP Discovery failed: ${error}`);
          } finally {
            discoveryManager.shutdownAll();
          }
        })();
      }

      // Start config watcher for hot-reload of mcpServers
      configWatcher = new ConfigWatcher();
      configWatcher.start(configPath, async (newServers, added, removed) => {
        log(`${colors.cyan("⟳")} Config changed: +${added.length} -${removed.length} servers`);

        // Re-run discovery with new config
        const servers = new Map(Object.entries(newServers));
        if (servers.size > 0) {
          const discoveryManager = new StdioManager(60_000);
          try {
            const results = await discoverAllMcpToolsWithTimeout(servers, discoveryManager, 10_000, 60_000, 5);
            const summary = summarizeDiscovery(results);
            log(`${colors.green("✓")} Re-discovery: ${summary.totalTools} tools from ${summary.successfulServers} servers`);

            if (summary.totalTools > 0) {
              const syncResult = await syncDiscoveredTools(cloudUrl, apiKey, results);
              if (syncResult.success) {
                log(`${colors.green("✓")} Re-sync: ${syncResult.synced} tools`);
              }
            }
          } finally {
            discoveryManager.shutdownAll();
          }
        }
      });
      log(`${colors.green("✓")} Config watcher started`);

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
                capabilities: {
                  tools: {},
                  resources: resourceStore.size > 0 ? {} : undefined,
                },
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

          // Resources list (MCP Apps - Story 16.2)
          if (method === "resources/list") {
            return c.json({
              jsonrpc: "2.0",
              id,
              result: { resources: getResources() },
            });
          }

          // Resources read (MCP Apps - Story 16.2)
          if (method === "resources/read" && params?.uri) {
            const uri = params.uri as string;
            const content = await readResource(uri);
            if (!content) {
              return c.json({
                jsonrpc: "2.0",
                id,
                error: { code: -32602, message: `Resource not found: ${uri}` },
              });
            }
            return c.json({
              jsonrpc: "2.0",
              id,
              result: { contents: [content] },
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
                } else if (pending.approvalType === "integrity" && loader) {
                  // Use fqdnBase (e.g., "pml.mcp.std.data_address") not toolId (e.g., "fake:address")
                  // toolId is the capability being loaded, fqdnBase is the actual tool with integrity change
                  const integrityTarget = pending.integrityInfo?.fqdnBase ?? pending.toolId;
                  await loader.approveIntegrityForSession(integrityTarget);
                }

                const fqdnMap = new Map(Object.entries(pending.fqdnMap ?? {}));
                const result = await executeLocalCode(
                  pending.code,
                  loader,
                  cloudUrl,
                  fqdnMap,
                  { approved: true, workflowId: continueWorkflow.workflowId },
                  httpLogger,
                  undefined, // serverWorkflowId not needed for continuation
                  pending.dagTasks, // Story 11.4: DAG tasks with layerIndex
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
                      pending.dagTasks, // Story 11.4
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
                  execLocally.workflowId, // ADR-065: server workflowId = client traceId
                  execLocally.dag?.tasks, // Story 11.4: DAG tasks with layerIndex
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
                      execLocally.dag?.tasks, // Story 11.4
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
                // ADR-065: Trace is now sent by local-executor.ts with unified workflowId/traceId
                // No need for duplicate trace here - local-executor passes workflowId to enqueueDirectExecutionTrace()

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

        if (configWatcher) {
          configWatcher.stop();
          log(`${colors.dim("✓")} Config watcher stopped`);
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
