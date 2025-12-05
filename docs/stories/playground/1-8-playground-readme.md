# Story 1.8: Playground README

Status: Ready for Review

## Story

As a **potential user**,
I want **a clear README explaining the playground**,
so that **I understand what it does, why it exists, and how to start**.

## Acceptance Criteria

1. `playground/README.md` contient une section "What is this?" (1 paragraphe sur le problème MCP et la solution)
2. Quick Start section avec badge "Open in GitHub Codespaces" fonctionnel + 3 étapes max
3. Notebook Overview table mise à jour avec la nouvelle séquence de notebooks
4. Section "Lib Helpers" documentant les modules disponibles (init, viz, metrics, llm-provider)
5. Section Troubleshooting/FAQ avec les problèmes communs
6. Sections optionnelles : Screenshots/GIFs de démos

## Tasks / Subtasks

- [x] Task 1: Écrire section "What is this?" (AC: #1)
  - [x] 1-2 paragraphes expliquant le problème MCP (context explosion 30-50%, latency)
  - [x] Introduire Casys MCP Gateway comme solution (vector search, DAG, sandbox, GraphRAG)
  - [x] Ton engageant pour développeurs curieux
  - [x] Mentionner "pas de mocks - vrais serveurs MCP, vrais appels LLM"

- [x] Task 2: Mettre à jour Quick Start (AC: #2)
  - [x] Vérifier badge Codespaces fonctionne (URL correcte)
  - [x] 3 étapes max: Open Codespace → Configure API key → Run notebook 00
  - [x] Option Local Development maintenue mais simplifiée
  - [x] Temps estimé: "< 5 minutes to first notebook"

- [x] Task 3: Créer Notebook Overview table (AC: #3)
  - [x] Lister les notebooks actuels avec status (ancien vs nouveau)
  - [x] Indiquer la progression recommandée
  - [x] Pour chaque notebook: numéro, nom, description courte, status
  - [x] Note: Epic 2 (notebooks 2.1-2.8) créera la séquence finale 00-06

- [x] Task 4: Documenter Lib Helpers (AC: #4)
  - [x] `lib/init.ts` - `ensurePlaygroundReady()` pour idempotent init
  - [x] `lib/viz.ts` - Mermaid rendering (`displayMermaid`, `displayDag`, etc.)
  - [x] `lib/metrics.ts` - ASCII metrics (`progressBar`, `compareMetrics`, `speedupChart`)
  - [x] `lib/llm-provider.ts` - Multi-LLM support (OpenAI, Anthropic, Google)
  - [x] Exemple d'utilisation pour chaque module

- [x] Task 5: Ajouter Troubleshooting section (AC: #5)
  - [x] FAQ: "API key not working" → check .env, format auto-détecté
  - [x] FAQ: "MCP servers not connecting" → check gateway running
  - [x] FAQ: "Notebook stuck at embedding loading" → patience, first run ~2-3 min
  - [x] FAQ: "Mermaid diagrams not rendering" → Kroki API availability
  - [x] Links vers docs complètes si besoin

- [x] Task 6: Review et polish (AC: #1-6)
  - [x] Relire pour cohérence et ton
  - [x] Vérifier tous les liens
  - [ ] Optionnel: ajouter screenshot ou GIF de démo

## Dev Notes

### Requirements Context

**From PRD-playground.md:**
- FR001: Playground doit s'exécuter dans GitHub Codespace avec devcontainer
- FR002: Init via `agentcards init`
- NFR001: Temps de setup < 5 minutes
- NFR003: Documentation inline auto-explicative

**From epics-playground.md (Story 1.8):**
- README avec badge "Open in Codespace"
- Table des notebooks (séquence 00-06 à venir dans Epic 2)
- Troubleshooting FAQ
- Dépend de Stories 1.1-1.7 pour documenter l'infrastructure

### Architecture Constraints

**Existing Infrastructure:**
- `playground/README.md` - Existe déjà, à mettre à jour
- `playground/lib/init.ts` - Helper idempotent (Story 1.5)
- `playground/lib/viz.ts` - Mermaid rendering (Story 1.6)
- `playground/lib/metrics.ts` - ASCII metrics (Story 1.7)
- `playground/lib/llm-provider.ts` - Multi-LLM support (Story 1.4)

**Notebook Structure Actuelle:**
```
playground/notebooks/
├── 00-introduction.ipynb      # Nouveau - Epic 2
├── 01-sandbox-basics.ipynb    # Ancien
├── 01-the-problem.ipynb       # Nouveau - Epic 2
├── 02-context-injection.ipynb # Ancien
├── 02-context-optimization.ipynb # Nouveau - Epic 2
├── 03-dag-execution.ipynb     # Nouveau - Epic 2
├── 03-dag-workflows.ipynb     # Ancien (détaillé)
├── 04-mcp-discovery.ipynb     # Ancien
├── 04-sandbox-security.ipynb  # Nouveau - Epic 2
├── 05-context-injection.ipynb # Doublon
├── 05-mcp-usage.ipynb         # Ancien
├── 06-llm-integration.ipynb   # Ancien
├── 07-security-demo.ipynb     # Ancien
├── 08-controlled-executor.ipynb # Ancien (avancé)
└── 09-workflow-templates.ipynb  # Ancien (détaillé)
```

**Note:** Epic 2 (Stories 2.1-2.8) nettoiera et finalisera la séquence.
Le README doit documenter l'état actuel tout en préparant la transition.

### Project Structure Notes

**Target File:**
- `playground/README.md` (modification du fichier existant)

**Related Documentation:**
- `docs/PRD-playground.md` - Source pour "What is this?"
- `docs/epics-playground.md` - Source pour notebook progression

### Learnings from Previous Stories

**From Story 1-5 (Init Helper) - Completed:**
- Pattern pour helpers: exports at top, types, implementation
- `.env` contient AGENTCARDS_DB_PATH et AGENTCARDS_WORKFLOW_PATH
- Gateway check via HTTP fetch
- 9 tests passing

**From Story 1-7 (Metrics Helper) - Completed:**
- ASCII-based output pour compatibilité Jupyter
- Couleurs ANSI optionnelles (désactivées par défaut)
- 26 tests passing
- CLI demo disponible

**Patterns établis dans lib/:**
- Chaque module a des exports clairs at top
- Types TypeScript bien définis
- Tests dans fichier `_test.ts` séparé
- Support `import.meta.main` pour démo CLI

[Source: docs/stories/playground/1-5-idempotent-init-helper.md#Completion-Notes]
[Source: docs/stories/playground/1-7-metrics-visualization-helper.md#Completion-Notes]

### Testing Strategy

**Manual Validation:**
1. Badge Codespaces ouvre le bon devcontainer
2. Liens internes fonctionnent
3. Examples de code sont corrects et copiables
4. Structure markdown rend bien sur GitHub

**No Unit Tests Required:**
- Story purement documentation/README
- Validation manuelle suffisante

### References

- [Source: docs/PRD-playground.md] - Background context et goals
- [Source: docs/epics-playground.md#Story-1.8] - Acceptance criteria détaillés
- [Source: playground/README.md] - Fichier existant à modifier
- [Source: playground/lib/*.ts] - Modules à documenter

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Links vérifiés: docs/index.md, docs/architecture.md, config/README.md, docs/adrs/, docs/PRD.md

### Completion Notes List

- **Task 1:** Rédigé section "What is this?" avec explication du problème context explosion (30-50%) et présentation de Casys MCP Gateway (Vector Search, DAG, Sandbox, GraphRAG). Ton engageant avec TL;DR et mention "no mocks".
- **Task 2:** Quick Start mis à jour avec badge Codespaces fonctionnel (URL: `codespaces.new/Casys-AI/AgentCards?devcontainer_path=...`), 3 étapes claires, option local maintenue, temps estimé < 5 minutes.
- **Task 3:** Créé table Notebook Overview avec deux séries (Epic 2 nouvelle séquence + Legacy détaillée), status pour chaque notebook, note sur consolidation future.
- **Task 4:** Documenté tous les Lib Helpers avec exemples de code:
  - `lib/init.ts`: `ensurePlaygroundReady()`, `getPlaygroundDbPath()`
  - `lib/viz.ts`: 7 fonctions display* documentées
  - `lib/metrics.ts`: 5 fonctions documentées avec exemples ASCII
  - `lib/llm-provider.ts`: 4 fonctions avec providers supportés
- **Task 5:** Section Troubleshooting complète avec 5 FAQ: API key, MCP servers, embedding loading, Mermaid diagrams, Jupyter kernel.
- **Task 6:** Review complet, liens vérifiés et corrigés (docs/README.md → docs/index.md), ajout lien architecture.md.

### Change Log

- 2025-12-05: Complete README rewrite implementing all acceptance criteria

### File List

- `playground/README.md` - Modified (complete rewrite)

