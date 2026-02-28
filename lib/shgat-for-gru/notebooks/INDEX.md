# SHGAT-for-GRU Notebooks Index

Notebooks analyzing the SHGAT (Structured Heterogeneous Graph Attention) enrichment pipeline
and GRU (Gated Recurrent Unit) next-tool predictor for PML capability discovery.

**Date range**: 2026-02 (ongoing)
**Runtime**: Python 3 + NumPy/Sklearn/PyTorch + PostgreSQL (casys DB)

---

## Summary Table

| NB | Title | Tags | Key Result |
|----|-------|------|------------|
| 01 | MP Toy Problem -- Aggregation vs Discrimination | `shgat`, `mp`, `synthetic`, `theory` | Smoothing MP kills discrimination; contrastive MP + routing = optimal |
| 02 | Workflow-Level Retrieval (L1 vs L0) | `retrieval`, `n8n`, `cosine`, `scaling` | >80% R@1 with <50 workflows; set cover beats top-k for composite intents |
| 03 | GRU Workflow Sequencer | `gru`, `training`, `n8n`, `composite` | GRU learns STOP token; graph walk useless at all scales (co-occurrence = quasi-clique) |
| 04 | Sequential Graph + Tool-Level GRU | `gru`, `graph`, `transitions`, `scaling` | Directed sequential graph sparse (2% density) vs co-occurrence (57%); top-1 cosine still wins |
| 05 | GRU Benchmark Analysis (post-FQDN fix) | `benchmark`, `data-quality`, `analysis` | Hit@1 65.7%->44.4% (3x harder test); vocab 644->1884; n8n drowns prod signal (2.9%) |
| 07 | SHGAT Graph Visualization | `shgat`, `visualization`, `graph` | 181 tools, 875 edges; hub tools (psql_query: 22 caps) = MP leakage risk |
| 08 | Post-Fix Benchmark Analysis | `benchmark`, `data-quality`, `shgat` | SHGAT delta: -27.3pp (broken) -> -1.9pp (fixed); E2E Beam +6.2pp with SHGAT |
| 09 | BPE Capability Analysis | `bpe`, `capabilities`, `data-quality` | 63 BPE merges; 56/63 aligned with existing caps; 105/128 multi-tool caps = dead |
| 10 | SHGAT Enrichment Impact Analysis | `shgat`, `v2v`, `embeddings`, `clustering` | V2V changes 111/920 tools (12.1%); intra-cap sim +0.083; K-NN co-cap rate 24%->43% |
| 11 | Cap-as-Terminal Diagnostic | `gru`, `capabilities`, `training`, `bugs` | 3 bugs found (predictNext, L2 norm, intent dedup); post-fix: Global 45.2%, Cap 41.6% |
| 12 | PreserveDim Residual Analysis | `shgat`, `residual`, `embeddings` | Optimal r=0 (pure MP); 100% of caps improved with zero residual; r=0.3 default is wrong |
| 13 | Cap Prediction Diagnostic | `gru`, `capabilities`, `canonicalization` | 40.4% argmax lands on cap; correct cap median rank=34; 109/238 caps have 1 example only |
| 14 | SHGAT Phase Residual Analysis | `shgat`, `residual`, `v2e`, `training` | V->E destroys cap intent (Hit@1 3.6%); learnable gamma fixes it (38.7%); best a=-1.0, b=0.5 |
| 15 | SHGAT Full Loop E->V Impact | `shgat`, `e2v`, `full-loop` | E->V boosts tool Hit@1 4.9%->17.4% (+12.5pp); 156/920 tools have parent caps (17%) |
| 16 | V->E Residual Impact Analysis | `shgat`, `residual`, `training`, `v2e` | Trained params a=1.48, b=3.92 (gamma~0.99); SHGAT training 59.0% Hit@1 (ep10) vs 25.1% without |
| 17 | Cap Vocab Filtering | `gru`, `capabilities`, `filtering`, `canonicalization` | 80 ambiguous caps, 144 sparse; filter to 130 caps = 1050 vocab; led to canonicalization impl |
| 18 | SHGAT Beam Rescoring | `shgat`, `gru`, `beam`, `rescoring` | SHGAT rescoring = +0pp; oracle gap = 16.7pp First-N; rescoring not the bottleneck |
| 19 | n8n + MCP Mapping Analysis | `n8n`, `data-quality`, `augmentation` | 60% Smithery noise; PML-only = 15K/38K (40%); transition overlap 2.9%; n8n drowns prod |
| 20 | P2 Cleanup Impact Analysis | `data-quality`, `cleanup`, `canonicalization` | Canon dedup 337->284 caps (+2.6pp Hit@1); test artifacts: 45 caps; combined cleanup +3.2pp |
| 21 | Per-Cap Frequency Capping | `training`, `imbalance`, `sampling` | db:postgresQuery = 43.2% of data; FPS cap=30: top cap drops to 2.6%; Gini 0.754->0.544 |
| 22 | Cap Cleanup & Frequency Cap Tuning | `training`, `cleanup`, `tuning` | Cap=30 too aggressive (tool -12pp); 84 caps NOT in vocab (16.8% wasted); centroid = 1/cap idea |
| 23 | Cap Training Strategy Study | `training`, `imbalance`, `centroid`, `strategy` | Centroid NOT recommended (70% info loss); class-weighted CE = best (0% loss, 1-line change) |
| 24 | Class Weight Variations | `training`, `imbalance`, `weighting` | 6 schemes compared; sqrt_inverse = best compromise; clamped [0.3, 3.0] = most predictable |

