# Test Parallelization Plan

## Current Status

**Test Performance (Sequential)**
- Total time: **3m42s (222 seconds)**
- Tests: 848 passed | 0 failed | 27 ignored
- Migration overhead: ~12s (105 DB creations × 112ms)
- Actual test execution: ~210s (95% of time)

**Test Performance (Parallel with --parallel flag)**
- Total time: **54 seconds** ⚡ (4x faster!)
- Tests: 764 passed | **97 failed** | 27 ignored
- **Speedup: 75% reduction in time**

## Problem Analysis

### Failed Tests Breakdown (97 total)

**By Category:**
1. **AssertionError (51/97)** - Race conditions, shared state between tests
2. **Capability sanitization (10/97)** - Global state in capability system
3. **EpisodicMemory DB (4/97)** - Database not connected / shared DB instances
4. **DB migrations (1/97)** - Race condition in migration table creation
5. **Other (31/97)** - Workers, KV store, sandbox resources

**By Module:**
1. `server/auth/` (9 tests) - Global KV store singleton
2. `sandbox/` (15+ tests) - Shared workers and resources
3. `capabilities/` (10 tests) - Global capability state
4. `graphrag/` - DB isolation issues
5. `vector/` - DB isolation issues

### Root Causes

1. **Global Singletons**
   - KV store (`src/server/auth/kv.ts`) - single `_kv` variable
   - Capabilities state - shared global state
   - Workers/resources - shared between tests

2. **DB Race Conditions**
   - Tests create DBs with same name (`memory://`)
   - Migration table conflicts
   - Timing issues with DB creation/cleanup

3. **Shared State**
   - Tests modify global state that other tests read
   - No test isolation
   - Cleanup happens too late or not at all

## Fix Strategy

### Phase 1: Quick Wins (Easy Fixes)

**1. Isolate DB Instances**
```typescript
// Before
async function createTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient("memory://");
  // ...
}

// After
async function createTestDb(): Promise<PGliteClient> {
  const db = new PGliteClient(`memory://${crypto.randomUUID()}`);
  // ...
}
```

**Files to modify (13 files):**
- tests/unit/vector/search_test.ts
- tests/unit/mcp/gateway_handler_test.ts
- tests/unit/telemetry/telemetry-service_test.ts
- tests/unit/graphrag/dag_suggester_episodic_test.ts
- tests/unit/graphrag/graph_engine_search_test.ts
- tests/unit/graphrag/graph_engine_metrics_test.ts
- tests/unit/graphrag/graph_engine_test.ts
- tests/unit/graphrag/dag_suggester_test.ts
- tests/unit/capabilities/capability_store_test.ts
- + 4 more

**Estimated impact:** Fix ~30-40 DB-related failures

### Phase 2: Singleton Isolation

**2a. KV Store Isolation**
```typescript
// src/server/auth/kv.ts - Add test mode support
let _kvInstances = new Map<string, Deno.Kv>();

export async function getKv(testId?: string): Promise<Deno.Kv> {
  const key = testId || "default";
  if (!_kvInstances.has(key)) {
    const path = testId ? `:memory:${testId}` : undefined;
    _kvInstances.set(key, await Deno.openKv(path));
  }
  return _kvInstances.get(key)!;
}
```

**Files affected:**
- src/server/auth/kv.ts (modify)
- tests/unit/server/auth/kv_test.ts (update tests)
- tests/unit/server/auth/session_test.ts (update tests)

**Estimated impact:** Fix ~9 KV-related failures

**2b. Capabilities State Isolation**
- Identify global state in capability system
- Add test isolation mechanism
- Update ~10 tests

**Estimated impact:** Fix ~10 capability failures

### Phase 3: Worker/Resource Isolation

**3. Sandbox Worker Isolation**
- Ensure each test gets its own worker
- Proper cleanup in teardown
- Resource leak prevention

**Files affected:**
- tests/unit/sandbox/worker_bridge_test.ts
- tests/unit/sandbox/capability_injection_test.ts
- tests/unit/sandbox/executor_test.ts

**Estimated impact:** Fix ~15 sandbox failures

### Phase 4: Remaining Edge Cases

**4. Manual Fixes**
- Review remaining failures (~30)
- Case-by-case fixes
- May require test redesign

## Implementation Plan

### Priority Order
1. ✅ **DONE:** Shared DB pattern (dag_suggester_test.ts)
2. **Next:** DB UUID isolation (13 files) - 1-2 hours
3. **Then:** KV store isolation - 1 hour
4. **Then:** Capabilities isolation - 2 hours
5. **Then:** Sandbox workers - 2 hours
6. **Finally:** Edge cases - 2-4 hours

**Total estimated time:** 8-12 hours of focused work

### Testing Strategy
After each phase:
1. Run tests with `--parallel`
2. Count failures: `deno test --parallel 2>&1 | grep FAILED | wc -l`
3. If count reduced significantly, move to next phase
4. Document any new issues discovered

### Success Criteria
- ✅ All 848 tests pass with `--parallel` flag
- ✅ Test time < 1 minute (currently 54s with failures)
- ✅ No flaky tests (run 10 times, all pass)
- ✅ CI/CD updated to use `--parallel`

## Partial Parallelization Option

If full parallelization proves too complex:

**Option: Selective Parallelization**
```json
// deno.json
{
  "tasks": {
    "test:unit:fast": "deno test tests/unit/{errors,utils,lib}/ --parallel",
    "test:unit:slow": "deno test tests/unit/{graphrag,vector,db,capabilities,sandbox}/",
    "test:unit": "deno task test:unit:fast && deno task test:unit:slow"
  }
}
```

This would:
- Run simple tests (errors, utils) in parallel - very fast
- Run complex tests (DB, workers) sequentially - safer
- Still get ~30-40% speedup with minimal risk

## Next Steps

1. Start with Phase 1 (DB UUID isolation)
2. Test after each file modified
3. Track progress in this document
4. Commit after each successful phase

## Notes

- Keep backup of parallel test output: `/tmp/parallel_test_output.txt`
- Document any unexpected behaviors
- Consider adding test isolation utilities for future tests
