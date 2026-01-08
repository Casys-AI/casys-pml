/**
 * ExecuteHandlerFacade Unit Tests
 *
 * Phase 3.1: Tests for the thin facade that routes to use cases.
 *
 * @module tests/unit/mcp/handlers/execute-handler-facade_test
 */

import { assertEquals, assertExists } from "@std/assert";
import { ExecuteHandlerFacade } from "../../../../src/mcp/handlers/execute-handler-facade.ts";
import type {
  ExecuteDirectUseCase,
  ExecuteSuggestionUseCase,
  ContinueWorkflowUseCase,
  TrainSHGATUseCase,
} from "../../../../src/application/use-cases/execute/mod.ts";

// ============================================
// Mock Use Case Factories
// ============================================

function createMockExecuteDirectUC(): ExecuteDirectUseCase {
  return {
    execute: async (request: { code: string; intent?: string }) => ({
      success: true,
      data: {
        success: true,
        result: { executed: request.code.substring(0, 20) },
        capabilityId: "cap-123",
        capabilityName: "test-cap",
        executionTimeMs: 100,
        dag: { tasks: [] },
        toolFailures: [],
        traces: [],
      },
    }),
  } as unknown as ExecuteDirectUseCase;
}

function createMockExecuteSuggestionUC(): ExecuteSuggestionUseCase {
  return {
    execute: async (_request: { intent: string }) => ({
      success: true,
      data: {
        suggestedDag: {
          tasks: [
            { id: "task1", callName: "std:echo", type: "tool" },
          ],
        },
        confidence: 0.85,
        executionTimeMs: 50,
      },
    }),
  } as unknown as ExecuteSuggestionUseCase;
}

function createMockContinueWorkflowUC(): ContinueWorkflowUseCase {
  return {
    execute: async (request: { workflowId: string; approved: boolean }) => ({
      success: true,
      data: {
        status: request.approved ? "completed" : "rejected",
        result: request.approved ? { completed: true } : null,
        executionTimeMs: 30,
      },
    }),
  } as unknown as ContinueWorkflowUseCase;
}

function createMockTrainSHGATUC(): TrainSHGATUseCase {
  return {
    execute: async () => ({
      success: true,
      data: {
        trained: true,
        tracesProcessed: 5,
        examplesGenerated: 10,
        loss: 0.05,
      },
    }),
  } as unknown as TrainSHGATUseCase;
}

// ============================================
// Test: Module Structure
// ============================================

Deno.test("ExecuteHandlerFacade - class instantiation", () => {
  const facade = new ExecuteHandlerFacade({});

  assertExists(facade);
  assertExists(facade.handle);
});

// ============================================
// Test: Routes to Direct Mode
// ============================================

Deno.test("ExecuteHandlerFacade - routes to direct mode when code provided", async () => {
  let directCalled = false;
  const mockDirect = createMockExecuteDirectUC();
  mockDirect.execute = async (_req) => {
    directCalled = true;
    return {
      success: true,
      data: {
        success: true,
        mode: "direct" as const,
        result: 42,
        executionTimeMs: 100,
        toolFailures: [],
        traces: [],
      },
    };
  };

  const facade = new ExecuteHandlerFacade({
    executeDirectUC: mockDirect,
    executeSuggestionUC: createMockExecuteSuggestionUC(),
  });

  const result = await facade.handle({
    code: 'return 42;',
    intent: "Test direct mode",
  });

  assertEquals(directCalled, true, "Should call direct use case");
  assertEquals(result.mode, "direct");
});

// ============================================
// Test: Routes to Suggestion Mode
// ============================================

Deno.test("ExecuteHandlerFacade - routes to suggestion mode when intent only", async () => {
  let suggestionCalled = false;
  const mockSuggestion = createMockExecuteSuggestionUC();
  mockSuggestion.execute = async () => {
    suggestionCalled = true;
    return {
      success: true,
      data: {
        suggestedDag: { tasks: [] },
        confidence: 0.9,
        executionTimeMs: 50,
      },
    };
  };

  const facade = new ExecuteHandlerFacade({
    executeDirectUC: createMockExecuteDirectUC(),
    executeSuggestionUC: mockSuggestion,
  });

  const result = await facade.handle({
    intent: "Test suggestion mode",
  });

  assertEquals(suggestionCalled, true, "Should call suggestion use case");
  assertEquals(result.status, "suggestions");
});

// ============================================
// Test: Routes to Continue Workflow
// ============================================

Deno.test("ExecuteHandlerFacade - routes to continue workflow", async () => {
  let continueCalled = false;
  const mockContinue = createMockContinueWorkflowUC();
  mockContinue.execute = async (req) => {
    continueCalled = true;
    return {
      success: true,
      data: {
        success: true,
        status: req.approved ? "completed" as const : "aborted" as const,
        result: { done: true },
        executionTimeMs: 30,
      },
    };
  };

  const facade = new ExecuteHandlerFacade({
    executeDirectUC: createMockExecuteDirectUC(),
    executeSuggestionUC: createMockExecuteSuggestionUC(),
    continueWorkflowUC: mockContinue,
  });

  await facade.handle({
    continue_workflow: {
      workflow_id: "wf-123",
      approved: true,
    },
  });

  assertEquals(continueCalled, true, "Should call continue workflow use case");
});

