# Live Training Data-Prep Alignment Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align the live SHGAT+GRU training pipeline (`post-execution.service.ts`) with the offline scripts' centralized data-prep functions, without breaking existing weights or embeddings.

**Architecture:** The live pipeline triggers after every PML execution: SHGAT (1 epoch) → persist embeddings → GRU (20 epochs). Currently both paths inline their data-prep logic. We replace inline code with imports from `lib/gru/src/data-prep/` (pure functions, no DB deps). The live GRU path already does most steps inline — we swap inline for centralized. The live SHGAT path is missing several steps entirely.

**Tech Stack:** TypeScript (Deno runtime), PostgreSQL, `lib/gru/src/data-prep/` barrel (pure functions)

---

## Context for the Implementer

### File Map

| File | Role |
|------|------|
| `src/application/services/post-execution.service.ts` | Live training orchestrator. Triggers SHGAT then GRU after each execution. **Main file to modify.** |
| `src/graphrag/learning/per-training.ts` | SHGAT subprocess launcher. Receives capabilities and traces. |
| `src/mcp/algorithm-init/initializer.ts` | Startup: loads SHGAT params, GRU weights, canonicalizes caps. Provides `triggerGRUTraining()`. |
| `lib/gru/src/data-prep/index.ts` | Barrel export for all pure data-prep functions. |
| `lib/gru/src/data-prep/cap-cleanup.ts` | `canonicalizeCaps()`, `flattenToL0()`, `resolveExecHashRefs()` |
| `lib/gru/src/data-prep/resolve-tool-name.ts` | `buildRenameChain()`, `buildToolNameResolver()` |
| `lib/gru/src/data-prep/intent-dedup.ts` | `dedupTracesByIntent()` |
| `lib/gru/src/data-prep/cap-frequency-cap.ts` | `capExamplesPerTarget()` |
| `lib/gru/src/data-prep/normalize.ts` | `normalizeToolId()`, `l2Normalize()` |

### Current State of Live GRU Path (lines 602–1040 of `post-execution.service.ts`)

The live GRU path already does **most** steps inline:
- Rename chain: inline loop (lines 648-665) — functionally equivalent to `buildRenameChain`
- Exec hash resolution: inline (lines 772-802) — equivalent to `resolveExecHashRefs`
- Canonicalization: inline (lines 808-849) — equivalent but **missing level prefix** in signature
- L2+ flatten: inline BFS (lines 852-876) — equivalent to `flattenToL0`
- L2 normalize: inline (lines 879-906) — equivalent to `l2NormalizeMap`
- Intent dedup: inline (lines 993-1006) — **WRONG**: uses first 10 dims at precision=4 instead of full embedding at precision=6
- resolveToolName: inline closure (lines 909-915) — equivalent to `buildToolNameResolver`

### What the Live GRU Path is MISSING

1. **`capExamplesPerTarget` frequency capping** — `db:postgresQuery` has 982 traces, dominates training
2. **Correct intent dedup** — current uses `slice(0, 10).toFixed(4)`, should use full embedding at `toFixed(6)`
3. **Level-aware canonicalization** — current sig is `[...tools].sort().join(",")`, should be `L${level}::` prefixed
4. **Seeded PRNG split** — current splits by example position (biased to recent), should shuffle by trace

### What the Live SHGAT Path is MISSING (lines 428-587)

1. **COALESCE(shgat_embedding, intent_embedding)** — loads raw `intent_embedding` only (line 440)
2. **Rename chain** — no rename resolution on tools_used
3. **Canonicalization** — no cap dedup
4. **Dedup** — no trace-level dedup (only PER sampling limits volume)
5. **Frequency cap** — no FPS capping

### Risk Assessment

**SHGAT live path changes are HIGH RISK** — live SHGAT trains 1 epoch at LR=0.03 (conservative fine-tuning). Adding canon+dedup changes the input distribution mid-flight. If the canonical set changes between runs (a new cap appears, changing which groups merge), the model sees a different vocab across successive 1-epoch updates. This could destabilize the in-memory SHGAT.

