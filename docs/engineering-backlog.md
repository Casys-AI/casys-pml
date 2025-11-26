# Engineering Backlog - AgentCards

**Last Updated:** 2025-11-26
**Project:** AgentCards
**Maintainer:** BMad

---

## Table of Contents

- [🔴 CRITICAL - Production Blockers](#-critical---production-blockers)
- [🟡 HIGH - Performance & Stability](#-high---performance--stability)
- [🟢 MEDIUM - Code Quality](#-medium---code-quality)
- [⚪ LOW - Technical Debt](#-low---technical-debt)
- [✅ RESOLVED - Archive](#-resolved---archive)

---

## 🔴 CRITICAL - Production Blockers

**Priority:** P0 - Fix before production deployment
**Total Estimated Effort:** 7 hours

### BUG-005: DAGSuggester Dependency Ordering Bias

**Severity:** CRITICAL (P0)
**Status:** Open
**Discovered:** 2025-11-26 (Spike: dag-suggester-dependency-analysis)
**Estimate:** 3 hours

**Impact:**

- Tools running in parallel instead of sequence when "Child" appears before "Parent" in candidate list
- Increased failure rate for complex workflows
- Undermines reliability of Hybrid Search (which randomizes order)

**Location:**

- **File:** `src/graphrag/graph-engine.ts`
- **Method:** `buildDAG()`

**Root Cause:**

```typescript
for (let i = 0; i < candidates.length; i++) {
  for (let j = 0; j < i; j++) {
    // ❌ Only looks backwards
    // Dependencies missed if parent is at index > i
  }
}
```

**Fix Required:**
Implement Full Adjacency Matrix approach (ADR-024):

1. Compare all N\*N pairs regardless of list order
2. Add dependencies for any detected path (Parent -> Child)
3. Run topological sort to detect/break cycles

**Related:** ADR-024

---

### BUG-006: Hybrid Search Logic Not Used by Suggester

**Severity:** CRITICAL (P0)
**Status:** Open
**Discovered:** 2025-11-26 (Code Review)
**Estimate:** 4 hours

**Impact:**

- `execute_dag` uses naive Vector Search while advanced Hybrid Search exists but is unused
- Implicit dependencies (graph-based) are missed
- Inconsistent results between `search_tools` (smart) and `execute_dag` (dumb)

**Location:**

- **File:** `src/graphrag/dag-suggester.ts`
- **Method:** `suggestDAG()`

**Fix Required:**

1. Extract hybrid search logic from `src/mcp/gateway-server.ts` to `GraphRAGEngine` (ADR-022)
2. Implement Dynamic Candidate Expansion (ADR-023)
3. Update `DAGSuggester` to use new `graphEngine.searchToolsHybrid()`

**Related:** ADR-022, ADR-023, Story 5.1

---

### BUG-003: Tool Schema Cache Unbounded Growth

**Severity:** LOW (P3) - Downgraded 2025-11-25
**Status:** Open
**Discovered:** 2025-11-24 (Comprehensive Audit)
**Estimate:** 1 hour (simplified fix)

**Impact:**

- `toolSchemaCache` Map grows unbounded (theoretical)
- Realistic impact: Even 5000 tools = <1MB memory (negligible)
- No TTL or eviction policy

**Location:**

- **File:** `src/mcp/gateway-server.ts`
- **Lines:** 881-887
- **Method:** `buildToolVersionsMap()`

**Root Cause:**

```typescript
private toolSchemaCache = new Map<string, string>(); // ❌ Unbounded

private buildToolVersionsMap(): Record<string, string> {
  const versions: Record<string, string> = {};
  for (const [toolKey, schemaHash] of this.toolSchemaCache.entries()) {
    versions[toolKey] = schemaHash;
  }
  return versions;
}
```

**Fix Required:**

```typescript
// 1. Add LRU cache dependency to deno.json:
"imports": {
  "lru-cache": "npm:lru-cache@^10.0.0"
}

// 2. Replace Map with LRUCache:
import { LRUCache } from "lru-cache";

private toolSchemaCache = new LRUCache<string, string>({
  max: 1000,  // Max 1000 tool schemas (configurable)
  ttl: 1000 * 60 * 60 * 24, // 24h TTL
  updateAgeOnGet: true, // Refresh TTL on access
});
```

**Validation:**

- Add test: Insert 1500 schemas → verify size capped at 1000
- Add test: TTL expiration → verify old entries evicted
- Memory profiling: 24h runtime → verify stable memory

**Configuration:**

- Add to `GatewayConfig`:
  ```typescript
  cacheConfig?: {
    maxToolSchemas: number; // Default: 1000
    schemaTTLMs: number;    // Default: 86400000 (24h)
  }
  ```

**Related:**

- Epic 2: DAG Execution & Production Readiness
- Story 2.4: MCP Gateway Integration avec Claude Code

---

**Location:**

- **File:** `src/graphrag/graph-engine.ts`
- **Method:** `buildDAG()`

**Root Cause:**

```typescript
for (let i = 0; i < candidates.length; i++) {
  for (let j = 0; j < i; j++) {
    // ❌ Only looks backwards
    // Dependencies missed if parent is at index > i
  }
}
```

**Fix Required:**
Implement Full Adjacency Matrix approach (ADR-024):

1. Compare all N\*N pairs regardless of list order
2. Add dependencies for any detected path (Parent -> Child)
3. Run topological sort to detect/break cycles

**Related:** ADR-024

---

### BUG-006: Hybrid Search Logic Not Used by Suggester

**Severity:** CRITICAL (P0)
**Status:** Open
**Discovered:** 2025-11-26 (Code Review)
**Estimate:** 4 hours

**Impact:**

- `execute_dag` uses naive Vector Search while advanced Hybrid Search exists but is unused
- Implicit dependencies (graph-based) are missed
- Inconsistent results between `search_tools` (smart) and `execute_dag` (dumb)

**Location:**

- **File:** `src/graphrag/dag-suggester.ts`
- **Method:** `suggestDAG()`

**Fix Required:**

1. Extract hybrid search logic from `src/mcp/gateway-server.ts` to `GraphRAGEngine` (ADR-022)
2. Implement Dynamic Candidate Expansion (ADR-023)
3. Update `DAGSuggester` to use new `graphEngine.searchToolsHybrid()`

**Related:** ADR-022, ADR-023, Story 5.1

## 🟡 HIGH - Performance & Stability

**Priority:** P1 - Fix within 2 weeks

### PERF-001: EventStream Array Unbounded Growth

**Severity:** HIGH
**Status:** Open
**Discovered:** 2025-11-24 (Comprehensive Audit)
**Estimate:** 3 hours

**Impact:**

- `events` array grows unbounded in memory
- Long-running workflows cause memory exhaustion
- No cleanup or ring buffer implementation

**Location:**

- **File:** `src/dag/event-stream.ts`
- **Line:** 34
- **Property:** `private events: ExecutionEvent[] = [];`

**Fix Required:**
Implement ring buffer with configurable size:

```typescript
private events: ExecutionEvent[] = [];
private maxEvents: number = 1000; // Configurable

async emit(event: ExecutionEvent): Promise<void> {
  this.events.push(event);

  // Ring buffer: Remove oldest if exceeds max
  if (this.events.length > this.maxEvents) {
    this.events.shift();
  }

  this.stats.eventsEmitted++;
}
```

**Validation:**

- Add test: Emit 2000 events → verify array capped at 1000
- Memory profiling: 1000 workflows → verify stable memory

---

### PERF-002: Vector Search Query Re-encoding

**Severity:** MEDIUM
**Status:** Open
**Discovered:** 2025-11-24 (Comprehensive Audit)
**Estimate:** 4 hours

**Impact:**

- Every query re-encodes embedding even if query cached
- Unnecessary BGE-M3 inference calls
- P95 latency inflated by ~20-50ms

**Location:**

- **File:** `src/vector/search.ts`
- **Method:** `searchTools()`

**Fix Required:**
Implement LRU cache for query embeddings:

```typescript
import { LRUCache } from "lru-cache";

private queryEmbeddingCache = new LRUCache<string, Float32Array>({
  max: 100,  // Last 100 queries
  ttl: 1000 * 60 * 5, // 5 min TTL
});

async searchTools(query: string, topK: number): Promise<SearchResult[]> {
  // Check cache first
  let queryEmbedding = this.queryEmbeddingCache.get(query);

  if (!queryEmbedding) {
    queryEmbedding = await this.embeddings.encode(query);
    this.queryEmbeddingCache.set(query, queryEmbedding);
  }

  // ... rest of search logic
}
```

**Expected Improvement:**

- Cache hit rate: 60-70% (common queries repeated)
- P95 latency: <100ms → <50ms on cache hit

---

### PERF-003: GraphRAG Metrics Recomputation on Every Sync

**Severity:** MEDIUM
**Status:** Open
**Discovered:** 2025-11-24 (Comprehensive Audit)
**Estimate:** 5 hours

**Impact:**

- PageRank + Louvain recalculated on every graph sync
- Unnecessary computation if graph unchanged
- Sync latency ~150-200ms even when no changes

**Location:**

- **File:** `src/graphrag/graph-engine.ts`
- **Method:** `syncFromDatabase()`

**Fix Required:**
Implement dirty flag + lazy recomputation:

```typescript
private isDirty: boolean = false;
private lastSyncHash: string = "";

async syncFromDatabase(): Promise<void> {
  const currentHash = await this.computeGraphHash();

  if (currentHash === this.lastSyncHash) {
    // No changes, skip recomputation
    return;
  }

  // Graph changed, mark dirty and sync
  this.isDirty = true;
  this.lastSyncHash = currentHash;

  // ... sync logic
}

getPageRank(nodeId: string): number {
  if (this.isDirty) {
    this.recomputeMetrics(); // Lazy recomputation
    this.isDirty = false;
  }
  return this.pageRankCache.get(nodeId) ?? 0;
}
```

**Expected Improvement:**

- Sync latency: ~150ms → <10ms on no-change case
- Metrics recomputation: Only when graph structure changes

---

## 🟢 MEDIUM - Code Quality

**Priority:** P2 - Fix within 1 month

### QUALITY-001: Type Safety - Eliminate `any` Usage

**Severity:** MEDIUM
**Status:** Open
**Discovered:** 2025-11-24 (Comprehensive Audit)
**Estimate:** 1 week

**Impact:**

- 10+ occurrences of `any` type
- Loss of compile-time type checking
- IntelliSense degraded, harder maintenance

**Occurrences:**

1. `src/mcp/gateway-server.ts:153-165` - Request handlers
2. `src/dag/controlled-executor.ts:163` - Layer type
3. `src/vector/embeddings.ts` - Model instance
4. [7 more locations]

**Fix Strategy:**
Replace all `any` with:

- Specific types where structure known
- `unknown` + type guards where structure unknown
- Runtime validation with Zod or similar

**Example Fix:**

```typescript
// BEFORE
async (request: any) => await this.handleListTools(request);

// AFTER
interface ListToolsRequest {
  params?: {
    query?: string;
    category?: string;
  };
}

async (request: ListToolsRequest) => {
  // Runtime validation
  if (request.params?.query && typeof request.params.query !== "string") {
    throw new ValidationError("query must be string");
  }
  return await this.handleListTools(request);
};
```

**Validation:**

- Enable `noImplicitAny: true` strict mode
- Zero `any` types in codebase
- All tests passing

---

### QUALITY-002: Refactor Large Files (>1000 LOC)

**Severity:** MEDIUM
**Status:** Open
**Discovered:** 2025-11-24 (Comprehensive Audit)
**Estimate:** 1 week

**Impact:**

- `gateway-server.ts`: 1,055 LOC (too large)
- `controlled-executor.ts`: 1,251 LOC (too large)
- Difficult to maintain, high cognitive load

**Refactoring Plan:**

**gateway-server.ts (1,055 LOC) → 3 modules:**

```
src/mcp/
  ├─ gateway-server.ts (300 LOC - orchestration)
  ├─ gateway-handlers.ts (400 LOC - request handlers)
  └─ gateway-tools.ts (300 LOC - tool management)
```

**controlled-executor.ts (1,251 LOC) → 3 modules:**

```
src/dag/
  ├─ controlled-executor.ts (400 LOC - orchestration)
  ├─ executor-commands.ts (400 LOC - command handlers)
  └─ executor-speculation.ts (400 LOC - speculative execution)
```

**Validation:**

- Max file size: 500 LOC (guideline)
- All tests passing
- No breaking changes to public APIs

---

## ⚪ LOW - Technical Debt

**Priority:** P3 - Address as time permits

### DEBT-001: Sandbox Temp File Cleanup on Error

**Severity:** LOW
**Status:** Open
**Discovered:** 2025-11-24 (Comprehensive Audit)
**Estimate:** 2 hours

**Impact:**

- Temp files potentially not deleted on sandbox error
- Disk space leak on repeated failures
- Minor issue (tmp cleaned on reboot)

**Location:**

- **File:** `src/sandbox/executor.ts`
- **Method:** `execute()`

**Fix Required:**
Add try/finally cleanup:

```typescript
async execute(code: string, context: Record<string, unknown>) {
  const tempFile = await this.createTempFile(code);

  try {
    // ... execution logic
  } finally {
    // Ensure cleanup even on error
    await this.deleteTempFile(tempFile);
  }
}
```

---

### DEBT-002: Console Logging Not Captured in Sandbox

**Severity:** LOW
**Status:** Open
**Discovered:** 2025-11-24 (Comprehensive Audit)
**Estimate:** 3 hours

**Impact:**

- `console.log()` in sandbox code not captured
- Debugging difficult for users
- CodeExecutionResponse returns empty `logs: []`

**Location:**

- **File:** `src/mcp/gateway-server.ts`
- **Line:** 768
- **Comment:** `logs: [], // TODO: Capture console logs in future enhancement`

**Fix Required:**
Implement stdout/stderr capture in sandbox subprocess:

```typescript
const process = new Deno.Command("deno", {
  args: ["run", "--allow-env", tempFile],
  stdout: "piped", // ✅ Capture stdout
  stderr: "piped", // ✅ Capture stderr
});

const { stdout, stderr } = await process.output();
const logs = [
  new TextDecoder().decode(stdout),
  new TextDecoder().decode(stderr),
].filter((log) => log.length > 0);
```

---

## Metrics & Tracking

**Total Open Issues:** 10 (3 resolved)

- 🔴 CRITICAL: 0 ✅ (was 3)
- 🟡 HIGH: 3 (12h estimate)
- 🟢 MEDIUM: 2 (2 weeks estimate)
- ⚪ LOW: 5 (ongoing)

**Sprint 0 Target (1 week):**

- ✅ Fix all 3 CRITICAL bugs - DONE (2025-11-25)
- ✅ BUG-001: CommandQueue race condition - RESOLVED
- ✅ BUG-002: EventStream subscriber leak - RESOLVED (already fixed)
- ✅ BUG-004: Rate limiter granularity - RESOLVED

**Sprint 1 Target (2 weeks):**

- Address 3 HIGH priority items
- Begin QUALITY-001 (type safety pass)

---

**Last Updated:** 2025-11-24
**Next Review:** 2025-12-01

---

## 🔮 FUTURE ENHANCEMENTS - Deferred Features

**Priority:** P4 - Explicitly deferred per ADR-018 until proven need
**Review Date:** 2026-02-24 (3 months post-Epic 2.5 completion)

### DEFER-001: inject_tasks Command Handler

**Severity:** LOW (P4)
**Status:** Deferred (ADR-018)
**Decision Date:** 2025-11-24

**Rationale:** Redundant with `replan_dag` command

```typescript
// CURRENT: Intent-based replanning (PREFERRED)
executor.enqueueCommand({
  type: "replan_dag",
  new_requirement: "parse XML files found",
  available_context: { xml_files: ["data.xml"] }
});
// → DAGSuggester queries GraphRAG → injects tasks intelligently

// DEFERRED: Manual task construction
executor.enqueueCommand({
  type: "inject_tasks",
  tasks: [
    { id: "parse_xml", tool: "xml:parse", arguments: {...}, depends_on: [...] }
  ]
});
```

**Reconsider if:**

- > 10 user complaints about replan_dag speed/unpredictability in 3 months
- GraphRAG query optimization exhausted
- Proven use case where manual control superior

**Mitigation before reconsidering:**

- Optimize GraphRAG query speed (currently ~50ms)
- Improve DAGSuggester confidence scores
- Add caching for common replan patterns

**Estimate if needed:** 4h implementation + 2h tests

**Related:** ADR-018 (Command Handlers Minimalism)

---

### DEFER-002: skip_layer Command Handler

**Severity:** LOW (P4)
**Status:** Deferred (ADR-018)
**Decision Date:** 2025-11-24

**Rationale:** Safe-to-fail branches (Epic 3.5) architectural pattern covers use cases

```typescript
// CURRENT: Safe-to-fail pattern (PREFERRED)
{
  id: "visualize",
  tool: "viz:create",
  side_effects: false,  // ← Marked safe-to-fail
  depends_on: ["analyze"]
}
// → If analyze fails, visualize skips naturally (no command needed)

// DEFERRED: Explicit skip command
executor.enqueueCommand({
  type: "skip_layer",
  target: "next",
  reason: "analysis failed, skip visualization"
});
```

**Reconsider if:**

- > 5 proven use cases where conditional skip needed
- Safe-to-fail pattern insufficient for use case
- Requirement for mid-execution layer skip (not failure-based)

**Mitigation before reconsidering:**

- Enhance safe-to-fail logic (conditional dependencies)
- Implement pre-conditions for tasks
- Add layer-level side_effects configuration

**Estimate if needed:** 2h implementation + 2h tests

**Related:** ADR-018, ADR-016 (Safe-to-fail branches)

---

### DEFER-003: modify_args Command Handler

**Severity:** LOW (P4)
**Status:** Deferred (ADR-018)
**Decision Date:** 2025-11-24

**Rationale:** No proven HIL correction workflow yet

```typescript
// POSSIBLE FUTURE: HIL correction workflow
executor.enqueueCommand({
  type: "modify_args",
  task_id: "create_issue",
  new_arguments: { assignee: "correct-username" },
  merge_strategy: "merge",
});
```

**Reconsider if:**

- > 3 user requests for runtime argument modification
- HIL correction workflow emerges in production
- Real-world use case where replan_dag too heavy

**Mitigation before reconsidering:**

- Validate replan_dag can't cover use case
- Design clear merge/replace semantics
- Consider security implications (arg modification risks)

**Estimate if needed:** 2h implementation + 1h tests

**Related:** ADR-018, Epic 4 (Adaptive Learning - may introduce HIL correction)

---

### DEFER-004: checkpoint_response Command Handler

**Severity:** LOW (P4)
**Status:** Deferred (ADR-018)
**Decision Date:** 2025-11-24

**Rationale:** Composition of existing handlers sufficient

```typescript
// CURRENT: Composition pattern (PREFERRED)
executor.enqueueCommand({
  type: "approval_response",
  checkpoint_id: "chk123",
  approved: true
});
// If modifications needed:
executor.enqueueCommand({
  type: "replan_dag",
  new_requirement: "adjust approach based on feedback"
});

// DEFERRED: Complex checkpoint_response
executor.enqueueCommand({
  type: "checkpoint_response",
  checkpoint_id: "chk123",
  action: "modify_and_continue",
  modifications: [...]
});
```

**Reconsider if:**

- > 5 use cases where composition insufficient
- Performance issue with multiple commands
- Transactional requirement (modify + continue atomic)

**Mitigation before reconsidering:**

- Validate composition pattern works for all cases
- Optimize command queue processing if performance issue
- Consider transaction semantics carefully

**Estimate if needed:** 3h implementation + 2h tests

**Related:** ADR-018, Story 2.5-2 (Checkpoints)

---

**Review Process:**

- Monthly review during retrospectives
- Track user feedback for deferred features
- Reassess after Epic 2.5, 3.5, 4 completion
- Decision authority: Tech Lead (BMad)

**Approval Required if Reconsidering:**

- [ ] Evidence of proven need (>threshold)
- [ ] Architecture review (no better alternative)
- [ ] Compatibility check (no breaking changes)
- [ ] Test strategy defined
- [ ] BMad approval

---

## ✅ RESOLVED - Archive

### BUG-001: Race Condition in CommandQueue.processCommands()

**Status:** ✅ RESOLVED (2025-11-25)
**Resolution:** Added `drainSync()` method to AsyncQueue.

### BUG-002: EventStream Subscriber Memory Leak

**Status:** ✅ RESOLVED (already fixed in codebase)
**Resolution:** Code already had try/finally block.

### BUG-004: Rate Limiter Per-Server Instead of Per-Tool

**Status:** ✅ RESOLVED (2025-11-25)
**Resolution:** Changed rate limit key from `serverId` to `toolId`.

---

**Last Updated:** 2025-11-26
**Next Review:** 2025-12-01
