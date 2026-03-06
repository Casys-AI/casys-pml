# Dry-Run Exploration Engine — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an exploration system that validates tool sequences via hybrid dry-run (real safe tools + mocked unsafe tools), using GRU beam search as the path-finding engine.

**Architecture:** GRU `buildPathBeam()` generates candidate tool sequences from an intent. Each tool in a candidate path is classified safe/unsafe via existing permission config. Safe tools execute for real via WorkerBridge; unsafe tools return configurable mock responses. Results are returned with confidence metrics for LLM decision. **Successful and failed explorations are stored as `execution_trace` rows** (with `exploratory: true` + per-task `mocked` flag) to serve as training data for SHGAT/GRU (ADR-12.2, ADR-12.9).

**Tech Stack:** TypeScript/Deno, GRU inference (`gru-inference.ts`), WorkerBridge (`workerbridge-executor.ts`), Permission config (`permission-inferrer.ts`), ExecutionTraceStore (`execution-trace-store.ts`)

**Data flow (storage):**
- Exploration runs → `DryRunStepResult[]` per path
- Mapped to `TraceTaskResult[]` (existing type + new `mocked: boolean` field)
- Stored via `ExecutionTraceStore.saveTrace()` with `exploratory: true` (new DB column)
- Training pipeline can filter/weight: `WHERE exploratory = true`, ratio `mocked/total` per trace
- `capability_id: null` for `unknown_intent` triggers (no cap matched by definition)
- `intent_embedding` stored for direct GRU/SHGAT training reuse

**Data enrichment (schema observation):**
- Safe tools executed for real → output captured → `observed_output_schema` inferred from shape
- Enriches `tool_schema.output_schema` with empirical data (declared vs observed)
- `provides` edges validated at dry-run time via `areTypesCompatible()` — type-incompatible chainings flagged
- `server_namespace` captured per task for multi-config tools (`tool_observations.observed_config`)

**Two triggers:**
1. **Intent inconnu** — no capability matches, explore hypothetical paths
2. **Pre-execution validation** — validate a suggested DAG before committing

---

## Task 1: Types & Interfaces (`src/exploration/types.ts`)

**Files:**
- Create: `src/exploration/types.ts`
- Test: `tests/exploration/types_test.ts`

**Step 1: Write type definitions**

```typescript
// src/exploration/types.ts

import type { JsonValue } from "../capabilities/types.ts";

/** Classification of a tool for dry-run purposes */
export type ToolSafety = "safe" | "unsafe" | "unknown";

/** Result of executing a single tool step in dry-run */
export interface DryRunStepResult {
  toolId: string;
  safety: ToolSafety;
  /** true if tool was executed for real, false if mocked */
  real: boolean;
  /** The output (real or mocked) */
  output: JsonValue;
  /** Execution time in ms (0 for mocked) */
  durationMs: number;
  /** Error if execution failed */
  error?: string;
  /** Inferred output schema shape from real execution result (Task 11) */
  observedOutputSchema?: Record<string, string>;
  /** MCP server namespace that served this tool (for multi-config tracking) */
  serverNamespace?: string;
  /** Was the chaining from previous step type-compatible? (Task 11) */
  typeCompatible?: boolean;
}

/** A single explored path with its results */
export interface ExploredPath {
  /** Tool IDs in sequence */
  path: string[];
  /** GRU beam score (length-normalized log-prob) */
  gruScore: number;
  /** Per-step execution results */
  steps: DryRunStepResult[];
  /** How many steps were real vs mocked */
  realCount: number;
  mockedCount: number;
  /** Did the path complete without errors? */
  viable: boolean;
  /** Confidence = gruScore * (realCount / totalSteps) * typeCompatibilityBonus */
  confidence: number;
  /** If not viable, which tool failed */
  failurePoint?: string;
  failureError?: string;
  /** How many step transitions were type-compatible (provides edges) */
  typeCompatibleCount?: number;
  /** Total transitions checked for type compatibility */
  totalTransitions?: number;
}

/** Input for exploration */
export interface ExploreRequest {
  /** Natural language intent */
  intent: string;
  /** Pre-computed intent embedding (avoids re-encoding) */
  intentEmbedding?: number[];
  /** Max paths to explore (default: 3) */
  maxPaths?: number;
  /** Custom mock overrides per tool ID */
  mockOverrides?: Record<string, JsonValue>;
  /** Timeout per path in ms (default: 15000) */
  pathTimeoutMs?: number;
  /** Trigger type */
  trigger: "unknown_intent" | "pre_validation";
  /** For pre_validation: the suggested DAG path to validate */
  suggestedPath?: string[];
}

/** Output of exploration */
export interface ExploreResult {
  intent: string;
  trigger: "unknown_intent" | "pre_validation";
  pathsExplored: number;
  viablePaths: ExploredPath[];
  failedPaths: ExploredPath[];
  /** Total wall-clock time for exploration */
  totalDurationMs: number;
}

/** Configuration for mock responses */
export interface MockConfig {
  /** Static mock overrides per tool ID */
  overrides: Record<string, JsonValue>;
  /** If true, use output_schema from tool definition to generate typed mocks */
  useSchemaDefaults: boolean;
}
```

**Step 2: Write a minimal type validation test**

```typescript
// tests/exploration/types_test.ts
import { assertEquals } from "@std/assert";
import type { ExploreRequest, ExploreResult, ExploredPath } from "../../src/exploration/types.ts";

Deno.test("ExploreRequest can be constructed for unknown_intent", () => {
  const req: ExploreRequest = {
    intent: "convert CSV to JSON",
    trigger: "unknown_intent",
  };
  assertEquals(req.trigger, "unknown_intent");
  assertEquals(req.maxPaths, undefined); // defaults applied by explorer
});

Deno.test("ExploreRequest can be constructed for pre_validation", () => {
  const req: ExploreRequest = {
    intent: "read and format file",
    trigger: "pre_validation",
    suggestedPath: ["filesystem:read_file", "json:parse"],
  };
  assertEquals(req.trigger, "pre_validation");
  assertEquals(req.suggestedPath?.length, 2);
});

Deno.test("ExploredPath confidence formula", () => {
  const path: ExploredPath = {
    path: ["a", "b", "c"],
    gruScore: 0.8,
    steps: [],
    realCount: 2,
    mockedCount: 1,
    viable: true,
    confidence: 0.8 * (2 / 3), // ~0.533
  };
  const expected = 0.8 * (2 / 3);
  assertEquals(Math.abs(path.confidence - expected) < 0.001, true);
});
```

**Step 3: Run test to verify it passes**

Run: `deno test tests/exploration/types_test.ts`
Expected: 3 tests PASS

**Step 4: Commit**

```bash
git add src/exploration/types.ts tests/exploration/types_test.ts
git commit -m "feat(exploration): add dry-run exploration types"
```

---

## Task 2: Tool Safety Classifier (`src/exploration/tool-safety.ts`)

**Files:**
- Create: `src/exploration/tool-safety.ts`
- Test: `tests/exploration/tool-safety_test.ts`
- Read (context): `src/capabilities/permission-inferrer.ts` — existing `getToolPermissionConfig()` and `toolRequiresHil()`
- Read (context): `src/dag/execution/dag-stream-orchestrator.ts:31-38` — existing `taskRequiresHIL()` pattern

**Step 1: Write the failing test**

```typescript
// tests/exploration/tool-safety_test.ts
import { assertEquals } from "@std/assert";
import { isToolSafe, classifyPathTools } from "../../src/exploration/tool-safety.ts";

Deno.test("isToolSafe: known safe tool (json namespace)", () => {
  assertEquals(isToolSafe("json:parse"), "safe");
});

Deno.test("isToolSafe: known safe tool (math namespace)", () => {
  assertEquals(isToolSafe("math:add"), "safe");
});

Deno.test("isToolSafe: known unsafe tool (process namespace)", () => {
  assertEquals(isToolSafe("process:exec"), "unsafe");
});

Deno.test("isToolSafe: unknown tool defaults to unknown", () => {
  assertEquals(isToolSafe("alien:teleport"), "unknown");
});

Deno.test("isToolSafe: pure code operation is safe", () => {
  assertEquals(isToolSafe("code:filter"), "safe");
  assertEquals(isToolSafe("code:map"), "safe");
});

Deno.test("classifyPathTools: mixed path", () => {
  const result = classifyPathTools([
    "json:parse",
    "filesystem:read_file",
    "process:exec",
  ]);
  assertEquals(result.get("json:parse"), "safe");
  assertEquals(result.get("filesystem:read_file"), "safe");
  assertEquals(result.get("process:exec"), "unsafe");
});
```

**Step 2: Run test to verify it fails**

