/**
 * Tests for playground mock datasets
 *
 * Validates that all 23 datasets conform to their respective MCP UI data formats
 * and that the data pipeline correctly processes each dataset.
 *
 * Story 17.2 — Validation des 5 UIs Cibles
 */

import { assertEquals, assertExists, assert } from "@std/assert";
import {
  getDataset,
  listDatasetIds,
  listDatasetsByType,
} from "../../../src/web/content/playground-datasets.ts";

// ============================================
// Registry Tests
// ============================================

Deno.test("playground-datasets: should have 23 datasets", () => {
  assertEquals(listDatasetIds().length, 23);
});

Deno.test("playground-datasets: should group datasets by 4 UI types", () => {
  const byType = listDatasetsByType();
  assertEquals(Object.keys(byType).sort(), [
    "metrics-panel",
    "resource-monitor",
    "table-viewer",
    "timeline-viewer",
  ]);
});

Deno.test("playground-datasets: correct counts per type", () => {
  const byType = listDatasetsByType();
  assertEquals(byType["table-viewer"].length, 8);
  assertEquals(byType["metrics-panel"].length, 6);
  assertEquals(byType["timeline-viewer"].length, 5);
  assertEquals(byType["resource-monitor"].length, 4);
});

Deno.test("playground-datasets: getDataset returns undefined for unknown id", () => {
  assertEquals(getDataset("nonexistent"), undefined);
});

// ============================================
// Per-dataset validation
// ============================================

for (const id of listDatasetIds()) {
  Deno.test(`playground-datasets: "${id}" has valid structure`, () => {
    const entry = getDataset(id);
    assertExists(entry);
    assertExists(entry.uiType);
    assertExists(entry.resourceUri);
    assertExists(entry.title);
    assertExists(entry.data);
    assertEquals(entry.resourceUri, `ui://mcp-std/${entry.uiType}`);
  });

  Deno.test(`playground-datasets: "${id}" JSON roundtrip`, () => {
    const entry = getDataset(id)!;
    const json = JSON.stringify(entry.data);
    const reparsed = JSON.parse(json);
    assertExists(reparsed);
  });
}

// ============================================
// table-viewer format validation
// ============================================

for (const id of listDatasetsByType()["table-viewer"]) {
  Deno.test(`table-viewer: "${id}" has columns and rows`, () => {
    const data = getDataset(id)!.data as { columns: string[]; rows: unknown[][] };
    assert(Array.isArray(data.columns), "columns must be array");
    assert(Array.isArray(data.rows), "rows must be array");
    assert(data.rows.length > 0, "rows must not be empty");
    for (let i = 0; i < data.rows.length; i++) {
      assertEquals(
        data.rows[i].length,
        data.columns.length,
        `row ${i} length (${data.rows[i].length}) must match columns length (${data.columns.length})`,
      );
    }
  });
}

// ============================================
// metrics-panel format validation
// ============================================

for (const id of listDatasetsByType()["metrics-panel"]) {
  Deno.test(`metrics-panel: "${id}" has metrics with required fields`, () => {
    const data = getDataset(id)!.data as { metrics: Array<{ id: string; label: string; value: number }> };
    assert(Array.isArray(data.metrics), "metrics must be array");
    assert(data.metrics.length > 0, "metrics must not be empty");
    for (const m of data.metrics) {
      assertExists(m.id, "metric must have id");
      assertExists(m.label, "metric must have label");
      assertEquals(typeof m.value, "number", "metric value must be number");
    }
  });
}

// ============================================
// timeline-viewer format validation
// ============================================

for (const id of listDatasetsByType()["timeline-viewer"]) {
  Deno.test(`timeline-viewer: "${id}" has events with required fields`, () => {
    const data = getDataset(id)!.data as { events: Array<{ timestamp: string; type: string; title: string }> };
    assert(Array.isArray(data.events), "events must be array");
    assert(data.events.length > 0, "events must not be empty");
    for (const e of data.events) {
      assertExists(e.timestamp, "event must have timestamp");
      assertExists(e.type, "event must have type");
      assertExists(e.title, "event must have title");
    }
  });
}

// ============================================
// resource-monitor format validation
// ============================================

for (const id of listDatasetsByType()["resource-monitor"]) {
  Deno.test(`resource-monitor: "${id}" has resources with required fields`, () => {
    const data = getDataset(id)!.data as {
      resources: Array<{
        name: string;
        cpu: { percent: number };
        memory: { used: number; limit: number; percent: number };
      }>;
    };
    assert(Array.isArray(data.resources), "resources must be array");
    assert(data.resources.length > 0, "resources must not be empty");
    for (const r of data.resources) {
      assertExists(r.name, "resource must have name");
      assertExists(r.cpu, "resource must have cpu");
      assertEquals(typeof r.cpu.percent, "number", "cpu.percent must be number");
      assertExists(r.memory, "resource must have memory");
      assertEquals(typeof r.memory.used, "number", "memory.used must be number");
      assertEquals(typeof r.memory.limit, "number", "memory.limit must be number");
      assertEquals(typeof r.memory.percent, "number", "memory.percent must be number");
    }
  });
}
