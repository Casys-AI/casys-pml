# Casys PML - Documentation

_Updated: 2025-12-10_

## Quick Start

| Document                                                     | Description                           |
| ------------------------------------------------------------ | ------------------------------------- |
| [README](../README.md)                                       | Project overview, installation, usage |
| [Architecture Overview](./architecture/executive-summary.md) | Vision, 3-layer architecture, metrics |
| [PRD](./PRD.md)                                              | Product Requirements Document         |

---

## Product & Planning

### Requirements

- [PRD.md](./PRD.md) - Main Product Requirements Document
- [PRD-playground.md](./PRD-playground.md) - Playground/Demo PRD
- [UX Design Specification](./ux-design-specification.md) - UI/UX patterns

### Epics & Stories

- [epics.md](./epics.md) - All epics with stories and acceptance criteria
- [epics-playground.md](./epics-playground.md) - Playground epics
- [engineering-backlog.md](./engineering-backlog.md) - Tech debt & bugs

### Sprint Tracking

- [bmm-workflow-status.yaml](./bmm-workflow-status.yaml) - BMM workflow status
- [sprint-artifacts/](./sprint-artifacts/) - Story implementations & tech specs

---

## Architecture

### Overview

- [Architecture Index](./architecture/index.md) - Full architecture documentation
- [Executive Summary](./architecture/executive-summary.md) - Vision & key decisions
- [Technology Stack](./architecture/technology-stack-details.md) - All technologies used

### Design Documents

- [Data Architecture](./architecture/data-architecture.md) - Database schema (PGlite)
- [Security Architecture](./architecture/security-architecture.md) - Auth, sandbox, permissions
- [Deployment Architecture](./architecture/deployment-architecture.md) - Local vs cloud

### Patterns

- [Novel Patterns (1-4)](./architecture/novel-pattern-designs.md) - DAG, Context, Speculation,
  3-Loop
- [Pattern 5: Code Execution](./architecture/pattern-5-agent-code-execution-local-processing-epic-3.md)
- [Pattern 6: Worker RPC](./architecture/pattern-6-worker-rpc-bridge-emergent-capabilities-epic-7.md)
- [Pattern 7: SuperHyperGraph](./architecture/pattern-7-hypergraph-capabilities-visualization-epic-8.md)

### Decisions

- [ADR Index](./adrs/index.md) - All Architecture Decision Records (41 ADRs)

---

## Technical Reference

### Research & Spikes

- [research/](./research/) - Market & technical research
- [spikes/](./spikes/) - Technical investigations & POCs

### Diagrams

- [diagrams/](./diagrams/) - Excalidraw architecture diagrams

### Security

- [security/](./security/) - Security audits & analysis

---

## Process

### Retrospectives

- [retrospectives/](./retrospectives/) - Epic retrospectives

### Archive

- [archive/](./archive/) - Completed epics archive

---

## User Documentation

- [user-docs/](./user-docs/) - End-user guides
  - [Getting Started](./user-docs/getting-started.md)
  - [User Guide](./user-docs/user-guide.md)
  - [API Reference](./user-docs/api-reference.md)

---

## Blog & Content

- [blog/](./blog/) - Technical articles & LinkedIn posts

---

## Directory Structure

```
docs/
├── index.md                 ← You are here
├── PRD.md                   # Product requirements
├── epics.md                 # Epic breakdown
│
├── architecture/            # Architecture docs (13 files)
│   ├── index.md
│   ├── executive-summary.md
│   └── ...
│
├── adrs/                    # Decision records (41 files)
│   ├── index.md
│   ├── ADR-001-*.md
│   └── ...
│
├── sprint-artifacts/        # Story implementations
├── research/                # Research documents
├── spikes/                  # Technical spikes
├── retrospectives/          # Epic retros
├── diagrams/                # Excalidraw files
├── user-docs/               # User documentation
├── security/                # Security docs
├── blog/                    # Blog articles
└── archive/                 # Historical docs
```
