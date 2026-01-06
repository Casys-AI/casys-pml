/**
 * Serve Command
 *
 * Starts the PML MCP HTTP server with workspace-scoped security.
 *
 * @module cli/serve-command
 */

import { Command } from "@cliffy/command";
import * as colors from "@std/fmt/colors";
import { exists } from "@std/fs";
import { join } from "@std/path";
import type { PmlConfig } from "../types.ts";
import {
  getWorkspaceSourceDescription,
  isValidWorkspace,
  resolveWorkspaceWithDetails,
} from "../workspace.ts";
import {
  getPermissionsSummary,
  loadUserPermissions,
} from "../permissions/loader.ts";
// Capability permission inference (Story 14.3)
import {
  checkCapabilityPermissions,
  inferCapabilityApprovalMode,
} from "../permissions/capability-inferrer.ts";
// Routing - synced from cloud at startup (Story 14.3)
import {
  getRoutingVersion,
  initializeRouting,
  isRoutingInitialized,
  resolveToolRouting,
  syncRoutingConfig,
} from "../routing/mod.ts";
// Path validation ready for Story 14.6 (AC4: validate file operations within workspace)
import { validatePath } from "../security/path-validator.ts";
// Capability loader (Story 14.4)
import { CapabilityLoader } from "../loader/mod.ts";

const PML_CONFIG_FILE = ".pml.json";

/**
 * Silent logger for workspace resolution (avoids duplicate output)
 */
const silentLogger = {
  info: () => {},
  warn: () => {},
};

/**
 * Create serve command
 *
 * Usage:
 *   pml serve                   # Start server with config defaults
 *   pml serve --port 3003       # Custom port
 */
