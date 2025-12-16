# Tech Spec: Large Files Refactoring

## Overview

This tech spec outlines the refactoring strategy for 6 oversized TypeScript files in the AgentCards codebase. These files violate the Single Responsibility Principle (SRP) and create significant maintenance, testing, and code review challenges.

## Problem Statement

### Current State

| File | Lines | Responsibilities | Testability | Status |
|------|-------|-----------------|-------------|--------|
| `gateway-server.ts` | 3,236 | 8+ domains | Poor | Phase 1 |
| `graph-engine.ts` | ~~2,367~~ **336** | 6+ domains | ~~Poor~~ **Good** | ✅ **DONE** |
| `controlled-executor.ts` | ~~2,313~~ **841** | 8+ domains | ~~Poor~~ **Good** | ✅ **DONE** |
| `dag-suggester.ts` | 2,023 | 5+ domains | Moderate | Phase 4 |
| `sandbox/executor.ts` | 1,198 | 4+ domains | Moderate | Phase 5 |
| `capability-store.ts` | 1,052 | 3+ domains | Moderate | Phase 6 |

### Impact

- **Code Review**: Files exceed context window limits for reviewers
- **Testing**: High mock complexity, poor isolation
- **Onboarding**: New developers overwhelmed by monolithic files
- **Bug Isolation**: Changes in one area can break unrelated functionality
- **Parallel Development**: Merge conflicts frequent in large files

## Target Architecture

### Design Principles

1. **Max 500 lines per file** (hard limit)
2. **Single Responsibility**: Each file handles one concern
3. **Dependency Injection**: Loose coupling via interfaces
4. **Testability First**: Each module independently testable

---

## Phase 1: Gateway Server (P0 - Critical)

### Current: `src/mcp/gateway-server.ts` (3,236 lines)

**Identified Responsibilities:**
1. Server lifecycle management
2. Connection handling & pooling
3. Tool registry & discovery
4. Request routing & dispatching
5. Response formatting
6. Error handling & recovery
7. Metrics collection
8. Health checks

### Target Structure

```
src/mcp/
├── gateway-server.ts           # ~200 lines - Orchestration only
├── server/
│   ├── lifecycle.ts            # Start/stop/restart logic
│   └── health.ts               # Health checks, readiness probes
├── connections/
│   ├── manager.ts              # Connection lifecycle
│   ├── pool.ts                 # Connection pooling
│   └── types.ts                # Connection-related types
├── routing/
│   ├── router.ts               # Request routing logic
│   ├── dispatcher.ts           # Request dispatching
│   └── middleware.ts           # Request/response middleware
├── registry/
│   ├── tool-registry.ts        # Tool registration & lookup
│   └── discovery.ts            # Tool discovery mechanisms
├── responses/
│   ├── formatter.ts            # Response formatting
│   └── errors.ts               # Error response handling
└── metrics/
    └── collector.ts            # Metrics collection
```

### Migration Strategy

1. **Extract Types First**: Move all interfaces/types to dedicated files
2. **Extract Stateless Utilities**: Pure functions that don't depend on class state
3. **Extract Independent Modules**: Modules with clear boundaries (metrics, health)
4. **Refactor Core**: Split remaining logic into router, dispatcher, registry
5. **Integration Tests**: Ensure e2e behavior unchanged

### Acceptance Criteria

- [ ] No file exceeds 500 lines
- [ ] All existing tests pass
- [ ] New unit tests for each extracted module (>80% coverage)
- [ ] Zero breaking changes to public API
- [ ] Performance: No regression in request latency

---

## Phase 2: Graph Engine (P1 - High) ✅ COMPLETED

### Original: `src/graphrag/graph-engine.ts` (2,367 lines)
### Current: `src/graphrag/graph-engine.ts` (336 lines)

**Identified Responsibilities:**
1. Graph data structure management
2. PageRank computation
3. Louvain community detection
4. Path finding (Dijkstra)
5. DAG building
6. Database sync
7. Event emission
8. Hybrid search coordination

### Implemented Structure

