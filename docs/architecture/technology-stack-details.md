# Technology Stack Details

_Status: Updated December 2025_

## 1. Runtime & Build

| Layer             | Details                                                                          |
| ----------------- | -------------------------------------------------------------------------------- |
| **Runtime**       | Deno 2.x (permissioned, `--allow-all` for gateway), TypeScript 5.7 target ES2022 |
| **Module System** | `deno.json` (imports map), npm compatibility for Graphology, HuggingFace, Vite   |
| **Web UI**        | Fresh 2 + Preact 10.27, Tailwind 4 via Vite dev server                           |
| **Tasks**         | `deno task dev`, `deno task dev:fresh`, `deno task db:*`                         |
| **Testing**       | `deno test` (unit + integration), Playwright utils for E2E                       |

## 2. Application Services

| Service                                          | Tech                                        | Notes                                   |
| ------------------------------------------------ | ------------------------------------------- | --------------------------------------- |
| **Gateway Server** (`src/mcp/gateway-server.ts`) | Deno HTTP server, SSE streaming             | Route `execute_code`, MCP orchestration |
| **Sandbox / Executor** (`src/sandbox/*`)         | Deno subprocess isolation, permission-bound | Wraps MCP calls, emits trace events     |
| **CLI** (`src/main.ts`)                          | Command router (serve, sync, migrate)       | Shares same runtime as gateway          |
| **Auth Layer** (`src/server/auth/*`)             | GitHub OAuth + API keys                     | Sessions in Deno KV, users in Drizzle   |

## 3. Data & Storage

| Component          | Technology                                  | Purpose                                             |
| ------------------ | ------------------------------------------- | --------------------------------------------------- |
| **PGlite 0.3.11**  | PostgreSQL 17 WASM + pgvector               | Primary relational store, persisted on filesystem   |
| **Drizzle ORM**    | `drizzle-orm/pglite`                        | Application tables (`users`, future RBAC/secrets)   |
| **SQL Migrations** | Custom runner (`src/db/migrations.ts`)      | Tool index, GraphRAG, episodic memory, telemetry    |
| **Vector Search**  | pgvector HNSW (`vector_cosine_ops`, `m=16`) | `tool_embedding`, `workflow_pattern`                |
| **Deno KV**        | `Deno.openKv()` singleton                   | OAuth sessions, pending states, future secret cache |

See `docs/architecture/data-architecture.md` for the exhaustive schema.

## 4. Graph & ML Layer

| Capability             | Libraries                                                                                        | Description                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Graph Engine**       | `graphology`, `graphology-communities-louvain`, `graphology-shortest-path`, `graphology-metrics` | PageRank, Louvain communities, shortest path DAG reconstruction                                            |
| **Similarity Models**  | `@huggingface/transformers@3.7.6`, `@huggingface/onnxruntime`                                    | BGE-M3 embeddings for tools & intents                                                                      |
| **Scoring Algorithms** | ADR-038                                                                                          | Hybrid search (semantic + Adamic-Adar), next-step prediction (cooccurrence + Louvain + recency + PageRank) |
| **Learning Stores**    | `tool_dependency`, `workflow_execution`, `episodic_events`, `adaptive_thresholds`                | Updated via sandbox traces                                                                                 |

## 5. MCP & External Integrations

| Area                   | Details                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------- |
| **MCP SDK**            | `@modelcontextprotocol/sdk` official implementation                                 |
| **Transports**         | stdio (primary), SSE output to clients                                              |
| **Hosted MCP Servers** | >15 servers launched via `Deno.Command` (GitHub, Filesystem, Memory, Tavily, etc.)  |
| **Config**             | `config/.mcp-servers.json` (gateway) + future per-user configs (`user_mcp_configs`) |

## 6. DevOps & Observability

| Tooling           | Purpose                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| `@std/log`        | Structured logging (JSON optional)                                      |
| `metrics` table   | Lightweight telemetry (counts, latency)                                 |
| `scripts/` (bash) | Ops helpers (devcontainer, deploy placeholders)                         |
| Systemd targets   | `deno task prod:*` interacts with `casys-dashboard` / `casys-api` units |

## 7. Roadmap Items

1. **Full Drizzle schema generation** (replace ad-hoc SQL migrations for GraphRAG tables)
2. **Secret management** (KMS-backed `user_secrets`, envelope encryption)
3. **Observability stack** (export metrics to ClickHouse / Prometheus)

---

### References

- `deno.json` (tasks + imports)
- `src/db/migrations.ts`, `src/db/schema/*`
- `docs/architecture/data-architecture.md`
- `docs/adrs/ADR-038-scoring-algorithms-reference.md`
