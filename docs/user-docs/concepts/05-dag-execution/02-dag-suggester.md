# DAG Suggester

> Automatic workflow construction from intent

## How it Works

The **DAG Suggester** transforms natural language intent into executable workflows. It uses PML's learned knowledge to build DAGs automatically.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  INPUT                                                           │
│  ─────                                                          │
│  "Read config.json, validate it, and create a GitHub issue      │
│   if validation fails"                                          │
│                                                                  │
│                           │                                      │
│                           ▼                                      │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    DAG SUGGESTER                           │  │
│  │                                                            │  │
│  │  1. Parse intent                                          │  │
│  │  2. Match to known tools/capabilities                     │  │
│  │  3. Determine dependencies from learned patterns          │  │
│  │  4. Build DAG structure                                   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│                           │                                      │
│                           ▼                                      │
│                                                                  │
│  OUTPUT                                                          │
│  ──────                                                         │
│  DAG with tasks: read → validate → create_issue                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

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

| Aspect | How It's Determined |
|--------|---------------------|
| **Which tools** | Semantic search + capability matching |
| **Tool order** | Learned dependencies from graph |
| **Parameters** | Intent parsing + schema inference |
| **Conditions** | Natural language conditionals parsed |

## Using Learned Dependencies

The suggester leverages PML's knowledge graph for intelligent ordering.

### From tool_dependency Table

```
Query: What typically follows read_file?

Graph knowledge:
  read_file → parse_json (80% confidence, 50 observations)
  read_file → write_file (65% confidence, 30 observations)
  read_file → validate (45% confidence, 15 observations)

Suggestion: parse_json is most likely next step
```

### From capability_dependency Table

```
Intent matches capability: "file_processing"

Capability contains:
  read_file → transform → write_file

Suggester uses this pattern as template
```

### Confidence-Based Selection

When multiple paths exist, confidence determines the suggestion:

```
Intent: "Process the data file"

Possible paths:
  Path A: read → parse → transform → write (confidence: 0.85)
  Path B: read → validate → transform → write (confidence: 0.72)
  Path C: read → transform → write (confidence: 0.60)

Selected: Path A (highest confidence)
```

## Suggestion Process

### Step 1: Intent Analysis

Break down the intent into components:

```
Intent: "Read config.json and create an issue if invalid"

Components:
  • Action: "read" → tool category: file reading
  • Target: "config.json" → parameter: path
  • Action: "create issue" → tool category: GitHub
  • Condition: "if invalid" → conditional execution
```

### Step 2: Tool Matching

Find tools that match each component:

```
"read" + "config.json" → filesystem:read_file
"create issue" → github:create_issue
"invalid" → implies validation step → json:validate
```

### Step 3: Dependency Resolution

Use the knowledge graph to order tools:

```
Graph query: What connects read_file to create_issue?

Found path: read_file → validate → create_issue

Dependencies:
  validate depends on read_file
  create_issue depends on validate
```

### Step 4: DAG Assembly

Combine everything into a DAG:

```
Final DAG:
  ┌──────────────┐
  │ read_file    │
  │ path: config │
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │ validate     │
  └──────┬───────┘
         │
         ▼ (if invalid)
  ┌──────────────┐
  │ create_issue │
  └──────────────┘
```

## Handling Ambiguity

When intent is unclear, the suggester can:

### Ask for Clarification

```
Intent: "Send the data"

Ambiguous: Send where? How?

Options:
  1. Write to file
  2. POST to API
  3. Send via email

Suggester: "How would you like to send the data?"
```

### Use Context

```
Recent tools: github:get_issue, github:add_comment

Intent: "Update it"

Context suggests: github:update_issue
(Not filesystem:write_file)
```

### Provide Alternatives

```
Intent: "Store the results"

Suggestions:
  1. filesystem:write_file (most common)
  2. database:insert (if DB tools available)
  3. github:create_gist (for sharing)
```

## Next

- [Parallelization](./03-parallelization.md) - Running tasks concurrently
- [Checkpoints](./04-checkpoints.md) - Human and agent decision points
