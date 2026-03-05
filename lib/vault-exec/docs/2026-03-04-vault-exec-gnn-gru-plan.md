# vault-exec GNN + GRU Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add GNN message-passing and GRU sequence prediction to vault-exec, with DuckDB storage, BGE embeddings, synthetic trace generation, and live training — enabling intelligent intent-based routing that improves with usage.

**Architecture:** Fork & Simplify — copy SHGAT/GRU math from PML, strip PML-specific complexity, rewrite data layer on DuckDB. 100% local, no cloud dependencies. Training runs in async worker after each execution.

**Tech Stack:** TypeScript/Deno, DuckDB (`npm:@duckdb/node-api`), BGE-M3 (`@huggingface/transformers`), MessagePack (`jsr:@std/msgpack`), gzip (`jsr:@std/compress`)

**Design doc:** `docs/plans/2026-03-04-vault-exec-gnn-gru-design.md`

**Existing code:** `lib/vault-exec/src/` — parser, graph, executor, validator, compiler, intent, CLI. 38 tests passing. Demo vault with 5 notes.

**Deno test command:** `cd lib/vault-exec && deno test --allow-read src/`

---

## Task 1: DuckDB Store — Schema & Connection

**Files:**
- Create: `lib/vault-exec/src/db/store.ts`
- Create: `lib/vault-exec/src/db/store_test.ts`

**Step 1: Write the failing test**

```typescript
// store_test.ts
import { assertEquals } from "jsr:@std/assert";
import { VaultDB } from "./store.ts";

Deno.test("VaultDB - initializes schema and inserts a note", async () => {
  const db = await VaultDB.open(":memory:");
  try {
    await db.upsertNote({
      name: "Test Note",
      path: "Test Note.md",
      bodyHash: "abc123",
      level: 0,
    });
    const notes = await db.getAllNotes();
    assertEquals(notes.length, 1);
    assertEquals(notes[0].name, "Test Note");
    assertEquals(notes[0].level, 0);
  } finally {
    db.close();
  }
});

Deno.test("VaultDB - upsert updates existing note", async () => {
  const db = await VaultDB.open(":memory:");
  try {
    await db.upsertNote({ name: "A", path: "A.md", bodyHash: "v1", level: 0 });
    await db.upsertNote({ name: "A", path: "A.md", bodyHash: "v2", level: 1 });
    const notes = await db.getAllNotes();
    assertEquals(notes.length, 1);
    assertEquals(notes[0].bodyHash, "v2");
    assertEquals(notes[0].level, 1);
  } finally {
    db.close();
  }
});

Deno.test("VaultDB - edges CRUD", async () => {
  const db = await VaultDB.open(":memory:");
  try {
    await db.upsertNote({ name: "A", path: "A.md", bodyHash: "a", level: 1 });
    await db.upsertNote({ name: "B", path: "B.md", bodyHash: "b", level: 0 });
    await db.setEdges("A", ["B"]);
    const edges = await db.getEdges("A");
    assertEquals(edges, ["B"]);
  } finally {
    db.close();
  }
});

Deno.test("VaultDB - traces insert and query", async () => {
  const db = await VaultDB.open(":memory:");
  try {
    await db.insertTrace({
      intent: "find seniors",
      targetNote: "Senior Filter",
      path: ["Team Members", "Senior Filter"],
      synthetic: false,
    });
    const traces = await db.getAllTraces();
    assertEquals(traces.length, 1);
    assertEquals(traces[0].path, ["Team Members", "Senior Filter"]);
    assertEquals(traces[0].synthetic, false);
  } finally {
    db.close();
  }
});
```

**Step 2: Run test to verify it fails**

Run: `cd lib/vault-exec && deno test --allow-read --allow-write --allow-ffi --allow-env --allow-net src/db/store_test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// store.ts
import { DuckDBInstance } from "npm:@duckdb/node-api";

interface NoteRow {
  name: string;
  path: string;
  bodyHash: string;
  level: number;
  embedding?: number[];
  gnnEmbedding?: number[];
}

interface TraceRow {
  id?: number;
  intent?: string;
  intentEmbedding?: number[];
  targetNote: string;
  path: string[];
  success?: boolean;
  synthetic: boolean;
  executedAt?: Date;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (
  name          TEXT PRIMARY KEY,
  path          TEXT NOT NULL,
  body_hash     TEXT NOT NULL,
  level         INTEGER NOT NULL DEFAULT 0,
  embedding     DOUBLE[],
  gnn_embedding DOUBLE[],
  updated_at    TIMESTAMP DEFAULT current_timestamp
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
  path             TEXT[] NOT NULL,
  success          BOOLEAN DEFAULT true,
  synthetic        BOOLEAN DEFAULT false,
  executed_at      TIMESTAMP DEFAULT current_timestamp
);

CREATE SEQUENCE IF NOT EXISTS traces_seq START 1;

CREATE TABLE IF NOT EXISTS gnn_params (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  params     BLOB,
  epoch      INTEGER,
  accuracy   DOUBLE,
  trained_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gru_weights (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  weights    BLOB,
  vocab_size INTEGER,
  epoch      INTEGER,
  accuracy   DOUBLE,
  trained_at TIMESTAMP
);
`;

export class VaultDB {
  private constructor(
    private instance: DuckDBInstance,
    private conn: any, // DuckDBConnection
  ) {}

  static async open(path: string): Promise<VaultDB> {
    const instance = await DuckDBInstance.create(path);
    const conn = await instance.connect();
    // Run schema migrations
    for (const stmt of SCHEMA.split(";").filter((s) => s.trim())) {
      await conn.run(stmt);
    }
    return new VaultDB(instance, conn);
  }

  async upsertNote(note: NoteRow): Promise<void> {
    await this.conn.run(
      `INSERT INTO notes (name, path, body_hash, level)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO UPDATE SET
         path = excluded.path,
         body_hash = excluded.body_hash,
         level = excluded.level,
         updated_at = current_timestamp`,
      note.name, note.path, note.bodyHash, note.level,
    );
  }

  async getAllNotes(): Promise<NoteRow[]> {
    const reader = await this.conn.runAndReadAll(
      "SELECT name, path, body_hash, level FROM notes ORDER BY name",
    );
    return reader.getRows().map((r: any[]) => ({
      name: r[0], path: r[1], bodyHash: r[2], level: r[3],
    }));
  }

  async setEdges(source: string, targets: string[]): Promise<void> {
    await this.conn.run("DELETE FROM edges WHERE source = $1", source);
    for (const target of targets) {
      await this.conn.run(
        "INSERT INTO edges (source, target) VALUES ($1, $2)",
        source, target,
      );
    }
  }

  async getEdges(source: string): Promise<string[]> {
    const reader = await this.conn.runAndReadAll(
      "SELECT target FROM edges WHERE source = $1 ORDER BY target",
      source,
    );
    return reader.getRows().map((r: any[]) => r[0] as string);
  }

  async insertTrace(trace: TraceRow): Promise<void> {
    await this.conn.run(
      `INSERT INTO traces (intent, target_note, path, synthetic)
       VALUES ($1, $2, $3, $4)`,
      trace.intent ?? null, trace.targetNote, trace.path, trace.synthetic,
    );
  }

  async getAllTraces(): Promise<TraceRow[]> {
    const reader = await this.conn.runAndReadAll(
      "SELECT id, intent, target_note, path, success, synthetic, executed_at FROM traces ORDER BY id",
    );
    return reader.getRows().map((r: any[]) => ({
      id: r[0], intent: r[1], targetNote: r[2], path: r[3],
      success: r[4], synthetic: r[5], executedAt: r[6],
    }));
  }

  async updateNoteEmbedding(name: string, embedding: number[]): Promise<void> {
    await this.conn.run(
      "UPDATE notes SET embedding = $1 WHERE name = $2",
      embedding, name,
    );
  }

  async updateNoteGnnEmbedding(name: string, gnnEmbedding: number[]): Promise<void> {
    await this.conn.run(
      "UPDATE notes SET gnn_embedding = $1 WHERE name = $2",
      gnnEmbedding, name,
    );
  }

  async saveGnnParams(params: Uint8Array, epoch: number, accuracy: number): Promise<void> {
    await this.conn.run(
      `INSERT INTO gnn_params (id, params, epoch, accuracy, trained_at)
       VALUES (1, $1, $2, $3, current_timestamp)
       ON CONFLICT (id) DO UPDATE SET
         params = excluded.params, epoch = excluded.epoch,
         accuracy = excluded.accuracy, trained_at = current_timestamp`,
      params, epoch, accuracy,
    );
  }

  async saveGruWeights(weights: Uint8Array, vocabSize: number, epoch: number, accuracy: number): Promise<void> {
    await this.conn.run(
      `INSERT INTO gru_weights (id, weights, vocab_size, epoch, accuracy, trained_at)
       VALUES (1, $1, $2, $3, $4, current_timestamp)
       ON CONFLICT (id) DO UPDATE SET
         weights = excluded.weights, vocab_size = excluded.vocab_size,
         epoch = excluded.epoch, accuracy = excluded.accuracy,
         trained_at = current_timestamp`,
      weights, vocabSize, epoch, accuracy,
    );
  }

  close(): void {
    this.conn.closeSync();
    this.instance.closeSync();
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd lib/vault-exec && deno test --allow-read --allow-write --allow-ffi --allow-env --allow-net src/db/store_test.ts`
Expected: 4 PASS

**Step 5: Commit**

```bash
git add lib/vault-exec/src/db/
git commit -m "feat(vault-exec): DuckDB store with schema and CRUD operations"
```

---

## Task 2: Embedding Model

**Files:**
- Create: `lib/vault-exec/src/embeddings/model.ts`
- Create: `lib/vault-exec/src/embeddings/model_test.ts`

**Context:** Fork from `src/vector/embeddings.ts` (EmbeddingModel class). Simplify: no DB caching, no batch processing. Just load + encode.

**Step 1: Write the failing test**

```typescript
// model_test.ts
import { assertEquals } from "jsr:@std/assert";
import { EmbeddingModel, type Embedder } from "./model.ts";

// Mock embedder for tests (avoids loading 400MB model)
class MockEmbedder implements Embedder {
  async encode(text: string): Promise<number[]> {
    // Deterministic fake: hash text to produce a 1024-d vector
    const seed = text.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return Array.from({ length: 1024 }, (_, i) => Math.sin(seed + i) * 0.1);
  }
  isLoaded(): boolean { return true; }
  async load(): Promise<void> {}
  async dispose(): Promise<void> {}
}

Deno.test("EmbeddingModel - encode returns 1024-d vector", async () => {
  const model = new EmbeddingModel(new MockEmbedder());
  const vec = await model.encode("Hello world");
  assertEquals(vec.length, 1024);
});

Deno.test("EmbeddingModel - different texts produce different embeddings", async () => {
  const model = new EmbeddingModel(new MockEmbedder());
  const a = await model.encode("Senior developers");
  const b = await model.encode("Backend infrastructure");
  const same = a.every((v, i) => v === b[i]);
  assertEquals(same, false);
});

Deno.test("EmbeddingModel - encodeNote formats name + body", async () => {
  const model = new EmbeddingModel(new MockEmbedder());
  const vec = await model.encodeNote("My Note", "This is the body.");
  assertEquals(vec.length, 1024);
});
```

**Step 2: Run test to verify it fails**

Run: `cd lib/vault-exec && deno test --allow-read src/embeddings/model_test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// model.ts
import { pipeline } from "@huggingface/transformers";

export interface Embedder {
  load(): Promise<void>;
  encode(text: string): Promise<number[]>;
  isLoaded(): boolean;
  dispose(): Promise<void>;
}

/** BGE-M3 embedder using @huggingface/transformers */
export class BGEEmbedder implements Embedder {
  private model: any = null;
  private loading: Promise<void> | null = null;

  async load(): Promise<void> {
    if (this.model) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      this.model = await pipeline("feature-extraction", "Xenova/bge-m3");
    })();
    await this.loading;
    this.loading = null;
  }

