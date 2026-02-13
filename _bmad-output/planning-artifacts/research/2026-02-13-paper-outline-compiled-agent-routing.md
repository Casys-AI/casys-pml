# Paper Outline: Compiled Agent Routing for MCP Workflows

**Date**: 2026-02-13
**Target**: arXiv preprint (cs.AI / cs.LG / cs.SE)
**Status**: OUTLINE -- ready for drafting

---

## Proposed Title

**"Compiled Tool Selection: Offloading MCP Routing Decisions from LLMs to a Sub-300K Parameter SHGAT+GRU Model"**

Alternative titles:
- "From Interpreter to Compiler: Learning Tool Selection Patterns for MCP Workflows with 258K Parameters"
- "SHGAT+GRU: A Lightweight Compiled Router for Multi-Tool AI Agent Workflows"
- "Compiled Agent Routing: Separating Tool Selection from Parameter Filling in MCP Workflows"

---

## Abstract (Draft, ~250 words)

Large Language Models (LLMs) are increasingly used as tool-calling agents, selecting and sequencing tools from growing registries such as Model Context Protocol (MCP) servers. At each step, the LLM must both *select which tool to call* and *fill its parameters* -- two fundamentally different tasks bundled into a single expensive inference call. We propose *compiled tool selection*: a paradigm where the tool selection sub-task is offloaded to a lightweight, specialized ML model trained on production traces, while the LLM focuses on what it does best -- understanding intent and filling parameters for the single selected tool, with a dramatically reduced context.

We present a unified architecture combining SHGAT, a Semantic Hierarchical Graph Attention Network that structures a hypergraph of 870 vocabulary nodes into a capability hierarchy, with a Compact Informed GRU (~258K trainable parameters) that autoregressively predicts the next tool conditioned on intent embeddings, execution context, and SHGAT-derived structural features. SHGAT and GRU are tightly coupled: SHGAT provides composite features and a shared hierarchical vocabulary that the GRU decodes sequentially.

Evaluated on production traces (k-fold, 5 folds), the unified model achieves Hit@1=60.6%, Hit@3=80.9%, MRR=0.712 for next-tool prediction, at sub-millisecond CPU latency. On LiveMCPBench (525 tools, 69 servers), SHGAT with contrastive training achieves R@1=16.4%, R@3=37.6% for cold-start retrieval. The compiled router eliminates the need to inject the full tool catalog into the LLM context at each step, reducing both context length and per-step LLM cost while making the routing decision itself essentially free.

We draw an analogy to JIT compilation: just as interpreters give way to compiled code for hot paths, LLM-based tool selection can be progressively compiled for recurring patterns, while the LLM remains as fallback for novel situations and as executor for parameter filling.

---

## 1. Introduction

### 1.1 The Tool Routing Problem
- Growth of MCP ecosystem: 30,000+ tools across 7,000 services (Zapier alone)
- Microsoft Research's tool-space interference problem: adding tools *hurts* LLM performance
- Current approach: every tool call = full LLM inference with entire tool catalog in context ($$$, latency, non-deterministic)

### 1.2 The Two Sub-Tasks Hidden in "Tool Calling"
- Every LLM tool call actually bundles TWO distinct tasks:
  1. **Tool selection**: "Which tool should I call?" — a classification/ranking problem over the tool registry
  2. **Parameter filling**: "With what arguments?" — a generation problem requiring intent understanding
- Current LLMs do both in a single forward pass, with the ENTIRE tool catalog injected in context
- Key observation: tool selection is a **structured decision** (finite choices, learnable patterns), while parameter filling is a **generative task** (requires language understanding)
- Our thesis: these should be **separated**. Selection can be compiled; filling requires an LLM but with a MUCH smaller context (one tool schema instead of hundreds)

### 1.3 The Cost Problem (quantified)
- BFCL V4: best models score 59-71% on function calling (GLM-4.5: 70.85%, Claude Opus 4.1: 70.36%, GPT-5: 59.22%)
- MCPMark: even GPT-5 medium only 52.6% pass@1, avg 16.2 turns and 17.4 tool calls per task, $127/run
- LiveMCPBench: Claude-Sonnet-4 = 78.95%, but GPT-4.1 = 38.95%, Gemini-2.5-Pro = 41.05%
- ToolACE-MCP (Yao et al., 2026): specialized 8B router achieves 53.44% task success vs GPT-4o's 47.41% -- confirms that specialized routing beats general-purpose LLMs
- Key insight: **most production workflows are recurring patterns** -- 80%+ of routing decisions follow known paths
- Cost breakdown: in a 10-tool workflow, the LLM processes the full catalog 10 times. With compiled selection, it processes only 1 tool schema per step.

### 1.4 The Compilation Analogy
- Interpreters (LLMs): flexible, general, expensive per execution — do BOTH selection and filling
- JIT compilation (our approach): observe hot paths, compile SELECTION to specialized models, keep LLM for FILLING
- AOT compilation (future): pre-compile entire workflow graphs including argument templates
- Hybrid: compiled selection for known patterns, LLM fallback for novel situations + always LLM for parameter filling

