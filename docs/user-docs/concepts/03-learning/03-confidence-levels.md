# Confidence Levels

> How PML tracks reliability of learned patterns

## En bref

La confiance dans PML, c'est comme la **réputation d'une recette de cuisine**. Une recette trouvée sur un post-it (template, 50%) n'inspire pas la même confiance qu'une recette testée 2-3 fois par vous (inferred, 70%), ou qu'une recette de famille transmise depuis des générations et validée des dizaines de fois (observed, 100%).

**Pourquoi la confiance est importante ?**

PML apprend des patterns, mais tous ne sont pas également fiables :
- Un pattern vu **1 fois** peut être une coïncidence
- Un pattern vu **100 fois** est probablement réel
- Un pattern **défini manuellement** doit encore faire ses preuves

**Les trois niveaux de confiance :**

| Niveau | Confiance | Analogie | Signification |
|--------|-----------|----------|---------------|
| `template` | 50% | Recette sur post-it | Défini manuellement, pas encore testé |
| `inferred` | 70% | Recette testée 1-2 fois | Observé quelques fois, prometteur |
| `observed` | 100% | Recette de famille | Confirmé par 3+ exécutions |

**Promotion automatique :**
```
template (50%) ─── 1ère exécution ──→ inferred (70%) ─── 3+ exécutions ──→ observed (100%)
```

**Impact concret sur votre expérience :**

1. **Recherche** : Les outils avec haute confiance apparaissent en premier
2. **DAG** : Seuls les liens avec confiance > 30% sont utilisés pour construire des workflows
3. **Suggestions** : Les suggestions de faible confiance sont affichées en dernier

**Exemple :**
```
Vous définissez: read_file → parse_json (template, 50%)

Exécution 1: PML voit read_file puis parse_json
  → Promu à "inferred" (70%)

Exécutions 2 et 3: Même pattern observé
  → Promu à "observed" (100%)

Maintenant, quand vous utilisez read_file, parse_json est
fortement suggéré car le pattern est validé.
```

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

![Confidence Levels and Promotion Path](excalidraw:src/web/assets/diagrams/confidence-levels.excalidraw)

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

## Cold Start Behavior

When PML starts with little data, confidence weights adapt automatically via **Local Alpha** (ADR-048).

### Why This Matters

In "cold start" (empty or sparse graph), PageRank has nothing to compute. PML uses a **per-tool adaptive alpha** to balance semantic vs graph signals intelligently.

### Local Alpha by Situation

| Situation | Alpha (α) | Semantic Weight | Graph Weight |
|-----------|-----------|-----------------|--------------|
| **Cold start** (< 5 observations) | 0.85-1.0 | 85-100% | 0-15% |
| **Sparse zone** (isolated tool) | ~0.80 | 80% | 20% |
| **Dense zone** (well-connected) | ~0.55 | 55% | 45% |
| **Mature** (many observations) | 0.50-0.60 | 50-60% | 40-50% |

**Key difference from before:** Alpha is now calculated **per tool**, not globally. A new tool in a mature graph still gets high alpha (cautious), while established tools get low alpha (trust graph).

**In cold start:**
- PML uses **Bayesian fallback** algorithm
- New tools start at α ≈ 1.0 (semantic only)
- Alpha decreases as observations accumulate
- Suggestions work from the very first use

**With established tools:**
- PML uses **Heat Diffusion** to calculate local alpha
- Well-connected tools get lower alpha (trust graph more)
- Isolated tools keep higher alpha (rely on semantic)

### Example

```
New tool in any project (cold start, α = 0.92):
  Intent: "Read config file"
  Tool: new_config_reader (2 observations)
  Semantic score: 0.72
  Graph score: 0.30 (few connections)

  Final score = 0.72 × 0.92 + 0.30 × 0.08 = 0.69 ✓ Semantic dominates

Established tool (mature, α = 0.55):
  Intent: "Read config file"
  Tool: filesystem:read_file (50+ observations, dense neighborhood)
  Semantic score: 0.72
  Graph score: 0.85 (central tool, high PageRank)

  Final score = 0.72 × 0.55 + 0.85 × 0.45 = 0.78 ✓ Graph boosts score
```

**See also:** [Hybrid Search - Local Adaptive Alpha](../02-discovery/02-hybrid-search.md#local-adaptive-alpha-α---intelligence-contextuelle)

## Next

- [Feedback Loop](./04-feedback-loop.md) - The complete learning cycle
- [Capabilities](../04-capabilities/01-what-is-capability.md) - Reusable patterns
