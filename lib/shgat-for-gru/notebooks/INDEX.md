# SHGAT-for-GRU Notebooks Index

Notebooks analyzing the SHGAT (Structured Heterogeneous Graph Attention) enrichment pipeline
and GRU (Gated Recurrent Unit) next-tool predictor for PML capability discovery.

**Date range**: 2026-02 to 2026-03 (ongoing)
**Runtime**: Python 3 + NumPy/Sklearn/PyTorch + PostgreSQL (casys DB)
**Last reorganized**: 2026-03-01

---

## Active Notebooks (7)

| NB | Title | Focus | Key Result | Enrichment Notes |
|----|-------|-------|------------|------------------|
| 10 | SHGAT Enrichment Impact | V2V + MP embedding quality | Intra-cap +0.083, K-NN co-cap 24%->43% | Update baselines with latest SHGAT retrain; add V-E residual comparison |
| 13 | Cap Prediction Diagnostic | Embedding distinctiveness, data sparsity | 40.4% argmax on cap, median rank 34, 46% singletons | Re-run with latest vocab (post cap-frequency-cap); update NN analysis |
| 16 | V->E Residual Impact | Learned gamma params, cap movement | a=1.37, b=3.73, gamma~0.99; SHGAT 59.0% Hit@1 | NB10 baselines are stale (V2V-only era); update reference values |
| 22 | Cap Cleanup & Tuning | Test artifacts, missing vocab caps | 55 test/fake in vocab, 68 caps NOT in vocab | Test artifact purge STILL PENDING (6.5% noise); action items live |
| 27 | Flatten L1/L2 Impact | L2 embedding orthogonality | L2 cos~0.00 to L1; flatten L1 = net positive (+11 caps) | Summary table in cell 6 needs actual values filled in |
| 28 | GRU Diagnostic Analysis | Main diagnostic (hierarchical vs orphan) | 83% tools orphan (L2=0.014), power law (67% 1x targets) | Add cluster cohesion metrics from NB29; cross-ref NB13 NN analysis |
| 29 | SHGAT Cluster Cohesion | Parent-child clustering quality | sim_parent_child +0.207, silhouette still negative | Add per-namespace breakdown; compare with NB10 V2V-only baseline |

---

## Enrichment Details per Notebook

### NB10 -- SHGAT Enrichment Impact Analysis
- **Sections**: V2V reconstruction, intra/inter-cap similarity, t-SNE, NN analysis, MP observatory, tool-cap gap, cap movement, attention weights
- **12 sections, 36 cells** -- the most comprehensive SHGAT analysis
- **What to update**: Sections 1-8 use V2V-only baselines. Post V-E residual retrain, the SHGAT-enriched embeddings are different. Re-run with current DB embeddings and add a "V-E residual era" column to the comparison tables.
- **PNGs**: 7 (cap-movement, inter-cap-separation, intra-cap-similarity, nn-cocap, tool-cap-gap, tsne-by-capability, tsne-raw-vs-enriched)

### NB13 -- Cap Prediction Diagnostic
- **Sections**: Canonicalization maps, vocab loading, embedding matrix, traces, argmax simulation, cap uniqueness, per-cap data density, NN distinctiveness
- **Unique value**: Intent-only argmax proxy (where does softmax land?), per-cap training density, cap NN type analysis (51% NN is a tool). None of this is in NB28.
- **What to update**: The canonicalization maps (cell 3) should be verified against the latest `train-gru-with-caps.ts` logic; vocab nodes count may have changed since cap-frequency-cap was introduced.

### NB16 -- V->E Residual Impact Analysis
- **Sections**: Load SHGAT params (gamma curve), cap movement raw->SHGAT, gamma vs n_children plot, intra-cap similarity, inter-cap separation, proxy Hit@1, bottleneck analysis, data quality
- **Unique value**: The gamma analysis plot (16-gamma-vs-nchildren.png) and the correlation gamma<->embedding stability. Only place these params are analyzed.
- **What to update**: The "NB10 baseline" reference values (0.8320 cos, 0.5307 L2) are from the V2V-only era. Current SHGAT produces different deltas. Add a note that baselines need recalibration.

### NB22 -- Cap Cleanup & Tuning
- **Sections**: Cap=100 vs cap=30 comparison, caps NOT in vocab diagnostic, test artifacts in vocab, cleanup recommendations, centroid intent analysis
- **Unique value**: The ONLY notebook listing which caps are NOT in vocab (68 caps, 336 examples = 15.2% waste), and the test artifact inventory (55 test/fake caps). The post-hoc note confirms test purge is STILL PENDING.
- **What to update**: Section 1 (cap=100 vs cap=30) is historical -- add a note that capping was superseded. Sections 2-4 remain actionable. Update with current vocab counts if they changed.

