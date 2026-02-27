---
title: 'Persist SHGAT-Enriched Cap Embeddings in workflow_pattern'
slug: 'shgat-cap-embedding-persistence'
created: '2026-02-24'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript', 'Deno', 'PostgreSQL', 'pgvector', 'TensorFlow.js (GRU worker)']
files_to_modify:
  - 'src/db/migrations/052_workflow_pattern_shgat_embedding.ts'
  - 'src/graphrag/algorithms/shgat.ts'
  - 'src/application/services/post-execution.service.ts'
  - 'scripts/train-gru-with-caps.ts'
code_patterns:
  - 'SHGAT forward() returns { H: tool_embs, E: cap_embs } — E ordered by graphBuilder.getCapabilityIds()'
  - 'getToolEmbeddings() wraps forward().H — needs symmetric getCapEmbeddings() wrapping forward().E'
  - 'preserveDimResidual default 0.3→0 (notebook 12: r=0 optimal for 100% caps, r=0.3 costs 13.1% discrimination)'
  - 'DB UPSERT pattern: ON CONFLICT DO UPDATE for idempotent writes'
  - 'SHGAT cap IDs = pattern_id UUIDs (from workflow_pattern.pattern_id), NOT namespace:action'
  - 'No-silent-fallback policy: always log.warn on fallback paths'
  - 'forward() cache gated by hierarchyDirty — must invalidate after PER training'
test_patterns:
  - 'No unit tests for SHGAT persistence — validation via notebook + training metrics'
  - 'GRU training benchmarked via scripts/train-gru-with-caps.ts with SKIP_CAPS env var'
---

# Tech-Spec: Persist SHGAT-Enriched Cap Embeddings in workflow_pattern

**Created:** 2026-02-24
**Reviewed:** Adversarial review completed, 12 findings addressed (2 critical, 4 high, 4 medium, 2 low)

## Overview

### Problem Statement

The GRU model predicts both tools (918) and capabilities (674) in a unified softmax output layer. Tool embeddings are SHGAT-enriched (V2V co-occurrence + message passing), stored in `tool_embedding`. Cap embeddings come from `workflow_pattern.intent_embedding` — raw BGE-M3 of the intent text, **never enriched by SHGAT**.

This creates a distribution mismatch: Tool-Tool mean cosine similarity = 0.712, Tool-Cap = 0.627 (gap = 0.085). In the softmax, tool scores systematically dominate cap scores because SHGAT-enriched tools form a tighter cluster. Result: enabling cap-as-terminal regresses Hit@1 from 52.2% to 30.7%.

The SHGAT graph already includes capability nodes and computes enriched embeddings for them during message passing. But these enriched cap embeddings are **never persisted** — they're discarded after inference.

**`preserveDim` residual set to 0 (removed):** The SHGAT `forward()` applies a residual connection (shgat.ts:432-462): `E_final = (1-r)*E_propagated + r*E_original` (default r=0.3). Notebook 12 per-cap analysis shows r=0 is optimal for 100% of caps on child-similarity and 98.9% on discrimination. The r=0.3 costs 13.1% of discrimination vs per-cap optimal. The original concern (307 cap identity collisions at r=0 for 1-child caps sharing a tool) is an artefact of mean-pooling simulation — real multi-head attention produces distinct outputs even for caps sharing the same child. **Decision: set `preserveDim` to 0 for both tools and caps.** This gives pure message-passing output, no BGE-M3 dilution.

### Solution

Add a `shgat_embedding vector(1024)` column to `workflow_pattern`. After SHGAT enrichment (forward pass), persist the enriched cap embeddings to this column. In GRU training (both prod and script), load `shgat_embedding` for caps with fallback to `intent_embedding` + log.warn.

### Scope

**In Scope:**
- DB migration: add `shgat_embedding vector(1024)` to `workflow_pattern`
- SHGAT pipeline: after forward pass, write enriched cap embeddings to `workflow_pattern.shgat_embedding`
- GRU training (prod `post-execution.service.ts`): load `shgat_embedding` instead of `intent_embedding` for caps
- GRU training (script `train-gru-with-caps.ts`): same change
- Fallback with explicit warning if `shgat_embedding` is NULL
- Cache invalidation after PER training to ensure fresh embeddings
- Remove `LIMIT 500` on cap loading query (672 caps, LIMIT truncates)
- Set `preserveDimResidual` default to 0 (pure MP, no BGE-M3 dilution — notebook 12 proves r=0 optimal)

