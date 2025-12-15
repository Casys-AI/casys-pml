# Feedback Loop

> How PML learns from every execution

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
