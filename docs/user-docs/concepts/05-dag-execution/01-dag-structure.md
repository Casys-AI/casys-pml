# DAG Structure

> Directed Acyclic Graphs for workflow orchestration

## En bref

Un DAG (Directed Acyclic Graph) est la structure qui orchestre l'execution de vos workflows dans PML. Imaginez un plan de montage IKEA : chaque etape doit etre executee dans un ordre precis, certaines etapes peuvent etre faites en parallele (visser les pieds pendant que quelqu'un assemble le dos), et vous ne pouvez jamais revenir en arriere pour creer une boucle infinie. C'est exactement ce qu'est un DAG.

**Points cles :**
- Structure de workflow avec dependances explicites
- Execution dans un ordre logique (pas de boucles)
- Parallelisation automatique des taches independantes
- Gestion d'erreurs avec etats de taches

**Analogie :** Plan de montage IKEA - Chaque etape numrotee, certaines peuvent etre faites en parallele, impossible de creer une boucle.

## What is a DAG?

A **DAG** (Directed Acyclic Graph) is a structure that represents a workflow where:
- **Directed**: Tasks have a clear direction (A → B means A runs before B)
- **Acyclic**: No loops—a task can't depend on itself directly or indirectly
- **Graph**: Tasks are nodes, dependencies are edges

![DAG Model](excalidraw:src/web/assets/diagrams/dag-dag-model.excalidraw)

DAGs are ideal for workflows because they:
- Define clear execution order
- Enable parallel execution of independent tasks
- Prevent infinite loops
- Make dependencies explicit

## Tasks

A **task** is a unit of work in the DAG. Each task has:

| Property | Description |
|----------|-------------|
| `id` | Unique identifier |
| `toolName` | MCP tool to execute |
| `serverHint` | Preferred MCP server |
| `parameters` | Input values for the tool |
| `dependsOn` | List of task IDs this task waits for |
| `priority` | Execution priority (lower = higher priority) |
| `checkpoint` | Whether to pause for approval |

### Task States

Tasks progress through states:

| State | Description |
|-------|-------------|
| `PENDING` | Waiting for dependencies |
| `RUNNING` | Currently executing |
| `COMPLETED` | Successfully finished |
| `FAILED` | Execution error |
| `SKIPPED` | Dependency failed |

## Dependencies (dependsOn)

The `dependsOn` array specifies which tasks must complete before a task can start:

```
Task D depends on [Task B, Task C]
  → Waits for BOTH B and C to complete
  → If either fails, D may be skipped

dependsOn: [] → Runs immediately
dependsOn: ["A"] → Waits for A
dependsOn: ["A", "B"] → Waits for BOTH

Data flow: Task A output → Task B input
```

## Building DAGs

DAGs can be created in two ways:

### 1. Explicit Definition

Define the structure manually:

```
workflow:
  tasks:
    - id: read
      toolName: read_file
      parameters: { path: "data.json" }

    - id: parse
      toolName: parse_json
      dependsOn: [read]

    - id: write
      toolName: write_file
      dependsOn: [parse]
      parameters: { path: "output.json" }
```

### 2. Intent-Based (DAG Suggester)

Let PML build the DAG from your intent:

```
Intent: "Read data.json and write to output.json"

PML automatically creates:
  read → parse → write
```

## Validation

Before execution, PML validates: No cycles (A → B → A invalid), valid task references, existing tools, required parameters.

## Example

A complete DAG for processing a file:

![DAG Workflow](excalidraw:src/web/assets/diagrams/dag-workflow.excalidraw)

## Exemple concret : Deploiement d'application

Voici un workflow reel de deploiement d'application web :

| Layer | Tasks | Parallelism |
|-------|-------|-------------|
| **0: Preparation** | Run tests, Build assets, Lint code | ✅ Parallel |
| **1: Build** | Create bundle | Sequential (waits for Layer 0) |
| **2: Deploy** | Deploy API, Upload CDN, Update Database | ✅ Parallel |
| **3: Verification** | Health check → Send notification | Sequential |

**Comme un plan IKEA :**
1. Préparez toutes les pièces (tests, build, lint)
2. Assemblez le meuble (create bundle)
3. Ajoutez les accessoires (deploy API, CDN, DB)
4. Vérifiez la stabilité (health check)

**Pourquoi cette structure ?**
- Tests, build et lint peuvent s'executer en parallele (independants)
- Le bundle necessite que tout soit valide (depend du Layer 0)
- Les deployments peuvent etre paralleles (independants entre eux)
- Le health check attend que tout soit deploye
- Si les tests echouent, tout s'arrete (pas de deploiement defectueux)

## Next

- [DAG Suggester](./02-dag-suggester.md) - Automatic DAG construction
- [Parallelization](./03-parallelization.md) - Concurrent execution
