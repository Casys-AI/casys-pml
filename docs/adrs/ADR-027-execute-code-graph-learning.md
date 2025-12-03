# ADR-027: Execute Code Graph Learning Integration

## Status

Proposed

## Context

Currently, `execute_code` allows running TypeScript/JavaScript in a Deno sandbox with access to MCP tools via the `ContextBuilder`. However, tool usage within code execution is **not tracked** for GraphRAG learning.

### Current Flow

```
execute_code(intent, code)
       ↓
   VectorSearch → finds relevant tools (top-k)
       ↓
   ContextBuilder → injects tools into sandbox
       ↓
   DenoSandboxExecutor → runs code, calls MCP tools
       ↓
   Return result ← NO GRAPH UPDATE
```

### Comparison with execute_dag

| Feature | `execute_dag` | `execute_code` |
|---------|---------------|----------------|
| Calls MCP tools | ✅ | ✅ |
| Creates edges | ✅ `graphEngine.updateFromExecution()` | ❌ Missing |
| Learning loop | ✅ | ❌ |

### Problem

When a user executes code like:

```typescript
const content = await filesystem.readFile({ path: "README.md" });
await memory.createEntities({ entities: [...] });
```

The sequence `filesystem:read_file → memory:create_entities` is **not learned** by the GraphRAG. This means:

1. No edge created between these tools
2. No confidence boost for this pattern
3. Future DAG suggestions won't benefit from this usage data

## Decision

Implement graph learning for `execute_code` tool calls with the following approach:

### Option A: Track Injected Tools (Simpler)

Track which tools were **injected** into the sandbox based on intent, regardless of actual usage:

```typescript
// After successful execution
if (result.success && request.intent && toolResults.length > 0) {
  await this.graphEngine.updateFromExecution({
    execution_id: crypto.randomUUID(),
    executed_at: new Date(),
    intent_text: request.intent,
    dag_structure: {
      tasks: toolResults.map((t, i) => ({
        id: `task_${i}`,
        tool: `${t.serverId}:${t.toolName}`,
        depends_on: i > 0 ? [`task_${i-1}`] : [],
      })),
    },
    success: true,
    execution_time_ms: executionTimeMs,
    source: "execute_code",
  });
}
```

**Pros:**
- Simple implementation
- No sandbox modification needed
- Consistent with existing learning API

**Cons:**
- May create edges for tools that weren't actually called
- Less accurate than actual usage tracking

### Option B: Track Actual Tool Calls (More Accurate)

Instrument the `ContextBuilder` wrappers to report actual tool invocations:

```typescript
// In context-builder.ts wrapMCPClient()
wrapped[methodName] = async (args) => {
  const result = await client.callTool(toolName, args);

  // Report usage to tracker
  this.usageTracker?.recordToolCall(serverId, toolName);

  return result;
};
```

Then after execution:

```typescript
const toolsUsed = executor.getToolsUsed(); // Ordered list of actual calls
await this.graphEngine.updateFromExecution({
  dag_structure: buildDAGFromToolSequence(toolsUsed),
  // ...
});
```

**Pros:**
- Accurate edge creation (only actual usage)
- Captures real tool sequences
- Better learning signal

**Cons:**
- More complex implementation
- Requires sandbox-to-parent communication for tracking
- Need to handle async/parallel tool calls

### Option C: Hybrid Approach (Recommended)

1. **Phase 1**: Implement Option A (track injected tools) as quick win
2. **Phase 2**: Add optional actual tracking via wrapper instrumentation

This provides immediate value while allowing for future accuracy improvements.

## Implementation Plan

### Phase 1: Injected Tools Tracking

**File:** `src/mcp/gateway-server.ts`

```typescript
// In handleExecuteCode(), after line 1131 (success log)

// Track tool usage for graph learning (ADR-027)
if (result.success && request.intent && toolResults.length > 0) {
  try {
    await this.graphEngine.updateFromExecution({
      execution_id: crypto.randomUUID(),
      executed_at: new Date(),
      intent_text: request.intent,
      dag_structure: {
        tasks: toolResults.map((t, i) => ({
          id: `code_task_${i}`,
          tool: `${t.serverId}:${t.toolName}`,
          arguments: {},
          depends_on: [], // No dependency info available
        })),
      },
      success: true,
      execution_time_ms: executionTimeMs,
    });
    log.debug(`Graph updated with ${toolResults.length} tools from execute_code`);
  } catch (err) {
    log.warn(`Failed to update graph from execute_code: ${err}`);
    // Non-fatal: don't fail the execution for learning errors
  }
}
```

### Phase 2: Actual Usage Tracking (Future)

1. Add `UsageTracker` interface to `ContextBuilder`
2. Wrap tool functions with usage recording
3. Extract tool sequence after execution
4. Build DAG with proper dependencies based on call order

## Consequences

### Positive

- `execute_code` contributes to GraphRAG learning
- Tool patterns discovered via code execution improve future suggestions
- Consistent learning across all execution modes

### Negative

- Phase 1 may create some false edges (tools injected but not called)
- Additional database writes per execution
- Slight performance overhead

### Neutral

- Learning from code execution is inherently less structured than DAG execution
- Edge confidence from code execution should potentially be weighted lower

## Metrics

Track effectiveness via:

- `execute_code_graph_updates_total` - Number of graph updates from code execution
- `execute_code_tools_tracked` - Tools per execution
- Compare edge creation rate between `execute_dag` and `execute_code`

## References

- ADR-016: Deno Sandbox Execution
- Story 3.4: Tool Discovery for Code Execution
- `src/mcp/gateway-server.ts:1019-1148` - handleExecuteCode implementation
- `src/sandbox/context-builder.ts` - Tool injection system