Run: `deno test tests/exploration/tool-safety_test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/exploration/tool-safety.ts
/**
 * Tool Safety Classifier for Dry-Run Exploration
 *
 * Thin wrapper around existing permission infrastructure.
 * Determines per-tool whether it's safe to execute for real
 * in a dry-run context (read-only, no side effects).
 *
 * @module exploration/tool-safety
 */

import { getToolPermissionConfig } from "../capabilities/permission-inferrer.ts";
import type { ToolSafety } from "./types.ts";

/** Internal code operations are always safe (pure functions) */
const ALWAYS_SAFE_PREFIXES = new Set([
  "code", "loop", "json", "math", "datetime", "crypto",
  "collections", "validation", "format", "transform", "string", "path",
]);

/**
 * Classify a single tool as safe/unsafe/unknown for dry-run.
 *
 * Logic (mirrors `taskRequiresHIL` in dag-stream-orchestrator.ts):
 * - Always-safe prefixes (code, json, math, etc.) → "safe"
 * - Known tool with approvalMode "auto" → "safe"
 * - Known tool with approvalMode "hil" → "unsafe"
 * - Unknown tool → "unknown" (conservative)
 */
export function isToolSafe(toolId: string): ToolSafety {
  const prefix = toolId.split(":")[0];

  // Code/pure operations are always safe
  if (ALWAYS_SAFE_PREFIXES.has(prefix)) {
    return "safe";
  }

  const permConfig = getToolPermissionConfig(prefix);
  if (!permConfig) {
    return "unknown";
  }

  return permConfig.approvalMode === "auto" ? "safe" : "unsafe";
}

/**
 * Classify all tools in a path.
 *
 * @returns Map<toolId, safety> for each unique tool in the path
 */
export function classifyPathTools(path: string[]): Map<string, ToolSafety> {
  const result = new Map<string, ToolSafety>();
  for (const toolId of path) {
    if (!result.has(toolId)) {
      result.set(toolId, isToolSafe(toolId));
    }
  }
  return result;
}
```

**Step 4: Run test to verify it passes**

Run: `deno test tests/exploration/tool-safety_test.ts`
Expected: 6 tests PASS

> **Note:** `getToolPermissionConfig` loads from `config/mcp-permissions.json` — tests may need the config present or rely on defaults. If tests fail due to missing config, the default permissions in `permission-inferrer.ts` include `json:*`, `math:*`, etc. as `allow`.

**Step 5: Commit**

```bash
git add src/exploration/tool-safety.ts tests/exploration/tool-safety_test.ts
git commit -m "feat(exploration): add tool safety classifier for dry-run"
```

---

## Task 3: Mock Engine (`src/exploration/mock-engine.ts`)

**Files:**
- Create: `src/exploration/mock-engine.ts`
- Test: `tests/exploration/mock-engine_test.ts`

**Step 1: Write the failing test**

```typescript
// tests/exploration/mock-engine_test.ts
import { assertEquals, assertExists } from "@std/assert";
import { MockEngine } from "../../src/exploration/mock-engine.ts";

Deno.test("MockEngine: returns override when configured", () => {
  const engine = new MockEngine({
    overrides: { "github:push": { success: true, sha: "abc123" } },
    useSchemaDefaults: false,
  });
  const result = engine.generateMock("github:push", { branch: "main" });
  assertEquals(result, { success: true, sha: "abc123" });
});

Deno.test("MockEngine: returns generic mock when no override", () => {
  const engine = new MockEngine({ overrides: {}, useSchemaDefaults: false });
  const result = engine.generateMock("unknown:tool", { x: 1 });
  assertExists(result);
  assertEquals((result as Record<string, unknown>)._mocked, true);
  assertEquals((result as Record<string, unknown>).toolId, "unknown:tool");
});

Deno.test("MockEngine: schema-based mock with output_schema", () => {
  const engine = new MockEngine({ overrides: {}, useSchemaDefaults: true });
  const schema = {
    type: "object",
    properties: {
      content: { type: "string" },
      size: { type: "number" },
      success: { type: "boolean" },
    },
  };
  const result = engine.generateMockFromSchema("filesystem:write_file", schema);
  const r = result as Record<string, unknown>;
  assertEquals(typeof r.content, "string");
  assertEquals(typeof r.size, "number");
  assertEquals(typeof r.success, "boolean");
});

Deno.test("MockEngine: override takes precedence over schema", () => {
  const engine = new MockEngine({
    overrides: { "fs:write": { ok: true } },
    useSchemaDefaults: true,
  });
  const schema = { type: "object", properties: { content: { type: "string" } } };
  // Override wins
  const result = engine.generateMock("fs:write", {}, schema);
  assertEquals(result, { ok: true });
});
```

**Step 2: Run test to verify it fails**

Run: `deno test tests/exploration/mock-engine_test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/exploration/mock-engine.ts
/**
 * Mock Response Engine for Dry-Run Exploration
 *
 * Generates mock responses for unsafe tools during exploration.
 * Priority: configured override > schema-based > generic fallback.
 *
 * @module exploration/mock-engine
 */

import type { JsonValue } from "../capabilities/types.ts";
import type { MockConfig } from "./types.ts";

/**
 * Generates deterministic mock responses for tools that can't
 * be executed for real during dry-run exploration.
 */
export class MockEngine {
  private config: MockConfig;

  constructor(config: MockConfig) {
    this.config = config;
  }

  /**
   * Generate a mock response for a tool.
   *
   * Priority:
   * 1. Configured override for this toolId
   * 2. Schema-based mock (if useSchemaDefaults && schema provided)
   * 3. Generic fallback { _mocked: true, toolId }
   */
  generateMock(
    toolId: string,
    _args: Record<string, unknown>,
    outputSchema?: unknown,
  ): JsonValue {
    // 1. Override
    if (toolId in this.config.overrides) {
      return this.config.overrides[toolId];
    }

    // 2. Schema-based
    if (this.config.useSchemaDefaults && outputSchema) {
      return this.generateMockFromSchema(toolId, outputSchema);
    }

    // 3. Generic fallback
    return {
      _mocked: true,
      toolId,
      reason: "unsafe_tool",
    };
  }

  /**
   * Generate a mock response from a JSON Schema definition.
   * Produces deterministic default values per type.
   */
  generateMockFromSchema(toolId: string, schema: unknown): JsonValue {
    return {
      ...this.schemaToValue(schema as SchemaNode),
      _mocked: true,
      _schemaGenerated: true,
    } as JsonValue;
  }

  /** Recursively generate default values from JSON Schema */
  private schemaToValue(schema: SchemaNode): JsonValue {
    if (!schema || typeof schema !== "object") return null;

    switch (schema.type) {
      case "string":
        return schema.default ?? schema.enum?.[0] ?? "mock_value";
      case "number":
      case "integer":
        return schema.default ?? 0;
      case "boolean":
        return schema.default ?? true;
      case "array":
        return schema.default ?? [];
      case "object": {
        if (!schema.properties) return {};
        const obj: Record<string, JsonValue> = {};
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          obj[key] = this.schemaToValue(propSchema as SchemaNode);
        }
        return obj;
      }
      case "null":
        return null;
      default:
        return null;
    }
  }
}

/** Minimal JSON Schema node for mock generation */
interface SchemaNode {
  type?: string;
  properties?: Record<string, unknown>;
  default?: JsonValue;
  enum?: JsonValue[];
}
```

**Step 4: Run test to verify it passes**

Run: `deno test tests/exploration/mock-engine_test.ts`
Expected: 4 tests PASS

**Step 5: Commit**

```bash
git add src/exploration/mock-engine.ts tests/exploration/mock-engine_test.ts
git commit -m "feat(exploration): add mock engine for unsafe tools"
```

---

## Task 4: Explorer Core — Path Execution (`src/exploration/explorer.ts`)

**Files:**
- Create: `src/exploration/explorer.ts`
- Test: `tests/exploration/explorer_test.ts`
- Read (context): `src/dag/execution/workerbridge-executor.ts` — `createToolExecutorViaWorker()` pattern
- Read (context): `src/graphrag/algorithms/gru/gru-inference.ts` — `buildPathBeam()` API

**Step 1: Write the failing test**

