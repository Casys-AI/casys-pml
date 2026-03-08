// VaultKV — Deno KV backend for vault-exec.
// Implements IVaultStore using Deno's built-in KV store.
// Large blobs (GNN params, GRU weights) are chunked via @kitsonk/kv-toolbox/blob.

import {
  get as getBlob,
  set as setBlob,
} from "jsr:@kitsonk/kv-toolbox@0.30/blob";
import type {
  IVaultStore,
  NoteRow,
  TraceRow,
  VirtualEdgeRow,
  VirtualEdgeStatus,
} from "../core/types.ts";

// Maximum CAS retry attempts for upsertNote.
const MAX_CAS_RETRIES = 5;

function compareStable(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// ── VaultKV ──────────────────────────────────────────────────────────────────

export class VaultKV implements IVaultStore {
  private constructor(private readonly kv: Deno.Kv) {}

  // Temporary file path used when opened with ":memory:" — tracked for cleanup on close().
  private tempPath?: string;

  // Monotonic sequence to preserve insertion order for same-timestamp trace keys.
  private traceSeq = 0;

  /**
   * Open a Deno KV store at the given path.
   * path === ":memory:" → creates a unique temp file so each open() gets an isolated store.
   *   The temp file is deleted automatically when close() is called.
   * Otherwise opens at the given path directly.
   */
  static async open(path: string): Promise<VaultKV> {
    if (path === ":memory:") {
      // Each ":memory:" call must get its own isolated store.
      // Deno.openKv() with no args shares a single global KV — use a temp file instead.
      const tempPath = await Deno.makeTempFile({ suffix: ".kv" });
      const kv = await Deno.openKv(tempPath);
      const instance = new VaultKV(kv);
      instance.tempPath = tempPath;
      return instance;
    }
    const kv = await Deno.openKv(path);
    return new VaultKV(kv);
  }

  close(): void {
    this.kv.close();
    // Clean up the temp file created for ":memory:" mode.
    if (this.tempPath) {
      try {
        Deno.removeSync(this.tempPath);
      } catch {
        // Best-effort cleanup — do not throw if the file is already gone.
      }
      this.tempPath = undefined;
    }
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  /**
   * Upsert a note. Preserves existing embeddings if not provided in the new row.
   * Uses a CAS loop to handle concurrent writes safely (max 5 retries).
   */
  async upsertNote(note: NoteRow): Promise<void> {
    const key: Deno.KvKey = ["vault", "notes", note.name];

    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
      const entry = await this.kv.get<NoteRow>(key);
      const existing = entry.value;

      const updated: NoteRow = {
        ...note,
        // Preserve existing embeddings if the new row does not provide them.
        embedding: note.embedding ?? existing?.embedding,
        gnnEmbedding: note.gnnEmbedding ?? existing?.gnnEmbedding,
      };

      const res = await this.kv.atomic()
        .check(entry)
        .set(key, updated)
        .commit();

      if (res.ok) return;
      // CAS failed due to concurrent write — retry.
    }

    throw new Error(
      `[VaultKV] upsertNote: CAS failed after ${MAX_CAS_RETRIES} retries for note "${note.name}". ` +
        "This indicates unexpected concurrent writes to the vault.",
    );
  }

  async getAllNotes(): Promise<NoteRow[]> {
    const result: NoteRow[] = [];
    for await (
      const entry of this.kv.list<NoteRow>({ prefix: ["vault", "notes"] })
    ) {
      result.push(entry.value);
    }
    // Sort by name for deterministic ordering (mirrors VaultDB ORDER BY name).
    result.sort((a, b) => compareStable(a.name, b.name));
    return result;
  }

  async updateNoteEmbedding(
    name: string,
    embedding: number[],
  ): Promise<void> {
    const key: Deno.KvKey = ["vault", "notes", name];

    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
      const entry = await this.kv.get<NoteRow>(key);
      if (!entry.value) {
        throw new Error(
          `[VaultKV] updateNoteEmbedding: note "${name}" not found.`,
        );
      }

      const updated: NoteRow = { ...entry.value, embedding };
      const res = await this.kv.atomic()
        .check(entry)
        .set(key, updated)
        .commit();

      if (res.ok) return;
    }

    throw new Error(
      `[VaultKV] updateNoteEmbedding: CAS failed after ${MAX_CAS_RETRIES} retries for note "${name}".`,
    );
  }

  async updateNoteGnnEmbedding(
    name: string,
    gnnEmbedding: number[],
  ): Promise<void> {
    const key: Deno.KvKey = ["vault", "notes", name];

    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
      const entry = await this.kv.get<NoteRow>(key);
      if (!entry.value) {
        throw new Error(
          `[VaultKV] updateNoteGnnEmbedding: note "${name}" not found.`,
        );
      }

      const updated: NoteRow = { ...entry.value, gnnEmbedding };
      const res = await this.kv.atomic()
        .check(entry)
        .set(key, updated)
        .commit();

      if (res.ok) return;
    }

    throw new Error(
      `[VaultKV] updateNoteGnnEmbedding: CAS failed after ${MAX_CAS_RETRIES} retries for note "${name}".`,
    );
  }

  // ── Edges ─────────────────────────────────────────────────────────────────

  /** Replace all edges for a source node (denormalized: one key → string[]). */
  async setEdges(source: string, targets: string[]): Promise<void> {
    const canonicalTargets = [...new Set(targets)].sort();
    await this.kv.set(["vault", "edges", source], canonicalTargets);
  }

  async getEdges(source: string): Promise<string[]> {
    const entry = await this.kv.get<string[]>(["vault", "edges", source]);
    return entry.value ?? [];
  }

  // ── Traces ────────────────────────────────────────────────────────────────

  /**
   * Insert a trace. Key = ["vault", "traces", isoTimestamp, seq, uuidv4].
   * ISO timestamp gives coarse chronological ordering.
   * seq preserves deterministic in-process insertion order for same-timestamp writes.
   * UUID suffix avoids collisions across processes.
   */
  async insertTrace(trace: TraceRow): Promise<void> {
    const ts = trace.executedAt ?? new Date().toISOString();
    const seq = String(this.traceSeq++).padStart(8, "0");
    const id = crypto.randomUUID();
    const row: TraceRow = {
      ...trace,
      executedAt: ts,
    };
    await this.kv.set(["vault", "traces", ts, seq, id], row);
  }

  async getAllTraces(): Promise<TraceRow[]> {
    const result: TraceRow[] = [];
    for await (
      const entry of this.kv.list<TraceRow>({ prefix: ["vault", "traces"] })
    ) {
      result.push(entry.value);
    }
    // kv.list returns in key order → ISO timestamps give chronological order.
    return result;
  }

  // ── Virtual Edges ─────────────────────────────────────────────────────────

  async getVirtualEdge(
    source: string,
    target: string,
  ): Promise<VirtualEdgeRow | null> {
    const entry = await this.kv.get<VirtualEdgeRow>([
      "vault",
      "virtual_edges",
      source,
      target,
    ]);
    return entry.value ?? null;
  }

  async saveVirtualEdge(row: VirtualEdgeRow): Promise<void> {
    const key: Deno.KvKey = ["vault", "virtual_edges", row.source, row.target];
    await this.kv.set(key, row);
  }

  async listVirtualEdges(
    status?: VirtualEdgeStatus,
  ): Promise<VirtualEdgeRow[]> {
    const rows: VirtualEdgeRow[] = [];
    for await (
      const entry of this.kv.list<VirtualEdgeRow>({
        prefix: ["vault", "virtual_edges"],
      })
    ) {
      if (!status || entry.value.status === status) rows.push(entry.value);
    }
    rows.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const sourceCmp = compareStable(a.source, b.source);
      if (sourceCmp !== 0) return sourceCmp;
      return compareStable(a.target, b.target);
    });
    return rows;
  }

  async setVirtualEdgeStatus(
    source: string,
    target: string,
    status: VirtualEdgeStatus,
  ): Promise<void> {
    const key: Deno.KvKey = ["vault", "virtual_edges", source, target];
    const now = new Date().toISOString();
    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
      const entry = await this.kv.get<VirtualEdgeRow>(key);
      if (!entry.value) return;

      const updated: VirtualEdgeRow = {
        ...entry.value,
        status,
        promotedAt: status === "promoted"
          ? (entry.value.promotedAt ?? now)
          : entry.value.promotedAt,
        updatedAt: now,
      };
      const res = await this.kv.atomic().check(entry).set(key, updated)
        .commit();
      if (res.ok) return;
    }
    throw new Error(
      `[VaultKV] setVirtualEdgeStatus: CAS failed after ${MAX_CAS_RETRIES} retries for "${source}" -> "${target}".`,
    );
  }

  // ── GNN params ────────────────────────────────────────────────────────────

  /**
   * Save GNN params blob. The blob is chunked transparently by kv-toolbox.
   * Metadata (epoch, accuracy) is stored in a separate KV key.
   */
  async saveGnnParams(
    params: Uint8Array,
    epoch: number,
    accuracy: number,
  ): Promise<void> {
    await setBlob(this.kv, ["vault", "gnn_params"], params);
    await this.kv.set(["vault", "gnn_params_meta"], { epoch, accuracy });
  }

  async getGnnParams(): Promise<
    {
      params: Uint8Array;
      epoch: number;
      accuracy: number;
    } | null
  > {
    const meta = await this.kv.get<{ epoch: number; accuracy: number }>(
      ["vault", "gnn_params_meta"],
    );
    if (!meta.value) return null;

    const entry = await getBlob(this.kv, ["vault", "gnn_params"]);
    if (!entry.value) return null;

    return { params: entry.value, ...meta.value };
  }

  // ── GRU weights ───────────────────────────────────────────────────────────

  /**
   * Save GRU weights blob. The blob is chunked transparently by kv-toolbox.
   * Metadata (vocabSize, epoch, accuracy) is stored in a separate KV key.
   */
  async saveGruWeights(
    weights: Uint8Array,
    vocabSize: number,
    epoch: number,
    accuracy: number,
  ): Promise<void> {
    await setBlob(this.kv, ["vault", "gru_weights"], weights);
    await this.kv.set(["vault", "gru_weights_meta"], {
      vocabSize,
      epoch,
      accuracy,
    });
  }

  async getLatestWeights(): Promise<
    {
      blob: Uint8Array;
      vocabSize: number;
      epoch: number;
      accuracy: number;
    } | null
  > {
    const meta = await this.kv.get<{
      vocabSize: number;
      epoch: number;
      accuracy: number;
    }>(["vault", "gru_weights_meta"]);
    if (!meta.value) return null;

    const entry = await getBlob(this.kv, ["vault", "gru_weights"]);
    if (!entry.value) return null;

    return { blob: entry.value, ...meta.value };
  }
}
