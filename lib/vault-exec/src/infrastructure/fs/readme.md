# infrastructure/fs

## Responsibilities

`src/infrastructure/fs` provides Deno-specific implementations of core I/O
contracts.

## Implementations

- `DenoVaultReader` implements `VaultReader`
- `DenoVaultWriter` implements `VaultWriter`

## Behavior

- `listNotes(dir)` recursively returns sorted markdown files (`*.md`,
  case-insensitive).
- Technical and non-content folders are skipped by default: `.vault-exec`,
  `.vault-exec-backup`, `.obsidian`, `.git`, `node_modules`, `_drafts`, and
  hidden directories.
- `readNote(path)` is a thin pass-through wrapper around Deno filesystem APIs.
- `writeNote(path, content)` ensures parent directories exist before writing.

## Boundaries

- This module depends on `src/core/contracts.ts` only; core must not depend on
  this adapter.
