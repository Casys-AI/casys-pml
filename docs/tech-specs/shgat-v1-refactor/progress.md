# SHGAT v1 Refactor - Progress Tracker

**Last Updated**: 2025-01-XX

---

## Implementation Status

### Phase 1: Data Model
- [ ] `Member` type supports both tools and capabilities
- [ ] `CapabilityNode` has `members: Member[]` field
- [ ] `hierarchyLevel` field added to CapabilityNode
- [ ] Backward compat helpers (`getDirectTools()`, `getDirectCapabilities()`)
- [ ] `@deprecated` marker on `collectTransitiveTools()`

### Phase 2: Hierarchy Computation
- [ ] `computeHierarchyLevels()` implemented via topological sort
- [ ] Cycle detection throws error
- [ ] `hierarchyLevels: Map<number, Set<string>>` populated
- [ ] `maxHierarchyLevel` tracked

### Phase 3: Incidence Structure
- [ ] `toolToCapIncidence: Map<string, Set<string>>` for I₀
- [ ] `capToCapIncidence: Map<number, Map<string, Set<string>>>` for I_k
- [ ] `parentToChildIncidence` reverse mapping
- [ ] `buildMultiLevelIncidence()` implemented
- [ ] NO transitive closure (direct membership only)

### Phase 4: Message Passing
- [ ] `MultiLevelEmbeddings` interface defined
- [ ] `forward()` returns multi-level structure
- [ ] Upward pass: `aggregateToolsToCapabilities()`
- [ ] Upward pass: `aggregateCapabilitiesToCapabilities()`
- [ ] Downward pass: `propagateCapabilitiesToCapabilities()`
- [ ] Downward pass: `propagateCapabilitiesToTools()`
- [ ] Attention weights cached for interpretability

### Phase 5: Parameters
- [ ] `LevelParams` interface (W_child, W_parent, a_upward, a_downward)
- [ ] `levelParams: Map<number, LevelParams>` storage
- [ ] `initializeLevelParameters()` with Xavier init
- [ ] `getLevelParams(level)` accessor
- [ ] Parameter count formula verified

### Phase 6: Scoring API
- [ ] `scoreAllCapabilities()` uses multi-level forward pass
- [ ] `targetLevel` optional filter parameter
- [ ] `hierarchyLevel` field in AttentionResult
- [ ] v2 API unchanged
- [ ] v3 hybrid uses `E.get(cap.hierarchyLevel)[idx]`

### Phase 7: Training
- [ ] `ForwardCache` extended for multi-level
- [ ] `intermediateUpward` and `intermediateDownward` caching
- [ ] Gradient flow through upward pass
- [ ] Gradient flow through downward pass
- [ ] Backprop through all hierarchy levels

### Phase 8: Migration
- [ ] `migrateCapabilityNode()` legacy converter
- [ ] `addCapabilityLegacy()` backward compat API
- [ ] `parent_trace_id` DB column added
- [ ] `ExecutionTrace` interface updated
- [ ] `saveTrace()` accepts parentTraceId
- [ ] `buildHierarchy()` reconstruction utility

### Phase 9: Testing
- [ ] Unit tests: hierarchy level computation
- [ ] Unit tests: cycle detection
- [ ] Unit tests: upward aggregation
- [ ] Unit tests: downward propagation
- [ ] Unit tests: backward compatibility
- [ ] Integration test: end-to-end scoring
- [ ] Benchmark: old vs new implementation
- [ ] Performance: forward pass ≤ 2× old time
- [ ] Performance: memory ≤ old for L_max ≤ 3

---

## Acceptance Criteria Summary

| Category | Criteria | Status |
|----------|----------|--------|
| Data Model | `CapabilityNode.members` with `Member` type | ⬜ |
| Incidence | Multi-level structure, no transitive closure | ⬜ |
| Message Passing | Upward V→E^L_max, Downward E^L_max→V | ⬜ |
| Scoring | Uses correct level embeddings | ⬜ |
| Testing | All unit + integration tests pass | ⬜ |
| Performance | Forward ≤ 2× old, Memory ≤ old | ⬜ |

---

## Notes

_Add implementation notes, blockers, and decisions here._
