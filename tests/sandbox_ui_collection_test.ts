/**
 * Sandbox UI Collection Tests
 *
 * Tests that SandboxExecutor properly collects _meta.ui from MCP tool responses.
 * Story 16.3: UI Collection in Sandbox Executor
 */

import { assertEquals, assertExists } from "@std/assert";
import { SandboxExecutor } from "../src/execution/mod.ts";
import type { ToolCallHandler } from "../src/execution/types.ts";
import { initializeRouting, resetRouting } from "../src/routing/mod.ts";

/**
 * Initialize routing for tests - all tools route to client handler.
 */
function setupTestRouting(): void {
  resetRouting();
  initializeRouting({
    version: "test",
    clientTools: ["viz", "std", "tool", "postgres", "filesystem", "shell"],
    serverTools: [],
    defaultRouting: "client",
  });
}

/**
 * Cleanup routing after tests.
 */
function teardownTestRouting(): void {
  resetRouting();
}

Deno.test({
  name: "SandboxExecutor - collects UI metadata from MCP response",
  async fn() {
    setupTestRouting();
    try {
      const executor = new SandboxExecutor({
        cloudUrl: "http://mock:3000",
        apiKey: "test-key",
      });

      // Mock a tool handler that returns _meta.ui
      const mockHandler: ToolCallHandler = async (toolId, _args, _parentTraceId) => {
        if (toolId === "viz:render") {
          return {
            chart: { type: "bar", data: [] },
            _meta: {
              ui: {
                resourceUri: "ui://viz/chart/abc123",
                context: { chartType: "bar" },
              },
            },
          };
        }
        return { result: "ok" };
      };

      const result = await executor.execute(
        `const chart = await mcp.viz.render({ type: "bar" }); return chart;`,
        {
          context: {},
          clientToolHandler: mockHandler,
        },
      );

      assertEquals(result.success, true);
      assertExists(result.collectedUi);
      assertEquals(result.collectedUi?.length, 1);
      assertEquals(result.collectedUi?.[0].source, "viz:render");
      assertEquals(result.collectedUi?.[0].resourceUri, "ui://viz/chart/abc123");
      assertEquals(result.collectedUi?.[0].slot, 0);
      assertEquals(result.collectedUi?.[0].context?.chartType, "bar");
    } finally {
      teardownTestRouting();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "SandboxExecutor - skips responses without UI metadata",
  async fn() {
    setupTestRouting();
    try {
      const executor = new SandboxExecutor({
        cloudUrl: "http://mock:3000",
        apiKey: "test-key",
      });

      const mockHandler: ToolCallHandler = async () => {
        return { data: "no UI here" };
      };

      const result = await executor.execute(
        `return await mcp.std.echo({ msg: "hello" });`,
        { context: {}, clientToolHandler: mockHandler },
      );

      assertEquals(result.success, true);
      assertEquals(result.collectedUi, undefined); // No UI collected
    } finally {
      teardownTestRouting();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "SandboxExecutor - maintains slot order for multiple UIs",
  async fn() {
    setupTestRouting();
    try {
      const executor = new SandboxExecutor({
        cloudUrl: "http://mock:3000",
        apiKey: "test-key",
      });

      let callCount = 0;
      const mockHandler: ToolCallHandler = async () => {
        callCount++;
        return {
          data: `result-${callCount}`,
          _meta: {
            ui: { resourceUri: `ui://test/slot/${callCount}` },
          },
        };
      };

      const result = await executor.execute(
        `
        await mcp.tool.a({});
        await mcp.tool.b({});
        await mcp.tool.c({});
        return "done";
        `,
        { context: {}, clientToolHandler: mockHandler },
      );

      assertEquals(result.success, true);
      assertEquals(result.collectedUi?.length, 3);
      assertEquals(result.collectedUi?.[0].slot, 0);
      assertEquals(result.collectedUi?.[0].source, "tool:a");
      assertEquals(result.collectedUi?.[1].slot, 1);
      assertEquals(result.collectedUi?.[1].source, "tool:b");
      assertEquals(result.collectedUi?.[2].slot, 2);
      assertEquals(result.collectedUi?.[2].source, "tool:c");
    } finally {
      teardownTestRouting();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "SandboxExecutor - includes tool args in context._args",
  async fn() {
    setupTestRouting();
    try {
      const executor = new SandboxExecutor({
        cloudUrl: "http://mock:3000",
        apiKey: "test-key",
      });

      const mockHandler: ToolCallHandler = async (_toolId, _args) => {
        return {
          rows: [{ id: 1 }],
          _meta: {
            ui: {
              resourceUri: "ui://postgres/table/abc",
              context: { query: "SELECT *", rows: 100 },
            },
          },
        };
      };

      const result = await executor.execute(
        `return await mcp.postgres.query({ sql: "SELECT *", filter: { region: "EU" } });`,
        { context: {}, clientToolHandler: mockHandler },
      );

      assertEquals(result.success, true);
      assertEquals(result.collectedUi?.length, 1);

      // Tool args are preserved for event detection
      const ctx = result.collectedUi?.[0].context;
      assertEquals(ctx?._args, { sql: "SELECT *", filter: { region: "EU" } });
      // Original context is also preserved
      assertEquals(ctx?.query, "SELECT *");
      assertEquals(ctx?.rows, 100);
    } finally {
      teardownTestRouting();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "SandboxExecutor - mixed responses with and without UI",
  async fn() {
    setupTestRouting();
    try {
      const executor = new SandboxExecutor({
        cloudUrl: "http://mock:3000",
        apiKey: "test-key",
      });

      const mockHandler: ToolCallHandler = async (_toolId) => {
        // Only tool 2 returns UI
        if (_toolId === "tool:with_ui") {
          return {
            data: "has UI",
            _meta: {
              ui: { resourceUri: "ui://only/one" },
            },
          };
        }
        return { data: "no UI" };
      };

      const result = await executor.execute(
        `
        await mcp.tool.no_ui({});
        await mcp.tool.with_ui({});
        await mcp.tool.also_no_ui({});
        return "done";
        `,
        { context: {}, clientToolHandler: mockHandler },
      );

      assertEquals(result.success, true);
      assertEquals(result.collectedUi?.length, 1);
      assertEquals(result.collectedUi?.[0].source, "tool:with_ui");
      assertEquals(result.collectedUi?.[0].slot, 0); // First (and only) UI collected
    } finally {
      teardownTestRouting();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "SandboxExecutor - collectedUi is undefined when no UI collected",
  async fn() {
    setupTestRouting();
    try {
      const executor = new SandboxExecutor({
        cloudUrl: "http://mock:3000",
        apiKey: "test-key",
      });

      const mockHandler: ToolCallHandler = async () => {
        return { data: "plain response" };
      };

      const result = await executor.execute(
        `
        await mcp.tool.a({});
        await mcp.tool.b({});
        return "done";
        `,
        { context: {}, clientToolHandler: mockHandler },
      );

      assertEquals(result.success, true);
      // collectedUi should be undefined (not empty array) when no UI collected
      assertEquals(result.collectedUi, undefined);
      assertEquals("collectedUi" in result, false);
    } finally {
      teardownTestRouting();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "SandboxExecutor - handles _meta.ui with only resourceUri (no context)",
  async fn() {
    setupTestRouting();
    try {
      const executor = new SandboxExecutor({
        cloudUrl: "http://mock:3000",
        apiKey: "test-key",
      });

      const mockHandler: ToolCallHandler = async () => {
        return {
          data: "minimal UI",
          _meta: {
            ui: {
              resourceUri: "ui://minimal/test",
              // No context provided
            },
          },
        };
      };

      const result = await executor.execute(
        `return await mcp.tool.minimal({ arg1: "value" });`,
        { context: {}, clientToolHandler: mockHandler },
      );

      assertEquals(result.success, true);
      assertEquals(result.collectedUi?.length, 1);
      assertEquals(result.collectedUi?.[0].resourceUri, "ui://minimal/test");
      // Context should only have _args (merged with undefined context)
      assertEquals(result.collectedUi?.[0].context?._args, { arg1: "value" });
    } finally {
      teardownTestRouting();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