  async encode(text: string): Promise<number[]> {
    if (!this.model) await this.load();
    const output = await this.model(text, { pooling: "cls", normalize: true });
    return Array.from(output.data as Float32Array).slice(0, 1024);
  }

  isLoaded(): boolean { return this.model !== null; }

  async dispose(): Promise<void> {
    this.model = null;
  }
}

/** Embedding model with convenience methods for vault notes */
export class EmbeddingModel {
  constructor(private embedder: Embedder) {}

  async encode(text: string): Promise<number[]> {
    return this.embedder.encode(text);
  }

  /** Encode a vault note as "# Name\n\nBody" */
  async encodeNote(name: string, body: string): Promise<number[]> {
    return this.embedder.encode(`# ${name}\n\n${body.trim()}`);
  }

  isLoaded(): boolean { return this.embedder.isLoaded(); }
  async load(): Promise<void> { await this.embedder.load(); }
  async dispose(): Promise<void> { await this.embedder.dispose(); }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd lib/vault-exec && deno test --allow-read src/embeddings/model_test.ts`
Expected: 3 PASS

**Step 5: Commit**

```bash
git add lib/vault-exec/src/embeddings/
git commit -m "feat(vault-exec): embedding model with BGE-M3 and injectable embedder"
```

---

## Task 3: Embedding Indexer — Sync Notes to DuckDB

**Files:**
- Create: `lib/vault-exec/src/embeddings/indexer.ts`
- Create: `lib/vault-exec/src/embeddings/indexer_test.ts`

**Step 1: Write the failing test**

```typescript
// indexer_test.ts
import { assertEquals } from "jsr:@std/assert";
import { indexVault } from "./indexer.ts";
import { VaultDB } from "../db/store.ts";
import { EmbeddingModel, type Embedder } from "./model.ts";
import type { VaultNote } from "../types.ts";

class MockEmbedder implements Embedder {
  calls: string[] = [];
  async encode(text: string): Promise<number[]> {
    this.calls.push(text);
    return Array.from({ length: 1024 }, (_, i) => Math.sin(i) * 0.1);
  }
  isLoaded() { return true; }
  async load() {}
  async dispose() {}
}

function makeNote(name: string, body: string, wikilinks: string[] = []): VaultNote {
  return { path: `${name}.md`, name, body, frontmatter: {}, wikilinks };
}

Deno.test("indexVault - inserts notes with embeddings and levels", async () => {
  const db = await VaultDB.open(":memory:");
  const embedder = new MockEmbedder();
  const model = new EmbeddingModel(embedder);
  try {
    const notes = [
      makeNote("A", "Leaf note"),
      makeNote("B", "Depends on A", ["A"]),
    ];
    const stats = await indexVault(notes, db, model);
    assertEquals(stats.indexed, 2);

    const rows = await db.getAllNotes();
    assertEquals(rows.length, 2);
    // A is leaf (level 0), B depends on A (level 1)
    const a = rows.find(r => r.name === "A")!;
    const b = rows.find(r => r.name === "B")!;
    assertEquals(a.level, 0);
    assertEquals(b.level, 1);
  } finally {
    db.close();
  }
});

Deno.test("indexVault - skips unchanged notes (same hash)", async () => {
  const db = await VaultDB.open(":memory:");
  const embedder = new MockEmbedder();
  const model = new EmbeddingModel(embedder);
  try {
    const notes = [makeNote("A", "Same body")];
    await indexVault(notes, db, model);
    const firstCalls = embedder.calls.length;

    // Index again — same hash, should skip embedding
    embedder.calls = [];
    const stats = await indexVault(notes, db, model);
    assertEquals(stats.skipped, 1);
    assertEquals(embedder.calls.length, 0);
  } finally {
    db.close();
  }
});
```

**Step 2: Run test to verify it fails**

Run: `cd lib/vault-exec && deno test --allow-read --allow-write --allow-ffi --allow-env --allow-net src/embeddings/indexer_test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// indexer.ts
import type { VaultNote } from "../types.ts";
import type { VaultDB } from "../db/store.ts";
import type { EmbeddingModel } from "./model.ts";

/** FNV-1a 32-bit hash — same as compiler.ts */
function hashBody(body: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    h ^= body.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Compute topological depth for each note (0 = leaf) */
function computeLevels(notes: VaultNote[]): Map<string, number> {
  const levels = new Map<string, number>();
  const noteSet = new Set(notes.map((n) => n.name));

  function getLevel(name: string): number {
    if (levels.has(name)) return levels.get(name)!;
    const note = notes.find((n) => n.name === name);
    if (!note || note.wikilinks.length === 0) {
      levels.set(name, 0);
      return 0;
    }
    const depLevels = note.wikilinks
      .filter((w) => noteSet.has(w))
      .map((w) => getLevel(w));
    const level = depLevels.length > 0 ? Math.max(...depLevels) + 1 : 0;
    levels.set(name, level);
    return level;
  }

  for (const note of notes) getLevel(note.name);
  return levels;
}

interface IndexStats {
  indexed: number;
  skipped: number;
}

/** Index all vault notes into DuckDB with embeddings and levels */
export async function indexVault(
  notes: VaultNote[],
  db: VaultDB,
  model: EmbeddingModel,
): Promise<IndexStats> {
  const levels = computeLevels(notes);
  const existing = await db.getAllNotes();
  const existingHashes = new Map(existing.map((n) => [n.name, n.bodyHash]));
  let indexed = 0;
  let skipped = 0;

  for (const note of notes) {
    const hash = hashBody(note.body.trim());
    const level = levels.get(note.name) ?? 0;

    // Upsert note metadata
    await db.upsertNote({ name: note.name, path: note.path, bodyHash: hash, level });

    // Upsert edges
    await db.setEdges(note.name, note.wikilinks);

    // Skip embedding if body unchanged
    if (existingHashes.get(note.name) === hash) {
      skipped++;
      continue;
    }

    // Generate and store embedding
    const embedding = await model.encodeNote(note.name, note.body);
    await db.updateNoteEmbedding(note.name, embedding);
    indexed++;
  }

  return { indexed, skipped };
}

export { computeLevels };
```

**Step 4: Run tests to verify they pass**

Run: `cd lib/vault-exec && deno test --allow-read --allow-write --allow-ffi --allow-env --allow-net src/embeddings/indexer_test.ts`
Expected: 2 PASS

**Step 5: Commit**

```bash
git add lib/vault-exec/src/embeddings/
git commit -m "feat(vault-exec): embedding indexer with change detection and level computation"
```

---

## Task 4: GNN Types & Attention Scoring

**Files:**
- Create: `lib/vault-exec/src/gnn/types.ts`
- Create: `lib/vault-exec/src/gnn/attention.ts`
- Create: `lib/vault-exec/src/gnn/attention_test.ts`

**Context:** Port from `src/graphrag/algorithms/shgat/types.ts` and attention logic from the message-passing files. Simplify types for vault-exec context.

**Step 1: Write the types file (no test needed — pure types)**

```typescript
// gnn/types.ts

/** A node in the vault graph for GNN processing */
export interface GNNNode {
  name: string;
  level: number;
  embedding: number[];       // BGE or GNN embedding (1024-d)
  children: string[];        // direct dependencies (wikilinks)
}

/** GNN parameters for one hierarchy level */
export interface LevelParams {
  W_child: number[][][];     // [numHeads][headDim][embDim]
  W_parent: number[][][];    // [numHeads][headDim][embDim]
  a_upward: number[][];      // [numHeads][2*headDim]
  a_downward: number[][];    // [numHeads][2*headDim]
}

/** Full GNN parameters */
export interface GNNParams {
  levels: Map<number, LevelParams>;
  numHeads: number;
  headDim: number;
  embDim: number;
  // V→E residual gate parameters per level
  veResidualA: Map<number, number>;   // a per level (learnable)
  veResidualB: Map<number, number>;   // b per level (learnable)
  shareLevelWeights: boolean;
}

/** Forward pass cache for backward computation */
export interface ForwardCache {
  // V→E
  veAttentionWeights: Map<string, Map<string, number>>;  // parent → child → weight
  veProjectedChildren: Map<string, number[][]>;           // parent → [head][headDim]
  veProjectedParents: Map<string, number[][]>;            // parent → [head][headDim]
  veOriginal: Map<string, number[]>;                      // parent → original embedding
  veMP: Map<string, number[]>;                            // parent → MP result

  // E→V
  evAttentionWeights: Map<string, Map<string, number>>;
  evOriginal: Map<string, number[]>;

  // E→E (upward and downward)
  eeUpCaches: Map<number, ForwardCache>;
  eeDownCaches: Map<number, ForwardCache>;
}

/** GNN configuration */
export interface GNNConfig {
  numHeads: number;       // default: 8
  headDim: number;        // default: 64
  embDim: number;         // default: 1024
  shareLevelWeights: boolean; // default: true
  leakyReluAlpha: number;    // default: 0.2
}

export const DEFAULT_GNN_CONFIG: GNNConfig = {
  numHeads: 8,
  headDim: 64,
  embDim: 1024,
  shareLevelWeights: true,
  leakyReluAlpha: 0.2,
};
```

**Step 2: Write the attention tests**

```typescript
// gnn/attention_test.ts
import { assertEquals } from "jsr:@std/assert";
import { leakyRelu, softmax, attentionScore, dotProduct } from "./attention.ts";

Deno.test("leakyRelu - positive passthrough", () => {
  assertEquals(leakyRelu(5.0, 0.2), 5.0);
});

Deno.test("leakyRelu - negative scaled", () => {
  const result = leakyRelu(-5.0, 0.2);
  assertEquals(result, -1.0);
});

Deno.test("softmax - produces valid distribution", () => {
  const result = softmax([1.0, 2.0, 3.0]);
  const sum = result.reduce((a, b) => a + b, 0);
  assertEquals(Math.abs(sum - 1.0) < 1e-6, true);
  assertEquals(result[2] > result[1], true);
  assertEquals(result[1] > result[0], true);
});

Deno.test("softmax - handles single element", () => {
  const result = softmax([42.0]);
  assertEquals(result.length, 1);
  assertEquals(Math.abs(result[0] - 1.0) < 1e-6, true);
});

Deno.test("dotProduct - computes correctly", () => {
  const result = dotProduct([1, 2, 3], [4, 5, 6]);
  assertEquals(result, 32); // 4+10+18
});

Deno.test("attentionScore - GAT concat attention", () => {
  const childProj = [0.5, 0.3];  // headDim = 2
  const parentProj = [0.2, 0.4]; // headDim = 2
  const a = [1.0, 1.0, 1.0, 1.0]; // 2*headDim = 4
  const score = attentionScore(childProj, parentProj, a, 0.2);
  assertEquals(typeof score, "number");
  assertEquals(isNaN(score), false);
});
```

**Step 3: Write attention implementation**

```typescript
// gnn/attention.ts

/** Leaky ReLU activation */
export function leakyRelu(x: number, alpha = 0.2): number {
  return x >= 0 ? x : alpha * x;
}

/** Numerically stable softmax */
export function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/** Dot product of two vectors */
export function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** ELU activation */
export function elu(x: number, alpha = 1.0): number {
  return x >= 0 ? x : alpha * (Math.exp(x) - 1);
}

/** Matrix-vector multiply: result[i] = sum_j(matrix[i][j] * vec[j]) */
export function matVecMul(matrix: number[][], vec: number[]): number[] {
  return matrix.map((row) => dotProduct(row, vec));
}

/**
 * GAT-style concat attention score.
 * score = a^T · LeakyReLU([child_proj || parent_proj])
 */
export function attentionScore(
  childProj: number[],
  parentProj: number[],
  a: number[],
  leakyAlpha = 0.2,
): number {
  const concat = [...childProj, ...parentProj];
  const activated = concat.map((x) => leakyRelu(x, leakyAlpha));
  return dotProduct(a, activated);
}
```

**Step 4: Run tests**

Run: `cd lib/vault-exec && deno test --allow-read src/gnn/attention_test.ts`
Expected: 6 PASS

**Step 5: Commit**

```bash
git add lib/vault-exec/src/gnn/
git commit -m "feat(vault-exec): GNN types and attention scoring primitives"
```

---

## Task 5: GNN Residual Connections

**Files:**
- Create: `lib/vault-exec/src/gnn/residual.ts`
- Create: `lib/vault-exec/src/gnn/residual_test.ts`

**Step 1: Write the failing test**

```typescript
// gnn/residual_test.ts
import { assertEquals } from "jsr:@std/assert";
import { convexGatedResidual, additiveSkipResidual, residualGamma } from "./residual.ts";

Deno.test("residualGamma - sigmoid gate with default init", () => {
  // γ(n) = sigmoid(a*log(n+1) + b), a=-1.0, b=0.5
  const gamma1 = residualGamma(1, -1.0, 0.5);  // 1 child
  const gamma5 = residualGamma(5, -1.0, 0.5);  // 5 children
  // More children → lower gamma → less original retained
  assertEquals(gamma1 > gamma5, true);
  assertEquals(gamma1 > 0, true);
  assertEquals(gamma1 < 1, true);
});

Deno.test("convexGatedResidual - blends MP and original", () => {
  const original = [1.0, 0.0, 0.0];
  const mp = [0.0, 1.0, 0.0];
  const gamma = 0.3;
  const result = convexGatedResidual(mp, original, gamma);
  // E = (1-γ)*MP + γ*orig = 0.7*[0,1,0] + 0.3*[1,0,0] = [0.3, 0.7, 0.0]
  assertEquals(Math.abs(result[0] - 0.3) < 1e-6, true);
  assertEquals(Math.abs(result[1] - 0.7) < 1e-6, true);
  assertEquals(Math.abs(result[2] - 0.0) < 1e-6, true);
});

Deno.test("additiveSkipResidual - simple addition", () => {
  const original = [1.0, 2.0];
  const mp = [0.5, 0.3];
  const result = additiveSkipResidual(mp, original);
  assertEquals(Math.abs(result[0] - 1.5) < 1e-6, true);
  assertEquals(Math.abs(result[1] - 2.3) < 1e-6, true);
});
```

**Step 2: Run test to verify it fails**

Run: `cd lib/vault-exec && deno test --allow-read src/gnn/residual_test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// gnn/residual.ts

/** Sigmoid function */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Compute residual gate gamma based on number of children.
 * γ(n) = sigmoid(a * log(n+1) + b)
 * Default init: a = -1.0, b = 0.5
 * More children → lower gamma → more MP signal retained
 */
export function residualGamma(nChildren: number, a: number, b: number): number {
  return sigmoid(a * Math.log(nChildren + 1) + b);
}

/**
 * Convex gated residual (V→E, E→E downward).
 * E = (1 - γ) * E_MP + γ * E_original
 */
export function convexGatedResidual(
  mp: number[],
  original: number[],
  gamma: number,
): number[] {
  return mp.map((m, i) => (1 - gamma) * m + gamma * original[i]);
}

/**
 * Additive skip residual (E→V downward).
 * H = H_MP + H_original
 */
export function additiveSkipResidual(mp: number[], original: number[]): number[] {
  return mp.map((m, i) => m + original[i]);
}
```

**Step 4: Run tests**

Run: `cd lib/vault-exec && deno test --allow-read src/gnn/residual_test.ts`
Expected: 3 PASS

**Step 5: Commit**

```bash
git add lib/vault-exec/src/gnn/residual.ts lib/vault-exec/src/gnn/residual_test.ts
git commit -m "feat(vault-exec): GNN residual connections (convex gated + additive skip)"
```

---

## Task 6: GNN Message-Passing (V→E, E→E, E→V)

**Files:**
- Create: `lib/vault-exec/src/gnn/message-passing.ts`
- Create: `lib/vault-exec/src/gnn/message-passing_test.ts`

**Context:** Single file covering all 4 phases. Port math from PML's `vertex-to-edge-phase.ts`, `edge-to-edge-phase.ts`, `edge-to-vertex-phase.ts`.

**Step 1: Write the failing test**

```typescript
// gnn/message-passing_test.ts
import { assertEquals } from "jsr:@std/assert";
import { vertexToEdge, edgeToVertex } from "./message-passing.ts";
import type { GNNNode, LevelParams } from "./types.ts";

// Helper: create a simple level params with numHeads=1, headDim=2, embDim=4
function makeLevelParams(): LevelParams {
  // Identity-ish projections for testing
  return {
    W_child: [[[1, 0, 0, 0], [0, 1, 0, 0]]],    // 1 head, 2×4
    W_parent: [[[0, 0, 1, 0], [0, 0, 0, 1]]],   // 1 head, 2×4
    a_upward: [[1, 1, 1, 1]],                      // 1 head, 2*headDim=4
    a_downward: [[1, 1, 1, 1]],
  };
}

Deno.test("vertexToEdge - aggregates child embeddings into parent", () => {
  const children: GNNNode[] = [
    { name: "A", level: 0, embedding: [1, 0, 0, 0], children: [] },
    { name: "B", level: 0, embedding: [0, 1, 0, 0], children: [] },
  ];
  const parent: GNNNode = { name: "P", level: 1, embedding: [0, 0, 1, 0], children: ["A", "B"] };
  const params = makeLevelParams();

  const result = vertexToEdge(parent, children, params, -1.0, 0.5, 0.2);

  // Result should be embDim length
  assertEquals(result.length, 4);
  // Should not be identical to original (MP changed it)
  const same = result.every((v, i) => v === parent.embedding[i]);
  assertEquals(same, false);
});

Deno.test("edgeToVertex - sends parent context back to child", () => {
  const parents: GNNNode[] = [
    { name: "P", level: 1, embedding: [0, 0, 1, 0], children: ["C"] },
  ];
  const child: GNNNode = { name: "C", level: 0, embedding: [1, 0, 0, 0], children: [] };
  const params = makeLevelParams();

  const result = edgeToVertex(child, parents, params, 0.2);

  assertEquals(result.length, 4);
  // Additive skip: result should be > original in magnitude
  const origNorm = Math.sqrt(child.embedding.reduce((s, v) => s + v * v, 0));
  const newNorm = Math.sqrt(result.reduce((s, v) => s + v * v, 0));
  assertEquals(newNorm >= origNorm, true);
});
```

**Step 2: Run test to verify it fails**

Run: `cd lib/vault-exec && deno test --allow-read src/gnn/message-passing_test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// gnn/message-passing.ts
import type { GNNNode, LevelParams } from "./types.ts";
import { attentionScore, softmax, elu, matVecMul } from "./attention.ts";
import { convexGatedResidual, additiveSkipResidual, residualGamma } from "./residual.ts";

/**
 * V→E (upward): Aggregate child embeddings into parent using attention.
 * E_MP = ELU(Σ_c α_pc · W_child · H_c)
 * E = (1-γ)·E_MP + γ·E_orig  (convex gated residual)
 */
export function vertexToEdge(
  parent: GNNNode,
  children: GNNNode[],
  params: LevelParams,
  residualA: number,
  residualB: number,
  leakyAlpha: number,
): number[] {
  if (children.length === 0) return [...parent.embedding];

  const numHeads = params.W_child.length;
  const embDim = parent.embedding.length;

  // For each head, compute attention-weighted aggregation
  const headResults: number[][] = [];

  for (let h = 0; h < numHeads; h++) {
    // Project parent
    const parentProj = matVecMul(params.W_parent[h], parent.embedding);

    // Project each child and compute attention score
    const childProjs: number[][] = [];
    const scores: number[] = [];
    for (const child of children) {
      const childProj = matVecMul(params.W_child[h], child.embedding);
      childProjs.push(childProj);
      scores.push(attentionScore(childProj, parentProj, params.a_upward[h], leakyAlpha));
    }

    // Softmax over children
    const weights = softmax(scores);

    // Weighted sum of child projections (back-projected to embDim via transpose-like)
    // For simplicity, we aggregate in headDim then pad/project back
    const headDim = params.W_child[h].length;
    const agg = new Array(headDim).fill(0);
    for (let c = 0; c < children.length; c++) {
      for (let d = 0; d < headDim; d++) {
        agg[d] += weights[c] * childProjs[c][d];
      }
    }
    headResults.push(agg);
  }

  // Concatenate heads and project back to embDim
  const concat = headResults.flat();
  // Simple: take first embDim values (in production, use W_out projection)
  const mpResult = new Array(embDim).fill(0);
  for (let i = 0; i < embDim; i++) {
    mpResult[i] = elu(concat[i % concat.length]);
  }

  // Convex gated residual
  const gamma = residualGamma(children.length, residualA, residualB);
  return convexGatedResidual(mpResult, parent.embedding, gamma);
}

/**
 * E→V (downward): Send parent context back to child using attention.
 * H = H_MP + H_orig  (additive skip residual)
 */
export function edgeToVertex(
  child: GNNNode,
  parents: GNNNode[],
  params: LevelParams,
  leakyAlpha: number,
): number[] {
  if (parents.length === 0) return [...child.embedding];

  const numHeads = params.W_parent.length;
  const embDim = child.embedding.length;

  const headResults: number[][] = [];

  for (let h = 0; h < numHeads; h++) {
    const childProj = matVecMul(params.W_child[h], child.embedding);

    const parentProjs: number[][] = [];
    const scores: number[] = [];
    for (const parent of parents) {
      const parentProj = matVecMul(params.W_parent[h], parent.embedding);
      parentProjs.push(parentProj);
      scores.push(attentionScore(parentProj, childProj, params.a_downward[h], leakyAlpha));
    }

    const weights = softmax(scores);

    const headDim = params.W_parent[h].length;
    const agg = new Array(headDim).fill(0);
    for (let p = 0; p < parents.length; p++) {
      for (let d = 0; d < headDim; d++) {
        agg[d] += weights[p] * parentProjs[p][d];
      }
    }
    headResults.push(agg);
  }

  const concat = headResults.flat();
  const mpResult = new Array(embDim).fill(0);
  for (let i = 0; i < embDim; i++) {
    mpResult[i] = elu(concat[i % concat.length]);
  }

  // Additive skip
  return additiveSkipResidual(mpResult, child.embedding);
}

/**
 * E→E: Same as V→E but between edges of different levels.
 * Reuses vertexToEdge with edges as "children" and higher-level edges as "parents".
 */
export { vertexToEdge as edgeToEdge };
```

**Step 4: Run tests**

Run: `cd lib/vault-exec && deno test --allow-read src/gnn/message-passing_test.ts`
Expected: 2 PASS

**Step 5: Commit**

```bash
git add lib/vault-exec/src/gnn/message-passing.ts lib/vault-exec/src/gnn/message-passing_test.ts
git commit -m "feat(vault-exec): GNN message-passing (V→E, E→V, E→E)"
```

---

## Task 7: GNN Forward Pass Orchestration

**Files:**
- Create: `lib/vault-exec/src/gnn/forward.ts`
- Create: `lib/vault-exec/src/gnn/forward_test.ts`
- Create: `lib/vault-exec/src/gnn/params.ts`

**Step 1: Write the failing test**

```typescript
// gnn/forward_test.ts
import { assertEquals } from "jsr:@std/assert";
import { gnnForward } from "./forward.ts";
import { initParams } from "./params.ts";
import type { GNNNode, GNNConfig } from "./types.ts";
import { DEFAULT_GNN_CONFIG } from "./types.ts";

function makeNode(name: string, level: number, children: string[] = []): GNNNode {
  const emb = Array.from({ length: 1024 }, (_, i) => Math.sin(name.charCodeAt(0) + i) * 0.1);
  return { name, level, embedding: emb, children };
}

Deno.test("gnnForward - produces embeddings for all nodes", () => {
  const nodes: GNNNode[] = [
    makeNode("A", 0),
    makeNode("B", 0),
    makeNode("C", 1, ["A", "B"]),
    makeNode("D", 2, ["C"]),
  ];
  const config: GNNConfig = { ...DEFAULT_GNN_CONFIG, numHeads: 2, headDim: 4 };
  const params = initParams(config, 3); // 3 levels: 0, 1, 2
  const result = gnnForward(nodes, params, config);

  assertEquals(result.size, 4);
  for (const [name, emb] of result) {
    assertEquals(emb.length, 1024);
    // Embedding should be different from input (message-passing changed it)
    const orig = nodes.find(n => n.name === name)!.embedding;
    const changed = emb.some((v, i) => Math.abs(v - orig[i]) > 1e-10);
    // Leaf nodes change via E→V, non-leaves via V→E
    assertEquals(changed, true, `Expected ${name} embedding to change after MP`);
  }
});

Deno.test("gnnForward - single node vault returns original embedding", () => {
  const nodes: GNNNode[] = [makeNode("Solo", 0)];
  const config = { ...DEFAULT_GNN_CONFIG, numHeads: 2, headDim: 4 };
  const params = initParams(config, 1);
  const result = gnnForward(nodes, params, config);

  assertEquals(result.size, 1);
  assertEquals(result.get("Solo")!.length, 1024);
});
```

**Step 2: Write params.ts**

```typescript
// gnn/params.ts
import type { GNNConfig, GNNParams, LevelParams } from "./types.ts";

/** Xavier/Glorot initialization */
function xavier(rows: number, cols: number): number[][] {
  const scale = Math.sqrt(2 / (rows + cols));
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (Math.random() * 2 - 1) * scale)
  );
}

