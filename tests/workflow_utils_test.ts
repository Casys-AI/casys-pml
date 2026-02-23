/**
 * Tests for workflow-utils.ts
 *
 * Covers extractContinueWorkflow and parseExecuteLocallyResponse.
 */

import { assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  extractContinueWorkflow,
  parseExecuteLocallyResponse,
} from "../src/cli/shared/workflow-utils.ts";

// ============================================
// extractContinueWorkflow
// ============================================

Deno.test("extractContinueWorkflow - returns undefined for empty args", () => {
  const result = extractContinueWorkflow(undefined);
  assertEquals(result.continueWorkflow, undefined);
  assertEquals(result.cleanArgs, {});
});

Deno.test("extractContinueWorkflow - returns undefined when no continue_workflow", () => {
  const result = extractContinueWorkflow({ intent: "test", code: "x" });
  assertEquals(result.continueWorkflow, undefined);
  assertEquals(result.cleanArgs, { intent: "test", code: "x" });
});

Deno.test("extractContinueWorkflow - extracts approved workflow", () => {
  const args = {
    intent: "test",
    continue_workflow: { approved: true, workflow_id: "wf-123" },
  };
  const result = extractContinueWorkflow(args);
  assertEquals(result.continueWorkflow?.approved, true);
  assertEquals(result.continueWorkflow?.workflowId, "wf-123");
  assertEquals(result.cleanArgs, { intent: "test" });
});

Deno.test("extractContinueWorkflow - extracts rejected workflow", () => {
  const args = {
    continue_workflow: { approved: false, workflow_id: "wf-456" },
  };
  const result = extractContinueWorkflow(args);
  assertEquals(result.continueWorkflow?.approved, false);
  assertEquals(result.continueWorkflow?.workflowId, "wf-456");
});

// ============================================
// parseExecuteLocallyResponse
// ============================================

Deno.test("parseExecuteLocallyResponse - returns null for non-JSON", () => {
  assertEquals(parseExecuteLocallyResponse("not json"), null);
});

Deno.test("parseExecuteLocallyResponse - returns null for non-execute_locally status", () => {
  const content = JSON.stringify({ status: "completed", code: "x" });
  assertEquals(parseExecuteLocallyResponse(content), null);
});

Deno.test("parseExecuteLocallyResponse - returns null when code is missing", () => {
  const content = JSON.stringify({ status: "execute_locally" });
  assertEquals(parseExecuteLocallyResponse(content), null);
});

Deno.test("parseExecuteLocallyResponse - parses minimal response", () => {
  const content = JSON.stringify({
    status: "execute_locally",
    code: "return 42",
  });
  const result = parseExecuteLocallyResponse(content);
  assertEquals(result?.status, "execute_locally");
  assertEquals(result?.code, "return 42");
  assertEquals(result?.client_tools, []);
  assertEquals(result?.tools_used, []);
  assertEquals(result?.workflowId, undefined);
  assertEquals(result?.dag, undefined);
  assertEquals(result?.ui_orchestration, undefined);
});

Deno.test("parseExecuteLocallyResponse - parses full response with all fields", () => {
  const content = JSON.stringify({
    status: "execute_locally",
    code: "const x = await mcp.std.psql_query({}); return x;",
    client_tools: ["psql_query"],
    tools_used: [{ id: "psql_query", fqdn: "std.psql_query" }],
    workflowId: "wf-789",
    dag: { tasks: [{ id: "t1", type: "mcp", tool: "psql_query" }] },
    ui_orchestration: {
      layout: "split",
      sync: [{ from: "chart", event: "filter", to: "table", action: "setFilter" }],
    },
  });
  const result = parseExecuteLocallyResponse(content);
  assertEquals(result?.status, "execute_locally");
  assertEquals(result?.code, "const x = await mcp.std.psql_query({}); return x;");
  assertEquals(result?.client_tools, ["psql_query"]);
  assertEquals(result?.tools_used, [{ id: "psql_query", fqdn: "std.psql_query" }]);
  assertEquals(result?.workflowId, "wf-789");
  assertEquals(result?.dag?.tasks?.length, 1);
  assertEquals(result?.ui_orchestration?.layout, "split");
  assertEquals(result?.ui_orchestration?.sync?.length, 1);
  assertEquals(result?.ui_orchestration?.sync?.[0].from, "chart");
});

Deno.test("parseExecuteLocallyResponse - ui_orchestration is extracted (Bug #2 fix)", () => {
  // This test specifically validates the fix for Bug #2:
  // ui_orchestration was missing from the parsed result before the fix.
  const content = JSON.stringify({
    status: "execute_locally",
    code: "return 1",
    ui_orchestration: {
      layout: "tabs",
      sync: [
        { from: "a", event: "click", to: "b", action: "highlight" },
        { from: "b", event: "hover", to: "a", action: "scrollTo" },
      ],
    },
  });
  const result = parseExecuteLocallyResponse(content);

  // Before fix: result.ui_orchestration === undefined
  // After fix: correctly extracted
  assertEquals(result?.ui_orchestration?.layout, "tabs");
  assertEquals(result?.ui_orchestration?.sync?.length, 2);
});

Deno.test("parseExecuteLocallyResponse - handles clientTools alias", () => {
  const content = JSON.stringify({
    status: "execute_locally",
    code: "return 1",
    clientTools: ["tool_a", "tool_b"],
  });
  const result = parseExecuteLocallyResponse(content);
  assertEquals(result?.client_tools, ["tool_a", "tool_b"]);
});

Deno.test("parseExecuteLocallyResponse - handles workflow_id alias", () => {
  const content = JSON.stringify({
    status: "execute_locally",
    code: "return 1",
    workflow_id: "wf-alt",
  });
  const result = parseExecuteLocallyResponse(content);
  assertEquals(result?.workflowId, "wf-alt");
});
