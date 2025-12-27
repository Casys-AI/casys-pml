# Hypergraph Libraries Research for Casys PML

**Research Date:** 2025-12-07 **Context:** Exploring hypergraph algorithms to improve capability
matching and recommendations in Casys PML tool orchestration system

**Current Stack:**

- Runtime: Deno 2.5+ / TypeScript
- Graph library: Graphology (standard graphs only)
- Visualization: Cytoscape.js
- Database: PGlite with pgvector

**Research Goal:** Identify libraries and techniques for hypergraph spectral clustering, random
walks, and neural networks that can integrate with Casys PML' Deno/TypeScript environment.

---

## Executive Summary

After comprehensive research, here are the key findings:

1. **Limited Native JS/TS Support**: No mature hypergraph libraries exist for
   JavaScript/TypeScript/Deno
2. **Python Dominance**: All production-ready hypergraph implementations are Python-based
3. **Integration Options**: Three viable paths: Python microservice (FastAPI), WASM compilation, or
   Pyodide browser runtime
4. **Best ROI**: Hypergraph-enhanced random walks (PageRank variants) offer the best balance of
   complexity vs. value for capability matching
5. **Recommended Approach**: Start with Python microservice using HyperNetX for prototyping,
   potentially migrate hot paths to WASM later

---

## 1. Hypergraph Spectral Clustering

### Theory

Based on the seminal work by Zhou, Huang, and Schölkopf (NeurIPS 2006), hypergraph spectral
clustering generalizes traditional graph spectral methods to hypergraphs where edges can connect
arbitrary numbers of vertices. The method uses the hypergraph Laplacian matrix for dimensionality
reduction followed by clustering (typically k-means).

**Key Papers:**

- "Learning with Hypergraphs: Clustering, Classification, and Embedding" (Zhou et al., NeurIPS 2006)
- "GraphLSHC: Towards Large Scale Spectral Hypergraph Clustering" (SubaiDeng et al.)

### Available Libraries

#### 1.1 LSSHC_python (Python)

| Property               | Value                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**               | LSSHC_python                                                                                                                              |
| **URL**                | https://github.com/SubaiDeng/LSSHC_python                                                                                                 |
| **Language**           | Python                                                                                                                                    |
| **Deno Compatibility** | ❌ Requires Python backend                                                                                                                |
| **Maturity**           | Research code - limited maintenance                                                                                                       |
| **Key Features**       | - Large-scale hypergraph spectral clustering<br>- Simultaneous vertex and hyperedge partitioning<br>- Based on graph expansion techniques |
| **Integration Effort** | **HIGH** - Requires Python microservice or WASM compilation                                                                               |

#### 1.2 Scikit-learn SpectralClustering (Python)

| Property               | Value                                                                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**               | sklearn.cluster.SpectralClustering                                                                                                                                                                                |
| **URL**                | https://scikit-learn.org/stable/modules/generated/sklearn.cluster.SpectralClustering.html                                                                                                                         |
| **Language**           | Python (with scipy/numpy)                                                                                                                                                                                         |
| **Deno Compatibility** | ❌ Python only, but could use via Pyodide                                                                                                                                                                         |
| **Maturity**           | ⭐⭐⭐⭐⭐ Production-ready, widely used                                                                                                                                                                          |
| **Key Features**       | - Standard graph spectral clustering<br>- Multiple eigensolver options (lobpcg, amg)<br>- Three label assignment strategies (kmeans, discretize, cluster_qr)<br>- **Note:** Standard graphs only, not hypergraphs |
| **Integration Effort** | **HIGH** - Would need hypergraph-to-graph conversion                                                                                                                                                              |

**Note:** Scikit-learn only supports standard graphs. For true hypergraph spectral clustering, you'd
need to implement Zhou's algorithm or use specialized libraries.

### Deno Integration Path

```typescript
// Option 1: Python Microservice
const response = await fetch('http://localhost:8000/hypergraph/cluster', {
  method: 'POST',
  body: JSON.stringify({
    vertices: [...],
    hyperedges: [...],
    n_clusters: 5
  })
});

// Option 2: Pyodide (Python in browser/Deno via WASM)
import { loadPyodide } from "npm:pyodide@0.24.1";
const pyodide = await loadPyodide();
await pyodide.loadPackage(["numpy", "scipy", "scikit-learn"]);
// Run Python code directly in Deno
```

---

## 2. Random Walks on Hypergraphs

### Theory

Random walks on hypergraphs extend traditional graph random walks to handle hyperedges. Key methods
include:

1. **Clique Expansion**: Each hyperedge becomes a complete clique
2. **Star Expansion**: Each hyperedge connects to a central "hub" node
3. **Edge-Dependent Vertex Weights** (Chitra & Raphael, ICML 2019): More sophisticated weighting
   schemes

