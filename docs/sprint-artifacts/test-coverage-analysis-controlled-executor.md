# Test Coverage Analysis: Controlled Executor Refactoring

**Date:** 2025-12-16
**Scope:** controlled-executor.ts refactoring and extracted modules
**Analysis Type:** Gap Analysis + Risk Assessment

---

## Executive Summary

| Metric | Value | Status |
|--------|-------|--------|
| Total New/Modified Files | 15 | - |
| Files with Unit Tests | 0 | ❌ CRITICAL |
| Files with Integration Tests | 2 | ⚠️ PARTIAL |
| Security-Critical Gaps | 1 | ❌ HIGH RISK |
| Total Lines Added/Modified | 2,275 | - |
| Test Coverage Estimate | <15% | ❌ UNACCEPTABLE |

**Critical Finding:** The security fix (H4 - AIL/HIL on resume) has ZERO test coverage, creating a high-risk security bypass vulnerability if the fix regresses.

---

## Current Test Coverage

### Existing Tests

#### 1. `/tests/dag/code-execution-integration.test.ts`
**Coverage:** MCP tool vs code_execution task routing
**Lines:** 176
**Scope:**
- ✅ AC1: Code execution tasks route to sandbox
- ✅ AC2: Mixed MCP + code_execution tasks
- ✅ Code tasks receive dependency context
- ✅ Error handling for code tasks

**Gaps:**
- ❌ No HIL/AIL decision point testing
- ❌ No checkpoint/resume testing
- ❌ No permission escalation testing
- ❌ No timeout configuration testing

#### 2. `/tests/dag/capability-execution.test.ts`
**Coverage:** Capability task routing and execution
**Lines:** 314
**Scope:**
- ✅ AC3: Capability tasks with capabilityId
- ✅ Capability tasks receive dependencies
- ✅ Error handling for capabilities
- ✅ Missing capabilityId validation
- ✅ Mixed task type workflows

**Gaps:**
- ❌ No capability permission escalation
- ❌ No CapabilityStore integration
- ❌ No checkpoint/resume for capabilities

---

## Gap Analysis by Priority

### CRITICAL (Security & Correctness)

#### 🔴 GAP-1: H4 Fix - AIL/HIL on Checkpoint Resume
**File:** `src/dag/controlled-executor.ts:404-521`
**Risk:** HIGH - Security bypass if fix regresses
**Current Coverage:** 0%

**What's Missing:**
```typescript
// Lines 493-501 in resumeFromCheckpoint - ZERO TEST COVERAGE
// AIL Decision Point (SECURITY: Must include on resume to prevent bypass)
const ailEvents = await this.handleAILDecisionPoint(...);

// HIL Approval (SECURITY: Must include on resume to prevent bypass)
const hilEvents = await this.handleHILApproval(...);
```

**Required Tests:**
1. Resume workflow with AIL enabled → verify AIL decision point triggered
2. Resume workflow with HIL enabled → verify approval required
3. Resume workflow, reject HIL → verify workflow aborted (security test)
4. Resume workflow, approve HIL → verify execution continues
5. Resume workflow, AIL replan → verify DAG restructured correctly

**Severity:** CRITICAL - This is the main security fix from the refactoring

---

#### 🔴 GAP-2: H2 Fix - Async Command Waiting
**File:** `src/dag/command-queue.ts:335-355`
**Risk:** MEDIUM - Performance regression if broken
**Current Coverage:** 0%

**What's Missing:**
```typescript
// CommandQueue.waitForCommand() - NEW METHOD, ZERO TESTS
async waitForCommand(timeout: number): Promise<Command | null> {
  const timeoutPromise = new Promise<null>(...);
  return await Promise.race([this.queue.dequeue(), timeoutPromise]);
}
```

**Required Tests:**
1. `waitForCommand` returns immediately if command already queued
2. `waitForCommand` waits and returns when command arrives
3. `waitForCommand` returns null after timeout
4. Verify no CPU-burning (test should complete in timeout + 10ms max)
5. Multiple concurrent waiters (FIFO ordering preserved)

---

#### 🔴 GAP-3: H3 Fix - Type Guard Validation
**File:** `src/dag/loops/decision-waiter.ts:33-44`
**Risk:** MEDIUM - Runtime errors if validation broken
**Current Coverage:** 0%

**What's Missing:**
```typescript
// isDecisionCommand type guard - NEW FUNCTION, ZERO TESTS
export function isDecisionCommand(cmd: unknown): cmd is DecisionCommand {
  // Type validation logic
}
```

