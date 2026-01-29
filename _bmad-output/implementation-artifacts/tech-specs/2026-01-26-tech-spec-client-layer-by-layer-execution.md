---
title: 'Client Layer-by-Layer DAG Execution'
slug: 'client-layer-by-layer-execution'
created: '2026-01-26'
updated: '2026-01-26'
status: 'investigation-complete'
tech_stack: ['deno', 'typescript']
---

# Tech-Spec: Client Layer-by-Layer DAG Execution

**Created:** 2026-01-26
**Status:** Draft
**Related:** code-task-dependency-detection, two-level-dag-architecture

## Architectural Context

**This tech-spec operates within the existing client-server architecture:**

- **ADR-059 (Hybrid Routing):** Server analyzes code, returns `execute_locally` if client tools needed
- **ADR-062 (Workflow Separation):** Server = analysis/learning, Client = local execution

```
┌─────────────────────────────────────────────────────────────┐
│ Existing Architecture (unchanged)                           │
│                                                             │
│  Client ──► Server analyzes (SWC → DAG)                    │
│         ◄── { status: "execute_locally", dag: {...} }      │
│                                                             │
│  Client executes locally ─► TraceSyncer ─► Server learns   │
└─────────────────────────────────────────────────────────────┘
```

**This tech-spec improves HOW the client executes locally, not the overall architecture.**

---

## Problem Statement

The server correctly builds a DAG with tasks and `layerIndex`, but the client (pml package) **ignores the DAG structure** and executes the entire code as a single block.

### Current Flow (Broken)

```
Server                                    Client (pml)
───────                                   ────────────
code → StaticStructure → DAG
     → tasks with layerIndex
     → send to client                     → receive DAG
                                          → IGNORE DAG structure
                                          → execute(code) as single block
                                          → use DAG only for traces
```

### Evidence

Server logs show DAG is built:
```
[ExecuteDirectUseCase] DEBUG DAG tasks: [
  {"id":"task_n1","tool":"filesystem:read_file","dependsOn":[],"layerIndex":0},
  {"id":"task_n2","tool":"code:JSON.parse","dependsOn":["task_n1"],"layerIndex":1}
]
```

But client code (`local-executor.ts:60`):
```typescript
const result = await executor.execute(code, {...});  // Executes ALL code at once
```

### Impact

Without layer-by-layer execution:
- **No checkpoints** between layers
- **No pause/resume** capability
- **No retry** of failed layers
- **No HIL validation** per layer
- **No parallel execution** of independent tasks within a layer

## Desired Flow

```
Server                                    Client (pml)
───────                                   ────────────
code → StaticStructure → DAG
     → tasks with layerIndex
     → send to client                     → receive DAG with tasks
                                          → group tasks by layerIndex
                                          → for each layer:
                                          →   execute tasks in parallel
                                          →   checkpoint/pause point
                                          →   pass results to next layer
                                          → return final result
```

## Current Architecture

### Server Side (Working)

1. **StaticStructureBuilder** - Parses code, creates nodes and edges
2. **staticStructureToDag()** - Converts to DAG with tasks
3. **topologicalSortTasks()** - Computes `layerIndex` for each task
4. **Response** - Returns `{ execute_locally: true, dag: { tasks: [...] } }`

### Client Side (Needs Work)

**Current:** `packages/pml/src/cli/shared/local-executor.ts`
```typescript
export async function executeLocalCode(
  code: string,
  loader: CapabilityLoader | null,
  // ...
  dagTasks?: DAGTask[],  // Received but NOT used for execution
): Promise<LocalExecutionResult> {
  const executor = new SandboxExecutor({...});

  // Executes entire code block, ignores dagTasks for execution
  const result = await executor.execute(code, {...});

  // dagTasks only used for trace recording
  loader.enqueueDirectExecutionTrace(..., dagTasks);
}
```

**Current:** `packages/pml/src/execution/sandbox-executor.ts`
- Executes code as a single unit
- No concept of tasks or layers
- No checkpoint mechanism

## Proposed Solution

### Option A: Layer-by-Layer in SandboxExecutor

Modify `SandboxExecutor` to accept DAG tasks and execute layer-by-layer.

