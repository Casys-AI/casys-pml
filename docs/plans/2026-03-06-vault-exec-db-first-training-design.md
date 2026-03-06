# Vault Exec DB-First Training Design

**Date:** 2026-03-06

**Scope:** `lib/vault-exec`

## Goal

Replace the legacy notes-first training pipeline with an OpenClaw-first,
DB-first pipeline where imported sessions are the source of truth, Markdown is
only a projection, and GNN/GRU experiments start in notebooks before any
runtime retraining is reintroduced.

## Why this pivot

The current training flow still learns from:

- parsed vault notes
- note wikilinks
- synthetic traces derived from Markdown structure

That is no longer the right source of truth now that OpenClaw traces are
persisted locally in KV and projected into `demo-vault/tools/`.

The correct split is:

- DB = canonical imported sessions, calls, derived leaf graph, and training
  tables
- Markdown = readable projection only

## Architecture

### 1. Source of truth

The canonical source of truth is local KV state inside:

- `<vault>/.vault-exec/vault.kv`

Markdown under `tools/` is derived from KV and must never be required for
training or indexing.

### 2. Training unit

The model operates on **leaf tool nodes only**.

Leaf means:

- the deepest key available for a tool call
- today this is usually L2
- later it may become L3
- when L2 classification falls back, a dedicated fallback leaf is created

Examples:

- `tool.exec.git_vcs`
- `tool.read.project_abs_path`
- `tool.exec.fallback`

Category nodes such as `tool.exec` remain taxonomy-only:

- they stay useful in projection and aggregation
- they do not carry sequence links
- they are not used as training tokens

### 3. Session structure

Sessions are stored canonically as a **parent/child tree**.

Rules:

- top-level sessions and subagent sessions keep separate identities
- parent -> child links store the handoff metadata when available
- no canonical flattening of parent + child traces
- a flattened chronological view may be derived later for analysis, but it is
  not the source representation

### 4. V1 training behavior

V1 training experiments are intentionally narrow:

- GNN nodes = leaf tool nodes only
- GNN edges = observed `next` transitions between leaves only
- GRU sequences = one leaf sequence per session
- top-level and subagent sessions are both retained, but kept separate
- micro-sequences are filtered in notebooks by minimum length
  (`min_calls >= 3` recommended default)

Training is notebook-driven first. `init` / `sync` update DB state and
projection only.

### 5. Context retention

OpenClaw context must be stored even if V1 training does not consume it yet.

Persist:

- user text around the call
- assistant text / planning / reasoning when available
- tool result or outcome metadata when available
- subagent/session handoff metadata
- parent/child trace relations

This preserves the future path toward richer context-aware modeling without
polluting the first GNN/GRU experiments.

## Canonical key mapping

Leaf keys are explicit and deterministic. No hidden heuristics are allowed.

### Mapping rule

Use:

- existing ingest classification from `src/ingest/policy.ts`
- existing family registry from `src/ingest/families.ts`
- canonical key derivation from `src/ingest/tool-graph/naming.ts`

V1 rule:

- hit L2 -> `tool.<toolName>.<family>`
- fallback L2 -> `tool.<toolName>.fallback`

### Normalization rule

Both `toolName` and `family` are normalized through
`sanitizeToolGraphSegment()`:

- lowercase
- non-alphanumeric runs become `_`
- future dotted tool names are therefore escaped by replacing `.` with `_`

This avoids key collisions and keeps the canonical key format stable.

### Fallback reasons

Fallback reasons remain stored in DB metadata, but are not part of the leaf
key in V1. That keeps the training vocabulary bounded while preserving the
diagnostic detail.

## KV data model

Use explicit namespaces inside `vault.kv`.

### Canonical imported tables

#### `openclaw_sessions`

One row per imported session.

Fields:

