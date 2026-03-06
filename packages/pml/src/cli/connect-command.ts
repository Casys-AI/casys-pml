/**
 * `pml connect <server-url>` — Authenticate against an OAuth-protected MCP server.
 *
 * Performs RFC 9728 discovery, then runs a PKCE OAuth flow with a localhost callback.
 * Stores the resulting tokens locally in ~/.pml/credentials/.
 *
 * @module cli/connect-command
 */

import { Command } from "@cliffy/command";
import { FileTokenStore } from "../../../../lib/server/src/client-auth/token-store/file-store.ts";
import { prepareOAuthProvider } from "../../../../lib/server/src/client-auth/connect.ts";
import { join } from "@std/path";

async function openBrowser(url: string): Promise<void> {
  const cmd = Deno.build.os === "darwin"
    ? "open"
    : Deno.build.os === "windows"
    ? "start"
    : "xdg-open";
  try {
    const process = new Deno.Command(cmd, { args: [url] });
    await process.output();
  } catch {
    // Browser open failed — user will use the printed URL
  }
}

// deno-lint-ignore no-explicit-any
export function createConnectCommand(): Command<any> {
  return new Command()
    .description("Authenticate against an OAuth-protected MCP server")
    .arguments("<server-url:string>")
    .option("--client-id <id:string>", "OAuth Client ID", { required: true })
    .option("--client-name <name:string>", "Client name for consent screen", {
      default: "PML CLI",
    })
    .option("--port <port:number>", "Fixed callback port (default: auto)", {
      default: 0,
    })
    .option("--scopes <scopes:string>", "Scopes to request (space-separated)")
    .option("--credentials-dir <dir:string>", "Credentials directory", {
      default: join(Deno.env.get("HOME") ?? "~", ".pml", "credentials"),
    })
    .action(async (options, serverUrl) => {
      console.log(`Connecting to ${serverUrl}...`);

      const tokenStore = new FileTokenStore(options.credentialsDir);

      // Check if already connected
      const existing = await tokenStore.get(serverUrl);
      if (existing) {
        console.log(`Already connected to ${serverUrl}`);
        console.log(
          `Token obtained at: ${new Date(existing.obtainedAt).toISOString()}`,
        );
        return;
      }

      const { provider, callbackServer, callbackPort } =
        await prepareOAuthProvider(serverUrl, {
          clientId: options.clientId,
          clientName: options.clientName,
          scopes: options.scopes?.split(" "),
          tokenStore,
          openBrowser,
          callbackPort: options.port,
        });

      console.log(`Callback server listening on port ${callbackPort}`);
      console.log(`Discovering auth requirements from ${serverUrl}...`);

      try {
        const { auth } = await import(
          "@modelcontextprotocol/sdk/client/auth.js"
        );
        const result = await auth(provider, { serverUrl });

        if (result === "AUTHORIZED") {
          console.log(`\nConnected to ${serverUrl}`);
          console.log(`Token stored in ${options.credentialsDir}`);
        } else {
          console.log(
            `\nAuthorization redirect initiated. Complete in your browser.`,
          );
          console.log(
            "If the browser doesn't open, check the URL printed above.",
          );
        }
      } catch (error) {
        console.error(
          `\nAuth failed: ${error instanceof Error ? error.message : error}`,
        );
        Deno.exit(1);
      } finally {
        await callbackServer.close();
      }
    });
}
