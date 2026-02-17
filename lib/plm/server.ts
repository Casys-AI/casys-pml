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
const DEFAULT_FEED_PORT = 3011;

// ─── Feed SSE Broadcast ──────────────────────────────────────
// Tool results are pushed here; all connected browsers receive them via SSE.

type FeedEvent = {
  toolName: string;
  result: unknown;
  durationMs: number;
  timestamp: string;
  isError: boolean;
};

const feedClients = new Set<ReadableStreamDefaultController>();

function broadcastFeedEvent(event: FeedEvent) {
  const data = JSON.stringify(event);
  // Single path: POST to feed server (works for both HTTP and stdio modes)
  fetch("http://localhost:3011/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: data,
  }).catch(() => { /* feed server not running, ignore */ });
  console.error(`[feed] broadcast ${event.toolName}`);
}

function startFeedServer(port: number, demoHtmlPath: string, toolViewers: Record<string, string>) {
  const toolViewersJson = JSON.stringify(toolViewers);

  Deno.serve({ port, hostname: "0.0.0.0" }, async (req) => {
    const url = new URL(req.url);

    // Tool → viewer mapping for demo page (dynamic from _meta.ui)
    if (url.pathname === "/tools-meta") {
      return new Response(toolViewersJson, {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // SSE feed endpoint
    if (url.pathname === "/feed") {
      const stream = new ReadableStream({
        start(controller) {
          feedClients.add(controller);
          // Send a heartbeat so client knows it's connected
          controller.enqueue(new TextEncoder().encode(": connected\n\n"));
        },
        cancel(controller) {
          feedClients.delete(controller);
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Receive broadcast from stdio process
    if (url.pathname === "/broadcast" && req.method === "POST") {
      const event = await req.json();
      const msg = `data: ${JSON.stringify(event)}\n\n`;
      for (const ctrl of feedClients) {
        try { ctrl.enqueue(new TextEncoder().encode(msg)); } catch { feedClients.delete(ctrl); }
      }
      console.error(`[feed] relay ${event.toolName} → ${feedClients.size} client(s)`);
      return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
    }

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" } });
    }

    // Serve UI viewer HTML from dist/ (for MCP Apps iframe embedding)
    // Searches lib/plm and lib/sim dist paths so any MCP server's viewers are available.
    const uiMatch = url.pathname.match(/^\/ui\/([a-z-]+)$/);
    if (uiMatch) {
      const uiName = uiMatch[1];
      // Derive workspace root: lib/plm/server.ts → go up 2 levels
      const libRoot = new URL("../", import.meta.url).pathname;
      const searchPaths = [
        `${libRoot}plm/src/ui/dist/${uiName}/index.html`,
        `${libRoot}sim/src/ui/dist/${uiName}/index.html`,
      ];
      for (const uiPath of searchPaths) {
        try {
          const html = await Deno.readTextFile(uiPath);
          return new Response(html, {
            headers: { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" },
          });
        } catch { /* try next path */ }
      }
      return new Response(`UI viewer "${uiName}" not found (searched: ${searchPaths.join(", ")})`, { status: 404 });
    }

    // Serve demo.html at root
    if (url.pathname === "/" || url.pathname === "/index.html") {
      try {
        const html = await Deno.readTextFile(demoHtmlPath);
        return new Response(html, { headers: { "Content-Type": "text/html" } });
      } catch {
        return new Response("demo.html not found", { status: 404 });
      }
    }

    return new Response("Not found", { status: 404 });
  });
  console.error(`[feed] SSE feed server on http://localhost:${port} (/ = demo, /feed = SSE)`);
}

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

  // Register all tools (wrapped to broadcast results to feed)
  const mcpTools = toolsClient.toMCPFormat();
  const handlers = new Map();

  for (const tool of toolsClient.listTools()) {
    const originalHandler = tool.handler;
    const wrappedHandler = async (args: Record<string, unknown>) => {
      const t0 = performance.now();
      try {
        const result = await originalHandler(args);
        const ms = Math.round(performance.now() - t0);
        // Extract the actual data from MCP content format
        let parsed: unknown = result;
        if (result?.content) {
          for (const c of result.content) {
            if (c.type === "text") {
              try { parsed = JSON.parse(c.text); } catch { parsed = c.text; }
              break;
            }
          }
        }
        broadcastFeedEvent({
          toolName: tool.name,
          result: parsed,
          durationMs: ms,
          timestamp: new Date().toISOString(),
          isError: false,
        });
        return result;
      } catch (err) {
        broadcastFeedEvent({
          toolName: tool.name,
          result: { error: (err as Error).message },
          durationMs: Math.round(performance.now() - t0),
          timestamp: new Date().toISOString(),
          isError: true,
        });
        throw err;
      }
    };
    handlers.set(tool.name, wrappedHandler);
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

  // Build tool → viewer mapping from _meta.ui.resourceUri
  const toolViewers: Record<string, string> = {};
  for (const tool of toolsClient.listTools()) {
    const uri = tool._meta?.ui?.resourceUri;
    if (uri) {
      // Extract viewer name from "ui://mcp-plm/{viewer-name}"
      const match = uri.match(/^ui:\/\/[^/]+\/(.+)$/);
      if (match) {
        toolViewers[tool.name] = match[1];
      }
    }
  }
  console.error(`[mcp-plm] Tool viewers: ${Object.keys(toolViewers).length} tools with UI`);

  // Start server
  if (httpFlag) {
    // Start feed SSE server alongside the MCP server
    const feedPortArg = args.find((arg) => arg.startsWith("--feed-port="));
    const feedPort = feedPortArg ? parseInt(feedPortArg.split("=")[1], 10) : DEFAULT_FEED_PORT;
    const demoHtmlPath = new URL("./demo.html", import.meta.url).pathname;
    startFeedServer(feedPort, demoHtmlPath, toolViewers);

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
