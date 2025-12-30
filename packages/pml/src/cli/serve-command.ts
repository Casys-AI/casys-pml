/**
 * Serve Command
 *
 * Starts the PML MCP HTTP server.
 *
 * @module cli/serve-command
 */

import { Command } from "@cliffy/command";
import { colors } from "@std/fmt/colors";
import { exists } from "@std/fs";
import { join } from "@std/path";
import type { PmlConfig } from "../types.ts";

const PML_CONFIG_FILE = ".pml.json";

/**
 * Create serve command
 *
 * Usage:
 *   pml serve                   # Start server with config defaults
 *   pml serve --port 3003       # Custom port
 */
export function createServeCommand(): Command {
  return new Command()
    .name("serve")
    .description("Start the PML MCP HTTP server")
    .option(
      "-p, --port <port:number>",
      "Server port (overrides config)",
    )
    .action(async (options) => {
      const configPath = join(Deno.cwd(), PML_CONFIG_FILE);

      // Check for config file
      if (!await exists(configPath)) {
        console.error(colors.red(`\n✗ No ${PML_CONFIG_FILE} found.`));
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

      const port = options.port ?? config.port ?? 3003;

      console.log(colors.bold(colors.cyan("\n🚀 PML Server\n")));
      console.log(`  ${colors.dim("Port:")} ${port}`);
      console.log(`  ${colors.dim("Workspace:")} ${config.workspace}`);
      console.log(`  ${colors.dim("Cloud:")} ${config.cloudUrl}`);
      console.log();

      // TODO: Story 14.6 - Full MCP HTTP server implementation
      // For now, just a stub that shows it would start
      console.log(colors.yellow("⚠ Server stub - full implementation in Story 14.6\n"));
      console.log(colors.dim("The server would start at:"));
      console.log(colors.cyan(`  http://localhost:${port}/mcp\n`));

      // Keep process alive for demo purposes
      // In real implementation, this would be the HTTP server
      console.log(colors.dim("Press Ctrl+C to stop.\n"));

      // Simple HTTP server stub to show it works
      const handler = (_req: Request): Response => {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            result: {
              name: "pml",
              version: "0.1.0",
              status: "stub",
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
