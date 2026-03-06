# Vault Exec Unified Trace Ingest Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `vault-exec init` and `vault-exec sync` ingest configured OpenClaw sources incrementally, write private and canonical traces, project stable AX nodes into the demo vault, then continue the existing model/index flow.

**Architecture:** Add a new trace-ingest pipeline in `lib/vault-exec` with explicit config loading, source scan state, privacy normalization, canonical AX entity derivation, and Markdown projection. Integrate that pipeline ahead of the current `init`/`sync` flows without rewriting the existing vault indexing/retraining modules.

**Tech Stack:** Deno, Deno KV, existing `lib/vault-exec` ingest/parser modules, local Markdown projection writers, TDD with `deno test`

---

### Task 1: Add config contracts and loader

**Files:**
- Create: `lib/vault-exec/src/config/trace-config.ts`
- Create: `lib/vault-exec/src/config/trace-config_test.ts`
- Modify: `lib/vault-exec/src/service/lifecycle.ts`

**Step 1: Write the failing test**

Add tests covering:

- missing config -> empty trace source list
- valid `.vault-exec/config.json` -> parsed `traceSources`
- invalid JSON -> deterministic machine-readable error
- unsupported source kind -> validation error

**Step 2: Run test to verify it fails**

Run: `deno test --allow-read --allow-write=/tmp lib/vault-exec/src/config/trace-config_test.ts`

Expected: fail because the config loader module does not exist yet.

**Step 3: Write minimal implementation**

Implement:

- `TraceSourceConfig`
- `TraceConfig`
- `loadTraceConfig(vaultPath)`
- `resolveVaultExecConfigPath(vaultPath)`

Keep schema minimal: only `openclaw` sources in V1.

**Step 4: Run test to verify it passes**

Run: `deno test --allow-read --allow-write=/tmp lib/vault-exec/src/config/trace-config_test.ts`

Expected: pass.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/config/trace-config.ts lib/vault-exec/src/config/trace-config_test.ts lib/vault-exec/src/service/lifecycle.ts
git commit -m "feat(vault-exec): add trace source config loader"
```

### Task 2: Add source scan state for incremental import

**Files:**
- Create: `lib/vault-exec/src/ingest/source-state.ts`
- Create: `lib/vault-exec/src/ingest/source-state_test.ts`

**Step 1: Write the failing test**

Cover:

- empty state file -> empty snapshot map
- file metadata capture: path, size, `mtime`, content hash
- changed file detection
- unchanged file skip detection

**Step 2: Run test to verify it fails**

Run: `deno test --allow-read --allow-write=/tmp lib/vault-exec/src/ingest/source-state_test.ts`

Expected: fail because the module does not exist.

**Step 3: Write minimal implementation**

Implement:

- source file fingerprint structure
- `loadSourceScanState()`
- `saveSourceScanState()`
- `scanSourceFilesForChanges()`

Persist state under `<vault>/.vault-exec/`.

**Step 4: Run test to verify it passes**

Run: `deno test --allow-read --allow-write=/tmp lib/vault-exec/src/ingest/source-state_test.ts`

Expected: pass.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/ingest/source-state.ts lib/vault-exec/src/ingest/source-state_test.ts
git commit -m "feat(vault-exec): track incremental source scan state"
```

### Task 3: Add autonomous privacy/anonymization slice

**Files:**
- Create: `lib/vault-exec/src/ingest/privacy/pii-detector.ts`
- Create: `lib/vault-exec/src/ingest/privacy/anonymize.ts`
- Create: `lib/vault-exec/src/ingest/privacy/anonymize_test.ts`
- Modify: `lib/vault-exec/deno.json`

**Step 1: Write the failing test**

Cover:

- email redaction
- username/path redaction
- host/url tokenization
- command/text normalization keeps useful AX structure while removing identifiers

**Step 2: Run test to verify it fails**

Run: `deno test --allow-read lib/vault-exec/src/ingest/privacy/anonymize_test.ts`

Expected: fail because privacy modules do not exist yet.

**Step 3: Write minimal implementation**

Implement an autonomous privacy layer in `lib/vault-exec`:

- local detector utilities
- anonymizer for raw tool args / text fragments
- normalized canonical payload builder

If `validator.js` is needed, add it directly in `lib/vault-exec` imports instead
of depending on the repo-level sandbox module.

**Step 4: Run test to verify it passes**

Run: `deno test --allow-read lib/vault-exec/src/ingest/privacy/anonymize_test.ts`

Expected: pass.

**Step 5: Commit**

```bash
git add lib/vault-exec/deno.json lib/vault-exec/src/ingest/privacy/pii-detector.ts lib/vault-exec/src/ingest/privacy/anonymize.ts lib/vault-exec/src/ingest/privacy/anonymize_test.ts
git commit -m "feat(vault-exec): add autonomous trace anonymization"
```

### Task 4: Add private and canonical trace stores