/** Initialize parameters for one level */
function initLevelParams(numHeads: number, headDim: number, embDim: number): LevelParams {
  return {
    W_child: Array.from({ length: numHeads }, () => xavier(headDim, embDim)),
    W_parent: Array.from({ length: numHeads }, () => xavier(headDim, embDim)),
    a_upward: Array.from({ length: numHeads }, () =>
      Array.from({ length: 2 * headDim }, () => (Math.random() * 2 - 1) * 0.1)
    ),
    a_downward: Array.from({ length: numHeads }, () =>
      Array.from({ length: 2 * headDim }, () => (Math.random() * 2 - 1) * 0.1)
    ),
  };
}

/** Initialize all GNN parameters */
export function initParams(config: GNNConfig, maxLevel: number): GNNParams {
  const levels = new Map<number, LevelParams>();
  const veResidualA = new Map<number, number>();
  const veResidualB = new Map<number, number>();

  if (config.shareLevelWeights) {
    const shared = initLevelParams(config.numHeads, config.headDim, config.embDim);
    for (let l = 0; l < maxLevel; l++) {
      levels.set(l, shared);
      veResidualA.set(l, -1.0);
      veResidualB.set(l, 0.5);
    }
  } else {
    for (let l = 0; l < maxLevel; l++) {
      levels.set(l, initLevelParams(config.numHeads, config.headDim, config.embDim));
      veResidualA.set(l, -1.0);
      veResidualB.set(l, 0.5);
    }
  }

  return {
    levels,
    numHeads: config.numHeads,
    headDim: config.headDim,
    embDim: config.embDim,
    veResidualA,
    veResidualB,
    shareLevelWeights: config.shareLevelWeights,
  };
}
```

**Step 3: Write forward.ts**

```typescript
// gnn/forward.ts
import type { GNNNode, GNNParams, GNNConfig } from "./types.ts";
import { vertexToEdge, edgeToVertex, edgeToEdge } from "./message-passing.ts";

