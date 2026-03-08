---
description: "Run vault-exec CLI commands (compile, validate, graph, run, init). BETA."
allowed-tools: Bash, Read, Glob
---

# vault-exec CLI (BETA)

vault-exec transforms an Obsidian vault into an executable program. Notes are computation nodes, `[[wikilinks]]` are dependency edges.

## Location

Working directory: `lib/vault-exec/`

## Commands

All commands go through the Deno CLI task:

```bash
cd lib/vault-exec && deno task cli <command> [options] <vault-path>
```

### compile — LLM-compile raw notes into executable nodes

Requires `OPENAI_API_KEY` in `.env.local` or environment.

```bash
deno task cli compile demo-vault
deno task cli compile -m gpt-4o demo-vault    # custom model
```

Output goes to `<vault-path>/.compiled/`. Includes a validate → re-compile loop (max 3 retries) that feeds validation errors back to the LLM.

### validate — Check DAG integrity

```bash
deno task cli validate demo-vault
```

Checks for cycles, missing inputs, orphan nodes, unresolved `{{references}}`.

### graph — Print execution order

```bash
deno task cli graph demo-vault
```

Shows topological sort with dependency arrows.

### run — Execute the DAG

```bash
# Full DAG
deno task cli run demo-vault

# Subgraph: only compute what's needed for one note
deno task cli run -t "Filter Active" demo-vault

# Intent routing: GRU predicts target from natural language
deno task cli run -i "count the senior members" demo-vault
```

`--target` extracts the subgraph via BFS up dependencies.
`--intent` embeds the query, runs GRU prediction, then executes the predicted note's subgraph. Falls back to full DAG if no trained weights exist.

Execution traces are recorded to `<vault>/.vault-exec/vault.duckdb` for GRU training.

### init — Initialize GNN+GRU pipeline

```bash
deno task cli init demo-vault
```

Steps: embed notes (BGE-M3) → index in DuckDB → GNN forward pass → generate synthetic traces → train GRU → save weights.

## Path resolution

All commands take the **vault root** as argument (e.g., `demo-vault`). Internally:
- `compile` reads raw `.md` from the root
- All others resolve `<vault>/.compiled/` first, falling back to vault root
- DB is always at `<vault>/.vault-exec/vault.duckdb`

## Typical workflow

```
1. Write raw .md notes with [[wikilinks]]
2. vault-exec compile <vault>      → generates .compiled/ with YAML frontmatter
3. vault-exec validate <vault>     → checks DAG integrity
4. vault-exec run <vault>          → executes the DAG
5. vault-exec init <vault>         → trains GNN+GRU for intent routing
6. vault-exec run -i "query" <vault> → intelligent routing
```

## Testing

```bash
cd lib/vault-exec && deno test --allow-read --allow-write --allow-ffi --allow-env --allow-net --node-modules-dir=manual src/
```

## Status: BETA

This is a beta feature. The GRU training uses numerical gradient estimation (finite differences), viable for small vaults (<200 nodes) but not production-scale. The LLM compilation quality depends on prompt engineering and may require manual frontmatter corrections.
