import {
  DuckDBInstance,
  listValue,
  blobValue,
} from "@duckdb/node-api";
import type { DuckDBConnection, DuckDBValue, DuckDBListValue } from "@duckdb/node-api";

// ── Interfaces ──────────────────────────────────────────────────────────

export interface NoteRow {
  name: string;
  path: string;
  bodyHash: string;
  level: number;
  embedding?: number[];
  gnnEmbedding?: number[];
}

export interface TraceRow {
  id?: number;
  intent?: string;
  intentEmbedding?: number[];
  targetNote: string;
  path: string[];
  success?: boolean;
  synthetic: boolean;
  executedAt?: string;
}

// ── Schema ──────────────────────────────────────────────────────────────

const SCHEMA = `
CREATE SEQUENCE IF NOT EXISTS traces_seq START 1;

CREATE TABLE IF NOT EXISTS notes (
  name        TEXT PRIMARY KEY,
  path        TEXT NOT NULL,
  body_hash   TEXT NOT NULL,
  level       INTEGER NOT NULL DEFAULT 0,
  embedding   DOUBLE[],
  gnn_embedding DOUBLE[],
  updated_at  TIMESTAMP DEFAULT current_timestamp
);

CREATE TABLE IF NOT EXISTS edges (
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  PRIMARY KEY (source, target)
);

CREATE TABLE IF NOT EXISTS traces (
  id               INTEGER PRIMARY KEY DEFAULT nextval('traces_seq'),
  intent           TEXT,
  intent_embedding DOUBLE[],
  target_note      TEXT NOT NULL,
  path             TEXT[],
  success          BOOLEAN DEFAULT true,
  synthetic        BOOLEAN NOT NULL DEFAULT false,
  executed_at      TIMESTAMP DEFAULT current_timestamp
);

CREATE TABLE IF NOT EXISTS gnn_params (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  params     BLOB,
  epoch      INTEGER,
  accuracy   DOUBLE,
  trained_at TIMESTAMP DEFAULT current_timestamp
);

CREATE TABLE IF NOT EXISTS gru_weights (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  weights    BLOB,
  vocab_size INTEGER,
  epoch      INTEGER,
  accuracy   DOUBLE,
  trained_at TIMESTAMP DEFAULT current_timestamp
);
`;

// ── Helpers ─────────────────────────────────────────────────────────────

/** Convert a DuckDBListValue to a JS array, or undefined if null */
function toArray<T>(val: DuckDBValue): T[] | undefined {
  if (val == null) return undefined;
  if (typeof val === "object" && "items" in val) {
    return (val as DuckDBListValue).items as T[];
  }
  return undefined;
}

/** Wrap a JS number[] as a DuckDBListValue, or null */
function toListOrNull(arr: number[] | undefined): DuckDBValue {
  return arr ? listValue(arr) : null;
}

// ── VaultDB ─────────────────────────────────────────────────────────────

export class VaultDB {
  private instance!: DuckDBInstance;
  private conn!: DuckDBConnection;

  private constructor() {}

  static async open(path: string): Promise<VaultDB> {
    const db = new VaultDB();
    db.instance = await DuckDBInstance.create(path);
    db.conn = await db.instance.connect();

    // Execute schema statements one by one
    const statements = SCHEMA
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await db.conn.run(stmt);
    }

