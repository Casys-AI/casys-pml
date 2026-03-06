# Filesystem Adapter Contract

## Purpose

`src/infrastructure/fs` provides Deno-specific implementations of core I/O
contracts.

## Implementations

- `DenoVaultReader` implements `VaultReader`
- `DenoVaultWriter` implements `VaultWriter`

## Behavior Contract

- `listNotes(dir)` recursively returns sorted markdown files (`*.md`,
  case-insensitive).
- Technical and non-content folders are skipped by default: `.vault-exec`,
  `.vault-exec-backup`, `.obsidian`, `.git`, `node_modules`, `_drafts`, and
  hidden directories.
- `readNote(path)` and `writeNote(path, content)` are thin pass-through wrappers
  around Deno filesystem APIs.

## Boundary Rule

- This module depends on `src/core/contracts.ts` only; core must not depend on
  this adapter.