---

## Detailed Sections

### NB01 -- MP Toy Problem: Aggregation vs Discrimination

**Tags**: `shgat`, `mp`, `synthetic`, `theory`

**Purpose**: Test whether classic message passing (GAT smoothing) helps or hurts tool discrimination on a synthetic 7-level hierarchy with 512 tools.

**Key findings**:
- Smoothing MP (GAT-style aggregation) destroys intra-cluster discrimination -- R@1 drops with lower alpha
- Contrastive MP (push siblings apart) increases discrimination and R@1
- Hierarchical beam search routing preserves embeddings while pruning candidates
- Routing + contrastive combined = optimal approach

**Status**: Foundational theory validated. Informed decision to avoid classic smoothing in SHGAT for GRU use case.

---

### NB02 -- Workflow-Level Retrieval (L1 vs L0)

**Tags**: `retrieval`, `n8n`, `cosine`, `scaling`

**Purpose**: Test if predicting workflows (L1) instead of individual tools (L0) yields better retrieval. Uses 7561 n8n workflows with BGE-M3 1024D intent embeddings.

**Key findings**:
- Workflow retrieval R@1 >80% with catalog <50 workflows and moderate noise (sigma=0.10)
- ID/OOD similarity gap is small -- rejecting unknown intents is difficult with cosine alone
- Greedy set cover beats top-k for composite intents (2-3 workflows combined)
- L1 prediction covers ~5 tools per workflow vs individual L0 retrieval

**Status**: Validated L1 retrieval as viable. Composite intent decomposition identified as key challenge.

---

### NB03 -- GRU Workflow Sequencer

**Tags**: `gru`, `training`, `n8n`, `composite`

**Purpose**: Train a GRU to predict workflow sequences from composite intents. Compare against cosine top-k, iterative residual retrieval, and graph-based methods.

**Key findings**:
- GRU learns when to STOP (STOP token), which cosine top-k cannot do
- Co-occurrence graph is a quasi-clique (14.5M edges for 7117 workflows) -- graph methods get 0% SeqAcc
- For single-workflow intents, cosine top-1 suffices; GRU adds value only for composites
- Graph walk, graph boosted, and subgraph cover all fail due to dense co-occurrence graph

**Status**: Co-occurrence graph approach abandoned. Directed sequential graph explored in NB04.

---

### NB04 -- Sequential Graph + Tool-Level GRU

**Tags**: `gru`, `graph`, `transitions`, `scaling`

**Purpose**: Replace co-occurrence graph with directed tool transition graph (A->B from DAG ordering). Train tool-level GRU on real MCP tool sequences.

**Key findings**:
- Directed transition graph is sparse (1156 edges, 2% density) vs co-occurrence (14.5M, 57%)
- Despite better graph structure, top-1 cosine still wins at all catalog scales (50-1000)
- Tool-level GRU trained on ordered sequences; limited by catalog size and training data
- Graph methods add marginal value only for graph-biased composite intents

**Status**: Graph-based workflow retrieval deprioritized. Focus shifted to tool-level GRU with SHGAT embeddings.

