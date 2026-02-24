---
project_name: "Procedural Memory Layer (PML)"
user_name: "Erwan"
date: "2025-12-21"
sections_completed: [
  "technology_stack",
  "language_rules",
  "framework_rules",
  "testing_rules",
  "code_quality",
  "workflow_rules",
  "critical_rules",
  "hypergraph_algorithms",
  "minitools",
  "adaptive_learning",
  "clean_architecture",
  "dependency_injection",
  "jsr_package_routing",
  "gru_inference",
  "feed_mcp_apps",
  "trace_data_rules",
  "telemetry",
  "library_boundary",
]
status: complete
last_scan: "exhaustive"
last_update: "2026-02-24"
rule_count: 260
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in
this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

### Runtime & Language

- **Deno 2.x** — Runtime principal (pas Node.js)
- **TypeScript** — Strict mode obligatoire

### Frontend

- **Fresh ^2.0.0** — Framework web Deno (SSR)
- **Preact ^10.27.0** — Bibliothèque UI (pas React)
- **@preact/signals ^2.5.1** — State management réactif
- **TailwindCSS ^4.1.10** — Styling (v4 syntax)
- **Vite ^7.1.3** — Build tool

### Backend & Data

- **PGlite 0.3.14** — PostgreSQL WASM (local-first, dev/embedded)
- **PostgreSQL 16+** — Via Docker pour production/cloud
- **Deno KV** — Key-value store pour sessions, cache, OAuth tokens
- **Drizzle ORM ^0.45.1** — TypeScript ORM
- **@huggingface/transformers 3.7.6** — Embeddings BGE-M3 locaux
- **Architecture Open Core** — Version cloud en préparation (multi-tenant ready)
- **Hono ^4** — HTTP routing (feed server, API lightweight)

### MCP & Graphes

- **@modelcontextprotocol/sdk ^1.15.1** — Protocole MCP (Anthropic)
- **@modelcontextprotocol/ext-apps ^1.0.1** — MCP Apps SDK (UI resources, viewers)
- **@smithery/sdk ^2.1.0** — Registry MCP servers
- **Graphology ^0.25.4** — Structure de graphe
- **ml-matrix ^6.11.1** — Opérations matricielles (eigendecomposition)

### AI & LLM

- **openai ^6.18.0** — SDK OpenAI pour playground tunnel agent (gpt-5-mini)
- **xstate ^5.19.2** — State machines (workflow orchestration)
- **diod ^3.0.0** — Dependency injection container

### Graph Algorithms (Non-SHGAT)

> **Note:** Ces algos sont utilisés pour clustering, suggestions, local-alpha — **PAS** pour le
> scoring SHGAT K-head.

- **Spectral Clustering** — `src/graphrag/spectral-clustering.ts` — dag-suggester, clustering
- **PageRank** — `src/graphrag/graph-engine.ts` — Centralité, metrics
- **Adamic-Adar** — `src/graphrag/algorithms/adamic-adar.ts` — Suggestions, confidence scoring
- **Louvain** — via graphology-communities-louvain — Community detection
- **Heat Diffusion** — `src/graphrag/local-alpha.ts` — Local alpha adaptif (ADR-048)
- **Thompson Sampling** — `src/learning/thompson-threshold.ts` — Thresholds adaptatifs (ADR-049)
- **K-means++** — Clustering sur vecteurs propres
- **Dijkstra** — via graphology-shortest-path

### SHGAT Modular Architecture (`src/graphrag/algorithms/shgat/`)