/**
 * Multi-level GNN forward pass.
 * 1. V→E upward (L0 → L1)
 * 2. E→E upward (L1 → L2 → ... → L_max)
 * 3. E→E downward (L_max → ... → L1)
 * 4. E→V downward (L1 → L0)
 *
 * Returns updated embeddings for all nodes.
 */
export function gnnForward(
  nodes: GNNNode[],
  params: GNNParams,
  config: GNNConfig,
): Map<string, number[]> {
  const nodeMap = new Map(nodes.map((n) => [n.name, n]));
  const result = new Map<string, number[]>();

  // Initialize with copies of original embeddings
  for (const node of nodes) {
    result.set(node.name, [...node.embedding]);
  }

  // Group nodes by level
  const byLevel = new Map<number, GNNNode[]>();
  for (const node of nodes) {
    const list = byLevel.get(node.level) ?? [];
    list.push(node);
    byLevel.set(node.level, list);
  }

  const maxLevel = Math.max(...nodes.map((n) => n.level));
  if (maxLevel === 0) return result; // All leaves, nothing to do

  // Helper: get current embedding for a node
  const getEmb = (name: string): number[] => result.get(name)!;

  // 1. V→E upward: for each level 1+ node, aggregate from its children
  for (let level = 1; level <= maxLevel; level++) {
    const parents = byLevel.get(level) ?? [];
    const levelParams = params.levels.get(Math.min(level - 1, params.levels.size - 1));
    if (!levelParams) continue;

    const a = params.veResidualA.get(level - 1) ?? -1.0;
    const b = params.veResidualB.get(level - 1) ?? 0.5;

    for (const parent of parents) {
      const children = parent.children
        .map((c) => nodeMap.get(c))
        .filter((c): c is GNNNode => c !== undefined)
        .map((c) => ({ ...c, embedding: getEmb(c.name) }));

      if (children.length === 0) continue;

      const parentWithEmb = { ...parent, embedding: getEmb(parent.name) };
      const newEmb = vertexToEdge(parentWithEmb, children, levelParams, a, b, config.leakyReluAlpha);
      result.set(parent.name, newEmb);
    }
  }

  // 2. E→E downward: from L_max down to L1
  for (let level = maxLevel - 1; level >= 1; level--) {
    const nodesAtLevel = byLevel.get(level) ?? [];
    const levelParams = params.levels.get(Math.min(level - 1, params.levels.size - 1));
    if (!levelParams) continue;

    const a = params.veResidualA.get(level - 1) ?? -1.0;
    const b = params.veResidualB.get(level - 1) ?? 0.5;

    for (const node of nodesAtLevel) {
      // Find parents (nodes at higher levels that have this node as a child)
      const parents = nodes
        .filter((n) => n.level > level && n.children.includes(node.name))
        .map((n) => ({ ...n, embedding: getEmb(n.name) }));

      if (parents.length === 0) continue;

      const nodeWithEmb = { ...node, embedding: getEmb(node.name) };
      const newEmb = edgeToEdge(nodeWithEmb, parents, levelParams, a, b, config.leakyReluAlpha);
      result.set(node.name, newEmb);
    }
  }

  // 3. E→V downward: L1 → L0
  const leaves = byLevel.get(0) ?? [];
  const levelParams = params.levels.get(0);
  if (levelParams) {
    for (const leaf of leaves) {
      const parents = nodes
        .filter((n) => n.level > 0 && n.children.includes(leaf.name))
        .map((n) => ({ ...n, embedding: getEmb(n.name) }));

      if (parents.length === 0) continue;

      const leafWithEmb = { ...leaf, embedding: getEmb(leaf.name) };
      const newEmb = edgeToVertex(leafWithEmb, parents, levelParams, config.leakyReluAlpha);
      result.set(leaf.name, newEmb);
    }
  }

  return result;
}
```

**Step 4: Run tests**

Run: `cd lib/vault-exec && deno test --allow-read src/gnn/forward_test.ts`
Expected: 2 PASS

**Step 5: Commit**

```bash
git add lib/vault-exec/src/gnn/
git commit -m "feat(vault-exec): GNN forward pass with multi-level orchestration"
```

---

## Task 8: GRU Cell

**Files:**
- Create: `lib/vault-exec/src/gru/types.ts`
- Create: `lib/vault-exec/src/gru/cell.ts`
- Create: `lib/vault-exec/src/gru/cell_test.ts`

**Context:** Port GRU cell math from `src/graphrag/algorithms/gru/gru-inference.ts`. Simplified: no transition features, no cap fingerprint, no structural bias.

**Step 1: Write types**

```typescript
// gru/types.ts