    return db;
  }

  close(): void {
    this.conn.closeSync();
    this.instance.closeSync();
  }

  // ── Notes ───────────────────────────────────────────────────────────

  async upsertNote(note: NoteRow): Promise<void> {
    await this.conn.run(
      `INSERT INTO notes (name, path, body_hash, level, embedding, gnn_embedding)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (name) DO UPDATE SET
         path = EXCLUDED.path,
         body_hash = EXCLUDED.body_hash,
         level = EXCLUDED.level,
         embedding = COALESCE(EXCLUDED.embedding, notes.embedding),
         gnn_embedding = COALESCE(EXCLUDED.gnn_embedding, notes.gnn_embedding),
         updated_at = now()`,
      [
        note.name,
        note.path,
        note.bodyHash,
        note.level,
        toListOrNull(note.embedding),
        toListOrNull(note.gnnEmbedding),
      ],
    );
  }

  async getAllNotes(): Promise<NoteRow[]> {
    const result = await this.conn.runAndReadAll(
      "SELECT name, path, body_hash, level, embedding, gnn_embedding FROM notes ORDER BY name",
    );
    return result.getRows().map((row) => ({
      name: row[0] as string,
      path: row[1] as string,
      bodyHash: row[2] as string,
      level: row[3] as number,
      embedding: toArray<number>(row[4]),
      gnnEmbedding: toArray<number>(row[5]),
    }));
  }

  async updateNoteEmbedding(
    name: string,
    embedding: number[],
  ): Promise<void> {
    await this.conn.run(
      "UPDATE notes SET embedding = $1, updated_at = now() WHERE name = $2",
      [listValue(embedding), name],
    );
  }

  async updateNoteGnnEmbedding(
    name: string,
    gnnEmbedding: number[],
  ): Promise<void> {
    await this.conn.run(
      "UPDATE notes SET gnn_embedding = $1, updated_at = now() WHERE name = $2",
      [listValue(gnnEmbedding), name],
    );
  }

  // ── Edges ───────────────────────────────────────────────────────────

  async setEdges(source: string, targets: string[]): Promise<void> {
    await this.conn.run(
      "DELETE FROM edges WHERE source = $1",
      [source],
    );
    for (const target of targets) {
      await this.conn.run(
        "INSERT INTO edges (source, target) VALUES ($1, $2)",
        [source, target],
      );
    }
  }

  async getEdges(source: string): Promise<string[]> {
    const result = await this.conn.runAndReadAll(
      "SELECT target FROM edges WHERE source = $1 ORDER BY target",
      [source],
    );
    return result.getRows().map((row) => row[0] as string);
  }

  // ── Traces ──────────────────────────────────────────────────────────

  async insertTrace(trace: TraceRow): Promise<void> {
    await this.conn.run(
      `INSERT INTO traces (intent, intent_embedding, target_note, path, success, synthetic)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        trace.intent ?? null,
        trace.intentEmbedding ? listValue(trace.intentEmbedding) : null,
        trace.targetNote,
        listValue(trace.path),
        trace.success ?? true,
        trace.synthetic,
      ],
    );
  }

  async getAllTraces(): Promise<TraceRow[]> {
    const result = await this.conn.runAndReadAll(
      `SELECT id, intent, intent_embedding, target_note, path, success, synthetic, executed_at
       FROM traces ORDER BY id`,
    );
    return result.getRows().map((row) => ({
      id: row[0] as number,
      intent: row[1] as string | undefined,
      intentEmbedding: toArray<number>(row[2]),
      targetNote: row[3] as string,
      path: toArray<string>(row[4]) ?? [],
      success: row[5] as boolean | undefined,
      synthetic: row[6] as boolean,
      executedAt: row[7] != null ? String(row[7]) : undefined,
    }));
  }

  // ── Model persistence ─────────────────────────────────────────────

  async saveGnnParams(
    params: Uint8Array,
    epoch: number,
    accuracy: number,
  ): Promise<void> {
    await this.conn.run(
      `INSERT INTO gnn_params (id, params, epoch, accuracy, trained_at)
       VALUES (1, $1, $2, $3, current_timestamp)
       ON CONFLICT (id) DO UPDATE SET
         params = EXCLUDED.params,
         epoch = EXCLUDED.epoch,
         accuracy = EXCLUDED.accuracy,
         trained_at = now()`,
      [blobValue(params), epoch, accuracy],
    );
  }

  async getGnnParams(): Promise<{
    params: Uint8Array;
    epoch: number;
    accuracy: number;
  } | null> {
    const result = await this.conn.runAndReadAll(
      "SELECT params, epoch, accuracy FROM gnn_params WHERE id = 1",
    );
    const rows = result.getRows();
    if (rows.length === 0) return null;
    const row = rows[0];
    if (row[0] == null) return null;
    return {
      params: row[0] as Uint8Array,
      epoch: row[1] as number,
      accuracy: row[2] as number,
    };
  }

  async saveGruWeights(
    weights: Uint8Array,
    vocabSize: number,
    epoch: number,
    accuracy: number,
  ): Promise<void> {
    await this.conn.run(
      `INSERT INTO gru_weights (id, weights, vocab_size, epoch, accuracy, trained_at)
       VALUES (1, $1, $2, $3, $4, current_timestamp)
       ON CONFLICT (id) DO UPDATE SET
         weights = EXCLUDED.weights,
         vocab_size = EXCLUDED.vocab_size,
         epoch = EXCLUDED.epoch,
         accuracy = EXCLUDED.accuracy,
         trained_at = now()`,
      [blobValue(weights), vocabSize, epoch, accuracy],
    );
  }

  async getLatestWeights(): Promise<{
    blob: Uint8Array;
    vocabSize: number;
    epoch: number;
    accuracy: number;
  } | null> {
    const result = await this.conn.runAndReadAll(
      "SELECT weights, vocab_size, epoch, accuracy FROM gru_weights ORDER BY trained_at DESC LIMIT 1",
    );
    const rows = result.getRows();
    if (rows.length === 0) return null;
    const row = rows[0];
    if (row[0] == null) return null;
    return {
      blob: row[0] as Uint8Array,
      vocabSize: row[1] as number,
      epoch: row[2] as number,
      accuracy: row[3] as number,
    };
  }
}
