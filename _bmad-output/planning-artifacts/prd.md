---
workflowType: 'prd'
workflow: 'edit'
classification:
  domain: 'developer-tools'
  projectType: 'platform'
  complexity: 'complex'
inputDocuments:
  - research/research-market-2025-11-11.md
  - architecture-overview.md
  - ux-design-specification.md
stepsCompleted:
  - 'step-e-01-discovery'
  - 'step-e-01b-legacy-conversion'
  - 'step-e-02-review'
  - 'step-e-03-edit'
lastEdited: '2026-02-05'
editHistory:
  - date: '2026-02-05'
    changes: 'Added FR026-FR031: Client/Server architecture, SHGAT scoring, GRU TransitionModel. Updated Epic 5, 11, 14 with implementation details.'
  - date: '2026-02-05'
    changes: 'Measurability fixes: FR011 quantified (<10% latency), FR015 log format specified (JSON), NFR003 measurement window added (30-day rolling)'
  - date: '2026-02-05'
    changes: 'BMAD restructuring: Added Executive Summary, Success Criteria, Product Scope. Updated Epics 1-6 as completed, added Epics 7-16. Added NFR004-007. Separated FR/NFR sections.'
  - date: '2025-12-09'
    changes: 'Added Epic 9 (GitHub Auth & Multi-Tenancy)'
  - date: '2025-11-03'
    changes: 'Initial PRD creation'
---

# Casys PML Product Requirements Document (PRD)

**Author:** BMad **Date:** 2025-11-03 (Updated: 2026-02-05 - BMAD Restructuring) **Project Level:** 3
**Target Scale:** Complex System - 16 epics (6 completed, 10 active/backlog), 80+ stories

> **Note:** Le business model a été raffiné dans le
> [Market Research Report](research/research-market-2025-11-11.md) (2025-11-11). Modèle confirmé:
> **Open Core Freemium** avec Free tier (3 servers) → Pro ($15/mo) → Team ($25/mo) → Enterprise
> (custom). Voir Section "Business Model" ci-dessous pour détails complets.

---

## Executive Summary

**Vision:** Casys PML transforms MCP integration from a context-saturating bottleneck into an intelligent capability layer where tools are discovered semantically, workflows execute in parallel, and capabilities emerge from usage patterns.

**Core Differentiator:** PGlite-first, zero-config gateway combining vector search (<5% context) + DAG execution (5x latency reduction) + emergent learning. Competitors address one problem; Casys PML solves both while learning from every execution.

**Target Users:**
- Power developers using Claude Code 8-12h/day with 10-20 MCP servers
- AI researchers building multi-agent systems requiring tool orchestration
- DevOps engineers integrating MCP into CI/CD pipelines

**Value Propositions:**
1. **Context Liberation:** Recover 90%+ of LLM context window via semantic tool discovery
2. **Workflow Acceleration:** Parallel DAG execution eliminates cumulative latency
3. **Emergent Intelligence:** System learns capabilities from usage, suggests proactively

---

## Success Criteria

| ID | Criterion | Baseline | Target | Measurement Method |
|---|---|---|---|---|
| SC-001 | Context Optimization | 30-50% context consumed by tool schemas | <5% context usage | Measure `tool_schemas_tokens / total_context_tokens` per request; log P50/P95/P99 |
| SC-002 | Workflow Parallelization | 5x sequential latency (5 tools = 5 round trips) | 1x latency (parallel execution) | Benchmark 5-tool workflow; compare `parallel_time` vs `sum(sequential_times)` |
| SC-003 | MCP Server Capacity | 7-8 servers practical limit | 15+ servers simultaneous | Load test with 15 active MCP servers; verify <10% latency degradation vs 5 servers |
| SC-004 | Setup Time | Manual config per server | <10 min first workflow | Measure time from `pml init` to first parallel workflow execution (new user test) |
| SC-005 | Reliability | Competitor bugs block usage | >99% workflow success rate | Track `successful_workflows / total_workflows` over 30-day rolling window |

**Validation Schedule:**
- SC-001, SC-002, SC-003: Continuous monitoring via observability dashboard (Epic 6)
- SC-004: Quarterly new-user testing (3 users minimum)
- SC-005: Monthly reliability report from production telemetry

