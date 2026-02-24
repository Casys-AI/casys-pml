# Architecture Overview - Casys PML

_Updated: 2026-02-24_

## Executive Summary

**Casys PML (Procedural Memory Layer)** est un gateway MCP intelligent qui découvre des outils
sémantiquement, exécute des workflows en parallèle, et apprend de chaque exécution via un pipeline
GRU + SHGAT.

### Problèmes Résolus

1. **Context Saturation** — Les schémas d'outils consomment 30-50% de la fenêtre de contexte LLM
2. **Sequential Latency** — Les workflows multi-outils s'exécutent séquentiellement

### Solution

PML expose 3 meta-tools intelligents au lieu de proxier tous les outils :

| Tool | Description |
|------|-------------|
| `pml:discover` | Recherche hybride sémantique + graph + GRU prediction |
| `pml:execute` | Exécution unifiée : intent, DAG, code, ou capability |
| `pml:admin` | Gestion registry, sync tools, health |

**Résultat** : Utilisation du contexte < 5%. Tâches indépendantes en parallèle.

---

## System Architecture

### High-Level

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENTS                                        │
│  Claude Code │ AI Agents │ pml CLI (packages/pml) │ Playground Agent     │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ MCP (stdio + HTTP/SSE)
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    PML GATEWAY SERVER (src/)                              │
│                                                                          │
│  ┌─── PRESENTATION ──────────────────────────────────────────────────┐  │
│  │  MCP Gateway    │  Fresh Dashboard (:8081)  │  Feed SSE (:3004)   │  │
│  │  Handlers       │  Landing V2, Islands      │  Viewers (_meta.ui) │  │
│  └─────────────────┴───────────────────────────┴─────────────────────┘  │
│                               │                                          │
│  ┌─── APPLICATION (use-cases/) ──────────────────────────────────────┐  │
│  │  ExecuteDirect │ DiscoverTools │ SearchCapabilities │ ExecuteCode  │  │
│  │  AbortWorkflow │ ReplanWorkflow │ GetSuggestion │ AdminUseCase    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                               │                                          │
│  ┌─── DOMAIN (interfaces/) ──────────────────────────────────────────┐  │
│  │  ICapabilityRepository │ IDAGExecutor │ IGraphEngine               │  │
│  │  IMCPClientRegistry │ IStreamOrchestrator │ IDecisionStrategy      │  │
│  │  IDecisionLogger │ ISandboxExecutor │ IToolDiscovery               │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                               │                                          │
│  ┌─── INFRASTRUCTURE ────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │  │
│  │  │ GraphRAG │  │   DAG    │  │ Sandbox  │  │ Events   │          │  │
│  │  │          │  │ Executor │  │  (RPC)   │  │ & Feed   │          │  │
│  │  │ • SHGAT  │  │          │  │          │  │          │          │  │
│  │  │ • GRU    │  │ • 2-Level│  │ • Zero   │  │ • SSE    │          │  │
│  │  │ • Vector │  │ • Fusion │  │   Perms  │  │ • Broad- │          │  │
│  │  │ • Graph  │  │ • HIL    │  │ • PII    │  │   cast   │          │  │
│  │  │ • Local α│  │ • AIL    │  │ • RPC    │  │ • OTEL   │          │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘          │  │
│  │                                                                    │  │
│  │  ┌──────────────────────────────────────────────────────────┐     │  │
│  │  │                    DATA LAYER                              │     │  │
│  │  │  PGlite (dev) │ PostgreSQL (prod) │ Deno KV │ BGE-M3     │     │  │
│  │  └──────────────────────────────────────────────────────────┘     │  │
│  │                                                                    │  │
│  │  ┌──────────────────────────────────────────────────────────┐     │  │
│  │  │                  DI Container (diod)                       │     │  │
│  │  │  bootstrap.ts → adapters/ → abstract class tokens          │     │  │
│  │  └──────────────────────────────────────────────────────────┘     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│    lib/std       │ │    lib/server    │ │    lib/syson     │
│   120+ mini-     │ │  @casys/mcp-    │ │   SysON v2       │
│   tools          │ │  server (0.9.0) │ │   24 MCP tools   │
└──────────────────┘ └──────────────────┘ └──────────────────┘
                     ┌──────────────────┐ ┌──────────────────┐
                     │   lib/erpnext    │ │    lib/plm       │
                     │  @casys/mcp-    │ │   4 PLM BOM      │
                     │  erpnext (0.1.8)│ │   tools           │
                     └──────────────────┘ └──────────────────┘