```
src/graphrag/
├── graph-engine.ts             # 336 lines - Facade/orchestrator ✅
├── core/
│   └── graph-store.ts          # 364 lines - Graphology wrapper, types ✅
├── algorithms/
│   ├── pagerank.ts             # 104 lines - PageRank computation ✅
│   ├── louvain.ts              # 145 lines - Community detection ✅
│   ├── pathfinding.ts          # 198 lines - Dijkstra, shortest path ✅
│   ├── adamic-adar.ts          # 228 lines - Similarity metrics ✅
│   └── edge-weights.ts         # 112 lines - ADR-041 weight config ✅
├── dag/
│   ├── builder.ts              # ~120 lines - DAG construction ✅
│   └── execution-learning.ts   # ~210 lines - Execution learning ✅
├── sync/
│   ├── db-sync.ts              # 295 lines - Database synchronization ✅
│   └── event-emitter.ts        # 237 lines - Graph event emission ✅
├── search/
│   ├── hybrid-search.ts        # 301 lines - Semantic + graph hybrid search ✅
│   └── autocomplete.ts         # 153 lines - Tool autocomplete + parseToolId ✅
└── metrics/
    └── collector.ts            # 541 lines - Dashboard metrics ✅
```

### Migration Completed

1. ✅ **Extract Algorithms**: Each algorithm is a pure function module
2. ✅ **Extract DB Sync**: Persistence concerns separated
3. ✅ **Extract Events**: Event emission as independent module
4. ✅ **Extract DAG Building**: buildDAG() and execution learning extracted
5. ✅ **Create Facade**: GraphRAGEngine is now a thin orchestrator (336 lines)

---

## Phase 3: Controlled Executor (P1 - High) ✅ COMPLETED

### Original: `src/dag/controlled-executor.ts` (2,313 lines)
### Current: `src/dag/controlled-executor.ts` (841 lines)

**Identified Responsibilities:**
1. DAG execution orchestration
2. Checkpoint management integration
3. HIL (Human-in-the-Loop) handling
4. AIL (Agent-in-the-Loop) handling
5. Speculative execution integration
6. Episodic memory capture
7. Permission escalation
8. State management

### Implemented Structure

```
src/dag/
├── controlled-executor.ts      # 841 lines - Core execution loop ✅
├── execution/
│   ├── task-router.ts          # 62 lines - Task type routing ✅
│   ├── code-executor.ts        # 162 lines - Code execution ✅
│   ├── capability-executor.ts  # 153 lines - Capability execution ✅
│   ├── dependency-resolver.ts  # 43 lines - Shared dep resolution ✅
│   └── index.ts                # 29 lines - Exports ✅
├── loops/
│   ├── hil-handler.ts          # 122 lines - Human-in-the-Loop logic ✅
│   ├── ail-handler.ts          # 39 lines - Agent-in-the-Loop logic ✅
│   ├── decision-waiter.ts      # 77 lines - Command queue waiting ✅
│   └── index.ts                # 24 lines - Exports ✅
├── speculation/
│   └── integration.ts          # 274 lines - Speculative execution hooks ✅
├── checkpoints/
│   └── integration.ts          # 104 lines - Checkpoint save/restore ✅
├── episodic/
│   └── capture.ts              # 263 lines - Event capture methods ✅
└── permissions/
    └── escalation-integration.ts # 55 lines - Permission escalation ✅
```

### Migration Completed

1. ✅ **Extract Capture Methods**: `captureTaskComplete`, `captureAILDecision`, etc. → `episodic/capture.ts`
2. ✅ **Extract HIL/AIL**: Decision loop handling → `loops/` module
3. ✅ **Extract Speculation**: Speculative execution → `speculation/integration.ts`
4. ✅ **Extract Checkpoints**: Checkpoint logic → `checkpoints/integration.ts`
5. ✅ **Extract Execution**: Task routing/execution → `execution/` module
6. ✅ **Code Review**: All 12 issues (5 HIGH, 4 MEDIUM, 3 LOW) resolved

### Code Review Results

See: `docs/sprint-artifacts/review-controlled-executor-refactor.md`

**Key Fixes:**
- H1: Removed unused `eventId` return from `captureSpeculationStart`
- H2: Added `CommandQueue.waitForCommand()` for proper async waiting (no CPU polling)
- H3: Added `isDecisionCommand()` type guard for runtime validation
- H4: Added AIL/HIL to `resumeFromCheckpoint` (security fix) - *Note: Blocked by HIL deadlock bug*
- H5: Fixed double emission of checkpoint events
- M2: Created shared `resolveDependencies()` utility
- M4: Added configurable timeouts to ExecutorConfig

### Known Issues

**BUG-HIL-DEADLOCK & BUG-AIL-ABORT**: Security tests exposed architectural deadlock in HIL/AIL handling.
- See: `docs/tech-specs/tech-spec-hil-permission-escalation-fix.md`
- Fix: Implement Deferred Escalation Pattern (Option A)
- Tests: `tests/dag/checkpoint-resume-security.test.ts` (will pass after fix)

