/**
 * Onshape Tools Registration Tests
 *
 * Verifies tool registry, categories, client, and MCP wire format
 * without calling the Onshape API.
 *
 * @module lib/onshape/tests/tools/registration_test
 */

import { assertEquals, assertExists } from "jsr:@std/assert";
import {
  allTools,
  getCategories,
  getToolByName,
  getToolsByCategory,
  toolsByCategory,
} from "../../src/tools/mod.ts";
import { OnshapeToolsClient } from "../../src/client.ts";

// ── Registry ────────────────────────────────────────────────────────────────

Deno.test("allTools contains 100 tools", () => {
  assertEquals(allTools.length, 100);
});

Deno.test("every tool has required fields", () => {
  for (const tool of allTools) {
    assertExists(tool.name, `tool missing name`);
    assertExists(tool.description, `${tool.name} missing description`);
    assertExists(tool.category, `${tool.name} missing category`);
    assertExists(tool.inputSchema, `${tool.name} missing inputSchema`);
    assertExists(tool.handler, `${tool.name} missing handler`);
    assertEquals(typeof tool.handler, "function", `${tool.name} handler not a function`);
  }
});

Deno.test("all tool names are unique", () => {
  const names = allTools.map((t) => t.name);
  const unique = new Set(names);
  assertEquals(unique.size, names.length, `Duplicate tool names: ${names.filter((n, i) => names.indexOf(n) !== i)}`);
});

Deno.test("all tool names start with onshape_", () => {
  for (const tool of allTools) {
    assertEquals(
      tool.name.startsWith("onshape_"),
      true,
      `Tool ${tool.name} does not start with onshape_`,
    );
  }
});

// ── Categories ──────────────────────────────────────────────────────────────

Deno.test("14 categories available", () => {
  const cats = getCategories();
  assertEquals(cats.length, 14);
});

Deno.test("toolsByCategory covers all tools", () => {
  const totalFromCategories = Object.values(toolsByCategory)
    .reduce((sum, tools) => sum + tools.length, 0);
  assertEquals(totalFromCategories, allTools.length);
});

Deno.test("getToolsByCategory returns correct count per category", () => {
  const expected: Record<string, number> = {
    documents: 12,
    versions: 8,
    partstudios: 14,
    parts: 7,
    assemblies: 14,
    drawings: 5,
    export: 10,
    configurations: 6,
    metadata: 5,
    releases: 6,
    thumbnails: 3,
    comments: 4,
    users: 3,
    webhooks: 3,
  };

  for (const [cat, count] of Object.entries(expected)) {
    const tools = getToolsByCategory(cat);
    assertEquals(
      tools.length,
      count,
      `Category '${cat}' expected ${count} tools, got ${tools.length}`,
    );
  }
});

// ── Lookup ───────────────────────────────────────────────────────────────────

Deno.test("getToolByName returns correct tool", () => {
  const tool = getToolByName("onshape_document_list");
  assertExists(tool);
  assertEquals(tool!.name, "onshape_document_list");
  assertEquals(tool!.category, "documents");
});

Deno.test("getToolByName returns undefined for unknown tool", () => {
  const tool = getToolByName("onshape_nonexistent_tool");
  assertEquals(tool, undefined);
});

// ── Client ──────────────────────────────────────────────────────────────────

Deno.test("OnshapeToolsClient - default loads all tools", () => {
  // setOnshapeClient is not called so execute() would fail,
  // but listTools() and count work without API access
  const client = new OnshapeToolsClient();
  assertEquals(client.count, 100);
  assertEquals(client.listTools().length, 100);
});

Deno.test("OnshapeToolsClient - category filter", () => {
  const client = new OnshapeToolsClient({ categories: ["documents", "parts"] });
  assertEquals(client.count, 12 + 7); // documents=12, parts=7
});

Deno.test("OnshapeToolsClient - toMCPFormat", () => {
  const client = new OnshapeToolsClient({ categories: ["users"] });
  const mcpTools = client.toMCPFormat();
  assertEquals(mcpTools.length, 3);

  for (const wire of mcpTools) {
    assertExists(wire.name);
    assertExists(wire.description);
    assertExists(wire.inputSchema);
    // handler should NOT be in wire format
    assertEquals("handler" in wire, false);
    assertEquals("category" in wire, false);
  }
});

Deno.test("OnshapeToolsClient - buildHandlersMap", () => {
  const client = new OnshapeToolsClient({ categories: ["webhooks"] });
  const handlers = client.buildHandlersMap();
  assertEquals(handlers.size, 3);
  assertEquals(handlers.has("onshape_webhook_list"), true);
  assertEquals(typeof handlers.get("onshape_webhook_list"), "function");
});

// ── Input schemas ───────────────────────────────────────────────────────────

Deno.test("all inputSchema have type: object", () => {
  for (const tool of allTools) {
    assertEquals(
      tool.inputSchema.type,
      "object",
      `${tool.name} inputSchema.type should be "object", got "${tool.inputSchema.type}"`,
    );
  }
});

Deno.test("all inputSchema.required fields exist in properties", () => {
  for (const tool of allTools) {
    const required = tool.inputSchema.required ?? [];
    const props = Object.keys(tool.inputSchema.properties ?? {});
    for (const req of required) {
      assertEquals(
        props.includes(req as string),
        true,
        `${tool.name}: required field "${req}" not in properties [${props.join(", ")}]`,
      );
    }
  }
});
