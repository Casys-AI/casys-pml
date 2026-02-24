# Casys PML - Project Overview

> **Procedural Memory Layer** — An intelligent MCP gateway for AI agents that discovers tools
> semantically, executes workflows in parallel, and learns from every execution.

**Last Updated:** 2026-02-24 | **Scan Level:** Exhaustive | **Version:** 0.1.0

---

## Quick Reference

| Property               | Value                                                   |
| ---------------------- | ------------------------------------------------------- |
| **Project Name**       | Casys PML (Procedural Memory Layer)                     |
| **Package**            | @casys/mcp-gateway                                      |
| **Repository Type**    | Monorepo (server + SDK/CLI + libraries)                 |
| **Runtime**            | Deno 2.x                                                |
| **Language**           | TypeScript (strict mode)                                |
| **Primary Port (API)** | 3003 (dev)                                              |
| **Dashboard Port**     | 8081 (dev)                                              |
| **License**            | MIT                                                     |

---

## Executive Summary

Casys PML is an intelligent MCP (Model Context Protocol) gateway that solves two critical problems
in AI agent ecosystems:

1. **Context Saturation** — Tool schemas consume 30-50% of LLM context window → reduced to <5%
2. **Sequential Latency** — Multi-tool workflows run serially → parallelized via DAG execution

The system exposes 3 core meta-tools (`pml:discover`, `pml:execute`, `pml:admin`) that orchestrate
underlying MCP servers, providing semantic tool discovery, DAG-based workflow execution, sandboxed
code execution with full tracing, and GRU-powered next-tool prediction.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENTS                                        │
│    Claude Code / AI Agents / Dashboard / CLI (packages/pml)              │
│    Playground Agent (gpt-5-mini) / Landing V2                            │
└─────────────────────────────┬───────────────────────────────────────────┘
                              │ MCP Protocol (HTTP/SSE + stdio)
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      PML GATEWAY SERVER (:3003)                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │              3 CORE META-TOOLS (+ 8 legacy)                      │    │
│  │  pml:discover │ pml:execute │ pml:admin                          │    │
│  │  (legacy: execute_dag, search_tools, search_capabilities,        │    │
│  │   execute_code, continue, abort, replan, approval_response)      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐           │
│  │  GraphRAG │  │    DAG    │  │  Sandbox  │  │  Events   │           │
│  │  Engine   │  │ Executor  │  │   (RPC)   │  │  & Feed   │           │
│  │           │  │           │  │           │  │           │           │
│  │ • Semantic│  │ • Parallel│  │ • Zero    │  │ • SSE     │           │
│  │   Search  │  │   Exec    │  │   Perms   │  │ • _meta.ui│           │
│  │ • GRU     │  │ • Check-  │  │ • RPC     │  │ • Viewers │           │
│  │   Predict │  │   points  │  │   Trace   │  │ • Broad-  │           │
│  │ • SHGAT   │  │ • HIL/AIL │  │ • PII     │  │   cast    │           │
│  │   Score   │  │ • 2-Level │  │           │  │           │           │
│  │ • Local α │  │   DAG     │  │           │  │           │           │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘           │
│        └──────────────┴──────────────┴──────────────┘                   │
│                              │                                           │
│  ┌───────────────────────────┴───────────────────────────────────────┐  │
│  │                    DATA LAYER                                      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │  │
│  │  │   PGlite    │  │  Deno KV    │  │  Embeddings │                │  │
│  │  │ (dev/embed) │  │  (Sessions) │  │  (BGE-M3)   │                │  │
│  │  ├─────────────┤  └─────────────┘  └─────────────┘                │  │
│  │  │ PostgreSQL  │                                                   │  │
│  │  │ (prod)      │                                                   │  │
│  │  └─────────────┘                                                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
          │                 │                 │                │
          ▼                 ▼                 ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  lib/std     │  │  lib/server  │  │  lib/syson   │  │  lib/erpnext │
│  (120+ mini  │  │  (@casys/    │  │  (SysON v2   │  │  (@casys/    │
│   tools)     │  │   mcp-server)│  │   24 tools)  │  │   mcp-erpnext│
│  stdio/HTTP  │  │  npm+JSR     │  │  local       │  │   npm+JSR)   │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

---

## Project Structure

