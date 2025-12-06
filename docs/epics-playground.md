# Casys MCP Gateway Playground - Epic Breakdown

**Auteur:** BMad **Date:** 2025-11-28 **Niveau Projet:** 2 **Échelle Cible:** Playground éducatif

---

## Overview

Ce document détaille les epics et stories pour le playground pédagogique Casys MCP Gateway, tel que
défini dans le [PRD-playground.md](./PRD-playground.md).

**Epic Sequencing Principles:**

- Epic 1 établit l'infrastructure (doit être complété avant Epic 2)
- Les stories dans chaque epic sont séquentielles et construisent sur les précédentes
- Chaque story est dimensionnée pour une session de 2-4h

---

## Epic 1: Infrastructure Playground

**Goal:** Configurer l'environnement Codespace prêt à l'emploi avec devcontainer, MCP servers,
workflow templates, et helpers.

**Value:** Un développeur peut lancer le Codespace et avoir un environnement fonctionnel en < 5
minutes.

---

### Story 1.1: Devcontainer Configuration

**Status:** ✅ **DONE**

**As a** developer, **I want** to open the repo in GitHub Codespaces, **So that** I have a fully
configured environment without manual setup.

**Acceptance Criteria:**

1. ✅ `.devcontainer/playground/devcontainer.json` configure Deno 2.1.4
2. ✅ Extension Jupyter (ms-toolsai.jupyter) pré-installée
3. ✅ Extension Deno (denoland.vscode-deno) pré-installée
4. ✅ Ports 3000 (MCP Gateway) et 8888 (Jupyter Lab) exposés
5. ✅ Post-create script installe les dépendances (`post-create.sh`)
6. ✅ Dockerfile avec Deno + Jupyter + Python

**Prerequisites:** None

**Files:** `.devcontainer/playground/devcontainer.json`, `Dockerfile`, `post-create.sh`

---

### Story 1.2: MCP Servers Configuration

**As a** playground user, **I want** MCP servers pre-configured, **So that** I can run demos without
manual server setup.

**Acceptance Criteria:**

1. `playground/config/mcp-servers.json` contient 3 servers Tier 1:
   - `@modelcontextprotocol/server-filesystem`
   - `@modelcontextprotocol/server-memory`
   - `@modelcontextprotocol/server-sequential-thinking`
2. Paths configurés pour le workspace Codespace
3. Documentation inline expliquant chaque server

**Prerequisites:** Story 1.1

---

### Story 1.3: Workflow Templates Configuration

**As a** playground user, **I want** workflow templates pre-configured, **So that** I can see
GraphRAG patterns in action immediately.

**Acceptance Criteria:**

1. `playground/config/workflow-templates.yaml` contient 3+ workflows:
   - Parallélisation pure (3 outils indépendants)
   - Pattern récurrent (séquence filesystem → memory)
   - DAG multi-niveaux (dépendances entre niveaux)
2. Format compatible avec `agentcards workflows sync`
3. Commentaires expliquant chaque workflow

**Prerequisites:** Story 1.2

---

### Story 1.4: LLM API Key Setup Script

**Status:** ⚠️ **PARTIAL**

**As a** playground user, **I want** a simple way to configure my LLM API key, **So that** I don't
have to figure out the configuration myself.

**Ce qui existe:**

- ✅ `playground/.env.example` avec template des clés API
- ✅ `playground/lib/llm-provider.ts` avec auto-détection du provider (500+ lignes)
- ✅ Support OpenAI, Anthropic, Google via Vercel AI SDK

**Ce qui manque:**

- ❌ Script interactif `setup-api-key.ts` pour guider l'utilisateur

**Acceptance Criteria:**

1. ⚠️ `playground/scripts/setup-api-key.ts` script interactif (optionnel - .env.example suffit)
2. ✅ Détecte automatiquement le provider depuis le format de clé (`lib/llm-provider.ts`)
3. ⚠️ Crée/met à jour `.env` avec la bonne variable
4. ✅ Auto-détection provider dans `detectProvider()`
5. ✅ Gère les erreurs (clé invalide, format inconnu)

