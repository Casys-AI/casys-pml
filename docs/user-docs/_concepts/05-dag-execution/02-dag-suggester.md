# DAG Suggester

> Automatic workflow construction from intent

## En bref

Le DAG Suggester est comme un GPS intelligent pour vos workflows : vous lui donnez votre destination
("je veux lire un fichier et creer une issue GitHub"), et il construit automatiquement l'itineraire
complet avec toutes les etapes necessaires. Il utilise l'apprentissage de PML pour savoir quels
outils utiliser, dans quel ordre, et comment les connecter.

**Points cles :**

- Transformation automatique d'intentions en workflows
- Utilise la connaissance apprise des dependances entre outils
- Suggere l'ordre optimal des taches
- Gere les ambiguites avec le contexte

**Analogie :** GPS intelligent - Vous donnez la destination, il calcule le meilleur itineraire en
tenant compte du traffic, des routes et de votre historique de trajets.

## How it Works

The **DAG Suggester** transforms natural language intent into executable workflows. It uses PML's
learned knowledge to build DAGs automatically.

![DAG Replanning](excalidraw:src/web/assets/diagrams/dag-replanning.excalidraw)

## Input: User Intent

The suggester accepts natural language describing what you want to accomplish:

### Simple Intents

```
"Read a file and parse it as JSON"
→ read_file → parse_json

"Create a GitHub issue"
→ github:create_issue

"List all TypeScript files"
→ filesystem:list_files (with filter)
```

### Complex Intents

```
"Read package.json, extract dependencies, and check each one
for security vulnerabilities using npm audit"

→ read_file
   → parse_json
      → extract_dependencies
         → npm_audit (for each)
```

### Context-Aware Intents

When tools are already in use, the suggester considers context:

```
Current context: Using github:get_issue

Intent: "Add a comment and close it"

→ github:add_comment → github:update_issue (state: closed)

(Suggester knows the issue context from previous tools)
```

## Output: DAG Structure

The suggester produces a complete DAG ready for execution:

### Generated Structure

```
{
  tasks: [
    {
      id: "task_1",
      toolName: "filesystem:read_file",
      serverHint: "filesystem",
      parameters: { path: "config.json" },
      dependsOn: []
    },
    {
      id: "task_2",
      toolName: "json:validate",
      serverHint: "json",
      dependsOn: ["task_1"]
    },
    {
      id: "task_3",
      toolName: "github:create_issue",
      serverHint: "github",
      parameters: { title: "Validation failed" },
      dependsOn: ["task_2"],
      condition: "task_2.result === false"
    }
  ]
}
```

### What Gets Determined

| Aspect          | How It's Determined                   |
| --------------- | ------------------------------------- |
| **Which tools** | Semantic search + capability matching |
| **Tool order**  | Learned dependencies from graph       |
| **Parameters**  | Intent parsing + schema inference     |
| **Conditions**  | Natural language conditionals parsed  |

## Using Learned Dependencies

The suggester leverages PML's knowledge graph for intelligent ordering:

```
Query: What typically follows read_file?
  → parse_json (80% confidence, 50 observations) ✓ Selected
  → write_file (65% confidence, 30 observations)
  → validate (45% confidence, 15 observations)

Intent: "Process the data file"
Paths evaluated:
  Path A: read → parse → transform → write (0.85) ✓ Selected
  Path B: read → validate → transform → write (0.72)
  Path C: read → transform → write (0.60)
```

## Suggestion Process

Four-step process to transform intent into DAG:

```
Intent: "Read config.json and create an issue if invalid"

1. Analyze: read + config.json + create issue + if invalid
2. Match: read_file + json:validate + github:create_issue
3. Resolve: read_file → validate → create_issue
4. Assemble:
   read_file → validate → create_issue (conditional)
```

## Handling Ambiguity

```
Ambiguous: "Send the data"
  → Ask: "Write file? POST API? Email?"

Context-aware: "Update it"
  Recent: github:get_issue, github:add_comment
  → Suggests: github:update_issue

Multiple options: "Store results"
  1. filesystem:write_file (most common)
  2. database:insert (if available)
  3. github:create_gist (for sharing)
```

## Exemple concret : Pipeline CI/CD automatique

Intention : "Tester mon code, le builder et deployer en staging"

```
DAG GENERE :
  Layer 0: Lint + Test + Security scan (parallele)
  Layer 1: Build app (si Layer 0 OK)
  Layer 2: Deploy to staging
  Layer 3: Health check + Notify team

COMME UN GPS :
  Input: "Je veux aller au travail"
  Output: Itineraire optimal base sur traffic, historique, preferences

DAG SUGGESTER :
  Input: "Je veux deployer mon code"
  Output: Workflow optimal base sur outils, dependances apprises, contexte
```

**Apprentissage continu :**

```
Usage 1:   "Build and deploy" → build → deploy
Usage 10:  "Build and deploy" → test → build → deploy
Usage 50:  "Build and deploy" → test → build → deploy → healthcheck
```

## Next

- [Parallelization](./03-parallelization.md) - Running tasks concurrently
- [Checkpoints](./04-checkpoints.md) - Human and agent decision points
