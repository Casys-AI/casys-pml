/**
 * RPC Router parentTraceId Propagation Tests
 *
 * ADR-041/065: Tests that parentTraceId is correctly propagated through
 * nested capability executions via RpcRouter.
 *
 * @module tests/unit/sandbox/rpc-router-parenttraceid-test
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  RpcRouter,
  type RpcRouterConfig,
  type WorkerBridgeFactory,
} from "../../../src/sandbox/rpc-router.ts";
import type { CapabilityStore } from "../../../src/capabilities/capability-store.ts";
import type { CapabilityRegistry } from "../../../src/capabilities/capability-registry.ts";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Track all execute() calls for verification
 */
interface ExecuteCall {
  code: string;
  context?: Record<string, unknown>;
  parentTraceId?: string;
  options?: { preserveTraces?: boolean; traceId?: string };
}

/**
 * Create a mock WorkerBridge that tracks execute() calls
 */
function createMockBridgeFactory(calls: ExecuteCall[]): WorkerBridgeFactory {
  return (_config) => ({
    execute: async (
      code: string,
      _toolDefinitions,
      context?: Record<string, unknown>,
      _capabilityContext?: string,
      parentTraceId?: string,
      options?: { preserveTraces?: boolean; traceId?: string },
    ) => {
      calls.push({ code, context, parentTraceId, options });
      return { success: true, result: { executed: true }, executionTimeMs: 10 };
    },
    cleanup: () => {},
  });
}

/**
 * Create mock CapabilityRegistry
 * Uses 'as unknown as' to satisfy type checker - only fields used by RpcRouter are provided
 */
