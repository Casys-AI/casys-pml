# Architecture Overview - Casys PML

_Updated: 2026-01-14_

> **Recent Changes (284 commits since Dec 31):**
> - Epic 14: PML Package Distribution (v0.2.5) - JSR, hybrid routing, BYOK
> - Epic 15: CasysDB Native Rust Engine - ISO GQL, multi-storage
> - Clean Architecture Phase 3 - Use cases, DI adapters
> - lib/shgat Extraction - 16 K-heads, BLAS, PER training
> - Multi-tenant System - User context, FQDN namespacing

## Executive Summary

**Casys PML (Procedural Memory Layer)** est une couche mémoire pour agents IA qui capture les workflows et les cristallise en compétences réutilisables.

### Problèmes Résolus

1. **Context Saturation** — Les schémas d'outils consomment 30-50% de la fenêtre de contexte LLM
2. **Sequential Latency** — Les workflows multi-outils s'exécutent séquentiellement

### Solution

PML expose des meta-tools intelligents au lieu de proxier tous les outils :

| Tool | Description |
|------|-------------|
| `pml_discover` | Recherche hybride sémantique + graph |
| `pml_execute` | Exécution de workflows (intent ou DAG explicite) |

**Résultat** : Utilisation du contexte < 5%. Tâches indépendantes en parallèle.

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Fresh Web  │  │  CLI (pml)  │  │  MCP API    │              │
│  │  Dashboard  │  │  Cliffy     │  │  Hono       │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              packages/pml (v0.2.5) - JSR Distribution   │    │
│  │  stdio │ serve │ init │ BYOK │ Hybrid Routing           │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                APPLICATION LAYER (Clean Arch Phase 3)            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  Application Services                    │    │
│  │  - ExecutionCaptureService   - PostExecutionService      │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Use Cases                             │    │
│  │  - ExecuteDirectUseCase      - ExecuteWorkflowUseCase    │    │
│  │  - DiscoverToolsUseCase      - CreateCapabilityUseCase   │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    DI Adapters                           │    │
│  │  - Algorithm Injection       - Repository Bindings       │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      DOMAIN LAYER                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Capability  │  │  Workflow   │  │    Tool     │              │
│  │   Entity    │  │   Entity    │  │   Entity    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 Domain Services                          │    │
│  │  - CapabilityMatcher  - DAGBuilder  - SecurityValidator │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                   INFRASTRUCTURE LAYER                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Database   │  │    MCP      │  │  External   │              │
│  │  PGlite/PG  │  │  Clients    │  │   APIs      │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Subsystems

### 1. MCP Gateway

Point d'entrée principal pour les agents LLM.

```
┌─────────────────────────────────────────────────────────────────┐
│                       MCP Gateway                                │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                      Handlers                            │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐               │    │
│  │  │ Discover │  │ Execute  │  │ Workflow │               │    │
│  │  │ Handler  │  │ Handler  │  │ Handler  │               │    │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘               │    │
│  └───────┼─────────────┼─────────────┼─────────────────────┘    │
│          │             │             │                           │
│  ┌───────▼─────────────▼─────────────▼─────────────────────┐    │
│  │                  Connection Pool                         │    │
│  │   stdio → MCP Clients (filesystem, memory, etc.)        │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Responsabilités:**
- Routage des requêtes MCP
- Gestion des connexions aux MCP servers
- Agrégation des résultats

### 2. GraphRAG Engine

Moteur de recherche hybride sémantique + graph.

```
┌─────────────────────────────────────────────────────────────────┐
│                      GraphRAG Engine                             │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Algorithms                            │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │    │
│  │  │  SHGAT   │  │  DR-DSP  │  │ Thompson │  │ Louvain  │ │    │
│  │  │ K-heads  │  │ Hyperpath│  │ Sampling │  │ Clusters │ │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌───────────────────────────▼─────────────────────────────┐    │
│  │                   Graph Store                            │    │
│  │   Graphology (in-memory) + PostgreSQL (persistence)     │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Algorithmes Clés:**

