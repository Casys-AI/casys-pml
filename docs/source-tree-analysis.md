# Source Tree Analysis - Casys PML

_Generated: 2025-12-31_

## Overview

| Metric | Value |
|--------|-------|
| Source Files (src/) | 409 |
| Library Files (lib/) | 47 |
| Test Files (tests/) | 304 |
| Total Lines of Code | ~45,000 |
| Modules | 27 |

---

## Annotated Source Tree

```
casys-pml/
├── mod.ts                          # 📦 Library entry point (exports)
├── src/
│   ├── main.ts                     # 🚀 CLI entry point (Cliffy)
│   │
│   ├── application/                # 🎯 Use Cases (Clean Architecture)
│   │   └── use-cases/
│   │       ├── workflows/          # Workflow execution use cases
│   │       ├── code/               # Code execution use cases
│   │       ├── capabilities/       # Capability management
│   │       └── shared/             # Shared use case utilities
│   │
│   ├── domain/                     # 📐 Domain Layer
│   │   └── interfaces/             # Domain interfaces/contracts
│   │
│   ├── infrastructure/             # 🏗️ Infrastructure Layer
│   │   ├── di/                     # Dependency Injection (DIOD)
│   │   │   └── adapters/           # DI adapters
│   │   └── patterns/               # Design patterns
│   │       ├── visitor/            # Visitor pattern
│   │       ├── factory/            # Factory pattern
│   │       └── builder/            # Builder pattern
│   │
│   ├── mcp/                        # 🔌 MCP Protocol Layer
│   │   ├── server/                 # MCP server implementation
│   │   ├── handlers/               # Tool handlers (discover, execute, etc.)
│   │   │   └── shared/             # Shared handler utilities
│   │   ├── connections/            # MCP client connections
│   │   ├── registry/               # Tool registry
│   │   ├── capability-server/      # Capability server
│   │   │   └── services/           # Capability services
│   │   ├── routing/                # Request routing
│   │   │   └── handlers/           # Route handlers
│   │   ├── metrics/                # MCP metrics
│   │   ├── sampling/               # Sampling strategies
│   │   └── tools/                  # Built-in tools
│   │
│   ├── dag/                        # ⚡ DAG Execution Engine
│   │   ├── controlled-executor.ts  # Layer-based parallel executor
│   │   ├── dag-optimizer.ts        # Task fusion optimizer
│   │   ├── executor.ts             # Base executor
│   │   ├── state.ts                # DAG state management
│   │   ├── types.ts                # DAG types
│   │   ├── trace-generator.ts      # Logical trace generation
│   │   ├── static-to-dag-converter.ts  # SWC AST → DAG
│   │   ├── checkpoint-manager.ts   # Execution checkpoints
│   │   ├── argument-resolver.ts    # Runtime argument resolution
│   │   ├── command-queue.ts        # Command queuing
│   │   ├── event-stream.ts         # SSE event streaming
│   │   ├── streaming.ts            # Stream utilities
│   │   ├── speculation/            # Speculative execution
│   │   ├── episodic/               # Episodic memory integration
│   │   ├── loops/                  # Loop detection/handling
│   │   ├── checkpoints/            # Checkpoint strategies
│   │   ├── permissions/            # Permission management
│   │   └── execution/              # Execution strategies
│   │
│   ├── graphrag/                   # 🧠 GraphRAG Engine
│   │   ├── graph-engine.ts         # Main GraphRAG engine
│   │   ├── dag-suggester.ts        # DAG suggestion
│   │   ├── types.ts                # GraphRAG types
│   │   ├── algorithms/             # Graph algorithms
│   │   │   ├── shgat.ts            # SHGAT (Spectral Hypergraph Attention)
│   │   │   ├── shgat/              # SHGAT sub-modules
│   │   │   ├── dr-dsp.ts           # DR-DSP (Directed Hypergraph Shortest Path)
│   │   │   ├── adamic-adar.ts      # Link prediction
│   │   │   ├── louvain.ts          # Community detection
│   │   │   ├── pagerank.ts         # Node importance
│   │   │   ├── thompson.ts         # Thompson Sampling
│   │   │   ├── tensor-entropy.ts   # Semantic entropy
│   │   │   ├── unified-search.ts   # Hybrid search scoring
│   │   │   ├── edge-weights.ts     # Edge weight computation
│   │   │   ├── pathfinding.ts      # Path algorithms
│   │   │   └── trace-feature-extractor.ts  # Feature extraction
│   │   ├── suggestion/             # Suggestion generation
│   │   ├── search/                 # Search implementations
│   │   ├── clustering/             # Clustering algorithms
│   │   └── prediction/             # Prediction models
│   │
│   ├── capabilities/               # 🎨 Capability System
│   │   ├── capability-store.ts     # Capability persistence
│   │   ├── capability-registry.ts  # Naming & FQDN registry
│   │   ├── static-structure-builder.ts  # SWC static analysis
│   │   ├── execution-trace-store.ts    # Trace storage
│   │   ├── types.ts                # Capability types
│   │   ├── static-structure/       # Static analysis helpers
│   │   └── types/                  # Additional types
│   │
│   ├── sandbox/                    # 🔒 Sandbox Execution
│   │   ├── worker-bridge.ts        # RPC bridge to worker
│   │   ├── sandbox-worker.ts       # Isolated worker
│   │   ├── executor.ts             # Sandbox executor
│   │   ├── context-builder.ts      # Execution context
│   │   ├── security-validator.ts   # Security validation
│   │   ├── pii-detector.ts         # PII detection
│   │   ├── resource-limiter.ts     # Resource limits
│   │   ├── cache.ts                # Sandbox cache
│   │   ├── types.ts                # Sandbox types
│   │   ├── execution/              # Execution strategies
│   │   ├── security/               # Security modules
│   │   └── tools/                  # Sandbox tools
│   │
│   ├── vector/                     # 📊 Vector Search
│   │   ├── search.ts               # Vector search implementation
│   │   ├── embeddings.ts           # Embedding generation (BGE-M3)
│   │   └── mod.ts                  # Module exports
│   │
│   ├── db/                         # 💾 Database Layer
│   │   ├── client.ts               # Database client (PGlite/Postgres)
│   │   ├── types.ts                # Database types
│   │   ├── migrations.ts           # Migration runner
│   │   ├── migrations/             # 32 migration files
│   │   └── schema/                 # Drizzle schemas
│   │       ├── mod.ts              # Schema exports
│   │       └── users.ts            # User schema
│   │
│   ├── server/                     # 🌐 HTTP Server
│   │   ├── mod.ts                  # Server module
│   │   └── auth/                   # Authentication
│   │
│   ├── cli/                        # 💻 CLI Commands
│   │   ├── mod.ts                  # CLI module
│   │   └── commands/               # Cliffy commands
│   │       ├── init.ts             # pml init
│   │       ├── serve.ts            # pml serve
│   │       ├── status.ts           # pml status
│   │       ├── migrate-config.ts   # pml migrate-config
│   │       ├── workflows.ts        # pml workflows
│   │       └── speculation.ts      # pml speculation
│   │
│   ├── web/                        # 🖥️ Fresh Dashboard
│   │   ├── main.ts                 # Fresh entry point
│   │   ├── routes/                 # Fresh routes
│   │   │   ├── index.tsx           # Homepage
│   │   │   ├── dashboard.tsx       # Dashboard page
│   │   │   ├── _middleware.ts      # Auth middleware
│   │   │   ├── auth/               # OAuth routes
│   │   │   ├── dashboard/          # Dashboard sub-routes
│   │   │   ├── api/                # REST API routes
│   │   │   │   ├── admin/          # Admin API
│   │   │   │   └── user/           # User API
│   │   │   ├── docs/               # Documentation routes
│   │   │   ├── blog/               # Blog routes
│   │   │   └── og/                 # Open Graph images
│   │   ├── islands/                # 🏝️ Preact Islands (19)
│   │   │   ├── AdminDashboardIsland.tsx
│   │   │   ├── CytoscapeGraph.tsx
│   │   │   ├── D3GraphVisualization.tsx
│   │   │   ├── GraphExplorer.tsx
│   │   │   ├── MetricsPanel.tsx
│   │   │   ├── TracingPanel.tsx
│   │   │   ├── EmergencePanel.tsx
│   │   │   ├── CapabilityTimeline.tsx
│   │   │   ├── NeuralGraph.tsx
│   │   │   ├── HeroRepl.tsx
│   │   │   ├── CodePanel.tsx
│   │   │   ├── ExplorerSidebar.tsx
│   │   │   ├── GraphInsightsPanel.tsx
│   │   │   ├── DocsSidebar.tsx
│   │   │   ├── DocsToc.tsx
│   │   │   ├── ConfigCopyButton.tsx
│   │   │   ├── DangerZoneIsland.tsx
│   │   │   ├── MobileMenu.tsx
│   │   │   └── SettingsIsland.tsx
│   │   ├── components/             # UI Components
│   │   │   ├── ui/                 # Atomic components
│   │   │   │   ├── atoms/          # Buttons, inputs, etc.
│   │   │   │   └── molecules/      # Composite components
│   │   │   └── layout/             # Layout components
│   │   ├── utils/                  # Frontend utilities
│   │   │   └── graph/              # Graph visualization utils
│   │   ├── lib/                    # Frontend libraries
│   │   ├── posts/                  # Blog posts (MDX)
│   │   ├── assets/                 # Static assets
│   │   │   ├── og/                 # OG images
│   │   │   └── diagrams/           # Diagrams
│   │   ├── public/                 # Public files
│   │   └── _fresh/                 # Fresh build output
│   │
│   ├── cloud/                      # ☁️ Cloud Features (Open Core)
│   │   ├── admin/                  # Admin/Analytics features
│   │   │   ├── mod.ts              # Admin module exports
│   │   │   ├── analytics-service.ts    # Analytics service
│   │   │   ├── analytics-queries.ts    # Analytics SQL queries
│   │   │   └── types.ts            # Admin types
│   │   └── ui/                     # Cloud UI components
│   │       ├── mod.ts              # UI exports
│   │       └── charts/             # Chart components
│   │           └── mod.ts          # Charts exports
│   │
│   ├── telemetry/                  # 📈 Observability
│   │   ├── mod.ts                  # Telemetry exports
│   │   ├── telemetry.ts            # Telemetry service
│   │   ├── sentry.ts               # Sentry integration
│   │   └── algorithm-tracer.ts     # Algorithm tracing
│   │
│   ├── events/                     # 📡 Event System
│   │   └── mod.ts                  # Event exports
│   │
│   ├── context/                    # 🎯 Context Management
│   │   └── mod.ts                  # Context exports
│   │
│   ├── cache/                      # 💨 Caching Layer
│   │   └── mod.ts                  # Cache exports
│   │
│   ├── health/                     # 💚 Health Checks
│   │   └── mod.ts                  # Health exports
│   │
│   ├── learning/                   # 🎓 Learning System
│   │   └── mod.ts                  # Learning exports
│   │
│   ├── speculation/                # 🔮 Speculative Execution
│   │   └── mod.ts                  # Speculation exports
│   │
│   ├── errors/                     # ❌ Error Handling
│   │   └── mod.ts                  # Error types
│   │
│   ├── utils/                      # 🛠️ Utilities
│   │   └── mod.ts                  # Utility exports
│   │
│   ├── shared/                     # 🔗 Shared Code
│   │   └── mod.ts                  # Shared exports
│   │
│   └── lib/                        # 📚 Internal Libraries
│       └── mod.ts                  # Library exports
│
├── lib/                            # 📦 External Libraries
│   ├── std/                        # Standard library extensions
│   │   ├── cap.ts                  # Capability helpers
│   │   └── build.ts                # Build script
│   └── mcp-tools-server.ts         # MCP tools server
│
├── tests/                          # 🧪 Test Suite
│   ├── unit/                       # Unit tests (by module)
│   ├── integration/                # Integration tests
│   ├── architecture/               # Architecture tests
│   ├── benchmarks/                 # Performance benchmarks
│   └── mocks/                      # Test mocks
│
├── config/                         # ⚙️ Configuration
│   └── .mcp-servers.json           # MCP server config
│
├── drizzle/                        # 🗄️ Drizzle Output
│   └── migrations/                 # Generated migrations
│
├── docs/                           # 📖 Documentation (365 files)
│   ├── architecture/               # Architecture docs
│   ├── adrs/                       # ADRs (56)
│   ├── sprint-artifacts/           # Sprint artifacts (110)
│   ├── tech-specs/                 # Tech specs (56)
│   ├── spikes/                     # Spikes (37)
│   ├── epics/                      # Epic definitions
│   ├── user-docs/                  # User documentation
│   ├── research/                   # Research docs
│   └── blog/                       # Blog content
│
├── monitoring/                     # 📊 Monitoring Config
│   └── grafana/                    # Grafana dashboards
│
├── packages/                       # 📦 Monorepo Packages
│   └── ...                         # Sub-packages
│
├── playground/                     # 🎮 Development Playground
│   └── notebooks/                  # Jupyter notebooks
│
├── scripts/                        # 🔧 Build/Deploy Scripts
│   └── backup-db.ts                # Database backup
│
└── spikes/                         # 🧪 Active Spikes
    └── ...                         # Experimental code
```

