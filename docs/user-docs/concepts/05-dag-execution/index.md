# DAG & Execution

Orchestrating multi-tool workflows.

---

## Topics

| Document | Description |
|----------|-------------|
| [DAG Structure](./01-dag-structure.md) | Tasks, dependencies, and workflow definition |
| [DAG Suggester](./02-dag-suggester.md) | Automatic workflow construction |
| [Parallelization](./03-parallelization.md) | Topological sort and layer execution |
| [Checkpoints](./04-checkpoints.md) | HIL/AIL and human validation |
| [Speculative Execution](./05-speculative-execution.md) | Pre-execution for instant results |

---

## Overview

PML executes workflows as Directed Acyclic Graphs (DAGs):

1. **Structure** - Tasks with explicit dependencies
2. **Suggestion** - Can automatically build DAGs from intent
3. **Parallelization** - Independent tasks run concurrently
4. **Checkpoints** - Human-in-the-loop validation at critical points
5. **Speculation** - Pre-execute high-confidence workflows for instant results