| Algorithme | Purpose | ADR |
|------------|---------|-----|
| **SHGAT** | Spectral Hypergraph Attention Network (scoring) | ADR-042 |
| **DR-DSP** | Directed Hypergraph Shortest Path (pathfinding) | ADR-038 |
| **Thompson** | Adaptive thresholds via Thompson Sampling | ADR-043 |
| **Louvain** | Community detection for tool clustering | - |
| **Adamic-Adar** | Link prediction / similarity | - |

**lib/shgat Standalone Library (NEW - Jan 2026):**

```
lib/shgat/
├── src/
│   ├── attention/          # K-head attention (16 heads adaptive)
│   ├── core/               # Main SHGAT class, factory, types
│   ├── message-passing/    # V→V, V→E, E→V, E→E co-occurrence
│   ├── training/           # PER, BLAS optimization, curriculum
│   └── utils/              # BLAS FFI bindings
```

- **16 K-heads** with adaptive sizing based on graph size
- **BLAS optimization** for backward pass
- **PER training** (Prioritized Experience Replay)
- **V→V co-occurrence** message passing from n8n workflow patterns

### 3. DAG Execution Engine

Exécution parallèle de workflows avec checkpoints.

```
┌─────────────────────────────────────────────────────────────────┐
│                    DAG Execution Engine                          │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              ControlledExecutor                          │    │
│  │                                                          │    │
│  │  Layer 0    Layer 1    Layer 2    Layer 3               │    │
│  │  ┌─────┐   ┌─────┐    ┌─────┐    ┌─────┐               │    │
│  │  │ T1  │   │ T2  │    │ T4  │    │ T5  │               │    │
│  │  └──┬──┘   │ T3  │    └──┬──┘    └─────┘               │    │
│  │     │      └──┬──┘       │                              │    │
│  │     │         │          │                              │    │
│  │  ───┴─────────┴──────────┴───────────────► Time         │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌───────────────────────────▼─────────────────────────────┐    │
│  │                 DAG Optimizer                            │    │
│  │   Task Fusion | Sequential → Parallel | Checkpoint      │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- Exécution par couches (layer-based parallelism)
- Optimisation par fusion de tâches séquentielles
- Checkpointing pour reprise
- Per-layer validation (Human-in-the-Loop)

### 4. Sandbox System

Exécution sécurisée de code utilisateur.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Sandbox System                              │
│                                                                  │
│  ┌─────────────────┐              ┌─────────────────────────┐   │
│  │   Main Thread   │              │    Sandbox Worker       │   │
│  │                 │    RPC       │    (Deno subprocess)    │   │
│  │  WorkerBridge   │◄────────────►│                         │   │
│  │                 │              │  ┌─────────────────┐    │   │
│  │  - callTool()   │              │  │ Security Layer  │    │   │
│  │  - execute()    │              │  │ - PII Detection │    │   │
│  │                 │              │  │ - Resource Limit│    │   │
│  └─────────────────┘              │  └─────────────────┘    │   │
│                                   └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Security Features:**
- Zero-permission par défaut
- PII detection automatique
- Resource limits (CPU, memory, time)
- Isolated subprocess (no shared state)

### 5. Capability System

Stockage et matching de capabilities apprises.

```
┌─────────────────────────────────────────────────────────────────┐
│                     Capability System                            │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  CapabilityStore                         │    │
│  │                                                          │    │
│  │  ┌──────────────┐    ┌──────────────┐                   │    │
│  │  │ workflow_    │    │ capability_  │                   │    │
│  │  │ pattern      │───▶│ records      │                   │    │
│  │  │ (code, DAG)  │    │ (naming,FQDN)│                   │    │
│  │  └──────────────┘    └──────────────┘                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌───────────────────────────▼─────────────────────────────┐    │
│  │              StaticStructureBuilder                      │    │
│  │   SWC AST Analysis → Static DAG Structure               │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Naming Convention (FQDN):**
```
<user>.<org>.<project>.<namespace>.<action>.<hash>
└───────────────────────────────────────────────────┘
  u-abc123.local.default.fs.read_json.a7f3
```

