# DAG Structure

> Directed Acyclic Graphs for workflow orchestration

## What is a DAG?

A **DAG** (Directed Acyclic Graph) is a structure that represents a workflow where:
- **Directed**: Tasks have a clear direction (A → B means A runs before B)
- **Acyclic**: No loops—a task can't depend on itself directly or indirectly
- **Graph**: Tasks are nodes, dependencies are edges

```
┌─────────────────────────────────────────────────────────────────┐
│                      Example DAG                                 │
│                                                                  │
│         ┌──────────┐                                            │
│         │  Task A  │                                            │
│         │ (start)  │                                            │
│         └────┬─────┘                                            │
│              │                                                   │
│       ┌──────┴──────┐                                           │
│       │             │                                           │
│       ▼             ▼                                           │
│  ┌──────────┐  ┌──────────┐                                     │
│  │  Task B  │  │  Task C  │   ← Can run in parallel             │
│  └────┬─────┘  └────┬─────┘                                     │
│       │             │                                           │
│       └──────┬──────┘                                           │
│              │                                                   │
│              ▼                                                   │
│         ┌──────────┐                                            │
│         │  Task D  │   ← Waits for B and C                      │
│         │  (end)   │                                            │
│         └──────────┘                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

DAGs are ideal for workflows because they:
- Define clear execution order
- Enable parallel execution of independent tasks
- Prevent infinite loops
- Make dependencies explicit

## Tasks

A **task** is a unit of work in the DAG. Each task has:

| Property | Description |
|----------|-------------|
| `id` | Unique identifier |
| `toolName` | MCP tool to execute |
| `serverHint` | Preferred MCP server |
| `parameters` | Input values for the tool |
| `dependsOn` | List of task IDs this task waits for |
| `priority` | Execution priority (lower = higher priority) |
| `checkpoint` | Whether to pause for approval |

### Task States

Tasks progress through states:

```
PENDING ──▶ RUNNING ──▶ COMPLETED
                │
                └──▶ FAILED
                       │
                       └──▶ SKIPPED (if dependency failed)
```

## Dependencies (dependsOn)

The `dependsOn` array specifies which tasks must complete before a task can start:

```
Task D depends on [Task B, Task C]

Meaning:
  • Task D waits for BOTH B and C to complete
  • If B finishes first, D still waits for C
  • If either fails, D may be skipped
```

### Dependency Types

| Pattern | Behavior |
|---------|----------|
| `dependsOn: []` | Runs immediately (no dependencies) |
| `dependsOn: ["A"]` | Waits for A to complete |
| `dependsOn: ["A", "B"]` | Waits for BOTH A and B |

### Data Flow

Tasks can use outputs from their dependencies:

```
Task A: Read file → outputs content
Task B: dependsOn [A], uses A's output to parse

Data flows: A.output → B.input
```

## Building DAGs

DAGs can be created in two ways:

### 1. Explicit Definition

Define the structure manually:

```
workflow:
  tasks:
    - id: read
      toolName: read_file
      parameters: { path: "data.json" }

    - id: parse
      toolName: parse_json
      dependsOn: [read]

    - id: write
      toolName: write_file
      dependsOn: [parse]
      parameters: { path: "output.json" }
```

### 2. Intent-Based (DAG Suggester)

Let PML build the DAG from your intent:

```
Intent: "Read data.json and write to output.json"

PML automatically creates:
  read → parse → write
```

## Validation

Before execution, PML validates DAGs:

| Check | Description |
|-------|-------------|
| **No cycles** | A → B → A is invalid |
| **Valid references** | dependsOn references existing tasks |
| **Tool exists** | toolName maps to real MCP tool |
| **Parameters valid** | Required parameters are provided |

## Example

A complete DAG for processing a file:

```
┌─────────────────────────────────────────────────────────────────┐
│  Workflow: Process JSON File                                     │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Task: read_input                                          │   │
│  │ Tool: filesystem:read_file                                │   │
│  │ Params: { path: "input.json" }                           │   │
│  │ DependsOn: []                                            │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│                           ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Task: validate                                            │   │
│  │ Tool: json:validate                                       │   │
│  │ DependsOn: [read_input]                                  │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│              ┌────────────┴────────────┐                        │
│              │                         │                        │
│              ▼                         ▼                        │
│  ┌───────────────────┐    ┌───────────────────┐                │
│  │ Task: transform   │    │ Task: backup      │                │
│  │ DependsOn: [val]  │    │ DependsOn: [val]  │                │
│  └─────────┬─────────┘    └───────────────────┘                │
│            │                                                    │
│            ▼                                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Task: write_output                                        │   │
│  │ Tool: filesystem:write_file                               │   │
│  │ DependsOn: [transform]                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Next

- [DAG Suggester](./02-dag-suggester.md) - Automatic DAG construction
- [Parallelization](./03-parallelization.md) - Concurrent execution