```

### Clean Architecture Layers

```
src/
├── domain/
│   └── interfaces/              # Contrats purs (I*Repository, I*Executor)
│
├── application/
│   └── use-cases/               # Business operations (UseCaseResult<T>)
│       ├── shared/              # UseCaseResult<T>, UseCaseError
│       ├── execute/             # ExecuteDirectUseCase (intent/code/cap)
│       ├── code/                # ExecuteCodeUseCase
│       ├── capabilities/        # Search, Get, Suggest
│       ├── workflows/           # Abort, Replan
│       └── discover/            # DiscoverTools, DiscoverCapabilities
│
├── infrastructure/
│   ├── di/
│   │   ├── container.ts         # DI container (diod)
│   │   ├── bootstrap.ts         # Production wiring
│   │   ├── testing.ts           # Test mocks
│   │   └── adapters/            # Wrap implementations → interfaces
│   │
│   └── patterns/                # Builder, Factory, Visitor, Strategy, Template
```

**Règle clé** : Use cases retournent `UseCaseResult<T>` — jamais throw. Dependencies via interfaces
(domain/), implémentations dans infrastructure/.

---

## Core Subsystems

### 1. MCP Gateway (`src/mcp/`)

Point d'entrée principal pour les agents LLM.

```
┌─────────────────────────────────────────────────────────────────┐
│                       MCP Gateway                                │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  Handler Facade                          │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │    │
│  │  │ Discover │  │ Execute  │  │  Admin   │              │    │
│  │  │ Handler  │  │ Handler  │  │ Handler  │              │    │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘              │    │
│  └───────┼─────────────┼─────────────┼─────────────────────┘    │
│          │             │             │                           │
│  ┌───────▼─────────────▼─────────────▼─────────────────────┐    │
│  │              MCP Registry Service                        │    │
│  │   Tool sync │ Schema hash │ FQDN resolution              │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                        │
│  ┌──────────────────────▼──────────────────────────────────┐    │
│  │              Connection Pool (stdio + HTTP)              │    │
│  │   lib/std │ lib/server │ lib/syson │ lib/erpnext │ ...  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Responsabilités:**
- 3 meta-tools (discover, execute, admin) + 8 legacy (deprecated)
- MCP Registry avec schema hash pour détecter les changements
- FQDN resolution : `org.project.namespace.action.hash`
- Routage client/server (`config/mcp-routing.json`)

### 2. GraphRAG Engine (`src/graphrag/`)

Moteur de recherche hybride sémantique + graph + ML.

