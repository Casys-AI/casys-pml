# Deployment Architecture

> Last updated: January 2026

## Overview

Casys PML is designed as a **local-first** tool with no cloud dependencies for the MVP. The
architecture supports evolution toward edge/cloud deployments.

## Deployment Architecture

```
+-----------------------------------------------------------------------+
|                     USER MACHINE (Local-First)                        |
|                                                                       |
|  +------------------+     +------------------+     +----------------+  |
|  |  Claude Desktop  |---->|    Casys PML     |---->|  MCP Servers   |  |
|  |  (Claude Code)   |     |     Gateway      |     |  (15+ types)   |  |
|  +------------------+     +--------+---------+     +----------------+  |
|                                    |                                  |
|                           +--------v--------+                         |
|                           |    PGlite DB    |                         |
|                           |    ~/.pml/      |                         |
|                           +-----------------+                         |
|                                                                       |
|  +----------------------------------------------------------------+   |
|  |  Dashboard (Optional)                                          |   |
|  |  Fresh @ localhost:8080 --SSE--> Gateway @ localhost:3001      |   |
|  +----------------------------------------------------------------+   |
|                                                                       |
+-----------------------------------------------------------------------+
```

---

## Deployment Modes

### Mode 1: CLI Binary (Production)

```bash
# Installation via deno install (JSR)
deno install -Agf jsr:@casys/pml

# Direct usage
pml init     # MCP config migration
pml serve    # Start gateway
```

**Characteristics:**

- Single compiled binary (~50MB with Deno runtime)
- Zero external dependencies
- Portable between machines

### Mode 2: Development (Source)

```bash
# Clone + run from source
git clone https://github.com/casys-ai/casys-pml.git
cd casys-pml
deno task serve:playground
```

**Characteristics:**

- Hot reload with `deno task dev`
- Debug logs access
- Tests and benchmarks available

### Mode 3: Docker (Monitoring Stack)

```bash
# Start monitoring stack
docker compose up -d

# Cloud mode (with PostgreSQL)
docker compose --profile cloud up -d
```

---

## Published Packages (JSR)

