/**
 * MCP Server Bootstrap for Std (Standard Library) Tools
 *
 * This file bootstraps the std tools as a proper MCP server
 * that can be loaded via mcp-servers.json.
 *
 * Uses the ConcurrentMCPServer framework for production-ready
 * concurrency control and backpressure.
 *
 * Usage in mcp-servers.json:
 * {
 *   "mcpServers": {
 *     "std": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "jsr:@casys/mcp-std/server"]
 *     }
 *   }
 * }
 *
 * @module lib/std/server
 */

import { ConcurrentMCPServer, MCP_APP_MIME_TYPE, SamplingBridge } from "@casys/mcp-server";
import { MiniToolsClient } from "./src/client.ts";
import { createAgenticSamplingClient, setSamplingClient } from "./src/tools/agent.ts";
import { loadUiHtml, UI_RESOURCES } from "./src/ui/mod.ts";

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

  // Create agentic sampling client and wrap with SamplingBridge
  // The bridge adds timeout handling, request tracking, and cancellation support
  const underlyingSamplingClient = createAgenticSamplingClient();
  const samplingBridge = new SamplingBridge(underlyingSamplingClient, {
    timeout: 120000, // 2 minute timeout for agentic loops
  });

  // Use the bridge as the sampling client - it implements createMessage()
  // This routes all sampling through the bridge for better lifecycle management
  setSamplingClient(samplingBridge);

  console.error(
    "[mcp-std] Sampling bridge initialized (timeout: 120s, tracking enabled)",
  );

  // Create concurrent MCP server with framework
  const server = new ConcurrentMCPServer({
    name: "mcp-std",
    version: "0.2.1",
    maxConcurrent: 10,
    backpressureStrategy: "sleep",
    enableSampling: true,
    samplingClient: samplingBridge,
    logger: (msg) => console.error(`[mcp-std] ${msg}`),
  });

  // Register all tools from MiniToolsClient
  const mcpTools = toolsClient.toMCPFormat();
  const handlers = new Map();

  for (const tool of toolsClient.listTools()) {
    handlers.set(tool.name, tool.handler);
  }

  server.registerTools(mcpTools, handlers);

  // Collect and register UI resources from tools with _meta.ui
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
        console.error(`[mcp-std] Registered UI resource: ${ui.resourceUri}`);
      } else {
        console.error(`[mcp-std] Warning: UI resource metadata not found for ${ui.resourceUri}`);
      }
    }
  }

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