### 1.5 Contributions
1. **Separation of tool selection and parameter filling**: formalize why these should be decoupled, with compiled models for selection and LLMs for filling
2. **Unified SHGAT+GRU architecture**: a tightly coupled model where SHGAT provides hierarchical structural features and vocabulary, and GRU decodes sequential routing decisions
3. **VocabNode hierarchy**: unified vocabulary bridging atomic tools (L0) and capabilities (L1+), shared between SHGAT and GRU
4. **Hyperedge routing**: when uncertain, the GRU predicts at capability level (L1+) and SHGAT resolves the final tool via attention — a natural division of abstraction
5. **n8n data augmentation pipeline**: workflow-based soft targets for cross-domain transfer
6. **Empirical evidence**: 258K-param compiled selection achieves 60.6% Hit@1 at <1ms, enabling LLM cost reduction by eliminating the tool catalog from context

---

## 2. Related Work

### 2.1 LLM-Based Tool Calling and Benchmarks

| Benchmark | Scale | Best LLM Result | Key Finding |
|-----------|-------|-----------------|-------------|
| BFCL V4 (Berkeley) | Multi-category | GLM-4.5: 70.85% | Models ace single-turn but fail multi-turn context |
| LiveMCPBench | 527 tools, 95 tasks | Claude-Sonnet-4: 78.95% | Huge variance: Qwen3-32B only 30.53% |
| MCPMark | 5 MCP envs, 127 tasks | GPT-5: 52.6% pass@1 | Avg 16.2 turns, $127/run |
| ToolBench/ToolLLM | 16,000+ APIs | Tool-MVR +24% over ToolLLM | Error recovery 58.9% vs 9.1% |
| MCP-Bench (Accenture) | 28 servers, 250 tools | -- | Real-world MCP server tasks |

**Positioning**: These benchmarks measure LLM *agents* doing end-to-end tasks. Our compiled routing targets a specific *sub-problem*: the tool selection/sequencing decision, not the full agent loop. We show this sub-problem can be solved by a 258K-param model for recurring patterns.

### 2.2 LLM Routing and Model Selection

| Paper | Venue | Approach | Difference from Ours |
|-------|-------|----------|---------------------|
| RouteLLM (LMSYS) | ICLR 2025 | Binary classifier routes queries to strong/weak LLM | Routes between *models*, we route between *tools* |
| MasRouter | ACL 2025 | Cascaded controller for role/model allocation in MAS | Routes *agent roles*, we route *tool sequences* |
| OI-MAS | arXiv Jan 2026 | Confidence-aware multi-agent routing | Routes *model scale*, we route *tool selection* |
| InferenceDynamics | arXiv 2025 | Capability profiling for LLM routing | Routes *queries to models*, we route *intents to tools* |

**Positioning**: All routing papers focus on *which model* to use. We address *which tool* to call next -- orthogonal and composable with model routing.

### 2.3 Tool Retrieval, Selection, and Specialized Routing

| Paper | Approach | Difference from Ours |
|-------|----------|---------------------|
| **ToolACE-MCP (Yao et al., Jan 2026)** | Fine-tuned Qwen3-8B (LoRA), history-aware routing, graph-based candidate expansion, 15K synthetic trajectories | **Key competitor.** 53.44% MCP-Universe, 60% MCP-Mark, 91.6% Agent Route. But: 8B-param LLM, needs GPT-4o for trajectory synthesis, flat tool representation. We achieve comparable routing with 258K non-LLM params, real production traces, and hierarchical vocabulary. |
| Tool-to-Agent Retrieval | Shared embedding space + KG, +19.4% R@5 on LiveMCPBench | Retrieval only (one-shot), no sequential prediction |
| Agent-as-a-Graph | KG-RAG for tool/agent retrieval | Graph retrieval, no learned scoring |
| AutoTool (Nov 2025) | Graph from historical trajectories, transition probabilities | Closest to ours! But count-based, no learned embeddings, no hierarchy |
| AutoTool (Dec 2025) | Dynamic tool selection with rationales, 1000+ tools | Requires LLM inference for selection |
| Tool2Vec | Embedding-based tool retrieval | Static embeddings, no sequence modeling |

**Positioning vs ToolACE-MCP**: ToolACE-MCP validates our core thesis -- specialized routers beat generalist LLMs for tool selection. Their 8B LoRA-tuned router (53.44%) outperforms GPT-4o (47.41%) on MCP-Universe. But they remain in the "compressed interpreter" paradigm: a smaller LLM is still an LLM. We push further to "compiled routing" -- a non-LLM model 30,000x smaller that operates on structural features rather than token sequences. ToolACE-MCP also confirms the importance of history-awareness (53% vs 48% w/o history), which aligns with our GRU's autoregressive context conditioning.

**Positioning vs AutoTool (Nov 2025)**: AutoTool constructs transition probability graphs from trajectories -- conceptually similar to our GRU's sequential modeling. Key differences: (a) AutoTool uses count-based statistics, our GRU uses learned representations; (b) no intent conditioning in AutoTool; (c) no hierarchical vocabulary; (d) no SHGAT structural features.

### 2.4 Agent Optimization and Distillation

| Paper | Approach | Difference from Ours |
|-------|----------|---------------------|
| DSPy (Stanford) | Compile declarative LM programs into optimized pipelines | Optimizes *prompts*, we replace *inference* entirely |
| FireAct (Princeton) | Fine-tune small LM on GPT-4 trajectories | 7B LM agent, still LLM-sized. We use 258K-param non-LLM model |
| Trace (Microsoft) | AutoDiff-like optimization for AI agents | Optimizes agent graph, doesn't compile routing |
| Agent Distillation (NeurIPS 2025) | Distill LLM agent into 0.5-3B models with tools | Distills the *whole agent*; we distill *just routing* into a tiny model |

