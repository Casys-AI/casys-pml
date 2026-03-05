# Negative Traces & Confirm Mode — Design & Implementation

**Status:** ✅ Implemented (2026-03-04)

---

## Overview

The `--confirm` flag enables supervised trace collection: the CLI proposes beam candidates, the user (or an AI agent) selects the correct one, and rejected candidates are stored as negative traces for contrastive learning.

## CLI Interface

### `run --intent <text> --confirm`

```
[intent] total payroll
[candidates] 4
[1] target=Total Payroll     confidence=0.45 path=Employees → Total Payroll
[2] target=Department Budget  confidence=0.35 path=Employees → Department Budget
[3] target=Hiring Need        confidence=0.20 path=Department Budget → Hiring Need
[4] none
[confirm] Select (1-4):
```

- **3 beam candidates** (deduplicated by target, best score per target, softmax-normalized to [0,1])
- **"none" option** — all candidates are wrong → all stored as negatives, no execution
- **Scores rounded to centième** (0.01)

### Output format (AI-friendly)

Structured `[tag] key=value` format, parseable by LLM:

| Tag | Meaning |
|-----|---------|
| `[intent]` | The input intent text |
| `[candidates] N` | Number of options (3 + none = 4) |
| `[N] target=X confidence=Y path=A → B` | Candidate with score |
| `[N] none` | "None of these" option |
| `[confirm] Select (1-N):` | Awaiting stdin input |
| `[selected] N → target=X` | Chosen candidate |
| `[none]` | All rejected |
| `[negatives] N rejected` | Count of negative traces |
| `[trace] 1 positive + N negative recorded.` | Trace summary |
| `[auto] target=X` | Auto-selected (without --confirm) |
| `[skip]` | Invalid input, nothing recorded |

### Behavior

| Choice | Positive trace | Negative traces | DAG executed |
|--------|---------------|-----------------|--------------|
| 1-3 | ✅ selected target | ✅ other 2 candidates | ✅ yes |
| 4 (none) | ❌ | ✅ all 3 candidates | ❌ no |
| 0 / invalid | ❌ | ❌ | ❌ no |

### Without `--confirm` (auto mode)

Best candidate auto-selected, no negatives recorded. Same as before.

## Contrastive Training

### TrainingExample

```typescript
export interface TrainingExample {
  intentEmb: number[];
  path: string[];
  targetIdx: number;
  parentIdx: number | null;
  childIdx: number | null;
  negative?: boolean; // true = push AWAY from targetIdx
}
```

### Loss computation

- **Positive** (`negative: false`): standard focal loss → attract toward target
- **Negative** (`negative: true`): loss × −0.5 → repulse from target

The `NEGATIVE_WEIGHT = 0.5` prevents negatives from dominating training.

### Accuracy metric

Only positive examples count toward accuracy. Negatives contribute to loss/gradients but not to the accuracy %.

### Wiring

- `retrain.ts`: maps `trace.success === false` → `negative: true`
- `init.ts`: same mapping
- Both load ALL traces from DuckDB (synthetic + real, positive + negative)

## Files modified

| File | Change |
|------|--------|
| `src/cli.ts` | `--confirm` flag, 3+none candidates, AI-friendly output, negative trace recording |
| `src/gru/trainer.ts` | `negative` field on TrainingExample, contrastive loss (×−0.5), accuracy on positives only |
| `src/retrain.ts` | Maps `success: false` → `negative: true` |
| `src/init.ts` | Same mapping |

## Why this matters

Without `--confirm`, the GRU creates a **self-confirmation loop**: it predicts a target, executes it, records that as truth, and retrains on its own prediction. With `--confirm` + negatives, an external oracle (human or AI) breaks the loop by providing ground truth and explicitly marking incorrect predictions.
