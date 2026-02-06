/**
 * UiCollector Unit Tests
 *
 * Story 16.6: Composite UI Viewer & Editor
 *
 * Tests the UI collection logic that queries tool_schema.ui_meta
 * and builds CollectedUiResource[] for the dashboard.
 */

import { assertEquals } from "@std/assert";
import { UiCollector } from "../../../src/services/ui-collector.ts";
import type { DbClient } from "../../../src/db/client.ts";

/**
 * Mock DbClient that returns pre-configured rows
 */
class MockDbClient {
  private queryRows: Record<string, unknown>[] = [];
  private queryOneResult: Record<string, unknown> | null = null;

  /** Calls recorded for assertions */
  readonly queryCalls: Array<{ sql: string; params?: unknown[] }> = [];
  readonly queryOneCalls: Array<{ sql: string; params?: unknown[] }> = [];

  setQueryRows(rows: Record<string, unknown>[]) {
    this.queryRows = rows;
  }

  setQueryOneResult(result: Record<string, unknown> | null) {
    this.queryOneResult = result;
  }

  async query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
    this.queryCalls.push({ sql, params });
    return this.queryRows;
  }

  async queryOne(sql: string, params?: unknown[]): Promise<Record<string, unknown> | null> {
    this.queryOneCalls.push({ sql, params });
    return this.queryOneResult;
  }

  async exec(_sql: string, _params?: unknown[]): Promise<void> {}
}

Deno.test("UiCollector", async (t) => {
  await t.step("collectFromToolsCalled returns empty for empty input", async () => {
    const db = new MockDbClient();
    const collector = new UiCollector(db as unknown as DbClient);

    const result = await collector.collectFromToolsCalled([]);
    assertEquals(result, []);
    assertEquals(db.queryCalls.length, 0);
  });

  await t.step("collectFromToolsCalled returns empty when no tools have UI", async () => {
    const db = new MockDbClient();
    db.setQueryRows([]); // No rows with ui_meta
    const collector = new UiCollector(db as unknown as DbClient);

    const result = await collector.collectFromToolsCalled(["std:echo", "std:ls"]);
    assertEquals(result, []);
  });

  await t.step("collectFromToolsCalled collects UIs for tools with ui_meta", async () => {
    const db = new MockDbClient();
    db.setQueryRows([
      {
        tool_id: "postgres:query",
        ui_meta: { resourceUri: "ui://postgres/table" },
      },
      {
        tool_id: "viz:render",
        ui_meta: { resourceUri: "ui://viz/chart" },
      },
    ]);
    const collector = new UiCollector(db as unknown as DbClient);

    const result = await collector.collectFromToolsCalled([
      "postgres:query",
      "std:echo",
      "viz:render",
    ]);

    assertEquals(result.length, 2);
    assertEquals(result[0].source, "postgres:query");
    assertEquals(result[0].resourceUri, "ui://postgres/table");
    assertEquals(result[0].slot, 0);
    assertEquals(result[1].source, "viz:render");
    assertEquals(result[1].resourceUri, "ui://viz/chart");
    assertEquals(result[1].slot, 1);
  });

  await t.step("collectFromToolsCalled deduplicates tools", async () => {
    const db = new MockDbClient();
    db.setQueryRows([
      {
        tool_id: "postgres:query",
        ui_meta: { resourceUri: "ui://postgres/table" },
      },
    ]);
    const collector = new UiCollector(db as unknown as DbClient);

    const result = await collector.collectFromToolsCalled([
      "postgres:query",
      "postgres:query",
      "postgres:query",
    ]);

    // Should only query once and return 1 UI
    assertEquals(result.length, 1);
    // DB query should have received deduplicated list
    assertEquals(db.queryCalls[0].params, ["postgres:query"]);
  });

  await t.step("collectFromToolsCalled adds context when options provided", async () => {
    const db = new MockDbClient();
    db.setQueryRows([
      {
        tool_id: "postgres:query",
        ui_meta: { resourceUri: "ui://postgres/table" },
      },
    ]);
    const collector = new UiCollector(db as unknown as DbClient);

    const toolArgs = new Map<string, unknown>();
    toolArgs.set("postgres:query", { sql: "SELECT * FROM users" });

    const result = await collector.collectFromToolsCalled(
      ["postgres:query"],
      { workflowId: "wf-123", toolArgs },
    );

    assertEquals(result.length, 1);
    assertEquals(result[0].context?._workflowId, "wf-123");
    assertEquals(result[0].context?._args, { sql: "SELECT * FROM users" });
  });

  await t.step("collectFromToolsCalled handles string ui_meta (PostgreSQL jsonb)", async () => {
    const db = new MockDbClient();
    // PostgreSQL may return jsonb as a string
    db.setQueryRows([
      {
        tool_id: "postgres:query",
        ui_meta: JSON.stringify({ resourceUri: "ui://postgres/table" }),
      },
    ]);
    const collector = new UiCollector(db as unknown as DbClient);

    const result = await collector.collectFromToolsCalled(["postgres:query"]);

    assertEquals(result.length, 1);
    assertEquals(result[0].resourceUri, "ui://postgres/table");
  });

  await t.step("collectFromToolsCalled skips tools with null resourceUri", async () => {
    const db = new MockDbClient();
    db.setQueryRows([
      {
        tool_id: "std:echo",
        ui_meta: { emits: ["update"] }, // Has ui_meta but no resourceUri
      },
    ]);
    const collector = new UiCollector(db as unknown as DbClient);

    const result = await collector.collectFromToolsCalled(["std:echo"]);
    assertEquals(result.length, 0);
  });

  await t.step("hasAnyUi returns false for empty input", async () => {
    const db = new MockDbClient();
    const collector = new UiCollector(db as unknown as DbClient);

    const result = await collector.hasAnyUi([]);
    assertEquals(result, false);
  });

  await t.step("hasAnyUi returns true when tools have ui_meta", async () => {
    const db = new MockDbClient();
    db.setQueryOneResult({ count: 2 });
    const collector = new UiCollector(db as unknown as DbClient);

    const result = await collector.hasAnyUi(["postgres:query", "viz:render"]);
    assertEquals(result, true);
  });

  await t.step("hasAnyUi returns false when no tools have ui_meta", async () => {
    const db = new MockDbClient();
    db.setQueryOneResult({ count: 0 });
    const collector = new UiCollector(db as unknown as DbClient);

    const result = await collector.hasAnyUi(["std:echo"]);
    assertEquals(result, false);
  });
});
