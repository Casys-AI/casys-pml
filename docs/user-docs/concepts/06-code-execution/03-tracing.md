# Tracing

> Tracking the hierarchy of tool calls

## En bref

Le tracing enregistre chaque action qui se produit pendant l'execution du code : quels outils ont ete appeles, dans quel ordre, avec quels parametres, combien de temps chaque action a pris, et si elle a reussi ou echoue. Pensez-y comme une **camera de surveillance qui enregistre tout** : si quelque chose tourne mal, vous pouvez "rembobiner la bande" et voir exactement ce qui s'est passe. Mais contrairement a une simple camera, le tracing comprend aussi les relations entre les actions (X a appele Y qui a ensuite appele Z).

### Pourquoi c'est important

Le tracing est essentiel pour plusieurs raisons critiques :

- **Debugging efficace** : quand une execution echoue, les traces montrent exactement ou et pourquoi. Sans traces, debugger du code genere dynamiquement est quasi impossible.
- **Apprentissage automatique** : PML apprend de ses executions en analysant les traces. Il decouvre des patterns (lire un fichier est souvent suivi de parser le JSON) et construit son graphe de connaissances.
- **Performance** : les traces revelent quels outils sont lents, permettant d'optimiser les sequences d'operations.
- **Audit et conformite** : pour les systemes critiques, savoir exactement quelles actions ont ete effectuees et quand est indispensable.
- **Transparence** : les utilisateurs peuvent comprendre ce que le systeme a fait, pas juste voir le resultat final.

Sans tracing, PML serait une boite noire : impossible de comprendre, debugger ou ameliorer ses executions.

## What is Tracing?

**Tracing** captures the complete history of what happens during code execution—every tool call, its timing, its results, and how calls relate to each other.

![Execution Trace](excalidraw:src/web/assets/diagrams/tracing-flow.excalidraw)

## Why Trace?

Tracing serves multiple purposes:

| Purpose | How Tracing Helps |
|---------|-------------------|
| **Debugging** | See exactly what happened and when |
| **Learning** | Discover tool patterns for the graph |
| **Monitoring** | Track performance and errors |
| **Auditing** | Record what actions were taken |
| **Optimization** | Identify slow tools or redundant calls |

## Trace Events

Each action generates a trace event:

### Event Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  Trace Event                                                     │
│                                                                  │
│  {                                                               │
│    id: "evt_abc123",                                            │
│    type: "tool_call",                                           │
│    timestamp: 1699900000000,                                    │
│    duration_ms: 15,                                             │
│                                                                  │
│    parent_id: "evt_xyz789",     // What triggered this          │
│    root_id: "cap_001",          // Top-level execution          │
│                                                                  │
│    tool: {                                                       │
│      server: "filesystem",                                      │
│      name: "read_file"                                          │
│    },                                                            │
│                                                                  │
│    input: { path: "data.json" },                                │
│    output: { content: "..." },                                  │
│    status: "success"                                            │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Event Types

| Type | Description |
|------|-------------|
| `execution_start` | Code execution begins |
| `tool_call` | MCP tool invocation |
| `capability_invoke` | Capability reuse |
| `error` | Something went wrong |
| `execution_end` | Code execution completes |

## Parent-Child Relationships

Traces form a tree structure showing how calls relate:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Trace Tree                                │
│                                                                  │
│  execution_start (root)                                         │
│  │                                                               │
│  ├── capability:process_data                                    │
│  │   │                                                           │
│  │   ├── tool:read_file                                         │
│  │   │                                                           │
│  │   └── tool:parse_json                                        │
│  │       │                                                       │
│  │       └── tool:validate_schema                               │
│  │                                                               │
│  └── capability:save_results                                    │
│      │                                                           │
│      └── tool:write_file                                        │
│                                                                  │
│  execution_end                                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Relationship Types

| Relationship | Meaning |
|--------------|---------|
| **Parent → Child** | A called B |
| **Sibling** | Called by same parent |
| **Root** | Top-level execution |
| **Sequence** | B followed A temporally |

### Building the Tree

```
1. execution_start creates root node

2. Each tool call:
   • Creates new node
   • Links to current parent
   • Becomes new "current" for nested calls
   • Returns to parent when complete

3. execution_end closes the root
```

## How Traces Feed Learning

Traces are the primary source of learning for PML's knowledge graph:

### Extracting Patterns

```
┌─────────────────────────────────────────────────────────────────┐
│  From Trace                          To Knowledge Graph          │
│  ──────────                          ─────────────────          │
│                                                                  │
│  read_file (t=0)                     read_file                  │
│       │                                   │                      │
│       ▼                                   ▼ (sequence edge)      │
│  parse_json (t=15)         ───────▶  parse_json                 │
│       │                                   │                      │
│       ▼                                   ▼ (sequence edge)      │
│  write_file (t=45)                   write_file                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### What Gets Learned

| From Trace | Creates |
|------------|---------|
| Tool A → Tool B sequence | Sequence edge |
| Capability contains Tool X | Contains edge |
| Tool A output used by Tool B | Dependency edge |
| Success/failure | Confidence adjustment |

### Learning Process

```
┌─────────────────────────────────────────────────────────────────┐
│                        Learning Pipeline                         │
│                                                                  │
│  1. COLLECT: Gather trace events during execution               │
│                                                                  │
│  2. ANALYZE: Extract patterns from trace tree                   │
│     • Which tools were used                                     │
│     • In what order                                             │
│     • With what parameters                                      │
│     • What succeeded/failed                                     │
│                                                                  │
│  3. STORE: Update knowledge graph                               │
│     • Create/strengthen edges                                   │
│     • Update confidence scores                                  │
│     • Record capability patterns                                │
│                                                                  │
│  4. INDEX: Generate embeddings for semantic search              │
│     • Intent text                                               │
│     • Tool combinations                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Trace Storage

Traces are persisted for analysis:

### What's Stored

| Data | Table | Retention |
|------|-------|-----------|
| Trace events | `trace_event` | Recent history |
| Tool sequences | `tool_dependency` | Permanent |
| Capability patterns | `workflow_pattern` | Permanent |
| Execution summaries | `workflow_execution` | Configurable |

### Query Examples

```
Find all executions that used github:create_issue:
  → workflow_execution WHERE tools_used CONTAINS 'github:create_issue'

Find common patterns after read_file:
  → tool_dependency WHERE from_tool = 'read_file' ORDER BY count DESC

Find failed executions for debugging:
  → trace_event WHERE status = 'error' AND timestamp > yesterday
```

## Visualization

Traces can be visualized for debugging:

```
Timeline View:
─────────────────────────────────────────────────────────────────
0ms        15ms       30ms       45ms       60ms       75ms
│          │          │          │          │          │
├──────────┤ read_file
           ├──────────┤ parse_json
                      ├──────────────────────┤ validate
                                             ├─────────┤ write_file
─────────────────────────────────────────────────────────────────
```

## Next

- [Feedback Loop](../03-learning/04-feedback-loop.md) - Complete learning cycle
- [Events](../07-realtime/01-events.md) - Real-time trace streaming
