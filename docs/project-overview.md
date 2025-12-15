# Casys PML - Project Overview

> **Generated:** 2025-12-15 | **Scan Level:** Exhaustive | **Version:** 1.2.0

## Quick Reference

| Property | Value |
|----------|-------|
| **Project Name** | Casys PML (Procedural Memory Layer) |
| **Package** | @casys/mcp-gateway |
| **Repository Type** | Monolith (hybrid: backend + web + library + cli) |
| **Runtime** | Deno 2.x |
| **Language** | TypeScript (strict mode) |
| **Primary Port (API)** | 3003 (dev) / 3001 (prod) |
| **Dashboard Port** | 8081 (dev) / 8080 (prod) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CASYS PML MONOLITH                         │
├─────────────────────────────────────────────────────────────────────┤
│  Browser ◄──HTTP/SSE──► Fresh Dashboard (BFF) ◄──fetch──► MCP Gateway│
│                              :8081                         :3003    │
├─────────────────────────────────────────────────────────────────────┤
│  Claude Code ◄──stdio/MCP──► MCP Gateway Server                     │
├─────────────────────────────────────────────────────────────────────┤
│         GraphRAG    │    Vector    │    DAG      │    Sandbox       │
│         Engine      │    Search    │   Executor  │    Workers       │
├─────────────────────────────────────────────────────────────────────┤
│                   PGlite + Deno KV (Storage Layer)                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Core
| Technology | Version | Purpose |
|------------|---------|---------|
| Deno | 2.x | Runtime (TypeScript-first, secure by default) |
| TypeScript | strict | Language with strict type checking |
| SWC | via Deno | Fast compilation + AST parsing |

### Frontend (Dashboard)
| Technology | Version | Purpose |
|------------|---------|---------|
| Fresh | 2.x | Deno web framework (SSR + Islands) |
| Preact | 10.x | React-compatible UI library |
| Vite | 7.x | Fast build tool + HMR |
| TailwindCSS | 4.x | Utility-first CSS |
| @preact/signals | 2.x | Reactive state management |

### Database & Storage
| Technology | Version | Purpose |
|------------|---------|---------|
| PGlite | 0.3.x | PostgreSQL WASM (local-first) |
| Drizzle ORM | 0.39.x | Type-safe TypeScript ORM |
| Deno KV | built-in | Key-value store (cache, sessions) |

### ML & Vectors
| Technology | Version | Purpose |
|------------|---------|---------|
| @huggingface/transformers | 3.7.x | Local embeddings (BGE-M3, 1024 dim) |
| ml-matrix | 6.x | Matrix operations for spectral clustering |

### Hypergraph Algorithms (Custom)
| Algorithm | Module | Description |
|-----------|--------|-------------|
| Spectral Clustering | spectral-clustering.ts | Bipartite graph clustering |
| Hypergraph PageRank | spectral-clustering.ts | Capability importance ranking |
| PageRank | graph-engine.ts | Node centrality |
| Adamic-Adar | graph-engine.ts | Similarity via common neighbors |
| Dijkstra | graphology | Shortest paths |
| Louvain | graphology | Community detection |
| K-means++ | spectral-clustering.ts | Eigenvector clustering |

### Protocol & Communication
| Technology | Version | Purpose |
|------------|---------|---------|
| @modelcontextprotocol/sdk | 1.15.x | MCP protocol (Anthropic) |
| @smithery/sdk | 2.x | MCP server registry |
| Broadcast Channel | built-in | Inter-worker communication |
| SSE | native | Real-time events to dashboard |

### Security
| Technology | Purpose |
|------------|---------|
| @ts-rex/argon2 | Password hashing |
| @deno/kv-oauth | GitHub OAuth |
| validator | Input validation |

### Observability
| Technology | Purpose |
|------------|---------|
| @sentry/deno | Error tracking |
| Grafana | Dashboards |
| Prometheus | Metrics |
| Loki | Log aggregation |

---

## Source Structure

