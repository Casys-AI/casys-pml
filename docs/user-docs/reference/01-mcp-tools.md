# MCP Tools Reference

## Overview

PML (Procedural Memory Layer) exposes its features via the MCP (Model Context Protocol). This reference documents all available tools.

**Version:** 1.0.0

**Available transports:**

| Transport           | Command                                     | Features                                |
| ------------------- | ------------------------------------------- | --------------------------------------- |
| **stdio**           | `pml serve --config ...`             | MCP protocol, console logs              |
| **Streamable HTTP** | `pml serve --config ... --port 3001` | MCP on `/mcp` + Dashboard + Events SSE  |

> **Note:** stdio mode is recommended for Claude Code. Streamable HTTP mode (MCP spec
> 2025-03-26) enables the Fresh dashboard and real-time events.

---

## Tool Architecture

PML exposes two types of tools:

| Type               | Pattern             | Description                                                  |
| ------------------ | ------------------- | ------------------------------------------------------------ |
| **Meta-tools**     | `pml:*`      | PML intelligent tools (search, capabilities, DAG, sandbox) |
| **Proxied tools**  | `serverId:toolName` | Tools from underlying MCP servers (filesystem, github...)    |

> **Note:** By default, only meta-tools are listed to minimize context usage
> (ADR-013). Underlying tools are discovered via `search_tools` or used directly if
> their name is known.

---

## PML Meta-Tools

### pml:search_tools

Semantic search and recommendations based on the usage graph.

**Parameters:**

| Name              | Type     | Required | Description                                              |
| ----------------- | -------- | -------- | -------------------------------------------------------- |
| `query`           | string   | Yes      | Natural language description of what you want to do      |
| `limit`           | number   | No       | Max number of tools to return (default: 5)               |
| `include_related` | boolean  | No       | Include related tools from graph (default: false)        |
| `context_tools`   | string[] | No       | Already used tools - boosts related tools                |

**Request example:**

```typescript
await callTool("pml:search_tools", {
  query: "read and parse JSON files",
  limit: 5,
  include_related: true,
});
```

**Response example:**

```json
{
  "content": [{
    "type": "text",
    "text": "{\"tools\":[{\"name\":\"filesystem:read_file\",\"score\":0.92,\"description\":\"Read file contents\"},{\"name\":\"filesystem:read_directory\",\"score\":0.85,\"related\":false},{\"name\":\"memory:search_nodes\",\"score\":0.72,\"related\":true}]}"
  }]
}
```

---

### pml:search_capabilities

Search for proven code patterns learned from successful executions.

**Parameters:**

| Name                 | Type    | Required | Description                                              |
| -------------------- | ------- | -------- | -------------------------------------------------------- |
| `intent`             | string  | Yes      | What you want to accomplish - finds similar past successes |
| `include_suggestions`| boolean | No       | Also show related capabilities (default: false)          |

**Request example:**

```typescript
await callTool("pml:search_capabilities", {
  intent: "parse JSON from API and store in database",
  include_suggestions: true,
});
```

**Response example:**

```json
{
  "content": [{
    "type": "text",
    "text": "{\"capabilities\":[{\"id\":\"cap_abc123\",\"intent\":\"fetch API data and insert to DB\",\"match_score\":0.94,\"success_rate\":0.95,\"reuse_count\":12,\"tools_used\":[\"fetch:get\",\"json:parse\",\"db:insert\"],\"code\":\"const data = await fetch...\"}]}"
  }]
}
```

**When to use:**

| Tool | Purpose |
|------|---------|
| `search_tools` | Find MCP tools by capability description |
| `search_capabilities` | Find proven code patterns that worked before |

> **Tip:** Use `search_capabilities` when you want to reuse existing patterns instead of building from scratch. The returned code can be executed directly via `execute_code`.

---

### pml:execute_dag

Execute a multi-tool DAG (Directed Acyclic Graph) workflow.