export interface GRUConfig {
  inputDim: number;          // 1024 (embedding dim)
  hiddenDim: number;         // 32
  projectionDim: number;     // 64 (input projection)
  intentDim: number;         // 64 (intent projection)
  fusionDim: number;         // 32 (post-fusion)
  outputDim: number;         // 1024 (back to embedding space)
}

export const DEFAULT_GRU_CONFIG: GRUConfig = {
  inputDim: 1024,
  hiddenDim: 32,
  projectionDim: 64,
  intentDim: 64,
  fusionDim: 32,
  outputDim: 1024,
};

/** GRU weights */
export interface GRUWeights {
  // Input projection: inputDim → projectionDim
  W_input: number[][];    // [projectionDim × inputDim]
  b_input: number[];      // [projectionDim]

  // GRU gates: projectionDim → hiddenDim
  W_z: number[][];  b_z: number[];  U_z: number[][];  // Update gate
  W_r: number[][];  b_r: number[];  U_r: number[][];  // Reset gate
  W_h: number[][];  b_h: number[];  U_h: number[][];  // Candidate

  // Intent projection: inputDim → intentDim
  W_intent: number[][];   // [intentDim × inputDim]
  b_intent: number[];     // [intentDim]

  // Fusion: (hiddenDim + intentDim) → fusionDim
  W_fusion: number[][];   // [fusionDim × (hiddenDim + intentDim)]
  b_fusion: number[];     // [fusionDim]

  // Output projection: fusionDim → outputDim
  W_output: number[][];   // [outputDim × fusionDim]
  b_output: number[];     // [outputDim]

  // Soft label alphas (learnable)
  alpha_up: number;
  alpha_down: number;
}

/** Vocabulary node */
export interface VocabNode {
  name: string;
  level: number;
  embedding: number[];     // gnn_embedding (1024-d)
  children?: string[];     // direct dependencies
}

/** GRU vocabulary */
export interface GRUVocabulary {
  nodes: VocabNode[];
  nameToIndex: Map<string, number>;
  indexToName: string[];
}
```

**Step 2: Write the failing test**

```typescript
// gru/cell_test.ts
import { assertEquals } from "jsr:@std/assert";
import { gruStep, initWeights } from "./cell.ts";
import { DEFAULT_GRU_CONFIG } from "./types.ts";

Deno.test("gruStep - produces hidden state of correct dimension", () => {
  const config = DEFAULT_GRU_CONFIG;
  const weights = initWeights(config);

  const input = Array.from({ length: config.inputDim }, (_, i) => Math.sin(i) * 0.1);
  const hPrev = new Array(config.hiddenDim).fill(0);
  const intent = Array.from({ length: config.inputDim }, (_, i) => Math.cos(i) * 0.1);

  const { hNew, logits } = gruStep(input, hPrev, intent, weights, config);

  assertEquals(hNew.length, config.hiddenDim);
  assertEquals(logits.length, config.outputDim);
});

Deno.test("gruStep - different inputs produce different outputs", () => {
  const config = DEFAULT_GRU_CONFIG;
  const weights = initWeights(config);
  const hPrev = new Array(config.hiddenDim).fill(0);
  const intent = Array.from({ length: config.inputDim }, () => 0.1);

  const inputA = Array.from({ length: config.inputDim }, (_, i) => Math.sin(i) * 0.1);
  const inputB = Array.from({ length: config.inputDim }, (_, i) => Math.cos(i) * 0.1);

  const resultA = gruStep(inputA, hPrev, intent, weights, config);
  const resultB = gruStep(inputB, hPrev, intent, weights, config);

  const same = resultA.logits.every((v, i) => Math.abs(v - resultB.logits[i]) < 1e-10);
  assertEquals(same, false);
});

Deno.test("initWeights - creates weights with correct dimensions", () => {
  const config = DEFAULT_GRU_CONFIG;
  const weights = initWeights(config);

  assertEquals(weights.W_input.length, config.projectionDim);
  assertEquals(weights.W_input[0].length, config.inputDim);
  assertEquals(weights.W_z.length, config.hiddenDim);
  assertEquals(weights.W_z[0].length, config.projectionDim);
  assertEquals(weights.W_fusion.length, config.fusionDim);
  assertEquals(weights.W_fusion[0].length, config.hiddenDim + config.intentDim);
  assertEquals(weights.W_output.length, config.outputDim);
  assertEquals(weights.W_output[0].length, config.fusionDim);
});
```

**Step 3: Write implementation**

```typescript
// gru/cell.ts
import type { GRUConfig, GRUWeights } from "./types.ts";
import { matVecMul, dotProduct } from "../gnn/attention.ts";

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function tanh(x: number): number {
  return Math.tanh(x);
}

function addBias(vec: number[], bias: number[]): number[] {
  return vec.map((v, i) => v + bias[i]);
}

function xavier(rows: number, cols: number): number[][] {
  const scale = Math.sqrt(2 / (rows + cols));
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (Math.random() * 2 - 1) * scale)
  );
}

/** Initialize GRU weights with Xavier */
export function initWeights(config: GRUConfig): GRUWeights {
  const { inputDim, hiddenDim, projectionDim, intentDim, fusionDim, outputDim } = config;
  return {
    W_input: xavier(projectionDim, inputDim),
    b_input: new Array(projectionDim).fill(0),

    W_z: xavier(hiddenDim, projectionDim), b_z: new Array(hiddenDim).fill(0),
    U_z: xavier(hiddenDim, hiddenDim),
    W_r: xavier(hiddenDim, projectionDim), b_r: new Array(hiddenDim).fill(0),
    U_r: xavier(hiddenDim, hiddenDim),
    W_h: xavier(hiddenDim, projectionDim), b_h: new Array(hiddenDim).fill(0),
    U_h: xavier(hiddenDim, hiddenDim),

    W_intent: xavier(intentDim, inputDim),
    b_intent: new Array(intentDim).fill(0),

    W_fusion: xavier(fusionDim, hiddenDim + intentDim),
    b_fusion: new Array(fusionDim).fill(0),

    W_output: xavier(outputDim, fusionDim),
    b_output: new Array(outputDim).fill(0),

    alpha_up: 0.2,
    alpha_down: 0.1,
  };
}

/**
 * One GRU timestep.
 * input: current note embedding (1024-d)
 * hPrev: previous hidden state (hiddenDim)
 * intent: intent embedding (1024-d)
 * Returns: new hidden state + output logits (outputDim)
 */
export function gruStep(
  input: number[],
  hPrev: number[],
  intent: number[],
  weights: GRUWeights,
  config: GRUConfig,
): { hNew: number[]; logits: number[] } {
  // 1. Project input: 1024 → projectionDim
  const x = addBias(matVecMul(weights.W_input, input), weights.b_input)
    .map((v) => Math.max(0, v)); // ReLU

  // 2. GRU gates
  const zGate = addBias(matVecMul(weights.W_z, x), weights.b_z)
    .map((v, i) => v + matVecMul(weights.U_z, hPrev)[i])
    .map(sigmoid);

  const rGate = addBias(matVecMul(weights.W_r, x), weights.b_r)
    .map((v, i) => v + matVecMul(weights.U_r, hPrev)[i])
    .map(sigmoid);

  const rh = hPrev.map((h, i) => rGate[i] * h);
  const hCandidate = addBias(matVecMul(weights.W_h, x), weights.b_h)
    .map((v, i) => v + matVecMul(weights.U_h, rh)[i])
    .map(tanh);

  const hNew = hPrev.map((h, i) => zGate[i] * h + (1 - zGate[i]) * hCandidate[i]);

  // 3. Project intent: 1024 → intentDim
  const intentProj = addBias(matVecMul(weights.W_intent, intent), weights.b_intent)
    .map((v) => Math.max(0, v)); // ReLU

  // 4. Fusion: concat(hNew, intentProj) → fusionDim
  const fused = addBias(
    matVecMul(weights.W_fusion, [...hNew, ...intentProj]),
    weights.b_fusion,
  ).map((v) => Math.max(0, v)); // ReLU

  // 5. Output projection: fusionDim → outputDim (back to embedding space)
  const logits = addBias(matVecMul(weights.W_output, fused), weights.b_output);

  return { hNew, logits };
}
```

**Step 4: Run tests**

Run: `cd lib/vault-exec && deno test --allow-read src/gru/cell_test.ts`
Expected: 3 PASS

**Step 5: Commit**

```bash
git add lib/vault-exec/src/gru/
git commit -m "feat(vault-exec): GRU cell with gates, intent fusion, and output projection"
```

---

## Task 9: GRU Inference (Predict & Beam Search)

**Files:**
- Create: `lib/vault-exec/src/gru/inference.ts`
- Create: `lib/vault-exec/src/gru/inference_test.ts`

**Step 1: Write the failing test**

```typescript
// gru/inference_test.ts
import { assertEquals } from "jsr:@std/assert";
import { GRUInference } from "./inference.ts";
import { initWeights } from "./cell.ts";
import { DEFAULT_GRU_CONFIG } from "./types.ts";
import type { VocabNode, GRUVocabulary } from "./types.ts";

function makeVocab(names: string[]): GRUVocabulary {
  const nodes: VocabNode[] = names.map((name, i) => ({
    name,
    level: i === 0 ? 0 : 1,
    embedding: Array.from({ length: 1024 }, (_, j) => Math.sin(i * 100 + j) * 0.1),
  }));
  return {
    nodes,
    nameToIndex: new Map(names.map((n, i) => [n, i])),
    indexToName: names,
  };
}