```typescript
class SandboxExecutor {
  async executeDAG(
    tasks: DAGTask[],
    options: ExecutionOptions,
  ): Promise<DAGExecutionResult> {
    const layers = this.groupByLayer(tasks);
    const results = new Map<string, TaskResult>();

    for (const [layerIndex, layerTasks] of layers) {
      // Checkpoint: emit event, allow pause
      await this.onLayerStart(layerIndex, layerTasks);

      // Execute all tasks in this layer in parallel
      const layerResults = await Promise.allSettled(
        layerTasks.map(task => this.executeTask(task, results))
      );

      // Collect results
      for (let i = 0; i < layerTasks.length; i++) {
        const task = layerTasks[i];
        const result = layerResults[i];
        if (result.status === 'fulfilled') {
          results.set(task.id, result.value);
        } else {
          // Handle failure - allow retry?
          await this.onTaskFailed(task, result.reason);
        }
      }

      // Checkpoint: allow pause/validation before next layer
      await this.onLayerComplete(layerIndex, results);
    }

    return { results, success: true };
  }

  private async executeTask(
    task: DAGTask,
    previousResults: Map<string, TaskResult>,
  ): Promise<TaskResult> {
    // Build context with dependencies
    const context = this.buildContext(task, previousResults);

    // Execute task code
    const result = await this.sandbox.execute(task.code, context);

    return { taskId: task.id, output: result, success: true };
  }
}
```

### Option B: New DAGExecutor Class

Create a dedicated `DAGExecutor` class for layer-by-layer execution.

```typescript
// packages/pml/src/execution/dag-executor.ts

export class ClientDAGExecutor {
  constructor(
    private sandbox: SandboxExecutor,
    private options: DAGExecutorOptions,
  ) {}

  async execute(
    tasks: DAGTask[],
    toolHandler: ToolHandler,
  ): Promise<DAGExecutionResult> {
    // Implementation similar to server's ParallelExecutor
    // but adapted for client-side sandbox execution
  }
}
```

### Option C: Reuse Server's Executor Pattern

Port the server's `ParallelExecutor` pattern to the client, adapting for sandbox execution.

## Recommended: Option B

Create a new `ClientDAGExecutor` that:
1. Groups tasks by `layerIndex`
2. Executes each layer with `Promise.allSettled`
3. Emits checkpoint events between layers
4. Passes results between tasks via context injection
5. Handles HIL pauses at layer boundaries

## Implementation Plan

### Phase 1: DAGTask Structure

Ensure DAG tasks have all required info for client execution:

```typescript
interface DAGTask {
  id: string;
  tool: string;
  code: string;              // Executable code for this task
  dependsOn: string[];       // Task IDs this depends on
  layerIndex: number;        // Computed by server
  variableBindings?: Record<string, string>;  // Variable → nodeId mapping
  literalBindings?: Record<string, unknown>;  // Literal values
}
```

### Phase 2: ClientDAGExecutor