```typescript
// tests/exploration/explorer_test.ts
import { assertEquals, assertExists } from "@std/assert";
import { DryRunExplorer } from "../../src/exploration/explorer.ts";
import type { ExploreRequest, DryRunStepResult } from "../../src/exploration/types.ts";

// Minimal mock of tool executor
function createMockToolExecutor(responses: Record<string, unknown>) {
  return async (toolId: string, args: Record<string, unknown>): Promise<unknown> => {
    if (toolId in responses) return responses[toolId];
    throw new Error(`Tool not found: ${toolId}`);
  };
}

Deno.test("DryRunExplorer: executes safe tools for real, mocks unsafe", async () => {
  const executor = createMockToolExecutor({
    "json:parse": { parsed: true },
    "math:add": { result: 42 },
  });

  const explorer = new DryRunExplorer({
    toolExecutor: executor,
    mockConfig: { overrides: {}, useSchemaDefaults: false },
  });

  // Simulate a path with safe + unsafe tools
  const steps = await explorer.executePath(
    ["json:parse", "process:exec", "math:add"],
    {},
  );

  assertEquals(steps.length, 3);

  // json:parse = safe → real execution
  assertEquals(steps[0].real, true);
  assertEquals(steps[0].safety, "safe");
  assertEquals((steps[0].output as Record<string, unknown>).parsed, true);

  // process:exec = unsafe → mocked
  assertEquals(steps[1].real, false);
  assertEquals(steps[1].safety, "unsafe");
  assertEquals((steps[1].output as Record<string, unknown>)._mocked, true);

  // math:add = safe → real execution
  assertEquals(steps[2].real, true);
  assertEquals(steps[2].safety, "safe");
});

Deno.test("DryRunExplorer: marks path as non-viable on real tool error", async () => {
  const executor = createMockToolExecutor({}); // all tools will throw

  const explorer = new DryRunExplorer({
    toolExecutor: executor,
    mockConfig: { overrides: {}, useSchemaDefaults: false },
  });

  const steps = await explorer.executePath(["json:parse"], {});

  assertEquals(steps.length, 1);
  assertEquals(steps[0].real, true);
  assertExists(steps[0].error); // Should have error
});

Deno.test("DryRunExplorer: computes confidence correctly", () => {
  const explorer = new DryRunExplorer({
    toolExecutor: async () => null,
    mockConfig: { overrides: {}, useSchemaDefaults: false },
  });

  // 3 tools, 2 real, gruScore 0.8 → confidence = 0.8 * (2/3) ≈ 0.533
  const confidence = explorer.computeConfidence(0.8, 2, 1);
  assertEquals(Math.abs(confidence - 0.533) < 0.01, true);
});
```

**Step 2: Run test to verify it fails**

Run: `deno test tests/exploration/explorer_test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/exploration/explorer.ts
/**
 * Dry-Run Explorer
 *
 * Executes tool sequences in hybrid mode:
 * - Safe tools → real execution via ToolExecutor
 * - Unsafe tools → mock responses via MockEngine
 *
 * @module exploration/explorer
 */

import * as log from "@std/log";
import { isToolSafe } from "./tool-safety.ts";
import { MockEngine } from "./mock-engine.ts";
import type {
  DryRunStepResult,
  ExploredPath,
  ExploreRequest,
  ExploreResult,
  MockConfig,
  ToolSafety,
} from "./types.ts";
import type { JsonValue } from "../capabilities/types.ts";

/** ToolExecutor signature matching existing DAG infrastructure */
export type ToolExecutor = (
  toolId: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

export interface DryRunExplorerDeps {
  toolExecutor: ToolExecutor;
  mockConfig: MockConfig;
}

/**
 * Orchestrates dry-run exploration of tool paths.
 *
 * For each candidate path (from GRU beam search or suggested DAG):
 * 1. Classify each tool as safe/unsafe
 * 2. Execute safe tools for real, mock unsafe tools
 * 3. Compute viability and confidence metrics
 */
export class DryRunExplorer {
  private mockEngine: MockEngine;
  private toolExecutor: ToolExecutor;

  constructor(deps: DryRunExplorerDeps) {
    this.toolExecutor = deps.toolExecutor;
    this.mockEngine = new MockEngine(deps.mockConfig);
  }

  /**
   * Execute a single path in dry-run mode.
   *
   * Each tool is classified and either executed for real or mocked.
   * Execution is sequential (tool N may depend on tool N-1 output).
   */
  async executePath(
    path: string[],
    initialContext: Record<string, unknown>,
    timeoutMs = 15000,
  ): Promise<DryRunStepResult[]> {
    const steps: DryRunStepResult[] = [];
    const context = { ...initialContext };
    const deadline = Date.now() + timeoutMs;

    for (const toolId of path) {
      if (Date.now() > deadline) {
        log.warn(`[Explorer] Path timeout after ${steps.length}/${path.length} steps`);
        break;
      }

      const safety = isToolSafe(toolId);
      const step = safety === "safe"
        ? await this.executeReal(toolId, context)
        : this.executeMock(toolId, context, safety);

      steps.push(step);

      // Feed output to context for next step (sequential dependency)
      if (!step.error) {
        context[`step_${steps.length - 1}`] = step.output;
      }
    }

    return steps;
  }

  /**
   * Execute a tool for real via WorkerBridge/ToolExecutor.
   */
  private async executeReal(
    toolId: string,
    context: Record<string, unknown>,
  ): Promise<DryRunStepResult> {
    const start = performance.now();
    try {
      const output = await this.toolExecutor(toolId, context);
      return {
        toolId,
        safety: "safe",
        real: true,
        output: (output ?? null) as JsonValue,
        durationMs: performance.now() - start,
      };
    } catch (error) {
      return {
        toolId,
        safety: "safe",
        real: true,
        output: null,
        durationMs: performance.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate a mock response for an unsafe/unknown tool.
   */
  private executeMock(
    toolId: string,
    context: Record<string, unknown>,
    safety: ToolSafety,
  ): DryRunStepResult {
    const output = this.mockEngine.generateMock(toolId, context);
    return {
      toolId,
      safety,
      real: false,
      output,
      durationMs: 0,
    };
  }

  /**
   * Build an ExploredPath result from step results and GRU score.
   */
  buildExploredPath(
    path: string[],
    gruScore: number,
    steps: DryRunStepResult[],
  ): ExploredPath {
    const realCount = steps.filter((s) => s.real).length;
    const mockedCount = steps.filter((s) => !s.real).length;
    const failedStep = steps.find((s) => s.error);
    const viable = !failedStep;

    return {
      path,
      gruScore,
      steps,
      realCount,
      mockedCount,
      viable,
      confidence: this.computeConfidence(gruScore, realCount, mockedCount),
      failurePoint: failedStep?.toolId,
      failureError: failedStep?.error,
    };
  }

  /**
   * Confidence = gruScore * (realCount / totalSteps)
   *
   * Paths with more real executions are more trustworthy.
   * A fully-mocked path has confidence ≈ 0 regardless of GRU score.
   */
  computeConfidence(
    gruScore: number,
    realCount: number,
    mockedCount: number,
  ): number {
    const total = realCount + mockedCount;
    if (total === 0) return 0;
    return gruScore * (realCount / total);
  }

  /**
   * Full exploration: generate candidates and dry-run each.
   *
   * @param candidates - Path candidates from GRU beam search
   * @param request - Original explore request
   */
  async explore(
    candidates: { path: string[]; score: number }[],
    request: ExploreRequest,
  ): Promise<ExploreResult> {
    const start = performance.now();
    const timeoutMs = request.pathTimeoutMs ?? 15000;
    const viablePaths: ExploredPath[] = [];
    const failedPaths: ExploredPath[] = [];

    for (const candidate of candidates) {
      const steps = await this.executePath(
        candidate.path,
        {}, // TODO: wire initial context from request
        timeoutMs,
      );

      const explored = this.buildExploredPath(
        candidate.path,
        candidate.score,
        steps,
      );

      if (explored.viable) {
        viablePaths.push(explored);
      } else {
        failedPaths.push(explored);
      }
    }

    // Sort viable paths by confidence descending
    viablePaths.sort((a, b) => b.confidence - a.confidence);

    return {
      intent: request.intent,
      trigger: request.trigger,
      pathsExplored: candidates.length,
      viablePaths,
      failedPaths,
      totalDurationMs: performance.now() - start,
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `deno test tests/exploration/explorer_test.ts`
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add src/exploration/explorer.ts tests/exploration/explorer_test.ts
git commit -m "feat(exploration): add dry-run explorer with hybrid execution"
```

---

## Task 5: Module barrel (`src/exploration/mod.ts`)

**Files:**
- Create: `src/exploration/mod.ts`

**Step 1: Write module barrel**

```typescript
// src/exploration/mod.ts
export type {
  DryRunStepResult,
  ExploredPath,
  ExploreRequest,
  ExploreResult,
  MockConfig,
  ToolSafety,
} from "./types.ts";

export { isToolSafe, classifyPathTools } from "./tool-safety.ts";
export { MockEngine } from "./mock-engine.ts";
export { DryRunExplorer, type DryRunExplorerDeps, type ToolExecutor } from "./explorer.ts";
```

**Step 2: Commit**

```bash
git add src/exploration/mod.ts
git commit -m "feat(exploration): add module barrel"
```

---

## Task 6: GRU Integration — `exploreIntent()` top-level function

**Files:**
- Create: `src/exploration/explore-intent.ts`
- Test: `tests/exploration/explore-intent_test.ts`
- Read (context): `src/infrastructure/di/adapters/execute/dag-suggester-adapter.ts` — how GRU beam is currently wired

