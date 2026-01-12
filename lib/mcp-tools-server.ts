/**
 * MCP Server Bootstrap for Std (Standard Library) Tools
 *
 * This file bootstraps the std tools as a proper MCP server
 * that can be loaded via mcp-servers.json.
 *
 * Now uses the ConcurrentMCPServer framework for production-ready
 * concurrency control and backpressure.
 *
 * Usage in mcp-servers.json:
 * {
 *   "mcpServers": {
 *     "std": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "lib/mcp-tools-server.ts"]
 *     }
 *   }
 * }
 *
 * @module lib/mcp-tools-server
 */

import { ConcurrentMCPServer } from "./server/mod.ts";
import { MiniToolsClient } from "./mcp-tools.ts";
import { createAgenticSamplingClient, setSamplingClient } from "./std/mod.ts";

async function main() {
  // Parse command line arguments for category filtering
  const args = Deno.args;
  const categoriesArg = args.find((arg) => arg.startsWith("--categories="));
  const categories = categoriesArg
    ? categoriesArg.split("=")[1].split(",")
    : undefined;

  // Initialize tools client
  const toolsClient = new MiniToolsClient(
    categories ? { categories } : undefined,
  );

  // Create agentic sampling client
  const samplingClient = createAgenticSamplingClient();
  setSamplingClient(samplingClient);

  console.error(
    "[mcp-std] Agentic sampling client initialized (Anthropic + OpenAI support)",
  );

  // Create concurrent MCP server with framework
  const server = new ConcurrentMCPServer({
    name: "mcp-std",
    version: "0.2.0",
    maxConcurrent: 10,
    backpressureStrategy: "sleep",
    enableSampling: true,
    samplingClient,
    logger: (msg) => console.error(`[mcp-std] ${msg}`),
  });

  // Register all tools from MiniToolsClient
  const mcpTools = toolsClient.toMCPFormat();
  const handlers = new Map();

  for (const tool of toolsClient.listTools()) {
    handlers.set(tool.name, tool.handler);
  }

  server.registerTools(mcpTools, handlers);

  // Start server
  await server.start();

  console.error(
    `[mcp-std] Server ready (${toolsClient.count} tools)${
      categories ? ` - categories: ${categories.join(", ")}` : ""
    }`,
  );
}

// Run if main module
if (import.meta.main) {
  main().catch((error) => {
    console.error("[mcp-std] Fatal error:", error);
    Deno.exit(1);
  });
}
