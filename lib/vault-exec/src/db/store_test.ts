import { assertEquals } from "jsr:@std/assert";
import { VaultDB } from "./store.ts";

Deno.test("VaultDB - initializes schema and inserts a note", async () => {
  const db = await VaultDB.open(":memory:");
  try {
    await db.upsertNote({
      name: "README",
      path: "README.md",
      bodyHash: "abc123",
      level: 0,
    });

    const notes = await db.getAllNotes();
    assertEquals(notes.length, 1);
    assertEquals(notes[0].name, "README");
    assertEquals(notes[0].path, "README.md");
    assertEquals(notes[0].bodyHash, "abc123");
    assertEquals(notes[0].level, 0);
  } finally {
    db.close();
  }
});

Deno.test("VaultDB - upsert updates existing note", async () => {
  const db = await VaultDB.open(":memory:");
  try {
    await db.upsertNote({
      name: "README",
      path: "README.md",
      bodyHash: "hash_v1",
      level: 0,
    });

    await db.upsertNote({
      name: "README",
      path: "README.md",
      bodyHash: "hash_v2",
      level: 1,
    });

    const notes = await db.getAllNotes();
    assertEquals(notes.length, 1);
    assertEquals(notes[0].bodyHash, "hash_v2");
    assertEquals(notes[0].level, 1);
  } finally {
    db.close();
  }
});

Deno.test("VaultDB - edges CRUD", async () => {
  const db = await VaultDB.open(":memory:");
  try {
    await db.upsertNote({
      name: "A",
      path: "a.md",
      bodyHash: "ha",
      level: 0,
    });
    await db.upsertNote({
      name: "B",
      path: "b.md",
      bodyHash: "hb",
      level: 0,
    });

    await db.setEdges("A", ["B"]);
    const edges = await db.getEdges("A");
    assertEquals(edges, ["B"]);

    // Overwrite edges
    await db.setEdges("A", []);
    const empty = await db.getEdges("A");
    assertEquals(empty, []);
  } finally {
    db.close();
  }
});

Deno.test("VaultDB - traces insert and query", async () => {
  const db = await VaultDB.open(":memory:");
  try {
    await db.insertTrace({
      intent: "find config",
      targetNote: "config",
      path: ["README", "config"],
      success: true,
      synthetic: false,
    });

    const traces = await db.getAllTraces();
    assertEquals(traces.length, 1);
    assertEquals(traces[0].targetNote, "config");
    assertEquals(traces[0].path, ["README", "config"]);
    assertEquals(traces[0].synthetic, false);
  } finally {
    db.close();
  }
});
