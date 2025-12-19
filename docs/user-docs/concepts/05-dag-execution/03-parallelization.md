# Parallelization

> Running independent tasks simultaneously

## En bref

La parallelisation permet d'executer plusieurs taches independantes en meme temps, comme plusieurs chefs dans une cuisine qui preparent differents plats simultanement. Pendant qu'un chef prepare la salade, un autre cuit la viande, et un troisieme prepare le dessert. Le service est beaucoup plus rapide que si un seul chef faisait tout sequentiellement.

**Points cles :**
- Execution simultanee de taches independantes
- Organisation en couches (layers) basee sur les dependances
- Reduction significative du temps d'execution total
- Optimisation automatique de l'ordre d'execution

**Analogie :** Brigade de cuisine - Plusieurs chefs travaillent en parallele sur differents plats, mais respectent l'ordre (entree avant plat, plat avant dessert).

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

PML performs a **topological sort** to determine valid execution orders:

```
DAG: A → B,C → D
Valid: [A, B, C, D] or [A, C, B, D]
Rule: A before B,C; B,C before D

Identifies: First tasks, waiting tasks, parallel tasks
```

## Layers

PML organizes tasks into **layers** based on their dependencies:

![DAG Parallelization](excalidraw:src/web/assets/diagrams/dag-parallelization.excalidraw)

### Layer Rules

Same layer tasks have no inter-dependencies. Task layer = max(dependency layers) + 1. Layer 0 = no dependencies.

```
DAG: A → B,C → D
Layers: A(0), B(1), C(1), D(2)
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

## Exemple concret : Traitement batch de donnees

Traitement de 1000 utilisateurs :

```
SEQUENTIEL: User 1 → User 2 → ... → User 1000
  Temps: 1000 × 2s = 2000s (33 min)

PARALLELE:
  Layer 0: Fetch all users (5s)
  Layer 1: Split into 10 chunks (1s)
  Layer 2: Process 10 chunks en parallele (200s max)
  Layer 3: Merge results (2s)
  Layer 4: Write output (3s)
  Temps total: 211s (3.5 min)

GAIN: 9.5x plus rapide!

ANALOGIE CUISINE :
  Sequentiel: 1 chef fait tout pour chaque table
  Parallele: Chef entrees + Chef plats + Chef desserts
    → Service simultane, meme ordre respecte
```

**Cas pratique : Validation 500 URLs**
```
Sans parallelisation: 500 × 1s = 500s (8.3 min)
Avec 10 batches paralleles: 13s
GAIN: 38x plus rapide!

Limitations:
  - GitHub API: 5000 req/hour → max 80/min
  - RAM 8GB, 100MB/tache → max 80 paralleles
  - Solution: config max_parallel: 50
```

## Next

- [Checkpoints](./04-checkpoints.md) - Pausing for approval
- [Sandbox Execution](../06-code-execution/01-sandbox.md) - Secure code execution