> **Multi-tenant (NEW):** User prefix added for capability namespacing (Migration 039)

### 6. CasysDB Native Engine (NEW - Epic 15)

Moteur graph natif en Rust pour remplacer Graphology.

```
┌─────────────────────────────────────────────────────────────────┐
│                      CasysDB Engine                               │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │                    casys_engine                          │     │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │     │
│  │  │   GQL    │  │   ANN    │  │  Index   │  │   Txn    │ │     │
│  │  │  Parser  │  │  Index   │  │  Engine  │  │  Manager │ │     │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │     │
│  └─────────────────────────────────────────────────────────┘     │
│                              │                                    │
│  ┌───────────────────────────▼─────────────────────────────┐     │
│  │                  Storage Adapters                        │     │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │     │
│  │  │   FS   │ │  Mem   │ │   PG   │ │ Redis  │ │   S3   │ │     │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ │     │
│  └─────────────────────────────────────────────────────────┘     │
│                              │                                    │
│  ┌───────────────────────────▼─────────────────────────────┐     │
│  │                    SDK Bindings                          │     │
│  │          NAPI-RS (TypeScript)  │  PyO3 (Python)         │     │
│  └─────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- **ISO GQL Support** - MATCH, CREATE, WHERE, RETURN clauses
- **Hexagonal Architecture** - Swappable storage adapters
- **Multi-SDK** - TypeScript (NAPI-RS) + Python (PyO3) bindings
- **ANN Index** - Approximate Nearest Neighbor for vector search

### 7. PML Package (NEW - Epic 14)

Distribution CLI standalone via JSR (@casys/pml v0.2.5).

```
┌─────────────────────────────────────────────────────────────────┐
│                    packages/pml (v0.2.5)                          │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │                     CLI Commands                         │     │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │     │
│  │  │  stdio   │  │  serve   │  │   init   │              │     │
│  │  │ (Claude) │  │  (HTTP)  │  │ (Setup)  │              │     │
│  │  └──────────┘  └──────────┘  └──────────┘              │     │
│  └─────────────────────────────────────────────────────────┘     │
│                              │                                    │
│  ┌───────────────────────────▼─────────────────────────────┐     │
│  │                   Core Services                          │     │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │     │
│  │  │  BYOK    │  │ Routing  │  │ Lockfile │  │ Sandbox  │ │     │
│  │  │  Keys    │  │ Hybrid   │  │ Integrity│  │ Executor │ │     │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │     │
│  └─────────────────────────────────────────────────────────┘     │
│                              │                                    │
│  ┌───────────────────────────▼─────────────────────────────┐     │
│  │                 lib/std (120+ tools)                     │     │
│  │   fs │ git │ db │ cap │ agent │ web │ json │ ...        │     │
│  └─────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- **Hybrid Routing** - Client (local) vs Server (cloud) execution
- **BYOK** - Bring Your Own API Keys (OpenAI, Anthropic, etc.)
- **Lockfile Integrity** - Validate MCP registry dependencies
- **Session Management** - Workspace state in `.pml/`

---

## Data Flow

### Discovery Flow

```
User Intent: "read JSON config files"
           │
           ▼
    ┌─────────────┐
    │ pml_discover│
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │ VectorSearch│ ─── BGE-M3 Embeddings (1024-dim)
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │  GraphRAG   │ ─── SHGAT scoring + DR-DSP pathfinding
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │  Results    │ ─── Unified score = semantic × reliability
    └─────────────┘
```

### Execution Flow

```
pml_execute({ intent, code })
           │
           ▼
    ┌─────────────┐
    │ Static      │ ─── SWC AST analysis
    │ Analysis    │
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │ DAG         │ ─── Build logical DAG
    │ Conversion  │
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │ DAG         │ ─── Fuse sequential tasks
    │ Optimizer   │
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │ Controlled  │ ─── Execute layers in parallel
    │ Executor    │
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │ Capability  │ ─── Save with trace data
    │ Store       │
    └─────────────┘
```

---

## Database Schema (Simplified)

