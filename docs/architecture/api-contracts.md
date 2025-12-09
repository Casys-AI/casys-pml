# API Contracts

## CLI Commands

```bash
# Story 1.7: Migration tool
cai init [--dry-run] [--config <path>]
# Output: Migration summary, instructions

# Story 2.4: Gateway server
cai serve [--port <port>] [--stdio]
# Runs MCP gateway server

# Story 2.5: Health checks
cai status [--verbose]
# Output: Server health, database size, metrics
```

## Internal APIs

**Vector Search API:**

```typescript
// src/vector/search.ts
export interface VectorSearchAPI {
  search(query: string, topK: number): Promise<SearchResult[]>;
  indexTool(toolId: string, schema: ToolSchema): Promise<void>;
  getEmbedding(text: string): Promise<Float32Array>;
}
```

**DAG Executor API:**

```typescript
// src/dag/executor.ts
export interface DAGExecutorAPI {
  execute(dag: DAG): AsyncGenerator<ExecutionEvent>;
  // Yields events: task_start, task_complete, error
}
```

**MCP Gateway Protocol:**

- Implements MCP specification 2025-06-18
- stdio transport (stdin/stdout)
- Methods: `list_tools`, `call_tool`, `list_resources`

---
