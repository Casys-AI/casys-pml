# Subagent Node — Plan

Date: 2026-03-05

## Goal
Enable specific nodes to spawn/configure a sub-agent execution step (sampling-style behavior) from note metadata.

## Concept
A node can be `type: subagent` with a strict spawn contract.

## Scope v1
1. Frontmatter contract:
   - `node_type: subagent`
   - `subagent.runtime` (`subagent` | `acp`)
   - `subagent.agentId`
   - `subagent.model` / `thinking`
   - `subagent.task_template`
   - `subagent.timeout`
   - `subagent.inputs_schema`
2. Execution:
   - compile task from graph context + runtime input
   - spawn sub-agent with explicit allowlist checks
   - collect result into node output
3. Security:
   - no inline API keys; only secret/env refs via runtime-dependencies layer
   - per-node capability boundary
   - max runtime + cancellation controls
4. Observability:
   - JSONL events: `subagent_spawned`, `subagent_progress`, `subagent_done`, `subagent_error`
   - stable error codes for spawn/timeout/auth failures

## Non-goals v1
- Arbitrary nested agent trees.
- Autonomous self-replication loops.

## Acceptance criteria
- Subagent node can run deterministically from note config.
- Missing permissions/agentId/secret refs fail early with explicit machine errors.
- Output integrates as normal node result in DAG.

## Dependency
Build after (or in parallel with) runtime-dependencies core.
