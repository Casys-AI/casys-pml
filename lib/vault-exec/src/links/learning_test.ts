import { assertAlmostEquals, assertEquals } from "jsr:@std/assert";
import type {
  IVaultStore,
  NoteRow,
  TraceRow,
  VirtualEdgeRow,
  VirtualEdgeStatus,
  VirtualEdgeUpdate,
} from "../core/types.ts";
import {
  applyVirtualEdgeDecay,
  applyVirtualEdgeUpdate,
  nextVirtualEdgeRow,
} from "./learning.ts";

class FakeStore implements IVaultStore {
  notes = new Map<string, NoteRow>();
  edges = new Map<string, string[]>();
  traces: TraceRow[] = [];
  virtual = new Map<string, VirtualEdgeRow>();

  close(): void {}
  async upsertNote(note: NoteRow): Promise<void> {
    this.notes.set(note.name, note);
  }
  async getAllNotes(): Promise<NoteRow[]> {
    return [...this.notes.values()];
  }
  async updateNoteEmbedding(name: string, embedding: number[]): Promise<void> {
    const n = this.notes.get(name);
    if (n) n.embedding = embedding;
  }
  async updateNoteGnnEmbedding(
    name: string,
    gnnEmbedding: number[],
  ): Promise<void> {
    const n = this.notes.get(name);
    if (n) n.gnnEmbedding = gnnEmbedding;
  }
  async setEdges(source: string, targets: string[]): Promise<void> {
    this.edges.set(source, targets);
  }
  async getEdges(source: string): Promise<string[]> {
    return this.edges.get(source) ?? [];
  }
  async insertTrace(trace: TraceRow): Promise<void> {
    this.traces.push(trace);
  }
  async getAllTraces(): Promise<TraceRow[]> {
    return this.traces;
  }
  async getVirtualEdge(
    source: string,
    target: string,
  ): Promise<VirtualEdgeRow | null> {
    return this.virtual.get(`${source}->${target}`) ?? null;
  }
  async saveVirtualEdge(row: VirtualEdgeRow): Promise<void> {
    this.virtual.set(`${row.source}->${row.target}`, row);
  }
  async listVirtualEdges(
    status?: VirtualEdgeStatus,
  ): Promise<VirtualEdgeRow[]> {
    const rows = [...this.virtual.values()];
    return status ? rows.filter((r) => r.status === status) : rows;
  }
  async setVirtualEdgeStatus(
    source: string,
    target: string,
    status: VirtualEdgeStatus,
  ): Promise<void> {
    const k = `${source}->${target}`;
    const row = this.virtual.get(k);
    if (!row) return;
    this.virtual.set(k, {
      ...row,
      status,
    });
  }
  async saveGnnParams(
    _params: Uint8Array,
    _epoch: number,
    _accuracy: number,
  ): Promise<void> {}
  async getGnnParams(): Promise<
    { params: Uint8Array; epoch: number; accuracy: number } | null
  > {
    return null;
  }
  async saveGruWeights(
    _weights: Uint8Array,
    _vocabSize: number,
    _epoch: number,
    _accuracy: number,
  ): Promise<void> {}
  async getLatestWeights(): Promise<
    | { blob: Uint8Array; vocabSize: number; epoch: number; accuracy: number }
    | null
  > {
    return null;
  }
}

Deno.test("nextVirtualEdgeRow applies update deltas", () => {
  const row = nextVirtualEdgeRow(
    {
      source: "A",
      target: "B",
      score: 1,
      support: 2,
      rejects: 0,
      status: "candidate",
      updatedAt: "t0",
    },
    {
      source: "A",
      target: "B",
      scoreDelta: -0.7,
      reason: "rejected_candidate",
    },
    "t1",
  );

  assertAlmostEquals(row.score, 0.3, 1e-9);
  assertEquals(row.support, 2);
  assertEquals(row.rejects, 1);
  assertEquals(row.updatedAt, "t1");
});

Deno.test("applyVirtualEdgeUpdate persists computed row", async () => {
  const store = new FakeStore();
  await store.saveVirtualEdge({
    source: "A",
    target: "B",
    score: 0,
    support: 0,
    rejects: 0,
    status: "candidate",
    updatedAt: "t0",
  });

  const next = await applyVirtualEdgeUpdate(
    store,
    { source: "A", target: "B", scoreDelta: 1, reason: "selected_path" },
    "t1",
  );

  assertEquals(next.score, 1);
  assertEquals(next.support, 1);
  assertEquals((await store.getVirtualEdge("A", "B"))?.updatedAt, "t1");
});

Deno.test("applyVirtualEdgeDecay decays all rows", async () => {
  const store = new FakeStore();
  await store.saveVirtualEdge({
    source: "A",
    target: "B",
    score: 2,
    support: 1,
    rejects: 0,
    status: "candidate",
    updatedAt: "t0",
  });
  await store.saveVirtualEdge({
    source: "X",
    target: "Y",
    score: 3,
    support: 1,
    rejects: 0,
    status: "candidate",
    updatedAt: "t0",
  });

  const count = await applyVirtualEdgeDecay(store, 0.5, "t2");

  assertEquals(count, 2);
  assertEquals((await store.getVirtualEdge("A", "B"))?.score, 1);
  assertEquals((await store.getVirtualEdge("X", "Y"))?.score, 1.5);
});

Deno.test("applyVirtualEdgeDecay ignores invalid factors", async () => {
  const store = new FakeStore();
  const count = await applyVirtualEdgeDecay(store, 1.2);
  assertEquals(count, 0);
});
