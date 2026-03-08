# core/compiler slice

Compiler submodules for frontmatter generation and normalization.

## Responsibilities

- `frontmatter.ts`: frontmatter parsing/normalization helpers.
- `prompt.ts`: deterministic compile prompt construction.
- `workflow.ts`: compile orchestration for note batches.

## Boundaries

- Depends only on `core` contracts and ports.
- Must not import workflow/service orchestration slices.
- Keeps compile behavior machine-first and deterministic.