function createMockRegistry(capabilities: Map<string, { id: string; workflowPatternId: string }>) {
  return {
    resolveByName: async (name: string, _scope?: { org: string; project: string }) => {
      const cap = capabilities.get(name);
      if (!cap) return null;
      return {
        id: cap.id,
        workflowPatternId: cap.workflowPatternId,
        displayName: name,
        org: "test",
        project: "default",
        namespace: name.split(":")[0],
        action: name.split(":")[1],
        hash: "abc123",
        version: 1,
        verified: false,
        usageCount: 0,
        successCount: 0,
        tags: [],
        embedding: null,
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
    getById: async (uuid: string) => {
      for (const [name, cap] of capabilities) {
        if (cap.id === uuid) {
          return {
            id: cap.id,
            workflowPatternId: cap.workflowPatternId,
            displayName: name,
            org: "test",
            project: "default",
            namespace: name.split(":")[0],
            action: name.split(":")[1],
            hash: "abc123",
            version: 1,
            verified: false,
            usageCount: 0,
            successCount: 0,
            tags: [],
            embedding: null,
            description: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
      }
      return null;
    },
  } as unknown as CapabilityRegistry;
}

/**
 * Create mock CapabilityStore
 * Uses 'as unknown as' to satisfy type checker - only fields used by RpcRouter are provided
 */
function createMockStore(patterns: Map<string, { codeSnippet: string; description?: string }>) {
  return {
    findById: async (id: string) => {
      const pattern = patterns.get(id);
      if (!pattern) return null;
      return {
        id,
        codeSnippet: pattern.codeSnippet,
        description: pattern.description ?? "test capability",
        dagStructure: {},
        codeHash: "mock-hash",
        intentEmbedding: null,
        cacheConfig: {},
        usageCount: 0,
        successCount: 0,
        verified: false,
        tags: [],
        isPublic: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
  } as unknown as CapabilityStore;
}

// =============================================================================
// AC1: parentTraceId Passed to Capability Execution
// =============================================================================

Deno.test("RpcRouter: passes parentTraceId to capability execution via $cap:<uuid>", async () => {
  const executeCalls: ExecuteCall[] = [];
  const bridgeFactory = createMockBridgeFactory(executeCalls);

  const capabilityId = crypto.randomUUID();
  const patternId = crypto.randomUUID();

  const registry = createMockRegistry(new Map([
    ["test:action", { id: capabilityId, workflowPatternId: patternId }],
  ]));

  const store = createMockStore(new Map([
    [patternId, { codeSnippet: "return 'hello';", description: "Test capability" }],
  ]));

  const config: RpcRouterConfig = {
    mcpClients: new Map(),
    capabilityRegistry: registry as CapabilityRegistry,
    capabilityStore: store as CapabilityStore,
    timeout: 30000,
  };

  const router = new RpcRouter(config, bridgeFactory);

  // Route with parentTraceId
  const parentTraceId = crypto.randomUUID();
  const result = await router.route("$cap", capabilityId, { arg1: "value" }, parentTraceId);

  assertEquals(result.success, true);
  assertEquals(result.routeType, "cap_uuid");

  // Verify parentTraceId was passed to bridge.execute()
  assertEquals(executeCalls.length, 1);
  assertEquals(executeCalls[0].parentTraceId, parentTraceId);
});

Deno.test("RpcRouter: passes parentTraceId to named capability execution", async () => {
  const executeCalls: ExecuteCall[] = [];
  const bridgeFactory = createMockBridgeFactory(executeCalls);

  const capabilityId = crypto.randomUUID();
  const patternId = crypto.randomUUID();

  const registry = createMockRegistry(new Map([
    ["myns:myaction", { id: capabilityId, workflowPatternId: patternId }],
  ]));

  const store = createMockStore(new Map([
    [patternId, { codeSnippet: "return mcp.std.echo({});", description: "Named cap" }],
  ]));

  const config: RpcRouterConfig = {
    mcpClients: new Map(),
    capabilityRegistry: registry as CapabilityRegistry,
    capabilityStore: store as CapabilityStore,
    timeout: 30000,
  };

  const router = new RpcRouter(config, bridgeFactory);

  // Route named capability with parentTraceId
  const parentTraceId = crypto.randomUUID();
  const result = await router.route("myns", "myaction", {}, parentTraceId);

  assertEquals(result.success, true);
  assertEquals(result.routeType, "capability");

  // Verify parentTraceId was passed
  assertEquals(executeCalls.length, 1);
  assertEquals(executeCalls[0].parentTraceId, parentTraceId);
});

// =============================================================================
// AC2: Child TraceId Generated for Each Execution
// =============================================================================

Deno.test("RpcRouter: generates unique childTraceId for each capability execution", async () => {
  const executeCalls: ExecuteCall[] = [];
  const bridgeFactory = createMockBridgeFactory(executeCalls);

  const capabilityId = crypto.randomUUID();
  const patternId = crypto.randomUUID();

  const registry = createMockRegistry(new Map([
    ["test:action", { id: capabilityId, workflowPatternId: patternId }],
  ]));

  const store = createMockStore(new Map([
    [patternId, { codeSnippet: "return 1;", description: "Test" }],
  ]));

  const config: RpcRouterConfig = {
    mcpClients: new Map(),
    capabilityRegistry: registry as CapabilityRegistry,
    capabilityStore: store as CapabilityStore,
    timeout: 30000,
  };

  const router = new RpcRouter(config, bridgeFactory);

  // Execute capability twice
  await router.route("$cap", capabilityId, {});
  await router.route("$cap", capabilityId, {});

  // Each execution should have unique traceId
  assertEquals(executeCalls.length, 2);
  assertExists(executeCalls[0].options?.traceId);
  assertExists(executeCalls[1].options?.traceId);
  // TraceIds should be different
  assertEquals(executeCalls[0].options?.traceId !== executeCalls[1].options?.traceId, true);
});

// =============================================================================
// AC3: parentTraceId Undefined When Not Provided
// =============================================================================

Deno.test("RpcRouter: parentTraceId is undefined when not provided", async () => {
  const executeCalls: ExecuteCall[] = [];
  const bridgeFactory = createMockBridgeFactory(executeCalls);

  const capabilityId = crypto.randomUUID();
  const patternId = crypto.randomUUID();

  const registry = createMockRegistry(new Map([
    ["test:action", { id: capabilityId, workflowPatternId: patternId }],
  ]));

  const store = createMockStore(new Map([
    [patternId, { codeSnippet: "return null;", description: "Test" }],
  ]));

  const config: RpcRouterConfig = {
    mcpClients: new Map(),
    capabilityRegistry: registry as CapabilityRegistry,
    capabilityStore: store as CapabilityStore,
    timeout: 30000,
  };

  const router = new RpcRouter(config, bridgeFactory);

  // Route WITHOUT parentTraceId
  await router.route("$cap", capabilityId, {});

  assertEquals(executeCalls.length, 1);
  assertEquals(executeCalls[0].parentTraceId, undefined);
});

// =============================================================================
// AC4: Intent Passed for Trace Saving
// =============================================================================

Deno.test("RpcRouter: passes intent from pattern.description to context", async () => {
  const executeCalls: ExecuteCall[] = [];
  const bridgeFactory = createMockBridgeFactory(executeCalls);

  const capabilityId = crypto.randomUUID();
  const patternId = crypto.randomUUID();

  const registry = createMockRegistry(new Map([
    ["test:action", { id: capabilityId, workflowPatternId: patternId }],
  ]));

  const store = createMockStore(new Map([
    [patternId, { codeSnippet: "return 1;", description: "Process user data securely" }],
  ]));

  const config: RpcRouterConfig = {
    mcpClients: new Map(),
    capabilityRegistry: registry as CapabilityRegistry,
    capabilityStore: store as CapabilityStore,
    timeout: 30000,
  };

  const router = new RpcRouter(config, bridgeFactory);

  await router.route("$cap", capabilityId, { input: "data" });

  assertEquals(executeCalls.length, 1);
  // Intent should be passed in context for trace saving
  assertEquals(executeCalls[0].context?.intent, "Process user data securely");
  // Capability ID should also be in context
  assertEquals(executeCalls[0].context?.__capability_id, capabilityId);
});

// =============================================================================
// AC5: MCP Server Routing Does Not Use parentTraceId
// =============================================================================

Deno.test("RpcRouter: MCP server fallback does not use parentTraceId (no nested execution)", async () => {
  const executeCalls: ExecuteCall[] = [];
  const bridgeFactory = createMockBridgeFactory(executeCalls);

  // Mock MCP client
  const mockMcpClient = {
    callTool: async (_tool: string, _args: unknown) => {
      return { content: [{ text: "result" }], isError: false };
    },
  };

  const config: RpcRouterConfig = {
    mcpClients: new Map([["std", mockMcpClient as any]]),
    timeout: 30000,
  };

  const router = new RpcRouter(config, bridgeFactory);

  // Route to MCP server (not a capability)
  const parentTraceId = crypto.randomUUID();
  const result = await router.route("std", "echo", { text: "hello" }, parentTraceId);

  assertEquals(result.success, true);
  assertEquals(result.routeType, "mcp_server");

  // Bridge should NOT have been called (MCP server handles directly)
  assertEquals(executeCalls.length, 0);
});

// =============================================================================
// AC6: Multiple Nested Capabilities Share Same Parent
// =============================================================================

Deno.test("RpcRouter: sibling capabilities share same parentTraceId", async () => {
  const executeCalls: ExecuteCall[] = [];
  const bridgeFactory = createMockBridgeFactory(executeCalls);

  const capabilityId1 = crypto.randomUUID();
  const capabilityId2 = crypto.randomUUID();
  const patternId1 = crypto.randomUUID();
  const patternId2 = crypto.randomUUID();

  const registry = createMockRegistry(new Map([
    ["test:action1", { id: capabilityId1, workflowPatternId: patternId1 }],
    ["test:action2", { id: capabilityId2, workflowPatternId: patternId2 }],
  ]));

  const store = createMockStore(new Map([
    [patternId1, { codeSnippet: "return 1;", description: "Action 1" }],
    [patternId2, { codeSnippet: "return 2;", description: "Action 2" }],
  ]));

  const config: RpcRouterConfig = {
    mcpClients: new Map(),
    capabilityRegistry: registry as CapabilityRegistry,
    capabilityStore: store as CapabilityStore,
    timeout: 30000,
  };

  const router = new RpcRouter(config, bridgeFactory);

  // Execute two sibling capabilities with same parent
  const parentTraceId = crypto.randomUUID();
  await router.route("test", "action1", {}, parentTraceId);
  await router.route("test", "action2", {}, parentTraceId);

  // Both should have same parentTraceId
  assertEquals(executeCalls.length, 2);
  assertEquals(executeCalls[0].parentTraceId, parentTraceId);
  assertEquals(executeCalls[1].parentTraceId, parentTraceId);

  // But different childTraceIds
  assertEquals(executeCalls[0].options?.traceId !== executeCalls[1].options?.traceId, true);
});

// =============================================================================
// AC7: Error Handling Preserves Trace Context
// =============================================================================

Deno.test("RpcRouter: capability not found still has correct routeType", async () => {
  const executeCalls: ExecuteCall[] = [];
  const bridgeFactory = createMockBridgeFactory(executeCalls);

  // Empty registry - no capabilities
  const registry = createMockRegistry(new Map());
  const store = createMockStore(new Map());

  const config: RpcRouterConfig = {
    mcpClients: new Map(),
    capabilityRegistry: registry as CapabilityRegistry,
    capabilityStore: store as CapabilityStore,
    timeout: 30000,
  };

  const router = new RpcRouter(config, bridgeFactory);

  // Try to route to non-existent capability UUID
  const result = await router.route("$cap", crypto.randomUUID(), {});

  assertEquals(result.success, false);
  assertEquals(result.routeType, "cap_uuid");
  assertExists(result.error);

  // No execution should have been attempted
  assertEquals(executeCalls.length, 0);
});