**Files:**
- Create: `lib/vault-exec/src/ingest/store/private-trace-store.ts`
- Create: `lib/vault-exec/src/ingest/store/canonical-trace-store.ts`
- Create: `lib/vault-exec/src/ingest/store/trace-store_test.ts`
- Modify: `lib/vault-exec/src/service/lifecycle.ts`

**Step 1: Write the failing test**

Cover:

- private store writes/reloads replay records
- canonical store writes/reloads normalized records
- stores are physically separate
- canonical dedup by canonical fingerprint

**Step 2: Run test to verify it fails**

Run: `deno test --unstable-kv --allow-read --allow-write=/tmp lib/vault-exec/src/ingest/store/trace-store_test.ts`

Expected: fail because stores do not exist.

**Step 3: Write minimal implementation**

Implement:

- private trace store path resolution
- global canonical store path resolution
- basic read/write APIs
- canonical fingerprint dedup

Keep schema narrow; do not build replay UI abstractions yet.

**Step 4: Run test to verify it passes**

Run: `deno test --unstable-kv --allow-read --allow-write=/tmp lib/vault-exec/src/ingest/store/trace-store_test.ts`

Expected: pass.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/ingest/store/private-trace-store.ts lib/vault-exec/src/ingest/store/canonical-trace-store.ts lib/vault-exec/src/ingest/store/trace-store_test.ts lib/vault-exec/src/service/lifecycle.ts
git commit -m "feat(vault-exec): add private and canonical trace stores"
```

### Task 5: Derive stable AX entities from canonical traces

**Files:**
- Create: `lib/vault-exec/src/ingest/ax-entities.ts`
- Create: `lib/vault-exec/src/ingest/ax-entities_test.ts`
- Modify: `lib/vault-exec/src/ingest/types.ts`

**Step 1: Write the failing test**

Cover:

- dotted canonical key generation for `L1`, `L2`, optional bounded `L3`
- parent/child derivation
- aggregation of occurrence counts and source metadata

**Step 2: Run test to verify it fails**

Run: `deno test --allow-read lib/vault-exec/src/ingest/ax-entities_test.ts`

Expected: fail because the derivation module does not exist.

**Step 3: Write minimal implementation**

Implement canonical AX node derivation:

- `tool.exec`
- `tool.exec.git_vcs`
- optional `tool.exec.git_vcs.status`

Store agent/source/session stats as aggregated metadata only.

**Step 4: Run test to verify it passes**

Run: `deno test --allow-read lib/vault-exec/src/ingest/ax-entities_test.ts`

Expected: pass.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/ingest/ax-entities.ts lib/vault-exec/src/ingest/ax-entities_test.ts lib/vault-exec/src/ingest/types.ts
git commit -m "feat(vault-exec): derive stable AX entities from canonical traces"
```

### Task 6: Add Markdown projection for stable AX nodes

**Files:**
- Create: `lib/vault-exec/src/ingest/ax-projection.ts`
- Create: `lib/vault-exec/src/ingest/ax-projection_test.ts`
- Modify: `lib/vault-exec/src/infrastructure/fs/deno-vault-fs.ts`

**Step 1: Write the failing test**

Cover:

- note path placement under `ax/l1/`, `ax/l2/`, `ax/l3/`
- minimal frontmatter
- linked parent/child sections
- bounded JSON metadata block
- deterministic overwrite of existing projection

**Step 2: Run test to verify it fails**

Run: `deno test --allow-read --allow-write=/tmp lib/vault-exec/src/ingest/ax-projection_test.ts`

Expected: fail because the projection module does not exist.

**Step 3: Write minimal implementation**

Implement:

- path resolution from canonical AX key
- Markdown note renderer
- projection writer for a set of affected AX nodes

Write to the target vault, not to `/tmp`.

**Step 4: Run test to verify it passes**

Run: `deno test --allow-read --allow-write=/tmp lib/vault-exec/src/ingest/ax-projection_test.ts`

Expected: pass.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/ingest/ax-projection.ts lib/vault-exec/src/ingest/ax-projection_test.ts lib/vault-exec/src/infrastructure/fs/deno-vault-fs.ts
git commit -m "feat(vault-exec): project stable AX nodes into markdown"
```

### Task 7: Build the unified import pipeline

**Files:**
- Create: `lib/vault-exec/src/ingest/pipeline.ts`
- Create: `lib/vault-exec/src/ingest/pipeline_test.ts`
- Modify: `lib/vault-exec/src/ingest/parser.ts`
- Modify: `lib/vault-exec/src/ingest/ingest.ts`

**Step 1: Write the failing test**

Cover:

- multiple configured sources
- incremental skip of unchanged files
- import of changed files only
- private + canonical writes
- affected AX node projection only

**Step 2: Run test to verify it fails**

Run: `deno test --unstable-kv --allow-read --allow-write=/tmp lib/vault-exec/src/ingest/pipeline_test.ts`

Expected: fail because the unified pipeline does not exist.

**Step 3: Write minimal implementation**

Compose:

- config loading
- incremental source scan
- OpenClaw parse
- anonymization
- private/canonical storage
- AX entity recomputation for touched traces
- Markdown projection

Keep the old standalone `ingest` command working by delegating to shared logic
where possible.

**Step 4: Run test to verify it passes**

Run: `deno test --unstable-kv --allow-read --allow-write=/tmp lib/vault-exec/src/ingest/pipeline_test.ts`

Expected: pass.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/ingest/pipeline.ts lib/vault-exec/src/ingest/pipeline_test.ts lib/vault-exec/src/ingest/parser.ts lib/vault-exec/src/ingest/ingest.ts
git commit -m "feat(vault-exec): unify incremental trace import pipeline"
```

