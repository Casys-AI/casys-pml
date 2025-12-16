# Story 3.3: Refaire Notebook 04 avec Vrai WorkerBridge

**Status:** ready-for-dev

## Story

As a **user**,
I want **notebook 04 to use the real Worker RPC Bridge**,
So that **I see the actual production code in action**.

## Acceptance Criteria

1. Remplacer `SimulatedWorkerBridge` par import du vrai `WorkerBridge` ou helper
2. Remplacer `MockMCPClient` par connexion au vrai gateway (si disponible) ou mock minimal
3. Les traces capturées sont de vraies traces du système
4. La démo de sécurité utilise le vrai sandbox Deno
5. Tous les outputs restent pédagogiques et clairs
6. Fallback gracieux si le gateway n'est pas disponible

## Tasks / Subtasks

- [ ] Task 1: Refactor notebook 04 cells (AC: 1, 3, 5)
  - [ ] NOTE: WorkerBridge helper already available from Story 3.2
  - [ ] 2.1: Replace SimulatedWorkerBridge class with import from helper
  - [ ] 2.2: Update "Mock MCP Client" cell to use real or minimal mock
  - [ ] 2.3: Verify trace output format matches real TraceEvent type
  - [ ] 2.4: Update trace visualization to use real trace structure
- [ ] Task 3: Fix security demo (AC: 4)
  - [ ] 3.1: Create actual Worker sandbox test instead of notebook permissions test
  - [ ] 3.2: Show real PermissionDenied errors from Worker context
  - [ ] 3.3: Demonstrate RPC bridge allowing tool calls while blocking direct access
- [ ] Task 4: Add fallback handling (AC: 6)
  - [ ] 4.1: Detect if gateway is available at startup
  - [ ] 4.2: Show clear message when using mock vs real gateway
  - [ ] 4.3: Ensure all demos work with mock when gateway unavailable
- [ ] Task 5: Preserve pedagogy (AC: 5)
  - [ ] 5.1: Keep all explanatory markdown cells
  - [ ] 5.2: Keep checkpoint exercises
  - [ ] 5.3: Update "From Traces to Capabilities" section to use real traces

## Dev Notes

### Current SimulatedWorkerBridge Analysis

The current `SimulatedWorkerBridge` in notebook 04 (cell `cell-bridge-simulator`):

```typescript
class SimulatedWorkerBridge {
  private traces: TraceEvent[] = [];
  async execute(executor: (mcp) => Promise<unknown>): Promise<ExecutionResult>
  private async executeToolWithTrace(server, tool, args): Promise<unknown>
  getTraces(): TraceEvent[]
}
```

### Real WorkerBridge API

From `src/sandbox/worker-bridge.ts`:

```typescript
class WorkerBridge {
  constructor(mcpClients: Map<string, MCPClientBase>, config?: WorkerBridgeConfig)
  async execute(
    code: string,
    toolDefinitions: ToolDefinition[],
    context?: Record<string, unknown>,
    capabilityContext?: string,
    parentTraceId?: string
  ): Promise<WorkerExecutionResult>
  getTraces(): TraceEvent[]
  getToolsCalled(): string[]
  getToolInvocations(): ToolInvocation[]
}
```

### Key Differences to Address

| SimulatedWorkerBridge | Real WorkerBridge |
|----------------------|-------------------|
| Takes executor function | Takes code string |
| Sync trace recording | Async with BroadcastChannel |
| Mock MCP calls inline | Real RPC to MCP servers |
| No security isolation | Actual Worker sandbox |

### Integration Pattern

```typescript
// In playground/lib/capabilities.ts
import { WorkerBridge } from "../../src/sandbox/worker-bridge.ts";
import { type MCPClientBase } from "../../src/mcp/types.ts";

let _workerBridge: WorkerBridge | null = null;

export async function getWorkerBridge(
  mcpClients?: Map<string, MCPClientBase>
): Promise<WorkerBridge> {
  if (!_workerBridge) {
    const clients = mcpClients ?? await getDefaultMCPClients();
    _workerBridge = new WorkerBridge(clients, {
      timeout: 30000,
      capabilityStore: await getCapabilityStore()
    });
  }
  return _workerBridge;
}

// Minimal mock MCP client for demos
class MinimalMockMCPClient implements MCPClientBase {
  // Implement required interface methods
}
```

### Security Demo Fix

Current demo tests notebook's own permissions (wrong). Should test Worker's permissions:

```typescript
// WRONG (current)
const test1 = await tryForbiddenOp("Deno.readFile", () => Deno.readFile("/etc/passwd"));

// CORRECT (should be)
const bridge = await getWorkerBridge();
const result = await bridge.execute(`
  // This code runs INSIDE the Worker sandbox
  try {
    await Deno.readFile("/etc/passwd");
    return { blocked: false };
  } catch (e) {
    return { blocked: true, error: e.message };
  }
`, []);
// result.result.blocked should be true
```

### Trace Format Alignment

Ensure notebook displays match real TraceEvent structure:

```typescript
type TraceEvent =
  | { type: "tool_start"; tool: string; traceId: string; ts: number; args?: Record<string, unknown> }
  | { type: "tool_end"; tool: string; traceId: string; ts: number; success: boolean; durationMs: number; error?: string }
```

### Files to Modify

- `playground/lib/capabilities.ts` - Add WorkerBridge helper
- `playground/notebooks/04-code-execution.ipynb` - Refactor cells

### References

- [Source: src/sandbox/worker-bridge.ts] - WorkerBridge class
- [Source: src/sandbox/executor.ts] - DenoSandboxExecutor
- [Source: ADR-032] - Worker RPC Bridge architecture
- [Source: playground/notebooks/04-code-execution.ipynb] - Current notebook

## Dev Agent Record

### Context Reference

Story created from Epic 3 definition in `docs/epics-playground.md`
Depends on Story 3.1 (CapabilityStore helpers) and Story 3.2 (WorkerBridge helper)

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Analyzed current SimulatedWorkerBridge implementation
- Documented API differences between simulated and real
- Identified security demo fix needed

### File List

Files to modify:
- `playground/lib/capabilities.ts` (ADD WorkerBridge helper)
- `playground/notebooks/04-code-execution.ipynb` (REFACTOR)
