/**
 * `pml connections list|remove` — Manage stored OAuth credentials.
 *
 * @module cli/connections-command
 */

import { Command } from "@cliffy/command";
import { FileTokenStore } from "../../../../lib/server/src/client-auth/token-store/file-store.ts";
import { join } from "@std/path";

function getDefaultCredentialsDir(): string {
  return join(Deno.env.get("HOME") ?? "~", ".pml", "credentials");
}

// deno-lint-ignore no-explicit-any
export function createConnectionsCommand(): Command<any> {
  return new Command()
    .description("Manage OAuth connections to MCP servers")
    .command(
      "list",
      new Command()
        .description("List all stored connections")
        .option("--credentials-dir <dir:string>", "Credentials directory", {
          default: getDefaultCredentialsDir(),
        })
        .action(async (options) => {
          const store = new FileTokenStore(options.credentialsDir);
          const urls = await store.list();
          if (urls.length === 0) {
            console.log("No stored connections.");
            return;
          }
          console.log("Connected servers:\n");
          for (const url of urls) {
            const creds = await store.get(url);
            const obtained = creds
              ? new Date(creds.obtainedAt).toISOString()
              : "unknown";
            console.log(`  ${url}`);
            console.log(`    Obtained: ${obtained}`);
          }
        }),
    )
    .command(
      "remove",
      new Command()
        .description("Remove stored credentials for a server")
        .arguments("<server-url:string>")
        .option("--credentials-dir <dir:string>", "Credentials directory", {
          default: getDefaultCredentialsDir(),
        })
        .action(async (options, serverUrl) => {
          const store = new FileTokenStore(options.credentialsDir);
          const existing = await store.get(serverUrl);
          if (!existing) {
            console.log(`No stored credentials for ${serverUrl}`);
            return;
          }
          await store.delete(serverUrl);
          console.log(`Removed credentials for ${serverUrl}`);
        }),
    );
}
