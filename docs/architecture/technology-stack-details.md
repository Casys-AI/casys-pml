# Technology Stack Details

_Updated: January 2026_

## 1. Runtime & Build

| Layer             | Details                                                                          |
| ----------------- | -------------------------------------------------------------------------------- |
| **Runtime**       | Deno 2.6.3, TypeScript 5.9.2 target ES2022                                       |
| **Module System** | `deno.json` (imports map), npm compatibility for Graphology, HuggingFace, Vite   |
| **Web UI**        | Fresh 2 + Preact 10.27, Tailwind 4 via Vite dev server                           |
| **Tasks**         | `deno task dev`, `deno task dev:fresh`, `deno task db:*`, `deno task prod:*`     |
| **Testing**       | `deno test` (unit + integration), Playwright utils for E2E                       |

## 2. Application Services

| Service                                          | Tech                                        | Notes                                                          |
| ------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------------- |
| **Gateway Server** (`src/mcp/gateway-server.ts`) | Deno HTTP server, SSE streaming             | Route `pml:execute_dag`, `pml:execute_code`, MCP orchestration |
| **Sandbox / Executor** (`src/sandbox/*`)         | Deno subprocess isolation, permission-bound | Wraps MCP calls, emits trace events                            |
| **CLI** (`src/main.ts`)                          | Command router (serve, init, status)        | Shares same runtime as gateway                                 |
| **Auth Layer** (`src/server/auth/*`)             | GitHub OAuth + API keys                     | Sessions in Deno KV, users in Drizzle                          |
| **Dashboard** (`src/web/*`)                      | Fresh 2 + Vite                              | Port 8081 (dev) / 8080 (prod)                                  |

### Epic 14 & 15 Application Services

This section documents the core services implementing client-routed execution (Epic 14) and trace-based learning (Epic 15).

#### ExecutionCaptureService

**Location:** `src/application/services/execution-capture.service.ts`

**Purpose:** Captures successful executions as reusable capabilities via a two-step process.

| Step | Target Table | Operation | Description |
| ---- | ------------ | --------- | ----------- |
| 1 | `workflow_pattern` | UPSERT via code hash | Stores capability code, intent, tools used, trace data |
| 2 | `pml_registry` | CREATE if not exists | Registers FQDN for capability discovery |

**FQDN Generation:**

```typescript
// Namespace derived from first tool (e.g., "std:echo" -> namespace "std")
const namespace = firstTool.includes(":") ? firstTool.split(":")[0] : "code";
const action = `exec_${codeHash.substring(0, 8)}`;
const hash = codeHash.substring(0, 4);

// FQDN: {org}.{project}.{namespace}:{action}#{hash}
```

**Usage:**

```typescript
const captureService = new ExecutionCaptureService({
  capabilityStore,
  capabilityRegistry,  // Optional: enables pml_registry registration
});

const result = await captureService.capture({
  learningContext: { code, intent, staticStructure, intentEmbedding },
  durationMs: 1234,
  taskResults: [{ tool: "std:echo", success: true, ... }],
  userId: "user_123",
});

// Result: { capability: { id, codeHash }, fqdn: "casys.tools.std:exec_a1b2c3d4#a1b2", created: true }
```

**Design Decisions:**

| Decision | Rationale |
| -------- | --------- |
| UPSERT via code hash | Deduplicates identical capabilities automatically |
| Two-table split | `workflow_pattern` holds execution data; `pml_registry` provides FQDN routing |
| Scope-aware registration | User scope (`org.project`) ensures multi-tenant isolation |

#### TraceSyncer (packages/pml)

**Location:** `packages/pml/src/tracing/syncer.ts`

**Purpose:** Async batch sync of execution traces from client (sandbox) to cloud server.

| Configuration | Default | Description |
| ------------- | ------- | ----------- |
| `cloudUrl` | `null` | Cloud API URL (null = standalone mode, no sync) |
| `batchSize` | `10` | Maximum traces per batch |
| `flushIntervalMs` | `5000` | Periodic flush interval |
| `maxRetries` | `3` | Retry count for failed syncs |
| `apiKey` | - | Bearer token for cloud authentication |