This is the **top-level orchestrator** that combines GRU beam search + DryRunExplorer.

**Step 1: Write the failing test**

```typescript
// tests/exploration/explore-intent_test.ts
import { assertEquals, assertExists } from "@std/assert";
import { exploreIntent } from "../../src/exploration/explore-intent.ts";
import type { IGRUInference } from "../../src/graphrag/algorithms/gru/types.ts";
import type { ExploreRequest } from "../../src/exploration/types.ts";

// Minimal GRU mock
function createMockGRU(): IGRUInference {
  return {
    isReady: () => true,
    setWeights: () => {},
    setVocabulary: () => {},
    setStructuralMatrices: () => {},
    predictFirstTool: (_intentEmb: number[]) => ({
      toolId: "json:parse",
      score: 0.85,
      ranked: [{ toolId: "json:parse", score: 0.85 }],
    }),
    buildPath: (_intentEmb: number[], _firstToolId: string) => ["json:parse", "math:add"],
    buildPathBeam: (_intentEmb: number[], _firstToolId: string, _beamWidth?: number) => [
      { path: ["json:parse", "math:add"], score: -0.3 },
      { path: ["json:parse", "string:concat"], score: -0.5 },
    ],
  };
}

Deno.test("exploreIntent: generates and explores GRU beam paths", async () => {
  const gru = createMockGRU();
  const toolExecutor = async (toolId: string, _args: Record<string, unknown>) => {
    return { result: `executed_${toolId}` };
  };

  const request: ExploreRequest = {
    intent: "parse and compute",
    intentEmbedding: new Array(1024).fill(0.1),
    trigger: "unknown_intent",
    maxPaths: 2,
  };

  const result = await exploreIntent(request, {
    gru,
    toolExecutor,
    mockConfig: { overrides: {}, useSchemaDefaults: false },
  });

  assertEquals(result.pathsExplored, 2);
  assertEquals(result.viablePaths.length, 2); // all safe tools → all viable
  assertEquals(result.viablePaths[0].path[0], "json:parse");
  assertExists(result.totalDurationMs);
});

Deno.test("exploreIntent: pre_validation uses suggestedPath", async () => {
  const gru = createMockGRU();
  const toolExecutor = async () => ({ ok: true });

  const request: ExploreRequest = {
    intent: "validate this",
    intentEmbedding: new Array(1024).fill(0),
    trigger: "pre_validation",
    suggestedPath: ["json:parse", "math:add", "string:concat"],
  };

  const result = await exploreIntent(request, {
    gru,
    toolExecutor,
    mockConfig: { overrides: {}, useSchemaDefaults: false },
  });

  // pre_validation: uses suggestedPath directly, not GRU beam
  assertEquals(result.pathsExplored, 1);
  assertEquals(result.viablePaths[0].path.length, 3);
});

Deno.test("exploreIntent: returns empty when GRU not ready", async () => {
  const gru = { ...createMockGRU(), isReady: () => false };
  const toolExecutor = async () => null;

  const result = await exploreIntent(
    { intent: "test", trigger: "unknown_intent" },
    { gru, toolExecutor, mockConfig: { overrides: {}, useSchemaDefaults: false } },
  );

  assertEquals(result.pathsExplored, 0);
  assertEquals(result.viablePaths.length, 0);
});
```

**Step 2: Run test to verify it fails**

Run: `deno test tests/exploration/explore-intent_test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/exploration/explore-intent.ts
/**
 * Top-level exploration orchestrator.
 *
 * Combines GRU beam search (path candidates) with DryRunExplorer
 * (hybrid execution). Supports two triggers:
 *
 * 1. unknown_intent: GRU generates beam candidates, explore each
 * 2. pre_validation: validate a suggested path via dry-run
 *
 * @module exploration/explore-intent
 */

import * as log from "@std/log";
import { DryRunExplorer } from "./explorer.ts";
import type {
  ExploreRequest,
  ExploreResult,
  MockConfig,
} from "./types.ts";
import type { IGRUInference } from "../graphrag/algorithms/gru/types.ts";

export type ToolExecutorFn = (
  toolId: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

export interface ExploreIntentDeps {
  gru: IGRUInference;
  toolExecutor: ToolExecutorFn;
  mockConfig: MockConfig;
  /** Optional embedding model for intent encoding */
  encodeIntent?: (text: string) => Promise<number[]>;
}

/**
 * Explore an intent via GRU beam search + hybrid dry-run.
 *
 * @param request - Exploration request (intent, trigger, options)
 * @param deps - GRU inference, tool executor, mock config
 * @returns Exploration results with viable/failed paths
 */
export async function exploreIntent(
  request: ExploreRequest,
  deps: ExploreIntentDeps,
): Promise<ExploreResult> {
  const start = performance.now();
  const { gru, toolExecutor, mockConfig } = deps;

  // Guard: GRU must be ready
  if (!gru.isReady()) {
    log.warn("[exploreIntent] GRU not ready, returning empty result");
    return emptyResult(request, start);
  }

  // Resolve intent embedding
  const intentEmb = await resolveEmbedding(request, deps);
  if (!intentEmb) {
    log.warn("[exploreIntent] Could not resolve intent embedding");
    return emptyResult(request, start);
  }

  // Generate candidates based on trigger
  const candidates = request.trigger === "pre_validation"
    ? getPreValidationCandidates(request)
    : getBeamCandidates(gru, intentEmb, request.maxPaths ?? 3);

  if (candidates.length === 0) {
    log.info("[exploreIntent] No candidates generated");
    return emptyResult(request, start);
  }

  log.info(`[exploreIntent] Exploring ${candidates.length} candidate paths`, {
    trigger: request.trigger,
    intent: request.intent.slice(0, 80),
  });

  // Run dry-run exploration
  const explorer = new DryRunExplorer({ toolExecutor, mockConfig });
  return await explorer.explore(candidates, request);
}

// ---------------------------------------------------------------------------
// Candidate generation
// ---------------------------------------------------------------------------

function getBeamCandidates(
  gru: IGRUInference,
  intentEmb: number[],
  maxPaths: number,
): { path: string[]; score: number }[] {
  const first = gru.predictFirstTool(intentEmb);
  if (first.score < 0.1) {
    log.debug("[exploreIntent] GRU first-tool score too low", { score: first.score });
    return [];
  }

  return gru.buildPathBeam(intentEmb, first.toolId, maxPaths);
}

function getPreValidationCandidates(
  request: ExploreRequest,
): { path: string[]; score: number }[] {
  if (!request.suggestedPath || request.suggestedPath.length === 0) {
    return [];
  }
  // Single candidate: the suggested path with neutral score
  return [{ path: request.suggestedPath, score: 0 }];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveEmbedding(
  request: ExploreRequest,
  deps: ExploreIntentDeps,
): Promise<number[] | null> {
  if (request.intentEmbedding && request.intentEmbedding.length > 0) {
    return request.intentEmbedding;
  }
  if (deps.encodeIntent) {
    const emb = await deps.encodeIntent(request.intent);
    return emb && emb.length > 0 ? emb : null;
  }
  return null;
}

function emptyResult(request: ExploreRequest, startTime: number): ExploreResult {
  return {
    intent: request.intent,
    trigger: request.trigger,
    pathsExplored: 0,
    viablePaths: [],
    failedPaths: [],
    totalDurationMs: performance.now() - startTime,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `deno test tests/exploration/explore-intent_test.ts`
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add src/exploration/explore-intent.ts tests/exploration/explore-intent_test.ts
git commit -m "feat(exploration): add exploreIntent orchestrator (GRU beam + dry-run)"
```

---

## Task 7: Export from module barrel + integration test

**Files:**
- Modify: `src/exploration/mod.ts`
- Create: `tests/exploration/integration_test.ts`

**Step 1: Update module barrel**

Add to `src/exploration/mod.ts`:

```typescript
export { exploreIntent, type ExploreIntentDeps, type ToolExecutorFn } from "./explore-intent.ts";
```

**Step 2: Write integration test (end-to-end with mocked deps)**

