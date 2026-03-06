# Vault Exec Unified Trace Ingest Design

**Date:** 2026-03-06

**Scope:** `lib/vault-exec`

## Goal

Unify OpenClaw trace import, anonymized canonical storage, Obsidian graph
projection, and model bootstrap/incremental refresh into the default
`vault-exec init` / `vault-exec sync` flow.

## Context

Today, `lib/vault-exec` has two disconnected pipelines:

- `init` / `sync` index vault notes, maintain the KV store, and retrain models.
- `ingest` parses OpenClaw JSONL and writes Markdown projections only.

That split is not acceptable for the intended AX workflow. The default system
must be able to ingest all configured agent traces, keep an incremental state,
update canonical AX entities, and then continue with the existing
index/retrain path.

## Decisions

### 1. Source configuration

Store configured trace sources in:

- `lib/vault-exec/<vault>/.vault-exec/config.json`

Initial schema:

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

The config is technical, machine-first, and local to the vault. Agents should
not need to rediscover source paths every run.

### 2. Two trace stores

Use two distinct stores:

- `private` store: local-only replay/debug data, raw or near-raw, never
  exportable
- `canonical` store: anonymized, normalized, deduplicated, shareable later for
  server/federated learning

The two stores are intentionally separate to reduce accidental data mixing and
to prepare future remote/canonical synchronization.

### 3. Storage locations

Per-vault local private store:

- `<vault>/.vault-exec/private-traces.kv`

Per-vault canonical store:

- `<vault>/.vault-exec/canonical-traces.kv`

The existing vault model/index store remains:

- `<vault>/.vault-exec/vault.kv`

Federation later happens through export/merge of canonical snapshots, not by
having multiple processes write to one machine-global KV file.

### 4. Default command behavior

`init <vault>` becomes bootstrap + catch-up:

1. Load `.vault-exec/config.json`
2. Incrementally scan configured OpenClaw sources
3. Parse sessions
4. Write private traces
5. Anonymize and normalize into canonical traces
6. Update AX entity projections
7. Reproject the Obsidian graph in `demo-vault`
8. Continue with existing vault indexing / GNN / GRU initialization

`sync <vault>` runs the same pipeline incrementally, but only for changed
trace inputs before the existing retrain flow.

In both commands, the trace import phase is inserted only after vault preflight
passes. For `init`, the insertion point is:

1. vault parse + preflight
2. trace import/canonicalization/projection
3. existing `initVault()` flow

Source access errors are warn+skip by default. Canonicalization errors are
fail-fast.

The current standalone `ingest` command may remain as a projection/debug tool,
but it is no longer the primary ingestion path.

### 5. Incremental state

Incremental import must not rely on “already seen file” only. Track per source
file:

- canonical path
- file size
- `mtime`
- content hash
- derived session id
- last imported timestamp
- import status

This allows:

- new file -> import
- modified file -> re-import
- unchanged file -> skip

### 6. Canonicalization and anonymization policy

Canonicalization happens before any canonical write.

`lib/vault-exec` must remain autonomous, so privacy logic lives under a local
ingest/canonical slice instead of depending on the repo-wide sandbox module.

V1 does **not** try to detect and redact arbitrary PII from raw JSON. That
creates a false sense of safety. Instead, V1 uses a strict allowlist:

- if a field is explicitly allowed into the canonical schema, keep it
- otherwise drop it
- if canonicalization fails, do not write to canonical storage

Canonical trace data keeps only bounded fields such as:

- source id
- session id (canonicalized)
- session date (date-only)
- turn index
- tool name
- `L1`
- `L2`
- optional bounded `L3`
- hit/fallback status
- bounded confidence/fallback reason
- canonical fingerprint for deduplication

Canonical trace data never stores:

- raw path strings
- usernames, emails, hosts
- raw user text
- raw tool results
- full argument payloads
- arbitrary nested JSON copied from tool args/results

Private traces may retain richer payloads for local replay/debug only, but they
never leave the machine.

### 6.1 Error policy

Pipeline stage behavior:

- config load: fail-fast on malformed config
- source scan: warn+skip inaccessible sources
- parse: warn+skip malformed files/sessions
- private write: fail-fast
- canonicalization: fail-fast
- canonical write: fail-fast
- projection: warn+continue

Canonicalization failure must be a hard stop for canonical writes. No silent
partial “best effort” anonymization.

### 7. AX identity model

AX entities are real graph entities. Their canonical identity is a dotted key:

- `tool.exec`
- `tool.exec.git_vcs`
- `tool.exec.git_vcs.status`

The dotted string is the primary identity. Structured parts can be derived
later without changing the canonical key.

To avoid collisions with raw MCP tool names that already contain dots, the key
is **not** built by splitting raw `toolName`. It is built from an explicit AX
naming map:

- `L1` and `L2` come from the existing policy/family mapping
- optional `L3` is allowed only for bounded explicit enums
- raw tool names stay as metadata, not as canonical key parts

That mapping must live in explicit code (`ax-naming.ts`), not hidden
heuristics.

### 7.1 Canonical store key schema

Canonical KV keys are documented before implementation:

- `["canonical", "traces", <fingerprint>]` -> canonical trace row
- `["canonical", "entities", <ax_key>]` -> aggregated AX entity row
- `["canonical", "entity-occurrences", <ax_key>, <source_id>]` -> bounded
  source stats
- `["canonical", "imports", <source_id>, <file_hash>]` -> import bookkeeping

Private KV keys remain separate:

- `["private", "traces", <session_id>, <turn_index>, <tool_call_id>]`

Projection bookkeeping may use:

- `["projection", "entity", <ax_key>]` -> last projected version/hash

### 8. Obsidian projection model

For now, Obsidian is only a readable graph projection.

Project only stable AX entities:

- one note per stable AX node
- no note per agent
- no note per session
- no replay/timeline UI in Obsidian for V1

Directory layout in the target vault:

- `ax/l1/`
- `ax/l2/`
- `ax/l3/` later if needed

Each note contains:

- minimal frontmatter (`ax_key`, `ax_level`, `ax_kind`, `version`)
- human-readable summary
- links to related AX entities
- bounded machine-readable JSON block for aggregated metadata

Agent/session/source data lives inside aggregated metadata, not as separate
Obsidian entities.

### 9. Deduplication model

Dedup works at multiple layers:

- file/session import incrementality
- canonical trace fingerprinting
- stable AX node identities
- projection updates only for affected nodes

The Markdown graph is not a replay log. It is a stable, deduplicated entity
projection derived from canonical traces.

## Consequences

### Benefits

- one default workflow for agents
- incremental ingest instead of full rebuild-only projections
- privacy model aligned with future federated learning
- stable AX graph projection in Obsidian
- clear separation between local replay data and shareable learning data

### Non-goals for V1

- remote sync/server export
- replay UI
- session timeline UI in Obsidian
- full graph database replacement for Markdown

## Implementation direction

The implementation should introduce:

- config loading for trace sources
- source scan state persistence
- private/canonical trace writers
- strict allowlist canonicalization in `lib/vault-exec`
- explicit AX naming map
- AX canonical entity derivation
- Markdown projection writer for stable AX nodes
- `init`/`sync` integration using the new pipeline
- standalone `ingest` regression coverage so the existing command keeps working
- co-located `readme.md` / `contract.md` for new ingest sub-slices

The existing `init`/`sync` training flow should be preserved after the new
trace import phase rather than rewritten from scratch.