```
src/
├── main.ts              # Entry point
├── mcp/                 # MCP Gateway (8 meta-tools)
├── dag/                 # DAG execution engine
├── graphrag/            # Hypergraph algorithms
├── sandbox/             # Secure code execution
├── capabilities/        # Learned capabilities system
├── vector/              # BGE-M3 embeddings
├── db/                  # PGlite + Drizzle (16 migrations)
├── cli/                 # CLI commands
├── server/              # HTTP server + auth
├── web/                 # Fresh dashboard (BFF)
│   ├── routes/          # BFF routes
│   ├── islands/         # Interactive components (10)
│   └── components/      # Static components (28)
├── telemetry/           # Logging + Sentry
├── events/              # Event system
├── learning/            # Episodic memory
├── speculation/         # Speculative execution
├── context/             # LLM context optimization
├── health/              # Health checks
├── errors/              # Error handling
├── lib/                 # Shared utilities
└── utils/               # Generic helpers
```

---

## MCP Tools

| Tool | Description |
|------|-------------|
| `pml:execute_dag` | Execute DAG workflows (intent or explicit) |
| `pml:search_tools` | Semantic + graph tool search |
| `pml:search_capabilities` | Search learned capabilities |
| `pml:execute_code` | Sandbox TypeScript execution |
| `pml:continue` | Continue paused workflow |
| `pml:abort` | Abort running workflow |
| `pml:replan` | Replan DAG mid-execution |
| `pml:approval_response` | HIL checkpoint response |

---

## Database Schema (16 migrations)

| Table | Purpose |
|-------|---------|
| tool_schema | MCP tool definitions cache |
| tool_embedding | BGE embeddings (HNSW index) |
| tool_dependency | Tool relationships |
| metrics | Telemetry data |
| error_log | Error tracking |
| workflow_checkpoints | Checkpoint/resume state |
| episodic_memory | Learning memory |
| workflow_dags | Active DAG storage |
| graphrag_tables | Graph data |
| capability_storage | Learned capabilities |
| algorithm_traces | Algorithm observability |
| capability_dependency | Cap→Cap edges |
| users | Multi-tenant (OAuth + API keys) |

---

## Development Commands

```bash
# Development
deno task dev              # API Gateway (:3003)
deno task dev:fresh        # Dashboard (:8081)

# Testing
deno task test             # All tests
deno task test:unit        # Unit tests
deno task test:integration # Integration tests

# Quality
deno task lint             # Linter
deno task fmt              # Format
deno task check            # Type check

# Database
deno task db:generate      # Generate migrations
deno task db:studio        # Drizzle Studio

# Production
deno task deploy:all       # Pull + build + restart
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FRESH_PORT` | 8081 | Dashboard port (dev) |
| `PORT_API` | 3003 | API port (dev) |
| `PML_DB_PATH` | .pml-dev.db | PGlite database path |
| `SENTRY_DSN` | - | Sentry DSN (optional) |

---

## Architectural Patterns

| Pattern | Implementation |
|---------|---------------|
| **BFF (Backend For Frontend)** | Fresh routes call API server-side |
| **Islands Architecture** | Interactive islands + static components |
| **Atomic Design** | atoms → molecules → organisms |
| **MCP Gateway** | Unified entry point for all MCP tools |
| **Hypergraph** | Capabilities as hyperedges connecting tools |
| **Worker Isolation** | Sandbox execution via Broadcast Channel |

---

## Key ADRs

| ADR | Title |
|-----|-------|
| ADR-001 | PGlite Vector Search |
| ADR-002 | Custom DAG Implementation |
| ADR-003 | BGE-M3 Local Embeddings |
| ADR-007 | DAG Adaptive Feedback Loops |
| ADR-008 | Episodic Memory Adaptive Thresholds |
| ADR-032 | Worker RPC Bridge |
| ADR-038 | Strategic Discovery Mode |
| ADR-042 | Capability Dependencies |
| ADR-046 | Fresh BFF Pattern |

See `docs/adrs/` for all 46 ADRs.

---

## Documentation Structure

```
docs/
├── index.md              # Documentation index
├── PRD.md                # Product Requirements (42KB)
├── epics.md              # Implementation epics (70KB)
├── project_context.md    # AI context file
├── architecture/         # 15 architecture docs
├── adrs/                 # 46 Architecture Decision Records
├── sprint-artifacts/     # Story implementations
├── spikes/               # Technical spikes
├── research/             # Market & technical research
├── retrospectives/       # Epic retrospectives
├── user-docs/            # User documentation
└── blog/                 # Technical articles
```

---

## Related Documents

- [PRD.md](./PRD.md) - Full product requirements
- [Architecture Index](./architecture/index.md) - Architecture documentation
- [ADR Index](./adrs/index.md) - Decision records
- [project_context.md](./project_context.md) - AI agent context