**Key Papers:**

- "Random Walks on Hypergraphs with Edge-Dependent Vertex Weights" (Chitra & Raphael, ICML 2019)
- "Hypergraph Random Walks, Laplacians, and Clustering" (Hayashi et al., arXiv:2006.16377)

### Available Libraries

#### 2.1 HyperNetX (Python)

| Property               | Value                                                                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**               | HyperNetX (HNX)                                                                                                                                                                                                                                    |
| **URL**                | https://github.com/pnnl/HyperNetX                                                                                                                                                                                                                  |
| **Language**           | Python 3.10+                                                                                                                                                                                                                                       |
| **Deno Compatibility** | ❌ Requires Python backend                                                                                                                                                                                                                         |
| **Maturity**           | ⭐⭐⭐⭐ **660 stars**, actively maintained by PNNL                                                                                                                                                                                                |
| **Last Update**        | 2024 (version 2.4.1)                                                                                                                                                                                                                               |
| **Key Features**       | - Comprehensive hypergraph analysis toolkit<br>- Visualization capabilities<br>- Connectivity, distance, centrality metrics<br>- Community detection algorithms<br>- Hypergraph Interchange Format (HIF) support<br>- Pandas DataFrame integration |
| **Dependencies**       | pandas, networkx, matplotlib                                                                                                                                                                                                                       |
| **Integration Effort** | **MEDIUM** - Well-documented, stable API for microservice                                                                                                                                                                                          |

**Publication:** Praggastis et al., "HyperNetX: A Python package for modeling complex network data
as hypergraphs", JOSS 2024

#### 2.2 Hypergraph PageRank Implementation (Python/Spark)

| Property               | Value                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**               | hypergraph-study                                                                                                                                         |
| **URL**                | https://github.com/biqar/hypergraph-study                                                                                                                |
| **Language**           | Python with Apache Spark                                                                                                                                 |
| **Deno Compatibility** | ❌ Requires Spark cluster                                                                                                                                |
| **Maturity**           | ⭐ Research code                                                                                                                                         |
| **Key Features**       | - Distributed hypergraph PageRank<br>- Vertex importance based on group participation<br>- Hyperedge importance ranking<br>- GraphFrames API integration |
| **Integration Effort** | **VERY HIGH** - Requires Spark infrastructure                                                                                                            |

**Use Cases:**

- Vertex importance based on hyperedge (group) participation
- Hyperedge importance based on connected vertices

### Code Example: Random Walk API

```python
# Python microservice using HyperNetX
from hypernetx import Hypergraph
import numpy as np

def hypergraph_pagerank(vertices, hyperedges, alpha=0.85, max_iter=100):
    """
    Compute PageRank on hypergraph using star expansion
    """
    H = Hypergraph(dict(enumerate(hyperedges)))

    # Star expansion to bipartite graph
    # Implementation using HNX's built-in methods
    # ...

    return pagerank_scores

# FastAPI endpoint
@app.post("/hypergraph/pagerank")
async def compute_pagerank(request: HypergraphRequest):
    scores = hypergraph_pagerank(
        request.vertices,
        request.hyperedges,
        alpha=request.alpha
    )
    return {"scores": scores}
```

---

## 3. Hypergraph Neural Networks (HGNN)

### Theory

Hypergraph Neural Networks extend Graph Neural Networks (GNNs) to handle hypergraphs. Key
architectures:

1. **HGNN** (Feng et al., AAAI 2019): Original hyperedge convolution
2. **HyperGCN** (Yadati et al., NeurIPS 2019): Mediator-based approach
3. **UniGNN** (Huang & Yang, IJCAI 2021): Unified framework generalizing GCN/GAT/GIN
4. **AllSet** (Chien et al., ICLR 2022): Multiset function learning

### Available Libraries

#### 3.1 DeepHypergraph (DHG) - ⭐ RECOMMENDED for HGNN

| Property               | Value                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Name**               | DeepHypergraph (DHG)                                                                                                                                   |
| **URL**                | https://github.com/iMoonLab/DeepHypergraph                                                                                                             |
| **Language**           | Python 3.8+                                                                                                                                            |
| **Deno Compatibility** | ❌ Python only, potential ONNX export                                                                                                                  |
| **Maturity**           | ⭐⭐⭐⭐ **813 stars**, maintained by iMoonLab                                                                                                         |
| **Last Update**        | January 31, 2024 (v0.9.5)                                                                                                                              |
| **Dependencies**       | PyTorch >= 1.12.1, < 2.0, scipy, scikit-learn                                                                                                          |
| **Key Features**       | - Both graph and hypergraph NNs<br>- Spectral and spatial methods<br>- Auto-ML via Optuna<br>- Visualization tools<br>- Multiple model implementations |
| **Models Included**    | HGNN, HGNN+, HyperGCN, HNHN, UniGCN, UniGAT, UniSAGE, UniGIN                                                                                           |
| **Integration Effort** | **HIGH** - Training in Python, inference via ONNX Runtime                                                                                              |