```typescript
// packages/pml/src/execution/dag-executor.ts

export interface DAGExecutorOptions {
  /** Callback before each layer starts */
  onLayerStart?: (layer: number, tasks: DAGTask[]) => Promise<void>;
  /** Callback after each layer completes */
  onLayerComplete?: (layer: number, results: Map<string, TaskResult>) => Promise<void>;
  /** Callback when task fails */
  onTaskFailed?: (task: DAGTask, error: Error) => Promise<'retry' | 'skip' | 'abort'>;
  /** Enable HIL checkpoints between layers */
  enableCheckpoints?: boolean;
}

export class ClientDAGExecutor {
  constructor(
    private sandbox: SandboxExecutor,
    private toolHandler: ToolHandler,
    private options: DAGExecutorOptions = {},
  ) {}

  async execute(tasks: DAGTask[]): Promise<DAGExecutionResult> {
    // Group by layerIndex
    const layers = this.groupByLayer(tasks);
    const results = new Map<string, TaskResult>();

    for (const [layerIndex, layerTasks] of layers.entries()) {
      // Pre-layer checkpoint
      if (this.options.onLayerStart) {
        await this.options.onLayerStart(layerIndex, layerTasks);
      }

      // Execute layer in parallel
      const layerResults = await Promise.allSettled(
        layerTasks.map(task => this.executeTask(task, results))
      );

      // Process results
      for (let i = 0; i < layerTasks.length; i++) {
        const task = layerTasks[i];
        const result = layerResults[i];

        if (result.status === 'fulfilled') {
          results.set(task.id, result.value);
        } else {
          // Handle failure
          const action = await this.options.onTaskFailed?.(task, result.reason) ?? 'abort';
          if (action === 'abort') {
            return { results, success: false, failedTask: task.id };
          }
        }
      }

      // Post-layer checkpoint
      if (this.options.onLayerComplete) {
        await this.options.onLayerComplete(layerIndex, results);
      }
    }

    return { results, success: true };
  }

  private groupByLayer(tasks: DAGTask[]): Map<number, DAGTask[]> {
    const layers = new Map<number, DAGTask[]>();
    for (const task of tasks) {
      const layer = task.layerIndex ?? 0;
      if (!layers.has(layer)) {
        layers.set(layer, []);
      }
      layers.get(layer)!.push(task);
    }
    // Sort by layer index
    return new Map([...layers.entries()].sort((a, b) => a[0] - b[0]));
  }

  private async executeTask(
    task: DAGTask,
    previousResults: Map<string, TaskResult>,
  ): Promise<TaskResult> {
    // Build execution context from dependencies
    const context = this.buildContext(task, previousResults);

    // Execute via sandbox
    const result = await this.sandbox.executeCode(task.code, {
      context,
      toolHandler: this.toolHandler,
    });

    return {
      taskId: task.id,
      tool: task.tool,
      output: result.value,
      success: result.success,
      executionTimeMs: result.durationMs,
    };
  }

  private buildContext(
    task: DAGTask,
    previousResults: Map<string, TaskResult>,
  ): Record<string, unknown> {
    const context: Record<string, unknown> = {};

    // Inject dependencies from variableBindings
    if (task.variableBindings) {
      for (const [varName, nodeId] of Object.entries(task.variableBindings)) {
        const taskId = `task_${nodeId}`;
        const depResult = previousResults.get(taskId);
        if (depResult?.output !== undefined) {
          context[varName] = depResult.output;
        }
      }
    }

    // Inject literal bindings
    if (task.literalBindings) {
      for (const [varName, value] of Object.entries(task.literalBindings)) {
        if (!(varName in context)) {
          context[varName] = value;
        }
      }
    }

    return context;
  }
}
```

### Phase 3: Update local-executor.ts

```typescript
// packages/pml/src/cli/shared/local-executor.ts

export async function executeLocalCode(
  code: string,
  loader: CapabilityLoader | null,
  cloudUrl: string,
  fqdnMap: Map<string, string>,
  continueWorkflow?: ContinueWorkflowParams,
  logger?: Logger,
  serverWorkflowId?: string,
  dagTasks?: DAGTask[],
): Promise<LocalExecutionResult> {

  // If we have DAG tasks, use layer-by-layer execution
  if (dagTasks && dagTasks.length > 0) {
    return executeDAGLayerByLayer(dagTasks, loader, fqdnMap, logger);
  }

  // Fallback to single-block execution (legacy)
  return executeSingleBlock(code, loader, cloudUrl, fqdnMap, ...);
}

async function executeDAGLayerByLayer(
  tasks: DAGTask[],
  loader: CapabilityLoader | null,
  fqdnMap: Map<string, string>,
  logger?: Logger,
): Promise<LocalExecutionResult> {
  const executor = new ClientDAGExecutor(
    new SandboxExecutor({ ... }),
    toolHandler,
    {
      onLayerStart: async (layer, tasks) => {
        logger?.info(`Starting layer ${layer} with ${tasks.length} tasks`);
      },
      onLayerComplete: async (layer, results) => {
        logger?.info(`Layer ${layer} complete`);
        // Future: HIL checkpoint here
      },
      onTaskFailed: async (task, error) => {
        logger?.error(`Task ${task.id} failed: ${error.message}`);
        return 'abort';  // Future: allow retry
      },
    }
  );

  const result = await executor.execute(tasks);

  return {
    status: result.success ? 'success' : 'error',
    result: result.results.get(tasks[tasks.length - 1]?.id)?.output,
  };
}
```

### Phase 4: Server Must Send Complete Task Info