**Out of Scope:**
- Cap deduplication (e.g. 30 near-identical `agent_help` caps)
- Separate classification head for tools vs caps
- GRU architecture changes
- SHGAT architecture changes

## Context for Development

### Codebase Patterns

- `tool_embedding` table stores L0 tool embeddings (918 entries, `vector(1024)`)
- `workflow_pattern` stores cap metadata including `intent_embedding` (BGE-M3 raw, `vector(1024)`)
- `capability_records` → `workflow_pattern` via `workflow_pattern_id` FK (683 caps → 672 WP, almost 1:1)
- SHGAT `forward()` (shgat.ts:368) returns `{ H: number[][], E: number[][] }` — H = enriched tools, E = enriched caps. `preserveDim` residual will be set to 0 (pure MP output, no BGE-M3 dilution — see notebook 12).
- `getToolEmbeddings()` (shgat.ts:2003) wraps `forward().H` — `getCapabilityIds()` (shgat.ts:317) returns cap IDs in same order as E
- **CRITICAL: Cap IDs in SHGAT = `pattern_id` UUIDs** — NOT `namespace:action`. The SHGAT registers caps via `initializer.ts:665` (`pattern_id as id`) and `post-execution.service.ts:284` (`capability.id` where `Capability.id = pattern_id`). So `getCapabilityIds()` returns UUIDs. The UPDATE to `workflow_pattern` uses `WHERE pattern_id = $1` directly, NO JOIN through `capability_records` needed.
- **CRITICAL: Forward cache invalidation** — `forward()` caches results (shgat.ts:370). Cache is invalidated ONLY when `hierarchyDirty=true` (set on `registerTool`/`registerCapability`, lines 181/186). PER training modifies `this.params` in-place but NEVER invalidates the cache. After PER training, `forward()` returns stale pre-training embeddings. Must add `this.lastCache = null` after param updates.
- Prod GRU training chains after SHGAT in `post-execution.service.ts:501-504` (finally block, fire-and-forget)
- SHGAT params saved at line 487-489 via `onSHGATParamsUpdated()` — cap embedding persistence must be AWAITED before GRU training starts
- Migrations numbered in `src/db/migrations/` (latest: 051, next: 052)
- No-silent-fallback policy: fallback must `log.warn` with clear message

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/graphrag/algorithms/shgat.ts:368-509` | `forward()` — produces H (tools) AND E (caps), both enriched, cache stored at line 509 |
| `src/graphrag/algorithms/shgat.ts:2003-2031` | `getToolEmbeddings()` — wraps forward().H, **ignores E (cap embeddings)** |
| `src/graphrag/algorithms/shgat.ts:317-318` | `getCapabilityIds()` — cap IDs (UUIDs) in same order as E from forward(). Based on Map insertion order. |
| `src/graphrag/algorithms/shgat.ts:181,186` | `hierarchyDirty = true` — only set on registerTool/registerCapability |
| `src/graphrag/algorithms/shgat.ts:370-373` | Cache check — returns stale data if `!hierarchyDirty && lastCache` |
| `src/graphrag/algorithms/shgat.ts:432-462` | `preserveDim` residual — default changing from r=0.3 to r=0 (pure MP, per notebook 12) |
| `src/mcp/algorithm-init/initializer.ts:662-672` | `loadCapabilities()` — loads caps with `pattern_id as id` = UUID |
| `src/application/services/post-execution.service.ts:283-284` | `registerCapability({id: capability.id})` — `capability.id` = UUID pattern_id |
| `src/application/services/post-execution.service.ts:486-504` | After SHGAT training — `onSHGATParamsUpdated()` then `finally { GRU training }` |
| `src/application/services/post-execution.service.ts:638-705` | Prod GRU training — loads SHGAT tool embs (line 641) + raw cap `intent_embedding` (line 670), **LIMIT 500** at line 679 |
| `scripts/train-gru-with-caps.ts:63-91` | Script GRU training — loads cap `intent_embedding` for capabilityData (no LIMIT) |
| `src/db/migrations/051_tool_schema_hash.ts` | Latest migration — has `up()` AND `down()` with VIEW recreation |

### Technical Decisions

- **Store on `workflow_pattern`** (not `capability_records`) — WP is the deduplicated source of truth, the "real" capability
- **Column**: `shgat_embedding vector(1024)` — same type as `tool_embedding.embedding` and `intent_embedding`
- **NULL semantics**: NULL = "not yet enriched by SHGAT" — GRU training falls back to `intent_embedding` with `log.warn`
- **Write timing**: After SHGAT training succeeds AND cache is invalidated, persist cap embeddings. Must complete BEFORE GRU training starts.
- **Cap IDs = UUIDs**: `getCapEmbeddings()` returns `Map<UUID, number[]>`. UPDATE `workflow_pattern SET shgat_embedding = $1 WHERE pattern_id = $2` directly. No JOIN needed.
- **Cache invalidation**: Add `invalidateForwardCache()` method to SHGAT, call it after `importParams()` or PER training.
- **preserveDimResidual = 0**: Pure message-passing output, no BGE-M3 dilution. Notebook 12 shows r=0 optimal for 100% of caps. Existing tool_embedding will be stale until next SHGAT run.
- **New method**: `SHGAT.getCapEmbeddings(): Map<string, number[]>` — symmetric to `getToolEmbeddings()`, wraps `forward().E`
- **Remove LIMIT 500**: The cap loading query in prod has `LIMIT 500` but there are 672 caps. Remove or increase to 2000.
- **Script path**: Use adapter's freshly enriched cap embeddings (from `enrichEmbeddings()`) instead of DB `shgat_embedding`. More accurate for benchmarking since it uses the current SHGAT params, not the last prod run's.

## Implementation Plan

### Tasks

- [ ] Task 1: DB migration — add `shgat_embedding` column
  - File: `src/db/migrations/052_workflow_pattern_shgat_embedding.ts`
  - Action: Create migration with `up()` and `down()` functions.
    - `up()`: `ALTER TABLE workflow_pattern ADD COLUMN IF NOT EXISTS shgat_embedding vector(1024)`. Nullable, no default. No index needed (672 rows).
    - `down()`: `ALTER TABLE workflow_pattern DROP COLUMN IF EXISTS shgat_embedding`.
    - Check if `pml_registry` VIEW references `workflow_pattern` — if so, DROP and RECREATE VIEW in both `up()` and `down()` (same pattern as migration 051).
  - Notes: Follow pattern from `051_tool_schema_hash.ts`. Import `Migration` and `DbClient` types. Export function and register in migration runner. The column stays NULL until SHGAT runs.

- [ ] Task 2: Add cache invalidation + `getCapEmbeddings()` + set preserveDimResidual=0
  - File: `src/graphrag/algorithms/shgat.ts`
  - Action:
    1. Add method `invalidateForwardCache(): void` that sets `this.lastCache = null`. Place after `importParams()` (line ~1968).
    2. Call `this.invalidateForwardCache()` at the end of `importParams()` (line ~1968) — so after PER training saves new params and they're re-imported, the next forward pass uses fresh params.
    3. **Set `preserveDimResidual` default to 0** — at line 435, change `this.config.preserveDimResidual ?? 0.3` to `this.config.preserveDimResidual ?? 0`. This makes `forward()` return pure message-passing output with no BGE-M3 dilution. The preserveDim code block still executes (residual=0 means `E_final = 1*E_propagated + 0*E_original = E_propagated`) but with normalization, so functionally the block is a no-op except for the L2 normalize. Also change `createSHGATFromCapabilities()` (line ~2120) default config to set `preserveDimResidual: 0`.
    4. Add method `getCapEmbeddings(): Map<string, number[]>` after `getToolEmbeddings()` (line ~2031). Implementation:
       ```typescript
       getCapEmbeddings(): Map<string, number[]> {
         const log = getLogger();
         try {
           const { E } = this.forward();
           const capIds = this.graphBuilder.getCapabilityIds(); // UUIDs
           if (E.length === capIds.length && E.length > 0) {
             const result = new Map<string, number[]>();
             for (let i = 0; i < capIds.length; i++) {
               result.set(capIds[i], E[i]);
             }
             log.debug(`[SHGAT] getCapEmbeddings: ${result.size} enriched (message-passing)`);
             return result;
           }
         } catch { /* fall through */ }
         log.warn("[SHGAT] getCapEmbeddings: forward() unavailable — returning raw cap embeddings");
         const result = new Map<string, number[]>();
         for (const [capId, cap] of this.graphBuilder.getCapabilityNodes()) {
           if (cap.embedding) result.set(capId, cap.embedding);
         }
         return result;
       }
       ```
  - Notes: Cap IDs from `getCapabilityIds()` are UUIDs (`pattern_id`). Map insertion order is preserved in JS (ES2015+). The `invalidateForwardCache()` call in `importParams()` ensures that after PER training saves params → `onSHGATParamsUpdated` re-imports them → cache is cleared → next `getCapEmbeddings()` runs a fresh forward pass. **preserveDimResidual=0 rationale**: Notebook 12 Section 8 shows r=0 is optimal for 100% of caps (child-similarity) and 98.9% (discrimination). r=0.3 costs 13.1% discrimination vs optimal. 307 "identity collisions" at r=0 are a mean-pooling simulation artefact — real multi-head attention differentiates caps sharing the same child tool via learned attention weights. After this change, existing `tool_embedding` rows (written with r=0.3) will be stale until the next SHGAT training run regenerates them with r=0.

- [ ] Task 3: Persist cap embeddings after SHGAT training (prod) + fix sequencing
  - File: `src/application/services/post-execution.service.ts`
  - Action: Inside the success block (after `onSHGATParamsUpdated()` at line ~489, BEFORE the `finally` block), add cap embedding persistence:
    ```typescript
    // Persist SHGAT-enriched cap embeddings to workflow_pattern
    if (shgat) {
      try {
        const capEmbs = shgat.getCapEmbeddings();
        if (capEmbs.size > 0) {
          const entries = [...capEmbs.entries()];
          // pattern_id = cap ID in SHGAT (UUID), direct key to workflow_pattern
          for (let i = 0; i < entries.length; i += 50) {
            const batch = entries.slice(i, i + 50);
            await Promise.all(batch.map(([patternId, emb]) =>
              db.query(
                `UPDATE workflow_pattern SET shgat_embedding = $1::vector WHERE pattern_id = $2`,
                [`[${emb.join(",")}]`, patternId]
              )
            ));
          }
          log.info(`[PostExecutionService] Persisted ${capEmbs.size} SHGAT cap embeddings to workflow_pattern`);
        }
      } catch (e) {
        log.warn(`[PostExecutionService] Failed to persist cap embeddings: ${e}`);
      }
    }
    ```
  - **Sequencing fix**: Move the GRU training trigger from the `finally` block (line 501-504) to AFTER the cap embedding persistence, still inside the success path. This ensures cap embeddings are written to DB before GRU reads them. If cap persistence fails (try/catch), GRU still runs with COALESCE fallback.
  - Notes: Cap IDs from `getCapEmbeddings()` are UUIDs = `workflow_pattern.pattern_id`. Direct UPDATE, no JOIN needed. Batched in groups of 50 for DB friendliness.

- [ ] Task 4: Load `shgat_embedding` in prod GRU training + remove LIMIT
  - File: `src/application/services/post-execution.service.ts`
  - Action:
    1. At line ~670, change `wp.intent_embedding as embedding` to `COALESCE(wp.shgat_embedding, wp.intent_embedding) as embedding`.
    2. At line ~679, change `LIMIT 500` to `LIMIT 2000` (or remove — 672 caps is well within reason).
    3. After parsing cap rows, count and log: `const shgatCount = parsed.filter(c => /* had shgat_embedding */).length;` — To detect this, add `wp.shgat_embedding IS NOT NULL as has_shgat` to the SELECT, then count. Log: `log.info([PostExecutionService] GRU caps: ${shgatCount}/${parsed.length} with shgat_embedding`)`. If `shgatCount === 0`, log.warn: `"All caps using intent_embedding fallback — run SHGAT training first"`.
  - Notes: The COALESCE handles NULLs transparently. The `has_shgat` flag is only for logging, not used in logic.

- [ ] Task 5: Load `shgat_embedding` in script GRU training + use adapter enrichment
  - File: `scripts/train-gru-with-caps.ts`
  - Action:
    1. At line ~66, change `wp.intent_embedding as embedding` to `COALESCE(wp.shgat_embedding, wp.intent_embedding) as embedding`. Add `wp.shgat_embedding IS NOT NULL as has_shgat` for logging.
    2. After `adapter.enrichEmbeddings()` returns (line ~244), extract enriched cap embeddings from the adapter and override capabilityData embeddings. The adapter's graph contains cap nodes with enriched embeddings. Use `adapter.getCapabilityEmbeddings()` (or iterate `adapter.graph.nodes` if no such method exists) to get fresh cap embeddings keyed by cap ID (UUID). Map UUID → `namespace:action` via capabilityData to override.
    3. Log the source of each cap embedding: `"N caps from adapter enrichment, M from DB shgat_embedding, P from intent_embedding fallback"`.
  - Notes: For the script path, the adapter produces the most accurate embeddings (uses current SHGAT params + fresh V2V). DB `shgat_embedding` reflects the LAST prod run, which may be stale. The adapter override is preferred for benchmarking. **Important**: The adapter registers caps by UUID (`pattern_id`), but `capabilityData[].id` in the script uses `namespace:action` (from the SQL query `cr.namespace || ':' || cr.action as cap_name`). A mapping UUID → `namespace:action` is needed. Query: `SELECT pattern_id, cr.namespace || ':' || cr.action as cap_name FROM workflow_pattern wp JOIN capability_records cr ON cr.workflow_pattern_id = wp.pattern_id` to build this map.

### Acceptance Criteria

- [ ] AC 1: Given a fresh DB with NULL `shgat_embedding` columns, when GRU training runs, then it falls back to `intent_embedding` for all caps and logs a warning: `"All caps using intent_embedding fallback — run SHGAT training first"`
- [ ] AC 2: Given SHGAT PER training completes successfully, when cap embedding persistence runs, then `SELECT COUNT(*) FROM workflow_pattern WHERE shgat_embedding IS NOT NULL` equals the number of caps in the SHGAT graph
- [ ] AC 3: Given `shgat_embedding` is populated, when GRU training loads cap embeddings, then it uses `shgat_embedding` (not `intent_embedding`) and logs `"N/M caps with shgat_embedding"`
- [ ] AC 4: Given `shgat_embedding` is populated, when cap-as-terminal GRU training runs, then the Tool-Cap cosine similarity gap (currently 0.085) is reduced. Measure via notebook 11 Section 2. Hit@1 improvement is expected but not guaranteed (other factors like cap ambiguity remain).
- [ ] AC 5: Given the `getCapEmbeddings()` method is called when SHGAT forward pass has not been run (no params), then it falls back to raw cap embeddings and logs `"[SHGAT] getCapEmbeddings: forward() unavailable — returning raw cap embeddings"`
- [ ] AC 6: Given the migration 052 runs, when querying `workflow_pattern`, then `shgat_embedding` column exists as `vector(1024)` and all values are NULL
- [ ] AC 7: Given PER training modifies SHGAT params, when `getCapEmbeddings()` is called after, then it returns embeddings computed with the NEW params (not stale cached ones)
- [ ] AC 8: Given cap embedding persistence is in progress, when GRU training starts, then persistence has completed (GRU does not race with persistence)

## Additional Context

### Dependencies

- pgvector extension already installed (used by `tool_embedding.embedding` and `workflow_pattern.intent_embedding`)
- SHGAT params must be loaded before enrichment can produce cap embeddings
- Migration 052 must run before any `shgat_embedding` writes (Tasks 3-5 depend on Task 1)
- Task 2 (`getCapEmbeddings` + cache invalidation) must exist before Task 3 can call it
- Task 3 (persistence + sequencing fix) must be done before Task 4 is useful (otherwise COALESCE always returns intent_embedding)

### Testing Strategy

- **Migration**: Run `deno task db:migrate` and verify column exists via `\d workflow_pattern`. Verify `down()` drops the column cleanly.
- **Cache invalidation**: After PER training, verify in logs that next `forward()` recomputes (not cached). Add a log.debug in `invalidateForwardCache()`.
- **getCapEmbeddings()**: Verify via prod server logs — after SHGAT init + PER, call should return N cap embeddings with correct UUIDs.
- **Persistence**: After SHGAT training, query `SELECT COUNT(*) FROM workflow_pattern WHERE shgat_embedding IS NOT NULL` — should match cap count in SHGAT graph.
- **Sequencing**: Verify GRU training logs appear AFTER "Persisted N SHGAT cap embeddings" log.
- **GRU training**: Run `scripts/train-gru-with-caps.ts` — logs should show cap embedding source breakdown and Hit@1 metric.
- **Notebook validation**: Re-run notebook 11 Section 2 comparing Tool-Tool vs Tool-Cap similarity. The gap (currently 0.085) should shrink with SHGAT-enriched cap embeddings.

### Adversarial Review Findings (addressed)

| ID | Sev | Status | Finding | Resolution |
|---|---|---|---|---|
| F1 | Critical | **FIXED** | Cap IDs in SHGAT = UUIDs, not `namespace:action` | Corrected throughout: cap IDs = `pattern_id` UUIDs. Direct UPDATE on `workflow_pattern`, no JOIN needed. |
| F2 | Critical | **FIXED** | Stale cache after PER training | Added `invalidateForwardCache()` in Task 2, called after `importParams()`. AC7 added. |
| F3 | High | **FIXED** | Race condition: GRU training vs cap persistence | Task 3 moves GRU trigger after persistence, not in `finally`. AC8 added. |
| F4 | High | **FIXED** | `LIMIT 500` truncates 672 caps | Task 4 removes/increases LIMIT. |
| F5 | High | **FIXED** | Ambiguous placement of persistence code | Task 3 explicitly specifies: inside success block, after `onSHGATParamsUpdated`, before `finally`. |
| F6 | High | **FIXED** | Missing `down()` migration | Task 1 now specifies both `up()` and `down()`, with VIEW check. |
| F7 | Medium | **FIXED** | Task 5 contradictory (DB vs adapter) | Task 5 now clearly states: use adapter enrichment as override for script path. DB COALESCE as base, adapter as preferred override. |
| F8 | Medium | **FIXED** | `preserveDim` residual not documented | Notebook 12 proves r=0 optimal. Task 2 now sets `preserveDimResidual=0`. Pure MP output, no BGE-M3 dilution. |
| F9 | Medium | **FIXED** | AC4 not testable | Reworded: measure gap reduction (objective) instead of Hit@1 improvement (hope). |
| F10 | Medium | **NOTED** | Map ordering fragile | Documented in Task 2 notes. JS Map preserves insertion order (ES2015+). |
| F11 | Low | **NOTED** | Notebook 11 exists as untracked file | Confirmed: `lib/shgat-for-gru/notebooks/11-cap-as-terminal-analysis.ipynb` exists. |
| F12 | Low | **NOTED** | Export name for migration | Mentioned in Task 1: "register in migration runner". |

### Notes

- **Risk: First run has 0 enriched caps** — After migration, all `shgat_embedding` are NULL. The SHGAT must run at least once (via prod execution or manual trigger) before GRU training benefits. Handled by COALESCE fallback.
- **Risk: Existing tool_embedding stale after r change** — After setting `preserveDimResidual=0`, existing `tool_embedding` rows (written with r=0.3) will be stale until the next SHGAT training run regenerates them with r=0. First SHGAT run after deploy will refresh both tools AND caps with pure MP embeddings.
- **Risk: UUID→namespace:action mapping in script** — The script uses `namespace:action` as capabilityData IDs but the adapter uses UUIDs. Task 5 describes the mapping query needed.
- **Future: Incremental updates** — Currently persists ALL cap embeddings after each SHGAT training (672 UPDATEs in batches of 50). Fine for current scale.
- Notebook 11 (`lib/shgat-for-gru/notebooks/11-cap-as-terminal-analysis.ipynb`) documents the diagnostic (embedding gap, ambiguity).
- Notebook 12 (`lib/shgat-for-gru/notebooks/12-preservedim-residual-analysis.ipynb`) proves r=0 optimal: 100% caps better at child-sim, 98.9% at discrimination, r=0.3 costs 13.1% discrimination. 307 identity collisions at r=0 are mean-pooling artefact, not real with multi-head attention.
- Audit findings: `_bmad-output/implementation-artifacts/tech-specs/2026-02-24-shgat-audit-findings.md`
- The 30 `agent_help` duplicate caps are a separate data quality issue (out of scope).
