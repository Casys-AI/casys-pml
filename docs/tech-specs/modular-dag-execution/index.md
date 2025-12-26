# Tech-Spec: Modular DAG Code Execution

**Created:** 2025-12-26
**Updated:** 2025-12-26
**Status:** Ready for Development
**Author:** Erwan / Claude

---

## Overview

### Problem Statement

The current PML system executes agent code as a monolithic sandbox block, which limits:

1. **SHGAT Learning** - Cannot observe granular operations (filter, map, reduce) for pattern learning
2. **HIL Validation** - Either too many or too few validation checkpoints
3. **Checkpointing** - Cannot resume execution mid-workflow
4. **Parallelism** - Missed opportunities for parallel execution of independent operations

### Solution

**Phase 1 (MVP):** Detect JS operations and represent them as `code:*` pseudo-tools in the DAG. Execute code as-is, trace only the operation names for SHGAT.

**Phase 2+ (Future):** Implement DAG fusion for performance optimization.

| Phase | What | Complexity |
|-------|------|------------|
| **Phase 1** | Detection + Tracing | Simple |
| **Phase 2+** | DAG Fusion | Complex (deferred) |

### Scope

**In Scope (Phase 1):**
- Detect JS operations via SWC parsing (filter, map, reduce, etc.)
- Create pseudo-tools with `code:` prefix convention
- Auto-classify pure operations to bypass HIL
- Generate operation traces for SHGAT learning

**Deferred to Phase 2+:**
- DAG optimizer for task fusion
- Two-level DAG architecture (logical vs physical)

**Out of Scope:**
- Loop unrolling (while, for with dynamic conditions)
- eval/Function code generation
- External module imports in code tasks

---

## Key Technical Decisions

> These decisions were made after discussing the 4 main technical challenges.

### Decision 1: Scope Capture → BYPASSED

**Problem:** Callbacks can reference external variables (`threshold` in `u => u.score > threshold`).

**Decision:** Execute original code as-is, trace only operation names.

```typescript
// SHGAT learns:
executedPath = ["code:filter", "code:map", "code:reduce"]

// SHGAT does NOT learn:
// - Variable names (threshold vs limit)
// - Concrete values (100 vs 200)
// - Callback content (u => u.active)
```

**Impact:** No scope analysis needed. No variable serialization. Simple.

### Decision 2: Code Extraction → Span Slicing

**Problem:** SWC gives AST, not source code.

**Decision:** Use SWC spans to extract original code.

```typescript
// SWC provides: span: { start: 45, end: 72 }
const code = originalCode.substring(span.start, span.end);
// Result: "users.filter(u => u.active)"
```

**Impact:** Simple, faithful to original code.

### Decision 3: DAG Fusion → DEFERRED Phase 2+

**Problem:** Fusing N tasks into 1 is complex.

**Decision:** Phase 1 executes each operation as separate task. Measure overhead first.

| Without Fusion | With Fusion |
|----------------|-------------|
| More layers, more checkpoints | Fewer layers |
| Better debugging | Less granular |
| SHGAT traces identical | SHGAT traces identical |

**Impact:** No `dag-optimizer.ts` needed Phase 1. Simpler implementation.

### Decision 4: Executor → Reuse `code_execution`

**Problem:** How to execute `code:*` tasks?

**Decision:** Reuse existing `code_execution` type and `executeCodeTask()`.

```typescript
// Task generated:
{
  type: "code_execution",  // ← Existing type!
  tool: "code:filter",
  code: "users.filter(u => u.active)",
  sandboxConfig: { permissionSet: "minimal" }
}
// Routed to existing executeCodeTask() - zero new code
```

**Impact:** Zero executor changes.

---

## Context for Development

### Codebase Patterns