```
.
├── src/                     # PML Server (core)
├── packages/pml/            # SDK/CLI Client (standalone binary)
├── lib/                     # Satellite Libraries
│   ├── std/                 # MiniTools (120+ tools)
│   ├── server/              # @casys/mcp-server (npm+JSR, v0.9.0)
│   ├── erpnext/             # @casys/mcp-erpnext (npm+JSR, v0.1.8)
│   ├── mcp-apps-bridge/     # @casys/mcp-bridge (npm+JSR, v0.2.0)
│   ├── syson/               # SysON v2 integration (24 tools)
│   ├── plm/                 # PLM BOM tools (4 tools)
│   ├── sim/                 # Simulation engine
│   ├── onshape/             # Onshape CAD (GLTF export)
│   ├── gru/                 # GRU training + prod weights
│   ├── shgat-tf/            # SHGAT TensorFlow training
│   ├── shgat-for-gru/       # SHGAT analysis notebooks
│   └── casys-hub-vitrine/   # Marketing site
├── config/                  # Externalized YAML configs
├── docs/                    # Documentation (ADRs, user-docs, research)
├── tests/                   # Unit, integration, architecture tests
└── _bmad-output/            # BMAD-generated artifacts (PRD, epics, stories)
```

---

## Technology Stack

### Core Runtime

| Technology     | Version | Purpose                                        |
| -------------- | ------- | ---------------------------------------------- |
| **Deno**       | 2.x     | Runtime with native TypeScript, security-first |
| **TypeScript** | Strict  | Type safety with noImplicitAny, noUnusedLocals |

### Frontend (Dashboard + Landing V2)

| Technology          | Version | Purpose                                         |
| ------------------- | ------- | ----------------------------------------------- |
| **Fresh**           | 2.0.0   | Deno-native web framework, Islands architecture |
| **Preact**          | 10.27.0 | Lightweight React alternative (3KB)             |
| **@preact/signals** | 2.5.1   | Fine-grained reactivity                         |
| **Vite**            | 7.1.3   | Build tool with HMR                             |
| **TailwindCSS**     | 4.1.10  | Utility-first CSS (v4 syntax)                   |

### Backend & Protocol

| Technology        | Version    | Purpose                               |
| ----------------- | ---------- | ------------------------------------- |
| **MCP SDK**       | 1.15.1     | Model Context Protocol implementation |
| **MCP ext-apps**  | 1.0.1      | MCP Apps SDK (UI resources, viewers)  |
| **Smithery SDK**  | 2.1.0      | MCP server discovery & HTTP transport |
| **Hono**          | 4          | HTTP routing (feed, API endpoints)    |
| **OpenAI SDK**    | 6.18.0     | Playground tunnel agent (gpt-5-mini)  |
| **diod**          | 3.0.0      | Dependency injection container        |
| **xstate**        | 5.19.2     | State machines (workflow orchestration)|
| **Cliffy**        | 1.0.0-rc.8 | CLI framework                        |
| **Zod**           | 3.23.0     | Schema validation                     |

### Database & Persistence

| Technology        | Version  | Purpose                           |
| ----------------- | -------- | --------------------------------- |
| **PGlite**        | 0.3.14   | Embedded PostgreSQL WASM (dev)    |
| **PostgreSQL**    | 16+      | Docker (production)               |
| **PGlite/vector** | 0.3.14   | Vector search extension           |
| **Deno KV**       | unstable | Key-value store (sessions, cache) |
| **Drizzle ORM**   | 0.45.1   | Type-safe SQL & 48 migrations     |

### GraphRAG, ML & Inference

| Technology                         | Version | Purpose                              |
| ---------------------------------- | ------- | ------------------------------------ |
| **Graphology**                     | 0.25.4  | Graph data structure                 |
| **graphology-metrics**             | 2.2.0   | PageRank, centrality algorithms      |
| **graphology-communities-louvain** | 2.0.1   | Community detection                  |
| **@huggingface/transformers**      | 3.7.6   | BGE-M3 embeddings (1024-dim, local)  |
| **ml-matrix**                      | 6.11.1  | Matrix operations                    |
| **simple-statistics**              | 7.8.0   | Statistical calculations             |
| **GRU Inference**                  | custom  | Pure JS+BLAS, beam search, 918 tools |
| **SHGAT Scoring**                  | custom  | K-head attention, PreserveDim d=1024 |

### Observability

| Technology            | Version | Purpose                          |
| --------------------- | ------- | -------------------------------- |
| **Sentry**            | 10.8.0  | Error tracking & performance     |
| **Native Deno OTEL**  | -       | OpenTelemetry spans (--unstable-otel) |
| **IDecisionLogger**   | -       | Port/adapter telemetry (ADR-054) |

---

## Codebase Metrics

| Metric                  | Value   |
| ----------------------- | ------- |
| **TypeScript Files**    | ~570    |
| **Lines of Code**       | ~136K   |
| **Test Files**          | ~215    |
| **Source Modules**      | 26      |
| **Database Migrations** | 48      |
| **Preact Islands**      | 26      |
| **ADRs**                | 71      |