- `sessionId`
- `sourceRoot`
- `sourcePath`
- `agentId`
- `sessionKind`: `top_level | subagent`
- `parentSessionId?`
- `sessionStartedAt?`
- `importedAt`
- `contentHash`
- `turnCount`
- `toolCallCount`
- `handoffBrief?`
- `handoffMetadata?`

#### `openclaw_tool_calls`

One row per imported tool call.

Fields:

- session identity and ordering
- canonical leaf key
- tool root
- family / fallback metadata
- user / assistant / reasoning / outcome context
- parent plan hint / subagent metadata where available

These rows are the durable training input source.

### Derived training tables

#### `tool_leaf_nodes`

One row per canonical leaf key.

Fields:

- `leafKey`
- `toolRoot`
- `level`
- `isFallback`
- aggregate counters
- split counters for top-level vs subagent sessions

#### `tool_leaf_edges_next`

One row per observed transition between leaves.

Fields:

- `fromLeaf`
- `toLeaf`
- `weight`
- optional split counters (`topLevelWeight`, `subagentWeight`)

#### `session_sequences`

One row per session.

Fields:

- `sessionId`
- `sessionKind`
- `parentSessionId?`
- ordered `leafKeys`
- `callCount`

### Stored-but-not-trained-yet relations

Store separately for notebook analysis, not for GNN V1:

- `session_tree_edges`
- `spawn_edges`
- `same_session`
- `same_turn`
- `same_parent`

These auxiliary relation tables are intentionally deferred beyond the first
implementation pass in this plan. V1 requires only the canonical imported
tables plus the three rebuilt training tables.

## Rebuild strategy

V1 intentionally avoids incremental delta logic for derived tables.

Strategy:

- import OpenClaw canonically and incrementally into `openclaw_sessions` and
  `openclaw_tool_calls`
- after each `init` / `sync`, fully rebuild:
  - `tool_leaf_nodes`
  - `tool_leaf_edges_next`
  - `session_sequences`

Safety rule:

- rebuild into a temporary derived namespace first
- only promote/swap the rebuilt tables after the full rebuild succeeds
- on rebuild failure, keep the previously valid derived tables intact

Reason:

- current volume is small enough that full reconstruction is trivial
- it removes an entire class of edge-delta bugs
- it is easier to validate in notebooks

Optimization toward partial rebuilds can be added later only if the volume
justifies it.

## Workflow changes

### `init`

`init` should:

1. run preflight
2. import configured OpenClaw sources incrementally
3. rebuild derived training tables from canonical imported data
4. reproject `tools/`
5. stop there for V1 training purposes

It should no longer auto-run the legacy notes-based GNN/GRU pipeline.

### `sync`

`sync` should:

1. import changed OpenClaw sources incrementally
2. rebuild derived training tables
3. reproject only from the rebuilt state

Again, no automatic training in V1.

### `retrain`

The existing `retrain` flow is legacy once this pivot lands.

V1 decision:

- notebooks are the only official training path
- CLI `retrain` becomes explicitly legacy until it is rewritten to consume:
  - `tool_leaf_nodes`
  - `tool_leaf_edges_next`
  - `session_sequences`

## Notebook-first experimentation

Before any runtime training is reintroduced, notebooks should cover:

- dataset inspection
- top-level vs subagent splits
- micro-sequence filtering impact
- GNN experiments on `next`-only graphs
- GRU experiments on per-session leaf sequences
- later, context-aware experiments using stored multiturn data

This is the intended path for validating the new learning signal before
hard-coding a new runtime training behavior.

## Non-goals for this phase

- no Markdown-based training path
- no auto-training during `init` / `sync`
- no export/federation path
- no privacy split store architecture
- no replay UI
- no context-conditioned production model yet

## Implementation direction

1. extend canonical imported session/call storage to retain full context
2. add derived-table rebuilders for leaf nodes, edges, and sequences
3. move `init` / `sync` to DB rebuild + projection only
4. mark legacy runtime retraining as inactive/legacy
5. add notebooks for DB inspection, GNN V1, and GRU V1
