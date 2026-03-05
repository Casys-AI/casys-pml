import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import { VaultKV } from "./store-kv.ts";

// ── Notes ────────────────────────────────────────────────────────────────────

Deno.test("VaultKV - upsertNote + getAllNotes", async () => {
  const store = await VaultKV.open(":memory:");
  try {
    await store.upsertNote({
      name: "README",
      path: "README.md",
      bodyHash: "abc123",
      level: 0,
    });

    const notes = await store.getAllNotes();
    assertEquals(notes.length, 1);
    assertEquals(notes[0].name, "README");
    assertEquals(notes[0].path, "README.md");
    assertEquals(notes[0].bodyHash, "abc123");
    assertEquals(notes[0].level, 0);
    assertEquals(notes[0].embedding, undefined);
    assertEquals(notes[0].gnnEmbedding, undefined);
  } finally {
    store.close();
  }
});

Deno.test("VaultKV - upsertNote preserves existing embeddings", async () => {
  // COALESCE behaviour: re-upserting without embeddings must NOT erase existing ones.
  const store = await VaultKV.open(":memory:");
  try {
    const embedding = [0.1, 0.2, 0.3];
    const gnnEmbedding = [0.4, 0.5, 0.6];

    // First upsert WITH embeddings
    await store.upsertNote({
      name: "Note",
      path: "note.md",
      bodyHash: "hash1",
      level: 0,
      embedding,
      gnnEmbedding,
    });

    // Second upsert WITHOUT embeddings (e.g. body changed, no re-embedding yet)
    await store.upsertNote({
      name: "Note",
      path: "note.md",
      bodyHash: "hash2",
      level: 0,
    });

    const notes = await store.getAllNotes();
    assertEquals(notes.length, 1);
    assertEquals(notes[0].bodyHash, "hash2"); // updated
    assertEquals(notes[0].embedding, embedding); // preserved
    assertEquals(notes[0].gnnEmbedding, gnnEmbedding); // preserved
  } finally {
    store.close();
  }
});

Deno.test("VaultKV - updateNoteEmbedding", async () => {
  const store = await VaultKV.open(":memory:");
  try {
    await store.upsertNote({
      name: "A",
      path: "a.md",
      bodyHash: "ha",
      level: 0,
    });

    const embedding = [1.0, 2.0, 3.0];
    await store.updateNoteEmbedding("A", embedding);

    const notes = await store.getAllNotes();
    assertEquals(notes[0].embedding, embedding);
    assertEquals(notes[0].gnnEmbedding, undefined); // untouched
  } finally {
    store.close();
  }
});

Deno.test("VaultKV - updateNoteGnnEmbedding", async () => {
  const store = await VaultKV.open(":memory:");
  try {
    await store.upsertNote({
      name: "B",
      path: "b.md",
      bodyHash: "hb",
      level: 0,
    });

    const gnnEmbedding = [7.0, 8.0, 9.0];
    await store.updateNoteGnnEmbedding("B", gnnEmbedding);

    const notes = await store.getAllNotes();
    assertEquals(notes[0].gnnEmbedding, gnnEmbedding);
    assertEquals(notes[0].embedding, undefined); // untouched
  } finally {
    store.close();
  }
});

Deno.test("VaultKV - getAllNotes returns empty array for empty store", async () => {
  const store = await VaultKV.open(":memory:");
  try {
    const notes = await store.getAllNotes();
    assertEquals(notes, []);
  } finally {
    store.close();
  }
});

// ── Edges ────────────────────────────────────────────────────────────────────

Deno.test("VaultKV - setEdges + getEdges", async () => {
  const store = await VaultKV.open(":memory:");
  try {
    await store.setEdges("A", ["B", "C"]);
    const edges = await store.getEdges("A");
    // Order may vary depending on implementation; sort before comparing.
    assertEquals([...edges].sort(), ["B", "C"]);
  } finally {
    store.close();
  }
});

Deno.test("VaultKV - setEdges overwrites previous edges", async () => {
  const store = await VaultKV.open(":memory:");
  try {
    await store.setEdges("A", ["B", "C", "D"]);
    await store.setEdges("A", ["E"]); // overwrite
    const edges = await store.getEdges("A");
    assertEquals(edges, ["E"]);
  } finally {
    store.close();
  }
});

