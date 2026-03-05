# GNN Structure

This folder follows an incremental hexagonal split:

- `domain/`: pure message-passing kernels (`vertexToEdge`, `edgeToVertex`, `edgeToEdge`)
- `phases/`: application orchestration steps over graph levels
- `orchestrator.ts`: application flow (`V->E`, `E->E`, `E->V`)
- `forward.ts`: stable public facade for callers
- `math/` + `blas-ffi.ts`: infrastructure adapters (JS/BLAS)
- `runtime.ts`: persistence boundary for params lifecycle

Compatibility note:
- `message-passing.ts` is a facade for older imports and re-exports the domain kernels.