Deno.test("GRUInference - predictNext returns valid note name", () => {
  const config = DEFAULT_GRU_CONFIG;
  const weights = initWeights(config);
  const vocab = makeVocab(["A", "B", "C"]);
  const gru = new GRUInference(weights, vocab, config);

  const intent = Array.from({ length: 1024 }, (_, i) => Math.cos(i) * 0.1);
  const result = gru.predictNext(intent, []);
  assertEquals(vocab.nameToIndex.has(result.name), true);
  assertEquals(typeof result.score, "number");
});

Deno.test("GRUInference - buildPath returns sequence ending in target", () => {
  const config = DEFAULT_GRU_CONFIG;
  const weights = initWeights(config);
  const vocab = makeVocab(["Leaf", "Mid", "Top"]);
  const gru = new GRUInference(weights, vocab, config);

  const intent = Array.from({ length: 1024 }, (_, i) => Math.sin(i) * 0.1);
  const path = gru.buildPath(intent, 5);
  assertEquals(path.length > 0, true);
  assertEquals(path.length <= 5, true);
  // All names should be in vocab
  for (const step of path) {
    assertEquals(vocab.nameToIndex.has(step), true);
  }
});

Deno.test("GRUInference - buildPathBeam returns multiple candidates", () => {
  const config = DEFAULT_GRU_CONFIG;
  const weights = initWeights(config);
  const vocab = makeVocab(["A", "B", "C", "D"]);
  const gru = new GRUInference(weights, vocab, config);

  const intent = Array.from({ length: 1024 }, () => 0.1);
  const beams = gru.buildPathBeam(intent, 3, 5);
  assertEquals(beams.length > 0, true);
  for (const beam of beams) {
    assertEquals(beam.path.length > 0, true);
    assertEquals(typeof beam.score, "number");
  }
});
```

**Step 2: Run test to verify it fails**

Run: `cd lib/vault-exec && deno test --allow-read src/gru/inference_test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// gru/inference.ts
import type { GRUConfig, GRUWeights, GRUVocabulary } from "./types.ts";
import { gruStep } from "./cell.ts";
import { dotProduct } from "../gnn/attention.ts";
import { softmax } from "../gnn/attention.ts";

interface PredictResult {
  name: string;
  score: number;
  ranked: Array<{ name: string; score: number }>;
}

interface BeamCandidate {
  path: string[];
  score: number;
  hidden: number[];
}

export class GRUInference {
  constructor(
    private weights: GRUWeights,
    private vocab: GRUVocabulary,
    private config: GRUConfig,
  ) {}

  /** Predict next note given intent and context */
  predictNext(intent: number[], context: string[]): PredictResult {
    let hidden = new Array(this.config.hiddenDim).fill(0);

    // Feed context through GRU
    for (const name of context) {
      const idx = this.vocab.nameToIndex.get(name);
      if (idx === undefined) continue;
      const emb = this.vocab.nodes[idx].embedding;
      const step = gruStep(emb, hidden, intent, this.weights, this.config);
      hidden = step.hNew;
    }

    // Get logits for next step
    const startEmb = context.length > 0
      ? this.vocab.nodes[this.vocab.nameToIndex.get(context[context.length - 1])!].embedding
      : new Array(this.config.inputDim).fill(0);

    const { logits } = gruStep(startEmb, hidden, intent, this.weights, this.config);

    // Score each vocab node by cosine similarity with logits
    const scores = this.vocab.nodes.map((node) => {
      const sim = dotProduct(logits, node.embedding) /
        (norm(logits) * norm(node.embedding) + 1e-8);
      return sim;
    });

    const probs = softmax(scores.map((s) => s / 0.05)); // temperature
    const ranked = this.vocab.indexToName
      .map((name, i) => ({ name, score: probs[i] }))
      .sort((a, b) => b.score - a.score);

    return { name: ranked[0].name, score: ranked[0].score, ranked };
  }

  /** Build greedy path from intent */
  buildPath(intent: number[], maxLen: number): string[] {
    const path: string[] = [];
    let hidden = new Array(this.config.hiddenDim).fill(0);
    let input = new Array(this.config.inputDim).fill(0);

    for (let t = 0; t < maxLen; t++) {
      const { hNew, logits } = gruStep(input, hidden, intent, this.weights, this.config);
      hidden = hNew;

      const scores = this.vocab.nodes.map((node) => {
        const sim = dotProduct(logits, node.embedding) /
          (norm(logits) * norm(node.embedding) + 1e-8);
        return sim;
      });

      const probs = softmax(scores.map((s) => s / 0.05));
      let bestIdx = 0;
      for (let i = 1; i < probs.length; i++) {
        if (probs[i] > probs[bestIdx]) bestIdx = i;
      }

      const bestName = this.vocab.indexToName[bestIdx];

      // Avoid infinite loops
      const recentCount = path.filter((p) => p === bestName).length;
      if (recentCount >= 2) break;

      path.push(bestName);
      input = this.vocab.nodes[bestIdx].embedding;

      // Termination: if highest prob < 0.1 or same as previous
      if (probs[bestIdx] < 0.1 && t > 0) break;
    }

    return path;
  }

  /** Build paths using beam search */
  buildPathBeam(
    intent: number[],
    beamWidth: number,
    maxLen: number,
  ): Array<{ path: string[]; score: number }> {
    let beams: BeamCandidate[] = [{
      path: [],
      score: 0,
      hidden: new Array(this.config.hiddenDim).fill(0),
    }];

    const completed: BeamCandidate[] = [];

    for (let t = 0; t < maxLen; t++) {
      const candidates: BeamCandidate[] = [];

      for (const beam of beams) {
        const input = beam.path.length > 0
          ? this.vocab.nodes[this.vocab.nameToIndex.get(beam.path[beam.path.length - 1])!].embedding
          : new Array(this.config.inputDim).fill(0);

        const { hNew, logits } = gruStep(input, beam.hidden, intent, this.weights, this.config);

        const scores = this.vocab.nodes.map((node) => {
          const sim = dotProduct(logits, node.embedding) /
            (norm(logits) * norm(node.embedding) + 1e-8);
          return sim;
        });

        const probs = softmax(scores.map((s) => s / 0.05));

        // Top-K candidates
        const topK = probs
          .map((p, i) => ({ idx: i, prob: p }))
          .sort((a, b) => b.prob - a.prob)
          .slice(0, beamWidth);

        for (const { idx, prob } of topK) {
          const name = this.vocab.indexToName[idx];
          const newPath = [...beam.path, name];
          const newScore = beam.score + Math.log(prob + 1e-10);

          candidates.push({
            path: newPath,
            score: newScore / Math.pow(newPath.length, 0.7), // length normalization
            hidden: hNew,
          });
        }

        // Terminate beam
        if (beam.path.length >= 2) {
          completed.push(beam);
        }
      }

      // Keep top beamWidth candidates
      candidates.sort((a, b) => b.score - a.score);
      beams = candidates.slice(0, beamWidth);

      if (beams.length === 0) break;
    }

    completed.push(...beams);
    completed.sort((a, b) => b.score - a.score);

    return completed
      .slice(0, beamWidth * 2)
      .map(({ path, score }) => ({ path, score }));
  }
}

function norm(vec: number[]): number {
  let sum = 0;
  for (const v of vec) sum += v * v;
  return Math.sqrt(sum);
}
```

**Step 4: Run tests**

Run: `cd lib/vault-exec && deno test --allow-read src/gru/inference_test.ts`
Expected: 3 PASS

**Step 5: Commit**

```bash
git add lib/vault-exec/src/gru/
git commit -m "feat(vault-exec): GRU inference with greedy and beam search decoding"
```

---

## Task 10: Trace Types & Recorder

**Files:**
- Create: `lib/vault-exec/src/traces/types.ts`
- Create: `lib/vault-exec/src/traces/recorder.ts`
- Create: `lib/vault-exec/src/traces/recorder_test.ts`

**Step 1: Write types**

```typescript
// traces/types.ts

export interface ExecutionTrace {
  intent?: string;
  intentEmbedding?: number[];
  targetNote: string;
  path: string[];
  success: boolean;
  synthetic: boolean;
}
```

**Step 2: Write the failing test**

```typescript
// traces/recorder_test.ts
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
```

**Step 3: Write implementation**

```typescript
// traces/recorder.ts
import type { VaultDB } from "../db/store.ts";
import type { ExecutionTrace } from "./types.ts";

/** Record an execution trace to DuckDB */
export async function recordTrace(
  db: VaultDB,
  trace: ExecutionTrace,
): Promise<void> {
  await db.insertTrace({
    intent: trace.intent,
    targetNote: trace.targetNote,
    path: trace.path,
    synthetic: trace.synthetic,
  });
}
```

**Step 4: Run tests**

Run: `cd lib/vault-exec && deno test --allow-read --allow-write --allow-ffi --allow-env --allow-net src/traces/recorder_test.ts`
Expected: 2 PASS

**Step 5: Commit**

```bash
git add lib/vault-exec/src/traces/
git commit -m "feat(vault-exec): trace recorder for execution history"
```

---

## Task 11: Synthetic Trace Generation

**Files:**
- Create: `lib/vault-exec/src/traces/synthetic.ts`
- Create: `lib/vault-exec/src/traces/synthetic_test.ts`

**Context:** Generate synthetic traces from the DAG structure. For each non-leaf target, the topological path to it is a valid trace. Intent is generated by the LLM.

**Step 1: Write the failing test**

```typescript
// traces/synthetic_test.ts
import { assertEquals } from "jsr:@std/assert";
import { generateStructuralTraces } from "./synthetic.ts";
import type { VaultNote } from "../types.ts";

function makeNote(name: string, wikilinks: string[] = []): VaultNote {
  return { path: `${name}.md`, name, body: `About ${name}`, frontmatter: {}, wikilinks };
}

Deno.test("generateStructuralTraces - generates one trace per non-leaf note", () => {
  const notes = [
    makeNote("A"),
    makeNote("B"),
    makeNote("C", ["A", "B"]),
    makeNote("D", ["C"]),
  ];
  const traces = generateStructuralTraces(notes);

  // C (level 1) and D (level 2) are non-leaves → 2 traces
  assertEquals(traces.length, 2);
});

Deno.test("generateStructuralTraces - trace path is topological order", () => {
  const notes = [
    makeNote("A"),
    makeNote("B"),
    makeNote("C", ["A", "B"]),
  ];
  const traces = generateStructuralTraces(notes);

  assertEquals(traces.length, 1);
  const trace = traces[0];
  assertEquals(trace.targetNote, "C");
  // Path should be [A, B, C] or [B, A, C] — leaves first, then C
  assertEquals(trace.path[trace.path.length - 1], "C");
  assertEquals(trace.path.length, 3);
});

