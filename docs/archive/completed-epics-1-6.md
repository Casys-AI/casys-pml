# AgentCards - Completed Epics Archive (1-6)

**Archived:** 2025-12-05
**Reason:** Keeping epics.md lean per BMAD methodology - active epics only

---

## Epic 1: Project Foundation & Context Optimization Engine

**Status:** ✅ DONE (2025-11-05)
**Retrospective:** Completed

**Expanded Goal (2-3 sentences):**

Établir l'infrastructure projet Deno avec CI/CD, implémenter le système de vector search sémantique via PGlite + pgvector, et créer le moteur de context optimization qui réduit la consommation de contexte de 30-50% à <5%. Ce premier epic livre un système fonctionnel permettant le chargement on-demand des tool schemas MCP, validant la proposition de valeur principale d'AgentCards et établissant les foundations pour la parallélisation (Epic 2).

**Value Delivery:**

À la fin de cet epic, un développeur peut installer AgentCards, migrer sa configuration MCP, et observer immédiatement une réduction du contexte à <5%, récupérant 90% de sa fenêtre conversationnelle pour usage utile.

---

### Story Breakdown - Epic 1

**Story 1.1: Project Setup & Repository Structure**

As a developer,
I want a clean Deno project structure with CI/CD configured,
So that I can start development with proper tooling and automation in place.

**Acceptance Criteria:**
1. Repository initialisé avec structure Deno standard (src/, tests/, docs/)
2. GitHub Actions CI configuré (lint, typecheck, tests)
3. deno.json configuré avec tasks scripts (test, lint, fmt, dev)
4. README.md avec badges CI et quick start guide
5. .gitignore approprié pour Deno projects
6. License MIT et CODE_OF_CONDUCT.md

**Prerequisites:** None

---

**Story 1.2: PGlite Database Foundation with pgvector**

As a developer,
I want a PGlite database with pgvector extension configured,
So that I can store embeddings vectoriels et perform semantic search efficiently.

**Acceptance Criteria:**
1. PGlite database initialization dans `~/.agentcards/.agentcards.db`
2. pgvector extension loaded et operational
3. Database schema créé avec tables:
   - `tool_embedding` (tool_id, embedding vector(1024), metadata)
   - `tool_schema` (tool_id, schema_json, server_id, cached_at)
   - `config` (key, value pour metadata)
4. Vector index HNSW créé sur tool_embedding.embedding avec pgvector
5. Basic CRUD operations testés (insert, query, update, delete)
6. Database migration system en place pour schema evolution future

**Prerequisites:** Story 1.1 (project setup)

---

**Story 1.3: MCP Server Discovery & Schema Extraction**

As a power user with 15+ MCP servers,
I want AgentCards to automatically discover my MCP servers and extract their tool schemas,
So that I don't have to manually configure each server.

**Acceptance Criteria:**
1. MCP server discovery via stdio et SSE protocols
2. Connection établie avec chaque discovered server
3. Tool schemas extracted via MCP protocol `list_tools` call
4. Schemas parsed et validated (input/output schemas, descriptions)
5. Schemas stockés dans PGlite `tool_schema` table
6. Error handling pour servers unreachable ou invalid schemas
7. Console output affiche nombre de servers discovered et tools extracted
8. Support au minimum 15 MCP servers simultanément

**Prerequisites:** Story 1.2 (database foundation)

---

**Story 1.4: Embeddings Generation with BGE-Large-EN-v1.5**

As a developer,
I want tool schemas to be converted into vector embeddings using BGE-Large-EN-v1.5 locally,
So that I can perform semantic search without relying on external APIs.

**Acceptance Criteria:**
1. BGE-Large-EN-v1.5 model downloaded et loaded (via @xenova/transformers)
2. Tool schemas (name + description + parameters) concatenés en text input
3. Embeddings (1024-dim) générés pour chaque tool
4. Embeddings stockés dans `tool_embeddings` table avec metadata
5. Progress bar affichée durant génération (peut prendre ~60s pour 100+ tools)
6. Embeddings cachés (pas de régénération si schema unchanged)
7. Total generation time <2 minutes pour 200 tools

