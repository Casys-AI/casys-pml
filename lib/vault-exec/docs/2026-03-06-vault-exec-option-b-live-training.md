# Vault Exec Live Training Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reintroduce async live training for `lib/vault-exec` by rebuilding DB-first data in Deno, running the custom GNN live path on the active build, training the GRU in a Node `tfjs-node` worker, importing the resulting weights back into `vault.kv`, and turning notebooks into stats/evaluation views.

**Architecture:** Deno keeps ownership of OpenClaw import, rebuild, projection, `vault.kv`, and the custom GNN step. A file-backed live-training subsystem serializes one runner per vault, exports deterministic GRU snapshots, and spawns a Node 22 worker that trains the GRU with `tfjs-node` and returns serialized artifacts for Deno to persist.

**Tech Stack:** Deno, Deno KV, Node 22 `--experimental-transform-types`, `@tensorflow/tfjs-node`, existing `src/gnn` and `src/gru` serialization formats, TDD with `deno test`

---

### Task 1: Add a file-backed live-training state and snapshot layer

**Files:**
- Create: `lib/vault-exec/src/live-training/readme.md`
- Create: `lib/vault-exec/src/live-training/contract.md`
- Create: `lib/vault-exec/src/live-training/state.ts`
- Create: `lib/vault-exec/src/live-training/state_test.ts`
- Create: `lib/vault-exec/src/live-training/snapshot.ts`
- Create: `lib/vault-exec/src/live-training/snapshot_test.ts`
- Modify: `lib/vault-exec/src/architecture_test.ts`

**Step 1: Write the failing tests**

Cover:

- deterministic live-training state dir resolution under `.vault-exec`
- `requested-build.json` round-trip
- lock create/read/release behavior
- snapshot export writes active build rows plus optional warm-start blobs
- stale or malformed snapshot files fail explicitly

**Step 2: Run test to verify it fails**

Run:

```bash
deno test --unstable-kv --allow-read --allow-write=/tmp \
  lib/vault-exec/src/live-training/state_test.ts \
  lib/vault-exec/src/live-training/snapshot_test.ts \
  lib/vault-exec/src/architecture_test.ts
```

Expected: fail because the live-training slice does not exist yet.

**Step 3: Write minimal implementation**

Implement:

- `.vault-exec/live-training/` paths
- requested-build, lock, snapshot, result, metrics helpers
- snapshot export from active `training_data` rows + imported tool calls

Do not spawn Node or persist weights yet.

**Step 4: Run test to verify it passes**

Run the same targeted tests.

Expected: pass.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/live-training/readme.md lib/vault-exec/src/live-training/contract.md lib/vault-exec/src/live-training/state.ts lib/vault-exec/src/live-training/state_test.ts lib/vault-exec/src/live-training/snapshot.ts lib/vault-exec/src/live-training/snapshot_test.ts lib/vault-exec/src/architecture_test.ts
git commit -m "feat(vault-exec): add live training snapshot state"
```

### Task 2: Add a Node-compatible training artifact bridge

**Files:**
- Create: `lib/vault-exec/src/live-training/result.ts`
- Create: `lib/vault-exec/src/live-training/result_test.ts`
- Modify: `lib/vault-exec/src/gnn/infrastructure/params-codec.ts`
- Modify: `lib/vault-exec/src/gru/weights.ts`
- Modify: `lib/vault-exec/src/live-training/readme.md`

**Step 1: Write the failing tests**

Cover:

- snapshot/result files can be serialized and deserialized across runtimes
- GNN params blob and GRU weights blob survive the round-trip
- result artifacts include `buildId`, `runId`, and metrics metadata
- stale result import is detectable before persistence

**Step 2: Run test to verify it fails**

Run:

```bash
deno test --unstable-kv --allow-read --allow-write=/tmp \
  lib/vault-exec/src/live-training/result_test.ts
```

Expected: fail because the result bridge does not exist.

**Step 3: Write minimal implementation**

Add a stable cross-runtime artifact shape that both Deno and Node can read.

Keep the persisted model formats compatible with:

- `saveGnnParams()`
- `saveGruWeights()`

**Step 4: Run test to verify it passes**

Run the same targeted test.

Expected: pass.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/live-training/result.ts lib/vault-exec/src/live-training/result_test.ts lib/vault-exec/src/gnn/infrastructure/params-codec.ts lib/vault-exec/src/gru/weights.ts lib/vault-exec/src/live-training/readme.md
git commit -m "feat(vault-exec): add cross-runtime training result bridge"
```

