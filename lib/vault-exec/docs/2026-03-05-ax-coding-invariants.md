# Vault Exec AX Coding Invariants (Hardening Update)

Date: 2026-03-05 Scope: `lib/vault-exec` ingest + traces + policy + CLI
contracts

## Why this exists

Agent experience depends on stable, parseable, deterministic behavior. This file
captures invariants that must remain true when touching AX-related code.

## Architecture invariants

1. Deterministic outputs over wall-clock defaults.
   - Ingest session/tool artifacts must not depend on current date/time when
     source metadata is missing.
   - Current deterministic fallback date is `1970-01-01`.
2. Deterministic ordering for synthesized execution paths.
   - `generateStructuralTraces()` must produce stable target ordering
     independent from input note array order.
3. Explicit fallback semantics.
   - `run --intent` without trained GRU weights is a validation failure with an
     actionable `init` message.
   - Runtime GRU-routing errors (after initialization) may fall back to full DAG
     execution and must emit machine-readable fallback signals.
4. Policy transitions are threshold-based and predictable.
   - Promoted status is sticky.
   - Reject score threshold is inclusive.
   - Promotion requires score, support, and success-ratio minimums.
5. CLI output contract is machine-first by default.
   - JSONL events are default.
   - Human-readable mode is opt-in via `--human`.

## Contribution rules for AX coding

1. Test-first for behavior changes.
   - Add/adjust failing tests before implementation for deterministic behavior,
     fallback behavior, and policy thresholds.
2. Avoid hidden heuristics.
   - Prefer explicit defaults and explicit user-facing signals over implicit
     behavior changes.
3. Keep contracts narrow.
   - Remove unused/legacy exported helpers only when verified as unreferenced.
4. Keep docs in lockstep with CLI behavior.
   - If command flags or defaults change, update user-facing docs in the same
     commit.
5. Scope hardening changes.
   - Prefer minimal, local cleanups in touched AX slices instead of broad
     refactors.

## Minimum verification checklist

1. Ingest tests: parser + markdown + ingest fallback scenarios.
2. Trace tests: deterministic ordering and intent fallback.
3. Policy tests: boundary transitions and sticky promotion.
4. Full relevant suite: `deno task test`.