**Prerequisites:** Story 1.3 (schema extraction)

---

**Story 1.5: Semantic Vector Search Implementation**

As a developer,
I want to search for relevant tools using natural language queries,
So that I can find the right tools without knowing their exact names.

**Acceptance Criteria:**
1. Query embedding génération (même modèle BGE-Large-EN-v1.5)
2. Cosine similarity search sur vector index (<100ms query time P95)
3. API: `searchTools(query: string, topK: number)` → tool_ids + scores
4. Top-k results returned sorted par relevance score (default k=5)
5. Configurable similarity threshold (default 0.7)
6. Unit tests validant accuracy avec sample queries
7. Benchmark test confirmant P95 <100ms pour 1000+ vectors

**Prerequisites:** Story 1.4 (embeddings generation)

---

**Story 1.6: On-Demand Schema Loading & Context Optimization**

As a Claude Code user,
I want AgentCards to load only relevant tool schemas based on my query,
So that my context window is not saturated by unused tool schemas.

**Acceptance Criteria:**
1. Integration semantic search avec schema loading
2. Workflow: query → vector search → retrieve top-k tools → load schemas
3. Schemas retournés uniquement pour matched tools (pas all-at-once)
4. Context usage measurement et logging (<5% target)
5. Comparison metric affiché: before (30-50%) vs after (<5%)
6. Cache hit pour frequently used tools (évite reloading)
7. Performance: Total query-to-schema latency <200ms P95

**Prerequisites:** Story 1.5 (vector search)

---

**Story 1.7: Migration Tool (`agentcards init`)**

As a power user with existing MCP configuration,
I want to migrate my mcp.json configuration to AgentCards automatically,
So that I don't have to manually reconfigure everything.

**Acceptance Criteria:**
1. CLI command `agentcards init` implemented
2. Detection automatique du claude_desktop_config.json path (OS-specific)
3. Parsing du mcp.json existant et extraction des MCP servers
4. Generation de `~/.agentcards/config.yaml` avec servers migrés
5. Embeddings generation triggered automatiquement post-migration
6. Console output avec instructions pour éditer mcp.json
7. Template affiché pour nouvelle config mcp.json (juste agentcards gateway)
8. Rollback capability si erreur durant migration
9. Dry-run mode (`--dry-run`) pour preview changes

**Prerequisites:** Story 1.6 (context optimization functional)

---

**Story 1.8: Basic Logging & Telemetry Backend**

As a developer,
I want structured logging et métriques telemetry opt-in,
So that I can debug issues et measure success metrics (context usage, latency).

**Acceptance Criteria:**
1. Structured logging avec std/log (Deno standard library)
2. Log levels: error, warn, info, debug
3. Log output: console + file (`~/.agentcards/logs/agentcards.log`)
4. Telemetry table dans PGlite: `metrics` (timestamp, metric_name, value)
5. Metrics tracked: context_usage_pct, query_latency_ms, tools_loaded_count
6. Opt-in consent prompt au premier launch (telemetry disabled by default)
7. CLI flag `--telemetry` pour enable/disable
8. Privacy: aucune data sensitive (queries, schemas) ne quitte local machine

**Prerequisites:** Story 1.7 (migration tool ready)

---

## Epic 2: DAG Execution & Production Readiness

**Status:** ✅ DONE
**Retrospective:** Completed

**Expanded Goal (2-3 sentences):**

Implémenter le système de DAG execution pour parallélisation intelligente des workflows multi-tools, intégrer AgentCards comme MCP gateway avec Claude Code, et hardening production avec health checks, error handling robuste, et tests end-to-end. Ce second epic livre un système production-ready capable de réduire la latence des workflows de 5x à 1x via parallélisation, complétant ainsi la double value proposition d'AgentCards (context + speed).

