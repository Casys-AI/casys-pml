# vault-exec GNN + GRU Integration — Design Document

**Date:** 2026-03-04
**Approach:** Fork & Simplify (Approach A) — copy algorithmic core from PML SHGAT/GRU, strip PML-specific complexity, rewrite data layer on DuckDB.

**Goal:** Integrate a GNN (message-passing on the vault's wikilink graph) and a GRU (sequence prediction from execution traces) into vault-exec, enabling intelligent intent-based routing that improves with usage.

**Architecture:** 100% local, no cloud dependency. DuckDB for storage, BGE-M3 via @huggingface/transformers for embeddings, GNN for structure-aware node embeddings, GRU for path prediction from intents.

---

## 1. Project Structure

```
lib/vault-exec/src/
├── parser.ts              # existing — parse .md → VaultNote
├── graph.ts               # existing — buildGraph, topoSort, extractSubgraph
├── compiler.ts            # existing — LLM compile pass
├── executor.ts            # existing — DAG execution
├── validator.ts           # existing — structural validation
├── intent.ts              # existing — LLM router (cold start fallback)
├── cli.ts                 # existing — entry point
├── io.ts                  # existing — VaultReader/Writer Deno
├── types.ts               # existing — VaultNote, CompiledNode, VaultGraph
│
├── db/
│   ├── store.ts           # DuckDB init, migrations, singleton connection
│   └── schema.sql         # Tables: notes, edges, traces, gnn_params, gru_weights
│
├── embeddings/
│   ├── model.ts           # EmbeddingModel (BGE-M3 via @huggingface/transformers)
│   └── indexer.ts         # Generate/update embeddings for all notes
│
├── gnn/
│   ├── types.ts           # VaultNode, VaultEdge, GNNParams, ForwardCache
│   ├── attention.ts       # GAT attention scoring, softmax, LeakyReLU
│   ├── message-passing.ts # V→E, E→E (up+down), E→V — single file
│   ├── residual.ts        # Convex gated residual (V→E), additive skip (E→V)
│   ├── forward.ts         # Multi-level forward pass orchestration
│   ├── backward.ts        # Backward pass + gradient accumulation
│   ├── trainer.ts         # Contrastive InfoNCE, training loop
│   └── params.ts          # Xavier init, save/load (MessagePack+gzip)
│
├── gru/
│   ├── types.ts           # GRUVocab, TransitionExample, GRUConfig
│   ├── cell.ts            # GRU cell (z/r/h gates, forward)
│   ├── inference.ts       # predictNext, buildPath, buildPathBeam
│   ├── trainer.ts         # Training loop, focal loss, soft labels (alpha_up/alpha_down learnable)
│   └── weights.ts         # Save/load weights (MessagePack+gzip)
│
└── traces/
    ├── recorder.ts        # Records each execution as a trace
    ├── synthetic.ts       # Generates synthetic traces via GNN clusters + LLM coverage
    └── types.ts           # ExecutionTrace, TraceStep
```

### Principles
- GNN in single `message-passing.ts` (vault is small, no need for PML's 4-file split)
- GRU cell isolated — pure math, no PER/Thompson/curriculum (YAGNI)
- `db/` contains all DuckDB interaction
- `traces/` separates real recording from synthetic generation

---

## 2. Data Model (DuckDB)

```sql
CREATE TABLE notes (
  name          TEXT PRIMARY KEY,
  path          TEXT NOT NULL,
  body_hash     TEXT NOT NULL,          -- FNV-1a, change detection
  level         INTEGER NOT NULL,       -- topological depth (0 = leaf)
  embedding     FLOAT[1024],            -- BGE-M3 of markdown content
  gnn_embedding FLOAT[1024],            -- post GNN message-passing
  updated_at    TIMESTAMP DEFAULT now()
);

CREATE TABLE edges (
  source TEXT NOT NULL,                  -- note with the [[wikilink]]
  target TEXT NOT NULL,                  -- referenced note
  PRIMARY KEY (source, target)
);

CREATE TABLE traces (
  id               INTEGER PRIMARY KEY,
  intent           TEXT,                 -- user intent (raw text)
  intent_embedding FLOAT[1024],          -- BGE of intent
  target_note      TEXT,                 -- target note requested
  path             TEXT[],               -- execution sequence (topo order)
  success          BOOLEAN DEFAULT true,
  synthetic        BOOLEAN DEFAULT false,
  executed_at      TIMESTAMP DEFAULT now()
);

CREATE TABLE gnn_params (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  params     BLOB,                       -- serialized weights (MessagePack+gzip)
  epoch      INTEGER,
  accuracy   FLOAT,
  trained_at TIMESTAMP
);

CREATE TABLE gru_weights (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  weights    BLOB,                       -- serialized weights (MessagePack+gzip)
  vocab_size INTEGER,
  epoch      INTEGER,
  accuracy   FLOAT,
  trained_at TIMESTAMP
);
```

### Key decisions
- `notes.embedding` = raw BGE, `notes.gnn_embedding` = post message-passing. Both coexist.
- `notes.level` = topological depth, computed at parse time, recalculated when graph changes.
- `traces.synthetic` distinguishes LLM-generated traces from real executions.
- Weights stored as BLOB (MessagePack+gzip), not JSON.

---

## 3. Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    vault-exec pipeline                          │
│                                                                 │
│  1. PARSE         2. EMBED          3. GNN            4. RUN    │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │ .md files│───▶│ BGE-M3   │───▶│ Message  │    │ GRU beam │  │
│  │ → notes  │    │ → 1024-d │    │ Passing  │    │ or LLM   │  │
│  │ → edges  │    │ per note │    │ → gnn_emb│    │ fallback │  │
│  │ → levels │    │          │    │          │    │          │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│                                                      │         │
│                                                      ▼         │
│                                                 5. EXECUTE     │
│                                                 ┌──────────┐   │
│                                                 │ DAG topo │   │
│                                                 │ → results│   │
│                                                 └──────────┘   │
│                                                      │         │
│                                          ┌───────────┴───┐     │
│                                          ▼               ▼     │
│                                     6. RECORD      7. TRAIN    │
│                                     ┌─────────┐   ┌─────────┐ │
│                                     │ trace   │   │ GRU      │ │
│                                     │ → DuckDB│──▶│ worker   │ │
│                                     └─────────┘   │ (async)  │ │
│                                                   └─────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Step by step

**1. Parse** — read .md files, extract frontmatter + body + wikilinks, compute levels (topo depth), upsert into DuckDB.

**2. Embed** — for each note with changed body_hash: BGE-M3 on `"# {name}\n\n{body}"`. Store in `notes.embedding`.

**3. GNN Forward** — multi-level message-passing on the vault graph:
  - V→E upward (L0 → L1): attention + convex gated residual
  - E→E upward (L1 → L2 → ... → L_max)
  - E→E downward (L_max → ... → L1): context from top flows back down
  - E→V downward (L1 → L0): additive skip residual
  - Store results in `notes.gnn_embedding`, save params in `gnn_params`.

**4. Route** — if GRU weights exist: beam search predicts target note from intent. If no weights: LLM fallback (with explicit warning log).

**5. Execute** — extractSubgraph → topological sort → sequential execution of value/code/tool nodes.

**6. Record** — insert trace into DuckDB (sync, fast). User gets results immediately.

**7. Train** — spawn Deno.Worker or subprocess. Reads traces from DuckDB, trains GRU, saves weights. Does not block the main process.

---

## 4. GNN Architecture

### Message-Passing (4 phases)

Reuses PML SHGAT math, simplified into fewer files.

**Hierarchy:** Emerges from the DAG. Level = topological depth (0 = leaf, no dependencies).

**V→E upward** — leaf notes send embeddings to L1 notes:
- Attention: `α_tc = softmax(a^T · LeakyReLU([H_proj_t || E_proj_c]))`
- Aggregation: `E_MP = ELU(Σ_t α_tc · H'_t)`
- Convex gated residual: `E = (1-γ)·E_MP + γ·E_orig`, where `γ(n) = sigmoid(a·log(n_children+1) + b)`, init a=-1.0, b=0.5

**E→E upward** — L1 → L2 → ... → L_max. Same pattern as V→E.

**E→E downward** — L_max → ... → L1. Global context flows back down. Same convex residual.

**E→V downward** — L1 → L0. Additive skip: `H = H_MP + H_orig`.

### Parameters
- `a`, `b` (residual gate) — learnable per level
- `W_child`, `W_parent` — projection matrices per level (or shared if `shareLevelWeights=true`)
- `a_upward`, `a_downward` — attention vectors per level
- `embDim = 1024` (preserved throughout), `numHeads = 8` (smaller than PML's 16)

### Training
- Contrastive InfoNCE loss on the DAG structure
- Positive: note's actual cluster membership
- Negatives: sampled from other clusters

---

## 5. GRU Architecture

### Vocabulary
All vault notes as VocabNodes:

```typescript
interface VocabNode {
  name: string;          // "Senior Filter"
  level: number;         // 1
  embedding: number[];   // gnn_embedding (1024-d)
  children?: string[];   // direct dependencies
}
```

### Prediction
At each timestep, GRU predicts the next note in the execution sequence.

### Configuration (vs PML)

| Parameter | PML | vault-exec |
|-----------|-----|------------|
| Vocab size | ~1170 | ~5-200 |
| GRU hidden | 64 | 32 |
| Input projection | 1024 → 128 | 1024 → 64 |
| PER buffer | yes | no |
| Thompson sampler | yes | no |
| Curriculum learning | yes | no |
| Structural bias | yes | no (DAG is explicit) |
| Transition features | 5D | none (DAG encodes structure) |

### Loss

**Focal loss:**
```
FL(p) = -α_t · (1 - p_t)^γ · log(p_t),  γ = 2.0
```

**Soft labels with learnable alpha_up / alpha_down:**
```
loss = CE(target)
     + sigmoid(α_up)   · CE(parent_of_target)
     + sigmoid(α_down) · CE(children_of_target)
```

Both `α_up` and `α_down` are learnable scalar parameters with gradients. Initialized at 0.2 and 0.1 respectively. Sigmoid bounds them to [0, 1].

### Decoding
- **Greedy:** forward → softmax → top pick → termination check
- **Beam search:** width=3, length normalization `score / len^0.7`

---

## 6. Cold Start

### Couche 1: Synthetic coverage (GNN + LLM)

1. GNN forward → embeddings + cluster identification
2. Enumerate all possible paths (all subgraphs for each target note)
3. LLM generates for each path: a natural intent + parameter values that exercise the path
4. Dry-run execution with generated parameters → validate path produces meaningful result
5. Store as `synthetic = true` traces with intent_embedding

The LLM acts as a **coverage generator** — it produces diverse, natural intents and chooses parameters that ensure each path produces a non-degenerate result.

### Couche 2: Real traces (progressive replacement)

Each `vault-exec run` automatically records its trace. Real traces get higher sample weight (`1.0` vs `0.5` for synthetic). As real traces accumulate, synthetic traces are gradually outweighed.

### Init flow

```
vault-exec init <vault>
  1. Parse → notes + edges + levels
  2. Embed → BGE-M3 per note
  3. GNN forward → gnn_embeddings
  4. Synthetic traces → GNN clusters + LLM coverage
  5. GRU training on synthetic traces (in worker)
  → System is operational for --intent from first run
```

---

## 7. CLI Commands

```
vault-exec init <vault>             # Full bootstrap: parse + embed + GNN + synthetic traces + first training
vault-exec run <vault>              # Execute full DAG + record trace + retrain (async worker)
vault-exec run <vault> --target X   # Execute subgraph for X + record + retrain
vault-exec run <vault> --intent "…" # GRU routes intent → target, execute + record + retrain
vault-exec validate <vault>         # Structural validation (unchanged)
vault-exec graph <vault>            # Display dependency graph (unchanged)
vault-exec compile <vault>          # LLM compile pass for uncompiled notes (unchanged)
```

No separate `train` command. Training is integrated:
- `init` does first training on synthetic traces
- Every `run` spawns async worker for incremental retraining

---

## 8. Error Handling

**Fail-fast, no silent fallbacks** (per project policy):

| Situation | Behavior |
|-----------|----------|
| Note references nonexistent `[[wikilink]]` | Error at parse, not at run |
| GNN forward fails (missing embeddings) | Explicit error, no silent skip |
| No GRU weights (first run before init) | LLM fallback **with warning log** |
| DuckDB absent (no init) | Error: "Run `vault-exec init` first" |
| LLM returns invalid YAML | Retry with feedback (existing, max 2 retries) |
| Training worker crash | Log error, next run retrains. No data loss (traces in DB) |
| Embedding model download fails | Error, no fallback to random vectors |

Only tolerated fallback: GRU → LLM, explicitly logged.

---

## 9. Key Differences from PML

| Aspect | PML | vault-exec |
|--------|-----|------------|
| Graph source | Reconstructed from traces | Explicit (wikilinks) |
| Hierarchy | Declared (caps contain tools) | Emergent (topological depth) |
| SHGAT/GNN coverage | 163/920 tools (18%) | 100% notes |
| Embedding space | Split (SHGAT vs raw BGE) | Homogeneous |
| Storage | PostgreSQL + pgvector | DuckDB (embedded) |
| Training data | Thousands of prod traces | Synthetic + real (tens to hundreds) |
| Vocab size | ~1170 | ~5-200 |
| Complexity | PER, Thompson, curriculum, structural bias | Focal loss + soft labels only |
| Deployment | Server-side | 100% local |

---

## 10. Embeddings

Reuse existing `@huggingface/transformers` with `Xenova/bge-m3`:
- Pipeline: `feature-extraction`
- Dimensions: 1024
- Lazy-loaded on first use (~400MB download on first run)
- ~100ms per note encoding

Extracted from `src/vector/embeddings.ts` (EmbeddingModel class), simplified for vault-exec (no DB caching layer, direct DuckDB storage).

---

## 11. Residual Formulas (from PML, battle-tested)

**V→E convex gated:**
```
E = (1-γ)·E_MP + γ·E_orig
γ(n) = sigmoid(a·log(n_children + 1) + b)
init: a = -1.0, b = 0.5
```

**E→V additive skip:**
```
H = H_MP + H_orig
```

**E→E downward:** same convex pattern as V→E.

Parameters `a`, `b` are learnable — the network decides how much MP signal vs original to keep based on number of children.
