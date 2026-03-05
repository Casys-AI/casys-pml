# Task 14: Live Training Post-Run — Implementation Plan

**Goal:** After each `vault-exec run`, automatically re-index new/changed notes, re-run GNN forward pass, and retrain the GRU using ALL traces (synthetic + real).

**Context:** Currently `run` records the trace in DuckDB but does NOT retrain. The GRU only learns during `init`. This means the system never improves from usage.

---

## Step 1: Extract retraining logic from `init.ts` into `retrain.ts`

**File:** Create `src/retrain.ts`

The init function currently does everything (embed + GNN + synthetic traces + GRU train). We need a reusable `retrain()` that:
1. Re-indexes notes (embed new/changed only — hash check)
2. Runs GNN forward pass on full graph
3. Loads ALL traces from DuckDB (synthetic + real)
4. Builds training examples from all traces (not just synthetic)
5. Trains GRU for N epochs (warm-start from existing weights if available)
6. Saves updated weights

```typescript
export interface RetrainResult {
  notesReindexed: number;
  gnnUpdated: boolean;
  tracesUsed: number;
  gruAccuracy: number;
}

export async function retrain(
  notes: VaultNote[],
  dbPath: string,
  embedder: Embedder,
): Promise<RetrainResult>
```

**Key difference from init:**
- `init` generates synthetic traces → `retrain` loads ALL traces from DB
- `init` always trains from scratch → `retrain` warm-starts from existing weights
- `retrain` is designed to be fast (skip unchanged embeddings, few epochs)

## Step 2: Fix trace deduplication in `init.ts`

**File:** Modify `src/init.ts`

Currently `init` re-inserts synthetic traces every time it runs (duplicates). Fix:
- Before generating synthetic traces, check which already exist in DB
- Only insert new ones (match by path signature)

## Step 3: Use ALL traces for GRU training (not just synthetic)

**File:** Modify `src/retrain.ts` (extracted from init)

Currently init line 122 does:
```typescript
const examples = syntheticTraces.map(...)  // ONLY synthetic!
```

Fix: load all traces from DB via `db.getAllTraces()` and build examples from both synthetic and real traces. Real traces with intent embeddings are especially valuable.

## Step 4: Wire `retrain()` into CLI `run` command

**File:** Modify `src/cli.ts`

After trace recording in the `run` command, call `retrain()`:

```typescript
// After: "Trace recorded."
console.log("\nRetraining...");
const { retrain } = await import("./retrain.ts");
const result = await retrain(notes, vaultDbPath, embedder);
console.log(`✓ Retrained: ${result.tracesUsed} traces, accuracy=${(result.gruAccuracy * 100).toFixed(1)}%`);
```

**Design decision:** Synchronous, not async worker. vault-exec vaults are small (tens of notes, not thousands). Training takes <1s. No need for worker complexity.

## Step 5: Add `--no-train` flag to `run`

For cases where you want to skip retraining (debugging, benchmarking):

```typescript
.option("--no-train", "Skip live retraining after execution")
```

## Step 6: Tests

**File:** Create `src/retrain_test.ts`

- Test that retrain uses both synthetic and real traces
- Test that retrain doesn't duplicate synthetic traces
- Test warm-start: accuracy after retrain >= accuracy before
- Test that new notes get embedded and GNN-enriched

## Commit Plan

```
1. feat(vault-exec): extract retrain.ts from init logic
2. fix(vault-exec): deduplicate synthetic traces in init
3. feat(vault-exec): retrain uses all traces (synthetic + real)
4. feat(vault-exec): wire live retrain into CLI run
5. test(vault-exec): retrain tests
```

## Risks

- **GRU overfitting on few traces:** With only 8-15 traces, training can overfit fast. Mitigation: cap epochs at 5 for live retrain, use early stopping.
- **Embedding model loading time:** BGE-M3 takes ~3s to load. If no new notes, skip entirely.
- **DuckDB lock contention:** Not an issue — vault-exec is single-process CLI.

---

## Addendum: Confirm Mode & Contrastive Learning (implemented same day)

**See:** `2026-03-04-negative-traces.md` for full details.

### Summary
- `--confirm` flag: propose 3 candidates + "none", wait for selection
- Rejected candidates stored as negative traces (`success: false`)
- Trainer uses contrastive loss: positives attract, negatives repulse (×−0.5)
- Breaks the self-confirmation loop where GRU trains on its own predictions
- AI-friendly `[tag] key=value` output format for agent consumption
