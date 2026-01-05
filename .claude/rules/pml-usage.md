# PML HTTP - Usage Guide for Claude

## Overview

PML (Procedural Memory Layer) is the MCP server that provides tool discovery and execution capabilities.
Use `mcp__pml_http__*` tools for executing code with MCP tool access.

## Key Tools

### 1. `pml_discover` - Find tools/capabilities
```typescript
// Find tools by intent
mcp__pml_http__pml_discover({
  intent: "database query postgres sql",
  limit: 10,
  filter: { type: "tool" }  // or "capability" or "all"
})
```

### 2. `pml_execute` - Execute code with MCP access

**Direct Mode (with code):**
```typescript
mcp__pml_http__pml_execute({
  intent: "Delete SHGAT params from database",
  code: `
    const result = await mcp.std.psql_query({ query: "DELETE FROM shgat_params" });
    return result;
  `
})
```

**Suggestion Mode (without code):**
```typescript
mcp__pml_http__pml_execute({
  intent: "Read a JSON file and parse it"
})
// Returns suggested DAG, then use accept_suggestion to execute
```

## MCP Tool Namespaces

Access tools via `mcp.<server>.<tool>()`:

| Namespace | Tools | Example |
|-----------|-------|---------|
| `mcp.std` | MiniTools (120+) | `mcp.std.psql_query()`, `mcp.std.git_status()` |
| `mcp.filesystem` | File operations | `mcp.filesystem.read_file()`, `mcp.filesystem.write_file()` |
| `mcp.memory` | Knowledge graph | `mcp.memory.create_entities()` |

## Common Patterns

### Database Queries (PostgreSQL)
```typescript
// Query
const result = await mcp.std.psql_query({ query: "SELECT * FROM capabilities LIMIT 10" });
return result.rows;

// Execute (DDL/DML)
const result = await mcp.std.psql_query({ query: "DELETE FROM table_name WHERE condition" });
return result;
```

### Database Queries (PGlite - embedded)
```typescript
// Query
const result = await mcp.std.pglite_query({ query: "SELECT * FROM capabilities" });
return result.rows;

// Execute
const result = await mcp.std.pglite_exec({ sql: "DELETE FROM shgat_params" });
return result;
```

### File Operations
```typescript
const content = await mcp.filesystem.read_file({ path: "/path/to/file.json" });
return JSON.parse(content);
```

### Git Operations
```typescript
const status = await mcp.std.git_status({ path: "." });
return status;
```

## Workflow Continuations

When `pml_execute` returns `status: "approval_required"`:

```typescript
// Continue with approval
mcp__pml_http__pml_execute({
  continue_workflow: {
    workflow_id: "uuid-from-previous-response",
    approved: true
  }
})
```

## Important Notes

- Always use `mcp.std.psql_query` for PostgreSQL (production)
- Use `mcp.std.pglite_query` for PGlite (embedded dev DB)
- The `code` parameter is TypeScript executed in sandbox
- Results are returned as JSON
- HIL (Human-in-the-Loop) checkpoints may pause execution for approval