**Operational Modes:**

| Mode | Behavior |
| ---- | -------- |
| **Standalone** (`cloudUrl = null`) | Traces logged locally only, no network sync |
| **Cloud** (`cloudUrl` set) | Async batch sync with retry logic |

**Usage:**

```typescript
import { TraceSyncer } from "@casys/pml/tracing";

const syncer = new TraceSyncer({
  cloudUrl: "https://pml.casys.ai",
  batchSize: 10,
  flushIntervalMs: 5000,
  maxRetries: 3,
  apiKey: "pml_xxx",
});

// Non-blocking enqueue (flushes at batchSize or interval)
syncer.enqueue(trace);

// Manual flush (optional)
await syncer.flush();

// Graceful shutdown (flushes remaining traces)
await syncer.shutdown();
```

**Retry Logic:**

- Failed batches are re-queued at front for priority retry
- Per-trace retry count tracked via Map
- Traces dropped after `maxRetries` failures
- Rate limiting (HTTP 429) handled via `Retry-After` header

**Timer Behavior:**

- Timer uses `Deno.unrefTimer()` to avoid blocking process exit
- Automatic cleanup on shutdown

#### Output Schema Inference (ADR-061)

**Location:** `src/capabilities/output-schema-inferrer.ts`

**Purpose:** Auto-infer JSON schemas from execution traces to enable provides-edge calculation.

| Function | Description |
| -------- | ----------- |
| `inferSchemaFromValue(value, maxDepth)` | Infer JSON Schema from runtime JavaScript value |
| `mergeSchemas(existing, observed)` | Merge two schemas (union-like) for multiple observations |
| `enrichToolOutputSchema(db, toolId, output)` | Enrich tool schema from execution output |
| `backfillOutputSchemas(db, limit?)` | Batch process historical traces |

**Schema Inference Rules:**

| JavaScript Type | JSON Schema Type | Notes |
| --------------- | ---------------- | ----- |
| `null` | `{ type: "null" }` | Explicit null |
| `string` | `{ type: "string" }` | Basic string |
| `number` (integer) | `{ type: "integer" }` | `Number.isInteger()` check |
| `number` (float) | `{ type: "number" }` | Non-integer numbers |
| `boolean` | `{ type: "boolean" }` | Boolean values |
| `Array` (empty) | `{ type: "array" }` | No items schema |
| `Array` (non-empty) | `{ type: "array", items: ... }` | Samples first 3 elements |
| `Object` | `{ type: "object", properties: ... }` | Recursive inference |

**Schema Merging Strategy:**

```typescript
// Object merging: properties in ALL observations are required
// Properties in SOME observations are optional
const merged = mergeObjectSchemas([schema1, schema2]);

// Array merging: items schemas are merged recursively
const merged = mergeSchemas(
  { type: "array", items: { type: "string" } },
  { type: "array", items: { type: "integer" } }
);
// Result: { type: "array", items: {} } // accepts any item type
```

**Integration with GraphRAG:**

After schema update, the service calls `syncProvidesEdgesForTool()` to recalculate provides edges:

```typescript
const result = await enrichToolOutputSchema(db, toolId, output, syncEdges: true);
// Result: { updated: true, edgesCreated: 5 }
```

**Backfill Processing:**

```typescript
// Process historical traces to populate output schemas
const stats = await backfillOutputSchemas(db, limit: 1000);
// Stats: { toolsUpdated: 150, tracesProcessed: 1000, edgesCreated: 890 }
```

**References:**

- ADR-061: Output Schema Inference from Execution Traces
- `provides-edge-calculator.ts`: Consumes output schemas for edge calculation
- Story 15.2: Output schema inference implementation

### BroadcastChannel Event Distribution (ADR-036)

Pour la communication inter-process (Gateway <-> Workers <-> Dashboard), le systeme utilise
`BroadcastChannel` :

```typescript
// Event distribution via BroadcastChannel
const channel = new BroadcastChannel("pml-events");

// Publisher (Gateway)
channel.postMessage({ type: "task_completed", taskId, result });

// Subscriber (Dashboard SSE handler)
channel.onmessage = (event) => {
  sseController.enqueue(`data: ${JSON.stringify(event.data)}\n\n`);
};
```

