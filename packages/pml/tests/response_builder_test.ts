/**
 * Response Builder Tests
 *
 * Tests that buildMcpSuccessResult correctly constructs MCP responses
 * with optional _meta.ui from collected UI resources.
 * Story 16.3: MCP response propagation (single UI pass-through)
 * Story 16.4: Composite HTML generation (multi-UI)
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { buildMcpSuccessResult, buildMcpLocalResult } from "../src/cli/shared/response-builder.ts";
import type { CollectedUiResource, UiOrchestration } from "../src/types/ui-orchestration.ts";
import type { LocalExecutionResult } from "../src/cli/shared/types.ts";
import { PendingWorkflowStore } from "../src/workflow/pending-store.ts";

// ============================================================================
// Story 16.3: No UI / Single UI
// ============================================================================

Deno.test("buildMcpSuccessResult - no UI: returns content only", () => {
  const result = buildMcpSuccessResult({ status: "success", result: 42 });

  assertEquals(result.content, [{ type: "text", text: JSON.stringify({ status: "success", result: 42 }) }]);
  assertEquals(result._meta, undefined);
  assertEquals("_meta" in result, false);
});

Deno.test("buildMcpSuccessResult - undefined collectedUi: returns content only", () => {
  const result = buildMcpSuccessResult({ status: "success" }, undefined);

  assertEquals("_meta" in result, false);
});

Deno.test("buildMcpSuccessResult - empty collectedUi: returns content only", () => {
  const result = buildMcpSuccessResult({ status: "success" }, []);

  assertEquals("_meta" in result, false);
});

Deno.test("buildMcpSuccessResult - single UI: pass-through _meta.ui", () => {
  const collectedUi: CollectedUiResource[] = [
    {
      source: "viz:render",
      resourceUri: "ui://viz/chart/abc123",
      context: { chartType: "bar", _args: { type: "bar" } },
      slot: 0,
    },
  ];

  const result = buildMcpSuccessResult(
    { status: "success", result: "chart rendered" },
    collectedUi,
  );

  assertEquals(result.content, [
    { type: "text", text: JSON.stringify({ status: "success", result: "chart rendered" }) },
  ]);

  const meta = result._meta as { ui: { resourceUri: string; context: Record<string, unknown> } };
  assertEquals(meta.ui.resourceUri, "ui://viz/chart/abc123");
  assertEquals(meta.ui.context.chartType, "bar");
});

Deno.test("buildMcpSuccessResult - single UI without context: no context in _meta.ui", () => {
  const collectedUi: CollectedUiResource[] = [
    {
      source: "tool:minimal",
      resourceUri: "ui://minimal/test",
      slot: 0,
    },
  ];

  const result = buildMcpSuccessResult({ status: "success" }, collectedUi);

  const meta = result._meta as { ui: { resourceUri: string; context?: unknown } };
  assertEquals(meta.ui.resourceUri, "ui://minimal/test");
  assertEquals("context" in meta.ui, false);
});

// ============================================================================
// Story 16.4: Multi-UI Composite
// ============================================================================

Deno.test("buildMcpSuccessResult - 2 UIs default orchestration: generates composite HTML", () => {
  const collectedUi: CollectedUiResource[] = [
    { source: "postgres:query", resourceUri: "ui://postgres/table/1", context: { query: "SELECT *" }, slot: 0 },
    { source: "viz:render", resourceUri: "ui://viz/chart/2", context: { chartType: "pie" }, slot: 1 },
  ];

  const result = buildMcpSuccessResult(
    { status: "success", result: "done" },
    collectedUi,
  );

  const meta = result._meta as { ui: { resourceUri: string; html: string } };

  // Should return composite resourceUri (ui://pml/workflow/...)
  assertStringIncludes(meta.ui.resourceUri, "ui://pml/workflow/");

  // Should contain composite HTML
  assertStringIncludes(meta.ui.html, "<!DOCTYPE html>");
  assertStringIncludes(meta.ui.html, "PML Composite UI");

  // Default layout is "stack" (when no orchestration provided)
  assertStringIncludes(meta.ui.html, "layout-stack");

  // Should contain iframes for both UIs
  assertStringIncludes(meta.ui.html, "ui://postgres/table/1");
  assertStringIncludes(meta.ui.html, "ui://viz/chart/2");

  // Should contain slot data attributes
  assertStringIncludes(meta.ui.html, 'data-slot="0"');
  assertStringIncludes(meta.ui.html, 'data-slot="1"');
});

Deno.test("buildMcpSuccessResult - 2 UIs with split orchestration: uses split layout", () => {
  const collectedUi: CollectedUiResource[] = [
    { source: "postgres:query", resourceUri: "ui://postgres/table/1", slot: 0 },
    { source: "viz:render", resourceUri: "ui://viz/chart/2", slot: 1 },
  ];

  const orchestration: UiOrchestration = {
    layout: "split",
    sync: [
      { from: "postgres:query", event: "filter", to: "viz:render", action: "update" },
    ],
  };

  const result = buildMcpSuccessResult(
    { status: "success" },
    collectedUi,
    orchestration,
  );

  const meta = result._meta as { ui: { resourceUri: string; html: string } };

  // Should use split layout
  assertStringIncludes(meta.ui.html, "layout-split");

  // Should contain event bus with sync rules
  assertStringIncludes(meta.ui.html, "syncRules");
  assertStringIncludes(meta.ui.html, '"event":"filter"');
  assertStringIncludes(meta.ui.html, '"action":"update"');
});

Deno.test("buildMcpSuccessResult - 3 UIs with tabs: generates tabbed composite", () => {
  const collectedUi: CollectedUiResource[] = [
    { source: "a:tool", resourceUri: "ui://a/1", slot: 0 },
    { source: "b:tool", resourceUri: "ui://b/2", slot: 1 },
    { source: "c:tool", resourceUri: "ui://c/3", slot: 2 },
  ];

  const orchestration: UiOrchestration = {
    layout: "tabs",
  };

  const result = buildMcpSuccessResult(
    { status: "success" },
    collectedUi,
    orchestration,
  );

  const meta = result._meta as { ui: { resourceUri: string; html: string } };

  // Should contain tabs layout elements
  assertStringIncludes(meta.ui.html, "layout-tabs");
  assertStringIncludes(meta.ui.html, "tab-bar");

  // Should have all 3 iframes
  assertStringIncludes(meta.ui.html, "ui://a/1");
  assertStringIncludes(meta.ui.html, "ui://b/2");
  assertStringIncludes(meta.ui.html, "ui://c/3");
});

Deno.test("buildMcpSuccessResult - composite HTML is NOT in content text", () => {
  const collectedUi: CollectedUiResource[] = [
    { source: "a:tool", resourceUri: "ui://a/1", slot: 0 },
    { source: "b:tool", resourceUri: "ui://b/2", slot: 1 },
  ];

  const result = buildMcpSuccessResult(
    { status: "success", result: "data" },
    collectedUi,
  );

  // Content should contain the normal result payload, NOT the HTML
  const content = result.content as Array<{ type: string; text: string }>;
  assertEquals(content[0].text, JSON.stringify({ status: "success", result: "data" }));

  // HTML should be in _meta.ui.html only
  const meta = result._meta as { ui: { html: string } };
  assertStringIncludes(meta.ui.html, "<!DOCTYPE html>");
});

// ============================================================================
// buildMcpLocalResult: Factored handler for LocalExecutionResult
// ============================================================================

// Minimal approval context — formatApprovalRequired is tested separately
const stubApprovalCtx = {
  code: "return 1",
  fqdnMap: {} as Record<string, string>,
  pendingWorkflowStore: new PendingWorkflowStore(),
};

Deno.test("buildMcpLocalResult - success: includes executed_locally and result", () => {
  const localResult: LocalExecutionResult = {
    status: "success",
    result: { rows: [1, 2, 3] },
    durationMs: 42,
    toolCallRecords: [],
  };

  const mcpResult = buildMcpLocalResult(localResult, stubApprovalCtx);

  const content = mcpResult.content as Array<{ type: string; text: string }>;
  const parsed = JSON.parse(content[0].text);
  assertEquals(parsed.status, "success");
  assertEquals(parsed.result, { rows: [1, 2, 3] });
  assertEquals(parsed.executed_locally, true);
});

Deno.test("buildMcpLocalResult - success with collectedUi: propagates _meta.ui", () => {
  const localResult: LocalExecutionResult = {
    status: "success",
    result: "ok",
    durationMs: 10,
    toolCallRecords: [],
    collectedUi: [
      { source: "viz:render", resourceUri: "ui://viz/chart/1", slot: 0 },
    ],
  };

  const mcpResult = buildMcpLocalResult(localResult, stubApprovalCtx);

  const meta = mcpResult._meta as { ui: { resourceUri: string } };
  assertEquals(meta.ui.resourceUri, "ui://viz/chart/1");
});

Deno.test("buildMcpLocalResult - success without executed_locally flag", () => {
  const localResult: LocalExecutionResult = {
    status: "success",
    result: 42,
    durationMs: 5,
    toolCallRecords: [],
  };

  const mcpResult = buildMcpLocalResult(localResult, stubApprovalCtx, false);

  const content = mcpResult.content as Array<{ type: string; text: string }>;
  const parsed = JSON.parse(content[0].text);
  assertEquals(parsed.status, "success");
  assertEquals(parsed.result, 42);
  assertEquals(parsed.executed_locally, undefined);
});

Deno.test("buildMcpLocalResult - error: returns error payload with executed_locally", () => {
  const localResult: LocalExecutionResult = {
    status: "error",
    error: "TypeError: x is not a function",
  };

  const mcpResult = buildMcpLocalResult(localResult, stubApprovalCtx);

  const content = mcpResult.content as Array<{ type: string; text: string }>;
  const parsed = JSON.parse(content[0].text);
  assertEquals(parsed.status, "error");
  assertEquals(parsed.error, "TypeError: x is not a function");
  assertEquals(parsed.executed_locally, true);
});

Deno.test("buildMcpLocalResult - error without executed_locally flag", () => {
  const localResult: LocalExecutionResult = {
    status: "error",
    error: "timeout",
  };

  const mcpResult = buildMcpLocalResult(localResult, stubApprovalCtx, false);

  const content = mcpResult.content as Array<{ type: string; text: string }>;
  const parsed = JSON.parse(content[0].text);
  assertEquals(parsed.status, "error");
  assertEquals(parsed.error, "timeout");
  assertEquals(parsed.executed_locally, undefined);
});

Deno.test("buildMcpLocalResult - success with orchestration: passes to composite", () => {
  const localResult: LocalExecutionResult = {
    status: "success",
    result: "done",
    durationMs: 20,
    toolCallRecords: [],
    collectedUi: [
      { source: "postgres:query", resourceUri: "ui://pg/table/1", context: { q: "SELECT" }, slot: 0 },
      { source: "viz:render", resourceUri: "ui://viz/chart/2", context: { type: "pie" }, slot: 1 },
    ],
  };

  const orchestration = {
    layout: "split" as const,
    sync: [{ from: "postgres:query", event: "filter", to: "viz:render", action: "update" }],
  };

  const mcpResult = buildMcpLocalResult(localResult, stubApprovalCtx, true, orchestration);

  const meta = mcpResult._meta as { ui: { resourceUri: string; html: string } };
  // Should use split layout (from orchestration), not default stack
  assertStringIncludes(meta.ui.html, "layout-split");
  // Should contain sync rules
  assertStringIncludes(meta.ui.html, '"event":"filter"');
});