| File | Purpose | Phase 1 Changes |
|------|---------|-----------------|
| `src/capabilities/static-structure-builder.ts` | SWC AST parsing | Add array operation detection |
| `src/dag/static-to-dag-converter.ts` | Convert AST to DAG | Generate `code:*` tasks |
| `src/dag/execution/task-router.ts` | Route tasks to executors | Extend `isSafeToFail()` |
| `src/dag/pure-operations.ts` | **NEW** | Pure operation registry |

### Files to Reference

**Design Documents (this folder):**
- [impact-analysis.md](./impact-analysis.md) - Detailed code impact analysis
- [swc-static-structure-detection.md](./swc-static-structure-detection.md) - Current SWC detection patterns
- [parseable-code-patterns.md](./parseable-code-patterns.md) - All detectable JS patterns
- [modular-operations-implementation.md](./modular-operations-implementation.md) - Pseudo-tools implementation
- [pure-operations-permissions.md](./pure-operations-permissions.md) - HIL bypass for pure ops
- [two-level-dag-architecture.md](./two-level-dag-architecture.md) - Logical vs Physical DAG (Phase 2+)
- [shgat-learning-and-dag-edges.md](./shgat-learning-and-dag-edges.md) - Learning impact
- [modular-code-execution.md](./modular-code-execution.md) - Examples

---

## Implementation Plan

### Phase 1: MVP (Priority 1)

**Goal:** Detect operations, execute as-is, trace for SHGAT.

#### Task 1.1: Array Operation Detection

Extend `StaticStructureBuilder.handleCallExpression()`:

```typescript
// Detect array methods
const TRACKED_METHODS = ["filter", "map", "reduce", "flatMap", "find",
                         "findIndex", "some", "every", "sort", "slice"];

if (callee.type === "MemberExpression") {
  const methodName = callee.property?.value;
  if (TRACKED_METHODS.includes(methodName)) {
    const code = originalCode.substring(node.span.start, node.span.end);
    nodes.push({
      id: this.generateNodeId("task"),
      type: "task",
      tool: `code:${methodName}`,
      code,  // ← Original code via span
      position,
      parentScope,
    });
  }
}
```

#### Task 1.2: Pure Operations Registry

Create `src/dag/pure-operations.ts`:

```typescript
export const PURE_OPERATIONS = [
  // Array
  "code:filter", "code:map", "code:reduce", "code:flatMap",
  "code:find", "code:findIndex", "code:some", "code:every",
  "code:sort", "code:slice", "code:concat", "code:join",
  // String
  "code:split", "code:replace", "code:trim",
  "code:toLowerCase", "code:toUpperCase",
  // Object
  "code:Object.keys", "code:Object.values", "code:Object.entries",
  // JSON
  "code:JSON.parse", "code:JSON.stringify",
] as const;

export function isPureOperation(toolId: string): boolean {
  return PURE_OPERATIONS.includes(toolId as typeof PURE_OPERATIONS[number]);
}

export function isCodeOperation(toolId: string): boolean {
  return toolId.startsWith("code:");
}
```

#### Task 1.3: Extend isSafeToFail()

In `src/dag/execution/task-router.ts`:

```typescript
import { isPureOperation, isCodeOperation } from "../pure-operations.ts";

export function isSafeToFail(task: Task): boolean {
  // Existing: code_execution with minimal permissions
  if (task.type === "code_execution") {
    const permSet = task.sandboxConfig?.permissionSet ?? "minimal";
    if (permSet === "minimal") return true;
  }

  // NEW: Pure operations are always safe-to-fail
  if (isCodeOperation(task.tool) && isPureOperation(task.tool)) {
    return true;
  }

  return false;
}
```

#### Task 1.4: DAG Converter Update

In `src/dag/static-to-dag-converter.ts`, update `nodeToTask()`:

```typescript
case "task":
  // Handle code:* operations
  if (node.tool.startsWith("code:")) {
    return {
      id: taskId,
      tool: node.tool,
      type: "code_execution",
      code: node.code,  // ← From span extraction
      arguments: {},
      dependsOn: [],
      sandboxConfig: { permissionSet: "minimal" },
      metadata: { pure: isPureOperation(node.tool) },
    };
  }
  // ... existing MCP tool handling
```