Ensure server response includes everything needed for client execution:

```typescript
// Server response
{
  execute_locally: true,
  dag: {
    tasks: [
      {
        id: "task_n1",
        tool: "filesystem:read_file",
        code: "await mcp.filesystem.read_file({ path: './deno.json' })",
        dependsOn: [],
        layerIndex: 0,
        variableBindings: {},
        literalBindings: {},
      },
      {
        id: "task_n2",
        tool: "code:JSON.parse",
        code: "JSON.parse(config)",
        dependsOn: ["task_n1"],
        layerIndex: 1,
        variableBindings: { "config": "n1" },
        literalBindings: {},
      }
    ]
  }
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `packages/pml/src/execution/dag-executor.ts` | **NEW** - ClientDAGExecutor class |
| `packages/pml/src/execution/mod.ts` | Export new executor |
| `packages/pml/src/cli/shared/local-executor.ts` | Use DAGExecutor when tasks available |
| `packages/pml/src/cli/shared/types.ts` | Update DAGTask type if needed |
| `src/mcp/handlers/code-execution-handler.ts` | Ensure full task info in response |

## Dependencies

**Prerequisite:** `code-task-dependency-detection` tech-spec
- Without correct dependencies, layerIndex will be wrong
- Tasks will be grouped incorrectly

## Verification

### Test Case 1: Sequential Dependencies

```typescript
const config = await mcp.filesystem.read_file({ path: "./deno.json" });
const parsed = JSON.parse(config);
const name = parsed.name;
return name;
```

**Expected Execution:**
```
Layer 0: [task_n1: read_file]
  → executes
  → result stored
Layer 1: [task_n2: JSON.parse]
  → receives config from n1
  → executes
  → result stored
Layer 2: [task_n3: property access]
  → receives parsed from n2
  → returns name
```

### Test Case 2: Parallel Independent Tasks

```typescript
const a = await mcp.filesystem.read_file({ path: "./a.txt" });
const b = await mcp.filesystem.read_file({ path: "./b.txt" });
return a + b;
```

**Expected Execution:**
```
Layer 0: [task_n1: read_file(a), task_n2: read_file(b)]  // PARALLEL
  → both execute simultaneously
Layer 1: [task_n3: add]
  → receives a and b
  → returns result
```

### Test Case 3: Checkpoint/Pause

```typescript
const data = await mcp.db.query({ sql: "SELECT * FROM users" });
// Layer 0 completes
// CHECKPOINT - HIL validation could pause here
const processed = data.filter(u => u.active);
return processed;
```

## Estimated Effort

| Task | Effort |
|------|--------|
| ClientDAGExecutor class | 3-4 hours |
| Context building from variableBindings | 2 hours |
| Update local-executor.ts | 1-2 hours |
| Server response updates | 1 hour |
| Testing & debugging | 3-4 hours |
| **Total** | ~10-13 hours |

## Risks & Considerations

### 1. Code Extraction Per Task

Currently server may not send `code` per task - need to verify/add.

### 2. MCP Tool Calls Within Tasks

Tasks that call MCP tools need proper routing through `toolHandler`.

### 3. Variable Scoping

Each task runs in isolation - need to ensure all required variables are injected.

### 4. Error Recovery

Design needed for retry logic - which layers can be retried? State preservation?

## Decision Log

- **2026-01-26:** Initial draft after discovering client doesn't use DAG for execution
- **Depends on:** code-task-dependency-detection for correct layerIndex

---

## Investigation Findings (2026-01-26)

### Key Discovery: Server Already Sends Everything

After investigating the codebase, we found that:

1. **Server-side `staticStructureToDag()`** creates tasks with ALL required fields:
   - `id`, `tool`, `dependsOn`, `layerIndex`
   - `code` (for code:* operations)
   - `staticArguments` (structured argument resolution)
   - `variableBindings`, `literalBindings` (context injection)

2. **`computeLayerIndexForTasks()`** uses spread operator `...task`, preserving ALL properties.

3. **`code-execution-handler.ts:353-363`** sends full tasks via `JSON.stringify()`:
   ```typescript
   return {
     content: [{
       type: "text",
       text: JSON.stringify({
         status: "execute_locally",
         code: request.code,
         dag: { tasks: tasksWithLayers },  // Full tasks with all properties
         // ...
       }),
     }],
   };
   ```

4. **BUT the client only reads 3 fields** (`capability-loader.ts:1460`):
   ```typescript
   dagTasks?: Array<{ id: string; tool: string; layerIndex: number }>
   ```
   The client **ignores** `code`, `staticArguments`, `variableBindings`, etc.

### How Server Executes DAGs (Reference)

The server's `ParallelExecutor` (`src/dag/executor.ts`) does exactly what we want:

```typescript
// Topological sort into layers
const layers = topologicalSortTasks(tasks);

