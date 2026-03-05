# Skill Node — Plan

Date: 2026-03-05

## Goal
Support note nodes that map to a skill package/folder and execute through a stable skill contract.

## Concept
A node can be `type: skill` and reference a skill entrypoint.

## Scope v1
1. Frontmatter contract:
   - `node_type: skill`
   - `skill.id`
   - `skill.entry` (command/module)
   - `skill.inputs_schema` (optional override)
   - `skill.runtime` (dependency profile id)
2. Resolver behavior:
   - resolve skill by id/index
   - validate input schema before execution
   - emit machine events (`skill_resolved`, `skill_started`, `skill_completed`, `skill_failed`)
3. Packaging/index:
   - support folder-based skill with index manifest
   - allow standalone file notes to reference indexed skill assets
4. Safety:
   - explicit allowed capabilities per skill node
   - deny undeclared external calls

## Non-goals v1
- Dynamic skill generation at run time.
- Multi-tenant skill registry.

## Acceptance criteria
- A note can trigger a declared skill deterministically.
- Input/output and failure modes are machine-readable (JSONL events).
- Works with runtime dependencies plan (secret refs only).

## Open question
- Final manifest naming (`skill.yaml` vs frontmatter-only + index).
