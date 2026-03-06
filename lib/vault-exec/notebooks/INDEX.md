# vault-exec Notebooks

Deno Jupyter notebooks for analyzing the DB-first `vault-exec` training data
and experiments.

**Runtime:** Deno Jupyter kernel (`deno jupyter`) **Visualization:** Vega-Lite
(native MIME type support in Deno Jupyter) **Data source:** Deno KV
(`.vault-exec/vault.kv`)

## Notebooks

| NB | Title                   | Focus                                                                                        |
| -- | ----------------------- | -------------------------------------------------------------------------------------------- |
| 05 | Topological Map         | DB-first leaf-node/edge inspection from `training_data`                                      |
| 06 | GNN Forward on DB-First Leaf Graph | Real `src/gnn` forward pass on weighted leaf `next` transitions, with persisted params |
| 07 | OpenClaw Args Categorization | OpenClaw ingest-side args analysis, separate from DB-first training tables              |
| 08 | OpenClaw GRU Training   | Real `src/gru` training on DB-first sequences, using GNN embeddings and persisting weights   |

Also: `topological-map.html` — legacy interactive HTML visualization (open in browser)

## Prerequisites

```bash
# Initialize / refresh DB-first training data first
deno task cli init ./demo-vault

# Start Jupyter
deno jupyter
```

## Deno Kernel Setup (KV + FFI)

`Deno.openKv()` in notebooks requires unstable KV in the Deno kernel.
If you see `Deno.openKv is not a function`, patch the kernel spec:

```bash
cat > ~/.local/share/jupyter/kernels/deno/kernel.json <<'EOF'
{
  "argv": [
    "/home/ubuntu/.deno/bin/deno",
    "jupyter",
    "--unstable-kv",
    "--unstable-ffi",
    "--kernel",
    "--conn",
    "{connection_file}"
  ],
  "display_name": "Deno",
  "language": "typescript"
}
EOF
```

## Notes

- DB-first notebooks (`05`, `06`, `08`) read the active build from
  `training_data` inside `.vault-exec/vault.kv`
- Vega-Lite charts render natively in Jupyter (no extra deps)
- `07` stays ingest-oriented and does not depend on rebuilt training tables
- Notebook `06` now runs the real GNN forward path and persists params in KV
- Notebook `08` now runs the real GRU training path and persists weights in KV
- Runtime training is notebook-first in this phase; `init` / `sync` rebuild KV
  tables and projection only