**Prerequisites:** Story 1.1

**Files existants:** `playground/.env.example`, `playground/lib/llm-provider.ts`

---

### Story 1.5: Idempotent Init Helper

**As a** notebook author, **I want** a helper that ensures the playground is ready, **So that** each
notebook can be run independently.

**Acceptance Criteria:**

1. `playground/lib/init.ts` exporte `ensurePlaygroundReady(options?)`
2. Vérifie si déjà initialisé (PGlite DB, embeddings)
3. Si non initialisé → run full init (MCP connect, workflows sync)
4. Si déjà initialisé → skip (< 100ms)
5. Option `verbose: true` pour afficher le détail (utilisé dans notebook 00)
6. Retourne status `{ initialized: boolean, mcpServers: string[], workflowsLoaded: number }`

**Prerequisites:** Stories 1.2, 1.3, 1.4

---

### Story 1.6: Mermaid Rendering Helper

**Status:** ✅ **DONE**

**As a** notebook author, **I want** to render Mermaid diagrams in notebooks, **So that** I can
visualize DAGs and architectures.

**Acceptance Criteria:**

1. ✅ `playground/lib/viz.ts` exporte `displayMermaid(diagram: string)`
2. ✅ Rendu via Kroki API (encodage pako + base64url)
3. ✅ Support Deno.jupyter pour output SVG natif
4. ✅ Fonctions spécialisées : `displayDag()`, `displayLayers()`, `displayGraphrag()`,
   `displayTimeline()`, `displayEvolution()`, `displayWorkflowEdges()`
5. ✅ Générateurs Mermaid : `dagToMermaid()`, `layersToMermaid()`, `graphragToMermaid()`,
   `executionTimelineToMermaid()`, `workflowEdgesToMermaid()`

**Prerequisites:** Story 1.1

**Files:** `playground/lib/viz.ts` (539 lignes)

---

### Story 1.7: Metrics Visualization Helper

**As a** notebook author, **I want** to display metrics visually, **So that** users can see
performance gains clearly.

**Acceptance Criteria:**

1. `playground/lib/metrics.ts` exporte helpers:
   - `progressBar(current, total, label)` - ASCII progress bar
   - `compareMetrics(before, after, labels)` - Side-by-side comparison
   - `speedupChart(sequential, parallel)` - Visualize speedup
2. Output compatible Jupyter (texte formaté)
3. Couleurs ANSI optionnelles (détection terminal)

**Prerequisites:** Story 1.1

---

### Story 1.8: Playground README

**Status:** ⚠️ **PARTIAL** (à mettre à jour)

**As a** potential user, **I want** a clear README explaining the playground, **So that** I
understand what it does and how to start.

**Ce qui existe:**

- ✅ `playground/README.md` avec Quick Start et badge Codespaces
- ✅ Badge "Open in GitHub Codespaces" fonctionnel
- ✅ Liste des outils MCP disponibles
- ✅ Requirements et Environment Variables

**Ce qui manque:**

- ❌ Table des notebooks mise à jour (actuellement anciens notebooks 01-08)
- ❌ Section "What is this?" expliquant le problème MCP
- ❌ Nouvelle séquence 00-06

**Acceptance Criteria:**

1. ⚠️ `playground/README.md` avec sections:
   - ❌ What is this? (1 paragraphe sur le problème MCP)
   - ✅ Quick Start (Open in Codespace badge + 3 étapes)
   - ❌ Notebook Overview (table des 7 notebooks 00-06)
   - ❌ Troubleshooting (FAQ communes)
2. ✅ Badge "Open in GitHub Codespaces" fonctionnel
3. ⚠️ Screenshots/GIFs optionnels

