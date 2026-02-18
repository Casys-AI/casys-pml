/**
 * MCP Server Bootstrap for PLM (Product Lifecycle Management) Tools
 *
 * Bootstraps PLM tools as a proper MCP server
 * that can be loaded via mcp-servers.json or run as HTTP server.
 *
 * Usage in mcp-servers.json (stdio mode):
 * {
 *   "mcpServers": {
 *     "plm": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "lib/plm/server.ts"]
 *     }
 *   }
 * }
 *
 * HTTP mode (default port: 3010):
 *   deno run --allow-all lib/plm/server.ts --http
 *   deno run --allow-all lib/plm/server.ts --http --port=3010
 *
 * Environment:
 *   ANTHROPIC_API_KEY=...           (for agent sampling, optional)
 *   OPENAI_API_KEY=...              (for agent sampling, optional)
 *
 * @module lib/plm/server
 */

import { ConcurrentMCPServer, MCP_APP_MIME_TYPE, SamplingBridge } from "@casys/mcp-server";
import { PlmToolsClient } from "./src/client.ts";
import { createAgenticSamplingClient, setSamplingClient } from "./src/tools/agent.ts";
import { loadUiHtml, UI_RESOURCES } from "./src/ui/mod.ts";

const DEFAULT_HTTP_PORT = 3010;

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
  const toolsClient = new PlmToolsClient(
    categories ? { categories } : undefined,
  );

  // Create agentic sampling client and wrap with SamplingBridge
  const underlyingSamplingClient = createAgenticSamplingClient();
  const samplingBridge = new SamplingBridge(underlyingSamplingClient, {
    timeout: 120_000,
  });
  setSamplingClient(samplingBridge);

  console.error("[mcp-plm] Sampling bridge initialized (timeout: 120s)");

  // Create concurrent MCP server with sampling support
  const server = new ConcurrentMCPServer({
    name: "mcp-plm",
    version: "0.1.0",
    maxConcurrent: 10,
    backpressureStrategy: "queue",
    validateSchema: true,
    enableSampling: true,
    samplingClient: samplingBridge,
    logger: (msg) => console.error(`[mcp-plm] ${msg}`),
  });

  // Register all tools
  const mcpTools = toolsClient.toMCPFormat();
  const handlers = new Map();

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
        console.error(`[mcp-plm] Registered UI resource: ${ui.resourceUri}`);
      } else {
        console.error(`[mcp-plm] Warning: UI resource not found for ${ui.resourceUri}. Run 'deno task build:ui' first.`);
      }
    }
  }

  // Start server
  if (httpFlag) {
    const httpServer = await server.startHttp({
      port: httpPort,
      hostname,
      cors: true,
      onListen: (info) => {
        console.error(
          `[mcp-plm] HTTP server listening on http://${info.hostname}:${info.port}`,
        );
      },
    });

    console.error(
      `[mcp-plm] Server ready (${toolsClient.count} tools, sampling: enabled) - HTTP mode${
        categories ? ` - categories: ${categories.join(", ")}` : ""
      }`,
    );

    Deno.addSignalListener("SIGINT", async () => {
      console.error("[mcp-plm] Shutting down HTTP server...");
      await httpServer.shutdown();
      Deno.exit(0);
    });
  } else {
    await server.start();

    console.error(
      `[mcp-plm] Server ready (${toolsClient.count} tools, sampling: enabled) - stdio mode${
        categories ? ` - categories: ${categories.join(", ")}` : ""
      }`,
    );

    // Exit cleanly when parent process sends SIGINT (Ctrl+C)
    Deno.addSignalListener("SIGINT", () => {
      console.error("[mcp-plm] SIGINT received, exiting...");
      Deno.exit(0);
    });
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("[mcp-plm] Fatal error:", error);
    Deno.exit(1);
  });
}
