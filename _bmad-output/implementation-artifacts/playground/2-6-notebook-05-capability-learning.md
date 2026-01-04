# Story 2.6: Notebook 05 - Capability Learning

Status: done

## Story

As a playground user,
I want to see how capabilities emerge from code execution,
So that I understand the procedural memory system that makes the agent "learn to do" rather than just "know facts."

## Acceptance Criteria

1. **Explication Theorique: Les 3 types de memoire humaine**
   - Memoire semantique (faits) → C'est ce que fait RAG
   - Memoire episodique (evenements) → Historique de conversation
   - **Memoire procedurale (gestes)** → PERSONNE ne fait ca pour les agents... jusqu'a maintenant
   - Analogie: "Apprendre a faire du velo" vs "savoir que Paris est la capitale"
   - Diagramme Mermaid: Code execute → Succes → Capability stockee

2. **Demo Live - Eager Learning (stockage immediat)**
   - Execute du code avec intent explicite
   - Capability creee **immediatement** a la 1ere execution reussie (pas besoin d'attendre 3+ patterns)
   - Montre le storage: `code_snippet`, `intent_embedding`, `usage_count`, `success_rate`
   - Query via `search_capabilities` → retrouve la capability par intent similaire
   - Affiche le code hash pour deduplication

3. **Demo Live - Reliability Tracking**
   - Execute la meme capability plusieurs fois (mix succes/echecs)
   - Montre l'evolution du `success_rate` (rolling average)
   - Explique: "Le systeme privilegie les capabilities fiables lors des suggestions"
   - Formula: `success_rate = success_count / usage_count`

4. **Visualisation Table des Capabilities**
   - Table formatee avec colonnes: `name`, `usage_count`, `success_rate`, `avg_duration_ms`, `last_used`
   - Tri par `usage_count DESC` pour montrer les plus utilisees
   - Colorisation optionnelle par fiabilite (vert >85%, jaune >60%, rouge <60%)

5. **Checkpoint: Quiz "Qu'est-ce qui differencie la memoire procedurale?"**
   - 3-5 questions a choix multiples sur les concepts cles
   - Verification des reponses avec explication
   - Connexion avec le notebook 06 (Emergent Reuse)

## Tasks / Subtasks

- [x] Task 1: Creer la structure du notebook avec learning objectives (AC: #1)
  - [x] Creer `playground/notebooks/05-capability-learning.ipynb`
  - [x] Ajouter titre, objectifs d'apprentissage (5 bullet points)
  - [x] Ajouter la cellule d'initialisation (import des dependances)

- [x] Task 2: Implementer l'explication theorique (AC: #1)
  - [x] Markdown expliquant les 3 types de memoire humaine avec tableau comparatif
  - [x] Diagramme Mermaid du cycle: Intent → Code → Execution → Success → Capability Storage
  - [x] Analogie concrete (velo)
  - [x] Lien avec le paper plan (Section 3.2 Capability Learning)

- [x] Task 3: Construire le MockCapabilityStore pour les demos (AC: #2, #3)
  - [x] Creer une classe `SimulatedCapabilityStore` qui imite le comportement du vrai store
  - [x] Methode `saveCapability(code, intent, success, durationMs)` avec deduplication par hash
  - [x] Methode `searchByIntent(intent)` avec Jaccard similarity
  - [x] Stockage en memoire (Map) pour persistance entre cellules

- [x] Task 4: Implementer la demo Eager Learning (AC: #2)
  - [x] Cellule de code qui execute une "capability" (ex: lire fichier + parser JSON)
  - [x] Afficher le storage immediat: `{codeHash, intent, usageCount: 1, successRate: 1.0}`
  - [x] Executer une 2eme fois avec intent different mais code identique → montrer le hit par hash
  - [x] Executer une recherche par intent similaire → montrer le match semantique

- [x] Task 5: Implementer la demo Reliability Tracking (AC: #3)
  - [x] Simuler 10 executions avec mix succes/echecs (70% succes)
  - [x] Afficher l'evolution du success_rate apres chaque execution
  - [x] Graphique ASCII montrant l'evolution temporelle
  - [x] Expliquer le filtrage par seuil adaptatif (AdaptiveThresholdManager)

- [x] Task 6: Implementer la visualisation table (AC: #4)
  - [x] Creer plusieurs capabilities fictives avec stats variees
  - [x] Fonction `displayCapabilitiesTable(capabilities)` formatee pour console
  - [x] Tri par usage_count
  - [x] Labels de fiabilite (HIGH/MED/LOW) - ANSI retire car non supporte

- [~] Task 7: Implementer le checkpoint quiz (AC: #5) - SKIPPED per user request
  - [~] Quiz removed - replaced with Key Takeaways section
  - [x] Teaser pour notebook 06 (composition et reuse)

- [x] Task 8: Ajouter resume et next steps
  - [x] Points cles du notebook
  - [x] Connexion avec notebook 06 (Emergent Reuse)
  - [x] References au paper plan

## Dev Notes

### Architecture Pattern: Eager Learning (ADR-028)

Le systeme utilise **Eager Learning** au lieu d'attendre des patterns repetes:

```
┌─────────────────────────────────────────────────────────────────┐
│  1ere EXECUTION REUSSIE                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Code execute avec succes                                        │
│       │                                                          │
│       ▼                                                          │
│  hashCode(normalizedCode) → code_hash unique                    │
│       │                                                          │
│       ▼                                                          │
│  embeddingModel.encode(intent) → intent_embedding               │
│       │                                                          │
│       ▼                                                          │
│  INSERT INTO workflow_pattern                                    │
│    ON CONFLICT (code_hash) DO UPDATE                            │
│      usage_count = usage_count + 1                              │
│      success_rate = success_count / usage_count                 │
│                                                                  │
│  ✅ Capability IMMEDIATEMENT disponible pour reuse               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Pourquoi Eager Learning?**
- Storage cheap (~2KB/capability)
- Filtrage lazy au moment des suggestions (pas du stockage)
- Permet decouverte de capabilities one-shot utiles
- ON CONFLICT garantit deduplication naturelle par code_hash

### Key Files Implementation

```
src/capabilities/capability-store.ts     → CapabilityStore class (922 LOC)
  - saveCapability()                     → UPSERT with code_hash deduplication
  - searchByIntent()                     → Vector search on intent_embedding
  - updateUsage()                        → Increment stats after re-execution
  - getStats()                           → Aggregate statistics

src/capabilities/hash.ts                 → hashCode() function (SHA-256)
src/capabilities/types.ts                → Capability, CacheConfig interfaces
src/capabilities/schema-inferrer.ts      → SWC-based parameter inference
```

### Database Schema (workflow_pattern table)

```sql
-- Relevant columns for this notebook:
code_snippet        TEXT          -- Le code TypeScript stocke
code_hash           TEXT UNIQUE   -- SHA-256 pour deduplication
intent_embedding    VECTOR(1024)  -- BGE-M3 embedding pour search
usage_count         INTEGER       -- Nombre d'executions
success_count       INTEGER       -- Nombre de succes
success_rate        REAL          -- success_count / usage_count
avg_duration_ms     INTEGER       -- Temps moyen d'execution
last_used           TIMESTAMPTZ   -- Derniere utilisation
name                TEXT          -- Nom genere ou manuel
description         TEXT          -- Intent original
source              TEXT          -- 'emergent' ou 'manual'
```

### Success Rate Calculation

```typescript
// Dans saveCapability() - incremental update
success_rate = (success_count + (success ? 1 : 0)) / (usage_count + 1)

// Formule equivalente a la moyenne cumulee:
// new_rate = old_rate + (new_success - old_rate) / new_count
```

### Simulated Implementation for Notebook

Le notebook utilisera une implementation simplifiee pour la demo:

```typescript
class SimulatedCapabilityStore {
  private capabilities = new Map<string, SimulatedCapability>();

  async saveCapability(input: {
    code: string;
    intent: string;
    success: boolean;
    durationMs: number;
  }): Promise<SimulatedCapability> {
    const codeHash = await this.hashCode(input.code);
    const existing = this.capabilities.get(codeHash);

    if (existing) {
      // Update existing
      existing.usageCount++;
      if (input.success) existing.successCount++;
      existing.successRate = existing.successCount / existing.usageCount;
      existing.avgDurationMs = (existing.avgDurationMs * (existing.usageCount - 1) + input.durationMs) / existing.usageCount;
      existing.lastUsed = new Date();
      return existing;
    }

    // Create new (Eager Learning!)
    const capability: SimulatedCapability = {
      id: crypto.randomUUID(),
      codeHash,
      codeSnippet: input.code,
      intent: input.intent,
      usageCount: 1,
      successCount: input.success ? 1 : 0,
      successRate: input.success ? 1.0 : 0.0,
      avgDurationMs: input.durationMs,
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    this.capabilities.set(codeHash, capability);
    return capability;
  }

  async searchByIntent(query: string, threshold = 0.5): Promise<SimulatedCapability[]> {
    // Simplified: keyword matching for demo
    const queryWords = query.toLowerCase().split(/\s+/);
    return [...this.capabilities.values()]
      .filter(cap => {
        const intentWords = cap.intent.toLowerCase().split(/\s+/);
        const matches = queryWords.filter(w => intentWords.includes(w)).length;
        return matches / queryWords.length >= threshold;
      })
      .sort((a, b) => b.usageCount - a.usageCount);
  }
}
```

### Testing Standards (Follow notebooks 00-04)

- Chaque cellule doit etre executable independamment
- Utiliser `await displayMermaid()` pour les diagrammes
- Console output avec formatage clair (═══, ───)
- Checkpoint exercises avec verification des reponses
- Reset du state simule au debut de chaque section

### Previous Story Context (2-5: Code Execution & Worker RPC)

Notebook 04 a etabli:
- Architecture Worker RPC Bridge (ADR-032)
- Tracing natif des tool calls (tool_start, tool_end)
- Sandbox security model (permissions: "none")
- Les traces capturees sont le **fondement du capability learning**

**Connexion:**
> "Ce notebook montre comment les traces capturees dans 04 deviennent des capabilities reutilisables."

### Paper Alignment (PROCEDURAL-MEMORY-PAPER-PLAN.md)

**Section 3.2 Capability Learning:**
- Eager storage on first execution ✓
- Code hashing for deduplication ✓
- UPSERT with statistics tracking ✓

**Metrics to demonstrate:**
- `usage_count` - Nombre d'executions
- `success_rate` - Fiabilite
- `avg_duration_ms` - Performance

### Visualization Helper (reuse from lib/viz.ts)

```typescript
// Already available:
import { displayMermaid } from "../lib/viz.ts";

// Pour le diagramme du cycle capability:
const capabilityCycleDiagram = `
flowchart TB
    I[Intent: 'read config file'] --> C[Code Generation]
    C --> E[Sandbox Execution]
    E --> T{Success?}
    T -->|Yes| S[Store Capability]
    T -->|No| F[Track Failure]
    S --> U[Update Stats]
    F --> U
    U --> N[Next Execution...]
    N -->|Same Intent| M{Match Found?}
    M -->|Yes| R[Reuse Capability]
    M -->|No| C
    R --> E
`;
```

### Project Structure Notes

- Notebook location: `playground/notebooks/05-capability-learning.ipynb`
- Imports from: `playground/lib/viz.ts`, `playground/lib/metrics.ts`
- Source references: `src/capabilities/capability-store.ts`, `src/capabilities/types.ts`
- Suivre la numerotation: `05-` pour etre apres `04-code-execution.ipynb`

### References

- [Source: src/capabilities/capability-store.ts] - CapabilityStore class implementation
- [Source: src/capabilities/types.ts] - Capability, CacheConfig interfaces
- [Source: src/capabilities/hash.ts] - hashCode SHA-256 function
- [Source: docs/adrs/ADR-028-emergent-capabilities-system.md] - Architecture decision
- [Source: docs/adrs/ADR-027-execute-code-graph-learning.md] - Graph learning (superseded by ADR-032)
- [Source: docs/PROCEDURAL-MEMORY-PAPER-PLAN.md] - Paper plan Section 3.2
- [Source: docs/epics-playground.md#Story-2.6] - Story definition

### Anti-Patterns to Avoid

1. **NE PAS** utiliser le vrai CapabilityStore - utiliser une simulation
2. **NE PAS** spawn de Worker reel - simuler le comportement
3. **NE PAS** faire de vraies recherches vectorielles - mock avec keyword matching
4. **NE PAS** oublier de reset le state entre les demos independantes
5. **NE PAS** dupliquer le code de viz.ts - reutiliser les helpers existants

### Differentiator vs Competitors (pour le quiz)

| Approche | Learning | Schema Inference | Reliability |
|----------|----------|------------------|-------------|
| Skill Libraries (CodeBERT) | Statique | Manuel | Non |
| Code Retrieval (Copilot) | Pre-entraine | Non | Non |
| Anthropic Skills | Manuel | Implicite | Non |
| **Casys PML** | Runtime/Eager | AST Auto | Transitive |

## Dev Agent Record

### Context Reference

- Story context: `docs/sprint-artifacts/playground/2-6-notebook-05-capability-learning.md`
- Epic context: `docs/epics-playground.md#Story-2.6`
- Paper alignment: `docs/PROCEDURAL-MEMORY-PAPER-PLAN.md` (Section 3.2)

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Jupyter notebook deliverable (interactive execution)

### Completion Notes List

- All 5 Acceptance Criteria implemented (AC5 skipped per user request, replaced with Key Takeaways)
- SimulatedCapabilityStore class demonstrates core concepts without production dependencies
- Mermaid diagrams use Kroki.io API for server-side SVG rendering
- Code review passed 2025-12-15: 0 HIGH, 2 MEDIUM (fixed), 2 LOW issues

### File List

- `playground/notebooks/05-capability-learning.ipynb` (NEW) - Main deliverable
- `playground/lib/viz.ts` (DEPENDENCY) - displayMermaid() for diagram rendering
- `playground/lib/metrics.ts` (DEPENDENCY) - Not directly used, available for future
- `src/capabilities/capability-store.ts` (REFERENCE) - Production implementation (922 LOC)
- `src/capabilities/types.ts` (REFERENCE) - Capability interfaces
- `src/capabilities/hash.ts` (REFERENCE) - SHA-256 hashing function
