# GNN Orchestrator Refactor: Backend Validation + Diagnostics

Date: 2026-03-05
Owner scope: Task 4/5 docs + benchmark harness

## Goal

Provide lightweight, reproducible validation for the GNN math backend path (JS vs BLAS) and expose backend diagnostics in the backprop experiment notebook, without mutating vault data or runtime state.

## Architecture Boundaries (Task 4/5 Perspective)

- Orchestration path under test: GNN message-passing projections rely on `matVecMul()`.
- Backend gateway in current code: `src/gnn/attention.ts` delegates to BLAS via `src/gnn/blas-ffi.ts` when dimensions are large enough and BLAS is available.
- Benchmark harness scope: direct backend kernel validation (`jsMatVec` vs `blasMatVec`) on representative projection shapes used by vault-exec GNN.

## Backend Selection Policy

Current runtime policy in `src/gnn/attention.ts`:

- Use BLAS when:
  - `rows >= 16`
  - `cols >= 64`
  - `isBlasAvailable() === true`
- Otherwise fallback to pure JS dot-product path.

This gives deterministic fallback behavior on systems without FFI/OpenBLAS.

## Benchmark Harness

File: `scripts/bench-gnn-backend.ts`

What it measures:

- JS and BLAS matrix-vector throughput/latency on representative cases:
  - `64x1024` single-head projection
  - `8 x (64x1024)` batched projection (multi-head proxy)
  - `8 x (16x256)` smaller projection workload
- Mean / p50 / p95 / min / max milliseconds per iteration
- BLAS speedup relative to JS
- Numerical sanity check (`max_abs_diff`) between JS and BLAS outputs

Design constraints:

- Lightweight defaults to keep runtime short
- Synthetic deterministic inputs (seeded RNG)
- No database writes, no vault mutations, no parameter persistence

## Notebook Diagnostics Update

File: `notebooks/06-gnn-backprop-experiment.ipynb`

Minimal additions:

- Backend diagnostics:
  - Prints backend in use (`BLAS` or `JS`)
  - Prints resolved BLAS library path (or `n/a`)
- Before/after similarity diagnostics:
  - Existing parent-child cosine metrics preserved
  - Added explicit deltas:
    - `Delta vs raw`
    - `Delta vs random MP`

This makes backend visibility explicit when interpreting backprop experiment results.

## How To Run

From `lib/vault-exec/`:

```bash
deno check scripts/bench-gnn-backend.ts
deno task bench:gnn
```

Optional benchmark flags:

```bash
deno task bench:gnn -- --seed 42 --scale 1.5
```

## Migration Notes Toward Full Trainable GNN

- Keep `bench-gnn-backend.ts` as a quick kernel-level smoke/perf check while orchestrator internals evolve.
- If/when backend abstraction moves to dedicated modules (for example `src/gnn/math/*`), wire the benchmark to the new contract while preserving:
  - deterministic inputs,
  - side-effect-free execution,
  - output parity checks.
- Extend notebook diagnostics with:
  - backend name per run,
  - training-step runtime breakdown (forward/backward),
  - stability checks across seeds.