**Usage modes:**

- **Intent:** Provide `intent` → PML suggests and executes the optimal DAG
- **Explicit:** Provide `workflow` → Executes the explicitly defined DAG

> Provide **either** `intent` **or** `workflow`, not both.

**Parameters:**

| Name                   | Type    | Required | Description                                               |
| ---------------------- | ------- | -------- | --------------------------------------------------------- |
| `intent`               | string  | No*      | Natural description of the goal (suggestion mode)         |
| `workflow`             | object  | No*      | Explicit DAG structure (explicit mode)                    |
| `per_layer_validation` | boolean | No       | Pause between each layer for validation (default: false)  |

*At least one of the two is required.

**Workflow structure (explicit mode):**

```typescript
{
  workflow: {
    tasks: [
      {
        id: string,           // Unique task identifier
        tool: string,         // Tool name (serverId:toolName)
        arguments: object,    // Tool arguments
        dependsOn?: string[] // IDs of dependent tasks
      }
    ]
  }
}
```

**Example - Intent Mode:**

```typescript
await callTool("pml:execute_dag", {
  intent: "Read config.json and create a memory entity with its content",
});
```

**Example - Explicit Mode with parallelization:**

```typescript
await callTool("pml:execute_dag", {
  workflow: {
    tasks: [
      { id: "t1", tool: "filesystem:read_file", arguments: { path: "config.json" } },
      { id: "t2", tool: "filesystem:read_file", arguments: { path: "package.json" } },
      {
        id: "t3",
        tool: "memory:create_entities",
        arguments: { entities: [{ name: "config", content: "$t1.result" }] },
        dependsOn: ["t1"],
      },
    ],
  },
});
// t1 and t2 execute in parallel, t3 waits for t1
```

**Response example (success):**

```json
{
  "content": [{
    "type": "text",
    "text": "{\"status\":\"complete\",\"results\":{\"t1\":{\"content\":\"...\"},\"t2\":{\"content\":\"...\"},\"t3\":{\"success\":true}},\"metrics\":{\"total_time_ms\":1823,\"parallel_branches\":2}}"
  }]
}
```

**Response example (per-layer validation):**

```json
{
  "content": [{
    "type": "text",
    "text": "{\"status\":\"layer_complete\",\"workflow_id\":\"wf_abc123\",\"current_layer\":1,\"total_layers\":3,\"layer_results\":[...],\"next_action\":\"Use pml:continue to proceed\"}"
  }]
}
```

---

### pml:execute_code

Execute TypeScript/JavaScript code in an isolated Deno sandbox.

**Parameters:**

| Name             | Type   | Required | Description                                       |
| ---------------- | ------ | -------- | ------------------------------------------------- |
| `code`           | string | Yes      | TypeScript code to execute                        |
| `intent`         | string | No       | Description for automatic tool discovery          |
| `context`        | object | No       | Data/context to inject into the sandbox           |
| `sandbox_config` | object | No       | Sandbox configuration                             |

**sandbox_config options:**

| Option             | Type     | Default | Description                              |
| ------------------ | -------- | ------- | ---------------------------------------- |
| `timeout`          | number   | 30000   | Timeout in milliseconds                  |
| `memoryLimit`      | number   | 512     | Heap memory limit in MB                  |
| `allowedReadPaths` | string[] | []      | Additional allowed read paths            |

**REPL behavior:**

- Simple expressions → auto-return (`2 + 2` returns `4`)
- Multi-statements → explicit `return` required

**Example - Data processing:**

```typescript
await callTool("pml:execute_code", {
  code: `
    const items = context.data;
    const filtered = items.filter(x => x.active);
    return {
      total: filtered.length,
      summary: filtered.slice(0, 5)
    };
  `,
  context: { data: largeDataset },
});
```

**Example - With tool discovery:**

