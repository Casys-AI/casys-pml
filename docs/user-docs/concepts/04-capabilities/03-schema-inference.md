# Schema Inference

> Automatically detecting capability parameters

## How it Works

When PML captures a capability, it doesn't just store the code—it analyzes it to understand what **parameters** the capability accepts.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Schema Inference                              │
│                                                                  │
│  Input Code:                                                     │
│    const content = await mcp.read_file({ path: "data.json" });  │
│    const parsed = JSON.parse(content);                          │
│    return parsed.users;                                          │
│                                                                  │
│  Inferred Schema:                                                │
│    {                                                             │
│      path: { type: "string", description: "File to read" }      │
│    }                                                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

This makes capabilities **generalizable**—they can be reused with different inputs.

## Parameter Extraction

PML uses multiple techniques to identify parameters:

### 1. Tool Call Analysis

Every MCP tool call has defined parameters. PML extracts these:

```
Tool Call: mcp.filesystem.read_file({ path: "config.json" })

Tool Schema says:
  path: string (required) - File path to read

PML Infers:
  Capability parameter: path (string)
```

### 2. Literal Value Detection

Hardcoded values that look like they should be parameters:

```
Code: const url = "https://api.example.com/users"

Detection:
  "https://api.example.com/users" looks like a URL
  → Suggest as parameter: endpoint (string)
```

### 3. Variable Tracing

Variables that flow into tool calls are tracked:

```
Code:
  const fileName = "report.csv";
  await mcp.write_file({ path: fileName, content: data });

Tracing:
  fileName → path parameter
  → Infer: fileName is a configurable parameter
```

## Type Detection

PML infers parameter types from usage:

### String Detection

```
Indicators:
  • Used in string operations
  • Matches path/URL patterns
  • Passed to string-expecting tools

Example:
  mcp.read_file({ path: value })
  → value is string (path type)
```

### Number Detection

```
Indicators:
  • Used in arithmetic
  • Passed to number-expecting parameters
  • Looks like count/limit/offset

Example:
  mcp.search({ limit: value })
  → value is number
```

### Boolean Detection

```
Indicators:
  • Used in conditions
  • Passed to boolean parameters
  • true/false literals nearby

Example:
  mcp.list_files({ recursive: value })
  → value is boolean
```

### Object/Array Detection

```
Indicators:
  • Destructured access
  • Used with iteration
  • Passed to structured parameters

Example:
  for (const item of value) { ... }
  → value is array
```

## Inference Confidence

Not all inferences are equally reliable:

| Source | Confidence | Example |
|--------|------------|---------|
| Tool schema | High | `read_file` requires `path: string` |
| Type annotation | High | User wrote `path: string` |
| Usage pattern | Medium | Variable used as string |
| Heuristic | Low | Looks like a URL |

```
Parameter: filePath
  Inferred type: string
  Confidence: HIGH
  Reason: Tool schema requires string for 'path' parameter
```

## Generated Schema

The final schema combines all inferences:

```
Capability: read_and_parse_json

Inferred Schema:
┌─────────────────────────────────────────────────────────────────┐
│  Parameters:                                                     │
│                                                                  │
│  path (required)                                                │
│    Type: string                                                 │
│    Description: Path to the JSON file                           │
│    Confidence: HIGH                                              │
│    Source: Tool schema                                           │
│                                                                  │
│  encoding (optional)                                             │
│    Type: string                                                 │
│    Default: "utf-8"                                              │
│    Description: File encoding                                    │
│    Confidence: MEDIUM                                            │
│    Source: Usage pattern                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Schema Evolution

Schemas improve over time:

```
Initial Execution:
  path: "data.json" → Inferred as string

Second Execution:
  path: "config.json" → Confirmed as string

Third Execution:
  path: "/absolute/path/file.json" → Refined: file path pattern
```

Each execution adds evidence, making the schema more accurate.

## Using Inferred Schemas

Schemas enable several features:

### 1. Capability Invocation

When reusing a capability, PML knows what inputs are needed:

```
Capability: process_file
Schema: { path: string, output: string }

Usage:
  "Process the file sales.csv and save to report.txt"

PML Maps:
  path → "sales.csv"
  output → "report.txt"
```

### 2. Validation

Before execution, inputs can be validated:

```
Input: { path: 123, output: "result.txt" }

Validation:
  ✗ path should be string, got number
  ✓ output is valid string
```

### 3. Documentation

Schemas generate automatic documentation:

```
## process_file

Process a file and generate output.

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | string | Yes | Input file path |
| output | string | Yes | Output file path |
```

## Next

- [DAG Structure](../05-dag-execution/01-dag-structure.md) - How capabilities become workflows
- [Parallelization](../05-dag-execution/03-parallelization.md) - Concurrent execution
