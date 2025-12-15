# Proactive Suggestions

> Automatic tool recommendations without explicit search

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

```
┌─────────────────────────────────────────────────────────────┐
│                    Current Context                          │
│                                                             │
│  Tools in use: [read_file, github:get_issue]               │
│  Intent: "Process issue and update file"                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    PML Analysis                             │
│                                                             │
│  1. Find tools related to read_file in the graph           │
│  2. Find tools related to github:get_issue                 │
│  3. Match intent against capabilities                       │
│  4. Rank by relevance and success rate                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Suggestions                              │
│                                                             │
│  → write_file (85% confidence)                             │
│  → github:update_issue (72% confidence)                    │
│  → github:add_comment (68% confidence)                     │
└─────────────────────────────────────────────────────────────┘
```

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

| Scenario | Trigger |
|----------|---------|
| **DAG Building** | When constructing a workflow |
| **After Execution** | "You might also want to..." |
| **On Error** | Alternative tools that might work |
| **Idle Context** | Periodic suggestions based on history |

## Suggestion Quality

Not all suggestions are equal. PML ranks them by:

| Factor | Weight |
|--------|--------|
| **Relationship strength** | How often tools are used together |
| **Success rate** | How often the suggestion leads to success |
| **Recency** | Recent patterns matter more |
| **Context match** | How well it fits current intent |

## Opting Out

Suggestions are helpful but optional:
- Ignore them if not relevant
- Disable in configuration
- Provide feedback to improve future suggestions

## Next

- [GraphRAG](../03-learning/01-graphrag.md) - The graph powering suggestions
- [Dependencies](../03-learning/02-dependencies.md) - How relationships are learned