---

### NB05 -- GRU Benchmark Analysis (post-FQDN fix)

**Tags**: `benchmark`, `data-quality`, `analysis`

**Purpose**: Analyze GRU benchmark results after FQDN normalization fix. Understand why Hit@1 dropped from 65.7% to 44.4%.

**Key findings**:
- Vocab tripled (644->1884 tools) due to FQDN fix recovering previously-hidden tools
- Test set 1.3x larger (84->107 examples) and harder (more diverse tools)
- Absolute correct predictions similar (~47 vs ~55) -- percentage drop is misleading
- n8n data drowns prod signal (2.9% prod ratio); n8n w=1.0 is WORSE than baseline
- 80% of train covered by top 23 tools; 50% of traces are single-step

**Status**: Baseline established post-FQDN. n8n augmentation approach revised (prod oversample required).

---

### NB07 -- SHGAT Graph Visualization

**Tags**: `shgat`, `visualization`, `graph`

**Purpose**: Visualize the SHGAT graph structure as built from DB (capabilities, tools, cap-cap and cap-tool edges). Post data quality fix (2026-02-20).

**Key findings**:
- Graph: 181 tools, 875 cap-tool edges post-normalization (was 209/1039 pre-fix)
- Hub tools (psql_query, data_person) connect to 20+ caps -- MP leakage risk through these
- 73% of tools used by only 1 capability (long tail)
- Cross-server co-occurrence is where SHGAT MP adds most value

**Status**: Visualization produced (interactive HTML + static PNG). Informed hub tool analysis for MP design.

---

### NB08 -- Post-Fix Benchmark Analysis

**Tags**: `benchmark`, `data-quality`, `shgat`

**Purpose**: Analyze benchmark results after three major fixes (FQDN, hierarchy_level, data quality). Compare NO_SHGAT vs SHGAT.

**Key findings**:
- SHGAT delta improved from -27.3pp (broken) to -1.9pp (fixed) = +25.4pp improvement
- E2E Beam First-N: 64.6% NO_SHGAT vs 70.8% SHGAT (+6.2pp) -- SHGAT helps beam path construction
- Hit@1: 52.8% NO_SHGAT vs 50.9% SHGAT (-1.9pp) -- single-step SHGAT adds no value
- Data quality was the problem, not the algorithm. task_results has 0% corruption vs 18.4% UUID in executed_path

**Status**: Confirmed SHGAT helps E2E beam but not single-step Hit@1. Clean data source (task_results) established.

---

### NB09 -- BPE Capability Analysis

**Tags**: `bpe`, `capabilities`, `data-quality`

**Purpose**: Apply BPE (Byte-Pair Encoding) to tool sequences to discover recurring patterns. Validate alignment with declared capabilities.

**Key findings**:
- 63 BPE merges from 278 multi-tool traces; compression to 42.1% of original tokens
- 56/63 BPE skills align with existing caps (Jaccard >= 0.5) -- caps are real patterns
- 105/128 multi-tool caps are "dead" (no matching BPE pattern in traces)
- Top merges dominated by self-repetitions (embedding_encode x8, psql_query x2)
- 97.4% exact match between trace tools and capability tools_used
- Cap prediction viable as GRU target: 99.9% of traces have capability_id
- 29 tools have N:1 cap mapping (same tool, different caps) -- need capability_id to disambiguate

**Status**: BPE validated caps as real patterns. Led to cap-as-terminal GRU approach.

---

### NB10 -- SHGAT Enrichment Impact Analysis

**Tags**: `shgat`, `v2v`, `embeddings`, `clustering`

**Purpose**: Quantify what SHGAT V2V co-occurrence enrichment actually does to BGE-M3 tool embeddings.

**Key findings**:
- V2V changes only 111/920 tools (12.1%) -- 88% are orphans with no co-occurrence neighbors
- Mean cosine delta (raw vs enriched): 0.994 -- very subtle changes
- Intra-capability similarity: +0.083 (0.805->0.887) -- tools within caps get closer
- Inter-capability similarity: +0.021 -- less ideal (also gets closer, not more separated)
- K-NN co-capability rate: 24%->43% (+19pp) -- 75/111 tools improved
- SHGAT MP cap embeddings: mean L2 distance from raw = 0.73 (significant movement)

