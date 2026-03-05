# vault-exec — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## Vision

**"Your Obsidian vault is an executable program."**

Each Markdown note is a computation node. Each `[[wikilink]]` is a dependency edge. A CLI compiles the vault into a DAG and executes it — like Excel, but each cell is a rich Markdown document.

## Positioning

| | Cannoli | MCP-Obsidian servers | vault-exec |
|---|---|---|---|
| **Input** | Canvas (visual nodes) | AI reads vault | Markdown notes |
| **Execution** | LLM calls only | Read/write vault content | Code + MCP tool chains |
| **Model** | Interpreted (every run) | Service (on-demand) | Compiled (one-shot LLM, then deterministic) |
| **Target** | LLM scripting | AI-vault bridge | Vault as program |

## Node Types

Three types of computation nodes, like Excel cells:

### 1. Value Node — literal data (leaf)

```markdown
---
value: "/etc/app/config.json"
outputs:
  - output
---

# Define Path

The path to the main configuration file.
```

### 2. Code Node — pure computation (formula)

```markdown
---
inputs:
  data: "{{Read Config.content}}"
code: "data.filter(p => p.active)"
outputs:
  - active_params
---

# Filter Active Params

Keep only the parameters where active is true.

Depends on: [[Read Config]]
```

### 3. Tool Node — MCP tool call (Phase 2, not MVP)

```markdown
---
tool: filesystem:read_file
inputs:
  path: "{{Define Path.output}}"
outputs:
  - content
---

# Read Config

Read the configuration file at the given path.

Depends on: [[Define Path]]
```

### Uncompiled Note — free-text (pre-compilation)

```markdown
# Read Config

Read the configuration file at the given path
and extract only the active parameters.

Depends on: [[Define Path]]
Used by: [[Generate Report]]
```

The LLM compile pass transforms uncompiled notes into one of the three node types above, writing the frontmatter directly into the file. Subsequent runs are deterministic.

## Variable Passing

Variables flow through wikilinks, like cell references in Excel:

```
[[Define Path]]          → output = "/etc/app/config.json"
       ↓
[[Read Config]]          → content = "{\"debug\": true, ...}"
       ↓
[[Filter Active]]        → active_params = [{name: "debug", ...}]
       ↓
[[Generate Report]]      → report = "Report: 1 active param..."
```

The notation `{{Note Name.output_name}}` in frontmatter `inputs` resolves at runtime.

If a note has a single output, `{{Note Name}}` is shorthand for `{{Note Name.output}}`.

## Architecture

```
                    ┌─────────────────────┐
                    │   Markdown Vault    │
                    │  (.md files + links) │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │      Parser         │
                    │ frontmatter + links  │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Graph Builder     │
                    │ DAG + topo sort     │
                    │ + cycle detection    │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
    ┌─────────▼─────────┐     │     ┌──────────▼──────────┐
    │   LLM Compiler    │     │     │     Executor        │
    │  (compile command) │     │     │   (run command)     │
    │  text → frontmatter│     │     │  resolve vars →     │
    └───────────────────┘     │     │  execute code nodes  │
                              │     └─────────────────────┘
                    ┌─────────▼─────────┐
                    │    Validator       │
                    │ cycles, missing    │
                    │ inputs, orphans    │
                    └───────────────────┘
```

## MCP Server Dependencies — Pattern Nix (Phase 2)

**Approche : chaque note embarque ses propres dépendances** (pattern Nix — déclaratif, auto-suffisant, pas de config globale).

Une tool node déclare le serveur MCP dont elle a besoin directement dans son frontmatter :

```markdown
---
tool: filesystem:read_file
requires:
  mcp:
    filesystem:
      command: npx
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
inputs:
  path: "{{Define Path.output}}"
outputs:
  - content
---

# Read Config
...
```

Le runtime :
1. Collecte tous les `requires.mcp` de toutes les notes du vault
2. Déduplique (si 3 notes demandent `filesystem`, un seul process)
3. Spawne les serveurs MCP nécessaires comme child processes (stdio)
4. Exécute le DAG
5. Shut down les serveurs

