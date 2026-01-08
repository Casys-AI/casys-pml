# MCP Tools Reference

PML exposes its features via the MCP (Model Context Protocol). This reference documents the available tools.

---

## Overview

PML can be used in two ways:

**Cloud Mode (pml.casys.ai)**

Hosted service, no installation required.

**Local Mode (open source)**

| Transport | Command | Usage |
|-----------|---------|-------|
| **stdio** | `pml serve --config <mcp-servers.json>` | Claude Code integration |
| **HTTP** | `pml serve --config <mcp-servers.json> --port 3003` | Local dashboard |

---

## Tool Architecture

PML exposes **meta-tools** via the `pml:*` pattern:

| Tool | Description |
|------|-------------|
| `pml:discover` | Search tools and capabilities by intent |
| `pml:execute` | Execute code with MCP tool access |
| `pml:abort` | Stop a running workflow |

MCP tools (filesystem, github, etc.) are accessible inside `pml:execute` code via `mcp.server.tool()`.

---

## PML Meta-Tools

### pml:discover

Search MCP tools and learned capabilities by intent. Returns ranked results.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `intent` | string | Yes | What do you want to accomplish? Natural language description. |
| `filter` | object | No | Optional filters for results |
| `filter.type` | string | No | `"tool"`, `"capability"`, or `"all"` (default) |
| `filter.minScore` | number | No | Minimum score threshold 0-1 (default: 0.0) |
| `limit` | number | No | Maximum results to return (default: 1, max: 50) |
| `include_related` | boolean | No | Include related tools from usage patterns (default: false) |

**Example:**

```typescript
await callTool("pml:discover", {
  intent: "read and parse JSON files",
  limit: 5,
  include_related: true
});
```

**Response:**

```json
{
  "results": [
    {
      "type": "tool",
      "record_type": "mcp-tool",
      "id": "filesystem:read_file",
      "name": "read_file",
      "description": "Read file contents",
      "score": 0.92,
      "server_id": "filesystem",
      "input_schema": { "type": "object", "properties": { "path": { "type": "string" } } },
      "related_tools": [
        { "tool_id": "filesystem:write_file", "relation": "often_after", "score": 0.8 }
      ]
    }
  ],
  "meta": {
    "query": "read and parse JSON files",
    "filter_type": "all",
    "total_found": 5,
    "returned_count": 5,
    "tools_count": 3,
    "capabilities_count": 2
  }
}
```

---

### pml:execute

Execute code with MCP tool access. Creates a learned capability on success.

**Modes:**

| Mode | Parameters | Behavior |
|------|------------|----------|
| **Direct** | `intent` + `code` | Execute code, learn capability |
| **Continue** | `continue_workflow` | Resume paused workflow |

#### Direct Mode

Execute TypeScript code with automatic MCP tool injection.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `intent` | string | Yes | Natural language description of the goal |
| `code` | string | Yes | TypeScript code to execute |
| `options.timeout` | number | No | Max execution time in ms (default: 30000) |
| `options.per_layer_validation` | boolean | No | Pause between layers for validation (default: false) |

**MCP Tool Access:**

Tools are available via `mcp.server.tool()` pattern:

```typescript
// Read a file
const content = await mcp.filesystem.read_file({ path: "config.json" });

// Create a GitHub issue
await mcp.github.create_issue({ repo: "owner/repo", title: "Bug" });

// Query memory
const nodes = await mcp.memory.search_nodes({ query: "config" });
```

**Example:**

```typescript
await callTool("pml:execute", {
  intent: "Read package.json and extract dependencies",
  code: `
    const content = await mcp.filesystem.read_file({ path: "package.json" });
    const pkg = JSON.parse(content);
    return {
      name: pkg.name,
      dependencies: Object.keys(pkg.dependencies || {})
    };
  `
});
```

**Response (success):**

```json
{
  "status": "success",
  "result": {
    "name": "my-project",
    "dependencies": ["express", "lodash"]
  },
  "capabilityId": "cap_abc123",
  "capabilityName": "extract_dependencies",
  "capabilityFqdn": "local.default.pkg.extract_dependencies.a7f3",
  "mode": "direct",
  "executionTimeMs": 127
}
```