### NB27 -- Flatten L1/L2 Impact
- **Sections**: Data loading, OLD vs NEW flatten simulation, SHGAT graph impact, cap-as-terminal impact, vocab impact, L2 embedding orthogonality, t-SNE L0/L1/L2
- **Unique value**: Proves L2 embeddings live in an orthogonal subspace (cos~0.00), and that the flatten change is a net positive (+11 caps gained, 0 lost). Critical for understanding why L2 caps hurt GRU.
- **What to update**: The summary cell (cell 6) has a markdown table template with "?" placeholders -- should be auto-filled from the code output.

### NB28 -- GRU Diagnostic Analysis (main diagnostic)
- **Sections**: Tool embedding loading (raw vs SHGAT delta), cap structure + hierarchical/orphan classification, training data reproduction, SHGAT delta analysis, t-SNE, cap-children proximity, cap prediction analysis (single-tool ratio), softmax confusion zones, power law
- **Unique value**: The central diagnostic notebook. Hierarchical vs orphan split (83% orphan), power law analysis (67% 1x), softmax confusion zones (erpnext worst: 64 neighbors >0.90).
- **What to update**: Could benefit from NB29's cluster cohesion metrics as an additional section. The cap-children proximity analysis (mean 0.990, 282/285 > 0.95) overlaps with NB29 but from a different angle (per-cap vs aggregate).

### NB29 -- SHGAT Cluster Cohesion
- **Sections**: Data loading, cluster metrics (4 metrics: parent-child, intra, inter, silhouette), grouped bar chart, t-SNE top-10 cap clusters
- **Unique value**: The only notebook computing silhouette score (still negative = poor cluster structure) and providing a clean raw-vs-SHGAT comparison on 4 standardized metrics.
- **What to update**: The summary markdown table (cell 6) has "?" placeholders. Add per-namespace breakdown (erpnext/syson/std clusters). Compare with NB10 V2V-only era values.

---

## Archived Notebooks (22)

Moved to `archive/` on 2026-03-01. These notebooks are historical -- their findings informed decisions that are now implemented. They remain available for reference.

| NB | Title | Why Archived |
|----|-------|-------------|
| 01 | MP Toy Problem | Foundational theory, no longer actively referenced |
| 02 | Workflow-Level Retrieval | n8n-based, approach abandoned |
| 03 | GRU Workflow Sequencer | Co-occurrence graph = quasi-clique, abandoned |
| 04 | Sequential Graph + Tool GRU | Graph methods deprioritized |
| 05 | GRU Benchmark (post-FQDN) | Superseded by NB28 diagnostics |
| 06 | Executed Path Audit | Data quality fix completed (task_results source) |
| 07 | SHGAT Graph Visualization | Static snapshot, graph changed since |
| 08 | Post-Fix Benchmark | Superseded by current benchmarks |
| 09 | BPE Capability Analysis | Led to cap-as-terminal, conclusion absorbed |
| 11 | Cap-as-Terminal Diagnostic | 3 bugs found and fixed; findings in NB28 |
| 12 | PreserveDim Residual | Conclusion: r=0 optimal, implemented in prod |
| 14 | SHGAT Phase Residual | Superseded by NB16 (V-E residual with trained params) |
| 15 | SHGAT Full Loop E-V | E-V validated, now part of standard pipeline |
| 17 | Cap Vocab Filtering | Led to canonicalization, now in production |
| 18 | SHGAT Beam Rescoring | Rescoring = +0pp, approach abandoned |
| 19 | n8n MCP Mapping | n8n = 60% noise, SKIP_N8N=true is default |
| 20 | P2 Cleanup Impact | Cleanup implemented, findings absorbed |
| 21 | Per-Cap Frequency Capping | Superseded by cap-source weighting (post-hoc note) |
| 23 | Cap Training Strategy | Centroid rejected (70% info loss); class weights abandoned (NB24) |
| 24 | Class Weight Variations | All CW variants worse than focal loss baseline |
| 25 | Natural Hierarchy Test | L2->L1->L0 conserved = tool -8.1pp; flatten L0 optimal |
| 26 | Structural Features vs SHGAT | All features removed; SHGAT encodes hierarchy (cos=0.94) |

Also archived: orphan PNGs from NB01-04, NB27 data artifacts (.pt, .npz, .npy from deleted hier-seq-bench).

---

## File Naming Convention

- Notebooks: `NN-descriptive-name.ipynb`
- Associated images: `NN-description.png` (in same directory)
- Archive: `archive/NN-*` (full history preserved via git)
- Missing number: NB06 does not exist (skipped in original numbering)
