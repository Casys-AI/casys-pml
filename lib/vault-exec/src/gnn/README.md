# GNN Structure

GNN now uses a strict feature-slice split with no legacy facades:

- `domain/`: graph message-passing and canonical GNN types :
  `domain/message-passing.ts`, `domain/attention.ts`, `domain/residual.ts`,
  `domain/types.ts`
- `application/`: orchestration and phase sequencing :
  `application/orchestrator.ts`, `application/phases/*`, `application/types.ts`
- `infrastructure/`: runtime adapters (BLAS/JS backend, parameter persistence) :
  `infrastructure/blas-ffi.ts`, `infrastructure/math/*`,
  `infrastructure/runtime-store.ts`

Public entrypoints:

- forward pass: `application/forward.ts`
- training/serialization: `application/training.ts`
- param init: `domain/params.ts`

Layer rule:

- `domain` must stay pure (no storage/runtime side effects)
- `application` may orchestrate `domain` + `infrastructure`
- `infrastructure` contains FFI/persistence/runtime-specific concerns only