```
┌─────────────────────────────────────────────────────────────────┐
│                      GraphRAG Engine                             │
│                                                                  │
│  ┌───────────────────────────────────────────────────────┐      │
│  │                   Algorithms                           │      │
│  │                                                        │      │
│  │  ┌──────────────┐   ┌──────────────┐                  │      │
│  │  │   SHGAT      │   │     GRU      │                  │      │
│  │  │  K-head      │   │  Inference   │                  │      │
│  │  │  PreserveDim │   │  Pure JS     │                  │      │
│  │  │  V2V + MP    │   │  Beam Search │                  │      │
│  │  │  BLAS FFI    │   │  918 tools   │                  │      │
│  │  └──────────────┘   └──────────────┘                  │      │
│  │                                                        │      │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │      │
│  │  │ Spectral │ │ Adamic-  │ │ Thompson │ │ Louvain  │ │      │
│  │  │ Cluster  │ │ Adar     │ │ Sampling │ │ Communit │ │      │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │      │
│  └───────────────────────────────────────────────────────┘      │
│                              │                                   │
│  ┌───────────────────────────▼───────────────────────────┐      │
│  │                Local Alpha Mixer                       │      │
│  │   α ∈ [0.5, 1.0] — graph trust vs semantic only       │      │
│  └───────────────────────────────────────────────────────┘      │
│                              │                                   │
│  ┌───────────────────────────▼───────────────────────────┐      │
│  │           Graph Store (Graphology + PostgreSQL)        │      │
│  └───────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

**Sous-systèmes clés:**

| Composant | Fichiers | Description |
|-----------|----------|-------------|
| **SHGAT** | `algorithms/shgat/` | K-head attention, PreserveDim d=1024, V2V + MP phases, BLAS FFI |
| **GRU** | `algorithms/gru/` | Inference pure JS, beam search α=0.7, structural bias (Jaccard + bigram) |
| **Local Alpha** | `local-alpha.ts` | Heat diffusion, α adaptatif par zone du graphe (ADR-048) |
| **Thompson** | `learning/thompson-threshold.ts` | Beta(α,β) per-tool, risk categories (ADR-049) |
| **Spectral** | `spectral-clustering.ts` | K-means++ sur vecteurs propres, DAG suggester |

**Rôles distincts GRU vs SHGAT:**
- **GRU** = prédit le prochain tool (L0 seulement). GRU-first >> SHGAT-first pour le 1er outil.
- **SHGAT** = scoring, enrichissement vocabulary, structure graph. Meilleur en beam search et au-delà du 1er outil.

### 3. DAG Execution Engine (`src/dag/`)

Exécution parallèle de workflows avec Two-Level DAG.

```
┌─────────────────────────────────────────────────────────────────┐
│                    DAG Execution Engine                          │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │             Two-Level DAG Architecture                    │    │
│  │                                                          │    │
│  │  ┌─────────────────────┐  ┌─────────────────────────┐   │    │
│  │  │   LOGICAL DAG       │  │    PHYSICAL DAG         │   │    │
│  │  │   (SHGAT learning)  │  │    (fused execution)    │   │    │
│  │  │                     │  │                         │   │    │
│  │  │   Chaque tool = 1   │  │   Sequential tasks     │   │    │
│  │  │   noeud (traçable)  │  │   fusionnées en blocs  │   │    │
│  │  └─────────────────────┘  └─────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              ControlledExecutor                          │    │
│  │                                                          │    │
│  │  Layer 0    Layer 1    Layer 2    Layer 3               │    │
│  │  ┌─────┐   ┌─────┐    ┌─────┐    ┌─────┐               │    │
│  │  │ T1  │   │ T2  │    │ T4  │    │ T5  │               │    │
│  │  └──┬──┘   │ T3  │    └──┬──┘    └─────┘               │    │
│  │     │      └──┬──┘       │                              │    │
│  │  ───┴─────────┴──────────┴───────────────► Time         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌───────────────────────────▼─────────────────────────────┐    │
│  │                   HIL / AIL                              │    │
│  │   PRE-EXECUTION checkpoints │ approval_required: true    │    │
│  │   Claude UI: [Continue] [Always] [Abort]                 │    │
│  │   Expiration: 5 minutes timeout                          │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- Two-Level DAG : Logical (apprentissage) + Physical (exécution fusionnée)
- Layer-based parallelism avec ControlledExecutor
- Sequential fusion : tasks pures sans MCP calls fusionnées automatiquement
- Checkpoint/resume pour workflows interruptibles
- HIL checkpoints **PRE-EXECUTION** (jamais après)

### 4. Sandbox System (`src/sandbox/`)

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
│  │  - execute()    │              │  │ - Zero Perms    │    │   │
│  │  - buildTask    │              │  │ - PII Detection │    │   │
│  │    Results()    │              │  │ - Resource Limit│    │   │
│  └─────────────────┘              │  └─────────────────┘    │   │
│                                   └─────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  Trace Pipeline                          │    │
│  │  task_results (JSONB) = single source of truth           │    │
│  │  • Tools (FQDN) • Capabilities (FQDN) • Loops (bodyTools)│   │
│  │  executed_path (text[]) = DEPRECATED                     │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Security Features:**
- Zero-permission par défaut (permission profiles dans deno.json)
- PII detection automatique
- Resource limits (CPU, memory, time)
- Isolated subprocess (no shared state)
- RPC trace capture pour chaque opération

### 5. Capability System (`src/capabilities/`)

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
│  │  │ (code, DAG,  │    │ (naming,FQDN)│                   │    │
│  │  │  intent_emb) │    │              │                   │    │
│  │  └──────────────┘    └──────────────┘                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌───────────────────────────▼─────────────────────────────┐    │
│  │              StaticStructureBuilder (SWC)               │    │
│  │   AST Analysis → Static DAG Structure → code:* tasks    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌───────────────────────────▼─────────────────────────────┐    │
│  │                 Trace Path Builder                       │    │
│  │   task_results → normalizeToolId() → clean sequences     │    │
│  │   code-generator.ts → capabilityFqdn in trace events     │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**FQDN Convention (ADR-068):**
```
<org>.<project>.<namespace>.<action>.<hash>
└──────────────────────────────────────────┘
        local.default.fs.read_json.a7f3

Stocké tel quel en DB (JAMAIS normaliser à l'écriture).
Normalisé à la lecture : normalizeToolId() → "fs:read_json"
```

**Hiérarchie des niveaux:**
- **L0** = Tools (ex: `std:psql_query`)
- **L1** = Capabilities avec tools children (ex: `meta:personWithAddress`)
- **L2** = Capabilities de capabilities
- Tous les niveaux ont des FQDN de même format

