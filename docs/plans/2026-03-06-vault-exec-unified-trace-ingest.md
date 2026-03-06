# Vault Exec Unified Trace Ingest Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `vault-exec init` and `vault-exec sync` import configured OpenClaw traces incrementally and project stable AX nodes into the demo vault, using one local operational store.

**Architecture:** Keep the already landed config/state foundation, then connect a single local ingest pipeline to the current `init` / `sync` flow. Defer dual-store privacy/export architecture until there is a real remote consumer.

**Tech Stack:** Deno, existing `lib/vault-exec` ingest/parser modules, current local KV store, Markdown projection writers, TDD with `deno test`

---

## Scope correction

This plan is intentionally reduced to V1 user value.

Explicitly out of scope:

- separate `private` / `canonical` stores
- export-ready anonymization pipeline
- server/federation export
- replay UI

Already completed baseline:

- `Task 1` config loader
- `Task 2` incremental source scan state

---

### Task 1: Baseline validation of existing foundation

**Files:**
- Verify: `lib/vault-exec/src/config/trace-config.ts`
- Verify: `lib/vault-exec/src/config/trace-config_test.ts`
- Verify: `lib/vault-exec/src/ingest/source-state.ts`
- Verify: `lib/vault-exec/src/ingest/source-state_test.ts`
- Verify: `lib/vault-exec/src/ingest/test-fixtures.ts`

**Step 1: Run targeted foundation tests**

Run:

```bash
deno test --allow-read --allow-write=/tmp \
  lib/vault-exec/src/config/trace-config_test.ts \
  lib/vault-exec/src/ingest/source-state_test.ts
```

Expected: pass.

**Step 2: Run high-signal regression suite**

Run the standard high-signal `lib/vault-exec` suite currently used during this
branch cleanup.

Expected: pass.

**Step 3: Commit only if fixes are needed**

If no fixes are needed, no commit for this task.

### Task 2: Add a single local unified import pipeline

**Files:**
- Create: `lib/vault-exec/src/ingest/pipeline.ts`
- Create: `lib/vault-exec/src/ingest/pipeline_test.ts`
- Modify: `lib/vault-exec/src/ingest/parser.ts`
- Modify: `lib/vault-exec/src/ingest/ingest.ts`
- Modify: `lib/vault-exec/src/ingest/types.ts`

**Step 1: Write the failing test**

Cover:

- multiple configured sources
- incremental skip of unchanged files
- import of changed files only
- local store write/update only, no dual-store abstraction
- standalone `ingest` regression through shared logic
- e2e smoke path: config -> JSONL -> local store -> projection inputs -> second
  run no-op
- malformed file/session warn+skip behavior

**Step 2: Run test to verify it fails**

Run: `deno test --unstable-kv --allow-read --allow-write=/tmp lib/vault-exec/src/ingest/pipeline_test.ts`

Expected: fail because the unified pipeline does not exist.

**Step 3: Write minimal implementation**

Compose:

- config loading
- incremental source scan
- OpenClaw parse
- local trace persistence/update
- AX aggregation inputs for projection

Do not introduce separate `private` / `canonical` store layers in V1.

**Step 4: Run test to verify it passes**

Run: `deno test --unstable-kv --allow-read --allow-write=/tmp lib/vault-exec/src/ingest/pipeline_test.ts`

Expected: pass.

**Step 5: Run high-signal regression suite**

Run the standard `lib/vault-exec` high-signal suite.

Expected: pass.

**Step 6: Commit**

```bash
git add lib/vault-exec/src/ingest/pipeline.ts lib/vault-exec/src/ingest/pipeline_test.ts lib/vault-exec/src/ingest/parser.ts lib/vault-exec/src/ingest/ingest.ts lib/vault-exec/src/ingest/types.ts
git commit -m "feat(vault-exec): unify incremental local trace import"
```

### Task 3: Add AX node projection for Obsidian

**Files:**
- Create: `lib/vault-exec/src/ingest/ax-entities.ts`
- Create: `lib/vault-exec/src/ingest/ax-naming.ts`
- Create: `lib/vault-exec/src/ingest/ax-entities_test.ts`
- Create: `lib/vault-exec/src/ingest/ax-projection.ts`
- Create: `lib/vault-exec/src/ingest/ax-projection_test.ts`
- Modify: `lib/vault-exec/src/infrastructure/fs/deno-vault-fs.ts`

**Step 1: Write the failing tests**

Cover:

- explicit `toolName` / family -> AX key mapping
- dotted canonical AX key generation (`tool.exec.git_vcs`)
- parent/child derivation
- note path placement under `ax/l1/`, `ax/l2/`, `ax/l3/`
- deterministic overwrite and idempotent reprojection
- metadata aggregation by source/session occurrence inside the node note