**Prerequisites:** Stories 1.1-1.7

**Files existants:** `playground/README.md`

---

## Epic 2: Notebooks Pédagogiques

**Goal:** Créer la séquence de notebooks propre (00-06) avec progression claire et checkpoints.

**Value:** Un développeur comprend le paradigme AgentCards (exécution de code → capability learning
→ réutilisation) en ~2h de travail interactif.

---

### Story 2.1: Notebook 00 - Introduction

**As a** new user, **I want** an introduction notebook, **So that** I understand what I'm about to
learn and verify my environment.

**Acceptance Criteria:**

1. Learning Objectives (5 bullet points)
2. Architecture Overview (diagramme Mermaid)
3. Environment Check (exécute `ensurePlaygroundReady({ verbose: true })`)
4. Notebook Roadmap (table des 6 notebooks suivants)
5. Quick Start cell (vérifie Deno, imports, API key)

**Prerequisites:** Epic 1 complete

---

### Story 2.2: Notebook 01 - The Problem

**As a** user, **I want** to see the MCP problems demonstrated, **So that** I understand why the
gateway exists.

**Acceptance Criteria:**

1. Context Explosion Demo:
   - Simule 8 MCP servers avec token counts réalistes
   - Affiche "45.4% consumed before you start"
   - Calcule le gaspillage (tokens chargés vs utilisés)
2. Latency Demo:
   - Workflow 5 étapes séquentiel vs parallèle
   - Mesure temps réel (pas simulé)
   - Affiche speedup (ex: "1.4x faster")
3. Checkpoint: Quiz 3 questions sur les problèmes identifiés

**Prerequisites:** Story 2.1

---

### Story 2.3: Notebook 02 - Context Optimization

**As a** user, **I want** to see how vector search reduces context, **So that** I understand the
first solution mechanism.

**Acceptance Criteria:**

1. Explication: Comment fonctionne l'embedding et la recherche vectorielle
2. Demo Live:
   - Charge les 3 MCP servers (filesystem, memory, sequential-thinking)
   - Montre tous les outils disponibles (~25 outils)
   - Query "read a file" → retourne top 3 outils pertinents
   - Affiche réduction: "25 tools → 3 tools = 88% reduction"
3. Métriques: Tokens avant/après avec `compareMetrics()`
4. Checkpoint: Exercice "trouver les bons outils pour X"

**Prerequisites:** Story 2.2

---

### Story 2.4: Notebook 03 - DAG Execution

**As a** user, **I want** to see DAG parallelization in action, **So that** I understand how
workflows are optimized.

**Acceptance Criteria:**

1. Explication: DAG, dépendances, niveaux d'exécution
2. Demo Live:
   - Workflow avec branches parallèles (filesystem + memory + time simulé)
   - Visualisation DAG avec Mermaid
   - Exécution séquentielle (mesure temps)
   - Exécution parallèle (mesure temps)
   - Affiche speedup avec `speedupChart()`
3. Interactive: User peut modifier le workflow et re-exécuter
4. Checkpoint: Dessiner le DAG d'un workflow donné

**Prerequisites:** Story 2.3

---

### Story 2.5: Notebook 04 - Code Execution & Worker RPC

**As a** user, **I want** to see how code executes with MCP tool access, **So that** I understand
how the Worker RPC Bridge enables safe tool usage from sandbox.

**Acceptance Criteria:**

1. Explication: Worker RPC Bridge architecture (ADR-032)
2. Demo Live:
   - Exécute code TypeScript qui appelle des MCP tools via RPC
   - Montre le tracing natif (tool_start, tool_end events)
   - Tente une opération interdite → erreur claire
3. Use Case: Code qui lit un fichier via MCP et le traite
4. Checkpoint: Écrire du code appelant 2 MCP tools

**Prerequisites:** Story 2.4

---

### Story 2.6: Notebook 05 - Capability Learning

