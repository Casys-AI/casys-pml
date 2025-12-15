# What is a Capability?

> Reusable code patterns learned from execution

## Definition

A **capability** is a piece of code that PML has learned from successful execution. It represents a complete solution to a problem, ready to be reused.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Capability                                  │
│                                                                  │
│  Intent: "Read JSON file and extract field"                     │
│                                                                  │
│  Tools Used: [read_file, parse_json]                            │
│                                                                  │
│  Code Pattern: Stored for reuse                                  │
│                                                                  │
│  Success Rate: 95%                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

Think of capabilities as **recipes** - tried and tested solutions that worked before and will work again.

## Capability vs Tool

Understanding the difference is key:

| Aspect | Tool | Capability |
|--------|------|------------|
| **Source** | MCP servers | Learned from execution |
| **Scope** | Single operation | Complete workflow |
| **Parameters** | Fixed schema | Inferred from usage |
| **Complexity** | Atomic | Composite |

### Example

```
Tool: read_file
  → Reads one file from disk

Capability: file_to_issue
  → Reads a file
  → Extracts error information
  → Creates GitHub issue with details
```

A capability **orchestrates** multiple tools to accomplish a goal.

## Lifecycle

Capabilities go through distinct phases:

```
┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
│  CAPTURE   │───▶│  STORE     │───▶│  MATURE    │───▶│  REUSE     │
└────────────┘    └────────────┘    └────────────┘    └────────────┘
      │                 │                 │                 │
 Code executes    Saved with        Used multiple      Suggested
 successfully     intent & code     times, gains       for similar
                                    confidence         intents
```

### 1. Capture

When code executes successfully, PML captures:
- The original intent (what the user wanted)
- The code that was executed
- The tools that were called
- The execution trace

### 2. Store

The captured pattern is stored in the database:
- Embeddings generated for semantic search
- Dependencies extracted for graph relationships
- Parameters inferred from the code

### 3. Mature

As the capability is reused:
- Success rate is tracked
- Confidence increases
- Related capabilities are linked

### 4. Reuse

Mature capabilities are suggested when:
- Intent matches semantically
- Context is similar
- Related tools are in use

## Storage

Capabilities are stored in the `workflow_pattern` table:

| Field | Purpose |
|-------|---------|
| `intent` | What the capability accomplishes |
| `code` | The executable TypeScript/JavaScript |
| `tools_used` | Array of MCP tools called |
| `parameters` | Inferred parameters schema |
| `embedding` | Vector for semantic search |
| `success_count` | Times executed successfully |
| `last_used` | Recency for ranking |

## Capability Relationships

Capabilities connect to other nodes in the knowledge graph:

```
              ┌───────────────┐
              │  Capability   │
              │ file_to_issue │
              └───────────────┘
                     │
         ┌──────────┼──────────┐
         │          │          │
    contains    contains    contains
         │          │          │
         ▼          ▼          ▼
    ┌────────┐ ┌────────┐ ┌────────┐
    │read_   │ │parse_  │ │create_ │
    │file    │ │error   │ │issue   │
    └────────┘ └────────┘ └────────┘
```

These relationships enable:
- Finding capabilities by their component tools
- Suggesting tools based on capability context
- Building new capabilities from existing ones

## Next

- [Eager Learning](./02-eager-learning.md) - How capabilities are captured
- [Schema Inference](./03-schema-inference.md) - Automatic parameter detection