#### Task 1.5: Unit Tests

```typescript
Deno.test("detects filter operation", async () => {
  const builder = new StaticStructureBuilder(db);
  const structure = await builder.buildStaticStructure(
    `users.filter(u => u.active)`
  );
  assertEquals(structure.nodes[0].tool, "code:filter");
});

Deno.test("isPureOperation returns true for code:filter", () => {
  assertEquals(isPureOperation("code:filter"), true);
  assertEquals(isPureOperation("filesystem:read"), false);
});

Deno.test("isSafeToFail returns true for pure operations", () => {
  const task = { tool: "code:filter", type: "code_execution" };
  assertEquals(isSafeToFail(task), true);
});
```

---

### Phase 2+: DAG Fusion (Deferred)

**Goal:** Fuse sequential pure operations for performance.

> Only implement after measuring Phase 1 overhead. May not be necessary.

- [ ] Implement `canFuseTasks(tasks: Task[]): boolean`
- [ ] Implement `fuseTasks(tasks: Task[]): Task`
- [ ] Implement `optimizeDAG(logical: DAG): OptimizedDAG`
- [ ] Generate logical traces from fused execution

---

## Acceptance Criteria

### Phase 1

| AC | Description | Test |
|----|-------------|------|
| **AC 1.1** | `users.filter(u => u.active).map(u => u.name)` → DAG with `code:filter`, `code:map` | Unit |
| **AC 1.2** | `code:filter` task executes and returns filtered array | Integration |
| **AC 1.3** | `executedPath` contains `["code:filter", "code:map"]` | Integration |
| **AC 1.4** | `isSafeToFail(code:filter)` returns `true` | Unit |
| **AC 1.5** | Layer with only pure ops skips HIL validation | Integration |

---

## Estimation

| Task | Complexity | Time |
|------|------------|------|
| Task 1.1: Detection | Medium | 1 day |
| Task 1.2: Pure ops registry | Simple | 2 hours |
| Task 1.3: isSafeToFail | Simple | 1 hour |
| Task 1.4: DAG converter | Simple | 2 hours |
| Task 1.5: Tests | Medium | 1 day |
| **Total Phase 1** | | **2-3 days** |

---

## Quick Reference

### Pseudo-Tool Naming

```
code:<operation>

Examples:
- code:filter
- code:map
- code:reduce
- code:Object.keys
- code:JSON.parse
```

### Task Structure

```typescript
{
  id: "task_c1",
  type: "code_execution",
  tool: "code:filter",
  code: "users.filter(u => u.active)",  // ← Original code via span
  arguments: {},
  dependsOn: ["task_n1"],
  sandboxConfig: { permissionSet: "minimal" },
  metadata: { pure: true }
}
```

### Detection Flow

```
Original Code
     │
     ▼
┌─────────────────────────────────┐
│  StaticStructureBuilder         │
│  handleCallExpression()         │
│  - Detect array methods         │
│  - Extract code via span        │
│  - Generate tool: "code:filter" │
└─────────────────┬───────────────┘
                  │
                  ▼
┌─────────────────────────────────┐
│  static-to-dag-converter        │
│  - type: "code_execution"       │
│  - code: original via span      │
│  - metadata.pure: true          │
└─────────────────┬───────────────┘
                  │
                  ▼
┌─────────────────────────────────┐
│  controlled-executor            │
│  - executeCodeTask() (existing) │
│  - isSafeToFail() → true        │
│  - HIL validation skipped       │
└─────────────────┬───────────────┘
                  │
                  ▼
┌─────────────────────────────────┐
│  SHGAT Learning                 │
│  executedPath: ["code:filter"]  │
│  (operation only, not content)  │
└─────────────────────────────────┘
```
