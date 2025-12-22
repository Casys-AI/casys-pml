# Story 11.3: TD Error + PER Priority

Status: ready-for-dev

## Story

As a learning system,
I want to calculate TD error for PER priority,
So that SHGAT can sample and learn from surprising traces efficiently.

## Context & Background

**Epic 11: Learning from Execution Traces** implements a TD Error + PER + SHGAT learning system (DQN/Rainbow style). This story is the third step: calculating TD error as a signal for Prioritized Experience Replay (PER).

**Architecture Overview (2025-12-22):**

```
+---------------------------------------------------------------------------------+
|                     TD + PER + SHGAT (style DQN/Rainbow)                         |
+---------------------------------------------------------------------------------+
|                                                                                 |
|  1. EXECUTION -> TRACE                                                          |
|     workflow terminates -> execution_trace stored (Story 11.2)                   |
|                                                                                 |
|  2. TD ERROR (learning signal)                                                  |
|     td_error = actual_success - shgat.predictPathSuccess(path)                  |
|     -> If SHGAT predicts 0.9 and outcome = 0.0 -> td_error = -0.9 (surprise!)   |
|                                                                                 |
|  3. PER (replay priority)                                                       |
|     priority = |td_error|                                                       |
|     -> Surprising traces -> high priority -> sampled more often                 |
|                                                                                 |
|  4. SHGAT (the learning model) - Story 11.6                                     |
|     - Sample traces by PER priority                                             |
|     - Train attention weights on these traces                                   |
|     - Loss = td_error^2 (MSE on prediction vs actual)                           |
|                                                                                 |
+---------------------------------------------------------------------------------+
```

**Role of each component:**

| Component | Role | What it produces |
|-----------|------|------------------|
| **TD Error** | Learning signal | `|predicted - actual|` for PER |
| **PER** | Replay prioritization | Traces weighted by surprise |
| **SHGAT** | The model itself | Attention weights, prediction scores |

**DEPRECATIONS (2025-12-22):**

| Deprecated | Replaced by | Reason |
|----------|--------------|--------|
| `CapabilityLearning` structure | SHGAT weights | SHGAT learns directly from traces |
| `workflow_pattern.learning` column | `execution_trace.priority` + SHGAT | No intermediate stats |
| `updateLearningTD()` -> stats | `updatePriority()` -> PER only | TD error = signal for PER, not stats |
| `pathSuccessRate` calculated | SHGAT predicts directly | Network learns patterns |

**Previous Story Intelligence (11.1 - completed 2025-12-22):**
- Result tracing implemented in `worker-bridge.ts` and `code-generator.ts`
- `tool_end` and `capability_end` events now include `result` field
- `safeSerializeResult()` handles circular references
- 277 sandbox tests passing including 9 result tracing tests

**Important:** Story 11.2 (`execution_trace` table) is a **prerequisite** for this story. This story depends on:
- `ExecutionTraceStore` class with `saveTrace()`, `getTraces()`, `updatePriority()` methods
- `execution_trace.priority` column (FLOAT, default 0.5)

## Acceptance Criteria

1. **AC1:** `calculateTDError(shgat, trace)` function implemented:
   ```typescript
   async function calculateTDError(
     shgat: SHGAT,
     trace: { executedPath: string[]; success: boolean }
   ): Promise<number> {
     const predicted = await shgat.predictPathSuccess(trace.executedPath);
     const actual = trace.success ? 1.0 : 0.0;
     return actual - predicted;
   }
   ```

2. **AC2:** `SHGAT.predictPathSuccess(path)` method added to SHGAT class:
   ```typescript
   /**
    * Predict success probability for a given execution path
    * @param path - Array of node IDs representing the executed path
    * @returns Probability between 0 and 1
    */
   predictPathSuccess(path: string[]): number
   ```

3. **AC3:** `storeTraceWithPriority()` saves trace with `priority = |tdError|`:
   ```typescript
   async function storeTraceWithPriority(
     shgat: SHGAT,
     traceStore: ExecutionTraceStore,
     trace: ExecutionTrace
   ): Promise<void> {
     const tdError = await calculateTDError(shgat, trace);
     const priority = Math.abs(tdError);
     await traceStore.save({ ...trace, priority });
   }
   ```

4. **AC4:** **COLD START handling:** If SHGAT not yet trained (no capabilities registered), priority = 0.5 (neutral)

5. **AC5:** `ExecutionTraceStore.getHighPriorityTraces(limit)` for PER sampling (Story 11.6 prerequisite):
   ```typescript
   getHighPriorityTraces(limit: number): Promise<ExecutionTrace[]>
   ```

