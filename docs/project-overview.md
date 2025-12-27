# Casys PML - Project Overview

> **Procedural Memory Layer** - An open-source PML for AI agents that captures emergent workflows
> and crystallizes them into reusable skills.

**Last Updated:** 2025-12-21 | **Scan Level:** Exhaustive | **Version:** 0.1.0

---

## Quick Reference

| Property               | Value                                            |
| ---------------------- | ------------------------------------------------ |
| **Project Name**       | Casys PML (Procedural Memory Layer)              |
| **Package**            | @casys/mcp-gateway                               |
| **Repository Type**    | Monolith (hybrid: backend + web + library + cli) |
| **Runtime**            | Deno 2.x                                         |
| **Language**           | TypeScript (strict mode)                         |
| **Primary Port (API)** | 3003 (dev) / 3001 (prod)                         |
| **Dashboard Port**     | 8081 (dev) / 8080 (prod)                         |
| **License**            | AGPL-3.0                                         |

---

## Executive Summary

Casys PML is an intelligent MCP (Model Context Protocol) gateway that solves two critical problems
in AI agent ecosystems:

1. **Context Saturation** - Tool schemas consume 30-50% of LLM context window → reduced to <5%
2. **Sequential Latency** - Multi-tool workflows run serially → parallelized via DAG execution

The system exposes 8 meta-tools that orchestrate underlying MCP servers, providing semantic tool
discovery, DAG-based workflow execution, and sandboxed code execution with full tracing.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENTS                                        │
│         Claude Code / AI Agents / Dashboard / CLI                        │
└─────────────────────────────┬───────────────────────────────────────────┘
                              │ MCP Protocol (HTTP/SSE)
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      PML GATEWAY SERVER (:3003)                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     8 META-TOOLS EXPOSED                         │    │
│  │  pml:execute_dag │ pml:search_tools │ pml:search_capabilities   │    │
│  │  pml:execute_code │ pml:continue │ pml:abort │ pml:replan       │    │
│  │  pml:approval_response                                           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐            │
│  │  GraphRAG │  │    DAG    │  │  Sandbox  │  │  Events   │            │
│  │  Engine   │  │ Executor  │  │   (RPC)   │  │    Bus    │            │
│  │           │  │           │  │           │  │           │            │
│  │ • Semantic│  │ • Parallel│  │ • Zero    │  │ • SSE     │            │
│  │   Search  │  │   Exec    │  │   Perms   │  │ • Broad-  │            │
│  │ • DAG     │  │ • Check-  │  │ • RPC     │  │   cast    │            │
│  │   Suggest │  │   points  │  │   Trace   │  │   Channel │            │
│  │ • Local α │  │ • HIL/AIL │  │ • PII     │  │           │            │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘            │
│        └──────────────┴──────────────┴──────────────┘                   │
│                              │                                           │
│  ┌───────────────────────────┴───────────────────────────────────────┐  │
│  │                    DATA LAYER                                      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │  │
│  │  │   PGlite    │  │  Deno KV    │  │  Embeddings │                │  │
│  │  │ (PostgreSQL)│  │  (Sessions) │  │  (BGE-M3)   │                │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   MCP Server    │ │   MCP Server    │ │   MCP Server    │
│   (filesystem)  │ │    (memory)     │ │   (playwright)  │
│                 │ │                 │ │                 │
│   stdio/HTTP    │ │   stdio/HTTP    │ │   stdio/HTTP    │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

---

## Technology Stack

### Core Runtime

| Technology     | Version | Purpose                                        |
| -------------- | ------- | ---------------------------------------------- |
| **Deno**       | 2.x     | Runtime with native TypeScript, security-first |
| **TypeScript** | Strict  | Type safety with noImplicitAny, noUnusedLocals |

### Frontend (Dashboard)

| Technology          | Version | Purpose                                         |
| ------------------- | ------- | ----------------------------------------------- |
| **Fresh**           | 2.0.0   | Deno-native web framework, Islands architecture |
| **Preact**          | 10.27.0 | Lightweight React alternative (3KB)             |
| **@preact/signals** | 2.5.1   | Fine-grained reactivity                         |
| **Vite**            | 7.1.3   | Build tool with HMR                             |
| **TailwindCSS**     | 4.1.10  | Utility-first CSS                               |

### Backend & Protocol

| Technology       | Version    | Purpose                               |
| ---------------- | ---------- | ------------------------------------- |
| **MCP SDK**      | 1.15.1     | Model Context Protocol implementation |
| **Smithery SDK** | 2.1.0      | MCP server discovery & HTTP transport |
| **Cliffy**       | 1.0.0-rc.8 | CLI framework                         |
| **Zod**          | 3.23.0     | Schema validation                     |

