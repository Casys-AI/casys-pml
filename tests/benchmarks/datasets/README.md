# Benchmark Datasets

Large datasets for SHGAT evaluation. Not committed to git - download separately.

## ToolBench (Recommended)

Hierarchical API retrieval benchmark: **Category → Tool → API** (3 levels)

- **Source**: [OpenBMB/ToolBench](https://github.com/OpenBMB/ToolBench)
- **Size**: 88k queries, 10k+ APIs, 3k+ tools, 49 categories
- **Format**: JSON + NPY embeddings (768-dim)

### Download

```python
from datasets import load_dataset

ds = load_dataset("Maurus/ToolBench", split="train")

# Save locally
import json
import numpy as np

data = [{"query_id": r["query_id"], "query": r["query"], "domain": r["domain"], "api_list": r["api_list"]} for r in ds]
with open("toolbench-queries.json", "w") as f:
    json.dump(data, f)

embeddings = np.array([r["embedding"] for r in ds])
np.save("toolbench-embeddings.npy", embeddings)
```

## ToolRet

Intent → Tool retrieval benchmark (flat, 3 categories only)

- **Source**: Academic benchmark
- **Size**: 43k tools, 7.6k queries
- **Note**: Less suitable for hierarchical evaluation

## Cocitation-Cora

Citation network benchmark for node classification.

- **Source**: Standard academic benchmark
- **Size**: ~2.7k nodes
