# Casys PML - Documentation

_Updated: 2025-12-31_

**Procedural Memory Layer** — Une couche mémoire open source pour agents IA qui capture les workflows et les cristallise en compétences réutilisables.

| Metric | Value |
|--------|-------|
| Source Files | 409 |
| Test Files | 304 |
| Documentation | 365+ files |
| ADRs | 56 |

---

## Quick Start

| Document | Description |
|----------|-------------|
| [README](../README.md) | Project overview, installation, usage |
| [Architecture Overview](architecture-overview.md) | Vue d'ensemble architecture système |
| [Development Guide](development-guide.md) | Setup, tasks, workflow |
| [Troubleshooting](troubleshooting.md) | Résolution de problèmes |

---

## Getting Started

### For Users

1. [Quick Start](../README.md#quick-start) - Démarrage en 2 minutes
2. [User Documentation](user-docs/) - Guides utilisateur
3. [Concepts](user-docs/concepts/) - Concepts fondamentaux

### For Developers

1. [Development Guide](development-guide.md) - Setup et workflow
2. [Contributing](../CONTRIBUTING.md) - Comment contribuer
3. [Source Tree Analysis](source-tree-analysis.md) - Structure du code annoté

---

## Product & Planning

### Requirements

| Document | Description |
|----------|-------------|
| [PRD.md](./PRD.md) | Main Product Requirements Document |
| [PRD-playground.md](./PRD-playground.md) | Playground/Demo PRD |
| [UX Design Specification](./ux-design-specification.md) | UI/UX patterns |

### Epics & Stories

| Document | Description |
|----------|-------------|
| [epics/](./epics/) | Epic definitions (11 files) |
| [sprint-artifacts/](./sprint-artifacts/) | Story implementations (110 files) |

---

## Architecture

### Overview

| Document | Description |
|----------|-------------|
| [Architecture Overview](architecture-overview.md) | **NEW** - Vue complète du système |
| [Integration Architecture](integration-architecture.md) | **NEW** - Points d'intégration |
| [Source Tree Analysis](source-tree-analysis.md) | **NEW** - Arbre source annoté |
| [Architecture Index](./architecture/index.md) | Documentation architecture détaillée |
| [Executive Summary](./architecture/executive-summary.md) | Vision & key decisions |
| [Technology Stack](./architecture/technology-stack-details.md) | All technologies used |

### Design Documents

| Document | Description |
|----------|-------------|
| [Data Architecture](./architecture/data-architecture.md) | Database schema (PGlite/PostgreSQL) |
| [Security Architecture](./architecture/security-architecture.md) | Auth, sandbox, permissions |
| [Deployment Architecture](./architecture/deployment-architecture.md) | Local vs cloud |

### Patterns

| Document | Description |
|----------|-------------|
| [Novel Patterns (1-4)](./architecture/novel-pattern-designs.md) | DAG, Context, Speculation, 3-Loop |
| [Pattern 5: Code Execution](./architecture/pattern-5-agent-code-execution-local-processing-epic-3.md) | Sandbox architecture |
| [Pattern 6: Worker RPC](./architecture/pattern-6-worker-rpc-bridge-emergent-capabilities-epic-7.md) | WorkerBridge |
| [Pattern 7: SuperHyperGraph](./architecture/pattern-7-hypergraph-capabilities-visualization-epic-8.md) | GraphRAG |

### ADRs (Architecture Decision Records)

| ADR | Titre | Status |
|-----|-------|--------|
| [ADR-035](adrs/adr-035-sandbox-architecture.md) | Sandbox via Deno subprocess | Accepted |
| [ADR-036](adrs/adr-036-event-bus.md) | BroadcastChannel EventBus | Accepted |
| [ADR-038](adrs/adr-038-active-search.md) | DR-DSP Hypergraph Pathfinding | Accepted |
| [ADR-042](adrs/adr-042-unified-scoring.md) | SHGAT Capability Scoring | Accepted |
| [ADR-043](adrs/adr-043-thompson-sampling.md) | Thompson Sampling Thresholds | Accepted |

[→ All ADRs (56)](adrs/)

---

## Core Modules

### MCP Gateway (`src/mcp/`)

| Component | Purpose |
|-----------|---------|
| `pml_discover` | Recherche hybride sémantique + graph |
| `pml_execute` | Exécution (direct, call-by-name, suggestion) |
| `handlers/` | Tool handlers |
| `connections/` | MCP client management |

### GraphRAG Engine (`src/graphrag/`)

| Algorithm | Purpose |
|-----------|---------|
| SHGAT | Spectral Hypergraph Attention (scoring) |
| DR-DSP | Directed Hypergraph Shortest Path |
| Thompson | Adaptive thresholds |
| Louvain | Community detection |

### DAG Execution (`src/dag/`)

| Component | Purpose |
|-----------|---------|
| ControlledExecutor | Layer-based parallel execution |
| DAGOptimizer | Task fusion |
| CheckpointManager | Execution checkpoints |

### Sandbox (`src/sandbox/`)

| Component | Purpose |
|-----------|---------|
| WorkerBridge | RPC to isolated worker |
| SecurityValidator | Permission validation |
| PIIDetector | Sensitive data detection |

---

## Technical Reference

### Tech Specs

[→ All Tech Specs (56)](tech-specs/)

### Spikes & Research

| Directory | Contents |
|-----------|----------|
| [spikes/](./spikes/) | Technical investigations (37 files) |
| [research/](./research/) | Market & technical research (8 files) |

### Diagrams

[→ Excalidraw Diagrams](./diagrams/)

---

## Operations

### Development

| Task | Command |
|------|---------|
| Dev server | `deno task dev` |
| Dashboard | `deno task dev:fresh` |
| Tests | `deno task test` |
| Type check | `deno task check` |

[→ Full Development Guide](development-guide.md)

### Production

| Task | Command |
|------|---------|
| Start | `deno task prod:start` |
| Status | `deno task prod:status` |
| Logs | `deno task prod:logs` |
| Deploy | `deno task deploy:all` |

### Monitoring

| Service | Port |
|---------|------|
| MCP API | 3003 |
| Dashboard | 8081 |
| Grafana | 3000 |
| Prometheus | 9091 |
| OTEL | 4318 |

---

## Support

### Reference

| Document | Description |
|----------|-------------|
| [Glossary](glossary.md) | **NEW** - 60+ termes et acronymes |
| [Troubleshooting](troubleshooting.md) | **NEW** - 10 problèmes courants |

### Security

[→ Security Documentation](./security/)

---

## Process

### Retrospectives

[→ Epic Retrospectives](./retrospectives/)

---

## User Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](./user-docs/getting-started/) | Quick start guides |
| [Concepts](./user-docs/concepts/) | Core concepts |
| [Guides](./user-docs/guides/) | How-to guides |
| [Reference](./user-docs/reference/) | API reference |

---

## Blog & Content

[→ Technical Blog](./blog/)

---

## Directory Structure

```
docs/
├── index.md                    ← You are here
├── PRD.md                      # Product requirements
│
├── architecture-overview.md    # NEW - System overview
├── integration-architecture.md # NEW - Integration points
├── source-tree-analysis.md     # NEW - Annotated source tree
├── development-guide.md        # NEW - Dev guide
├── glossary.md                 # NEW - Terms & acronyms
├── troubleshooting.md          # NEW - Problem solving
│
├── architecture/               # Architecture docs (23 files)
├── adrs/                       # Decision records (56 files)
├── tech-specs/                 # Technical specs (56 files)
├── sprint-artifacts/           # Story implementations (110 files)
├── spikes/                     # Technical spikes (37 files)
├── epics/                      # Epic definitions (11 files)
├── research/                   # Research documents (8 files)
├── user-docs/                  # User documentation (41 files)
├── retrospectives/             # Epic retros
├── diagrams/                   # Excalidraw files
├── security/                   # Security docs
└── blog/                       # Blog articles
```

---

## Documents Generated (2025-12-31)

| Document | Description |
|----------|-------------|
| `architecture-overview.md` | Vue d'ensemble architecture |
| `integration-architecture.md` | Architecture d'intégration (OTEL, MCP, Events) |
| `source-tree-analysis.md` | Arbre source annoté (27 modules) |
| `development-guide.md` | Guide de développement complet |
| `glossary.md` | Glossaire (60+ termes) |
| `troubleshooting.md` | Guide de dépannage |
| `index.md` | Cet index (mis à jour) |
