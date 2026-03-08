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
| 06 | GNN Graph Diagnostics | Persisted GNN-state inspection over the active leaf `next` graph, without retraining |
| 07 | OpenClaw Args Categorization | OpenClaw ingest-side args analysis, separate from DB-first training tables              |
| 08 | GRU Metrics on DB-First Sequences | Persisted-GRU evaluation on the active DB-first build, with baseline comparisons |

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
- Notebook `06` reads persisted GNN state and recomputes embeddings in-memory
  for diagnostics only
- Notebook `08` reads persisted GRU weights and evaluates them against the
  active DB-first build
- Runtime training runs in background from `init` / `sync`; notebooks are for
  stats, diagnostics, and evaluation
