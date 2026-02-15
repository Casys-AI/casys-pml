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
 * @module lib/plm/server
 */

import { ConcurrentMCPServer } from "@casys/mcp-server";
import { PlmToolsClient } from "./src/client.ts";

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

  // Create concurrent MCP server
  const server = new ConcurrentMCPServer({
    name: "mcp-plm",
    version: "0.1.0",
    maxConcurrent: 10,
    backpressureStrategy: "queue",
    validateSchema: true,
    logger: (msg) => console.error(`[mcp-plm] ${msg}`),
  });

  // Register all tools
  const mcpTools = toolsClient.toMCPFormat();
  const handlers = new Map();

  for (const tool of toolsClient.listTools()) {
    handlers.set(tool.name, tool.handler);
  }

  server.registerTools(mcpTools, handlers);

  // Start server
  if (httpFlag) {
    await server.startHttp({
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
      `[mcp-plm] Server ready (${toolsClient.count} tools) - HTTP mode${
        categories ? ` - categories: ${categories.join(", ")}` : ""
      }`,
    );

    Deno.addSignalListener("SIGINT", async () => {
      console.error("[mcp-plm] Shutting down...");
      Deno.exit(0);
    });
  } else {
    await server.start();

    console.error(
      `[mcp-plm] Server ready (${toolsClient.count} tools) - stdio mode${
        categories ? ` - categories: ${categories.join(", ")}` : ""
      }`,
    );
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("[mcp-plm] Fatal error:", error);
    Deno.exit(1);
  });
}