---

## Product Scope

### Phase 1: MVP ✅ COMPLETED
**Epics 1-6 | Delivered Q4 2025**

| Component | Deliverables |
|---|---|
| Core Gateway | MCP server discovery, stdio/SSE support, health checks |
| Vector Search | PGlite + pgvector, BGE-Large embeddings, <100ms semantic queries |
| DAG Execution | Dependency graph construction, parallel executor, SSE streaming |
| CLI | `pml init`, `pml serve`, `pml status`, config migration |
| Adaptive Loops | ControlledExecutor, AIL/HIL checkpoints, GraphRAG feedback |
| Sandbox | Deno Worker isolation, RPC bridge, safe-to-fail branches |
| Tool Discovery | Hybrid semantic + graph search, Adamic-Adar scoring |
| Observability | Real-time events stream, graph visualization, metrics dashboard |

### Phase 2: Growth 🚧 IN PROGRESS
**Epics 7-14 | Q1-Q2 2026**

| Component | Deliverables | Epic |
|---|---|---|
| Emergent Capabilities | Capability storage, intent matching, suggestion engine, auto-promotion | 7 |
| Learning from Traces | Pattern extraction, historical analysis, confidence scoring | 11 |
| Speculative Arguments | Argument prediction, template inference, rollback | 12 |
| Capability Curation | Naming UI, tags/categories, sharing, versioning | 13 |
| JSR Package | `@casys/pml` publication, smart local/cloud routing | 14 |

### Phase 3: Scale 📋 PLANNED
**Epics 8-10, 15-16 | Q3-Q4 2026+**

| Component | Description | Timeline |
|---|---|---|
| Multi-Tenant SaaS | GitHub OAuth, API keys, BYOK secrets, team workspaces | Q2 2026 |
| Hypergraph Visualization | N-ary capability relationships, compound graphs | Q3 2026 |
| MCP Apps UI Orchestration | UI components from capabilities, live updates | Q3 2026 |
| CasysDB Native Engine | Purpose-built Rust vector+graph database | 2027 |

### Scope Boundaries

**In Scope:**
- MCP stdio and SSE protocols
- Local-first architecture with optional cloud sync
- Open-source core with commercial add-ons

**Out of Scope (Deferred):**
- Non-MCP protocols (REST, GraphQL adapters)
- Docker deployment (filesystem volume issues unresolved)
- Real-time collaboration (post-enterprise tier)

---

## Background Context

L'écosystème Model Context Protocol (MCP) connaît une adoption explosive avec des centaines de
servers disponibles, mais se heurte à deux goulots d'étranglement critiques qui limitent
drastiquement son utilisation réelle.

