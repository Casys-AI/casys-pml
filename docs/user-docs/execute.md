# pml:execute — Run Code

> Execute code with automatic access to MCP tools

---

## Basic Usage

Write TypeScript code that uses MCP tools:

```typescript
pml:execute({
  intent: "Read package.json",
  code: `
    const content = await mcp.filesystem.read_file({ path: "package.json" });
    return JSON.parse(content);
  `
})
```

PML runs your code in a sandbox with access to all configured tools.

---

## How to Call Tools

Tools are available via `mcp.server.tool()`:

```typescript
// Filesystem
await mcp.filesystem.read_file({ path: "config.json" })
await mcp.filesystem.write_file({ path: "out.txt", content: "hello" })

// Git
await mcp.git.status({ path: "." })
await mcp.git.commit({ message: "feat: add feature" })

// GitHub
await mcp.github.create_issue({ repo: "owner/repo", title: "Bug" })

// Memory
await mcp.memory.search_nodes({ query: "config" })

// Any MCP server you have configured
await mcp.{server}.{tool}({ ...args })
```

---

## Modes

### Direct Mode (with code)

Execute immediately and learn the pattern:

```typescript
pml:execute({
  intent: "Count TypeScript files in src/",
  code: `
    const files = await mcp.filesystem.list_directory({ path: "src" });
    const tsFiles = files.filter(f => f.endsWith(".ts"));
    return { count: tsFiles.length, files: tsFiles };
  `
})
```

### Suggestion Mode (without code)

Get suggestions for how to accomplish your intent:

```typescript
pml:execute({
  intent: "Deploy to production"
})
// Returns suggested workflow, then use accept_suggestion to run
```

### Accept a Suggestion

```typescript
pml:execute({
  accept_suggestion: {
    callName: "deploy_workflow",
    args: { environment: "prod" }
  }
})
```

---

## Options

### Basic

| Option | Type | Description |
|--------|------|-------------|
| `intent` | string | What you want to accomplish |
| `code` | string | TypeScript code to execute |
| `options.timeout` | number | Max time in ms (default: 30000) |
| `options.per_layer_validation` | boolean | Pause for approval between steps |

### Accept Suggestion

| Option | Type | Description |
|--------|------|-------------|
| `accept_suggestion.callName` | string | Name of the suggested capability to run |
| `accept_suggestion.args` | object | Arguments to pass to the capability |

### Continue Workflow

| Option | Type | Description |
|--------|------|-------------|
| `continue_workflow.workflow_id` | string | ID of the paused workflow |
| `continue_workflow.approved` | boolean | `true` to continue, `false` to abort |

---

## Workflow Control

### Pause for Approval

When `per_layer_validation: true` or a sensitive operation is detected, PML pauses and asks for approval:

```json
{
  "status": "approval_required",
  "workflowId": "wf_abc123"
}
```

### Continue a Paused Workflow

```typescript
pml:execute({
  continue_workflow: {
    workflow_id: "wf_abc123",
    approved: true
  }
})
```

### Reject and Stop

```typescript
pml:execute({
  continue_workflow: {
    workflow_id: "wf_abc123",
    approved: false
  }
})
```

---

## Stop a Running Workflow

Use `pml:abort` to immediately stop a workflow:

```typescript
pml:abort({
  workflow_id: "wf_abc123",
  reason: "Taking too long"
})
```

---

## Add Tasks to a Running Workflow

Use `pml:replan` to add new tasks:

```typescript
pml:replan({
  workflow_id: "wf_abc123",
  new_tasks: [
    { tool: "slack:send_message", args: { channel: "#dev", text: "Done!" } }
  ],
  reason: "Need to notify team"
})
```

---

## What's Returned

### Success

```json
{
  "status": "success",
  "result": { "count": 42, "files": ["..."] },
  "capabilityId": "cap_xyz",
  "executionTimeMs": 127
}
```

### Error

```json
{
  "status": "error",
  "error": "File not found: config.json"
}
```

---

## Examples

### Read and transform data

```typescript
pml:execute({
  intent: "Load config and extract database settings",
  code: `
    const raw = await mcp.filesystem.read_file({ path: "config.yaml" });
    const config = parseYaml(raw);
    return config.database;
  `
})
```

### Multi-step workflow

```typescript
pml:execute({
  intent: "Run tests and report results",
  code: `
    const result = await mcp.shell.exec({ command: "npm test" });

    if (result.exitCode !== 0) {
      await mcp.slack.send_message({
        channel: "#ci",
        text: "Tests failed!"
      });
    }

    return { passed: result.exitCode === 0 };
  `
})
```

### With timeout

```typescript
pml:execute({
  intent: "Long running analysis",
  code: `...`,
  options: { timeout: 60000 }  // 60 seconds
})
```

---

## Tips

- **Return data** — Always `return` something useful
- **Handle errors** — Use try/catch for robust code
- **Keep it focused** — One clear intent per execution

---

## Next

Learn how to manage your learned capabilities with [**pml:admin**](./admin.md).
