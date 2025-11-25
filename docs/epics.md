# AgentCards - Epic Breakdown

**Author:** BMad
**Date:** 2025-11-03 (Updated: 2025-11-24)
**Project Level:** 3
**Target Scale:** 8 epics, 37+ stories total (baseline + adaptive features)

---

## Overview

Ce document fournit le breakdown détaillé des epics pour AgentCards, complétant la [PRD](./PRD.md) stratégique.

Chaque epic inclut:
- Expanded goal et value proposition
- Complete story breakdown avec user stories
- Acceptance criteria pour chaque story
- Story sequencing et dependencies

**Epic Sequencing Principles:**
- Epic 1 établit l'infrastructure fondamentale et context optimization
- Epic 2 ajoute la parallélisation et production readiness
- Stories dans epics sont vertically sliced et sequentially ordered
- No forward dependencies - chaque story build uniquement sur previous work

---

## Epic 1: Project Foundation & Context Optimization Engine

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

## Story Guidelines Reference

**Story Format:**

```
**Story [EPIC.N]: [Story Title]**

As a [user type],
I want [goal/desire],
So that [benefit/value].

**Acceptance Criteria:**
1. [Specific testable criterion]
2. [Another specific criterion]
3. [etc.]

**Prerequisites:** [Dependencies on previous stories, if any]
```

**Story Requirements:**

- **Vertical slices** - Complete, testable functionality delivery
- **Sequential ordering** - Logical progression within epic
- **No forward dependencies** - Only depend on previous work
- **AI-agent sized** - Completable in 2-4 hour focused session
- **Value-focused** - Integrate technical enablers into value-delivering stories

---

## Epic 3: Agent Code Execution & Local Processing

**Expanded Goal (2-3 sentences):**

Implémenter un environnement d'exécution sécurisé permettant aux agents d'écrire et d'exécuter du code TypeScript localement, traitant les données volumineuses avant injection dans le contexte LLM. Ce troisième epic ajoute une couche de processing local complémentaire au vector search (Epic 1) et au DAG execution (Epic 2), permettant de réduire davantage la consommation de contexte (de <5% à <1%) pour les cas d'usage avec large datasets, tout en protégeant les données sensibles via tokenisation automatique des PII.

**Value Delivery:**

À la fin de cet epic, un développeur peut exécuter des workflows qui traitent localement des datasets volumineux (ex: 1000 commits GitHub), filtrent et agrègent les données dans un sandbox sécurisé, et retournent seulement le résumé pertinent (<1KB) au lieu des données brutes (>1MB), récupérant 99%+ de contexte additionnel et protégeant automatiquement les données sensibles.

**Estimation:** 8 stories (3.1 à 3.8)

**Design Philosophy:**

Inspiré par l'approche Anthropic de code execution, Epic 3 combine le meilleur des deux mondes : vector search (Epic 1) pour découvrir les tools pertinents, puis code execution pour traiter les résultats localement. L'agent écrit du code au lieu d'appeler directement les tools, permettant filtrage, agrégation, et transformation avant que les données n'atteignent le contexte LLM.

