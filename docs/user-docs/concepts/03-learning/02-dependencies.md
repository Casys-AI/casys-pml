# Dependencies

> Relationships between tools and capabilities

## En bref

Les dependencies sont les liens qui connectent les outils entre eux dans le graphe de connaissances de PML. Imaginez une recette de cuisine : certains ingredients doivent etre prepares avant d'autres, certains peuvent etre remplaces par des alternatives. Les dependencies de PML fonctionnent de la meme maniere pour vos outils.

**Ce que cela vous apporte :**
- PML comprend l'ordre logique de vos operations
- Les workflows se construisent automatiquement dans le bon ordre
- Quand un outil echoue, PML suggere des alternatives
- Les suggestions tiennent compte de ce que vous venez de faire

## Overview

PML tracks two types of dependencies:
- **Tool dependencies** - Relationships between MCP tools
- **Capability dependencies** - Relationships between learned capabilities

These dependencies form the edges in PML's knowledge graph.

![Dependency Types](excalidraw:src/web/assets/diagrams/dependency-types.excalidraw)

## Tool Dependencies

Stored in the `tool_dependency` table, these track relationships between individual tools.

```
┌──────────────┐                      ┌──────────────┐
│  read_file   │ ───── sequence ────▶ │  write_file  │
└──────────────┘                      └──────────────┘

"read_file is often followed by write_file"
```

### What Gets Stored

| Field | Description |
|-------|-------------|
| `from_tool_id` | Source tool |
| `to_tool_id` | Target tool |
| `observed_count` | Times this pattern was seen |
| `confidence_score` | Reliability (0.0 - 1.0) |
| `edge_type` | Type of relationship |
| `edge_source` | How it was learned |

## Capability Dependencies

Stored in the `capability_dependency` table, these track relationships between capabilities (higher-level patterns).

```
┌──────────────────┐                      ┌──────────────────┐
│  cap:read_json   │ ───── sequence ────▶ │  cap:validate    │
└──────────────────┘                      └──────────────────┘

"After reading JSON, validation often follows"
```

Capability dependencies are important because they capture **intent-level patterns**, not just tool sequences.

## Edge Types

PML distinguishes four types of relationships:

### Sequence

**A is used before B** (temporal order)

```
read_file ────▶ parse_json ────▶ write_file

"First read, then parse, then write"
```

**Analogie :** Comme les etapes d'une recette - vous devez melanger avant de cuire.

**Exemple concret :**
Vous travaillez sur un bug et PML observe systematiquement :
1. `search_code` pour trouver le probleme
2. `edit_file` pour corriger
3. `run_tests` pour valider

PML cree des liens "sequence" entre ces trois outils. La prochaine fois que vous cherchez du code, PML anticipera que vous voudrez probablement editer puis tester.

Most common edge type. Created when tools are used in succession.

### Contains

**A contains B** (composition)

```
┌─────────────────────────────────┐
│     Capability: process_data    │
│                                 │
│   read_file ──▶ transform ──▶   │
│                    write_file   │
└─────────────────────────────────┘

"The capability 'process_data' contains these tools"
```

**Analogie :** Comme une boite a outils qui contient plusieurs outils specifiques.

**Exemple concret :**
Vous avez un workflow "deployer l'application" qui contient toujours :
- `build_project`
- `run_tests`
- `push_docker`
- `deploy_kubernetes`

PML cree une capability "deployment" qui encapsule ces quatre outils. Maintenant, quand vous dites "je veux deployer", PML sait exactement quels outils activer.

Created when a capability uses specific tools.

### Dependency

**B needs the result of A** (data flow)

```
read_file ════▶ parse_json
              (needs file content)

"parse_json depends on read_file's output"
```

**Analogie :** Comme une chaine de montage - l'etape B ne peut pas commencer sans le resultat de l'etape A.

**Exemple concret :**
Pour analyser les performances de votre API, vous avez besoin :
1. `fetch_logs` - recuperer les logs serveur
2. `parse_logs` - qui DEPEND des logs recuperes
3. `generate_report` - qui DEPEND des logs analyses

PML comprend ces dependencies obligatoires. Si `fetch_logs` echoue, PML sait que les etapes suivantes ne peuvent pas s'executer et vous previent immediatement.

Explicit dependency, often from DAG definitions.

### Alternative

**A and B serve the same purpose** (interchangeable)

```
write_file ◀════▶ save_json
         (both save data)

"Either can be used to persist data"
```