**Step 2: Run tests to verify they fail**

Run:

```bash
deno test --allow-read --allow-write=/tmp \
  lib/vault-exec/src/ingest/ax-entities_test.ts \
  lib/vault-exec/src/ingest/ax-projection_test.ts
```

Expected: fail because the derivation/projection modules do not exist.

**Step 3: Write minimal implementation**

Implement:

- explicit AX naming map
- AX entity derivation from locally imported traces
- Markdown note renderer/writer for the demo vault projection

Keep projection focused on stable AX nodes only. No session notes.

**Step 4: Run tests to verify they pass**

Run the same targeted tests.

Expected: pass.

**Step 5: Run high-signal regression suite**

Run the standard `lib/vault-exec` high-signal suite.

Expected: pass.

**Step 6: Commit**

```bash
git add lib/vault-exec/src/ingest/ax-entities.ts lib/vault-exec/src/ingest/ax-naming.ts lib/vault-exec/src/ingest/ax-entities_test.ts lib/vault-exec/src/ingest/ax-projection.ts lib/vault-exec/src/ingest/ax-projection_test.ts lib/vault-exec/src/infrastructure/fs/deno-vault-fs.ts
git commit -m "feat(vault-exec): project stable AX nodes into markdown"
```

### Task 4: Integrate the unified import/projection pipeline into `init` and `sync`

**Files:**
- Modify: `lib/vault-exec/src/cli.ts`
- Modify: `lib/vault-exec/src/workflows/init.ts`
- Modify: `lib/vault-exec/src/service/sync-worker.ts`
- Modify: `lib/vault-exec/src/service/protocol.ts`
- Modify: `lib/vault-exec/src/service/protocol_test.ts`
- Create: `lib/vault-exec/src/workflows/init-trace-ingest_test.ts`
- Create: `lib/vault-exec/src/service/sync-worker_trace_test.ts`

**Step 1: Write the failing tests**

Cover:

- `init` imports traces only after successful preflight and before `initVault()`
- `sync` imports changed files only before retrain
- inaccessible source warns and continues
- import counters are reflected in `SyncResponse`
- standalone `ingest` still works after the refactor

**Step 2: Run tests to verify they fail**

Run:

```bash
deno test --unstable-kv --allow-read --allow-write=/tmp \
  lib/vault-exec/src/workflows/init-trace-ingest_test.ts \
  lib/vault-exec/src/service/sync-worker_trace_test.ts \
  lib/vault-exec/src/service/protocol_test.ts
```

Expected: fail because `init` / `sync` do not call the new pipeline yet.

**Step 3: Write minimal implementation**

Integrate the unified local pipeline:

- `init`: after preflight, before `initVault()`
- `sync`: before current retrain flow

Keep behavior robust:

- source access errors -> warn+skip
- local store failures -> fail-fast
- projection failures -> warn+continue

**Step 4: Run tests to verify they pass**

Run the same targeted tests.

Expected: pass.

**Step 5: Run high-signal regression suite**

Run the standard `lib/vault-exec` high-signal suite.

Expected: pass.

**Step 6: Commit**

```bash
git add lib/vault-exec/src/cli.ts lib/vault-exec/src/workflows/init.ts lib/vault-exec/src/service/sync-worker.ts lib/vault-exec/src/service/protocol.ts lib/vault-exec/src/service/protocol_test.ts lib/vault-exec/src/workflows/init-trace-ingest_test.ts lib/vault-exec/src/service/sync-worker_trace_test.ts
git commit -m "feat(vault-exec): ingest traces during init and sync"
```

### Task 5: Update docs and full validation

**Files:**
- Modify: `lib/vault-exec/src/ingest/readme.md`
- Modify: `lib/vault-exec/src/ingest/contract.md`
- Modify: `lib/vault-exec/src/service/readme.md`
- Modify: `lib/vault-exec/src/workflows/readme.md`
- Modify: `lib/vault-exec/docs/2026-03-05-ax-coding-refactor-plan.md`

**Step 1: Add any final regression tests if docs expose missing behavior**

Only add tests if documentation would otherwise overclaim.

**Step 2: Run focused validation**

Run the new targeted tests plus the existing high-signal suite.

Expected: pass.

**Step 3: Update docs**

Document:

- config format
- source scan state
- single local store semantics for V1
- AX projection model
- `init` / `sync` semantics after unification
- `ingest` standalone semantics after refactor

**Step 4: Commit**

```bash
git add lib/vault-exec/src/ingest/readme.md lib/vault-exec/src/ingest/contract.md lib/vault-exec/src/service/readme.md lib/vault-exec/src/workflows/readme.md lib/vault-exec/docs/2026-03-05-ax-coding-refactor-plan.md
git commit -m "docs(vault-exec): document unified local trace ingest"
```