**Installation:**

```bash
pip install dhg  # stable v0.9.5
```

#### 3.2 DGL (Deep Graph Library)

| Property               | Value                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Name**               | DGL with Hypergraph Support                                                                                                       |
| **URL**                | https://www.dgl.ai/dgl_docs/notebooks/sparse/hgnn.html                                                                            |
| **Language**           | Python (PyTorch/TensorFlow/MXNet)                                                                                                 |
| **Deno Compatibility** | ❌ Python only, potential ONNX export                                                                                             |
| **Maturity**           | ⭐⭐⭐⭐⭐ Industry-standard, AWS-backed                                                                                          |
| **Last Update**        | 2024 (v2.5+)                                                                                                                      |
| **Key Features**       | - Sparse matrix APIs for hypergraphs<br>- Incidence matrix representation<br>- GPU acceleration<br>- Production-ready scalability |
| **Integration Effort** | **HIGH** - Enterprise-grade but Python-bound                                                                                      |

#### 3.3 PyTorch Geometric (PyG)

| Property               | Value                                                           |
| ---------------------- | --------------------------------------------------------------- |
| **Name**               | PyTorch Geometric                                               |
| **URL**                | https://github.com/pyg-team/pytorch_geometric                   |
| **Language**           | Python + PyTorch                                                |
| **Deno Compatibility** | ❌ Python only, potential ONNX export                           |
| **Maturity**           | ⭐⭐⭐⭐⭐ **20k+ stars**, most popular GNN library             |
| **Hypergraph Support** | Limited - HypergraphConv available, expanding support discussed |
| **Integration Effort** | **HIGH** - Primarily graph-focused                              |

#### 3.4 HGNN Original Implementation

| Property               | Value                                            |
| ---------------------- | ------------------------------------------------ |
| **Name**               | HGNN (Original)                                  |
| **URL**                | https://github.com/iMoonLab/HGNN                 |
| **Language**           | Python 3.6, PyTorch 0.4.0                        |
| **Deno Compatibility** | ❌ Python only                                   |
| **Maturity**           | ⭐⭐⭐⭐ **813 stars**, reference implementation |
| **Last Update**        | 2019 (research code)                             |
| **Datasets**           | ModelNet40, NTU2012                              |
| **Integration Effort** | **VERY HIGH** - Outdated dependencies            |

#### 3.5 UniGNN

| Property               | Value                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Name**               | UniGNN                                                                                                                    |
| **URL**                | https://github.com/OneForward/UniGNN                                                                                      |
| **Language**           | Python 3.6+                                                                                                               |
| **Deno Compatibility** | ❌ Python only                                                                                                            |
| **Maturity**           | ⭐⭐⭐ Research implementation                                                                                            |
| **Key Features**       | - Unified framework for GNN → hypergraph<br>- UniGCN, UniGAT, UniGIN, UniSAGE variants<br>- PyTorch Geometric integration |
| **Integration Effort** | **HIGH** - Research code                                                                                                  |

### ONNX Export for Browser/Deno Inference

While training must happen in Python, inference can potentially run in Deno via ONNX:

```python
# Python: Export trained HGNN to ONNX
import torch
from dhg.models import HGNN

model = HGNN(...)
model.load_state_dict(torch.load('trained_model.pt'))
model.eval()

# Export to ONNX
dummy_input = torch.randn(num_nodes, input_dim)
torch.onnx.export(
    model,
    dummy_input,
    "hgnn_model.onnx",
    opset_version=14
)
```

```typescript
// Deno: Run inference using ONNX Runtime
import * as ort from "npm:onnxruntime-node";

const session = await ort.InferenceSession.create("./hgnn_model.onnx");
const results = await session.run({
  input: new ort.Tensor("float32", nodeFeatures, [numNodes, inputDim]),
});
```

**Challenges:**

- Custom hypergraph operations may not have ONNX equivalents
- Incidence matrix operations need careful translation
- Performance overhead vs. native Python

---

## JavaScript/TypeScript Hypergraph Options

### Current State

**Cytoscape.js:**

- Supports compound nodes (parent-child hierarchies)
- **Does NOT support true hyperedges** (edges connecting 3+ nodes)
- Could visualize hypergraph via compound node workaround

**Graphology:**

