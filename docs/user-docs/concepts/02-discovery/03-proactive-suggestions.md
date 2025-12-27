# Proactive Suggestions

> Automatic tool recommendations without explicit search

## En bref

Les suggestions proactives de PML, c'est comme un **collègue expérimenté qui anticipe vos besoins**.
Vous venez de lire un fichier JSON ? Il vous tend déjà le parseur avant que vous le demandiez. C'est
la différence entre un assistant qui attend vos ordres et un partenaire qui comprend le contexte.

**Pourquoi c'est utile ?**

- **Découverte naturelle** : Vous découvrez des outils que vous ne connaissiez pas
- **Gain de temps** : Pas besoin de chercher l'outil suivant, il est suggéré
- **Apprentissage contextuel** : Les suggestions s'améliorent avec l'usage
- **Workflows fluides** : Les enchaînements d'outils deviennent évidents

**Analogie simple :**

Pensez à **l'autocomplétion de votre téléphone**, mais pour les outils :

- Vous tapez souvent "Bonjour" puis "ça va ?" → Le téléphone suggère "ça va ?" après "Bonjour"
- Vous utilisez souvent `read_file` puis `parse_json` → PML suggère `parse_json` après `read_file`

La différence : PML comprend aussi le **sens** de ce que vous faites, pas juste la séquence
mécanique.

**Trois types de contexte utilisés :**

| Contexte               | Comment ça fonctionne               | Exemple                                              |
| ---------------------- | ----------------------------------- | ---------------------------------------------------- |
| **Relations d'outils** | A souvent suivi par B               | `read_file` → suggère `write_file`                   |
| **Capabilities**       | Intent similaire à un pattern connu | "traiter erreurs" → suggère workflow complet         |
| **Communauté**         | Outils du même serveur              | Utilise `postgres:query` → suggère `postgres:insert` |

**Exemple concret :**

```
Situation: Vous utilisez github:get_issue + filesystem:read_file
Intent: "Créer un rapport de bug"

PML analyse:
  → get_issue souvent suivi de add_comment (72%)
  → read_file souvent suivi de write_file (85%)
  → Intent matche la capability "bug_report_workflow"

Suggestions:
  1. github:add_comment (contexte issue)
  2. filesystem:write_file (contexte fichier)
  3. Capability complète "bug_report_workflow" (contexte intent)
```

## What Are Proactive Suggestions?

Instead of waiting for you to search, PML can **suggest tools automatically** based on:

- What you're currently doing
- What tools you've already used
- Patterns it has learned from past executions

```
You're using: read_file, parse_json

PML suggests: "You might also need:"
  → write_file (often used after read_file)
  → validate_schema (often used with parse_json)
```

## Strategic Discovery Mode

In **Strategic Discovery Mode**, PML analyzes the current context and suggests relevant tools:

### How It Works

![Proactive Suggestions Flow](excalidraw:src/web/assets/diagrams/proactive-suggestions.excalidraw)

## Context-Based Suggestions

PML uses multiple signals to generate suggestions:

### 1. Tool Relationships

If you use tool A, and tool B often follows A:

```
read_file ──(80% of the time)──▶ write_file
```

Then `write_file` is suggested when you use `read_file`.

### 2. Capability Matching

If your intent matches a known capability:

```
Intent: "Create a bug report from error logs"

Matching Capability: "error_to_issue"
  Tools: [read_file, parse_error, github:create_issue]
```

PML suggests the entire capability, not just individual tools.

### 3. Community Context

Tools from the same community are suggested together:

```
Using: postgres:query

Suggested (same community):
  → postgres:insert
  → postgres:update
  → postgres:transaction
```

## When Suggestions Trigger

Suggestions appear in different scenarios:

| Scenario            | Trigger                               |
| ------------------- | ------------------------------------- |
| **DAG Building**    | When constructing a workflow          |
| **After Execution** | "You might also want to..."           |
| **On Error**        | Alternative tools that might work     |
| **Idle Context**    | Periodic suggestions based on history |

## Suggestion Quality

Not all suggestions are equal. PML ranks them by:

| Factor                    | Weight                                    |
| ------------------------- | ----------------------------------------- |
| **Relationship strength** | How often tools are used together         |
| **Success rate**          | How often the suggestion leads to success |
| **Recency**               | Recent patterns matter more               |
| **Context match**         | How well it fits current intent           |

## Opting Out

Suggestions are helpful but optional:

- Ignore them if not relevant
- Disable in configuration
- Provide feedback to improve future suggestions

## Next

- [GraphRAG](../03-learning/01-graphrag.md) - The graph powering suggestions
- [Dependencies](../03-learning/02-dependencies.md) - How relationships are learned
