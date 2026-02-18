/**
 * MCP Server Bootstrap for Onshape Tools
 *
 * Bootstraps Onshape tools as a proper MCP server
 * that can be loaded via .pml.json or run as HTTP server.
 *
 * Usage in .pml.json (stdio mode):
 * {
 *   "mcpServers": {
 *     "onshape": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "lib/onshape/server.ts"],
 *       "env": {
 *         "ONSHAPE_ACCESS_KEY": "your-access-key",
 *         "ONSHAPE_SECRET_KEY": "your-secret-key"
 *       }
 *     }
 *   }
 * }
 *
 * HTTP mode (default port: 3013):
 *   deno run --allow-all lib/onshape/server.ts --http
 *   deno run --allow-all lib/onshape/server.ts --http --port=3013
 *
 * Environment:
 *   ONSHAPE_ACCESS_KEY=xxx     API Access Key from Developer portal
 *   ONSHAPE_SECRET_KEY=xxx     API Secret Key from Developer portal
 *   ONSHAPE_URL=https://cad.onshape.com  (optional, default)
 *   ONSHAPE_AUTH_METHOD=basic   (optional, "basic" or "hmac", default "basic")
 *
 * @module lib/onshape/server
 */

import { ConcurrentMCPServer, MCP_APP_MIME_TYPE } from "@casys/mcp-server";
import { OnshapeToolsClient } from "./src/client.ts";
import { UI_RESOURCES, loadUiHtml } from "./src/ui/mod.ts";

const DEFAULT_HTTP_PORT = 3013;

async function main() {
  const args = Deno.args;

  // Category filtering
  const categoriesArg = args.find((arg) => arg.startsWith("--categories="));
  const categories = categoriesArg
    ? categoriesArg.split("=")[1].split(",")
    : undefined;

  // HTTP mode
  const httpFlag = args.includes("--http");
  const portArg = args.find((arg) => arg.startsWith("--port="));
  const httpPort = portArg ? parseInt(portArg.split("=")[1], 10) : DEFAULT_HTTP_PORT;
  const hostnameArg = args.find((arg) => arg.startsWith("--hostname="));
  const hostname = hostnameArg ? hostnameArg.split("=")[1] : "0.0.0.0";

  // Initialize tools client
  const toolsClient = new OnshapeToolsClient(
    categories ? { categories } : undefined,
  );

  // Build MCP server
  const server = new ConcurrentMCPServer({
    name: "mcp-onshape",
    version: "0.1.0",
    maxConcurrent: 10,
    backpressureStrategy: "queue",
    validateSchema: true,
    logger: (msg: string) => console.error(`[mcp-onshape] ${msg}`),
  });

  // Register all tools with their handlers
  const mcpTools = toolsClient.toMCPFormat();
  const handlers = toolsClient.buildHandlersMap();
  server.registerTools(mcpTools, handlers);

  // Register UI resources from tools with _meta.ui
  const registeredUris = new Set<string>();
  for (const tool of toolsClient.listTools()) {
    const ui = tool._meta?.ui;
    if (ui?.resourceUri && !registeredUris.has(ui.resourceUri)) {
      registeredUris.add(ui.resourceUri);
      const resourceMeta = UI_RESOURCES[ui.resourceUri];
      if (resourceMeta) {
        server.registerResource(
          {
            uri: ui.resourceUri,
            name: resourceMeta.name,
            description: resourceMeta.description,
            mimeType: MCP_APP_MIME_TYPE,
          },
          async () => {
            const html = await loadUiHtml(ui.resourceUri);
            return { uri: ui.resourceUri, mimeType: MCP_APP_MIME_TYPE, text: html };
          },
        );
        console.error(`[mcp-onshape] Registered UI resource: ${ui.resourceUri}`);
      } else {
        console.error(
          `[mcp-onshape] Warning: No UI resource found for ${ui.resourceUri}. ` +
          `Run 'cd lib/onshape/src/ui && node build-all.mjs' first.`,
        );
      }
    }
  }

  console.error(
    `[mcp-onshape] Initialized — ${toolsClient.count} tools${
      categories ? ` (categories: ${categories.join(", ")})` : ""
    }`,
  );

  // Start server
  if (httpFlag) {
    await server.startHttp({
      port: httpPort,
      hostname,
      cors: true,
      onListen: (info: { hostname: string; port: number }) => {
        console.error(
          `[mcp-onshape] HTTP server listening on http://${info.hostname}:${info.port}`,
        );
      },
    });

    Deno.addSignalListener("SIGINT", () => {
      console.error("[mcp-onshape] Shutting down...");
      Deno.exit(0);
    });
  } else {
    await server.start();
    console.error("[mcp-onshape] stdio mode ready");
  }
}

main().catch((err) => {
  console.error("[mcp-onshape] Fatal error:", err);
  Deno.exit(1);
});
