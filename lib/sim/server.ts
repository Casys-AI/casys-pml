/**
 * MCP Sim server — stdio or HTTP mode
 *
 * @module lib/sim/server
 */

import { SimToolsClient } from "./src/client.ts";
import { loadUiHtml, UI_RESOURCES } from "./src/ui/mod.ts";

async function main() {
  const args = Deno.args;
  const httpFlag = args.includes("--http");
  const portIdx = args.indexOf("--port");
  const httpPort = portIdx >= 0 ? parseInt(args[portIdx + 1]) : 3012;
  const hostname = "0.0.0.0";

  // Lazy import to avoid hard dep if not running as server
  const { ConcurrentMCPServer, MCP_APP_MIME_TYPE } = await import("@casys/mcp-server");

  const toolsClient = new SimToolsClient();

  const server = new ConcurrentMCPServer({
    name: "mcp-sim",
    version: "0.1.0",
    maxConcurrent: 10,
    backpressureStrategy: "queue",
    validateSchema: true,
    logger: (msg: string) => console.error(`[mcp-sim] ${msg}`),
  });

  // Register tools
  const mcpTools = toolsClient.toMCPFormat();
  const handlers = new Map<string, (args: Record<string, unknown>) => Promise<unknown> | unknown>();

  for (const tool of toolsClient.listTools()) {
    handlers.set(tool.name, tool.handler);
  }

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
        console.error(`[mcp-sim] Registered UI resource: ${ui.resourceUri}`);
      } else {
        console.error(`[mcp-sim] Warning: UI resource not found for ${ui.resourceUri}. Run 'npm run build' in src/ui/ first.`);
      }
    }
  }

  console.error(`[mcp-sim] Registered ${toolsClient.count} tools`);

  // Start server
  if (httpFlag) {
    await server.startHttp({ port: httpPort, hostname, cors: true });
    console.error(`[mcp-sim] HTTP server listening on ${hostname}:${httpPort}`);
  } else {
    await server.start();
    console.error("[mcp-sim] stdio server started");
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("[mcp-sim] Fatal error:", error);
    Deno.exit(1);
  });
}
