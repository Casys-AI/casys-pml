# Dependencies

> Relationships between tools and capabilities

## Overview

PML tracks two types of dependencies:
- **Tool dependencies** - Relationships between MCP tools
- **Capability dependencies** - Relationships between learned capabilities

These dependencies form the edges in PML's knowledge graph.

## Tool Dependencies

Stored in the `tool_dependency` table, these track relationships between individual tools.

```
┌──────────────┐                      ┌──────────────┐
│  read_file   │ ───── sequence ────▶ │  write_file  │
└──────────────┘                      └──────────────┘

"read_file is often followed by write_file"
```

### What Gets Stored

| Field | Description |
|-------|-------------|
| `from_tool_id` | Source tool |
| `to_tool_id` | Target tool |
| `observed_count` | Times this pattern was seen |
| `confidence_score` | Reliability (0.0 - 1.0) |
| `edge_type` | Type of relationship |
| `edge_source` | How it was learned |

## Capability Dependencies

Stored in the `capability_dependency` table, these track relationships between capabilities (higher-level patterns).

```
┌──────────────────┐                      ┌──────────────────┐
│  cap:read_json   │ ───── sequence ────▶ │  cap:validate    │
└──────────────────┘                      └──────────────────┘

"After reading JSON, validation often follows"
```

Capability dependencies are important because they capture **intent-level patterns**, not just tool sequences.

## Edge Types

PML distinguishes four types of relationships:

### Sequence

**A is used before B** (temporal order)

```
read_file ────▶ parse_json ────▶ write_file

"First read, then parse, then write"
```

Most common edge type. Created when tools are used in succession.

### Contains

**A contains B** (composition)

```
┌─────────────────────────────────┐
│     Capability: process_data    │
│                                 │
│   read_file ──▶ transform ──▶   │
│                    write_file   │
└─────────────────────────────────┘

"The capability 'process_data' contains these tools"
```

Created when a capability uses specific tools.

### Dependency

**B needs the result of A** (data flow)

```
read_file ════▶ parse_json
              (needs file content)

"parse_json depends on read_file's output"
```

Explicit dependency, often from DAG definitions.

### Alternative

**A and B serve the same purpose** (interchangeable)

```
write_file ◀════▶ save_json
         (both save data)

"Either can be used to persist data"
```

Useful for suggesting alternatives when one tool fails.

## How Dependencies Are Created

### 1. From DAG Execution

When a DAG workflow executes:
```
DAG: Task A → Task B → Task C

Creates:
  A → B (dependency)
  B → C (dependency)
```

### 2. From Code Traces

When code executes in the sandbox:
```
Code calls: read_file(), then write_file()

Creates:
  read_file → write_file (sequence)
```

### 3. From Templates

User-defined workflow templates:
```yaml
workflow:
  - read_file
  - process
  - write_file

Creates edges with source='template'
```

## Using Dependencies

Dependencies power several features:

| Feature | How Dependencies Help |
|---------|----------------------|
| **DAG Suggester** | Knows which tools typically follow others |
| **Proactive Suggestions** | "You might also need..." |
| **Workflow Building** | Automatic ordering of tasks |
| **Error Recovery** | Suggest alternatives |

## Next

- [Confidence Levels](./03-confidence-levels.md) - How reliability is tracked
- [Feedback Loop](./04-feedback-loop.md) - How learning happens