**GRU live path changes are LOW RISK** — it retrains from warm start every time (20 epochs). Improving data quality should strictly help. The only risk is the warm start weights being calibrated for the old distribution, but 20 epochs is enough to adapt.

**Recommendation:** Fix GRU live path fully (Task 1-4). Fix SHGAT live path conservatively — only the safe changes (Task 5-6). Defer SHGAT canonicalization to a later pass with careful A/B testing.

---

## Task 1: Replace live GRU inline dedup with `dedupTracesByIntent`

This is the most impactful bug fix — the current dedup uses `slice(0, 10).toFixed(4)` which causes false positive deduplication.

**Files:**
- Modify: `src/application/services/post-execution.service.ts:28` (add import)
- Modify: `src/application/services/post-execution.service.ts:992-1006` (replace inline dedup)
- Test: manual — run live, check logs for dedup count

**Step 1: Add import**

At line 28, after existing imports, add:

```typescript
import { dedupTracesByIntent } from "../../lib/gru/src/data-prep/intent-dedup.ts";
```

Note: import directly from the file (not barrel) to avoid pulling unnecessary deps into the live service.

**Step 2: Replace inline dedup (lines 992-1006)**

Replace:
```typescript
      // 3b. Intent dedup (exact)
      const beforeDedup = examples.length;
      {
        const seen = new Set<string>();
        const deduped = examples.filter(ex => {
          const groupKey = ex.contextToolIds.join("|") + ">>" + ex.targetToolId;
          const intentKey = ex.intentEmbedding.slice(0, 10).map(v => v.toFixed(4)).join(",");
          const key = `${groupKey}::${intentKey}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        examples.length = 0;
        examples.push(...deduped);
      }
      if (examples.length < beforeDedup) {
        log.info(`[PostExecutionService] GRU: dedup ${beforeDedup} → ${examples.length} examples`);
      }
```

With:
```typescript
      // 3b. Intent dedup (centralized, full embedding, precision=6)
      const beforeDedup = examples.length;
      {
        const { deduped } = dedupTracesByIntent(
          examples,
          (ex) => ex.contextToolIds.join("|") + ">>" + ex.targetToolId,
          (ex) => ex.intentEmbedding,
        );
        examples.length = 0;
        examples.push(...deduped);
      }
      if (examples.length < beforeDedup) {
        log.info(`[PostExecutionService] GRU: dedup ${beforeDedup} → ${examples.length} examples`);
      }
```

**Step 3: Verify it compiles**

Run: `deno check src/application/services/post-execution.service.ts`
Expected: no errors

**Step 4: Commit**

```bash
git add src/application/services/post-execution.service.ts
git commit -m "fix(live-gru): replace approximate intent dedup with centralized dedupTracesByIntent

The inline dedup used slice(0,10).toFixed(4) which caused false positive
deduplication. Now uses full embedding at precision=6 via centralized function."
```

---

## Task 2: Add frequency capping to live GRU

Without this, `db:postgresQuery` (982 traces) dominates the live training signal.

**Files:**
- Modify: `src/application/services/post-execution.service.ts:28` (add import)
- Modify: `src/application/services/post-execution.service.ts` (add capping after dedup, before split)

**Step 1: Add import**

```typescript
import { capExamplesPerTarget } from "../../lib/gru/src/data-prep/cap-frequency-cap.ts";
```

**Step 2: Add frequency capping after dedup block (after the `examples.length < 50` check at line 1011)**

Insert before the split (before line 1016 `// 4. Split train/test`):

