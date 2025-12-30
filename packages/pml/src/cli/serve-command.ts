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
// Path validation ready for Story 14.6 (AC4: validate file operations within workspace)
import { validatePath } from "../security/path-validator.ts";

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
        `  ${colors.dim("Cloud:")} ${config.cloud?.url ?? "not configured"}`,
      );
      console.log();

      // Show permission summary
      console.log(colors.dim("Permissions:"));
      const permSummary = getPermissionsSummary(permissionResult.permissions);
      for (const line of permSummary.split("\n")) {
        console.log(`  ${colors.dim(line)}`);
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
      // - Check permissions: checkPermission(toolName, permissionResult.permissions)
      // - Route to appropriate MCP handler
      const handler = async (_req: Request): Promise<Response> => {
        // Example of how path validation will be used in Story 14.6:
        // const { path } = await req.json();
        // const validation = await validatePath(path, workspace);
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
              // Expose validation function availability for testing
              pathValidationReady: typeof validatePath === "function",
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
