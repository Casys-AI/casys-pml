# Retrospective Epic 3.5 - Speculative Execution with Sandbox Isolation

**Date**: 2026-02-24
**Epic Status:** DONE (2025-11-28)
**Stories:** 2/2 completed
**Tests:** 60 total (14 + 46)
**Calendar time:** 2025-11-26 to 2025-11-28 (3 days)

---

## 1. Epic Summary

Epic 3.5 delivered the core differentiating feature of PML: **speculative execution with sandbox isolation**. The system predicts likely next actions using GraphRAG community detection and co-occurrence patterns, executes them speculatively in a Deno sandbox, and serves cached results at near-zero latency when the prediction is correct. Wrong predictions are discarded with zero side effects.

### Stories Completed

| Story  | Title                                       | Tests | Review Date |
| ------ | ------------------------------------------- | ----- | ----------- |
| 3.5-1  | DAG Suggester & Speculative Execution       | 14    | 2025-11-26  |
| 3.5-2  | Confidence-Based Speculation & Rollback     | 46    | 2025-11-28  |

**Key deliverables:**
- `predictNextNodes()` on DAGSuggester with confidence scoring (co-occurrence + Adamic-Adar + PageRank)
- `SpeculationManager` for decision logic, threshold control, and metrics
- `SpeculativeExecutor` for sandbox-isolated parallel execution with AbortController timeout
- Bidirectional integration with `AdaptiveThresholdManager` (read threshold, write outcomes)
- YAML config loader with validation, CLI commands (`pml speculation config/stats`)
- Dangerous operations blacklist (delete, deploy, payment, send_email, execute_shell)
- Pattern reinforcement + import/export for portability

---

## 2. What Went Well

### Clean Story Sequencing
Story 3.5-1 built the core mechanism (prediction, execution, caching). Story 3.5-2 completed the control plane (config, CLI, timeout, pattern persistence). The split was natural -- 3.5-1 was "make it work", 3.5-2 was "make it controllable." No overlap, no gaps.

### Foundation Work Paid Off
Epics 2.5 (ControlledExecutor, event stream), 3 (DenoSandboxExecutor), and 4 (EpisodicMemoryStore, AdaptiveThresholdManager) were all prerequisites. Every integration point already had hooks ready:
- `captureSpeculationStart()` placeholder existed in ControlledExecutor from Story 4.1d
- `AdaptiveThresholdManager` was already implemented with sliding window algorithm
- Sandbox isolation was production-hardened from Epic 3

This is the payoff of building foundations before features.

### Architecture Separation
Three classes with clean responsibilities:
- `SpeculationManager` -- decision logic and metrics (pure logic, no I/O)
- `SpeculativeExecutor` -- sandbox execution and caching (I/O layer)
- `DAGSuggester.predictNextNodes()` -- prediction algorithm (GraphRAG queries)

No circular dependencies. Each class testable in isolation.

### Zero Code Review Issues
Both stories received APPROVED with zero blocking findings. Story 3.5-2 review found literally zero issues at any severity. That is unusual and worth noting -- it suggests the story specifications were precise enough that implementation matched expectations exactly.

### Rapid Delivery
3 calendar days for the entire epic, within the 3-4h estimate. One of the fastest epics relative to value delivered.

---

## 3. Challenges & Struggles

### Speculation Code is Still a Placeholder
`generateSpeculationCode()` in `speculative-executor.ts` returns mock preparation metadata, not actual tool results. The review called it "acceptable for MVP" but this means the 0ms latency claim is aspirational, not real yet. True speculative execution requires MCP tool calls within the sandbox, which was deferred.

**Impact**: The feature works architecturally but the cache stores preparation metadata rather than real tool outputs. The latency win is partial.

### Partial AC Coverage on 3.5-1
AC #10 (performance benchmark <50ms) was deferred -- no benchmark test exists. AC #12 (agent hints via CommandQueue) was only partially implemented.

### setInterval Memory Leak Risk
`SpeculativeExecutor` uses `setInterval` for cache cleanup. If `destroy()` isn't called, it leaks. `ControlledExecutor.disableSpeculation()` handles this, but any standalone use without cleanup is a latent bug.

### Pattern Reinforcement Bootstrapping
No cold-start mechanism. If GraphRAG has no edges for a tool pair, speculation can never trigger for it. The system depends on either user-defined workflows or prior execution history to bootstrap patterns.

---

## 4. Key Lessons Learned

1. **Hooks-first architecture works.** Planting integration hooks in earlier stories (e.g., `captureSpeculationStart()` in 4.1d) made Epic 3.5 trivially fast. When you know a feature is coming, stub the integration point early. The cost is near zero and the payoff is significant.

2. **Small epics can deliver flagship features.** 2 stories, 60 tests, 3 days -- and this was "THE feature" (ADR-006). The heavy lifting was in prerequisites (Epic 2.5, 3, 4). The lesson: if a feature requires 4 epics of foundation, plan those foundations explicitly. The capstone epic should be small.

3. **MVP speculation is architectural, not functional.** The architecture is sound (predict, execute in sandbox, cache, validate, discard on miss). But without real MCP execution in the sandbox, the user-facing value is incomplete. Calling this "done" required honest labeling of what "done" means here.

4. **Config + CLI + validation is half the work.** Story 3.5-2 was 46 tests for what is essentially infrastructure: YAML config, CLI commands, timeout handling, bounds validation. This is often underestimated.

---

## 5. Technical Debt

| Item | Severity | Notes |
| ---- | -------- | ----- |
| `generateSpeculationCode()` placeholder | MEDIUM | Returns mock, not real tool execution. Blocked on MCP-in-sandbox integration. |
| No performance benchmark test | LOW | AC #10 requires <50ms overhead. No benchmark exists. |
| `setInterval` cleanup dependency | LOW | Requires manual `destroy()` call. Not enforced by type system. |
| Agent hint CommandQueue integration | LOW | `speculate_hint` command type not registered in CommandQueue. |
| Cold-start bootstrap gap | LOW | No speculation possible if GraphRAG has zero edges for a tool pair. |

---

## 6. Patterns & Insights

- **AbortController + Promise.race for timeout**: Used in `speculative-executor.ts`. Reusable for any bounded async operation. Later referenced as "template for future timeout scenarios."

- **YAML config + validation + CLI**: The trio of config loader + CLI + bounds validation is a clean template for any future YAML-driven feature config.

- **Non-blocking event capture**: Fire-and-forget `.catch()` pattern for EpisodicMemoryStore capture. Ensures speculation never blocks the main workflow.

- **Test Distribution Skew**: 3.5-1 had 14 tests (core logic), 3.5-2 had 46 tests (config + executor + manager). The 3:1 ratio reflects reality: control/config/validation code needs more test coverage than algorithm code.

---

## 7. Recommendations for Future Work

1. **P1: Complete Real Speculative Execution (Epic 12)** - Story 12-4 should replace `generateSpeculationCode()` with actual MCP tool calls via WorkerBridge.

2. **P2: Add Performance Benchmark** - Create a `Deno.bench` test asserting `predictNextNodes()` overhead < 50ms.

3. **P3: Bootstrap Mechanism for Cold Start** - Auto-seed GraphRAG edges from workflow-templates.yaml at startup.

4. **P3: Enforce Cleanup via Disposable Pattern** - Use `Symbol.asyncDispose` on `SpeculativeExecutor` to prevent the `setInterval` leak.

---

**Verdict:** Fastest epic relative to value. Clean execution thanks to foundation work in Epics 2.5, 3, 4. Architecture is sound but real execution remains a placeholder (Epic 12).