**Status**: V2V enrichment partially working (intra UP but inter also UP). Cap embeddings via SHGAT MP move significantly from raw BGE-M3.

---

### NB11 -- Cap-as-Terminal Diagnostic

**Tags**: `gru`, `capabilities`, `training`, `bugs`

**Purpose**: Diagnose why cap-as-terminal GRU (918 tools + 281 caps) initially showed 0% cap Hit@1.

**Key findings**:
- Bug 1: `predictNext()` resolved caps to `children[0]` -- evaluate never matched cap targets
- Bug 2: Missing L2 normalization post-SHGAT (tool norm=1.33, cap norm=1.81)
- Bug 3: No intent dedup -- 711 duplicate re-executions flooding db:postgresQuery
- After fixes: Global Hit@1 45.2%, Tool 48.1%, Cap 41.6%, Terminal 97.0%
- 36 ambiguous tool sets (>1 cap for same tools) -- cap disambiguation from intent only

**Status**: Three critical bugs fixed. Cap-as-terminal confirmed viable (v3 champion).

---

### NB12 -- PreserveDim Residual Analysis

**Tags**: `shgat`, `residual`, `embeddings`

**Purpose**: Analyze impact of SHGAT residual connection r on cap embeddings. Does preserving raw BGE-M3 signal help or hurt?

**Key findings**:
- Optimal r=0 (pure MP, no raw preservation) for ALL 280 caps tested
- r=0.3 (default) introduces a tool-cap gap of -0.026 that pure MP reduces to -0.019
- 100% of caps improve child-tool similarity with r=0 vs any r>0
- Per-cap optimal residual for discrimination: 98.6% prefer r in [0.0, 0.1]

**Status**: Confirmed preserveDimResidual=0 is optimal. Changed default in production SHGAT config.

---

### NB13 -- Cap Prediction Diagnostic

**Date**: 2026-02-25 (updated 2026-02-27 with canonicalization)

**Tags**: `gru`, `capabilities`, `canonicalization`

**Purpose**: Diagnose GRU cap prediction with canonicalized vocab (920 tools + 240 caps = 1160). Measure argmax behavior, embedding space, and data distribution.

**Key findings**:
- 40.4% of argmax predictions land on a cap index; only 3.6% on the correct cap
- Correct cap median rank = 34 (far from Hit@1)
- 109/238 caps have only 1 training example (insufficient gradient signal)
- Cap NN is a tool for 123/240 caps (51.2%) -- embedding space is interleaved
- Canonicalization reduces vocab from 329 to 240 caps (28 toolset groups resolved)

**Status**: Identified data sparsity (46% singletons) and softmax dilution as key issues. Led to canonicalization implementation.

---

### NB14 -- SHGAT Phase Residual Analysis

**Date**: 2026-02-26

**Tags**: `shgat`, `residual`, `v2e`, `training`

**Purpose**: Analyze the V->E phase of SHGAT which replaces cap embeddings entirely (no residual). Design a learnable gamma to preserve cap intent.

**Key findings**:
- V->E phase destroys cap intent embedding: Hit@1 drops to 3.6% (from 36.7% with pure intent)
- Learnable gamma = sigmoid(a*log(n+1)+b): best grid search at a=-1.0, b=0.5
- With gamma: Hit@1 recovers to 38.7%, median rank 3 (vs 36 without)
- Caps with few children need high gamma (preserve intent); many children need low gamma (trust MP)
- Grid search over 196 (a,b) combinations; top-3 all achieve Hit@1 >38%

**Status**: V->E residual fix designed and validated. Implemented in SHGAT training (2 learnable params: veResidualA, veResidualB).

---

### NB15 -- SHGAT Full Loop: E->V Impact on Tools

**Date**: 2026-02-26

**Tags**: `shgat`, `e2v`, `full-loop`

**Purpose**: Measure whether better cap embeddings (from V->E fix) improve tool embeddings via E->V backward pass.

**Key findings**:
- Only 156/920 tools (17%) have parent caps -- limited E->V reach
- E->V with alpha=0.4 boosts tool Hit@1 from 4.9% to 17.4% (+12.5pp)
- E->V with fixed V->E (gamma inverse) gives 15.1% (+10.1pp)
- Full pipeline (V->E fix + E->V) helps tools but does not further improve caps
- Rare tools with many parent caps benefit most (e.g., std:env_list: rank 632->10)