- **graph/** — Construction de graphe, matrices d'incidence
- **initialization/** — Initialisation des paramètres (W_q, W_k per head)
- **message-passing/** — Phases V→E, E→E, E→V, **V→V** pour n-SuperHyperGraph
- **message-passing/multi-level-orchestrator.ts** — Passes upward/downward avec residual connections
- **scoring/** — K-head attention unifié (capabilities, tools, operations)
- **training/** — K-head trainer avec backprop sur W_q, W_k + **batched-khead**
- **utils/** — Softmax, cosine similarity, opérations matricielles
- **utils/blas-ffi.ts** — Accélération BLAS native (ADR-058)
- **Production** — K-head: `score = sigmoid(Q·K/√d)`, fusion = moyenne
- **PreserveDim (ADR-055)** — Garde d=1024 tout au long du message passing (plus de compression 64-dim)
- **Dual-path scoring** — Semantic (1024-dim) + Structure (64-dim) avec Local Alpha mixing

### GRU Inference Engine (`src/graphrag/algorithms/gru/`)

- **gru-inference.ts** — Forward pass pure JS+BLAS (0 dépendance TensorFlow.js)
- **gru-loader.ts** — Chargement poids depuis DB (`gru_params`) ou fichier JSON
- **types.ts** — `GRUWeights`, `GRUVocabulary`, `GRUConfig`, `IGRUInference`
- **spawn-training.ts** — Training non-bloquant via subprocess Deno
- **12 stages forward** — input_proj → GRU cell → intent/cap/composite projections → term_hidden → termination → fusion → emb_proj → similarity → structural bias
- **Beam search** — Décodage avec length normalization (α=0.7 default)
- **Poids prod** — `lib/gru/gru-weights-prod.json` (25MB, vocab embarqué, 918 tools)
- **Vocab = tools-only** — Les capabilities ne sont PAS des targets GRU

### MiniTools Library (`lib/std/`)

- **120+ outils internes** — Organisés en 30+ modules thématiques
- **MiniToolsClient** — Classe d'accès unifiée aux mini-tools
- **Catégories System** — docker, git, network, process, archive, ssh, kubernetes, database, media,
  cloud, sysinfo, packages, text
- **Catégories Data** — algo, collections, crypto, datetime, format, http, json, math, transform,
  validation, vfs
- **Nouveaux modules** — string, path, faker, color, geo, qrcode, resilience, schema, diff

### Client Package (`@casys/pml` - `packages/pml/`)

- **CLI léger** — Binaire standalone pour exécution locale
- **Client-side sandbox** — `SandboxWorker` pour exécution isolée côté client
- **RPC protocol** — Communication avec serveur via `rpc_call`/`rpc_result`
- **execute_locally flow** — Serveur analyse, retourne code + FQDN map, client exécute
- **Hybrid routing** — Client tools (filesystem, shell) local, server tools (tavily) cloud
- **Documentation** — `packages/pml/docs/ARCHITECTURE.md`, `MODULES.md`, `API.md`

### Published Libraries (`lib/`)

| Package | Path | Version | Distribution |
|---------|------|---------|-------------|
| `@casys/mcp-server` | `lib/server/` | 0.9.0 | npm + JSR |
| `@casys/mcp-erpnext` | `lib/erpnext/` | 0.1.8 | npm + JSR |
| `@casys/mcp-bridge` | `lib/mcp-apps-bridge/` | 0.2.0 | npm + JSR |

### Local Libraries (`lib/`)

| Package | Path | Description |
|---------|------|-------------|
| `@casys/mcp-syson` | `lib/syson/` | SysON v2 integration (24 MCP tools) |
| `@casys/mcp-plm` | `lib/plm/` | PLM BOM tools (4 tools) |
| `@casys/mcp-sim` | `lib/sim/` | Simulation engine |
| `@casys/mcp-onshape` | `lib/onshape/` | Onshape CAD (GLTF export) |
| GRU training | `lib/gru/` | Training scripts + poids prod |
| SHGAT-TF | `lib/shgat-tf/` | Training TensorFlow |
| SHGAT notebooks | `lib/shgat-for-gru/` | Analysis notebooks |

### Compilation & Communication

- **SWC** — via Deno, compilation TS + parsing AST (remplace ts-morph)
- **Broadcast Channel** — Communication inter-workers (sandbox ↔ main)
- **SSE** — Server-Sent Events pour dashboard temps réel

### CLI & Utils

- **@cliffy/command 1.0.0-rc.8** — CLI framework
- **@std/assert, @std/dotenv, @std/fs, @std/yaml** — Deno std lib

### Configuration Files (`config/`)

- **dag-scoring.yaml** — Scoring, thresholds, weights, reliability (ADR-022, 026, 038, 048)
- **local-alpha.yaml** — Alpha adaptatif, cold start, heat diffusion (ADR-048)
- **spectral-clustering.yaml** — Clustering biparti, edge weights, PageRank (Story 7.4, ADR-042)
- **mcp-permissions.yaml** — Permissions et risk categories MCP servers (ADR-035)
- **workflow-templates.yaml** — Templates de workflows DAG
- **speculation_config.yaml** — Config spéculation legacy (supplanté par ADR-049)

### Version Constraints

- **Preact, pas React** — JSX doit utiliser `jsxImportSource: "preact"`
- **TailwindCSS v4** — Syntaxe différente de v3
- **PGlite 0.3.14** — Version spécifique pour compatibilité vector extension (dev/embedded)
- **PostgreSQL 16+ (Docker)** — Production, supporte pgvector nativement

### ADRs (Architecture Decision Records)

> 51+ ADRs dans `docs/adrs/`. Notables récents :

- **ADR-054** — IDecisionLogger abstraction (telemetry port/adapter)
- **ADR-055** — SHGAT PreserveDim (keep d=1024)
- **ADR-056** — InfoNCE contrastive training
- **ADR-057** — Message passing backward training
- **ADR-058** — BLAS FFI matrix acceleration
- **ADR-068** — FQDN canonical format (normalize on read, not write)
- **ADR-069** — task_results as single source (deprecate executed_path)

---

## Critical Implementation Rules

### Language-Specific Rules (TypeScript/Deno)

#### Configuration TypeScript

- **Strict mode obligatoire** — `strict: true`, `noImplicitAny: true`
- **Pas de variables inutilisées** — `noUnusedLocals: true`, `noUnusedParameters: true`
- **JSX Preact** — `jsx: "react-jsx"`, `jsxImportSource: "preact"`

#### Imports & Modules

- **Imports JSR** — `@std/*` pour la bibliothèque standard Deno (ex: `@std/assert`)
- **Imports NPM** — Préfixe `npm:` pour packages npm (ex: `npm:graphology`)
- **Extensions obligatoires** — Toujours `.ts` dans les imports (ex: `./utils.ts`)
- **Pas de CommonJS** — Utiliser ESM uniquement (`import/export`)

#### Databases (Dual-Mode)

- **PGlite / PostgreSQL** — PGlite (dev/embedded) ou PostgreSQL Docker (prod) pour données
  persistantes (GraphRAG, capabilities, workflows)
- **Deno KV** — Key-value store pour sessions, cache, OAuth tokens
- **Architecture Open Core** — Version cloud en préparation, garder le code compatible multi-tenant

#### Async/Await Patterns

- **Toujours async/await** — Pas de `.then()/.catch()` chaînés
- **Top-level await supporté** — Deno supporte nativement
- **Gestion d'erreurs** — `try/catch` avec types d'erreur explicites

#### Naming Conventions

- **camelCase** pour variables, fonctions, propriétés d'objets
- **PascalCase** pour types, interfaces, classes
- **SCREAMING_SNAKE_CASE** pour constantes globales
- **kebab-case** pour noms de fichiers (ex: `health-checker.ts`)

#### Error Handling

- **Classes d'erreur custom** dans `src/errors/` — Utiliser `CAIError`, `ValidationError`, etc.
- **Pas de `any` dans les catch** — Typer les erreurs explicitement
- **Logging structuré** — Utiliser `src/telemetry/logger.ts`

### Framework-Specific Rules

#### Fresh 2.0 (SSR Framework)

- **Routes dans `src/web/routes/`** — Convention de fichiers pour routing
- **Middleware** — `_middleware.ts` pour auth et guards
- **Islands architecture** — Composants interactifs isolés pour hydratation partielle
- **API routes** — `routes/api/` pour endpoints REST

#### Preact (UI Library)

- **Pas de React** — Utiliser `preact` et `preact/hooks`, jamais `react`
- **Signals pour state** — `@preact/signals` au lieu de useState pour state global
- **JSX runtime** — Configuré via `jsxImportSource: "preact"` dans deno.json
- **Hooks identiques** — `useState`, `useEffect`, etc. fonctionnent comme React

#### MCP Gateway (Meta-Tools Pattern)

- **Meta-tools uniquement** — Exposer `pml:search_tools`, `pml:execute_dag`, etc.
- **Pas de proxy direct** — Ne jamais exposer les outils MCP sous-jacents directement
- **DAG workflows** — Orchestration parallèle avec résolution de dépendances
- **Intent-based execution** — Support des workflows par intention naturelle

#### GraphRAG Engine

- **Graphology** — Structure de graphe en mémoire
- **Adamic-Adar** — Algorithme pour recommandations d'outils
- **Louvain communities** — Clustering pour suggestions proactives
- **PageRank** — Sizing des nœuds dans la visualisation

#### GRU Inference Engine (`src/graphrag/algorithms/gru/`)

- **Pure JS + BLAS FFI** — Pas de TensorFlow.js. Forward pass implémenté manuellement
- **BLAS FFI optionnel** — Accélération native si disponible, fallback JS sinon
- **Beam search** — `beamSearch(input, beamWidth, maxLen)` avec length normalization α=0.7
- **Structural bias** — Jaccard matrix + bigram matrix appliqués au scoring final
- **Poids chargés au boot** — `gru-loader.ts` charge depuis DB (`gru_params`) ou fichier JSON
- **Vocab = tools-only (918)** — Les capabilities ne sont PAS des targets GRU (dead weight)
- **JAMAIS prédire des capabilities** — Le GRU prédit le prochain tool (L0), pas les caps (L1/L2)
- **GRU-first >> SHGAT-first** — Pour le 1er outil, GRU est meilleur. SHGAT = scoring/vocabulary

#### Sandbox Execution

- **Worker isolé** — Code exécuté dans subprocess Deno
- **Permissions limitées** — Pas de réseau, pas de subprocess
- **PII detection** — Tokenisation automatique des données sensibles
- **MCP tool injection** — Outils injectés via intent discovery

#### Feed & MCP Apps UI Pattern

- **`_meta.ui` sibling de `content`** — Extraire depuis `rpc.result._meta`, PAS depuis `content`
- **Format UI** — `{ resourceUri?, html?, context?, emits?, accepts? }`
- **`_viewerOverride`** — Inclure dans `result` pour tools externes → iframe viewer custom
- **Feed SSE** — Port :3004, `/feed`=SSE, `/broadcast`=POST relay, `/ui/{name}`=viewer HTML
- **Rebuild viewer = relance PML** — Après `vite build` d'un viewer, PML doit redémarrer
- **Tester via PML execute** — JAMAIS curl/broadcast manuels pour tester les viewers

#### Playground Tunnel Agent

- **Route** — POST `/api/playground/chat` (`src/web/routes/api/playground/chat.ts`)
- **LLM** — OpenAI gpt-5-mini (gpt-5-nano trop faible en tool calling)
- **`tool_choice: "required"` au 1er tour** — Sinon le LLM génère du texte au lieu d'appeler un tool
- **Problème ouvert** — `code:*` tasks du sandbox déclenchent HIL (routées comme MCP tools)

#### Telemetry (ADR-054)

- **IDecisionLogger** — Interface port dans `src/telemetry/decision-logger.ts`
- **TelemetryAdapter** — Implémentation production (DB + OTEL natif Deno)
- **NoOpDecisionLogger** — Pour tests
- **Use cases dépendent de IDecisionLogger** — Jamais de dépendance directe sur AlgorithmTracer

#### MiniTools Pattern (`lib/std/`)

- **Import depuis lib/std/mod.ts** —
  `import { MiniToolsClient, getToolByName } from "../../lib/std/mod.ts"`
- **Client par catégorie** — `new MiniToolsClient({ categories: ["json", "crypto"] })`
- **Exécution typée** — `await client.execute("json_parse", { input: data })`
- **Format MCP** — `client.toMCPFormat()` pour exposition via gateway
- **Handler pattern** — Chaque tool a `name`, `description`, `inputSchema`, `handler`

#### Externalized Configuration (`config/`)

- **dag-scoring.yaml** — TOUTES les constantes de scoring externalisées
- **Pas de magic numbers** — Utiliser `DagScoringConfig.load()` pour accéder aux valeurs
- **Sections YAML** — `limits`, `weights`, `thresholds`, `caps`, `reliability`, `defaults`
- **Hot reload supporté** — Config rechargeable sans restart

#### Adaptive Learning (ADR-048, ADR-049)

- **Local Alpha** — Confiance locale par zone du graphe (0.5 dense → 1.0 cold start)
- **Thompson Sampling** — Distribution Beta(α,β) per-tool pour thresholds
- **Risk Categories** — `safe` (0.55), `moderate` (0.70), `dangerous` (0.85)
- **mcp-permissions.yaml** — Source de vérité pour classification risque

### Testing Rules

#### Test Framework

- **Deno.test natif** — Pas Jest, pas Vitest
- **@std/assert** — `assertEquals`, `assertThrows`, `assertRejects`, etc.
- **Async tests** — Support natif des tests async/await

#### Test Organization

- **Tests unitaires** — `tests/unit/` miroir de `src/`
- **Tests d'intégration** — `tests/integration/`
- **Nommage** — `*_test.ts` (underscore, pas hyphen)
- **Structure** — `Deno.test("description", async () => { ... })`

#### Test Patterns

- **Isolation** — Chaque test doit être indépendant
- **Mocks dans `tests/mocks/`** — Filesystem, database, API mocks disponibles
- **Cleanup** — Toujours nettoyer les ressources (DB, fichiers temp)
- **Assertions explicites** — Pas de tests sans assertions

#### Running Tests

- `deno task test` — Tous les tests
- `deno task test:unit` — Tests unitaires seulement
- `deno task test:integration` — Tests d'intégration
- **Flags requis** —
  `--allow-all --unstable-worker-options --unstable-broadcast-channel --unstable-kv`

#### Coverage Target

- **>80% coverage** — Objectif de couverture
- **Tests critiques obligatoires** — DAG executor, sandbox, MCP gateway

### Code Quality & Style Rules

#### Formatting (deno fmt)

- **Largeur ligne** — 100 caractères max
- **Indentation** — 2 espaces (pas de tabs)
- **Point-virgule** — Obligatoire
- **Commande** — `deno task fmt`

#### Linting (deno lint)

- **Rules** — Tag `recommended` activé
- **Exclusions** — `tests/`, `benchmarks/`, `scripts/`, `_bmad/`
- **Commande** — `deno task lint`

#### File Organization

- **src/** — Code source principal (SERVEUR PML)
- **src/dag/** — DAG executor et workflows
- **src/graphrag/** — GraphRAG engine (SHGAT, GRU, graph algorithms)
- **src/graphrag/algorithms/gru/** — GRU inference engine (pure JS+BLAS)
- **src/graphrag/algorithms/shgat/** — SHGAT scoring (K-head attention, message passing)
- **src/sandbox/** — Exécution sécurisée
- **src/mcp/** — Gateway MCP
- **src/web/** — Dashboard Fresh/Preact + Landing V2
- **src/db/** — Migrations et schémas Drizzle (numérotées jusqu'à 051+)
- **src/telemetry/** — Logging, métriques, IDecisionLogger
- **src/learning/** — Thompson Sampling, adaptive thresholds
- **packages/pml/** — SDK/CLI client (binaire standalone)
- **lib/std/** — MiniTools library (120+ outils)
- **lib/** — Librairies satellites (server, erpnext, syson, plm, sim, onshape, gru, shgat)
- **config/** — Configuration externalisée (YAML)

#### Documentation

- **JSDoc minimal** — Seulement pour exports publics complexes
- **Pas de commentaires évidents** — Le code doit être auto-explicatif
- **ADRs** — Décisions architecturales dans `docs/adrs/`
- **JAMAIS `*/` dans un JSDoc** quand c'est dans des backticks — Ferme le bloc commentaire

#### Code Patterns

- **Single responsibility** — Une fonction = une tâche
- **Explicit returns** — Typage explicite des retours de fonctions
- **No magic strings** — Utiliser des constantes ou enums
- **Immutability preferred** — `const` par défaut, éviter mutations

### Architecture Patterns

#### Service Layer Separation (3-Tier)

Strict separation entre handlers (API), services (business logic), et repositories (data).

```
Handler (MCP/HTTP) → Service (Business Logic) → Repository (Data Access)
      ↓                      ↓                         ↓
  Validation          Orchestration              SQL/Queries
  Formatting          Domain Logic               Row Mapping
  Routing             Event Emission             Transactions