**Response (approval required):**

When `per_layer_validation: true` or a dangerous operation is detected:

```json
{
  "status": "approval_required",
  "workflowId": "wf_xyz789",
  "checkpointId": "cp_abc123",
  "pendingLayer": 2
}
```

#### Continue Mode

Resume a paused workflow after approval.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `continue_workflow.workflow_id` | string | Yes | Workflow ID from previous response |
| `continue_workflow.approved` | boolean | Yes | `true` to continue, `false` to abort |

**Example - Approve and continue:**

```typescript
await callTool("pml:execute", {
  continue_workflow: {
    workflow_id: "wf_xyz789",
    approved: true
  }
});
```

**Example - Reject and abort:**

```typescript
await callTool("pml:execute", {
  continue_workflow: {
    workflow_id: "wf_xyz789",
    approved: false
  }
});
```

---

### pml:abort

Stop a running workflow immediately. Use this for proactive cancellation.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workflow_id` | string | Yes | Workflow ID to stop |
| `reason` | string | Yes | Why you're aborting (for audit trail) |

**Example:**

```typescript
await callTool("pml:abort", {
  workflow_id: "wf_xyz789",
  reason: "User requested cancellation"
});
```

**Response:**

```json
{
  "status": "aborted",
  "workflowId": "wf_xyz789",
  "reason": "User requested cancellation"
}
```

> **Note:** Use `pml:abort` for proactive cancellation. Use `continue_workflow.approved = false` to reject a specific checkpoint.

---

## Error Codes

**Standard MCP errors:**

| Code | Name | Description |
|------|------|-------------|
| -32700 | PARSE_ERROR | Invalid JSON |
| -32600 | INVALID_REQUEST | Malformed request |
| -32601 | METHOD_NOT_FOUND | Unknown method |
| -32602 | INVALID_PARAMS | Invalid parameters |
| -32603 | INTERNAL_ERROR | Internal error |

**PML specific errors:**

| Error | Description | Resolution |
|-------|-------------|------------|
| `WORKFLOW_NOT_FOUND` | Unknown workflow ID | Check ID, workflow may have expired |
| `EXECUTION_ERROR` | Code execution failed | Check code syntax and MCP tool calls |
| `TIMEOUT_ERROR` | Operation timed out | Increase timeout or simplify operation |
| `DAG_EXECUTION_ERROR` | Workflow task failed | Check task dependencies |
| `MCP_SERVER_ERROR` | MCP server unreachable | Check server configuration |

---

## Limits

| Resource | Limit | Configurable |
|----------|-------|--------------|
| Execution timeout | 30s | Yes (`options.timeout`) |
| Sandbox memory | 512MB | No |
| Code size | 100KB | No |
| Paused workflow TTL | 1 hour | No |

---

## Complete Example

```typescript
// 1. Discover relevant tools
const discovery = await callTool("pml:discover", {
  intent: "read files and analyze project structure",
  limit: 5
});

// 2. Execute with code
const result = await callTool("pml:execute", {
  intent: "Analyze TypeScript files in src/",
  code: `
    const files = await mcp.filesystem.list_directory({ path: "src" });
    const tsFiles = files.filter(f => f.endsWith(".ts"));

    let totalLines = 0;
    for (const file of tsFiles) {
      const content = await mcp.filesystem.read_file({ path: "src/" + file });
      totalLines += content.split("\\n").length;
    }

    return {
      fileCount: tsFiles.length,
      totalLines,
      avgLinesPerFile: Math.round(totalLines / tsFiles.length)
    };
  `
});

console.log(result);
// { fileCount: 42, totalLines: 3500, avgLinesPerFile: 83 }
```

---

## See Also

- [Installation](../getting-started/01-installation.md) - Setup guide
- [Configuration](./02-configuration.md) - Configuration files
- [CLI Reference](./03-cli.md) - Command-line interface
