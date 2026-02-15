/**
 * MCP Server Bootstrap for MBE (Model-Based Engineering) Tools
 *
 * Bootstraps MBE tools as a proper MCP server
 * that can be loaded via mcp-servers.json or run as HTTP server.
 *
 * Usage in mcp-servers.json (stdio mode):
 * {
 *   "mcpServers": {
 *     "mbe": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "lib/mbe/server.ts"]
 *     }
 *   }
 * }
 *
 * HTTP mode (default port: 3009):
 *   deno run --allow-all lib/mbe/server.ts --http
 *   deno run --allow-all lib/mbe/server.ts --http --port=3009
 *
 * @module lib/mbe/server
 */

import { ConcurrentMCPServer } from "@casys/mcp-server";
import { MbeToolsClient } from "./src/client.ts";

const DEFAULT_HTTP_PORT = 3009;

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
  const toolsClient = new MbeToolsClient(
    categories ? { categories } : undefined,
  );

  // Create concurrent MCP server
  const server = new ConcurrentMCPServer({
    name: "mcp-mbe",
    version: "0.1.0",
    maxConcurrent: 10,
    backpressureStrategy: "queue",
    validateSchema: true,
    logger: (msg) => console.error(`[mcp-mbe] ${msg}`),
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
          `[mcp-mbe] HTTP server listening on http://${info.hostname}:${info.port}`,
        );
      },
    });

    console.error(
      `[mcp-mbe] Server ready (${toolsClient.count} tools) - HTTP mode${
        categories ? ` - categories: ${categories.join(", ")}` : ""
      }`,
    );

    Deno.addSignalListener("SIGINT", async () => {
      console.error("[mcp-mbe] Shutting down...");
      Deno.exit(0);
    });
  } else {
    await server.start();

    console.error(
      `[mcp-mbe] Server ready (${toolsClient.count} tools) - stdio mode${
        categories ? ` - categories: ${categories.join(", ")}` : ""
      }`,
    );
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("[mcp-mbe] Fatal error:", error);
    Deno.exit(1);
  });
}
