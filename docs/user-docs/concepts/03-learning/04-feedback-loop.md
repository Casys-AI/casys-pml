# Feedback Loop

> How PML learns from every execution

## En bref

La boucle de feedback de PML, c'est comme un **musicien qui s'améliore à chaque répétition**. Chaque fois que vous utilisez PML, il observe ce que vous faites, note ce qui marche, et devient meilleur pour anticiper vos besoins la prochaine fois.

**Le cycle vertueux :**

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   SUGGÉRER ──→ EXÉCUTER ──→ TRACER ──→ APPRENDRE           │
│       ▲                                      │              │
│       │                                      │              │
│       └──── Meilleures suggestions ◀─────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Plus vous utilisez PML, plus il devient intelligent.**

**Trois sources d'apprentissage :**

| Source | Ce qui est appris | Exemple |
|--------|-------------------|---------|
| **Exécutions DAG** | Séquences d'outils réussies | read → parse → write devient un pattern |
| **Traces de code** | Relations parent-enfant | Capability X utilise les outils A, B, C |
| **Templates utilisateur** | Workflows prédéfinis | Votre workflow personnalisé (confiance 50% au départ) |

**Évolution temporelle :**

| Période | Ce qui se passe | Exemple |
|---------|-----------------|---------|
| **Court terme** (session) | Patterns récents renforcés | Confiance 0.5 → 0.85 après 3 usages |
| **Moyen terme** (semaines) | Patterns stabilisés, variations découvertes | Nouveau pattern: read → **validate** → parse |
| **Long terme** (mois) | Patterns populaires deviennent core knowledge, inutilisés déclinent | Graph reflète l'usage réel |

**Analogie du musicien :**

```
Semaine 1: Apprend une nouvelle chanson (template)
  → Fait des erreurs, hésite sur les enchainements

Semaine 2: Joue 10 fois (inferred → observed)
  → Les doigts savent où aller automatiquement

Mois 3: Découvre des variations, improvise (nouvelles capabilities)
  → Adapte le style selon le contexte

Après 1 an: Les morceaux non joués s'oublient (decay)
  → Les favoris sont maîtrisés parfaitement
```

**Pourquoi c'est puissant ?**

1. **Zéro configuration** : PML apprend de vos usages, pas de fichiers à écrire
2. **Personnalisé** : Vos patterns, pas ceux des autres
3. **Évolutif** : S'adapte quand vos pratiques changent
4. **Observable** : Dashboard montre la croissance du graphe en temps réel

## The Learning Cycle

PML continuously improves through a feedback loop:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌────────┐ │
│    │ SUGGEST  │───▶│ EXECUTE  │───▶│  TRACE   │───▶│ LEARN  │ │
│    └──────────┘    └──────────┘    └──────────┘    └────────┘ │
│          ▲                                              │       │
│          │                                              │       │
│          └──────────────────────────────────────────────┘       │
│                        Improved suggestions                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**The more you use PML, the smarter it becomes.**

## Learning Sources

PML learns from three sources:

### 1. DAG Execution

When a DAG workflow runs successfully:

```
DAG Executed:
  Task A (read_file) → Task B (parse) → Task C (write_file)

PML Learns:
  • read_file → parse (strengthen edge)
  • parse → write_file (strengthen edge)
  • Workflow pattern stored as capability
```

Each execution:
- Increases `observed_count` on edges
- May promote edges from `inferred` → `observed`
- Records execution time for analytics

### 2. Code Execution Traces

When code runs in the sandbox, every tool call is traced:

```
Code Execution:
  capability:process_data
    ├── tool:read_file (t=0ms)
    ├── tool:parse_json (t=50ms)
    └── tool:write_file (t=120ms)

PML Learns:
  • process_data contains read_file (contains edge)
  • process_data contains parse_json (contains edge)
  • process_data contains write_file (contains edge)
  • read_file → parse_json → write_file (sequence edges)
```

Traces capture:
- Parent-child relationships (capability → tools)
- Temporal sequences (tool A before tool B)
- Nested patterns (capability within capability)

### 3. User Templates

Users can define known workflows:

```yaml
# workflow-templates.yaml
workflows:
  - name: file-processing
    steps:
      - filesystem:read_file
      - json:parse
      - filesystem:write_file
```

Templates:
- Bootstrap the graph with known patterns
- Start at 50% confidence (template source)
- Get validated through actual usage

## How Knowledge Improves

### Short Term (per session)

```
Session Start:
  read → write: confidence 0.5

After 3 executions:
  read → write: confidence 0.85, count=3
```

Immediate feedback strengthens recent patterns.

### Medium Term (days/weeks)

```
Week 1: Discover read → parse → write pattern
Week 2: Pattern used 20 times, becomes high-confidence
Week 3: New variation: read → validate → parse → write
```

Patterns stabilize and new variations are discovered.

### Long Term (months)

```
Unused patterns: Confidence decays
Popular patterns: Become core knowledge
New tools: Integrated into existing patterns
```

The graph evolves to reflect actual usage.

## What Gets Stored

After each execution:

| Data | Storage | Purpose |
|------|---------|---------|
| Tool sequences | `tool_dependency` | Graph edges |
| Capability patterns | `workflow_pattern` | Reusable code |
| Capability relations | `capability_dependency` | High-level patterns |
| Execution results | `workflow_execution` | Analytics, debugging |
| Metrics | `metrics` | Performance tracking |

## The Virtuous Cycle

```
Better suggestions ───▶ More usage ───▶ More data ───▶ Better learning
       ▲                                                      │
       └──────────────────────────────────────────────────────┘
```

This creates a **virtuous cycle**:
1. Good suggestions → Users trust PML more
2. More usage → More execution data
3. More data → Better pattern recognition
4. Better patterns → Even better suggestions

## Observing Learning

You can see PML's learning in action:
- **Dashboard** shows graph growth
- **Metrics** track pattern discovery
- **Confidence scores** increase over time
- **Suggestion quality** improves

## Next

- [What is a Capability](../04-capabilities/01-what-is-capability.md) - Learned patterns
- [DAG Structure](../05-dag-execution/01-dag-structure.md) - Workflow execution