```typescript
// tests/exploration/integration_test.ts
import { assertEquals } from "@std/assert";
import { exploreIntent } from "../../src/exploration/mod.ts";
import type { IGRUInference } from "../../src/graphrag/algorithms/gru/types.ts";

/**
 * Integration test: full exploration flow with realistic tool mix.
 *
 * Scenario: "Read a config file and deploy to production"
 * Path: filesystem:read_file (safe) → json:parse (safe) → process:exec (unsafe)
 */
Deno.test("Integration: mixed safe/unsafe path exploration", async () => {
  const gru: IGRUInference = {
    isReady: () => true,
    setWeights: () => {},
    setVocabulary: () => {},
    setStructuralMatrices: () => {},
    predictFirstTool: () => ({
      toolId: "filesystem:read_file",
      score: 0.75,
      ranked: [{ toolId: "filesystem:read_file", score: 0.75 }],
    }),
    buildPath: () => ["filesystem:read_file", "json:parse", "process:exec"],
    buildPathBeam: () => [
      { path: ["filesystem:read_file", "json:parse", "process:exec"], score: -0.4 },
    ],
  };

  const toolExecutor = async (toolId: string) => {
    const responses: Record<string, unknown> = {
      "filesystem:read_file": { content: '{"env": "prod"}' },
      "json:parse": { env: "prod" },
    };
    if (toolId in responses) return responses[toolId];
    throw new Error(`Unexpected real execution of ${toolId}`);
  };

  const result = await exploreIntent(
    {
      intent: "Read config and deploy",
      intentEmbedding: new Array(1024).fill(0.1),
      trigger: "unknown_intent",
    },
    {
      gru,
      toolExecutor,
      mockConfig: {
        overrides: { "process:exec": { exitCode: 0, stdout: "deployed" } },
        useSchemaDefaults: false,
      },
    },
  );

  assertEquals(result.pathsExplored, 1);
  assertEquals(result.viablePaths.length, 1);

  const path = result.viablePaths[0];
  assertEquals(path.path.length, 3);
  assertEquals(path.realCount, 2);   // filesystem:read_file + json:parse
  assertEquals(path.mockedCount, 1); // process:exec
  assertEquals(path.viable, true);

  // First 2 steps = real
  assertEquals(path.steps[0].real, true);
  assertEquals(path.steps[1].real, true);
  // Last step = mocked with override
  assertEquals(path.steps[2].real, false);
  assertEquals((path.steps[2].output as Record<string, unknown>).exitCode, 0);

  // Confidence = gruScore * (2/3) = -0.4 * 0.667 ≈ -0.267
  // (negative because beam scores are log-probs — that's fine, relative ordering matters)
  assertEquals(path.confidence < 0, true);
});
```

**Step 3: Run all exploration tests**

Run: `deno test tests/exploration/ --allow-read`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add src/exploration/mod.ts tests/exploration/integration_test.ts
git commit -m "feat(exploration): add integration test + export exploreIntent"
```

---

## Task 8: Wire into execute handler (MCP endpoint)

> **This task is a design decision point.** The implementation wires `exploreIntent` into the existing MCP handler infrastructure as `pml_explore`. The exact endpoint shape may need adjustment during implementation — this task provides the skeleton.

**Files:**
- Modify: `src/mcp/handlers/execute-handler-facade.ts` — add explore route
- Create: `src/mcp/handlers/explore-handler.ts` — handler implementation
- Test: `tests/mcp/handlers/explore-handler_test.ts`

**Step 1: Write the handler**

```typescript
// src/mcp/handlers/explore-handler.ts
/**
 * Explore Handler — MCP endpoint for dry-run exploration
 *
 * Routes `pml_explore` requests to the exploration engine.
 *
 * @module mcp/handlers/explore-handler
 */

import * as log from "@std/log";
import { exploreIntent, type ExploreIntentDeps } from "../../exploration/mod.ts";
import type { ExploreRequest, ExploreResult } from "../../exploration/types.ts";

export interface ExploreHandlerDeps extends ExploreIntentDeps {
  // Additional deps can be added here (e.g., trace store for learning)
}

/**
 * Handle a pml_explore request.
 *
 * @param params - Raw request params from MCP
 * @param deps - Injected dependencies
 * @returns ExploreResult
 */
export async function handleExplore(
  params: {
    intent: string;
    intentEmbedding?: number[];
    maxPaths?: number;
    mockOverrides?: Record<string, unknown>;
    pathTimeoutMs?: number;
    trigger?: string;
    suggestedPath?: string[];
  },
  deps: ExploreHandlerDeps,
): Promise<ExploreResult> {
  const request: ExploreRequest = {
    intent: params.intent,
    intentEmbedding: params.intentEmbedding,
    maxPaths: params.maxPaths ?? 3,
    mockOverrides: params.mockOverrides as Record<string, import("../../capabilities/types.ts").JsonValue> | undefined,
    pathTimeoutMs: params.pathTimeoutMs ?? 15000,
    trigger: (params.trigger === "pre_validation" ? "pre_validation" : "unknown_intent"),
    suggestedPath: params.suggestedPath,
  };

  log.info("[ExploreHandler] Starting exploration", {
    intent: request.intent.slice(0, 80),
    trigger: request.trigger,
    maxPaths: request.maxPaths,
  });

  const result = await exploreIntent(request, deps);

  log.info("[ExploreHandler] Exploration complete", {
    pathsExplored: result.pathsExplored,
    viableCount: result.viablePaths.length,
    failedCount: result.failedPaths.length,
    totalDurationMs: result.totalDurationMs.toFixed(1),
  });

  return result;
}
```

**Step 2: Write minimal test**

```typescript
// tests/mcp/handlers/explore-handler_test.ts
import { assertEquals } from "@std/assert";
import { handleExplore } from "../../../src/mcp/handlers/explore-handler.ts";
import type { IGRUInference } from "../../../src/graphrag/algorithms/gru/types.ts";

Deno.test("handleExplore: returns result for valid request", async () => {
  const gru: IGRUInference = {
    isReady: () => true,
    setWeights: () => {},
    setVocabulary: () => {},
    setStructuralMatrices: () => {},
    predictFirstTool: () => ({ toolId: "json:parse", score: 0.8, ranked: [] }),
    buildPath: () => ["json:parse"],
    buildPathBeam: () => [{ path: ["json:parse"], score: -0.2 }],
  };

  const result = await handleExplore(
    { intent: "parse json", intentEmbedding: new Array(1024).fill(0) },
    {
      gru,
      toolExecutor: async () => ({ parsed: true }),
      mockConfig: { overrides: {}, useSchemaDefaults: false },
    },
  );

  assertEquals(result.pathsExplored, 1);
  assertEquals(result.viablePaths.length, 1);
});

Deno.test("handleExplore: defaults trigger to unknown_intent", async () => {
  const gru: IGRUInference = {
    isReady: () => false,
    setWeights: () => {},
    setVocabulary: () => {},
    setStructuralMatrices: () => {},
    predictFirstTool: () => ({ toolId: "", score: 0, ranked: [] }),
    buildPath: () => [],
    buildPathBeam: () => [],
  };

  const result = await handleExplore(
    { intent: "test" },
    {
      gru,
      toolExecutor: async () => null,
      mockConfig: { overrides: {}, useSchemaDefaults: false },
    },
  );

  assertEquals(result.trigger, "unknown_intent");
  assertEquals(result.pathsExplored, 0);
});
```

**Step 3: Run test**

Run: `deno test tests/mcp/handlers/explore-handler_test.ts`
Expected: 2 tests PASS

**Step 4: Commit**

```bash
git add src/mcp/handlers/explore-handler.ts tests/mcp/handlers/explore-handler_test.ts
git commit -m "feat(exploration): add explore handler (MCP endpoint skeleton)"
```

---

## Task 9: Wire handler into ExecuteHandlerFacade

> **Decision point:** This task integrates the explore handler into the existing facade. Read `execute-handler-facade.ts` first to match the routing pattern.

**Files:**
- Modify: `src/mcp/handlers/execute-handler-facade.ts` — add `explore` route
- Modify: `src/exploration/mod.ts` — ensure all exports

**Step 1: Read the existing facade**

Read `src/mcp/handlers/execute-handler-facade.ts` to understand the routing pattern and dependency injection.

**Step 2: Add explore route**

Add a new route in the facade's `handle()` method that checks for an `explore` field in the request and routes to `handleExplore()`. The exact integration depends on the current facade structure — follow the existing pattern for `continue_workflow` or `accept_suggestion`.

Wire deps from the facade's constructor (GRU from `DAGSuggesterAdapter.deps.gru`, toolExecutor from WorkerBridge factory).

**Step 3: Verify existing tests still pass**

Run: `deno test tests/mcp/handlers/`
Expected: All existing tests PASS + new explore tests PASS

**Step 4: Commit**

```bash
git add src/mcp/handlers/execute-handler-facade.ts src/exploration/mod.ts
git commit -m "feat(exploration): wire pml_explore into execute handler facade"
```

---

## Task 10: Exploration Trace Storage (training data)

> **Rationale (ADR-12.2 + ADR-12.9):** Exploration results — successes AND failures — are stored as `execution_trace` rows for SHGAT/GRU training. Traces are marked `exploratory: true` and each task result carries `mocked: boolean` so the training pipeline can weight them appropriately (lower weight for high mock ratio).

**Files:**
- Create: `src/db/migrations/054_exploratory_trace.ts` — new columns
- Modify: `src/capabilities/types/execution.ts` — add `mocked` to `TraceTaskResult`, add `exploratory` to `ExecutionTrace`
- Modify: `src/capabilities/execution-trace-store.ts` — pass `exploratory` column in INSERT
- Create: `src/exploration/trace-storage.ts` — mapper `ExploredPath → SaveTraceInput`
- Test: `tests/exploration/trace-storage_test.ts`
- Modify: `src/exploration/explore-intent.ts` — call trace storage after exploration
- Modify: `src/exploration/mod.ts` — re-export

**Step 1: Write migration 054**

```typescript
// src/db/migrations/054_exploratory_trace.ts
import type { Migration } from "../migrations.ts";
import type { DbClient } from "../types.ts";
import * as log from "@std/log";