Deno.test("VaultKV - getEdges returns empty array for unknown source", async () => {
  const store = await VaultKV.open(":memory:");
  try {
    const edges = await store.getEdges("nonexistent");
    assertEquals(edges, []);
  } finally {
    store.close();
  }
});

// ── Traces ───────────────────────────────────────────────────────────────────

Deno.test("VaultKV - insertTrace + getAllTraces", async () => {
  const store = await VaultKV.open(":memory:");
  try {
    await store.insertTrace({
      intent: "find config",
      targetNote: "config",
      path: ["README", "config"],
      success: true,
      synthetic: false,
    });

    const traces = await store.getAllTraces();
    assertEquals(traces.length, 1);
    assertEquals(traces[0].targetNote, "config");
    assertEquals(traces[0].path, ["README", "config"]);
    assertEquals(traces[0].intent, "find config");
    assertEquals(traces[0].success, true);
    assertEquals(traces[0].synthetic, false);
  } finally {
    store.close();
  }
});

Deno.test("VaultKV - traces are ordered chronologically", async () => {
  const store = await VaultKV.open(":memory:");
  try {
    // Insert three traces in order; getAllTraces must return them sorted by insertion time.
    await store.insertTrace({ targetNote: "first", path: ["a"], synthetic: false });
    await store.insertTrace({ targetNote: "second", path: ["b"], synthetic: false });
    await store.insertTrace({ targetNote: "third", path: ["c"], synthetic: false });

    const traces = await store.getAllTraces();
    assertEquals(traces.length, 3);
    assertEquals(traces[0].targetNote, "first");
    assertEquals(traces[1].targetNote, "second");
    assertEquals(traces[2].targetNote, "third");
  } finally {
    store.close();
  }
});

Deno.test("VaultKV - trace without intent", async () => {
  const store = await VaultKV.open(":memory:");
  try {
    await store.insertTrace({
      targetNote: "target",
      path: ["target"],
      synthetic: true,
    });

    const traces = await store.getAllTraces();
    assertEquals(traces.length, 1);
    // intent is optional — must not be required
    assertEquals(traces[0].intent == null || traces[0].intent === undefined, true);
    assertEquals(traces[0].synthetic, true);
  } finally {
    store.close();
  }
});

Deno.test("VaultKV - multiple traces accumulate", async () => {
  const store = await VaultKV.open(":memory:");
  try {
    for (let i = 0; i < 5; i++) {
      await store.insertTrace({
        intent: `intent-${i}`,
        targetNote: `note-${i}`,
        path: [`note-${i}`],
        synthetic: false,
      });
    }

    const traces = await store.getAllTraces();
    assertEquals(traces.length, 5);
  } finally {
    store.close();
  }
});

// ── Virtual Edges ────────────────────────────────────────────────────────────

Deno.test("VaultKV - upsertVirtualEdge creates and accumulates stats", async () => {
  const store = await VaultKV.open(":memory:");
  try {
    const first = await store.upsertVirtualEdge({
      source: "A",
      target: "B",
      scoreDelta: 1,
      reason: "selected_path",
    });
    assertEquals(first.score, 1);
    assertEquals(first.support, 1);
    assertEquals(first.rejects, 0);
    assertEquals(first.status, "candidate");

    const second = await store.upsertVirtualEdge({
      source: "A",
      target: "B",
      scoreDelta: -0.7,
      reason: "rejected_candidate",
    });
    assertEquals(Math.abs(second.score - 0.3) < 1e-9, true);
    assertEquals(second.support, 1);
    assertEquals(second.rejects, 1);
  } finally {
    store.close();
  }
});

Deno.test("VaultKV - listVirtualEdges filters by status", async () => {
  const store = await VaultKV.open(":memory:");
  try {
    await store.upsertVirtualEdge({
      source: "A",
      target: "B",
      scoreDelta: 1,
      reason: "selected_path",
    });
    await store.upsertVirtualEdge({
      source: "C",
      target: "D",
      scoreDelta: 1,
      reason: "selected_path",
    });
    await store.setVirtualEdgeStatus("C", "D", "promoted");

    const promoted = await store.listVirtualEdges("promoted");
    assertEquals(promoted.length, 1);
    assertEquals(promoted[0].source, "C");
    assertEquals(promoted[0].target, "D");
  } finally {
    store.close();
  }
});