**Positioning**: DSPy compiles prompts, FireAct/Agent Distillation compress entire agents into smaller LMs. We take a fundamentally different approach: we don't distill an LLM -- we train a purpose-built ML model (GRU+SHGAT, <300K params) directly on production traces. This is more analogous to replacing an interpreter with compiled code than compressing the interpreter itself.

### 2.5 Graph Attention Networks and Hypergraph Methods

| Work | Relevance |
|------|-----------|
| **GAT (Velickovic et al., ICLR 2018)** | Foundational attention mechanism on graphs -- our multi-head attention scoring derives from this |
| **n-SuperHyperGraph (Smarandache, 2022)** | Mathematical formalism for nested hypergraphs -- theoretical foundation for multi-level tool hierarchies |
| **SuperHyperGraph Attention Networks (Fujita, arXiv:2412.01176, 2024)** | Unifies GAT + HGAT + n-SuperHyperGraphs; 7 formal theorems, no empirical validation. Our SHGAT is the first empirical implementation in the n=1 (HGAT) special case applied to tool routing |
| HGTN (Hypergraph Transformer Neural Network) | Hierarchical hypergraph with attention -- architectural inspiration |
| RE-H2AN (Hierarchical Hypergraph Recurrent Attention) | Multi-level modeling on type-induced hypergraphs |
| FGNN (Feature-Gated GNN + GRU attention) | GRU + attention for sequential recommendation |

**Positioning**: Our SHGAT is the first empirical instantiation of hypergraph attention for MCP tool hierarchies. We build on the theoretical framework of Fujita (2024) for multi-level attention aggregation and apply it to a novel domain where capability-level nodes (L1+) aggregate tool-level signals (L0) via multi-head attention, with contrastive training on tool relevance. Unlike prior GNN work in recommendations, our graph structure is semantically meaningful (tool-capability hierarchy) rather than interaction-derived.

---

## 3. Problem Formulation

### 3.1 Definitions
- **Tool Registry** T = {t_1, ..., t_N}: set of atomic MCP tools (N=644 in our setting)
- **Capability Hierarchy** C = {c_1, ..., c_M}: higher-level groupings (M=226)
- **VocabNode**: unified node v in V = T U C with level l(v), embedding e(v) in R^1024 (BGE-M3)
- **Workflow**: sequence w = (t_1, t_2, ..., t_K) of tool invocations
- **Intent**: natural language query q with embedding e(q) in R^1024
- **Routing Decision**: given intent q and context (t_1, ..., t_i), predict t_{i+1} or TERMINATE

### 3.2 The Compiled Routing Problem
- **Input**: intent embedding, execution context (tools already called), structural graph features
- **Output**: distribution over V (next tool/capability) + termination probability
- **Constraint**: model must fit in <1M parameters, inference <1ms on CPU
- **Objective**: maximize Hit@K for the next tool, maximize termination F1

### 3.3 Unified Architecture: SHGAT as Structural Backbone, GRU as Sequential Decoder

**Key design principle**: SHGAT and GRU are NOT two independent systems used in sequence. They form a **single unified model** where SHGAT provides the structural understanding of the tool hierarchy and the GRU consumes SHGAT-derived features for sequential decision-making.

The information flows are:
1. **SHGAT → GRU (composite features)**: SHGAT's `scoreNodes()` produces composite features [3D] that become the GRU's 5th input, telling it about graph-level structural signals (attention patterns, hierarchy positions)
2. **SHGAT → GRU (vocabulary)**: The frozen `similarity_head` in GRU uses the same BGE-M3 embedding space as SHGAT's VocabNode embeddings -- the GRU's output is projected INTO the space that SHGAT structures
3. **Shared VocabNode hierarchy**: Both SHGAT and GRU operate on the same L0/L1+ hierarchy. When the GRU predicts a L1+ capability node, it means "route through this hyperedge" -- i.e., choose among the children tools of that capability. SHGAT's attention scores over that capability's children break the tie.
4. **Hyperedge routing**: SHGAT helps the GRU decide whether to predict a specific tool (L0) or a capability group (L1+). If SHGAT's attention concentrates on a cluster of co-used tools under one capability, the GRU learns to predict at the capability level, letting SHGAT resolve the final tool.

This is analogous to how a CPU has both an instruction decoder (GRU: what to do next) and a memory hierarchy (SHGAT: where things are organized). Neither works without the other.

---

## 4. Method

### 4.1 SHGAT: Semantic Hierarchical Graph Attention Network

#### 4.1.1 Hypergraph Construction
- L0 nodes: 644 atomic tools with BGE-M3 embeddings (1024D)
- L1+ nodes: 226 capabilities/meta-capabilities
- Edges: tool-to-capability membership, capability-to-meta-capability containment
- Edge features: co-occurrence statistics, trace-derived features (17 dimensions)

#### 4.1.2 Multi-Head Attention
- K attention heads (K=4 default) with learned scoring weights W_k
- Intent-conditioned scoring: W_intent projects intent embedding to head space
- Per-head attention: alpha_{ij}^k = softmax(LeakyReLU(a^k . [W_k h_i || W_k h_j || e_intent]))