Premièrement, la **"taxe invisible" du contexte** : 30-50% de la context window LLM est consommée
uniquement par les schemas des tools MCP avant toute interaction utile, forçant les développeurs à
s'auto-limiter à 7-8 servers maximum au lieu des 15-20+ qu'ils souhaiteraient utiliser.
Deuxièmement, **l'inefficacité des appels séquentiels** : les workflows multi-tools s'exécutent sans
parallélisation, créant une latence cumulative pénible (5 tools = 5x le temps d'attente).

**Le marché des gateways MCP est encombré** avec de nombreuses tentatives de solutions : AIRIS,
Smithery, Unla, Context Forge, agentgateway, mcp-gateway-registry, lazy gateway, et d'autres.
Cependant, **aucune ne résout de manière satisfaisante les deux problèmes simultanément** :

- Certains promettent le lazy loading mais l'implémentation est défaillante ou incomplète
- D'autres se concentrent uniquement sur l'orchestration sans optimiser le contexte
- La majorité reste en approche "all-at-once" qui sature la context window
- Aucune ne combine vector search sémantique ET DAG execution de manière production-ready

Casys PML se différencie par une approche **PGlite-first, zero-config, et double optimisation** :
vector search sémantique pour le chargement on-demand granulaire (<5% de contexte) ET DAG execution
pour la parallélisation intelligente (latence 5x → 1x). L'architecture edge-ready et le focus DX
irréprochable (NPS >75 target) visent à devenir la solution de référence là où d'autres ont échoué
sur l'exécution.

---

## Functional Requirements

**Context Optimization**

- **FR001:** Le système doit générer des embeddings vectoriels pour tous les tool schemas MCP
  disponibles
- **FR002:** Le système doit effectuer une recherche sémantique pour identifier les top-k tools
  pertinents (k=3-10) basé sur l'intent utilisateur
- **FR003:** Le système doit charger les tool schemas on-demand uniquement pour les tools identifiés
  comme pertinents
- **FR004:** Le système doit maintenir la consommation de contexte par les tool schemas en-dessous
  de 5% de la context window totale

**DAG Execution & Orchestration**

- **FR005:** Le système doit analyser les dépendances input/output entre tools pour construire un
  graphe de dépendances (DAG)
- **FR006:** Le système doit identifier automatiquement les tools exécutables en parallèle vs
  séquentiellement
- **FR007:** Le système doit exécuter simultanément les branches indépendantes du DAG
- **FR008:** Le système doit streamer les résultats via SSE dès leur disponibilité pour feedback
  progressif

**MCP Server Management**

- **FR009:** Le système doit auto-découvrir les MCP servers disponibles (stdio et SSE) sans
  configuration manuelle
- **FR010:** Le système doit effectuer des health checks automatiques sur les MCP servers au
  démarrage
- **FR011:** Le système doit supporter 15+ MCP servers actifs simultanément avec <10%
  d'augmentation de latence vs 5 servers

**Storage & Persistence**

- **FR012:** Le système doit stocker tous les embeddings, schemas, et metadata dans un fichier
  PGlite unique portable
- **FR013:** Le système doit cacher les tool schemas pour éviter les rechargements répétitifs

**Observability**

- **FR014:** Le système doit tracker les métriques de consommation de contexte et latence
  d'exécution (opt-in)
- **FR015:** Le système doit générer des logs JSON avec timestamp, severity, component,
  operation_id pour debugging et monitoring

**Migration & Setup**

- **FR016:** Le système doit pouvoir lire le mcp.json existant de Claude Code et générer
  automatiquement la configuration Casys PML correspondante

**Code Execution & Sandbox**

- **FR017:** Le système doit permettre l'exécution de code TypeScript généré par les agents dans un
  environnement Deno sandbox isolé avec permissions explicites
- **FR018:** Le système doit supporter les **branches DAG safe-to-fail** : tâches sandbox pouvant
  échouer sans compromettre le workflow global, permettant resilient workflows, graceful
  degradation, et retry safety
- **FR019:** Le système doit injecter les MCP tools pertinents dans le contexte d'exécution sandbox
  via vector search, permettant aux agents d'appeler les tools directement depuis le code TypeScript

**Authentication & Multi-Tenancy**

- **FR020:** Le système doit supporter deux modes de déploiement : Local (zero-auth,
  user_id="local") et Cloud (GitHub OAuth + API Key)
- **FR021:** Le système doit permettre l'authentification via GitHub OAuth en mode Cloud avec
  session management sécurisé (Deno KV, 7 jours expiry)
- **FR022:** Le système doit générer des API Keys uniques (cai_sk_*) pour accès programmatique au
  MCP Gateway en mode Cloud
- **FR023:** Le système doit permettre aux utilisateurs de configurer leurs propres clés API (BYOK)
  pour les MCPs tiers, stockées avec chiffrement AES-256-GCM
- **FR024:** Le système doit isoler les données d'exécution par user_id tout en partageant les tool
  schemas et le graphe de relations (network effect)
- **FR025:** Le système doit appliquer un rate limiting par utilisateur en mode Cloud (100 req/min
  default, configurable)

**Client/Server Architecture**

- **FR026:** Le système doit fournir un package client JSR (`@casys/pml`) séparé du serveur,
  permettant installation locale via `deno install` ou exécution directe
- **FR027:** Le système doit implémenter un routing hybride où le cloud analyse le code et décide
  si l'exécution est locale (client tools: filesystem, shell, git) ou serveur (API tools: tavily,
  memory, cloud services)