**Use Cases :**

- Propagation des evenements d'execution vers le dashboard (real-time updates)
- Synchronisation des caches entre workers
- Notification des changements de configuration

## 3. JSR Packages

The project publishes the following packages to JSR (JavaScript Registry):

| Package               | Version | Description                                                 |
| --------------------- | ------- | ----------------------------------------------------------- |
| **@casys/pml**        | 0.2.6   | PML CLI and workspace management, sandbox permissions       |
| **@casys/mcp-server** | 0.3.0   | MCP server framework with JSON Schema validation (ajv)      |
| **@casys/mcp-std**    | 0.2.1   | Standard MCP tools library (120+ tools), standalone server  |
| **@pml/shgat**        | 0.1.0   | SHGAT (Sparse Heterogeneous Graph Attention) library        |

### Package Locations

- `packages/pml/` - @casys/pml CLI package
- `lib/server/` - @casys/mcp-server framework
- `lib/std/` - @casys/mcp-std standard tools
- `lib/shgat/` - @pml/shgat graph attention library

## 4. CasysDB - Rust Engine

The `crates/` directory contains the CasysDB Rust engine for high-performance storage:

| Crate                | Version | Description                                      |
| -------------------- | ------- | ------------------------------------------------ |
| **casys_core**       | 0.1.0   | Core types and traits for storage abstraction    |
| **casys_engine**     | 0.1.0   | Main engine with pluggable storage backends      |
| **casys_storage_fs** | 0.1.0   | Filesystem-based storage backend                 |
| **casys_storage_mem**| 0.1.0   | In-memory storage backend                        |

### Planned Storage Backends (excluded from workspace)

- `casys_napi` - Node.js N-API bindings
- `casys_pyo3` - Python bindings via PyO3
- `casys_storage_pg` - PostgreSQL storage backend
- `casys_storage_redis` - Redis storage backend
- `casys_storage_s3` - S3-compatible storage backend

### Rust Dependencies

| Dependency     | Version | Purpose                           |
| -------------- | ------- | --------------------------------- |
| `serde`        | 1.0     | Serialization with derive support |
| `serde_json`   | 1.0     | JSON serialization                |
| `thiserror`    | 1.0     | Error handling                    |
| `crc32fast`    | 1.x     | Fast CRC32 checksums              |

## 5. Data & Storage

| Component          | Technology                                  | Purpose                                             |
| ------------------ | ------------------------------------------- | --------------------------------------------------- |
| **PGlite 0.3.14**  | PostgreSQL 17 WASM + pgvector               | Primary relational store, persisted on filesystem   |
| **Drizzle ORM**    | `drizzle-orm@0.45.1`                        | Application tables (`users`, future RBAC/secrets)   |
| **SQL Migrations** | Custom runner (`src/db/migrations.ts`)      | Tool index, GraphRAG, episodic memory, telemetry    |
| **Vector Search**  | pgvector HNSW (`vector_cosine_ops`, `m=16`) | `tool_embedding`, `workflow_pattern`                |
| **Deno KV**        | `Deno.openKv()` singleton                   | OAuth sessions, pending states, future secret cache |
| **Database Path**  | `.pml.db` (prod) / `.pml-dev.db` (dev)      | Configurable via `PML_DB_PATH` env var              |

See `docs/architecture/data-architecture.md` for the exhaustive schema.

## 6. Graph & ML Layer

| Capability             | Libraries                                                                                        | Description                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Graph Engine**       | `graphology@0.25.4`, `graphology-communities-louvain@2.0.1`, `graphology-shortest-path@2.0.2`, `graphology-metrics@2.2.0` | PageRank, Louvain communities, shortest path DAG reconstruction                                            |
| **Similarity Models**  | `@huggingface/transformers@3.7.6`                                                                | BGE-M3 embeddings for tools & intents                                                                      |
| **SHGAT**              | `@pml/shgat@0.1.0` (standalone lib)                                                              | Sparse Heterogeneous Graph Attention for tool scoring                                                      |
| **Scoring Algorithms** | ADR-038                                                                                          | Hybrid search (semantic + Adamic-Adar), next-step prediction (cooccurrence + Louvain + recency + PageRank) |
| **Learning Stores**    | `tool_dependency`, `workflow_execution`, `episodic_events`, `adaptive_thresholds`                | Updated via sandbox traces                                                                                 |

