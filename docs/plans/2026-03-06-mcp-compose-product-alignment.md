# mcp-compose Product Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align `lib/mcp-compose` with the intended product story: sync DSL is a dev/integrator primitive, not the primary end-user authoring surface.

**Architecture:** Keep `mcp-compose` as a narrow composition primitive (`collector -> composer -> renderer`) while adding explicit product-facing docs that define who authors orchestration, what is inferred vs explicit, and where the future UX layer belongs. Do docs/boundary work first, then only introduce code/API changes that support the documented contract.

**Tech Stack:** Deno, TypeScript, markdown docs, co-located AX contracts/readmes, repo docs under `docs/plans/`

---

### Task 1: Write the product/ownership clarification doc

**Files:**
- Create: `lib/mcp-compose/PRD.md`
- Reference: `lib/mcp-compose/README.md`
- Reference: `lib/mcp-compose/SPEC.md`

**Step 1: Write the failing expectation as a doc checklist**

Define the missing questions the repo must answer:
- Who writes `sync` today?
- Who should write it in the target product?
- Is dashboard authoring manual, inferred, or hybrid?
- What is the boundary between `mcp-compose` and the future UX/product layer?

**Step 2: Draft `PRD.md` with these sections**

```md
# mcp-compose PRD

## Problem
## Target users
## Non-users
## Current product truth (v1)
## Target UX (later)
## What users should never have to hand-author
## What remains explicit in v1
## Boundary with future host/product layer
## Success criteria
## Non-goals
```

**Step 3: Make the key decision explicit**

State clearly:
- `mcp-compose` v1 is **dev-first / agent-first**
- `sync` is authored by integrators/agents today
- end-user natural-language/intention-first dashboard authoring belongs to a higher layer, not this library

**Step 4: Review for ambiguity**

Remove any wording that implies end-users are expected to write orchestration JSON/TS by hand.

**Step 5: Commit**

```bash
git add lib/mcp-compose/PRD.md
git commit -m "docs(mcp-compose): add product boundary PRD"
```

### Task 2: Align README with the PRD

**Files:**
- Modify: `lib/mcp-compose/README.md`
- Reference: `lib/mcp-compose/PRD.md`

**Step 1: Add a short positioning block near the top**

Add explicit wording like:

```md
## Positioning

`mcp-compose` is a composition primitive for developers and agents.
It does not yet provide an end-user dashboard builder.
If you want intent-first dashboard generation, build that on top of this library.
```

**Step 2: Rewrite any misleading phrasing**

Replace soft/ambiguous lines that read like product UX promises with precise language about current capability.

**Step 3: Keep the quick start technical**

Do not turn README into marketing. Keep examples explicit and code-level.

**Step 4: Run a grep check for confusing phrases**

Run:

```bash
rg -n "without writing any HTML|dashboard|orchestration|sync" lib/mcp-compose/README.md lib/mcp-compose/PRD.md
```

Expected: README and PRD agree on who authors orchestration.

**Step 5: Commit**

```bash
git add lib/mcp-compose/README.md lib/mcp-compose/PRD.md
git commit -m "docs(mcp-compose): align README with product positioning"
```

### Task 3: Align SPEC with the actual boundary

**Files:**
- Modify: `lib/mcp-compose/SPEC.md`
- Reference: `lib/mcp-compose/PRD.md`

**Step 1: Add a boundary section**

Add:

```md
## Product Boundary

This spec describes the composition primitive.
It does not define a no-code or end-user dashboard builder.
Orchestration authoring is assumed to happen upstream.
```

**Step 2: Mark future UX ideas as future**

Any inferred/automatic sync behavior must be labeled as future product-layer work, not current library behavior.

**Step 3: Ensure terminology is stable**

Use the same terms consistently:
- end-user
- agent/integrator
- orchestration author
- composition primitive
- product layer / host layer

**Step 4: Review examples**

All examples must read as integrator-authored examples, not end-user UX flows.