**Safe-to-Fail Branches Pattern (Story 3.5 - Synergie avec Speculative Execution d'Epic 2):**

Une propriété architecturale critique qui émerge dès que le sandbox est intégré au DAG (Story 3.5, juste après `execute_code` tool en 3.4) est le pattern des **branches safe-to-fail** : les tâches sandbox peuvent échouer sans compromettre l'ensemble du workflow, car elles s'exécutent dans un environnement isolé. Contrairement aux appels MCP directs (qui peuvent avoir des effets de bord - écriture fichier, création issue GitHub), le code sandbox est **idempotent et isolé**.

**Cette propriété débloque la vraie puissance du Speculative Execution (Epic 2)** : avec les MCP tools directs, l'exécution spéculative est risquée (prédiction incorrecte = side effect indésirable), mais avec le sandbox, tu peux :

**Séquence logique Epic 3** : Foundation (3.1) → Tools Injection (3.2) → Data Processing (3.3) → execute_code Tool (3.4) → **Safe-to-Fail Branches (3.5)** → PII Protection (3.6) → Caching (3.7) → E2E Tests (3.8). Safe-to-fail arrive dès que execute_code est opérationnel, car c'est une propriété architecturale du système, pas une optimization tardive.

1. **Intelligent Environment Isolation** : Le gateway exécute les opérations lourdes dans un environnement séparé invisible à l'agent. L'agent ne voit jamais les données brutes (1000 commits = 1.2MB), seulement le résultat traité (summary = 2KB). Pas de pollution de contexte.

2. **Aggressive Speculation Without Risk** : Prédire et exécuter plusieurs approches simultanément (fast/ML/stats) sans risque. Si les prédictions sont incorrectes, on discard les résultats (pas de side effects). Si correctes, l'agent obtient une analyse multi-perspective instantanée.

3. **Resilient Workflows** : Lancer 3 approches d'analyse en parallèle, utiliser celle qui réussit. Les MCP tools ne peuvent pas faire ça (side effects, retry = duplicates), mais les sandbox branches le peuvent (failures are free, successes are valuable).

4. **Graceful Degradation** : Si l'analyse ML timeout, fallback automatique sur l'analyse statistique. Pas de rollback nécessaire, les branches échouées sont juste ignorées.

5. **Retry Safety** : Réexécuter des branches sandbox sans risque de duplication d'effets (idempotent).

6. **A/B Testing en Production** : Tester 2 algorithmes en parallèle, comparer les résultats, choisir le meilleur.

Le combo **Speculative Execution (Epic 2) + Safe-to-Fail Branches (Epic 3)** transforme le DAG executor en système de **speculative resilience** : exécuter plusieurs hypothèses simultanément, conserver les succès, ignorer les échecs. Les branches sandbox échouées ne consomment que du temps CPU (ressource peu coûteuse), tandis que les branches MCP échouées peuvent laisser des états corrompus.

**Vision architecturale** : Une gateway qui ne route pas simplement les requêtes, mais **orchestre intelligemment la computation** au nom des agents AI contraints par le contexte.

---

### Story Breakdown - Epic 3

**Story 3.1: Deno Sandbox Executor Foundation**

As a developer,
I want a secure Deno sandbox environment for executing agent-generated code,
So that agents can run TypeScript code without compromising system security.

**Acceptance Criteria:**
1. Sandbox module créé (`src/sandbox/executor.ts`)
2. Deno subprocess spawned avec permissions explicites (`--allow-env`, `--allow-read=~/.agentcards`)
3. Code execution isolée (no access to filesystem outside allowed paths)
4. Timeout enforcement (default 30s, configurable)
5. Memory limits enforcement (default 512MB heap)
6. Error capturing et structured error messages
7. Return value serialization (JSON-compatible outputs only)
8. Unit tests validating isolation (attempt to access /etc/passwd should fail)
9. Performance: Sandbox startup <100ms, code execution overhead <50ms

**Prerequisites:** Epic 2 completed (gateway operational)

---

**Story 3.2: MCP Tools Injection into Code Context**

As an agent,
I want access to MCP tools within my code execution environment,
So that I can call tools directly from my TypeScript code instead of via JSON-RPC.

**Acceptance Criteria:**
1. Tool injection system créé (`src/sandbox/context-builder.ts`)
2. MCP clients wrapped as TypeScript functions accessible in sandbox
3. Code context includes: `const github = { listCommits: async (...) => ... }`
4. Vector search used to identify relevant tools (only inject top-k, not all)
5. Type definitions generated for injected tools (TypeScript autocomplete support)
6. Tool calls from sandbox routed through existing MCP gateway
7. Error propagation: MCP errors surfaced as JavaScript exceptions
8. Integration test: Agent code calls `github.listCommits()` successfully
9. Security: No eval() or dynamic code generation in injection

**Prerequisites:** Story 3.1 (sandbox foundation)

---

**Story 3.3: Local Data Processing Pipeline**

As a user executing workflows with large datasets,
I want data to be processed locally before reaching the LLM context,
So that I save context tokens and get faster responses.

**Acceptance Criteria:**
1. Data processing pipeline implemented in sandbox
2. Agent code can: filter, map, reduce, aggregate large datasets
3. Example use case working: Fetch 1000 GitHub commits → filter last week → return summary
4. Context measurement: Raw data (1MB+) processed locally, summary (<1KB) returned
5. Performance benchmark: 1000-item dataset processed in <2 seconds
6. Streaming support: Large datasets streamed through processing pipeline
7. Memory efficiency: Process datasets larger than heap limit via streaming
8. Integration with DAG executor: Code execution as DAG task type
9. Metrics logged: input_size_bytes, output_size_bytes, processing_time_ms

**Prerequisites:** Story 3.2 (tools injection)

---

**Story 3.4: `agentcards:execute_code` MCP Tool**

As a Claude Code user,
I want a new MCP tool that executes my TypeScript code in AgentCards sandbox,
So that I can process data locally instead of loading everything into context.

**Acceptance Criteria:**
1. New MCP tool registered: `agentcards:execute_code`
2. Input schema: `{ code: string, intent?: string, context?: object }`
3. Intent-based mode: vector search → inject relevant tools → execute code
4. Explicit mode: Execute provided code with specified context
5. Output schema: `{ result: any, logs: string[], metrics: object }`
6. Error handling: Syntax errors, runtime errors, timeout errors
7. Integration with gateway: Tool appears in `list_tools` response
8. Example workflow: Claude writes code → executes via tool → receives result
9. Documentation: README updated with code execution examples

**Prerequisites:** Story 3.3 (data processing pipeline)

---

**Story 3.5: Safe-to-Fail Branches & Resilient Workflows**

As a developer building robust production workflows,
I want to leverage sandbox tasks as safe-to-fail branches in my DAG,
So that I can implement resilient workflows with graceful degradation and retry safety.

**Acceptance Criteria:**
1. DAG executor enhanced pour marquer sandbox tasks comme "safe-to-fail" (failure doesn't halt workflow)
2. Partial success mode: DAG continues même si sandbox branches fail
3. Aggregation patterns implemented: collect results from successful branches, ignore failures
4. Example resilient workflow: Parallel analysis (fast/ML/stats) → use first success
5. Retry logic: Failed sandbox tasks can be retried without side effects (idempotent)
6. Graceful degradation test: ML analysis timeout → fallback to simple stats
7. A/B testing pattern: Run 2 algorithms in parallel, compare results
8. Error isolation verification: Sandbox failure doesn't corrupt MCP tasks downstream
9. Documentation: Resilient workflow patterns guide avec code examples
10. Integration test: Multi-branch workflow with intentional failures → verify partial success

**Prerequisites:** Story 3.4 (execute_code tool)

---

**Story 3.6: PII Detection & Tokenization**

As a security-conscious user,
I want personally identifiable information (PII) automatically detected and tokenized,
So that sensitive data never reaches the LLM context.

**Acceptance Criteria:**
1. PII detection module créé (`src/sandbox/pii-detector.ts`)
2. Patterns detected: emails, phone numbers, credit cards, SSNs, API keys
3. Tokenization strategy: Replace PII with `[EMAIL_1]`, `[PHONE_1]`, etc.
4. Reverse mapping stored securely (in-memory only, never persisted)
5. Agent receives tokenized data, can reference tokens in code
6. De-tokenization happens only for final output (if needed)
7. Opt-out flag: `--no-pii-protection` for trusted environments
8. Unit tests: Validate detection accuracy (>95% for common PII types)
9. Integration test: Email in dataset → tokenized → agent never sees raw email

**Prerequisites:** Story 3.5 (safe-to-fail branches)

---

**Story 3.7: Code Execution Caching & Optimization**

As a developer running repetitive workflows,
I want code execution results cached intelligently,
So that I don't re-execute identical code with identical inputs.

**Acceptance Criteria:**
1. Code execution cache implemented (in-memory LRU, max 100 entries)
2. Cache key: hash(code + context + tool_versions)
3. Cache hit: Return cached result without execution (<10ms)
4. Cache invalidation: Auto-invalidate on tool schema changes
5. Cache stats logged: hit_rate, avg_latency_saved_ms
6. Configurable: `--no-cache` flag to disable caching
7. TTL support: Cache entries expire after 5 minutes
8. Persistence optional: Save cache to PGlite for cross-session reuse
9. Performance: Cache hit rate >60% for typical workflows

**Prerequisites:** Story 3.6 (PII tokenization)

---

**Story 3.8: End-to-End Code Execution Tests & Documentation**

As a developer adopting code execution,
I want comprehensive tests and documentation,
So that I understand how to use the feature effectively.

**Acceptance Criteria:**
1. E2E test suite créé (`tests/e2e/code-execution/`)
2. Test scenarios:
   - GitHub commits analysis (large dataset filtering)
   - Multi-server data aggregation (GitHub + Jira + Slack)
   - PII-sensitive workflow (email processing)
   - Error handling (timeout, syntax error, runtime error)
   - Resilient workflows with safe-to-fail branches
3. Performance regression tests added to benchmark suite
4. Documentation: README section "Code Execution Mode"
5. Examples provided: 5+ real-world use cases with code samples
6. Comparison benchmarks: Tool calls vs Code execution (context & latency)
7. Migration guide: When to use code execution vs DAG workflows
8. Security documentation: Sandbox limitations, PII protection details
9. Resilient workflow patterns comprehensive documentation
10. Video tutorial: 3-minute quickstart (optional, can be deferred)

**Prerequisites:** Story 3.7 (caching)

---

## Epic 3.5: Speculative Execution with Sandbox Isolation

**Expanded Goal (2-3 sentences):**

Implémenter speculation WITH sandbox pour THE feature différenciateur - 0ms perceived latency avec sécurité garantie. Utiliser GraphRAG community detection et confidence scoring pour prédire les prochaines actions et exécuter spéculativement dans sandbox isolé, permettant rollback automatique si prédiction incorrecte. Transformer AgentCards d'un système réactif en système prédictif qui anticipe les besoins de l'agent avant même qu'il les exprime.

**Value Delivery:**

À la fin de cet epic, AgentCards peut prédire avec 70%+ de précision les prochaines actions d'un workflow, les exécuter spéculativement dans sandbox isolé pendant que l'agent réfléchit, et fournir résultats instantanés (0ms perceived latency) quand l'agent demande finalement l'opération. Les prédictions incorrectes sont silencieusement discardées sans side effects grâce à sandbox isolation.

**Estimation:** 1-2 stories, 3-4h

---

### Story Breakdown - Epic 3.5

**Story 3.5-1: DAG Suggester & Speculative Execution**

As an AI agent,
I want AgentCards to predict and execute likely next actions speculatively,
So that I get instant responses without waiting for execution.

**Acceptance Criteria:**
1. `DAGSuggester.predictNextNodes(current_state, context)` method implemented
2. GraphRAG community detection utilisé pour pattern matching
3. Confidence scoring basé sur:
   - Historical co-occurrence frequency (85% des fois, tool A suivi de tool B)
   - Context similarity (embeddings)
   - Workflow type patterns
4. Confidence threshold: >0.70 pour speculation (configurable)
5. Speculative execution:
   - Fork workflow execution dans sandbox branch
   - Execute predicted tasks in parallel avec main workflow
   - Cache results avec confidence score
   - Discard si prédiction incorrecte (no side effects)
6. Integration avec AdaptiveThresholdManager (Story 4.2 - already implemented)
7. Metrics tracking:
   - Speculation hit rate (% de prédictions correctes)
   - Net benefit (time saved - time wasted)
   - False positive rate (prédictions incorrectes)
8. Graceful fallback: Si prédiction incorrecte, execute normalement
9. Tests:
   - Common pattern test: "read file" → predict "parse json" → verify executed speculatively
   - High confidence test: 0.85 confidence → speculation triggered
   - Low confidence test: 0.60 confidence → no speculation
   - Rollback test: Incorrect prediction → discarded, no side effects
10. Performance: Speculation overhead <50ms

**Prerequisites:** Epic 3 completed (sandbox isolation), Epic 5 completed (search_tools for template discovery)

---

**Story 3.5-2: Confidence-Based Speculation & Rollback (Optional - peut être merged avec 3.5-1)**

As a system administrator,
I want confidence-based speculation controls and rollback capabilities,
So that I can tune the speculation aggressiveness vs safety tradeoff.

**Acceptance Criteria:**
1. Configuration: `speculation_config.yaml`
   - `enabled: true/false`
   - `confidence_threshold: 0.70` (min confidence pour speculation)
   - `max_concurrent_speculations: 3` (resource limit)
   - `speculation_timeout: 10s` (max speculation time)
2. Rollback mechanisms:
   - Sandbox isolation ensures no side effects
   - Speculation branch discarded if incorrect
   - Main workflow unaffected by failed speculation
3. Adaptive threshold learning (integration avec Story 4.2):
   - Track speculation success/failure rates
   - Adjust threshold dynamically (too many failures → increase threshold)
4. CLI commands:
   - `agentcards config speculation --threshold 0.75`
   - `agentcards stats speculation` → hit rate, net benefit metrics
5. Tests:
   - Threshold tuning: Adjust threshold → verify speculation frequency changes
   - Resource limit: Exceed max concurrent → additional speculations queued
   - Timeout handling: Speculation exceeds 10s → terminated, no impact on main workflow

**Prerequisites:** Story 3.5-1

---

## Epic 4: Episodic Memory & Adaptive Learning (ADR-008)

**Expanded Goal (2-3 sentences):**

Étendre Loop 3 (Meta-Learning) avec mémoire épisodique pour persistence des contextes d'exécution et apprentissage adaptatif des seuils de confiance via algorithme Sliding Window + FP/FN detection. Implémenter storage hybride (JSONB + typed columns) permettant retrieval contextuel d'épisodes historiques pour améliorer prédictions, et système d'apprentissage adaptatif ajustant dynamiquement les thresholds basé sur les succès/échecs observés. Transformer AgentCards en système auto-améliorant qui apprend continuellement de ses exécutions.

**Value Delivery:**

À la fin de cet epic, AgentCards persiste son apprentissage entre sessions (thresholds ne sont plus perdus au redémarrage), utilise les épisodes historiques pour améliorer prédictions (context-aware), et ajuste automatiquement les thresholds de confiance pour maintenir 85%+ de success rate. Le système devient progressivement plus intelligent avec l'usage.

**Estimation:** 2 stories, 4.5-5.5h

**Note:** Story 4.2 déjà implémentée durant Epic 1 (2025-11-05), Story 4.1 reste à implémenter pour persistence.

---

### Story Breakdown - Epic 4

**Story 4.1: Episodic Memory Storage & Retrieval**

As a system learning from past executions,
I want to persist workflow execution contexts and retrieve relevant episodes,
So that I can improve predictions based on historical patterns.

**Acceptance Criteria:**
1. PGlite table: `episodic_memory`
   - Hybrid schema: JSONB `state_snapshot` + typed columns pour fast queries
   - Columns: `episode_id`, `workflow_type`, `context_embedding`, `state_snapshot`, `outcome`, `confidence`, `timestamp`
   - Indexes: B-tree sur workflow_type, Vector index (HNSW) sur context_embedding

2. Episode capture:
   - Store workflow state snapshots at key decision points
   - Capture: initial context, intermediate states, final outcome
   - Embeddings générés pour context (semantic search sur historical episodes)
   - Max episode size: 100KB (compression si nécessaire)

3. Episode retrieval:
   - `retrieveSimilarEpisodes(current_context, workflow_type, top_k=5)` method
   - Hybrid search: semantic similarity + workflow_type filter
   - Return: similar past executions avec leurs outcomes
   - Use case: DAGSuggester peut query similar past workflows pour better predictions

4. State pruning strategy:
   - Auto-prune episodes >90 days old (configurable)
   - Keep only successful episodes with high confidence (>0.80)
   - Compression: Remove redundant state information
   - Max storage: 1GB episodic memory (oldest episodes deleted first)

5. Integration avec DAGSuggester:
   - Query similar episodes avant suggesting DAG
   - Boost confidence si similar episode succeeded
   - Learn from failed episodes: avoid patterns that failed historically

6. Persistence pour adaptive thresholds (Story 4.2):
   - Store current thresholds dans PGlite: `adaptive_thresholds` table
   - Columns: `context_id`, `suggestion_threshold`, `explicit_threshold`, `last_updated`, `execution_count`
   - Load thresholds at startup (survive server restarts)
   - Update thresholds après each adjustment

7. Tests:
   - Storage test: Execute workflow → verify episode stored
   - Retrieval test: Query similar context → verify relevant episodes returned
   - Pruning test: Create old episodes → trigger cleanup → verify pruned
   - Threshold persistence test: Adjust threshold → restart server → verify threshold preserved

**Prerequisites:** Epic 2.5 (checkpointing foundation), Epic 3.5 (speculation generates execution data)

---

**Story 4.2: Adaptive Threshold Learning (Sliding Window + FP/FN Detection)**

**Status:** ✅ COMPLETED (Implemented 2025-11-05 during Epic 1, documented 2025-11-24)

**Implementation:** See `/home/ubuntu/CascadeProjects/AgentCards/docs/stories/story-4.2.md`

As an AI agent,
I want the system to learn optimal confidence thresholds from execution feedback,
So that I can reduce unnecessary manual confirmations while avoiding failed speculative executions.

**Acceptance Criteria:** (All criteria met - see story file for details)
1. ✅ Sliding window algorithm tracks last 50 executions
2. ✅ Analyzes 20 most recent executions every 10 executions
3. ✅ Increases threshold when False Positive Rate > 20% (failed speculation)
4. ✅ Decreases threshold when False Negative Rate > 30% (unnecessary confirmations)
5. ✅ Respects min (0.40) and max (0.90) threshold bounds
6. ✅ Provides metrics for monitoring (success rate, wasted compute, saved latency)
7. ✅ Integration with GatewayHandler for real-time threshold adaptation
8. ✅ 8 passing unit tests covering all adaptive behaviors

**Implementation Details:**
- File: `src/mcp/adaptive-threshold.ts` (195 LOC)
- Algorithm: Sliding Window (50 executions) + False Positive/Negative detection
- Thresholds persist in memory beyond sliding window (not lost after 50 executions)
- **No disk persistence yet** - Story 4.1 will add PGlite storage for session continuity
- **Complementary to ADR-015 (Story 5.1):**
  - Story 4.2: Adapts **thresholds** based on success/failure rates
  - Story 5.1: Improves **search quality** via graph-based boost
  - Both reduce "too many manual confirmations" via different mechanisms

**Prerequisites:** Story 4.1 (episodic memory provides disk persistence)

---

## Epic 5: Intelligent Tool Discovery & Graph-Based Recommendations

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

### Story Breakdown - Epic 5

---

**Story 5.1: search_tools - Semantic + Graph Hybrid Search**

As an AI agent,
I want a dedicated tool search endpoint that combines semantic and graph-based recommendations,
So that I can find relevant tools without threshold failures.

**Acceptance Criteria:**
1. Nouvel outil MCP `agentcards:search_tools` exposé dans tools/list
2. Recherche sémantique pure (pas de seuil bloquant comme execute_workflow)
3. Alpha adaptatif: plus de poids sémantique quand graphe sparse
4. Support `context_tools` pour booster les outils liés au contexte actuel
5. Option `include_related` pour obtenir les voisins du graphe
6. GraphRAGEngine: `getNeighbors()`, `computeAdamicAdar()`, `adamicAdarBetween()`
7. GraphRAGEngine: `computeGraphRelatedness()` avec normalisation
8. Logs détaillés: query, alpha, edge_count, scores
9. Tests HTTP: queries "screenshot", "list files", "search web"

**Prerequisites:** Epic 3 (sandbox, execute_code)

---

**Story 5.2: Workflow Templates & Graph Bootstrap**

As a system administrator,
I want predefined workflow templates to initialize the graph,
So that recommendations work even before real usage data is collected.

**Acceptance Criteria:**
1. Fichier `config/workflow-templates.yaml` avec templates courants
2. Templates: web_research, browser_automation, file_operations, knowledge_management
3. GraphRAGEngine: `bootstrapFromTemplates()` method
4. Chargement automatique au démarrage si graph vide (0 edges)
5. Edges marquées `source: 'template'` pour distinguer du real usage
6. PageRank et métriques recalculées après bootstrap
7. Tests: vérifier que bootstrap crée les edges attendues
8. Documentation: comment ajouter de nouveaux templates

**Prerequisites:** Story 5.1

---

## Epic 6: Real-time Graph Monitoring & Observability

### Vision

Fournir une visibilité complète sur l'état du graphe de dépendances en temps réel via un dashboard interactif. Les développeurs et power users pourront observer comment le graphe apprend et évolue, diagnostiquer les problèmes de recommandations, et comprendre quels outils sont réellement utilisés ensemble dans leurs workflows.

**Problème:** Actuellement, le graphe est une "boîte noire" - les edges, PageRank, et communities sont invisibles. Impossible de débugger pourquoi une recommandation est faite, ou de visualiser l'évolution du graphe au fil du temps.

### Value Delivery

À la fin de cet epic, un développeur peut ouvrir le dashboard AgentCards et voir en direct :
- Le graphe complet avec nodes (tools) et edges (dépendances)
- Les événements en temps réel (edge créé, workflow exécuté)
- Les métriques live (edge count, density, alpha adaptatif)
- Les outils les plus utilisés (PageRank top 10)
- Les communities détectées par Louvain
- Les chemins de dépendances entre outils

**Estimation:** 4 stories, ~8-12h

### Technical Approach

**Architecture:**
- **Backend**: SSE endpoint `/events/stream` pour événements temps réel
- **Frontend**: Page HTML statique avec D3.js/Cytoscape.js pour graph viz
- **Data Flow**: GraphRAGEngine → EventEmitter → SSE → Browser
- **Performance**: Graph rendering <500ms pour 200 nodes

**Event Types:**
- `graph_synced` - Graph rechargé depuis DB
- `edge_created` - Nouvelle dépendance détectée
- `edge_updated` - Confidence score augmenté
- `workflow_executed` - DAG exécuté avec succès
- `metrics_updated` - PageRank/communities recalculés

---

### Story Breakdown - Epic 6

---

**Story 6.1: Real-time Events Stream (SSE)**

As a developer monitoring AgentCards,
I want to receive graph events in real-time via Server-Sent Events,
So that I can observe how the system learns without polling.

**Acceptance Criteria:**
1. SSE endpoint créé: `GET /events/stream`
2. EventEmitter intégré dans GraphRAGEngine
3. Event types: `graph_synced`, `edge_created`, `edge_updated`, `workflow_executed`, `metrics_updated`
4. Event payload: timestamp, event_type, data (tool_ids, scores, etc.)
5. Reconnection automatique si connexion perdue (client-side retry logic)
6. Heartbeat events toutes les 30s pour maintenir la connexion
7. Max 100 clients simultanés (éviter DoS)
8. CORS headers configurés pour permettre frontend local
9. Tests: curl stream endpoint, vérifier format events
10. Documentation: Event schema et exemples

**Prerequisites:** Epic 5 completed (search_tools functional)

---

**Story 6.2: Interactive Graph Visualization Dashboard**

As a power user,
I want a web interface to visualize the tool dependency graph,
So that I can understand which tools are used together.

**Acceptance Criteria:**
1. Page HTML statique: `public/dashboard.html`
2. Force-directed graph layout avec D3.js ou Cytoscape.js
3. Nodes = tools (couleur par server, taille par PageRank)
4. Edges = dépendances (épaisseur par confidence_score)
5. Interactions: zoom, pan, drag nodes
6. Click sur node → affiche details (name, server, PageRank, neighbors)
7. Real-time updates via SSE (nouveaux edges animés)
8. Légende interactive (filtres par server)
9. Performance: render <500ms pour 200 nodes
10. Endpoint static: `GET /dashboard` sert le HTML
11. Mobile responsive (optionnel mais nice-to-have)

**Prerequisites:** Story 6.1 (SSE events)

---

**Story 6.3: Live Metrics & Analytics Panel**

As a developer,
I want to see live metrics about graph health and recommendations,
So that I can monitor system performance and debug issues.

**Acceptance Criteria:**
1. Metrics panel dans dashboard (sidebar ou overlay)
2. Live metrics affichés:
   - Edge count, node count, density
   - Alpha adaptatif actuel
   - PageRank top 10 tools
   - Communities count (Louvain)
   - Workflow success rate (dernières 24h)
3. Graphiques time-series (Chart.js/Recharts):
   - Edge count over time
   - Average confidence score over time
   - Workflow execution rate (workflows/hour)
4. API endpoint: `GET /api/metrics` retourne JSON
5. Auto-refresh toutes les 5s (ou via SSE)
6. Export metrics: bouton "Download CSV"
7. Date range selector: last 1h, 24h, 7d
8. Tests: vérifier que metrics endpoint retourne données correctes

**Prerequisites:** Story 6.2 (dashboard)

---

**Story 6.4: Graph Explorer & Search Interface**

As a user,
I want to search and explore the graph interactively,
So that I can find specific tools and understand their relationships.

**Acceptance Criteria:**
1. Search bar dans dashboard: recherche par tool name/description
2. Autocomplete suggestions pendant typing
3. Click sur résultat → highlight node dans graph
4. "Find path" feature: sélectionner 2 nodes → affiche shortest path
5. Filtres interactifs:
   - Par server (checkboxes)
   - Par confidence score (slider: 0-1)
   - Par date (edges created after X)
6. Adamic-Adar visualization: hover sur node → affiche related tools avec scores
7. Export graph data: bouton "Export JSON/GraphML"
8. Breadcrumb navigation: retour à vue complète après zoom
9. Keyboard shortcuts: `/` pour focus search, `Esc` pour clear selection
10. API endpoint: `GET /api/tools/search?q=screenshot` pour autocomplete

**Prerequisites:** Story 6.3 (metrics panel)

---

## Story Guidelines Reference

**Story Format:**

```
**Story [EPIC.N]: [Story Title]**

As a [user type],
I want [goal/desire],
So that [benefit/value].

**Acceptance Criteria:**
1. [Specific testable criterion]
2. [Another specific criterion]
3. [etc.]

**Prerequisites:** [Dependencies on previous stories, if any]
```

**Story Requirements:**

- **Vertical slices** - Complete, testable functionality delivery
- **Sequential ordering** - Logical progression within epic
- **No forward dependencies** - Only depend on previous work
- **AI-agent sized** - Completable in 2-4 hour focused session
- **Value-focused** - Integrate technical enablers into value-delivering stories

---

**For implementation:** Use the `create-story` workflow to generate individual story implementation plans from this epic breakdown.
