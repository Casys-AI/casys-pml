# Tech Spec: SHGAT Inference Cleanup — Remove Live Message Passing

**Date:** 2026-03-02
**Author:** David Aames (with Erwan)
**Status:** In Progress

## Problem

The SHGAT training pipeline produces optimized embeddings (trained over N epochs with PER sampling, contrastive loss, etc.) and persists them to DB:
- `tool_embedding.shgat_embedding` — enriched tool embeddings
- `workflow_pattern.shgat_embedding` — enriched capability embeddings

However, at inference time:
1. `scoreAllCapabilities()` and `scoreAllTools()` call `forward()` which runs **live message passing** on the loaded embeddings
2. `post-execution.service.ts` then **overwrites** the trained `shgat_embedding` in DB with the live MP result (lines 534-566)

This means:
- **Trained embeddings (50 epochs) get overwritten** by a single live MP pass after every execution
- **Unnecessary compute** — message passing at inference when pre-computed embeddings exist
- **Feedback loop** — COALESCE loads enriched → MP re-enriches → persists again → drift from trained state

## Benchmark Evidence

Embedding comparison (1 epoch training, `scripts/compare-embeddings.ts`):

| Method | Hit@1 | Hit@3 | Hit@5 | MRR |
|---|---|---|---|---|
| Raw BGE-M3 | 44.6% | 57.4% | 62.8% | 0.5308 |
| SHGAT (1 ep, standalone) | 46.4% | 57.4% | 61.4% | 0.5387 |

50-epoch training in progress — expected to show larger gap.

## Solution — Two Phases

### Phase 1: Load SHGAT embeddings from DB (DONE)

Changed 4 queries to use `COALESCE(shgat_embedding, embedding)` instead of raw `embedding`:

1. **`src/application/services/post-execution.service.ts:673`**
   - Tool embedding loading for SHGAT rebuild
   - `SELECT tool_id, COALESCE(shgat_embedding, embedding) as embedding FROM tool_embedding ORDER BY tool_id`

2. **`src/infrastructure/patterns/factory/algorithm-factory.ts:160`**
   - Algorithm initialization at startup
   - `SELECT tool_id, COALESCE(shgat_embedding, embedding)::text as embedding FROM tool_embedding`

3. **`src/mcp/gateway-server.ts:1121`**
   - Live registration of new tools in SHGAT
   - `SELECT tool_id, COALESCE(shgat_embedding, embedding)::text as embedding FROM tool_embedding WHERE tool_id IN (...)`

4. **`src/graphrag/learning/per-training.ts:597`**
   - PER training data loading
   - `SELECT tool_id, COALESCE(shgat_embedding, embedding) as embedding FROM tool_embedding WHERE tool_id = ANY($1)`

### Phase 2: Remove live message passing at inference

**Goal:** `scoreAllCapabilities()` and `scoreAllTools()` should use pre-computed embeddings directly without calling `forward()`.

**Changes needed:**

1. **`scoreAllCapabilities()` (shgat.ts:1093)**
   - Instead of `const { E } = this.forward()`, use the capability embeddings already loaded from DB (via `graphBuilder.getCapabilityNodes()`)
   - These are already SHGAT-enriched if loaded via COALESCE from Phase 1

2. **`scoreAllTools()` (shgat.ts:1195)**
   - Same: skip `this.forward()`, use tool embeddings from graph builder directly

3. **`post-execution.service.ts:534-566`** — Remove or guard the persist block
   - The live MP should NOT overwrite trained embeddings
   - Option A: Delete the persist block entirely (training script handles persistence)
   - Option B: Guard with a flag `if (!shgatEmbeddingsExist)` to only persist for newly discovered capabilities

4. **`forward()` stays** for training-only use (called by `per-training.ts` training loop)

**Edge cases:**
- **New capability created at runtime** (no `shgat_embedding` yet): Uses raw `intent_embedding` via COALESCE fallback. Gets proper `shgat_embedding` at next training cycle.
- **New tool registered** (no `shgat_embedding`): Same — uses raw `embedding` until next training.
- **Training frequency**: Online training already runs periodically via `per-training.ts`. New capabilities/tools get enriched within minutes.

### Phase 3 (future): Benchmark validation

- Run `scripts/compare-embeddings.ts` after each phase to measure impact
- Compare: raw BGE → Phase 1 (COALESCE + MP) → Phase 2 (COALESCE, no MP) → trained 50ep
- Metric: Recall@1/3/5 + MRR on 500 traces vs 341 capabilities

## Data Cleanup (Done)

- Cleared all 920 orphan `tool_embedding.shgat_embedding` values (many were from tools not in any capability)
- Re-trained with `tools/train-shgat-standalone.ts --epochs 1` — only 163 tools (in capabilities) got `shgat_embedding`
- 50-epoch training launched

## Files Modified

- `src/application/services/post-execution.service.ts`
- `src/infrastructure/patterns/factory/algorithm-factory.ts`
- `src/mcp/gateway-server.ts`
- `src/graphrag/learning/per-training.ts`
- `scripts/compare-embeddings.ts` (new — benchmark tool)

## NOT committed — changes are local only, pending validation.
