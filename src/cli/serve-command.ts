/**
 * Serve Command
 *
 * Starts the PML MCP HTTP server for debugging and testing.
 * Uses PmlServer (composition over ConcurrentMCPServer) for protocol handling.
 *
 * @module cli/serve-command
 */

import { Command } from "@cliffy/command";
import * as colors from "@std/fmt/colors";
import {
  initializePmlContext,
  shutdownPmlContext,
  PmlServer,
} from "../server/mod.ts";
import {
  getRoutingVersion,
  isRoutingInitialized,
} from "../routing/mod.ts";
import { StdioManager } from "../loader/stdio-manager.ts";
import { discoverAllMcpToolsWithTimeout, summarizeDiscovery, syncDiscoveredTools } from "../discovery/mod.ts";
import { ConfigWatcher } from "../discovery/config-watcher.ts";

// Serve mode = debug mode - always enable logs
Deno.env.set("PML_DEBUG", "1");

/** Config watcher for hot-reload of mcpServers */
let configWatcher: ConfigWatcher | null = null;

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
    .option("--expose <capabilities:string[]>", "Expose specific capabilities as named MCP tools")
    .option("--only [only:boolean]", "Only expose specified capabilities (hide discover/execute/admin)", { default: false })
    .action(async (options: { port: number; expose?: string[]; only?: boolean }) => {
      // Initialize PML context (shared init flow)
      const ctx = await initializePmlContext({
        expose: options.expose,
        only: options.only,
        logger: httpLogger,
      });

      const port = options.port;

      // Log startup info
      console.log(colors.bold(colors.cyan("\n🚀 PML HTTP Server\n")));
      console.log(`  ${colors.dim("Port:")} ${port}`);
      console.log(`  ${colors.dim("Workspace:")} ${ctx.workspace}`);
      console.log(`  ${colors.dim("Cloud:")} ${ctx.cloudUrl}`);
      console.log(`  ${colors.dim("Routing:")} v${getRoutingVersion()} (${isRoutingInitialized() ? "ready" : "failed"})`);
      console.log(`  ${colors.dim("Session:")} ${ctx.sessionClient?.sessionId?.slice(0, 8) ?? "none"}`);
      if (ctx.exposedCapabilities.length > 0) {
        console.log(`  ${colors.dim("Exposed:")} ${ctx.exposedCapabilities.map((c) => c.name).join(", ")}${ctx.onlyMode ? " (only)" : ""}`);
      }
      console.log();

      // Create PmlServer (HTTP mode with compact descriptions)
      const pmlServer = new PmlServer(
        { useFullDescriptions: false, logger: httpLogger },
        ctx,
      );

      // Discover tools from user-configured MCP servers (background)
      if (ctx.userMcpServers.size > 0) {
        log(`${colors.dim("mcpServers in config:")} ${ctx.config.mcpServers ? Object.keys(ctx.config.mcpServers).length : 0}`);
        log(`${colors.dim("userMcpServers loaded:")} ${ctx.userMcpServers.size}`);
        log(`${colors.dim("⟳")} Discovering tools from ${ctx.userMcpServers.size} MCP server(s)...`);

        (async () => {
          const discoveryManager = new StdioManager(60_000);
          try {
            const discoveryResults = await discoverAllMcpToolsWithTimeout(
              ctx.userMcpServers,
              discoveryManager,
              10_000, 60_000, 5,
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
            if (summary.totalTools > 0) {
              const syncResult = await syncDiscoveredTools(ctx.cloudUrl, ctx.apiKey, discoveryResults);
              if (syncResult.success) {
                log(`${colors.green("✓")} MCP Sync: ${syncResult.synced} tools synced to cloud`);
              } else {
                log(`${colors.yellow("⚠")} MCP Sync failed: ${syncResult.error}`);
              }
            }

            // Register fetched UI HTML as local resources (Gap #1 fix)
            let uiCount = 0;
            for (const result of discoveryResults) {
              for (const ui of result.uiHtml ?? []) {
                pmlServer.registerUiResource(ui.resourceUri, ui.content, ui.mimeType);
                uiCount++;
              }
            }
            if (uiCount > 0) {
              log(`${colors.green("✓")} UI Resources: ${uiCount} registered for resources/read`);
            }
          } catch (error) {
            log(`${colors.yellow("⚠")} MCP Discovery failed: ${error}`);
          } finally {
            discoveryManager.shutdownAll();
          }
        })();
      }

      // Start config watcher for hot-reload
      configWatcher = new ConfigWatcher();
      configWatcher.start(ctx.configPath, async (newServers, added, removed) => {
        log(`${colors.cyan("⟳")} Config changed: +${added.length} -${removed.length} servers`);
        const servers = new Map(Object.entries(newServers));
        if (servers.size > 0) {
          const discoveryManager = new StdioManager(60_000);
          try {
            const results = await discoverAllMcpToolsWithTimeout(servers, discoveryManager, 10_000, 60_000, 5);
            const summary = summarizeDiscovery(results);
            log(`${colors.green("✓")} Re-discovery: ${summary.totalTools} tools from ${summary.successfulServers} servers`);
            if (summary.totalTools > 0) {
              const syncResult = await syncDiscoveredTools(ctx.cloudUrl, ctx.apiKey, results);
              if (syncResult.success) {
                log(`${colors.green("✓")} Re-sync: ${syncResult.synced} tools`);
              }
            }

            // Register new UI resources from re-discovery
            let uiCount = 0;
            for (const result of results) {
              for (const ui of result.uiHtml ?? []) {
                pmlServer.registerUiResource(ui.resourceUri, ui.content, ui.mimeType);
                uiCount++;
              }
            }
            if (uiCount > 0) {
              log(`${colors.green("✓")} Re-registered: ${uiCount} UI resources`);
            }
          } finally {
            discoveryManager.shutdownAll();
          }
        }
      });
      log(`${colors.green("✓")} Config watcher started`);

      // Graceful shutdown handler
      const shutdown = async () => {
        log(`${colors.yellow("⚠")} Shutting down...`);
        await pmlServer.shutdown();
        await shutdownPmlContext(ctx);
        if (configWatcher) {
          configWatcher.stop();
          log(`${colors.dim("✓")} Config watcher stopped`);
        }
        log(`${colors.green("✓")} Cleanup complete`);
        Deno.exit(0);
      };

      Deno.addSignalListener("SIGTERM", shutdown);
      Deno.addSignalListener("SIGINT", shutdown);

      // Start HTTP server
      await pmlServer.startHttp(port);
    });
}