### 6. Feed & MCP Apps UI (`src/server/`, `src/services/`)

Système de visualisation en temps réel des résultats d'exécution.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Feed & UI System                            │
│                                                                  │
│  ┌──────────────┐       ┌──────────────┐       ┌────────────┐  │
│  │ Tool Result  │──────▶│ _meta.ui     │──────▶│  Viewer    │  │
│  │ + _meta.ui   │       │ extraction   │       │  (iframe)  │  │
│  └──────────────┘       └──────────────┘       └────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Feed Server (:3004)                     │   │
│  │   /feed     = SSE stream                                  │   │
│  │   /ui/{name} = viewer HTML                                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Format _meta.ui:                                                │
│  { resourceUri?, html?, context?, emits?, accepts? }             │
│  _viewerOverride dans result → iframe viewer custom              │
└─────────────────────────────────────────────────────────────────┘
```

### 7. Telemetry (`src/telemetry/`)

```
┌─────────────────────────────────────────────────────────────────┐
│                      Telemetry (ADR-054)                         │
│                                                                  │
│  ┌─────────────────┐                                            │
│  │ IDecisionLogger │ ◄── Port interface (domain/)               │
│  └────────┬────────┘                                            │
│           │                                                      │
│  ┌────────▼────────┐    ┌──────────────────┐                    │
│  │ TelemetryAdapter│    │ NoOpDecisionLogger│                   │
│  │ (DB + OTEL)     │    │ (tests)          │                   │
│  └─────────────────┘    └──────────────────┘                    │
│                                                                  │
│  Sentry (errors) │ Native Deno OTEL (spans) │ Logger (structured)│
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flows

### Discovery Flow

```
User Intent: "read JSON config files"
           │
           ▼
    ┌─────────────┐
    │pml:discover  │
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │ VectorSearch│ ── BGE-M3 Embeddings (1024-dim)
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │  GraphRAG   │ ── SHGAT scoring + Local Alpha
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │   GRU       │ ── Next-tool prediction (beam search)
    │  Inference  │
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │  Results    │ ── Fused score = semantic × graph × GRU
    └─────────────┘
```

### Execution Flow

```
pml:execute({ intent, code })
           │
    ┌──────▼──────┐
    │ Static      │ ── SWC AST analysis
    │ Analysis    │
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │ Logical DAG │ ── Build from AST (for SHGAT learning)
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │Physical DAG │ ── Fuse sequential tasks
    │ Optimizer   │
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │ Controlled  │ ── Execute layers in parallel
    │ Executor    │ ── HIL checkpoints PRE-EXECUTION
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │ Trace       │ ── task_results (JSONB) = single source
    │ Capture     │ ── capabilities visible as FQDN
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │ Post-Exec   │ ── SHGAT enrichment (V2V + MP)
    │ Learning    │ ── GRU training data (subprocess)
    └─────────────┘
```

### Client/Server Flow (packages/pml → src/)

```
pml CLI (user machine)          PML Server (cloud/local)
┌──────────────┐                ┌──────────────┐
│ pml execute  │   stdio/HTTP   │              │
│              │───────────────▶│  Analyze +   │
│              │                │  Build DAG   │
│              │◀───────────────│              │
│              │  code + FQDN   │              │
│  ┌────────┐  │    map         │              │
│  │Sandbox │  │                │              │
│  │Worker  │  │                │              │
│  │(local) │  │   RPC calls    │  Route to    │
│  │        │──────────────────▶│  MCP servers │
│  └────────┘  │                │              │
└──────────────┘                └──────────────┘

Client tools (filesystem, git) = local execution
Server tools (tavily, json) = cloud execution
Config: config/mcp-routing.json
```

---

## Database Schema (Core Tables)

