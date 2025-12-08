/**
 * Gateway Server Unit Tests
 *
 * Tests for MCP gateway server functionality:
 * - Server initialization
 * - Handler registration
 * - list_tools handler (with/without query)
 * - call_tool handler (single tool + workflow)
 * - MCP-compliant error responses
 *
 * @module tests/unit/mcp/gateway_server_test
 */

import { assert, assertEquals, assertExists } from "@std/assert";
import { AgentCardsGatewayServer } from "../../../src/mcp/gateway-server.ts";
import type { PGliteClient } from "../../../src/db/client.ts";
import type { SearchResult, VectorSearch } from "../../../src/vector/search.ts";
import type { GraphRAGEngine } from "../../../src/graphrag/graph-engine.ts";
import type { DAGSuggester } from "../../../src/graphrag/dag-suggester.ts";
import type { ParallelExecutor } from "../../../src/dag/executor.ts";
import { MCPClient } from "../../../src/mcp/client.ts";
import type { MCPTool } from "../../../src/mcp/types.ts";

/**
 * Mock database client
 */
function createMockDB(): PGliteClient {
  return {
    query: async (sql: string) => {
      // Mock returning tools from database
      if (sql.includes("SELECT server_id, name, input_schema, description")) {
        return [
          {
            server_id: "filesystem",
            name: "read",
            description: "Read file contents",
            input_schema: { type: "object", properties: { path: { type: "string" } } },
          },
          {
            server_id: "github",
            name: "create_issue",
            description: "Create GitHub issue",
            input_schema: { type: "object", properties: { title: { type: "string" } } },
          },
        ];
      }
      return [];
    },
    connect: async () => {},
    close: async () => {},
  } as unknown as PGliteClient;
}

/**
 * Mock vector search
 */
function createMockVectorSearch(): VectorSearch {
  return {
    searchTools: async (_query: string, topK: number) => {
      const results: SearchResult[] = [
        {
          toolId: "filesystem:read",
          serverId: "filesystem",
          toolName: "read",
          score: 0.85,
          schema: {
            name: "filesystem:read",
            description: "Read file contents",
            inputSchema: { type: "object", properties: { path: { type: "string" } } },
          },
        },
      ];
      return results.slice(0, topK);
    },
  } as unknown as VectorSearch;
}

/**
 * Mock graph engine
 */
function createMockGraphEngine(): GraphRAGEngine {
  return {
    getPageRank: () => 0.5,
    updateFromExecution: async () => {}, // Required for workflow execution
  } as unknown as GraphRAGEngine;
}

/**
 * Mock DAG suggester
 */
function createMockDAGSuggester(): DAGSuggester {
  return {
    suggestDAG: async () => null,
  } as unknown as DAGSuggester;
}

/**
 * Mock parallel executor
 */
function createMockExecutor(): ParallelExecutor {
  return {
    execute: async (_dag: any) => ({
      results: new Map([["t1", { output: "test result", executionTimeMs: 100 }]]),
      errors: [],
      executionTimeMs: 100,
      parallelizationLayers: 1,
    }),
  } as unknown as ParallelExecutor;
}

/**
 * Mock MCP client
 */
function createMockMCPClient(_serverId: string): MCPClient {
  return {
    callTool: async (toolName: string, args: Record<string, unknown>) => {
      return { success: true, output: `Called ${toolName} with ${JSON.stringify(args)}` };
    },
    disconnect: async () => {},
  } as unknown as MCPClient;
}

Deno.test("AgentCardsGatewayServer - Initialization", () => {
  const db = createMockDB();
  const vectorSearch = createMockVectorSearch();
  const graphEngine = createMockGraphEngine();
  const dagSuggester = createMockDAGSuggester();
  const executor = createMockExecutor();
  const mcpClients = new Map<string, MCPClient>();

  const gateway = new AgentCardsGatewayServer(
    db,
    vectorSearch,
    graphEngine,
    dagSuggester,
    executor,
    mcpClients,
    undefined, // capabilityStore
    undefined, // adaptiveThresholdManager
    {
      name: "agentcards-test",
      version: "1.0.0-test",
    },
  );

  assertExists(gateway);
});

Deno.test("AgentCardsGatewayServer - list_tools without query", async () => {
  const db = createMockDB();
  const vectorSearch = createMockVectorSearch();
  const graphEngine = createMockGraphEngine();
  const dagSuggester = createMockDAGSuggester();
  const executor = createMockExecutor();
  const mcpClients = new Map<string, MCPClient>();

  const gateway = new AgentCardsGatewayServer(
    db,
    vectorSearch,
    graphEngine,
    dagSuggester,
    executor,
    mcpClients,
  );

  // Access private method via type assertion for testing
  const handleListTools = (gateway as any).handleListTools.bind(gateway);
  const result = await handleListTools({});

  assertExists(result.tools);
  assert(Array.isArray(result.tools));
  // ADR-013: Should return 8 meta-tools (execute_dag, search_tools, search_capabilities, execute_code, continue, abort, replan, approval_response)
  assertEquals(result.tools.length, 8);

  // Verify DAG execution tool is included (renamed from execute_workflow)
  const dagTool = result.tools.find((t: MCPTool) => t.name === "agentcards:execute_dag");
  assertExists(dagTool);
  assertEquals(dagTool.name, "agentcards:execute_dag");
});