**Avantages du pattern Nix vs config centralisé :**
- Chaque note est **auto-suffisante** — copiable isolément dans un autre vault
- Pas de fichier de config global à maintenir
- Reproductible : la note porte tout ce qu'il faut pour s'exécuter
- Le LLM compile pass peut écrire le `requires` en même temps que le `tool`

**Ce pattern s'inspire de :**
- [OpenClaw nix-mode](https://github.com/openclaw/skills/blob/main/skills/chronicuser21/nix-mode/SKILL.md) — skills déclarent bins/envs requis
- Anthropic plugins — `.mcp.json` co-localisé avec le plugin (mais ici on va plus loin : co-localisé avec chaque note)
- Nix/NixOS — chaque dérivation déclare ses dépendances, le gestionnaire résout et déduplique

**Phase 2 — le MVP se concentre sur les value/code nodes uniquement.**

## Executor Runtime

The executor is a **CLI process** — not a server. It runs, executes the DAG, and exits. Like `make` runs a Makefile:

1. Parse compiled vault (frontmatter already populated)
2. Build DAG from wikilinks, topological sort
3. For each note in topological order:
   - Resolve `{{NoteName.output}}` references from previous results
   - Execute code expression (code nodes) or return literal (value nodes)
   - Store output in results map
4. Print final outputs

Code nodes execute in a Deno sandbox with restricted permissions.

## CLI

```bash
vault-exec validate <vault-path>  # Check for cycles, missing inputs, orphans
vault-exec graph <vault-path>     # Print dependency graph (DOT or text)
vault-exec run <vault-path>       # Execute the compiled DAG
vault-exec compile <vault-path>   # (Phase 2) LLM pass → enriches uncompiled notes
```

## Tech Stack

- **Language**: TypeScript
- **Core logic**: Runtime-agnostic (injectable I/O via interfaces)
- **CLI runtime**: Deno (sandboxed code execution, `deno compile` for binary)
- **Markdown parsing**: `gray-matter` (frontmatter) + regex (wikilinks)
- **Testing**: Deno test or vitest
- **Future**: Obsidian plugin wrapper (Node.js) reusing same core logic

## Project Structure

```
lib/vault-exec/
├── deno.json
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── types.ts            # VaultNote, VaultGraph, NodeType, etc.
│   ├── parser.ts           # Read .md → extract frontmatter + wikilinks
│   ├── graph.ts            # Build DAG, topological sort, cycle detection
│   ├── executor.ts         # Resolve variables, execute code/value nodes
│   ├── validator.ts        # Check graph integrity
│   └── interfaces.ts       # VaultReader (injectable I/O)
└── test/
    ├── parser.test.ts
    ├── graph.test.ts
    ├── executor.test.ts
    └── fixtures/
        └── sample-vault/   # Test vault with .md files
```

## Core Interfaces

```typescript
interface VaultReader {
  listNotes(dir: string): Promise<string[]>;
  readNote(path: string): Promise<string>;
}

interface VaultWriter {
  writeNote(path: string, content: string): Promise<void>;
}
```

## Scope

### MVP (Phase 1)
- Markdown parser (frontmatter + wikilinks)
- DAG builder with cycle detection
- Value nodes (literal data)
- Code nodes (JS expressions, sandboxed)
- Variable passing between notes via `{{NoteName.output}}`
- CLI: validate, graph, run
- Sample vault for testing

### Phase 2
- LLM compile pass (free-text → frontmatter)
- MCP tool nodes + `.mcp.json` server provisioning
- CLI: compile command

### Future
- Obsidian plugin wrapper (Node.js)
- GRU/SHGAT integration for tool/capability prediction
- Watch mode (recompile on file change)
- Conditional execution (if/else branches)
- Loop support
- Voice dictation integration

## Open Questions (deferred)

1. **Code sandbox**: Deno Worker with restricted permissions for MVP. Revisit for Obsidian plugin (Web Worker).
2. **Error handling**: fail fast, print error with note name and context.
3. **Multi-output notes**: a note can declare multiple named outputs. Syntax: `{{NoteName.specific_output}}`.