**Step 5: Commit**

```bash
git add lib/mcp-compose/SPEC.md lib/mcp-compose/PRD.md
git commit -m "docs(mcp-compose): clarify spec boundary vs product layer"
```

### Task 4: Add a machine-checkable architecture note in-source

**Files:**
- Modify: `lib/mcp-compose/src/contract.md`
- Modify: `lib/mcp-compose/src/readme.md`
- Optional: `lib/mcp-compose/src/architecture_test.ts`

**Step 1: Update `src/contract.md`**

Add an invariant like:

```md
- `mcp-compose` consumes explicit orchestration; it does not infer product intent from natural language.
- Product-facing intent interpretation belongs upstream from `src/`.
```

**Step 2: Update `src/readme.md`**

Mention that `src/` is the execution/composition pipeline, not the product UX layer.

**Step 3: If needed, extend `architecture_test.ts`**

Only if useful, assert existence of top-level docs that explain boundaries. Do not add brittle content tests.

**Step 4: Run tests**

```bash
cd lib/mcp-compose
~/.deno/bin/deno task test
```

Expected: PASS

**Step 5: Commit**

```bash
git add lib/mcp-compose/src/readme.md lib/mcp-compose/src/contract.md lib/mcp-compose/src/architecture_test.ts
git commit -m "docs(mcp-compose): encode product boundary in src contracts"
```

### Task 5: Decide whether a higher-level orchestration DSL belongs here at all

**Files:**
- Create: `lib/mcp-compose/docs/decision-records/0001-orchestration-authoring-boundary.md`
- Reference: `lib/mcp-compose/PRD.md`

**Step 1: Write the decision record**

Capture three options:
1. Keep orchestration authoring in `mcp-compose`
2. Add a friendlier agent-facing DSL in this repo
3. Keep `mcp-compose` primitive-only and build authoring elsewhere

**Step 2: Evaluate tradeoffs**

For each option, score:
- conceptual clarity
- API stability risk
- product confusion risk
- implementation cost
- AX quality

**Step 3: Recommend one path**

Default recommendation unless contradicted by new requirements:
- keep `mcp-compose` primitive-only
- put intent-first authoring in a higher layer

**Step 4: Cross-link docs**

Link the ADR from `PRD.md` and `README.md` if kept.

**Step 5: Commit**

```bash
git add lib/mcp-compose/docs/decision-records/0001-orchestration-authoring-boundary.md lib/mcp-compose/PRD.md lib/mcp-compose/README.md
git commit -m "docs(mcp-compose): add orchestration authoring boundary ADR"
```

### Task 6: Only after docs, decide whether to change code/API

**Files:**
- Possibly modify: `lib/mcp-compose/src/types/orchestration.ts`
- Possibly modify: `lib/mcp-compose/README.md`
- Possibly add tests near affected slices

**Step 1: Freeze the product statement first**

No API changes before docs are approved.

**Step 2: Identify actual friction**

List what is painful today for integrators/agents:
- verbosity of sync rules
- event naming ambiguity
- shared context extraction ergonomics
- lack of presets/templates

**Step 3: If a code change is justified, write failing tests first**

Examples:
- composer preset behavior
- sync shorthand parsing
- default layout behavior

**Step 4: Implement smallest possible improvement**

Do not add a pseudo-product layer into `src/` unless the boundary doc explicitly allows it.

**Step 5: Re-run tests**

```bash
cd lib/mcp-compose
~/.deno/bin/deno task test
```

Expected: PASS

**Step 6: Commit**

```bash
git add lib/mcp-compose
git commit -m "feat(mcp-compose): improve orchestration ergonomics within product boundary"
```

---

## Recommended execution order

1. Task 1 — PRD
2. Task 2 — README alignment
3. Task 3 — SPEC alignment
4. Task 4 — in-source boundary contract
5. Task 5 — ADR on authoring boundary
6. Task 6 — optional code changes only after docs are accepted
