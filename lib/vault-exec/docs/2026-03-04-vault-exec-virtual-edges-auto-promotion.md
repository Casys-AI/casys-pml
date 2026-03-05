# Vault-Exec Virtual Edges Auto-Promotion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let `vault-exec run --intent` learn relationships between previously unlinked notes via virtual edges, and auto-promote strong edges without any manual command.

**Architecture:** Keep markdown notes immutable by default; learn edges in KV (`virtual_edges`) from existing feedback loop (`--confirm`: 1 positive + rejected negatives). Use confidence scoring + decay to promote stable edges. Execute intents on an augmented graph (real edges + promoted virtual edges) while preserving DAG safety.

**Tech Stack:** Deno/TypeScript, Deno KV (`VaultKV`), Cliffy CLI, existing GNN+GRU pipeline, `deno test`.

---

### Task 1: Define Virtual Edge Domain Types

**Files:**
- Create: `lib/vault-exec/src/links/types.ts`
- Modify: `lib/vault-exec/src/db/types.ts`

**Step 1: Write the failing test for type usage in DB interface**

Create `lib/vault-exec/src/links/types_test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert";
import type { VirtualEdgeUpdate } from "./types.ts";

Deno.test("VirtualEdgeUpdate has signed delta", () => {
  const u: VirtualEdgeUpdate = {
    source: "Employees",
    target: "Hiring Need",
    scoreDelta: -1,
    reason: "rejected_candidate",
  };
  assertEquals(u.scoreDelta < 0, true);
});
```

**Step 2: Run test to verify fail**

Run: `cd lib/vault-exec && deno test --allow-read --allow-write --unstable-kv src/links/types_test.ts`  
Expected: FAIL (module/type missing)

**Step 3: Add domain types and DB interface extensions**

Add `src/links/types.ts`:

```ts
export type VirtualEdgeStatus = "candidate" | "promoted" | "rejected";

export interface VirtualEdgeRow {
  source: string;
  target: string;
  score: number;
  support: number;
  rejects: number;
  status: VirtualEdgeStatus;
  promotedAt?: string;
  updatedAt: string;
}

export interface VirtualEdgeUpdate {
  source: string;
  target: string;
  scoreDelta: number;
  reason: "selected_path" | "rejected_candidate" | "execution_success" | "execution_failure";
}
```

Extend `IVaultStore` in `src/db/types.ts`:

```ts
upsertVirtualEdge(update: VirtualEdgeUpdate): Promise<VirtualEdgeRow>;
listVirtualEdges(status?: VirtualEdgeStatus): Promise<VirtualEdgeRow[]>;
applyVirtualEdgeDecay(factor: number): Promise<number>;
```

**Step 4: Run test to verify pass**

Run: `cd lib/vault-exec && deno test --allow-read --allow-write --unstable-kv src/links/types_test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add lib/vault-exec/src/links/types.ts lib/vault-exec/src/links/types_test.ts lib/vault-exec/src/db/types.ts
git commit -m "feat(vault-exec): add virtual edge domain types and store interface"
```

---

### Task 2: Implement Virtual Edge Storage in KV

**Files:**
- Modify: `lib/vault-exec/src/db/store-kv.ts`
- Modify: `lib/vault-exec/src/db/store-kv_test.ts`

**Step 1: Write failing tests for virtual edges**

Add tests in `store-kv_test.ts`:
- `upsertVirtualEdge creates row`
- `upsertVirtualEdge accumulates support/rejects`
- `listVirtualEdges filters by status`
- `applyVirtualEdgeDecay reduces absolute score`

**Step 2: Run failing tests**

Run:  
`cd lib/vault-exec && deno test --allow-read --allow-write --allow-env --unstable-kv src/db/store-kv_test.ts`
Expected: FAIL (methods not implemented)

**Step 3: Implement KV methods**

Use keys:
- `["vault","virtual_edges", source, target] -> VirtualEdgeRow`

Rules:
- `score += scoreDelta`
- `support += 1` on positive delta
- `rejects += 1` on negative delta
- `updatedAt = now`
- default `status = "candidate"` unless already promoted/rejected

Decay:
- Iterate prefix, `score *= factor`
- Keep sign
- Return row count updated

**Step 4: Re-run tests**

Run same test command; expected PASS.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/db/store-kv.ts lib/vault-exec/src/db/store-kv_test.ts
git commit -m "feat(vault-exec): persist virtual edges in KV store"
```

---

### Task 3: Add Promotion Policy Module

**Files:**
- Create: `lib/vault-exec/src/links/policy.ts`
- Create: `lib/vault-exec/src/links/policy_test.ts`

**Step 1: Write failing policy tests**

Cover:
- promote when thresholds met
- keep candidate below threshold
- reject when strongly negative
- idempotent for already promoted

**Step 2: Run fail**

Run:  
`cd lib/vault-exec && deno test --allow-read src/links/policy_test.ts`
Expected: FAIL

**Step 3: Implement policy**

```ts
export const PROMOTION = {
  minScore: 5,
  minSupport: 3,
  minSuccessRatio: 0.7,
  rejectScore: -4,
  decayFactor: 0.99,
} as const;
```

`nextStatus(row)`:
- if `row.status === "promoted"` -> keep
- if `row.score <= rejectScore` -> `rejected`
- if score/support/ratio pass -> `promoted`
- else `candidate`

**Step 4: Run tests**

Expected PASS.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/links/policy.ts lib/vault-exec/src/links/policy_test.ts
git commit -m "feat(vault-exec): add virtual edge promotion policy"
```

---

### Task 4: Build Feedback-to-Edge Updates

**Files:**
- Create: `lib/vault-exec/src/links/feedback.ts`
- Create: `lib/vault-exec/src/links/feedback_test.ts`

