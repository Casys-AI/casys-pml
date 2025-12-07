# Project Structure

```
agentcards/
├── deno.json                    # Deno config, tasks, imports
├── deps.ts                      # Centralized dependencies
├── mod.ts                       # Public API exports
├── main.ts                      # CLI entry point
│
├── src/
│   ├── cli/                     # CLI commands (Epic 1)
│   │   ├── commands/
│   │   │   ├── init.ts          # Story 1.7 - Migration tool
│   │   │   ├── serve.ts         # Story 2.4 - Gateway server
│   │   │   └── status.ts        # Story 2.5 - Health checks
│   │   └── main.ts              # cliffy CLI setup
│   │
│   ├── db/                      # Database layer (Epic 1)
│   │   ├── client.ts            # PGlite initialization
│   │   ├── migrations/          # SQL schema evolution
│   │   │   └── 001_initial.sql  # Story 1.2 - Initial schema
│   │   └── queries.ts           # Prepared queries
│   │
│   ├── vector/                  # Vector search (Epic 1)
│   │   ├── embeddings.ts        # Story 1.4 - BGE model inference
│   │   ├── search.ts            # Story 1.5 - Semantic search
│   │   └── index.ts             # HNSW index management
│   │
│   ├── mcp/                     # MCP protocol (Epic 1, 2, 3)
│   │   ├── discovery.ts         # Story 1.3 - Server discovery
│   │   ├── client.ts            # MCP SDK wrapper
│   │   ├── gateway-server.ts    # Story 2.4 - Gateway server
│   │   └── types.ts             # MCP type definitions
│   │
│   ├── dag/                     # DAG execution (Epic 2, 2.5)
│   │   ├── builder.ts           # Story 2.1 - Dependency graph
│   │   ├── executor.ts          # Story 2.2 - Parallel execution
│   │   ├── controlled-executor.ts # Story 2.5-1 - Adaptive executor
│   │   ├── state.ts             # Story 2.5-1 - WorkflowState
│   │   ├── event-stream.ts      # Story 2.5-1 - Event streaming
│   │   ├── command-queue.ts     # Story 2.5-1 - Command queue
│   │   ├── checkpoint-manager.ts # Story 2.5-2 - Checkpoints
│   │   └── types.ts             # DAG node/edge types
│   │
│   ├── graphrag/                # GraphRAG (Epic 2.5, 5)
│   │   ├── engine.ts            # Story 2.5-3 - Graph engine
│   │   ├── dag-suggester.ts     # Story 2.5-3 - DAG replanning
│   │   ├── workflow-templates.ts # Story 5.2 - Template sync
│   │   └── types.ts             # Graph types
│   │
│   ├── sandbox/                 # Code execution (Epic 3, 7)
│   │   ├── executor.ts          # Story 3.1 - Deno sandbox
│   │   ├── context-builder.ts   # Story 3.2 - Tool injection
│   │   ├── worker-bridge.ts     # Story 7.1b - RPC bridge for MCP tools
│   │   ├── sandbox-worker.ts    # Story 7.1b - Isolated worker script
│   │   └── types.ts             # Story 3.1, 7.1b - Sandbox & RPC types
│   │
│   ├── speculation/             # Speculative execution (Epic 3.5)
│   │   ├── speculative-executor.ts # Story 3.5-1 - Speculation engine
│   │   ├── cache.ts             # Story 3.5-1 - Result caching
│   │   └── types.ts             # Speculation types
│   │
│   ├── learning/                # Adaptive learning (Epic 4)
│   │   ├── episodic-memory-store.ts # Story 4.1 - Episode storage
│   │   ├── adaptive-threshold.ts # Story 4.2 - Threshold manager
│   │   └── types.ts             # Learning types
│   │
│   ├── capabilities/            # Emergent capabilities (Epic 7)
│   │   ├── matcher.ts           # Story 7.3a - Intent → capability matching
│   │   ├── schema-inferrer.ts   # Story 7.2b - SWC-based parameter inference
│   │   ├── suggestion-engine.ts # Story 7.4 - Proactive recommendations
│   │   ├── code-generator.ts    # Story 7.3b - Inline function generation
│   │   └── types.ts             # Capability types
│   │
│   ├── visualization/           # Graph visualization (Epic 8)
│   │   ├── hypergraph-builder.ts # Story 8.2 - Compound graph construction
│   │   └── types.ts             # Visualization types
│   │
│   ├── streaming/               # SSE streaming (Epic 2)
│   │   ├── sse.ts               # Story 2.3 - Event stream
│   │   └── types.ts             # Event types
│   │
│   ├── config/                  # Configuration (Epic 1)
│   │   ├── loader.ts            # YAML config loading
│   │   ├── validator.ts         # Config schema validation
│   │   └── types.ts             # Config interfaces
│   │
│   ├── telemetry/               # Observability (Epic 1)
│   │   ├── logger.ts            # Story 1.8 - std/log wrapper
│   │   ├── metrics.ts           # Context/latency tracking
│   │   └── types.ts             # Metric definitions
│   │
│   └── utils/                   # Shared utilities
│       ├── errors.ts            # Story 2.6 - Custom error types
│       ├── retry.ts             # Retry logic with backoff
│       └── validation.ts        # Input validation helpers
│
├── tests/                       # Test suite
│   ├── unit/                    # Unit tests
│   ├── integration/             # Integration tests
│   ├── e2e/                     # Story 2.7 - E2E scenarios
│   ├── benchmarks/              # Performance tests
│   └── fixtures/                # Mock data, MCP servers
│
├── docs/                        # Documentation
│   ├── architecture/            # Architecture documentation (this folder)
│   ├── PRD.md                   # Product requirements
│   ├── epics.md                 # Epic breakdown
│   └── api/                     # API documentation
│
└── .agentcards/                 # User data directory (created at runtime)
    ├── config.yaml              # User configuration
    ├── agentcards.db            # PGlite database file
    └── logs/                    # Application logs
        └── agentcards.log
```

---