**Architecture Clarification: GraphRAG vs DAG:**

Il est crucial de comprendre la distinction entre deux composants architecturaux complémentaires :

- **GraphRAG (Epic 1)** = Base de connaissances globale
  - Stocke TOUS les tools de TOUS les MCP servers (687 tools)
  - Contient l'historique des workflows exécutés (succès/échecs, patterns)
  - Maintient les relations entre tools (ex: "filesystem:read" suivi de "json:parse" dans 85% des cas)
  - **Scope:** Global, toutes les possibilités

- **DAG (Epic 2)** = Instance de workflow spécifique
  - Un workflow concret pour UNE tâche précise
  - Contient uniquement les 3-5 tools pertinents pour cette requête
  - Définit explicitement les dépendances (task B dépend de task A)
  - **Scope:** Local, single execution

**Comment ils permettent le Speculative Execution:**

```
GraphRAG (Epic 1) → Apprend les patterns historiques
        ↓
DAG Suggester → Prédit quel DAG construire basé sur l'intent
        ↓
DAG (Epic 2) → Structure concrète à exécuter
        ↓
Execution Spéculative → Lance le DAG prédit AVANT que l'agent demande
        ↓
Résultats cachés → Agent obtient réponse instantanée
```

Sans GraphRAG (la connaissance), impossible de prédire quel DAG construire.
Sans DAG (la structure), impossible d'exécuter en parallèle ou spéculativement.

Le **Speculative Execution** n'est possible que grâce au **graph de dépendances** qui encode les patterns appris dans GraphRAG et permet la prédiction de workflows complets.

**Value Delivery:**

À la fin de cet epic, un développeur peut exécuter des workflows cross-MCP complexes avec parallélisation automatique, observant des gains de performance 3-5x sur workflows typiques, le tout via une gateway stable et fiable intégrée à Claude Code.

---

### Story Breakdown - Epic 2

**Story 2.1: Dependency Graph Construction (DAG Builder)**

As a developer,
I want AgentCards to automatically construct a dependency graph from tool input/output schemas,
So that independent tools can be identified for parallel execution.

**Acceptance Criteria:**
1. DAG builder module créé (`src/dag/builder.ts`)
2. Parsing des tool input/output schemas (JSON Schema format)
3. Dependency detection: tool B depends on tool A si output_A matches input_B
4. DAG representation: nodes (tools) + edges (dependencies)
5. Topological sort implementation (custom, zero external dependency)
6. Detection de cycles (DAG invalide) avec error reporting
7. Unit tests avec sample workflows (sequential, parallel, mixed)
8. API: `buildDAG(tools: Tool[])` → DAG graph object

**Prerequisites:** Epic 1 complété (context optimization functional)

---

**Story 2.2: Parallel Execution Engine**

As a power user,
I want workflows avec independent tools to execute in parallel,
So that I save time instead of waiting for sequential execution.

**Acceptance Criteria:**
1. Parallel executor module créé (`src/dag/executor.ts`)
2. DAG traversal avec identification des nodes exécutables en parallèle
3. Promise.all utilisé pour parallel execution de independent branches
4. Sequential execution pour dependent tools (respect topological order)
5. Partial success handling: continue execution même si un tool fail
6. Results aggregation: successes + errors retournés avec codes
7. Performance measurement: latency avant/après parallélisation
8. Target: P95 latency <3 secondes pour workflow 5-tools
9. Benchmarks tests validant 3-5x speedup sur workflows parallélisables

**Prerequisites:** Story 2.1 (DAG builder)

---

**Story 2.3: SSE Streaming pour Progressive Results**

As a user waiting for workflow results,
I want to see results streamed progressively as they complete,
So that I get feedback immediately instead of waiting for all tools to finish.