6. **AC6:** Tests: new path (SHGAT predicts ~0.5) + success -> priority ~= 0.5

7. **AC7:** Tests: path with SHGAT predict 0.9 + failure -> priority ~= 0.9

8. **AC8:** Tests: path with SHGAT predict 0.9 + success -> priority ~= 0.1

9. **AC9:** Tests: cold start (no capabilities) -> priority = 0.5

## Tasks / Subtasks

- [ ] **Task 1: Add predictPathSuccess to SHGAT** (AC: #2, #4)
  - [ ] 1.1 Add `predictPathSuccess(path: string[]): number` method to SHGAT class
  - [ ] 1.2 Implement path encoding: average embeddings of nodes in path
  - [ ] 1.3 Use forward pass to compute attention-weighted score
  - [ ] 1.4 Handle cold start: return 0.5 if no capabilities registered
  - [ ] 1.5 Add unit tests for predictPathSuccess

- [ ] **Task 2: Create per-priority.ts module** (AC: #1, #3)
  - [ ] 2.1 Create `src/capabilities/per-priority.ts`
  - [ ] 2.2 Implement `calculateTDError(shgat, trace)` function
  - [ ] 2.3 Implement `storeTraceWithPriority(shgat, traceStore, trace)` function
  - [ ] 2.4 Handle edge cases: null trace, missing path, SHGAT not ready
  - [ ] 2.5 Add JSDoc documentation with examples

- [ ] **Task 3: Add priority query methods to ExecutionTraceStore** (AC: #5)
  - [ ] 3.1 Add `getHighPriorityTraces(limit: number)` method
  - [ ] 3.2 Implement SQL: `ORDER BY priority DESC LIMIT $1`
  - [ ] 3.3 Add `updatePriority(traceId, priority)` method for post-training updates
  - [ ] 3.4 Add `sampleByPriority(limit, minPriority?)` with weighted sampling

- [ ] **Task 4: Write unit tests** (AC: #6, #7, #8, #9)
  - [ ] 4.1 Create `tests/unit/capabilities/per_priority_test.ts`
  - [ ] 4.2 Test: new path + success -> priority ~0.5
  - [ ] 4.3 Test: high confidence path + failure -> high priority
  - [ ] 4.4 Test: high confidence path + success -> low priority
  - [ ] 4.5 Test: cold start -> priority 0.5
  - [ ] 4.6 Test: empty path -> returns default priority

- [ ] **Task 5: Integration and validation**
  - [ ] 5.1 Run `deno check` for all modified files
  - [ ] 5.2 Run existing SHGAT tests to verify no regressions
  - [ ] 5.3 Add new tests to test suite

## Dev Notes

### Critical Implementation Details

**1. SHGAT.predictPathSuccess() Implementation**

```typescript
// In src/graphrag/algorithms/shgat.ts

/**
 * Predict success probability for a given execution path
 *
 * Uses the SHGAT attention mechanism to score a sequence of nodes.
 * Cold start returns 0.5 (neutral prior).
 *
 * @param path - Array of node IDs (tool or capability IDs)
 * @returns Probability between 0 and 1
 */
predictPathSuccess(path: string[]): number {
  // Cold start check
  if (this.capabilityNodes.size === 0 || path.length === 0) {
    return 0.5; // Neutral prior
  }

  // Encode path as average of node embeddings
  const embeddings: number[][] = [];
  for (const nodeId of path) {
    // Try capability first
    const cap = this.capabilityNodes.get(nodeId);
    if (cap) {
      embeddings.push(cap.embedding);
      continue;
    }
    // Try tool
    const tool = this.toolNodes.get(nodeId);
    if (tool) {
      embeddings.push(tool.embedding);
    }
    // Unknown nodes are skipped
  }

  if (embeddings.length === 0) {
    return 0.5; // No known nodes in path
  }

  // Average embedding
  const pathEmbedding = this.averageEmbeddings(embeddings);

  // Forward pass to get capability scores
  this.forward();

  // Find best matching capability for this path
  let bestScore = 0.5;
  for (const [capId, cap] of this.capabilityNodes) {
    const sim = this.cosineSimilarity(pathEmbedding, cap.embedding);
    const reliability = cap.successRate;
    const score = this.sigmoid(sim * reliability);
    if (score > bestScore) {
      bestScore = score;
    }
  }

  return bestScore;
}
```

**2. TD Error Calculation**

TD Error is the difference between predicted and actual success:
- `tdError = actual - predicted`
- Positive TD error: Better than expected (success when predicted failure)
- Negative TD error: Worse than expected (failure when predicted success)
- PER priority uses `|tdError|` because both directions are informative

**3. Cold Start Strategy**

When SHGAT has no data:
- `predictPathSuccess()` returns 0.5 (maximum entropy)
- All traces get priority 0.5 initially
- This ensures uniform sampling until SHGAT learns patterns
- After training, priorities diverge based on surprise

**4. Priority Range**

| Scenario | Predicted | Actual | TD Error | Priority |
|----------|-----------|--------|----------|----------|
| Cold start | N/A | N/A | N/A | 0.5 |
| Expected success | 0.9 | 1.0 | 0.1 | 0.1 |
| Unexpected failure | 0.9 | 0.0 | -0.9 | 0.9 |
| Expected failure | 0.1 | 0.0 | -0.1 | 0.1 |
| Unexpected success | 0.1 | 1.0 | 0.9 | 0.9 |
| Neutral | 0.5 | 0.5 | 0.0 | 0.0 |

### Architecture Compliance

- **Deno 2.x** - Runtime (not Node.js)
- **TypeScript strict mode** - All types explicit
- **camelCase** - For all properties (not snake_case)
- **No magic numbers** - Use constants (e.g., `COLD_START_PRIORITY = 0.5`)
- **Async/await** - No callbacks or .then() chains
- **PGlite** - Traces stored in `execution_trace` table (Story 11.2)

### Files to Create

| File | Purpose | LOC |
|------|---------|-----|
| `src/capabilities/per-priority.ts` | TD error calculation and priority storage | ~60 |
| `tests/unit/capabilities/per_priority_test.ts` | Unit tests | ~80 |

### Files to Modify

| File | Changes | LOC |
|------|---------|-----|
| `src/graphrag/algorithms/shgat.ts:~795` | Add `predictPathSuccess()` method | ~40 |
| `src/capabilities/execution-trace-store.ts` | Add `getHighPriorityTraces()`, `updatePriority()` | ~30 |

### References

- [Epic 11: Learning from Traces](../epics/epic-11-learning-from-traces.md)
- [Story 11.1: Result Tracing](./11-1-result-tracing.md) - DONE
- [Story 11.2: Execution Trace Table](../epics/epic-11-learning-from-traces.md#story-112-execution-trace-table--store) - PREREQUISITE (backlog)
- [Source: src/graphrag/algorithms/shgat.ts](../../src/graphrag/algorithms/shgat.ts) - SHGAT implementation
- [Source: src/capabilities/types.ts](../../src/capabilities/types.ts) - ExecutionTrace types (to be added in 11.2)
- [Project Context](../project-context.md) - Architecture patterns

### Previous Story Intelligence (11.1)

From Story 11.1 (Result Tracing - completed 2025-12-22):
- Pattern: `safeSerializeResult()` for handling non-JSON values
- Pattern: IIFE wrapper in code-generator.ts to capture return values
- Test patterns in `tests/unit/sandbox/result_tracing_test.ts`
- EventBus integration: `result` propagated via `tool.end` and `capability.end` events

### Git Intelligence

Recent commits (2025-12-22):
```
f1f924c feat(story-11.0): DB schema cleanup - KV singleton and workflow state cache
cde94eb feat(story-11.1): result tracing for tools and capabilities
dbefd58 chore(story-10.6): mark done + simplify unified-search benchmark
```

Patterns observed:
- Commit format: `feat(story-X.Y): description`
- Test-first approach for algorithm changes
- Story files include Dev Agent Record section

### Dependencies

```
Story 11.2 (execution_trace table) <-- REQUIRED
       |
       v
Story 11.3 (TD Error + PER Priority) <-- THIS STORY
       |
       v
Story 11.6 (SHGAT Training with PER Sampling)
```

**Story 11.2 provides:**
- `execution_trace` table with `priority` column (FLOAT, default 0.5)
- `ExecutionTraceStore` class with `save()`, `getTraces()` methods
- `ExecutionTrace` interface with `executedPath`, `success`, `priority` fields

**This story provides to 11.6:**
- `calculateTDError()` function for computing TD error
- `storeTraceWithPriority()` for saving traces with PER priority
- `SHGAT.predictPathSuccess()` for path-level predictions
- `getHighPriorityTraces()` for PER sampling

### Estimation

**Effort:** 1-2 days (simplified because no CapabilityLearning structure)

**Breakdown:**
- Task 1 (SHGAT.predictPathSuccess): 2-3h
- Task 2 (per-priority.ts): 1-2h
- Task 3 (ExecutionTraceStore methods): 1h
- Task 4 (unit tests): 2h
- Task 5 (validation): 30min

**Risk:**
- Dependency on Story 11.2 (execution_trace table) which is still in backlog
- Recommend implementing 11.2 first, or mocking ExecutionTraceStore for testing

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

