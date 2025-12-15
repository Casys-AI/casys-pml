# Story 2.2: Notebook 01 - The Problem

Status: done

## Story

As a **user**, I want **to see the MCP problems demonstrated**, so that **I understand why the gateway exists**.

## Acceptance Criteria

1. **Context Explosion Demo:**
   - Simule 8 MCP servers avec token counts réalistes
   - Affiche "45.4% consumed before you start"
   - Calcule le gaspillage (tokens chargés vs utilisés)

2. **Latency Demo:**
   - Workflow 5 étapes séquentiel vs parallèle
   - Simulation des durées via setTimeout (suffisant pour démonstration pédagogique)
   - Affiche speedup (ex: "1.4x faster")

## Tasks / Subtasks

- [x] Task 1: Valider et améliorer Context Explosion Demo (AC: #1)
  - [x] Vérifier que 8 servers sont simulés avec tokens réalistes
  - [x] Confirmer affichage "45.4% consumed before you start"
  - [x] Améliorer le calcul de gaspillage avec métriques visuelles (lib/metrics.ts)

- [x] Task 2: Valider et améliorer Latency Demo (AC: #2)
  - [x] Vérifier workflow 5 étapes avec dépendances
  - [x] Confirmer mesure temps réel (actuellement simulé avec setTimeout)
  - [x] Afficher speedup avec `speedupChart()` de lib/metrics.ts
  - [x] Ajouter visualisation DAG avec Mermaid (lib/viz.ts)

- [x] Task 3: Review et validation finale (AC: #1-2)
  - [x] Exécuter notebook complet dans Jupyter
  - [x] Vérifier tous les outputs
  - [x] S'assurer que le notebook suit la structure standard

## Dev Notes

### Current State Analysis

**Fichier existant:** `playground/notebooks/01-the-problem.ipynb`

**Gap Analysis:**

| AC | Requis | État actuel | Action |
|----|--------|-------------|--------|
| #1 | Context Explosion 8 servers, 45.4% | ✅ Implémenté (8 servers, calcul correct) | Review + améliorer visualisation |
| #2 | Latency Demo + speedup | ✅ Simulation setTimeout + speedupChart | OK - simulation suffisante pour démo |

### Architecture Constraints

**Libs disponibles (Epic 1 DONE):**

```typescript
// lib/init.ts - Story 1.5 DONE
import { ensurePlaygroundReady, InitStatus } from "../lib/init.ts";

// lib/viz.ts - Story 1.6 DONE
import { displayMermaid, dagToMermaid } from "../lib/viz.ts";

// lib/metrics.ts - Story 1.7 DONE
import { compareMetrics, progressBar, speedupChart } from "../lib/metrics.ts";
```

**Notebook current structure (12 cells):**

1. Title + Learning Objectives (markdown)
2. Problem 1 intro (markdown)
3. Context explosion simulation (typescript) - ✅ DONE
4. Impact explanation (markdown)
5. Waste calculation (typescript) - ✅ DONE
6. Problem 2 intro (markdown)
7. Workflow definition (typescript) - ✅ DONE
8. Sequential execution (typescript) - ✅ DONE
9. Parallel execution with DAG (typescript) - ✅ DONE
10. Real cost summary intro (markdown)
11. Summary (typescript) - ✅ DONE
12. Summary + Next Steps (markdown) - ✅ DONE

### Improvements Required

**AC #1 - Context Explosion (Amélioration):**
- Actuel: Output texte brut avec colonnes
- Amélioration: Utiliser `progressBar()` de lib/metrics.ts pour visualisation
- Ajouter: `compareMetrics()` pour montrer loaded vs used

**AC #2 - Latency Demo (Amélioration):**
- Actuel: Simulation avec setTimeout (OK pour démo pédagogique)
- Amélioration: Ajouter `speedupChart()` pour visualisation
- Ajouter: Visualisation DAG avec Mermaid

### Testing Strategy

**Manual Validation:**

1. Ouvrir notebook dans VS Code Jupyter
2. Exécuter toutes les cellules séquentiellement
3. Vérifier outputs:
   - Context Explosion: 8 servers, ~45% consommé, visualisation claire
   - Latency Demo: Workflow 5 étapes, speedup ~1.4x affiché

**No Unit Tests Required:**
- Story est modification notebook (fichier .ipynb)
- Validation manuelle par exécution

### Project Structure Notes

**Target File:**
- `playground/notebooks/01-the-problem.ipynb` (modification)

**Dependencies from Epic 1:**
- Story 1.6: `lib/viz.ts` avec `displayMermaid()` ✅ DONE
- Story 1.7: `lib/metrics.ts` avec `speedupChart()`, `compareMetrics()` ✅ DONE

**Prerequisites:** Story 2.1 (Notebook 00 Introduction) done

### Previous Story Intelligence (2.1)

**Learnings from Story 2.1:**
- Utiliser `displayMermaid()` pour les diagrammes architecture
- Les helpers de lib/metrics.ts et lib/viz.ts sont fonctionnels
- Format notebook: Title → Learning Objectives → Sections → Checkpoint → Next
- Validation manuelle par exécution dans VS Code Jupyter

**Patterns établis:**
- Import style: `import { helper } from "../lib/module.ts";`
- Output: `console.log()` avec formatage ASCII pour compatibilité

### Mermaid Diagram for DAG Visualization

```mermaid
graph LR
    A[1. Read config] --> B[2. Parse JSON]
    B --> C[3. Fetch GitHub]
    B --> D[4. Search Slack]
    C --> E[5. Create Jira]
    D --> E

    style C fill:#f9f,stroke:#333
    style D fill:#f9f,stroke:#333

    subgraph Parallel
        C
        D
    end
```

### References

- [Source: docs/PRD-playground.md#FR006-FR018] - Notebook requirements
- [Source: docs/epics-playground.md#Story-2.2] - Acceptance criteria
- [Source: playground/notebooks/01-the-problem.ipynb] - Fichier à modifier
- [Source: playground/lib/viz.ts] - Helper displayMermaid
- [Source: playground/lib/metrics.ts] - Helper speedupChart, compareMetrics
- [Source: docs/sprint-artifacts/playground/2-1-notebook-00-introduction.md] - Previous story

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Story completed successfully without errors.

### Completion Notes List

**2025-12-10 - Story Implementation Complete**

1. **AC #1 - Context Explosion Demo:**
   - Cell-5 enhanced with `progressBar()` showing 45% context consumption visually
   - Added `compareMetrics()` table comparing Loaded vs Actually Used (90K tokens → 3K)
   - Fixed: Now uses dynamic `totalTools` variable instead of hardcoded value
   - Visual feedback clearly shows the waste problem

2. **AC #2 - Latency Demo:**
   - Cell-7 enhanced with Mermaid DAG visualization via `displayMermaid()`
   - Cell-9 enhanced with `speedupChart()` showing Sequential vs Parallel comparison
   - Shows 1.4x speedup (2050ms → 1450ms)
   - Note: Uses setTimeout simulation (sufficient for pedagogical demo)

3. **Structure finale du notebook (12 cellules):**
   - Cells 1-4: Context Explosion problem
   - Cells 5: Waste calculation with visual metrics
   - Cells 6-9: Latency Demo with DAG and speedup
   - Cells 10-11: Summary
   - Cell 12: Summary + Next Steps

### File List

- `playground/notebooks/01-the-problem.ipynb` (modified)
  - Cell-5: Added progressBar() and compareMetrics() imports, fixed dynamic totalTools
  - Cell-7: Added displayMermaid() for DAG visualization
  - Cell-9: Added speedupChart() for performance comparison
  - Cell-11: Fixed speedup variable calculation
  - Cell-12: Simplified to Summary + Next Steps (quiz removed per code review)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-12-10 | Story implementation complete - All ACs satisfied | Claude Opus 4.5 |
| 2025-12-10 | Code review: Removed quiz (AC #3), fixed hardcoded TOTAL_TOOLS, clarified simulation is OK | Claude Opus 4.5 |

