# Vault Exec DB-First Training Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the legacy notes-based training flow in `lib/vault-exec` with a DB-first OpenClaw pipeline that stores full session/call context, rebuilds leaf training tables, keeps Markdown as projection only, and moves early GNN/GRU work into notebooks.

**Architecture:** Keep OpenClaw import as the canonical source, rebuild derived training tables from canonical imported rows on every `init` / `sync`, and stop using Markdown notes or legacy `getAllTraces()` for training. Training remains notebook-first until the new DB-first path is validated.

**Tech Stack:** Deno, Deno KV, existing `lib/vault-exec` ingest pipeline, Markdown projection under `tools/`, notebooks under `lib/vault-exec/notebooks`, TDD with `deno test`

---

### Task 1: Extend imported session/call storage for full context

**Files:**
- Modify: `lib/vault-exec/src/ingest/types.ts`
- Modify: `lib/vault-exec/src/ingest/parser.ts`
- Modify: `lib/vault-exec/src/ingest/local-store.ts`
- Modify: `lib/vault-exec/src/ingest/local-store_test.ts`
- Modify: `lib/vault-exec/src/ingest/facade_test.ts`

**Step 1: Write the failing tests**

Add tests that prove imported rows preserve:

- full session identity
- session kind (`top_level` / `subagent`) when detectable
- parent session metadata when available
- user / assistant / reasoning context around a call
- fallback metadata

**Step 2: Run test to verify it fails**

Run:

```bash
deno test --unstable-kv --allow-read --allow-write=/tmp \
  lib/vault-exec/src/ingest/local-store_test.ts \
  lib/vault-exec/src/ingest/facade_test.ts
```

Expected: fail because the current imported rows do not store all context.

**Step 3: Write minimal implementation**

Extend the imported session/tool-call rows and parser output only as far as
needed to preserve context for later notebooks.

**Step 4: Run test to verify it passes**

Run the same targeted tests.

Expected: pass.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/ingest/types.ts lib/vault-exec/src/ingest/parser.ts lib/vault-exec/src/ingest/local-store.ts lib/vault-exec/src/ingest/local-store_test.ts lib/vault-exec/src/ingest/facade_test.ts
git commit -m "feat(vault-exec): retain full openclaw import context"
```

### Task 2: Fix and document canonical leaf mapping

**Files:**
- Modify: `lib/vault-exec/src/ingest/tool-graph/naming.ts`
- Modify: `lib/vault-exec/src/ingest/tool-graph/naming_test.ts` or `entities_test.ts`
- Modify: `lib/vault-exec/src/ingest/tool-graph/contract.md`
- Modify: `lib/vault-exec/src/ingest/readme.md`

**Step 1: Write the failing test**

Cover:

- hit L2 -> `tool.<toolName>.<family>`
- fallback -> `tool.<toolName>.fallback`
- dotted tool names normalize to `_`
- no fallback reason expansion into the canonical key

**Step 2: Run test to verify it fails**

Run:

```bash
deno test --allow-read --allow-write=/tmp \
  lib/vault-exec/src/ingest/tool-graph/entities_test.ts
```

Expected: fail if the mapping contract is not fully explicit.

**Step 3: Write minimal implementation**

Keep the mapping centralized and deterministic in the naming layer.

**Step 4: Run test to verify it passes**

Run the same targeted test.

Expected: pass.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/ingest/tool-graph/naming.ts lib/vault-exec/src/ingest/tool-graph/contract.md lib/vault-exec/src/ingest/readme.md lib/vault-exec/src/ingest/tool-graph/entities_test.ts
git commit -m "fix(vault-exec): lock canonical leaf key mapping"
```

### Task 3: Add full rebuild of derived training tables

**Files:**
- Create: `lib/vault-exec/src/training-data/rebuild.ts`
- Create: `lib/vault-exec/src/training-data/rebuild_test.ts`
- Create: `lib/vault-exec/src/training-data/readme.md`
- Create: `lib/vault-exec/src/training-data/contract.md`
- Modify: `lib/vault-exec/src/architecture_test.ts`
- Modify: `lib/vault-exec/src/ingest/pipeline.ts`
- Modify: `lib/vault-exec/src/ingest/pipeline_test.ts`