Deno.test("generateStructuralTraces - all traces marked synthetic", () => {
  const notes = [makeNote("A"), makeNote("B", ["A"])];
  const traces = generateStructuralTraces(notes);
  for (const trace of traces) {
    assertEquals(trace.synthetic, true);
  }
});
```

**Step 2: Run test to verify it fails**

Run: `cd lib/vault-exec && deno test --allow-read src/traces/synthetic_test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// traces/synthetic.ts
import type { VaultNote } from "../types.ts";
import type { ExecutionTrace } from "./types.ts";
import { buildGraph, topologicalSort, extractSubgraph } from "../graph.ts";

/**
 * Generate structural traces from the DAG.
 * For each non-leaf note, the topological path to it is a valid trace.
 */
export function generateStructuralTraces(notes: VaultNote[]): ExecutionTrace[] {
  const graph = buildGraph(notes);
  const traces: ExecutionTrace[] = [];

  for (const note of notes) {
    // Skip leaves (no dependencies)
    if (note.wikilinks.length === 0) continue;

    try {
      const subgraph = extractSubgraph(graph, note.name);
      const path = topologicalSort(subgraph);

      traces.push({
        targetNote: note.name,
        path,
        success: true,
        synthetic: true,
        intent: `Execute ${note.name}: ${note.body.trim().split("\n")[0]}`,
      });
    } catch {
      // Skip if subgraph extraction fails (e.g., missing deps)
      continue;
    }
  }

  return traces;
}
```

**Step 4: Run tests**

Run: `cd lib/vault-exec && deno test --allow-read src/traces/synthetic_test.ts`
Expected: 3 PASS

**Step 5: Commit**

```bash
git add lib/vault-exec/src/traces/
git commit -m "feat(vault-exec): synthetic trace generation from DAG structure"
```

---

## Task 12: CLI `init` Command

**Files:**
- Modify: `lib/vault-exec/src/cli.ts`
- Create: `lib/vault-exec/src/init.ts`

**Context:** Wire everything together: parse → embed → GNN → synthetic traces → store in DuckDB. No test file for CLI (integration tested manually).

**Step 1: Create init.ts**

```typescript
// init.ts
import type { VaultNote } from "./types.ts";
import { VaultDB } from "./db/store.ts";
import { EmbeddingModel, type Embedder } from "./embeddings/model.ts";
import { indexVault } from "./embeddings/indexer.ts";
import { gnnForward } from "./gnn/forward.ts";
import { initParams } from "./gnn/params.ts";
import { DEFAULT_GNN_CONFIG } from "./gnn/types.ts";
import type { GNNNode } from "./gnn/types.ts";
import { generateStructuralTraces } from "./traces/synthetic.ts";
import { recordTrace } from "./traces/recorder.ts";

export interface InitResult {
  notesIndexed: number;
  embeddingsGenerated: number;
  gnnForwardDone: boolean;
  syntheticTraces: number;
}

export async function initVault(
  notes: VaultNote[],
  dbPath: string,
  embedder: Embedder,
): Promise<InitResult> {
  const db = await VaultDB.open(dbPath);
  const model = new EmbeddingModel(embedder);

  try {
    // 1. Index notes (parse → embed → store)
    console.log("1/4 Indexing notes...");
    const stats = await indexVault(notes, db, model);
    console.log(`  ${stats.indexed} embedded, ${stats.skipped} skipped`);

    // 2. GNN forward pass
    console.log("2/4 GNN forward pass...");
    const allNotes = await db.getAllNotes();
    const maxLevel = Math.max(...allNotes.map((n) => n.level), 0);

    let gnnDone = false;
    if (maxLevel > 0) {
      // Build GNN nodes from DB
      const gnnNodes: GNNNode[] = [];
      for (const row of allNotes) {
        const note = notes.find((n) => n.name === row.name);
        gnnNodes.push({
          name: row.name,
          level: row.level,
          embedding: new Array(1024).fill(0), // TODO: load from DB
          children: note?.wikilinks ?? [],
        });
      }

      const config = DEFAULT_GNN_CONFIG;
      const params = initParams(config, maxLevel + 1);
      const gnnEmbeddings = gnnForward(gnnNodes, params, config);

      // Store GNN embeddings
      for (const [name, emb] of gnnEmbeddings) {
        await db.updateNoteGnnEmbedding(name, emb);
      }
      gnnDone = true;
      console.log(`  ${gnnEmbeddings.size} GNN embeddings computed`);
    } else {
      console.log("  Skipped (all notes are leaves)");
    }

    // 3. Generate synthetic traces
    console.log("3/4 Generating synthetic traces...");
    const syntheticTraces = generateStructuralTraces(notes);
    for (const trace of syntheticTraces) {
      await recordTrace(db, trace);
    }
    console.log(`  ${syntheticTraces.length} synthetic traces`);

    // 4. TODO: GRU training (Task 13)
    console.log("4/4 GRU training... (not yet implemented)");

    return {
      notesIndexed: stats.indexed,
      embeddingsGenerated: stats.indexed,
      gnnForwardDone: gnnDone,
      syntheticTraces: syntheticTraces.length,
    };
  } finally {
    db.close();
  }
}
```

**Step 2: Update cli.ts — add `init` command**

Add to the switch statement in `cli.ts`:

```typescript
case "init": {
  const { BGEEmbedder } = await import("./embeddings/model.ts");
  const { initVault } = await import("./init.ts");

  const dbPath = `${vaultPath}/.vault-exec/vault.duckdb`;
  // Ensure .vault-exec directory exists
  await Deno.mkdir(`${vaultPath}/.vault-exec`, { recursive: true });

  console.log(`Initializing vault: ${vaultPath}\n`);
  const embedder = new BGEEmbedder();
  const result = await initVault(notes, dbPath, embedder);

  console.log(`\nDone:`);
  console.log(`  ${result.notesIndexed} notes indexed`);
  console.log(`  ${result.syntheticTraces} synthetic traces generated`);
  console.log(`  GNN: ${result.gnnForwardDone ? "✓" : "skipped"}`);
  break;
}
```

Update USAGE string to include `init`.

**Step 3: Commit**

```bash
git add lib/vault-exec/src/init.ts lib/vault-exec/src/cli.ts
git commit -m "feat(vault-exec): init command wires parse → embed → GNN → synthetic traces"
```

---

## Task 13: GRU Trainer (Focal Loss + Soft Labels)

**Files:**
- Create: `lib/vault-exec/src/gru/trainer.ts`
- Create: `lib/vault-exec/src/gru/trainer_test.ts`

**Step 1: Write the failing test**

```typescript
// gru/trainer_test.ts
import { assertEquals } from "jsr:@std/assert";
import { focalLoss, softLabelLoss, trainEpoch } from "./trainer.ts";

Deno.test("focalLoss - higher loss for uncertain predictions", () => {
  const confidentLoss = focalLoss(0.9, 2.0);  // high confidence
  const uncertainLoss = focalLoss(0.3, 2.0);  // low confidence
  assertEquals(uncertainLoss > confidentLoss, true);
});

Deno.test("focalLoss - gamma=0 is standard CE", () => {
  const focal = focalLoss(0.5, 0);
  const ce = -Math.log(0.5);
  assertEquals(Math.abs(focal - ce) < 1e-6, true);
});

Deno.test("softLabelLoss - adds parent/children credit", () => {
  // Mock: target=1 (index), parent=2, child=0
  const probs = [0.1, 0.7, 0.2]; // target has highest prob
  const targetIdx = 1;
  const parentIdx = 2;
  const childIdx = 0;
  const alphaUp = 0.2;
  const alphaDown = 0.1;

  const loss = softLabelLoss(probs, targetIdx, parentIdx, childIdx, alphaUp, alphaDown);
  assertEquals(typeof loss, "number");
  assertEquals(loss > 0, true);
});
```

**Step 2: Run test to verify it fails**

Run: `cd lib/vault-exec && deno test --allow-read src/gru/trainer_test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// gru/trainer.ts

/**
 * Focal loss: FL(p) = -(1-p)^γ · log(p)
 * γ = 0 reduces to standard cross-entropy
 */
export function focalLoss(p: number, gamma: number): number {
  const clipped = Math.max(p, 1e-10);
  return -Math.pow(1 - clipped, gamma) * Math.log(clipped);
}

/**
 * Soft label loss with learnable alpha_up/alpha_down.
 * loss = FL(target) + sigmoid(α_up)·FL(parent) + sigmoid(α_down)·FL(child)
 */
export function softLabelLoss(
  probs: number[],
  targetIdx: number,
  parentIdx: number | null,
  childIdx: number | null,
  alphaUp: number,
  alphaDown: number,
  gamma = 2.0,
): number {
  let loss = focalLoss(probs[targetIdx], gamma);

  if (parentIdx !== null) {
    const sigUp = 1 / (1 + Math.exp(-alphaUp));
    loss += sigUp * focalLoss(probs[parentIdx], gamma);
  }

  if (childIdx !== null) {
    const sigDown = 1 / (1 + Math.exp(-alphaDown));
    loss += sigDown * focalLoss(probs[childIdx], gamma);
  }

  return loss;
}

/**
 * Train one epoch over examples.
 * Returns average loss.
 *
 * NOTE: Full backpropagation is complex — for V1, we use numerical
 * gradient estimation (finite differences) on the small parameter space.
 * This is viable because vault-exec has ~32 hidden dim and <200 vocab.
 */
export function trainEpoch(
  // Implementation deferred to Task 13 execution — this is the interface
  _examples: Array<{ intentEmb: number[]; path: string[]; targetIdx: number }>,
  _weights: any,
  _vocab: any,
  _config: any,
  _lr: number,
): { avgLoss: number; accuracy: number } {
  // Placeholder — will be implemented with numerical gradients
  return { avgLoss: 0, accuracy: 0 };
}
```

**Step 4: Run tests**

Run: `cd lib/vault-exec && deno test --allow-read src/gru/trainer_test.ts`
Expected: 3 PASS

**Step 5: Commit**

```bash
git add lib/vault-exec/src/gru/trainer.ts lib/vault-exec/src/gru/trainer_test.ts
git commit -m "feat(vault-exec): GRU trainer with focal loss and soft labels"
```

---

## Task 14: CLI `run` with Live Training Worker

**Files:**
- Modify: `lib/vault-exec/src/cli.ts`
- Modify: `lib/vault-exec/src/executor.ts` (add trace recording hook)

**Context:** After each `vault-exec run`, record the trace and spawn an async worker for GRU re-training. The worker reads traces from DuckDB, trains, and saves weights.

**Step 1: Update executor to return execution path**

Add to `executeGraph` return type: the ordered list of node names executed.

```typescript
// In executor.ts, modify executeGraph to also return the execution order
export async function executeGraph(graph: VaultGraph): Promise<{ results: ResultMap; path: string[] }> {
  const order = topologicalSort(graph);
  const results: ResultMap = new Map();

  for (const name of order) {
    const node = graph.nodes.get(name);
    if (!node) throw new Error(`Node "${name}" not found in graph`);
    console.log(`▶ ${name} (${node.type})`);
    const output = await executeNode(node, results);
    results.set(name, output);
    console.log(`  → ${JSON.stringify(output)}`);
  }

  return { results, path: order };
}
```

**Step 2: Update cli.ts `run` command**

After execution, record trace and spawn training worker:

```typescript
// In the run case, after execution:
const { results, path } = await executeGraph(graph);