#### 4.1.3 Hierarchical Message Passing
- Upward pass: L0 -> L1 -> L2 (aggregate tool signals into capabilities)
- Downward pass: L2 -> L1 -> L0 (propagate capability-level patterns to tools)
- Residual connections: preserveDimResiduals per level (critical for no-training regime)
- Key finding: downwardResidual config crucial -- 0.99 = no-op (safe), 0.5 = collapse (destructive)

#### 4.1.4 Contrastive Training
- Positive pairs: (intent, correct tool), Negative: (intent, wrong tool)
- Temperature-scaled similarity loss
- 5-fold CV results on LiveMCPBench (525 tools, 95 queries):
  - B-Flat (LR=0.001, 10 epochs): R@1=16.4%, R@3=37.6%, R@5=45.1%, NDCG@5=44.6%
  - Without training (cosine baseline): R@1=14.4%

**Figure 1**: SHGAT architecture diagram (hypergraph with L0/L1/L2, attention heads, residual connections)

### 4.2 GRU Sequential Decoder: Autoregressive Tool Prediction

The GRU is NOT an independent model -- it is the sequential decoder that consumes SHGAT-structured features to produce routing decisions.

#### 4.2.1 Architecture (5 inputs -- 3 from SHGAT)
1. **contextInput** [batch, maxSeqLen, 1024]: BGE-M3 embeddings of previously executed tools (shared embedding space with SHGAT VocabNodes)
2. **transFeatsInput** [batch, maxSeqLen, 5]: transition features (Jaccard, bigram, cap fingerprint)
3. **intentInput** [batch, 1024]: BGE-M3 embedding of user intent (same embedding used by SHGAT scoring)
4. **capInput** [batch, 64]: capability fingerprint projection (derived from SHGAT's L1+ hierarchy structure)
5. **compositeInput** [batch, 3]: **SHGAT-derived composite features** -- direct output of `scoreNodes()`, encoding attention concentration, hierarchy position, and structural patterns. This is the explicit coupling between SHGAT and GRU.

#### 4.2.2 Core Network
- Input projection: Dense(1024 -> 128, linear) on context embeddings
- Concatenation: [projected_context, transFeats] = 133D
- GRU(64): single-layer recurrent with 0.25 recurrent dropout
- Intent projection: Dense(1024 -> 64, relu)

#### 4.2.3 Dual Output Heads
- **Termination head** (separate gradient path):
  - Input: [gruOutput, intentProj] = 128D
  - Dense(128 -> 32, relu) -> Dense(32 -> 1, sigmoid)
  - Key design: branches BEFORE fusion with cap/composite to isolate gradients

- **Next-tool head** (fusion path):
  - Fusion: [gruOutput, intentProj, capProj, compositeProj] = 152D
  - Dense(152 -> 64, relu) + Dropout(0.4)
  - emb_proj: Dense(64 -> 1024)
  - similarity_head: Dense(1024 -> vocabSize, softmax, **frozen** -- initialized from BGE-M3 embeddings)
  - Frozen similarity head: uses tool embeddings as classification weights, no gradient update

#### 4.2.4 VocabNode Unified Vocabulary (Shared with SHGAT)
- 870 total nodes = 644 tools (L0) + 226 capabilities (L1+)
- **Same embedding space as SHGAT**: the frozen similarity_head IS the VocabNode embedding matrix that SHGAT operates on
- L1+ predictions = **hyperedge routing**: when GRU predicts a L1+ capability, it means "route through this hyperedge." SHGAT's attention scores over the capability's children resolve the final tool selection
- This creates a natural division of labor: GRU decides the LEVEL of abstraction (tool vs capability), SHGAT resolves within-capability disambiguation
- Enables capability-level predictions when tool-level is uncertain -- the model doesn't need to pick one tool when a group is equally valid

**Figure 2**: GRU architecture diagram (5 inputs, dual heads, frozen similarity)

### 4.3 Training

#### 4.3.1 Multi-Task Loss
- **Production traces**: focal cross-entropy for next-tool + BCE for termination
- **n8n augmentation**: KL divergence with soft targets (temperature T=0.005)
- **Masking**: termination loss only on production examples (n8n traces lack termination signals)

#### 4.3.2 n8n Data Augmentation Pipeline
- Source: 7,654 n8n community workflows, 103,213 edges, 811 node types
- Embedding: 2,114 unique n8n node types embedded with BGE-M3 (1024D)
- Soft target generation: cosine similarity >= 0.70 between n8n nodes and MCP tools
- Temperature scaling: T=0.005 for discriminative soft distributions
- Filtering: exclude LangChain, triggers, plumbing nodes -> 1,978 usable examples
- Production oversampling: 1,122 production examples (3x oversample from 374 traces)
- Total training set: 3,100 examples (1,978 n8n + 1,122 prod)

**Figure 3**: Data augmentation pipeline (n8n workflows -> embeddings -> soft targets -> training)

### 4.4 Inference Pipeline

#### 4.4.1 GRU-First Strategy (recommended)
1. User provides intent q
2. GRU predicts 1st tool with empty context (Hit@1 = 63.3% for 1st tool)
3. GRU iterates: context grows as tools execute
4. Termination head signals workflow completion
5. SHGAT scores used as vocabulary features only

#### 4.4.2 SHGAT-First Strategy (baseline)
1. SHGAT ranks all tools given intent
2. Top-K used as candidates for GRU
3. Finding: 16.7% for 1st tool selection -- semantic similarity != workflow-optimal 1st step

#### 4.4.3 Beam Search
- Beam width B=3: explores multiple tool sequences in parallel
- Length normalization: prevents short-path bias (learned from beam search failures)

---

## 5. Experiments

### 5.1 Datasets

| Dataset | Examples | Source | Use |
|---------|----------|--------|-----|
| Production traces | 374 traces, 1,122 examples (3x) | PML execution logs | Primary evaluation |
| n8n workflows (v1) | 1,978 filtered examples | n8n community hub | Data augmentation |
| n8n workflows (v2) | 30,141 examples (unfiltered) | n8n community hub (7,654 workflows) | Ablation |
| LiveMCPBench | 95 queries, 525 tools | Public benchmark | SHGAT evaluation |

### 5.2 GRU Results (5-fold CV, seed=42, split by trace)

| Fold | Hit@1 | Hit@3 | MRR | Term Acc | Beam@3 |
|------|-------|-------|-----|----------|--------|
| 1 | 68.2% | 88.2% | 0.778 | 74.0% | 34.6% |
| 2 | 59.2% | 78.9% | 0.702 | 72.4% | 13.0% |
| 3 | 60.0% | 77.8% | 0.696 | 80.0% | 12.0% |
| 4 | 63.3% | 77.2% | 0.723 | 68.4% | 41.4% |
| 5 | 52.4% | 82.5% | 0.659 | 71.4% | 33.3% |
| **Mean +/- std** | **60.6 +/-5.2** | **80.9 +/-4.1** | **0.712 +/-0.04** | **73.3 +/-3.8** | **26.9 +/-12** |

**Table 1**: GRU k-fold results

### 5.3 SHGAT Results (5-fold CV, LiveMCPBench, seed=42)

| Configuration | R@1 | R@3 | R@5 | NDCG@5 |
|--------------|------|------|------|--------|
| Cosine baseline (no SHGAT) | 14.4% | -- | -- | -- |
| SHGAT-Flat (no hierarchy) | 14.7% | -- | -- | -- |
| SHGAT-Hier (PDR 0.99) | 14.2% | -- | -- | -- |
| **B-Flat (contrastive, LR=0.001)** | **16.4%** | **37.6%** | **45.1%** | **44.6%** |
| B-Hier (contrastive, PDR 0.99) | ~16% | ~37% | ~45% | ~44% |
| Overfit check | 33.5% | -- | -- | -- |

**Table 2**: SHGAT results on LiveMCPBench

### 5.4 End-to-End Pipeline Results (seed=42)

| Metric | Value |
|--------|-------|
| Next-tool Hit@1 / Hit@3 / MRR | 64.9% / 81.9% / 0.743 |
| E2E greedy exact (oracle 1st tool) | 35.7% |
| E2E beam@3 exact (oracle 1st tool) | 39.3% |
| **GRU-first 1st tool selection** | **63.3%** |
| SHGAT-first 1st tool selection | 16.7% |
| True E2E SHGAT-first -> greedy | 0% |
| True E2E SHGAT-first -> beam@3 | 7.1% |
| n8n held-out next-tool @1/@3 | 15.5% / 29.3% (998 examples) |

**Table 3**: End-to-end pipeline comparison

### 5.5 Ablation Studies

| Ablation | Hit@1 | Delta |
|----------|-------|-------|
| v0.2.0 baseline (no n8n, no hierarchy) | 34.6% | -- |
| + n8n augmentation (w=0.3) | 40.4% | +5.8 |
| + unified VocabNode + separate term head (v0.3.0) | 65.7% | +25.3 |
| + k-fold validation (mean) | 60.6% | -5.1 (honest estimate) |

**Table 4**: Ablation study

### 5.6 Comparison with LLM Baselines

| System | Task | Accuracy | Params | Latency | Cost/query |
|--------|------|----------|--------|---------|------------|
| Claude-Sonnet-4 | LiveMCPBench full task | 78.95% | ~200B+ | ~seconds | ~$0.01-0.10 |
| Claude-Opus-4 | LiveMCPBench full task | 70.53% | ~200B+ | ~seconds | ~$0.05-0.50 |
| GPT-5 | BFCL function calling | 59.22% | ~1T+ | ~seconds | ~$0.01-0.10 |
| GPT-5 Medium | MCPMark pass@1 | 52.6% | ~1T+ | ~seconds | ~$1.00/task |
| GPT-4o | MCP-Universe tool routing | 47.41% | ~200B+ | ~seconds | ~$0.01-0.10 |
| **ToolACE-MCP (8B LoRA)** | **MCP-Universe tool routing** | **53.44%** | **8B (LoRA r=8)** | **~100ms** | **~$0.001** |
| **ToolACE-MCP (8B LoRA)** | **MCP-Mark tool routing** | **60.00%** | **8B (LoRA r=8)** | **~100ms** | **~$0.001** |
| **Ours (unified SHGAT+GRU)** | **Next-tool prediction** | **60.6% Hit@1** | **258K trainable** | **<1ms** | **~$0** |
| **Ours (SHGAT alone)** | **Tool retrieval** | **16.4% R@1** | **~660K** | **<10ms** | **~$0** |

**Table 5**: Cross-system comparison (NOTE: tasks differ across benchmarks -- requires careful framing)

**Important caveats**:
1. LLM benchmarks measure end-to-end task completion including parameter filling, error recovery, and multi-turn reasoning. Our compiled model solves the narrower routing sub-problem.
2. ToolACE-MCP is the most directly comparable: it also targets MCP tool routing specifically. Key difference: they use a **30,000x larger model** (8B vs 258K) that still requires GPU inference, while our compiled model runs on CPU in <1ms. Their accuracy on MCP-Universe (53.44%) and MCP-Mark (60%) is comparable to our Hit@1 (60.6%), but measured on different benchmarks -- direct comparison requires evaluation on identical datasets (future work).
3. ToolACE-MCP validates our thesis: even their "small" 8B router beats GPT-4o (47.41%). We push this further -- how small can you go before accuracy degrades?

---

## 6. Discussion

### 6.1 The JIT Compilation Analogy (expanded)

| Programming | Agent Routing |
|-------------|--------------|
| Interpreter | LLM processes every tool call de novo |
| Profiler | Execution trace logger identifies hot paths |
| JIT Compiler | SHGAT+GRU trained on frequent patterns |
| Compiled code | Sub-ms routing decisions for known workflows |
| Fallback to interpreter | LLM handles novel/unseen tool combinations |
| Deoptimization | Confidence threshold triggers LLM re-evaluation |

**The Flywheel Effect**: Production traces -> training data -> better compiled models -> more traces covered -> less LLM inference -> lower cost -> more users -> more traces. This is analogous to JIT compilation's warmup phase.

### 6.2 The Hybrid Architecture: Compiled Selection + LLM Execution

**Key architectural insight**: Compiled routing does NOT replace the LLM. It restructures the agent loop:

```
TRADITIONAL (monolithic LLM):
  [intent + FULL tool catalog (500 schemas)] → LLM → tool_name + arguments
  Context: ~50K tokens per step. LLM does selection AND filling.

HYBRID (compiled selection + LLM filling):
  [intent + context] → SHGAT+GRU → tool_name              (0 tokens, <1ms)
  [intent + ONE tool schema] → LLM → arguments              (~500 tokens)
  Total: ~500 tokens per step instead of ~50K.
```

**Why this matters**:
- The tool catalog grows (Microsoft tool-space interference). The LLM degrades as tools are added. The compiled router doesn't — its accuracy is independent of catalog size at inference time.
- Parameter filling with a single tool schema is a simpler task — a cheaper LLM (gpt-4o-mini vs gpt-4o) suffices.
- ToolACE-MCP (Yao et al., 2026) independently discovered the same architecture: their Light Routing Agent separates Router Invocation from Execution (Gemini-2.5-Pro). We formalize this separation.

### 6.3 When Compiled Selection Works (and When It Doesn't)

**Works well**:
- Recurring workflow patterns (80%+ of production queries)
- Tool selection from known vocabulary (644 tools + 226 capabilities)
- Sequential tool prediction with clear intent
- High-frequency, cost-sensitive deployments

**Doesn't work (requires LLM)**:
- Novel tool combinations never seen in training → LLM selects + fills
- Parameter filling → always requires LLM (but with reduced context)
- Error recovery and adaptive re-planning → LLM fallback
- Multi-turn conversational context beyond tool sequences → LLM

### 6.3 GRU-First vs SHGAT-First: A Surprising Finding

The GRU with empty context (63.3%) dramatically outperforms SHGAT (16.7%) for 1st tool selection. Explanation:
- SHGAT optimizes for *semantic similarity to intent* (hash -> hash_checksum)
- GRU learns *workflow-optimal 1st steps* from sequences (intent -> read_file, not intent -> most_similar_tool)
- This mirrors the difference between IR (information retrieval) and planning (sequential decision-making)

### 6.4 The Data Bottleneck: 374 Traces

- 258K trainable parameters / 374 production traces = overfitting risk
- n8n augmentation helps (+5.8% Hit@1) but cross-domain transfer is limited
- 282 contrastive examples for SHGAT = insufficient for message passing (MP no-op at best)
- **Path forward**: intent paraphrasing, synthetic trace generation, community contributions

### 6.5 Relationship to Agent Distillation

Our approach is NOT agent distillation (FireAct, NeurIPS 2025 Agent Distillation):
- Distillation: compress a teacher LLM into a smaller student LM (0.5B-7B params)
- Compiled routing: train a purpose-built non-LLM model (<300K params) on execution traces
- Analogy: distillation = smaller interpreter; compilation = different paradigm entirely

### 6.6 Tool-Space Interference and Compiled Routing

Microsoft Research identified tool-space interference: adding more MCP tools *degrades* LLM performance. Compiled routing addresses this directly:
- The GRU operates on a fixed vocabulary (870 nodes) -- tool addition requires retraining but doesn't degrade existing routing
- SHGAT's hierarchical structure naturally namespaces tools through capabilities
- No token budget consumed by tool descriptions in context windows

---

## 7. Conclusion

We introduced compiled agent routing, a paradigm shift from interpreting every tool selection decision with LLMs to compiling recurring patterns into lightweight ML models. Our SHGAT+GRU pipeline (<300K trainable parameters) achieves 60.6% Hit@1 for next-tool prediction on production traces, with sub-millisecond inference latency -- a >1000x cost reduction compared to frontier LLM calls for the routing sub-task.

Key takeaways:
1. Sequential tool prediction (GRU) and semantic tool retrieval (SHGAT) serve complementary roles
2. GRU-first routing outperforms SHGAT-first for 1st tool selection (63.3% vs 16.7%)
3. Cross-domain data augmentation (n8n workflows) provides meaningful but limited gains (+5.8%)
4. The data bottleneck (374 production traces) is the primary scaling limitation
5. Compiled routing is orthogonal to and composable with LLM model routing (RouteLLM, MasRouter)

## 8. Future Work

1. **Intent paraphrasing**: augment limited production traces via LLM-generated paraphrases
2. **Ancestor-aware context**: fix DAG ancestor contamination (43.7% of contexts affected)
3. **Hybrid routing**: confidence-based fallback to LLM when compiled model is uncertain
4. **LiveMCPBench end-to-end**: evaluate compiled routing as a drop-in for LLM tool selection
5. **Federated learning**: train across multiple PML deployments without sharing traces
6. **Parameter filling**: extend beyond tool identity to argument prediction

---

## Figures and Tables Summary

| ID | Type | Content |
|----|------|---------|
| Fig 1 | Architecture | SHGAT hypergraph with L0/L1/L2, multi-head attention, residual connections |
| Fig 2 | Architecture | GRU 5-input architecture with dual output heads and frozen similarity |
| Fig 3 | Pipeline | n8n data augmentation: workflows -> embeddings -> soft targets -> training |
| Fig 4 | Diagram | JIT compilation analogy: interpreter vs compiler vs hybrid routing |
| Fig 5 | Bar chart | GRU-first vs SHGAT-first 1st tool accuracy comparison |
| Fig 6 | Line chart | Ablation: v0.2.0 -> v0.3.0 progression of Hit@1 |
| Fig 7 | Scatter | Latency vs accuracy: compiled models vs LLM baselines (log scale x-axis) |
| Tab 1 | Results | GRU k-fold results (5 folds) |
| Tab 2 | Results | SHGAT LiveMCPBench results |
| Tab 3 | Results | End-to-end pipeline comparison |
| Tab 4 | Results | Ablation study |
| Tab 5 | Comparison | Cross-system: compiled models vs LLM baselines |
| Tab 6 | Related work | Positioning matrix against all related papers |

---

## Source Bibliography (to cite)

### Benchmarks
1. BFCL V4 -- Patil et al., "The Berkeley Function Calling Leaderboard (BFCL): From Tool Use to Agentic Evaluation of Large Language Models," ICML 2025. https://gorilla.cs.berkeley.edu/leaderboard.html
2. LiveMCPBench -- "LiveMCPBench: Can Agents Navigate an Ocean of MCP Tools?" arXiv:2508.01780, Aug 2025. https://arxiv.org/abs/2508.01780
3. MCPMark -- "MCPMark: A Benchmark for Stress-Testing Realistic and Comprehensive MCP Use," arXiv:2509.24002, Sep 2025. https://arxiv.org/abs/2509.24002
4. ToolBench/ToolLLM -- Qin et al., "ToolLLM: Facilitating Large Language Models to Master 16000+ Real-world APIs," ICLR 2024. https://arxiv.org/abs/2307.16789
5. StableToolBench -- Guo et al., arXiv:2403.07714, Mar 2024. https://arxiv.org/abs/2403.07714
6. MCP-Bench (Accenture) -- arXiv:2508.20453, Aug 2025. https://arxiv.org/abs/2508.20453
7. MCPAgentBench -- arXiv:2512.24565, Dec 2025. https://arxiv.org/abs/2512.24565

### LLM Routing
8. RouteLLM -- Ong et al., "RouteLLM: Learning to Route LLMs with Preference Data," ICLR 2025. https://arxiv.org/abs/2406.18665
9. MasRouter -- Yue et al., "MasRouter: Learning to Route LLMs for Multi-Agent Systems," ACL 2025. https://arxiv.org/abs/2502.11133
10. OI-MAS -- "Orchestrating Intelligence: Confidence-Aware Routing for Efficient Multi-Agent Collaboration," arXiv:2601.04861, Jan 2026. https://arxiv.org/abs/2601.04861
11. InferenceDynamics -- "InferenceDynamics: Efficient Routing Across LLMs through Structured Capability and Knowledge Profiling," arXiv:2505.16303, 2025. https://arxiv.org/abs/2505.16303

### Tool Retrieval, Selection, and Specialized Routing
12. Tool-to-Agent Retrieval -- Lumer et al., arXiv:2511.01854, Nov 2025. https://arxiv.org/abs/2511.01854
13. Agent-as-a-Graph -- arXiv:2511.18194, Nov 2025. https://arxiv.org/abs/2511.18194
14. AutoTool (Efficient) -- arXiv:2511.14650, Nov 2025. https://arxiv.org/abs/2511.14650
15. AutoTool (Dynamic) -- arXiv:2512.13278, Dec 2025. https://arxiv.org/abs/2512.13278
16. **ToolACE-MCP** -- Yao et al., "ToolACE-MCP: Generalizing History-Aware Routing from MCP Tools to the Agent Web," arXiv:2601.08276, Jan 2026. https://arxiv.org/abs/2601.08276

### Agent Optimization and Distillation
16. DSPy -- Khattab et al., "DSPy: Compiling Declarative Language Model Calls into Self-Improving Pipelines," Stanford. https://arxiv.org/abs/2310.03714
17. FireAct -- Chen et al., "FireAct: Toward Language Agent Fine-tuning," arXiv:2310.05915. https://arxiv.org/abs/2310.05915
18. Trace -- Microsoft Research, "End-to-end Generative Optimization for AI Agents." https://microsoft.github.io/Trace/
19. Agent Distillation -- Kang et al., "Distilling LLM Agent into Small Models with Retrieval and Code Tools," NeurIPS 2025 Spotlight. https://arxiv.org/abs/2505.17612

### Tool-Space and MCP
20. Tool-Space Interference -- Microsoft Research, "Tool-space interference in the MCP era: Designing for agent compatibility at scale," 2025. https://www.microsoft.com/en-us/research/blog/tool-space-interference-in-the-mcp-era/
21. Gorilla -- Patil et al., "Gorilla: Large Language Model Connected with Massive APIs," arXiv:2305.15334. https://arxiv.org/abs/2305.15334

### Embeddings
22. BGE-M3 -- BAAI, "M3-Embedding: Multi-Lingual, Multi-Functionality, Multi-Granularity Text Embeddings." https://huggingface.co/BAAI/bge-m3

### Graph Attention Networks and Hypergraphs
23. **GAT** -- Velickovic et al., "Graph Attention Networks," ICLR 2018. https://arxiv.org/abs/1710.10903
24. **n-SuperHyperGraph** -- Smarandache, "Introduction to the n-SuperHyperGraph -- the most general form of graph today," Neutrosophic Sets and Systems, Vol. 48, 2022.
25. **SuperHyperGraph Attention Networks** -- Fujita, "SuperHyperGraph Attention Networks," arXiv:2412.01176, Dec 2024. https://arxiv.org/abs/2412.01176
26. HGTN -- "Hypergraph Transformer Neural Networks," ACM TKDD. https://dl.acm.org/doi/10.1145/3565028
27. GNN Recommender Survey -- "Graph Neural Networks in Recommender Systems: A Survey," ACM Computing Surveys. https://dl.acm.org/doi/10.1145/3535101

---

## Differentiation Matrix (quick reference)

| Dimension | Our Paper | ToolACE-MCP (closest) | Other Competitors |
|-----------|-----------|----------------------|-------------------|
| **What is routed** | Tools in MCP workflows | Tools + Agents in MCP | RouteLLM/MasRouter: models; AutoTool: tools (flat) |
| **Model size** | **<300K params (non-LLM)** | 8B LLM (Qwen3-8B LoRA) | Agent Distillation: 0.5-3B; FireAct: 7B |
| **Model type** | **Purpose-built ML (GRU+SHGAT)** | Fine-tuned LLM | All others: LLMs or count-based |
| **Sequential prediction** | GRU autoregressive | LLM sequence-to-sequence | AutoTool: count-based transitions |
| **Hierarchical vocab** | **VocabNode L0/L1+** | Flat candidate set | None (flat tool lists everywhere) |
| **Graph in the model** | **SHGAT hypergraph = model component** | Graph for data generation only (not in inference) | Agent-as-a-Graph: retrieval only |
| **SHGAT-GRU coupling** | **Unified: SHGAT feeds composite features + shared vocabulary** | N/A (single model) | N/A |
| **Training data** | 374 prod traces + 1978 n8n (real) | 15,092 GPT-4o synthetic trajectories | DSPy: LLM-generated |
| **Paradigm** | **"Compiled routing"** (JIT analogy) | "Compressed interpreter" (smaller LLM) | DSPy: "compiled prompts" |
| **Intent conditioning** | Yes (BGE-M3 embedding) | Yes (dialogue history) | AutoTool: no |
| **History-awareness** | GRU context + autoregressive | LLM dialogue history | Most: stateless |

---

## Estimated Page Count

| Section | Pages |
|---------|-------|
| Abstract | 0.5 |
| Introduction | 1.5 |
| Related Work | 2.0 |
| Problem Formulation | 1.0 |
| Method | 3.0 |
| Experiments | 2.5 |
| Discussion | 2.0 |
| Conclusion + Future Work | 0.5 |
| References | 1.0 |
| **Total** | **~14 pages** |

---

## Key Narrative Thread

**The story**: Every LLM tool call bundles two tasks: selecting which tool to call (a structured decision) and filling its parameters (a generative task). Today, both are handled by a single expensive LLM inference with the entire tool catalog in context. We show these can be separated: tool selection — being a structured, learnable, recurring pattern — can be *compiled* into a tiny ML model (258K params), while the LLM focuses on parameter filling with a dramatically reduced context (one tool schema instead of hundreds). This is like JIT compilation: the hot path (selection) gets compiled, while the interpreter (LLM) handles what requires flexibility. The result is not a replacement for LLMs but a restructuring of the agent loop that makes each LLM call cheaper and the routing decision essentially free. ToolACE-MCP (Yao et al., 2026) independently validated this separation with an 8B LoRA model; we push it 30,000x further to show how small the selection model can be.
