# Vault-Exec GNN Orchestrator Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Refactor `lib/vault-exec` GNN stack into a maintainable
orchestrator/phases architecture with explicit JS/BLAS math backends, while
preserving behavior and improving runtime observability.

**Architecture:** Split the current monolithic forward/message-passing flow into
an orchestrator (`run phases in order`) plus isolated phase modules
(`vertex->edge`, `edge->edge`, `edge->vertex`). Introduce a math backend
abstraction that can route to OpenBLAS FFI or JS fallback without leaking
backend concerns into phase logic. Keep `gnnForward()` as compatibility façade
during migration.

**Tech Stack:** Deno, TypeScript, Deno FFI (OpenBLAS), existing vault-exec GNN
modules/tests.

---

### Task 1: Establish Orchestrator + Phase Boundaries (No Behavior Change)

**Files:**

- Create: `lib/vault-exec/src/gnn/application/orchestrator.ts`
- Create: `lib/vault-exec/src/gnn/application/phases/vertex-to-edge.ts`
- Create: `lib/vault-exec/src/gnn/application/phases/edge-to-edge.ts`
- Create: `lib/vault-exec/src/gnn/application/phases/edge-to-vertex.ts`
- Modify: `lib/vault-exec/src/gnn/application/forward.ts`
- Test: `lib/vault-exec/src/gnn/application/forward_test.ts`

**Step 1: Write compatibility tests before refactor**

- Add tests asserting `gnnForward()` output size and deterministic behavior on
  fixed params/nodes remains unchanged.

**Step 2: Implement orchestrator skeleton**

- Move level grouping, phase ordering, and in-memory embedding map management
  into `orchestrator.ts`.

**Step 3: Extract phase implementations**

- Move logic from `message-passing.ts` calls into dedicated phase files while
  keeping existing math helpers.

**Step 4: Keep `gnnForward` as façade**

- `forward.ts` calls orchestrator so downstream callers (`init`, `retrain`,
  notebooks) do not break.

**Step 5: Run tests**

- Run:
  `deno test --allow-read --allow-write --allow-env --allow-net --allow-run --allow-ffi --unstable-kv --node-modules-dir=manual src/gnn/application/forward_test.ts`
- Expected: PASS

---

### Task 2: Introduce Math Backend Interface (JS + BLAS)

**Files:**

- Create: `lib/vault-exec/src/gnn/infrastructure/math/backend.ts`
- Create: `lib/vault-exec/src/gnn/infrastructure/math/js.ts`
- Create: `lib/vault-exec/src/gnn/infrastructure/math/blas.ts`
- Modify: `lib/vault-exec/src/gnn/domain/attention.ts`
- Modify: `lib/vault-exec/src/gnn/infrastructure/blas-ffi.ts`
- Test: `lib/vault-exec/src/gnn/domain/message-passing_test.ts`

**Step 1: Define backend contract**

- Interface for `matVec`, optional `matmul` extension hooks, and backend
  metadata (`name`, `available`).

**Step 2: Implement JS backend**

- Pure TS implementation with no FFI assumptions.

**Step 3: Implement BLAS backend adapter**

- Wrap `blas-ffi.ts` with same contract and clean fallback behavior.

**Step 4: Route attention/math through backend selection**

- Default policy: JS for small tensors, BLAS for larger dimensions.

**Step 5: Run tests**

- Run:
  `deno test --allow-read --allow-write --allow-env --allow-net --allow-run --allow-ffi --unstable-kv --node-modules-dir=manual src/gnn/domain/message-passing_test.ts`
- Expected: PASS

---

### Task 3: Runtime Init + Observability + Service Parity

**Files:**

- Modify: `lib/vault-exec/src/workflows/init.ts`
- Modify: `lib/vault-exec/src/workflows/retrain.ts`
- Modify: `lib/vault-exec/src/service/client.ts`
- Modify: `lib/vault-exec/src/gnn/runtime.ts`
- Test: `lib/vault-exec/src/workflows/integration_test.ts`

**Step 1: Ensure BLAS init is explicit in runtime paths**

- Log backend status at `init` and verbose `retrain`.

**Step 2: Preserve GNN params lifecycle**

- Keep load-or-init + persist semantics stable with compatibility checks.

**Step 3: Service daemon parity**

- Ensure daemon-spawned flows include required permissions (`--allow-ffi`) and
  status does not regress.

**Step 4: Run integration test**

- Run:
  `deno test --allow-read --allow-write --allow-env --allow-net --allow-run --allow-ffi --unstable-kv --node-modules-dir=manual src/workflows/integration_test.ts`
- Expected: PASS

---

### Task 4: Performance + Stability Validation Harness

**Files:**

- Create: `lib/vault-exec/scripts/bench-gnn-backend.ts`
- Modify: `lib/vault-exec/notebooks/06-gnn-backprop-experiment.ipynb`
- Modify: `lib/vault-exec/deno.json`

**Step 1: Add benchmark script**

- Compare JS vs BLAS backend on representative dimensions used in `vault-exec`
  GNN.

**Step 2: Add task runner**

- Add `deno task bench:gnn` for reproducible local benchmark runs.

**Step 3: Extend notebook diagnostics**

- Notebook should print backend used and before/after parent-child similarity
  metrics.

**Step 4: Execute benchmark smoke**

- Run: `deno task bench:gnn`
- Expected: runs without crash and prints backend stats.

---

### Task 5: Regression Suite + Documentation

**Files:**

- Modify: `lib/vault-exec/src/gnn/application/forward_test.ts`
- Modify: `lib/vault-exec/src/gnn/domain/message-passing_test.ts`
- Create: `lib/vault-exec/docs/2026-03-05-gnn-orchestrator-refactor.md`

**Step 1: Add regression checks**

- Determinism checks (fixed params), no-crash checks with disconnected nodes,
  and compatibility checks for fallback behavior.

**Step 2: Run focused suite**

- Run:
  `deno test --allow-read --allow-write --allow-env --allow-net --allow-run --allow-ffi --unstable-kv --node-modules-dir=manual src/gnn/`
- Expected: PASS

**Step 3: Document architecture and migration map**

- Record module boundaries, backend selection policy, and next steps for full
  gradient-based training integration.

**Step 4: Final verification command**

- Run:
  - `deno check src/cli.ts src/workflows/init.ts src/workflows/retrain.ts src/gnn/*.ts src/gnn/**/*.ts`
  - `deno task cli init ./demo-vault`
- Expected: no type errors, init completes.

---

## Execution Strategy (Subagent-Driven in this session)

- Worker A owns Task 1 + forward compatibility.
- Worker B owns Task 2 + backend abstraction.
- Worker C owns Task 4/5 validation harness + docs.
- Main agent integrates Task 3 and resolves cross-task merge conflicts.

## Commit Strategy

- Commit 1: `refactor(gnn): introduce orchestrator and phase modules`
- Commit 2: `perf(gnn): add backend abstraction with BLAS fallback`
- Commit 3: `chore(gnn): add benchmark harness and refactor docs`
