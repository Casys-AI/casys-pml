# AgentCards Product Requirements Document (PRD)

**Author:** BMad
**Date:** 2025-11-03
**Project Level:** 2
**Target Scale:** 1-2 epics, 5-15 stories total

---

## Goals and Background Context

### Goals

1. **Optimiser le contexte LLM** - Réduire la consommation de contexte par les tool schemas de 30-50% à <5%, permettant aux développeurs de récupérer 90% de leur fenêtre conversationnelle
2. **Paralléliser l'exécution des workflows** - Réduire la latence des workflows multi-tools de 5x à 1x via DAG execution, éliminant les temps d'attente cumulatifs
3. **Supporter 15+ MCP servers simultanément** - Permettre l'activation de 15+ MCP servers sans dégradation de performance, débloquant l'utilisation complète de l'écosystème MCP

### Background Context

L'écosystème Model Context Protocol (MCP) connaît une adoption explosive avec des centaines de servers disponibles, mais se heurte à deux goulots d'étranglement critiques qui limitent drastiquement son utilisation réelle.

Premièrement, la **"taxe invisible" du contexte** : 30-50% de la context window LLM est consommée uniquement par les schemas des tools MCP avant toute interaction utile, forçant les développeurs à s'auto-limiter à 7-8 servers maximum au lieu des 15-20+ qu'ils souhaiteraient utiliser. Deuxièmement, **l'inefficacité des appels séquentiels** : les workflows multi-tools s'exécutent sans parallélisation, créant une latence cumulative pénible (5 tools = 5x le temps d'attente).

**Le marché des gateways MCP est encombré** avec de nombreuses tentatives de solutions : AIRIS, Smithery, Unla, Context Forge, agentgateway, mcp-gateway-registry, lazy gateway, et d'autres. Cependant, **aucune ne résout de manière satisfaisante les deux problèmes simultanément** :
- Certains promettent le lazy loading mais l'implémentation est défaillante ou incomplète
- D'autres se concentrent uniquement sur l'orchestration sans optimiser le contexte
- La majorité reste en approche "all-at-once" qui sature la context window
- Aucune ne combine vector search sémantique ET DAG execution de manière production-ready

AgentCards se différencie par une approche **PGlite-first, zero-config, et double optimisation** : vector search sémantique pour le chargement on-demand granulaire (<5% de contexte) ET DAG execution pour la parallélisation intelligente (latence 5x → 1x). L'architecture edge-ready et le focus DX irréprochable (NPS >75 target) visent à devenir la solution de référence là où d'autres ont échoué sur l'exécution.

---

## Requirements

### Functional Requirements

**Context Optimization**
- **FR001:** Le système doit générer des embeddings vectoriels pour tous les tool schemas MCP disponibles
- **FR002:** Le système doit effectuer une recherche sémantique pour identifier les top-k tools pertinents (k=3-10) basé sur l'intent utilisateur
- **FR003:** Le système doit charger les tool schemas on-demand uniquement pour les tools identifiés comme pertinents
- **FR004:** Le système doit maintenir la consommation de contexte par les tool schemas en-dessous de 5% de la context window totale

**DAG Execution & Orchestration**
- **FR005:** Le système doit analyser les dépendances input/output entre tools pour construire un graphe de dépendances (DAG)
- **FR006:** Le système doit identifier automatiquement les tools exécutables en parallèle vs séquentiellement
- **FR007:** Le système doit exécuter simultanément les branches indépendantes du DAG
- **FR008:** Le système doit streamer les résultats via SSE dès leur disponibilité pour feedback progressif

**MCP Server Management**
- **FR009:** Le système doit auto-découvrir les MCP servers disponibles (stdio et SSE) sans configuration manuelle
- **FR010:** Le système doit effectuer des health checks automatiques sur les MCP servers au démarrage
- **FR011:** Le système doit supporter 15+ MCP servers actifs simultanément sans dégradation de performance

**Storage & Persistence**
- **FR012:** Le système doit stocker tous les embeddings, schemas, et metadata dans un fichier PGlite unique portable
- **FR013:** Le système doit cacher les tool schemas pour éviter les rechargements répétitifs

**Observability**
- **FR014:** Le système doit tracker les métriques de consommation de contexte et latence d'exécution (opt-in)
- **FR015:** Le système doit générer des logs structurés pour debugging et monitoring

**Migration & Setup**
- **FR016:** Le système doit pouvoir lire le mcp.json existant de Claude Code et générer automatiquement la configuration AgentCards correspondante

**Code Execution & Sandbox**
- **FR017:** Le système doit permettre l'exécution de code TypeScript généré par les agents dans un environnement Deno sandbox isolé avec permissions explicites
- **FR018:** Le système doit supporter les **branches DAG safe-to-fail** : tâches sandbox pouvant échouer sans compromettre le workflow global, permettant resilient workflows, graceful degradation, et retry safety
- **FR019:** Le système doit injecter les MCP tools pertinents dans le contexte d'exécution sandbox via vector search, permettant aux agents d'appeler les tools directement depuis le code TypeScript

### Non-Functional Requirements

- **NFR001: Performance** - Le système doit exécuter un workflow typique de 5 tools avec une latence P95 <3 secondes (amélioration 5x vs exécution séquentielle baseline)

- **NFR002: Usability (Zero-Config)** - Le système doit permettre à un utilisateur de passer de l'installation initiale au premier workflow parallélisé fonctionnel en moins de 10 minutes sans configuration manuelle

- **NFR003: Reliability** - Le système doit maintenir un taux de succès >99% pour l'exécution des workflows (pas de bugs critiques bloquants comme observés chez les compétiteurs)

---

## User Journeys

### Journey 1: Premier Workflow Parallélisé avec AgentCards

**Acteur:** Alex, Power User développeur (utilise Claude Code 10h/jour, 15 MCP servers installés)

**Objectif:** Passer d'une configuration MCP saturant le contexte à AgentCards avec context optimisé et workflows parallélisés

**Étapes:**

**1. Setup AgentCards** (3-5 min)
- Alex exécute `agentcards init` dans son terminal
- AgentCards lit automatiquement le `mcp.json` existant de Claude Code
- Détecte les 15 MCP servers configurés (GitHub, Filesystem, Database, Playwright, Serena, etc.)
- Génère `~/.agentcards/config.yaml` avec la configuration migrée
- Génère les embeddings vectoriels pour tous les tools (~60s via BGE-Large-EN-v1.5)
- Stocke tout dans `.agentcards.db` (PGlite portable)
- ✅ Console: "15 MCP servers migrés et indexés avec succès"

**2. Migration Config Claude Code** (2 min)
- AgentCards affiche les instructions de migration
- Alex édite son `claude_desktop_config.json` (mcp.json)
- **Retire** les 15 entrées MCP servers individuelles
- **Ajoute** uniquement la gateway AgentCards:
  ```json
  {
    "mcpServers": {
      "agentcards": {
        "command": "agentcards",
        "args": ["serve"]
      }
    }
  }
  ```
- Redémarre Claude Code
- Claude voit maintenant un seul MCP server au lieu de 15

**3. Premier Workflow - Context Libéré** (1-2 min)
- Alex fait une requête cross-MCP: "Lis config.json, parse-le, et crée un ticket GitHub avec les infos"
- AgentCards intercepte la requête depuis Claude
- **Vector search:** Identifie 3 tools pertinents (filesystem:read, json:parse, github:create_issue)
- **Context optimization:** Charge uniquement ces 3 schemas (~2% du contexte vs 45% avant)
- **DAG execution:** Détecte dépendances séquentielles (read → parse → create)
- Exécute le workflow, résultats streamés via SSE
- Console AgentCards: "Context usage: 2.3% | Workflow completed in 4.2s"

**4. "Aha Moment" - Parallélisation (<10 min total)**
- Alex teste un workflow parallélisable: "Lis 3 fichiers différents: config.json, package.json, README.md"
- AgentCards détecte que les 3 lectures sont indépendantes
- **DAG execution:** Exécute les 3 filesystem:read en parallèle (Promise.all)
- Latence: 1.8s au lieu de 5.4s (3x amélioration mesurée)
- 💡 **Réalisation:** "Je peux activer tous mes MCP servers ET avoir des workflows ultra-rapides!"

**5. Utilisation Continue**
- Alex continue à utiliser Claude Code normalement
- AgentCards tourne en arrière-plan (daemon transparent)
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

Pour un outil backend comme AgentCards, l'UX se concentre sur la **Developer Experience (DX)**. Principes clés:

**1. Transparence et Feedback**
- Messages console clairs et informatifs à chaque étape
- Progress bars pour opérations longues (génération embeddings)
- Logs structurés avec niveaux appropriés (error, warn, info, debug)
- Métriques visibles (context usage %, latency) après chaque workflow

**2. Zero-Friction Setup**
- Installation en une commande (`agentcards init`)
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
- Dashboard CLI optionnel (`agentcards status`) pour vue d'ensemble

---

## User Interface Design Goals

Pas d'interface graphique MVP, mais output console optimisé:

**1. Console Output Structurée**
- Couleurs pour statut (vert=success, rouge=error, jaune=warning)
- Tableaux formatés pour métriques (context usage, latency)
- ASCII art minimal pour branding (logo AgentCards au démarrage)

**2. Logging Levels**
- Default: Info (setup steps, workflow results)
- Quiet mode (`--quiet`): Errors only
- Verbose mode (`--verbose`): Debug traces

**3. Interactive Prompts (si nécessaire)**
- Confirmation avant migration destructive
- Opt-in pour telemetry (explicit consent)

---

## Epic List

### Epic 1: Project Foundation & Context Optimization Engine

**Objectif:** Établir l'infrastructure projet et implémenter le système de context optimization via vector search sémantique

**Livrables clés:**
- Repository configuré avec CI/CD et structure Deno
- PGlite + pgvector fonctionnel avec embeddings storage
- Vector search sémantique opérationnel (<100ms queries)
- On-demand schema loading via MCP protocol
- Migration tool (`agentcards init`) fonctionnel

**Estimation:** 7-8 stories

---

### Epic 2: DAG Execution & Production Readiness

**Objectif:** Implémenter la parallélisation des workflows via DAG execution et préparer le système pour production

**Livrables clés:**
- Dependency graph construction automatique
- Parallel executor avec SSE streaming
- Gateway MCP intégré avec Claude Code
- Health checks et observability
- Tests end-to-end et production hardening

**Note architecturale:** Le **DAG** (instance de workflow spécifique) est distinct du **GraphRAG** (Epic 1 - base de connaissances globale). GraphRAG stocke tous les tools et patterns historiques ; le DAG Suggester interroge GraphRAG pour prédire quel DAG construire pour une tâche donnée ; le DAG Executor exécute ce DAG (possiblement spéculativement). Le speculative execution n'est possible que grâce à cette architecture : GraphRAG (la connaissance) → DAG Suggester (l'intelligence) → DAG (le plan d'exécution).

**Estimation:** 6-7 stories

---

### Epic 3: Agent Code Execution & Local Processing

**Objectif:** Implémenter un sandbox d'exécution sécurisé pour permettre aux agents d'écrire et exécuter du code TypeScript localement, traitant les large datasets avant injection dans le contexte LLM

**Livrables clés:**
- Deno sandbox executor avec isolation et sécurité
- MCP tools injection dans code context (vector search-guided)
- Local data processing pipeline (filtrage/agrégation pré-contexte)
- Nouveau tool MCP `agentcards:execute_code`
- PII detection et tokenization automatique
- Code execution caching et optimizations
- Documentation et tests E2E complets

**Estimation:** 8 stories (3.1 à 3.8)

**Value Proposition:** Réduction additionnelle de contexte (<5% → <1% pour large datasets), protection automatique des données sensibles, et traitement local des données volumineuses (1MB+ → <1KB dans contexte)

**Architectural Benefit (Safe-to-Fail Branches + Speculative Execution):** L'isolation du sandbox permet de créer des **branches DAG safe-to-fail** : des tâches qui peuvent échouer sans compromettre le workflow global. Contrairement aux appels MCP (effets de bord possibles comme création de fichiers ou issues GitHub), le code sandbox est **idempotent et isolé**.

Cette propriété débloque la **vraie puissance du speculative execution** (Epic 2) : avec les MCP tools directs, l'exécution spéculative est risquée (prédiction incorrecte = side effect indésirable), mais avec le sandbox, tu peux :
- **Prédire et exécuter** plusieurs approches simultanément sans risque
- **Échouer gracieusement** si les prédictions sont incorrectes (pas de corruption)
- **Retry en toute sécurité** sans duplication d'effets
- **A/B test en production** avec plusieurs algorithmes en parallèle

Le combo **Speculative Execution (Epic 2) + Safe-to-Fail Branches (Epic 3)** transforme le DAG executor en système de **speculative resilience** : exécuter plusieurs hypothèses simultanément, conserver les succès, ignorer les échecs.

---

**Séquence:** Epic 1 → Epic 2 → Epic 3 (chaque epic build sur le précédent). Epic 3 est complémentaire aux Epics 1-2, ajoutant code execution comme alternative aux tool calls directs pour les cas d'usage avec large datasets.

> **Note:** Detailed epic breakdown with full story specifications is available in [epics.md](./epics.md)

---

## Out of Scope

### Fonctionnalités Déférées Post-MVP

**1. Speculative Execution & Tool Prediction**
- Rationale: Besoin validation empirique que ça fonctionne réellement (>70% hit rate)
- Timeline: v1.1+ si tests concluants post-MVP

**2. Plugin System pour API Translation**
- Rationale: Pas de cas d'usage bloquants sans plugins day-1
- Timeline: v1.1 si demand utilisateur

**3. Visual Observability Dashboard**
- Rationale: Telemetry backend + logs CLI suffisent pour MVP
- Timeline: v1.2+ si friction analysis manuelle trop lourde

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

**7. Multi-Tenancy & Team Features**
- Pas de support teams/organisations MVP
- Focus: développeur individuel

**8. Enterprise Features**
- SSO, audit logs, SLA guarantees
- Timeline: Conditional on enterprise demand

**9. Monetization/Managed Service**
- 100% gratuit open-source MVP
- Pas de paywall ou features premium

**10. Support Protocols Non-MCP**
- Uniquement MCP stdio/SSE supportés
- Pas de REST, GraphQL, ou autres protocols custom