## 7. MCP & External Integrations

| Area                   | Details                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------ |
| **MCP SDK**            | `@modelcontextprotocol/sdk@1.15.1` official implementation                           |
| **JSON Schema**        | `ajv@8.17.1` for MCP tool input validation                                           |
| **Transports**         | stdio (local mode), HTTP Streamable (cloud mode, ADR-025), SSE output to clients     |
| **Hosted MCP Servers** | >15 servers launched via `Deno.Command` (GitHub, Filesystem, Memory, Tavily, etc.)   |
| **Config**             | `config/.mcp-servers.json` (gateway) + future per-user configs (`user_mcp_configs`)  |
| **Meta-Tools**         | `pml:search_tools`, `pml:execute_dag`, `pml:execute_code`, `pml:search_capabilities` |
| **Real Execution**     | Gateway executes DAGs via MCP (ADR-030), not just suggestions                        |

### JSON-RPC Multiplexer Pattern (ADR-044)

Pour les requetes MCP paralleles, le systeme utilise un multiplexer au lieu de requetes
sequentielles :

```typescript
// Pattern: Multiplexer pour requetes paralleles
class MCPMultiplexer {
  private pending: Map<string, PendingRequest> = new Map();

  async callMany(requests: MCPRequest[]): Promise<MCPResponse[]> {
    // 1. Assigne un ID unique a chaque requete
    // 2. Envoie toutes les requetes en parallele
    // 3. Demultiplexe les reponses par ID
    return Promise.all(requests.map((r) => this.callSingle(r)));
  }
}
```

**Benefices :**

- Reduit la latence de N requetes sequentielles a 1 round-trip
- Respecte le protocole JSON-RPC 2.0 (batch requests)
- Utilise dans `pml:execute_dag` pour les taches paralleles

## 8. Authentication (Epic 9)

| Component           | Technology                          | Notes                                |
| ------------------- | ----------------------------------- | ------------------------------------ |
| **OAuth Provider**  | GitHub via `@deno/kv-oauth@0.11.0`  | Single sign-on, CSRF protection      |
| **Session Storage** | Deno KV                             | 30-day TTL, cookie-based             |
| **API Keys**        | `ac_` prefix + 24 random chars      | For MCP gateway access (cloud mode)  |
| **Key Hashing**     | Argon2id via `@ts-rex/argon2@1.0.0` | Secure storage in `users` table      |
| **Mode Detection**  | `GITHUB_CLIENT_ID` env var presence | Cloud mode vs Local mode (zero auth) |

### Dual-Server Architecture

```
+--------------------------------+     +------------------------------+
| Fresh Dashboard                |     | API Server (MCP Gateway)     |
| Port: 8081 (dev) / 8080 (prod) |     | Port: 3003 (dev) / 3001 (prod)|
|                                |     |                              |
| Auth: Session Cookie           |     | Auth: x-api-key Header       |
| Routes: /dashboard, /settings  |     | Routes: /mcp, /health        |
+--------------------------------+     +------------------------------+
```

## 9. Major Dependencies

