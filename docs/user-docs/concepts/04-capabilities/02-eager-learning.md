# Eager Learning

> Store on first success, filter at suggestion time

## En bref

Imaginez un assistant personnel qui observe tout ce que vous faites et prend des notes. Au lieu de vous demander "Est-ce que cette information est importante ?" avant de noter, il note TOUT ce qui fonctionne. Plus tard, quand vous avez besoin de quelque chose, il fouille dans ses notes et vous propose uniquement ce qui est pertinent et efficace.

C'est l'apprentissage eager (enthousiaste) de PML : tout capturer maintenant, filtrer au moment de suggerer.

**Exemple concret :** Vous creez une fois un script pour renommer des photos de vacances. PML sauvegarde cette solution meme si vous pensez ne jamais le refaire. Six mois plus tard, vous devez renommer des documents de travail - PML se souvient et adapte automatiquement la solution des photos.

**Pourquoi c'est utile pour vous :** Vous ne perdez jamais une solution qui a fonctionne. Meme les taches que vous faites "juste une fois" restent disponibles au cas ou.

## Philosophy

PML follows an **eager learning** philosophy: capture everything that works, then let usage patterns determine what's valuable.

![Eager Learning - Observation](excalidraw:src/web/assets/diagrams/emerge-observation.excalidraw)

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

Every successful execution is captured, with one important rule:

**All-or-Nothing Rule**: A capability is saved only if **ALL tools called succeed**. If even one tool fails (server not connected, timeout, API error), the capability is not saved.

```
Scenario 1: All tools succeed
  Tool 1: read_file     → Success ✓
  Tool 2: parse_json    → Success ✓
  Tool 3: write_file    → Success ✓
  → Capability SAVED with all 3 tools

Scenario 2: One tool fails
  Tool 1: gmail:get     → Error (not connected) ✗
  Tool 2: memory:search → Success ✓
  Tool 3: notion:get    → Error (server undefined) ✗
  → Capability NOT SAVED (incoherent)
```

**Why this rule?** Without it, the saved code would contain 3 tool calls, but `tools_used` would only list 1. The graph would be incoherent and suggestions would be wrong.

When tools fail, PML:
- Logs failures for debugging
- Returns `tool_failures` in the response
- Does not save incomplete capabilities

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

Captured patterns go directly to the database with **ON CONFLICT** deduplication:

```
workflow_pattern:
  id: abc123
  intent: "Process CSV file"
  code: "const data = await mcp.read_file(...)..."
  code_hash: "sha256:a1b2c3..."  ← Deduplication key
  tools_used: ["read_file", "parse_csv", "write_file"]
  success_count: 1
  embedding: [0.12, -0.34, 0.56, ...]
```

**Fonctionnement interne :**

```sql
INSERT INTO workflow_pattern (code_hash, code, intent, ...)
ON CONFLICT (code_hash) DO UPDATE SET
  usage_count = usage_count + 1,
  last_used = NOW()
```

Cela signifie :
- **1ere execution** : Le pattern est sauvegarde integralement
- **Executions suivantes** : Seul le compteur d'usage est incremente
- **Resultat** : Pas de doublons, mais l'historique d'usage est preserve

### Filter Phase (Lazy Suggestions)

When suggesting capabilities, PML applies **lazy filtering** - the intelligence is at suggestion time, not storage time:

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

**Pourquoi "lazy" (paresseux) ?**

```
Eager Storage + Lazy Filtering = Best of Both Worlds

┌─────────────────────────────────────────────────────────────────┐
│  STOCKAGE (Eager)           SUGGESTION (Lazy)                   │
│  ─────────────────          ─────────────────                   │
│  • Aucun filtrage           • Filtre par pertinence semantique  │
│  • Tout est garde           • Filtre par taux de succes         │
│  • Rapide, sans jugement    • Filtre par contexte actuel        │
│                              • Adapte au moment present          │
└─────────────────────────────────────────────────────────────────┘
```

L'avantage : ce qui n'est pas pertinent aujourd'hui pourrait l'etre demain. En stockant tout et en filtrant au moment de la suggestion, PML peut s'adapter aux changements de contexte.

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