**Step 1: Write failing tests**

Inputs:
- selected beam path
- rejected beam paths

Assertions:
- sequential pairs become updates
- rejected pairs produce negative deltas
- self loops dropped

**Step 2: Run fail**

`cd lib/vault-exec && deno test --allow-read src/links/feedback_test.ts`

**Step 3: Implement mapping**

Rules:
- Convert `["A","B","C"]` => edges `A->B`, `B->C`
- Positive selected: `+1.0`
- Rejected candidate: `-0.7`
- If edge exists as real wikilink, skip update (avoid redundant promotion)

**Step 4: Run tests**

PASS expected.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/links/feedback.ts lib/vault-exec/src/links/feedback_test.ts
git commit -m "feat(vault-exec): derive virtual edge updates from confirm feedback"
```

---

### Task 5: Augment Execution Graph with Promoted Virtual Edges

**Files:**
- Modify: `lib/vault-exec/src/graph.ts`
- Create: `lib/vault-exec/src/graph_virtual_test.ts`

**Step 1: Write failing graph tests**

Cases:
- promoted edge included in extracted subgraph
- candidate/rejected edges excluded
- cycle created by virtual edge is ignored safely

**Step 2: Run fail**

`cd lib/vault-exec && deno test --allow-read src/graph_virtual_test.ts`

**Step 3: Implement**

Add helper:

```ts
export function withVirtualEdges(
  graph: VaultGraph,
  virtualEdges: Array<{ source: string; target: string }>,
): VaultGraph
```

Behavior:
- merge edges in same direction as existing deps
- keep only nodes that exist
- skip any virtual edge that would introduce cycle (use current cycle detection)

**Step 4: Run tests**

PASS expected.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/graph.ts lib/vault-exec/src/graph_virtual_test.ts
git commit -m "feat(vault-exec): overlay promoted virtual edges on DAG safely"
```

---

### Task 6: Wire Auto-Learning + Auto-Promotion into CLI Run

**Files:**
- Modify: `lib/vault-exec/src/cli.ts`
- Modify: `lib/vault-exec/src/db/types.ts` (if required by wiring)
- Test: `lib/vault-exec/src/integration_test.ts` (extend)

**Step 1: Write failing integration tests**

Add scenarios:
- confirm selection writes positive/negative virtual updates
- thresholds reached => status becomes promoted
- subsequent run uses promoted virtual edge in routing/execution graph

**Step 2: Run fail**

`cd lib/vault-exec && deno test --allow-read --allow-write --allow-env --unstable-kv src/integration_test.ts`

**Step 3: Implement minimal wiring**

In `run`:
- after candidate selection, call feedback mapper
- persist updates via `db.upsertVirtualEdge`
- evaluate policy and set status
- apply decay once per run
- load promoted edges before `extractSubgraph` and call `withVirtualEdges(...)`

No new CLI command. Promotion is automatic post-run.

**Step 4: Run tests**

Run full vault-exec suite:

`cd lib/vault-exec && deno test --allow-read --allow-write --allow-env --unstable-kv src/`

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/vault-exec/src/cli.ts lib/vault-exec/src/integration_test.ts lib/vault-exec/src/graph.ts
git commit -m "feat(vault-exec): auto-learn and auto-promote virtual edges during intent runs"
```

---

### Task 7: Observability + Notebook Visibility

**Files:**
- Modify: `lib/vault-exec/notebooks/05-topological-map.ipynb`
- Modify: `lib/vault-exec/notebooks/INDEX.md`

**Step 1: Add notebook query for virtual edges**

Show:
- count by status (`candidate/promoted/rejected`)
- top promoted edges by score/support

**Step 2: Run notebook execution check**

`IPYTHONDIR=/tmp/.ipython jupyter nbconvert --to notebook --execute --inplace lib/vault-exec/notebooks/05-topological-map.ipynb`

Expected: PASS, 0 notebook errors.

**Step 3: Commit**

```bash
git add lib/vault-exec/notebooks/05-topological-map.ipynb lib/vault-exec/notebooks/INDEX.md
git commit -m "docs(vault-exec): expose virtual-edge promotion signals in notebooks"
```

---

### Task 8: Safety Defaults and Regression Tests

**Files:**
- Create: `lib/vault-exec/src/links/safety_test.ts`
- Modify: `lib/vault-exec/src/cli.ts` (if needed)

**Step 1: Add tests for safeguards**

Safeguards:
- max promoted virtual edges per run (ex: 50)
- skip promotions for very short paths (`len < 2`)
- disallow promotion involving missing notes
- always keep `none` candidate path in confirm UI

**Step 2: Run fail then implement minimal guards**

Run targeted tests, implement, rerun.

**Step 3: Full regression**

`cd lib/vault-exec && deno test --allow-read --allow-write --allow-env --unstable-kv src/`

**Step 4: Commit**

```bash
git add lib/vault-exec/src/links/safety_test.ts lib/vault-exec/src/cli.ts
git commit -m "test(vault-exec): add safety rails for virtual-edge auto-promotion"
```

---

## Implementation Notes

- Use `@test-driven-development` for each task’s Red/Green cycle.
- Use `@systematic-debugging` if any notebook/kernel issue reappears.
- Keep score constants centralized in `src/links/policy.ts`.
- Do not write wikilinks into markdown in this feature; promotion is internal KV-only.

## Done Criteria

1. Intent runs with confirm feedback continuously update virtual edges.
2. Promoted edges influence next executions through augmented graph.
3. No manual promotion command required.
4. Existing behavior remains safe (acyclic execution, `none` option always present).
5. All `lib/vault-exec/src` tests pass; notebook 05 executes with zero errors.

---

Plan complete and saved to `lib/vault-exec/docs/2026-03-04-vault-exec-virtual-edges-auto-promotion.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