for (const layer of layers) {
  // Execute ALL tasks in layer in PARALLEL
  const layerResults = await Promise.allSettled(
    layer.map(task => this.executeTask(task, results))
  );

  // Collect results for next layer
  for (let i = 0; i < layer.length; i++) {
    results.set(layer[i].id, layerResults[i]);
  }
}
```

Key patterns:
- `Promise.allSettled()` for resilient parallel execution
- Results map passes outputs between layers
- `staticArguments` resolved via `resolveReference()` with 3 strategies:
  - `{ type: "literal", value: "..." }`
  - `{ type: "reference", expression: "n1.content" }`
  - `{ type: "parameter", parameterName: "input" }`

### Why Client Can't Just "Run Code in Parallel"

The current sandbox executes **JS code sequentially**:

```javascript
// Even if independent, JS executes sequentially:
const a = await mcp.read("a.txt");  // Wait for completion
const b = await mcp.read("b.txt");  // Only THEN start this
```

The worker won't request `b` until `a` is done - it's inherent to JS `await`.

### Revised Implementation Approach

**Instead of executing JS code**, execute **tasks directly** like the server does:

1. **Update client types** to accept full task structure
2. **Create `ClientDAGExecutor`** that mirrors server's approach:
   - Group by `layerIndex`
   - `Promise.allSettled()` per layer
   - Resolve arguments via `staticArguments`
   - Execute MCP tools directly (not JS code)
   - Pass results between layers

3. **For code:* tasks**, execute via sandbox with injected context

### Files to Reference

| Server File | Purpose |
|-------------|---------|
| `src/dag/executor.ts` | ParallelExecutor - layer-by-layer execution |
| `src/dag/topological-sort.ts` | `topologicalSortTasks()`, `computeLayerIndexForTasks()` |
| `src/dag/static-to-dag-converter.ts` | How tasks are built with all properties |
| `src/dag/execution/layer-results.ts` | Result collection per layer |

### Simplified Scope

**No server changes needed** - server already sends full task info.

**Client changes only:**
1. Update `DAGTask` type to include `code`, `staticArguments`, `variableBindings`, `literalBindings`
2. Implement `ClientDAGExecutor` using same pattern as server's `ParallelExecutor`
3. Update `local-executor.ts` to use DAG executor when tasks have execution info

### Handling code:* Tasks (code:JSON.parse, code:filter, etc.)

The server uses `WorkerBridge.executeCodeTask()` for code:* tasks. Key pattern:

```typescript
// Server: src/dag/execution/code-task-executor.ts

// 1. Build context from dependencies
const executionContext = {
  ...task.arguments,
  deps: resolveDependencies(task.dependsOn, previousResults),
};

// 2. Inject variableBindings (e.g., "config" → result of task_n1)
for (const [varName, nodeId] of Object.entries(task.variableBindings)) {
  const depResult = previousResults.get(`task_${nodeId}`);
  executionContext[varName] = depResult.output;
}

// 3. Inject literalBindings (static values from code analysis)
for (const [varName, value] of Object.entries(task.literalBindings)) {
  executionContext[varName] = value;
}

// 4. Execute code with injected context
const result = await workerBridge.executeCodeTask(
  task.tool,        // "code:JSON.parse"
  task.code,        // "JSON.parse(config)"
  executionContext, // { config: "<file content>" }
  toolDefinitions,
);
```

**Client approach - Hybrid execution:**

| Task Type | Example | Execution Method |
|-----------|---------|------------------|
| **MCP tool** | `filesystem:read_file` | Direct call via `toolHandler(tool, args)` |
| **code:*** | `code:JSON.parse`, `code:filter` | Sandbox with injected context |
| **loop:*** | `loop:forOf` | Sandbox with MCP access + context |

```typescript
// Client: ClientDAGExecutor.executeTask()