```typescript
await callTool("pml:execute_code", {
  intent: "Analyze GitHub commits",
  code: `
    // 'github' injected automatically thanks to intent
    const commits = await github.listCommits({ limit: 100 });
    return commits.filter(c => c.author === "alice").length;
  `,
});
```

**Response example:**

```json
{
  "content": [{
    "type": "text",
    "text": "{\"result\":42,\"logs\":[],\"metrics\":{\"execution_time_ms\":127,\"memory_used_mb\":45}}"
  }]
}
```

---

### pml:continue

Continue execution of a paused workflow (after per-layer validation).

**Parameters:**

| Name          | Type   | Required | Description                               |
| ------------- | ------ | -------- | ----------------------------------------- |
| `workflow_id` | string | Yes      | Workflow ID (returned by execute_dag)     |
| `reason`      | string | No       | Reason for continuation                   |

**Example:**

```typescript
await callTool("pml:continue", {
  workflow_id: "wf_abc123",
  reason: "Layer 1 validated, continue",
});
```

---

### pml:abort

Stop a running workflow.

**Parameters:**

| Name          | Type   | Required | Description              |
| ------------- | ------ | -------- | ------------------------ |
| `workflow_id` | string | Yes      | Workflow ID to stop      |
| `reason`      | string | Yes      | Reason for stopping      |

**Example:**

```typescript
await callTool("pml:abort", {
  workflow_id: "wf_abc123",
  reason: "Error detected in layer 1 results",
});
```

---

### pml:replan

Re-plan a DAG with new requirements (discovered during execution).

**Parameters:**

| Name                | Type   | Required | Description                             |
| ------------------- | ------ | -------- | --------------------------------------- |
| `workflow_id`       | string | Yes      | Workflow ID to replan                   |
| `new_requirement`   | string | Yes      | Description of what needs to be added   |
| `available_context` | object | No       | Context for replanning                  |

**Example:**

```typescript
// After discovering unexpected XML files
await callTool("pml:replan", {
  workflow_id: "wf_abc123",
  new_requirement: "Parse discovered XML files",
  available_context: {
    discovered_files: ["config.xml", "data.xml"],
  },
});
```

---

### pml:approval_response

Respond to a Human-in-the-Loop (HIL) approval checkpoint.

**Parameters:**

| Name            | Type    | Required | Description                                     |
| --------------- | ------- | -------- | ----------------------------------------------- |
| `workflow_id`   | string  | Yes      | Workflow ID                                     |
| `checkpoint_id` | string  | Yes      | Checkpoint ID (returned by workflow)            |
| `approved`      | boolean | Yes      | `true` to approve, `false` to reject            |
| `feedback`      | string  | No       | Comment or reason for the decision              |

**Example:**

```typescript
await callTool("pml:approval_response", {
  workflow_id: "wf_abc123",
  checkpoint_id: "cp_xyz789",
  approved: true,
  feedback: "Operation validated, proceed with deployment",
});
```

---

## Proxied Tools

Tools from underlying MCP servers are accessible via the `serverId:toolName` pattern.

**Examples:**

```typescript
// File reading via filesystem server
await callTool("filesystem:read_file", { path: "/path/to/file.txt" });

// GitHub issue creation
await callTool("github:create_issue", {
  repo: "owner/repo",
  title: "Bug report",
  body: "Description...",
});

// Memory search
await callTool("memory:search_nodes", { query: "configuration" });
```

> **Discovery:** Use `pml:search_tools` to find available tools by intent.

---

## Data Types

### DAGStructure

Structure of a DAG workflow.

```typescript
interface DAGStructure {
  tasks: DAGTask[];
}

interface DAGTask {
  id: string; // Unique identifier
  tool: string; // "serverId:toolName"
  type?: "mcp_tool" | "code_execution";
  arguments: Record<string, unknown>;
  dependsOn?: string[]; // Dependency IDs (camelCase, not snake_case)
  code?: string; // For type: "code_execution"
}
```

