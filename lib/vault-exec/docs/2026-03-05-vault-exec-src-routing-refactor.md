# vault-exec src Root Cleanup: Routing Slice Extraction

## Why

`src/` root had multiple runtime-payload and intent-routing files mixed with
core graph execution files, making boundaries less obvious.

## What changed

Moved routing-focused modules into `src/routing/`:

- `intent-candidates.ts`
- `runtime-inputs.ts`
- `target-identifiers.ts`

Moved associated tests into the same slice:

- `intent-candidates_test.ts`
- `runtime-inputs_test.ts`
- `target-identifiers_test.ts`

Updated imports:

- `src/cli.ts` now imports these modules from `src/routing/*`.
- moved files now reference shared root modules via `../`.

## Architectural effect

- `src/` root is now more focused on orchestration/core pipeline files.
- runtime-input and intent-candidate concerns are grouped in one feature slice.
- test locality is improved: routing behavior and tests live together.

## Validation

- `deno check` for CLI + GNN + routing paths passed.
- full `deno test src` passed.
