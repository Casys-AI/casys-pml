# vault-exec src layout

Machine-first feature slices with explicit contracts and deterministic
fallbacks.

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

## CLI behavior contract

- Default output mode is machine-readable JSONL events.
- `--human` switches to human-readable output.
- `run --intent` is confirmation-first by default.
- `run --intent --no-confirm` enables auto-select mode.
- `run --payload-mode strict|project` makes payload policy explicit.
- Missing GRU weights for intent routing is a validation error with `init`
  guidance.
- Ingest trace-session dates use deterministic fallback (`1970-01-01`) when
  source timestamps are unavailable.