```typescript
      // 3c. Frequency cap (FPS, max 50 per target — aligned with offline script)
      {
        const wrapped = examples.map(ex => ({
          ...ex,
          targetToolId: ex.targetToolId,
          intentEmbedding: ex.intentEmbedding,
        }));
        const { capped, stats } = capExamplesPerTarget(wrapped, 50);
        if (stats.cappedTargets > 0) {
          log.info(`[PostExecutionService] GRU: freq cap ${stats.before} → ${stats.after} (${stats.cappedTargets} targets capped)`);
          examples.length = 0;
          examples.push(...capped);
        }
      }
```

**Step 3: Verify it compiles**

Run: `deno check src/application/services/post-execution.service.ts`
Expected: no errors. `capExamplesPerTarget` expects objects with `targetToolId` and `intentEmbedding` fields, which the examples already have.

**Step 4: Commit**

```bash
git add src/application/services/post-execution.service.ts
git commit -m "feat(live-gru): add frequency capping (MAX_PER_CAP=50, FPS)

Prevents db:postgresQuery (982 traces) from dominating live GRU training.
Uses capExamplesPerTarget with farthest-point sampling for intent diversity."
```

---

## Task 3: Fix canonicalization level prefix in live GRU

The inline canonicalization uses `[...tools].sort().join(",")` as the group signature. The centralized `canonicalizeCaps` uses `L${level}::` prefix to prevent cross-level merges. However, replacing inline with the centralized function requires matching the `CapData` interface.

**Files:**
- Modify: `src/application/services/post-execution.service.ts:28` (add import)
- Modify: `src/application/services/post-execution.service.ts:807-849` (replace inline canon)

**Step 1: Add import**

```typescript
import { canonicalizeCaps, type CapData } from "../../lib/gru/src/data-prep/cap-cleanup.ts";
```

**Step 2: Replace inline canonicalization (lines 807-849)**

Replace the entire `// 2b. Cap canonicalization by toolset` block with:

```typescript
      // 2b. Cap canonicalization by toolset (centralized, level-aware)
      let capCanonicalMap = new Map<string, string>();
      {
        const capDataForCanon: CapData[] = capabilityData.map(c => ({
          id: c.id,
          embedding: c.embedding,
          toolChildren: c.toolChildren,
          level: c.level,
          usageCount: c.usageCount,
        }));
        const { canonicalMap, groupCount, remapped } = canonicalizeCaps(capDataForCanon);
        capCanonicalMap = canonicalMap;

        if (remapped > 0) {
          // Remove non-canonical caps from capabilityData
          const canonicalIds = new Set(capDataForCanon.map(c => c.id));
          const before = capabilityData.length;
          // Filter in-place (reverse splice)
          for (let i = capabilityData.length - 1; i >= 0; i--) {
            if (!canonicalIds.has(capabilityData[i].id)) {
              capabilityData.splice(i, 1);
            }
          }
          // Remove from capChildrenMap
          for (const nonCanon of canonicalMap.keys()) capChildrenMap.delete(nonCanon);
          // Remap children references
          for (const cap of capabilityData) {
            cap.toolChildren = cap.toolChildren.map(c => canonicalMap.get(c) ?? c);
          }
          for (const [key, children] of capChildrenMap) {
            capChildrenMap.set(key, children.map(c => canonicalMap.get(c) ?? c));
          }
          log.info(`[PostExecutionService] GRU: canonicalize: ${groupCount} toolset groups, ${remapped} caps remapped → ${capabilityData.length} canonical (was ${before})`);
        }
      }
```

**Step 3: Verify `canonicalizeCaps` mutates `capDataForCanon` in-place**

Read `lib/gru/src/data-prep/cap-cleanup.ts` to confirm that `canonicalizeCaps` removes non-canonical entries from the input array. If it does, the `canonicalIds` set built from `capDataForCanon` after the call will only contain canonical caps. If it doesn't, you need to build the set differently.

**Step 4: Verify it compiles**

Run: `deno check src/application/services/post-execution.service.ts`

**Step 5: Commit**