- **FR028:** Le système doit maintenir une session persistante client↔serveur avec heartbeat,
  synchronisation de configuration, et reconnexion automatique

**Intelligent Tool Discovery (SHGAT + GRU)**

- **FR029:** Le système doit scorer la pertinence des tools via SHGAT (Semantic Hypergraph
  Attention) avec message passing multi-niveau sur n-SuperHyperGraph et K-head attention adaptatif
  (4-16 têtes selon complexité du graphe)
- **FR030:** Le système doit prédire les séquences d'outils via GRU TransitionModel, construisant
  des paths complets step-by-step avec détection de terminaison de goal (threshold 0.7)
- **FR031:** Le système doit entraîner SHGAT et GRU en subprocess non-bloquant avec Prioritized
  Experience Replay (PER), préservant les embeddings 1024-dim tout au long du pipeline

---

## Non-Functional Requirements

- **NFR001: Performance** - Le système doit exécuter un workflow typique de 5 tools avec une latence
  P95 <3 secondes (amélioration 5x vs exécution séquentielle baseline)

- **NFR002: Usability (Zero-Config)** - Le système doit permettre à un utilisateur de passer de
  l'installation initiale au premier workflow parallélisé fonctionnel en moins de 10 minutes sans
  configuration manuelle

- **NFR003: Reliability** - Le système doit maintenir un taux de succès >99% pour l'exécution des
  workflows sur une fenêtre glissante de 30 jours (pas de bugs critiques bloquants comme observés
  chez les compétiteurs)

- **NFR004: Security (Sandbox)** - Le système doit exécuter le code agent dans un environnement
  Deno Worker isolé avec `permissions: "none"` par défaut, sans accès filesystem/network sans
  approbation explicite

- **NFR005: Security (Secrets)** - Le système doit chiffrer toutes les clés API utilisateur avec
  AES-256-GCM, master key stockée séparément (Deno KV en mode Cloud)

- **NFR006: Scalability** - Le système doit supporter 10,000+ tools indexés sans dégradation de
  performance des queries vector search (<100ms P95)

- **NFR007: Observability** - Le système doit exposer des métriques OpenTelemetry pour intégration
  avec Prometheus/Grafana/Loki stack

---

## User Journeys

### Journey 1: Premier Workflow Parallélisé avec Casys PML

**Acteur:** Alex, Power User développeur (utilise Claude Code 10h/jour, 15 MCP servers installés)

**Objectif:** Passer d'une configuration MCP saturant le contexte à Casys PML avec context optimisé
et workflows parallélisés

**Étapes:**

**1. Setup Casys PML** (3-5 min)

- Alex exécute `pml init` dans son terminal
- Casys PML lit automatiquement le `mcp.json` existant de Claude Code
- Détecte les 15 MCP servers configurés (GitHub, Filesystem, Database, Playwright, Serena, etc.)
- Génère `~/.pml/config.yaml` avec la configuration migrée
- Génère les embeddings vectoriels pour tous les tools (~60s via BGE-Large-EN-v1.5)
- Stocke tout dans `.pml.db` (PGlite portable)
- ✅ Console: "15 MCP servers migrés et indexés avec succès"

**2. Migration Config Claude Code** (2 min)

- Casys PML affiche les instructions de migration
- Alex édite son `claude_desktop_config.json` (mcp.json)
- **Retire** les 15 entrées MCP servers individuelles
- **Ajoute** uniquement la gateway Casys PML:
  ```json
  {
    "mcpServers": {
      "pml": {
        "command": "pml",
        "args": ["serve"]
      }
    }
  }
  ```
- Redémarre Claude Code
- Claude voit maintenant un seul MCP server au lieu de 15

**3. Premier Workflow - Context Libéré** (1-2 min)

- Alex fait une requête cross-MCP: "Lis config.json, parse-le, et crée un ticket GitHub avec les
  infos"
- Casys PML intercepte la requête depuis Claude
- **Vector search:** Identifie 3 tools pertinents (filesystem:read, json:parse, github:create_issue)
- **Context optimization:** Charge uniquement ces 3 schemas (~2% du contexte vs 45% avant)
- **DAG execution:** Détecte dépendances séquentielles (read → parse → create)
- Exécute le workflow, résultats streamés via SSE
- Console Casys PML: "Context usage: 2.3% | Workflow completed in 4.2s"