**As a** user, **I want** to see how capabilities emerge from code execution, **So that** I
understand the learning system.

**Acceptance Criteria:**

1. Explication: Eager Learning (store on 1st success), workflow_pattern table
2. Demo Live:
   - Exécute du code avec intent → capability créée immédiatement
   - Montre le storage (code_snippet, intent_embedding, usage_count)
   - Query via `search_capabilities` tool → trouve la capability
3. Visualisation: Table des capabilities avec stats
4. Checkpoint: Trouver une capability matching un intent donné

**Prerequisites:** Story 2.5

---

### Story 2.7: Notebook 06 - Emergent Capability Reuse

**As a** user, **I want** to see how to reuse learned capabilities, **So that** I can skip code
generation for proven patterns.

**Acceptance Criteria:**

1. Explication: Capability Matching vs code generation, Suggestion Engine
2. Demo Live:
   - Match intent → retrieve cached capability
   - Exécute capability sans régénération Claude
   - Montre les suggestions proactives du Suggestion Engine
   - Capability injection dans Worker context (inline functions)
3. Interactive: Créer et réutiliser une capability custom
4. Checkpoint: Créer une capability et la réutiliser par intent
5. Next Steps: Liens vers documentation Epic 7, contribution

**Prerequisites:** Story 2.6

---

### Story 2.8: Cleanup Old Notebooks

**As a** maintainer, **I want** to clean up the old notebooks, **So that** the playground is
organized and not confusing.

**Acceptance Criteria:**

1. Archive les anciens notebooks dans `playground/notebooks/archive/`
2. Supprime les doublons (01-sandbox-basics vs 01-the-problem, etc.)
3. Renomme les fichiers si nécessaire pour la séquence 00-06
4. Met à jour les liens internes entre notebooks
5. Vérifie que tous les imports fonctionnent

**Prerequisites:** Stories 2.1-2.7

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

## Summary

| Epic                   | Stories        | Status                                   | Estimated Remaining |
| ---------------------- | -------------- | ---------------------------------------- | ------------------- |
| Epic 1: Infrastructure | 8 stories      | 2 DONE, 2 PARTIAL, 4 TODO                | ~8-12h              |
| Epic 2: Notebooks      | 8 stories      | 0 DONE (notebooks exist but need rework) | ~16-24h             |
| **Total**              | **16 stories** |                                          | **~24-36h**         |

### Epic 1 Status Detail

| Story                  | Status     | Notes                                              |
| ---------------------- | ---------- | -------------------------------------------------- |
| 1.1 Devcontainer       | ✅ DONE    | Complet avec Dockerfile, post-create.sh            |
| 1.2 MCP Config         | ❌ TODO    | Manque `playground/config/mcp-servers.json`        |
| 1.3 Workflow Templates | ❌ TODO    | Manque `playground/config/workflow-templates.yaml` |
| 1.4 API Key Setup      | ⚠️ PARTIAL | .env.example + llm-provider.ts existent            |
| 1.5 Init Helper        | ❌ TODO    | Manque `ensurePlaygroundReady()`                   |
| 1.6 Mermaid Helper     | ✅ DONE    | `lib/viz.ts` très complet (539 lignes)             |
| 1.7 Metrics Helper     | ❌ TODO    | Manque progressBar, speedupChart                   |
| 1.8 README             | ⚠️ PARTIAL | Existe mais liste anciens notebooks                |

### Bonus Already Implemented

- `playground/lib/llm-provider.ts` - Multi-LLM support (OpenAI, Anthropic, Google)
- `playground/server.ts` - Serveur MCP HTTP complet

**Implementation Order:**

1. Epic 1 (1.2 → 1.3 → 1.5 → 1.7 → 1.8) - Compléter infrastructure
2. Epic 2 (2.1 → 2.8) - Notebooks build on infrastructure

**For implementation:** Use the `create-story` workflow to generate individual story implementation
plans from this epic breakdown.