```bash
git add src/application/services/post-execution.service.ts
git commit -m "fix(live-gru): use level-aware canonicalization from data-prep

Replaces inline canonicalization (no level prefix) with centralized
canonicalizeCaps which uses L\${level}:: prefix to prevent cross-level merges."
```

---

## Task 4: Replace live GRU inline rename chain with `buildRenameChain`

Low risk — the current inline code is functionally equivalent, this is just DRY cleanup.

**Files:**
- Modify: `src/application/services/post-execution.service.ts:28` (add import)
- Modify: `src/application/services/post-execution.service.ts:647-668` (replace inline)

**Step 1: Add import**

```typescript
import { buildRenameChain } from "../../lib/gru/src/data-prep/resolve-tool-name.ts";
```

**Step 2: Replace inline rename chain (lines 647-668)**

Replace:
```typescript
      // 1b. Load rename history
      let renameMap = new Map<string, string>();
      try {
        const renameRows = await db.query(
          "SELECT old_name, new_name, old_fqdn, new_fqdn FROM capability_name_history ORDER BY renamed_at ASC",
        ) as Array<{ old_name: string; new_name: string; old_fqdn: string; new_fqdn: string }>;
        for (const row of renameRows) {
          renameMap.set(row.old_name, row.new_name);
          if (row.old_fqdn) renameMap.set(row.old_fqdn, row.new_name);
        }
        for (const [oldName, newName] of renameMap) {
          let current = newName;
          const visited = new Set<string>([oldName]);
          while (renameMap.has(current) && !visited.has(current)) {
            visited.add(current);
            current = renameMap.get(current)!;
          }
          if (current !== newName) renameMap.set(oldName, current);
        }
      } catch {
        renameMap = new Map();
      }
```

With:
```typescript
      // 1b. Load rename history (centralized)
      let renameMap = new Map<string, string>();
      try {
        const renameRows = await db.query(
          "SELECT old_name, new_name, old_fqdn FROM capability_name_history ORDER BY renamed_at ASC",
        ) as Array<{ old_name: string; new_name: string; old_fqdn?: string | null }>;
        renameMap = buildRenameChain(renameRows);
      } catch {
        renameMap = new Map();
      }
```

**Step 3: Verify it compiles**

Run: `deno check src/application/services/post-execution.service.ts`

**Step 4: Commit**

```bash
git add src/application/services/post-execution.service.ts
git commit -m "refactor(live-gru): use centralized buildRenameChain

Replaces inline rename chain loop with shared data-prep function. No behavior change."
```

---

## Task 5: Fix live SHGAT cap embedding source (COALESCE)

The live SHGAT loads raw `intent_embedding` instead of `COALESCE(shgat_embedding, intent_embedding)`. This means live SHGAT training ignores previously-enriched embeddings and always restarts from raw BGE-M3.

**Files:**
- Modify: `src/application/services/post-execution.service.ts:437-454` (SQL query)

**Step 1: Change the SQL query**

At line 440, change:
```sql
intent_embedding as embedding,
```
To:
```sql
COALESCE(shgat_embedding, intent_embedding) as embedding,
```

The full query becomes:
```typescript
      const rows = await db.query(
        `SELECT
          pattern_id as id,
          COALESCE(shgat_embedding, intent_embedding) as embedding,
          ARRAY(
            SELECT DISTINCT tr->>'tool'
            FROM execution_trace et,
                 jsonb_array_elements(et.task_results) tr
            WHERE et.capability_id = wp.pattern_id
              AND et.task_results IS NOT NULL
              AND jsonb_typeof(et.task_results) = 'array'
              AND jsonb_array_length(et.task_results) >= 1
              AND tr->>'tool' IS NOT NULL
          ) as tools_used,
          success_rate
        FROM workflow_pattern wp
        WHERE code_snippet IS NOT NULL
          AND intent_embedding IS NOT NULL`,
      ) as unknown as CapabilityRow[];
```

**Step 2: Verify it compiles**

