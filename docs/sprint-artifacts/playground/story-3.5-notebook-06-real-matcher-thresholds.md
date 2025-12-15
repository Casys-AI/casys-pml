# Story 3.5: Refaire Notebook 06 avec Vrai Matcher et Thresholds

**Status:** ready-for-dev

## Story

As a **user**,
I want **notebook 06 to use the real Matcher and AdaptiveThresholdManager**,
So that **I see le vrai système de matching et d'adaptation**.

## Acceptance Criteria

1. Remplacer `SimulatedCapabilityStore` par `getCapabilityStore()`
2. Remplacer `SimulatedCapabilityMatcher` par `getCapabilityMatcher()`
3. Remplacer `SimulatedAdaptiveThresholdManager` par `getAdaptiveThresholdManager()`
4. Remplacer `SimulatedDependency` par vraies dépendances via `CapabilityStore.addDependency()`
5. Le scoring utilise le vrai algorithme (semantic + reliability + transitive)
6. Les thresholds adaptatifs montrent le vrai EMA
7. Les métriques benchmark reflètent de vraies exécutions
8. Conserver le "Wow Moment" ajouté en post-rétro

## Tasks / Subtasks

- [ ] Task 1: Update notebook initialization (AC: 1, 2, 3)
  - [ ] 1.1: Import all helpers from playground/lib/capabilities.ts
  - [ ] 1.2: Call resetPlaygroundState() at notebook start
  - [ ] 1.3: Replace all Simulated* class definitions with helper calls
- [ ] Task 2: Refactor Demo 1 - Capability Matching (AC: 2, 5)
  - [ ] 2.1: Use real CapabilityMatcher.findMatch()
  - [ ] 2.2: Show real scoring formula: semantic × reliability × transitive
  - [ ] 2.3: Display actual threshold from AdaptiveThresholdManager
- [ ] Task 3: Refactor Demo 2 - Hierarchical Composition (AC: 4)
  - [ ] 3.1: Use real CapabilityStore.addDependency() for edges
  - [ ] 3.2: Query real capability_dependency table
  - [ ] 3.3: Show actual edge types (dependency, contains, sequence, alternative)
- [ ] Task 4: Refactor Demo 3 - Transitive Reliability (AC: 5)
  - [ ] 4.1: Use real CapabilityMatcher.computeTransitiveReliability()
  - [ ] 4.2: Show actual min() calculation across dependency chain
  - [ ] 4.3: Verify with real DB queries
- [ ] Task 5: Refactor Demo 4 - Adaptive Thresholds (AC: 3, 6)
  - [ ] 5.1: Use real AdaptiveThresholdManager
  - [ ] 5.2: Show actual EMA calculation with learningRate=0.05
  - [ ] 5.3: Use real windowSize (or configurable for demo)
  - [ ] 5.4: Show thresholds persisted to adaptive_thresholds table
- [ ] Task 6: Update Benchmark Metrics (AC: 7)
  - [ ] 6.1: Replace hardcoded metrics with real execution counts
  - [ ] 6.2: Calculate actual reuse rate from CapabilityStore stats
  - [ ] 6.3: Measure actual latency with real WorkerBridge
- [ ] Task 7: Preserve Wow Moment (AC: 8)
  - [ ] 7.1: Keep before/after timing demo
  - [ ] 7.2: Use real WorkerBridge for actual execution timing
  - [ ] 7.3: Show genuine ~5x speedup with capability reuse

## Dev Notes

### Current Simulated Classes to Replace

Notebook 06 defines 4 simulated classes:

1. **SimulatedCapabilityStore** (cell-4) - Same as notebook 05
2. **SimulatedDependency** (cell-5) - Array-based dependency tracking
3. **SimulatedCapabilityMatcher** (cell-6) - Keyword-based matching
4. **SimulatedAdaptiveThresholdManager** (cell-16) - Simplified EMA

### Real Components to Use

| Simulated | Real | Helper Function |
|-----------|------|-----------------|
| SimulatedCapabilityStore | CapabilityStore | `getCapabilityStore()` |
| SimulatedCapabilityMatcher | CapabilityMatcher | `getCapabilityMatcher()` |
| SimulatedAdaptiveThresholdManager | AdaptiveThresholdManager | `getAdaptiveThresholdManager()` |
| SimulatedDependency | CapabilityStore.addDependency() | N/A (method on store) |

### Real CapabilityMatcher Scoring

From `src/capabilities/matcher.ts`:

```typescript
// ADR-038 Active Search scoring
const reliabilityFactor =
  capability.successRate < 0.5 ? 0.1 :  // Penalty
  capability.successRate > 0.9 ? 1.2 :  // Boost
  1.0;

const transitiveReliability = computeTransitiveReliability(capability);
const score = semanticScore * reliabilityFactor * transitiveReliability;
```

### Real Dependency API

```typescript
// Adding dependency
await capabilityStore.addDependency({
  fromCapabilityId: "cap-setup-environment",
  toCapabilityId: "cap-parse-config",
  edgeType: "dependency",
  confidenceScore: 0.95
});

// Querying dependencies
const deps = await capabilityStore.getDependencies("cap-setup-environment");
```

### Real AdaptiveThresholdManager

```typescript
const thresholdManager = await getAdaptiveThresholdManager();

// Record execution
await thresholdManager.recordExecution({
  capabilityId: "cap-1",
  success: true,
  latencyMs: 150,
  contextHash: "demo-context"
});

// Get current thresholds
const thresholds = thresholdManager.getThresholds();
// { explicitThreshold: 0.50, suggestionThreshold: 0.72 }

// Get metrics
const metrics = thresholdManager.getMetrics();
// { totalExecutions, successRate, avgLatency, thresholdAdjustments }
```

### Wow Moment Preservation

The "Wow Moment" demo (cell-23) must use real timing:

```typescript
// VANILLA - Actually call Claude API (or simulate realistic delay)
async function executeVanilla(): Promise<{ result; timeMs }> {
  // Real LLM call or realistic simulation
}

// WITH PML - Use real WorkerBridge with cached capability
async function executeWithPML(): Promise<{ result; timeMs; cached }> {
  const matcher = await getCapabilityMatcher();
  const match = await matcher.findMatch("read and parse config");

  if (match) {
    const bridge = await getWorkerBridge();
    // Execute cached capability code directly
  }
}
```

### Migration Strategy

1. Keep cell structure and markdown explanations
2. Replace class definitions with imports
3. Update API calls to match real signatures
4. Add real DB query cells for verification
5. Keep visualizations (Mermaid diagrams)

### Files to Modify

- `playground/notebooks/06-emergent-reuse.ipynb` - Main refactor
- `playground/lib/capabilities.ts` - Ensure all helpers exported

### References

- [Source: src/capabilities/matcher.ts] - CapabilityMatcher
- [Source: src/mcp/adaptive-threshold.ts] - AdaptiveThresholdManager
- [Source: ADR-038] - Capability Matching algorithm
- [Source: ADR-008] - Adaptive Thresholds with EMA
- [Source: ADR-042] - Transitive Reliability
- [Source: ADR-045] - Capability Dependencies

## Dev Agent Record

### Context Reference

Story created from Epic 3 definition in `docs/epics-playground.md`
Depends on Stories 3.1, 3.2, 3.3

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Identified all 4 simulated classes to replace
- Documented real API signatures
- Preserved Wow Moment requirements

### File List

Files to modify:
- `playground/notebooks/06-emergent-reuse.ipynb` (MAJOR REFACTOR)
- `playground/lib/capabilities.ts` (VERIFY exports)
