# Vault-Exec GNN Final Architecture (No Legacy Facades)

## Scope

This document records the final GNN folder structure after removal of
compatibility facades and completion of type migration.

## Final Layout

- `src/gnn/domain/`
- `src/gnn/application/`
- `src/gnn/infrastructure/`
- `src/gnn/architecture_test.ts`

## Canonical Types

All canonical GNN types now live in:

- `src/gnn/domain/types.ts`

Imported by:

- pipeline callers (`init.ts`, `retrain.ts`, `integration_test.ts`)
- GNN internals (`application/forward.ts`, `application/training.ts`,
  `domain/params.ts`)
- notebooks (`notebooks/06-gnn-backprop-experiment.ipynb`)

## Removed Legacy Files

- `src/gnn/message-passing.ts`
- `src/gnn/orchestrator.ts`
- `src/gnn/runtime.ts`
- `src/gnn/blas-ffi.ts`
- `src/gnn/types.ts`
- `src/gnn/math/*`
- `src/gnn/phases/*`

## Layer Boundaries

- `domain`: pure computation and shape contracts
- `application`: phase orchestration, no persistence/FFI code
- `infrastructure`: DB/runtime/FFI adapters

## Operational Entry Points

- Forward pass: `src/gnn/application/forward.ts`
- Numerical train + serialization: `src/gnn/application/training.ts`
- Params init: `src/gnn/domain/params.ts`
- BLAS runtime adapter: `src/gnn/infrastructure/blas-ffi.ts`
- Param store adapter: `src/gnn/infrastructure/runtime-store.ts`