### Task 3: Add a Deno live-training runner for the custom GNN

**Files:**
- Create: `lib/vault-exec/src/live-training/node-gnn.ts`
- Create: `lib/vault-exec/src/live-training/node-gnn_test.ts`
- Create: `lib/vault-exec/src/live-training/runner.ts`
- Create: `lib/vault-exec/src/live-training/runner_test.ts`
- Modify: `lib/vault-exec/src/training-data/model-inputs.ts`
- Modify: `lib/vault-exec/src/live-training/contract.md`

**Step 1: Write the failing tests**

Cover:

- live-training runner can load the active build and the latest `gnn_params`
- custom GNN train/forward results in one embedding per graph node
- runner can persist updated `gnn_params`
- runner can export a GRU snapshot with current leaf embeddings

**Step 2: Run test to verify it fails**

Run:

```bash
deno test --unstable-kv --allow-read --allow-write=/tmp \
  lib/vault-exec/src/live-training/node-gnn_test.ts \
  lib/vault-exec/src/live-training/runner_test.ts
```

Expected: fail because the live-training runner does not exist.

**Step 3: Write minimal implementation**

Implement a Deno live-training runner around the existing custom GNN:

- load active rows from KV
- warm-start `gnn_params`
- run custom GNN training/forward
- export current leaf embeddings for the GRU worker

**Step 4: Run test to verify it passes**

Run the same targeted test.

Expected: pass.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/live-training/node-gnn.ts lib/vault-exec/src/live-training/node-gnn_test.ts lib/vault-exec/src/live-training/runner.ts lib/vault-exec/src/live-training/runner_test.ts lib/vault-exec/src/training-data/model-inputs.ts lib/vault-exec/src/live-training/contract.md
git commit -m "feat(vault-exec): add custom gnn live training runner"
```

### Task 4: Add a Node `tfjs-node` GRU worker fed by live GNN embeddings

**Files:**
- Create: `lib/vault-exec/src/live-training/node-worker.ts`
- Create: `lib/vault-exec/src/live-training/node-worker_test.ts`
- Create: `lib/vault-exec/src/live-training/node-gru.ts`
- Create: `lib/vault-exec/src/live-training/node-gru_test.ts`
- Modify: `lib/vault-exec/package.json`
- Modify: `lib/vault-exec/package-lock.json`
- Modify: `lib/vault-exec/src/training-data/contract.md`
- Modify: `lib/vault-exec/src/live-training/readme.md`

**Step 1: Write the failing tests**

Cover:

- GNN-produced snapshot -> GRU training -> result artifact round-trip
- warm-start GRU weights are reused when compatible
- metrics include `avgLoss`, `accuracy`, `top3Accuracy`, `mrr`, baseline
- `min_calls >= 3` filtering remains respected

**Step 2: Run test to verify it fails**

Run:

```bash
deno test --allow-read --allow-write=/tmp \
  lib/vault-exec/src/live-training/node-gru_test.ts \
  lib/vault-exec/src/live-training/node-worker_test.ts
```

Expected: fail because the GRU worker does not exist.

**Step 3: Write minimal implementation**

Implement:

- Node worker entrypoint using `node --experimental-transform-types`
- `tfjs-node` backend for the GRU path
- GRU training on the provided leaf embeddings
- result artifact emission

Do not hook it into `init` / `sync` yet.

**Step 4: Run test to verify it passes**

Run the same targeted tests.

Expected: pass.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/live-training/node-worker.ts lib/vault-exec/src/live-training/node-worker_test.ts lib/vault-exec/src/live-training/node-gru.ts lib/vault-exec/src/live-training/node-gru_test.ts lib/vault-exec/package.json lib/vault-exec/package-lock.json lib/vault-exec/src/training-data/contract.md lib/vault-exec/src/live-training/readme.md
git commit -m "feat(vault-exec): train gru in node from live gnn embeddings"
```

### Task 5: Reconnect init/sync/watch to async live training

**Files:**
- Modify: `lib/vault-exec/src/workflows/init.ts`
- Modify: `lib/vault-exec/src/workflows/init-trace-ingest_test.ts`
- Modify: `lib/vault-exec/src/service/sync-worker.ts`
- Modify: `lib/vault-exec/src/service/sync-worker_trace_test.ts`
- Modify: `lib/vault-exec/src/service/daemon.ts`
- Modify: `lib/vault-exec/src/service/protocol.ts`
- Modify: `lib/vault-exec/src/service/protocol_test.ts`
- Modify: `lib/vault-exec/src/service/readme.md`
- Modify: `lib/vault-exec/src/service/contract.md`
- Modify: `lib/vault-exec/src/workflows/readme.md`

