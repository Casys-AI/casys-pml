# Confidence Levels

> How PML tracks reliability of learned patterns

## Why Confidence Matters

Not all learned patterns are equally reliable:
- A pattern seen once might be coincidental
- A pattern seen 100 times is probably real
- A user-defined pattern starts trusted but needs validation

PML tracks **confidence** to weight patterns appropriately.

## Edge Sources

Every dependency edge has a **source** indicating how it was learned:

| Source | Initial Confidence | Description |
|--------|-------------------|-------------|
| `template` | 50% | User-defined, not yet confirmed |
| `inferred` | 70% | Observed 1-2 times |
| `observed` | 100% | Confirmed by 3+ executions |

```
                    Promotion Path

template (50%) ───▶ inferred (70%) ───▶ observed (100%)
                         │                    │
                    1-2 observations      3+ observations
```

## Promotion Rules

Edges automatically upgrade as they're observed more:

### Template → Inferred

When a template edge is seen in actual execution:
```
Before: read → write (template, 50%)
Event:  Execution uses read then write
After:  read → write (inferred, 70%)
```

### Inferred → Observed

After 3 or more observations:
```
Before: read → write (inferred, count=2)
Event:  Third execution with this pattern
After:  read → write (observed, count=3, 100%)
```

## Confidence Calculation

Final confidence combines edge type and source:

```
Confidence = Edge Type Weight × Source Modifier
```

### Edge Type Weights

| Type | Weight | Rationale |
|------|--------|-----------|
| `dependency` | 1.0 | Explicit, strongest |
| `contains` | 0.8 | Structural, reliable |
| `alternative` | 0.6 | Interchangeable |
| `sequence` | 0.5 | Temporal, may vary |

### Source Modifiers

| Source | Modifier |
|--------|----------|
| `observed` | 1.0 |
| `inferred` | 0.7 |
| `template` | 0.5 |

### Examples

| Edge | Type | Source | Calculation | Final |
|------|------|--------|-------------|-------|
| A → B | dependency | observed | 1.0 × 1.0 | **1.0** |
| A → B | contains | observed | 0.8 × 1.0 | **0.8** |
| A → B | sequence | inferred | 0.5 × 0.7 | **0.35** |
| A → B | sequence | template | 0.5 × 0.5 | **0.25** |

## How Confidence Is Used

### Search Ranking

Higher confidence = higher rank in results:
```
Query: "process file"

Results:
1. read_file (confidence: 0.95) ✓ Top result
2. load_data (confidence: 0.72)
3. fetch_file (confidence: 0.45)
```

### DAG Building

Only confident edges are used for workflow construction:
```
Minimum threshold: 0.3

Edges considered:
  ✓ read → parse (0.85)
  ✓ parse → write (0.65)
  ✗ parse → debug (0.20)  ← Too low, ignored
```

### Suggestion Filtering

Low-confidence suggestions are deprioritized:
```
Suggestions for "after read_file":
  1. write_file (0.90) ← Strong suggestion
  2. parse_json (0.75)
  3. log_data (0.35)   ← Weak, shown last
```

## Confidence Decay

Unused patterns lose confidence over time:
- If an edge isn't observed for a long period, confidence decreases
- This prevents stale patterns from dominating
- Active patterns stay strong

## Next

- [Feedback Loop](./04-feedback-loop.md) - The complete learning cycle
- [Capabilities](../04-capabilities/01-what-is-capability.md) - Reusable patterns