Casys PML distributes packages via [JSR](https://jsr.io) (JavaScript Registry).

| Package | Version | Description |
|---------|---------|-------------|
| `@casys/pml` | 0.2.6 | Main PML CLI and library |
| `@casys/mcp-std` | 0.2.1 | MCP server with 120+ standard tools |
| `@casys/mcp-server` | 0.3.0 | MCP server framework |

### Installation

```bash
# PML CLI
deno install -Agf jsr:@casys/pml

# MCP Std Server (run directly)
deno run -A jsr:@casys/mcp-std/server

# As library dependency
deno add jsr:@casys/mcp-server
```

---

## CI/CD Pipelines

### GitHub Workflows

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `ci.yml` | Push/PR to main | Lint, type check, unit tests |
| `release-pml.yml` | Tag `v*` | Compile binaries, create GitHub release |
| `release-mcp-std.yml` | Tag `v*` | Compile MCP Std binaries, create release |
| `sync-pml-package.yml` | Push to main (packages/pml/) | Sync to public repo Casys-AI/casys-pml |
| `sync-mcp-server.yml` | Push to main (lib/server/) | Sync to public repo Casys-AI/mcp-server |
| `sync-to-public.yml` | Manual/scheduled | Sync main repo to public |

### JSR Auto-Publish

Public repositories have their own publish workflows that trigger on push to main:

```yaml
# packages/pml/.github/workflows/publish.yml
# lib/std/.github/workflows/publish.yml
name: Publish
on:
  push:
    branches: [main]
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v5
      - run: npx jsr publish
```

### Build Targets

| Platform | Architecture | Artifact |
|----------|--------------|----------|
| Linux | x64 | `pml-linux-x64`, `mcp-std-linux-x64` |
| Linux | ARM64 | `mcp-std-linux-arm64` |
| macOS | x64 (Intel) | `pml-macos-x64`, `mcp-std-darwin-x64` |
| macOS | ARM64 (Apple Silicon) | `pml-macos-arm64`, `mcp-std-darwin-arm64` |
| Windows | x64 | `pml-windows-x64.exe`, `mcp-std-windows-x64.exe` |

---

## Supported Platforms

| Platform | Architecture  | Status           | Notes                      |
|----------|---------------|------------------|----------------------------|
| macOS    | x64 (Intel)   | Tested           | Primary dev platform       |
| macOS    | ARM64 (M1/M2) | Tested           | Full support               |
| Linux    | x64           | Tested           | CI/CD environment          |
| Linux    | ARM64         | Tested           | MCP Std builds available   |
| Windows  | x64           | Via WSL          | Native Deno possible       |
| Windows  | ARM64         | Not supported    | Deno support limited       |

---

## System Requirements

### Minimum

| Resource | Value    | Justification                    |
|----------|----------|----------------------------------|
| RAM      | 4 GB     | BGE-M3 model (~2GB) + HNSW index |
| Disk     | 1 GB     | Database + logs + model cache    |
| CPU      | 2 cores  | Parallel DAG execution           |
| Deno     | 2.2+ LTS | Minimum stable version           |

### Recommended

| Resource | Value    | Benefit                            |
|----------|----------|-----------------------------------|
| RAM      | 8 GB     | Margin for multiple MCP servers    |
| Disk     | 5 GB     | Execution history, episodic memory |
| CPU      | 4+ cores | Better DAG parallelism             |
| Deno     | 2.5+     | Latest optimizations               |

---

## Runtime File Structure

```
~/.pml/                           # User data directory
├── config.yaml                   # User configuration
├── pml.db                        # PGlite database (single file)
├── logs/
│   └── pml.log                   # Application logs (rotated)
├── cache/
│   ├── embeddings/               # Cached model weights
│   └── results/                  # Execution result cache
└── checkpoints/                  # Workflow checkpoints (resume)
```

---

## Inter-Process Communication

### Claude Desktop <-> Casys PML

```
+------------------+          +------------------+
|  Claude Desktop  |  stdio   |   Casys PML      |
|                  |<-------->|   Gateway        |
|  (JSON-RPC)      |          |   (MCP Server)   |
+------------------+          +------------------+
```

**Protocol:** JSON-RPC 2.0 over stdio

- No network port exposed
- Bidirectional synchronous communication
- Timeout: 30s per request

### Casys PML <-> MCP Servers

```
+------------------+          +------------------+
|   Casys PML      |  stdio   |   MCP Server     |
|   Gateway        |<-------->|   (filesystem)   |
|                  |          |   (github)       |
|                  |          |   (memory)       |
+------------------+          +------------------+
```

**Process Management:**

- `Deno.Command` for spawning
- Persistent connection pool
- Automatic restart on crash

### Dashboard <-> Gateway

```
+------------------+   SSE    +------------------+
|   Fresh Web      |<---------|   Casys PML      |
|   Dashboard      |   HTTP   |   Gateway        |
|   :8080          |--------->|   :3001          |
+------------------+          +------------------+
```

**Protocol:**

- SSE (Server-Sent Events) for real-time streaming
- REST for commands (approve, abort, replan)
- WebSocket future option for bidirectional

---

## Hybrid Routing Architecture

> **ADR-059** (Hybrid Routing) + **ADR-062** (Client-Server Workflow Separation)

The hybrid routing architecture enables secure execution of capabilities by separating analysis (server) from execution (client). This ensures that sensitive operations (filesystem, shell) run locally while stateless computations can be offloaded to the cloud.

### Architecture Overview

```
+-------------------------------------------------------------------------+
|                           HYBRID ROUTING FLOW                            |
|                                                                          |
|   Claude Code                PML Cloud                 PML Client        |
|   +--------+                +---------+               +-----------+      |
|   |        |   pml_execute  |         |  execute_    |           |      |
|   | Claude |--------------->| Server  |  locally     | Sandbox   |      |
|   |        |                |         |------------->| Executor  |      |
|   |        |                |         |              |           |      |
|   |        |<---------------|         |<-------------|           |      |
|   |        |   result       |         |   trace      |           |      |
|   +--------+                +---------+               +-----------+      |
|                                                                          |
|   Phase 1: Analysis         Phase 2: Routing         Phase 3: Execution |
|   - Parse code              - Detect tool types      - Client sandbox    |
|   - Detect tools            - Resolve FQDNs         - MCP tool calls    |
|   - Build DAG               - Return execute_locally - Collect traces    |
|                                                                          |
+-------------------------------------------------------------------------+
```

### Routing Decision Logic

The routing resolver determines where tools execute based on security requirements.

| Routing | Description | Examples |
|---------|-------------|----------|
| `client` | Runs on user's machine (default) | `filesystem:*`, `shell:*`, `git:*` |
| `server` | Runs on pml.casys.ai | `tavily:*`, `fetch:*`, external APIs |

**Decision Algorithm:**

```typescript
// From src/capabilities/routing-resolver.ts

function resolveRouting(toolsUsed: string[]): CapabilityRouting {
  // 1. No tools = pure compute = server safe
  if (!toolsUsed || toolsUsed.length === 0) {
    return "server";
  }

  // 2. ANY client tool = entire capability runs on client
  for (const tool of toolsUsed) {
    if (!isInServerList(tool)) {
      return "client";  // Default is CLIENT for unknown tools
    }
  }

  // 3. All tools in server list = can run on server
  return "server";
}
```

**Security Principle:** Default to CLIENT. Unknown tools run locally. Only explicitly allowlisted tools can run on the server.

### Server Analysis Phase

When `pml_execute` is called with code:

```
+-----------------------------------------------------------------------+
|                        SERVER ANALYSIS                                 |
|                                                                        |
|  1. Parse Code (SWC)           2. Detect Tools           3. Build DAG |
|  +------------------+         +------------------+      +------------+ |
|  | const files =    |  -----> | mcp.filesystem.  |      | Layer 0:   | |
|  |   await mcp.     |         |   read_file      |      |   read_file| |
|  |   filesystem.    |         | mcp.std.         |      | Layer 1:   | |
|  |   read_file(...) |         |   json_parse     |      |   json_parse|
|  +------------------+         +------------------+      +------------+ |
|                                                                        |
|  4. Resolve Routing            5. Generate Response                    |
|  +------------------+         +----------------------------------+     |
|  | filesystem:* --> |         | { status: "execute_locally",     |     |
|  |   client         |         |   code: "...",                   |     |
|  | std:json_parse   |         |   client_tools: ["filesystem"],  |     |
|  |   --> client     |         |   tools_used: [                  |     |
|  +------------------+         |     { id: "filesystem:read_file",|     |
|                               |       fqdn: "u-abc.fs.read.a1b2"}|     |
|                               |   ] }                            |     |
|                               +----------------------------------+     |
+-----------------------------------------------------------------------+
```

### Client Execution Phase

When client receives `execute_locally`:

```
+-----------------------------------------------------------------------+
|                       CLIENT EXECUTION                                 |
|                                                                        |
|  1. Create Sandbox            2. Execute Code          3. Route Tools |
|  +------------------+        +------------------+     +--------------+ |
|  | SandboxExecutor  |        | await mcp.       |     | routing:     | |
|  | - Zero perms     |  --->  |   filesystem.    | --> |   client     | |
|  | - Isolated proc  |        |   read_file()    |     | CapLoader.   | |
|  +------------------+        +------------------+     |   call()     | |
|                                                       +--------------+ |
|                                                                        |
|  4. Collect Results           5. Send Trace to Server                  |
|  +------------------+        +----------------------------------+      |
|  | { success: true, |        | traceSyncer.enqueue({            |      |
|  |   result: {...}, | -----> |   workflowId: "...",             |      |
|  |   durationMs: 42,|        |   success: true,                 |      |
|  |   toolCalls: [...|        |   taskResults: [...],            |      |
|  | }                |        | });                              |      |
|  +------------------+        +----------------------------------+      |
+-----------------------------------------------------------------------+
```

### Routing Configuration

Routing is configured in `config/mcp-routing.json`:

```json
{
  "routing": {
    "client": [],
    "server": []
  },
  "default": "client"
}
```

The routing config is synced from the cloud at startup and cached locally:

| File | Location | Purpose |
|------|----------|---------|
| `routing-cache.json` | `~/.pml/` | Local cache (24h TTL) |
| `/api/v1/routing` | pml.casys.ai | Cloud source of truth |

**Cache Sync Flow:**

```typescript
// From packages/pml/src/routing/sync.ts

async function syncRoutingConfig(cloudUrl: string): Promise<RoutingConfig> {
  // 1. Load existing cache
  const existingCache = await loadRoutingCache();

  // 2. Fetch from cloud with ETag
  const fetchResult = await fetchRoutingConfig(cloudUrl, existingCache?.config.version);

  // 3. If 304 Not Modified, use cache
  if (fetchResult.notModified) {
    return existingCache.config;
  }

  // 4. Save new config to cache
  await saveRoutingCache(createCacheEntry(fetchResult.config, cloudUrl));

  return fetchResult.config;
}
```

---

## Client-Server Workflow Separation

> **ADR-062**: PendingWorkflowStore with 5-minute TTL for HIL approvals

When execution requires user approval (dependency installation, API key configuration, integrity validation), the workflow is paused and stored client-side.

### Approval Types

| Type | Trigger | User Action |
|------|---------|-------------|
| `dependency` | MCP server not installed | Approve installation |
| `api_key_required` | Missing API key for tool | Add key to `.env` |
| `integrity` | Capability hash changed | Approve code update |

### PendingWorkflowStore

The store maintains workflow state during HIL (Human-in-the-Loop) pauses:

```typescript
// From packages/pml/src/workflow/pending-store.ts

interface PendingWorkflow {
  code: string;              // Original code to re-execute
  toolId: string;            // Tool that triggered approval
  approvalType: ApprovalType; // "dependency" | "api_key_required" | "integrity"
  createdAt: number;         // For TTL expiration
  dependency?: McpDependency; // For dependency approvals
  missingKeys?: string[];    // For API key approvals
  integrityInfo?: {          // For integrity approvals
    fqdnBase: string;
    newHash: string;
    oldHash: string;
  };
  fqdnMap?: Record<string, string>; // Server-resolved FQDNs
}

class PendingWorkflowStore {
  private workflows = new Map<string, PendingWorkflow>();
  private readonly ttlMs: number = 5 * 60 * 1000; // 5 minutes

  create(code, toolId, approvalType, options): string {
    this.cleanup(); // Remove expired workflows
    const id = crypto.randomUUID();
    this.workflows.set(id, { code, toolId, approvalType, createdAt: Date.now(), ...options });
    return id;
  }

  get(id: string): PendingWorkflow | null {
    const workflow = this.workflows.get(id);
    if (!workflow) return null;
    if (Date.now() - workflow.createdAt > this.ttlMs) {
      this.workflows.delete(id);
      return null; // Expired
    }
    return workflow;
  }
}
```

### Approval Flow Sequence

```
+-------------------------------------------------------------------------+
|                        HIL APPROVAL FLOW                                 |
|                                                                          |
|   Claude           PML Client                    PML Server              |
|     |                  |                              |                  |
|     |  pml_execute     |                              |                  |
|     |----------------->|   forward to cloud           |                  |
|     |                  |----------------------------->|                  |
|     |                  |                              |                  |
|     |                  |   execute_locally            |                  |
|     |                  |<-----------------------------|                  |
|     |                  |                              |                  |
|     |                  |   (execute in sandbox)       |                  |
|     |                  |   Tool requires API key!     |                  |
|     |                  |                              |                  |
|     |                  |   Store in PendingWorkflowStore                 |
|     |                  |   workflowId = "abc-123"     |                  |
|     |                  |                              |                  |
|     |  approval_required                              |                  |
|     |<-----------------|                              |                  |
|     |  workflow_id: "abc-123"                         |                  |
|     |  approval_type: "api_key_required"              |                  |
|     |  missing_keys: ["OPENAI_API_KEY"]               |                  |
|     |                                                 |                  |
|     |  (User adds key to .env)                        |                  |
|     |                                                 |                  |
|     |  continue_workflow                              |                  |
|     |  { workflow_id: "abc-123", approved: true }     |                  |
|     |----------------->|                              |                  |
|     |                  |                              |                  |
|     |                  |   Lookup pending workflow    |                  |
|     |                  |   Reload .env                |                  |
|     |                  |   Re-execute code            |                  |
|     |                  |                              |                  |
|     |  success         |                              |                  |
|     |<-----------------|                              |                  |
|     |                                                 |                  |
+-------------------------------------------------------------------------+
```

### MCP Response Format

**approval_required response:**

```json
{
  "status": "approval_required",
  "approval_type": "api_key_required",
  "workflow_id": "abc-123-def-456",
  "context": {
    "tool": "openai:chat",
    "missing_keys": ["OPENAI_API_KEY"],
    "instruction": "Add OPENAI_API_KEY to your .env file"
  },
  "options": ["continue", "abort"]
}
```

**continue_workflow request:**

```json
{
  "intent": "...",
  "continue_workflow": {
    "workflow_id": "abc-123-def-456",
    "approved": true
  }
}
```

### Approval Type Handling

| Approval Type | Pre-Continuation Action | Post-Continuation |
|---------------|------------------------|-------------------|
| `dependency` | None (handled in loader) | Install MCP server |
| `api_key_required` | Reload `.env` file | Retry with new keys |
| `integrity` | None (handled in loader) | Update lockfile hash |

```typescript
// From packages/pml/src/cli/stdio-command.ts

switch (pendingWorkflow.approvalType) {
  case "api_key_required":
    // Reload environment variables from .env
    await reloadEnv(workspace);
    break;

  case "integrity":
    // Lockfile update happens in the loader
    break;

  case "dependency":
    // Dependency installation happens in the loader
    break;
}
```

### Key Implementation Files

| File | Purpose |
|------|---------|
| `src/capabilities/routing-resolver.ts` | Main routing logic |
| `packages/pml/src/routing/resolver.ts` | PML package routing |
| `packages/pml/src/routing/cache.ts` | Local routing cache |
| `packages/pml/src/routing/sync.ts` | Cloud sync logic |
| `packages/pml/src/workflow/pending-store.ts` | HIL workflow storage |
| `packages/pml/src/cli/stdio-command.ts` | Stdio server with routing |
| `config/mcp-routing.json` | Routing configuration |

---

## Observability Stack

### Architecture

```
+-----------------------------------------------------------------------------+
|                          MONITORING STACK (Docker)                          |
|                                                                             |
|  +-------------+    +-------------+    +-------------+    +-------------+   |
|  |   Grafana   |    | Prometheus  |    |    Loki     |    |   Jaeger    |   |
|  |   :3000     |<---|   :9091     |<---|   :3100     |    |   :16686    |   |
|  +-------------+    +------^------+    +------^------+    +------^------+   |
|                            |                  |                  |          |
|  +-------------------------+------------------+------------------+-------+  |
|  |                         |                  |                  |       |  |
|  |  +----------+    +------+------+    +------+------+    +------+----+  |  |
|  |  |   Node   |    |    PML      |    |   Alloy     |    | Deno OTEL |  |  |
|  |  | Exporter |    |  Metrics    |    | (Logs)      |    | (Traces)  |  |  |
|  |  +----------+    +-------------+    +-------------+    +-----------+  |  |
|  |                                                                       |  |
|  +-----------------------------------------------------------------------+  |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### Services and Ports

| Service | Port | Description |
|---------|------|-------------|
| Grafana | 3000 | Dashboards and visualization |
| Prometheus | 9091 | Metrics collection (external port; 9090 used by Cockpit) |
| Loki | 3100 | Log aggregation |
| Jaeger UI | 16686 | Distributed tracing UI |
| Jaeger OTLP gRPC | 4317 | OpenTelemetry gRPC receiver |
| Jaeger OTLP HTTP | 4318 | OpenTelemetry HTTP receiver (Deno default) |
| Jaeger SPM | 8889 | SpanMetrics for Prometheus |
| Alloy | 12345 | Log collector UI |
| Node Exporter | 9100 | System metrics (internal) |
| PostgreSQL | 5432 | Cloud mode only |
| PML Gateway | 3001 | HTTP API |
| PML Metrics | 3003 | Prometheus metrics endpoint |

### Grafana Dashboards

| Dashboard | Description |
|-----------|-------------|
| `pml-algorithms.json` | Algorithm decisions, tool calls, DAG executions |
| `server-monitoring.json` | System metrics (CPU, RAM, Disk, Network) |
| `jaeger-spm.json` | Service Performance Monitoring from traces |

### Log Collection: Alloy

Grafana Alloy (successor to Promtail) collects logs from PML and forwards to Loki.

**Configuration:** `monitoring/alloy-config.alloy`

```alloy
local.file_match "agentcards" {
  path_targets = [{
    __address__ = "localhost",
    __path__    = "/var/log/pml/*.log",
    host        = env("HOSTNAME"),
    job         = "agentcards",
  }]
}

loki.source.file "agentcards" {
  targets    = local.file_match.agentcards.targets
  forward_to = [loki.process.agentcards.receiver]
}

loki.process "agentcards" {
  forward_to = [loki.write.default.receiver]
  stage.json { ... }  // Parse JSON logs
  stage.labels { ... } // Extract level
}

loki.write "default" {
  endpoint {
    url = "http://loki:3100/loki/api/v1/push"
  }
}
```

### Metrics Collection: Prometheus

**Scrape targets:**

| Job | Target | Description |
|-----|--------|-------------|
| `prometheus` | localhost:9090 | Prometheus self-monitoring |
| `pml` | host.docker.internal:3003 | PML algorithm metrics |
| `node` | node-exporter:9100 | System metrics |
| `jaeger-spanmetrics` | jaeger:8889 | Trace-derived metrics |

### Tracing: Jaeger with OTEL

Deno native OpenTelemetry support (`--unstable-otel`) sends traces to Jaeger.

**Jaeger configuration:** `monitoring/jaeger-config.yaml`

- Receives OTLP via gRPC (4317) and HTTP (4318)
- SpanMetrics connector generates Prometheus metrics
- Custom dimensions for algorithm decisions:
  - `algorithm.name`
  - `algorithm.mode`
  - `algorithm.decision`
  - `algorithm.target_type`

### IDecisionLogger Abstraction

PML implements `IDecisionLogger` interface for OTEL-native logging:

```typescript
interface IDecisionLogger {
  logDecision(decision: AlgorithmDecision): void;
  logToolCall(call: ToolCallMetrics): void;
  logDAGExecution(dag: DAGMetrics): void;
}
```

---

## Logs

```typescript
// Structured logging via @std/log
import { getLogger } from "@std/log";
const logger = getLogger();

logger.info("Tool call", {
  server: "filesystem",
  tool: "read_file",
  duration_ms: 42,
});
```

**Levels:** DEBUG, INFO, WARN, ERROR, CRITICAL

### Metrics

| Metric                      | Type      | Description              |
|-----------------------------|-----------|--------------------------|
| `dag_execution_duration_ms` | Histogram | Workflow execution time  |
| `tool_call_latency_ms`      | Histogram | Latency per tool         |
| `speculation_success_rate`  | Gauge     | Speculation success rate |
| `context_usage_percent`     | Gauge     | % LLM context used       |
| `algorithm_decisions_total` | Counter   | Algorithm decisions count |

### Retention

- **Logs:** 31 days (configured in `loki-config.yaml`)
- **Metrics:** 15 days / 10GB (Prometheus)
- **Traces:** 50,000 traces in memory (Jaeger)

---

## Docker Compose Services

### Core Services (Always Started)

| Service | Image | Purpose |
|---------|-------|---------|
| `loki` | grafana/loki:3.4.1 | Log aggregation |
| `alloy` | grafana/alloy:latest | Log collection (replaces Promtail) |
| `prometheus` | prom/prometheus:v3.1.0 | Metrics collection |
| `grafana` | grafana/grafana:12.3.0 | Visualization |
| `node-exporter` | prom/node-exporter:v1.8.2 | System metrics |
| `jaeger` | jaegertracing/jaeger:2.2.0 | Distributed tracing |

### Cloud Profile Services

| Service | Image | Purpose |
|---------|-------|---------|
| `postgres` | pgvector/pgvector:pg16 | PostgreSQL with vector extension |
| `postgres-backup` | prodrigestivill/postgres-backup-local | Automated daily backups |

**Start cloud profile:**

```bash
docker compose --profile cloud up -d
```

---

## Scaling Considerations

### Horizontal Scaling (Out of Scope MVP)

Casys PML is single-instance by design (local state). For multi-instance:

```
Future: Shared PGlite via S3/GCS + PGlite-sync
       +-- Requires: Connection pooling, conflict resolution
```

### Vertical Scaling

| Bottleneck       | Solution                         |
|------------------|----------------------------------|
| RAM (embeddings) | Quantized models (future)        |
| CPU (DAG)        | Increase `maxConcurrency` config |
| Disk I/O         | SSD recommended, NVMe optimal    |

---

## Distribution Channels

### Option 1: JSR Package (Recommended)

```bash
deno install -Agf jsr:@casys/pml
```

### Option 2: GitHub Releases

```bash
# Quick install
curl -fsSL https://github.com/Casys-AI/casys-pml/releases/latest/download/install.sh | sh

# Or download binary directly
wget https://github.com/Casys-AI/casys-pml/releases/latest/download/pml-linux-x64
chmod +x pml-linux-x64
./pml-linux-x64 --help
```

### Option 3: Homebrew (Future)

```bash
brew tap casys-ai/pml
brew install pml
```

### Option 4: Deno Deploy (Edge - Future)

```typescript
// Future: Worker mode for edge deployment
Deno.serve(caiHandler);
```

---

_References:_

- [Development Environment](./development-environment.md) - Developer setup
- [Performance Considerations](./performance-considerations.md) - Optimizations
- [ADR-059](../adr/adr-059-hybrid-routing.md) - Hybrid Routing (Server Analysis, Client Execution)
- [ADR-062](../adr/adr-062-client-server-workflow.md) - Client-Server Workflow Separation
