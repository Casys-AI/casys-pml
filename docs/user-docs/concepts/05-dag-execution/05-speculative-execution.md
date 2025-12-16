# Speculative Execution

> Results ready before you confirm

## En bref

Imaginez commander un cafe dans un bar ou le barista connait vos habitudes. Avant meme que vous ayez fini de parler, votre cappuccino est deja en preparation. Si vous changez d'avis pour un the, pas de probleme - le cafe est annule. Mais 9 fois sur 10, vous gagnez 2 minutes d'attente.

C'est l'execution speculative de PML : quand le systeme est suffisamment confiant dans ce que vous allez demander, il commence le travail avant votre confirmation. Si la prediction est correcte, le resultat est instantane. Sinon, l'execution speculative est simplement ignoree.

**Ce que cela vous apporte :**
- **0ms de latence perçue** : Le resultat apparait instantanement
- **Fluidite** : Pas d'attente frustrante entre vos actions
- **Securite** : Les operations risquees ne sont jamais speculees

## The Core Feature

Speculative execution is **THE** differentiating feature of PML. It transforms the user experience from:

```
Traditional:                    With Speculation:
────────────────────           ────────────────────
User confirms → Wait 2-5s →    User confirms → Instant result
  Execute → Result               (already computed)
```

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                   Speculative Execution Flow                     │
│                                                                  │
│  1. User types intent                                           │
│     "Create issue from this error log"                          │
│                                                                  │
│  2. PML predicts next action (confidence: 0.92)                 │
│     ┌─────────────────────────────────────────┐                 │
│     │ SPECULATE: github:create_issue          │                 │
│     │ with parsed error data                  │                 │
│     └─────────────────────────────────────────┘                 │
│                                                                  │
│  3. While user reviews suggestion...                            │
│     ┌─────────────────────────────────────────┐                 │
│     │ EXECUTING IN BACKGROUND                 │                 │
│     │ (sandboxed, reversible)                 │                 │
│     └─────────────────────────────────────────┘                 │
│                                                                  │
│  4. User confirms                                                │
│     → Result already available (0ms wait)                       │
│                                                                  │
│  OR User rejects/modifies                                       │
│     → Speculative result discarded                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Confidence Threshold

Not every action is speculated. PML uses confidence scores to decide:

```
Confidence Score = GraphRAG prediction × Recent success rate

Threshold: 0.85 minimum (starts at 0.92 for new users)

  0.70  │ Too risky - Wait for confirmation
  0.85  │ ────────── Speculation threshold ──────────
  0.92  │ Safe to speculate
  1.00  │ Almost certain
```

### Adaptive Learning

The threshold adapts based on your feedback:

```
Action               Effect on Threshold
─────────────────────────────────────────
Accept speculation → Threshold decreases slightly (more speculation)
Reject speculation → Threshold increases (more conservative)
Modify then accept → Threshold stays stable

Target: 85% acceptance rate
Bounds: [0.70, 0.95] - Never too risky, never too conservative
```

## Safety Measures

Speculative execution has strict guardrails:

### Operations Never Speculated

```
┌─────────────────────────────────────────────────────────────────┐
│  🚫 NEVER SPECULATED                                            │
│                                                                  │
│  • delete_*     - File/resource deletion                        │
│  • deploy_*     - Production deployments                        │
│  • send_email   - External communication                        │
│  • payment_*    - Financial transactions                        │
│  • publish_*    - Public releases                               │
│                                                                  │
│  These operations ALWAYS require explicit confirmation          │
└─────────────────────────────────────────────────────────────────┘
```

### Resource Limits

Each speculative execution is constrained:

| Limit | Value | Rationale |
|-------|-------|-----------|
| **Cost** | < $0.10 | Waste from wrong speculation stays minimal |
| **Time** | < 5 seconds | Quick operations only |
| **Scope** | Reversible only | Must be able to discard result |

### Sandbox Execution

Speculative executions run in isolated sandboxes:

```
┌─────────────────────────────────────────┐
│           Main Environment              │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │     Speculative Sandbox           │ │
│  │                                   │ │
│  │  • Isolated file system           │ │
│  │  • No external side effects       │ │
│  │  • Automatic cleanup on reject    │ │
│  │                                   │ │
│  └───────────────────────────────────┘ │
│                                         │
│  On confirm: Merge results              │
│  On reject:  Discard sandbox            │
│                                         │
└─────────────────────────────────────────┘
```

## Cost-Benefit Analysis

Why speculation is worth occasional waste:

```
Without Speculation:
  • 100 operations × 3s average wait = 300s of waiting/day
  • User context switches during wait
  • Frustration accumulates

With Speculation:
  • 90% correct → 90 instant results
  • 10% wasted → ~$0.50/day in compute
  • Net gain: 270s saved + better flow state

Context savings ($5-10/day) >> Speculation waste ($0.50/day)
```

## When Speculation Happens

### High-Confidence Scenarios

```
Scenario                              Confidence    Speculate?
────────────────────────────────────────────────────────────────
You always run tests after editing     0.95         ✅ Yes
User selected "create issue" option    0.98         ✅ Yes
Similar pattern succeeded 5x today     0.91         ✅ Yes
First time using this tool             0.60         ❌ No
User manually typed different intent   0.45         ❌ No
```

### The GraphRAG Connection

Speculation relies on GraphRAG predictions:

```
GraphRAG Knowledge:
  • "read_file → parse_json" sequence: 95% of the time
  • "error detected → create_issue" pattern: 88% match
  • User's recent workflow: file analysis

Combined Confidence:
  sequence_confidence × pattern_match × recency_boost = 0.92

  → Speculation triggered
```

## Ce que cela change pour vous

### Avant l'execution speculative

```
1. Vous demandez "Creer une issue pour ce bug"
2. PML analyse votre demande (500ms)
3. PML suggere une action (200ms)
4. Vous confirmez
5. PML execute (2-3s)
6. Resultat affiche

Total: 3-4 secondes d'attente active
```

### Avec l'execution speculative

```
1. Vous demandez "Creer une issue pour ce bug"
2. PML analyse + suggere + execute en parallele
3. Vous confirmez
4. Resultat deja disponible

Total: 0 seconde d'attente apres confirmation
```

### L'effet "magie"

Les utilisateurs de PML decrivent souvent l'experience comme "magique" :

> "J'ai l'impression que PML lit dans mes pensees. Je clique sur confirmer et le resultat est deja la."

Cette sensation vient de l'execution speculative. PML ne lit pas dans vos pensees - il utilise vos patterns pour predire avec precision ce que vous allez probablement faire.

## Metrics and Monitoring

PML tracks speculation performance:

| Metric | Description | Target |
|--------|-------------|--------|
| **Speculation Rate** | % of actions speculated | 60-80% |
| **Acceptance Rate** | % of speculations accepted | >85% |
| **Waste Rate** | % of compute wasted | <15% |
| **Latency Saved** | Time saved by correct speculation | 2-5s/action |

You can view these in the dashboard under "Performance → Speculation Stats".

## Next

- [Checkpoints](./04-checkpoints.md) - Human validation for critical operations
- [Confidence Levels](../03-learning/03-confidence-levels.md) - How reliability is tracked