- Directed, undirected, mixed graphs
- Multigraphs support
- **No native hypergraph support**
- Would require hypergraph-to-graph conversion

### Gap Analysis

**Missing Capabilities:**

1. No native hyperedge representation in JS/TS
2. No hypergraph algorithms (clustering, random walks, etc.)
3. No hypergraph neural network libraries

**Workarounds:**

1. Convert hypergraphs to bipartite graphs (node-hyperedge structure)
2. Implement custom hypergraph data structure on Graphology
3. Use Python backend for algorithms, JS/TS for visualization

---

## Integration Strategies for Casys PML

### Option 1: Python Microservice (FastAPI) - ⭐ RECOMMENDED

**Architecture:**

```
Casys PML (Deno/TS)  →  HTTP/REST  →  Python Microservice (FastAPI)
                                       ↓
                                    HyperNetX / DHG
                                       ↓
                                  Hypergraph Algorithms
```

**Pros:**

- Quickest to implement
- Access to full Python ecosystem
- Easy to maintain and update
- Can scale independently
- No WASM compilation complexity

**Cons:**

- Network latency (mitigated by caching)
- Additional deployment dependency
- Runtime overhead for small queries

**Implementation Effort:** **MEDIUM** (1-2 weeks)

**Code Example:**

```python
# microservice/main.py
from fastapi import FastAPI
from pydantic import BaseModel
import hypernetx as hnx
import numpy as np

app = FastAPI()

class CapabilityGraph(BaseModel):
    capabilities: list[dict]  # {id: str, tools: list[str]}
    query_tools: list[str]

@app.post("/match-capabilities")
async def match_capabilities(graph: CapabilityGraph):
    # Build hypergraph: capabilities = hyperedges, tools = vertices
    hyperedges = {
        cap['id']: cap['tools']
        for cap in graph.capabilities
    }
    H = hnx.Hypergraph(hyperedges)

    # Compute hypergraph PageRank or similarity
    # Return ranked capabilities
    scores = compute_similarity(H, graph.query_tools)

    return {"ranked_capabilities": scores}
```

```typescript
// pml/src/hypergraph-client.ts
export class HypergraphService {
  private baseUrl = "http://localhost:8000";

  async matchCapabilities(
    capabilities: Capability[],
    queryTools: string[],
  ): Promise<RankedCapability[]> {
    const response = await fetch(`${this.baseUrl}/match-capabilities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capabilities, query_tools: queryTools }),
    });
    return response.json();
  }
}
```

### Option 2: WASM (Rust/C++ → Deno)

**Architecture:**

```
Casys PML (Deno/TS)  →  FFI/WASM  →  Rust/C++ Hypergraph Library
```

**Pros:**

- No network calls, in-process execution
- Near-native performance
- Single deployment artifact

**Cons:**

- No existing hypergraph libraries in Rust
- Would need to implement from scratch or port Python code
- Complex build pipeline
- Limited ecosystem compared to Python

**Implementation Effort:** **VERY HIGH** (2-3 months)

**Available Rust Graph Libraries:**

- petgraph (graphs only, no hypergraphs)
- petgraph-wasm (WASM wrapper, experimental)

**Verdict:** Not recommended unless performance becomes critical bottleneck

### Option 3: Pyodide (Python in Browser/Deno)

**Architecture:**

```
Casys PML (Deno)  →  Pyodide WASM Runtime  →  Python Code (HyperNetX)
```

**Pros:**

- No separate backend needed
- Full Python ecosystem available
- Client-side execution

**Cons:**

- Large bundle size (~10MB+ for Pyodide + packages)
- Slower than native Python (WASM overhead)
- Package loading time on first run
- Memory consumption

**Implementation Effort:** **MEDIUM-HIGH** (2-3 weeks)

**Code Example:**

```typescript
import { loadPyodide } from "npm:pyodide@0.24.1";

const pyodide = await loadPyodide();
await pyodide.loadPackage(["numpy", "networkx", "scipy"]);

// Install HyperNetX via micropip
await pyodide.runPythonAsync(`
  import micropip
  await micropip.install('hypernetx')
`);

// Run hypergraph algorithms
const result = await pyodide.runPythonAsync(`
  import hypernetx as hnx
  import json

  hyperedges = ${JSON.stringify(hyperedges)}
  H = hnx.Hypergraph(hyperedges)

  # Compute metrics
  scores = compute_pagerank(H)
  json.dumps(scores)
`);
```

**Verdict:** Viable for prototyping, but consider microservice for production

### Option 4: Hybrid Approach - ⭐ BEST LONG-TERM

**Architecture:**

```
Casys PML (Deno/TS)
  ↓
  ├─→ Simple queries: Custom TS implementation (bipartite graph)
  └─→ Complex queries: Python microservice (HyperNetX/DHG)
