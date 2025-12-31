# Tech Spec: Loop Abstraction Bugs Investigation

**Date**: 2025-12-31
**Status**: Investigation
**Related commits**: `5cb95123`, `6beb6eca`

## Context

Loop abstraction was implemented to:
1. Detect loops in static analysis (for, while, for...of, for...in, do...while)
2. Create `loop_body` edges in static structure
3. Propagate `loopId` through DAG converter to task metadata
4. Count iterations from WorkerBridge traces
5. Display `LoopTaskCard` in TraceTimeline with iteration badge

## Bug 1: Variable Shadowing in Code Transformer

### Symptom
```typescript
const file = "README.md";  // → literalBindings["file"]
for (const file of files) {  // Loop variable shadows outer
  mcp.read({ path: file });  // Was transformed to: args.file (WRONG!)
}
```

### Root Cause
`findAllUsages()` in `code-transformer.ts` didn't track variable scopes. It replaced ALL usages of a variable name in `literalNames`, even if that variable was shadowed by a loop variable.

### Fix Applied (commit `6beb6eca`)
Added `detectShadowedVariables()` to track scope-creating constructs:
- `ForOfStatement`, `ForInStatement`, `ForStatement`
- `ArrowFunctionExpression`, `FunctionExpression`, `FunctionDeclaration`
- `CatchClause`

Shadowed names are propagated down the AST and excluded from replacement.

### Status
- [x] Fix implemented
- [x] Server restarted
- [ ] **NOT RESOLVED** - Bug still occurs after restart, needs further investigation
- [ ] Tests to verify fix in production

---

## Bug 2: Loop Card Not Displaying ✅ FIXED

### Symptom
Code with loops shows standard layer view, no `LoopTaskCard`:
```
Layer 0: read_file (71ms)
Layer 1: split (23ms)
```

Expected:
```
🔄 3x for...of (file of files)  245ms
  └─ read_file
```

### Root Causes Identified
1. **`parentScope` was stripped** in `static-structure-builder.ts:268-271`
2. **Only one `loop_body` edge** created (to first body node only)
3. **Incomplete propagation** of `loopMembership` via edge traversal

### Fix Applied
Instead of relying on `loop_body` edges for membership, use `parentScope` directly:

1. **`src/capabilities/types/static-analysis.ts`**:
   - Added `parentScope?: string` to all `StaticStructureNode` variants

2. **`src/capabilities/static-structure-builder.ts`**:
   - Stop stripping `parentScope` when converting to external nodes

3. **`src/dag/static-to-dag-converter.ts`**:
   - Phase 0 now uses `parentScope` for loop membership (not `loop_body` edges)
   - Simpler and more accurate: `if (node.parentScope === loop.id)`

### Investigation Points (completed)

#### A. Static Structure - Loop Detection
**File**: `src/capabilities/static-structure/ast-handlers.ts`

- [x] Verify `handleForOfStatement` creates loop node correctly - OK
- [x] Check if `loopId` is passed to body processing via `ctx.findNodes(..., loopId)` - OK
- [x] Verify nodes inside loop have `parentScope = loopId` - OK

#### B. Edge Generation
**File**: `src/capabilities/static-structure/edge-generators.ts`

- [x] Verify `generateLoopEdges()` is called in `generateAllEdges()` - OK
- [x] Check if `loop_body` edges are created - Only to first node (by design for SHGAT)
- [x] Verify `parentScope` isn't stripped before edge generation - **WAS STRIPPED** → Fixed

#### C. DAG Converter - Loop Membership
**File**: `src/dag/static-to-dag-converter.ts`

- [x] Verify Phase 0 builds `loopMembership` map - **INCOMPLETE** → Fixed with `parentScope`
- [x] Check if `nodeToTask()` receives `loopInfo` parameter - OK
- [x] Verify task metadata includes `loopId`, `loopType`, `loopCondition` - OK

#### D. Execute Handler - Iteration Counting
**File**: `src/mcp/handlers/execute-handler.ts`

- [ ] Verify `toolCallCounts` is populated from `executorContext.traces`
- [ ] Check if `loopIteration` is set on taskResults for tasks with `loopId`
- [ ] Verify traces contain multiple `tool_start` events for loop iterations
- Note: D section is frontend/runtime tracing, separate from the structural fix above

#### E. Frontend - TraceTimeline
**File**: `src/web/components/ui/molecules/TraceTimeline.tsx`

- [ ] Verify `groupTasksByLoop()` groups tasks by `loopId`
- [ ] Check if `LoopTaskCard` is imported and rendered
- [ ] Verify `TaskResult` interface has loop fields

---

## Bug 3: args.xxx Undefined at Execution ✅ FIXED

### Symptom
```
MCP error -32602: Invalid arguments for tool read_file:
  path: expected string, received undefined
```

Saved capability:
```typescript
for (const f of args.files) {  // args.files = undefined!
  await mcp.filesystem.read_file({ path: f });
  args.results.push(...);  // args.results = undefined!
}
```