### Database & Persistence

| Technology        | Version  | Purpose                           |
| ----------------- | -------- | --------------------------------- |
| **PGlite**        | 0.3.14   | Embedded PostgreSQL (WASM)        |
| **PGlite/vector** | 0.3.14   | Vector search extension           |
| **Deno KV**       | unstable | Key-value store (sessions, cache) |
| **Drizzle ORM**   | 0.39.1   | Type-safe SQL & 18 migrations     |

### GraphRAG & ML

| Technology                         | Version | Purpose                             |
| ---------------------------------- | ------- | ----------------------------------- |
| **Graphology**                     | 0.25.4  | Graph data structure                |
| **graphology-metrics**             | 2.2.0   | PageRank, centrality algorithms     |
| **graphology-communities-louvain** | 2.0.1   | Community detection                 |
| **@huggingface/transformers**      | 3.7.6   | BGE-M3 embeddings (1024-dim, local) |
| **ml-matrix**                      | 6.11.1  | Matrix operations                   |
| **simple-statistics**              | 7.8.0   | Statistical calculations            |

### Observability

| Technology     | Version | Purpose                      |
| -------------- | ------- | ---------------------------- |
| **Sentry**     | 10.8.0  | Error tracking & performance |
| **Grafana**    | 12.3.0  | Dashboards                   |
| **Prometheus** | 3.1.0   | Metrics collection           |
| **Loki**       | 3.4.1   | Log aggregation              |

---

## Codebase Metrics

| Metric                  | Value  |
| ----------------------- | ------ |
| **TypeScript Files**    | 248    |
| **Lines of Code**       | 56,694 |
| **Test Files**          | 203    |
| **Source Modules**      | 19     |
| **Database Migrations** | 18     |
| **Preact Islands**      | 15     |
| **ADRs**                | 50     |

---

## Source Structure

```
src/
├── main.ts              # Entry point (CLI)
├── mcp/         (47)    # MCP Gateway, handlers, routing
├── graphrag/    (43)    # Graph engine, DAG suggester, spectral clustering
├── web/         (36)    # Fresh dashboard, 15 islands
├── dag/         (25)    # DAG executor, checkpoints, streaming
├── db/          (22)    # PGlite + Drizzle (18 migrations)
├── capabilities/(15)    # Capability store, matcher, permissions
├── sandbox/     (10)    # Zero-permission executor, RPC bridge, PII
├── cli/         (9)     # Commands: init, serve, status, workflows
├── telemetry/   (7)     # Sentry, logging, metrics
├── server/      (6)     # HTTP server + auth
├── lib/         (5)     # Shared utilities
├── context/     (4)     # LLM context optimization
├── speculation/ (4)     # Speculative execution
├── events/      (3)     # Event system (BroadcastChannel)
├── learning/    (3)     # Episodic memory
├── vector/      (3)     # BGE-M3 embeddings
├── errors/      (2)     # Error handling
├── utils/       (2)     # Generic helpers
└── health/      (1)     # Health checks
```

---

## MCP Meta-Tools

| Tool                      | Description                                     |
| ------------------------- | ----------------------------------------------- |
| `pml:execute_dag`         | Execute DAG workflows (intent or explicit mode) |
| `pml:search_tools`        | Semantic + graph hybrid tool discovery          |
| `pml:search_capabilities` | Find proven code patterns                       |
| `pml:execute_code`        | Sandboxed TypeScript with MCP injection         |
| `pml:continue`            | Resume paused workflow                          |
| `pml:abort`               | Stop running workflow                           |
| `pml:replan`              | Modify DAG with new requirements                |
| `pml:approval_response`   | Respond to HIL checkpoints                      |

---

## Key Architectural Patterns

### 1. Zero-Permission Sandbox with RPC Tracing

All user code executes in a Deno subprocess with **zero permissions**. Operations are proxied via
RPC to the main process, enabling:

- Complete isolation of untrusted code
- Full audit trail of all operations
- Fine-grained permission control at runtime

### 2. GraphRAG Hybrid Search

Combines semantic similarity (vector search) with graph-based relatedness:

- Adamic-Adar algorithm for link prediction
- Local adaptive alpha (ADR-048) for context-aware weighting
- Louvain community detection for tool grouping

### 3. DAG Execution with HIL/AIL

Workflows execute as directed acyclic graphs with:

- Automatic parallelization of independent tasks
- Human-in-the-Loop (HIL) checkpoints for critical operations
- Agent-in-the-Loop (AIL) for autonomous decisions with validation
- Checkpoint/resume for long-running workflows

