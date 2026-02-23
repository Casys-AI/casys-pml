/**
 * Unit tests for Composite UI Generator
 *
 * Tests:
 * - buildCompositeUi() descriptor generation
 * - Sync rule resolution (tool names → slot indices)
 * - Broadcast marker handling
 * - generateCompositeHtml() HTML generation
 * - Layout CSS variations
 * - Iframe attributes
 *
 * @module ui/composite-generator_test
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { buildCompositeUi, generateCompositeHtml } from "./composite-generator.ts";
import type { CollectedUiResource, UiOrchestration } from "../types/ui-orchestration.ts";

// =============================================================================
// buildCompositeUi Tests
// =============================================================================

Deno.test("buildCompositeUi - creates descriptor with correct type and resourceUri", () => {
  const resources: CollectedUiResource[] = [
    { source: "tool:a", resourceUri: "ui://a", slot: 0 },
  ];

  const result = buildCompositeUi(resources);

  assertEquals(result.type, "composite");
  assertStringIncludes(result.resourceUri, "ui://pml/workflow/");
  // UUID format check
  const uuid = result.resourceUri.split("/").pop();
  assertEquals(uuid?.length, 36);
});

Deno.test("buildCompositeUi - creates descriptor with resolved sync rules", () => {
  const resources: CollectedUiResource[] = [
    { source: "postgres:query", resourceUri: "ui://postgres/table/1", slot: 0 },
    { source: "viz:render", resourceUri: "ui://viz/chart/2", slot: 1 },
  ];
  const orchestration: UiOrchestration = {
    layout: "split",
    sync: [
      { from: "postgres:query", event: "filter", to: "viz:render", action: "update" },
    ],
  };

  const result = buildCompositeUi(resources, orchestration);

  assertEquals(result.type, "composite");
  assertEquals(result.layout, "split");
  assertEquals(result.children.length, 2);
  assertEquals(result.sync.length, 1);
  assertEquals(result.sync[0].from, 0); // Resolved from "postgres:query"
  assertEquals(result.sync[0].event, "filter");
  assertEquals(result.sync[0].to, 1); // Resolved from "viz:render"
  assertEquals(result.sync[0].action, "update");
});

Deno.test("buildCompositeUi - defaults to stack layout without orchestration", () => {
  const resources: CollectedUiResource[] = [
    { source: "tool:a", resourceUri: "ui://a", slot: 0 },
    { source: "tool:b", resourceUri: "ui://b", slot: 1 },
  ];

  const result = buildCompositeUi(resources);

  assertEquals(result.layout, "stack");
  assertEquals(result.sync, []);
});

Deno.test("buildCompositeUi - preserves broadcast marker '*'", () => {
  const resources: CollectedUiResource[] = [
    { source: "date:picker", resourceUri: "ui://date", slot: 0 },
    { source: "table:view", resourceUri: "ui://table", slot: 1 },
    { source: "chart:view", resourceUri: "ui://chart", slot: 2 },
  ];
  const orchestration: UiOrchestration = {
    layout: "split",
    sync: [{ from: "date:picker", event: "change", to: "*", action: "refresh" }],
  };

  const result = buildCompositeUi(resources, orchestration);

  assertEquals(result.sync[0].from, 0);
  assertEquals(result.sync[0].to, "*");
  assertEquals(result.sync[0].action, "refresh");
});

Deno.test("buildCompositeUi - handles unknown tool names with fallback to slot 0", () => {
  const resources: CollectedUiResource[] = [
    { source: "known:tool", resourceUri: "ui://known", slot: 0 },
  ];
  const orchestration: UiOrchestration = {
    layout: "stack",
    sync: [{ from: "unknown:tool", event: "test", to: "known:tool", action: "update" }],
  };

  const result = buildCompositeUi(resources, orchestration);

  assertEquals(result.sync[0].from, 0); // Falls back to 0 for unknown
  assertEquals(result.sync[0].to, 0); // Resolves "known:tool" to slot 0
});

Deno.test("buildCompositeUi - maintains children order", () => {
  const resources: CollectedUiResource[] = [
    { source: "first", resourceUri: "ui://1", slot: 0 },
    { source: "second", resourceUri: "ui://2", slot: 1 },
    { source: "third", resourceUri: "ui://3", slot: 2 },
  ];

  const result = buildCompositeUi(resources, { layout: "grid" });

  assertEquals(result.children.length, 3);
  assertEquals(result.children[0].source, "first");
  assertEquals(result.children[1].source, "second");
  assertEquals(result.children[2].source, "third");
});

// =============================================================================
// generateCompositeHtml Tests
// =============================================================================

Deno.test("generateCompositeHtml - generates valid HTML structure", () => {
  const descriptor = buildCompositeUi(
    [
      { source: "a", resourceUri: "ui://a", slot: 0 },
      { source: "b", resourceUri: "ui://b", slot: 1 },
    ],
    { layout: "split" },
  );

  const html = generateCompositeHtml(descriptor);

  assertStringIncludes(html, "<!DOCTYPE html>");
  assertStringIncludes(html, "<html>");
  assertStringIncludes(html, '<meta charset="UTF-8">');
  assertStringIncludes(html, "<title>PML Composite UI</title>");
  assertStringIncludes(html, "<style>");
  assertStringIncludes(html, "</style>");
  assertStringIncludes(html, "<script>");
  assertStringIncludes(html, "</script>");
  assertStringIncludes(html, "</html>");
});

Deno.test("generateCompositeHtml - includes container with layout class", () => {
  const layouts = ["split", "tabs", "grid", "stack"] as const;

  for (const layout of layouts) {
    const descriptor = buildCompositeUi(
      [{ source: "test", resourceUri: "ui://test", slot: 0 }],
      { layout },
    );
    const html = generateCompositeHtml(descriptor);

    assertStringIncludes(html, `class="layout-${layout}"`);
  }
});

Deno.test("generateCompositeHtml - each layout generates distinct CSS class", () => {
  const layouts = ["split", "tabs", "grid", "stack"] as const;
  const htmls = layouts.map((layout) => {
    const descriptor = buildCompositeUi(
      [{ source: "a", resourceUri: "ui://a", slot: 0 }],
      { layout },
    );
    return generateCompositeHtml(descriptor);
  });

  // Each layout has its own CSS class definition
  assertStringIncludes(htmls[0], ".layout-split");
  assertStringIncludes(htmls[1], ".layout-tabs");
  assertStringIncludes(htmls[2], ".layout-grid");
  assertStringIncludes(htmls[3], ".layout-stack");
});

Deno.test("generateCompositeHtml - split layout has flexbox CSS", () => {
  const descriptor = buildCompositeUi(
    [{ source: "a", resourceUri: "ui://a", slot: 0 }],
    { layout: "split" },
  );

  const html = generateCompositeHtml(descriptor);

  assertStringIncludes(html, "display: flex");
  assertStringIncludes(html, "flex: 1");
});

Deno.test("generateCompositeHtml - tabs layout has tab bar and active state", () => {
  const descriptor = buildCompositeUi(
    [
      { source: "tab1", resourceUri: "ui://tab1", slot: 0 },
      { source: "tab2", resourceUri: "ui://tab2", slot: 1 },
    ],
    { layout: "tabs" },
  );

  const html = generateCompositeHtml(descriptor);

  assertStringIncludes(html, ".tab-bar");
  assertStringIncludes(html, ".tab.active");
  assertStringIncludes(html, "switchTab");
  assertStringIncludes(html, '<button class="tab active"');
  assertStringIncludes(html, '<button class="tab"');
});

Deno.test("generateCompositeHtml - grid layout has CSS grid", () => {
  const descriptor = buildCompositeUi(
    [{ source: "a", resourceUri: "ui://a", slot: 0 }],
    { layout: "grid" },
  );

  const html = generateCompositeHtml(descriptor);

  assertStringIncludes(html, "display: grid");
  assertStringIncludes(html, "grid-template-columns");
  assertStringIncludes(html, "minmax(400px, 1fr)");
});

Deno.test("generateCompositeHtml - stack layout has flex column", () => {
  const descriptor = buildCompositeUi(
    [{ source: "a", resourceUri: "ui://a", slot: 0 }],
    { layout: "stack" },
  );

  const html = generateCompositeHtml(descriptor);

  assertStringIncludes(html, "flex-direction: column");
});

Deno.test("generateCompositeHtml - iframes have required attributes", () => {
  const descriptor = buildCompositeUi(
    [
      { source: "postgres:query", resourceUri: "ui://postgres/table/123", slot: 0 },
      { source: "viz:chart", resourceUri: "ui://viz/chart/456", slot: 1 },
    ],
    { layout: "split" },
  );

  const html = generateCompositeHtml(descriptor);

  // Check id attribute
  assertStringIncludes(html, 'id="ui-0"');
  assertStringIncludes(html, 'id="ui-1"');

  // Check data-slot attribute
  assertStringIncludes(html, 'data-slot="0"');
  assertStringIncludes(html, 'data-slot="1"');

  // Check data-source attribute
  assertStringIncludes(html, 'data-source="postgres:query"');
  assertStringIncludes(html, 'data-source="viz:chart"');

  // Check src attribute
  assertStringIncludes(html, 'src="ui://postgres/table/123"');
  assertStringIncludes(html, 'src="ui://viz/chart/456"');

  // Check sandbox attribute (AC: #8)
  assertStringIncludes(html, 'sandbox="allow-scripts allow-same-origin"');
});

Deno.test("generateCompositeHtml - includes syncRules in script", () => {
  const descriptor = buildCompositeUi(
    [
      { source: "a", resourceUri: "ui://a", slot: 0 },
      { source: "b", resourceUri: "ui://b", slot: 1 },
    ],
    {
      layout: "split",
      sync: [{ from: "a", event: "click", to: "b", action: "highlight" }],
    },
  );

  const html = generateCompositeHtml(descriptor);

  assertStringIncludes(html, "const syncRules =");
  assertStringIncludes(html, '"from":0');
  assertStringIncludes(html, '"event":"click"');
  assertStringIncludes(html, '"to":1');
  assertStringIncludes(html, '"action":"highlight"');
});

Deno.test("generateCompositeHtml - event bus handles ui/initialize", () => {
  const descriptor = buildCompositeUi(
    [{ source: "a", resourceUri: "ui://a", slot: 0 }],
    { layout: "stack" },
  );

  const html = generateCompositeHtml(descriptor);

  assertStringIncludes(html, "ui/initialize");
  assertStringIncludes(html, "protocolVersion");
  assertStringIncludes(html, "2026-01-26");
  assertStringIncludes(html, "hostInfo");
  assertStringIncludes(html, "hostCapabilities");
  assertStringIncludes(html, "hostContext");
});

Deno.test("generateCompositeHtml - event bus handles ui/update-model-context", () => {
  const descriptor = buildCompositeUi(
    [{ source: "a", resourceUri: "ui://a", slot: 0 }],
    { layout: "stack" },
  );

  const html = generateCompositeHtml(descriptor);

  assertStringIncludes(html, "ui/update-model-context");
  assertStringIncludes(html, "syncRules");
  assertStringIncludes(html, "sendToolResult");
});

Deno.test("generateCompositeHtml - event bus sends via ui/notifications/tool-result", () => {
  const descriptor = buildCompositeUi(
    [{ source: "a", resourceUri: "ui://a", slot: 0 }],
    { layout: "stack" },
  );

  const html = generateCompositeHtml(descriptor);

  assertStringIncludes(html, "ui/notifications/tool-result");
  assertStringIncludes(html, "postMessage");
});

Deno.test("generateCompositeHtml - event bus handles broadcast to='*'", () => {
  const descriptor = buildCompositeUi(
    [
      { source: "a", resourceUri: "ui://a", slot: 0 },
      { source: "b", resourceUri: "ui://b", slot: 1 },
    ],
    {
      layout: "split",
      sync: [{ from: "a", event: "change", to: "*", action: "refresh" }],
    },
  );

  const html = generateCompositeHtml(descriptor);

  assertStringIncludes(html, '"to":"*"');
  assertStringIncludes(html, "rule.to === '*'");
  assertStringIncludes(html, "filter(([s]) => s !== sourceSlot)");
});

Deno.test("generateCompositeHtml - handles empty resources array", () => {
  const descriptor = buildCompositeUi([], { layout: "stack" });

  const html = generateCompositeHtml(descriptor);

  assertStringIncludes(html, "<!DOCTYPE html>");
  assertStringIncludes(html, 'class="layout-stack"');
  // No iframes generated
  assertEquals(html.includes('data-slot="0"'), false);
});

// =============================================================================
// Shared Context Tests (FR-UI-011)
// =============================================================================

Deno.test("buildCompositeUi - extracts sharedContext from resources", () => {
  const resources: CollectedUiResource[] = [
    {
      source: "postgres:query",
      resourceUri: "ui://postgres/table/1",
      slot: 0,
      context: { workflowId: "wf-123", query: "SELECT * FROM users" },
    },
    {
      source: "viz:render",
      resourceUri: "ui://viz/chart/2",
      slot: 1,
      context: { userId: "user-456", chartType: "bar" },
    },
  ];
  const orchestration: UiOrchestration = {
    layout: "split",
    sharedContext: ["workflowId", "userId"],
  };

  const result = buildCompositeUi(resources, orchestration);

  assertEquals(result.sharedContext?.workflowId, "wf-123");
  assertEquals(result.sharedContext?.userId, "user-456");
  // Non-shared keys should not be included
  assertEquals(result.sharedContext?.query, undefined);
  assertEquals(result.sharedContext?.chartType, undefined);
});

Deno.test("buildCompositeUi - sharedContext is undefined when no keys specified", () => {
  const resources: CollectedUiResource[] = [
    { source: "a", resourceUri: "ui://a", slot: 0, context: { foo: "bar" } },
  ];

  const result = buildCompositeUi(resources);

  assertEquals(result.sharedContext, undefined);
});

Deno.test("buildCompositeUi - sharedContext is undefined when no matching keys found", () => {
  const resources: CollectedUiResource[] = [
    { source: "a", resourceUri: "ui://a", slot: 0, context: { foo: "bar" } },
  ];
  const orchestration: UiOrchestration = {
    layout: "stack",
    sharedContext: ["nonExistentKey"],
  };

  const result = buildCompositeUi(resources, orchestration);

  assertEquals(result.sharedContext, undefined);
});

Deno.test("buildCompositeUi - sharedContext first value wins for duplicate keys", () => {
  const resources: CollectedUiResource[] = [
    { source: "a", resourceUri: "ui://a", slot: 0, context: { sessionId: "first" } },
    { source: "b", resourceUri: "ui://b", slot: 1, context: { sessionId: "second" } },
  ];
  const orchestration: UiOrchestration = {
    layout: "split",
    sharedContext: ["sessionId"],
  };

  const result = buildCompositeUi(resources, orchestration);

  // First resource's value should be used
  assertEquals(result.sharedContext?.sessionId, "first");
});

Deno.test("generateCompositeHtml - includes sharedContext in event bus script", () => {
  const resources: CollectedUiResource[] = [
    { source: "a", resourceUri: "ui://a", slot: 0, context: { workflowId: "wf-test" } },
  ];
  const orchestration: UiOrchestration = {
    layout: "stack",
    sharedContext: ["workflowId"],
  };

  const descriptor = buildCompositeUi(resources, orchestration);
  const html = generateCompositeHtml(descriptor);

  assertStringIncludes(html, "const sharedContext =");
  assertStringIncludes(html, '"workflowId":"wf-test"');
});

Deno.test("generateCompositeHtml - includes sharedContext in hostContext", () => {
  const resources: CollectedUiResource[] = [
    { source: "a", resourceUri: "ui://a", slot: 0, context: { userId: "u123" } },
  ];
  const orchestration: UiOrchestration = {
    layout: "stack",
    sharedContext: ["userId"],
  };

  const descriptor = buildCompositeUi(resources, orchestration);
  const html = generateCompositeHtml(descriptor);

  // sharedContext should be part of hostContext in ui/initialize response
  assertStringIncludes(html, "sharedContext");
});

Deno.test("generateCompositeHtml - forwards sharedContext in tool results", () => {
  const resources: CollectedUiResource[] = [
    { source: "a", resourceUri: "ui://a", slot: 0 },
  ];
  const orchestration: UiOrchestration = {
    layout: "stack",
    sync: [{ from: "a", event: "test", to: "*", action: "update" }],
  };

  const descriptor = buildCompositeUi(resources, orchestration);
  const html = generateCompositeHtml(descriptor);

  // sharedContext should be included in forwarded messages
  assertStringIncludes(html, "sharedContext");
  assertStringIncludes(html, "sendToolResult(target, {");
});

// =============================================================================
// Dark Mode / CSS Variables Tests (L1)
// =============================================================================

Deno.test("generateCompositeHtml - includes CSS variables for theming", () => {
  const descriptor = buildCompositeUi(
    [{ source: "a", resourceUri: "ui://a", slot: 0 }],
    { layout: "tabs" },
  );

  const html = generateCompositeHtml(descriptor);

  // Should have CSS custom properties
  assertStringIncludes(html, "--pml-border-color");
  assertStringIncludes(html, "--pml-bg-secondary");
  assertStringIncludes(html, "--pml-bg-primary");
  assertStringIncludes(html, "--pml-accent-color");
  // Should have dark mode support
  assertStringIncludes(html, "body.dark");
  assertStringIncludes(html, "prefers-color-scheme: dark");
});

// =============================================================================
// Viewport Meta Tag Test (L3)
// =============================================================================

Deno.test("generateCompositeHtml - includes viewport meta tag for mobile", () => {
  const descriptor = buildCompositeUi(
    [{ source: "a", resourceUri: "ui://a", slot: 0 }],
    { layout: "stack" },
  );

  const html = generateCompositeHtml(descriptor);

  assertStringIncludes(html, '<meta name="viewport"');
  assertStringIncludes(html, "width=device-width");
  assertStringIncludes(html, "initial-scale=1");
});

// =============================================================================
// Empty Tabs Layout Test (M3)
// =============================================================================

Deno.test("generateCompositeHtml - tabs layout handles empty resources gracefully", () => {
  const descriptor = buildCompositeUi([], { layout: "tabs" });

  const html = generateCompositeHtml(descriptor);

  assertStringIncludes(html, 'class="layout-tabs"');
  assertStringIncludes(html, "tab-bar");
  assertStringIncludes(html, "No UI components available");
  // Should not have any iframes
  assertEquals(html.includes("<iframe"), false);
});

// =============================================================================
// Console.warn for Malformed Messages Test (M2)
// =============================================================================

Deno.test("generateCompositeHtml - event bus includes console.warn for malformed messages", () => {
  const descriptor = buildCompositeUi(
    [{ source: "a", resourceUri: "ui://a", slot: 0 }],
    { layout: "stack" },
  );

  const html = generateCompositeHtml(descriptor);

  // Should warn about malformed JSON-RPC
  assertStringIncludes(html, "console.warn");
  assertStringIncludes(html, "Malformed JSON-RPC");
  // Should warn about missing params
  assertStringIncludes(html, "ui/update-model-context missing params");
});
