# Story 3.4: Refaire Notebook 05 avec Vrai CapabilityStore

**Status:** ready-for-dev

## Story

As a **user**,
I want **notebook 05 to use the real CapabilityStore**,
So that **I see capabilities vraiment persistées et recherchées**.

## Acceptance Criteria

1. Remplacer `SimulatedCapabilityStore` par `getCapabilityStore()` du helper
2. Les capabilities sont vraiment stockées dans PGlite (vérifiable via query)
3. La recherche par intent utilise les vrais embeddings (ou mock réaliste)
4. Le tracking de reliability utilise le vrai mécanisme
5. Afficher les vraies stats de la DB (count, success_rate, etc.)
6. `resetPlaygroundState()` appelé en début de notebook pour état propre

## Tasks / Subtasks

- [ ] Task 1: Update notebook initialization (AC: 1, 6)
  - [ ] 1.1: Add import from playground/lib/capabilities.ts
  - [ ] 1.2: Call resetPlaygroundState() at notebook start
  - [ ] 1.3: Replace SimulatedCapabilityStore instantiation with getCapabilityStore()
- [ ] Task 2: Refactor Demo 1 - Eager Learning (AC: 1, 2)
  - [ ] 2.1: Use real saveCapability() method
  - [ ] 2.2: Verify capability appears in PGlite via direct query
  - [ ] 2.3: Show actual code_hash generated
- [ ] Task 3: Refactor Demo 2 - Code Deduplication (AC: 2, 4)
  - [ ] 3.1: Use real UPSERT behavior (ON CONFLICT)
  - [ ] 3.2: Show usage_count incrementing in DB
  - [ ] 3.3: Display actual success_rate calculation
- [ ] Task 4: Refactor Demo 3 - Search by Intent (AC: 3)
  - [ ] 4.1: Use real searchByIntent() with embeddings
  - [ ] 4.2: Show semantic similarity scores from vector search
  - [ ] 4.3: Display HNSW index query results
- [ ] Task 5: Refactor Demo 4 - Reliability Tracking (AC: 4, 5)
  - [ ] 5.1: Use real updateUsage() for tracking
  - [ ] 5.2: Show actual success_rate evolution in DB
  - [ ] 5.3: Query and display real aggregate stats
- [ ] Task 6: Update Capabilities Table visualization (AC: 5)
  - [ ] 6.1: Replace simulated data with real getAllCapabilities() query
  - [ ] 6.2: Show actual DB column values
  - [ ] 6.3: Add "Source: PGlite in-memory" indicator

## Dev Notes

### Current SimulatedCapabilityStore Analysis

The current implementation in notebook 05 (cell `cell-capability-store`):

```typescript
class SimulatedCapabilityStore {
  private capabilities = new Map<string, SimulatedCapability>();
  async saveCapability(input): Promise<{ capability, isNew }>
  searchByIntent(query, threshold): SimulatedCapability[]
  getAllCapabilities(): SimulatedCapability[]
  async getByHash(code): Promise<SimulatedCapability | undefined>
  reset(): void
}
```

### Real CapabilityStore API

From `src/capabilities/capability-store.ts`:

```typescript
class CapabilityStore {
  constructor(db: PGliteClient, embeddingModel: EmbeddingModel, schemaInferrer?: SchemaInferrer)
  async saveCapability(input: SaveCapabilityInput): Promise<SaveCapabilityResult>
  async findByCodeHash(codeHash: string): Promise<Capability | null>
  async updateUsage(codeHash: string, success: boolean, durationMs: number): Promise<void>
  async searchByIntent(intent: string, limit?: number, minSemanticScore?: number): Promise<CapabilitySearchResult[]>
  async getStats(): Promise<CapabilityStats>
}
```

### Key API Differences

| SimulatedCapabilityStore | Real CapabilityStore |
|-------------------------|---------------------|
| `saveCapability({code, intent, success, durationMs})` | `saveCapability({code, intent, durationMs, success?, toolsUsed?})` |
| `searchByIntent(query, threshold)` | `searchByIntent(intent, limit?, minSemanticScore?)` |
| Returns `SimulatedCapability` | Returns `Capability` with full schema |
| In-memory Map | PGlite with pgvector |
| Keyword matching | BGE-M3 embeddings + cosine similarity |

### Migration Pattern for Each Cell

```typescript
// BEFORE (simulated)
const capabilityStore = new SimulatedCapabilityStore();
const result = await capabilityStore.saveCapability({
  code: codeSnippet,
  intent: "read config",
  success: true,
  durationMs: 150
});

// AFTER (real)
import { getCapabilityStore, resetPlaygroundState } from "../lib/capabilities.ts";

await resetPlaygroundState(); // Fresh state
const capabilityStore = await getCapabilityStore();
const result = await capabilityStore.saveCapability({
  code: codeSnippet,
  intent: "read config",
  durationMs: 150,
  success: true
});
```

### Verifying PGlite Storage

Add verification cells to show data is really in DB:

```typescript
// Direct query to show capability in DB
const db = await getDatabase();
const result = await db.query(`
  SELECT id, code_hash, name, usage_count, success_rate
  FROM workflow_pattern
  ORDER BY created_at DESC
  LIMIT 5
`);
console.table(result.rows);
```

### Embedding Indicator

Show users whether using real or mock embeddings:

```typescript
const status = await getPlaygroundStatus();
console.log(`Embedding Model: ${status.embedding ? "BGE-M3 (real)" : "Mock (deterministic hash)"}`);
```

### Files to Modify

- `playground/notebooks/05-capability-learning.ipynb` - Main refactor
- `playground/lib/capabilities.ts` - May need `getDatabase()` export

### References

- [Source: src/capabilities/capability-store.ts] - CapabilityStore class
- [Source: playground/notebooks/05-capability-learning.ipynb] - Current notebook
- [Source: ADR-028] - Eager Learning pattern

## Dev Agent Record

### Context Reference

Story created from Epic 3 definition in `docs/epics-playground.md`
Depends on Story 3.1 for helper infrastructure

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Analyzed SimulatedCapabilityStore vs real CapabilityStore API
- Identified all cells needing migration
- Added verification patterns for PGlite

### File List

Files to modify:
- `playground/notebooks/05-capability-learning.ipynb` (REFACTOR)
- `playground/lib/capabilities.ts` (ADD getDatabase export if needed)