**Required Tests:**
1. Valid DecisionCommand with all fields → true
2. Valid with only required fields → true
3. Invalid: missing type field → false
4. Invalid: type is number → false
5. Invalid: approved is string → false
6. Invalid: null/undefined → false
7. Edge case: extra unknown fields → true (should allow)

---

### HIGH (Correctness & Maintainability)

#### 🟠 GAP-4: M2 Fix - Shared Dependency Resolver
**File:** `src/dag/execution/dependency-resolver.ts:23-45`
**Risk:** MEDIUM - Breaks code/capability execution if broken
**Current Coverage:** Indirect only (via integration tests)

**Required Unit Tests:**
1. All dependencies found and successful → returns map
2. Dependency has status "error" → throws error
3. Dependency not found in results → throws error
4. Dependency has status "failed_safe" → includes in map (resilient)
5. Empty dependsOn array → returns empty map
6. Multiple dependencies mixed statuses → correct behavior

---

#### 🟠 GAP-5: M4 Fix - Configurable Timeouts
**File:** `src/dag/controlled-executor.ts:229-238`
**Risk:** LOW - Defaults work, but config might be ignored
**Current Coverage:** 0%

**Required Tests:**
1. Default timeouts used when config omitted
2. Custom HIL timeout respected
3. Custom AIL timeout respected
4. Partial config (only HIL) uses defaults for others
5. Invalid timeout (negative) → fallback to defaults

---

### MEDIUM (Modularity & Regression Prevention)

#### 🟡 GAP-6: Checkpoint Integration Module
**File:** `src/dag/checkpoints/integration.ts`
**Current Coverage:** Indirect (via e2e)
**Required Unit Tests:**
1. `saveCheckpointAfterLayer` - success path
2. `saveCheckpointAfterLayer` - null manager returns ""
3. `saveCheckpointAfterLayer` - save failure returns null
4. `loadCheckpoint` - success path
5. `loadCheckpoint` - null manager throws error
6. `loadCheckpoint` - checkpoint not found throws error
7. `calculateResumeProgress` - correct layer calculation

---

#### 🟡 GAP-7: Episodic Memory Capture
**File:** `src/dag/episodic/capture.ts`
**Current Coverage:** 0%
**Risk:** LOW - Observability feature, not critical path

**Required Tests (Sampling):**
1. `captureTaskComplete` - with episodic store
2. `captureTaskComplete` - without store (no-op)
3. `captureAILDecision` - various decision types
4. `captureHILDecision` - approval/rejection
5. `captureSpeculationStart` - event creation

---

#### 🟡 GAP-8: Permission Escalation Integration
**File:** `src/dag/permissions/escalation-integration.ts`
**Current Coverage:** 0%
**Risk:** MEDIUM - Security feature, needs validation

**Required Tests:**
1. `isPermissionError` - matches "Permission denied: FS"
2. `isPermissionError` - matches "Access denied"
3. `isPermissionError` - does not match unrelated errors
4. Edge cases: null, undefined, non-Error objects

---

#### 🟡 GAP-9: HIL/AIL Handler Logic
**Files:**
- `src/dag/loops/hil-handler.ts`
- `src/dag/loops/ail-handler.ts`

**Current Coverage:** 0%
**Required Tests:**

**HIL Handler:**
1. `shouldRequireApproval` - HIL enabled, trigger layer → true
2. `shouldRequireApproval` - HIL disabled → false
3. `shouldRequireApproval` - layer not in trigger set → false
4. `generateHILSummary` - correct summary format

**AIL Handler:**
1. `shouldTriggerAIL` - AIL enabled, checkOnError, has error → true
2. `shouldTriggerAIL` - AIL enabled, checkEveryNLayers → correct
3. `shouldTriggerAIL` - AIL disabled → false
4. `MAX_REPLANS` constant exposed and correct

---

#### 🟡 GAP-10: Speculation Integration
**File:** `src/dag/speculation/integration.ts`
**Current Coverage:** 0%
**Risk:** LOW - Performance feature, not correctness-critical

**Required Tests (Sampling):**
1. `enableSpeculation` - state updated correctly
2. `disableSpeculation` - speculation stopped
3. `checkSpeculativeCache` - hit/miss scenarios
4. `consumeSpeculation` - cache removal
5. `getSpeculationMetrics` - correct metrics

---

### LOW (Nice to Have)

