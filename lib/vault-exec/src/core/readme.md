# core

Stable execution primitives used across feature slices.

## Responsibilities

- Parse notes into typed nodes.
- Build and validate DAG structures.
- Compile frontmatter and execute nodes.
- Define shared types and ports.

## Boundaries

- `core` only exposes generic, reusable logic.
- Ingest-specific behavior must stay outside `core`.
- Dependencies flow from feature slices to `core`, never the inverse.
