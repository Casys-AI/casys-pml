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
- [ ] Server restart needed to load new code
- [ ] Tests to verify fix in production

---

## Bug 2: Loop Card Not Displaying

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

### Investigation Points

#### A. Static Structure - Loop Detection
**File**: `src/capabilities/static-structure/ast-handlers.ts`

- [ ] Verify `handleForOfStatement` creates loop node correctly
- [ ] Check if `loopId` is passed to body processing via `ctx.findNodes(..., loopId)`
- [ ] Verify nodes inside loop have `parentScope = loopId`

#### B. Edge Generation
**File**: `src/capabilities/static-structure/edge-generators.ts`

- [ ] Verify `generateLoopEdges()` is called in `generateAllEdges()`
- [ ] Check if `loop_body` edges are created: `{ from: loopId, to: firstBodyNode, type: "loop_body" }`
- [ ] Verify `parentScope` isn't stripped before edge generation

#### C. DAG Converter - Loop Membership
**File**: `src/dag/static-to-dag-converter.ts`

- [ ] Verify Phase 0 builds `loopMembership` map from `loop_body` edges
- [ ] Check if `nodeToTask()` receives `loopInfo` parameter
- [ ] Verify task metadata includes `loopId`, `loopType`, `loopCondition`

#### D. Execute Handler - Iteration Counting
**File**: `src/mcp/handlers/execute-handler.ts`

- [ ] Verify `toolCallCounts` is populated from `executorContext.traces`
- [ ] Check if `loopIteration` is set on taskResults for tasks with `loopId`
- [ ] Verify traces contain multiple `tool_start` events for loop iterations

#### E. Frontend - TraceTimeline
**File**: `src/web/components/ui/molecules/TraceTimeline.tsx`

- [ ] Verify `groupTasksByLoop()` groups tasks by `loopId`
- [ ] Check if `LoopTaskCard` is imported and rendered
- [ ] Verify `TaskResult` interface has loop fields

---

## Bug 3: args.xxx Undefined at Execution

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

### Investigation Points
- [ ] Check `parametersSchema` generation in `transformLiteralsToArgs()`
- [ ] Verify extracted literals are stored with capability
- [ ] Check if default args are injected at execution time
- [ ] Review `WorkerBridge.execute()` context injection

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