Deno.test("VaultKV - applyVirtualEdgeDecay reduces score", async () => {
  const store = await VaultKV.open(":memory:");
  try {
    await store.upsertVirtualEdge({
      source: "A",
      target: "B",
      scoreDelta: 10,
      reason: "selected_path",
    });
    const count = await store.applyVirtualEdgeDecay(0.5);
    assertEquals(count, 1);

    const edges = await store.listVirtualEdges();
    assertEquals(edges.length, 1);
    assertEquals(edges[0].score, 5);
  } finally {
    store.close();
  }
});

// ── GNN Params ───────────────────────────────────────────────────────────────

Deno.test("VaultKV - saveGnnParams + getGnnParams roundtrip", async () => {
  const store = await VaultKV.open(":memory:");
  try {
    const params = new Uint8Array([10, 20, 30, 40, 50]);
    await store.saveGnnParams(params, 12, 0.87);

    const result = await store.getGnnParams();
    assertNotEquals(result, null);
    assertEquals(result!.params, params);
    assertEquals(result!.epoch, 12);
    assertEquals(result!.accuracy, 0.87);
  } finally {
    store.close();
  }
});

Deno.test("VaultKV - getGnnParams returns null when empty", async () => {
  const store = await VaultKV.open(":memory:");
  try {
    const result = await store.getGnnParams();
    assertEquals(result, null);
  } finally {
    store.close();
  }
});

// ── GRU Weights ──────────────────────────────────────────────────────────────

Deno.test("VaultKV - saveGruWeights + getLatestWeights roundtrip", async () => {
  const store = await VaultKV.open(":memory:");
  try {
    const weights = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    await store.saveGruWeights(weights, 920, 36, 0.634);

    const result = await store.getLatestWeights();
    assertNotEquals(result, null);
    assertEquals(result!.blob, weights);
    assertEquals(result!.vocabSize, 920);
    assertEquals(result!.epoch, 36);
    assertEquals(result!.accuracy, 0.634);
  } finally {
    store.close();
  }
});

Deno.test("VaultKV - getLatestWeights returns null when empty", async () => {
  const store = await VaultKV.open(":memory:");
  try {
    const result = await store.getLatestWeights();
    assertEquals(result, null);
  } finally {
    store.close();
  }
});

Deno.test("VaultKV - saveGruWeights overwrites previous (singleton)", async () => {
  // GRU weights have no history: second save must replace the first.
  const store = await VaultKV.open(":memory:");
  try {
    const first = new Uint8Array([1, 1, 1, 1]);
    await store.saveGruWeights(first, 100, 10, 0.5);

    const second = new Uint8Array([2, 2, 2, 2]);
    await store.saveGruWeights(second, 200, 20, 0.9);

    const result = await store.getLatestWeights();
    assertNotEquals(result, null);
    assertEquals(result!.blob, second);
    assertEquals(result!.vocabSize, 200);
    assertEquals(result!.epoch, 20);
    assertEquals(result!.accuracy, 0.9);
  } finally {
    store.close();
  }
});

// ── Factory ──────────────────────────────────────────────────────────────────

Deno.test("openVaultStore returns a working store (KV backend)", async () => {
  // Force KV backend regardless of any env var that might be set.
  const originalBackend = Deno.env.get("VAULT_BACKEND");
  Deno.env.set("VAULT_BACKEND", "kv");
  try {
    const { openVaultStore } = await import("./index.ts");
    const store = await openVaultStore(":memory:");
    try {
      await store.upsertNote({
        name: "factory-test",
        path: "factory-test.md",
        bodyHash: "deadbeef",
        level: 0,
      });
      const notes = await store.getAllNotes();
      assertEquals(notes.length, 1);
      assertEquals(notes[0].name, "factory-test");
    } finally {
      store.close();
    }
  } finally {
    if (originalBackend !== undefined) {
      Deno.env.set("VAULT_BACKEND", originalBackend);
    } else {
      Deno.env.delete("VAULT_BACKEND");
    }
  }
});