### Root Cause
Literal arrays are correctly parameterized:
- `const files = [...]` → `args.files`
- `const results = []` → `args.results`

But when the capability executes, these args aren't passed because:
1. Direct mode execution doesn't provide args
2. The extracted literals should be passed as default args

### Fix Applied
Added `setExecutionArgs()` method to `ControlledExecutor`:

1. **`src/dag/controlled-executor.ts`**:
   - Added `private executionArgs: Record<string, unknown> = {}`
   - Added `setExecutionArgs(args)` setter method
   - In `executeCodeTaskWithWorkerBridge()`, inject `args` into `executionContext`

2. **`src/mcp/handlers/execute-handler.ts`**:
   - In `executeAcceptedSuggestion()`, call `controlledExecutor.setExecutionArgs(mergedArgs)` before execution

Now when code tasks execute, `args` is available:
```typescript
// executionContext.args = mergedArgs
// In Worker: const args = {...}
for (const f of args.files) {  // ✅ args.files = ["file1.txt", "file2.txt"]
  await mcp.filesystem.read_file({ path: f });
}
```

### Investigation Points (completed)
- [x] Check `parametersSchema` generation in `transformLiteralsToArgs()` - OK
- [x] Verify extracted literals are stored with capability - OK
- [x] Check if default args are injected at execution time - **MISSING** → Fixed
- [x] Review `WorkerBridge.execute()` context injection - OK (supports context)

---

## Bug 4: Missing `push` Operation in Trace — BY DESIGN ✅

### Symptom
Execution trace shows only 2 tasks when there should be 3:
```
Layer 0: read_file (71ms)
Layer 1: split (23ms)
```

Expected (for code with `results.push(...)`):
```
Layer 0: read_file (71ms)
Layer 1: split (23ms)
Layer 2: push (Xms)
```

### Root Cause Analysis
`push` is intentionally NOT traced. In `static-structure-builder.ts:517-527`, only **pure** array methods are detected:

```typescript
const arrayOps = [
  "filter", "map", "reduce", "flatMap", "find", "findIndex",
  "some", "every", "sort", "reverse", "slice", "concat",
  "join", "includes", "indexOf", "lastIndexOf"
];
```

Mutating methods (`push`, `pop`, `shift`, `unshift`, `splice`) are excluded.

### Why This is By Design

1. **Consistency with `PURE_OPERATIONS`** (`pure-operations.ts`):
   - Pure operations can bypass HIL validation (no side-effects)
   - `push` mutates the array in-place → not pure

2. **HIL Control Gap**:
   - If we trace `push` as a DAG node, we'd show a "dangerous" mutation
   - But we can't pause BEFORE it without **Phase 4: Per-Task HIL**
   - Tracing something we can't control is inconsistent

3. **Current Trace Semantics**:
   - Trace shows data flow: input → transform → output
   - Side-effects (mutations) are not part of the data flow model

### Future Consideration

When **Phase 4: Per-Task HIL** is implemented (see `tech-spec-hil-permission-escalation-fix.md`):
- Tasks with `approvalMode: "hil"` can pause BEFORE execution
- At that point, we could add `MUTATING_ARRAY_METHODS` to trace
- And mark them as requiring approval before mutation

### Status
- [x] Investigated
- [x] **BY DESIGN** - Mutating operations not traced until Per-Task HIL exists

---

## Test Plan

### Unit Tests Needed
1. `code-transformer.test.ts`: Variable shadowing in loops
2. `static-structure-builder.test.ts`: Loop node creation with parentScope
3. `edge-generators.test.ts`: loop_body edge generation
4. `static-to-dag-converter.test.ts`: loopId propagation to task metadata

### Integration Tests Needed
1. Execute code with loop → verify LoopTaskCard displays
2. Execute code with shadowed variable → verify no args.xxx replacement
3. Execute capability with literal arrays → verify args are passed

---

## Files Modified

| File | Change |
|------|--------|
| `src/capabilities/code-transformer.ts` | Added `detectShadowedVariables()`, scope tracking |
| `src/capabilities/static-structure/edge-generators.ts` | Added `findChainRoot()` for fusion fix |
| `src/dag/static-to-dag-converter.ts` | Added loop membership map, loopInfo propagation |
| `src/mcp/handlers/execute-handler.ts` | Added iteration counting from traces |
| `src/capabilities/types/execution.ts` | Added loop fields to TraceTaskResult |
| `src/graphrag/types/dag.ts` | Added loop metadata to Task |
| `src/web/components/ui/atoms/LoopTaskCard.tsx` | NEW - Loop card component |
| `src/web/components/ui/molecules/TraceTimeline.tsx` | Added groupTasksByLoop, LoopTaskCard rendering |

---

## Next Steps

1. **Restart PML server** to load new code
2. **Add debug logging** to trace loop metadata flow
3. **Create minimal repro** for each bug
4. **Add unit tests** for shadowing and loop detection
