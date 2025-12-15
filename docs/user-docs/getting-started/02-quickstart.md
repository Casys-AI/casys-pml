# Quickstart

> Your first PML workflow in 5 minutes

## Prerequisites

Before starting, ensure you have:
- PML installed and configured ([Installation Guide](./01-installation.md))
- At least one MCP server configured (e.g., filesystem)
- Claude Code or another MCP client running

## Step 1: Verify PML is Running

If using stdio mode with Claude Code, PML starts automatically when you launch Claude Code.

For HTTP mode, start manually:

```bash
./pml serve --config config/mcp-servers.json --port 3001
```

You should see:

```
🚀 Starting PML MCP Gateway...
✓ Connected: filesystem
✓ Connected: memory
PML gateway running on port 3001
```

## Step 2: Search for Tools

Let's find tools using semantic search. In Claude Code, ask:

```
Use pml:search_tools to find tools related to "read files"
```

PML returns relevant tools ranked by semantic similarity:

```
Results:
  1. filesystem:read_file (0.95) - Read file contents
  2. filesystem:list_files (0.82) - List directory contents
  3. filesystem:read_directory (0.78) - Read directory tree
```

The scores indicate how well each tool matches your intent.

## Step 3: Execute a Simple DAG

Now let's run a multi-step workflow. Ask Claude:

```
Use pml:execute_dag with intent "Read package.json and extract the project name"
```

PML automatically:
1. Identifies the required tools
2. Builds a DAG with proper dependencies
3. Executes the workflow

Result:

```
{
  "status": "complete",
  "results": {
    "read": { "content": "{ \"name\": \"my-project\", ... }" },
    "extract": { "name": "my-project" }
  },
  "metrics": {
    "total_time_ms": 145
  }
}
```

## Step 4: Run Code in the Sandbox

For data processing, use the sandbox. Ask:

```
Use pml:execute_code to count lines in a JSON array:
[{"name": "Alice"}, {"name": "Bob"}, {"name": "Charlie"}]
```

PML executes the code in an isolated Deno environment:

```javascript
// PML executes this safely
const data = [{"name": "Alice"}, {"name": "Bob"}, {"name": "Charlie"}];
return data.length;  // Returns: 3
```

## Step 5: Parallel Execution

Watch PML parallelize independent tasks. Ask:

```
Use pml:execute_dag with intent "Read config.json, package.json, and README.md simultaneously"
```

PML detects these are independent and runs them in parallel:

```
Layer 0: [read_config, read_package, read_readme]  ← PARALLEL
         Time: 89ms (not 3 × 89ms = 267ms)
```

## What You've Learned

| Feature | What It Does |
|---------|--------------|
| `pml:search_tools` | Find tools by natural language |
| `pml:execute_dag` | Run multi-tool workflows |
| `pml:execute_code` | Process data in sandbox |
| Parallelization | Automatic speedup |

## Next Steps

Now explore more advanced features:

- **[Concepts](../concepts/index.md)** - Deep dive into how PML works
- **[DAG Execution](../concepts/05-dag-execution/01-dag-structure.md)** - Complex workflows
- **[Capabilities](../concepts/04-capabilities/01-what-is-capability.md)** - Learned patterns
- **[MCP Tools Reference](../reference/01-mcp-tools.md)** - Complete API documentation

## Common Issues

### PML not responding

Check if the gateway is running:
```bash
./pml status
```

### Tools not found

Re-initialize to refresh tool discovery:
```bash
./pml init --config config/mcp-servers.json
```

### Slow execution

Enable the cache for repeated operations:
```bash
./pml serve --config ... # Cache enabled by default
```