// ============================================
// Test: Priority Order (continue > code > intent)
// ============================================

Deno.test("ExecuteHandlerFacade - continue_workflow takes priority over code", async () => {
  let continueCalled = false;
  let directCalled = false;

  const mockContinue = createMockContinueWorkflowUC();
  mockContinue.execute = async () => {
    continueCalled = true;
    return { success: true, data: { success: true, status: "completed" as const, executionTimeMs: 30 } };
  };

  const mockDirect = createMockExecuteDirectUC();
  mockDirect.execute = async () => {
    directCalled = true;
    return { success: true, data: { success: true, mode: "direct" as const, executionTimeMs: 100, toolFailures: [], traces: [] } };
  };

  const facade = new ExecuteHandlerFacade({
    executeDirectUC: mockDirect,
    continueWorkflowUC: mockContinue,
  });

  await facade.handle({
    code: 'return 42;',
    continue_workflow: {
      workflow_id: "wf-123",
      approved: true,
    },
  });

  assertEquals(continueCalled, true, "Should call continue workflow");
  assertEquals(directCalled, false, "Should NOT call direct");
});

// ============================================
// Test: Handles Missing Use Cases
// ============================================

Deno.test("ExecuteHandlerFacade - handles missing direct use case", async () => {
  const facade = new ExecuteHandlerFacade({
    // No executeDirectUC
    executeSuggestionUC: createMockExecuteSuggestionUC(),
  });

  const result = await facade.handle({
    code: 'return 42;',
  });

  // Should handle gracefully
  assertExists(result);
  assertEquals(result.result, null);
});

Deno.test("ExecuteHandlerFacade - handles missing suggestion use case", async () => {
  const facade = new ExecuteHandlerFacade({
    executeDirectUC: createMockExecuteDirectUC(),
    // No executeSuggestionUC
  });

  const result = await facade.handle({
    intent: "Test without suggestion UC",
  });

  // Should handle gracefully
  assertExists(result);
  assertEquals(result.status, "suggestions");
  assertEquals(result.suggestions?.confidence, 0);
});

Deno.test("ExecuteHandlerFacade - handles missing continue workflow use case", async () => {
  const facade = new ExecuteHandlerFacade({
    executeDirectUC: createMockExecuteDirectUC(),
    // No continueWorkflowUC
  });

  const result = await facade.handle({
    continue_workflow: {
      workflow_id: "wf-123",
      approved: true,
    },
  });

  // Should handle gracefully
  assertExists(result);
  assertEquals(result.result, null);
});

// ============================================
// Test: Empty Request
// ============================================

Deno.test("ExecuteHandlerFacade - handles empty request", async () => {
  const facade = new ExecuteHandlerFacade({
    executeDirectUC: createMockExecuteDirectUC(),
    executeSuggestionUC: createMockExecuteSuggestionUC(),
  });

  const result = await facade.handle({});

  // Should return default response
  assertExists(result);
  assertEquals(result.status, "success");
  assertEquals(result.result, null);
});

// ============================================
// Test: Triggers Training After Direct Execution
// ============================================

Deno.test("ExecuteHandlerFacade - triggers training after successful direct execution", async () => {
  let trainCalled = false;
  const mockTrain = createMockTrainSHGATUC();
  mockTrain.execute = async () => {
    trainCalled = true;
    return { success: true, data: { trained: true, tracesProcessed: 5, examplesGenerated: 10, loss: 0.05 } };
  };

  const mockDirect = createMockExecuteDirectUC();
  mockDirect.execute = async () => ({
    success: true,
    data: {
      success: true,
      mode: "direct" as const,
      result: 42,
      executionTimeMs: 100,
      traces: [{ taskId: "task_0", tool: "std:echo", args: {}, result: "ok", success: true, durationMs: 10 }],
      toolFailures: [],
    },
  });

  const facade = new ExecuteHandlerFacade({
    executeDirectUC: mockDirect,
    trainSHGATUC: mockTrain,
  });

  await facade.handle({
    code: 'return 42;',
    intent: "Test training trigger",
  });

  // Training is fire-and-forget, may need a small delay
  await new Promise((resolve) => setTimeout(resolve, 10));

  assertEquals(trainCalled, true, "Should trigger training");
});

// ============================================
// Test: Response Mapping
// ============================================

Deno.test("ExecuteHandlerFacade - maps direct response correctly", async () => {
  const facade = new ExecuteHandlerFacade({
    executeDirectUC: createMockExecuteDirectUC(),
  });

  const result = await facade.handle({
    code: 'return 42;',
    intent: "Test response mapping",
  });

  assertEquals(result.status, "success");
  assertEquals(result.mode, "direct");
  assertExists(result.executionTimeMs);
});

Deno.test("ExecuteHandlerFacade - maps suggestion response correctly", async () => {
  const facade = new ExecuteHandlerFacade({
    executeSuggestionUC: createMockExecuteSuggestionUC(),
  });

  const result = await facade.handle({
    intent: "Test suggestion response",
  });

  assertEquals(result.status, "suggestions");
  assertExists(result.suggestions);
  assertExists(result.suggestions?.confidence);
});
