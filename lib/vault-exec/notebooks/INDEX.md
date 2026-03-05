# vault-exec Notebooks

Deno Jupyter notebooks for analyzing the vault-exec GNN+GRU pipeline.

**Runtime:** Deno Jupyter kernel (`deno jupyter`)
**Visualization:** Vega-Lite (native MIME type support in Deno Jupyter)
**Data source:** Deno KV (`.vault-exec/vault.kv`)

## Notebooks

| NB | Title | Focus |
|----|-------|-------|
| 01 | Graph Structure | DAG visualization, levels, dependencies, execution order |
| 02 | Embedding Space | Raw vs GNN embeddings, cosine heatmap, parent-child similarity, GNN movement |
| 03 | GRU Diagnostics | Weight analysis, self-prediction accuracy, confusion matrix, softmax behavior |
| 04 | Trace Analysis | Synthetic vs real traces, coverage, path analysis, intent diversity, data quality |
| 05 | Topological Map | DAG hierarchy, elevation score, attractor vs topological peak, gravity analysis |

Also: `topological-map.html` — interactive HTML visualization (open in browser)

## Prerequisites

```bash
# Initialize a vault first
deno task cli init ./demo-vault

# Run some intent queries to accumulate real traces
deno task cli run ./demo-vault --intent "which projects are over budget"
deno task cli run ./demo-vault --intent "total payroll costs"
deno task cli run ./demo-vault --target "Engineering Team"

# Start Jupyter
deno jupyter
```

## Notes

- All notebooks import directly from `../src/` — same TypeScript classes as the CLI
- Vega-Lite charts render natively in Jupyter (no extra deps)
- KV connection via `openVaultStore(...)` — same as production code
- NB03 confusion matrix only works with real traces that have intent embeddings