```

**Strategy:**

1. Implement basic hypergraph operations in TypeScript on Graphology
2. Use Python microservice for advanced algorithms (clustering, neural networks)
3. Cache results in PGlite/pgvector
4. Migrate hot paths to WASM if needed

**Pros:**

- Best of both worlds
- Optimize for common case
- Gradual migration path
- Flexibility

**Implementation Effort:** **MEDIUM** (2-3 weeks initial, ongoing optimization)

---

## Recommendation for Casys PML Use Case

### Problem Analysis

**Casys PML Context:**

- **Capabilities** = hyperedges connecting N tools
- **Tools** = vertices
- Scale: ~100-1000 tools, ~100-10000 capabilities
- Query: "Given tools [A, B, C], find best matching capabilities"

### Recommended Technique: Hypergraph Random Walks (PageRank variant)

**Why Random Walks over Spectral Clustering or Neural Networks?**

| Criterion             | Spectral Clustering   | Random Walks                     | Neural Networks               |
| --------------------- | --------------------- | -------------------------------- | ----------------------------- |
| **Complexity**        | Medium                | Low-Medium                       | High                          |
| **Interpretability**  | Medium                | High                             | Low                           |
| **Training Required** | No                    | No                               | Yes (significant)             |
| **Scalability**       | Good (O(n²) to O(n³)) | Excellent (O(n))                 | Requires GPU for large graphs |
| **Real-time Queries** | Slow (recompute)      | Fast (precompute + local update) | Fast (after training)         |
| **ROI for Casys PML** | Medium                | ⭐ **HIGH**                      | Low (overkill)                |

**PageRank-style Random Walks Excel at:**

1. **Ranking** - Natural fit for "find top-K matching capabilities"
2. **Local Context** - Query tools influence propagation
3. **Incrementality** - Can update scores without full recomputation
4. **Interpretability** - Scores represent "importance" and "relevance"

### Proposed Algorithm

**Hypergraph PageRank for Capability Matching:**

```python
def capability_match_score(H, query_tools, alpha=0.85, iterations=100):
    """
    H: Hypergraph where hyperedges = capabilities, vertices = tools
    query_tools: List of tool IDs in the query

    Returns: Dict mapping capability_id → relevance score
    """
    # 1. Create bipartite graph (tools ↔ capabilities)
    tools = H.nodes
    capabilities = H.edges

    # 2. Initialize PageRank vectors
    tool_rank = {t: 0.0 for t in tools}
    cap_rank = {c: 1.0 / len(capabilities) for c in capabilities}

    # 3. Boost query tools
    for t in query_tools:
        tool_rank[t] = 1.0 / len(query_tools)

    # 4. Alternating random walk (tool → capability → tool)
    for _ in range(iterations):
        # Tools propagate to capabilities
        new_cap_rank = {}
        for cap_id, tools_in_cap in capabilities.items():
            score = sum(tool_rank[t] for t in tools_in_cap if t in tool_rank)
            new_cap_rank[cap_id] = alpha * score + (1 - alpha) / len(capabilities)

        # Capabilities propagate back to tools
        new_tool_rank = {}
        for tool_id in tools:
            caps_with_tool = [c for c, ts in capabilities.items() if tool_id in ts]
            score = sum(new_cap_rank[c] for c in caps_with_tool)
            new_tool_rank[tool_id] = alpha * score + (1 - alpha) * (
                1.0 / len(query_tools) if tool_id in query_tools else 0
            )

        tool_rank = new_tool_rank
        cap_rank = new_cap_rank

    return cap_rank
```

### Data Structure Changes Needed

**Current (Graphology standard graph):**

```typescript
interface Edge {
  source: string; // tool_id
  target: string; // tool_id
  weight: number;
}
```

**Proposed (Hypergraph representation):**

```typescript
interface Capability {
  id: string;
  name: string;
  tools: string[]; // List of tool IDs (hyperedge)
  metadata: {
    pattern: string;
    frequency: number;
    last_used: Date;
  };
}

interface HypergraphStore {
  // Adjacency structure
  tool_to_capabilities: Map<string, Set<string>>; // tool_id → capability_ids
  capability_to_tools: Map<string, string[]>; // capability_id → tool_ids