**Analogie :** Comme avoir deux routes pour aller au meme endroit - si l'une est bloquee, prenez l'autre.

**Exemple concret :**
Vous avez deux facons de notifier votre equipe :
- `slack_notify` - rapide mais necessite une connexion
- `email_notify` - plus lent mais toujours disponible

Si `slack_notify` echoue (serveur Slack indisponible), PML vous suggere automatiquement `email_notify` comme alternative. Vous ne perdez pas de temps a chercher une solution de secours.

Useful for suggesting alternatives when one tool fails.

## Poids des relations (Edge Weights)

Chaque type de relation a un **poids** qui reflète sa fiabilité. Ces poids influencent directement le score de confiance des suggestions.

### Poids par type d'edge

| Type | Poids | Rationale |
|------|-------|-----------|
| `dependency` | **1.0** | Explicite, la plus forte (B ne peut pas fonctionner sans A) |
| `contains` | **0.8** | Structurelle, fiable (capability contient ces outils) |
| `alternative` | **0.6** | Interchangeable (l'un ou l'autre fonctionne) |
| `sequence` | **0.5** | Temporelle, peut varier (ordre observé, pas obligatoire) |

### Modificateurs par source

| Source | Multiplicateur | Signification |
|--------|----------------|---------------|
| `observed` | **×1.0** | Confirmé 3+ fois, totalement fiable |
| `inferred` | **×0.7** | Observé 1-2 fois, prometteur |
| `template` | **×0.5** | Défini manuellement, pas encore validé |

### Calcul du score final

```
Score = Poids du type × Modificateur de source

Exemples:
  dependency + observed = 1.0 × 1.0 = 1.0  (confiance maximale)
  sequence + inferred   = 0.5 × 0.7 = 0.35 (confiance moyenne)
  sequence + template   = 0.5 × 0.5 = 0.25 (confiance faible)
```

**Impact pratique :** Une relation `dependency/observed` sera toujours priorisée sur une relation `sequence/template`. C'est logique : une dépendance confirmée 10 fois est plus fiable qu'une séquence définie manuellement.

## How Dependencies Are Created

### 1. From DAG Execution

When a DAG workflow executes:
```
DAG: Task A → Task B → Task C

Creates:
  A → B (dependency)
  B → C (dependency)
```

### 2. From Code Traces

When code executes in the sandbox:
```
Code calls: read_file(), then write_file()

Creates:
  read_file → write_file (sequence)
```

### 3. From Templates

User-defined workflow templates:
```yaml
workflow:
  - read_file
  - process
  - write_file

Creates edges with source='template'
```

## Using Dependencies

Dependencies power several features:

| Feature | How Dependencies Help |
|---------|----------------------|
| **DAG Suggester** | Knows which tools typically follow others |
| **Proactive Suggestions** | "You might also need..." |
| **Workflow Building** | Automatic ordering of tasks |
| **Error Recovery** | Suggest alternatives |

### Benefices concrets au quotidien

**Scenario 1 - Workflow automatique :**
Vous tapez : "Je veux analyser les erreurs dans les logs de production"

Grace aux dependencies, PML sait :
1. D'abord recuperer les logs (`fetch_production_logs`)
2. Ensuite filtrer les erreurs (`filter_errors`)
3. Puis generer un rapport (`create_error_report`)
4. Enfin notifier l'equipe (`notify_team`)

Vous n'avez pas a specifier chaque etape - PML construit le workflow optimal automatiquement.

**Scenario 2 - Recuperation d'erreur :**
Vous executez un workflow et `database_backup` echoue.

PML detecte l'echec et :
- Suggere `filesystem_backup` comme alternative (meme objectif, methode differente)
- Vous avertit que les etapes suivantes dependent de cette sauvegarde
- Propose de relancer avec l'alternative

**Scenario 3 - Suggestions contextuelles :**
Vous venez de faire `create_pull_request`.

PML connait les dependencies typiques et suggere :
- "Voulez-vous assigner un reviewer ?" (`assign_reviewer`)
- "Ajouter des labels ?" (`add_labels`)
- "Lier a une issue ?" (`link_issue`)

Ces suggestions apparaissent car PML a appris que ces actions suivent souvent la creation d'une PR dans votre workflow.

## Next

- [Confidence Levels](./03-confidence-levels.md) - How reliability is tracked
- [Feedback Loop](./04-feedback-loop.md) - How learning happens