Deno.test("AgentCardsGatewayServer - list_tools with query", async () => {
  const db = createMockDB();
  const vectorSearch = createMockVectorSearch();
  const graphEngine = createMockGraphEngine();
  const dagSuggester = createMockDAGSuggester();
  const executor = createMockExecutor();
  const mcpClients = new Map<string, MCPClient>();

  const gateway = new AgentCardsGatewayServer(
    db,
    vectorSearch,
    graphEngine,
    dagSuggester,
    executor,
    mcpClients,
  );

  const handleListTools = (gateway as any).handleListTools.bind(gateway);
  const result = await handleListTools({ params: { query: "read files" } });

  assertExists(result.tools);
  assert(Array.isArray(result.tools));

  // Should include DAG execution tool + semantic search results (renamed from execute_workflow)
  const dagTool = result.tools.find((t: MCPTool) => t.name === "agentcards:execute_dag");
  assertExists(dagTool);
});

Deno.test("AgentCardsGatewayServer - call_tool single tool proxy", async () => {
  const db = createMockDB();
  const vectorSearch = createMockVectorSearch();
  const graphEngine = createMockGraphEngine();
  const dagSuggester = createMockDAGSuggester();
  const executor = createMockExecutor();

  const mcpClients = new Map<string, MCPClient>();
  mcpClients.set("filesystem", createMockMCPClient("filesystem"));

  const gateway = new AgentCardsGatewayServer(
    db,
    vectorSearch,
    graphEngine,
    dagSuggester,
    executor,
    mcpClients,
  );

  const handleCallTool = (gateway as any).handleCallTool.bind(gateway);
  const result = await handleCallTool({
    params: {
      name: "filesystem:read",
      arguments: { path: "/test.txt" },
    },
  });

  assertExists(result.content);
  assert(Array.isArray(result.content));
  assertEquals(result.content[0].type, "text");
});

Deno.test("AgentCardsGatewayServer - call_tool workflow execution", async () => {
  const db = createMockDB();
  const vectorSearch = createMockVectorSearch();
  const graphEngine = createMockGraphEngine();
  const dagSuggester = createMockDAGSuggester();
  const executor = createMockExecutor();
  const mcpClients = new Map<string, MCPClient>();

  const gateway = new AgentCardsGatewayServer(
    db,
    vectorSearch,
    graphEngine,
    dagSuggester,
    executor,
    mcpClients,
  );

  const handleCallTool = (gateway as any).handleCallTool.bind(gateway);
  const result = await handleCallTool({
    params: {
      name: "agentcards:execute_dag",
      arguments: {
        workflow: {
          tasks: [
            { id: "t1", tool: "test:tool", arguments: {}, depends_on: [] },
          ],
        },
      },
    },
  });

  assertExists(result.content);
  assert(Array.isArray(result.content));

  const response = JSON.parse(result.content[0].text);
  assertEquals(response.status, "completed");
  assertExists(response.results);
});

Deno.test("AgentCardsGatewayServer - MCP error responses", async () => {
  const db = createMockDB();
  const vectorSearch = createMockVectorSearch();
  const graphEngine = createMockGraphEngine();
  const dagSuggester = createMockDAGSuggester();
  const executor = createMockExecutor();
  const mcpClients = new Map<string, MCPClient>();

  const gateway = new AgentCardsGatewayServer(
    db,
    vectorSearch,
    graphEngine,
    dagSuggester,
    executor,
    mcpClients,
  );

  // Test missing tool name
  const handleCallTool = (gateway as any).handleCallTool.bind(gateway);
  const result = await handleCallTool({
    params: {
      arguments: {},
    },
  });

  assertExists(result.error);
  assertEquals(result.error.code, -32602); // INVALID_PARAMS
  assert(result.error.message.includes("Missing required parameter"));
});

Deno.test("AgentCardsGatewayServer - Unknown MCP server error", async () => {
  const db = createMockDB();
  const vectorSearch = createMockVectorSearch();
  const graphEngine = createMockGraphEngine();
  const dagSuggester = createMockDAGSuggester();
  const executor = createMockExecutor();
  const mcpClients = new Map<string, MCPClient>(); // Empty - no servers

  const gateway = new AgentCardsGatewayServer(
    db,
    vectorSearch,
    graphEngine,
    dagSuggester,
    executor,
    mcpClients,
  );

  const handleCallTool = (gateway as any).handleCallTool.bind(gateway);
  const result = await handleCallTool({
    params: {
      name: "unknown:tool",
      arguments: {},
    },
  });

  assertExists(result.error);
  assertEquals(result.error.code, -32602); // INVALID_PARAMS
  assert(result.error.message.includes("Unknown MCP server"));
});