---

## Phase 4: DAG Suggester (P2 - Medium)

### Current: `src/graphrag/dag-suggester.ts` (2,023 lines)

**Identified Responsibilities:**
1. DAG suggestion generation
2. Confidence calculation
3. Episodic memory integration
4. Capability prediction
5. Spectral clustering integration
6. Pattern import/export

### Target Structure

```
src/graphrag/
├── dag-suggester.ts            # ~300 lines - Main suggester
├── suggestion/
│   ├── confidence.ts           # Confidence calculation logic
│   ├── rationale.ts            # Rationale generation
│   └── ranking.ts              # Candidate ranking
├── prediction/
│   ├── next-nodes.ts           # predictNextNodes logic
│   ├── capabilities.ts         # Capability prediction
│   └── alternatives.ts         # Alternative suggestions
├── learning/
│   ├── episodic-adapter.ts     # Episodic memory integration
│   └── pattern-io.ts           # Import/export patterns
└── clustering/
    └── boost-calculator.ts     # Spectral clustering boost
```

---

## Phase 5: Sandbox Executor (P2 - Medium)

### Current: `src/sandbox/executor.ts` (1,198 lines)

### Target Structure

```
src/sandbox/
├── executor.ts                 # ~250 lines - Main executor
├── execution/
│   ├── deno-runner.ts          # Deno subprocess execution
│   ├── result-parser.ts        # Output parsing
│   └── timeout-handler.ts      # Timeout management
├── security/
│   ├── permission-mapper.ts    # Permission set mapping
│   └── path-validator.ts       # Path validation
└── tools/
    └── injector.ts             # Tool injection logic
```

---

## Phase 6: Capability Store (P3 - Low)

### Current: `src/capabilities/capability-store.ts` (1,052 lines)

### Target Structure

```
src/capabilities/
├── capability-store.ts         # ~300 lines - Main store
├── storage/
│   ├── crud.ts                 # Create/Read/Update/Delete
│   └── queries.ts              # Complex queries
├── search/
│   ├── context-search.ts       # searchByContext
│   └── semantic-search.ts      # Semantic matching
└── dependencies/
    └── manager.ts              # Dependency management
```

---

## Implementation Plan

### Sprint 1 (Week 1-2): Gateway Server
- Day 1-2: Extract types and interfaces
- Day 3-4: Extract stateless utilities (metrics, health)
- Day 5-6: Extract connection management
- Day 7-8: Extract routing and registry
- Day 9-10: Integration testing and cleanup

### Sprint 2 (Week 3-4): Graph Engine + Controlled Executor
- Parallel tracks for both files
- Algorithm extraction first (pure functions)
- Integration last

### Sprint 3 (Week 5): DAG Suggester + Sandbox Executor
- Confidence calculation extraction
- Prediction logic separation

### Sprint 4 (Week 6): Capability Store + Final Cleanup
- Query separation
- Final documentation

---

## Risk Mitigation

### Breaking Changes
- **Mitigation**: Maintain facade pattern - public API unchanged
- **Validation**: Integration tests before/after each phase

### Performance Regression
- **Mitigation**: Benchmark critical paths before refactoring
- **Validation**: Automated performance tests

### Test Coverage Gaps
- **Mitigation**: Write tests for extracted modules BEFORE extraction
- **Validation**: Coverage reports per module

---

## Success Metrics

1. **File Size**: All files under 500 lines
2. **Test Coverage**: >80% per module
3. **Build Time**: No regression
4. **Performance**: <5% latency increase acceptable
5. **Code Review**: Files reviewable in single session

---

## Appendix: File Analysis Summary

```
Total lines in scope: 12,189
Target total lines:   ~12,500 (split across ~40 files)
Average file size:    ~300 lines (vs current ~2,000)
```

### Files to Create (Estimated)

| Phase | New Files | Avg Lines | Status |
|-------|-----------|-----------|--------|
| Phase 1 | 12 | 270 | Pending |
| Phase 2 | 10 | 240 | ✅ **COMPLETED** (14 files created) |
| Phase 3 | 11 | 210 | ✅ **COMPLETED** (12 files created) |
| Phase 4 | 8 | 250 | Pending |
| Phase 5 | 6 | 200 | Pending |
| Phase 6 | 5 | 210 | Pending |
| **Total** | **52** | **~230** | **2/6 phases done** |