Run: `deno check src/application/services/post-execution.service.ts`

**Step 3: Commit**

```bash
git add src/application/services/post-execution.service.ts
git commit -m "fix(live-shgat): use COALESCE(shgat_embedding, intent_embedding) for cap embeddings

Live SHGAT was loading raw intent_embedding, ignoring previously-enriched
SHGAT embeddings. Now aligned with offline train-shgat-standalone.ts."
```

---

## Task 6: Add normalizeToolId to live SHGAT tools_used

The `parseCapabilityWithEmbedding` helper (line 89) already calls `normalizeToolId` on `tools_used`. Verify this is the case and that no further changes are needed for the SHGAT path.

**Files:**
- Read: `src/application/services/post-execution.service.ts:80-95` (parseCapabilityWithEmbedding)

**Step 1: Verify parseCapabilityWithEmbedding**

Read lines 80-95 to confirm that `normalizeToolId` is applied on `tools_used`. If yes, this task is a no-op (already done).

**Step 2: If not applied, add it**

In the `parseCapabilityWithEmbedding` function, ensure:
```typescript
toolsUsed: (row.tools_used ?? []).map(normalizeToolId).filter(Boolean),
```

**Step 3: Commit (only if changes needed)**

```bash
git add src/application/services/post-execution.service.ts
git commit -m "fix(live-shgat): ensure normalizeToolId on tools_used"
```

---

## Task 7: Fix live GRU warm start from DB (not missing file)

The live GRU passes `existingWeightsPath: "lib/gru/gru-weights-latest.json"` to the worker, but **this file does not exist**. The worker silently falls back to cold start (line 306-308 of `train-worker-prod.ts`). This is a silent fallback bug — every live GRU training runs cold start, wasting 20 epochs re-learning from scratch.

The offline script loads weights from `gru_params` table (DB), writes to a temp file, passes to worker. The live path should do the same.

**Files:**
- Modify: `src/mcp/algorithm-init/initializer.ts:320-346` (triggerGRUTraining method)

**Step 1: Add temp file + DB weight loading to triggerGRUTraining**

Replace:
```typescript
  async triggerGRUTraining(
    examples: SpawnGRUTrainingInput["examples"],
    toolEmbeddings: Record<string, number[]>,
    capabilityData?: SpawnGRUTrainingInput["capabilityData"],
    testExamples?: SpawnGRUTrainingInput["examples"],
  ): Promise<{ success: boolean; finalLoss?: number; finalAccuracy?: number; error?: string }> {
    if (!this.gru) {
      return { success: false, error: "GRU not initialized" };
    }

    const result = await spawnGRUTraining({
      examples,
      testExamples,
      evalEvery: 5,
      toolEmbeddings,
      capabilityData,
      existingWeightsPath: "lib/gru/gru-weights-latest.json",
      epochs: 20,
      learningRate: 0.001,
    });

    if (result.success && result.savedToDb) {
      await this.reloadGRUWeights();
    }

    return result;
  }
```