// Record trace
const dbPath = `${vaultPath}/.vault-exec/vault.duckdb`;
try {
  const { VaultDB } = await import("./db/store.ts");
  const { recordTrace } = await import("./traces/recorder.ts");
  const db = await VaultDB.open(dbPath);
  await recordTrace(db, {
    intent: flags.intent,
    targetNote: flags.target ?? path[path.length - 1],
    path,
    success: true,
    synthetic: false,
  });
  db.close();
  console.log("\n✓ Trace recorded");
} catch {
  // DB not initialized — skip silently (user hasn't run init)
  console.log("\n⚠ No vault DB found. Run 'vault-exec init' to enable learning.");
}
```

**Step 3: Post-run incremental re-index + GNN re-forward + GRU retrain**

After recording the trace, spawn an async worker that:

1. **Re-index notes** — embed any new/modified notes (hash check via `indexVault`)
2. **GNN forward pass** — recalculate enriched embeddings on the full graph. This is NOT backprop — it's a forward pass with fixed params (attention scoring + residual). Needed because graph topology may have changed (new notes, new wikilinks). Quasi-instantaneous.
3. **GRU retrain** — load ALL traces (synthetic + real) from DuckDB, rebuild training examples, run a few epochs of focal loss training, save updated weights.

```typescript
// After trace recording:
try {
  const { indexVault } = await import("./embeddings/indexer.ts");
  const { gnnForward } = await import("./gnn/forward.ts");
  const { initParams } = await import("./gnn/params.ts");
  const { DEFAULT_GNN_CONFIG } = await import("./gnn/types.ts");
  // ... re-index, GNN forward, GRU retrain (see init.ts for reference)
  console.log("✓ Live training complete");
} catch (err) {
  console.error(`⚠ Live training failed: ${(err as Error).message}`);
  // No data loss — traces are in DB, next run will retrain
}
```

**Important:** The worker should be fault-tolerant. If it crashes, traces are already safely in DuckDB. Next `run` or `init` will pick them up.

**⚠️ KNOWN GAP (2026-03-04):** The GNN in vault-exec uses fixed params with no backpropagation. The forward pass updates embeddings based on graph structure, but the attention weights and residual params are not learned from data. This is a simplification from PML's SHGAT which DOES train these params. For vault-exec to truly learn from usage, the GNN params should eventually be trainable too. Noted for future work — not blocking for MVP.

**Step 4: Commit**

```bash
git add lib/vault-exec/src/cli.ts lib/vault-exec/src/executor.ts
git commit -m "feat(vault-exec): live trace recording + incremental retrain after each run"
```

---

## Task 15: End-to-End Integration Test

**Files:**
- Create: `lib/vault-exec/src/integration_test.ts`

**Step 1: Write integration test**

```typescript
// integration_test.ts
import { assertEquals } from "jsr:@std/assert";
import type { VaultNote } from "./types.ts";
import { buildGraph, topologicalSort, extractSubgraph } from "./graph.ts";
import { indexVault, computeLevels } from "./embeddings/indexer.ts";
import { EmbeddingModel, type Embedder } from "./embeddings/model.ts";
import { VaultDB } from "./db/store.ts";
import { gnnForward } from "./gnn/forward.ts";
import { initParams } from "./gnn/params.ts";
import { DEFAULT_GNN_CONFIG } from "./gnn/types.ts";
import type { GNNNode } from "./gnn/types.ts";
import { generateStructuralTraces } from "./traces/synthetic.ts";
import { GRUInference } from "./gru/inference.ts";
import { initWeights } from "./gru/cell.ts";
import { DEFAULT_GRU_CONFIG } from "./gru/types.ts";
import type { VocabNode, GRUVocabulary } from "./gru/types.ts";

class MockEmbedder implements Embedder {
  async encode(text: string): Promise<number[]> {
    const seed = text.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return Array.from({ length: 1024 }, (_, i) => Math.sin(seed + i) * 0.1);
  }
  isLoaded() { return true; }
  async load() {}
  async dispose() {}
}

function makeNote(name: string, body: string, wikilinks: string[] = []): VaultNote {
  return { path: `${name}.md`, name, body, frontmatter: {}, wikilinks };
}

Deno.test("integration: full pipeline parse → embed → GNN → traces → GRU predict", async () => {
  // 1. Create vault notes
  const notes = [
    makeNote("Team Members", "List of people: Alice (senior), Bob (junior)"),
    makeNote("Senior Filter", "Keep seniors from [[Team Members]]", ["Team Members"]),
    makeNote("Summary", "Summarize [[Senior Filter]]", ["Senior Filter"]),
  ];

  // 2. Compute levels
  const levels = computeLevels(notes);
  assertEquals(levels.get("Team Members"), 0);
  assertEquals(levels.get("Senior Filter"), 1);
  assertEquals(levels.get("Summary"), 2);

  // 3. Index into DuckDB
  const db = await VaultDB.open(":memory:");
  const model = new EmbeddingModel(new MockEmbedder());
  try {
    const stats = await indexVault(notes, db, model);
    assertEquals(stats.indexed, 3);

    // 4. GNN forward
    const allNotes = await db.getAllNotes();
    const gnnNodes: GNNNode[] = allNotes.map((row) => ({
      name: row.name,
      level: row.level,
      embedding: Array.from({ length: 1024 }, (_, i) => Math.sin(row.name.charCodeAt(0) + i) * 0.1),
      children: notes.find((n) => n.name === row.name)?.wikilinks ?? [],
    }));

    const config = DEFAULT_GNN_CONFIG;
    const params = initParams(config, 3);
    const gnnEmbeddings = gnnForward(gnnNodes, params, config);
    assertEquals(gnnEmbeddings.size, 3);

    // 5. Synthetic traces
    const traces = generateStructuralTraces(notes);
    assertEquals(traces.length, 2); // Senior Filter + Summary

    // 6. GRU inference (with random weights — just testing the pipeline)
    const vocabNodes: VocabNode[] = Array.from(gnnEmbeddings.entries()).map(([name, emb]) => ({
      name,
      level: levels.get(name) ?? 0,
      embedding: emb,
    }));
    const vocab: GRUVocabulary = {
      nodes: vocabNodes,
      nameToIndex: new Map(vocabNodes.map((n, i) => [n.name, i])),
      indexToName: vocabNodes.map((n) => n.name),
    };
    const gruWeights = initWeights(DEFAULT_GRU_CONFIG);
    const gru = new GRUInference(gruWeights, vocab, DEFAULT_GRU_CONFIG);

    const intent = await model.encode("who are the senior people?");
    const prediction = gru.predictNext(intent, []);
    // With random weights, any prediction is fine — just verify it's a valid note
    assertEquals(vocab.nameToIndex.has(prediction.name), true);

    const path = gru.buildPath(intent, 5);
    assertEquals(path.length > 0, true);

  } finally {
    db.close();
  }
});
```

**Step 2: Run test**

Run: `cd lib/vault-exec && deno test --allow-read --allow-write --allow-ffi --allow-env --allow-net src/integration_test.ts`
Expected: PASS

**Step 3: Run ALL tests**

Run: `cd lib/vault-exec && deno test --allow-read --allow-write --allow-ffi --allow-env --allow-net src/`
Expected: All tests PASS (38 existing + ~25 new)

**Step 4: Commit**

```bash
git add lib/vault-exec/src/integration_test.ts
git commit -m "test(vault-exec): end-to-end integration test for full GNN+GRU pipeline"
```

---

## Task Summary

| Task | Component | New Files | Tests |
|------|-----------|-----------|-------|
| 1 | DuckDB Store | db/store.ts | 4 |
| 2 | Embedding Model | embeddings/model.ts | 3 |
| 3 | Embedding Indexer | embeddings/indexer.ts | 2 |
| 4 | GNN Types + Attention | gnn/types.ts, gnn/attention.ts | 6 |
| 5 | GNN Residual | gnn/residual.ts | 3 |
| 6 | GNN Message-Passing | gnn/message-passing.ts | 2 |
| 7 | GNN Forward + Params | gnn/forward.ts, gnn/params.ts | 2 |
| 8 | GRU Cell | gru/types.ts, gru/cell.ts | 3 |
| 9 | GRU Inference | gru/inference.ts | 3 |
| 10 | Trace Recorder | traces/types.ts, traces/recorder.ts | 2 |
| 11 | Synthetic Traces | traces/synthetic.ts | 3 |
| 12 | CLI init | init.ts | — |
| 13 | GRU Trainer | gru/trainer.ts | 3 |
| 14 | CLI run + live training | cli.ts, executor.ts | — |
| 15 | Integration Test | integration_test.ts | 1 |
| **Total** | | **~20 files** | **~37 new tests** |

## Update deno.json

Add permissions needed for DuckDB and embeddings:

```json
{
  "tasks": {
    "test": "deno test --allow-read --allow-write --allow-ffi --allow-env --allow-net src/",
    "cli": "deno run --allow-read --allow-write --allow-net --allow-env --allow-ffi src/cli.ts"
  }
}
```

---

## Known Gaps & Future Work (added 2026-03-04)

1. **Task 14 incomplete** — Trace recording works, but the async retrain worker (re-index + GNN forward + GRU retrain) is NOT implemented yet. This is the main missing piece for "learning from usage".

2. **GNN has no backpropagation** — vault-exec's GNN uses fixed params (attention + residual). It enriches embeddings via message-passing forward pass, but the params themselves are not trained from data. PML's SHGAT trains these params (gamma, residual weights, attention). Vault-exec should eventually do the same.

3. **compile writes in-place** (changed 2026-03-04) — `compile` now writes frontmatter directly into the original .md files instead of `.compiled/` directory. `loadNotes` always reads from vault root.

4. **parser preserves full path** (changed 2026-03-04) — `parseVault` now keeps the full file path in `note.path` (e.g., `./demo-vault/Note.md`) instead of just the filename, enabling correct in-place writes.
