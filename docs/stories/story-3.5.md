# Story 3.5: Safe-to-Fail Branches & Resilient Workflows

**Epic:** 3 - Agent Code Execution & Local Processing
**Story ID:** 3.5
**Status:** drafted
**Estimated Effort:** 4-6 heures

---

## User Story

**As a** developer building robust production workflows,
**I want** to leverage sandbox tasks as safe-to-fail branches in my DAG,
**So that** I can implement resilient workflows with graceful degradation and retry safety.

---

## Acceptance Criteria

1. ✅ DAG executor enhanced pour marquer sandbox tasks comme "safe-to-fail" (failure doesn't halt workflow)
2. ✅ Partial success mode: DAG continues même si sandbox branches fail
3. ✅ Aggregation patterns implemented: collect results from successful branches, ignore failures
4. ✅ Example resilient workflow: Parallel analysis (fast/ML/stats) → use first success
5. ✅ Retry logic: Failed sandbox tasks can be retried without side effects (idempotent)
6. ✅ Graceful degradation test: ML analysis timeout → fallback to simple stats
7. ✅ A/B testing pattern: Run 2 algorithms in parallel, compare results
8. ✅ Error isolation verification: Sandbox failure doesn't corrupt MCP tasks downstream
9. ✅ Documentation: Resilient workflow patterns guide avec code examples
10. ✅ Integration test: Multi-branch workflow with intentional failures → verify partial success

---

## Tasks / Subtasks

### Phase 1: DAG Executor Enhancement (2-3h)

- [ ] **Task 1: Mark sandbox tasks as safe-to-fail** (AC: #1)
  - [ ] Modifier `src/dag/executor.ts`
  - [ ] Ajouter property `safeToFail: boolean` dans Task type
  - [ ] Auto-detect: tasks avec `tool: "agentcards:execute_code"` → safeToFail = true
  - [ ] Tasks MCP normaux → safeToFail = false

- [ ] **Task 2: Partial success execution mode** (AC: #2)
  - [ ] Modifier `executeTask()` pour capturer failures sandbox
  - [ ] Si `task.safeToFail === true` et failure → log warning, continue workflow
  - [ ] Si `task.safeToFail === false` et failure → halt workflow (comportement actuel)
  - [ ] Return partial results: `{ success: [...], failed: [...] }`

- [ ] **Task 3: Aggregation patterns** (AC: #3)
  - [ ] Créer helper `aggregateSuccessfulResults(taskIds: string[])`
  - [ ] Collecte results de toutes branches successful
  - [ ] Ignore branches failed (safe-to-fail)
  - [ ] Exemple: `$OUTPUT.aggregate(["fast", "ml", "stats"])` → retourne seulement successes

### Phase 2: Resilient Workflow Patterns (2h)

- [ ] **Task 4: Parallel analysis pattern** (AC: #4)
  - [ ] Créer exemple workflow: 3 approaches parallèles (fast/ML/stats)
  - [ ] Launch simultanément avec différents timeouts
  - [ ] Use first success pattern: return dès qu'une approche réussit
  - [ ] Aggregator task: `$OUTPUT.firstSuccess(["fast", "ml", "stats"])`

- [ ] **Task 5: Graceful degradation pattern** (AC: #6)
  - [ ] Workflow avec fallback automatique
  - [ ] Priorité: ML analysis (2s timeout) → Stats analysis (fallback)
  - [ ] Si ML timeout → log degradation → use stats result
  - [ ] Test: Force ML timeout → verify stats fallback works

- [ ] **Task 6: A/B testing pattern** (AC: #7)
  - [ ] Run 2 algorithms en parallèle (algo_a, algo_b)
  - [ ] Compare results: `{ a: $OUTPUT.algo_a, b: $OUTPUT.algo_b }`
  - [ ] Metric collection: execution_time, accuracy, etc.
  - [ ] Return both results pour comparison

### Phase 3: Retry Safety & Error Isolation (1-2h)

- [ ] **Task 7: Retry logic for sandbox tasks** (AC: #5)
  - [ ] Implement retry mechanism: max 3 attempts
  - [ ] Retry seulement si `task.safeToFail === true`
  - [ ] Exponential backoff: 100ms, 200ms, 400ms
  - [ ] Test: Failed sandbox task → auto-retry → eventual success

- [ ] **Task 8: Error isolation verification** (AC: #8)
  - [ ] Test workflow: sandbox fail → MCP task downstream
  - [ ] Verify: Sandbox failure doesn't corrupt downstream state
  - [ ] Verify: $OUTPUT references to failed tasks → return null/undefined
  - [ ] Verify: DAG continues execution avec partial results

### Phase 4: Documentation & Integration Tests (1h)

- [ ] **Task 9: Resilient workflow patterns guide** (AC: #9)
  - [ ] Documentation: `docs/resilient-workflows.md`
  - [ ] Pattern 1: Parallel speculative branches
  - [ ] Pattern 2: Graceful degradation
  - [ ] Pattern 3: A/B testing
  - [ ] Pattern 4: Retry with idempotency
  - [ ] Code examples pour chaque pattern

- [ ] **Task 10: Integration tests** (AC: #10)
  - [ ] Test: Multi-branch workflow avec intentional failures
  - [ ] Scenario 1: 3 parallel branches, 1 fails → verify 2 succeed
  - [ ] Scenario 2: ML timeout → fallback stats → verify graceful degradation
  - [ ] Scenario 3: Retry failed sandbox → verify eventual success
  - [ ] Scenario 4: Error isolation → verify downstream not corrupted

---

## Dev Notes

### Safe-to-Fail Property

**Why sandbox tasks are safe-to-fail:**
- **Idempotent**: Re-execution produces same result
- **Isolated**: No side effects (pas de fichier créé, pas d'API call externe)
- **Stateless**: Failure doesn't corrupt system state

**Contrast with MCP tasks:**
```typescript
// ❌ MCP Task: NOT safe-to-fail
{
  id: "create_issue",
  tool: "github:create_issue",
  safeToFail: false  // Side effect! Can't retry without duplication
}

// ✅ Sandbox Task: Safe-to-fail
{
  id: "analyze",
  tool: "agentcards:execute_code",
  code: "analyzeData(commits)",
  safeToFail: true  // Idempotent! Can retry/fail safely
}
```

### Resilient Workflow Example

**Complete resilient workflow:**
```typescript
const resilientWorkflow: DAGStructure = {
  tasks: [
    // Fetch data (MCP task - NOT safe-to-fail)
    {
      id: "fetch",
      tool: "github:list_commits",
      arguments: { repo: "agentcards", limit: 1000 },
      depends_on: [],
      safeToFail: false
    },

    // Launch 3 parallel analysis approaches (ALL safe-to-fail)
    {
      id: "fast",
      tool: "agentcards:execute_code",
      code: "simpleAnalysis(commits)",
      timeout: 500,
      depends_on: ["fetch"],
      safeToFail: true  // Can fail without consequences
    },
    {
      id: "ml",
      tool: "agentcards:execute_code",
      code: "mlAnalysis(commits)",
      timeout: 2000,
      depends_on: ["fetch"],
      safeToFail: true  // Can fail without consequences
    },
    {
      id: "stats",
      tool: "agentcards:execute_code",
      code: "statisticalAnalysis(commits)",
      depends_on: ["fetch"],
      safeToFail: true  // Can fail without consequences
    },

    // Aggregate successful results
    {
      id: "aggregate",
      tool: "agentcards:execute_code",
      code: `
        const results = [];
        if ($OUTPUT.fast) results.push({ type: 'fast', ...fastResult });
        if ($OUTPUT.ml) results.push({ type: 'ml', ...mlResult });
        if ($OUTPUT.stats) results.push({ type: 'stats', ...statsResult });
        return mergeBestInsights(results);
      `,
      depends_on: ["fast", "ml", "stats"],
      safeToFail: true
    },

    // Create GitHub issue (MCP task - NOT safe-to-fail)
    {
      id: "create_issue",
      tool: "github:create_issue",
      arguments: {
        title: "Analysis Results",
        body: "$OUTPUT.aggregate"
      },
      depends_on: ["aggregate"],
      safeToFail: false  // Side effect! Must succeed or halt
    }
  ]
};
```

**Execution scenarios:**

1. **All succeed**: Fast (200ms), ML (1.8s), Stats (1.2s) → Aggregate all 3
2. **ML timeouts**: Fast (200ms), ML (timeout), Stats (1.2s) → Aggregate 2 (graceful degradation)
3. **Only fast succeeds**: Fast (200ms), ML (error), Stats (error) → Aggregate 1 (degraded but functional)
4. **All fail**: Fast/ML/Stats all fail → Aggregate gets empty results → Create issue fails (acceptable)

### Performance Characteristics

**Benefits of safe-to-fail branches:**
- **Aggressive speculation**: Try multiple approaches without risk
- **Graceful degradation**: Partial success better than complete failure
- **Retry safety**: Idempotent tasks can be retried without duplication
- **A/B testing**: Run experiments in production safely

**Trade-offs:**
- **Wasted compute**: Failed branches consume CPU (but cheap resource)
- **Complexity**: More branches = more debugging
- **Latency variance**: Results depend on which branches succeed

### Integration with Speculative Execution (Epic 2)

Safe-to-fail branches unlock **speculative resilience**:

```typescript
// Gateway can speculatively execute multiple hypotheses
const speculativeExecution = await gatewayHandler.processIntent({
  text: "Analyze commits and find trends"
});

// If confidence > 0.70 → Execute speculatively
// Launch 3 sandbox branches in parallel (all safe-to-fail)
// If predictions wrong → Discard results (no side effects)
// If predictions right → Agent gets instant multi-perspective analysis
```

**Without safe-to-fail**: Speculative execution too risky (side effects)
**With safe-to-fail**: Speculative execution becomes aggressive and safe

---

## Prerequisites

- **Story 3.4**: `agentcards:execute_code` tool functional
- **Epic 2**: DAG executor with parallel execution
- **Epic 2**: Speculative execution capability

---

## Definition of Done

- [ ] DAG executor marks sandbox tasks as safe-to-fail automatically
- [ ] Partial success mode: Workflow continues despite sandbox failures
- [ ] Aggregation helpers implemented and tested
- [ ] 3+ resilient workflow patterns documented with examples
- [ ] Retry logic works for sandbox tasks (idempotent)
- [ ] Error isolation verified (sandbox failure doesn't corrupt downstream)
- [ ] Integration tests: Multi-branch workflows with intentional failures pass
- [ ] Documentation: Resilient workflow patterns guide complete
- [ ] Code review approved
- [ ] Tests pass (unit + integration)