With:
```typescript
  async triggerGRUTraining(
    examples: SpawnGRUTrainingInput["examples"],
    toolEmbeddings: Record<string, number[]>,
    capabilityData?: SpawnGRUTrainingInput["capabilityData"],
    testExamples?: SpawnGRUTrainingInput["examples"],
  ): Promise<{ success: boolean; finalLoss?: number; finalAccuracy?: number; error?: string }> {
    if (!this.gru) {
      return { success: false, error: "GRU not initialized" };
    }

    // Load warm-start weights from DB (same as offline script)
    let existingWeightsPath: string | undefined;
    if (this.deps.db) {
      try {
        const rows = await this.deps.db.query(
          "SELECT params FROM gru_params ORDER BY updated_at DESC LIMIT 1",
        ) as Array<{ params: string | object }>;
        if (rows.length > 0) {
          const paramsObj = typeof rows[0].params === "string"
            ? JSON.parse(rows[0].params)
            : rows[0].params;
          const tmpPath = `/tmp/gru-live-warm-${Date.now()}.json`;
          const { writeFileSync } = await import("node:fs");
          writeFileSync(tmpPath, JSON.stringify(paramsObj));
          existingWeightsPath = tmpPath;
          log.info(`[AlgorithmInitializer] GRU warm start from DB weights: ${tmpPath}`);
        }
      } catch (e) {
        log.warn(`[AlgorithmInitializer] Could not load DB weights for warm start: ${e}`);
      }
    }

    const result = await spawnGRUTraining({
      examples,
      testExamples,
      evalEvery: 5,
      toolEmbeddings,
      capabilityData,
      existingWeightsPath,
      epochs: 20,
      learningRate: 0.001,
    });

    // Clean up temp file
    if (existingWeightsPath) {
      try { const { unlinkSync } = await import("node:fs"); unlinkSync(existingWeightsPath); } catch { /* ignore */ }
    }

    if (result.success && result.savedToDb) {
      await this.reloadGRUWeights();
    }

    return result;
  }
```

**Step 2: Verify `this.deps.db` is available**

Check that `AlgorithmInitializer` has `db` in its deps. Read `initializer.ts` constructor to confirm. The `post-execution.service.ts` already passes `db` when calling `triggerGRUTraining`, but the method doesn't receive it — it should use the initializer's own db dep.

**Step 3: Verify it compiles**

Run: `deno check src/mcp/algorithm-init/initializer.ts`

**Step 4: Commit**

```bash
git add src/mcp/algorithm-init/initializer.ts
git commit -m "fix(live-gru): warm start from DB weights instead of missing file

existingWeightsPath pointed to gru-weights-latest.json which doesn't exist,
causing silent cold start on every live training. Now loads from gru_params
table like the offline script does."
```

---

## Deferred (NOT in this plan)

These changes are deferred because they carry higher risk for the live pipeline:

### Live SHGAT canonicalization
**Why deferred:** Live SHGAT trains 1 epoch at a time. If the canonical set changes between runs (new cap added → group changes → different canonical elected), the model sees inconsistent vocab across micro-updates. The offline script trains 30 epochs in one shot, so canon is stable. Adding canon to live SHGAT requires a "canon cache" strategy — compute canonical set once at startup, reuse for all subsequent 1-epoch runs until next full retrain. This is a separate design decision.

### Live SHGAT dedup + freq cap
**Why deferred:** The live SHGAT path already limits to 50 traces via `maxTraces: 50` with PER priority sampling. Adding dedup+cap on top of PER sampling could conflict (PER selects high-TD-error traces, cap selects diverse intents — different objectives). Needs ablation.

### Live GRU seeded PRNG split
**Why deferred:** The current split (80/20 by position, no shuffle) biases test toward recent traces, but this is actually reasonable for live training — you want to test on the most recent behavior. A seeded shuffle is important for offline reproducibility but counterproductive for live fine-tuning.

---

## Verification

After all tasks are implemented:

1. **Compile check:** `deno check src/application/services/post-execution.service.ts`
2. **Unit tests:** `deno test tests/unit/gru/data-prep/` — ensure data-prep functions still pass
3. **Live test:** Execute a PML capability and watch logs:
   - `[PostExecutionService] GRU: dedup X → Y examples` (should show dedup count)
   - `[PostExecutionService] GRU: freq cap X → Y (Z targets capped)` (should show capping)
   - `[PostExecutionService] GRU: canonicalize: X toolset groups, Y caps remapped` (should show canon)
4. **Regression check:** Compare live GRU test Hit@1 in logs before/after. Should be comparable or better.
5. **SHGAT check:** Verify SHGAT cap embeddings are persisted with COALESCE source by checking `SELECT COUNT(*) FROM workflow_pattern WHERE shgat_embedding IS NOT NULL`.