```

**Règles:**

- **Handlers** (`src/mcp/handlers/`): Validation input, appel services, formatage output
- **Services** (`src/*/`): Business logic, pas d'accès DB direct, utilise repositories
- **Repositories** (`*-store.ts`, `*-repository.ts`): Data access only, pas de business logic

#### Repository Pattern for Data Access

Toutes les opérations DB passent par des classes repository. Pas de SQL direct dans handlers ou
services.

**Règles:**

- **Repository files** en `*-store.ts` ou `*-repository.ts`
- **Single table/aggregate per repository**
- **Return domain objects**, pas raw rows
- **No business logic** dans repositories — pure CRUD + queries

#### Interface-First Design

Définir interfaces avant implémentations, surtout pour les boundaries cross-module.

**Règles:**

- **Interfaces** dans `types.ts` ou `interfaces.ts` dédié
- **Implementations** importent interfaces, pas classes concrètes
- **Tests** peuvent mocker les interfaces facilement

#### Constructor Injection (Max 5 Dependencies)

Injection de dépendances via constructeur avec limite stricte.

**Règles:**

- **JAMAIS plus de 5 paramètres** dans un constructeur
- Si plus → refactoriser en services composés
- **JAMAIS créer services avec `new`** dans le code métier — utiliser composition

#### Feature Module Pattern (Vertical Slices)

Grouper fonctionnalités par feature, pas par layer technique.

**Règles:**

- Chaque feature folder est self-contained
- `mod.ts` exporte API publique uniquement
- Communication cross-feature via interfaces

#### Project Boundary Rules

- **`src/`** = le serveur PML (le coeur du produit)
- **`packages/pml/`** = le SDK/CLI client (distribué séparément)
- **`lib/`** = librairies satellites — NE PAS confondre avec src/
- **libs publiées** (`lib/server`, `lib/erpnext`, `lib/mcp-apps-bridge`) ont leur propre CI, deno.json, README
- **libs locales** (`lib/syson`, `lib/plm`, `lib/sim`, `lib/onshape`) = import maps dans deno.json racine
- **`lib/gru/`** et **`lib/shgat-*`** = training uniquement, pas de runtime serveur

### Clean Architecture & Dependency Injection (Epic 14 Refactor)

#### Structure 3 Couches

```
src/
├── domain/
│   └── interfaces/          # Contrats purs (I*Repository, I*Executor)
│
├── application/
│   └── use-cases/           # Business operations
│       ├── shared/          # UseCaseResult<T>, UseCaseError
│       ├── code/            # ExecuteCodeUseCase
│       ├── capabilities/    # SearchCapabilitiesUseCase, GetSuggestionUseCase
│       ├── workflows/       # AbortWorkflowUseCase, ReplanWorkflowUseCase
│       └── discover/        # DiscoverCapabilities, DiscoverTools
│
├── infrastructure/
│   ├── di/
│   │   ├── container.ts     # DI container (diod)
│   │   ├── bootstrap.ts     # Production wiring
│   │   ├── testing.ts       # Test mocks
│   │   └── adapters/        # Wrap implementations
│   │
│   └── patterns/            # Builder, Factory, Visitor, Strategy, Template Method
```

#### Dependency Injection (diod)

- **Abstract class tokens** — Interfaces TS effacées au runtime, utiliser abstract classes
- **Container singleton** — `buildContainer()` construit une fois, injecte partout
- **Adapters pattern** — Wrap des implémentations existantes dans `di/adapters/`
- **Bootstrap** — `bootstrapDI()` pour wiring production
- **Testing** — `buildTestContainer()` + `createMock*()` helpers

**Tokens DI Disponibles:**

| Token | Interface | Description |
|-------|-----------|-------------|
| `CapabilityRepository` | `ICapabilityRepository` | Stockage capabilities |
| `DAGExecutor` | `IDAGExecutor` | Exécution DAG |
| `GraphEngine` | `IGraphEngine` | GraphRAG engine |
| `MCPClientRegistry` | `IMCPClientRegistry` | Registry clients MCP |
| `StreamOrchestrator` | `IStreamOrchestrator` | Orchestration streaming |
| `DecisionStrategy` | `IDecisionStrategy` | Stratégie AIL/HIL |

#### Use Cases Pattern

- **Request/Result typés** — `UseCaseResult<T>` avec `success`, `data?`, `error?`
- **Transport-agnostic** — Pas de dépendance HTTP/MCP
- **Interface-based deps** — Toutes deps via interfaces (`ISandboxExecutor`, `IToolDiscovery`)
- **Nommage** — `XxxUseCase` avec méthode `execute(request): Promise<UseCaseResult<T>>`
- **Jamais throw** — Retourner `{ success: false, error: { code, message } }`

#### Design Patterns Implémentés (`infrastructure/patterns/`)

| Pattern | Module | Usage |
|---------|--------|-------|
| **Builder** | `patterns/builder/` | `GatewayBuilder` construction fluente |
| **Factory** | `patterns/factory/` | `GatewayFactory` création centralisée |
| **Visitor** | `patterns/visitor/` | `ASTVisitor` traversée SWC |
| **Strategy** | `patterns/strategy/` | `DecisionStrategy` AIL/HIL |
| **Template Method** | `patterns/template-method/` | `LayerExecutionTemplate` |

#### Règles DI Critiques

- **JAMAIS `new Service()` direct** — Via container ou factory
- **Abstract class = Token** — `container.get(CapabilityRepository)` pas `I*`
- **Handlers → Use Cases** — Les handlers MCP/HTTP délèguent aux use cases
- **Interfaces dans domain/** — Implémentations dans modules concrets

### JSR Package & MCP Routing (Epic 14)

#### Terminologie Routing

- **client** — Exécution sur machine utilisateur (filesystem, docker, ssh, git)
- **server** — Exécution sur pml.casys.ai (json, math, tavily, pml:*)
- **Config source** — `config/mcp-routing.json` (jamais de fallback hardcodé)
- **Default** — `"client"` pour outils inconnus (sécurité)

#### Modes de Distribution

| Mode | Description | Status |
|------|-------------|--------|
| **A (Toolkit)** | Meta-tools uniquement (`pml stdio`) | Ready |
| **B (Standalone)** | Capability directe (`pml add/run namespace.action`) | Ready |
| **C (Hybrid)** | Meta-tools + curated caps dynamiques | BLOQUE (#4118) |

#### HIL Approval Flow (Stdio Mode)

- **Retourner `approval_required: true`** + `workflow_id` — Pas `await hilCallback()`
- **Jamais bloquer stdin** — stdin = JSON-RPC, pas user input
- **Claude UI** — User voit [Continue] [Always] [Abort]
- **Continuation** — Via `continue_workflow: { workflow_id, approved, always }`
- **Expiration** — 5 minutes timeout sur workflows en attente

#### Naming Convention

| Context | Format | Example |
|---------|--------|---------|
| FQDN (registry) | dots | `casys.pml.filesystem.read_file` |
| Tool name (Claude) | colon | `filesystem:read_file` |
| Code TS | dots + prefix | `mcp.filesystem.read_file()` |

#### FQDN Canonical Format (ADR-068)

- **Stocker FQDN à l'écriture** — NE PAS normaliser lors de l'écriture en DB
- **Normaliser à la lecture** — `normalizeToolId()` unifie en `namespace:action`
- **3 formats coexistent dans task_results** — (1) court `std:psql_query`, (2) FQDN 5-parts `pml.mcp.std.psql_query.db48`, (3) prefix `code:filter`
- **Le hash change entre instances PML** — `.db48`, `.3cd9` etc. — ne jamais hardcoder

#### BYOK (Bring Your Own Key)

- **Local execution** — Clés lues depuis `.env` (TAVILY_API_KEY, etc.)
- **Cloud execution** — Clés stockées dans profil pml.casys.ai/settings
- **One-shot usage** — Clés jamais stockées en logs côté cloud

### Données & Traces (ADR-068, ADR-069)

#### task_results = Source Unique

- **task_results (JSONB)** = source de vérité pour les séquences d'exécution
- **executed_path (text[])** = DEPRECATED (18% corruption historique UUIDs)
- **0% corruption** dans task_results (pas de mismatch UUID/FQDN)
- **Capabilities dans task_results** — Apparaissent comme FQDN tools (ex: `meta:personWithAddress`)
- **Loops** — `loop:forOf` opaque mais contient `bodyTools[]` avec les vrais tools MCP internes

#### Vocabulaire & Hiérarchie

- **VocabNode** — `level` arbitraire (L0=tools, L1=caps, L2=caps de caps, etc.)
- **Tous les niveaux ont des FQDN normaux** — Une cap L1 a un FQDN comme un tool L0
- **hierarchy_level** assigné après coup, PAS encodé dans le format
- **L2 skip = bug filtre `toolVocab.has()`** — Le filtre ne contient que les 918 tools L0

### Development Workflow Rules

#### Git Conventions

- **Branch main** — Branche principale de production
- **Commits atomiques** — Un commit = une unité logique de changement
- **Messages descriptifs** — Préfixe type: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`

#### Development Commands

- `deno task dev` — Serveur API (port 3003)
- `deno task dev:fresh` — Dashboard Vite (port 8081)
- `deno task check` — Type checking
- `deno task fmt && deno task lint` — Avant commit

#### Production Deployment

- **Systemd services** — `casys-dashboard`, `casys-api`
- **Direct systemctl** — Pas de scripts dans deno.json pour la prod (sécurité)
- `sudo systemctl restart casys-dashboard casys-api` — Sur le serveur prod uniquement

#### CLI Usage

- `deno task cli init` — Initialisation (discover MCPs, embeddings)
- `deno task cli status` — Vérification santé
- `deno task cli workflows` — Gestion des workflows

#### ADR Process

- **Nouvelle décision** — Créer `docs/adrs/ADR-XXX-description.md`
- **Numérotation séquentielle** — Incrémenter depuis le dernier ADR (actuellement 069+)
- **Format** — Context, Decision, Consequences

### Critical Don't-Miss Rules

#### Anti-Patterns a Eviter

- **JAMAIS React** — Utiliser Preact uniquement, imports `preact` pas `react`
- **JAMAIS CommonJS** — Pas de `require()`, ESM uniquement
- **JAMAIS node_modules direct** — Préfixe `npm:` obligatoire
- **JAMAIS snake_case** — camelCase pour propriétés (refactoring récent)
- **JAMAIS proxy MCP direct** — Exposer meta-tools, pas les outils sous-jacents
- **JAMAIS magic numbers** — Utiliser `config/*.yaml` et `DagScoringConfig.load()`
- **JAMAIS hardcode thresholds** — Tous externalisés dans `dag-scoring.yaml` ou `local-alpha.yaml`
- **JAMAIS TensorFlow.js** pour l'inférence GRU — Pure JS+BLAS uniquement
- **JAMAIS normaliser FQDN à l'écriture** — Normaliser à la lecture (ADR-068)
- **JAMAIS `executed_path` comme source primaire** — Utiliser `task_results` (ADR-069)
- **JAMAIS curl/broadcast manuel** pour tester les viewers — Utiliser `pml execute`
- **JAMAIS `*/` dans un JSDoc** dans des backticks — Ferme le bloc commentaire

#### Securite

- **Sandbox isolation** — Code utilisateur dans worker isolé
- **PII detection** — Activer tokenisation par défaut
- **Pas de secrets en code** — Utiliser `.env` et `@std/dotenv`
- **Permissions Deno explicites** — `--allow-read`, `--allow-net`, etc.
- **No silent fallbacks** — Fail-fast obligatoire (voir `.claude/rules/no-silent-fallbacks.md`)
- **No hidden heuristics** — Model-driven, pas code-driven (voir `.claude/rules/no-hidden-heuristics.md`)

#### Patterns Critiques

- **camelCase everywhere** — Events, state, API responses
- **Async/await obligatoire** — Pas de callbacks ou .then() chains
- **Extensions .ts dans imports** — Deno requiert extensions explicites
- **Type safety** — `strict: true`, pas de `any` sauf cas documenté

#### Base de Donnees

- **PGlite / PostgreSQL Docker** — PGlite (dev), PostgreSQL 16+ Docker (prod)
- **Deno KV pour sessions** — OAuth, cache, tokens
- **Migrations Drizzle** — `src/db/migrations/` numérotées séquentiellement (051+)
- **Multi-tenant ready** — Préparer pour version cloud

#### Observabilite

- **Sentry pour erreurs** — Si `SENTRY_DSN` configuré
- **Logger structuré** — `src/telemetry/logger.ts`
- **IDecisionLogger** — Port/Adapter pour telemetry (ADR-054)
- **Native Deno OTEL** — `src/telemetry/otel.ts` (`--unstable-otel`)
- **SSE events** — Real-time updates via feed server
- **Métriques** — Success rate, latency, graph density trackés

#### DAG Execution

- **AIL (Agent-in-the-Loop)** — Décisions automatiques avec validation par layer
- **HIL (Human-in-the-Loop)** — Checkpoints d'approbation **PRE-EXECUTION** (pas après)
- **Checkpoint/Resume** — Workflows interruptibles avec persistence d'état
- **$OUTPUT resolution** — Référencer outputs des tasks précédentes
- **Two-Level DAG (Phase 2a)** — Logical DAG (SHGAT learning) + Physical DAG (fused execution)
- **Sequential Fusion** — Tasks pures sans MCP calls fusionnées automatiquement
- **Option B Nested Ops** — `executable: false` pour opérations inside callbacks (.map, .filter)

#### MiniTools (`lib/std/`)

- **Import centralisé** — `import { ... } from "../../lib/std/mod.ts"`
- **MiniToolsClient** — Classe standard pour accès aux 120+ outils
- **Handler pattern** — `{ name, description, inputSchema, handler }`
- **Categories filtering** — `new MiniToolsClient({ categories: ["json", "crypto"] })`

#### Configuration Externalisee

- **DagScoringConfig** — `import { DagScoringConfig } from "./dag-scoring-config.ts"`
- **LocalAlphaConfig** — `import { LocalAlphaConfig } from "./local-alpha-config.ts"`
- **Sections YAML** — `limits`, `weights`, `thresholds`, `caps`, `reliability`, `defaults`
- **Schémas JSON** — `*.schema.json` pour validation (yaml-language-server)

#### Adaptive Learning (ADR-048, ADR-049, ADR-053)

- **Local Alpha** — `alpha ∈ [0.5, 1.0]` — 0.5 = trust graph, 1.0 = semantic only
- **Heat Diffusion** — Propagation de confiance par connectivité graphe
- **Cold Start** — Bayesian prior `Beta(1,1)` → target après `threshold` observations
- **Thompson Sampling** — Distribution `Beta(α,β)` per-tool pour thresholds adaptatifs
- **Risk Categories** — `safe` (0.55), `moderate` (0.70), `dangerous` (0.85) via
  `mcp-permissions.yaml`
- **SHGAT Subprocess Training** — Entraînement non-bloquant via subprocess Deno
- **PER (Prioritized Experience Replay)** — TD errors pour échantillonnage prioritaire

#### Dynamic Capability Routing (ADR-052)

- **Résolution statique** — Capabilities découvertes à l'analyse SWC, pas au runtime
- **Proxy transparent** — `mcp.math.sum()` route vers capability `math:sum`
- **Isolation ré-entrance** — Nouveau WorkerBridge par appel de capability

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Reference ADRs for architectural decisions rationale

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review after each epic completion
- Remove rules that become obvious over time

---

_Last Updated: 2026-02-24_