**Step 1: Write the failing tests**

Cover:

- `init` exports a snapshot and enqueues live training after rebuild
- `sync` exports a snapshot and enqueues live training after rebuild
- service status exposes live training state
- stale result artifacts are rejected when build ids differ
- sync response reports whether training was enqueued

**Step 2: Run test to verify it fails**

Run:

```bash
deno test --unstable-kv --allow-read --allow-write=/tmp --allow-run \
  lib/vault-exec/src/workflows/init-trace-ingest_test.ts \
  lib/vault-exec/src/service/sync-worker_trace_test.ts \
  lib/vault-exec/src/service/protocol_test.ts
```

Expected: fail because runtime training is still notebook-first.

**Step 3: Write minimal implementation**

Hook the live-training subsystem after import + rebuild.

Requirements:

- do not block `init` / `sync` on full training completion
- export snapshot and update request state deterministically
- spawn the Node worker only when no active lock exists
- import completed result artifacts opportunistically before or after enqueue

**Step 4: Run test to verify it passes**

Run the same targeted tests.

Expected: pass.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/workflows/init.ts lib/vault-exec/src/workflows/init-trace-ingest_test.ts lib/vault-exec/src/service/sync-worker.ts lib/vault-exec/src/service/sync-worker_trace_test.ts lib/vault-exec/src/service/daemon.ts lib/vault-exec/src/service/protocol.ts lib/vault-exec/src/service/protocol_test.ts lib/vault-exec/src/service/readme.md lib/vault-exec/src/service/contract.md lib/vault-exec/src/workflows/readme.md
git commit -m "feat(vault-exec): reconnect async live training"
```

### Task 6: Convert notebooks 06 and 08 into stats/evaluation notebooks

**Files:**
- Modify: `lib/vault-exec/notebooks/06-gnn-backprop-experiment.ipynb`
- Modify: `lib/vault-exec/notebooks/08-openclaw-gru-sequences.ipynb`
- Modify: `lib/vault-exec/notebooks/INDEX.md`
- Modify: `lib/vault-exec/src/training-data/readme.md`

**Step 1: Update the notebooks**

Change the notebooks so they:

- read persisted weights/results from KV and live-training artifacts
- compute metrics without retraining by default
- show baseline vs current model metrics
- display run/build metadata and drift stats

**Step 2: Execute notebook checks**

Run:

```bash
cd lib/vault-exec
IPYTHONDIR=/tmp/.ipython jupyter nbconvert --to notebook --execute --inplace notebooks/05-topological-map.ipynb
IPYTHONDIR=/tmp/.ipython jupyter nbconvert --to notebook --execute --inplace notebooks/06-gnn-backprop-experiment.ipynb
IPYTHONDIR=/tmp/.ipython jupyter nbconvert --to notebook --execute --inplace notebooks/08-openclaw-gru-sequences.ipynb
```

Expected: all execute successfully against the active DB-first build.

**Step 3: Commit**

```bash
git add lib/vault-exec/notebooks/06-gnn-backprop-experiment.ipynb lib/vault-exec/notebooks/08-openclaw-gru-sequences.ipynb lib/vault-exec/notebooks/INDEX.md lib/vault-exec/src/training-data/readme.md
git commit -m "docs(vault-exec): turn training notebooks into eval views"
```

### Task 7: End-to-end validation on demo-vault

**Files:**
- Modify if needed: `lib/vault-exec/demo-vault/.vault-exec/config.json`
- Verify generated artifacts under: `lib/vault-exec/demo-vault/.vault-exec/`

**Step 1: Run the real flow**

Run:

```bash
cd lib/vault-exec
deno task cli init ./demo-vault
deno task cli sync ./demo-vault
```

Expected:

- OpenClaw import runs
- derived tables rebuild
- live training snapshot is exported
- Node worker runs asynchronously
- `gnn_params` and `gru_weights` end up persisted in KV for the active build

**Step 2: Verify outputs**

Check:

- active build id
- latest live-training metrics
- `run --intent` can still load the saved GRU weights
- notebooks 05/06/08 load the same persisted state without retraining

**Step 3: Commit**

```bash
git add docs/plans/2026-03-06-vault-exec-option-b-live-training-design.md docs/plans/2026-03-06-vault-exec-option-b-live-training.md
git commit -m "docs(vault-exec): add option b live training plan"
```
