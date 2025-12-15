# Eager Learning

> Store on first success, filter at suggestion time

## En bref

Imaginez un assistant personnel qui observe tout ce que vous faites et prend des notes. Au lieu de vous demander "Est-ce que cette information est importante ?" avant de noter, il note TOUT ce qui fonctionne. Plus tard, quand vous avez besoin de quelque chose, il fouille dans ses notes et vous propose uniquement ce qui est pertinent et efficace.

C'est l'apprentissage eager (enthousiaste) de PML : tout capturer maintenant, filtrer au moment de suggerer.

**Exemple concret :** Vous creez une fois un script pour renommer des photos de vacances. PML sauvegarde cette solution meme si vous pensez ne jamais le refaire. Six mois plus tard, vous devez renommer des documents de travail - PML se souvient et adapte automatiquement la solution des photos.

**Pourquoi c'est utile pour vous :** Vous ne perdez jamais une solution qui a fonctionne. Meme les taches que vous faites "juste une fois" restent disponibles au cas ou.

## Philosophy

PML follows an **eager learning** philosophy: capture everything that works, then let usage patterns determine what's valuable.

```
Traditional Approach:          PML's Approach:
─────────────────────         ─────────────────────
Filter → Store                 Store → Filter (later)

"Is this worth saving?"        "Save it, we'll see"
```

This approach is based on a key insight: **it's impossible to know in advance which patterns will be useful**.

## Why Eager?

### 1. Opportunity Cost

If you filter before storing, you might miss valuable patterns:

```
Scenario: User creates a unique workflow

Filtered Approach:
  "Pattern used only once → Not stored"
  Later: User wants it again → Lost forever

Eager Approach:
  "Pattern worked → Stored"
  Later: User wants it again → Available
```

### 2. Context Changes

What's irrelevant today may be critical tomorrow:

```
Month 1: User rarely works with databases
Month 3: New project requires database work

With eager learning:
  • Database patterns already captured
  • Suggestions immediately relevant
  • No cold start problem
```

**Analogie du quotidien :** C'est comme garder les recettes de tous les plats que vous avez reussis, meme ceux que vous faites rarement. Quand des invites arrivent a l'improviste, vous avez deja un repertoire complet au lieu de devoir improviser.

### 3. Low Storage Cost

Modern storage is cheap. The cost of storing extra patterns is negligible compared to the cost of losing useful ones.

## How It Works

### Capture Phase

Every successful execution is captured:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Code Execution                                │
│                                                                  │
│  Intent: "Process CSV file"                                     │
│  Result: SUCCESS                                                 │
│                                                                  │
│  Captured:                                                       │
│    ✓ Intent text                                                │
│    ✓ Code that was executed                                     │
│    ✓ Tools called (read_file, parse_csv, write_file)           │
│    ✓ Execution trace                                            │
│    ✓ Parameters used                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Storage Phase

Captured patterns go directly to the database:

```
workflow_pattern:
  id: abc123
  intent: "Process CSV file"
  code: "const data = await mcp.read_file(...)..."
  tools_used: ["read_file", "parse_csv", "write_file"]
  success_count: 1
  embedding: [0.12, -0.34, 0.56, ...]
```

### Filter Phase (at suggestion time)

When suggesting capabilities, PML applies filters:

```
Query: "Process spreadsheet"

All matching patterns:
  ├── process_csv (match: 0.85, success: 95%, count: 20)
  ├── parse_excel (match: 0.72, success: 80%, count: 5)
  └── old_csv_hack (match: 0.68, success: 40%, count: 1)

After filtering:
  1. process_csv ← High match, high success
  2. parse_excel ← Decent match, decent success
  (old_csv_hack filtered out - low success rate)
```

## Deduplication

Eager learning creates many similar patterns. PML handles this through smart deduplication.

### Semantic Deduplication

Patterns with very similar intent embeddings are grouped:

```
Stored separately:              Treated as one:
─────────────────────          ─────────────────────
"Read JSON file"         ──┐
"Parse JSON from disk"   ──┼── Same capability
"Load JSON data"         ──┘   (semantic similarity > 0.95)
```

### Code Deduplication

Patterns with identical normalized code share storage:

```
Pattern A: const x = await mcp.read_file({path: "a.json"})
Pattern B: const x = await mcp.read_file({path: "b.json"})

Normalized: const x = await mcp.read_file({path: $PATH})

Result: One code pattern, multiple intent mappings
```

### Tool Signature Deduplication

Patterns using the same tools in the same order may be merged:

```
Pattern 1: read_file → parse_json → write_file
Pattern 2: read_file → parse_json → write_file

If intents are similar → Merge into single capability
```

## Retention Policy

Not everything is kept forever:

| Condition | Action |
|-----------|--------|
| Success rate < 20% after 10+ tries | Consider removal |
| Not used in 90+ days | Reduce ranking weight |
| Superseded by better pattern | Keep but deprioritize |
| Manual user deletion | Remove immediately |

## Benefits

| Benefit | Description |
|---------|-------------|
| **No lost patterns** | Everything useful is captured |
| **Natural selection** | Best patterns rise through usage |
| **Fast learning** | No deliberation, just capture |
| **User-driven curation** | Usage determines value |

## Ce que ca change pour vous

Avec l'eager learning, vous beneficiez de :

1. **Memoire parfaite** : PML se souvient de chaque solution qui a fonctionne, meme celles que vous avez utilisees une seule fois il y a des mois.

2. **Pas de "demarrage a froid"** : Des la premiere semaine, PML commence a accumuler des solutions. Pas besoin d'attendre des mois pour avoir un assistant intelligent.

3. **Apprentissage passif** : Vous n'avez rien a faire. Travaillez normalement, PML apprend en arriere-plan.

4. **Selection naturelle** : Les meilleures solutions remontent naturellement au sommet grace a l'usage. Vous n'avez pas a juger manuellement ce qui est "important".

**Exemple concret :** Imaginez que vous travaillez sur plusieurs projets differents. Avec l'eager learning, PML capture les patterns de TOUS vos projets. Quand vous commencez un nouveau projet qui combine des elements de projets precedents, PML a deja toutes les pieces du puzzle.

## Next

- [Schema Inference](./03-schema-inference.md) - How parameters are detected
- [DAG Structure](../05-dag-execution/01-dag-structure.md) - How capabilities become workflows