**Status**: E->V proven valuable for tool enrichment. Full loop validated but marginal gains over V->E fix alone.

---

### NB16 -- V->E Residual Impact Analysis

**Date**: 2026-02-26 (updated 2026-02-27)

**Tags**: `shgat`, `residual`, `training`, `v2e`

**Purpose**: Analyze trained V->E residual params after SHGAT standalone training reached 59.0% Hit@1 (ep10, up from 25.1%).

**Key findings**:
- Trained params: a=1.483, b=3.917 (init was a=-1.0, b=0.5) -- params moved significantly
- Resulting gamma ~0.99 for all n_children -- model learned to PRESERVE intent almost entirely
- Cap embedding movement: mean cosine(raw, SHGAT) = 0.676 (vs NB10 baseline 0.832)
- Proxy cap Hit@1: raw intent = 100%, SHGAT = 35.7% -- SHGAT still moves caps too much
- Data distribution heavily skewed: 42% of caps have only 1 example

**Status**: V->E residual training successful (+33.9pp SHGAT Hit@1). But high gamma reveals model prefers to preserve raw intent over MP aggregation.

---

### NB17 -- Cap Vocab Filtering

**Date**: 2026-02-27

**Tags**: `gru`, `capabilities`, `filtering`, `canonicalization`

**Purpose**: Analyze cap vocab quality issues identified in NB13 and design filtering strategy.

**Key findings**:
- 80 ambiguous caps (identical toolset to another cap) -- indistinguishable in embedding space
- 144 sparse caps (<2 examples) -- insufficient training signal
- Filter to unique+>=2 examples: 130/329 caps kept (40%), proxy Hit@1 37.0%->43.1% for >=3
- Vocab reduction: 1249 -> 1050 (tools + filtered caps)
- Led to implementation of canonicalization in `train-gru-with-caps.ts`

**Status**: Analysis complete. Canonicalization implemented; became standard in training pipeline. GRU post-canon: 63.4% Hit@1.

---

### NB18 -- SHGAT Beam Rescoring

**Tags**: `shgat`, `gru`, `beam`, `rescoring`

**Purpose**: Test if SHGAT cosine similarity can rescore GRU beam candidates to improve ranking.

**Key findings**:
- Baseline GRU beam: 1st@1=58.3%, First-N=33.3%
- SHGAT rescoring at any alpha: +0pp improvement -- zero net impact
- 0 traces rescued, 0 traces broken by rescoring
- Oracle (best possible beam selection): First-N=50.0% -- 16.7pp room exists but rescoring cannot access it
- Pure SHGAT ranking (ignore GRU scores) degrades First-N by -12.5pp

**Status**: SHGAT beam rescoring abandoned. The bottleneck is beam candidate generation, not ranking.

---

### NB19 -- n8n + MCP Mapping: Viability for GRU Augmentation

**Tags**: `n8n`, `data-quality`, `augmentation`

**Purpose**: Assess quality of n8n->MCP mapping and viability of 38K n8n examples for GRU training augmentation.

**Key findings**:
- T1 mapping (service-aware): 676 mappings, mean sim=0.924 -- reliable
- T2 mapping (schema-aware): 1168 mappings, mean sim=0.828 -- noisy (garbage matches)
- 60% of n8n targets are Smithery tools (not in PML vocab) -- noise
- PML-only filter: 15K/38K examples (40%), 127 unique targets
- Transition overlap PML vs n8n: only 2.9% -- very little shared structure
- n8n w=1.0 is WORSE than baseline (-3.3pp); n8n w=0.3 with 3x prod oversample = +4.2pp
- Signal drowned: 2.9% prod in mixed pool

**Status**: n8n augmentation deprioritized. SKIP_N8N=true became default. PML-only filter implemented.

---

### NB20 -- P2 Cleanup Impact Analysis

**Date**: 2026-02-27

**Tags**: `data-quality`, `cleanup`, `canonicalization`

**Purpose**: Measure impact of four P2 cleanup items to prioritize implementation.