**4. "Aha Moment" - Parallélisation (<10 min total)**

- Alex teste un workflow parallélisable: "Lis 3 fichiers différents: config.json, package.json,
  README.md"
- Casys PML détecte que les 3 lectures sont indépendantes
- **DAG execution:** Exécute les 3 filesystem:read en parallèle (Promise.all)
- Latence: 1.8s au lieu de 5.4s (3x amélioration mesurée)
- 💡 **Réalisation:** "Je peux activer tous mes MCP servers ET avoir des workflows ultra-rapides!"

**5. Utilisation Continue**

- Alex continue à utiliser Claude Code normalement
- Casys PML tourne en arrière-plan (daemon transparent)
- Tous les 15 MCP servers fonctionnent via la gateway
- Accès filesystem local préservé (pas de problèmes Docker)
- Métriques opt-in trackées: context moyen 3.8%, workflows 4.2x plus rapides

**Points de Validation:**

- ✅ Installation + migration <10 minutes (NFR002)
- ✅ Context <5% maintenu (FR004, NFR001)
- ✅ 15+ MCP servers supportés simultanément (FR011)
- ✅ Workflows parallélisés fonctionnels (FR007)
- ✅ Aucun bug bloquant, expérience fluide (NFR003)

---

## UX Design Principles

Pour un outil backend comme Casys PML, l'UX se concentre sur la **Developer Experience (DX)**.
Principes clés:

**1. Transparence et Feedback**

- Messages console clairs et informatifs à chaque étape
- Progress bars pour opérations longues (génération embeddings)
- Logs structurés avec niveaux appropriés (error, warn, info, debug)
- Métriques visibles (context usage %, latency) après chaque workflow

**2. Zero-Friction Setup**

- Installation en une commande (`pml init`)
- Auto-discovery et migration automatique du mcp.json existant
- Configuration par défaut sensible (pas de fichiers à éditer manuellement)
- Messages d'erreur avec suggestions de résolution

**3. Fail-Safe et Debuggable**

- Erreurs explicites avec context (quel MCP server, quelle opération)
- Rollback automatique si migration échoue
- Mode verbose optionnel (`--verbose`) pour troubleshooting
- Logs persistés dans fichier pour analyse post-mortem

**4. Performance Observable**

- Métriques temps réel streamées dans console
- Comparaison before/after (context: 45% → 3%)
- Dashboard CLI optionnel (`pml status`) pour vue d'ensemble

---

## User Interface Design Goals

Pas d'interface graphique MVP, mais output console optimisé:

**1. Console Output Structurée**

- Couleurs pour statut (vert=success, rouge=error, jaune=warning)
- Tableaux formatés pour métriques (context usage, latency)
- ASCII art minimal pour branding (logo Casys PML au démarrage)

**2. Logging Levels**

- Default: Info (setup steps, workflow results)
- Quiet mode (`--quiet`): Errors only
- Verbose mode (`--verbose`): Debug traces

**3. Interactive Prompts (si nécessaire)**

- Confirmation avant migration destructive
- Opt-in pour telemetry (explicit consent)

---

## Epic List

### Completed Epics Summary (1-6)

