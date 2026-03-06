# Vault Exec Unified Trace Ingest Design

**Date:** 2026-03-06

**Scope:** `lib/vault-exec`

## Goal

Unify OpenClaw trace import with the default `vault-exec init` / `vault-exec sync`
flow so that traces are imported incrementally and projected into stable
tool-graph Markdown nodes inside the demo vault.

## Why this V1

The immediate user value is simple:

- configure trace sources once
- stop rescanning everything on every sync
- run a single default flow instead of `init` and `ingest` being disconnected
- materialize stable tool-graph entities as notes in Obsidian

Everything else is secondary for now.

In particular, V1 does **not** need:

- separate `private` and `canonical` stores
- export-ready anonymization
- a dedicated server/federation path
- replay UI

Those are valid later concerns, but they do not justify additional architecture
before the single-flow ingest/projection path works end-to-end.

## Context

Today `lib/vault-exec` has two disconnected pipelines:

- `init` / `sync` maintain the local vault state and retrain models
- `ingest` parses OpenClaw JSONL into Markdown reports only

That split is the real product problem. The fix is to connect them.

## Decisions

### 1. Source configuration

Configured trace sources live in:

- `<vault>/.vault-exec/config.json`

Schema V1:

```json
{
  "traceSources": [
    {
      "kind": "openclaw",
      "path": "/home/ubuntu/.openclaw/agents/david/sessions"
    }
  ]
}
```

The config is technical and local to the target vault. Agents should not have to
rediscover session directories every time.

### 2. Incrementality is mandatory

The importer tracks source files using:

- canonical path
- file size
- `mtime`
- content hash
- derived session id
- last imported timestamp
- import status

This is enough for V1:

- new file -> import
- modified file -> re-import
- unchanged file -> skip

The persisted state lives under:

- `<vault>/.vault-exec/trace-source-state.json`

### 3. Single local operational store in V1

V1 keeps one operational store:

- `<vault>/.vault-exec/vault.kv`

Imported traces, tool-graph aggregates, and existing model/index data stay local to that
vault. This is intentionally simpler than introducing `private` / `canonical`
split stores before there is any export consumer.

Future export/federation can split or derive another representation later.

### 4. Default command behavior

`init <vault>` becomes:

1. parse vault
2. run existing preflight
3. import configured OpenClaw traces incrementally
4. update tool-graph projection notes
5. continue current `initVault()` flow

`sync <vault>` becomes:

1. import changed OpenClaw traces incrementally
2. update tool-graph projection notes
3. continue current retrain/sync flow

The import phase is inserted only after `init` preflight passes.

### 5. Error behavior

For V1:

- malformed config -> fail-fast
- inaccessible source path -> warn+skip
- malformed JSONL file/session -> warn+skip
- local store write failure -> fail-fast
- projection failure -> warn+continue

The point is to keep the sync path robust without introducing speculative
privacy/export constraints yet.

### 6. Tool-graph identity model

Tool-graph entities are the stable units projected into Obsidian.

Canonical key format:

- `tool.exec`
- `tool.exec.git_vcs`
- `tool.exec.git_vcs.status`

The key is the stable entity identity. It is explicit, deterministic, and
separate from any per-session occurrence.

### 7. Obsidian projection model

For V1, Obsidian is only a readable graph projection.

Project only stable tool-graph entities:

- one note per stable tool-graph node
- no note per agent
- no note per session

Directory layout:

- `tool-graph/l1/`
- `tool-graph/l2/`
- `tool-graph/l3/` later if needed

Each note contains:

- minimal frontmatter (`tool_graph_key`, `tool_graph_level`, `tool_graph_kind`, `version`)
- readable summary
- links to related tool-graph entities
- bounded machine-readable metadata block

Agent/session/source information stays as aggregated metadata inside the
tool-graph node
note, not as separate notes.

### 8. Standalone `ingest`

The existing standalone `ingest` command stays as a regression-safe helper in
V1. It is no longer the primary path, but it should keep working while the new
pipeline is integrated into `init` / `sync`.

## V1 / V2 split

### V1

- config loader
- source scan state
- unified import pipeline
- single local store
- tool-graph Markdown projection
- `init` / `sync` integration

### V2

- split `private` / `canonical`
- strict export-ready allowlist/anonymization
- dedicated canonical fingerprints for server export
- federation / remote sync
- replay-oriented data and UI

## Implementation direction

The implementation should now optimize for the shortest path to usable value:

- keep `Task 1` and `Task 2`
- remove speculative dual-store work
- build a unified local ingest pipeline next
- project stable tool-graph nodes into the demo vault
- wire that into `init` and `sync`
