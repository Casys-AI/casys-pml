# Architecture Patterns

Index des patterns d'architecture du projet PML.

> **Tech-Spec detaillee:**
> [`docs/tech-specs/modular-dag-execution/`](../../tech-specs/modular-dag-execution/index.md)

## Core Patterns (Algorithmic)

| # | Pattern | Description | ADRs |
|---|---------|-------------|------|
| 01 | [DAG Builder JSON Schema](./01-dag-builder-json-schema.md) | Dependency detection via JSON Schema | ADR-002, 010, 022 |
| 02 | [Context Budget Management](./02-context-budget-management.md) | <5% context consumption, meta-tools | ADR-013 |
| 03 | [Speculative Execution](./03-speculative-execution-graphrag.md) | THE Feature - 0ms latency | ADR-005, 006, 010, 030 |
| 04 | [3-Loop Learning](./04-3-loop-learning.md) | AIL/HIL adaptive feedback | ADR-007, 008, 020 |
| 05 | [Scoring Algorithms](./05-scoring-algorithms-alpha.md) | Search/Prediction/Suggestion modes | ADR-051 (supersedes 015, 022, 038, 048) |
| 06 | [Two-Level DAG](./06-two-level-dag.md) | Phase 2a - Logical/Physical fusion | ADR-052 |
| 07 | [SHGAT Architecture](./07-shgat-architecture.md) | lib/shgat: K-head, BLAS, PER, V→V | ADR-053, 055, 056, 058, 060 |

## Epic-Specific Patterns (Implementation)

| # | Pattern | Epic | Description |
|---|---------|------|-------------|
| 08 | [Agent Code Execution](./08-agent-code-execution.md) | Epic 3 | Sandbox, safe-to-fail |
| 09 | [Worker RPC Bridge](./09-worker-rpc-bridge.md) | Epic 7 | Capabilities learning |
| 10 | [Hypergraph Visualization](./10-hypergraph-visualization.md) | Epic 8 | Compound graphs |

---

## Patterns to Document (Backlog)

The following architectural patterns exist in the codebase but lack dedicated documentation:

### Clean Architecture Phase 3 (Epic 14)

**Location:** `src/application/use-cases/`, `_bmad-output/implementation-artifacts/tech-specs/architecture-refactor-phase2/`

| Pattern | Description | Tech-Spec |
|---------|-------------|-----------|
| **Use Cases** | ExecuteDirectUseCase, DiscoverToolsUseCase, etc. | [phase-3.1-execute-handler-usecases.md](../../../_bmad-output/implementation-artifacts/tech-specs/architecture-refactor-phase2/phase-3.1-execute-handler-usecases.md) |
| **DI Adapters** | diod container, algorithm injection | [phase-3.2-di-expansion.md](../../../_bmad-output/implementation-artifacts/tech-specs/architecture-refactor-phase2/phase-3.2-di-expansion.md) |
| **EventBus Injection** | Replace direct imports with DI | [phase-3.4-eventbus-injection.md](../../../_bmad-output/implementation-artifacts/tech-specs/architecture-refactor-phase2/phase-3.4-eventbus-injection.md) |

### Hybrid Routing Pattern (Epic 14)

**Location:** `packages/pml/`, `src/application/use-cases/execute/`

| Aspect | Description |
|--------|-------------|
| **Server-side Analysis** | SWC parse → DAG → routing check |
| **Client Detection** | `X-PML-Client: package` header |
| **execute_locally** | Response type for client-routed tools |
| **SandboxExecutor** | Package-side execution with hybrid mcp.* routing |

**Tech-Spec:** [tech-spec-2026-01-09-pml-execute-hybrid-routing.md](../../../_bmad-output/implementation-artifacts/tech-spec-2026-01-09-pml-execute-hybrid-routing.md)

### CasysDB Native Engine (Epic 15)

**Location:** `crates/casys_*/`

| Component | Status | Description |
|-----------|--------|-------------|
| **casys_core** | Complete | Domain types, Value enum |
| **casys_engine** | MVP | ISO GQL parser, planner, executor |
| **casys_engine/gds/** | Planned | Node2Vec+, random walks |
| **casys_engine/ann/** | Planned | HNSW index |
| **casys_napi** | Complete | TypeScript bindings |
| **casys_pyo3** | Complete | Python bindings |

**Epic:** [epic-15-casysdb-native-engine.md](../../../_bmad-output/planning-artifacts/epics/epic-15-casysdb-native-engine.md)

---

_Updated: 2026-01-14_