### 4. Event-Driven Architecture

BroadcastChannel-based event distribution (ADR-036):

- Cross-process event propagation
- SSE streaming to dashboard
- Real-time graph updates and metrics

---

## CLI Commands

| Command           | Description                                         |
| ----------------- | --------------------------------------------------- |
| `pml init`        | Initialize PML (discover MCPs, generate embeddings) |
| `pml serve`       | Start the MCP gateway server                        |
| `pml status`      | Check system health                                 |
| `pml workflows`   | Manage workflow templates                           |
| `pml speculation` | Manage speculative execution                        |

> **Note:** CLI currently uses `pml` name - migration to `pml` pending.

---

## Development Commands

```bash
# Development
deno task dev              # API Gateway (:3003)
deno task dev:fresh        # Dashboard (:8081)

# Testing
deno task test             # All tests
deno task test:unit        # Unit tests (parallel + sequential)
deno task test:integration # Integration tests

# Quality
deno task lint             # Linter
deno task fmt              # Format
deno task check            # Type check

# Database
deno task db:generate      # Generate migrations
deno task db:studio        # Drizzle Studio

# Production
deno task prod:start       # Start systemd services
deno task prod:stop        # Stop services
deno task deploy:all       # Pull + build + restart
```

---

## Environment Variables

### Core (Required)

| Variable      | Default       | Description          |
| ------------- | ------------- | -------------------- |
| `PML_DB_PATH` | `.pml-dev.db` | PGlite database path |

### Optional Services

| Variable               | Default | Description                      |
| ---------------------- | ------- | -------------------------------- |
| `FRESH_PORT`           | 8081    | Dashboard port (dev)             |
| `PORT_API`             | 3003    | API port (dev)                   |
| `SENTRY_DSN`           | -       | Sentry error tracking (optional) |
| `GITHUB_CLIENT_ID`     | -       | GitHub OAuth (prod only)         |
| `GITHUB_CLIENT_SECRET` | -       | GitHub OAuth (prod only)         |

### MCP Server-Specific (Optional)

> These are only needed if using the corresponding MCP servers via the gateway.

| Variable      | MCP Server | Description        |
| ------------- | ---------- | ------------------ |
| `EXA_API_KEY` | exa        | Exa search API key |
| `API_KEY`     | magic      | Magic UI API key   |

---

## External Integrations

| Integration       | Purpose                   | Required        |
| ----------------- | ------------------------- | --------------- |
| **GitHub OAuth**  | User authentication       | Prod only       |
| **Smithery**      | MCP server discovery      | Optional        |
| **HuggingFace**   | BGE-M3 embeddings (local) | Auto-downloaded |
| **Sentry**        | Error tracking            | Optional        |
| **Grafana Stack** | Monitoring                | Optional        |

---

## Documentation Structure

| Category             | Count | Location               |
| -------------------- | ----- | ---------------------- |
| **Architecture**     | 15    | docs/architecture/     |
| **ADRs**             | 50    | docs/adrs/             |
| **Epics**            | 10    | docs/epics/            |
| **Tech Specs**       | 12    | docs/tech-specs/       |
| **Spikes**           | 31    | docs/spikes/           |
| **Sprint Artifacts** | 113   | docs/sprint-artifacts/ |
| **User Docs**        | ~20   | docs/user-docs/        |

---

## Key ADRs

| ADR     | Title                                |
| ------- | ------------------------------------ |
| ADR-001 | PGlite Vector Search                 |
| ADR-002 | Custom DAG Implementation            |
| ADR-003 | BGE-M3 Local Embeddings              |
| ADR-007 | DAG Adaptive Feedback Loops          |
| ADR-008 | Episodic Memory Adaptive Thresholds  |
| ADR-032 | Worker RPC Bridge                    |
| ADR-035 | Permission Sets Sandbox Security     |
| ADR-036 | Broadcast Channel Event Distribution |
| ADR-037 | Deno KV Cache Layer                  |
| ADR-048 | Hierarchical Heat Diffusion Alpha    |

See [docs/adrs/](adrs/index.md) for all 50 ADRs.

---

## Known Issues

| Issue      | Description                     | Files Affected         |
| ---------- | ------------------------------- | ---------------------- |
| CLI naming | CLI uses `pml` instead of `pml` | src/main.ts, deno.json |

---

## Related Documents

- [Architecture Index](architecture/index.md)
- [ADR Index](adrs/index.md)
- [Epic Overview](epics/overview.md)
- [User Documentation](user-docs/index.md)
- [QUICKSTART](QUICKSTART.md)
- [PRD](PRD.md)
