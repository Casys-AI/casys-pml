# vault-exec src Root Cleanup: Core Extraction

## Why

`src/` root still mixed foundational graph pipeline files with runtime
entrypoints. This made boundaries harder to read and kept root cluttered.

## What changed

Extracted foundational pipeline modules into `src/core/`:

- `types.ts`
- `template.ts`
- `io.ts`
- `parser.ts`
- `graph.ts`
- `validator.ts`
- `compiler.ts`
- `executor.ts`

Moved their tests too:

- `core/parser_test.ts`
- `core/graph_test.ts`
- `core/graph_virtual_test.ts`
- `core/validator_test.ts`
- `core/compiler_test.ts`
- `core/executor_test.ts`

## Import rewiring

Updated consumers to use `core/*`:

- `src/cli.ts` (including dynamic imports)
- `src/workflows/init.ts`, `src/workflows/retrain.ts`,
  `src/workflows/integration_test.ts`
- `src/service/sync-worker.ts`
- `src/routing/*`
- `src/embeddings/*`
- `src/traces/*`
- `src/links/feedback.ts`
- notebooks and `scripts/ablation-routing.ts`

## Result

- `src/` root now focuses on runtime entrypoints and orchestration.
- foundational graph/pipeline logic is centralized under `src/core/`.
- GNN remains separately structured under
  `src/gnn/{domain,application,infrastructure}`.

## Additional root cleanup

- moved `init.ts` / `retrain.ts` into `src/workflows/`
- moved `output.ts` / `exit-codes.ts` into `src/cli-runtime/`
- moved `compress.ts` into `src/utils/`
- removed legacy LLM-only intent resolver (`src/routing/intent-llm.ts`) in
  favor of GRU + candidate policy routing (`src/routing/intent-candidates.ts`)

## Cross-feature contracts moved to core

To avoid feature-level coupling for shared contracts, these definitions are now
owned by `src/core/types.ts`:

- `VirtualEdgeStatus`, `VirtualEdgeRow`, `VirtualEdgeUpdate`
- `ExecutionTrace`
- `NoteRow`, `TraceRow`, `IVaultStore`

Legacy files removed:

- `src/db/types.ts`
- `src/links/types.ts`
- `src/traces/types.ts`

Also extracted an LLM port and adapter split:

- `src/core/ports/llm.ts` (port)
- `src/infrastructure/llm/openai-client.ts` (adapter)