### Task 8: Integrate pipeline into `init`

**Files:**
- Modify: `lib/vault-exec/src/cli.ts`
- Modify: `lib/vault-exec/src/workflows/init.ts`
- Create: `lib/vault-exec/src/workflows/init-trace-ingest_test.ts`

**Step 1: Write the failing test**

Cover:

- `init` loads configured sources
- `init` imports traces before the existing indexing flow
- `init` still runs notes/GNN/GRU bootstrap after successful import

**Step 2: Run test to verify it fails**

Run: `deno test --unstable-kv --allow-read --allow-write=/tmp lib/vault-exec/src/workflows/init-trace-ingest_test.ts`

Expected: fail because `init` does not call the new pipeline yet.

**Step 3: Write minimal implementation**

Integrate the unified trace import pipeline ahead of current `initVault()`
steps. Preserve existing preflight behavior.

**Step 4: Run test to verify it passes**

Run: `deno test --unstable-kv --allow-read --allow-write=/tmp lib/vault-exec/src/workflows/init-trace-ingest_test.ts`

Expected: pass.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/cli.ts lib/vault-exec/src/workflows/init.ts lib/vault-exec/src/workflows/init-trace-ingest_test.ts
git commit -m "feat(vault-exec): ingest configured traces during init"
```

### Task 9: Integrate pipeline into `sync`

**Files:**
- Modify: `lib/vault-exec/src/service/sync-worker.ts`
- Create: `lib/vault-exec/src/service/sync-worker_trace_test.ts`

**Step 1: Write the failing test**

Cover:

- `sync` imports changed files only
- `sync` skips unchanged sources
- retrain still runs after incremental import

**Step 2: Run test to verify it fails**

Run: `deno test --unstable-kv --allow-read --allow-write=/tmp lib/vault-exec/src/service/sync-worker_trace_test.ts`

Expected: fail because sync does not import traces yet.

**Step 3: Write minimal implementation**

Call the unified import pipeline before `retrain()` and return import counts in
the sync response if needed.

**Step 4: Run test to verify it passes**

Run: `deno test --unstable-kv --allow-read --allow-write=/tmp lib/vault-exec/src/service/sync-worker_trace_test.ts`

Expected: pass.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/service/sync-worker.ts lib/vault-exec/src/service/sync-worker_trace_test.ts
git commit -m "feat(vault-exec): ingest changed traces during sync"
```

### Task 10: Update docs and full validation

**Files:**
- Modify: `lib/vault-exec/src/ingest/readme.md`
- Modify: `lib/vault-exec/src/service/readme.md`
- Modify: `lib/vault-exec/src/workflows/readme.md`
- Modify: `lib/vault-exec/docs/2026-03-05-ax-coding-refactor-plan.md`

**Step 1: Write/update tests first if behavior surfaced in docs is still missing**

Add any final regression test needed for documented command behavior.

**Step 2: Run targeted suite**

Run:

```bash
deno test --unstable-kv --allow-read --allow-write=/tmp \
  lib/vault-exec/src/config/trace-config_test.ts \
  lib/vault-exec/src/ingest/source-state_test.ts \
  lib/vault-exec/src/ingest/privacy/anonymize_test.ts \
  lib/vault-exec/src/ingest/store/trace-store_test.ts \
  lib/vault-exec/src/ingest/ax-entities_test.ts \
  lib/vault-exec/src/ingest/ax-projection_test.ts \
  lib/vault-exec/src/ingest/pipeline_test.ts \
  lib/vault-exec/src/workflows/init-trace-ingest_test.ts \
  lib/vault-exec/src/service/sync-worker_trace_test.ts
```

Expected: pass.

**Step 3: Run broad regression suite**

Run the existing high-signal `lib/vault-exec` suite currently used for branch
integration.

Expected: pass with no regressions.

**Step 4: Update docs**

Document:

- config format
- private vs canonical stores
- `init`/`sync` semantics
- canonical AX projection model

**Step 5: Commit**

```bash
git add lib/vault-exec/src/ingest/readme.md lib/vault-exec/src/service/readme.md lib/vault-exec/src/workflows/readme.md lib/vault-exec/docs/2026-03-05-ax-coding-refactor-plan.md
git commit -m "docs(vault-exec): document unified trace ingest pipeline"
```
