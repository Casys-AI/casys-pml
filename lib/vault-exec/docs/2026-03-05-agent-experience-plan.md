# Vault Exec — Agent Experience (AX) Improvement Plan

Date: 2026-03-05 Owner: David (agent perspective) Scope: `lib/vault-exec`

---

## Status log (updated 2026-03-05)

- `DONE` Phase A implemented (`validateRuntimeInputsForGraph`, candidate
  pre-validation, compatibility surfaced before confirm).
- `DONE` Phase C contract hardening implemented for JSONL events:
  `candidate_id` + structured `validation` payload added.
- `INVALIDATED` Phase C item "`--format json` flag": rejected by product
  decision (CLI remains machine-first JSONL by default).
- `INVALIDATED` Phase C item "human-readable default": rejected by product
  decision (human mode remains opt-in via `--human`).
- `PENDING` Phase B (`--payload-mode strict|project`) not implemented yet.

---

## 1) Why this plan exists

Current behavior is functional, but agent flow still has friction:

1. `--intent` proposes candidates, then blocks for confirmation (good),
2. payload validation happens after target selection (too late),
3. payload can fail on `additionalProperties` because the selected target schema
   is narrower than upstream/global payload,
4. agent needs trial-and-error instead of deterministic preflight.

From an AX standpoint, this creates avoidable dead-ends in otherwise good
routing.

---

## 2) AX principles (light framework)

This is intentionally pragmatic (not "state of the art" claims):

1. **Fast fail early**: reject invalid payloads before expensive
   routing/execution.
2. **Show compatibility before choice**: for each suggested target, expose
   schema fit status.
3. **Preserve human confirmation where valuable**: keep blocking confirm for
   intent routing.
4. **Avoid surprise after confirmation**: if user picks target #1, execution
   should almost always continue.
5. **Prefer deterministic CLI contracts over hidden heuristics**.

---

## 3) Proposed UX contract

### 3.1 Intent flow (interactive, blocking)

`run --intent ... --inputs ...` should:

1. Compute top candidates (existing GRU behavior).
2. For each candidate, run **pre-validation** against that candidate's runtime
   schema.
3. Display candidate list with status:
   - `OK` (schema-compatible)
   - `MISSING` (required keys missing)
   - `EXTRA` (additionalProperties violation)
4. Ask for confirmation as today.
5. After choice, execute with predictable payload handling mode (see 3.2).

### 3.2 Payload handling mode

Introduce explicit mode (default conservative):

- `--payload-mode strict` (default): fail on extra fields.
- `--payload-mode project`: automatically project payload to selected target
  schema (drop unknown keys), warn once.

This keeps correctness-first defaults while enabling smoother agent automation
when needed.

---

## 4) Implementation phases

## Phase A — Pre-validation before selection (highest value, DONE)

### Goal

Eliminate late surprises by surfacing candidate/payload compatibility before
user choice.

### Files likely impacted

- `src/cli.ts`
- `src/routing/runtime-inputs.ts`
- `src/core/validator_test.ts` (or new tests)
- `src/core/executor_test.ts` (if schema validation flow is wired there)

### Steps

1. Extract a reusable helper: `validateRuntimeInputsForGraph(graph, payload)`
   returning normalized issues.
2. During `--intent` candidate generation, build subgraph per candidate and run
   helper.
3. Extend candidate output lines with compatibility summary.
4. Keep current confirm prompt semantics unchanged.

### Acceptance criteria

- Candidate list includes compatibility status for each option.
- If all candidates invalid, user sees why before choosing.
- No regression in existing `--target` behavior.

---

## Phase B — Payload mode explicitness (PENDING)

### Goal

Make strict vs projected payload behavior intentional and visible.

### Files likely impacted

- `src/cli.ts`
- `src/routing/runtime-inputs.ts`
- `src/core/executor.ts` (if projection applied at execution boundary)
- `src/*_test.ts`

### Steps

1. Add CLI option `--payload-mode <strict|project>`.
2. Implement schema-based payload projector (deterministic, no coercion by
   default).
3. In `project` mode, print one-line warning with dropped keys.
4. In `strict` mode, keep current AJV failure behavior.

### Acceptance criteria

- `strict` reproduces current safety behavior.
- `project` executes same command with reduced friction for intent-selected
  targets.

---

## Phase C — Better machine-readable output for agents (DELIVERED with machine-first revision)

### Goal

Make agent orchestration robust without brittle text parsing.

### Files likely impacted

- `src/cli.ts`
- `src/core/types.ts` (if introduced)
- `src/*_test.ts`

### Steps

1. Keep JSONL machine-readable output as default (no extra flag).
2. Keep human-readable mode opt-in via `--human`.
3. Include stable keys (`candidate_id`, `target`, `confidence`, `validation`) in
   `intent_candidate` events.

### Acceptance criteria

- Agent can parse candidates without regex against terminal text.
- Interactive mode remains unchanged in default machine-first flow.

---

## 5) Risks and trade-offs

1. **Complexity creep**: avoid overdesign (no full workflow engine).
2. **Silent data loss in `project` mode**: must always log dropped keys.
3. **Schema conflict edge-cases**: candidate subgraphs may have heterogeneous
   schemas; report explicitly.

---

## 6) Minimal test matrix

1. Intent + payload valid for candidate #1 → confirm #1 → executes.
2. Intent + payload invalid for #1 but valid for #2 → list shows this before
   choice.
3. `strict` with extra fields → fails with clear errors.
4. `project` with extra fields → warns + executes.
5. All candidates invalid → reasons shown, no opaque failure.

---

## 7) My AX verdict (agent-side)

What already works well:

- GRU scoring + top-3 + `none` is a good interaction model.
- Blocking confirmation is acceptable and useful when routing uncertainty
  exists.

What blocks fluency today:

- Validation timing and schema mismatch handling are the core friction points.

If we ship the next thing, it should be:

- **Phase B (payload-mode strict|project)**.

It gives the next UX gain with bounded implementation risk.

---

## 8) Suggested next action

Implement Phase B next, then rerun the same scenario:

`run demo-vault --intent "follow up deals older than 10 days" --inputs '{...}'`

Expected improvement:

- no post-selection surprise,
- clearer choice quality,
- better agent confidence at decision time.
