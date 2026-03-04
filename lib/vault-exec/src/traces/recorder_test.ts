import { assertEquals } from "jsr:@std/assert";
import { recordTrace } from "./recorder.ts";
import { VaultDB } from "../db/store.ts";

Deno.test("recordTrace - stores execution trace in DuckDB", async () => {
  const db = await VaultDB.open(":memory:");
  try {
    await recordTrace(db, {
      intent: "find seniors",
      targetNote: "Senior Filter",
      path: ["Team Members", "Senior Filter"],
      success: true,
      synthetic: false,
    });

    const traces = await db.getAllTraces();
    assertEquals(traces.length, 1);
    assertEquals(traces[0].targetNote, "Senior Filter");
    assertEquals(traces[0].path, ["Team Members", "Senior Filter"]);
  } finally {
    db.close();
  }
});

Deno.test("recordTrace - multiple traces accumulate", async () => {
  const db = await VaultDB.open(":memory:");
  try {
    await recordTrace(db, {
      targetNote: "A", path: ["A"], success: true, synthetic: true,
    });
    await recordTrace(db, {
      targetNote: "B", path: ["A", "B"], success: true, synthetic: false,
    });
    const traces = await db.getAllTraces();
    assertEquals(traces.length, 2);
  } finally {
    db.close();
  }
});
