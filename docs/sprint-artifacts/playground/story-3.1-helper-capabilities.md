# Story 3.1: Helper Capabilities pour Notebooks

**Status:** ready-for-dev

## Story

As a **notebook author**,
I want **a helper that exposes the real CapabilityStore, CapabilityMatcher, and AdaptiveThresholdManager**,
So that **notebooks can use the production code instead of simulations**.

## Acceptance Criteria

1. `playground/lib/capabilities.ts` exporte:
   - `getCapabilityStore()` - retourne le vrai CapabilityStore connecté à PGlite
   - `getCapabilityMatcher()` - retourne le vrai CapabilityMatcher
   - `getAdaptiveThresholdManager()` - retourne le vrai AdaptiveThresholdManager
2. Initialisation lazy (créé au premier appel, réutilisé ensuite)
3. Utilise PGlite in-memory pour les notebooks (pas besoin de persistence)
4. Mock minimal pour embeddings si nécessaire (ou vrai modèle BGE-M3 si disponible)
5. Fonction `resetPlaygroundState()` pour réinitialiser entre les démos

## Tasks / Subtasks

- [ ] Task 1: Create playground/lib/capabilities.ts (AC: 1, 2)
  - [ ] 1.1: Import real components from src/capabilities/ and src/mcp/
  - [ ] 1.2: Create lazy singleton pattern for PGlite in-memory DB
  - [ ] 1.3: Implement `getCapabilityStore()` with lazy init
  - [ ] 1.4: Implement `getCapabilityMatcher()` with lazy init
  - [ ] 1.5: Implement `getAdaptiveThresholdManager()` with lazy init
- [ ] Task 2: Handle embedding model (AC: 4)
  - [ ] 2.1: Try to load real EmbeddingModel (BGE-M3)
  - [ ] 2.2: Create MockEmbeddingModel fallback if loading fails
  - [ ] 2.3: Mock should generate deterministic pseudo-embeddings from text hash
- [ ] Task 3: Implement reset function (AC: 5)
  - [ ] 3.1: Implement `resetPlaygroundState()` that clears all singletons
  - [ ] 3.2: Ensures fresh state for each notebook demo section
- [ ] Task 4: Add helper functions for notebook demos
  - [ ] 4.1: `isRealSystemAvailable()` - check if using real vs mock components
  - [ ] 4.2: `getPlaygroundStatus()` - return { db, embedding, store, matcher, threshold } availability
- [ ] Task 5: Test the helper in isolation
  - [ ] 5.1: Verify PGlite in-memory initializes correctly
  - [ ] 5.2: Verify CapabilityStore can save/search capabilities
  - [ ] 5.3: Verify CapabilityMatcher can find matches
  - [ ] 5.4: Verify AdaptiveThresholdManager tracks thresholds
  - [ ] 5.5: Verify reset clears state properly

## Dev Notes

### Architecture Alignment

This helper must bridge the playground notebooks with the production capability system:

```
Production Code (src/)              Playground Helper              Notebooks
─────────────────────────          ────────────────────          ──────────
src/capabilities/                   playground/lib/               playground/notebooks/
  ├── capability-store.ts    ──►     capabilities.ts     ◄──     05-capability-learning.ipynb
  ├── matcher.ts             ──►       getCapabilityStore()       06-emergent-reuse.ipynb
  └── executor.ts                      getCapabilityMatcher()
src/mcp/                               getAdaptiveThresholdManager()
  └── adaptive-threshold.ts  ──►       resetPlaygroundState()
```

### Key Source Components

| Component | Location | Key Methods |
|-----------|----------|-------------|
| `CapabilityStore` | `src/capabilities/capability-store.ts` | `saveCapability()`, `searchByIntent()`, `updateUsage()` |
| `CapabilityMatcher` | `src/capabilities/matcher.ts` | `findMatch()`, `computeTransitiveReliability()` |
| `AdaptiveThresholdManager` | `src/mcp/adaptive-threshold.ts` | `recordExecution()`, `adjustThresholds()`, `getThresholds()` |
| `EmbeddingModel` | `src/ai/embedding.ts` | `embed()`, `load()` |
| `PGliteClient` | `src/db/pglite.ts` | `connect()`, `query()`, `exec()` |

### PGlite In-Memory Configuration

For notebooks, use in-memory mode to avoid file system dependencies:

```typescript
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";

const db = new PGlite({
  extensions: { vector },
  // No dataDir = in-memory
});
```

### Embedding Model Strategy

1. **Try real model first**: Load BGE-M3 via `EmbeddingModel.load()`
2. **Fallback to mock**: If Hugging Face download fails or timeout, use deterministic mock:

```typescript
class MockEmbeddingModel {
  async embed(text: string): Promise<Float32Array> {
    // Deterministic pseudo-embedding from text hash
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    const arr = new Float32Array(1024);
    const hashArr = new Uint8Array(hash);
    for (let i = 0; i < 1024; i++) {
      arr[i] = (hashArr[i % hashArr.length] / 255) * 2 - 1; // [-1, 1]
    }
    return arr;
  }
}
```

### Lazy Singleton Pattern

```typescript
let _store: CapabilityStore | null = null;
let _matcher: CapabilityMatcher | null = null;
let _threshold: AdaptiveThresholdManager | null = null;
let _db: PGlite | null = null;

export async function getCapabilityStore(): Promise<CapabilityStore> {
  if (!_store) {
    const db = await getDatabase();
    const embedding = await getEmbeddingModel();
    _store = new CapabilityStore(db, embedding);
  }
  return _store;
}

export function resetPlaygroundState(): void {
  _store = null;
  _matcher = null;
  _threshold = null;
  _db?.close();
  _db = null;
}
```

### Database Schema Requirements

The helper must ensure the capability tables exist. Use migrations from `src/db/migrations/`:
- `workflow_pattern` table with pgvector HNSW index
- `capability_dependency` table for relationships
- `adaptive_thresholds` table for threshold learning

### Testing Standards

- No external network calls in tests (mock embeddings)
- Each test should call `resetPlaygroundState()` in beforeEach
- Verify in-memory DB doesn't persist between resets

### References

- [Source: src/capabilities/capability-store.ts] - CapabilityStore class (~922 LOC)
- [Source: src/capabilities/matcher.ts] - CapabilityMatcher class (~287 LOC)
- [Source: src/mcp/adaptive-threshold.ts] - AdaptiveThresholdManager (~394 LOC)
- [Source: src/ai/embedding.ts] - EmbeddingModel with BGE-M3
- [Source: ADR-028] - Eager Learning pattern
- [Source: ADR-038] - Capability Matching algorithm
- [Source: ADR-008] - Adaptive Thresholds with EMA

## Dev Agent Record

### Context Reference

Story created from Epic 3 definition in `docs/epics-playground.md`

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Story extracted from Epic 3: Connexion au Vrai Système
- Analyzed real source code to understand initialization patterns
- Added detailed dev notes with code patterns and references

### File List

Files to create/modify:
- `playground/lib/capabilities.ts` (NEW)