---

## Source Structure (src/)

```
src/
├── main.ts                 # Entry point (CLI)
├── web/            (241)   # Fresh dashboard, Landing V2, islands, playground agent
├── graphrag/       (104)   # Graph engine, SHGAT scoring, GRU inference, DAG suggester
├── mcp/             (66)   # MCP Gateway, handlers, routing, registry
├── db/              (56)   # PGlite/PostgreSQL + Drizzle (48 migrations)
├── capabilities/    (45)   # Capability store, matcher, trace-path, code-generator
├── dag/             (41)   # DAG executor, checkpoints, streaming, 2-level DAG
├── application/     (39)   # Use cases (clean architecture)
├── infrastructure/  (28)   # DI container, adapters, design patterns
├── sandbox/         (21)   # Zero-permission executor, RPC bridge, PII
├── api/             (16)   # API routes (tools, admin)
├── cloud/           (15)   # Cloud/multi-tenant features
├── domain/          (14)   # Interfaces (clean architecture contracts)
├── telemetry/       (13)   # Logger, IDecisionLogger, OTEL, Sentry
├── cli/              (7)   # Commands: init, serve, status, workflows
├── server/           (6)   # HTTP server + auth
├── lib/              (6)   # Shared utilities
├── cache/            (5)   # Cache layer
├── context/          (4)   # LLM context optimization
├── utils/            (4)   # Generic helpers
├── vector/           (3)   # BGE-M3 embeddings
├── services/         (3)   # UI collector, shared services
├── events/           (3)   # Event system (BroadcastChannel)
├── tools/            (3)   # Tool definitions
├── errors/           (2)   # Error handling
├── learning/         (1)   # Episodic memory
└── health/           (1)   # Health checks
```

---

## MCP Meta-Tools

### Core Tools (Current)

| Tool             | Description                                                      |
| ---------------- | ---------------------------------------------------------------- |
| `pml:discover`   | Semantic + graph hybrid tool/capability discovery (Story 10.6)   |
| `pml:execute`    | Unified execution: intent-based DAG, code, or capability (10.7)  |
| `pml:admin`      | Registry management, tool sync, health checks                    |

### Legacy Tools (Deprecated, still functional)

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

### 1. Clean Architecture (3-Layer)

```
domain/interfaces/ → application/use-cases/ → infrastructure/di/
```

Dependency injection via `diod`, abstract class tokens, adapters pattern. Use cases return
`UseCaseResult<T>` — never throw.

### 2. Zero-Permission Sandbox with RPC Tracing

All user code executes in a Deno subprocess with **zero permissions**. Operations are proxied via
RPC to the main process, enabling complete isolation, full audit trail, and fine-grained permission
control at runtime.

### 3. GRU Next-Tool Prediction

Pure JS+BLAS inference engine (no TensorFlow.js). 12-stage forward pass with beam search
(α=0.7 length normalization). Structural bias via Jaccard + bigram matrices. Vocab: 918 tools.
GRU-first >> SHGAT-first for first tool prediction.

### 4. SHGAT Scoring & Enrichment

K-head SuperHyperGraph Attention for tool scoring. PreserveDim mode (ADR-055) keeps d=1024
throughout message passing. V2V phase for graph structure injection. Multi-level orchestration
with upward/downward passes. BLAS FFI acceleration (ADR-058).

### 5. GraphRAG Hybrid Search

Combines semantic similarity (vector search) with graph-based relatedness. Adamic-Adar for link
prediction. Local adaptive alpha (ADR-048) for context-aware weighting. Louvain community detection
for tool grouping.

### 6. DAG Execution with HIL/AIL

Two-Level DAG: Logical (SHGAT learning) + Physical (fused execution). Automatic parallelization of
independent tasks. HIL checkpoints for critical operations. Checkpoint/resume for long-running
workflows.

### 7. Feed & MCP Apps UI

`_meta.ui` pattern for tool results with interactive viewers. SSE broadcast for real-time feed.
Iframe-based viewer rendering. `_viewerOverride` for external tool UIs.

### 8. Trace Data Pipeline (ADR-068, ADR-069)

`task_results` (JSONB) = single source of truth. FQDN canonical format — normalize on read, not
write. 0% corruption vs legacy `executed_path` (18% UUID corruption, deprecated).

### 9. Event-Driven Architecture

BroadcastChannel-based event distribution (ADR-036). Cross-process event propagation. SSE streaming
to dashboard. Real-time graph updates and metrics.