---

## Business Model: Open Core

| Layer | License | Features |
|-------|---------|----------|
| **Core (OSS)** | AGPL-3.0 | MCP Gateway, DAG Execution, GraphRAG, Sandbox |
| **Cloud (Premium)** | Proprietary | Analytics, Admin Dashboard, Charts |

The `src/cloud/` module contains premium features:
- `admin/analytics-service.ts` - Usage analytics
- `admin/analytics-queries.ts` - Analytics SQL queries
- `ui/charts/` - Advanced visualization components

---

## Key Entry Points

| Entry Point | Path | Purpose |
|-------------|------|---------|
| CLI | `src/main.ts` | Command-line interface |
| Library | `mod.ts` | JSR/npm package exports |
| Dashboard | `src/web/main.ts` | Fresh web server |
| MCP Server | `src/mcp/server/` | MCP protocol server |

## Module Dependencies (Simplified)

```
main.ts
├── cli/commands/*     → CLI commands
├── telemetry/         → Logging, Sentry
└── db/client          → Database

mcp/handlers/
├── discover-handler   → graphrag/, vector/, capabilities/
├── execute-handler    → dag/, sandbox/, capabilities/
└── workflow-handler   → dag/controlled-executor

dag/
├── controlled-executor → sandbox/worker-bridge
├── dag-optimizer      → static analysis
└── checkpoint-manager → db/

graphrag/
├── graph-engine      → algorithms/
├── algorithms/shgat  → vector/embeddings
└── dag-suggester     → capabilities/

sandbox/
├── worker-bridge     → sandbox-worker (subprocess)
├── security-validator → pii-detector
└── context-builder   → mcp/connections
```

---

## Critical Folders Summary

| Folder | Purpose | Key Files |
|--------|---------|-----------|
| `src/mcp/handlers/` | MCP tool implementations | discover, execute, workflow |
| `src/dag/` | DAG execution engine | controlled-executor, optimizer |
| `src/graphrag/algorithms/` | ML algorithms | shgat, dr-dsp, thompson |
| `src/sandbox/` | Secure code execution | worker-bridge, security |
| `src/capabilities/` | Capability system | store, registry, static-analysis |
| `src/web/islands/` | Interactive UI | 19 Preact islands |
| `src/db/migrations/` | Schema evolution | 32 migrations |
