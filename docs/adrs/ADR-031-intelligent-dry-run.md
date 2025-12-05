# ADR-031: Intelligent Dry-Run with MCP Mocking

## Status
**Draft** - 2025-12-05

> **Note:** This ADR assumes the Worker RPC Bridge from ADR-032 is implemented.
> The `wrapToolCall()` references below are conceptually replaced by the RPC bridge interception.

## Context

ADR-030 introduces real execution in GatewayHandler with a `dry_run` mode. Currently, dry_run is a **useless placeholder** that returns `"Simulated execution of {tool}"`.

With Epic 7 delivering:
- **Story 7.1b** (planned): Worker RPC Bridge with native tracing (ADR-032)
- **Story 7.2b**: Schema inference (ts-morph + Zod)
- **Story 7.5a**: Capability result cache

We can transform dry_run into a **powerful pre-flight check**.

## Decision

Implement intelligent dry_run that:

1. **Executes code in Deno sandbox** (safe, isolated)
2. **Type-checks arguments** against inferred MCP schemas
3. **Returns cached real results** from `capability_cache` when available
4. **Falls back to schema-based mocks** when no cache hit

### Architecture (Updated for ADR-032 Worker RPC Bridge)

```
Agent: execute_dag(intent, dry_run=true)
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  MAIN PROCESS - WorkerBridge                            │
│                                                         │
│  RPC calls intercepted in bridge:                       │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  handleRPCCall(msg) intercepts                   │   │
│  │                                                   │   │
│  │  if (dry_run) {                                  │   │
│  │    1. Validate args vs schema (Story 7.2b)       │   │
│  │    2. Lookup capability_cache (Story 7.5a)       │   │
│  │    3. Return cached result OR schema mock        │   │
│  │  } else {                                        │   │
│  │    → Real MCP call via mcpClient.callTool()      │   │
│  │  }                                               │   │
│  │                                                   │   │
│  │  Native tracing (Story 7.1b) in all modes        │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
         ▲ postMessage (rpc_call)
         │
┌─────────────────────────────────────────────────────────┐
│  DENO WORKER (permissions: "none")                      │
│  Code runs with tool proxies: mcp.server.tool(args)    │
│  Proxies send RPC to bridge → bridge handles dry_run   │
└─────────────────────────────────────────────────────────┘
         │
         ▼
  Result: Realistic simulated output + validation errors
```

### Data Sources

| Epic 7 Story | Data | Dry-run Usage |
|--------------|------|---------------|
| **7.1b** (ADR-032) | Native bridge traces | See which tools would be called |
| **7.2b** | Zod schemas from ts-morph | Type-check args before execution |
| **7.5a** | `capability_cache` table | Return REAL recorded responses |

### Mock Strategy (Priority Order)

```typescript
async function mockToolExecution(
  serverId: string,
  toolName: string,
  args: unknown
): Promise<MockResult> {

  // 1. BEST: Return cached real response (Story 7.5a)
  const cached = await capabilityCache.lookup(
    `${serverId}:${toolName}`,
    hashParams(args)
  );
  if (cached) {
    return {
      result: cached.result,
      _source: "capability_cache",
      _cached_at: cached.created_at,
      _mocked: true
    };
  }

  // 2. GOOD: Generate from output schema (Story 7.2b)
  const schema = await schemaRegistry.getOutputSchema(serverId, toolName);
  if (schema) {
    return {
      result: generateFromZodSchema(schema),
      _source: "schema_mock",
      _mocked: true
    };
  }

  // 3. FALLBACK: Basic placeholder
  return {
    result: null,
    _source: "placeholder",
    _mocked: true,
    _warning: "No cached data or schema available for realistic mock"
  };
}
```

### Validation Errors (Pre-flight Check)

Dry-run can catch errors **before** real execution:

```typescript
interface DryRunValidation {
  syntax_valid: boolean;      // Deno parsed the code
  type_errors: TypeErrora[];   // Args don't match schema
  missing_tools: string[];    // Tool not found in registry
  cache_hits: number;         // How many tools had cached results
  cache_misses: number;       // How many tools used mocks
  warnings: string[];         // Non-fatal issues
}
```

Example output:
```json
{
  "dry_run": true,
  "validation": {
    "syntax_valid": true,
    "type_errors": [
      { "tool": "filesystem:write_file", "arg": "content", "expected": "string", "got": "number" }
    ],
    "missing_tools": [],
    "cache_hits": 2,
    "cache_misses": 1,
    "warnings": ["filesystem:delete_file has no cached result, using schema mock"]
  },
  "simulated_result": { ... }
}
```

## Use Cases

### 1. Agent Pre-flight Check
```
User: "Deploy to production"
Agent: Let me verify the plan first...
  → execute_dag(intent, dry_run=true)
  → Sees validation errors or simulated success
  → Fixes issues OR proceeds with dry_run=false
```

### 2. CI/CD Testing
```typescript
// Test workflows without side effects
const result = await gateway.executeDag(complexWorkflow, { dry_run: true });
assertEquals(result.validation.type_errors.length, 0);
```

### 3. Cost/Risk Estimation
```
dry_run response includes:
  - tools_called: ["db:query", "api:post", "email:send"]
  - estimated_duration_ms: 450
  - side_effects: ["writes to database", "sends email"]
  - reversible: false
```

### 4. Schema Validation During Development
```
Developer writes code that calls MCP tools
  → dry_run catches type mismatches immediately
  → No need to run real tools to find arg errors
```

## Implementation Notes

### Prerequisites
- **Story 7.1b** (Worker RPC Bridge) - Required for tool call interception
- **Story 7.2b** (schema inference) - Required for type-checking
- **Story 7.5a** (capability cache) - Required for realistic mocks

### Files to Modify
- `src/sandbox/worker-bridge.ts` - Add dry_run flag to handleRPCCall()
- `src/mcp/gateway-handler.ts` - Pass dry_run through execution chain
- `src/mcp/gateway-server.ts` - Add dry_run parameter to execute_dag tool

### Estimated Effort
- **Phase 1** (ADR-030): Real execution + basic dry_run flag (~20 LOC)
- **Phase 2** (after 7.5a): Cache-based mocking (~50 LOC)
- **Phase 3** (after 7.2b): Schema validation (~30 LOC)

## Consequences

### Positive
- Agents can "think before acting" safely
- Type errors caught before execution
- Realistic simulations from cached data
- Zero side effects during exploration

### Negative
- Cache misses produce less realistic mocks
- Additional complexity in execution path
- Slight overhead for cache lookups

### Risks
- Stale cache could produce misleading mocks (mitigated by TTL)
- Schema changes could invalidate mocks (mitigated by invalidation triggers)

## References

- ADR-030: Gateway Real Execution Implementation
- ADR-032: Sandbox Worker RPC Bridge (native tracing)
- Story 7.1b: Worker RPC Bridge - Native Tracing
- Story 7.2b: Schema Inference (ts-morph + Zod)
- Story 7.5a: Capability Result Cache
- `src/sandbox/worker-bridge.ts:handleRPCCall()` - Interception point
