# ingest (AX slice)

Purpose: transform OpenClaw session traces into machine-readable + human-auditable artifacts.

## Responsibilities

- Parse raw session events into typed turns/tool calls (`parser.ts`)
- Apply L2 policy classification with conservative fallback (`policy.ts`)
- Aggregate deduped tool usage (`aggregate.ts`)
- Generate projections (session/tool markdown + coverage report) (`markdown.ts`, `coverage.ts`)
- Orchestrate end-to-end ingestion (`ingest.ts`)

## Non-responsibilities

- No external runtime execution logic
- No global routing logic outside ingest policy scope
- No hidden heuristics outside `policy.ts`

## Inputs / outputs

Input: OpenClaw JSONL session files directory
Output: `sessions/`, `tools/`, `reports/l2-coverage.md`

## AX invariants for this slice

- deterministic parsing and ordering
- explicit fallback reason when classification is uncertain
- policy decisions must be test-covered
- projections derived from typed ingest data only
