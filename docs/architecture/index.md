# Architecture Documentation - Casys PML

## Overview

- [Executive Summary](./executive-summary.md) - Vision, 3-layer architecture, key metrics
- [Technology Stack](./technology-stack-details.md) - Runtime, storage, ML, integrations
- [Epic to Architecture Mapping](./epic-to-architecture-mapping.md) - Epics → modules/components

## Core Design

- [Data Architecture](./data-architecture.md) - Database schema, PGlite, migrations
- [Security Architecture](./security-architecture.md) - Auth, sandbox, permissions
- [Performance Considerations](./performance-considerations.md) - Targets, optimization strategies
- [Deployment Architecture](./deployment-architecture.md) - Local vs cloud, dual-server setup

## Patterns

### Novel Patterns (1-5)

- [Novel Pattern Designs](./novel-pattern-designs.md)
  - Pattern 1: DAG Builder with JSON Schema Dependency Detection
  - Pattern 2: Context Budget Management
  - Pattern 3: Speculative Execution with GraphRAG
  - Pattern 4: 3-Loop Learning Architecture
  - Pattern 5: Scoring Algorithms & Adaptive Alpha (ADR-015, 023, 024, 026, 038, 048)

### Epic-Specific Patterns

- [Agent Code Execution (Epic 3)](./pattern-5-agent-code-execution-local-processing-epic-3.md) -
  Sandbox, safe-to-fail
- [Worker RPC Bridge (Epic 7)](./pattern-6-worker-rpc-bridge-emergent-capabilities-epic-7.md) -
  Capabilities learning
- [Hypergraph Visualization (Epic 8)](./pattern-7-hypergraph-capabilities-visualization-epic-8.md) -
  Compound graphs

## Implementation

- [Implementation Patterns](./implementation-patterns.md) - Naming, code organization, error
  handling, logging
- [Project Structure](./project-structure.md) - Directory layout, module boundaries

## Decisions

- [Architecture Decision Records](./architecture-decision-records-adrs.md) →
  [Full ADR Index](../adrs/index.md)

---

## Quick Links

| Need                 | Document                                                |
| -------------------- | ------------------------------------------------------- |
| What is PML?         | [Executive Summary](./executive-summary.md)             |
| What tech do we use? | [Technology Stack](./technology-stack-details.md)       |
| Database schema?     | [Data Architecture](./data-architecture.md)             |
| How to name things?  | [Implementation Patterns](./implementation-patterns.md) |
| Why this decision?   | [ADR Index](../adrs/index.md)                           |
| Epic status?         | [Epic Mapping](./epic-to-architecture-mapping.md)       |

---

_Updated: 2025-12-17_