export function createExploratoryTraceMigration(): Migration {
  return {
    version: 54,
    name: "exploratory_trace",
    up: async (db: DbClient) => {
      log.info("Migration 054: Adding exploratory column to execution_trace...");

      await db.exec(`
        ALTER TABLE execution_trace
        ADD COLUMN IF NOT EXISTS exploratory BOOLEAN DEFAULT false
      `);

      // Partial index: only index exploratory=true rows (sparse, fast)
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_exec_trace_exploratory
        ON execution_trace(exploratory)
        WHERE exploratory = true
      `);

      log.info("Migration 054 complete");
    },
    down: async (db: DbClient) => {
      await db.exec("DROP INDEX IF EXISTS idx_exec_trace_exploratory");
      await db.exec("ALTER TABLE execution_trace DROP COLUMN IF EXISTS exploratory");
    },
  };
}
```

> **Note:** `mocked` is stored per-task inside `task_results` JSONB (not a top-level column). No migration needed for JSONB — just add the field in the serializer.

**Step 2: Register migration**

Add to `src/db/migrations.ts` migration array:
```typescript
import { createExploratoryTraceMigration } from "./migrations/054_exploratory_trace.ts";
// ... in the migrations array:
createExploratoryTraceMigration(),
```

**Step 3: Add `mocked` to `TraceTaskResult` type**

In `src/capabilities/types/execution.ts`, add to `TraceTaskResult`:

```typescript
  /** Whether this task was mocked during dry-run exploration (Epic 12.8) */
  mocked?: boolean;
```

And add to `ExecutionTrace`:

```typescript
  /** Whether this trace comes from exploratory dry-run (Epic 12.8, ADR-12.9) */
  exploratory?: boolean;
```

**Step 4: Update `execution-trace-store.ts` INSERT**

In `saveTrace()`, add `exploratory` to the INSERT columns and values:

```typescript
// In the INSERT INTO execution_trace (...) VALUES (...)
// Add column: exploratory
// Add value: trace.exploratory ?? false
```

And in `sanitizedResults` mapper, add:

```typescript
  mocked: r.mocked, // dry-run exploration flag
```

**Step 5: Write the failing test for trace-storage mapper**

```typescript
// tests/exploration/trace-storage_test.ts
import { assertEquals, assertExists } from "@std/assert";
import { exploredPathToTraceInput } from "../../src/exploration/trace-storage.ts";
import type { ExploredPath } from "../../src/exploration/types.ts";

Deno.test("exploredPathToTraceInput: viable path maps correctly", () => {
  const path: ExploredPath = {
    path: ["json:parse", "process:exec", "math:add"],
    gruScore: 0.75,
    steps: [
      { toolId: "json:parse", safety: "safe", real: true, output: { parsed: true }, durationMs: 12 },
      { toolId: "process:exec", safety: "unsafe", real: false, output: { _mocked: true, toolId: "process:exec", reason: "unsafe_tool" }, durationMs: 0 },
      { toolId: "math:add", safety: "safe", real: true, output: { result: 42 }, durationMs: 5 },
    ],
    realCount: 2,
    mockedCount: 1,
    viable: true,
    confidence: 0.5,
  };

  const trace = exploredPathToTraceInput(path, {
    intent: "parse and compute",
    intentEmbedding: [0.1, 0.2, 0.3],
    trigger: "unknown_intent",
  });

  // Core fields
  assertEquals(trace.success, true);
  assertEquals(trace.exploratory, true);
  assertEquals(trace.capabilityId, undefined); // unknown_intent = no cap
  assertExists(trace.intentEmbedding);
  assertEquals(trace.executedPath, ["json:parse", "process:exec", "math:add"]);

  // Task results with mocked flag
  assertEquals(trace.taskResults.length, 3);
  assertEquals(trace.taskResults[0].tool, "json:parse");
  assertEquals(trace.taskResults[0].mocked, false);     // real execution
  assertEquals(trace.taskResults[0].success, true);
  assertEquals(trace.taskResults[1].tool, "process:exec");
  assertEquals(trace.taskResults[1].mocked, true);       // mocked
  assertEquals(trace.taskResults[2].tool, "math:add");
  assertEquals(trace.taskResults[2].mocked, false);
});

Deno.test("exploredPathToTraceInput: failed path stores error", () => {
  const path: ExploredPath = {
    path: ["json:parse"],
    gruScore: 0.6,
    steps: [
      { toolId: "json:parse", safety: "safe", real: true, output: null, durationMs: 3, error: "invalid JSON" },
    ],
    realCount: 1,
    mockedCount: 0,
    viable: false,
    confidence: 0.6,
    failurePoint: "json:parse",
    failureError: "invalid JSON",
  };

  const trace = exploredPathToTraceInput(path, {
    intent: "parse file",
    trigger: "unknown_intent",
  });

  assertEquals(trace.success, false);
  assertEquals(trace.exploratory, true);
  assertEquals(trace.errorMessage, "Exploration failed at json:parse: invalid JSON");
  assertEquals(trace.taskResults[0].success, false);
  assertEquals(trace.taskResults[0].mocked, false);
});

Deno.test("exploredPathToTraceInput: pre_validation trigger", () => {
  const path: ExploredPath = {
    path: ["filesystem:read_file"],
    gruScore: 0,  // neutral score for pre_validation
    steps: [
      { toolId: "filesystem:read_file", safety: "safe", real: true, output: { content: "hello" }, durationMs: 20 },
    ],
    realCount: 1,
    mockedCount: 0,
    viable: true,
    confidence: 0,
  };

  const trace = exploredPathToTraceInput(path, {
    intent: "validate read",
    trigger: "pre_validation",
  });

  assertEquals(trace.exploratory, true);
  assertEquals(trace.success, true);
  // initialContext captures the trigger metadata
  assertEquals((trace.initialContext as Record<string, unknown>).trigger, "pre_validation");
});
```

**Step 6: Run test to verify it fails**

Run: `deno test tests/exploration/trace-storage_test.ts`
Expected: FAIL — module not found

**Step 7: Write implementation**

```typescript
// src/exploration/trace-storage.ts
/**
 * Exploration Trace Storage
 *
 * Maps exploration results (ExploredPath) to ExecutionTrace format
 * for persistence via ExecutionTraceStore.
 *
 * ADR-12.2: Same execution_trace table, with `exploratory: true`.
 * ADR-12.9: Both successes and failures stored for SHGAT training.
 *
 * Data captured per trace:
 * - intent + intentEmbedding (for GRU/SHGAT training)
 * - executed_path (tool sequence)
 * - task_results[] with `mocked: boolean` per task
 * - success/failure + error context
 * - initialContext with exploration metadata (trigger, gruScore, mockRatio)
 *
 * @module exploration/trace-storage
 */

import type { SaveTraceInput } from "../capabilities/execution-trace-store.ts";
import type { TraceTaskResult, JsonValue } from "../capabilities/types.ts";
import type { ExploredPath, ExploreRequest } from "./types.ts";
import { sanitizeForStorage } from "../utils/sanitize-for-storage.ts";

/**
 * Convert an ExploredPath to a SaveTraceInput for ExecutionTraceStore.
 *
 * Maps DryRunStepResult[] -> TraceTaskResult[] with `mocked` flag.
 * Stores exploration metadata (trigger, gruScore, mockRatio) in initialContext.
 */
export function exploredPathToTraceInput(
  explored: ExploredPath,
  request: Pick<ExploreRequest, "intent" | "intentEmbedding" | "trigger">,
): SaveTraceInput {
  const totalSteps = explored.realCount + explored.mockedCount;

  const taskResults: TraceTaskResult[] = explored.steps.map((step, i) => ({
    taskId: `explore_${i}`,
    tool: step.toolId,
    args: {} as Record<string, JsonValue>,  // dry-run: no resolved args yet
    result: sanitizeForStorage(step.output),
    success: !step.error,
    durationMs: step.durationMs,
    mocked: !step.real,
  }));

  return {
    capabilityId: undefined,  // exploration = no matched capability
    intentText: request.intent,
    intentEmbedding: request.intentEmbedding,
    initialContext: {
      trigger: request.trigger,
      gruScore: explored.gruScore,
      mockRatio: totalSteps > 0 ? explored.mockedCount / totalSteps : 0,
      confidence: explored.confidence,
    } as Record<string, JsonValue>,
    executedAt: new Date(),
    success: explored.viable,
    durationMs: explored.steps.reduce((sum, s) => sum + s.durationMs, 0),
    errorMessage: explored.viable
      ? undefined
      : `Exploration failed at ${explored.failurePoint}: ${explored.failureError}`,
    executedPath: explored.path,
    decisions: [],
    taskResults,
    priority: 0.5,  // cold start priority -- PER will adjust
    exploratory: true,
  };
}
```

**Step 8: Run test to verify it passes**

Run: `deno test tests/exploration/trace-storage_test.ts`
Expected: 3 tests PASS

**Step 9: Wire trace storage into `exploreIntent()`**

In `src/exploration/explore-intent.ts`, add optional `traceStore` dep and persist after exploration:

```typescript
// Add to ExploreIntentDeps:
import type { ExecutionTraceStore } from "../capabilities/execution-trace-store.ts";
import { exploredPathToTraceInput } from "./trace-storage.ts";

export interface ExploreIntentDeps {
  gru: IGRUInference;
  toolExecutor: ToolExecutorFn;
  mockConfig: MockConfig;
  encodeIntent?: (text: string) => Promise<number[]>;
  /** Optional: persist exploration traces for training (ADR-12.2) */
  traceStore?: ExecutionTraceStore;
}

// After explorer.explore() returns, before return statement:

  // Store exploration traces for SHGAT/GRU training (ADR-12.2, ADR-12.9)
  if (deps.traceStore) {
    const allPaths = [...result.viablePaths, ...result.failedPaths];
    for (const explored of allPaths) {
      try {
        const traceInput = exploredPathToTraceInput(explored, {
          intent: request.intent,
          intentEmbedding: intentEmb,
          trigger: request.trigger,
        });
        await deps.traceStore.saveTrace(traceInput);
      } catch (err) {
        log.warn(`[exploreIntent] Failed to store exploration trace: ${err}`);
        // Non-blocking: storage failure does not break exploration
      }
    }
    log.info(`[exploreIntent] Stored ${allPaths.length} exploration traces`);
  }
```

**Step 10: Update module barrel**

Add to `src/exploration/mod.ts`:
```typescript
export { exploredPathToTraceInput } from "./trace-storage.ts";
```

**Step 11: Commit**

```
git add src/db/migrations/054_exploratory_trace.ts src/db/migrations.ts src/capabilities/types/execution.ts src/capabilities/execution-trace-store.ts src/exploration/trace-storage.ts src/exploration/explore-intent.ts src/exploration/mod.ts tests/exploration/trace-storage_test.ts
git commit -m "feat(exploration): store exploration traces as training data (ADR-12.2, ADR-12.9)"
```

---

## Task 11: Schema-Aware Type Validation & Output Observation

> **Rationale:** Dry-runs on safe tools produce real outputs. We can (A) infer the actual output schema shape, (B) validate type compatibility between chained tools via existing `provides` edge infrastructure, and (C) capture the MCP server namespace for multi-config tracking. This turns every dry-run into a schema enrichment opportunity.

**Files:**
- Create: `src/exploration/schema-observer.ts` — infer output schema + validate type compatibility
- Test: `tests/exploration/schema-observer_test.ts`
- Modify: `src/exploration/explorer.ts` — call schema observer after each real step
- Modify: `src/exploration/trace-storage.ts` — include observed schemas + server namespace in trace

**Dependencies:**
- Read (context): `src/graphrag/provides-edge-calculator.ts` — `areTypesCompatible()`, `computeCoverage()`
- Read (context): `src/capabilities/static-structure/edge-generators.ts` — `loadToolSchema(toolId, db)`
- Read (context): `src/db/migrations/042_tool_observations.ts` — `tool_observations.server_namespace`

**Step 1: Write the failing test**

```typescript
// tests/exploration/schema-observer_test.ts
import { assertEquals } from "@std/assert";
import {
  inferOutputSchema,
  validateTypeCompatibility,
} from "../../src/exploration/schema-observer.ts";

// --- A: Output schema inference ---

Deno.test("inferOutputSchema: infers shape from object result", () => {
  const result = { content: "hello", size: 42, success: true, tags: ["a", "b"] };
  const schema = inferOutputSchema(result);
  assertEquals(schema, {
    content: "string",
    size: "number",
    success: "boolean",
    tags: "array",
  });
});

Deno.test("inferOutputSchema: returns null for non-object result", () => {
  assertEquals(inferOutputSchema("just a string"), null);
  assertEquals(inferOutputSchema(42), null);
  assertEquals(inferOutputSchema(null), null);
});

Deno.test("inferOutputSchema: handles nested objects as 'object'", () => {
  const result = { meta: { version: 1 }, items: [1, 2] };
  const schema = inferOutputSchema(result);
  assertEquals(schema, { meta: "object", items: "array" });
});

// --- B: Type compatibility validation ---

Deno.test("validateTypeCompatibility: compatible output->input", () => {
  const providerOutput = {
    type: "object",
    properties: {
      content: { type: "string" },
      path: { type: "string" },
    },
  };
  const consumerInput = {
    type: "object",
    properties: {
      content: { type: "string" },
    },
    required: ["content"],
  };

  const result = validateTypeCompatibility(providerOutput, consumerInput);
  assertEquals(result.compatible, true);
  assertEquals(result.coverage, "strict");
});

Deno.test("validateTypeCompatibility: incompatible - missing required field", () => {
  const providerOutput = {
    type: "object",
    properties: {
      path: { type: "string" },
    },
  };
  const consumerInput = {
    type: "object",
    properties: {
      content: { type: "string" },
      url: { type: "string" },
    },
    required: ["content", "url"],
  };

  const result = validateTypeCompatibility(providerOutput, consumerInput);
  assertEquals(result.compatible, false);
  assertEquals(result.coverage, null); // no required fields covered
});

Deno.test("validateTypeCompatibility: returns unknown when schemas missing", () => {
  const result = validateTypeCompatibility(undefined, undefined);
  assertEquals(result.compatible, true); // optimistic: no schema = assume ok
  assertEquals(result.coverage, null);
  assertEquals(result.reason, "no_schemas");
});
```

**Step 2: Run test to verify it fails**

Run: `deno test tests/exploration/schema-observer_test.ts`
Expected: FAIL -- module not found

**Step 3: Write implementation**

```typescript
// src/exploration/schema-observer.ts
/**
 * Schema Observer for Dry-Run Exploration
 *
 * Three capabilities:
 * A. inferOutputSchema() — extract shape from real tool output
 * B. validateTypeCompatibility() — check provides-edge compatibility between steps
 * C. resolveServerNamespace() — identify which MCP server config served a tool
 *
 * Uses existing infrastructure:
 * - areTypesCompatible() from provides-edge-calculator.ts
 * - computeCoverage() from provides-edge-calculator.ts
 * - loadToolSchema() from edge-generators.ts
 *
 * @module exploration/schema-observer
 */

import type { JsonValue } from "../capabilities/types.ts";
import type { ProvidesCoverage } from "../graphrag/types.ts";
import {
  areTypesCompatible,
  computeCoverage,
  type ConsumerInputs,
} from "../graphrag/provides-edge-calculator.ts";

// ---------------------------------------------------------------------------
// A: Output Schema Inference
// ---------------------------------------------------------------------------

/**
 * Infer a flat output schema shape from a real tool execution result.
 *
 * Returns a Record<fieldName, jsonType> for top-level fields.
 * Only works on object results (most MCP tools return objects).
 *
 * @returns null if result is not an object
 */
export function inferOutputSchema(
  result: unknown,
): Record<string, string> | null {
  if (result === null || result === undefined) return null;
  if (typeof result !== "object" || Array.isArray(result)) return null;

  const schema: Record<string, string> = {};
  for (const [key, value] of Object.entries(result as Record<string, unknown>)) {
    if (key.startsWith("_")) continue; // skip internal fields (_mocked, etc.)
    schema[key] = Array.isArray(value) ? "array" : typeof value;
  }

  return Object.keys(schema).length > 0 ? schema : null;
}

// ---------------------------------------------------------------------------
// B: Type Compatibility Validation
// ---------------------------------------------------------------------------

export interface TypeCompatibilityResult {
  compatible: boolean;
  coverage: ProvidesCoverage | null;
  reason?: string;
}

/**
 * Validate type compatibility between a provider's output schema and
 * a consumer's input schema, using the existing provides-edge infrastructure.
 *
 * @param providerOutputSchema - JSON Schema of the provider's output (from tool_schema or inferred)
 * @param consumerInputSchema - JSON Schema of the consumer's input (from tool_schema)
 * @returns compatibility result with coverage level
 */
export function validateTypeCompatibility(
  providerOutputSchema: unknown,
  consumerInputSchema: unknown,
): TypeCompatibilityResult {
  // No schemas available — optimistic (can't validate)
  if (!providerOutputSchema || !consumerInputSchema) {
    return { compatible: true, coverage: null, reason: "no_schemas" };
  }

  const provider = providerOutputSchema as { properties?: Record<string, { type?: string }> };
  const consumer = consumerInputSchema as {
    properties?: Record<string, { type?: string }>;
    required?: string[];
  };

  if (!provider.properties || !consumer.properties) {
    return { compatible: true, coverage: null, reason: "no_properties" };
  }

  // Build provider output field set
  const providerOutputs = new Set(Object.keys(provider.properties));

  // Build consumer input breakdown
  const requiredFields = new Set(consumer.required ?? []);
  const optionalFields = new Set(
    Object.keys(consumer.properties).filter((k) => !requiredFields.has(k)),
  );
  const consumerInputs: ConsumerInputs = {
    required: requiredFields,
    optional: optionalFields,
  };

  // Compute coverage (reuse provides-edge-calculator)
  const coverage = computeCoverage(providerOutputs, consumerInputs);

  if (!coverage) {
    return { compatible: false, coverage: null, reason: "no_field_overlap" };
  }

  // Check type compatibility for matched fields
  const matchedFields = [...providerOutputs].filter(
    (f) => requiredFields.has(f) || optionalFields.has(f),
  );

  for (const field of matchedFields) {
    const fromType = provider.properties[field]?.type;
    const toType = consumer.properties[field]?.type;
    if (!areTypesCompatible(fromType, toType)) {
      return {
        compatible: false,
        coverage,
        reason: `type_mismatch: ${field} (${fromType} -> ${toType})`,
      };
    }
  }

  return {
    compatible: coverage === "strict" || coverage === "partial",
    coverage,
  };
}

// ---------------------------------------------------------------------------
// C: Server Namespace Resolution
// ---------------------------------------------------------------------------

/**
 * Extract server namespace from a tool ID.
 *
 * Tool IDs are formatted as "namespace:action" (e.g., "filesystem:read_file").
 * The namespace corresponds to the MCP server that provides the tool.
 */
export function resolveServerNamespace(toolId: string): string {
  return toolId.split(":")[0] ?? "unknown";
}
```

**Step 4: Run test to verify it passes**

Run: `deno test tests/exploration/schema-observer_test.ts`
Expected: 6 tests PASS

**Step 5: Wire schema observer into explorer.ts**

In `src/exploration/explorer.ts`, after each real execution step:

```typescript
import { inferOutputSchema, resolveServerNamespace } from "./schema-observer.ts";

// In executeReal(), after getting the output:
  const observedSchema = inferOutputSchema(output);
  return {
    toolId,
    safety: "safe",
    real: true,
    output: (output ?? null) as JsonValue,
    durationMs: performance.now() - start,
    observedOutputSchema: observedSchema ?? undefined,
    serverNamespace: resolveServerNamespace(toolId),
  };
```

In `executePath()`, after executing each step, validate type compatibility with previous step:

```typescript
import { validateTypeCompatibility } from "./schema-observer.ts";
import type { DbClient } from "../db/types.ts";
import { loadToolSchema } from "../capabilities/static-structure/edge-generators.ts";

// Add optional db to DryRunExplorerDeps:
export interface DryRunExplorerDeps {
  toolExecutor: ToolExecutor;
  mockConfig: MockConfig;
  db?: DbClient;  // for loading tool schemas
}

// In executePath(), after executing each step (index > 0):
  if (index > 0 && deps.db) {
    const prevStep = steps[index - 1];
    const prevSchema = await loadToolSchema(prevStep.toolId, deps.db);
    const currSchema = await loadToolSchema(toolId, deps.db);
    if (prevSchema?.outputSchema && currSchema?.inputSchema) {
      const compat = validateTypeCompatibility(
        prevSchema.outputSchema,
        currSchema.inputSchema,
      );
      step.typeCompatible = compat.compatible;
    }
  }
```

**Step 6: Wire observed schemas into trace storage**

In `src/exploration/trace-storage.ts`, enrich `taskResults` and `initialContext`:

```typescript
// In exploredPathToTraceInput(), update taskResults mapper:
  const taskResults: TraceTaskResult[] = explored.steps.map((step, i) => ({
    taskId: `explore_${i}`,
    tool: step.toolId,
    args: {} as Record<string, JsonValue>,
    result: sanitizeForStorage(step.output),
    success: !step.error,
    durationMs: step.durationMs,
    mocked: !step.real,
    // Schema observation data (A + C)
    observed_output_schema: step.observedOutputSchema ?? undefined,
    server_namespace: step.serverNamespace ?? undefined,
    type_compatible: step.typeCompatible,
  }));

// In initialContext, add type compatibility summary:
  initialContext: {
    trigger: request.trigger,
    gruScore: explored.gruScore,
    mockRatio: totalSteps > 0 ? explored.mockedCount / totalSteps : 0,
    confidence: explored.confidence,
    typeCompatibleCount: explored.typeCompatibleCount ?? 0,
    totalTransitions: explored.totalTransitions ?? 0,
  } as Record<string, JsonValue>,
```

**Step 7: Update module barrel**

Add to `src/exploration/mod.ts`:
```typescript
export {
  inferOutputSchema,
  validateTypeCompatibility,
  resolveServerNamespace,
  type TypeCompatibilityResult,
} from "./schema-observer.ts";
```

**Step 8: Commit**

```
git add src/exploration/schema-observer.ts tests/exploration/schema-observer_test.ts src/exploration/explorer.ts src/exploration/trace-storage.ts src/exploration/mod.ts
git commit -m "feat(exploration): schema observation + type-compatible validation on dry-run"
```

---

## Summary

| Task | What | Files | Tests |
|------|------|-------|-------|
| 1 | Types & interfaces | `src/exploration/types.ts` | 3 |
| 2 | Tool safety classifier | `src/exploration/tool-safety.ts` | 6 |
| 3 | Mock engine | `src/exploration/mock-engine.ts` | 4 |
| 4 | Explorer core (path execution) | `src/exploration/explorer.ts` | 3 |
| 5 | Module barrel | `src/exploration/mod.ts` | -- |
| 6 | GRU integration (`exploreIntent`) | `src/exploration/explore-intent.ts` | 3 |
| 7 | Integration test + exports | `tests/exploration/integration_test.ts` | 1 |
| 8 | MCP handler | `src/mcp/handlers/explore-handler.ts` | 2 |
| 9 | Wire into facade | `execute-handler-facade.ts` mod | existing |
| 10 | **Trace storage (training data)** | migration 054, `trace-storage.ts`, type mods | 3 |
| 11 | **Schema observation + type validation** | `schema-observer.ts`, explorer + trace mods | 6 |

**Total: 11 tasks, ~31 tests, 8 new files + 5 modifications**

**Data stored per exploration trace:**

| Field | Source | Purpose |
|-------|--------|---------|
| `exploratory: true` | New DB column (migration 054) | Filter in training pipeline |
| `task_results[].mocked` | `!DryRunStepResult.real` | Weight in training (low mock = high trust) |
| `task_results[].tool` | `DryRunStepResult.toolId` | Tool sequence for GRU |
| `task_results[].result` | `DryRunStepResult.output` (sanitized) | Output data for learning |
| `task_results[].observed_output_schema` | `inferOutputSchema(output)` | Empirical schema vs declared |
| `task_results[].server_namespace` | `resolveServerNamespace(toolId)` | Multi-config MCP tracking |
| `task_results[].type_compatible` | `validateTypeCompatibility()` | Provides-edge validation |
| `intent_embedding` | From GRU beam search input | Direct training input |
| `executed_path` | `ExploredPath.path` | Tool sequence (text[]) |
| `initial_context.trigger` | `"unknown_intent"` or `"pre_validation"` | Distinguish exploration types |
| `initial_context.gruScore` | GRU beam score | Confidence metadata |
| `initial_context.mockRatio` | `mockedCount / totalSteps` | Training weight signal |
| `initial_context.typeCompatibleCount` | Count of compatible transitions | Schema quality signal |
| `success` | `ExploredPath.viable` | Positive/negative learning signal |
| `capability_id` | `null` | No cap for `unknown_intent` |

**Not in scope (future):**
- Training pipeline changes to weight exploratory traces differently (Story 12.9 data-prep)
- Backfill `tool_schema.output_schema` from observed schemas (requires confidence threshold)
- Mock registry with auto-curation (Story 12.9)
- LLM selection UI for exploration results (Story 12.10)
- Pre-execution validation trigger wired into `ExecuteSuggestionUseCase`
- Wire `argument-resolver.ts` between steps (currently `context[step_N]` -- sufficient for MVP)