### TaskResult

Task execution result.

```typescript
interface TaskResult {
  taskId: string;
  status: "success" | "error" | "skipped";
  result?: unknown;
  error?: string;
  duration_ms: number;
}
```

### WorkflowStatus

Workflow status.

```typescript
type WorkflowStatus =
  | "running" // Currently executing
  | "paused" // Waiting for validation/approval
  | "complete" // Completed successfully
  | "aborted" // Stopped by user
  | "error"; // Failed
```

---

## Error Codes

| Code   | Name             | Description        | Resolution                                       |
| ------ | ---------------- | ------------------ | ------------------------------------------------ |
| -32700 | PARSE_ERROR      | Invalid JSON       | Check request format                             |
| -32600 | INVALID_REQUEST  | Malformed request  | Check MCP structure                              |
| -32601 | METHOD_NOT_FOUND | Unknown method     | Use tools/list, tools/call, or prompts/get       |
| -32602 | INVALID_PARAMS   | Invalid parameters | Check required parameters                        |
| -32603 | INTERNAL_ERROR   | Internal error     | Check logs, retry                                |

**PML specific errors:**

| Error                | Description                    | Resolution                                       |
| -------------------- | ------------------------------ | ------------------------------------------------ |
| `WORKFLOW_NOT_FOUND` | Non-existent workflow ID       | Check ID, workflow may have expired              |
| `TOOL_NOT_FOUND`     | Unknown tool                   | Use search_tools to discover tools               |
| `SANDBOX_TIMEOUT`    | Code execution timeout         | Reduce complexity or increase timeout            |
| `SANDBOX_MEMORY`     | Sandbox memory exceeded        | Reduce data or increase memoryLimit              |
| `MCP_SERVER_ERROR`   | Underlying MCP server error    | Check MCP server connection                      |

---

## Limits

| Resource           | Limit   | Configurable                       |
| ------------------ | ------- | ---------------------------------- |
| Per-tool timeout   | 30s     | Yes (`sandbox_config.timeout`)     |
| Sandbox memory     | 512MB   | Yes (`sandbox_config.memoryLimit`) |
| Code size          | 100KB   | No                                 |
| Active workflows   | 100     | No                                 |
| Paused workflow TTL| 1 hour  | No                                 |
| Cache entries      | 100     | Yes (`--no-cache` to disable)      |

---

## Complete Examples

### Project Analysis Workflow

```typescript
// 1. Discover relevant tools
const tools = await callTool("pml:search_tools", {
  query: "read files and analyze project structure",
  include_related: true,
});

// 2. Execute a DAG workflow
const result = await callTool("pml:execute_dag", {
  intent: "Read all TypeScript files in src/ and count lines",
});

// 3. Post-process with sandbox
const analysis = await callTool("pml:execute_code", {
  code: `
    const files = context.files;
    return {
      totalFiles: files.length,
      totalLines: files.reduce((sum, f) => sum + f.lines, 0),
      avgLinesPerFile: Math.round(files.reduce((sum, f) => sum + f.lines, 0) / files.length)
    };
  `,
  context: { files: result.results },
});
```

### Workflow with Human Validation

```typescript
// 1. Start with per-layer validation
const workflow = await callTool("pml:execute_dag", {
  intent: "Deploy new version to production",
  per_layer_validation: true,
});

// 2. Examine layer results
console.log(workflow.layer_results);

// 3. Approve and continue
await callTool("pml:continue", {
  workflow_id: workflow.workflow_id,
  reason: "Tests passed, approved for deployment",
});
```

---

## See Also

- [Installation](../getting-started/01-installation.md) - Installation and setup
- [User Guide](../guides/overview.md) - Detailed usage
- [Concepts](../concepts/index.md) - How PML works
- [Configuration](./02-configuration.md) - Configuration files
- [CLI Reference](./03-cli.md) - Command-line interface
