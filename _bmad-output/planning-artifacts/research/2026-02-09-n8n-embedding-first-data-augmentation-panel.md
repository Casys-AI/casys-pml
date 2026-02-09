# Expert Panel Report: n8n Workflow Data Augmentation for CompactInformedGRU

**Panel Date:** 2026-02-09
**Subject:** Feasibility and strategy for using n8n workflow templates to augment training data

## Context

- CompactInformedGRU: 314K trainable params, 457 examples, 644 tools
- Test accuracy: 53.5% next-tool, 70.7% termination
- Greedy path exact match: 52%, Beam@3: 66% (measured post-panel)
- Manual n8n→MCP mapping: 16% coverage (294/1827 patterns)

## Consensus Points

1. **Data scarcity is THE binding constraint** — ratio 687 params/example. 53.5% reflects data poverty, not architectural failure.
2. **Embedding-first approach is architecturally sound** — similarity_head is frozen Dense layer with tool embeddings. Model predicts in continuous embedding space → n8n virtual embeddings naturally map to closest MCP tool.
3. **Production data must remain primary signal** — n8n = idealized workflows, prod = ground truth with real patterns.
4. **What to embed: Structured template (Option C)** — `"Tool: {nodeType}. Operation: {op}. Description: {desc}. Inputs: {inputNames}. Outputs: {outputNames}."` — No raw JSON (noise for BGE-M3), not just name (not discriminative enough).

## Debate: How to Mix Production + n8n Data

### Majority (5-3): Soft targets + KL divergence for n8n

- n8n examples: soft distribution (cosine sim between n8n node embedding and all MCP tools, temp-scaled softmax)
- Loss: KL divergence, weight 0.3
- Production: hard targets, focal CE, weight 1.0
- Production oversampled 3-5x per epoch

### Minority: Two-phase training (simpler)

- Phase 1: Pre-train on n8n (15 epochs)
- Phase 2: Fine-tune on production (30 epochs)

## Recommended Implementation Plan

### Phase 0: Baseline (done)
- Next-tool test: 53.5% → 55.3% (run variance)
- Beam@3 exact match: 66% (new metric)

### Phase 1: n8n Data Preparation (2-3 days)
1. Scrape ~7,800 workflows (existing scraper, scale up)
2. Filter: 2+ nodes, valid connections, views > 100 → expect 5,000-6,000
3. Embed node descriptions with BGE-M3 (structured template)
4. Build TransitionExamples from connection graphs
5. Compute soft targets for each n8n example

### Phase 2: Soft-target Loss (1-2 days)
1. Add `softTargets?: Float32Array` to TransitionExample
2. n8n examples: KL divergence loss with weight 0.3
3. Production examples: unchanged (focal CE)

### Phase 3: Training + Evaluation (1-2 days)
1. Mixed training: oversample prod 3-5x + n8n with soft targets
2. Ablation studies
3. Hyperparameter search: n8n weight, pre-train epochs, final temperature

## Projections

| Metric | Current | + n8n soft targets | + pre-train/fine-tune |
|--------|---------|--------------------|-----------------------|
| Next-tool acc | 53.5% | 58-64% | 62-68% |
| Termination | 70.7% | 73-78% | 75-80% |
| Path exact (greedy) | 52% | — | — |
| Path exact (beam@3) | 66% | 72-78% | 75-82% |

## Risks

1. **Distribution shift** (HIGH): n8n ≠ MCP ecosystem. Mitigation: soft targets + fine-tune prod last.
2. **Embedding confusion** (MEDIUM): similar tools too close. Mitigation: measure confusing pairs, lower temperature.
3. **Over-representation** (MEDIUM): 5000 n8n > 457 prod. Mitigation: oversample prod 3-5x, early stopping on prod accuracy.

## Beam Search Results (measured 2026-02-09)

| Metric | Greedy | Beam@3 | Gain |
|--------|--------|--------|------|
| Path exact match | 52.0% | **66.0%** | +27% |
| Tools match | — | **76.0%** | — |

Implementation: length-normalized beam with branching (terminate + continue at each step), alpha=0.7.

## Supplementary: Intent Paraphrasing

Panel strongly recommends LLM-generated intent paraphrases (5-10x per intent) in parallel. Combined with n8n: target 70-75% next-tool accuracy.