| Category          | Package                      | Version  | Purpose                                    |
| ----------------- | ---------------------------- | -------- | ------------------------------------------ |
| **Web Framework** | `@fresh/core`                | 2.x      | Fresh 2 SSR framework                      |
| **UI**            | `preact`                     | 10.27.x  | Lightweight React alternative              |
| **Styling**       | `tailwindcss`                | 4.1.x    | Utility-first CSS                          |
| **Build**         | `vite`                       | 7.1.3    | Fast dev server and bundler                |
| **CLI**           | `@cliffy/command`            | 1.0.0-rc.8 | Command-line interface framework         |
| **Database**      | `@electric-sql/pglite`       | 0.3.14   | PostgreSQL WASM                            |
| **ORM**           | `drizzle-orm`                | 0.45.1   | TypeScript ORM                             |
| **Validation**    | `ajv`                        | 8.17.1   | JSON Schema validation                     |
| **Validation**    | `zod`                        | 3.23.x   | TypeScript-first schema validation         |
| **HTTP**          | `@hono/hono`                 | 4.x      | Fast, lightweight web framework            |
| **State Machine** | `xstate`                     | 5.19.2   | State management for workflows             |
| **ML**            | `@huggingface/transformers`  | 3.7.6    | Transformer models for embeddings          |
| **Math**          | `mathjs`                     | 14.0.0   | Mathematical operations                    |
| **Statistics**    | `simple-statistics`          | 7.8.0    | Statistical functions                      |
| **Matrix**        | `ml-matrix`                  | 6.11.1   | Matrix operations for SHGAT                |
| **Telemetry**     | `@opentelemetry/api`         | 1.9.0    | OpenTelemetry instrumentation              |
| **Error Track**   | `@sentry/deno`               | 10.8.0   | Error tracking and monitoring              |

## 10. DevOps & Observability

| Tooling           | Purpose                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| `@std/log`        | Structured logging (JSON optional)                                      |
| `metrics` table   | Lightweight telemetry (counts, latency)                                 |
| `scripts/` (bash) | Ops helpers (devcontainer, deploy)                                      |
| Systemd targets   | `deno task prod:*` interacts with `casys-dashboard` / `casys-api` units |
| Sentry (optional) | Error tracking, performance monitoring (ADR-011)                        |
| OpenTelemetry     | Distributed tracing via `@opentelemetry/api`                            |

## 11. Key Environment Variables

| Variable               | Default   | Description                       |
| ---------------------- | --------- | --------------------------------- |
| `PML_DB_PATH`          | `.pml.db` | Database path                     |
| `PML_API_KEY`          | -         | API key for cloud mode MCP access |
| `GITHUB_CLIENT_ID`     | -         | Enables cloud mode when set       |
| `GITHUB_CLIENT_SECRET` | -         | GitHub OAuth secret               |
| `PORT_API`             | `3003`    | API server port                   |
| `PORT_DASHBOARD`       | `8081`    | Fresh dashboard port              |
| `LOG_LEVEL`            | `info`    | Logging verbosity                 |
| `SENTRY_DSN`           | -         | Sentry error tracking (optional)  |

## 12. Roadmap Items

1. **Full Drizzle schema generation** - Replace ad-hoc SQL migrations for GraphRAG tables
2. **Secret management** - KMS-backed `user_secrets`, envelope encryption
3. **Observability stack** - Export metrics to ClickHouse / Prometheus
4. **Gateway exposure modes** - ADR-017 (semantic, hybrid, full_proxy modes)
5. **Rate limiting** - Story 9.5 (per-user quotas, data isolation)
6. **CasysDB integration** - FFI bindings to Rust storage engine

---

### References

- `deno.json` (tasks + imports)
- `packages/pml/deno.json`, `lib/server/deno.json`, `lib/std/deno.json`, `lib/shgat/deno.json`
- `crates/Cargo.toml` (Rust workspace)
- `src/db/migrations.ts`, `src/db/schema/*`
- `docs/architecture/data-architecture.md`
- `docs/adrs/ADR-025-mcp-streamable-http-transport.md`
- `docs/adrs/ADR-030-gateway-real-execution.md`
- `docs/adrs/ADR-036-broadcast-channel-event-distribution.md`
- `docs/adrs/ADR-038-scoring-algorithms-reference.md`
- `docs/adrs/ADR-044-json-rpc-multiplexer-mcp-client.md`
- `_bmad-output/planning-artifacts/adrs/ADR-061-output-schema-inference-from-traces.md`
- `docs/sprint-artifacts/tech-rename-to-casys-pml.md`
- `src/application/services/execution-capture.service.ts`
- `packages/pml/src/tracing/syncer.ts`
- `src/capabilities/output-schema-inferrer.ts`
