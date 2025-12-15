# Parallelization

> Running independent tasks simultaneously

## Why Parallelize?

Tasks that don't depend on each other can run at the same time, dramatically reducing total execution time.

```
Sequential (slow):          Parallel (fast):
─────────────────           ─────────────────
A ──▶ B ──▶ C ──▶ D         A ──┬──▶ B ──┬──▶ D
                                 │        │
Total: 4 time units              └──▶ C ──┘

                            Total: 3 time units
```

## Topological Sort

Before execution, PML performs a **topological sort** to determine valid execution orders that respect dependencies.

```
DAG:
     A
    / \
   B   C
    \ /
     D

Topological Sort:
  Valid orders: [A, B, C, D] or [A, C, B, D]

  Key rule: A must come before B, C
            B and C must come before D
```

The sort identifies:
- Which tasks can run first (no dependencies)
- Which tasks must wait
- Which tasks can run in parallel

## Layers

PML organizes tasks into **layers** based on their dependencies:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Layer Execution                           │
│                                                                  │
│  Layer 0: [A]        ← Tasks with no dependencies               │
│           │                                                      │
│           ▼                                                      │
│  Layer 1: [B, C, E]  ← Can all run in PARALLEL                  │
│           │                                                      │
│           ▼                                                      │
│  Layer 2: [D, F]     ← Wait for Layer 1, then run in PARALLEL   │
│           │                                                      │
│           ▼                                                      │
│  Layer 3: [G]        ← Final task                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Layer Rules

| Rule | Description |
|------|-------------|
| Tasks in the same layer have no dependencies on each other |
| A task's layer = max(dependency layers) + 1 |
| Layer 0 contains tasks with no dependencies |
| Execution proceeds layer by layer |

### Layer Calculation

```
Given DAG:
  A → B → D
  A → C → D

Layer assignment:
  A: Layer 0 (no dependencies)
  B: Layer 1 (depends on A in Layer 0)
  C: Layer 1 (depends on A in Layer 0)
  D: Layer 2 (depends on B, C in Layer 1)
```

## Parallel vs Sequential

PML determines execution mode for each layer:

### Within a Layer: Parallel

Tasks in the same layer run simultaneously:

```
Layer 1: [fetch_user, fetch_orders, fetch_settings]

Execution:
  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
  │ fetch_user  │  │fetch_orders │  │fetch_settings│
  └─────────────┘  └─────────────┘  └─────────────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
                    All complete
                         │
                         ▼
                    Next layer
```

### Between Layers: Sequential

Layers execute one after another:

```
Layer 0 completes → Layer 1 starts → Layer 2 starts → ...

Each layer waits for the previous layer to fully complete.
```

## Execution Modes

PML supports different parallelization strategies:

### Full Parallel (Default)

Maximum parallelism within each layer:

```
Layer 1: 5 tasks → 5 concurrent executions
```

### Limited Parallel

Restrict concurrent executions:

```
Setting: max_concurrent = 3

Layer 1: 5 tasks → 3 at a time, then 2
```

### Per-Layer Validation

Pause after each layer for review:

```
Layer 0: Execute
         ↓
      [Checkpoint: Review results]
         ↓
Layer 1: Execute (if approved)
```

## Example

A workflow to process multiple files:

```
┌─────────────────────────────────────────────────────────────────┐
│  Intent: "Read 3 config files and merge them"                   │
│                                                                  │
│  Layer 0: [read_a, read_b, read_c]  ← PARALLEL                  │
│                                                                  │
│        ┌─────────────┐                                          │
│        │   read_a    │──┐                                       │
│        └─────────────┘  │                                       │
│        ┌─────────────┐  │                                       │
│        │   read_b    │──┼──▶ All run simultaneously            │
│        └─────────────┘  │                                       │
│        ┌─────────────┐  │                                       │
│        │   read_c    │──┘                                       │
│        └─────────────┘                                          │
│               │                                                  │
│               ▼                                                  │
│  Layer 1: [merge]  ← Waits for all reads                        │
│                                                                  │
│        ┌─────────────┐                                          │
│        │   merge     │──▶ Combines results from a, b, c        │
│        └─────────────┘                                          │
│                                                                  │
│  Time comparison:                                                │
│    Sequential: read_a + read_b + read_c + merge = 4 units       │
│    Parallel:   max(read_a, read_b, read_c) + merge = 2 units    │
│                                                                  │
│    Speedup: 2x                                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Benefits of Parallelization

| Benefit | Description |
|---------|-------------|
| **Speed** | Total time reduced significantly |
| **Efficiency** | Better resource utilization |
| **Scalability** | Add more tasks without linear slowdown |
| **Independence** | Failures in one task don't block others |

## Considerations

| Factor | Impact |
|--------|--------|
| **Rate limits** | External APIs may throttle parallel requests |
| **Resource usage** | More parallel = more memory/CPU |
| **Error handling** | Must handle partial failures |
| **Data dependencies** | Can't parallelize dependent tasks |

## Next

- [Checkpoints](./04-checkpoints.md) - Pausing for approval
- [Sandbox Execution](../06-code-execution/01-sandbox.md) - Secure code execution