  // Precomputed metrics (cached)
  tool_degrees: Map<string, number>;
  capability_sizes: Map<string, number>;
  pagerank_scores?: Map<string, number>;
}
```

### Performance Considerations

**Scale: 100-1000 tools, 100-10000 capabilities**

| Operation            | Complexity                              | Expected Time  |
| -------------------- | --------------------------------------- | -------------- |
| Build hypergraph     | O(E × k) where k = avg tools/capability | ~10ms          |
| Compute PageRank     | O(iterations × E × k)                   | ~50-100ms      |
| Top-K retrieval      | O(E log K)                              | ~1ms           |
| **Total query time** |                                         | **~100-200ms** |

**Optimization Strategies:**

1. **Precompute global PageRank** - Update periodically (e.g., daily)
2. **Personalized PageRank** - Compute delta from global on query
3. **Caching** - Store results in PGlite for common queries
4. **Indexing** - Use pgvector for tool embedding similarity
5. **Hybrid** - Combine hypergraph structure + vector embeddings

### Integration Timeline

**Phase 1: Prototype (Week 1-2)**

- Set up FastAPI microservice
- Implement basic hypergraph PageRank with HyperNetX
- REST API for capability matching
- Basic Deno client

**Phase 2: Optimization (Week 3-4)**

- Add result caching in PGlite
- Implement incremental PageRank updates
- Performance benchmarking
- A/B test vs. current method

**Phase 3: Enhancement (Month 2)**

- Hybrid approach: PageRank + vector embeddings
- Visualization in Cytoscape.js
- Advanced metrics (capability coverage, tool centrality)
- Documentation and monitoring

**Phase 4: Optional (Month 3+)**

- Explore HGNN for learning capability embeddings
- ONNX export for edge inference
- WASM migration for critical paths

---

## Comparative Analysis Table

### Library Comparison

| Library              | Language     | Stars | Maintained | Deno Compat | Spectral          | Random Walk    | HGNN | Ease of Integration |
| -------------------- | ------------ | ----- | ---------- | ----------- | ----------------- | -------------- | ---- | ------------------- |
| **HyperNetX**        | Python 3.10+ | 660   | ✅ 2024    | ❌ API      | ⚠️ Via conversion | ✅             | ❌   | ⭐⭐⭐⭐            |
| **DeepHypergraph**   | Python 3.8+  | 813   | ✅ 2024    | ❌ API/ONNX | ✅                | ✅             | ✅   | ⭐⭐⭐              |
| **DGL**              | Python       | 13k+  | ✅ 2024    | ❌ API/ONNX | ⚠️                | ⚠️             | ✅   | ⭐⭐                |
| **LSSHC**            | Python       | <100  | ⚠️         | ❌ API      | ✅                | ❌             | ❌   | ⭐⭐                |
| **hypergraph-study** | Python/Spark | <100  | ⚠️         | ❌ Spark    | ❌                | ✅             | ❌   | ⭐                  |
| **Cytoscape.js**     | JavaScript   | 10k+  | ✅ 2024    | ✅ Native   | ❌                | ❌             | ❌   | ⭐⭐⭐⭐⭐          |
| **Graphology**       | JavaScript   | 2k+   | ✅ 2024    | ✅ Native   | ❌                | ⚠️ Graphs only | ❌   | ⭐⭐⭐⭐⭐          |

**Legend:**

- ✅ Full support
- ⚠️ Partial/workaround
- ❌ Not supported

### Technique ROI for Casys PML

| Technique                       | Complexity | Value      | Data Needs | Training | Real-time         | ROI Score  |
| ------------------------------- | ---------- | ---------- | ---------- | -------- | ----------------- | ---------- |
| **Hypergraph PageRank**         | ⭐⭐       | ⭐⭐⭐⭐⭐ | Low        | None     | ✅ Fast           | ⭐⭐⭐⭐⭐ |
| **Spectral Clustering**         | ⭐⭐⭐     | ⭐⭐⭐     | Low        | None     | ⚠️ Moderate       | ⭐⭐⭐     |
| **HGNN**                        | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐   | High       | Required | ✅ After training | ⭐⭐       |
| **Hybrid (PageRank + Vectors)** | ⭐⭐⭐     | ⭐⭐⭐⭐⭐ | Medium     | Optional | ✅ Fast           | ⭐⭐⭐⭐⭐ |

---

## Final Recommendations

### Immediate Action (Next 2 Weeks)

1. **Set up Python microservice with FastAPI**
   - Deploy alongside Casys PML
   - Use Docker for easy deployment
   - Start with HyperNetX library

2. **Implement Hypergraph PageRank for capability matching**
   - Capabilities as hyperedges
   - Tools as vertices
   - Personalized PageRank from query tools

3. **Cache results in PGlite**
   - Store precomputed global PageRank
   - Cache query results with TTL

### Short-term (1-2 Months)

4. **Benchmark and optimize**
   - Compare vs. current matching algorithm
   - Profile query performance
   - Tune hyperparameters (alpha, iterations)

5. **Enhance visualization**
   - Represent hypergraph in Cytoscape.js using compound nodes
   - Show capability-tool relationships
   - Highlight query propagation

### Long-term (3-6 Months)

6. **Explore HGNN for learned embeddings**
   - Train on usage patterns
   - Capability embeddings in pgvector
   - Combine structure + learned features

7. **Consider WASM for hot paths**
   - If latency becomes issue
   - Port critical PageRank computation
   - Keep complex algorithms in Python

### Do NOT Do

- ❌ Rewrite everything in Rust/WASM immediately
- ❌ Use neural networks without sufficient training data
- ❌ Over-engineer before validating hypothesis
- ❌ Abandon current system entirely

---

## Code Snippets: Example Integration

### FastAPI Microservice

```python
# hypergraph_service/main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import hypernetx as hnx
import numpy as np
from typing import List, Dict
import asyncio
from functools import lru_cache