async executeTask(task: DAGTask, previousResults: Map<string, TaskResult>) {
  if (task.tool.startsWith("code:") || task.tool.startsWith("loop:")) {
    // Code/loop task → sandbox execution with injected context
    const context = this.buildContext(task, previousResults);
    return await this.sandbox.execute(task.code, { context });
  } else {
    // MCP tool → direct call (parallel-friendly)
    const args = this.resolveArguments(task.staticArguments, previousResults);
    return await this.toolHandler(task.tool, args);
  }
}

private buildContext(task: DAGTask, previousResults: Map<string, TaskResult>) {
  const context: Record<string, unknown> = {};

  // Inject variableBindings: varName → output of dependency task
  if (task.variableBindings) {
    for (const [varName, nodeId] of Object.entries(task.variableBindings)) {
      const taskId = `task_${nodeId}`;
      const depResult = previousResults.get(taskId);
      if (depResult?.output !== undefined) {
        context[varName] = depResult.output;
      }
    }
  }

  // Inject literalBindings: static values from code analysis
  if (task.literalBindings) {
    for (const [varName, value] of Object.entries(task.literalBindings)) {
      if (!(varName in context)) {
        context[varName] = value;
      }
    }
  }

  return context;
}
```

**Example flow:**

```
Original code:
  const config = await mcp.filesystem.read_file({ path: "./deno.json" });
  const parsed = JSON.parse(config);
  return parsed.name;

DAG Tasks:
  Layer 0: task_n1 { tool: "filesystem:read_file", args: { path: "./deno.json" } }
  Layer 1: task_n2 { tool: "code:JSON.parse", code: "JSON.parse(config)", variableBindings: { config: "n1" } }
  Layer 2: task_n3 { tool: "code:property_access", code: "parsed.name", variableBindings: { parsed: "n2" } }

Execution:
  Layer 0: toolHandler("filesystem:read_file", { path: "./deno.json" }) → "{...}"
  Layer 1: sandbox.execute("JSON.parse(config)", { config: "{...}" }) → { name: "pml", ... }
  Layer 2: sandbox.execute("parsed.name", { parsed: { name: "pml", ... } }) → "pml"
```

**Note:** The client's existing `SandboxWorker` already supports:
- Code execution with injected context
- MCP routing via `onRpc` callback (for loop:* tasks that call MCP tools)

### Open Questions (Critical - Must Resolve Before Implementation)

#### Q1: How to identify the final return value? ✅ RESOLVED

**Finding:** The server does NOT track ReturnStatement explicitly.

From `code-execution-handler.ts:460-462`:
```typescript
result: resultData.length === 1
  ? resultData[0]   // Single result → return it
  : resultData      // Multiple results → return array of all
