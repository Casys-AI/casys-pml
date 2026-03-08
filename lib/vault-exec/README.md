# @casys/vault-exec

Your Obsidian vault is an executable program.

**vault-exec** parses an Obsidian vault of interconnected Markdown notes into
a typed DAG, validates it, and executes it — with optional GNN embedding
enrichment and GRU sequence routing for intent-based target resolution.

## Installation

```bash
# Deno (direct)
deno run --allow-read --allow-write --allow-env --allow-net --allow-ffi \
  --unstable-kv --node-modules-dir=manual \
  jsr:@casys/vault-exec/cli validate ./my-vault

# JSR import
deno add jsr:@casys/vault-exec
```

## Quick Start

### CLI Commands

```bash
# Validate vault graph (cycles, missing inputs, orphans)
vault-exec validate ./my-vault

# Print dependency graph and execution order
vault-exec graph ./my-vault

# Execute the full DAG
vault-exec run ./my-vault

# Execute a specific target subgraph
vault-exec run ./my-vault --target my-note

# Route an intent to the best target, then execute
vault-exec run ./my-vault --intent "generate report"

# Dry-run: preview target + required inputs without executing
vault-exec run ./my-vault --intent "generate report" --dry

# Compile uncompiled notes via LLM
vault-exec compile ./my-vault

# Initialize DB-first trace import and rebuild
vault-exec init ./my-vault

# Ingest OpenClaw sessions into trace notes
vault-exec ingest ./sessions ./output

# Background watch loop
vault-exec watch start ./my-vault
vault-exec watch status ./my-vault
vault-exec sync ./my-vault
```

All commands emit structured JSONL by default. Add `--human` (`-H`) for
human-readable output.

### API Usage

```typescript
import {
  parseVault,
  buildGraph,
  topologicalSort,
  validate,
  executeGraph,
  openVaultStore,
} from "@casys/vault-exec";

// Parse vault notes
const reader = { readDir: ..., readFile: ... }; // implements VaultReader
const notes = await parseVault(reader, "./my-vault");

// Build and validate graph
const graph = buildGraph(notes);
const errors = validate(graph);

// Execute
if (errors.length === 0) {
  const order = topologicalSort(graph);
  const result = await executeGraph(graph, order, new Map());
}

// Persist to KV store
const store = await openVaultStore("./my-vault/.vault-exec/vault.kv");
```

## Architecture

Feature-sliced architecture — each slice owns its contract, types, and tests.

```
src/
├── core/           Parser, graph builder, validator, executor
├── routing/        Intent resolution, runtime input validation, candidate policy
├── workflows/      CLI orchestration (run, init, retrain)
├── db/             Deno KV store adapter (IVaultStore)
├── embeddings/     BGE embedding model, vault indexer
├── gnn/            Graph Neural Network forward pass + training
├── gru/            GRU sequence predictor (inference + training)
├── ingest/         OpenClaw session parser, tool-graph projection
├── training-data/  DB-first derived training tables
├── traces/         Execution trace recording + synthetic traces
├── infrastructure/ FS adapters, LLM clients
├── cli-runtime/    Structured output (ax.v1 JSON), exit codes
├── config/         Vault config resolution
├── links/          Wikilink parsing
├── service/        Background watch/sync service
├── cli.ts          CLI entrypoint (Cliffy)
└── mod.ts          Public API surface
```

### Dependency Flow

```
cli.ts ─→ workflows ─→ core (parser, graph, validator, executor)
                    ├─→ routing (intent candidates, input validation)
                    ├─→ gru (sequence prediction)
                    ├─→ gnn (embedding enrichment)
                    ├─→ embeddings (BGE model)
                    ├─→ db (KV store)
                    └─→ traces (recording)
```

Lower-level slices (`core`, `db`, `gnn`, `gru`) never depend on upper-level
orchestration (`workflows`, `cli`).

### AX Contract System

Each slice contains a `contract.md` defining:

- **Inputs** — what the slice accepts
- **Outputs** — what it produces
- **Invariants** — guarantees that must hold

These contracts are the local source of truth. Implementation must conform to
contract invariants, and tests verify them.

### Key Principles

- **Deterministic**: identical inputs produce identical outputs
- **Fail-fast**: no silent fallbacks — errors surface immediately
- **Machine-readable**: all output is structured JSONL with `version: "ax.v1"`
- **No hidden heuristics**: the model is the source of truth, never invented data

## Vault Note Format

Each `.md` file in the vault represents a node. Frontmatter declares the node type:

```markdown
---
type: value
compiled_at: 2026-01-15T10:00:00Z
---
The current date is {{today}}.
```

Node types: `value` (static data), `code` (executable JS/TS), `tool` (MCP tool call).

Dependencies are declared via `[[wikilinks]]` in the body. Template references use
`{{note.output}}` syntax.

## License

MIT
