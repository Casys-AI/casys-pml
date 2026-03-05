# GNN Structure

This folder now follows a lightweight hexagonal split:

- `domain/`: pure message-passing kernels (`vertexToEdge`, `edgeToVertex`, `edgeToEdge`)
- `application/`: orchestration flow and phase sequencing
: `application/orchestrator.ts`, `application/phases/*`
- `infrastructure/`: runtime adapters (BLAS/JS math, params persistence)
: `infrastructure/blas-ffi.ts`, `infrastructure/math/*`, `infrastructure/runtime-store.ts`
- `forward.ts`: stable public facade for callers

Compatibility note:
- Legacy paths are kept as facades for compatibility:
- `message-passing.ts`
- `orchestrator.ts`
- `phases/*`
- `math/*`
- `blas-ffi.ts`
- `runtime.ts`