```sql
-- Core capability storage
workflow_pattern (
  pattern_id UUID PRIMARY KEY,
  code_snippet TEXT,
  code_hash VARCHAR(64) UNIQUE,
  dag_structure JSONB,
  intent_embedding VECTOR(1024),
  success_rate FLOAT,
  usage_count INT
)

-- Naming and FQDN
capability_records (
  id VARCHAR(255) PRIMARY KEY,  -- FQDN
  org VARCHAR(100),
  project VARCHAR(100),
  namespace VARCHAR(100),
  action VARCHAR(100),
  workflow_pattern_id UUID REFERENCES workflow_pattern,
  hash VARCHAR(8)
)

-- Execution traces (for learning)
execution_trace (
  id SERIAL PRIMARY KEY,
  workflow_pattern_id UUID,
  executed_path TEXT[],
  task_results JSONB,
  intent_embedding VECTOR(1024),
  success BOOLEAN,
  duration_ms INT
)

-- Tool graph
tool_dependency (
  source_tool VARCHAR(255),
  target_tool VARCHAR(255),
  edge_type VARCHAR(50),
  weight FLOAT,
  PRIMARY KEY (source_tool, target_tool, edge_type)
)
```

---

## Key Design Decisions

| ADR | Decision | Rationale | Status |
|-----|----------|-----------|--------|
| ADR-035 | Sandbox via Deno subprocess | Zero-permission security by default | Verified |
| ADR-036 | BroadcastChannel for events | Cross-worker/cross-tab communication | Verified |
| ADR-038 | DR-DSP for hypergraph pathfinding | Better than Dijkstra for tool sequences | Verified |
| ADR-042 | SHGAT for capability scoring | K-head attention beats single score | Verified |
| ADR-043 | Thompson Sampling thresholds | Adaptive per-tool confidence | Verified |
| ADR-053 | Subprocess training + PER buffer | Non-blocking DB saves, priority sampling | Verified |
| ADR-054 | IDecisionLogger abstraction | Algorithm telemetry standardization | Verified |
| ADR-055 | SHGAT preserveDim 1024 | Keep d=1024 throughout message passing | Verified |
| ADR-056 | InfoNCE contrastive training | Temperature annealing 0.10→0.06 | Verified |
| ADR-057 | Message passing backward | End-to-end gradient through all phases | Verified |
| ADR-058 | BLAS FFI acceleration | 10x speedup with JS fallback | Verified |
| ADR-059 | Hybrid routing (server→client) | Server analysis, client execution | Verified |
| ADR-060 | Hard negative mining curriculum | Tier-based difficulty (easy/medium/hard) | Verified |
| ADR-061 | Output schema inference | Auto-infer from execution traces | Verified |
| ADR-062 | Client-server workflow separation | PendingWorkflowStore with 5-min TTL | Verified |
| ADR-063 | Open source distribution | GitHub Actions sync to public repos | Verified |

### New Decisions (Jan 2026)

| Epic | Decision | Impact |
|------|----------|--------|
| Epic 14 | Hybrid routing (client/server) | Capabilities run locally or cloud |
| Epic 14 | BYOK API keys | Users provide own LLM keys |
| Epic 15 | CasysDB Rust engine | Native graph replaces Graphology |
| Phase 3 | Use case extraction | Clean Architecture compliance |
| Phase 3 | DI adapters | Algorithm injection for testing |

---

## Ports & Services

| Service | Port | Protocol |
|---------|------|----------|
| MCP API | 3003 | HTTP/JSON-RPC |
| Fresh Dashboard | 8081 | HTTP |
| PostgreSQL | 5432 | PostgreSQL |
| Grafana | 3000 | HTTP |
| Prometheus | 9091 | HTTP |
| Loki | 3100 | HTTP |
| OTEL Collector | 4318 | OTLP/HTTP |

---

## Scalability Considerations

### Current (Single Instance)

- PGlite embedded for local development
- PostgreSQL for production
- In-memory graph (Graphology)
- Single-process event bus

### Future (Multi-Instance)

- PostgreSQL with read replicas
- Redis for distributed events
- Vector index in PostgreSQL (pgvector)
- Horizontal scaling via load balancer