app = FastAPI(title="Casys PML Hypergraph Service")

class Tool(BaseModel):
    id: str
    name: str

class Capability(BaseModel):
    id: str
    name: str
    tools: List[str]
    metadata: Dict = {}

class MatchRequest(BaseModel):
    capabilities: List[Capability]
    query_tools: List[str]
    top_k: int = 10
    alpha: float = 0.85

class MatchResponse(BaseModel):
    ranked_capabilities: List[Dict[str, float]]
    query_time_ms: float

@lru_cache(maxsize=1000)
def _cached_pagerank(cap_tuple, tool_tuple, alpha):
    """Cache PageRank computation for repeated queries"""
    # Convert back to lists and compute
    capabilities = {cap[0]: list(cap[1]) for cap in cap_tuple}
    H = hnx.Hypergraph(capabilities)
    return hypergraph_pagerank(H, list(tool_tuple), alpha)

def hypergraph_pagerank(H, query_tools, alpha=0.85, max_iter=100):
    """Simplified PageRank on hypergraph"""
    tools = list(H.nodes)
    caps = {e: list(H.edges[e]) for e in H.edges}

    # Initialize
    tool_rank = {t: (1.0 / len(query_tools) if t in query_tools else 0)
                 for t in tools}
    cap_rank = {c: 1.0 / len(caps) for c in caps}

    # Iterate
    for _ in range(max_iter):
        # Tools → Capabilities
        new_cap_rank = {}
        for cap_id, cap_tools in caps.items():
            score = sum(tool_rank.get(t, 0) for t in cap_tools)
            new_cap_rank[cap_id] = alpha * score + (1 - alpha) / len(caps)

        # Capabilities → Tools
        new_tool_rank = {t: 0 for t in tools}
        for tool_id in tools:
            related_caps = [c for c, ts in caps.items() if tool_id in ts]
            score = sum(new_cap_rank[c] / len(caps[c]) for c in related_caps)
            boost = 1.0 / len(query_tools) if tool_id in query_tools else 0
            new_tool_rank[tool_id] = alpha * score + (1 - alpha) * boost

        tool_rank = new_tool_rank
        cap_rank = new_cap_rank

    return cap_rank

@app.post("/match", response_model=MatchResponse)
async def match_capabilities(request: MatchRequest):
    import time
    start = time.time()

    try:
        # Build hypergraph
        cap_dict = {cap.id: cap.tools for cap in request.capabilities}
        H = hnx.Hypergraph(cap_dict)

        # Compute PageRank
        scores = hypergraph_pagerank(H, request.query_tools, request.alpha)

        # Sort and return top-K
        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        top_k = [{"id": cap_id, "score": score} for cap_id, score in ranked[:request.top_k]]

        query_time = (time.time() - start) * 1000

        return MatchResponse(
            ranked_capabilities=top_k,
            query_time_ms=query_time
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "hypergraph"}
```

### Deno Client

```typescript
// pml/src/lib/hypergraph/client.ts

export interface Capability {
  id: string;
  name: string;
  tools: string[];
  metadata?: Record<string, unknown>;
}

export interface MatchRequest {
  capabilities: Capability[];
  query_tools: string[];
  top_k?: number;
  alpha?: number;
}

export interface MatchResponse {
  ranked_capabilities: Array<{ id: string; score: number }>;
  query_time_ms: number;
}

export class HypergraphClient {
  constructor(private baseUrl = "http://localhost:8000") {}

  async matchCapabilities(request: MatchRequest): Promise<MatchResponse> {
    const response = await fetch(`${this.baseUrl}/match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Hypergraph service error: ${response.statusText}`);
    }

