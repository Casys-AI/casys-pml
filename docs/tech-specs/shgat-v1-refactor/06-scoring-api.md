# 06 - Scoring API Changes

**Parent**: [00-overview.md](./00-overview.md)
**Depends on**: [04-message-passing.md](./04-message-passing.md)

---

## Modified `scoreAllCapabilities()`

```typescript
scoreAllCapabilities(
  intentEmbedding: number[],
  targetLevel?: number  // NEW: optional level filter
): AttentionResult[] {
  // Run multi-level forward pass
  const { H, E } = this.forward();

  const results: AttentionResult[] = [];
  const groupWeights = this.computeFusionWeights();
  const intentProjected = this.projectIntent(intentEmbedding);

  // Score capabilities at ALL levels (or filtered level)
  const levelsToScore = targetLevel !== undefined
    ? [targetLevel]
    : Array.from(this.hierarchyLevels.keys());

  for (const level of levelsToScore) {
    const capsAtLevel = Array.from(this.hierarchyLevels.get(level) ?? []);
    const E_level = E.get(level)!;

    capsAtLevel.forEach((capId, idx) => {
      const cap = this.capabilityNodes.get(capId)!;
      const capPropagatedEmb = E_level[idx];

      // Use PROPAGATED embedding (includes hierarchy context)
      const intentSim = this.cosineSimilarity(intentProjected, capPropagatedEmb);
      const features = cap.hypergraphFeatures || DEFAULT_HYPERGRAPH_FEATURES;

      // 3-head scoring (unchanged)
      const semanticScore = intentSim * this.featureWeights.semantic;
      const structureScore =
        (features.hypergraphPageRank + (features.adamicAdar ?? 0)) *
        this.featureWeights.structure;
      const temporalScore =
        (features.recency + (features.heatDiffusion ?? 0)) *
        this.featureWeights.temporal;

      const finalScore =
        groupWeights.semantic * semanticScore +
        groupWeights.structure * structureScore +
        groupWeights.temporal * temporalScore;

      results.push({
        capabilityId: capId,
        score: Math.max(0, Math.min(finalScore, 0.95)),
        headWeights: [groupWeights.semantic, groupWeights.structure, groupWeights.temporal],
        headScores: [semanticScore, structureScore, temporalScore],
        recursiveContribution: 0, // TODO: compute from attention weights
        hierarchyLevel: level,  // NEW field
      });
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
```

---

## New AttentionResult Field

```typescript
interface AttentionResult {
  capabilityId: string;
  score: number;
  headWeights: number[];
  headScores: number[];
  recursiveContribution: number;
  featureContributions?: Record<string, number>;
  toolAttention?: number[];

  hierarchyLevel: number;  // NEW: 0, 1, 2, ...
}
```

---

## v2 Compatibility

**v2** (Direct embeddings + TraceFeatures):
- No changes required
- `scoreAllCapabilitiesV2()` bypasses message passing
- Can optionally add `hierarchyLevel` as a TraceStats feature

```typescript
// v2 unchanged - uses raw embeddings
scoreAllCapabilitiesV2(
  intentEmbedding: number[],
  traceFeaturesMap: Map<string, TraceFeatures>,
  contextToolIds: string[] = [],
): AttentionResult[] {
  // Uses cap.embedding directly, not E[level][idx]
  // Optionally add hierarchyLevel to traceStats
}
```

---

## v3 Hybrid Compatibility

**v3** (Hybrid): Uses multi-level forward pass + TraceFeatures

```typescript
scoreAllCapabilitiesV3(
  intentEmbedding: number[],
  traceFeaturesMap: Map<string, TraceFeatures>,
  contextToolIds: string[] = [],
): AttentionResult[] {
  // Multi-level forward pass
  const { H, E } = this.forward();

  for (const [capId, cap] of this.capabilityNodes) {
    const level = cap.hierarchyLevel;
    const capsAtLevel = Array.from(this.hierarchyLevels.get(level) ?? []);
    const idx = capsAtLevel.indexOf(capId);

    // KEY: Use PROPAGATED embedding from correct level
    const features: TraceFeatures = {
      intentEmbedding,
      candidateEmbedding: E.get(level)![idx],  // ← Propagated, not raw!
      contextEmbeddings,
      contextAggregated,
      traceStats: providedFeatures?.traceStats ?? defaultStats,
    };

    // ... rest of v3 scoring
  }
}
```

---

## Level Filtering

```typescript
// Score only leaf capabilities (level 0)
const leafResults = shgat.scoreAllCapabilities(intent, 0);

// Score only meta-capabilities (level 1)
const metaResults = shgat.scoreAllCapabilities(intent, 1);

// Score all levels (default)
const allResults = shgat.scoreAllCapabilities(intent);
```

---

## Acceptance Criteria

- [ ] `scoreAllCapabilities()` uses multi-level forward pass
- [ ] `targetLevel` optional parameter works
- [ ] `hierarchyLevel` field in AttentionResult
- [ ] v2 API unchanged (bypasses message passing)
- [ ] v3 hybrid uses `E.get(level)[idx]` for propagated embedding
- [ ] Level filtering works correctly
