# Vault Exec Live Training Design

**Date:** 2026-03-06

**Scope:** `lib/vault-exec`

## Goal

Reintroduce live training after DB-first OpenClaw imports, but do it with a
split async path:

- Deno still owns import, rebuild, projection, and `vault.kv`
- the custom GNN in `src/gnn` stays the structural encoder/trainer
- a Node `tfjs-node` worker trains the GRU asynchronously
- notebooks become stats/evaluation views instead of primary training entrypoints

## Why this is a new design

The current codebase has two incompatible halves:

- the GRU trainer in `src/gru/trainer.ts` is already TF.js autograd-based
- the GNN training path in `src/gnn/application/training.ts` uses numerical
  gradients over plain JS arrays

That means "switching to `tfjs-node`" is useful for the GRU, but not a reason
to rewrite the custom GNN into TF. The live path therefore becomes:

- DB-first rebuild in Deno
- custom GNN training/forward in Deno
- GRU training in Node `tfjs-node`
- persistence back into KV in Deno

## Architecture

### 1. Data ownership

`vault.kv` remains the source of truth and remains Deno-owned.

Deno continues to own:

- OpenClaw incremental import
- DB-first rebuild of `training_data`
- Markdown projection under `tools/`
- persistence of final `gnn_params` and `gru_weights`

Node does **not** read or write Deno KV directly.

### 2. Cross-runtime boundary

Live training crosses the Deno/Node boundary only for the GRU step through
deterministic snapshot files under:

- `<vault>/.vault-exec/live-training/`

Artifacts:

- `requested-build.json`
- `lock.json`
- `snapshots/<buildId>.json.gz`
- `results/<runId>.json.gz`
- `metrics/<runId>.json`

The snapshot contains:

- active `training_data` build id
- `tool_leaf_nodes`
- `tool_leaf_edges_next`
- imported tool-call rows
- latest GNN-produced vocabulary embeddings
- optional warm-start `gru_weights` blob
- model config used for the run

The result contains:

- `buildId`
- `runId`
- serialized `gru_weights`
- metrics summary

### 3. Live training lifecycle

After `init` or `sync` completes a successful import + rebuild:

1. Deno exports a snapshot for the active build
2. Deno updates `requested-build.json`
3. if no training lock exists, Deno spawns the async training runner and returns immediately
4. the Deno training runner loads the active build, trains/refreshes the custom GNN, and derives current leaf embeddings
5. the Deno training runner exports a GRU snapshot and launches the Node worker
6. the Node worker trains the GRU on the latest requested build
7. the Node worker writes a result artifact
8. Deno imports the result into KV only if the build is still current
9. if a newer build was requested while training ran, the runner loops once more

This preserves the "invisible async live training" behavior without allowing
stale models to overwrite newer builds.

### 4. Locking and staleness

The live worker is serialized per vault by `lock.json`.

Rules:

- one active training worker per vault
- a newer requested build supersedes an older requested build
- persisted weights must carry the `buildId` they were trained from
- Deno only imports a result if `result.buildId === active_build`

The watch daemon may exit on idle while training continues. That is acceptable
because training state is file-backed, not daemon-memory-only.

## Model design

### 1. Training inputs

The training graph remains DB-first and leaf-only:

- nodes = `tool_leaf_nodes`
- edges = `tool_leaf_edges_next`
- sequences = imported tool-call rows grouped by session

Leaf-only is unchanged:

- categories such as `tool.exec` remain taxonomy/projection only
- training uses the deepest available leaf key

### 2. GNN role

The GNN remains responsible for structural encoding.

Rules:

- seed embeddings are derived deterministically from DB-first leaf stats
- the custom GNN in `src/gnn` transforms those seeds using the `next` graph
- live training keeps the existing custom parameterization
- the GNN step is complete before GRU training begins

The GNN remains structurally motivated:

- shared level weights
- attention over neighbors
- residual mixing

But it is **not** rewritten into TF and is **not** optimized through the GRU
loss in this design.

### 3. GRU role

The GRU remains responsible for sequence prediction:

- one sequence per session
- top-level and subagent sessions both included
- no canonical flattening across parent/child sessions
- default training filter remains `min_calls >= 3`

The GRU consumes the current GNN output embeddings as its vocabulary node
representations.

### 4. Warm start

Both modules warm-start when compatible persisted weights exist:

- GNN from stored `gnn_params`
- GRU from stored `gru_weights`

If dimensions are incompatible, the worker falls back to initialization and
records that explicitly in metrics.

## Runtime components

### 1. Deno-side orchestration

New Deno-side responsibilities:

- export active training snapshot
- manage live training request/lock/result files
- spawn the Node worker
- import successful result artifacts into KV
- surface live training status through `init`, `sync`, and watch status

### 2. Deno-side training runner

A Deno live-training runner owns the custom GNN step.

Responsibilities:

- load the latest requested build from KV
- train/refresh the custom GNN
- persist `gnn_params`
- derive current leaf embeddings
- export the GRU snapshot for Node
- import completed GRU result artifacts into KV

### 3. Node-side worker

The Node worker runs with:

- Node 22
- `--experimental-transform-types`
- `@tensorflow/tfjs-node`

Responsibilities:

- load the latest requested snapshot
- deserialize warm-start GRU weights
- train the GRU from the provided leaf embeddings
- compute metrics
- serialize result artifacts
- release lock / continue if a newer build is queued

## Metrics

Live training metrics must be persisted separately from the heavy model blobs.

Minimum metrics:

- `runId`
- `buildId`
- `startedAt`
- `finishedAt`
- `durationMs`
- `gnnParamsSource`
- `gruWeightsSource`
- `gnnEpochs`
- `epochs`
- `exampleCount`
- `vocabSize`
- `avgLoss`
- `accuracy`
- `top3Accuracy`
- `mrr`
- `majorityNextBaseline`

These metrics are for evaluation notebooks and watch status summaries.

## Notebook role after the pivot

The notebooks stop being the primary training path.

- `05-topological-map.ipynb`
  - build stats and graph inspection
- `06-gnn-backprop-experiment.ipynb`
  - GNN stats/evaluation against persisted state
- `08-openclaw-gru-sequences.ipynb`
  - GRU dataset + metrics/evaluation against persisted state

They may inspect or compare runs, but they do not own live training.

## Error handling

### Import / rebuild

Unchanged from DB-first V1:

- parse failures warn+skip per file where already allowed
- rebuild promotion remains atomic via temporary build namespace

### Live training

Rules:

- snapshot export failure = fail current `init` / `sync`
- worker spawn failure = warn in result, but keep imported data intact
- GNN training failure = keep previous model weights intact
- worker training failure = keep previous model weights intact
- stale result import = discard result, keep latest requested build
- lock recovery = stale lock is recoverable if pid is no longer alive

Live training failure must never corrupt imported rows or the active
`training_data` build.

## Non-goals

Still out of scope:

- privacy/canonical export split
- federated/server sync
- replay UI
- direct Node access to Deno KV
- MLflow integration

## Implementation notes

- `tfjs-node` is used only in the GRU Node worker path
- shared serialization formats remain:
  - `src/gnn/infrastructure/params-codec.ts`
  - `src/gru/weights.ts`
- runtime inference continues to load weights from KV exactly as before
- watch/service status must grow explicit live-training fields instead of
  overloading the old `gruTrained` booleans