    return response.json();
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Usage example
export async function findMatchingCapabilities(
  allCapabilities: Capability[],
  queryTools: string[],
  topK = 10,
): Promise<Capability[]> {
  const client = new HypergraphClient();

  const result = await client.matchCapabilities({
    capabilities: allCapabilities,
    query_tools: queryTools,
    top_k: topK,
    alpha: 0.85,
  });

  console.log(`Query completed in ${result.query_time_ms.toFixed(2)}ms`);

  // Map IDs back to full capability objects
  const idToCapability = new Map(allCapabilities.map((c) => [c.id, c]));
  return result.ranked_capabilities
    .map(({ id }) => idToCapability.get(id))
    .filter((c): c is Capability => c !== undefined);
}
```

### Docker Deployment

```dockerfile
# hypergraph_service/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code
COPY . .

# Expose port
EXPOSE 8000

# Run FastAPI with Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```yaml
# docker-compose.yml (add to Casys PML)
services:
  pml-hypergraph:
    build: ./hypergraph_service
    ports:
      - "8000:8000"
    environment:
      - LOG_LEVEL=info
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

## Sources & References

### Key Papers

1. [Learning with Hypergraphs: Clustering, Classification, and Embedding](https://proceedings.neurips.cc/paper/2006/file/dff8e9c2ac33381546d96deea9922999-Paper.pdf) -
   Zhou et al., NeurIPS 2006
2. [Random Walks on Hypergraphs with Edge-Dependent Vertex Weights](http://proceedings.mlr.press/v97/chitra19a.html) -
   Chitra & Raphael, ICML 2019
3. [Hypergraph Neural Networks](https://ojs.aaai.org/index.php/AAAI/article/view/4235) - Feng et
   al., AAAI 2019
4. [HyperGCN: A New Method For Training Graph Convolutional Networks on Hypergraphs](https://proceedings.neurips.cc/paper/2019/hash/1efa39bcaec6f3900149160693694536-Abstract.html) -
   Yadati et al., NeurIPS 2019
5. [UniGNN: a Unified Framework for Graph and Hypergraph Neural Networks](https://arxiv.org/abs/2105.00956) -
   Huang & Yang, IJCAI 2021

### Libraries & Tools

- [HyperNetX (GitHub)](https://github.com/pnnl/HyperNetX) - PNNL's Python hypergraph library
- [DeepHypergraph (GitHub)](https://github.com/iMoonLab/DeepHypergraph) - PyTorch hypergraph neural
  networks
- [DGL Hypergraph Tutorial](https://www.dgl.ai/dgl_docs/notebooks/sparse/hgnn.html) - Deep Graph
  Library
- [HGNN Original Implementation](https://github.com/iMoonLab/HGNN) - Reference AAAI 2019 code
- [UniGNN Implementation](https://github.com/OneForward/UniGNN) - Unified GNN/hypergraph framework
- [HyperGCN Implementation](https://github.com/malllabiisc/HyperGCN) - NeurIPS 2019 code
- [Cytoscape.js](https://js.cytoscape.org) - Graph visualization library
- [Graphology](https://graphology.github.io/) - JavaScript graph library

### Integration Technologies

- [Pyodide](https://pyodide.org/) - Python in the browser via WebAssembly
- [ONNX](https://onnx.ai/) - Open Neural Network Exchange format
- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework
- [Deno](https://deno.com/) - Secure TypeScript/JavaScript runtime

### Recommendation Systems Research

- [Heterogeneous Hypergraph Embedding for Recommendation Systems](https://arxiv.org/abs/2407.03665) -
  2024
- [A Survey on Hypergraph Representation Learning](https://dl.acm.org/doi/10.1145/3605776) - ACM
  2023
- [Awesome Hypergraph Network](https://github.com/gzcsudo/Awesome-Hypergraph-Network) - Curated list

---

## Appendix: Glossary

**Hypergraph**: Generalization of graph where edges (hyperedges) can connect any number of vertices

**Hyperedge**: An edge connecting 2 or more vertices (vs. standard edge connecting exactly 2)

**Incidence Matrix**: Matrix H where H[i,j] = 1 if vertex i is in hyperedge j

**Clique Expansion**: Convert hypergraph to graph by making each hyperedge a complete clique

**Star Expansion**: Convert hypergraph to bipartite graph with vertex and hyperedge nodes

**Spectral Clustering**: Clustering using eigenvalues/eigenvectors of graph Laplacian

**Random Walk**: Stochastic process of moving between vertices following edges

**PageRank**: Algorithm measuring node importance via random walk stationary distribution

**HGNN**: Hypergraph Neural Network - extends GNN message passing to hyperedges

**ONNX**: Open format for neural network models, enables cross-framework inference

**WASM**: WebAssembly - binary instruction format for near-native browser/Deno execution

**Pyodide**: CPython compiled to WebAssembly for running Python in browsers

---

**End of Research Report**
