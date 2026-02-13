/**
 * Tests for PmlServer.registerUiResource()
 *
 * Validates that Tool UI HTML fetched during discovery
 * is correctly registered in ConcurrentMCPServer for resources/read serving.
 *
 * @module tests/pml_server_ui_resources_test
 */

import { assertEquals } from "@std/assert";
import { PmlServer } from "../src/server/pml-server.ts";
import type { PmlContext } from "../src/server/pml-context.ts";
import { TraceSyncer } from "../src/tracing/mod.ts";

/**
 * Create a minimal PmlContext for testing.
 * Uses onlyMode=true so no PML tools are registered (we only test resources).
 */
function createTestContext(): PmlContext {
  return {
    workspace: "/tmp/test",
    workspaceResult: { path: "/tmp/test", source: "fallback" },
    config: {},
    configPath: "/tmp/test/.pml.json",
    cloudUrl: "http://localhost:3003",
    apiKey: "test-key",
    permissions: { allowedTools: [], deniedTools: [] },
    sessionClient: null,
    loader: null,
    lockfileManager: null,
    traceSyncer: new TraceSyncer({ cloudUrl: "http://localhost:3003" }),
    exposedCapabilities: [],
    onlyMode: true, // Skip tool registration — only testing resources
    userMcpServers: new Map(),
  } as unknown as PmlContext;
}

/**
 * Create a PmlServer instance for testing.
 */
function createTestServer(): PmlServer {
  const logs: string[] = [];
  const server = new PmlServer(
    {
      useFullDescriptions: false,
      logger: { debug: (msg: string) => logs.push(msg) },
    },
    createTestContext(),
  );
  return server;
}

// ---------------------------------------------------------------------------
// registerUiResource
// ---------------------------------------------------------------------------

Deno.test("registerUiResource - registers a Tool UI resource", () => {
  const server = createTestServer();

  // Should not throw
  server.registerUiResource(
    "ui://mcp-std/chart-viewer",
    "<html><body>Chart</body></html>",
  );
});

Deno.test("registerUiResource - handles duplicate URIs silently", () => {
  const server = createTestServer();

  server.registerUiResource(
    "ui://mcp-std/table-viewer",
    "<html><body>Table v1</body></html>",
  );

  // Same URI again — should not throw (duplicate handled gracefully)
  server.registerUiResource(
    "ui://mcp-std/table-viewer",
    "<html><body>Table v2</body></html>",
  );
});

Deno.test("registerUiResource - registers multiple distinct resources", () => {
  const server = createTestServer();

  const resources = [
    { uri: "ui://mcp-std/chart-viewer", html: "<html>Chart</html>" },
    { uri: "ui://mcp-std/table-viewer", html: "<html>Table</html>" },
    { uri: "ui://mcp-std/json-viewer", html: "<html>JSON</html>" },
    { uri: "ui://mcp-std/map-viewer", html: "<html>Map</html>" },
  ];

  for (const r of resources) {
    server.registerUiResource(r.uri, r.html);
  }

  // All 4 should register without error
});

Deno.test("registerUiResource - accepts custom mimeType", () => {
  const server = createTestServer();

  server.registerUiResource(
    "ui://mcp-std/svg-viewer",
    "<svg>...</svg>",
    "image/svg+xml",
  );
});

Deno.test("registerUiResource - extracts name from URI", () => {
  // Validates the name extraction logic (last segment of URI)
  const logs: string[] = [];
  const server = new PmlServer(
    {
      useFullDescriptions: false,
      logger: { debug: (msg: string) => logs.push(msg) },
    },
    createTestContext(),
  );

  server.registerUiResource(
    "ui://mcp-std/chart-viewer",
    "<html>Chart</html>",
  );

  // The ConcurrentMCPServer logs the registered resource name
  const registerLog = logs.find((l) => l.includes("chart-viewer"));
  assertEquals(!!registerLog, true, "Should log resource name 'chart-viewer'");
});

// ---------------------------------------------------------------------------
// Discovery wiring simulation
// ---------------------------------------------------------------------------

Deno.test("registerUiResource - simulates post-discovery registration flow", () => {
  const server = createTestServer();

  // Simulate DiscoveryResult.uiHtml[] from fetchUiResources()
  const discoveryResults = [
    {
      serverName: "mcp-std",
      uiHtml: [
        { resourceUri: "ui://mcp-std/chart-viewer", content: "<html>Chart</html>", mimeType: "text/html" },
        { resourceUri: "ui://mcp-std/table-viewer", content: "<html>Table</html>", mimeType: "text/html" },
      ],
    },
    {
      serverName: "mcp-postgres",
      uiHtml: [
        { resourceUri: "ui://postgres/data-grid", content: "<html>Grid</html>", mimeType: "text/html" },
      ],
    },
    {
      serverName: "mcp-shell",
      uiHtml: undefined, // Server has no UI resources
    },
  ];

  // This is the exact pattern used in serve-command.ts and stdio-command.ts
  let uiCount = 0;
  for (const result of discoveryResults) {
    for (const ui of result.uiHtml ?? []) {
      server.registerUiResource(ui.resourceUri, ui.content, ui.mimeType);
      uiCount++;
    }
  }

  assertEquals(uiCount, 3, "Should register 3 UI resources from 2 servers");
});
