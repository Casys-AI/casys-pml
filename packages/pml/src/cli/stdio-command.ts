/**
 * Stdio Command
 *
 * Starts the PML MCP server in stdio mode for Claude Code integration.
 * This is the PRIMARY interface - Claude Code spawns this process.
 * Uses PmlServer (composition over ConcurrentMCPServer) for protocol handling.
 *
 * @module cli/stdio-command
 */

import { Command } from "@cliffy/command";
import { BaseHandler, setup as setupLog } from "@std/log";
import {
  initializePmlContext,
  shutdownPmlContext,
  PmlServer,
} from "../server/mod.ts";
import {
  getRoutingVersion,
  isRoutingInitialized,
} from "../routing/mod.ts";
import { getWorkspaceSourceDescription } from "../workspace.ts";
import { stdioLog } from "../logging.ts";
import { PACKAGE_VERSION } from "./shared/constants.ts";
import { checkForUpdates } from "./shared/version-check.ts";
import { discoverAllMcpToolsWithTimeout, summarizeDiscovery, syncDiscoveredTools } from "../discovery/mod.ts";
import { StdioManager } from "../loader/stdio-manager.ts";

/** Logger adapter for shared utilities */
const stdioLogger = {
  debug: (msg: string) => stdioLog.debug(msg),
};

// deno-lint-ignore no-explicit-any
export function createStdioCommand(): Command<any> {
  return new Command()
    .name("stdio")
    .description("Start the PML MCP server in stdio mode (for Claude Code)")
    .option("--expose <capabilities:string[]>", "Expose specific capabilities as named MCP tools")
    .option("--only [only:boolean]", "Only expose specified capabilities (hide discover/execute/admin)", { default: false })
    .action(async (options: { expose?: string[]; only?: boolean }) => {
      // Redirect @std/log to stderr — the default ConsoleHandler uses console.log()
      // which writes to stdout, corrupting the JSON-RPC channel in stdio mode.
      class StderrHandler extends BaseHandler {
        override log(msg: string): void { console.error(msg); }
      }
      setupLog({
        handlers: { stderr: new StderrHandler("DEBUG") },
        loggers: { default: { level: "DEBUG", handlers: ["stderr"] } },
      });

      // Initialize PML context (shared init flow)
      const ctx = await initializePmlContext({
        expose: options.expose,
        only: options.only,
        logger: stdioLogger,
      });

      // Log startup info (stderr — invisible to MCP client)
      stdioLog.debug(`Workspace: ${ctx.workspace} (${getWorkspaceSourceDescription(ctx.workspaceResult)})`);
      stdioLog.debug(`Cloud: ${ctx.cloudUrl}`);
      stdioLog.debug(`Routing: v${getRoutingVersion()} (${isRoutingInitialized() ? "ready" : "failed"})`);
      stdioLog.debug(`Session: ${ctx.sessionClient?.sessionId?.slice(0, 8) ?? "none"}`);
      if (ctx.exposedCapabilities.length > 0) {
        stdioLog.debug(
          `Exposed: ${ctx.exposedCapabilities.map((c) => c.name).join(", ")}${ctx.onlyMode ? " (only)" : ""}`,
        );
      }

      // Create PmlServer (stdio mode with full descriptions)
      const pmlServer = new PmlServer(
        { useFullDescriptions: true, logger: stdioLogger },
        ctx,
      );

      // Wire up version check after MCP handshake completes
      pmlServer.onInitialized(() => {
        checkForUpdates()
          .then((latestVersion) => {
            if (latestVersion) {
              pmlServer.sendNotification(
                "info",
                `PML update available: v${latestVersion} (current: v${PACKAGE_VERSION}). Run 'pml upgrade' to update.`,
              );
            }
          })
          .catch(() => {
            // Silently ignore version check errors
          });
      });

      // Discover tools from user-configured MCP servers (background, non-blocking)
      if (ctx.userMcpServers.size > 0) {
        stdioLog.debug(`Starting async discovery for ${ctx.userMcpServers.size} user MCP server(s)...`);

        (async () => {
          const discoveryManager = new StdioManager(60_000);
          try {
            const discoveryResults = await discoverAllMcpToolsWithTimeout(
              ctx.userMcpServers,
              discoveryManager,
              10_000, 60_000, 5,
            );
            const summary = summarizeDiscovery(discoveryResults);
            stdioLog.debug(
              `MCP Discovery: ${summary.successfulServers}/${summary.totalServers} servers, ` +
              `${summary.totalTools} tools found` +
              (summary.uiTools > 0 ? `, ${summary.uiTools} with UI` : ""),
            );

            // Send MCP notification for failures (visible to user in Claude Code)
            if (summary.failures.length > 0) {
              const failureDetails = summary.failures
                .map((f) => `${f.server}: ${f.error}`)
                .join("; ");
              pmlServer.sendNotification(
                "warning",
                `MCP Discovery: ${summary.failures.length} server(s) failed - ${failureDetails}`,
              );
            }

            // Sync discovered tools to cloud
            if (summary.totalTools > 0) {
              const syncResult = await syncDiscoveredTools(ctx.cloudUrl, ctx.apiKey, discoveryResults);
              if (syncResult.success) {
                stdioLog.debug(`MCP Sync: ${syncResult.synced} tools synced to cloud`);
              } else {
                stdioLog.debug(`MCP Sync failed (non-fatal): ${syncResult.error}`);
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
              stdioLog.debug(`UI Resources: ${uiCount} registered for resources/read`);
            }
          } catch (error) {
            stdioLog.debug(`MCP Discovery failed (non-fatal): ${error}`);
          } finally {
            discoveryManager.shutdownAll();
          }
        })();
      }

      // Start stdio server — connects StdioServerTransport to process.stdin/stdout
      await pmlServer.start();

      // Block until stdin closes (parent process disconnects).
      // Without this, the Cliffy action handler returns immediately after start()
      // and cleanup runs, killing the server before any request is processed.
      // The SDK's transport 'data' listener on process.stdin handles MCP requests;
      // we listen for 'end'/'close' to know when the client is gone.
      const nodeProcess = (await import("node:process")).default;
      await new Promise<void>((resolve) => {
        nodeProcess.stdin.on("end", resolve);
        nodeProcess.stdin.on("close", resolve);
      });

      // Cleanup after client disconnects
      await pmlServer.shutdown();
      await shutdownPmlContext(ctx);
      stdioLog.debug("Shutdown complete");
    });
}