```sql
-- Capabilities (code patterns)
workflow_pattern (
  pattern_id UUID PRIMARY KEY,
  code_snippet TEXT,
  code_hash VARCHAR(64) UNIQUE,
  dag_structure JSONB,          -- tools_used en FQDN canonical
  task_results JSONB,           -- séquences d'exécution (source unique ADR-069)
  intent_embedding VECTOR(1024),
  success_rate FLOAT,
  usage_count INT,
  hierarchy_level INT DEFAULT 0 -- 0=tool, 1+=capability
)

-- FQDN naming
capability_records (
  id VARCHAR(255) PRIMARY KEY,  -- FQDN: org.project.namespace.action.hash
  org VARCHAR(100),
  project VARCHAR(100),
  namespace VARCHAR(100),
  action VARCHAR(100),
  workflow_pattern_id UUID REFERENCES workflow_pattern,
  hash VARCHAR(8)
)

-- Execution traces (learning data)
execution_trace (
  id UUID PRIMARY KEY,
  workflow_pattern_id UUID,
  executed_path TEXT[],          -- DEPRECATED (18% corruption historique)
  task_results JSONB,           -- SOURCE UNIQUE (0% corruption)
  intent_embedding VECTOR(1024),
  success BOOLEAN,
  duration_ms INT,
  parent_trace_id UUID          -- hiérarchie cap→subcap
)

-- Tool graph
tool_dependency (
  source_tool VARCHAR(255),
  target_tool VARCHAR(255),
  edge_type VARCHAR(50),        -- sequence, provides, co_occurrence
  weight FLOAT,
  PRIMARY KEY (source_tool, target_tool, edge_type)
)

-- Tool registry
pml_registry (
  id VARCHAR(255) PRIMARY KEY,  -- FQDN
  server_name VARCHAR(100),
  tool_name VARCHAR(100),
  schema_hash VARCHAR(16),      -- détection changements
  embedding VECTOR(1024)
)

-- ML model weights
gru_params (
  id SERIAL PRIMARY KEY,
  weights JSONB,                -- 25MB, vocab embedded
  config JSONB,
  created_at TIMESTAMP
)

shgat_params (
  id SERIAL PRIMARY KEY,
  params JSONB,
  config JSONB,
  created_at TIMESTAMP
)
```

**48 migrations** dans `src/db/migrations/` (de 002 à 051).

---

## Key Design Decisions

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-035 | Sandbox via Deno subprocess | Zero-permission security by default |
| ADR-036 | BroadcastChannel for events | Cross-worker/cross-tab communication |
| ADR-048 | Heat Diffusion local alpha | Context-aware graph trust weighting |
| ADR-049 | Thompson Sampling thresholds | Adaptive per-tool confidence |
| ADR-054 | IDecisionLogger abstraction | Decouple telemetry from use cases |
| ADR-055 | SHGAT PreserveDim d=1024 | No lossy compression in message passing |
| ADR-058 | BLAS FFI acceleration | Native matrix ops for SHGAT/GRU |
| ADR-068 | FQDN canonical on write | Normalize on read, preserve info on write |
| ADR-069 | task_results single source | Deprecate corrupted executed_path |

---

## Ports & Services

| Service | Port | Protocol |
|---------|------|----------|
| MCP API (gateway) | 3003 | HTTP/JSON-RPC + stdio |
| Fresh Dashboard | 8081 | HTTP |
| Feed SSE | 3004 | HTTP/SSE |
| PostgreSQL (prod) | 5432 | PostgreSQL |
| SysON (optional) | 8180 | HTTP |

---

## Library Ecosystem

| Package | Path | Version | Purpose |
|---------|------|---------|---------|
| `@casys/mcp-server` | `lib/server/` | 0.9.0 | MCP server framework (npm+JSR) |
| `@casys/mcp-erpnext` | `lib/erpnext/` | 0.1.8 | ERPNext integration, 120 tools, 7 viewers (npm+JSR) |
| `@casys/mcp-bridge` | `lib/mcp-apps-bridge/` | 0.2.0 | MCP Apps → Telegram/LINE bridge (npm+JSR) |
| `@casys/mcp-syson` | `lib/syson/` | 0.1.0 | SysML v2 modeling (local) |
| `@casys/mcp-plm` | `lib/plm/` | 0.1.0 | PLM BOM tools (local) |
| `@casys/mcp-sim` | `lib/sim/` | 0.1.0 | Simulation engine (local) |
| `@casys/mcp-onshape` | `lib/onshape/` | 0.1.0 | Onshape CAD, GLTF export (local) |
| GRU training | `lib/gru/` | 0.2.0 | Training scripts + poids prod 25MB |
| SHGAT-TF | `lib/shgat-tf/` | - | TensorFlow training |

**Convention:** libs publiées ont leur propre CI, deno.json, README. Libs locales utilisent
import maps dans `deno.json` racine.

---

## Scalability Considerations

### Current (Single Instance)

- PGlite embedded pour développement local
- PostgreSQL Docker pour production
- In-memory graph (Graphology) rechargé au boot
- GRU weights chargés depuis DB ou fichier JSON au boot
- Single-process event bus (BroadcastChannel)

### Future (Multi-Instance)

- PostgreSQL avec read replicas
- Redis/NATS pour distributed events
- Vector index natif PostgreSQL (pgvector)
- GRU inference stateless (weights en shared storage)
- Horizontal scaling via load balancer sur MCP API