**Step 1: Write the failing tests**

Cover:

- rebuild from canonical imported rows produces `tool_leaf_nodes`
- rebuild from canonical imported rows produces `tool_leaf_edges_next`
- rebuild from canonical imported rows produces `session_sequences`
- rebuild clears and replaces prior derived state
- only leaf nodes participate in sequences and `next` edges

**Step 2: Run test to verify it fails**

Run:

```bash
deno test --unstable-kv --allow-read --allow-write=/tmp \
  lib/vault-exec/src/training-data/rebuild_test.ts \
  lib/vault-exec/src/ingest/pipeline_test.ts
```

Expected: fail because the rebuild layer does not exist.

**Step 3: Write minimal implementation**

Implement a full rebuild strategy from canonical imported rows. Do not attempt
incremental edge deltas.

**Step 4: Run test to verify it passes**

Run the same targeted tests.

Expected: pass.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/training-data/rebuild.ts lib/vault-exec/src/training-data/rebuild_test.ts lib/vault-exec/src/training-data/readme.md lib/vault-exec/src/training-data/contract.md lib/vault-exec/src/architecture_test.ts lib/vault-exec/src/ingest/pipeline.ts lib/vault-exec/src/ingest/pipeline_test.ts
git commit -m "feat(vault-exec): rebuild db-first training tables"
```

### Task 4: Remove legacy auto-training from init and sync

**Files:**
- Modify: `lib/vault-exec/src/workflows/init.ts`
- Modify: `lib/vault-exec/src/service/sync-worker.ts`
- Modify: `lib/vault-exec/src/workflows/init-trace-ingest_test.ts`
- Modify: `lib/vault-exec/src/service/sync-worker_trace_test.ts`
- Modify: `lib/vault-exec/src/workflows/readme.md`

**Step 1: Write the failing tests**

Cover:

- `init` imports + rebuilds derived DB tables + projects notes
- `init` no longer auto-runs legacy note-based GNN/GRU training
- `sync` imports + rebuilds derived DB tables + projects notes
- `sync` no longer depends on legacy runtime retraining

**Step 2: Run test to verify it fails**

Run:

```bash
deno test --unstable-kv --allow-read --allow-write=/tmp \
  lib/vault-exec/src/workflows/init-trace-ingest_test.ts \
  lib/vault-exec/src/service/sync-worker_trace_test.ts
```

Expected: fail because the legacy training path is still wired in.

**Step 3: Write minimal implementation**

Change `init` / `sync` to stop after:

- import
- derived-table rebuild
- projection

Leave training to notebooks for this phase.

**Step 4: Run test to verify it passes**

Run the same targeted tests.

Expected: pass.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/workflows/init.ts lib/vault-exec/src/service/sync-worker.ts lib/vault-exec/src/workflows/init-trace-ingest_test.ts lib/vault-exec/src/service/sync-worker_trace_test.ts lib/vault-exec/src/workflows/readme.md
git commit -m "refactor(vault-exec): stop auto-training during init and sync"
```

### Task 5: Mark CLI retrain as legacy and redirect training to notebooks

**Files:**
- Modify: `lib/vault-exec/src/workflows/retrain.ts`
- Modify: `lib/vault-exec/src/cli.ts`
- Modify: `lib/vault-exec/src/service/protocol.ts`
- Modify: `lib/vault-exec/src/service/protocol_test.ts`
- Modify: `lib/vault-exec/src/workflows/contract.md`

**Step 1: Write the failing tests**

Cover:

- `retrain` is explicitly legacy or disabled for the old notes-based path
- CLI output makes notebook-first training explicit
- protocol remains machine-readable and non-ambiguous

**Step 2: Run test to verify it fails**

Run:

```bash
deno test --unstable-kv --allow-read --allow-write=/tmp \
  lib/vault-exec/src/service/protocol_test.ts
```