**Key findings**:
- Canonicalization dedup: 337->284 caps, Hit@1 35.2%->37.8% (+2.6pp)
- Test artifact removal (45 caps): Hit@1 37.8%->38.4% (+0.6pp marginal)
- 88 caps NOT in vocab = 16.8% wasted training examples (recoverable)
- Combined cleanup: +3.2pp Hit@1 (raw 337 caps vs cleaned 241 caps)
- Dead caps (0 traces): 0 -- all DB caps have at least some trace data

**Status**: Canon dedup = high impact. Test purge = marginal. Both implemented in data-prep pipeline.

---

### NB21 -- Per-Cap Frequency Capping

**Date**: 2026-02-27

**Tags**: `training`, `imbalance`, `sampling`

**Purpose**: Design per-cap capping with farthest-point sampling (FPS) to address db:postgresQuery dominating 43.2% of training data.

**Key findings**:
- db:postgresQuery: 934/2163 traces (43.2%); top 2 caps = 46.3%
- MAX_PER_CAP=30 with FPS: 2163->1135 examples, top cap drops to 2.6%, Gini 0.754->0.544
- FPS preserves intent diversity better than random sampling (mean sim 0.62 vs 0.68)
- GRU result with cap=30: Cap 82.3% (+2.5pp) but Tool 37.2% (-12.1pp) -- too aggressive

**Status**: FPS capping validated but cap=30 too aggressive for tools. Cap=50 or cap=100 recommended for better tool/cap trade-off.

---

### NB22 -- Cap Cleanup & Frequency Cap Tuning

**Date**: 2026-02-27

**Tags**: `training`, `cleanup`, `tuning`

**Purpose**: Investigate less aggressive capping, diagnose 84 caps NOT in vocab, and plan cleanup actions.

**Key findings**:
- GRU vocab has 1169 entries (920 tools + 249 caps); 49 test/fake artifacts in vocab
- 84 cap targets NOT in vocab = 371 wasted training examples (16.8%)
- 20 of missing caps are test/fake artifacts; 64 are real caps with missing vocab entries
- 86.5% of traces are single-tool (cap-as-terminal only, no tool bigrams)
- Centroid idea (1 example per cap): reduces cap-as-terminal from 2207 to 332 examples

**Status**: Cleanup actions defined. Centroid approach explored further in NB23.

---

### NB23 -- Cap Training Strategy: Centroid vs Alternatives

**Date**: 2026-02-27

**Tags**: `training`, `imbalance`, `centroid`, `strategy`

**Purpose**: Empirical study comparing centroid, medoid, stratified sampling, FPS, and class-weighted loss for handling class imbalance in GRU training.

**Key findings**:
- 104 tools with multi-cap intents; 324 SHGAT-similar pairs; 9 critical (2.8%)
- Centroid beats medoid 104-0 (expected geometrically) but BOTH lose 70% of intent information
- Popular tools poorly served by centroid: psql_query (39% coverage), code:add (40%)
- Class-weighted CE loss = 0% info loss, 1-line code change -- best recommendation
- Stratified 1/cap/tool = 538 examples, 0% info loss -- second best
- SHGAT clusters: 777/920 tools clustered (sim>0.85), intent = sole discriminant for SHGAT-similar tools

**Status**: Centroid/medoid rejected. Class-weighted CE loss recommended as primary fix. Implementation pending in train-worker-prod.ts.

---

### NB24 -- Class Weight Variations for GRU Training

**Tags**: `training`, `imbalance`, `weighting`

**Purpose**: Compare 6 different class-weighting schemes for GRU cross-entropy loss on actual training data distribution (125 tools, freq range 1-334).

**Key findings**:
- inverse_freq (current prod): most aggressive, very high dynamic range -- may starve frequent tools
- sqrt_inverse: moderate aggressiveness, good compromise between rare and frequent targets
- log_inverse: conservative, may not help rare targets enough
- clamped [0.3, 3.0]: bounded 10x dynamic range, predictable behavior
- clamped [0.5, 2.0]: very gentle, almost uniform -- defeats purpose
- effective_samples: theoretically grounded (beta-dependent), moderate

**Status**: sqrt_inverse or clamped [0.3, 3.0] recommended. Awaiting training run validation.

---

## Missing Notebook Numbers

- **NB06**: Does not exist (skipped in numbering).

## File Naming Convention

- Main notebooks: `NN-descriptive-name.ipynb`
- Executed copies: `NN-descriptive-name-executed.ipynb` (not indexed here)
- Associated images: `NN-description.png` (in same directory)