| Epic | Title | Completed | Key Deliverables |
|------|-------|-----------|------------------|
| **1** | Project Foundation & Context Optimization | 2025-11-05 | PGlite + pgvector, vector search (<100ms), `pml init` migration tool, on-demand schema loading |
| **2** | DAG Execution & Production Readiness | 2025-11-10 | Parallel executor with SSE streaming, dependency graph construction, health checks, E2E tests |
| **2.5** | Adaptive DAG Feedback Loops | 2025-11-24 | ControlledExecutor, AIL/HIL foundation, checkpoint/resume, GraphRAG feedback loop (ADR-007/019) |
| **3** | Agent Code Execution & Sandbox | 2025-12-01 | Deno sandbox isolation, `pml:execute` tool, MCP tools injection, safe-to-fail DAG branches |
| **3.5** | Speculative Execution | 2025-12-05 | DAGSuggester.predictNextNodes(), confidence-based speculation (0.7+), sandbox rollback |
| **4** | Episodic Memory & Adaptive Learning | 2025-12-10 | EpisodicMemoryStore, adaptive thresholds (sliding window), PGlite persistence (ADR-008) |
| **5** | Intelligent Tool Discovery | 2025-11-20 | `search_tools` hybrid search, Adamic-Adar relatedness, workflow templates, Local Adaptive Alpha (ADR-048), **SHGAT scoring** (ADR-053/055) |
| **6** | Real-time Graph Monitoring | 2025-12-15 | SSE events stream, Cytoscape.js visualization, live metrics panel, graph explorer |

---

### Active Epic List (7-16)

---

### Epic 7: Emergent Capabilities & Learning System

> **ADRs:** ADR-027, ADR-028, ADR-032 | **Status:** 🚧 IN PROGRESS (Story 7.1 done)

**Objectif:** Transformer Casys PML en systeme ou les capabilities **emergent de l'usage**. Claude devient orchestrateur de haut niveau, deleguant l'execution a PML avec capabilities apprises et suggestions proactives.

**Architecture 3 Couches (Worker RPC Bridge):**
- **Layer 1 (Claude):** Intent reception, capability query, code generation delegation
- **Layer 2 (Capability Engine):** CapabilityMatcher, WorkerBridge, Native Tracing, SuggestionEngine
- **Layer 3 (Deno Worker):** Isolated execution (`permissions: "none"`), tool proxies via RPC

**Livrables cles:**
- Worker RPC Bridge avec tracing natif (Phase 1 - DONE)
- Capability storage avec pattern detection (Phase 2)
- CapabilityMatcher avec vector search (Phase 3)
- SuggestionEngine: Spectral Clustering + Tools Overlap (Phase 4)
- Auto-promotion & multi-level cache (Phase 5)
- Algorithm observability dashboard (Phase 6, ADR-039)

**Estimation:** 9 stories, ~3-4 semaines

---

### Epic 8: Hypergraph Capabilities Visualization

> **ADR:** ADR-029 | **Status:** 📋 BACKLOG

**Objectif:** Visualiser les capabilities comme **hyperedges** (relations N-aires) via Cytoscape.js compound graphs.

**Livrables cles:**
- Capability Data API (`/api/capabilities`, `/api/graph/hypergraph`)
- Compound Graph Builder (HypergraphBuilder class)
- Hypergraph View Mode toggle
- Code Panel avec syntax highlighting
- Capability Explorer (search, filter, "try this capability")

**Estimation:** 5 stories, ~1-2 semaines

**Prerequisites:** Epic 6 (Dashboard), Epic 7 (Capabilities Storage)

---

### Epic 9: GitHub Auth & Multi-Tenancy

> **ADR:** ADR-040 | **Status:** 🔶 PROPOSED

**Objectif:** Modele d'authentification hybride: **Local** (zero-auth) et **Cloud** (GitHub OAuth + API Key + BYOK).

**Data Isolation Model:**
- **GLOBAL (shared):** mcp_tools, tool_graph, embeddings, capabilities
- **PRIVATE (per user_id):** dag_executions, traces, secrets, configs

**Livrables cles:**
- Auth schema + Drizzle migrations
- GitHub OAuth flow (`/auth/github`, `/auth/callback`)
- Auth middleware (route protection, API key validation)
- Landing page & Dashboard UI (auth-aware)
- Rate limiting & data isolation
- BYOK secrets management (AES-256-GCM)

**Estimation:** 6 stories, ~1-2 semaines

---

### Epic 10: DAG Capability Learning & Unified APIs

> **Status:** 🔶 PROPOSED

**Objectif:** Unifier les APIs d'execution et enrichir le learning depuis les DAG executes.

**Livrables cles:**
- Unified `pml_execute` API (code + DAG modes)
- DAG-to-Capability promotion automatique
- Execution replay depuis capabilities
- API versioning strategy (v1/v2)

**Estimation:** 4-5 stories

---