#### 🟢 GAP-11: Task Router
**File:** `src/dag/execution/task-router.ts`
**Current Coverage:** Indirect (via integration tests)
**Required Tests:**
1. `getTaskType` - code_execution → "code_execution"
2. `getTaskType` - capability → "capability"
3. `getTaskType` - default → "mcp_tool"
4. `isSafeToFail` - metadata.safeToFail = true → true
5. `isSafeToFail` - missing metadata → false

---

## Test Priority Matrix

| Test Suite | Priority | Reason | Estimated LOC |
|-------------|----------|--------|---------------|
| Checkpoint Resume Security (GAP-1) | P0 | Security-critical H4 fix | 150-200 |
| Command Queue Async Wait (GAP-2) | P0 | Performance-critical H2 fix | 100-120 |
| Type Guard Validation (GAP-3) | P1 | Type safety H3 fix | 80-100 |
| Dependency Resolver (GAP-4) | P1 | Shared utility M2 fix | 60-80 |
| Configurable Timeouts (GAP-5) | P2 | M4 fix validation | 50-60 |
| Permission Error Detection (GAP-8) | P2 | Security utility | 40-50 |
| HIL/AIL Handlers (GAP-9) | P2 | Core loop logic | 100-120 |
| Checkpoint Integration (GAP-6) | P3 | Already covered by e2e | 80-100 |
| Episodic Capture (GAP-7) | P3 | Observability only | 60-80 |
| Speculation Integration (GAP-10) | P3 | Performance feature | 80-100 |
| Task Router (GAP-11) | P3 | Simple utilities | 40-50 |

---

## Recommended Test Plan

### Phase 1: Critical Security & Correctness (P0)
**Timeline:** Immediate
**Files to Create:**
1. `/tests/dag/checkpoint-resume-security.test.ts` - GAP-1
2. `/tests/dag/command-queue-async.test.ts` - GAP-2
3. `/tests/dag/type-guards.test.ts` - GAP-3

**Expected Coverage Increase:** 40% → 65%

### Phase 2: Core Utilities (P1-P2)
**Timeline:** Next sprint
**Files to Create:**
4. `/tests/dag/dependency-resolver.test.ts` - GAP-4
5. `/tests/dag/executor-config.test.ts` - GAP-5
6. `/tests/dag/permission-errors.test.ts` - GAP-8
7. `/tests/dag/hil-ail-handlers.test.ts` - GAP-9

**Expected Coverage Increase:** 65% → 85%

### Phase 3: Integration & Observability (P3)
**Timeline:** Future
**Files to Create:**
8. `/tests/dag/checkpoint-integration.test.ts` - GAP-6
9. `/tests/dag/episodic-capture.test.ts` - GAP-7
10. `/tests/dag/speculation-integration.test.ts` - GAP-10
11. `/tests/dag/task-router.test.ts` - GAP-11

**Expected Coverage Increase:** 85% → 95%+

---

## Risk Assessment

### Current State: ❌ NOT PRODUCTION READY

**Blocking Issues:**
1. **H4 Fix (Security):** AIL/HIL on resume has ZERO tests
   - Risk: Silent regression could allow security bypass
   - Impact: Users could resume workflows and skip human approval
   - Mitigation: MUST add tests before merge

2. **H2 Fix (Performance):** Async waiting has no validation
   - Risk: Could regress to CPU-burning polling
   - Impact: Performance degradation during HIL/AIL waits
   - Mitigation: SHOULD add tests before merge

3. **H3 Fix (Type Safety):** Type guard not validated
   - Risk: Runtime errors from invalid commands
   - Impact: Workflow crashes during AIL/HIL
   - Mitigation: SHOULD add tests before merge

### Post-Phase 1: ✅ PRODUCTION READY
- Security-critical paths tested
- Performance regression prevented
- Type safety validated

---

## Conclusion

**Current Status:** The refactoring successfully reduces file size and improves modularity, but test coverage is critically insufficient for production deployment.

**Immediate Actions Required:**
1. Create Phase 1 tests (checkpoint resume security, async waiting, type guards)
2. Run full test suite to validate no regressions
3. Add test coverage reporting to CI/CD pipeline

**Success Criteria:**
- ✅ All Phase 1 tests passing (security & correctness)
- ✅ No regression in existing integration tests
- ✅ Test coverage >65% before merge
- ✅ All CRITICAL gaps addressed

**Recommendation:** BLOCK merge until Phase 1 tests completed.