// deno-lint-ignore no-explicit-any
export function createServeCommand(): Command<any> {
  return new Command()
    .name("serve")
    .description("Start the PML MCP HTTP server")
    .option(
      "-p, --port <port:number>",
      "Server port (overrides config)",
    )
    .action(async (options) => {
      // Step 1: Resolve workspace using priority system
      const workspaceResult = resolveWorkspaceWithDetails(silentLogger);
      const workspace = workspaceResult.path;

      // Validate workspace exists and is accessible
      if (!isValidWorkspace(workspace)) {
        console.error(colors.red(`\n✗ Invalid workspace: ${workspace}`));
        console.error(
          colors.dim(`  Set PML_WORKSPACE or run from a project directory.\n`),
        );
        Deno.exit(1);
      }

      const configPath = join(workspace, PML_CONFIG_FILE);

      // Check for config file
      if (!await exists(configPath)) {
        console.error(
          colors.red(`\n✗ No ${PML_CONFIG_FILE} found in workspace.`),
        );
        console.error(colors.dim(`  Workspace: ${workspace}`));
        console.error(colors.dim(`  Run 'pml init' first to configure.\n`));
        Deno.exit(1);
      }

      // Load config
      let config: PmlConfig;
      try {
        const content = await Deno.readTextFile(configPath);
        config = JSON.parse(content);
      } catch (error) {
        console.error(colors.red(`\n✗ Failed to load config: ${error}\n`));
        Deno.exit(1);
      }

      // Step 2: Load user permissions (user config is THE source of truth)
      const permissionResult = await loadUserPermissions(
        workspace,
        silentLogger,
      );

      // Step 3: Sync routing config from cloud
      const cloudUrl = config.cloud?.url ?? "https://pml.casys.ai";
      console.log(colors.dim("Syncing routing config..."));
      const { result: syncResult, config: routingConfig } = await syncRoutingConfig(
        cloudUrl,
        {
          info: (msg) => console.log(`  ${colors.dim(msg)}`),
          warn: (msg) => console.log(`  ${colors.yellow(msg)}`),
        },
      );
      initializeRouting(routingConfig);

      const port = options.port ?? config.server?.port ?? 3003;

      // Display startup info
      console.log(colors.bold(colors.cyan("\n🚀 PML Server\n")));
      console.log(`  ${colors.dim("Port:")} ${port}`);
      console.log(`  ${colors.dim("Workspace:")} ${workspace}`);
      console.log(
        `  ${colors.dim("Resolved via:")} ${
          getWorkspaceSourceDescription(workspaceResult)
        }`,
      );
      console.log(
        `  ${colors.dim("Cloud:")} ${cloudUrl}`,
      );
      console.log(
        `  ${colors.dim("Routing:")} v${getRoutingVersion()} (${
          syncResult.fromCache ? "cached" : "synced"
        })`,
      );
      console.log();

      // Show permission summary
      console.log(colors.dim("Permissions:"));
      const permSummary = getPermissionsSummary(permissionResult.permissions);
      for (const line of permSummary.split("\n")) {
        console.log(`  ${colors.dim(line)}`);
      }
      console.log();

      // Step 4: Initialize CapabilityLoader (Story 14.4)
      console.log(colors.dim("Initializing capability loader..."));
      let loader: CapabilityLoader | null = null;
      try {
        loader = await CapabilityLoader.create({
          cloudUrl,
          workspace,
          hilCallback: async (prompt: string) => {
            // HTTP mode HIL - will be implemented in Story 14.6
            console.log(colors.yellow(`\n⚠️  HIL Prompt: ${prompt}`));
            return false; // Deny by default until proper HIL is implemented
          },
        });
        console.log(`  ${colors.green("✓")} Capability loader ready`);
      } catch (error) {
        console.log(`  ${colors.yellow("⚠")} Capability loader failed: ${error}`);
      }
      console.log();

      // TODO: Story 14.6 - Full MCP HTTP server implementation
      // For now, just a stub that shows it would start
      console.log(
        colors.yellow("⚠ Server stub - full implementation in Story 14.6\n"),
      );
      console.log(colors.dim("The server would start at:"));
      console.log(colors.cyan(`  http://localhost:${port}/mcp\n`));

      // Keep process alive for demo purposes
      // In real implementation, this would be the HTTP server
      console.log(colors.dim("Press Ctrl+C to stop.\n"));

      // Simple HTTP server stub to show it works
      // TODO(Story 14.6): Full MCP HTTP server implementation
      // - Parse MCP JSON-RPC requests
      // - For file operations: await validatePath(requestedPath, workspace)
      // - For capabilities: inferCapabilityApprovalMode(toolsUsed, permissions)
      // - Route to cloud or execute locally based on cloud response
      const handler = async (_req: Request): Promise<Response> => {
        // Example of how permission inference will be used (Story 14.3 AC5):
        // const capabilityResult = checkCapabilityPermissions(
        //   capability.toolsUsed,
        //   permissionResult.permissions
        // );
        // if (!capabilityResult.canExecute) {
        //   return new Response(JSON.stringify({
        //     jsonrpc: "2.0",
        //     error: { code: -32602, message: capabilityResult.reason }
        //   }), { status: 403 });
        // }
        // if (capabilityResult.approvalMode === "hil") {
        //   // Trigger HIL flow - wait for user approval
        // }

        // Example of how path validation will be used in Story 14.6:
        // const validation = await validatePath(requestedPath, workspace);
        // if (!validation.valid) {
        //   return new Response(JSON.stringify({
        //     jsonrpc: "2.0",
        //     error: { code: -32602, message: validation.error?.message }
        //   }), { status: 403 });
        // }

        // Stub response for now
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            result: {
              name: "pml",
              version: "0.1.0",
              status: "stub",
              workspace,
              permissionSource: permissionResult.source,
              // Routing info (Story 14.3)
              routingVersion: getRoutingVersion(),
              routingInitialized: isRoutingInitialized(),
              // Expose function availability for testing
              pathValidationReady: typeof validatePath === "function",
              capabilityInferrerReady: typeof inferCapabilityApprovalMode === "function",
              capabilityCheckerReady: typeof checkCapabilityPermissions === "function",
              routingResolverReady: typeof resolveToolRouting === "function",
              capabilityLoaderReady: loader !== null,
              capabilityLoaderStatus: loader?.getStatus() ?? null,
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      };

      Deno.serve({ port }, handler);
    });
}