### Epic 11: Learning from Traces (GRU TransitionModel)

> **ADRs:** ADR-053, ADR-055 | **Status:** 🚧 ACTIVE

**Objectif:** Extraire des patterns et capabilities depuis les traces d'execution historiques via **GRU TransitionModel**.

**Architecture GRU:**
- **Input:** Intent embedding (1024-dim) + context sequence (tools déjà exécutés)
- **Output:** Next tool prediction + termination probability (threshold 0.7)
- **Training:** Subprocess non-bloquant avec PER (Prioritized Experience Replay)

**Livrables cles:**
- GRU TransitionModel pour prédiction séquentielle (remplace DR-DSP)
- Trace analysis pipeline avec goal termination detection
- Pattern extraction depuis historical data
- Training subprocess avec PER (ADR-053)
- Préservation embeddings 1024-dim (ADR-055)

**Estimation:** 3-4 stories

---

### Epic 12: Speculative Execution Arguments

> **Status:** 🚧 ACTIVE

**Objectif:** Ameliorer la speculation en predisant non seulement les tools mais aussi leurs arguments.

**Livrables cles:**
- Argument prediction via historical patterns
- Template-based argument inference
- Confidence scoring for argument predictions
- Rollback for incorrect argument speculation

**Estimation:** 2-3 stories

---

### Epic 13: Capability Naming & Curation

> **Status:** 🚧 ACTIVE

**Objectif:** Permettre aux utilisateurs de nommer, organiser et curater leurs capabilities.

**Livrables cles:**
- Capability naming UI
- Tags and categories system
- Capability sharing (public/private)
- Capability versioning

**Estimation:** 3-4 stories

---

### Epic 14: Client/Server Architecture & JSR Package

> **ADR:** ADR-052 | **Status:** 🚧 ACTIVE (v0.2.11+ published)

**Objectif:** Architecture client/serveur séparée avec package JSR et routing hybride intelligent.

**Architecture:**
- **Client (`@casys/pml`):** CLI léger, sandbox local, MCP bridge vers Claude Code
- **Server (`pml.casys.ai`):** Gateway cloud, GraphRAG, capability registry, trace storage
- **Communication:** MCP Protocol (JSON-RPC 2.0) sur HTTP avec session management

**Routing Hybride (Two-Phase Execution):**
1. Cloud analyse le code et décide: `execute_locally` vs `execute_on_server`
2. Client tools (filesystem, shell, git) → exécution locale
3. Server tools (APIs, memory, cloud services) → exécution serveur

**Livrables cles:**
- JSR package `@casys/pml` (v0.2.11+ ✅)
- `pml serve` (HTTP) et `pml stdio` (MCP transport)
- Session management avec heartbeat et reconnexion auto
- Routing hybride basé sur analyse statique du code
- `pml upgrade` command

**Estimation:** 4-5 stories

---

### Epic 15: CasysDB Native Engine (Rust)

> **Status:** 📋 BACKLOG (Draft)

**Objectif:** Remplacer PGlite par un moteur Rust natif pour performance et embedded deployment.

**Livrables cles:**
- Rust core avec vector similarity search
- FFI bindings pour Deno
- Migration path depuis PGlite
- Benchmarks vs PGlite

**Estimation:** 8-10 stories, ~2-3 mois

**Note:** Long-term investment, not prioritized for near-term roadmap.

---

### Epic 16: MCP Apps UI Orchestration

> **Status:** ✅ READY

**Objectif:** Permettre aux capabilities de generer des UI components orchestres via MCP.

**Livrables cles:**
- UI component schema dans capabilities
- Preview mode pour UI components
- Component library integration
- Live UI updates via SSE

**Estimation:** 5-6 stories

**Note:** Desktop app development deprioritized; focus on web-based UI orchestration.

---

### Epic Sequence Summary