**Acceptance Criteria:**
1. SSE (Server-Sent Events) implementation pour streaming
2. Event types définis: `task_start`, `task_complete`, `execution_complete`, `error`
3. Results streamés dès disponibilité (pas de wait-all-then-return)
4. Event payload: tool_id, status, result, timestamp
5. Client-side handling simulé dans tests
6. Graceful degradation si SSE unavailable (fallback to batch response)
7. Max event buffer size pour éviter memory leaks

**Prerequisites:** Story 2.2 (parallel executor)

---

**Story 2.4: MCP Gateway Integration avec Claude Code**

As a Claude Code user,
I want AgentCards to act as a transparent MCP gateway,
So that Claude can interact with all my MCP servers via a single entry point.

**Acceptance Criteria:**
1. MCP protocol server implementation (stdio mode primary)
2. AgentCards expose MCP server interface compatible avec Claude Code
3. Requests de Claude interceptés par gateway
4. Vector search → load schemas → execute tools → return results
5. Transparent proxying: Claude voit AgentCards comme un seul MCP server
6. Support `list_tools`, `call_tool`, `get_prompt` methods (MCP spec)
7. Error handling: MCP-compliant error responses
8. Integration test avec mock Claude client

**Prerequisites:** Story 2.3 (SSE streaming ready)

---

**Story 2.5: Health Checks & MCP Server Monitoring**

As a developer,
I want AgentCards to monitor MCP server health et report issues,
So that I know which servers are down or misconfigured.

**Acceptance Criteria:**
1. Health check implementation au startup (ping chaque MCP server)
2. Periodic health checks (every 5 minutes) durant runtime
3. Health status tracking: healthy, degraded, down
4. Console warnings pour servers unavailable
5. Automatic retry logic (3 attempts) avant marking server down
6. Health status API: `agentcards status` CLI command
7. Logs structured avec server_id, status, last_check timestamp

**Prerequisites:** Story 2.4 (gateway integration)

---

**Story 2.6: Error Handling & Resilience**

As a developer,
I want robust error handling throughout AgentCards,
So that the system degrades gracefully instead of crashing.

**Acceptance Criteria:**
1. Try-catch wrappers autour de all async operations
2. Error types définis: MCPServerError, VectorSearchError, DAGExecutionError
3. User-friendly error messages avec suggestions de resolution
4. Rollback capability pour failed migrations
5. Partial workflow success (return succès même si some tools fail)
6. Timeout handling (default 30s per tool execution)
7. Rate limiting pour prevent MCP server overload
8. Error logs persistés pour post-mortem analysis

**Prerequisites:** Story 2.5 (health checks)

---

**Story 2.7: End-to-End Tests & Production Hardening**

As a developer shipping production software,
I want comprehensive E2E tests et production hardening,
So that AgentCards is reliable et users don't experience bugs.

**Acceptance Criteria:**
1. E2E test suite créé avec Deno.test
2. Test scenarios: migration, vector search, DAG execution, gateway proxying
3. Mock MCP servers pour testing (fixtures)
4. Integration tests avec real BGE-Large model
5. Performance regression tests (benchmark suite)
6. Memory leak detection tests (long-running daemon)
7. CI configuration updated pour run E2E tests
8. Code coverage report >80% (unit + integration)
9. Load testing: 15+ MCP servers, 100+ tools
10. Documentation: README updated avec installation, usage, troubleshooting

**Prerequisites:** Story 2.6 (error handling)

---

## Epic 2.5: Adaptive DAG Feedback Loops (Foundation)

**Status:** ✅ DONE (2025-12-01, 4/4 stories)
**Retrospective:** Completed

**Expanded Goal (2-3 sentences):**

Établir la fondation pour workflows adaptatifs avec feedback loops Agent-in-the-Loop (AIL) et Human-in-the-Loop (HIL), préparant l'intégration avec Epic 3 (Sandbox). Implémenter l'architecture 3-Loop Learning (Phase 1 - Foundation) avec event stream observable, checkpoint/resume, et DAG replanning dynamique. Ce pivot architectural débloque le contrôle runtime essentiel pour les opérations critiques (HIL approval code sandbox Epic 3) et workflows adaptatifs découvrant progressivement leurs besoins.

