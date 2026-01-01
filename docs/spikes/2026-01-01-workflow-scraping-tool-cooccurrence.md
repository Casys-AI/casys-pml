# Spike: Workflow Scraping & Tool Co-occurrence for DR-DSP

**Date:** 2026-01-01
**Status:** Draft
**Related:** DR-DSP, SHGAT, pml:discover, pml:execute

## Context

### Current Architecture Gap

| API | Returns | Actionable |
|-----|---------|------------|
| `pml:discover` | tools + capabilities | Tools = informational only |
| `pml:execute` | capabilities only | Cannot suggest tools |
| `DAGSuggester` | capabilities only | Via CapabilityMatcher |

**Problem:** DR-DSP needs hyperedges to find paths. Without capabilities, no paths exist. Cold-start problem: new system has no capabilities → no suggestions.

### DR-DSP Hyperedge Structure

```typescript
interface Hyperedge {
  id: string;
  sources: string[];  // Input tools
  targets: string[];  // Output tools
  weight: number;     // Lower = better
}
```

**Key insight:** A simple edge `A → B` is a valid hyperedge with `sources: [A], targets: [B]`. DR-DSP doesn't require multi-node hyperedges.

## Proposal: Prior Patterns from Workflow Scraping

### Data Sources

| Source | Type | Accessibility |
|--------|------|---------------|
| **n8n** | Open source | Templates publicly available, API accessible |
| **Make** (Integromat) | Commercial | Template gallery, some public |
| **Zapier** | Commercial | Restrictive ToS, limited access |
| **Pipedream** | Open source | Good API access |
| **Activepieces** | Open source | Full access |

### What to Extract

```typescript
interface ScrapedWorkflow {
  source: "n8n" | "make" | "zapier" | "pipedream";
  nodes: Array<{
    service: string;    // "Google Sheets"
    action: string;     // "Read Row"
  }>;
  edges: Array<{
    from: number;       // node index
    to: number;
  }>;
  popularity?: number;  // downloads, uses
  isOfficial: boolean;
  lastUpdated: Date;
}
```

### Mapping to MCP Tools

```
Zapier "Google Sheets → Read Row"
   ↓ mapping (embedding similarity or manual)
MCP "mcp__google__sheets_read"
```

**Challenge:** Mapping confidence varies. Need to track:
- Exact match (manual mapping) → confidence 1.0
- Embedding similarity > 0.9 → confidence 0.8
- Fuzzy match → confidence 0.5

## Weight Calculation

### Option 1: Frequency-based (Simple)

```typescript
weight = BASE_PENALTY / Math.log(frequency + 1)

// Examples:
// sheets→slack (freq: 847) → weight = 0.68
// obscure→tool (freq: 3)   → weight = 3.3
```

### Option 2: Multi-factor (Complete)

```typescript
function calculateWeight(pattern: ScrapedPattern): number {
  const BASE_PENALTY = 2.0;  // Non-tested locally

  const freqBoost = Math.log10(pattern.frequency + 1);
  const trust = pattern.isOfficial ? 1.0 : 0.7;
  const recency = Math.exp(-0.1 * monthsOld(pattern.lastSeen));
  const mappingConf = pattern.mappingConfidence;

  return BASE_PENALTY / (freqBoost * trust * recency * mappingConf);
}
```

### Option 3: Bucket (MVP)

```typescript
function bucketWeight(frequency: number): number {
  if (frequency >= 100) return 0.5;  // Very common
  if (frequency >= 10)  return 1.0;  // Common
  return 2.0;                         // Rare
}
```

## Integration with DR-DSP

### New Function: `injectPriorPatterns`

```typescript
// In dr-dsp.ts
export function injectPriorPatterns(
  drdsp: DRDSP,
  patterns: PriorPattern[],
): void {
  for (const pattern of patterns) {
    drdsp.addHyperedge({
      id: `prior:${pattern.from}-${pattern.to}`,
      sources: [pattern.from],
      targets: [pattern.to],
      weight: pattern.weight,
      metadata: {
        origin: pattern.source,
        frequency: pattern.frequency,
        isPrior: true,  // Flag to distinguish from real capabilities
      },
    });
  }
}
```

### Storage Options

| Option | Pros | Cons |
|--------|------|------|
| **JSON file** | Simple, versionable | No dynamic updates |
| **DB table `workflow_pattern`** | Queryable, updatable | More complexity |
| **In-memory only** | Fast | Lost on restart |

**Recommendation:** Start with JSON file, migrate to DB if needed.

```typescript
// workflow-patterns.json
{
  "version": "1.0",
  "scraped_at": "2026-01-01",
  "patterns": [
    {
      "from": "google:sheets_read",
      "to": "slack:post_message",
      "weight": 0.5,
      "frequency": 847,
      "source": "n8n",
      "isOfficial": true
    }
  ]
}
```

## SHGAT Integration

Prior patterns can also inform SHGAT K-head attention:

1. **Co-occurrence matrix** from scraped patterns
2. **Pre-train attention weights** on common sequences
3. **Transfer learning** before local execution data

```typescript
// Pseudo-code
const cooccurrence = buildCooccurrenceMatrix(scrapedPatterns);
shgat.initializeAttentionFromPriors(cooccurrence);
```

## Benefits

1. **Cold-start solution:** New users get useful suggestions immediately
2. **DR-DSP pathfinding:** Has edges to traverse even without local capabilities
3. **SHGAT pre-training:** Attention heads start with real-world patterns
4. **Graceful degradation:** Prior patterns used when no local capability matches

## Concerns & Mitigations

| Concern | Mitigation |
|---------|------------|
| Stale patterns | Recency decay in weight calculation |
| Bad mappings | Confidence factor, manual curation for top patterns |
| Legal (ToS) | Focus on open source (n8n, Pipedream, Activepieces) |
| Pollution | Flag `isPrior: true`, lower priority than local capabilities |

## Next Steps

1. [ ] Prototype n8n template scraper
2. [ ] Build tool name mapping (Zapier names → MCP tool IDs)
3. [ ] Implement `injectPriorPatterns()` in DR-DSP
4. [ ] Create `workflow-patterns.json` with top 100 patterns
5. [ ] Evaluate impact on pathfinding quality

## Open Questions

1. Should prior patterns eventually "graduate" to real capabilities after local execution?
2. How to handle pattern conflicts (different sources, different weights)?
3. Should we expose pattern origin in `pml:discover` results?
