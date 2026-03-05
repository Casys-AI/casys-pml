# vault-exec src layout

## Core graph pipeline

- `core/parser.ts` / `core/graph.ts` / `core/validator.ts`
- `core/compiler.ts` / `core/executor.ts`
- `core/io.ts` / `core/template.ts` (interfaces + templates)
- `infrastructure/fs/deno-vault-fs.ts` (Deno reader/writer adapters)
- shared contracts in `core/types.ts`
- ports in `core/ports/*` (LLM, etc.)

## Infrastructure adapters

- `infrastructure/llm/openai-client.ts`

## Routing and runtime payloads

- `routing/target-identifiers.ts`
- `routing/runtime-inputs.ts`
- `routing/intent-candidates.ts`

Tests for this slice are co-located in `routing/*_test.ts`.

## Learning and retrieval

- `embeddings/*`
- `gnn/domain/*` / `gnn/application/*` / `gnn/infrastructure/*`
- `gru/*`
- `traces/*`

## Runtime entrypoints

- `cli.ts` (interactive/stateless CLI)
- `workflows/init.ts` (cold-start indexing + training bootstrap)
- `workflows/retrain.ts` (incremental training loop)
- `workflows/integration_test.ts` (cross-slice integration test)
- `service/*` (watch/sync daemon)
- `cli-runtime/*` (CLI output + exit codes)
- `utils/compress.ts` (shared gzip helpers)