```
COMPLETED (Epics 1-6)
  └── Foundation, DAG, Sandbox, Speculation, Memory, Discovery, Monitoring

ACTIVE DEVELOPMENT
  ├── Epic 7: Emergent Capabilities ──────────── 🚧 IN PROGRESS (Story 7.1 done)
  ├── Epic 11: Learning from Traces ──────────── 🚧 ACTIVE
  ├── Epic 12: Speculative Arguments ─────────── 🚧 ACTIVE
  ├── Epic 13: Capability Curation ───────────── 🚧 ACTIVE
  └── Epic 14: JSR Package & Routing ─────────── 🚧 ACTIVE

PROPOSED (Ready for prioritization)
  ├── Epic 9: GitHub Auth & Multi-Tenancy ────── 🔶 PROPOSED
  ├── Epic 10: DAG Learning & Unified APIs ───── 🔶 PROPOSED
  └── Epic 16: MCP Apps UI Orchestration ─────── ✅ READY

BACKLOG (Long-term)
  ├── Epic 8: Hypergraph Visualization ───────── 📋 BACKLOG
  └── Epic 15: CasysDB Rust Engine ───────────── 📋 BACKLOG (Draft)
```

> **Note:** Detailed story specifications available in [epics.md](./epics.md)

---

## Out of Scope

### Fonctionnalités Déférées Post-MVP

**1. Speculation déplacée IN-SCOPE (Epic 3.5)**

- ~~Rationale: Besoin validation empirique que ça fonctionne réellement (>70% hit rate)~~
- **UPDATE 2025-11-14:** Speculation est maintenant IN-SCOPE dans Epic 3.5 (après sandbox)
- **Rationale:** Speculation WITH sandbox = THE feature safe (isolation + rollback)
- Timeline: Epic 3.5 (après Epic 3 Sandbox)

**2. Plugin System pour API Translation**

- Rationale: Pas de cas d'usage bloquants sans plugins day-1
- Timeline: v1.1 si demand utilisateur

**3. Visual Observability Dashboard** ✅ MOVED IN-SCOPE (Epic 6)

- ~~Rationale: Telemetry backend + logs CLI suffisent pour MVP~~
- **UPDATE 2025-12-15:** Dashboard maintenant IN-SCOPE via Epic 6 (COMPLETED)
- Cytoscape.js visualization, real-time SSE events, metrics panel

**4. Edge Deployment (Deno Deploy/Cloudflare Workers)**

- Rationale: Local-first simplifie debugging MVP, architecture edge-ready dès le début
- Timeline: v1.1 si demand production deployment

**5. Docker/Container Deployment**

- Rationale: Problèmes npx + filesystem volumes observés avec AIRIS
- Timeline: Post-MVP si résolution des problèmes d'architecture

**6. Advanced Caching (Event-Based Invalidation)**

- Rationale: TTL-based cache suffit MVP
- Timeline: v2+ si usage stats montrent besoin

### Fonctionnalités Non-MVP

**7. Multi-Tenancy & Team Features** ✅ MOVED IN-SCOPE (Epic 9)

- ~~Pas de support teams/organisations MVP~~
- **UPDATE 2025-12-09:** Multi-tenancy maintenant IN-SCOPE via Epic 9
- GitHub OAuth + API Key + BYOK pour mode Cloud
- Voir ADR-040 pour architecture complète

**8. Enterprise Features**

- SSO, audit logs, SLA guarantees
- Timeline: Conditional on enterprise demand

**9. Business Model & Monetization**

- **Open Core Freemium** (aligné avec research report)
- **Free Tier MVP:** Core features open-source, 3 MCP servers limit (conversion funnel)
- **Pro Tier:** $15/mo - Unlimited servers, DAG execution, priority support (Phase 1: Mois 3-6)
- **Team Tier:** $25/user/mo - Shared configs, team dashboard, analytics (Phase 2: Mois 7-18)
- **Enterprise Tier:** $50-75/user/mo + $10K platform fee - SSO, RBAC, SOC2, SLAs (Phase 3: Mois
  19-36)
- **Rationale:** Sustainable freemium comble gap entre "100% free" (Smithery/Unla) et
  "enterprise-only" (Kong/IBM)
- **Target:** $5M ARR dans 3 ans (realistic scenario, voir research report pour détails)

**10. Support Protocols Non-MCP**

- Uniquement MCP stdio/SSE supportés
- Pas de REST, GraphQL, ou autres protocols custom