```

The server returns **ALL successful results**, not specifically the `return` value.

For code like:
```javascript
const a = await read();
const b = await read();
return a;  // Explicit return of 'a'
```
Server would return `[result_a, result_b]`, not just `result_a`.

**Client approach:** Same behavior - return all results or last layer's result.

**Future improvement:** Track ReturnStatement in staticStructure to identify the actual return value.

---

#### Q2: `arguments` vs `staticArguments` - which to use? ✅ RESOLVED

**Finding:** Both are used with priority order.

From `executor.ts:398-475`:
```typescript
private resolveArguments(args, previousResults, staticArgs) {
  const resolved = {};

  // 1. FIRST: staticArguments (structured format, high priority)
  if (staticArgs) {
    for (const [key, argValue] of Object.entries(staticArgs)) {
      if (argValue.type === "literal") resolved[key] = argValue.value;
      else if (argValue.type === "reference") resolved[key] = resolveRef(argValue.expression);
      // parameter: skip (resolved before execution)
    }
  }

  // 2. THEN: arguments for keys NOT already resolved
  for (const [key, value] of Object.entries(args)) {
    if (key in resolved) continue;  // Skip if already resolved from staticArgs
    // Handle legacy $OUTPUT[...] format or direct values
    resolved[key] = value;
  }

  return resolved;
}
```

**Resolution order:**
1. `staticArguments` (preferred, structured: literal/reference/parameter)
2. `arguments` (fallback, direct values or legacy `$OUTPUT[task_id]`)

**Client approach:** Use same logic - resolve `staticArguments` first, then `arguments` as fallback.

---

#### Q3: Performance overhead - is layer-by-layer worth it?

For sequential code:
```javascript
const config = await mcp.read("file.json");
const parsed = JSON.parse(config);
return parsed.name;
```

| Approach | Executions | Overhead |
|----------|------------|----------|
| **Single block** | 1 sandbox run | Minimal |
| **Layer-by-layer** | 1 MCP call + 2 sandbox runs | 3x setup cost |

**The parallelism doesn't help sequential code.** We add orchestration overhead for no benefit.

**When it helps:**
```javascript
const a = await mcp.read("a.txt");
const b = await mcp.read("b.txt");  // Independent!
return a + b;
```
Layer 0: 2 reads in parallel ✓

**Question:** Should we detect sequential-only DAGs and skip layer-by-layer execution?

---

#### Q4: Loops remain sequential inside

A `loop:forOf` task contains complete code:
```javascript
for (const file of files) {
  const content = await mcp.read(file);
  results.push(content);
}
```

When executed in sandbox, the loop body runs **sequentially**. Layer-by-layer doesn't parallelize loop iterations.

**Limitation:** This is a known constraint. Document it, but don't try to solve it now.

Future opportunity: Loop unrolling for known iteration counts.

---

#### Q5: Error messages - how to map back to original code?

If `task_n2` (`code:JSON.parse`) fails:
```
Error: task_n2 failed: SyntaxError: Unexpected token
```

User wrote `JSON.parse(config)` at line 2 of their code. How do they understand this error?

**Needs design:**
- Include source line numbers in tasks?
- Map task IDs back to code spans?
- Show both task context and original code context?

---

#### Q6: Client types are incomplete

Server `Task` type has:
```typescript
code?: string;
staticArguments?: ArgumentsStructure;
variableBindings?: Record<string, string>;
literalBindings?: Record<string, unknown>;
type?: "mcp_tool" | "code_execution" | "capability";
metadata?: { ... };
```

Client `DAGTask` type only has:
```typescript
id: string;
tool: string;
arguments?: Record<string, unknown>;
dependsOn: string[];
layerIndex: number;
// MISSING: code, staticArguments, variableBindings, literalBindings, type, metadata
```

**Action required:** Update client `DAGTask` type to match server `Task` type.

---

#### Q7: Argument resolution strategy ✅ RESOLVED

**Finding:** Server has complete `argument-resolver.ts` (388 lines, well-documented).

**Recommendation:** Port `argument-resolver.ts` to client.

Key functions to port:
```typescript
// Main entry point
export function resolveArguments(
  args: ArgumentsStructure | undefined,
  context: ExecutionContext,
  previousResults: Map<string, TaskResult>,
): Record<string, unknown>

// Resolve single argument by type
function resolveArgumentValue(argValue, context, previousResults): unknown {
  switch (argValue.type) {
    case "literal": return argValue.value;
    case "parameter": return resolveParameter(argValue.parameterName, context);
    case "reference": return resolveReference(argValue.expression, previousResults, context);
  }
}

// Parse "n1.content" → ["n1", "content"] and navigate
function resolveReference(expression, previousResults, context): unknown
function parseExpression(expression: string): string[]
function navigatePath(obj: unknown, path: string[]): unknown
```

**Location:** `src/dag/argument-resolver.ts`

**Client location:** `packages/pml/src/execution/argument-resolver.ts` (new file, port from server)

---

### Summary: Pre-Implementation Checklist

**Resolved:**
- [x] Q1: Return value → Return all results (same as server)
- [x] Q2: arguments vs staticArguments → staticArguments first, arguments fallback
- [x] Q7: Argument resolution → Port `argument-resolver.ts` from server

**Still open:**
- [ ] Q3: Decide if sequential DAGs should skip layer-by-layer (performance analysis needed)
- [ ] Q4: Document loop limitation (no action needed, just document)
- [ ] Q5: Design error message mapping (UX consideration)
- [ ] Q6: Update client DAGTask type (implementation task)