Expected: fail because the retrain semantics still imply legacy runtime
training.

**Step 3: Write minimal implementation**

Either:

- disable legacy retrain with an explicit message

or:

- make it a stub that clearly says notebook-first training is the supported
  path for now

Keep the behavior deterministic and explicit.

**Step 4: Run test to verify it passes**

Run the same targeted test.

Expected: pass.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/workflows/retrain.ts lib/vault-exec/src/cli.ts lib/vault-exec/src/service/protocol.ts lib/vault-exec/src/service/protocol_test.ts lib/vault-exec/src/workflows/contract.md
git commit -m "chore(vault-exec): mark legacy retrain flow inactive"
```

### Task 6: Add notebook-first inspection and training entrypoints

**Files:**
- Create: `lib/vault-exec/notebooks/05-openclaw-db-inspection.ipynb`
- Create: `lib/vault-exec/notebooks/06-openclaw-next-graph.ipynb`
- Create: `lib/vault-exec/notebooks/07-openclaw-gru-sequences.ipynb`
- Modify: `lib/vault-exec/notebooks/readme.md` if present
- Modify: `lib/vault-exec/src/ingest/readme.md`

**Step 1: Add notebook scaffolds**

Each notebook should start with deterministic data loading from `vault.kv`.

**Step 2: Make the notebooks prove useful**

Cover:

- canonical session/call counts
- top-level vs subagent distribution
- fallback distribution
- `next` edge distribution
- sequence-length filtering (`min_calls >= 3`)

**Step 3: Run notebook execution smoke tests**

Use the existing notebook execution pattern already used in this repo.

Expected: notebooks execute successfully against a local demo vault.

**Step 4: Commit**

```bash
git add lib/vault-exec/notebooks/05-openclaw-db-inspection.ipynb lib/vault-exec/notebooks/06-openclaw-next-graph.ipynb lib/vault-exec/notebooks/07-openclaw-gru-sequences.ipynb lib/vault-exec/src/ingest/readme.md
git commit -m "feat(vault-exec): add db-first training notebooks"
```

### Task 7: Final docs and validation

**Files:**
- Modify: `lib/vault-exec/src/ingest/contract.md`
- Modify: `lib/vault-exec/src/ingest/readme.md`
- Modify: `lib/vault-exec/src/workflows/readme.md`
- Modify: `lib/vault-exec/src/workflows/contract.md`
- Modify: `docs/plans/2026-03-06-vault-exec-db-first-training-design.md`

**Step 1: Align docs with final behavior**

Make sure docs state clearly:

- DB-first source of truth
- Markdown projection only
- leaf-only training units
- notebooks-first training
- legacy retrain not active

**Step 2: Run full high-signal suite**

Run:

```bash
deno test --unstable-kv --allow-read --allow-write=/tmp \
  lib/vault-exec/src/architecture_test.ts \
  lib/vault-exec/src/config/trace-config_test.ts \
  lib/vault-exec/src/infrastructure/fs/deno-vault-fs_test.ts \
  lib/vault-exec/src/ingest/source-state_test.ts \
  lib/vault-exec/src/ingest/local-store_test.ts \
  lib/vault-exec/src/ingest/pipeline_test.ts \
  lib/vault-exec/src/ingest/tool-graph/entities_test.ts \
  lib/vault-exec/src/ingest/tool-graph/projection_test.ts \
  lib/vault-exec/src/ingest/policy_test.ts \
  lib/vault-exec/src/workflows/init-trace-ingest_test.ts \
  lib/vault-exec/src/service/sync-worker_trace_test.ts \
  lib/vault-exec/src/service/protocol_test.ts
```

Expected: pass.

**Step 3: Commit**

```bash
git add lib/vault-exec/src/ingest/contract.md lib/vault-exec/src/ingest/readme.md lib/vault-exec/src/workflows/readme.md lib/vault-exec/src/workflows/contract.md docs/plans/2026-03-06-vault-exec-db-first-training-design.md
git commit -m "docs(vault-exec): align db-first training migration"
```