---

## CLI Commands

| Command           | Description                                         |
| ----------------- | --------------------------------------------------- |
| `pml init`        | Initialize PML (discover MCPs, generate embeddings) |
| `pml serve`       | Start the MCP gateway server                        |
| `pml status`      | Check system health                                 |
| `pml workflows`   | Manage workflow templates                           |

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
deno task test:arch        # Architecture boundary tests

# Quality
deno task lint             # Linter
deno task fmt              # Format
deno task check            # Type check

# Training
deno task train            # SHGAT training (dev DB)
deno task train:prod       # SHGAT training (prod DB)

# Tools
deno task tools:sync       # Sync tool registry (dev)
deno task tools:sync:prod  # Sync tool registry (prod)

# Database
deno task db:backup        # Backup dev DB
deno task db:restore       # Restore dev DB from backup
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
| `SENTRY_DSN`           | -       | Sentry error tracking            |
| `GITHUB_CLIENT_ID`     | -       | GitHub OAuth (prod only)         |
| `GITHUB_CLIENT_SECRET` | -       | GitHub OAuth (prod only)         |
| `DATABASE_URL`         | -       | PostgreSQL connection (prod)     |
| `OPENAI_API_KEY`       | -       | Playground tunnel agent          |

### MCP Server-Specific (Optional)

> These are only needed if using the corresponding MCP servers via the gateway.

| Variable         | MCP Server | Description          |
| ---------------- | ---------- | -------------------- |
| `TAVILY_API_KEY` | tavily     | Tavily search API    |
| `EXA_API_KEY`    | exa        | Exa search API key   |
| `SYSON_URL`      | syson      | SysON server (8180)  |

---

## External Integrations

| Integration       | Purpose                   | Required        |
| ----------------- | ------------------------- | --------------- |
| **GitHub OAuth**  | User authentication       | Prod only       |
| **Smithery**      | MCP server discovery      | Optional        |
| **HuggingFace**   | BGE-M3 embeddings (local) | Auto-downloaded |
| **Sentry**        | Error tracking            | Optional        |
| **OpenAI**        | Playground tunnel agent   | Optional        |
| **SysON**         | SysML v2 modeling         | Optional        |

---

## Documentation Structure

| Category               | Count | Location                                             |
| ---------------------- | ----- | ---------------------------------------------------- |
| **ADRs**               | 71    | `docs/adrs/`                                         |
| **User Docs**          | ~30   | `docs/user-docs/`                                    |
| **Research**           | ~15   | `docs/research/` + `_bmad-output/.../research/`      |
| **PRD**                | 1     | `_bmad-output/planning-artifacts/prd.md`             |
| **Architecture**       | 1     | `_bmad-output/planning-artifacts/architecture-overview.md` |
| **UX Design**          | 1     | `_bmad-output/planning-artifacts/ux-design-specification.md` |
| **Epics**              | 16    | `_bmad-output/planning-artifacts/epics/`             |
| **Stories**            | ~50   | `_bmad-output/implementation-artifacts/`             |
| **Tech Specs**         | ~80   | `_bmad-output/implementation-artifacts/tech-specs/`  |
| **Project Context**    | 1     | `_bmad-output/project-context.md`                    |

---

## Key ADRs

| ADR     | Title                                   |
| ------- | --------------------------------------- |
| ADR-001 | PGlite Vector Search                    |
| ADR-002 | Custom DAG Implementation               |
| ADR-003 | BGE-M3 Local Embeddings                 |
| ADR-032 | Worker RPC Bridge                       |
| ADR-035 | Permission Sets Sandbox Security        |
| ADR-036 | Broadcast Channel Event Distribution    |
| ADR-048 | Hierarchical Heat Diffusion Alpha       |
| ADR-049 | Intelligent Adaptive Thresholds         |
| ADR-054 | IDecisionLogger Abstraction             |
| ADR-055 | SHGAT PreserveDim (keep d=1024)         |
| ADR-058 | BLAS FFI Matrix Acceleration            |
| ADR-068 | FQDN Canonical Format                   |
| ADR-069 | task_results as Single Source            |

See `docs/adrs/` for all 71 ADRs.

---

## Related Documents

- [Project Context (for AI agents)](_bmad-output/project-context.md)
- [PRD](_bmad-output/planning-artifacts/prd.md)
- [Architecture Overview](_bmad-output/planning-artifacts/architecture-overview.md)
- [Epic Overview](_bmad-output/planning-artifacts/epics/overview.md)
- [User Documentation](user-docs/_guides/overview.md)
- [QUICKSTART](QUICKSTART.md)