**Architecture 3-Loop Learning (Phase 1 - Foundation):**

**Loop 1 (Execution - Real-time):**
- Event stream observable pour monitoring en temps réel
- Command queue pour contrôle dynamique (agent + humain)
- State management avec checkpoints et resume
- **Fréquence:** Milliseconds (pendant l'exécution)

**Loop 2 (Adaptation - Runtime):**
- Agent-in-the-Loop (AIL): Décisions autonomes pendant l'exécution
- Human-in-the-Loop (HIL): Validation humaine pour opérations critiques
- DAG re-planning dynamique via GraphRAG queries
- **Fréquence:** Seconds à minutes (entre layers)

**Loop 3 (Meta-Learning - Basic):**
- GraphRAG updates from execution patterns (co-occurrence, preferences)
- Learning baseline pour futures optimisations
- **Fréquence:** Per-workflow

**Value Delivery:**

À la fin de cet epic, AgentCards peut adapter ses workflows en temps réel basé sur les découvertes runtime, demander validation humaine pour opérations critiques, et apprendre des patterns d'exécution pour améliorer futures suggestions. Foundation critique pour Epic 3 (HIL code sandbox approval) et Epic 3.5 (speculation with rollback).

---

### Story Breakdown - Epic 2.5

**Story 2.5-1: Event Stream, Command Queue & State Management**

As a developer building adaptive workflows,
I want real-time event streaming and dynamic control capabilities,
So that I can observe execution progress and inject commands during runtime.

**Acceptance Criteria:**
1. `ControlledExecutor` extends `ParallelExecutor` (Epic 2) avec event stream
2. Event types définis: `workflow_started`, `task_started`, `task_completed`, `workflow_completed`, `error`, `awaiting_input`
3. EventEmitter implementation (Node.js-style events)
4. Command queue: `pause`, `resume`, `cancel`, `replan`, `inject_task`
5. State management: workflow state = `{ status, current_tasks, completed_tasks, pending_tasks, checkpoints }`
6. State serialization/deserialization (JSON-compatible)
7. Thread-safe command injection (async queue)
8. Unit tests: event emission, command processing, state transitions
9. Integration test: Execute workflow → inject pause command → verify workflow pauses

**Prerequisites:** Epic 2 completed (ParallelExecutor functional)

---

**Story 2.5-2: Checkpoint & Resume Infrastructure**

As a user with long-running workflows,
I want workflows to be resumable after interruptions,
So that I don't lose progress if something fails or I need to stop.

**Acceptance Criteria:**
1. Checkpoint système implémenté (`src/dag/checkpoint.ts`)
2. Checkpoints stockés dans PGlite table: `workflow_checkpoints` (workflow_id, state_json, timestamp)
3. Checkpoint automatique: après chaque task completed, before each critical operation
4. Resume API: `resumeWorkflow(workflow_id)` → reconstruit state et continue
5. Partial result preservation: completed tasks results cached
6. Task idempotency verification: detect if task already completed before retry
7. Checkpoint cleanup: auto-delete checkpoints >7 days old
8. CLI command: `agentcards resume <workflow_id>`
9. Error handling: corrupt checkpoint → fallback to nearest valid checkpoint
10. Integration test: Workflow fails mid-execution → resume → completes successfully

**Prerequisites:** Story 2.5-1 (state management)

---

**Story 2.5-3: AIL/HIL Integration & DAG Replanning**

As an AI agent executing complex workflows,
I want to make autonomous decisions (AIL) and request human validation (HIL) when needed,
So that workflows can adapt based on discoveries and critical operations get human oversight.

**Acceptance Criteria:**
1. AIL (Agent-in-the-Loop) implementation:
   - Decision points définis dans DAG: `{ type: 'ail_decision', prompt: string, options: [...] }`
   - Agent query mechanism via single conversation thread (no context filtering)
   - Multi-turn conversation support for complex decisions
   - Decision logging dans PGlite: `ail_decisions` (workflow_id, decision_point, chosen_option, rationale)

2. HIL (Human-in-the-Loop) implementation:
   - Approval gates pour critical operations: `{ type: 'hil_approval', operation: string, risk_level: 'low'|'medium'|'high' }`
   - User prompt via CLI or API: "Approve code execution? [y/n]"
   - Timeout handling: auto-reject after 5 minutes (configurable)
   - Approval history logging

3. DAG Replanning:
   - `DAGSuggester.replanDAG(current_state, new_intent)` method
   - GraphRAG query pour find alternative paths
   - Merge new DAG avec existing execution state
   - Preserve completed tasks, replace pending tasks
   - Validation: no cycles introduced, dependencies preserved

4. Integration with ControlledExecutor:
   - Pause workflow at decision/approval points
   - Emit `awaiting_input` event
   - Resume after decision/approval received

5. Tests:
   - AIL test: Workflow encounters decision point → agent chooses option → workflow continues
   - HIL test: Critical operation → human approves → execution proceeds
   - Replanning test: Workflow discovers new requirement → replan → new tasks added
   - Multi-turn test: Agent asks follow-up questions before decision

**Prerequisites:** Story 2.5-2 (checkpoint/resume)

---

**Story 2.5-4: Command Infrastructure Hardening** *(Scope Reduced per ADR-018)*

> **UPDATE 2025-11-24:** Original scope (8 command handlers, 16h) reduced to 4h per **ADR-018: Command Handlers Minimalism**. Focus on production-blocking bug fixes and error handling, not new handlers.

As a developer building adaptive workflows,
I want robust command infrastructure with proper error handling,
So that the existing 4 core commands operate reliably in production.

**Acceptance Criteria:**
1. Fix BUG-001: Race condition in CommandQueue.processCommands()
   - Async/await properly handles Promise resolution
   - No commands lost during parallel processing
   - Integration tests verify fix

2. Improve command registry error handling:
   - Centralized command dispatch with Map registry
   - Try/catch wrappers around all handlers
   - Error events emitted for observability
   - Unknown commands logged as warnings (not errors)

3. Document Replan-First Architecture (ADR-018):
   - Update story with ADR-018 rationale
   - Add note to spike (over-scoping correction)
   - Update engineering backlog with deferred handlers

**Deferred Handlers** (See ADR-018 + engineering-backlog.md):
- ❌ `inject_tasks` - Redundant with `replan_dag`
- ❌ `skip_layer` - Safe-to-fail branches cover this
- ❌ `modify_args` - No proven HIL correction workflow yet
- ❌ `checkpoint_response` - Composition of existing handlers sufficient

**Prerequisites:** Story 2.5-3 (AIL/HIL integration)

**Related:** Engineering Backlog (BUG-001: Race condition in processCommands() should be fixed as part of this story)

---

## Epic 3: Agent Code Execution & Local Processing

**Status:** ✅ DONE (2025-11-24, 7/7 active stories, 3.3 deprecated)
**Retrospective:** Completed

**Expanded Goal (2-3 sentences):**

Implémenter un environnement d'exécution sécurisé permettant aux agents d'écrire et d'exécuter du code TypeScript localement, traitant les données volumineuses avant injection dans le contexte LLM. Ce troisième epic ajoute une couche de processing local complémentaire au vector search (Epic 1) et au DAG execution (Epic 2), permettant de réduire davantage la consommation de contexte (de <5% à <1%) pour les cas d'usage avec large datasets, tout en protégeant les données sensibles via tokenisation automatique des PII.

**Value Delivery:**

À la fin de cet epic, un développeur peut exécuter des workflows qui traitent localement des datasets volumineux (ex: 1000 commits GitHub), filtrent et agrègent les données dans un sandbox sécurisé, et retournent seulement le résumé pertinent (<1KB) au lieu des données brutes (>1MB), récupérant 99%+ de contexte additionnel et protégeant automatiquement les données sensibles.

**Estimation:** 8 stories (3.1 à 3.8)

**Design Philosophy:**

Inspiré par l'approche Anthropic de code execution, Epic 3 combine le meilleur des deux mondes : vector search (Epic 1) pour découvrir les tools pertinents, puis code execution pour traiter les résultats localement. L'agent écrit du code au lieu d'appeler directement les tools, permettant filtrage, agrégation, et transformation avant que les données n'atteignent le contexte LLM.

**Safe-to-Fail Branches Pattern (Story 3.5):**

Une propriété architecturale critique qui émerge dès que le sandbox est intégré au DAG (Story 3.5) : les tâches sandbox peuvent échouer sans compromettre l'ensemble du workflow, car elles s'exécutent dans un environnement isolé.

Le combo **Speculative Execution (Epic 2) + Safe-to-Fail Branches (Epic 3)** transforme le DAG executor en système de **speculative resilience**.

---

### Story Breakdown - Epic 3

**Story 3.1: Deno Sandbox Executor Foundation** ✅

**Story 3.2: MCP Tools Injection into Code Context** ✅

**Story 3.3: Local Data Processing Pipeline** ❌ DEPRECATED
> Architectural issue: breaks AIL, redundant with 3.4 DAG + code_execution

**Story 3.4: `agentcards:execute_code` MCP Tool** ✅

**Story 3.5: Safe-to-Fail Branches & Resilient Workflows** ✅

**Story 3.6: PII Detection & Tokenization** ✅

**Story 3.7: Code Execution Caching & Optimization** ✅

**Story 3.8: End-to-End Code Execution Tests & Documentation** ✅

**Story 3.9: Sandbox Security Hardening** ✅

---

## Epic 3.5: Speculative Execution with Sandbox Isolation

**Status:** ✅ DONE
**Retrospective:** Optional

**Expanded Goal (2-3 sentences):**

Implémenter speculation WITH sandbox pour THE feature différenciateur - 0ms perceived latency avec sécurité garantie. Utiliser GraphRAG community detection et confidence scoring pour prédire les prochaines actions et exécuter spéculativement dans sandbox isolé, permettant rollback automatique si prédiction incorrecte.

**Value Delivery:**

À la fin de cet epic, AgentCards peut prédire avec 70%+ de précision les prochaines actions d'un workflow, les exécuter spéculativement dans sandbox isolé pendant que l'agent réfléchit, et fournir résultats instantanés (0ms perceived latency) quand l'agent demande finalement l'opération.

---

### Story Breakdown - Epic 3.5

**Story 3.5-1: DAG Suggester & Speculative Execution** ✅
> Code Review APPROVED 2025-11-26, 14 unit tests passing

**Story 3.5-2: Confidence-Based Speculation & Rollback** ✅
> Code Review APPROVED 2025-11-28, 46 tests passing, production-ready

---

## Epic 4: Episodic Memory & Adaptive Learning (ADR-008)

**Status:** ✅ DONE (2025-12-01, all 6 stories)
**Retrospective:** Completed

**Expanded Goal (2-3 sentences):**

Étendre Loop 3 (Meta-Learning) avec mémoire épisodique pour persistence des contextes d'exécution et apprentissage adaptatif des seuils de confiance via algorithme Sliding Window + FP/FN detection. Transformer AgentCards en système auto-améliorant qui apprend continuellement de ses exécutions.

**Value Delivery:**

À la fin de cet epic, AgentCards persiste son apprentissage entre sessions (thresholds ne sont plus perdus au redémarrage), utilise les épisodes historiques pour améliorer prédictions (context-aware), et ajuste automatiquement les thresholds de confiance pour maintenir 85%+ de success rate.

---

### Story Breakdown - Epic 4

**Story 4.1a: Schema PGlite** ✅
> Migration 007 created

**Story 4.1b: EpisodicMemoryStore Class** ✅
> 280 LOC, 9 tests

**Story 4.1c: Threshold Persistence** ✅
> Extended adaptive-threshold.ts (+100 LOC)

**Story 4.1d: ControlledExecutor Integration** ✅
> Code review APPROVED 2025-11-26

**Story 4.1e: DAGSuggester Context Boost** ✅
> Code Review APPROVED 2025-12-01, 6 tests passing

**Story 4.2: Adaptive Threshold Learning (Sliding Window + FP/FN Detection)** ✅
> Implemented 2025-11-05 during Epic 1

---

## Epic 5: Intelligent Tool Discovery & Graph-Based Recommendations

**Status:** ✅ DONE (2025-11-27, both stories)
**Retrospective:** Optional

### Vision

Améliorer la découverte d'outils en combinant recherche sémantique et recommandations basées sur les patterns d'usage réels. Le problème initial: `execute_workflow` utilisait PageRank pour la recherche d'un seul outil, ce qui n'a pas de sens (PageRank mesure l'importance globale, pas la pertinence à une requête).

### Technical Approach

**Hybrid Search Pipeline (style Netflix):**
1. **Candidate Generation** - Recherche sémantique (vector embeddings)
2. **Re-ranking** - Graph-based boost (Adamic-Adar, neighbors)
3. **Final Filtering** - Top-K results

**Algorithmes Graphology:**
- `Adamic-Adar` - Similarité basée sur voisins communs rares
- `getNeighbors(in/out/both)` - Outils souvent utilisés avant/après
- `computeGraphRelatedness()` - Score hybride avec contexte

**Alpha Adaptatif:**
- `α = 1.0` si 0 edges (pure semantic)
- `α = 0.8` si < 10 edges
- `α = 0.6` si > 50 edges (balanced)

---

### Story Breakdown - Epic 5

**Story 5.1: search_tools - Semantic + Graph Hybrid Search** ✅

**Story 5.2: Workflow Templates & Graph Bootstrap** ✅
> Code Review APPROVED 2025-11-27, 52 tests passing

---

## Epic 6: Real-time Graph Monitoring & Observability

**Status:** ✅ DONE (2025-12-03, all 4 stories)
**Retrospective:** Optional

### Vision

Fournir une visibilité complète sur l'état du graphe de dépendances en temps réel via un dashboard interactif. Les développeurs et power users pourront observer comment le graphe apprend et évolue, diagnostiquer les problèmes de recommandations, et comprendre quels outils sont réellement utilisés ensemble dans leurs workflows.

### Value Delivery

À la fin de cet epic, un développeur peut ouvrir le dashboard AgentCards et voir en direct :
- Le graphe complet avec nodes (tools) et edges (dépendances)
- Les événements en temps réel (edge créé, workflow exécuté)
- Les métriques live (edge count, density, alpha adaptatif)
- Les outils les plus utilisés (PageRank top 10)
- Les communities détectées par Louvain
- Les chemins de dépendances entre outils

### Technical Approach

**Architecture:**
- **Backend**: SSE endpoint `/events/stream` pour événements temps réel
- **Frontend**: Page HTML statique avec D3.js/Cytoscape.js pour graph viz
- **Data Flow**: GraphRAGEngine → EventEmitter → SSE → Browser
- **Performance**: Graph rendering <500ms pour 200 nodes

---

### Story Breakdown - Epic 6

**Story 6.1: Real-time Events Stream (SSE)** ✅
> Code Review APPROVED 2025-12-01, 12 tests passing, Quality Score: 100/100

**Story 6.2: Interactive Graph Visualization Dashboard** ✅
> Code Review APPROVED 2025-12-02, 7 tests passing, Quality Score: 95/100

**Story 6.3: Live Metrics & Analytics Panel** ✅
> Code Review APPROVED 2025-12-02, 23 tests passing, Quality Score: 95/100

**Story 6.4: Graph Explorer & Search Interface** ✅
> Code Review APPROVED 2025-12-04, 11 tests passing, all 11 ACs validated
